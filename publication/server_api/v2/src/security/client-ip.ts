/**
 * Who is calling — the identity the rate limiter buckets on.
 *
 * Bun exposes the peer address on the *server* (`server.requestIP(req)`), not on
 * the Request, so it has to be captured at the Bun.serve boundary and carried to
 * whoever needs it. A WeakMap keyed on the Request does that without threading an
 * extra argument through every middleware layer (they all pass the same Request
 * object down, so identity holds) and without leaking: entries die with the request.
 *
 * Getting this wrong is not cosmetic. The previous code reached for
 * `(req as any).remoteAddress` / `req.socket`, which do not exist on Bun's Request —
 * they were always undefined, so in standalone mode (TRUST_PROXY=false) every caller
 * collapsed into a single 'anonymous' bucket and the per-IP rate limit was in truth
 * one global limit shared by the whole internet.
 */

import { trustProxy, trustedProxyHops } from '../config';

const socketIps = new WeakMap<Request, string>();

/** Record the peer address for this request (called once, at the serve boundary). */
export function setSocketIp(req: Request, ip: string | undefined): void {
  if (ip) socketIps.set(req, ip);
}

/**
 * The caller's IP.
 *
 * Standalone, only the socket address can be trusted: the forwarding headers are
 * attacker-controlled and would let anyone forge a fresh bucket per request, which is a
 * rate-limit bypass rather than a rate limit (audit 2026-08-26, PUB-09).
 *
 * Behind a proxy, the header is still MOSTLY attacker text — and this is where the first
 * fix was wrong. Both shipped configurations APPEND (nginx `$proxy_add_x_forwarded_for`,
 * Apache mod_proxy_http), so a request arrives as
 * `X-Forwarded-For: <anything the client typed>, <the address our proxy actually saw>`.
 * Taking `split(',')[0]` therefore read the ATTACKER'S text as the identity under the
 * DEFAULT deployment mode, and a rotating header bought a fresh bucket per request exactly
 * as before. `[0]` is correct only under a proxy that OVERWRITES the header, which neither
 * shipped config does.
 *
 * The honest rule: count from the RIGHT. Our own chain wrote the last
 * `TRUSTED_PROXY_HOPS` entries, so the caller is the entry immediately to their left, at
 * `chain.length - hops`. A header SHORTER than the declared chain cannot have been written
 * by that chain, so it is not believed at all — the socket peer answers instead.
 *
 * X-Real-IP is deliberately NOT consulted. nginx sets it from `$remote_addr` (safe), but
 * Apache's mod_proxy does not set it at all, so under the default deployment mode a
 * client-supplied X-Real-IP would pass straight through and reopen the same bypass. One
 * header, one rule, safe in both modes.
 *
 * The decision and the hop count are ARGUMENTS with the boot-resolved defaults, not config
 * reads inside the branch: the caller of record still passes nothing, but every behaviour
 * can then be exercised in one process — a guard nobody can run both sides of is a guard
 * nobody knows the state of.
 */
export function clientIp(
  req: Request,
  trusted: boolean = trustProxy,
  hops: number = trustedProxyHops,
): string {
  const socket = socketIps.get(req) ?? 'anonymous';

  if (!trusted) return socket;

  const forwarded = req.headers.get('x-forwarded-for');
  if (!forwarded) return socket;

  const chain = forwarded
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);

  const index = chain.length - Math.max(1, hops);
  if (index < 0) return socket;

  return chain[index] ?? socket;
}
