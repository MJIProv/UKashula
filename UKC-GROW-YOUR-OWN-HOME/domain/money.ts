import { BusinessError } from './errors.ts';

/**
 * Rand held as integer cents. Never a float: accrual balances are a
 * grower's property (R13) and must not drift.
 */
export class Rand {
  readonly cents: number;

  private constructor(cents: number) {
    this.cents = cents;
    Object.freeze(this);
  }

  static fromCents(cents: number): Rand {
    if (!Number.isInteger(cents)) {
      throw new BusinessError('Gywh:AmountMustBeIntegerCents', { cents });
    }
    if (cents < 0) {
      throw new BusinessError('Gywh:AmountMustNotBeNegative', { cents });
    }
    return new Rand(cents);
  }

  static fromRand(rand: number): Rand {
    return Rand.fromCents(Math.round(rand * 100));
  }

  static zero(): Rand {
    return new Rand(0);
  }

  plus(other: Rand): Rand {
    return Rand.fromCents(this.cents + other.cents);
  }

  /** Never returns a negative balance; the caller must check first. */
  minus(other: Rand): Rand {
    if (other.cents > this.cents) {
      throw new BusinessError('Gywh:InsufficientBalance', {
        balanceCents: this.cents,
        requestedCents: other.cents,
      });
    }
    return Rand.fromCents(this.cents - other.cents);
  }

  times(factor: number): Rand {
    return Rand.fromCents(Math.round(this.cents * factor));
  }

  isZero(): boolean {
    return this.cents === 0;
  }

  gte(other: Rand): boolean {
    return this.cents >= other.cents;
  }

  toString(): string {
    return `R${(this.cents / 100).toFixed(2)}`;
  }
}
