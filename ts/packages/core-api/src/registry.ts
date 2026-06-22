/**
 * Registry of native (TS-ported) API handlers. A handler corresponds to a PHP
 * dd_*_api class and declares its API_ACTIONS allowlist + the implementation for
 * each action. The server routes a request natively only when the registry
 * canHandle() it; everything else proxies to PHP (incremental cutover).
 */

export type RqoLike = { readonly [k: string]: unknown };
export type ApiResponse = Record<string, unknown>;

export interface ApiHandler {
  /** The dd_api class name this handler implements (e.g. 'dd_core_api'). */
  readonly ddApi: string;
  /** The API_ACTIONS allowlist (SEC-024): only these actions are routable. */
  readonly apiActions: ReadonlySet<string>;
  /**
   * Optional fine-grained predicate for INTRA-ACTION incremental cutover. An
   * action like `read` spans many sub-paths (every component model, sections, …);
   * a handler may natively own only some of them. When this returns false the
   * server proxies that specific request to PHP instead of dispatching natively.
   * Absent ⇒ the handler owns every listed action entirely.
   */
  canHandleRequest?(rqo: RqoLike): boolean | Promise<boolean>;
  /** Execute an allowlisted action. May throw PermissionException. */
  dispatch(action: string, rqo: RqoLike): Promise<ApiResponse> | ApiResponse;
}

export class ApiRegistry {
  private readonly handlers = new Map<string, ApiHandler>();

  register(handler: ApiHandler): void {
    this.handlers.set(handler.ddApi, handler);
  }

  get(ddApi: string): ApiHandler | undefined {
    return this.handlers.get(ddApi);
  }

  /** True iff a native handler exists for ddApi AND lists `action` in API_ACTIONS. */
  canHandle(ddApi: unknown, action: unknown): boolean {
    if (typeof ddApi !== 'string' || typeof action !== 'string') return false;
    const h = this.handlers.get(ddApi);
    return h !== undefined && h.apiActions.has(action);
  }

  ddApis(): string[] {
    return [...this.handlers.keys()].sort();
  }
}
