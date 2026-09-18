import { BusinessError, check } from './errors.ts';
import { Rand } from './money.ts';
import {
  AccrualRuleSet,
  requireReview,
  type HumanReview,
} from './rules.ts';
import { EventChain, type GywhEvent } from './events.ts';

export interface AccrualProgress {
  readonly basis: AccrualRuleSet['basis'];
  readonly creditedCents: number;
  readonly creditedKg: number;
  readonly thresholdReached: boolean;
  /** 0..1, or null where the rule set defines no threshold. */
  readonly fraction: number | null;
}

/**
 * GYWH housing accrual — aggregate root, one per household.
 *
 * Deliberately ABSENT from this class, and asserted absent by test:
 *
 *   - any land method. R12: no app function may remove, reallocate or
 *     restrict a household's land. Not the King, the Council, Ukashula or
 *     the ICP, alone or together. The root has no land to act on.
 *   - any forfeit method. R13: credits belong to the grower and are never
 *     forfeited to a fund. Recovery is by quantified set-off only.
 *   - any method touching a Delivery Advance. R5: the advance is never
 *     suspendable by any score, tier or penalty, so this aggregate cannot
 *     reach it.
 *
 * Balance has no setter. It moves only through accrue, setOff and
 * withdrawOnHardship, each of which appends to the chain.
 */
export class HousingAccrual {
  readonly householdId: string;
  readonly authorityId: string;
  readonly growerId: string;

  #optedIn = false;
  #creditedCents = 0;
  #creditedKg = 0;
  #buildAllocatedAt: string | null = null;
  #chain: EventChain;

  constructor(params: {
    householdId: string;
    authorityId: string;
    growerId: string;
    chain?: EventChain;
  }) {
    this.householdId = check(params.householdId, 'Gywh:HouseholdRequired');
    this.authorityId = check(params.authorityId, 'Gywh:AuthorityRequired');
    this.growerId = check(params.growerId, 'Gywh:GrowerRequired');
    this.#chain = params.chain ?? new EventChain(this.authorityId);
  }

  get optedIn(): boolean {
    return this.#optedIn;
  }

