# UKC-GROW-YOUR-OWN-HOME (GYWH)

**Grow Your Own Home** — the housing-accrual module of the Ukashula
platform. Growers accrue value from their hempcrete biomass toward a
housing threshold; when it is reached, a build is triggered.

> "They did not receive a house. They grew one."

Source: `Ukashula_GYWH_Business_Brief_v3_corrected`

## Identity

- **Module:** GYWH, Module J of The Heart
- **Parent app:** The Heart — Community Cultivation Platform
- **Parent stack:** Next.js 14, Prisma/PostGIS, Fabric ledger
- **Data model:** `Household 1—1 GYWH-Accrual`
- **Build phase:** P4 Depth (12–18 months)
- **State:** specification only; no code in this repository

Sources: Platform App Spec §4.J, §7, §9; Functional Brief §1.

## Where the real work lives

This repository is **not** the Ukashula codebase. The built platform
(`/the-heart` — schema plus the payments, resolutions, growers, sync,
USSD and ledger routes) is not held here, nor in Google Drive, nor in
Dropbox. Until it is reachable, anything written here is a parallel
module rather than a change to the built app.

The authoritative corpus is in Google Drive under `Ukashula/`, folders
`00`–`09` and `99`. Dropbox mirrors it as `.docx` exports.

## Hierarchy of sources

Where documents conflict, the higher source wins:

1. Statute, per the Statutory & Regulatory Register
2. Verified Legal Pack Rev 5
3. Canonical Data Sheet, for every figure
4. Master System Architecture UKA-MSA-001 Rev C
5. Platform App Spec and the Mobile App Architecture
6. Personal App dossier, patents, design threads

No app screen, contract, patent claim or pitch deck may state a rule
that a higher source contradicts.

Source: Specialist Decision & Correction Register Rev 2 §0.

See [`SPEC.md`](./SPEC.md) for binding rules and open decisions.
