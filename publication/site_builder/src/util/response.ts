/**
 * Response construction — the only two shapes this daemon emits: a JSON document, or an
 * RFC 9457 problem document rendered from a thrown ApiError (see errors.ts; the SSE
 * stream in sessions/sse.ts is the one exception and constructs its Response inline).
 */

import { ApiError, MethodNotAllowedError, ServiceError } from '../errors';
import { isProduction } from '../config';

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
    ...apiError.extensions,
  };

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
  // Unrecognised throw: internal fault. Detail is fixed in production so nothing
  // internal (paths, CLI stderr, stack frames) leaks through the engine to a browser.
  const message = error instanceof Error ? error.message : String(error);
  return new ServiceError(isProduction ? 'Internal server error' : message);
}
