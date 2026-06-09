export function withTiming(handler: (req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const start = performance.now();
    const res = await handler(req);
    const duration = performance.now() - start;

    const headers = new Headers(res.headers);
    headers.set('X-Response-Time', `${duration.toFixed(2)}ms`);

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  };
}
