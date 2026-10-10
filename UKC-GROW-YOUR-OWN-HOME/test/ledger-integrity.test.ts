import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync } from 'node:crypto';
import { EventChain, hashEvent } from '../domain/events.ts';
import { GywhLedger } from '../domain/ledger.ts';
import { SignedImporter, signEvent } from '../domain/signed-import.ts';
import { HousingAccrual } from '../domain/housing-accrual.ts';

const AT = '2026-10-10T10:00:00Z';

test('nested payloads stay unchanged after append, import and exposure', () => {
  const payload = { nested: { amounts: [100] } };
  const source = new EventChain('A');
  const event = source.append('AccrualAccrued', 'H', AT, payload);
  payload.nested.amounts[0] = 900;
  const offered = JSON.parse(JSON.stringify(event));
  const replica = new GywhLedger();
  replica.merge([offered]);
  offered.payload.nested.amounts[0] = 800;
  assert.throws(() => { (replica.toArray()[0].payload as typeof payload).nested.amounts[0] = 700; });
  assert.deepEqual(replica.toArray()[0].payload, { nested: { amounts: [100] } });
  assert.equal(replica.verify().valid, true);
  assert.equal(source.verify().valid, true);
});

test('invalid wire values do not throw or create authorities', () => {
  const l = new GywhLedger();
  const good = new EventChain('A').append('AccrualOpted', 'H', AT, {});
  const bad = { ...good, seq: -1 };
  const result = l.merge([null, {}, { ...bad, hash: hashEvent(bad) }]);
  assert.equal(result.rejected, 3);
  assert.deepEqual(l.authorities(), []);
});

test('pending limit reports retryable overflow and retained gaps heal without replay', () => {
  const c = new EventChain('A');
  const events = [0, 1, 2].map(() => c.append('AccrualOpted', 'H', AT, {}));
  const l = new GywhLedger(1);
  const tail = l.merge([events[1], events[2]]);
  assert.equal(tail.deferred, 1);
  assert.equal(tail.overflow, 1);
  assert.equal(l.merge([events[0]]).applied, 2);
  assert.deepEqual(l.pending(), []);
  assert.equal(l.merge([events[2]]).applied, 1);
});

test('both fork arrival orders block roots and repeated evidence is deduplicated', () => {
  const a = new EventChain('A').append('AccrualOpted', 'H', AT, { optedIn: true });
  const b = new EventChain('A').append('AccrualOpted', 'H', AT, { optedIn: false });
  for (const events of [[a, b], [b, a]]) {
    const l = new GywhLedger();
    l.merge(events);
    l.merge(events);
    assert.equal(l.equivocations().length, 1);
    assert.equal(l.verify().valid, false);
    assert.throws(() => l.merkleRootFor('2026-10-10'), /UnresolvedFork/);
  }
});

test('signed ingress rejects unsigned, unknown-authority and rehashed tampered events', () => {
  const keys = generateKeyPairSync('ed25519');
  const other = generateKeyPairSync('ed25519');
  const importer = new SignedImporter([{ authorityId: 'A', keyId: 'k1', publicKey: keys.publicKey }]);
  const source = new EventChain('A');
  const event = source.append('AccrualOpted', 'H', AT, { optedIn: true });
  const signed = signEvent(event, 'k1', keys.privateKey);
  const changed = { ...event, payload: { optedIn: false } };
  const stranger = new EventChain('B').append('AccrualOpted', 'H', AT, {});
  const l = new GywhLedger();
  const r = importer.merge(l, [event, signEvent(event, 'k1', other.privateKey),
    signEvent(stranger, 'k1', keys.privateKey), { ...signed, event: { ...changed, hash: hashEvent(changed) } }, signed]);
  assert.equal(r.authenticationRejected, 4);
  assert.equal(r.applied, 1);
  assert.deepEqual(r.verified, [signed]);
  assert.equal(importer.merge(l, [signed]).duplicate, 1);
});

test('shared authority chains do not disclose another household through grower views', () => {
  const chain = new EventChain('A');
  const first = new HousingAccrual({ authorityId: 'A', householdId: 'H1', growerId: 'G1', chain });
  const second = new HousingAccrual({ authorityId: 'A', householdId: 'H2', growerId: 'G2', chain });
  first.optIn(AT); second.optIn(AT);
  assert.deepEqual(first.viewFor('G1').events.map(e => e.householdId), ['H1']);
  assert.deepEqual(second.viewFor('G2').events.map(e => e.householdId), ['H2']);
  assert.equal(chain.length, 2);
  assert.throws(() => new HousingAccrual({ authorityId: 'B', householdId: 'H', growerId: 'G', chain }), /ChainAuthorityMismatch/);
});
