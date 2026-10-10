# Ukashula Vision Board — prototype

A Babylon.js "Vision Board" for Grow-Your-Own-Home (GYWH). A grower spends
gamified points (1 point = 1 kg of hemp bio-composite) to place structures on a
3D plot.

**This is a prototype. It is not wired to anything.** The ledger is a React
state object, not the append-only Merkle ledger in
`UKC-GROW-YOUR-OWN-HOME/domain/`. There is no physics engine, no stress
analysis, no signed ledger, no consensus, no double-entry and no persistence.
Nothing here touches The Heart or Fabric.

It is published in this state deliberately: the original had six defects, two
of which made it structurally dishonest rather than merely broken, and one of
which cannot be fixed in code at all because it is a product decision. Those
are written down below rather than quietly patched.

## Provenance

The source was pasted into a Claude Code session by the repository owner on
2026-10-09 as a 217-line component. It was not taken from a file in this repo
and has no prior commit here. The rewrite is 974 lines, of which roughly half
is the commentary explaining the defects.

The 217-line original is **not** preserved in this repository. If the exact
original matters for comparison, it is in that session transcript.

## Defect register

### Defect 1 — the success path is unreachable, and the cause is a product decision

The shipped seed balance was **1,200 kg**. The cheapest structure the original
could place cost **24,288 kg**. Every transaction failed. The "Transaction
Confirmed" branch could never execute, so the demo could only ever show its
own failure message.

This is not a code bug. The mass model, the structure dimensions and the seed
balance are all defensible individually; they are simply inconsistent with each
other. Fixing it means choosing which one is wrong, and that is a Founder/Board
call. **This file does not pick a winner.** It exposes the choice as
`VISION_BOARD_CONFIG.MASS_MODEL` and defaults to `bounding_box`, which
preserves the original behaviour exactly. See *The mass model* below for the
arithmetic behind each option.

### Defect 2 — the balance could go negative (TOCTOU)

The original read `ledger.gamifiedPoints` from the render closure (stale) and
debited with a functional updater (fresh), with a 1.5 s `setTimeout` between
them. Two clicks inside that window both saw the pre-debit balance, both
passed the affordability check, and both debited.

Now the check and the debit happen in **one** functional updater — the only
place that can see the authoritative `prev`. The updater is pure: it mutates no
mesh, calls no other `setState` and writes no ref, so React 18 StrictMode's
double invocation is harmless. A `txnId` guard makes a replayed updater a
no-op. Its verdict is appended as a `Settlement`, so the decision becomes part
of state rather than being lost in a callback, and a separate effect drains new
settlements to perform the visual side effects.

Grid occupancy is deliberately **not** handled this way: it is claimed
synchronously in a ref during the click, because two clicks in the same tick
must not be handed the same cell, and ref writes are immediate where state
writes are not.

### Defect 3 — `massRequired` only ever grew

The original incremented a running total *before* the affordability check, and
never decremented it. A rejected transaction still inflated "Project Mass
Required", so the number on screen described neither what was built nor what
was paid for. It is now derived from the actual placements.

### Defect 4 — leaked GPU resources

On rejection the original set the mesh red and returned, with no `dispose()`,
so rejected structures accumulated in the scene forever. Separately,
`mesh.dispose()` called with no arguments leaves the material and its textures
behind; disposal now passes the arguments that release them.

### Defect 5 — structures could be placed on top of each other

Placement had no occupancy check. Two structures could occupy the same
coordinates. There is now a deterministic grid over the 30 × 30 m plot, with
cells claimed synchronously (see defect 2).

### Defect 6 — the "Physics Engine Check" performed no physics

The original called its geometry test a physics check and reported
`"Structure verified at > 7.0 MPa"` on success. It compared a string against a
list. No stress calculation of any kind took place, and no value was ever
computed from the 7.0 MPa constant — so the number printed to the grower was
decorative.

It is now named `geometryGate` and described as what it is: a whitelist of
compression-only forms. It carries the label
`design check only, not certified`, matching the domain core's
`custodyReleaseStatus()` string exactly.

The original also contained a contradiction that is worth recording, because it
shows the two concepts were conflated. The constant was
`COMPRESSIVE_THRESHOLD_MPA = 7.0`, while the comment beside the check read
*"Flat roofs fail the 0.15 MPa tensile threshold"* — 0.15 being the value of
`SAFETY_MARGIN`, a dimensionless 15% mass buffer that is not a stress and has
no unit. Three different quantities (a compressive threshold, a tensile
threshold, and a dimensionless buffer) were being treated as interchangeable.

## The 7.0 MPa figure — corrected 2026-10-10

**Two statements in the first version of this document were wrong and are
withdrawn.** They are recorded here rather than deleted, because this file is
public and the wrong version has been readable since it was merged.

### Withdrawn: "probably wrong by roughly an order of magnitude"

The first version compared `7.0` against a recalled 0.2–1.0 MPa figure for
hemp-lime and concluded the constant was off by an order of magnitude. That
comparison was invalid: it measured the figure against a **different material
state** than the one the figure describes. Internal engineering documentation
(not published in this repository) specifies a lower baseline figure for the
uncompacted material and `> 7.0 MPa` as the target for the processed material.
The two are not the same quantity, so one does not falsify the other.

