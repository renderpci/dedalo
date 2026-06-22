import { AsyncLocalStorage } from 'node:async_hooks';
import { RequestCaches, type CacheName } from './caches.ts';
import { PerfRecorder } from './perf.ts';
import { ANONYMOUS_SESSION, type SessionSnapshot } from './session.ts';

/**
 * The single per-request state container. Everything PHP kept in request-scoped
 * statics ($_SESSION snapshot, the common::clear() caches, recovery mode, timing)
 * lives here. Handlers obtain it via `ctx()`; there is no global mutable state.
 */
export interface RequestContext {
  /** Unique id for correlation/logging. */
  readonly reqId: string;
  /** Resolved session snapshot (see @dedalo/auth). */
  session: SessionSnapshot;
  /** Active data language for this request (e.g. 'lg-eng'). */
  lang: string;
  /** Default/fallback data language. */
  dataLang: string;
  /**
   * Recovery mode — the ONE request-scoped escalation PHP toggled via
   * $_ENV['DEDALO_RECOVERY_MODE']. Gated by server config + a verified rqo flag.
   */
  recoveryMode: boolean;
  /** Per-session CSRF token echoed on the response. */
  csrfToken: string | null;
  /** Per-request memo stores (replaces common::clear() statics). */
  readonly caches: RequestCaches;
  /** Per-request timing. */
  readonly perf: PerfRecorder;
  /**
   * Per-request database session (a reserved connection), set by @dedalo/db at
   * request start and released at request end. Typed loosely here to avoid a
   * dependency cycle; @dedalo/db provides the concrete type via a cast at the seam.
   */
  db: unknown;
}

export interface RequestContextInit {
  reqId?: string;
  session?: SessionSnapshot;
  lang?: string;
  dataLang?: string;
  recoveryMode?: boolean;
  csrfToken?: string | null;
  db?: unknown;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Default data language used until config/session overrides it. */
export const DEFAULT_LANG = 'lg-eng';

/** Build a fresh, fully-isolated context. Caches start empty. */
export function createRequestContext(init: RequestContextInit = {}): RequestContext {
  return {
    reqId: init.reqId ?? crypto.randomUUID(),
    session: init.session ?? ANONYMOUS_SESSION,
    lang: init.lang ?? DEFAULT_LANG,
    dataLang: init.dataLang ?? init.lang ?? DEFAULT_LANG,
    recoveryMode: init.recoveryMode ?? false,
    csrfToken: init.csrfToken ?? null,
    caches: new RequestCaches(),
    perf: new PerfRecorder(),
    db: init.db ?? null,
  };
}

/**
 * Run `fn` with `context` bound as the active request context. All `ctx()` calls
 * inside `fn` (across awaits) resolve to this context, and to nothing outside it.
 */
export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** Convenience: create a context from `init` and run `fn` within it. */
export function withRequestContext<T>(init: RequestContextInit, fn: () => T): T {
  return runWithContext(createRequestContext(init), fn);
}

/**
 * The active request context. Throws if called outside a request scope — that is
 * a programming error (request-scoped code must run inside runWithContext), and
 * failing loudly is far safer than silently reading shared/undefined state.
 */
export function ctx(): RequestContext {
  const c = storage.getStore();
  if (c === undefined) {
    throw new Error(
      'ctx() called outside a request scope. Request-scoped code must run inside runWithContext().',
    );
  }
  return c;
}

/** The active context, or undefined when outside a request (for optional paths). */
export function tryCtx(): RequestContext | undefined {
  return storage.getStore();
}

/** Memoize a value on the current request's caches (sugar over ctx().caches.memo). */
export function ctxMemo<T>(name: CacheName, key: string, factory: () => T): T {
  return ctx().caches.memo(name, key, factory);
}
