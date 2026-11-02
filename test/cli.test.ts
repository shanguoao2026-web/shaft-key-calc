import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  formatText,
  HELP,
  main,
  parseArgs,
  type Writer,
} from "../src/cli.ts";
import { checkKey } from "../src/key.ts";

const EXAMPLE_ARGS = [
  "--torque",
  "100",
  "--diameter",
  "30",
  "--width",
  "8",
  "--height",
  "7",
  "--length",
  "40",
  "--allow-shear",
  "40",
  "--allow-bearing",
  "100",
];

function capture(argv: readonly string[]): { code: number; stdout: string; stderr: string } {
  let stdout = "";
  let stderr = "";
  const out: Writer = (text) => {
    stdout += text;
  };
  const err: Writer = (text) => {
    stderr += text;
  };
  const code = main(argv, out, err);
  return { code, stdout, stderr };
}

test("parseArgs accepts long options, short options, and = values", () => {
  const long = parseArgs(EXAMPLE_ARGS);
  const short = parseArgs(["-T", "100", "-d", "30", "-b", "8", "-h", "7", "-l", "40", "--allow-shear=40", "--allow-crush", "100"]);
  assert.equal(long.help, false);
  assert.equal(long.json, false);
  assert.deepEqual(long.input, short.input);
  assert.equal(long.input.torqueNm, 100);
  assert.equal(long.input.heightMm, 7);
  assert.equal(short.input.allowBearingMpa, 100);
});

test("parseArgs accepts scientific notation and a leading plus", () => {
  const parsed = parseArgs([
    "-T",
    "1e2",
    "-d",
    "+30",
    "-b",
    "8.0",
    "-h",
    ".7e1",
    "-l",
    "4e1",
    "--allow-shear",
    "40",
    "--allow-bearing",
    "100",
  ]);
  assert.equal(parsed.input.torqueNm, 100);
  assert.equal(parsed.input.diameterMm, 30);
  assert.equal(parsed.input.heightMm, 7);
  assert.equal(parsed.input.lengthMm, 40);
});

test("text report shows the worked example, safety factors, and PASS", () => {
  const report = checkKey(parseArgs(EXAMPLE_ARGS).input);
  const text = formatText(report);
  assert.match(text, /tau\s+20\.83 MPa/);
  assert.match(text, /p\s+47\.62 MPa/);
  assert.match(text, /100 N·m = 100000 N·mm/);
  assert.match(text, /shear safety factor\s+1\.920/);
  assert.match(text, /bearing safety factor\s+2\.100/);
  assert.match(text, /shear\s+PASS/);
  assert.match(text, /bearing\s+PASS/);
  assert.match(text, /result\s+PASS/);

  const run = capture(EXAMPLE_ARGS);
  assert.equal(run.code, 0);
  assert.equal(run.stderr, "");
  assert.equal(run.stdout, text);
});

test("--json prints a parseable report and still exits 0 on FAIL", () => {
  const pass = capture([...EXAMPLE_ARGS, "--json"]);
  assert.equal(pass.code, 0);
  const body = JSON.parse(pass.stdout) as {
    torqueNmm: number;
    tauMpa: number;
    pMpa: number;
    shearSafetyFactor: number;
    bearingSafetyFactor: number;
    result: string;
  };
  assert.equal(body.torqueNmm, 100000);
  assert.equal(body.tauMpa.toFixed(2), "20.83");
  assert.equal(body.pMpa.toFixed(2), "47.62");
  assert.equal(body.result, "PASS");

  const fail = capture(["-T", "100", "-d", "30", "-b", "8", "-h", "7", "-l", "40", "--allow-shear", "10", "--allow-bearing", "10", "--json"]);
  assert.equal(fail.code, 0);
  const failed = JSON.parse(fail.stdout) as { shear: string; bearing: string; result: string };
  assert.equal(failed.shear, "FAIL");
  assert.equal(failed.bearing, "FAIL");
  assert.equal(failed.result, "FAIL");
});

test("--help prints usage and exits 0", () => {
  const run = capture(["--help"]);
  assert.equal(run.code, 0);
  assert.equal(run.stdout, HELP);
  assert.match(run.stdout, /Usage:/);
  assert.match(run.stdout, /tau = 2T/);
  assert.match(run.stdout, /--json/);
});

test("invalid input exits 1 with a message", () => {
  const cases: Array<{ args: string[]; pattern: RegExp }> = [
    { args: [], pattern: /missing required option/ },
    { args: ["-T", "0", "-d", "30", "-b", "8", "-h", "7", "-l", "40", "--allow-shear", "40", "--allow-bearing", "100"], pattern: /positive number/ },
    { args: ["-T", "-5", "-d", "30", "-b", "8", "-h", "7", "-l", "40", "--allow-shear", "40", "--allow-bearing", "100"], pattern: /positive number/ },
    { args: ["-T", "abc", "-d", "30", "-b", "8", "-h", "7", "-l", "40", "--allow-shear", "40", "--allow-bearing", "100"], pattern: /positive number/ },
    { args: ["-T", "100", "-d", "30", "-b", "8", "-h", "7", "-l", "40", "--allow-shear", "Infinity", "--allow-bearing", "100"], pattern: /positive number/ },
    { args: ["-T", "100", "-d", "30", "-b", "8", "-h", "7", "-l", "40", "--allow-shear", "40"], pattern: /missing required option: allowable bearing/ },
    { args: ["--torque"], pattern: /missing value/ },
    { args: ["--nope", "1"], pattern: /unknown option/ },
    { args: ["100"], pattern: /unexpected argument/ },
    { args: ["-T", "100", "-T", "50", "-d", "30", "-b", "8", "-h", "7", "-l", "40", "--allow-shear", "40", "--allow-bearing", "100"], pattern: /duplicate option/ },
    { args: ["--allow-bearing", "10", "--allow-crush", "12", "-T", "1", "-d", "1", "-b", "1", "-h", "1", "-l", "1", "--allow-shear", "1"], pattern: /duplicate option/ },
  ];

  for (const { args, pattern } of cases) {
    const run = capture(args);
    assert.equal(run.code, 1, `expected exit 1 for ${args.join(" ")}`);
    assert.equal(run.stdout, "");
    assert.match(run.stderr, /^error: /);
    assert.match(run.stderr, pattern, run.stderr);
  }
});

test("the executable entry prints the example and rejects a bad value", () => {
  const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
  const ok = spawnSync(process.execPath, [cli, ...EXAMPLE_ARGS], { encoding: "utf8" });
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /tau\s+20\.83 MPa/);
  assert.match(ok.stdout, /p\s+47\.62 MPa/);
  assert.match(ok.stdout, /result\s+PASS/);
  assert.equal(ok.stderr, "");

  const bad = spawnSync(process.execPath, [cli, "-T", "0"], { encoding: "utf8" });
  assert.equal(bad.status, 1);
  assert.equal(bad.stdout, "");
  assert.match(bad.stderr, /error: .*positive number/);
});
