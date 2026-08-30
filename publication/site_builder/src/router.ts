/**
 * The routing table and the gate in front of it.
 *
 * Same hand-rolled exact-arity matcher as the publication API (small enough to read in
 * one sitting, so its security properties can be argued about). The gate is different in
 * one load-bearing way: EVERY route except `GET /health` requires the bearer token, and it
 * is checked BEFORE the path is matched — so an unauthenticated probe learns nothing about
 * which routes exist, not even from the difference between a 404 and a 401. This daemon has
 * no anonymous surface, and no enumeration oracle in front of it.
 *
 * P0 registers health, capabilities and site CRUD. P1/P2/P4 add the session, build and
 * publish routes; the matcher and gate do not change.
 */

import { config } from './config';
import { requireBearer } from './security/auth';
import { NotFoundError, MethodNotAllowedError } from './errors';
import { problem } from './util/response';
import { handleHealth } from './routes/health';
import { handleCapabilities } from './routes/capabilities';
import {
  handleCreateSite,
  handleListSites,
  handleGetSite,
  handleDeleteSite,
} from './routes/sites';
import {
  handleStartSession,
  handleListSessions,
  handleSessionEvents,
  handleSessionMessage,
  handleSessionStop,
} from './routes/sessions';
import { handleBuild, handleGetBuild, handlePreview } from './routes/builds';
import {
  handlePublish,
  handleListReleases,
  handleRollback,
  handleAudit,
} from './routes/publish';

export type RouteHandler = (
  req: Request,
  params: Record<string, string>,
  url: URL,
) => Promise<Response> | Response;

interface Route {
  method: string;
  segments: string[];
  handler: RouteHandler;
  /** /health is the only route reachable without the bearer token. */
  public?: boolean;
}

const routes: Route[] = [];

function register(
  method: 'GET' | 'POST' | 'DELETE',
  pattern: string,
  handler: RouteHandler,
  options: { public?: boolean } = {},
): void {
  routes.push({ method, segments: pattern.split('/').filter(Boolean), handler, public: options.public });
}

register('GET', '/health', handleHealth, { public: true });
register('GET', '/v1/capabilities', handleCapabilities);
register('POST', '/v1/sites', handleCreateSite);
register('GET', '/v1/sites', handleListSites);
register('GET', '/v1/sites/:slug', handleGetSite);
register('DELETE', '/v1/sites/:slug', handleDeleteSite);
register('POST', '/v1/sites/:slug/sessions', handleStartSession);
register('GET', '/v1/sites/:slug/sessions', handleListSessions);
register('GET', '/v1/sessions/:id/events', handleSessionEvents);
register('POST', '/v1/sessions/:id/messages', handleSessionMessage);
register('POST', '/v1/sessions/:id/stop', handleSessionStop);
register('POST', '/v1/sites/:slug/build', handleBuild);
register('GET', '/v1/sites/:slug/builds/:id', handleGetBuild);
register('GET', '/v1/sites/:slug/preview', handlePreview);
register('POST', '/v1/sites/:slug/publish', handlePublish);
register('GET', '/v1/sites/:slug/releases', handleListReleases);
register('POST', '/v1/sites/:slug/rollback', handleRollback);
register('GET', '/v1/audit', handleAudit);

function matchSegments(routeSegments: string[], pathSegments: string[]): Record<string, string> | null {
  if (routeSegments.length !== pathSegments.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < routeSegments.length; i++) {
    const segment = routeSegments[i];
    if (segment.startsWith(':')) {
      params[segment.slice(1)] = decodeURIComponent(pathSegments[i]);
    } else if (segment !== pathSegments[i]) {
      return null;
    }
  }
  return params;
}

function findRoute(method: string, pathname: string): { route: Route; params: Record<string, string> } {
  const pathSegments = pathname.split('/').filter(Boolean);
  const allowed = new Set<string>();
  for (const route of routes) {
    const params = matchSegments(route.segments, pathSegments);
    if (!params) continue;
    if (route.method === method) return { route, params };
    allowed.add(route.method);
  }
  if (allowed.size > 0) throw new MethodNotAllowedError(method, [...allowed].sort());
  throw new NotFoundError(`Route not found: ${pathname}`);
}

/**
 * IS THIS REQUEST ONE OF THE PUBLIC ROUTES? — asked of the table, never of a second list.
 *
 * The gate below has to answer "may this caller be told anything at all" BEFORE the
 * matcher runs, and the only public route is `GET /health`. Spelling that here as a
 * constant would be a second census of `routes` — this file's own version of the defect
 * the subsystem exists to delete — so it is derived: a request is public exactly when some
 * registered route with `public: true` matches its method AND its path.
 *
 * METHOD INCLUDED, deliberately. `POST /health` is not the public route; it is an
 * unauthenticated caller asking what other verbs the daemon answers, which is precisely the
 * question the ordering below refuses.
 */
function isPublicRequest(method: string, pathname: string): boolean {
  const pathSegments = pathname.split('/').filter(Boolean);
  for (const route of routes) {
    if (!route.public) continue;
    if (route.method !== method) continue;
    if (matchSegments(route.segments, pathSegments)) return true;
  }
  return false;
}

/**
 * THE GATE RUNS BEFORE THE MATCHER, and that order is the property.
 *
 * It used to run after: `findRoute` threw first, so an unauthenticated caller who could
 * reach the socket got THREE distinguishable answers — 404 for a path that does not exist,
 * 401 for one that does, and 405 with an `Allow` header naming the real verbs of a route it
 * had merely guessed. That is a complete enumeration of this daemon's surface, handed out
 * for free, while both this file's header and `security/auth.ts` claimed the opposite.
 *
 * So the bearer is now checked against the request itself, and the route table is not
 * consulted at all until it passes. Every unauthenticated request that is not the one
 * public route gets the same 401, whatever it asked for. `tests/router.test.ts` proves it
 * by probing an unknown path, a known path, and a wrong method with no token and requiring
 * the three answers to be indistinguishable.
 */
export async function routeRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  let pathname = url.pathname;

  // Peel BASE_PATH so the route table stays deployment-independent.
  if (config.BASE_PATH && pathname.startsWith(config.BASE_PATH)) {
    pathname = pathname.slice(config.BASE_PATH.length) || '/';
  }

  try {
    // Auth gate: everything but the explicitly-public routes, BEFORE the path is matched.
    if (!isPublicRequest(req.method, pathname)) {
      requireBearer(req);
    }
    const { route, params } = findRoute(req.method, pathname);
    return await route.handler(req, params, url);
  } catch (error) {
    return problem(error);
  }
}
