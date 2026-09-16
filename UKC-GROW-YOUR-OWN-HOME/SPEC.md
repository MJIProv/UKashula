# UKC-GROW-YOUR-OWN-HOME — Specification

**Status:** SKELETON. Every `[TO BE CONFIRMED]` below is an open data gap.
No requirement in this document has been confirmed by an owner.

---

## 1. Identity

| Field | Value | Status |
|---|---|---|
| Module ID | `UKC-GROW-YOUR-OWN-HOME` | Assigned |
| Owning app | Ukashula | VERIFIED |
| Repository | `MJIProv/UKashula` | VERIFIED |
| Default branch | `mainUKC` | VERIFIED |
| Module owner | `[TO BE CONFIRMED]` | NOT VERIFIED |

## 2. Problem statement

`[TO BE CONFIRMED]` — What problem does this module solve, for whom?

State the problem before the solution. Do not derive scope from the module
name; the name is a label, not a requirement.

## 3. Scope

### In scope

- `[TO BE CONFIRMED]`

### Explicitly out of scope

- `[TO BE CONFIRMED]`

Anything not listed under "In scope" is out of scope by default.

## 4. Functional requirements

| ID | Requirement | Acceptance criterion | Status |
|---|---|---|---|
| FR-1 | `[TO BE CONFIRMED]` | `[TO BE CONFIRMED]` | NOT VERIFIED |

## 5. Data model

`[TO BE CONFIRMED]` — Entities, fields, types, ownership, retention.

Note any field that is personal data; it changes the storage and consent
requirements downstream.

## 6. Interfaces

- **Direction:** `[TO BE CONFIRMED]`
- **Counterparty:** `[TO BE CONFIRMED]`
- **Protocol:** `[TO BE CONFIRMED]`
- **Status:** NOT VERIFIED

## 7. Separation constraints — BINDING

Ukashula and Kilo must remain **fully separate applications**. Shared design
lineage from YENDRA is permitted; shared application artifacts are not.

### Permitted

- Reuse of architectural patterns, protocol designs, and specification text
  originating from YENDRA.
- Independent reimplementation of a YENDRA-derived mechanism.

### Prohibited

- Adding this module, or Ukashula, as a product flavor of the Kilo build.
  Kilo's Android build defines a `licensee` flavor dimension with
  `kilo` / `inmarsat` / `enterprise` variants (VERIFIED:
  `android/app/build.gradle.kts`, Kilo repo). A Ukashula flavor in that
  dimension would make Ukashula the same application as Kilo, not a
  separate one.
- Use of any identifier under `com.kilocomms.*` or `com.kilo.*`.
  (Kilo currently ships Android `com.kilocomms.app` and iOS `com.kilo.kilo`
  — VERIFIED.)
- Use of Kilo's signing keystore, Firebase project, Firestore rules, storage
  rules, or Cloud Functions deployment.
- Use of the `KILO_BRAND`, `KILO_LICENSEE_ID`, or `KILO_LICENSE_KEY` build
  constants.

### Identifiers to be assigned for Ukashula

| Boundary | Kilo (verified) | Ukashula | Status |
|---|---|---|---|
| Android applicationId | `com.kilocomms.app` | `[TO BE CONFIRMED]` | OPEN |
| iOS bundle identifier | `com.kilo.kilo` | `[TO BE CONFIRMED]` | OPEN |
| Signing keystore | Kilo release keystore | `[TO BE CONFIRMED]` | OPEN |
| Backend project | Kilo Firebase project | `[TO BE CONFIRMED]` | OPEN |
| Store listing | Kilo, v2.9.9+44 | `[TO BE CONFIRMED]` | OPEN |

These five are decided once, at scaffold time, and are expensive to reverse.

## 8. Open decisions

| # | Decision | Blocks | Status |
|---|---|---|---|
| D-1 | Module purpose and scope | All implementation | OPEN |
| D-2 | Implementation stack | Directory layout, tooling | OPEN |
| D-3 | Ukashula application identifiers (§7) | First build | OPEN |
| D-4 | Backend project for Ukashula | Data model, auth | OPEN |

## 9. Unverified Register

- **[NOT VERIFIED]** Purpose, scope, and functional requirements of this
  module. Nothing has been supplied; nothing has been inferred.
- **[NOT VERIFIED]** Implementation stack. A Ukashula design document dated
  2026-09-14 refers to a React Native scaffolding phase, but that decision
  has not been confirmed as current for this module.
- **[NOT VERIFIED]** Whether `UKC-GROW-YOUR-OWN-HOME` corresponds to an
  existing specification held outside this repository. Searches of Google
  Drive and the `kilo`, `UKashula`, and `github-actions-workflows`
  repositories returned zero matches for this identifier.
- **[NOT VERIFIED]** Module owner and approver.
- **[TO BE CONFIRMED]** All five identifier boundaries in §7.
