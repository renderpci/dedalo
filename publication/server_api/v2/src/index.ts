import { config } from './config';
import { routeRequest } from './router';
import { applyCors, handleOptions } from './security/cors';
import { handleError } from './middleware/error-handler';
import { withTiming } from './middleware/timing';
import { withRequestId } from './middleware/request-id';
import { withCompression } from './middleware/compress';
import { logRequest } from './middleware/logger';
import { closePool } from './db/pool';
import { startRateLimitCleanup, stopRateLimitCleanup } from './security/rate-limiter';

const handler = withCompression(
  withTiming(
    withRequestId(async (req: Request): Promise<Response> => {
      if (req.method === 'OPTIONS') {
        return handleOptions();
      }

      try {
        const res = await routeRequest(req);
        return applyCors(res);
      } catch (error) {
        const errorRes = handleError(error);
        return applyCors(errorRes);
      }
    }),
  ),
);

startRateLimitCleanup();

const server = Bun.serve({
  port: config.PORT,
  hostname: config.HOST,
  maxRequestBodySize: config.MAX_BODY_SIZE,
  async fetch(req) {
    const start = performance.now();
    const res = await handler(req);
    const duration = performance.now() - start;
    logRequest(req, res, duration);
    return res;
  },
});

console.log(`Dédalo Publication API v2 running at http://${config.HOST}:${config.PORT}${config.BASE_PATH}`);
console.log(`Deployment mode: ${config.DEPLOYMENT_MODE}`);
console.log(`Documentation: http://${config.HOST}:${config.PORT}${config.BASE_PATH}/docs`);

async function shutdown(): Promise<void> {
  console.log('Shutting down...');
  server.stop();
  stopRateLimitCleanup();
  await closePool();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
