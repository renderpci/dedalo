/**
 * gzip for the responses where it actually pays: JSON and text bodies of at least 1 KB.
 *
 * This is the OUTERMOST layer of the middleware chain (see src/index.ts), so it sees the
 * final bytes of every response — after the inner http-cache layer has already hashed the
 * uncompressed body into an ETag. Compressing out here is precisely why that ETag must be
 * a WEAK validator: the gzip and identity variants of one resource are byte-different but
 * semantically identical, which is what `W/"…"` means. Shared caches are told to keep the
 * two variants apart with `Vary: Accept-Encoding`.
 *
 * Hazard: sizing the body requires materializing it (`arrayBuffer()`), so any response that
 * would otherwise stream is fully buffered here before a single byte goes out — including
 * the `text/event-stream` reply of the MCP endpoint, which matches the `text/` test.
 */

// Under a kilobyte, gzip spends CPU and a header to save little or nothing.
const MIN_SIZE = 1024;

export function withCompression(handler: (req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const res = await handler(req);

    const acceptEncoding = req.headers.get('accept-encoding') || '';
    const contentType = res.headers.get('content-type') || '';

    // 204/304 have no body by definition
    if (res.status === 204 || res.status === 304) {
      return res;
    }

    // Only text-shaped payloads are worth compressing; anything else (images, the docs
    // assets) is either already compressed or would not shrink.
    if (!contentType.includes('application/json') && !contentType.includes('text/')) {
      return res;
    }

    const body = await res.arrayBuffer();

    if (body.byteLength < MIN_SIZE) {
      return new Response(body, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      });
    }

    // Compression is negotiated, never assumed: a client that does not advertise gzip
    // (plain curl, say) gets the identity bytes back below.
    if (acceptEncoding.includes('gzip')) {
      const compressed = Bun.gzipSync(new Uint8Array(body));
      const headers = new Headers(res.headers);
      headers.set('Content-Encoding', 'gzip');
      headers.set('Vary', 'Accept-Encoding');
      return new Response(compressed, {
        status: res.status,
        statusText: res.statusText,
        headers,
      });
    }

    return new Response(body, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  };
}
