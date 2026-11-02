import assert from "node:assert/strict";
import { test } from "node:test";
import { checkKey, InputError, type KeyInput } from "../src/key.ts";

/** Worked example: T=100 N·m, d=30, b=8, h=7, l=40. */
const EXAMPLE: KeyInput = {
  torqueNm: 100,
  diameterMm: 30,
  widthMm: 8,
  heightMm: 7,
  lengthMm: 40,
  allowShearMpa: 40,
  allowBearingMpa: 100,
};

const TAU = (2 * 100 * 1000) / (30 * 8 * 40);
const P = (4 * 100 * 1000) / (30 * 7 * 40);

test("example stresses are tau ≈ 20.83 MPa and p ≈ 47.62 MPa", () => {
  const report = checkKey(EXAMPLE);
  assert.equal(report.torqueNmm, 100_000);
  assert.equal(report.tauMpa, TAU);
  assert.equal(report.pMpa, P);
  assert.equal(report.tauMpa.toFixed(2), "20.83");
  assert.equal(report.pMpa.toFixed(2), "47.62");
  assert.ok(Math.abs(report.tauMpa - 20.83) < 0.01);
  assert.ok(Math.abs(report.pMpa - 47.62) < 0.01);
});

test("safety factors are allowable divided by the actual stress", () => {
  const report = checkKey(EXAMPLE);
  assert.equal(report.shearSafetyFactor, 1.92);
  assert.equal(report.bearingSafetyFactor, 2.1);
  assert.ok(Math.abs(report.shearSafetyFactor - 40 / TAU) < 1e-12);
  assert.ok(Math.abs(report.bearingSafetyFactor - 100 / P) < 1e-12);
  assert.equal(report.shear, "PASS");
  assert.equal(report.bearing, "PASS");
  assert.equal(report.result, "PASS");
});

test("PASS when a stress is exactly the allowable value", () => {
  const atShear = checkKey({ ...EXAMPLE, allowShearMpa: TAU, allowBearingMpa: P });
  assert.equal(atShear.shear, "PASS");
  assert.equal(atShear.bearing, "PASS");
  assert.equal(atShear.result, "PASS");
  assert.ok(Math.abs(atShear.shearSafetyFactor - 1) < 1e-12);
  assert.ok(Math.abs(atShear.bearingSafetyFactor - 1) < 1e-12);
});

test("FAIL when shear exceeds the allowable and bearing does not", () => {
  const report = checkKey({ ...EXAMPLE, allowShearMpa: 20, allowBearingMpa: 100 });
  assert.equal(report.shear, "FAIL");
  assert.equal(report.bearing, "PASS");
  assert.equal(report.result, "FAIL");
  assert.ok(report.shearSafetyFactor < 1);
  assert.ok(report.bearingSafetyFactor > 1);
});

test("FAIL when crush exceeds the allowable and shear does not", () => {
  const report = checkKey({ ...EXAMPLE, allowShearMpa: 40, allowBearingMpa: 40 });
  assert.equal(report.shear, "PASS");
  assert.equal(report.bearing, "FAIL");
  assert.equal(report.result, "FAIL");
});

test("FAIL when both stresses exceed the allowables", () => {
  const report = checkKey({ ...EXAMPLE, allowShearMpa: 1, allowBearingMpa: 1 });
  assert.equal(report.shear, "FAIL");
  assert.equal(report.bearing, "FAIL");
  assert.equal(report.result, "FAIL");
});

test("stress scales linearly with torque", () => {
  const doubled = checkKey({ ...EXAMPLE, torqueNm: 200 });
  assert.ok(Math.abs(doubled.tauMpa - 2 * TAU) < 1e-9);
  assert.ok(Math.abs(doubled.pMpa - 2 * P) < 1e-9);
});

test("checkKey rejects non-positive and non-finite numbers", () => {
  const cases: Array<Partial<KeyInput>> = [
    { torqueNm: 0 },
    { diameterMm: -30 },
    { widthMm: Number.NaN },
    { heightMm: Number.POSITIVE_INFINITY },
    { lengthMm: -1 },
    { allowShearMpa: 0 },
    { allowBearingMpa: -5 },
  ];
  for (const patch of cases) {
    assert.throws(() => checkKey({ ...EXAMPLE, ...patch }), InputError);
  }
});
