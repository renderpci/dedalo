export function withRequestId(handler: (req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const requestId = crypto.randomUUID();
    req.headers.set('x-request-id', requestId);

    const res = await handler(req);

    const headers = new Headers(res.headers);
    headers.set('X-Request-Id', requestId);

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  };
}
