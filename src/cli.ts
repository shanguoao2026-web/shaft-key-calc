#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";
import { checkKey, InputError, type KeyInput, type KeyReport } from "./key.ts";

export interface ParsedArgs {
  help: boolean;
  json: boolean;
  input: KeyInput;
}

const NUMBER_FLAGS: Readonly<Record<string, keyof KeyInput>> = {
  "--torque": "torqueNm",
  "-T": "torqueNm",
  "--diameter": "diameterMm",
  "-d": "diameterMm",
  "--width": "widthMm",
  "-b": "widthMm",
  "--height": "heightMm",
  "-h": "heightMm",
  "--length": "lengthMm",
  "-l": "lengthMm",
  "--allow-shear": "allowShearMpa",
  "--allow-bearing": "allowBearingMpa",
  "--allow-crush": "allowBearingMpa",
};

const REQUIRED: ReadonlyArray<keyof KeyInput> = [
  "torqueNm",
  "diameterMm",
  "widthMm",
  "heightMm",
  "lengthMm",
  "allowShearMpa",
  "allowBearingMpa",
];

const FIELD_LABEL: Record<keyof KeyInput, string> = {
  torqueNm: "torque T (N·m)",
  diameterMm: "shaft diameter d (mm)",
  widthMm: "key width b (mm)",
  heightMm: "key height h (mm)",
  lengthMm: "effective length l (mm)",
  allowShearMpa: "allowable shear stress (MPa)",
  allowBearingMpa: "allowable bearing stress (MPa)",
};

/** Finite decimal, optionally in scientific notation. Sign is rejected here. */
const POSITIVE_NUMBER = /^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

export const HELP = `shaft-key — shear and crush check for a parallel shaft key

Usage:
  shaft-key --torque <N·m> --diameter <mm> --width <mm> --height <mm> \\
            --length <mm> --allow-shear <MPa> --allow-bearing <MPa> [--json]

Options:
  -T, --torque <N·m>         Applied torque
  -d, --diameter <mm>        Shaft diameter
  -b, --width <mm>           Key width
  -h, --height <mm>          Key height (-h is height, not help)
  -l, --length <mm>          Effective key length
      --allow-shear <MPa>    Allowable shear stress
      --allow-bearing <MPa>  Allowable bearing (crush) stress
      --allow-crush <MPa>    Alias of --allow-bearing
      --json                 Print the check as JSON
      --help                 Show this help

Formulas (T is converted from N·m to N·mm):
  shear stress    tau = 2T / (d * b * l)
  crush pressure  p   = 4T / (d * h * l)

Safety factor = allowable / actual. Each check PASSes when the safety factor
is at least 1. The result is PASS only when both shear and bearing pass.

Exit status:
  0  the check was computed (result may be PASS or FAIL)
  1  missing or invalid input
`;

function parsePositive(raw: string, label: string): number {
  const text = raw.trim();
  if (!POSITIVE_NUMBER.test(text)) {
    throw new InputError(`${label} must be a positive number, got ${JSON.stringify(raw)}`);
  }
  const value = Number(text);
  if (!Number.isFinite(value) || !(value > 0)) {
    throw new InputError(`${label} must be a positive number, got ${JSON.stringify(raw)}`);
  }
  return value;
}

function splitFlag(arg: string): { name: string; inline: string | undefined } {
  if (arg.startsWith("--")) {
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      return { name: arg.slice(0, eq), inline: arg.slice(eq + 1) };
    }
  }
  return { name: arg, inline: undefined };
}

/** A following token is a value, including a negative number that will be rejected later. */
function isValueToken(token: string | undefined): token is string {
  if (token === undefined) return false;
  if (!token.startsWith("-")) return true;
  return /^-(\d|\.)/.test(token);
}

