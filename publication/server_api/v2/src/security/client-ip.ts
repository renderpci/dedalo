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

import { config } from '../config';

const socketIps = new WeakMap<Request, string>();

/** Record the peer address for this request (called once, at the serve boundary). */
export function setSocketIp(req: Request, ip: string | undefined): void {
  if (ip) socketIps.set(req, ip);
}

/**
 * The caller's IP. Behind a reverse proxy (TRUST_PROXY=true, the default for the
 * apache/nginx deployment modes) the forwarding headers are authoritative — the
 * socket peer is the proxy. Standalone, only the socket address can be trusted:
 * headers are attacker-controlled and would let anyone forge a fresh bucket per
 * request, which is a rate-limit bypass rather than a rate limit.
 */
export function clientIp(req: Request): string {
  if (config.TRUST_PROXY) {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    const realIp = req.headers.get('x-real-ip');
    if (realIp) {
      return realIp;
    }
  }

  return socketIps.get(req) ?? 'anonymous';
}