The order-of-magnitude claim, the 0.2–1.0 MPa comparison, and the instruction
"do not cite it" are all withdrawn. No replacement number is asserted here.

### Withdrawn: "the domain core already contradicts this figure"

It does not. P8 in `UKC-GROW-YOUR-OWN-HOME/domain/housing-accrual.ts` says:

> P8: the Canonical Data Sheet has no tested strength data for the composite,
> and the NHBRC / SANS 10400 route is unknown. Until lab data and an
> engineer's sign-off exist, every custody surface says so.

"No **tested** strength data" is a statement about what has been measured in a
laboratory. It is not a statement that the figure is unsourced, and it is not a
contradiction of a design target. The first version conflated *untested* with
*wrong*.

### What is still true — and is the actual defect

Defect 6 stands, unchanged, on its original and narrower ground:

- the prototype printed `"Structure verified at > 7.0 MPa"` as a **result**;
- it computed nothing from the constant — the geometry test was a whitelist of
  compression-only forms, and no stress calculation took place;
- **P8 still governs the custody surface.** Until lab data and an engineer's
  sign-off exist, no screen a grower sees may present any strength figure as
  verified, whatever its source.

So the figure stays where it now is: a labelled, displayed assumption behind
`design check only, not certified`, never a pass/fail criterion. The correction
is to the *reasoning about the number*, not to how the code treats it.
`[NOT VERIFIED]` remains correct in the code, in its proper sense — no
laboratory result has been opened for it in this repository.

## The mass model

    M_req = ceil(V × rho × (1 + safetyMargin))

    rho           = 330 kg/m^3    [NOT VERIFIED — carried from the original,
                                   not checked against the Canonical Data Sheet]
    safetyMargin  = 0.15          dimensionless; a 15% mass buffer, NOT a stress
                                  [CORRECTED 2026-10-10 — a source does exist;
                                   see "The 0.15 buffer" below. The two forms
                                   differ by 2.30% and are not reconciled.]

### `MASS_MODEL = 'bounding_box'` (default — unchanged behaviour)

`V` is the axis-aligned bounding box: the solid cube the mesh sits inside.

    vault   V = 4 × 4 × 4   = 64 m^3
            64 × 330        = 21,120
            21,120 × 1.15   = 24,288.00      ->  24,288 kg

    flat    V = 6 × 0.5 × 4 = 12 m^3
            12 × 330        = 3,960
            3,960 × 1.15    = 4,554.00       ->   4,554 kg

### `MASS_MODEL = 'shell'`

A vault is a shell, not a solid — only the wall is material. `V` is the
cylindrical annulus, `V = pi × (R² − (R − t)²) × L`, with `R = 2 m`
(diameter 4), `L = 4 m`, `t = wallThicknessM`.

    t = 0.30 m   R² − (R−t)² = 4.0 − 2.8900 = 1.1100
                 V = pi × 1.1100 × 4 = 13.9487 m^3
                 13.9487 × 330 × 1.15 = 5,293.5208   ->  5,294 kg

    t = 0.20 m   R² − (R−t)² = 4.0 − 3.2400 = 0.7600
                 V = pi × 0.7600 × 4 =  9.5504 m^3
                 9.5504 × 330 × 1.15  = 3,624.3926   ->  3,625 kg

    t = 0.10 m   R² − (R−t)² = 4.0 − 3.6100 = 0.3900
                 V = pi × 0.3900 × 4 =  4.9009 m^3
                 4.9009 × 330 × 1.15  = 1,859.8857   ->  1,860 kg

The flat span is **not** re-modelled under `shell`: a 0.5 m slab is already a
solid slab, so it stays 4,554 kg in both models. Only the vault changes.

### What seed balance each model implies

A flat span is rejected by the geometry gate *before* the ledger is touched, so
a flat never debits. Only vaults spend points.

| model | one vault | seed to confirm 1 | seed to confirm 2 |
|---|---|---|---|
| `bounding_box` | 24,288 kg | 24,288 kg | 48,576 kg |
| `shell`, t = 0.30 m | 5,294 kg | 5,294 kg | 10,588 kg |
| `shell`, t = 0.10 m | 1,860 kg | 1,860 kg | 3,720 kg |

To exercise both the confirm and the reject path in one session, seed a balance
between "confirm 1" and "confirm 2":

    bounding_box      ->  seedGamifiedPointsKg = 30,000
    shell, t = 0.30 m ->  seedGamifiedPointsKg =  8,000

### The finding the product owner needs

Switching to `shell` does **not** rescue the shipped seed balance of 1,200 kg.
It only shrinks the shortfall:

    bounding_box     24,288 / 1,200 = 20.24x short
    shell t = 0.30 m  5,294 / 1,200 =  4.41x short

At 330 kg/m³, 1,200 kg buys `1200 / 330 = 3.64 m^3` of composite — less
material than a 100 mm shell on a 4 m × 4 m vault needs (1,860 kg). So
**1,200 kg cannot build the demo vault under any wall thickness in the table.**

