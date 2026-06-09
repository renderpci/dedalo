const MIN_SIZE = 1024;

export function withCompression(handler: (req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const res = await handler(req);

    const acceptEncoding = req.headers.get('accept-encoding') || '';
    const contentType = res.headers.get('content-type') || '';

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
