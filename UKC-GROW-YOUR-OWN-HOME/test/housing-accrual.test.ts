import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AccrualRuleSet,
  BusinessError,
  HousingAccrual,
  Rand,
  type HumanReview,
} from '../domain/index.ts';

const AT = '2026-09-18T10:00:00.000Z';

function account() {
  return new HousingAccrual({
    householdId: 'HH-1',
    authorityId: 'AUTH-1',
    growerId: 'GRW-1',
  });
}

function review(): HumanReview {
  return {
    reviewerId: 'OFFICER-1',
    reasons: 'Quantified set-off for advanced inputs, agreed in writing.',
    noticeLanguage: 'zu',
    representationsDueAt: '2026-10-02T10:00:00.000Z',
  };
}

const percentageRules = AccrualRuleSet.create({
  season: '2026/27',
  basis: 'payout_percentage',
  rate: 0.1,
  thresholdCents: 12_000_000,
  optInRequired: true,
  withdrawableOnHardship: true,
  verifiedBy: 'ICP-1',
});

// -- R13: credits belong to the grower -----------------------------------

test('R13: the aggregate exposes no way to forfeit credits', () => {
  const a = account();
  const names = [
    ...Object.getOwnPropertyNames(Object.getPrototypeOf(a)),
    ...Object.keys(a),
  ];
  const forbidden = names.filter((n) => /forfeit|confiscat|seiz|expire/i.test(n));
  assert.deepEqual(forbidden, [], `found forfeiture API: ${forbidden}`);
});

test('R13: balance has no setter', () => {
  const a = account();
  const desc = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(a),
    'balance',
  );
  assert.ok(desc?.get, 'balance should be a getter');
  assert.equal(desc?.set, undefined, 'balance must not have a setter');
});

test('R13: set-off must be quantified', () => {
  const a = account();
  a.optIn(AT);
  a.accrue({ payout: Rand.fromRand(1000), biomassKg: 0, at: AT }, percentageRules);
  assert.throws(
    () => a.setOff(Rand.zero(), review(), AT),
    (e: BusinessError) => e.code === 'Gywh:SetOffMustBeQuantified',
  );
});

test('R13: set-off cannot exceed the balance', () => {
  const a = account();
  a.optIn(AT);
  a.accrue({ payout: Rand.fromRand(1000), biomassKg: 0, at: AT }, percentageRules);
  assert.throws(
    () => a.setOff(Rand.fromRand(500), review(), AT),
    (e: BusinessError) => e.code === 'Gywh:InsufficientBalance',
  );
});

// -- R12 / R5: deliberate absences ---------------------------------------

test('R12: the aggregate exposes no land API', () => {
  const a = account();
  const names = [
    ...Object.getOwnPropertyNames(Object.getPrototypeOf(a)),
    ...Object.keys(a),
  ];
  const land = names.filter((n) =>
    /land|parcel|plot|allocateLand|reallocat|evict/i.test(n),
  );
  assert.deepEqual(land, [], `found land API: ${land}`);
});

test('R5: the aggregate cannot reach a Delivery Advance', () => {
  const a = account();
  const names = [
    ...Object.getOwnPropertyNames(Object.getPrototypeOf(a)),
    ...Object.keys(a),
  ];
  const advance = names.filter((n) => /advance|suspend|withhold/i.test(n));
  assert.deepEqual(advance, [], `found advance API: ${advance}`);
});

// -- R10: human review ----------------------------------------------------

test('R10: an adverse set-off without a named reviewer is refused', () => {
  const a = account();
  a.optIn(AT);
  a.accrue({ payout: Rand.fromRand(1000), biomassKg: 0, at: AT }, percentageRules);
  assert.throws(
    () => a.setOff(Rand.fromRand(10), undefined as never, AT),
    (e: BusinessError) => e.code === 'Gywh:HumanReviewRequired',
  );
  assert.throws(
    () => a.setOff(Rand.fromRand(10), { ...review(), reasons: '' }, AT),
    (e: BusinessError) => e.code === 'Gywh:ReasonsRequired',
  );
});

// -- G7: opt-in and hardship ---------------------------------------------

test('G7: no accrual without opt-in when the rule set requires consent', () => {
  const a = account();
  const credited = a.accrue(
    { payout: Rand.fromRand(1000), biomassKg: 0, at: AT },
    percentageRules,
  );
  assert.ok(credited.isZero());
  assert.ok(a.balance.isZero());
});

test('G7: opted-in accrual credits the configured share', () => {
  const a = account();
  a.optIn(AT);
  const credited = a.accrue(
    { payout: Rand.fromRand(1000), biomassKg: 0, at: AT },
    percentageRules,
  );
  assert.equal(credited.cents, 10_000); // 10% of R1000
  assert.equal(a.balance.cents, 10_000);
});

test('G7: hardship withdrawal honours the rule set', () => {
  const a = account();
  a.optIn(AT);
  a.accrue({ payout: Rand.fromRand(1000), biomassKg: 0, at: AT }, percentageRules);
  a.withdrawOnHardship(Rand.fromRand(50), percentageRules, AT);
  assert.equal(a.balance.cents, 5_000);

  const noHardship = AccrualRuleSet.create({
    ...{
      season: '2026/27',
      basis: 'payout_percentage' as const,
      rate: 0.1,
      optInRequired: true,
      verifiedBy: 'ICP-1',
    },
    withdrawableOnHardship: false,
  });
  assert.throws(
    () => a.withdrawOnHardship(Rand.fromRand(10), noHardship, AT),
    (e: BusinessError) => e.code === 'Gywh:HardshipWithdrawalNotPermitted',
  );
});

