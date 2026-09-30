/**
 * THE EGRESS SHIM — every confined unit's ExecStart (LEAD-1).
 *
 * `confinement.ts` never hands PID 1 the driver's (or the build step's, or git's) argv
 * directly. The unit runs `<bun> egress_shim.ts -- <argv…>`, and this file does three things,
 * in this order, and holds NO policy of its own (the policy is the unit's properties,
 * `network_profile.ts`):
 *
 *   1. PROVES THE NAMESPACE. `PrivateNetwork=yes` is a request, not a guarantee: a host that
 *      cannot create a network namespace (a container without CAP_SYS_ADMIN, an old kernel)
 *      silently runs the unit on the HOST's network — where the `IPAddressAllow=localhost`
 *      backstop is the host's own loopback: Postgres, the engine, every museum's daemon. So
 *      unless this process is PROVABLY in a different namespace from the daemon's (the
 *      identity the confinement states in the env — absent or unreadable is not "different")
 *      AND every interface visible here is internal, it writes
 *      `[confinement] network namespace not in effect` and exits 78 (EX_CONFIG). The child is
 *      never spawned: fail closed, per run.
 *   2. FORWARDS the unit's loopback to the gate: `127.0.0.1:PROXY_PORT` → `proxy.sock` and
 *      `127.0.0.1:MCP_PORT` → `mcp.sock` (only when the gate serves one), bytes only, so the
 *      agent's ordinary `HTTPS_PROXY` and its http MCP configuration keep working inside the
 *      namespace. A door with no socket directory (git) gets no forwards.
 *   3. RUNS the argv with inherited stdio in the run's real working directory, relays SIGTERM
 *      and SIGINT, and exits with the child's code.
 *
 * WHY THE UNIT'S OWN WORKING DIRECTORY IS `/`, AND THE WORKSPACE ARRIVES AS
 * `DEDALO_UNIT_WORKDIR`. Bun reads `bunfig.toml` (whose `preload` EXECUTES CODE), `.env` and
 * `tsconfig.json` from its cwd before it runs a single line of this file — and the workspace
 * is the directory the agent writes. Started there, the check in step 1 would be one
 * `bunfig.toml` away from never running. Started in `/` (root-owned, read-only under
 * `ProtectSystem=strict`), the shim loads nothing the agent authored; the CHILD then runs in
 * the workspace, where agent-authored configuration is the agent's own business.
 *
 * IT IS PID 1. Every unit has its own PID namespace (`PrivatePIDs=yes`, network_profile.ts),
 * and the unit's first process is this shim. Two consequences, both deliberate: a signal
 * reaches PID 1 only when it has a handler, so SIGTERM and SIGINT are HANDLED here and relayed
 * (systemd's stop also signals every process of the unit's cgroup directly); and when this
 * process exits the kernel kills whatever the child left running in the namespace, so a run
 * leaves nothing behind. Orphaned grandchildren re-parent to the shim, which reaps nothing —
 * they stay zombies (counted by TasksMax) until the run ends.
 *
 * Node builtins and the leaf's constants only: no config (it does not exist inside the unit).
 */

import { spawn } from 'node:child_process';
import { existsSync, readlinkSync } from 'node:fs';
import { connect, createServer, type Server } from 'node:net';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import {
  EGRESS_MOUNT,
  HOST_NETNS_ENV,
  MCP_PORT,
  MCP_SOCKET,
  PROXY_PORT,
  PROXY_SOCKET,
  WORKDIR_ENV,
} from './network_profile';

type Interfaces = Record<string, ReadonlyArray<{ readonly internal: boolean }> | undefined>;

/** EX_CONFIG: the unit is not configured the way this host was told it would be. */
export const EXIT_NO_NAMESPACE = 78;

/**
 * True when every interface this process can see is internal — i.e. only a netns's own `lo`.
 * An EMPTY answer is not "no host interface": a namespace always has its `lo`, and nothing
 * at all is what a failed enumeration looks like — so it is refused, never read as proof.
 */
export function checkNamespace(interfaces: Interfaces = networkInterfaces()): boolean {
  const lists = Object.values(interfaces).map(addresses => addresses ?? []);
  if (!lists.some(addresses => addresses.length > 0)) return false;
  return lists.every(addresses => addresses.every(address => address.internal));
}

/** This process's network namespace identity (`net:[<inode>]`) — Linux only. */
function ownNetns(): string {
  return readlinkSync('/proc/self/ns/net');
}

export interface ShimSeams {
  readonly interfaces?: () => Interfaces;
  readonly socketDir?: string;
  readonly ports?: { readonly proxy: number; readonly mcp: number };
  readonly stderr?: (text: string) => void;
  readonly workdir?: string;
  /** The DAEMON's namespace identity (default: the env the confinement wrote). */
  readonly hostNetns?: string;
  /** This process's namespace identity (default: /proc/self/ns/net). */
  readonly ownNetns?: () => string;
}

