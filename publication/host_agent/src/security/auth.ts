/**
 * Bearer-token authentication and actor extraction.
 *
 * Copied from publication/site_builder/src/security/auth.ts. Changes: `requireActor`
 * reads the actor from the `X-Dedalo-Actor` HEADER and returns a string (the agent's
 * mutations carry a bundle stream as their body, so the actor cannot live in a JSON body);
 * the `Actor` object type is gone.
 *
 * Trust model: the ENGINE is the sole client. It authenticates its users, decides who may
 * act, and calls here with the shared SERVICE_TOKEN plus the acting user's name. This agent
 * verifies the token, trusts the decision, and RECORDS the actor (audit.ts).
 */

import { timingSafeEqual } from 'node:crypto';
import { config } from '../config';
import { UnauthorizedError, ValidationError } from '../errors';

/** The header the engine names the acting Dédalo user in. */
export const ACTOR_HEADER = 'x-dedalo-actor';

/** 1–200 characters, no control characters (it is written into the audit line verbatim). */
const ACTOR_PATTERN = /^[^\u0000-\u001f\u007f]{1,200}$/;

const encoder = new TextEncoder();
const tokenBytes = encoder.encode(config.SERVICE_TOKEN);

/**
 * Verifies `Authorization: Bearer <token>` with a constant-time compare. The router runs
 * this BEFORE matching any route except the public one, so an unauthenticated probe
 * learns nothing about which paths exist.
 */
export function requireBearer(req: Request): void {
  const header = req.headers.get('authorization') ?? '';
  const [scheme, presented = ''] = header.split(' ', 2);

  if (scheme !== 'Bearer' || presented.length === 0) {
    throw new UnauthorizedError('Missing bearer token');
  }

  const presentedBytes = encoder.encode(presented);
  // Length is not a secret worth hiding for a >= 32-char random token.
  if (presentedBytes.length !== tokenBytes.length || !timingSafeEqual(presentedBytes, tokenBytes)) {
    throw new UnauthorizedError('Invalid bearer token');
  }
}

/** The acting Dédalo user, required on every mutation. */
export function requireActor(req: Request): string {
  const actor = req.headers.get(ACTOR_HEADER);
  if (actor === null || !ACTOR_PATTERN.test(actor)) {
    throw new ValidationError(
      `Missing or invalid ${ACTOR_HEADER} header (1-200 characters, no control characters).`,
      'actor_missing',
    );
  }
  return actor;
}
