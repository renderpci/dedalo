/**
 * The ONE address-allowlist entry grammar (moved from the retired install gate,
 * 2026-10-12 — WC-2026-10-12-install-surface-removed).
 *
 * Its consumer is the error-report intake gate (`src/core/error_report/gate.ts`,
 * `DEDALO_ERROR_REPORT_ALLOWED_IPS`). It lives in `security/` and not inside that
 * gate because an address-matching rule written twice is how one copy quietly stops
 * understanding CIDR, or keeps admitting a spelling the other dropped: any future
 * allowlist reads this matcher, never a hand-written `127.0.0.1`.
 *
 * Entry spellings:
 *   `loopback`       the local machine — the addresses in LOOPBACK_SPELLINGS, any spelling
 *   `203.0.113.10`   a literal address (v4 or v6), compared as bytes (sameAddress)
 *   `10.0.0.0/24`    a CIDR block (v4 or v6), matched bitwise by ipInCidr
 *   `any`            EVERY address. Written by an operator, never a default.
 *
 * HONEST LIMIT: `clientIp` is what the dispatcher resolved (server.ts
 * clientIpFromRequest) — the trusted-hop entry of `X-Forwarded-For`; a request with
 * NO such header resolves to the sentinel `'local'`, whatever socket it arrived on.
 * Behind the reverse proxy the production guide prescribes that is a real lock; on a
 * bare `SERVER_TCP_PORT` listener with no proxy it admits a remote peer as `local`.
 */

import { ipInCidr, sameAddress } from './ip_address.ts';

/**
 * The spellings of "this machine" the `loopback` token admits. `'local'` is the
 * dispatcher's own sentinel for a request that carried no `X-Forwarded-For` (a unix
 * socket, a direct dev request). Exact ADDRESSES only (in any spelling — compared as
 * bytes): `127.0.0.2` is loopback to the kernel but is not an address anything in this
 * engine produces, and an allowlist that guesses is an allowlist that surprises. Typed
 * ReadonlySet — a constant table, not a cache (module_state_tripwire).
 */
export const LOOPBACK_SPELLINGS: ReadonlySet<string> = new Set([
	'local',
	'127.0.0.1',
	'::1',
	'::ffff:127.0.0.1',
]);

/** The token that admits every address. Written by an operator, never defaulted. */
export const ALLOW_ANY = 'any';

/**
 * Does ONE allowlist entry admit this address? The four spellings, in one place.
 *
 * `any` is honoured HERE rather than per-caller because it is a spelling of the
 * grammar, not a policy: a caller that does not want it never puts it in its entry
 * list (the error-report key is operator-written, and an operator who writes `any`
 * there means it). An entry that is neither token, block nor address matches nothing.
 */
export function allowEntryMatches(entry: string, clientIp: string): boolean {
	if (entry === ALLOW_ANY) return true;
	if (entry === 'loopback') return isLoopbackPeer(clientIp);
	if (entry.includes('/')) return ipInCidr(clientIp, entry);
	return sameAddress(entry, clientIp);
}

/**
 * The `loopback` token: the dispatcher's `'local'` sentinel (a text, not an
 * address), or one of the LOOPBACK_SPELLINGS addresses in any spelling of it —
 * `0:0:0:0:0:0:0:1` is `::1`, `::ffff:7f00:1` is `127.0.0.1`. Still those exact
 * addresses: `127.0.0.2` is not one of them (see LOOPBACK_SPELLINGS).
 */
function isLoopbackPeer(clientIp: string): boolean {
	if (clientIp.trim().toLowerCase() === 'local') return true;
	return [...LOOPBACK_SPELLINGS].some((spelling) => sameAddress(spelling, clientIp));
}
