import { createPublicKey, sign, verify, type KeyObject } from 'node:crypto';
import { immutableJson, validEvent, type GywhEvent } from './events.ts';
import { GywhLedger } from './ledger.ts';

export interface SignedEvent {
  readonly event: GywhEvent;
  readonly keyId: string;
  readonly signature: string;
}

function message(event: GywhEvent, keyId: string): Buffer {
  return Buffer.from(JSON.stringify(['UKASHULA/GYWH/event/v1', keyId, event.hash]));
}

/** Caller owns key custody. No key material is written to the event or ledger. */
export function signEvent(event: GywhEvent, keyId: string, key: KeyObject): SignedEvent {
  if (!validEvent(event) || !keyId || key.type !== 'private' || key.asymmetricKeyType !== 'ed25519') {
    throw new TypeError('Gywh:InvalidSigningInput');
  }
  const snapshot = immutableJson(event) as GywhEvent;
  return Object.freeze({ event: snapshot, keyId, signature: sign(null, message(snapshot, keyId), key).toString('base64') });
}

/**
 * Authenticated ingress with an authority/key allowlist from trusted configuration.
 * Peer-provided keys are never trusted. This authenticates one event signer;
 * it does not implement quorum governance, key rotation or revocation history.
 * Preserve returned verified envelopes with pending/conflict state in durable storage.
 */
export class SignedImporter {
  readonly #keys = new Map<string, KeyObject>();

  constructor(authorities: readonly { authorityId: string; keyId: string; publicKey: KeyObject }[]) {
    for (const { authorityId, keyId, publicKey } of authorities) {
      if (!authorityId || !keyId || publicKey.type !== 'public' || publicKey.asymmetricKeyType !== 'ed25519') {
        throw new TypeError('Gywh:InvalidAuthorityKey');
      }
      const id = JSON.stringify([authorityId, keyId]);
      if (this.#keys.has(id)) throw new TypeError('Gywh:DuplicateAuthorityKey');
      this.#keys.set(id, createPublicKey(publicKey.export({ format: 'pem', type: 'spki' })));
    }
  }

  merge(ledger: GywhLedger, incoming: readonly unknown[]) {
    const verified: SignedEvent[] = [];
    let authenticationRejected = 0;
    for (const input of incoming) {
      try {
        const envelope = immutableJson(input) as SignedEvent;
        if (!envelope || !validEvent(envelope.event) || typeof envelope.keyId !== 'string' ||
            typeof envelope.signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature)) {
          authenticationRejected++; continue;
        }
        const key = this.#keys.get(JSON.stringify([envelope.event.authorityId, envelope.keyId]));
        if (!key || !verify(null, message(envelope.event, envelope.keyId), key, Buffer.from(envelope.signature, 'base64'))) {
          authenticationRejected++; continue;
        }
        verified.push(envelope);
      } catch { authenticationRejected++; }
    }
    return {
      ...ledger.merge(verified.map(e => e.event)),
      authenticationRejected,
      verified: Object.freeze(verified),
    };
  }
}
