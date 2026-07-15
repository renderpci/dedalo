/**
 * Bearer-token authentication and actor extraction.
 *
 * The trust model in one paragraph: the ENGINE is the sole client. It authenticates its
 * users (Dédalo sessions), decides what each may do (tool grants, the publish gate) and
 * then calls here with the shared SERVICE_TOKEN plus the acting user's identity. This
 * daemon verifies the token, TRUSTS the engine's authorization decision, and RECORDS the
 * actor (audit.ts). Nothing here is reachable from a browser: the proxy exposes the
 * daemon only to the engine (loopback or a private network), and the token never leaves
 * the two servers' .env files.
 */

import { timingSafeEqual } from 'node:crypto';
import { config } from '../config';
import { UnauthorizedError, ValidationError } from '../errors';

/** The acting Dédalo user, as reported by the engine. Required on every mutation. */
export interface Actor {
  user_id: number;
  username: string;
}

const encoder = new TextEncoder();
const tokenBytes = encoder.encode(config.SERVICE_TOKEN);

/**
 * Verifies `Authorization: Bearer <token>` with a constant-time compare.
 * Throws UnauthorizedError — the router runs this before matching any route except
 * /health, so an unauthenticated probe learns nothing about which paths exist.
 */
export function requireBearer(req: Request): void {
  const header = req.headers.get('authorization') ?? '';
  const [scheme, presented = ''] = header.split(' ', 2);

  if (scheme !== 'Bearer' || presented.length === 0) {
    throw new UnauthorizedError('Missing bearer token');
  }

  const presentedBytes = encoder.encode(presented);
  // timingSafeEqual demands equal lengths; comparing against a same-length random-ish
  // buffer first would be theater — length is not a secret worth hiding for a ≥32-char
  // random token, so a plain length check is honest.
  if (presentedBytes.length !== tokenBytes.length || !timingSafeEqual(presentedBytes, tokenBytes)) {
    throw new UnauthorizedError('Invalid bearer token');
  }
}

/**
 * Extracts and validates the `actor` object from a mutation's JSON body.
 * A mutation with no actor is refused: the audit trail is only as good as its inputs,
 * and the engine always knows who is acting.
 */
export function requireActor(body: unknown): Actor {
  if (typeof body !== 'object' || body === null) {
    throw new ValidationError('Request body must be a JSON object');
  }
  const actor = (body as Record<string, unknown>).actor;
  if (typeof actor !== 'object' || actor === null) {
    throw new ValidationError('Missing required field: actor {user_id, username}');
  }
  const { user_id, username } = actor as Record<string, unknown>;
  if (typeof user_id !== 'number' || !Number.isInteger(user_id)) {
    throw new ValidationError('actor.user_id must be an integer');
  }
  if (typeof username !== 'string' || username.length === 0 || username.length > 200) {
    throw new ValidationError('actor.username must be a non-empty string');
  }
  return { user_id, username };
}
