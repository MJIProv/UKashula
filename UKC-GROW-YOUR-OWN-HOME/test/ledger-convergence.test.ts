import assert from 'node:assert/strict';
import test from 'node:test';
import { EventChain, type GywhEvent } from '../domain/events.ts';
import { GywhLedger } from '../domain/ledger.ts';

const DAY = '2026-09-18';
const at = (h: number) => `${DAY}T${String(h).padStart(2, '0')}:00:00Z`;

/** Events from one authority, as that authority would have written them. */
function emit(authorityId: string, n: number, offset = 0): readonly GywhEvent[] {
  const c = new EventChain(authorityId);
  for (let i = 0; i < n; i += 1) {
    c.append('AccrualAccrued', `HH-${authorityId}-${i}`, at(offset + i), { kg: 100 + i });
  }
  return c.toArray();
}

function shuffled<T>(xs: readonly T[], seed: number): T[] {
  // Deterministic shuffle so a failure is reproducible from the seed.
  const a = [...xs];
  let s = seed;
  for (let i = a.length - 1; i > 0; i -= 1) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// -- the real convergence requirement ------------------------------------
//
// NOTE on a wrong turn worth recording: an earlier version of this file
// appended the same FACTS to two chains in different orders and asserted the
// roots must match. They must not. An event's hash covers `seq` and
// `prevHash`, so the same fact written at a different position is a different
// event, and a different root is correct. One authority has one chain and one
// order, so that scenario cannot arise in the first place.
//
// What CAN differ between replicas is the order authorities are discovered
// in. That is what must not move the root.

test('the cross-authority root ignores the order authorities were discovered', () => {
  const fromA = emit('ICP-A', 3, 1);
  const fromB = emit('ICP-B', 2, 5);
  const fromC = emit('ICP-C', 2, 8);

  const north = new GywhLedger();
  north.merge(fromA);
  north.merge(fromB);
  north.merge(fromC);

  const south = new GywhLedger();
  south.merge(fromC); // met them in the opposite order
  south.merge(fromA);
  south.merge(fromB);

  assert.deepEqual(north.authorities(), south.authorities());
  assert.equal(
    north.merkleRootFor(DAY),
    south.merkleRootFor(DAY),
    'discovery order must not change the published root',
  );
});

test('a replica of one authority holds the identical sequence, so roots match', () => {
  const written = emit('ICP-A', 4, 1);

  const replica = new GywhLedger();
  // Delivered backwards; adopt() still places each event at its own seq.
  replica.merge([...written].reverse());
  for (let i = 0; i < written.length; i += 1) replica.merge(written);

  const origin = new GywhLedger();
  origin.merge(written);

  assert.equal(replica.length, 4);
  assert.equal(replica.merkleRootFor(DAY), origin.merkleRootFor(DAY));
  assert.deepEqual(
    replica.toArray().map((e) => e.hash),
    origin.toArray().map((e) => e.hash),
    'same events, same sequence, on both sides',
  );
});

// -- convergence ----------------------------------------------------------

test('two replicas converge after exchanging what each holds', () => {
  const north = new GywhLedger();
  const south = new GywhLedger();

  const fromA = emit('ICP-A', 4, 1);
  const fromB = emit('ICP-B', 3, 5);

  north.merge(fromA); // north met ICP-A
  south.merge(fromB); // south met ICP-B
  assert.notEqual(north.merkleRootFor(DAY), south.merkleRootFor(DAY));

  // They meet. Each hands over everything it has.
  south.merge(north.toArray());
  north.merge(south.toArray());

  assert.equal(north.length, 7);
  assert.equal(south.length, 7);
  assert.equal(north.merkleRootFor(DAY), south.merkleRootFor(DAY));
  assert.deepEqual(north.authorities(), ['ICP-A', 'ICP-B']);
});

test('merge is order-independent: 40 shuffles reach one root', () => {
  const events = [...emit('ICP-A', 5, 1), ...emit('ICP-B', 4, 6), ...emit('ICP-C', 3, 10)];

  const reference = new GywhLedger();
  reference.merge(events);
  const expected = reference.merkleRootFor(DAY);
  assert.match(expected ?? '', /^[0-9a-f]{64}$/);

  for (let seed = 1; seed <= 40; seed += 1) {
    const l = new GywhLedger();
    l.merge(shuffled(events, seed));
    assert.equal(l.length, 12, `seed ${seed}: lost events`);
    assert.equal(l.merkleRootFor(DAY), expected, `seed ${seed}: diverged`);
    assert.equal(l.verify().valid, true, `seed ${seed}: chain broke`);
  }
});

test('merge is order-independent even when delivered one event at a time', () => {
  const events = [...emit('ICP-A', 4, 1), ...emit('ICP-B', 4, 6)];
  const reference = new GywhLedger();
  reference.merge(events);

  for (let seed = 1; seed <= 15; seed += 1) {
    const l = new GywhLedger();
    // Worst case: each event arrives alone, out of order. Gaps must heal
    // across separate merge calls, not just within one batch.
    for (const e of shuffled(events, seed)) l.merge([e]);
    assert.equal(l.length, 8, `seed ${seed}`);
    assert.equal(l.merkleRootFor(DAY), reference.merkleRootFor(DAY), `seed ${seed}`);
  }
});

test('merge is idempotent: re-merging changes nothing', () => {
  const events = emit('ICP-A', 5, 1);
  const l = new GywhLedger();

  const first = l.merge(events);
  assert.equal(first.applied, 5);
  const root = l.merkleRootFor(DAY);

  for (let i = 0; i < 5; i += 1) {
    const again = l.merge(events);
    assert.equal(again.applied, 0, 'nothing should be applied twice');
    assert.equal(again.duplicate, 5);
  }
  assert.equal(l.length, 5);
  assert.equal(l.merkleRootFor(DAY), root);
});

test('a gap is deferred, not rejected, and heals on a later merge', () => {
  const events = emit('ICP-A', 4, 1);
  const l = new GywhLedger();

  // seq 2 and 3 arrive first; they cannot connect yet.
  const tail = l.merge([events[2], events[3]]);
  assert.equal(tail.applied, 0);
  assert.equal(tail.deferred, 2);
  assert.equal(tail.rejected, 0, 'a gap is not an error');
  assert.equal(l.length, 0);

  // The missing head turns up later.
  l.merge([events[0], events[1]]);
  assert.equal(l.length, 4);
  assert.equal(l.verify().valid, true);
});

// -- equivocation ---------------------------------------------------------

test('equivocation is detected, never merged away', () => {
  const honest = emit('ICP-A', 2, 1);

  // Same authority, same seq, different content: a hash-valid fork (authorship is not established here).
  const forked = new EventChain('ICP-A');
  forked.append('AccrualAccrued', honest[0].householdId, honest[0].at, honest[0].payload as Record<string, unknown>);
  const lie = forked.append('AccrualAccrued', 'HH-SOMEONE-ELSE', at(2), { kg: 999_999 });

  const l = new GywhLedger();
  l.merge(honest);
  const r = l.merge([lie]);

  assert.equal(r.applied, 0, 'the conflicting event must not be applied');
  assert.equal(r.equivocations.length, 1);

  const eq = r.equivocations[0];
  assert.equal(eq.authorityId, 'ICP-A');
  assert.equal(eq.seq, 1);
  assert.equal(eq.held.hash, honest[1].hash, 'what was already held is kept');
  assert.equal(eq.offered.hash, lie.hash, 'the proof pair is preserved');
  assert.notEqual(eq.held.hash, eq.offered.hash);

  // The ledger is intact but no longer reports itself clean.
  assert.equal(l.length, 2);
  assert.equal(l.verify().valid, false, 'equivocation must not read as valid');
  assert.equal(l.verify().brokenAuthority, null, 'no chain is structurally broken');
  assert.equal(l.equivocations().length, 1);
});

test('a forged event is rejected on its hash', () => {
  const events = emit('ICP-A', 2, 1);
  const tampered = { ...events[0], payload: Object.freeze({ kg: 1_000_000 }) } as GywhEvent;

  const l = new GywhLedger();
  const r = l.merge([tampered]);
  assert.equal(r.applied, 0);
  assert.equal(r.rejected, 1);
  assert.equal(l.length, 0);
});

// -- append-only still holds ----------------------------------------------

test('merging cannot rewrite or drop a held event', () => {
  const events = emit('ICP-A', 3, 1);
  const l = new GywhLedger();
  l.merge(events);
  const before = l.toArray().map((e) => e.hash);

  // Replay, reorder, re-offer tampered copies: history must not move.
  l.merge(shuffled(events, 7));
  l.merge([{ ...events[1], at: at(23) } as GywhEvent]);
  l.merge(events);

  assert.deepEqual(l.toArray().map((e) => e.hash), before);
  assert.equal(l.length, 3);
});

test('an empty day has no root, and an unseen authority adds nothing', () => {
  const l = new GywhLedger();
  l.merge(emit('ICP-A', 2, 1));
  const root = l.merkleRootFor(DAY);

  // Merely naming an authority must not change the root.
  l.chainFor('ICP-UNSEEN');
  assert.equal(l.merkleRootFor(DAY), root);
  assert.equal(l.merkleRootFor('2026-09-19'), null);
});
