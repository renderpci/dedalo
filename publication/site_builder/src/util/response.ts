/**
 * Response construction — the only two shapes this daemon emits: a JSON document, or an
 * RFC 9457 problem document rendered from a thrown ApiError (see errors.ts; the SSE
 * stream in sessions/sse.ts is the one exception and constructs its Response inline).
 */

import { ApiError, isDaemonReason, MethodNotAllowedError, ServiceError } from '../errors';
import { isProduction } from '../config';

/**
 * A JSON response. `no-store` by default — every response here is live daemon state (site
 * status, build progress, audit), never cacheable; a caller that needs otherwise passes an
 * explicit Cache-Control in `headers`.
 */
export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

/** Renders any thrown value into a problem+json response. The single catch-all target. */
export function problem(error: unknown): Response {
  const apiError = toApiError(error);

  const body: Record<string, unknown> = {
    type: apiError.type,
    title: apiError.title,
    status: apiError.status,
    detail: apiError.detail,
  };
  // THE MACHINE REASON CROSSES ONLY WHEN IT IS ONE OF `DAEMON_REASONS` — the engine maps exactly
  // that list onto registered codes. A reason a cast smuggled past the type is dropped (and named
  // in the log), so a free-form reason can never become a wire token the engine has no code for.
  if (apiError.reason !== undefined) {
    if (isDaemonReason(apiError.reason)) body.reason = apiError.reason;
    else console.error(`[site_builder] a ${apiError.name} carried a reason outside DAEMON_REASONS, dropped:`, apiError.reason);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/problem+json; charset=utf-8',
    'Cache-Control': 'no-store',
  };
  // RFC 9110 requires a 405 to carry Allow.
  if (apiError instanceof MethodNotAllowedError) {
    headers['Allow'] = apiError.allow.join(', ');
  }

  if (apiError.status >= 500) {
    console.error(`[site_builder] ${apiError.name}:`, error);
  }

  return new Response(JSON.stringify(body), { status: apiError.status, headers });
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  // (A placement refusal — `WebspaceError` — IS an ApiError since WIRE-MAP: a 409 `ConflictError`
  // with reason 'webspace_unavailable', its sentence log-only on the engine side.)

  // Unrecognised throw: internal fault. Detail is fixed in production so nothing
  // internal (paths, CLI stderr, stack frames) leaks through the engine to a browser.
  const message = error instanceof Error ? error.message : String(error);
  return new ServiceError(isProduction ? 'Internal server error' : message);
}
