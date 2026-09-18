# GYWH — Grow Your Own Home

Module J of The Heart. This directory holds the domain core and its
tests; the rest of the module lives in The Heart.

Every rule below is cited to a source in the Ukashula corpus. Where a
decision is open, it is recorded as open — not guessed.

## 1. Purpose

Each household allocates a portion of their seasonal hempcrete biomass
value toward a housing threshold. When the threshold is reached,
Ukashula builds the home. Households may accumulate beyond it across
seasons for a larger home; there is no ceiling.

Source: GYWH Business Brief v3 §4.2; Platform App Spec §4.J.

## 2. Physical basis

- Home size: 50–60 m², minimal by design
- Dry stem per home: 3–5 tonnes
- Stem available per hectare: ~3–4.5 t, after medical, CBD, seed
  allocation and the retention covenant
- Typical accrual: 1–2 seasons for a household on 2 ha
- Soil covenant: roots stay in the ground; 30% retention

Source: GYWH Business Brief v3 §§2.1, 4.1, 4.2.

## 3. Binding rules

These are binding, not advisory. R12 and R13 are structural: they must
be impossible to violate through the data model, not merely
unimplemented.

### R12 — Land

No app function may remove, reallocate or restrict a household's land.
Not the King, the Council, Ukashula or the ICP, alone or together.

Source: IPILRA s2; Maledu; Baleni; VBP-001 2.7.

### R13 — Housing credits

Accrued credits belong to the grower. Recovery is by quantified set-off
only. They are never forfeited to a fund.

Source: Conventional Penalties Act s3; VBP-001 1.2.

### R5 — Delivery Advance

Never suspendable by any score, tier or penalty.

Source: GDM-001 4.1; LDG-001 Part 3.

### R10 — Automated decisions

The app may compute and display a score. Any adverse effect needs a
named human reviewer, recorded reasons, notice in the grower's
language, 10 business days for representations, and appeal to the ICP.

Source: POPIA s71; GDM-001 6.2; VBP-001 2.3.2.

### R14 — Ledger privacy

A grower sees their own full ledger plus hub and product aggregates.
No grower sees another grower's name, tonnage or payment.

Source: LDG-001 2.5, 2.6.

### R15 — Ledger technology

Signed, append-only ledger with a daily Merkle root. Keep the format
Fabric-compatible.

Source: LDG-001 4.1.

### P8 — Custody release

Any custody-release surface must read "design check only, not
certified" until lab test data and an engineer's sign-off exist.

Source: Rev 2 §2.2 P8; Canonical Data Sheet.

## 4. Open decision — the accrual mechanism

Four incompatible mechanisms exist in the corpus:

1. 10% automatic deduction (Track B) — Grower App, MJI-PAT-PROV-003
2. 2,400 kg biomass threshold — The Heart, built code
3. Voluntary 10–20% of payout — Grower App
4. Threshold = material cost of a 50–60 m² home — GYWH Brief §4.2

Rev 2 **G7** requires one mechanism and recommends an opt-in
percentage, default 10%, withdrawable on hardship — noting that an
automatic deduction needs contract consent and that credits are never
forfeitable (R13).

G7 recommends; it does not decide. This is a Founder/Board decision.

## 5. Upstream blockers

- The grower promise exists in six incompatible forms, so no accrual
  base can be computed (UKA-DOC-DEC-001, Decision 1)
- The entity appears under three names with one registration number,
  so nothing is contractable (UKA-DOC-DEC-001, Decision 2)
- The SAHPRA/Health position on the 0.2–2% THC gap blocks all grower
  contracting (Rev 2 §1; REG-LAW G1)
- Business constants were not changed in the Rev 2 review; the payout
  re-model needs Founder/Board instruction (Rev 2 H3)

## 6. Design consequence

Rev 2 §4 sets the target architecture: a versioned, signed parameter
set, frozen and ICP-verified each season. The app reads the rules; it
never hard-codes them.

Therefore the accrual engine is buildable before §4 and §5 resolve,
provided the threshold basis, percentage and payment period are
parameters in a signed rule set, never constants. The four mechanisms
in §4 then become configurations of one engine, and the Founder
decision later sets values rather than code.

This also addresses the root cause of Rev 2 H3, where a superseded
payout model is hard-coded in `lib/constants.ts`.

## 7. Separation

Ukashula and the maritime safety application remain fully separate
applications. Shared design lineage is permitted; shared application
artifacts, identifiers, signing material and backend projects are not.

GYWH is a module of a web platform. It has no mobile bundle
identifier, keystore or store listing of its own.

## 8. Unverified Register

- **[NOT VERIFIED]** No statute, case or treaty cited above was opened
  in the session that produced this file. Citations are carried from
  the Ukashula corpus, which attributes them; they have not been
  checked against primary texts. WebFetch was blocked for all external
  domains in that session.
- **[NOT VERIFIED]** Legal Pack Rev 5 sources (GDM-001, LDG-001,
  VBP-001, SEED-001) were not opened directly; their rules are quoted
  as recorded in Rev 2.
- **[TO BE CONFIRMED]** The §4 accrual mechanism — Founder/Board.
- **[TO BE CONFIRMED]** Whether GYWH extends The Heart's Module J in
  place, or is a separate module that syncs into it.
- **[TO BE CONFIRMED]** Location of the `/the-heart` codebase.
