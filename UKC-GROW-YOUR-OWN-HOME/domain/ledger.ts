import { createHash } from 'node:crypto';
import { EventChain, immutableJson, validEvent, type GywhEvent } from './events.ts';

/**
 * In-memory union of non-conflicting, single-writer authority chains.
 * Raw merge validates hashes, NOT authorship; use signed-import.ts at ingress.
 * Pending events survive later merge calls, but not process restarts.
 * Forks retain both candidates and block root publication. There is no automatic
 * fork resolution, persistence, device transport or business-state replay here.
 */

export interface Equivocation {
  readonly authorityId: string;
  readonly seq: number;
  /** The event already held. */
  readonly held: GywhEvent;
  /** The conflicting event offered. NOT applied. */
  readonly offered: GywhEvent;
}

export interface MergeResult {
  readonly applied: number;
  readonly duplicate: number;
  /** Valid but not yet connectable, retained in memory across merge calls. */
  readonly deferred: number;
  readonly rejected: number;
  /** Not retained because the pending limit was reached; sender must retry. */
  readonly overflow: number;
  readonly equivocations: readonly Equivocation[];
}

export class GywhLedger {
  readonly #chains = new Map<string, EventChain>();
  readonly #equivocations: Equivocation[] = [];

  readonly #pending = new Map<string, GywhEvent>();
  readonly #conflictKeys = new Set<string>();
  readonly #maxPending: number;

  constructor(maxPending = 10_000) {
    if (!Number.isSafeInteger(maxPending) || maxPending < 0) throw new RangeError('Gywh:InvalidPendingLimit');
    this.#maxPending = maxPending;
  }

  pending(): readonly GywhEvent[] { return [...this.#pending.values()]; }

  /** Authorities seen, in a stable order so callers can rely on it. */
  authorities(): readonly string[] {
    return [...this.#chains.keys()].sort();
  }

  chainFor(authorityId: string): EventChain {
    let c = this.#chains.get(authorityId);
    if (!c) {
      c = new EventChain(authorityId);
      this.#chains.set(authorityId, c);
    }
    return c;
  }

  get length(): number {
    let n = 0;
    for (const c of this.#chains.values()) n += c.length;
    return n;
  }

  /** Merge JSON events; report explicit backpressure rather than silently dropping gaps. */
  merge(incoming: readonly unknown[]): MergeResult {
    let applied = 0, duplicate = 0, rejected = 0, overflow = 0;
    const equivocations: Equivocation[] = [];
    const queue = [...this.#pending.values()];
    this.#pending.clear();
    const seen = new Set(queue.map(e => e.hash));
    for (const input of incoming) {
      let e: GywhEvent;
      try {
        const snapshot = immutableJson(input);
        if (!validEvent(snapshot)) { rejected++; continue; }
        e = snapshot;
      } catch { rejected++; continue; }
      if (seen.has(e.hash)) { duplicate++; continue; }
      seen.add(e.hash);
      queue.push(e);
    }
    // Existing retained gaps are included, so a missing predecessor heals them
    // without requiring the sender to transmit the tail again.
    queue.sort((a, b) => a.seq - b.seq);
    for (const e of queue) {
      const chain = this.chainFor(e.authorityId);
      const outcome = chain.adopt(e);
      switch (outcome) {
        case 'applied': applied++; break;
        case 'duplicate': duplicate++; break;
        case 'equivocation': {
          const held = chain.toArray()[e.seq];
          const key = JSON.stringify([e.authorityId, e.seq, ...[held.hash, e.hash].sort()]);
          if (!this.#conflictKeys.has(key)) {
            const eq = Object.freeze({ authorityId: e.authorityId, seq: e.seq, held, offered: e });
            this.#conflictKeys.add(key);
            this.#equivocations.push(eq);
            equivocations.push(eq);
          }
          break;
        }
        case 'out-of-order':
          if (this.#pending.size < this.#maxPending) this.#pending.set(e.hash, e);
          else overflow++;
          break;
        default: rejected++;
      }
    }
    return { applied, duplicate, rejected, overflow, deferred: this.#pending.size, equivocations };
  }

  /**
   * R15 daily root across every authority.
   *
   * Built from the sorted set of per-authority daily roots, so it is a
   * function of the events held and nothing else — not of authority
   * discovery order, not of arrival order. Two converged replicas publish
   * the same root.
   *
   * An authority with no events that day contributes nothing, so a replica
   * that has merely heard of an authority does not differ from one that has
   * not.
   */
  merkleRootFor(day: string): string | null {
    if (this.#equivocations.length) throw new Error('Gywh:UnresolvedFork');
    const roots: string[] = [];
    for (const c of this.#chains.values()) {
      const r = c.merkleRootFor(day);
      if (r !== null) roots.push(r);
    }
    if (roots.length === 0) return null;

    let level = roots.sort();
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

  /** Every authority's chain verifies, and nobody has equivocated. */
  verify(): {
    valid: boolean;
    brokenAuthority: string | null;
    brokenAtSeq: number | null;
    equivocations: readonly Equivocation[];
  } {
    for (const authorityId of this.authorities()) {
      const r = this.chainFor(authorityId).verify();
      if (!r.valid) {
        return {
          valid: false,
          brokenAuthority: authorityId,
          brokenAtSeq: r.brokenAtSeq,
          equivocations: this.equivocations(),
        };
      }
    }
    return {
      valid: this.#equivocations.length === 0,
      brokenAuthority: null,
      brokenAtSeq: null,
      equivocations: this.equivocations(),
    };
  }

  equivocations(): readonly Equivocation[] {
    return this.#equivocations.map((e) => Object.freeze({ ...e }));
  }

  /** Connected chain events only. Persist pending() and equivocations() separately. */
  toArray(): readonly GywhEvent[] {
    const out: GywhEvent[] = [];
    for (const authorityId of this.authorities()) {
      out.push(...this.chainFor(authorityId).toArray());
    }
    return out;
  }
}
