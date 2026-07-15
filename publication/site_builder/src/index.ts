/**
 * Process entrypoint: the Bun.serve boundary.
 *
 * Deliberately thin. The publication API's index.ts carries a middleware stack (caching,
 * compression, rate limiting) because it is a public read surface; this daemon's only
 * client is the engine over a trusted channel, so it needs none of that. What it needs is
 * the routing gate (router.ts owns auth), a top-level catch so nothing escapes as a bare
 * 500, request logging, and a graceful shutdown that lets in-flight agent turns and the
 * SSE streams (P1) settle.
 */

import { config } from './config';
import { routeRequest } from './router';
import { problem } from './util/response';
import { sweepOnBoot } from './sessions/manager';

// Reconcile sessions left 'running' by a previous process (a crash or a restart): mark
// them interrupted and commit any uncommitted work as a recovery point. Runs before the
// first request so a reconnecting client sees honest state.
await sweepOnBoot().catch(error => console.error('[boot] session sweep failed:', error));

const server = Bun.serve({
  port: config.PORT,
  hostname: config.HOST,
  // Bodies here are small JSON envelopes (a prompt, an actor). 256 KiB is generous and
  // caps a hostile body cheaply.
  maxRequestBodySize: 256 * 1024,
  // Turns and their SSE streams run long; do not let Bun's idle timer cut them. The
  // per-turn wall clock (SESSION_TURN_TIMEOUT_MS) is the real bound.
  idleTimeout: 0,
  async fetch(req): Promise<Response> {
    const start = performance.now();
    let res: Response;
    try {
      res = await routeRequest(req);
    } catch (error) {
      // router.ts already renders known errors; this is the last-resort net.
      res = problem(error);
    }
    logRequest(req, res, performance.now() - start);
    return res;
  },
});

function logRequest(req: Request, res: Response, durationMs: number): void {
  if (config.LOG_LEVEL === 'error' && res.status < 500) return;
  const url = new URL(req.url);
  console.log(`${req.method} ${url.pathname} ${res.status} ${durationMs.toFixed(1)}ms`);
}

console.log(`Dédalo Site Builder running at http://${config.HOST}:${config.PORT}${config.BASE_PATH}`);
console.log(`Deployment mode: ${config.DEPLOYMENT_MODE}`);
console.log(`Default driver: ${config.AGENT_DRIVER}`);
console.log(`Sites root: ${config.SITES_ROOT}`);

async function shutdown(): Promise<void> {
  console.log('Shutting down...');
  // stop(false): let in-flight requests (agent turns, SSE) finish rather than cutting
  // them. The OS/systemd TimeoutStopSec is the hard backstop.
  server.stop(false);
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
