import { config } from './config';
import { routeRequest } from './router';
import { applyCors, handleOptions } from './security/cors';
import { handleError } from './middleware/error-handler';
import { withTiming } from './middleware/timing';
import { logRequest } from './middleware/logger';

const handler = withTiming(async (req: Request): Promise<Response> => {
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
});

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

process.on('SIGINT', () => {
  console.log('Shutting down...');
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down...');
  server.stop();
  process.exit(0);
});