/**
 * Parse CLI arguments.
 * Numeric values must be finite and greater than zero.
 * `--help` skips the required-input check.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const values: Partial<KeyInput> = {};
  const seen = new Set<keyof KeyInput>();
  let json = false;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;

    if (arg === "--") {
      const extra = argv[i + 1];
      if (extra !== undefined) {
        throw new InputError(`unexpected argument: ${extra}`);
      }
      break;
    }

    if (!arg.startsWith("-")) {
      throw new InputError(`unexpected argument: ${arg}`);
    }

    const { name, inline } = splitFlag(arg);

    if (name === "--help") {
      if (inline !== undefined) {
        throw new InputError("--help does not take a value");
      }
      help = true;
      continue;
    }

    if (name === "--json") {
      if (inline !== undefined) {
        throw new InputError("--json does not take a value");
      }
      json = true;
      continue;
    }

    const field = NUMBER_FLAGS[name];
    if (field === undefined) {
      throw new InputError(`unknown option: ${name}`);
    }
    if (seen.has(field)) {
      throw new InputError(`duplicate option for ${FIELD_LABEL[field]}`);
    }

    const raw = inline !== undefined ? inline : isValueToken(argv[i + 1]) ? argv[++i] : undefined;
    if (raw === undefined) {
      throw new InputError(`missing value for ${name}`);
    }
    values[field] = parsePositive(raw, FIELD_LABEL[field]);
    seen.add(field);
  }

  if (help) {
    return { help, json, input: emptyInput(values) };
  }

  const missing = REQUIRED.filter((field) => values[field] === undefined);
  if (missing.length > 0) {
    const list = missing.map((field) => FIELD_LABEL[field]).join(", ");
    throw new InputError(`missing required option: ${list}`);
  }

  return { help, json, input: values as KeyInput };
}

function emptyInput(values: Partial<KeyInput>): KeyInput {
  return {
    torqueNm: values.torqueNm ?? 0,
    diameterMm: values.diameterMm ?? 0,
    widthMm: values.widthMm ?? 0,
    heightMm: values.heightMm ?? 0,
    lengthMm: values.lengthMm ?? 0,
    allowShearMpa: values.allowShearMpa ?? 0,
    allowBearingMpa: values.allowBearingMpa ?? 0,
  };
}

function formatInput(value: number): string {
  if (Number.isInteger(value) && Math.abs(value) < 1e15) return value.toFixed(0);
  return String(value);
}

/** Two decimal places for ordinary stresses; scientific notation for extremes. */
export function formatMpa(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const abs = Math.abs(value);
  if (abs !== 0 && (abs < 0.01 || abs >= 10000)) return value.toExponential(3);
  return value.toFixed(2);
}

/** Three decimal places for ordinary safety factors. */
export function formatFactor(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const abs = Math.abs(value);
  if (abs !== 0 && (abs < 0.001 || abs >= 10000)) return value.toExponential(3);
  return value.toFixed(3);
}

export function formatText(report: KeyReport): string {
  const line = (label: string, value: string): string => `  ${label.padEnd(22)} ${value}`;
  const { inputs } = report;
  return [
    "Parallel shaft key",
    line("T", `${formatInput(inputs.torqueNm)} N·m = ${formatInput(report.torqueNmm)} N·mm`),
    line("d", `${formatInput(inputs.diameterMm)} mm`),
    line("b", `${formatInput(inputs.widthMm)} mm`),
    line("h", `${formatInput(inputs.heightMm)} mm`),
    line("l", `${formatInput(inputs.lengthMm)} mm`),
    line("allowable shear", `${formatMpa(inputs.allowShearMpa)} MPa`),
    line("allowable bearing", `${formatMpa(inputs.allowBearingMpa)} MPa`),
    line("tau", `${formatMpa(report.tauMpa)} MPa`),
    line("p", `${formatMpa(report.pMpa)} MPa`),
    line("shear safety factor", formatFactor(report.shearSafetyFactor)),
    line("bearing safety factor", formatFactor(report.bearingSafetyFactor)),
    line("shear", report.shear),
    line("bearing", report.bearing),
    line("result", report.result),
    "",
  ].join("\n");
}

export function formatJson(report: KeyReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export type Writer = (text: string) => void;

/** Run one invocation. Returns the process exit code. */
export function main(argv: readonly string[], stdout: Writer, stderr: Writer): number {
  try {
    const parsed = parseArgs(argv);
    if (parsed.help) {
      stdout(HELP);
      return 0;
    }
    const report = checkKey(parsed.input);
    stdout(parsed.json ? formatJson(report) : formatText(report));
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    stderr(`error: ${message}\n`);
    return 1;
  }
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

if (isDirectRun()) {
  process.exitCode = main(
    process.argv.slice(2),
    (text) => {
      process.stdout.write(text);
    },
    (text) => {
      process.stderr.write(text);
    },
  );
}
