import { createHash } from 'node:crypto';

/**
 * R15: a signed, append-only ledger with a daily Merkle root, kept
 * Fabric-compatible.
 *
 * One chain per authority. Rev 2 H6 found the built ledger chains prevHash
 * per authority but verifies per entity, so any entity with interleaved
 * events reports invalid. Here the chain and the verification are the same
 * sequence, so that class of bug cannot occur.
 */
export type GywhEventType =
  | 'AccrualOpted'
  | 'AccrualAccrued'
  | 'AccrualSetOff'
  | 'AccrualWithdrawn'
  | 'ThresholdReached'
  | 'BuildAllocated';

export interface GywhEvent {
  readonly seq: number;
  readonly type: GywhEventType;
  readonly authorityId: string;
  readonly householdId: string;
  readonly at: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly prevHash: string;
  readonly hash: string;
}

export const GENESIS_HASH = '0'.repeat(64);

function hashEvent(e: Omit<GywhEvent, 'hash'>): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        e.seq,
        e.type,
        e.authorityId,
        e.householdId,
        e.at,
        e.payload,
        e.prevHash,
      ]),
    )
    .digest('hex');
}

/** Append-only. There is deliberately no remove, no update, no truncate. */
export class EventChain {
  readonly authorityId: string;
  #events: GywhEvent[] = [];

  constructor(authorityId: string) {
    this.authorityId = authorityId;
  }

  get length(): number {
    return this.#events.length;
  }

  get tipHash(): string {
    return this.#events.at(-1)?.hash ?? GENESIS_HASH;
  }

  /** A copy: callers cannot reach in and mutate history. */
  toArray(): readonly GywhEvent[] {
    return this.#events.map((e) => Object.freeze({ ...e }));
  }

  append(
    type: GywhEventType,
    householdId: string,
    at: string,
    payload: Record<string, unknown>,
  ): GywhEvent {
    const base = {
      seq: this.#events.length,
      type,
      authorityId: this.authorityId,
      householdId,
      at,
      payload: Object.freeze({ ...payload }),
      prevHash: this.tipHash,
    };
    const event = Object.freeze({ ...base, hash: hashEvent(base) });
    this.#events.push(event);
    return event;
  }

  /** Verifies the whole chain, in order, as it was written. */
  verify(): { valid: boolean; brokenAtSeq: number | null } {
    let prev = GENESIS_HASH;
    for (const e of this.#events) {
      if (e.prevHash !== prev) return { valid: false, brokenAtSeq: e.seq };
      const { hash, ...rest } = e;
      if (hashEvent(rest) !== hash) return { valid: false, brokenAtSeq: e.seq };
      prev = e.hash;
    }
    return { valid: true, brokenAtSeq: null };
  }

  /** R15: daily Merkle root, published to the transparency page. */
  merkleRootFor(day: string): string | null {
    let level = this.#events
      .filter((e) => e.at.startsWith(day))
      .map((e) => e.hash);
    if (level.length === 0) return null;
    while (level.length > 1) {
      const next: string[] = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = level[i + 1] ?? left;
        next.push(createHash('sha256').update(left + right).digest('hex'));
      }
      level = next;
    }
    return level[0];
  }
}
