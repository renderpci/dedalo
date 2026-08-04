/**
 * CORS for the JSON API — the browser-side half of the ontology-master contract.
 *
 * PHP did this in `core/api/v1/json/index.php` (SEC-012) from a `DEDALO_CORS`
 * constant. The rewrite dropped it, which silently broke the one workflow that
 * needs it: the update_ontology panel fetches `get_ontology_update_info` from
 * the MASTER **in the browser**, not through the local engine, so without CORS
 * headers on the master the preflight fails and the panel dies with a network
 * error. (The reachability probe next to it is a Bun `fetch` — server-to-server,
 * no CORS involved — so the panel could show a master as "ready" and still be
 * unable to talk to it. That asymmetry is what made this hard to spot.)
 *
 * DELIBERATE DIVERGENCES FROM PHP, both narrowing:
 *
 *   * Only the ORIGIN LIST is configurable. PHP let an operator set the allowed
 *     methods and headers too, which cannot be right: they are dictated by what
 *     `data_manager.js` sends (JSON body + `X-Dedalo-Csrf-Token`), so an
 *     operator editing them can only break the feature. They are constants here.
 *   * No `Access-Control-Allow-Credentials`. PHP sent it; the client calls
 *     cross-origin with `credentials: 'same-origin'`, so no cookie is ever
 *     attached to one of these requests and the header would grant nothing.
 *     Omitting it also removes the `*`-plus-credentials footgun entirely.
 *
 * A cross-origin caller is therefore ALWAYS unauthenticated: it carries no
 * session, and reaches only what the API already opens to an anonymous request.
 * Listing an origin widens who may ASK, never what they may have.
 */

import { readList } from '../../config/readers.ts';

/**
 * Allowlisted origins, read ONCE at boot (configuration is boot-time in this
 * engine — see `../private/.env`). Empty means the whole feature is off and not
 * one `Access-Control-*` header is emitted, which is the default and the
 * behaviour of every install predating this key.
 */
const ALLOWED_ORIGINS: ReadonlySet<string> = new Set(readList('DEDALO_CORS_ALLOWED_ORIGINS'));

/** Is CORS configured at all? Lets callers skip every header decision. */
export const CORS_ENABLED: boolean = ALLOWED_ORIGINS.size > 0;

/**
 * The methods a cross-origin caller may use. The API is POST-only (`API_PATHS`
 * in server.ts); OPTIONS is here because the preflight itself must be allowed.
 */
const ALLOWED_METHODS = 'POST, OPTIONS';

/**
 * The request headers the client actually sends. `Content-Type: application/json`
 * is alone enough to force a preflight (it is not a CORS-safelisted value), and
 * `X-Dedalo-Csrf-Token` is injected by `data_manager.request` for every
 * non-bootstrap action. `X-Dedalo-Report-Token` rides the error-report path.
 * Omitting any of these makes the preflight fail with a header-not-allowed
 * error that names the header — noisy, but only in the browser console.
 */
const ALLOWED_HEADERS = 'Content-Type, X-Dedalo-Csrf-Token, X-Dedalo-Report-Token';

/** Preflight cache lifetime, in seconds. PHP's default; a day is the common ceiling. */
const MAX_AGE = '86400';

/**
 * Exact-match check. No wildcards, no suffix matching, no scheme coercion: an
 * origin is a scheme+host+port triple and a prefix/suffix rule on it is the
 * classic CORS bypass (`https://evil-example.org` suffix-matching
 * `example.org`). If it is not character-for-character in the list, it is not
 * allowed.
 *
 * `null` is the origin of a sandboxed iframe or a `file://` document, and
 * arrives as the LITERAL STRING "null" — allowlisting it would open the API to
 * any such document anywhere, so it can only ever match if an operator typed it
 * verbatim into the list, which the doc tells them not to do.
 */
function isAllowed(origin: string | null, allowlist: ReadonlySet<string>): origin is string {
	return origin !== null && allowlist.has(origin);
}

/**
 * PURE core of the response half — exported for the gate, which must be able to
 * vary the allowlist without re-importing a module whose config is boot-time.
 *
 * `Vary: Origin` is emitted whenever the feature is on, INCLUDING for origins
 * that are not allowed — otherwise a shared cache could serve an allowlisted
 * origin's response (carrying its `Allow-Origin`) to a different origin, or the
 * reverse. That is a real cache-poisoning path, and it is why `Vary` sits
 * outside the `isAllowed` branch.
 */
export function buildCorsResponseHeaders(
	origin: string | null,
	allowlist: ReadonlySet<string>,
): Record<string, string> {
	if (allowlist.size === 0) return {};
	if (!isAllowed(origin, allowlist)) return { Vary: 'Origin' };
	return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
}

/**
 * PURE core of the preflight half. `null` means "not ours" — feature off, or an
 * origin that is not allowlisted.
 *
 * Declining a disallowed origin is deliberate: the caller falls through to its
 * normal routing, which 404s the OPTIONS. A preflight that answers 204 WITHOUT
 * `Access-Control-Allow-Origin` is failed by the browser anyway, so the two are
 * equivalent to a legitimate client — but the 404 does not confirm to a prober
 * that the endpoint exists and is merely unlisted.
 *
 * 204: a preflight has no body, and some intermediaries mishandle a 200 with
 * `Content-Length: 0`.
 */
export function buildCorsPreflightResponse(
	origin: string | null,
	allowlist: ReadonlySet<string>,
): Response | null {
	if (!isAllowed(origin, allowlist)) return null;
	return new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': origin,
			'Access-Control-Allow-Methods': ALLOWED_METHODS,
			'Access-Control-Allow-Headers': ALLOWED_HEADERS,
			'Access-Control-Max-Age': MAX_AGE,
			Vary: 'Origin',
		},
	});
}

/** Headers to merge into an API RESPONSE, against the configured allowlist. */
export function corsResponseHeaders(request: Request): Record<string, string> {
	return buildCorsResponseHeaders(request.headers.get('origin'), ALLOWED_ORIGINS);
}

/** The preflight answer for this request, or `null` when it is not ours. */
export function corsPreflightResponse(request: Request): Response | null {
	return buildCorsPreflightResponse(request.headers.get('origin'), ALLOWED_ORIGINS);
}
