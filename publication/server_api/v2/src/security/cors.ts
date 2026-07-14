import { config } from '../config';

/**
 * CORS for a cross-origin-by-design API: the callers are public websites served from other
 * hosts, so a browser will not let them read a response unless we say so here.
 *
 * The default origin is `*`, which is correct for published data — it is world-readable by
 * definition. A deployment that serves a restricted publication sets `CORS_ORIGIN` to its
 * own site instead.
 */
export function applyCors(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin', config.CORS_ORIGIN);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  headers.set('Access-Control-Max-Age', '86400');

  // Credentials are advertised ONLY for a named origin, never for `*`. The two together are
  // the classic CORS hole: any site a visitor happens to load could then make requests that
  // carry the visitor's cookies to this API and read the answers. (Browsers reject the
  // combination outright, so this guard also keeps a wildcard deployment from silently
  // sending a header that breaks every response.)
  if (config.CORS_ORIGIN !== '*') {
    headers.set('Access-Control-Allow-Credentials', 'true');
  }

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

/**
 * The preflight answer. A browser sends `OPTIONS` before any request it considers
 * non-simple (here: anything carrying `X-API-Key`, or a JSON `POST /batch`) and will not
 * issue the real request until this replies. It is answered before routing and before auth
 * — a preflight carries no credentials to check, and rejecting it would only make the
 * browser hide the real 401 behind an opaque CORS failure.
 */
export function handleOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': config.CORS_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
      'Access-Control-Max-Age': '86400',
    },
  });
}
