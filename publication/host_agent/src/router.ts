/**
 * THE CLOSED ROUTE TABLE and the gate in front of it.
 *
 * Gate order copied from publication/site_builder/src/router.ts: the bearer is checked
 * BEFORE the table is consulted, so every unauthenticated request that is not the public
 * route gets the same 401 — an unknown path, a known path and a wrong verb cannot be told
 * apart. Changes from the copy: no `:param` segments (every path is a literal; the ONE free
 * value any route takes is the copy-mode media path in the QUERY of PUT /v1/media/file,
 * confined under MEDIA_ROOT by src/media/grammar.ts + src/media/copy.ts); BASE_PATH is a constant and is
 * REQUIRED (a path outside it is unknown, never re-tried as a bare path); each route names
 * its §6 command; there is NO `register()` — the table is one frozen literal.
 *
 * EVERY ROW HAS ITS REAL HANDLER (shape `(req, url)`); the ROWS are what
 * tests/router.test.ts pins — a change adds, removes or reorders none of them silently.
 * Phase 5 added the four copy-mode media rows (tests/router.test.ts and the spec §6 gate pin them);
 * provision init's host-wide nginx map added POST /v1/rules/map (spec §13.4).
 */

import { MethodNotAllowedError, NotFoundError } from './errors';
import { handleHealth } from './routes/health';
import { handleMediaProbe } from './routes/media_probe';
import { releaseInstallRoute, releaseRollbackRoute } from './routes/releases';
import { mediaDeleteRoute, mediaManifestRoute, mediaMarkRoute, mediaPutRoute } from './routes/media';
import { handleRulesApply } from './routes/rules_apply';
import { handleRulesMap } from './routes/rules_map';
import { handleStatus } from './routes/status';
import { requireBearer } from './security/auth';
import { problem } from './util/response';

export const BASE_PATH = '/publication/host_agent';

export type RouteHandler = (req: Request, url: URL) => Promise<Response> | Response;

export type AgentCommand =
  | 'health'
  | 'status'
  | 'media.probe'
  | 'rules.apply'
  | 'rules.map'
  | 'release.install'
  | 'release.rollback'
  | 'media.put'
  | 'media.delete'
  | 'media.mark'
  | 'media.manifest';

export interface Route {
  readonly method: 'GET' | 'POST' | 'PUT';
  /** A literal path below BASE_PATH. Matched by string equality, nothing else. */
  readonly path: string;
  readonly command: AgentCommand;
  /** GET /health is the only route reachable without the bearer token. */
  readonly public: boolean;
  readonly handler: RouteHandler;
}

function route(
  method: Route['method'],
  path: string,
  command: AgentCommand,
  handler: RouteHandler,
  options: { public?: boolean } = {},
): Route {
  return Object.freeze({ method, path, command, public: options.public === true, handler });
}

export const ROUTES: readonly Route[] = Object.freeze([
  route('GET', '/health', 'health', handleHealth, { public: true }),
  route('GET', '/v1/status', 'status', handleStatus),
  route('GET', '/v1/media/probe', 'media.probe', handleMediaProbe),
  route('POST', '/v1/rules/apply', 'rules.apply', handleRulesApply),
  route('POST', '/v1/rules/map', 'rules.map', handleRulesMap),
  route('POST', '/v1/releases/v1', 'release.install', releaseInstallRoute('v1')),
  route('POST', '/v1/releases/v2', 'release.install', releaseInstallRoute('v2')),
  route('POST', '/v1/releases/v1/rollback', 'release.rollback', releaseRollbackRoute('v1')),
  route('POST', '/v1/releases/v2/rollback', 'release.rollback', releaseRollbackRoute('v2')),
  route('PUT', '/v1/media/file', 'media.put', mediaPutRoute()),
  route('POST', '/v1/media/delete', 'media.delete', mediaDeleteRoute()),
  route('POST', '/v1/media/mark', 'media.mark', mediaMarkRoute()),
  route('GET', '/v1/media/manifest', 'media.manifest', mediaManifestRoute()),
]);

/** The path below BASE_PATH, or null when the request is not under it at all. */
export function routePath(pathname: string): string | null {
  if (pathname === BASE_PATH) return '/';
  if (pathname.startsWith(`${BASE_PATH}/`)) return pathname.slice(BASE_PATH.length);
  return null;
}

/**
 * IS THIS REQUEST THE PUBLIC ROUTE? — asked of the table, never of a second list. Method
 * included: `POST /health` is a caller asking which verbs exist, which is exactly what the
 * gate refuses to answer.
 */
export function isPublicRequest(method: string, path: string | null): boolean {
  if (path === null) return false;
  return ROUTES.some(r => r.public && r.method === method && r.path === path);
}

function findRoute(method: string, path: string | null): Route {
  if (path === null) throw new NotFoundError('Route not found');
  const allowed = new Set<string>();
  for (const r of ROUTES) {
    if (r.path !== path) continue;
    if (r.method === method) return r;
    allowed.add(r.method);
  }
  if (allowed.size > 0) throw new MethodNotAllowedError(method, [...allowed].sort());
  throw new NotFoundError(`Route not found: ${path}`);
}

export async function routeRequest(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const path = routePath(url.pathname);
    // THE GATE BEFORE THE MATCHER — that order is the property.
    if (!isPublicRequest(req.method, path)) requireBearer(req);
    const matched = findRoute(req.method, path);
    return await matched.handler(req, url);
  } catch (error) {
    return problem(error);
  }
}
