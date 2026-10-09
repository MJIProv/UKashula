import { createHash } from 'node:crypto';
import { EventChain, type GywhEvent } from './events.ts';

/**
 * R15 at replica scale: many authorities, one converging ledger.
 *
 * `EventChain` is deliberately single-writer — its docstring says "One chain
 * per authority", and that is right: a linear hash chain is what makes
 * `verify()` meaningful. But a single chain cannot hold two authorities, and
 * it has no way to take events in from a peer. So an ICP that goes offline,
 * records deliveries, and later meets another device has nowhere to put what
 * it carries.
 *
 * This is that missing layer. It holds one `EventChain` per authority and
 * merges batches of events from any source, in any order, any number of
 * times. Convergence is structural rather than negotiated: the merged state
 * is the union of per-authority chains, so there is no leader, no tie-break
 * and no last-write-wins. Two replicas that have seen the same events are in
 * the same state, whatever order they saw them in.
 *
 * What it does NOT do: it is not a transport. It assumes nothing about how
 * events arrive — Bluetooth, Wi-Fi Direct, USSD, a sync server, a file on a
 * memory card. `merge()` is the whole interface.
 *
 * EQUIVOCATION IS NOT A MERGE CONFLICT. If one authority produces two
 * different events for the same `seq`, that is not disagreement to be
 * resolved — it is provable misbehaviour by a trusted party, and the proof is
 * the pair of signed events. It is recorded and surfaced, never silently
 * resolved. Picking a winner would destroy the only evidence.
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
  /** Valid but not yet connectable — a gap in the chain. Re-merge later. */
  readonly deferred: number;
  readonly rejected: number;
  readonly equivocations: readonly Equivocation[];
}

export class GywhLedger {
  readonly #chains = new Map<string, EventChain>();
  readonly #equivocations: Equivocation[] = [];

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

  /**
   * Union this ledger with a batch of events. Safe to call repeatedly with
   * overlapping batches — duplicates are counted, not applied twice.
   *
   * Events are applied in `seq` order per authority, and the pass repeats
   * while progress is being made, so a batch that arrives shuffled still
   * lands. Anything still unconnectable is reported as `deferred`: it is a
   * gap, not an error, and a later merge closes it. That is the self-healing
   * property — a replica never has to receive events in order, or once.
   */
  merge(incoming: readonly GywhEvent[]): MergeResult {
    let applied = 0;
    let duplicate = 0;
    let rejected = 0;
    const equivocations: Equivocation[] = [];

    // Group by authority, then order by seq so the common case is one pass.
    const byAuthority = new Map<string, GywhEvent[]>();
    for (const e of incoming) {
      const list = byAuthority.get(e.authorityId) ?? [];
      list.push(e);
      byAuthority.set(e.authorityId, list);
    }

    let pending: GywhEvent[] = [];

    for (const [authorityId, events] of byAuthority) {
      const chain = this.chainFor(authorityId);
      let queue = [...events].sort((a, b) => a.seq - b.seq);

      // Repeat while progress is made: closes gaps filled within one batch.
      for (;;) {
        const stuck: GywhEvent[] = [];
        let progressed = false;

        for (const e of queue) {
          const outcome = chain.adopt(e);
          switch (outcome) {
            case 'applied':
              applied += 1;
              progressed = true;
              break;
            case 'duplicate':
              duplicate += 1;
              break;
            case 'equivocation': {
              const held = chain.toArray()[e.seq];
              const eq: Equivocation = { authorityId, seq: e.seq, held, offered: e };
              equivocations.push(eq);
              this.#equivocations.push(eq);
              break;
            }
            case 'out-of-order':
              stuck.push(e);
              break;
            default:
              // 'wrong-authority' cannot happen (grouped by authority);
              // 'bad-hash' is a corrupt or forged event.
              rejected += 1;
              break;
          }
        }

        queue = stuck;
        if (!progressed || queue.length === 0) break;
      }

      pending = pending.concat(queue);
    }

    return {
      applied,
      duplicate,
      deferred: pending.length,
      rejected,
      equivocations,
    };
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

  /** Everything held, for handing to a peer. */
  toArray(): readonly GywhEvent[] {
    const out: GywhEvent[] = [];
    for (const authorityId of this.authorities()) {
      out.push(...this.chainFor(authorityId).toArray());
    }
    return out;
  }
}