  get balance(): Rand {
    return Rand.fromCents(this.#creditedCents);
  }

  get creditedKg(): number {
    return this.#creditedKg;
  }

  get buildAllocatedAt(): string | null {
    return this.#buildAllocatedAt;
  }

  events(): readonly GywhEvent[] {
    return this.#chain.toArray();
  }

  verifyLedger(): { valid: boolean; brokenAtSeq: number | null } {
    return this.#chain.verify();
  }

  merkleRootFor(day: string): string | null {
    return this.#chain.merkleRootFor(day);
  }

  // -- opt in / out -------------------------------------------------------

  /** G7: an automatic deduction needs contract consent. */
  optIn(at: string): void {
    if (this.#optedIn) return;
    this.#optedIn = true;
    this.#chain.append('AccrualOpted', this.householdId, at, { optedIn: true });
  }

  optOut(at: string): void {
    if (!this.#optedIn) return;
    this.#optedIn = false;
    this.#chain.append('AccrualOpted', this.householdId, at, { optedIn: false });
  }

  // -- accrual ------------------------------------------------------------

  /**
   * Accrue from one settled payout. The rule set decides the basis; this
   * method hard-codes none of the four mechanisms in the corpus.
   */
  accrue(
    params: { payout: Rand; biomassKg: number; at: string },
    rules: AccrualRuleSet,
  ): Rand {
    if (rules.optInRequired && !this.#optedIn) {
      return Rand.zero();
    }
    if (params.biomassKg < 0) {
      throw new BusinessError('Gywh:BiomassMustNotBeNegative', {
        biomassKg: params.biomassKg,
      });
    }

    let credited = Rand.zero();
    if (rules.basis === 'payout_percentage') {
      credited = params.payout.times(rules.rate!);
    } else if (rules.basis === 'material_cost') {
      credited = params.payout.times(rules.rate ?? 1);
    }
    // biomass_threshold accrues in kg only; value follows at build time.

    this.#creditedCents += credited.cents;
    this.#creditedKg += params.biomassKg;

    this.#chain.append('AccrualAccrued', this.householdId, params.at, {
      season: rules.season,
      basis: rules.basis,
      creditedCents: credited.cents,
      biomassKg: params.biomassKg,
      balanceCents: this.#creditedCents,
    });
    return credited;
  }

  // -- reductions ---------------------------------------------------------

  /**
   * R13: recovery is by quantified set-off only, never forfeiture.
   * R10: an adverse effect needs a named reviewer and recorded reasons.
   */
  setOff(amount: Rand, review: HumanReview, at: string): void {
    const r = requireReview(review);
    if (amount.isZero()) {
      throw new BusinessError('Gywh:SetOffMustBeQuantified');
    }
    const next = this.balance.minus(amount); // throws if insufficient
    this.#creditedCents = next.cents;
    this.#chain.append('AccrualSetOff', this.householdId, at, {
      amountCents: amount.cents,
      reviewerId: r.reviewerId,
      reasons: r.reasons,
      noticeLanguage: r.noticeLanguage,
      representationsDueAt: r.representationsDueAt,
      balanceCents: this.#creditedCents,
    });
  }

  /** G7: withdrawable on hardship. The credits are the grower's. */
  withdrawOnHardship(amount: Rand, rules: AccrualRuleSet, at: string): void {
    if (!rules.withdrawableOnHardship) {
      throw new BusinessError('Gywh:HardshipWithdrawalNotPermitted', {
        season: rules.season,
      });
    }
    const next = this.balance.minus(amount);
    this.#creditedCents = next.cents;
    this.#chain.append('AccrualWithdrawn', this.householdId, at, {
      amountCents: amount.cents,
      reason: 'hardship',
      balanceCents: this.#creditedCents,
    });
  }

  // -- threshold and build -------------------------------------------------

  progress(rules: AccrualRuleSet): AccrualProgress {
    let fraction: number | null = null;
    let reached = false;

    if (rules.basis === 'biomass_threshold' && rules.thresholdKg) {
      fraction = Math.min(1, this.#creditedKg / rules.thresholdKg);
      reached = this.#creditedKg >= rules.thresholdKg;
    } else if (rules.threshold) {
      fraction = Math.min(1, this.#creditedCents / rules.threshold.cents);
      reached = this.balance.gte(rules.threshold);
    }

    return Object.freeze({
      basis: rules.basis,
      creditedCents: this.#creditedCents,
      creditedKg: this.#creditedKg,
      thresholdReached: reached,
      fraction,
    });
  }

  /**
   * Triggers the build allocation. Requires an ICP-verified rule set: an
   * unverified set may model and project, but must not bind.
   */
  allocateBuild(rules: AccrualRuleSet, at: string): void {
    if (!rules.isVerified) {
      throw new BusinessError('Gywh:RuleSetNotVerified', {
        season: rules.season,
      });
    }
    if (this.#buildAllocatedAt !== null) {
      throw new BusinessError('Gywh:BuildAlreadyAllocated');
    }
    if (!this.progress(rules).thresholdReached) {
      throw new BusinessError('Gywh:ThresholdNotReached');
    }
    this.#buildAllocatedAt = at;
    this.#chain.append('ThresholdReached', this.householdId, at, {
      season: rules.season,
    });
    this.#chain.append('BuildAllocated', this.householdId, at, {
      season: rules.season,
      balanceCents: this.#creditedCents,
      creditedKg: this.#creditedKg,
    });
  }

  /**
   * P8: the Canonical Data Sheet has no tested strength data for the
   * composite, and the NHBRC / SANS 10400 route is unknown. Until lab data
   * and an engineer's sign-off exist, every custody surface says so.
   */
  custodyReleaseStatus(): {
    certified: false;
    label: string;
  } {
    return Object.freeze({
      certified: false as const,
      label: 'design check only, not certified',
    });
  }

  // -- privacy ------------------------------------------------------------

  /**
   * R14: a grower sees their own full ledger. No grower sees another
   * grower's name, tonnage or payment.
   */
  viewFor(requestingGrowerId: string): {
    balance: Rand;
    creditedKg: number;
    events: readonly GywhEvent[];
  } {
    if (requestingGrowerId !== this.growerId) {
      throw new BusinessError('Gywh:CrossGrowerAccessDenied');
    }
    return {
      balance: this.balance,
      creditedKg: this.#creditedKg,
      events: this.events(),
    };
  }
}