// -- one engine, four mechanisms -----------------------------------------

test('all four corpus mechanisms are configurations, not code paths', () => {
  const biomass = AccrualRuleSet.create({
    season: '2026/27',
    basis: 'biomass_threshold',
    thresholdKg: 2400, // The Heart, built code
    optInRequired: false,
    withdrawableOnHardship: true,
    verifiedBy: 'ICP-1',
  });
  const a = account();
  a.accrue({ payout: Rand.zero(), biomassKg: 2400, at: AT }, biomass);
  assert.equal(a.progress(biomass).thresholdReached, true);
  assert.equal(a.progress(biomass).fraction, 1);

  const materialCost = AccrualRuleSet.create({
    season: '2026/27',
    basis: 'material_cost',
    rate: 0.2,
    thresholdCents: 12_000_000, // cost of a 50-60 sqm hempcrete home
    optInRequired: false,
    withdrawableOnHardship: true,
    verifiedBy: 'ICP-1',
  });
  const b = account();
  b.accrue({ payout: Rand.fromRand(10_000), biomassKg: 0, at: AT }, materialCost);
  assert.equal(b.balance.cents, 200_000);
  assert.equal(b.progress(materialCost).thresholdReached, false);
});

// -- build allocation -----------------------------------------------------

test('an unverified rule set may project but must not bind a build', () => {
  const unverified = AccrualRuleSet.create({
    season: '2026/27',
    basis: 'biomass_threshold',
    thresholdKg: 100,
    optInRequired: false,
    withdrawableOnHardship: true,
    verifiedBy: null,
  });
  const a = account();
  a.accrue({ payout: Rand.zero(), biomassKg: 200, at: AT }, unverified);
  assert.equal(a.progress(unverified).thresholdReached, true);
  assert.throws(
    () => a.allocateBuild(unverified, AT),
    (e: BusinessError) => e.code === 'Gywh:RuleSetNotVerified',
  );
});

test('a build allocates once and only once', () => {
  const rules = AccrualRuleSet.create({
    season: '2026/27',
    basis: 'biomass_threshold',
    thresholdKg: 100,
    optInRequired: false,
    withdrawableOnHardship: true,
    verifiedBy: 'ICP-1',
  });
  const a = account();
  a.accrue({ payout: Rand.zero(), biomassKg: 150, at: AT }, rules);
  a.allocateBuild(rules, AT);
  assert.equal(a.buildAllocatedAt, AT);
  assert.throws(
    () => a.allocateBuild(rules, AT),
    (e: BusinessError) => e.code === 'Gywh:BuildAlreadyAllocated',
  );
});

// -- R14: privacy ---------------------------------------------------------

test('R14: no grower sees another grower ledger', () => {
  const a = account();
  a.optIn(AT);
  assert.ok(a.viewFor('GRW-1').events.length > 0);
  assert.throws(
    () => a.viewFor('GRW-2'),
    (e: BusinessError) => e.code === 'Gywh:CrossGrowerAccessDenied',
  );
});

// -- R15: ledger ----------------------------------------------------------

test('R15: the whole chain verifies in order', () => {
  const a = account();
  a.optIn(AT);
  a.accrue({ payout: Rand.fromRand(1000), biomassKg: 12, at: AT }, percentageRules);
  a.setOff(Rand.fromRand(10), review(), AT);
  assert.deepEqual(a.verifyLedger(), { valid: true, brokenAtSeq: null });
  assert.equal(a.events().length, 3);
});

test('R15: history cannot be mutated through the returned events', () => {
  const a = account();
  a.optIn(AT);
  const copy = a.events();
  assert.throws(() => {
    (copy[0] as { seq: number }).seq = 99;
  });
  assert.deepEqual(a.verifyLedger(), { valid: true, brokenAtSeq: null });
});

test('R15: a daily Merkle root is produced and is stable', () => {
  const a = account();
  a.optIn(AT);
  a.accrue({ payout: Rand.fromRand(1000), biomassKg: 0, at: AT }, percentageRules);
  const root = a.merkleRootFor('2026-09-18');
  assert.match(root ?? '', /^[0-9a-f]{64}$/);
  assert.equal(root, a.merkleRootFor('2026-09-18'));
  assert.equal(a.merkleRootFor('2026-09-19'), null);
});

// -- P8: custody ----------------------------------------------------------

test('P8: custody release is never reported as certified', () => {
  const s = account().custodyReleaseStatus();
  assert.equal(s.certified, false);
  assert.equal(s.label, 'design check only, not certified');
});

// -- money ----------------------------------------------------------------

test('Rand rejects floats and negatives', () => {
  assert.throws(
    () => Rand.fromCents(1.5),
    (e: BusinessError) => e.code === 'Gywh:AmountMustBeIntegerCents',
  );
  assert.throws(
    () => Rand.fromCents(-1),
    (e: BusinessError) => e.code === 'Gywh:AmountMustNotBeNegative',
  );
});
