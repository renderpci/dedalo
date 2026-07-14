/**
 * Conditional GET for a public, read-only dataset: a weak ETag, a Cache-Control, and a 304
 * when the client sends the tag back in If-None-Match.
 *
 * LAYER ORDER IS THE WHOLE DESIGN. This is the innermost of the response-shaping middlewares
 * (src/index.ts), so it hashes the handler's own body — before timing injects the ever-changing
 * `meta.response_time_ms`, and before compression re-encodes the bytes. Both of those outer
 * layers legitimately change the bytes of a resource that has not changed at all, which is
 * exactly the situation `W/"…"` (a WEAK validator) exists for, and is why the tag stays stable
 * across identical requests instead of being different every single time.
 *
 * `Bun.hash` is a fast non-cryptographic hash. That is all an ETag needs: it is a
 * change-detector, never a security control.
 *
 * Two endpoints are deliberately never cacheable: /health (its only value is being fresh — it
 * reports live pool connectivity and can answer 503) and the MCP endpoint (a streamed JSON-RPC
 * reply, not a resource with a representation).
 */

import { config } from '../config';

const CACHEABLE_TYPES = ['application/json', 'application/yaml', 'text/html'];

// The exclusions below are written against route paths, and the router matches after stripping
// the deployment prefix — so the comparison has to happen on the same stripped form.
function stripBasePath(pathname: string): string {
  if (config.BASE_PATH && pathname.startsWith(config.BASE_PATH)) {
    return pathname.slice(config.BASE_PATH.length) || '/';
  }
  return pathname;
}

function isCacheable(req: Request, res: Response): boolean {
  // Only a successful GET is a representation worth revalidating. Caching a 404, a 429 or a
  // 5xx would pin a transient failure into every proxy between here and the client.
  if (req.method !== 'GET' || res.status !== 200) return false;

  const contentType = res.headers.get('content-type') || '';
  if (!CACHEABLE_TYPES.some(type => contentType.includes(type))) return false;

  try {
    const pathname = stripBasePath(new URL(req.url).pathname);
    if (pathname === '/health') return false;
    if (config.MCP_ENABLED && pathname === config.MCP_PATH) return false;
  } catch {
    return false;
  }

  return true;
}

/**
 * RFC 9110 weak comparison, which is the only comparison If-None-Match is allowed to use:
 * the `W/` prefix is insignificant on both sides, the header may carry a comma-separated list
 * of candidate tags, and `*` matches any existing representation.
 */
function etagMatches(ifNoneMatch: string, etag: string): boolean {
  const normalize = (tag: string) => tag.trim().replace(/^W\//, '');
  if (ifNoneMatch.trim() === '*') return true;
  return ifNoneMatch.split(',').some(tag => normalize(tag) === normalize(etag));
}

export function withHttpCache(handler: (req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const res = await handler(req);

    if (!isCacheable(req, res)) return res;

    const body = await res.arrayBuffer();
    const etag = `W/"${Bun.hash(new Uint8Array(body)).toString(16)}"`;

    const headers = new Headers(res.headers);
    headers.set('ETag', etag);
    // `no-cache` does not mean "do not store": it means "store, but always revalidate". A
    // CACHE_MAX_AGE of 0 therefore keeps the ETag round trip alive (and its cheap 304s) while
    // guaranteeing the client never serves a published record without asking us first.
    headers.set(
      'Cache-Control',
      config.CACHE_MAX_AGE > 0 ? `public, max-age=${config.CACHE_MAX_AGE}` : 'no-cache',
    );
    // Set here as well as in the compression layer, so a body that never gets compressed
    // (under 1 KB, or an identity client) still tells shared caches to key on the encoding.
    headers.set('Vary', 'Accept-Encoding');

    const ifNoneMatch = req.headers.get('if-none-match');
    if (ifNoneMatch && etagMatches(ifNoneMatch, etag)) {
      // The headers were copied from a response that HAS a body; a 304 does not send one, so
      // it must not keep advertising that body's length.
      headers.delete('Content-Length');
      return new Response(null, { status: 304, headers });
    }

    return new Response(body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  };
}
