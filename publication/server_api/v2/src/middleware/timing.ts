/**
 * Server-side processing time, reported two ways: an `X-Response-Time` header (which
 * any client can read) and a `meta.response_time_ms` field inside JSON success bodies
 * (which shows up in the response a browser or an agent is already parsing).
 *
 * WHERE THIS SITS IN THE CHAIN IS LOAD-BEARING. It wraps the ETag layer rather than
 * sitting inside it (see index.ts): the timing value differs on every request, so if it
 * were part of the body the ETag is computed over, no two responses would ever hash the
 * same and `If-None-Match` revalidation could never answer 304. Injecting it *after*
 * the ETag is computed keeps the cache validator stable while still reporting the real
 * elapsed time. Do not reorder these two layers.
 */
export function withTiming(handler: (req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const start = performance.now();
    const res = await handler(req);
    const responseTimeMs = Math.round((performance.now() - start) * 100) / 100;

    const headers = new Headers(res.headers);
    headers.set('X-Response-Time', `${responseTimeMs}ms`);

    const contentType = res.headers.get('content-type') || '';

    // Inject the total processing time into the body's `meta` for JSON success
    // responses. This runs outside the ETag layer, so the varying timing value
    // never affects cache validation (weak ETags stay stable across requests).
    if (res.status === 200 && contentType.includes('application/json')) {
      const text = await res.text();
      try {
        const body = JSON.parse(text);
        // Only an object envelope has a `meta` to extend. A top-level array or scalar is
        // returned untouched rather than reshaped — the wire contract outranks the metric.
        if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
          const existingMeta = body.meta && typeof body.meta === 'object' && !Array.isArray(body.meta)
            ? body.meta
            : {};
          body.meta = { ...existingMeta, response_time_ms: responseTimeMs };
          headers.delete('content-length');
          return new Response(JSON.stringify(body), { status: res.status, statusText: res.statusText, headers });
        }
      } catch {
        // not parseable JSON; fall through and return the original text
      }
      return new Response(text, { status: res.status, statusText: res.statusText, headers });
    }

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  };
}
