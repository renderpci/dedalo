/**
 * The routing table and the gate that runs in front of it.
 *
 * Routing is a hand-rolled segment matcher rather than a framework: the surface is a
 * couple of dozen fixed GET routes, and a matcher small enough to read in one sitting is
 * a matcher whose security properties can be argued about. Matching is exact-arity —
 * a route only matches a path with the same number of segments — with `:name` segments
 * captured as params. There is no wildcard, no optional segment and no regex route.
 *
 * Two things a reader should not have to discover the hard way:
 *
 *   - Every `:db` param is a *client-supplied database name*. The router does not vet it;
 *     each handler funnels it through assertKnownDb (the DB_NAMES allowlist in db/pool.ts)
 *     before it reaches a connection. The router's job is only to hand it over intact.
 *   - routeRequest is the choke point where rate limiting and API-key auth happen, and
 *     they happen BEFORE routing (see the note there).
 */

import { config } from './config';
import { handleApiIndex, handleDatabases } from './routes/discovery';
import { handleListTables, handleGetTable } from './routes/tables';
import { handleListRecords, handleGetRecord } from './routes/records';
import { handleTableSearch } from './routes/table-search';
import { handleTextFragments, handleAvFragments } from './routes/fragments';
import { handleAvIndexationFragment } from './routes/av-indexation-fragment';
import { handleBatch } from './routes/batch';
import {
  handleDocs,
  handleSwaggerUI,
  handleScalarUI,
  handleSwaggerAssets,
  handleScalarAssets,
  handleOpenApiSpec,
} from './routes/docs';
import { handleHealth } from './routes/health';
import { handleMcpRequest } from './mcp/server';
import { NotFoundError, MethodNotAllowedError } from './errors';
import { handleError } from './middleware/error-handler';
import { validateApiKey } from './security/auth';
import { checkRateLimit } from './security/rate-limiter';
import { noContent } from './utils/response';

export type RouteHandler = (
  req: Request,
  params: Record<string, string>,
  url: URL,
) => Promise<Response> | Response;

interface Route {
  method: string;
  segments: string[];
  handler: RouteHandler;
}

const routes: Route[] = [];

function register(method: 'GET' | 'POST', pattern: string, handler: RouteHandler): void {
  routes.push({ method, segments: pattern.split('/').filter(Boolean), handler });
}

// Static routes are registered before /:db routes so a database name can
// never shadow them. findRoute returns the FIRST route that matches, in this order, so
// registration order is the tie-breaker: a literal segment must get its chance before a
// `:db` capture does. No parameterised route currently shares an arity with a literal
// one, so nothing collides today — the ordering is what keeps that true as routes are
// added, rather than a fix for a live collision.
register('GET', '/', handleApiIndex);
register('GET', '/databases', handleDatabases);
register('GET', '/health', handleHealth);
register('POST', '/batch', handleBatch);
register('GET', '/docs', handleDocs);
register('GET', '/docs/swagger', handleSwaggerUI);
register('GET', '/docs/scalar', handleScalarUI);
register('GET', '/openapi.yaml', handleOpenApiSpec);
register('GET', '/favicon.ico', () => noContent());
register('GET', '/:db/tables', handleListTables);
register('GET', '/:db/tables/:table', handleGetTable);
register('GET', '/:db/tables/:table/records', handleListRecords);
register('GET', '/:db/tables/:table/records/:id', handleGetRecord);
register('GET', '/:db/tables/:table/records/:id/fragments', handleTextFragments);
register('GET', '/:db/tables/:table/records/:id/av-fragments', handleAvFragments);
register('GET', '/:db/tables/:table/search', handleTableSearch);
register('GET', '/:db/av-indexation-fragment', handleAvIndexationFragment);

// Only captured params are percent-decoded; literal segments are compared raw. Decoding
// the whole path before splitting would let an encoded %2F conjure an extra segment and
// match a route the caller never spelled out.
function matchSegments(routeSegments: string[], pathSegments: string[]): Record<string, string> | null {
  if (routeSegments.length !== pathSegments.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < routeSegments.length; i++) {
    const routeSegment = routeSegments[i];
    if (routeSegment.startsWith(':')) {
      params[routeSegment.slice(1)] = decodeURIComponent(pathSegments[i]);
    } else if (routeSegment !== pathSegments[i]) {
      return null;
    }
  }
  return params;
}

