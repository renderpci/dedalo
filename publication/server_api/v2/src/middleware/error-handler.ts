/**
 * The last line of defense: every throw anywhere below becomes an RFC 9457
 * `application/problem+json` response, and nothing else.
 *
 * Two callers funnel into it — the top-level try/catch in src/index.ts (the HTTP surface)
 * and `dispatch()` in src/router.ts (the internal one used by /batch) — so a sub-query of a
 * batch reports a failure in exactly the same shape a direct request would. The contract is
 * documented in docs/diffusion/publication_api/v2/http_semantics.md and asserted by
 * tests/error-handler.test.ts.
 *
 * The rule this module exists to enforce: an error we did not anticipate must never leak
 * server internals. Anything that is not a deliberate ApiError collapses to a 500 whose
 * `detail` is a constant string in production — the stack goes to the log, never to the wire.
 */

import { ZodError } from 'zod';
import { ApiError, ValidationError, ServiceError } from '../errors';
import { problem } from '../utils/response';
import { isDevelopment } from '../config';

// RFC 9457's `instance`: which request produced this problem. A handler must not itself
// throw, hence the guard — an unparseable URL costs us the field, not the response.
function requestInstance(req: Request): string {
  try {
    const url = new URL(req.url);
    return url.pathname + url.search;
  } catch {
    return '';
  }
}

export function handleError(error: unknown, req: Request): Response {
  const instance = requestInstance(req);

  // Zod reports EVERY offending parameter, not just the first, and they are all shipped in
  // the `errors` extension member: a client with three bad params fixes them in one round
  // trip instead of three. `pointer` is the dotted Zod path (`limit`, `queries.0.id`).
  if (error instanceof ZodError) {
    const issues = error.issues.map(issue => ({
      pointer: issue.path.join('.'),
      message: issue.message,
    }));
    return problem(
      new ValidationError('One or more request parameters are invalid', { errors: issues }),
      instance,
    );
  }

  // An ApiError is a deliberate answer: the throw site already chose the status, type, title
  // and a detail it is willing to show a stranger, so it is passed through verbatim. Only the
  // 5xx ones are logged — 4xx are the caller's mistake, and logging them would let any client
  // flood the log at will.
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      console.error(`${error.name}:`, error.detail);
    }
    return problem(error, instance);
  }

  // Anything else that reached here is a bug (or a driver/runtime failure). Its message can
  // carry SQL text, schema names or connection details, so it is only echoed when running in
  // development; production gets the constant string and the operator gets the stack.
  if (error instanceof Error) {
    console.error('Unhandled error:', error.stack ?? error.message);
    return problem(
      new ServiceError(isDevelopment ? error.message : 'An unexpected error occurred'),
      instance,
    );
  }

  // A non-Error was thrown. There is no shape to trust here, so nothing about it is exposed.
  console.error('Unknown error:', error);
  return problem(new ServiceError('An unexpected error occurred'), instance);
}
