/**
 * The response emitters every route shares — this is where the wire contract is
 * actually made, and there is no second way to build a response in this API.
 *
 * Two shapes, and only two:
 *
 *   - SUCCESS is an envelope: `{ data, pagination?, meta? }`. `data` is always the
 *     payload (rows, a table listing, a fragment array), `pagination` carries the
 *     `limit`/`offset`/`total` of a list, `meta` carries everything about the answer
 *     that is not the answer. The envelope is assembled by the handlers and merely
 *     serialized here; keeping the payload behind a `data` key is what allows a
 *     later addition to the envelope to be a non-breaking change.
 *   - FAILURE is RFC 9457 `application/problem+json`, produced ONLY by `problem()`,
 *     which middleware/error-handler calls for every throw. A route never builds an
 *     error body itself, so there is no path by which an ad-hoc error shape can
 *     reach a client.
 *
 * What is NOT here is as deliberate as what is: no ETag, no Cache-Control, no
 * timing. Handlers return bare bodies and the middleware chain decorates them —
 * ETag/Cache-Control in middleware/http-cache, `X-Response-Time` plus a
 * `meta.response_time_ms` merged into the body in middleware/timing, gzip in
 * middleware/compress. That ordering is why `meta` can appear on a response whose
 * handler never wrote one.
 */

import type { ApiError } from '../errors';

/**
 * Note the header precedence: the caller's headers are spread LAST, so a route can
 * override even the Content-Type. In practice routes use this to add the headers
 * only they can know about — `Link` for pagination, `Content-Language` when a single
 * language was requested.
 */
export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/**
 * RFC 9457 Problem Details response.
 *
 * `instance` identifies the specific occurrence — the path and query that failed —
 * and is supplied by the error handler rather than taken from the error, because an
 * ApiError is thrown deep in a service that has no business knowing the request.
 *
 * `error.extensions` are spread as top-level members, which is exactly how RFC 9457
 * extends a problem document (ValidationError's per-field `errors` array is the one
 * user of this). The five standard members are written first, so an extension cannot
 * be used to overwrite `status` or `type` — the machine-readable part of the
 * contract stays under this module's control.
 */
export function problem(error: ApiError, instance: string): Response {
  const body: Record<string, unknown> = {
    type: error.type,
    title: error.title,
    status: error.status,
    detail: error.detail,
    instance,
    ...error.extensions,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/problem+json',
  };
  // A 405 is only useful with the `Allow` header HTTP requires alongside it, and
  // MethodNotAllowedError is the one error that carries the list. Structural check
  // rather than an instanceof, so any future error that knows its allowed methods
  // gets the header for free.
  if ('allow' in error && Array.isArray((error as { allow?: string[] }).allow)) {
    headers['Allow'] = (error as { allow: string[] }).allow.join(', ');
  }

  return new Response(JSON.stringify(body), { status: error.status, headers });
}

// A 204 has no body by definition — used where a client expects a resource that this
// API deliberately does not serve (the favicon), so a browser stops asking rather
// than logging a 404 on every page.
export function noContent(): Response {
  return new Response(null, { status: 204 });
}

/*
 * The three below serve the documentation surface only (routes/docs.ts): the Swagger
 * and Scalar pages, the renderer bundles they load from disk, and the OpenAPI spec.
 * They are not part of the data contract — no data endpoint may answer in anything
 * but JSON or problem+json.
 */

export function html(content: string, status = 200): Response {
  return new Response(content, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export function yaml(content: string, status = 200): Response {
  return new Response(content, {
    status,
    headers: { 'Content-Type': 'application/yaml' },
  });
}

export function binary(content: Uint8Array, contentType: string, status = 200): Response {
  return new Response(content, {
    status,
    headers: { 'Content-Type': contentType, 'Cache-Control': 'no-cache' },
  });
}