/** A loopback TCP listener that pumps each connection to a unix socket, bytes only. */
function forward(port: number, socketPath: string): Promise<Server> {
  const server = createServer(client => {
    const upstream = connect(socketPath);
    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
    client.pipe(upstream);
    upstream.pipe(client);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

export async function main(argv: readonly string[], seams: ShimSeams = {}): Promise<number> {
  const stderr = seams.stderr ?? ((text: string) => void process.stderr.write(text));
  // `bun <shim> -- a b` hands the script `a b` (bun consumes the separator); a caller that
  // passes it through, as the gates do, is accepted too.
  const command = argv[0] === '--' ? argv.slice(1) : [...argv];
  if (command.length === 0) {
    stderr('[confinement] egress shim: no command after --\n');
    return 64;
  }

  // TWO proofs, and either failing refuses. The IDENTITY: the confinement states the
  // daemon's own namespace (`net:[inode]`), and a unit still in it is on the host's network
  // whatever its interfaces look like — a host whose only interface is `lo` still has
  // Postgres on it. The INTERFACES: nothing but internal ones may be visible. A proof that
  // cannot be taken (an enumeration or a readlink that fails) is a refusal, never a pass.
  // The identity is MANDATORY: an env file without it (a daemon that could not read its own
  // namespace, an older renderer) is a proof that was not taken, never an absent check.
  const hostNetns = seams.hostNetns ?? process.env[HOST_NETNS_ENV] ?? '';
  let identity: 'differs' | 'same' | 'unknown' = 'unknown';
  if (hostNetns !== '') {
    try {
      identity = (seams.ownNetns ?? ownNetns)() === hostNetns ? 'same' : 'differs';
    } catch {
      identity = 'unknown';
    }
  }
  let isolated = false;
  try {
    isolated = checkNamespace((seams.interfaces ?? networkInterfaces)());
  } catch {
    isolated = false;
  }
  if (identity !== 'differs' || !isolated) {
    const why =
      identity === 'same'
        ? 'shares the daemon’s network namespace'
        : identity === 'unknown'
          ? `cannot prove it is not in the daemon’s network namespace (no ${HOST_NETNS_ENV}, or its own identity is unreadable)`
          : 'can see a host interface (or none at all)';
    stderr(
      `[confinement] network namespace not in effect: this unit ${why}, so PrivateNetwork= may ` +
        'not have been honoured and its loopback would be the HOST’s. Nothing was run.\n',
    );
    return EXIT_NO_NAMESPACE;
  }

  const socketDir = seams.socketDir ?? EGRESS_MOUNT;
  const ports = seams.ports ?? { proxy: PROXY_PORT, mcp: MCP_PORT };
  const servers: Server[] = [];
  const stopForwards = () => {
    for (const server of servers) server.close();
  };
  if (existsSync(socketDir)) {
    const routes: Array<[number, string]> = [[ports.proxy, join(socketDir, PROXY_SOCKET)]];
    if (existsSync(join(socketDir, MCP_SOCKET))) routes.push([ports.mcp, join(socketDir, MCP_SOCKET)]);
    try {
      for (const [port, path] of routes) servers.push(await forward(port, path));
    } catch (error) {
      stopForwards();
      stderr(`[confinement] egress shim: cannot listen on the unit loopback (${String(error)}). Nothing was run.\n`);
      return 71;
    }
  }

  const env = { ...process.env };
  const workdir = seams.workdir ?? env[WORKDIR_ENV] ?? process.cwd();
  delete env[WORKDIR_ENV];
  delete env[HOST_NETNS_ENV];

  return new Promise<number>(resolve => {
    const child = spawn(command[0] as string, command.slice(1), { cwd: workdir, env, stdio: 'inherit' });
    const relay = (signal: NodeJS.Signals) => () => {
      child.kill(signal);
    };
    const onTerm = relay('SIGTERM');
    const onInt = relay('SIGINT');
    process.on('SIGTERM', onTerm);
    process.on('SIGINT', onInt);
    const finish = (code: number) => {
      process.off('SIGTERM', onTerm);
      process.off('SIGINT', onInt);
      stopForwards();
      resolve(code);
    };
    child.once('error', error => {
      stderr(`[confinement] egress shim: cannot run '${command[0]}' (${error.message})\n`);
      finish(127);
    });
    child.once('exit', (code, signal) => {
      finish(code ?? 128 + (signal === 'SIGKILL' ? 9 : signal === 'SIGINT' ? 2 : 15));
    });
  });
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
