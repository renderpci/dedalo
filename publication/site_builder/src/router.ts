/**
 * The routing table and the gate in front of it.
 *
 * Same hand-rolled exact-arity matcher as the publication API (small enough to read in
 * one sitting, so its security properties can be argued about). The gate is different in
 * one load-bearing way: EVERY route except /health requires the bearer token, checked
 * before the path is matched — an unauthenticated probe learns nothing about which routes
 * exist. This daemon has no anonymous surface.
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

export async function routeRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  let pathname = url.pathname;

  // Peel BASE_PATH so the route table stays deployment-independent.
  if (config.BASE_PATH && pathname.startsWith(config.BASE_PATH)) {
    pathname = pathname.slice(config.BASE_PATH.length) || '/';
  }

  try {
    const { route, params } = findRoute(req.method, pathname);
    // Auth gate: everything but the explicitly-public /health.
    if (!route.public) {
      requireBearer(req);
    }
    return await route.handler(req, params, url);
  } catch (error) {
    return problem(error);
  }
}
