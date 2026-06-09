import { config } from './config';
import { handleSchema } from './routes/schema';
import { handleSearch } from './routes/search';
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
import { HttpError } from './errors';
import { validateApiKey } from './security/auth';
import { checkRateLimit } from './security/rate-limiter';
import { noContent } from './utils/response';

type RouteHandler = (req: Request) => Promise<Response>;

const routes: Record<string, RouteHandler> = {
  '/schema': handleSchema,
  '/search': handleSearch,
  '/av-indexation-fragment': handleAvIndexationFragment,
  '/batch': handleBatch,
  '/docs': handleDocs,
  '/docs/swagger': handleSwaggerUI,
  '/docs/scalar': handleScalarUI,
  '/openapi.yaml': handleOpenApiSpec,
  '/health': handleHealth,
  '/favicon.ico': async () => noContent(),
};

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

  const handler = routes[pathname];
  if (!handler) {
    throw new HttpError(404, `Route not found: ${pathname}`);
  }

  return handler(req);
}