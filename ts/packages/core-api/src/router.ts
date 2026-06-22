import {
  ALLOWED_API_CLASSES,
  AREA_MAINTENANCE_DD_API,
  CSRF_EXEMPT_ACTIONS,
  DEFAULT_DD_API,
  NO_LOGIN_NEEDED_ACTIONS,
} from './constants.ts';
import {
  PermissionException,
  type ErrorEnvelope,
  csrfFailedError,
  invalidApiClassError,
  maintenancePermissionError,
  missingActionError,
  notLoggedError,
  permissionDeniedError,
  undefinedMethodError,
} from './errors.ts';
import type { ApiRegistry, ApiResponse, RqoLike } from './registry.ts';

/**
 * Dependencies the router needs from the surrounding request, injected so the
 * dispatch logic is pure and unit-testable without a real session/db.
 */
export interface RouterDeps {
  registry: ApiRegistry;
  isLogged(): boolean | Promise<boolean>;
  /** Verify the request's CSRF token against the session (timing-safe). */
  verifyCsrf(rqo: RqoLike): boolean | Promise<boolean>;
  /** Return the current/fresh per-session CSRF token. */
  ensureCsrfToken(): string | Promise<string>;
  /** Maintenance-area permission level for the current user (≥2 = write). */
  getMaintenancePermission(): number | Promise<number>;
}

/**
 * Reproduce dd_manager::manage_request for NATIVELY-ported actions, in the exact
 * same ordered pipeline and with byte-identical response envelopes. The server
 * only calls this when registry.canHandle(dd_api, action) is true; all other
 * actions are proxied to PHP. Each early-return error envelope matches PHP's
 * field set (note: only the dispatched response gets `action` + `csrf_token`
 * decoration; the early errors do not — except csrf_failed, which carries a fresh
 * token itself, mirroring dd_manager).
 */
export async function dispatch(rqo: RqoLike, deps: RouterDeps): Promise<ApiResponse | ErrorEnvelope> {
  // 1. action presence (PHP property_exists($rqo,'action'))
  if (!Object.prototype.hasOwnProperty.call(rqo, 'action')) {
    return missingActionError();
  }

  // 2. dd_api allowlist (SEC-024). `$rqo->dd_api ?? 'dd_core_api'`.
  const ddApiRaw = rqo.dd_api == null ? DEFAULT_DD_API : rqo.dd_api;
  if (typeof ddApiRaw !== 'string' || !ALLOWED_API_CLASSES.has(ddApiRaw)) {
    return invalidApiClassError(String(ddApiRaw));
  }
  const ddApi = ddApiRaw;

  // 3. authentication. Skip only when action is a string in the no-login allowlist.
  const action = rqo.action;
  const actionStr = typeof action === 'string' ? action : null;
  const isNoLogin = actionStr !== null && NO_LOGIN_NEEDED_ACTIONS.has(actionStr);
  if (!isNoLogin) {
    if ((await deps.isLogged()) !== true) {
      return notLoggedError(actionStr);
    }
  }

  // 4. CSRF (SEC-008). Only enforced for string actions not in the exempt list.
  if (actionStr !== null && !CSRF_EXEMPT_ACTIONS.has(actionStr)) {
    if ((await deps.verifyCsrf(rqo)) !== true) {
      return csrfFailedError(actionStr, await deps.ensureCsrfToken());
    }
  }

  // 5. method validity (SEC-024 API_ACTIONS allowlist).
  const handler = deps.registry.get(ddApi);
  const isValid = handler !== undefined && actionStr !== null && handler.apiActions.has(actionStr);
  if (!isValid || handler === undefined || actionStr === null) {
    return undefinedMethodError(ddApi, actionStr);
  }

  // 6. maintenance-area write gate.
  if (ddApi === AREA_MAINTENANCE_DD_API) {
    if ((await deps.getMaintenancePermission()) < 2) {
      return maintenancePermissionError(actionStr);
    }
  }

  // 7. dispatch; convert a permission_exception to the uniform denied envelope.
  let response: ApiResponse;
  try {
    response = await handler.dispatch(actionStr, rqo);
  } catch (err) {
    if (err instanceof PermissionException) {
      response = permissionDeniedError(err.message);
    } else {
      throw err;
    }
  }

  // 8-9. decorate the dispatched response (and ONLY this path) with action then
  // csrf_token, in that key order — matching dd_manager lines 483 + 491.
  response.action = actionStr;
  response.csrf_token = await deps.ensureCsrfToken();
  return response;
}
