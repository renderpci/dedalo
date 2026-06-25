import { randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Per-session CSRF tokens, ported from dd_manager (SEC-008).
 *
 * PHP: token = bin2hex(random_bytes(32)) → 64 hex chars, stored in
 * $_SESSION['dedalo']['csrf_token'], compared with hash_equals (constant-time).
 * Accepted from the X-Dedalo-Csrf-Token header, then rqo.csrf_token, then
 * rqo.options.csrf_token. CSRF_EXEMPT_ACTIONS bypass verification.
 */

export const CSRF_TOKEN_BYTES = 32; // 64 hex chars, matching bin2hex(random_bytes(32))

/** Mint a fresh CSRF token (64 lowercase hex chars). */
export function mintCsrfToken(): string {
  return randomBytes(CSRF_TOKEN_BYTES).toString('hex');
}

/**
 * Constant-time token comparison (mirrors PHP hash_equals). Returns false for
 * empty/length-mismatched inputs without leaking timing on the common path.
 */
export function verifyCsrfToken(expected: string | null | undefined, provided: string | null | undefined): boolean {
  if (!expected || !provided) return false;
  const enc = new TextEncoder();
  const e = enc.encode(expected);
  const p = enc.encode(provided);
  if (e.length !== p.length) return false;
  return timingSafeEqual(e, p);
}

/** Minimal RQO view needed to extract a CSRF token. */
export interface CsrfRqoView {
  csrf_token?: unknown;
  options?: { csrf_token?: unknown } | null;
}

/**
 * Extract the request's CSRF token, mirroring dd_manager::get_csrf_token_from_request
 * with the header taking precedence: header → rqo.csrf_token → rqo.options.csrf_token.
 * Returns '' when none present (an empty token never verifies).
 */
export function extractCsrfFromRequest(headerValue: string | null | undefined, rqo: CsrfRqoView | null | undefined): string {
  if (typeof headerValue === 'string' && headerValue.length > 0) return headerValue;
  if (rqo) {
    if (typeof rqo.csrf_token === 'string') return rqo.csrf_token;
    const opt = rqo.options;
    if (opt && typeof opt.csrf_token === 'string') return opt.csrf_token;
  }
  return '';
}
