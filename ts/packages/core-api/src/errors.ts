/**
 * Error-envelope builders, reproducing dd_manager's response shapes BYTE-FOR-BYTE
 * (same `msg` strings, same `errors` codes, same field presence/order). The
 * browser frontend parses these exact shapes, so the strings are contract.
 *
 * Field assignment ORDER matters: JS preserves object key insertion order and the
 * encoder honors it, so these are written in the same order PHP assigns them
 * (result, msg, errors, [action], [csrf_token]).
 */

/** A handler raised a security gate denial (PHP permission_exception). */
export class PermissionException extends Error {
  override name = 'PermissionException';
  constructor(
    message: string,
    /** Optional context echoed in logs (PHP $e->api_context). */
    readonly apiContext?: string,
  ) {
    super(message);
  }
}

export interface ErrorEnvelope {
  result: false;
  msg: string;
  errors: string[];
  action?: string | null;
  csrf_token?: string;
  // The dispatched-response path decorates the envelope with action/csrf_token at
  // runtime; the index signature also makes envelopes assignable to ApiResponse.
  [k: string]: unknown;
}

/** rqo lacks an `action` property (dd_manager:296). */
export function missingActionError(): ErrorEnvelope {
  return {
    result: false,
    msg: 'Invalid action var (not found in rqo)',
    errors: ['Undefined method'],
  };
}

/** dd_api not in the allowlist (dd_manager:330). */
export function invalidApiClassError(ddApi: string): ErrorEnvelope {
  return {
    result: false,
    msg: `Error. Invalid API class: ${ddApi}`,
    errors: ['invalid_api_class'],
  };
}

/** Authentication required but the user is not logged in (dd_manager:368). */
export function notLoggedError(action: string | null): ErrorEnvelope {
  // PHP coerces null to '' in string context: '[action:'.$action.']' → '[action:]'.
  return {
    result: false,
    msg: `Error. user is not logged !! [action:${action ?? ''}]`,
    errors: ['not_logged'],
  };
}

/** CSRF verification failed (dd_manager:385). Includes a fresh token + action. */
export function csrfFailedError(action: string | null, freshToken: string): ErrorEnvelope {
  return {
    result: false,
    msg: 'Error. Invalid or missing CSRF token',
    errors: ['csrf_failed'],
    action,
    csrf_token: freshToken,
  };
}

/** Action not found / not authorized on the dd_api (dd_manager:428). */
export function undefinedMethodError(ddApi: string, action: string | null): ErrorEnvelope {
  return {
    result: false,
    msg: `Error. Undefined or unauthorized ${ddApi} method (action) : ${action ?? ''}`,
    errors: ['Undefined method'],
    action,
  };
}

/** Maintenance-area write permission missing (dd_manager:447). */
export function maintenancePermissionError(action: string | null): ErrorEnvelope {
  return {
    result: false,
    msg: `Error. user has not permissions ! [action:${action ?? ''}]`,
    errors: ['permissions error'],
    action,
  };
}

/** A security gate inside a handler denied the request (dd_manager:469). */
export function permissionDeniedError(message: string): ErrorEnvelope {
  return {
    result: false,
    msg: `Error. ${message}`,
    errors: ['permissions_denied'],
  };
}
