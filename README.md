# shaft-key-calc

Command-line check for a parallel (straight) shaft key. It computes shear stress and bearing (crush) pressure from the transmitted torque, then reports safety factors and PASS or FAIL.

There are no runtime dependencies. Node.js 22.18 or newer is required (`npm test` runs the TypeScript sources directly).

## Setup

```bash
npm install
npm run build
```

`npm run build` runs `tsc` and writes `dist/`. Run the compiled program with:

```bash
node dist/cli.js --help
```

After `npm link`, the command name is `shaft-key`.

## Usage

```text
shaft-key --torque <N·m> --diameter <mm> --width <mm> --height <mm> \
          --length <mm> --allow-shear <MPa> --allow-bearing <MPa> [--json]
```

| Option | Short | Meaning |
| --- | --- | --- |
| `--torque` | `-T` | Torque in N·m |
| `--diameter` | `-d` | Shaft diameter in mm |
| `--width` | `-b` | Key width in mm |
| `--height` | `-h` | Key height in mm (`-h` is height, not help) |
| `--length` | `-l` | Effective key length in mm |
| `--allow-shear` | | Allowable shear stress in MPa |
| `--allow-bearing` | | Allowable bearing (crush) stress in MPa |
| `--allow-crush` | | Alias of `--allow-bearing` |
| `--json` | | Print the check as JSON on stdout |
| `--help` | | Show help |

Values may be passed as `--torque 100` or `--torque=100`. Every numeric input must be a finite number greater than zero. A rejected input prints `error: ...` on stderr and exits with status 1. Nothing is written to stdout in that case.

A completed check exits with status 0 whether the result is PASS or FAIL.

## Formulas

Torque is converted from N·m to N·mm (`T_Nmm = 1000 × T`) so that, with lengths in mm, the stresses are in N/mm² (MPa).

The tangential force at the shaft surface is `F = 2T / d`.

- Shear on the width–length face of the key: `tau = 2T / (d · b · l)`
- Crush on half the key height (key seated half in the shaft and half in the hub): `p = 4T / (d · h · l)`

The safety factor is allowable stress divided by the calculated stress. Shear PASSes when `tau` does not exceed the allowable shear stress, and bearing PASSes when `p` does not exceed the allowable bearing stress. That is the same as a safety factor of at least 1. The overall result is PASS only when both pass.

The text report rounds `tau` and `p` to two decimal places and safety factors to three. `--json` prints the full calculated numbers.

## Example

`T = 100 N·m`, `d = 30 mm`, `b = 8 mm`, `h = 7 mm`, `l = 40 mm` gives `tau ≈ 20.83 MPa` and `p ≈ 47.62 MPa`.

```bash
node dist/cli.js -T 100 -d 30 -b 8 -h 7 -l 40 --allow-shear 40 --allow-bearing 100
```

```text
Parallel shaft key
  T                      100 N·m = 100000 N·mm
  d                      30 mm
  b                      8 mm
  h                      7 mm
  l                      40 mm
  allowable shear        40.00 MPa
  allowable bearing      100.00 MPa
  tau                    20.83 MPa
  p                      47.62 MPa
  shear safety factor    1.920
  bearing safety factor  2.100
  shear                  PASS
  bearing                PASS
  result                 PASS
```

The same check as JSON:

```bash
node dist/cli.js -T 100 -d 30 -b 8 -h 7 -l 40 --allow-shear 40 --allow-bearing 100 --json
```

```json
{
  "inputs": {
    "torqueNm": 100,
    "diameterMm": 30,
    "widthMm": 8,
    "heightMm": 7,
    "lengthMm": 40,
    "allowShearMpa": 40,
    "allowBearingMpa": 100
  },
  "torqueNmm": 100000,
  "tauMpa": 20.833333333333332,
  "pMpa": 47.61904761904762,
  "shearSafetyFactor": 1.92,
  "bearingSafetyFactor": 2.1,
  "shear": "PASS",
  "bearing": "PASS",
  "result": "PASS"
}
```

`shear` and `bearing` are the individual checks. `result` is PASS only when both are PASS.

## Development

```bash
npm test
npm run build
```

`npm test` typechecks with `tsc` and runs the tests with `node:test`. `npm run build` compiles `src/` to `dist/`.

## License

MIT. See [LICENSE](LICENSE).
