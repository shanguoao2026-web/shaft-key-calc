/** Verdict for one stress check or for the key as a whole. */
export type Verdict = "PASS" | "FAIL";

/** Geometry, torque, and allowable stresses for one parallel key. */
export interface KeyInput {
  /** Applied torque in newton-metres. */
  torqueNm: number;
  /** Shaft diameter in millimeters. */
  diameterMm: number;
  /** Key width in millimeters. */
  widthMm: number;
  /** Key height in millimeters. */
  heightMm: number;
  /** Effective key length in millimeters. */
  lengthMm: number;
  /** Allowable shear stress in MPa (N/mm²). */
  allowShearMpa: number;
  /** Allowable bearing (crush) stress in MPa (N/mm²). */
  allowBearingMpa: number;
}

/** Stresses and safety factors for a parallel key. */
export interface KeyReport {
  inputs: KeyInput;
  /** Torque converted to N·mm. 1 N·m = 1000 N·mm. */
  torqueNmm: number;
  /** Shear stress tau = 2T / (d b l), in MPa. */
  tauMpa: number;
  /** Crush pressure p = 4T / (d h l), in MPa. */
  pMpa: number;
  /** Allowable shear divided by tau. */
  shearSafetyFactor: number;
  /** Allowable bearing stress divided by p. */
  bearingSafetyFactor: number;
  shear: Verdict;
  bearing: Verdict;
  result: Verdict;
}

export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}

const FIELD_LABELS: ReadonlyArray<readonly [keyof KeyInput, string]> = [
  ["torqueNm", "torque T (N·m)"],
  ["diameterMm", "shaft diameter d (mm)"],
  ["widthMm", "key width b (mm)"],
  ["heightMm", "key height h (mm)"],
  ["lengthMm", "effective length l (mm)"],
  ["allowShearMpa", "allowable shear stress (MPa)"],
  ["allowBearingMpa", "allowable bearing stress (MPa)"],
];

/** 1 N·m = 1000 N·mm. Lengths are in mm, so stresses come out in N/mm² (MPa). */
const NM_TO_NMM = 1000;

/**
 * True when `actual` does not exceed `allowable`.
 * A tiny relative tolerance keeps an exact boundary from failing on float dust.
 */
function withinAllowable(actual: number, allowable: number): boolean {
  const scale = Math.max(Math.abs(allowable), Math.abs(actual), 1);
  return actual <= allowable + 1e-9 * scale;
}

function requirePositive(value: number, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || !(value > 0)) {
    throw new InputError(`${label} must be a positive number`);
  }
}

/**
 * Shear and crush check for a parallel key seated half in the shaft.
 *
 * Tangential force at the shaft surface is F = 2T / d.
 * Shear acts on area b·l, so tau = F / (b l) = 2T / (d b l).
 * Crushing is taken on half the key height, so
 * p = F / (l · h/2) = 4T / (d h l).
 * T is in N·mm and lengths are in mm.
 */
export function checkKey(input: KeyInput): KeyReport {
  for (const [field, label] of FIELD_LABELS) {
    requirePositive(input[field], label);
  }

  const torqueNmm = input.torqueNm * NM_TO_NMM;
  const d = input.diameterMm;
  const b = input.widthMm;
  const h = input.heightMm;
  const l = input.lengthMm;
  const shearDenom = d * b * l;
  const bearingDenom = d * h * l;

  const tauMpa = (2 * torqueNmm) / shearDenom;
  const pMpa = (4 * torqueNmm) / bearingDenom;
  // One division, equivalent to allowable / stress, avoids a second rounding step.
  const shearSafetyFactor = (input.allowShearMpa * shearDenom) / (2 * torqueNmm);
  const bearingSafetyFactor = (input.allowBearingMpa * bearingDenom) / (4 * torqueNmm);
  const shear: Verdict = withinAllowable(tauMpa, input.allowShearMpa) ? "PASS" : "FAIL";
  const bearing: Verdict = withinAllowable(pMpa, input.allowBearingMpa) ? "PASS" : "FAIL";
  const result: Verdict = shear === "PASS" && bearing === "PASS" ? "PASS" : "FAIL";

  return {
    inputs: { ...input },
    torqueNmm,
    tauMpa,
    pMpa,
    shearSafetyFactor,
    bearingSafetyFactor,
    shear,
    bearing,
    result,
  };
}
