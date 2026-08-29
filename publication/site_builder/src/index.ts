/**
 * Process entrypoint: the preflight, then the Bun.serve boundary.
 *
 * Deliberately thin. The publication API's index.ts carries a middleware stack (caching,
 * compression, rate limiting) because it is a public read surface; this daemon's only client
 * is the engine over a trusted channel, so it needs none of that. What it needs is the boot
 * preflight, the routing gate (router.ts owns auth), a top-level catch so nothing escapes as
 * a bare 500, request logging, and a shutdown that actually lets in-flight agent turns and
 * SSE streams settle.
 *
 * THE PREFLIGHT IS THE FIRST STATEMENT IN THIS FILE, and that placement is the whole point:
 * `sweepOnBoot()` below WRITES — it commits recovered work and rewrites session metadata at
 * module evaluation. A check that runs after it has already let a daemon pointed at the
 * wrong tree touch that tree. See src/instance/roots.ts.
 */

import { chmodSync, existsSync, unlinkSync } from 'node:fs';
import { config } from './config';
import { bootPreflight } from './instance/roots';
import { routeRequest } from './router';
import { problem } from './util/response';
import { interruptLiveTurns, sweepOnBoot } from './sessions/manager';

// PROVE WHO WE ARE BEFORE WRITING ANYTHING. Synchronous, and above every await below.
//
// The refusal is printed as one line and the process exits 1 — the same shape as an invalid
// configuration (src/config.ts). An uncaught throw would work too, but what systemd's
// journal would then hold is a stack trace with the sentence an operator needs buried in the
// middle of it; these messages are written to be read by the person who has to fix the host.
try {
  bootPreflight();
} catch (error) {
  console.error(`[preflight] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

// Reconcile sessions left 'running' by a previous process (a crash or a restart): mark them
// interrupted and commit any uncommitted work as a recovery point. Runs before the first
// request so a reconnecting client sees honest state.
await sweepOnBoot().catch(error => console.error('[boot] session sweep failed:', error));

/**
 * WHERE THIS DAEMON LISTENS.
 *
 * A unix socket by default, because that is what the provisioner renders and what the engine
 * is told to dial: the socket is 0660 <service user>:<engine group>, so the engine reaches it
 * by GROUP-OWNING it and no other uid on the host — another museum's service user included —
 * can connect at all. A TCP listener has no such property, so `tcp` is for a laptop, where
 * there is no systemd to own a runtime directory.
 */
const listenTarget = await resolveListenTarget();

/** Everything about serving that does not depend on WHERE we listen. */
const serveBehaviour = {
  // Bodies here are small JSON envelopes (a prompt, an actor). 256 KiB is generous and caps
  // a hostile body cheaply.
  maxRequestBodySize: 256 * 1024,
  // Turns and their SSE streams run long; do not let Bun's idle timer cut them. The per-turn
  // wall clock (SESSION_TURN_TIMEOUT_MS) is the real bound.
  idleTimeout: 0,
  async fetch(req: Request): Promise<Response> {
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
};

/**
 * Two calls rather than one spread: Bun types a unix listener and a host:port listener as
 * mutually exclusive option shapes, and a daemon that can only be reached one way should
 * say so in the code as plainly as it says so in the unit.
 *
 * THE CAST IS A TYPING GAP, NOT A LOOSENING. `idleTimeout` is declared on Bun's host:port
 * option shape only, while the runtime honours it for a unix listener too. Dropping it to
 * satisfy the types would put Bun's 10-second idle timer back in front of agent turns that
 * legitimately run for minutes — a timeout deleting a museum's turn to keep a type checker
 * quiet. The value passed is the same object the tcp branch passes, one line below, so the
 * two listeners cannot drift.
 */
type ServeOptions = Parameters<typeof Bun.serve>[0];
const server =
  'unix' in listenTarget
    ? Bun.serve({ ...serveBehaviour, unix: listenTarget.unix } as unknown as ServeOptions)
    : Bun.serve({ ...serveBehaviour, port: listenTarget.port, hostname: listenTarget.hostname });

if (config.LISTEN_KIND === 'unix') {
  // 0660 EXPLICITLY, not by umask. The unit's UMask=0027 would produce 0640 and the engine
  // could read but not write; the socket's mode IS the pairing, so it is stated once, here,
  // immediately after the bind (src/provision/render/unit.ts says so from the other side).
  chmodSync(config.LISTEN_SOCKET, 0o660);
}

function logRequest(req: Request, res: Response, durationMs: number): void {
  if (config.LOG_LEVEL === 'error' && res.status < 500) return;
  const url = new URL(req.url);
  console.log(`${req.method} ${url.pathname} ${res.status} ${durationMs.toFixed(1)}ms`);
}

const where =
  config.LISTEN_KIND === 'unix'
    ? `unix socket ${config.LISTEN_SOCKET} (mounted at ${config.BASE_PATH})`
    : `http://${config.HOST}:${config.PORT}${config.BASE_PATH}`;
console.log(`Dédalo Site Builder (instance '${config.DEDALO_SITE_INSTANCE}') listening on ${where}`);
console.log(`Deployment mode: ${config.DEPLOYMENT_MODE}`);
console.log(`Default driver: ${config.AGENT_DRIVER}`);
console.log(`Workspaces: ${config.SITES_ROOT}`);
// The served side, which is not under the workspaces root and never may be: each site
// publishes into its OWN webspace under this base (src/sites/webspace.ts).
console.log(`Webspaces:  ${config.WEBSPACE_BASE}`);

/**
 * The socket, and the one stale-socket question worth asking.
 *
 * `/run` is a tmpfs the unit's RuntimeDirectory= owns, so a socket file left behind means the
 * previous process died without systemd cleaning up after it. Unlinking it blindly would be
 * wrong in the one case that matters — a daemon of this instance still running and serving
 * the engine — so we ASK: a socket that accepts a connection is live and this process
 * refuses; one that does not is a corpse and is removed.
 */
async function resolveListenTarget(): Promise<{ unix: string } | { port: number; hostname: string }> {
  if (config.LISTEN_KIND !== 'unix') {
    return { port: config.PORT, hostname: config.HOST };
  }
  const path = config.LISTEN_SOCKET;
  if (!path) {
    console.error(
      `[listen] LISTEN_KIND=unix but LISTEN_SOCKET is empty, so there is nowhere to bind. ` +
        `A provisioned host is told both by its generated env; set LISTEN_KIND=tcp for a ` +
        `local run. Nothing was started.`,
    );
    process.exit(1);
  }
  if (existsSync(path)) {
    if (await socketAcceptsConnections(path)) {
      console.error(
        `[listen] '${path}' is already accepting connections — instance ` +
          `'${config.DEDALO_SITE_INSTANCE}' is already being served by another process. Two ` +
          `daemons on one instance would both write its workspaces. Nothing was started.`,
      );
      process.exit(1);
    }
    unlinkSync(path);
  }
  return { unix: path };
}

async function socketAcceptsConnections(path: string): Promise<boolean> {
  try {
    const socket = await Bun.connect({ unix: path, socket: { data() {}, open() {}, error() {} } });
    socket.end();
    return true;
  } catch {
    return false;
  }
}

/**
 * SHUTDOWN, AS THE UNIT ALREADY PROMISES IT.
 *
 * The generated unit says `KillSignal=SIGTERM` and `TimeoutStopSec=30` because "SIGTERM lets
 * in-flight agent turns and SSE streams drain first" — and this file used to call
 * `server.stop(false)` and `process.exit(0)` on the very next line, which drains nothing:
 * `stop(false)` only asks the server to stop ACCEPTING, and the exit that follows cuts every
 * request that was still running, mid-turn, with the session left marked 'running' on disk
 * for the next boot's sweep to discover.
 *
 * So: stop accepting, WAIT for the in-flight requests to finish within a grace shorter than
 * the unit's own stop timeout (systemd must never have to SIGKILL us — that is the case where
 * nothing gets marked at all), then mark whatever is still live as INTERRUPTED so the record
 * is honest, remove the socket, and exit.
 */
const SHUTDOWN_GRACE_MS = 25_000; // < the unit's TimeoutStopSec=30
const DRAIN_POLL_MS = 100;

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return; // a second SIGTERM must not race the first one's cleanup
  shuttingDown = true;
  console.log(`[shutdown] ${signal}: draining (up to ${SHUTDOWN_GRACE_MS} ms)…`);

  server.stop(false);

  const deadline = Date.now() + SHUTDOWN_GRACE_MS;
  while (server.pendingRequests > 0 && Date.now() < deadline) {
    await Bun.sleep(DRAIN_POLL_MS);
  }
  if (server.pendingRequests > 0) {
    console.warn(
      `[shutdown] ${server.pendingRequests} request(s) still in flight after the grace ` +
        `period; they are being cut.`,
    );
  }

  // Whatever is still running is not going to finish. Say so in the record rather than
  // leaving it 'running' for the next boot to guess about.
  const interrupted = await interruptLiveTurns().catch((error: unknown) => {
    console.error('[shutdown] could not mark live turns interrupted:', error);
    return 0;
  });
  if (interrupted > 0) console.log(`[shutdown] marked ${interrupted} live turn(s) interrupted`);

  if (config.LISTEN_KIND === 'unix' && config.LISTEN_SOCKET && existsSync(config.LISTEN_SOCKET)) {
    // systemd removes the RuntimeDirectory on stop, but a `bun run` on a laptop has nobody
    // to do it — and a leftover socket is what the next start has to reason about.
    try {
      unlinkSync(config.LISTEN_SOCKET);
    } catch (error) {
      console.error('[shutdown] could not remove the socket:', error);
    }
  }

  console.log('[shutdown] done');
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
