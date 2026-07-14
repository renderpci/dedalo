/**
 * Process entrypoint: the Bun.serve boundary and the middleware composition.
 *
 * The composition ORDER below is load-bearing, not stylistic. Middlewares here are
 * plain handler wrappers, so the request travels inward through them and the response
 * travels back outward in reverse. Reading the chain from the outside in:
 *
 *   withCompression → withTiming → withRequestId → withHttpCache → (routing)
 *
 * Which means on the way OUT the response passes: http-cache → request-id → timing →
 * compression. Two invariants fall out of that and would break if the layers were
 * reordered:
 *
 *   1. Compression is OUTERMOST, so the ETag layer only ever sees the uncompressed
 *      body. One resource therefore hashes to one ETag no matter which encoding the
 *      client negotiated — put compression inside, and gzip and identity clients would
 *      be handed different validators for identical data.
 *   2. Timing is OUTSIDE the ETag layer, so `response_time_ms` (which by definition
 *      differs on every request) is injected into the body only after the ETag has been
 *      computed. Inside, it would re-randomise the hash on every request and conditional
 *      revalidation (If-None-Match → 304) could never hit.
 *
 * A 304 is minted in the innermost layer with an empty body; the outer layers only add
 * headers to it (compress explicitly passes 204/304 through), so it stays bodiless. Note
 * the ETag saves bandwidth, not work: the body was fully generated before it was hashed.
 */

import { config } from './config';
import { routeRequest } from './router';
import { applyCors, handleOptions } from './security/cors';
import { handleError } from './middleware/error-handler';
import { withTiming } from './middleware/timing';
import { withRequestId } from './middleware/request-id';
import { withCompression } from './middleware/compress';
import { withHttpCache } from './middleware/http-cache';
import { raceWithTimeout } from './middleware/timeout';
import { logRequest } from './middleware/logger';
import { closePools } from './db/pool';
import { startRateLimitCleanup, stopRateLimitCleanup } from './security/rate-limiter';
import { setSocketIp } from './security/client-ip';

// ETag is computed on the uncompressed body (inside withCompression);
// a 304 short-circuits before compression.
const handler = withCompression(
  withTiming(
    withRequestId(
      withHttpCache(async (req: Request): Promise<Response> => {
        // A CORS preflight is answered here, short of routeRequest, so it is neither
        // rate-limited nor asked for an API key: the browser sends it unprompted and
        // cannot attach credentials to it, so charging or rejecting it would only break
        // legitimate cross-origin clients.
        if (req.method === 'OPTIONS') {
          return handleOptions();
        }

        // The single catch-all: routeRequest and every handler under it signal failure by
        // throwing (ApiError subclasses, or a ZodError from a validator), and handleError
        // is what turns that into the RFC 9457 problem+json body. CORS headers are applied
        // to the error response too — an error a browser cannot read is a mystery, not a
        // diagnostic.
        try {
          const res = await raceWithTimeout(req, () => routeRequest(req));
          return applyCors(res);
        } catch (error) {
          const errorRes = handleError(error, req);
          return applyCors(errorRes);
        }
      }),
    ),
  ),
);

// The limiter's per-IP buckets are an in-memory Map; without this sweep an IP that
// calls once and never returns would keep its bucket for the life of the process.
startRateLimitCleanup();

const server = Bun.serve({
  port: config.PORT,
  hostname: config.HOST,
  maxRequestBodySize: config.MAX_BODY_SIZE,
  async fetch(req, server) {
    // The peer address is only reachable from the server, and only here — capture it
    // before the middleware chain so the rate limiter can bucket per client even when
    // there is no proxy in front of us (see security/client-ip.ts).
    setSocketIp(req, server.requestIP(req)?.address);

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

// Both signals drain the same way: stop accepting, drop the interval that would keep the
// loop alive, and hand the MariaDB connections back before exiting. Leaving pools open on
// a restart loop is how a read-only user runs out of its connection quota.
async function shutdown(): Promise<void> {
  console.log('Shutting down...');
  server.stop();
  stopRateLimitCleanup();
  await closePools();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
