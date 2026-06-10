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
