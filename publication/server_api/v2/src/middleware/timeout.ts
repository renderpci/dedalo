import { config } from '../config';
import { TimeoutError } from '../errors';

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

// Bounds request handling time. The race abandons (does not cancel) in-flight
// work; DB-side runaway is bounded separately by the per-query timeout.
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
    clearTimeout(timer);
  }
}
