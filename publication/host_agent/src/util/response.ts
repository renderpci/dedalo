/**
 * Response construction — the only two shapes this agent emits: a JSON document, or an
 * RFC 9457 problem document rendered from a thrown error.
 *
 * Copied from publication/site_builder/src/util/response.ts. Changes: no WebspaceError
 * mapping (no such class here); the 5xx scrub keys on NODE_ENV === 'test' (this agent has
 * no 'development' mode) and covers EVERY status >= 500, not only unrecognised throws;
 * `renderProblem` takes the mode as an argument so the production scrub is testable.
 */

import { config } from '../config';
import { ApiError, MethodNotAllowedError, ServiceError } from '../errors';

/** The fixed detail every 5xx carries outside the suite. */
export const SCRUBBED_DETAIL = 'The agent could not complete the request; see its journal.';

/** A JSON response. `no-store`: every body here is live host state. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

/** Renders any thrown value into a problem+json response. The single catch-all target. */
export function problem(error: unknown): Response {
  return renderProblem(error, config.NODE_ENV);
}

export function renderProblem(error: unknown, nodeEnv: 'production' | 'test'): Response {
  const apiError = toApiError(error);
  const scrub = apiError.status >= 500 && nodeEnv !== 'test';

  // Extensions FIRST: the four RFC 9457 members are written last so no extension key can
  // override them (an extension `detail` would otherwise bypass the 5xx scrub).
  const body: Record<string, unknown> = {
    ...apiError.extensions,
    type: apiError.type,
    title: apiError.title,
    status: apiError.status,
    detail: scrub ? SCRUBBED_DETAIL : apiError.detail,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/problem+json; charset=utf-8',
    'Cache-Control': 'no-store',
  };
  // RFC 9110 requires a 405 to carry Allow (only ever reached AFTER the bearer passed).
  if (apiError instanceof MethodNotAllowedError) {
    headers.Allow = apiError.allow.join(', ');
  }

  if (apiError.status >= 500) {
    console.error(`[host_agent] ${apiError.name}:`, error);
  }

  return new Response(JSON.stringify(body), { status: apiError.status, headers });
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new ServiceError(message);
}
