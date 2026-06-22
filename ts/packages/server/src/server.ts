import {
  createRequestContext,
  runWithContext,
  ANONYMOUS_SESSION,
  type SessionSnapshot,
} from '@dedalo/runtime';
import { mintCsrfToken, verifyCsrfToken, extractCsrfFromRequest, type CsrfRqoView } from '@dedalo/auth';
import {
  dispatch,
  type ApiRegistry,
  type RouterDeps,
  type RqoLike,
} from '@dedalo/core-api';
import {
  dedaloJsonEncode,
  JSON_PRETTY_PRINT,
  JSON_UNESCAPED_SLASHES,
  JSON_UNESCAPED_UNICODE,
} from '@dedalo/json-parity';
import { proxyToPhp } from './proxy.ts';
import { bridgeSession, type BridgedSession } from './session_bridge.ts';

/**
 * The Bun HTTP edge. For each request it decides:
 *   - native: a (dd_api, action) the registry canHandle() → run the TS router
 *     pipeline and encode the response with the exact PHP API flags;
 *   - proxy: everything else → forward verbatim to PHP (byte-parity preserved).
 *
 * Built as a pure (req) => Response handler so it can be unit/integration tested
 * without binding a port.
 */

/** API response encoding flags (core/api/v1/json/index.php:448). */
const BASE_FLAGS = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;

export interface ServerOptions {
  /** URL of the live PHP JSON API for the proxy fallback. */
  phpApiUrl: string;
  /** Native handler registry (empty during early porting → everything proxies). */
  registry: ApiRegistry;
  /** Build per-request router deps (session/CSRF). Defaults to an anonymous, fail-closed set. */
  buildRouterDeps?: (req: Request, rqo: RqoLike) => RouterDeps | Promise<RouterDeps>;
}

/**
 * Build router deps from the live PHP session (migration bridge): forward the
 * browser cookie to PHP to learn is_logged + the session CSRF token, then verify
 * the request's CSRF against it and echo that same token back — so a natively
 * served authenticated action behaves exactly as PHP would for that session.
 */
function bridgedDeps(opts: ServerOptions, req: Request, session: BridgedSession): RouterDeps {
  const csrfHeader = req.headers.get('x-dedalo-csrf-token');
  return {
    registry: opts.registry,
    isLogged: () => session.isLogged,
    verifyCsrf: (rqo) => verifyCsrfToken(extractCsrfFromRequest(csrfHeader, rqo as CsrfRqoView), session.csrfToken),
    ensureCsrfToken: () => session.csrfToken || mintCsrfToken(),
    getMaintenancePermission: () => 0,
  };
}

/** Map the PHP-bridged session to the RequestContext SessionSnapshot the handlers read. */
function snapshotFromBridge(session: BridgedSession): SessionSnapshot {
  if (!session.isLogged) return ANONYMOUS_SESSION;
  return {
    ...ANONYMOUS_SESSION,
    isLogged: true,
    userId: session.userId,
    isGlobalAdmin: session.isGlobalAdmin,
    csrfToken: session.csrfToken || null,
  };
}

function applyCors(headers: Headers, origin: string | null): void {
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Vary', 'Origin');
  }
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Dedalo-Csrf-Token');
}

function parseRqo(text: string): RqoLike | null {
  try {
    const v = JSON.parse(text);
    return v !== null && typeof v === 'object' ? (v as RqoLike) : null;
  } catch {
    return null;
  }
}

export function buildFetchHandler(opts: ServerOptions): (req: Request) => Promise<Response> {
  return async function fetch(req: Request): Promise<Response> {
    const origin = req.headers.get('origin');

    if (req.method === 'OPTIONS') {
      const headers = new Headers();
      applyCors(headers, origin);
      return new Response(null, { status: 204, headers });
    }

    const rawBody = await req.arrayBuffer();
    const rqo = req.method === 'POST' ? parseRqo(new TextDecoder().decode(rawBody)) : null;

    // Native path: a handler owns this (dd_api, action) AND, for intra-action
    // cutover, accepts this specific request. Otherwise fall through to proxy.
    if (rqo && opts.registry.canHandle(rqo.dd_api, rqo.action)) {
      // canHandle already verified dd_api is a registered string.
      const handler = opts.registry.get(rqo.dd_api as string);
      const ownsRequest = handler?.canHandleRequest ? await handler.canHandleRequest(rqo) : handler !== undefined;
      if (ownsRequest) {
        // Bridge the PHP session ONCE (auth truth + CSRF + the logged user id the
        // write path stamps). Custom buildRouterDeps (tests) bypasses the bridge →
        // anonymous context.
        let deps: RouterDeps;
        let session: SessionSnapshot = ANONYMOUS_SESSION;
        if (opts.buildRouterDeps) {
          deps = await opts.buildRouterDeps(req, rqo);
        } else {
          const bridged = await bridgeSession(opts.phpApiUrl, req.headers.get('cookie'));
          deps = bridgedDeps(opts, req, bridged);
          session = snapshotFromBridge(bridged);
        }
        const response = await runWithContext(createRequestContext({ session }), () =>
          dispatch(rqo, deps),
        );
        const flags = rqo.pretty_print ? BASE_FLAGS | JSON_PRETTY_PRINT : BASE_FLAGS;
        const body = dedaloJsonEncode(response, flags);
        const headers = new Headers({ 'content-type': 'application/json' });
        applyCors(headers, origin);
        return new Response(body, { status: 200, headers });
      }
    }

    // Proxy path: forward verbatim to PHP (byte-parity).
    const proxied = await proxyToPhp(opts.phpApiUrl, rawBody, req.headers);
    applyCors(proxied.headers, origin);
    return new Response(proxied.bytes, { status: proxied.status, headers: proxied.headers });
  };
}