/**
 * Resolves a method+path to a handler, or throws the problem that describes why it could not.
 *
 * The loop keeps scanning after a path matches on the wrong method, because that is exactly
 * what distinguishes the two failures: a path that matches some route but no route with this
 * method is a 405 (and RFC 9110 requires the Allow header, which is why the other methods are
 * collected as it goes), whereas a path that matches nothing at all is a 404. Bailing out at
 * the first path match would leave the Allow list incomplete when a path carries more than
 * one method.
 */
export function findRoute(method: string, pathname: string): { handler: RouteHandler; params: Record<string, string> } {
  const pathSegments = pathname.split('/').filter(Boolean);
  const allowedMethods = new Set<string>();

  for (const route of routes) {
    const params = matchSegments(route.segments, pathSegments);
    if (!params) continue;

    if (route.method === method) {
      return { handler: route.handler, params };
    }
    allowedMethods.add(route.method);
  }

  if (allowedMethods.size > 0) {
    throw new MethodNotAllowedError(method, [...allowedMethods].sort());
  }
  throw new NotFoundError(`Route not found: ${pathname}`);
}

/**
 * Executes a route internally (used by /batch). Errors are converted to the
 * same problem+json responses the HTTP surface produces.
 *
 * This re-enters the routing table in-process — no socket, no HTTP hop — so a batch of 20
 * reads costs 20 handler calls and not 20 connections back to ourselves. The synthetic
 * origin is a placeholder that exists only so `new URL` has something absolute to resolve
 * against; nothing reads the host.
 *
 * Two consequences of the in-process shortcut, both deliberate:
 *   - It runs BELOW routeRequest, so the sub-query is neither rate-limited nor
 *     key-checked here. That is not a hole: the enclosing /batch request already passed
 *     both, and handleBatch charges the fan-out against the same bucket (chargeRateLimit)
 *     so a batch cannot be used to multiply a quota.
 *   - Errors are caught and rendered here rather than propagated, which is what lets
 *     executeBatch report a failed sub-query as an inline problem body while its siblings
 *     still return their data. A throw would take the whole batch down with it.
 */
export async function dispatch(method: string, pathAndQuery: string): Promise<Response> {
  const url = new URL(pathAndQuery, 'http://batch.internal');
  const req = new Request(url.toString(), { method });

  try {
    const { handler, params } = findRoute(method, url.pathname);
    return await handler(req, params, url);
  } catch (error) {
    return handleError(error, req);
  }
}

export async function routeRequest(req: Request): Promise<Response> {
  // Metering and authentication run BEFORE the path is even looked at, so the cost of an
  // unauthenticated request is bounded by the cheapest possible work: a Map lookup and a
  // constant-time key compare. It also means the route table is not an oracle — probing for
  // which paths exist costs a token and still needs a key, since 404 and 200 are both
  // reached only after these two have passed.
  checkRateLimit(req);
  await validateApiKey(req);

  const url = new URL(req.url);
  let pathname = url.pathname;

  // The routing table is written in deployment-independent terms (`/databases`, not
  // `/publication/server_api/v2/databases`). BASE_PATH — the subpath Apache or nginx mounts
  // us under — is peeled off here, once, so relocating the API never touches a route.
  if (config.BASE_PATH && pathname.startsWith(config.BASE_PATH)) {
    pathname = pathname.slice(config.BASE_PATH.length) || '/';
  }

  // MCP and the doc assets are handled ahead of findRoute because they are not exact-arity
  // segment matches: MCP_PATH is configurable (it need not be a single segment), and the
  // vendored Swagger/Scalar bundles are an open-ended prefix of files that no fixed route
  // could enumerate.
  if (config.MCP_ENABLED && pathname === config.MCP_PATH) {
    return handleMcpRequest(req);
  }

  if (pathname.startsWith('/docs/swagger/') && pathname !== '/docs/swagger/') {
    return handleSwaggerAssets(req);
  }
  if (pathname.startsWith('/docs/scalar/') && pathname !== '/docs/scalar/') {
    return handleScalarAssets(req);
  }

  const { handler, params } = findRoute(req.method, pathname);
  return handler(req, params, url);
}
