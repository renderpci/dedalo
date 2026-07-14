/**
 * Stamps every request with a UUID, echoed back as `X-Request-Id`.
 *
 * This is what makes a user's bug report actionable: they quote the id from the response
 * headers, and it identifies the exact log line (logger.ts prints it) for that request.
 * The id is written onto the INBOUND request's headers, not just the response, so that
 * anything downstream — the logger, a handler, an error report — can read it back off
 * the request without it having to be threaded through every signature.
 */
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
