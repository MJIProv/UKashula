import { createHash } from 'node:crypto';

/**
 * Hash-chain primitive. Signatures belong to signed-import.ts.
 * Fabric integration and persistent storage are not provided here.
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

export function hashEvent(e: Omit<GywhEvent, 'hash'>): string {
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
      payload: immutableJson(payload) as Readonly<Record<string, unknown>>,
      prevHash: this.tipHash,
    };
    const event = Object.freeze({ ...base, hash: hashEvent(base) });
    this.#events.push(event);
    return event;
  }

  /**
   * Take an already-hashed event received from a replica of THIS authority's
   * chain. `append` cannot be used for that: it would recompute `seq` and
   * `prevHash` and therefore a different `hash`.
   *
   * Returns why it was refused rather than throwing, because a merge walks a
   * batch and must keep going. Append-only is preserved: nothing here can
   * rewrite or drop an event that is already held.
   *
   *   'applied'      - appended; the chain grew by one
   *   'duplicate'    - already held at that seq with the same hash (no-op)
   *   'equivocation' - already held at that seq with a DIFFERENT hash. The
   *                    chain contains two hash-valid events for one slot.
   *                    Authorship requires the signed import boundary.
   *                    Never merged away; the caller must surface it.
   *   'wrong-authority' / 'out-of-order' / 'bad-hash' - rejected
   */
  adopt(
    event: GywhEvent,
  ): 'applied' | 'duplicate' | 'equivocation' | 'wrong-authority' | 'out-of-order' | 'bad-hash' {
    if (!validEvent(event)) return 'bad-hash';
    event = immutableJson(event) as GywhEvent;
    if (event.authorityId !== this.authorityId) return 'wrong-authority';

    const { hash, ...rest } = event;
    if (hashEvent(rest) !== hash) return 'bad-hash';

    const held = this.#events[event.seq];
    if (held) return held.hash === event.hash ? 'duplicate' : 'equivocation';

    if (event.seq !== this.#events.length) return 'out-of-order';
    if (event.prevHash !== this.tipHash) return 'out-of-order';

    this.#events.push(Object.freeze({ ...event }));
    return 'applied';
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

  /**
   * Compute a daily Merkle root; publication is an integration responsibility.
   *
   * Leaf order is the chain's own order, and that is deterministic across
   * replicas: `adopt` only accepts an event at its original `seq` with its
   * original `prevHash`, so every replica of this authority's chain holds the
   * same events in the same sequence. No sorting is needed here, and adding
   * it would change roots already published for no gain.
   *
   * Convergence ACROSS authorities is a different problem — a replica's map
   * of authorities is in discovery order — and is handled in
   * `GywhLedger.merkleRootFor`, which sorts.
   */
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

/** JSON-only detached snapshots. Reject lossy values rather than changing hashes. */
export function immutableJson(value: unknown, depth = 0): unknown {
  if (depth > 32) throw new TypeError('Gywh:PayloadTooDeep');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return Object.freeze(Array.from(value, v => immutableJson(v, depth + 1)));
  if (typeof value !== 'object' || value === null ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError('Gywh:NonJsonPayload');
  }
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([k,v]) => [k, immutableJson(v, depth + 1)])));
}

const EVENT_TYPES = new Set(['AccrualOpted', 'AccrualAccrued', 'AccrualSetOff',
  'AccrualWithdrawn', 'ThresholdReached', 'BuildAllocated']);

/** Content validation, not an authentication decision. */
export function validEvent(input: unknown): input is GywhEvent {
  try {
    const e = immutableJson(input) as GywhEvent;
    if (!e || !Number.isSafeInteger(e.seq) || e.seq < 0 || !EVENT_TYPES.has(e.type)) return false;
    if (typeof e.authorityId !== 'string' || !e.authorityId ||
        typeof e.householdId !== 'string' || !e.householdId ||
        typeof e.at !== 'string' || !Number.isFinite(Date.parse(e.at))) return false;
    if (!e.payload || typeof e.payload !== 'object' || Array.isArray(e.payload)) return false;
    if (!/^[a-f0-9]{64}$/.test(e.hash) || !/^[a-f0-9]{64}$/.test(e.prevHash)) return false;
    return hashEvent(e) === e.hash;
  } catch { return false; }
}
