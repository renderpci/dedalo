/**
 * The wall-clock bound on a request: past REQUEST_TIMEOUT_MS the caller gets a 504 instead of
 * an open connection. Set REQUEST_TIMEOUT_MS=0 to disable it.
 *
 * READ THIS BEFORE TRUSTING IT: a Promise.race only ABANDONS the loser, it cannot cancel it.
 * The handler keeps running to completion — still holding its pooled connection, still waiting
 * on its statement — and only its result is discarded. This bounds what the *client* waits for,
 * not what the *server* does. The bound that actually stops a runaway statement is the per-query
 * timeout in the DB layer; the two are meant to be read together (see the "Denial-of-service
 * bounds" table in docs/diffusion/publication_api/v2/security.md).
 */

import { config } from '../config';
import { TimeoutError } from '../errors';

// The MCP endpoint is exempt: its reply is a `text/event-stream` that stays open for the life
// of an agent's JSON-RPC exchange, so a deadline would not bound a hang — it would guillotine
// a healthy session. The BASE_PATH strip mirrors the router's, since MCP_PATH is a route path.
function isStreamingPath(req: Request): boolean {
  if (!config.MCP_ENABLED) return false;
  try {
    const url = new URL(req.url);
    let pathname = url.pathname;
    if (config.BASE_PATH && pathname.startsWith(config.BASE_PATH)) {
      pathname = pathname.slice(config.BASE_PATH.length) || '/';
    }
    return pathname === config.MCP_PATH;
  } catch {
    return false;
  }
}

/**
 * Run `run()` under the deadline. The rejection is a TimeoutError, so it lands in the normal
 * error handler and the client sees the standard problem+json 504 — a timeout is not a special
 * case on the wire.
 */
export async function raceWithTimeout(req: Request, run: () => Promise<Response>): Promise<Response> {
  if (config.REQUEST_TIMEOUT_MS <= 0 || isStreamingPath(req)) {
    return run();
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError()), config.REQUEST_TIMEOUT_MS);
      }),
    ]);
  } finally {
    // Whoever won, the timer is dead weight: without this, every fast request would leave a
    // pending timeout behind for the length of the deadline.
    clearTimeout(timer);
  }
}
