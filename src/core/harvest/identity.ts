/**
 * Who the harvesting door says it is — a leaf module, so the robots.txt reader
 * (`robots.ts`) and the door (`harvest.ts`) share ONE identity without importing
 * each other.
 *
 * The product token is what a webmaster writes in `User-agent:` to address us;
 * the User-Agent header carries it first, then the engine version and where a
 * webmaster reads what this crawler is (RFC 9309 §2.2.1: the token is the
 * leading `[a-zA-Z_-]+` of the header value).
 */

import { DEDALO_VERSION } from '../update/version.ts';

/** The product token robots.txt groups match on (case-insensitively). */
export const ROBOTS_PRODUCT_TOKEN = 'dedalo';

/** Sent on every request the door makes, robots.txt included. Never the caller's. */
export const HARVEST_USER_AGENT = `${ROBOTS_PRODUCT_TOKEN}/${DEDALO_VERSION} (+https://dedalo.dev; heritage cataloguing)`;