The seed balance has to move whichever mass model is chosen, or the demo vault
has to get smaller. That is a Founder/Board call in the same class as the open
accrual mechanism in `UKC-GROW-YOUR-OWN-HOME/SPEC.md` section 4.

## The 0.15 buffer — corrected 2026-10-10

The first version of this document annotated `safetyMargin = 0.15` as
`[NOT VERIFIED — no source for 15%]`. **That was wrong: a source exists.**
Internal engineering documentation (not published in this repository)
specifies a safety-margin **coefficient of 0.85**, and

    1 − 0.15 = 0.85

so the prototype's 0.15 is the complement of a sourced figure, not an invented
one. The "no source" annotation is withdrawn.

**But the two are not interchangeable, and this is a real open item.** They are
applied as different operations:

    the prototype adds a buffer:        M = V × rho × (1 + 0.15)
                                          = V × rho × 1.150000
    a 0.85 coefficient divides:         M = V × rho ÷ 0.85
                                          = V × rho × 1.176471

    discrepancy:  1.176471 ÷ 1.150000 = 1.023018
                  → the coefficient form is 2.30% more conservative

Both readings are defensible from the number alone. Nothing in this repository
establishes which operation was intended, so the 2.30% is unresolved. **This is
a reconciliation question for the engineer, not a sourcing question.**

## Open decisions (blocking, not code)

1. **`MASS_MODEL`** — `bounding_box` or `shell`, and if `shell`, what wall
   thickness. Changes the economics by ~4.6x.
2. **`seedGamifiedPointsKg`** — must change regardless; 1,200 kg is unusable.
   Or shrink the demo vault instead.
3. **The 7.0 MPa figure** — `[CORRECTED]` it is sourced in internal
   engineering documentation. Open item is narrower: obtain lab data and an
   engineer's sign-off before any custody surface presents it as verified (P8).
4. **`rho = 330 kg/m^3`** — confirm against the Canonical Data Sheet.
5. **`safetyMargin = 0.15`** — `[CORRECTED]` a 0.85 coefficient is sourced.
   Open item is the 2.30% operator discrepancy above: buffer or divisor.

## Validation performed

| Check | Result |
|---|---|
| `tsc 5.9.3`, `strict`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `exactOptionalPropertyTypes` | exit 0, no diagnostics |
| Mass arithmetic, every figure above | recomputed independently, all match |
| Rendered in a browser | **never — not once** |
| Babylon.js scene actually built | **no** |

The component has never been mounted. There is no `package.json` in this
directory, no bundler config and no test. It typechecks; that is all that is
known about it.

## Unverified Register

- **The component has never run.** Not rendered, not mounted, no Babylon scene
  ever constructed. Typecheck only.
- ~~`assumedCompressiveStrengthMPa = 7.0` — probably wrong by ~an order of
  magnitude, do not cite~~ — **WITHDRAWN 2026-10-10.** The comparison was
  against a different material state. The figure is sourced in internal
  engineering documentation not published here. It remains `[NOT VERIFIED]`
  only in the sense that **no laboratory result has been opened for it**, which
  is what P8 records. Lab data and an engineer's sign-off are still required
  before any custody surface may call it verified.
- ~~The 0.2–1.0 MPa hempcrete range quoted as a sanity check~~ — **WITHDRAWN**:
  recalled, never sourced, and compared against the wrong material state. It
  should not have been published.
- `hempCompositeDensityKgM3 = 330` — `[NOT VERIFIED]`, carried from the
  original, never checked against the Canonical Data Sheet.
- ~~`safetyMargin = 0.15` — no source for 15%~~ — **WITHDRAWN 2026-10-10.** A
  0.85 coefficient is sourced in internal engineering documentation and
  1 − 0.15 = 0.85. What is open is the **2.30% operator discrepancy** between
  the buffer form (×1.150000) and the divisor form (×1.176471) — `[TO BE
  CONFIRMED]` by the engineer, not a sourcing gap.
- **The internal engineering documentation behind both figures is not published
  in this repository**, so neither correction above is independently checkable
  from this repo alone. Both are `[NOT VERIFIED]` to a reader who has only this
  repository, and verified only against documents opened privately.
- Structure dimensions (vault 4 × 4 × 4 m, flat 6 × 0.5 × 4 m, plot 30 × 30 m)
  — `[NOT VERIFIED]`, carried from the original with no design source.
- Whether `mainUKC` is the correct base branch, and whether `prototypes/` is
  the right location, is `[TO BE CONFIRMED]`.
- ~~The `custodyReleaseStatus()` label claim~~ — **VERIFIED** this session
  against `UKC-GROW-YOUR-OWN-HOME/domain/housing-accrual.ts:242`, which
  returns exactly `'design check only, not certified'`, and its assertion in
  `test/housing-accrual.test.ts:286`. The prototype's string matches.
- ~~The SPEC.md section 4 reference~~ — **VERIFIED**: SPEC.md:84 is
  *"## 4. Open decision — the accrual mechanism"*, and SPEC.md:145 marks it
  `[TO BE CONFIRMED]` for Founder/Board.
