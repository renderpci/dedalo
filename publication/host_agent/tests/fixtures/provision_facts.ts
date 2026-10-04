/**
 * The pairing fact the renderers read, for a FIXED, obviously fake token: the render gates
 * and the committed examples need a stable fingerprint, never a real secret.
 */
import type { RenderFacts } from '../../src/provision/render/types';
import { instanceFingerprint } from '../../src/security/pairing';

export const FIXTURE_TOKEN = 'fixture-service-token-not-a-secret-00000000000';

export function factsFor(instance: string, token: string = FIXTURE_TOKEN): RenderFacts {
  return Object.freeze({ fingerprint: instanceFingerprint(instance, token) });
}

/** For Task 8's fixture declarations (instance `test`). */
export const FIXTURE_FACTS: RenderFacts = factsFor('test');
