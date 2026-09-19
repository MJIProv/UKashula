import { BusinessError, check } from './errors.ts';
import { Rand } from './money.ts';

/**
 * The four accrual mechanisms found in the corpus, as ONE engine.
 *
 *   payout_percentage  a share of each payout            (Personal App; Grower App)
 *   biomass_threshold  a kg-of-biomass threshold         (The Heart, built code)
 *   material_cost      threshold = cost to build a home  (GYWH Brief 4.2)
 *
 * Rev 2 G7 requires ONE mechanism and recommends an opt-in percentage,
 * default 10%, withdrawable on hardship. G7 recommends; it does not decide.
 * So the mechanism is a parameter, not a constant, and the Founder/Board
 * decision later sets a value rather than changing code.
 *
 * Rev 2 section 4: "a versioned, signed parameter set ... frozen and
 * ICP-verified [each season]. The app reads the rules; it never hard-codes
 * them."
 */
export type AccrualBasis =
  | 'payout_percentage'
  | 'biomass_threshold'
  | 'material_cost';

export interface AccrualRuleSetInput {
  /** Season this set governs. Frozen once the season opens. */
  season: string;
  basis: AccrualBasis;
  /** Share of each payout, 0..1. Required for payout_percentage. */
  rate?: number;
  /** Biomass threshold in kg. Required for biomass_threshold. */
  thresholdKg?: number;
  /** Build threshold in cents. Required for material_cost. */
  thresholdCents?: number;
  /** G7: an automatic deduction needs contract consent. */
  optInRequired: boolean;
  /** G7: withdrawable on hardship. */
  withdrawableOnHardship: boolean;
  /** Who verified this set. Rev 2: ICP-verified before the season. */
  verifiedBy: string | null;
}

export class AccrualRuleSet {
  readonly season: string;
  readonly basis: AccrualBasis;
  readonly rate: number | null;
  readonly thresholdKg: number | null;
  readonly threshold: Rand | null;
  readonly optInRequired: boolean;
  readonly withdrawableOnHardship: boolean;
  readonly verifiedBy: string | null;

  private constructor(input: AccrualRuleSetInput) {
    this.season = check(input.season, 'Gywh:SeasonRequired');
    this.basis = input.basis;
    this.rate = input.rate ?? null;
    this.thresholdKg = input.thresholdKg ?? null;
    this.threshold =
      input.thresholdCents === undefined
        ? null
        : Rand.fromCents(input.thresholdCents);
    this.optInRequired = input.optInRequired;
    this.withdrawableOnHardship = input.withdrawableOnHardship;
    this.verifiedBy = input.verifiedBy;
    Object.freeze(this);
  }

  static create(input: AccrualRuleSetInput): AccrualRuleSet {
    if (input.basis === 'payout_percentage') {
      const rate = input.rate;
      if (rate === undefined || !(rate > 0) || rate > 1) {
        throw new BusinessError('Gywh:RateOutOfRange', { rate });
      }
    }
    if (input.basis === 'biomass_threshold' && !(input.thresholdKg! > 0)) {
      throw new BusinessError('Gywh:ThresholdKgRequired', {
        thresholdKg: input.thresholdKg,
      });
    }
    if (input.basis === 'material_cost' && !(input.thresholdCents! > 0)) {
      throw new BusinessError('Gywh:ThresholdCentsRequired', {
        thresholdCents: input.thresholdCents,
      });
    }
    return new AccrualRuleSet(input);
  }

  /**
   * A set that has not been ICP-verified may be used to model and to show a
   * grower a projection, but must not drive a binding build trigger.
   */
  get isVerified(): boolean {
    return this.verifiedBy !== null && this.verifiedBy !== '';
  }
}

/**
 * R10 / POPIA s71. Any adverse effect on a grower needs a named human
 * reviewer, recorded reasons, notice in the grower's language, and time to
 * make representations. This is the evidence that the review happened.
 */
export interface HumanReview {
  reviewerId: string;
  reasons: string;
  noticeLanguage: 'en' | 'zu' | 'xh' | 'nso' | 've';
  representationsDueAt: string;
}

export function requireReview(review: HumanReview | undefined): HumanReview {
  const r = check(review, 'Gywh:HumanReviewRequired');
  check(r.reviewerId, 'Gywh:ReviewerRequired');
  check(r.reasons, 'Gywh:ReasonsRequired');
  check(r.noticeLanguage, 'Gywh:NoticeLanguageRequired');
  check(r.representationsDueAt, 'Gywh:RepresentationsPeriodRequired');
  return r;
}
