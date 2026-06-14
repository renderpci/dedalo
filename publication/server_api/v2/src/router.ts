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
// never shadow them.
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

// Executes a route internally (used by /batch). Errors are converted to the
// same problem+json responses the HTTP surface produces.
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
  checkRateLimit(req);
  await validateApiKey(req);

  const url = new URL(req.url);
  let pathname = url.pathname;

  if (config.BASE_PATH && pathname.startsWith(config.BASE_PATH)) {
    pathname = pathname.slice(config.BASE_PATH.length) || '/';
  }

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
