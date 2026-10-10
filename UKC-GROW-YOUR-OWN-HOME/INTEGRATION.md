# Ledger integration boundary

This domain module is not a deployed Heart MVP. It has no database, device
transport, HTTP server, grower registration, permits, geofenced plot workflow,
harvest intake or payment integration. No service subscription is added by this
change. Local tests use Node 24 and its built-in crypto/test APIs; there are no
new package dependencies. Zero production operating cost is not established.

## What is covered

- `domain/ledger.ts` adapts PR #7's single-writer authority chains. Non-forking
  events converge even when predecessors arrive in later batches. Gaps are
  retained in memory, up to the configured pending count. `overflow` means
  the sender must retry; it is never an acknowledgement of durable storage.
- `domain/events.ts` detaches and recursively freezes JSON payloads. Imported
  events receive shape and hash checks. Existing event hash formatting is
  unchanged; object-key insertion order remains part of the hash format.
- `domain/signed-import.ts` verifies Ed25519 signatures against an externally
  configured authority/key allowlist. Unsigned and unknown-key events are
  rejected by this boundary. Raw `merge`/`adopt` remain hash-only primitives.
- `HousingAccrual` can write to `ledger.chainFor(authorityId)` through its
  existing constructor option. Household views filter the shared chain.
  Importing events does **not** reconstruct its balances, consent or allocation
  state. Do not reopen an account on a populated chain as though replay exists.
- Fork evidence is retained once per pair; ledger-wide root calculation throws
  `Gywh:UnresolvedFork`. No winner is selected. Unsigned fork pairs establish
  conflicting content, not the identity of the writer.

## Remaining gates before a connected pilot

1. Implement and test durable, transactional event/envelope storage and account
   replay. Persist connected events, pending events, conflicts and verified
   signature envelopes together. Acknowledgement must follow durable commit.
   Exercise restart, duplicate delivery and interruption between writes.
2. Place `SignedImporter` at every external ingress. Provision authority keys
   independently of peer traffic; define custody, revocation, rotation and
   recovery. Retain the returned verified envelopes as audit evidence. Add
   request byte/batch limits; the pending count is not a total memory limit.
3. Implement the actual transport and authenticated user/authority access
   boundary. Test two real devices offline and after reconnecting, including
   overflow retries. This Node crypto implementation is not a tested mobile
   adapter. One authority chain still requires a single writer; multiple
   independent offline writers for that authority can fork.
4. Implement business authorization and council quorum signatures separately.
   One valid event signature does not establish multi-signature governance,
   an authorized business action or a valid accrual rule approval.
5. Deliver the authority/permit/grower/plot/intake/payment MVP before expanding
   the prototype. Preserve the specification's Fabric and ownership requirements
   as unresolved integration work; this module does not replace them.

## Smallest reviewable rollout

Review and test this domain change first. Reuse these primitives in the actual
application once its source and persistence boundary are available. Avoid adding
another cloud platform solely for this ledger. Start a bounded device pilot only
after the gates above pass; measure storage, sync traffic and support costs before
choosing production capacity. USSD, payments, devices and ongoing operations
have no verified zero-cost arrangement in this repository.

Run `node --test UKC-GROW-YOUR-OWN-HOME/test/*.test.ts` from the repository root.
Tests cover domain behavior, not deployment or device compatibility.
