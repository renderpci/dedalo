/**
 * THE EGRESS GATE — the one door a confined run speaks to the outside through (LEAD-1).
 *
 * A confined turn or build lives in a private network namespace with `/run` masked
 * (`drivers/network_profile.ts`); the ONLY thing it can open is its own per-run directory,
 * bound in at `/run/dedalo-egress`. This module serves that directory, from the daemon's side,
 * for exactly as long as the run lives:
 *
 *   - `proxy.sock` — an HTTP CONNECT proxy. It accepts ONE `CONNECT <host>:443` per
 *     connection, for a host on the run's plan ONLY (hostnames, never an IP literal), resolves
 *     it ONCE, refuses the whole host if ANY answer is not a public address (DNS rebinding, a
 *     CNAME into a private range — `public_address.ts`, pinned to the engine's SSRF guard), and
 *     dials exactly the vetted addresses, in the resolver's order, until one connects. It
 *     never re-resolves at dial time, never follows a second request on the connection, and
 *     speaks no other method. Once the tunnel is up, NOT ONE BYTE goes upstream until the
 *     client's first flight has been read as a TLS ClientHello whose SNI is the CONNECT host
 *     (and that carries no Encrypted Client Hello): a plan host on a shared CDN is otherwise
 *     a CONNECT to that CDN's edge and a TLS session to ANY site behind it. What the gate
 *     cannot see is the Host inside the encrypted session — SITE_BUILDER_INSTANCES §10 (6f).
 *   - AT MOST `MAX_PROXY_CLIENTS` connections per run at once (pending and tunnelled alike):
 *     each is the DAEMON's fd and buffer, which the unit's own caps do not bound. Above it a
 *     connection is a 503 and one log line, and nothing is resolved or dialled.
 *   - THE PLAN is hostnames only, and the gate REFUSES to open on anything else (an IP
 *     literal, a wildcard, a local special-use name — `hostProblem`, the same grammar the
 *     config parse and the provisioner hold): a plan is not trusted to have been built right.
 *   - `mcp.sock` (turns only) — a FIXED reverse proxy to `${PUBLICATION_API_URL}/mcp`. The
 *     client's path, query, Host and credentials are ignored; the museum's Publication API key
 *     is added HERE, on the daemon's side, so it never enters the unit. Request and response
 *     headers are allowlisted, a redirect is a 502 (never followed), and the body is streamed
 *     (SSE works).
 *
 * Every destination accepted or refused is one line in the run's own log (`sink`): a blocked
 * host is a named fact a museum can read, never a silent hang. Lines are deduplicated per run,
 * so a client that retries does not grow the log without bound.
 *
 * THE DIRECTORY. `<agent socket dir>/egress/s<k>/` — one per SITE identity (LEAD-1b) — is
 * PROVISIONED BY ROOT (a tmpfiles.d line `provision apply` renders), never created here:
 * root:<site's private group> 0770 under a root-owned 0755 `egress/`. It is the SOURCE of a
 * bind PID 1 resolves AS ROOT when it sets up the site's unit, so nothing the daemon's uid can
 * rename, replace or re-point may sit on that path — a daemon-owned directory was one a
 * compromised daemon could swap for a symlink into a tree behind a traversal barrier, and PID 1
 * would have bound it into the site's unit (the ENVFILE pattern). The gate therefore REFUSES,
 * before anything is served, a directory that is not exactly that (`provisionedDirProblem`:
 * a real directory, owned by the provisioner, the site's group, 0770; every ancestor a real
 * directory no other uid may rename entries in). The daemon writes its sockets into it by
 * GROUP membership, 0660 and chgrp'd to the site's group, so beneath the unit's `/run` mask and
 * its distinct uid, DAC also says only this site's identity (and the daemon) may reach them;
 * the unit binds it READ-ONLY (connect(2) needs no writable mount), so the site's own runs
 * cannot plant in it either. Stale sockets of an earlier run are unlinked first; any other
 * entry refuses. It is REFUSED anywhere but directly under an `egress/` directory. `close()`
 * stops both servers, destroys live connections and unlinks the sockets (never the directory,
 * which is root's); it is idempotent.
 */

import { lookup as dnsLookup } from 'node:dns/promises';
import { lstatSync } from 'node:fs';
import { chmod, chown, readdir, rm } from 'node:fs/promises';
import { connect, createServer, isIP, type Server, type Socket } from 'node:net';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { EGRESS_PORT, hostProblem, MCP_SOCKET, PROXY_SOCKET } from '../drivers/network_profile';
import { isPublicAddress } from './public_address';

export interface EgressGatePlan {
  readonly hosts: readonly string[];
  readonly mcp: boolean;
}

export type EgressLookup = (host: string) => Promise<readonly { address: string; family: number }[]>;
export type EgressDial = (address: string, port: number) => Promise<Socket>;

export interface EgressGateOptions {
  /** `<agent socket dir>/egress/s<k>` — PROVISIONED by root; served in, never created or removed. */
  readonly dir: string;
  /**
   * THE SITE'S PRIVATE GROUP (LEAD-1b, REQUIRED). The directory must already BE it (0770), and
   * every socket is chgrp'd to it (0660) BEFORE anything is served — so beneath the unit's
   * `/run` mask and its distinct uid, plain DAC also says only this site's identity (and the
   * daemon, the one other member) may reach this gate. The daemon may chgrp without privilege:
   * it is a member.
   */
  readonly group: number;
  /**
   * THE UID THAT PROVISIONED THE DIRECTORY (REQUIRED) — root, 0, in production; a gate run by
   * a test states its own. The directory and every ancestor must be this uid's or root's.
   */
  readonly owner: number;
  readonly plan: EgressGatePlan;
  /** The Publication API base (`…/server_api/v2`); the MCP upstream is `<this>/mcp`. */
  readonly publicationApiUrl: string;
  /** Added as X-API-Key on the upstream request; empty = none. */
  readonly apiKey: string;
  /** One line per distinct accepted/refused destination — the run's own log. */
  readonly sink: (line: string) => void;
  /**
   * Test seams: the resolver and the dialer (production uses the system's), and a hook run
   * before each socket is served — a throw there is a gate that fails PART-WAY open, which
   * must leave nothing behind.
   */
  readonly seams?: {
    readonly lookup?: EgressLookup;
    readonly dial?: EgressDial;
    readonly beforeServe?: (socket: typeof PROXY_SOCKET | typeof MCP_SOCKET) => void | Promise<void>;
    /** The chgrp (`chown(path, -1, gid)`). A gate cannot chgrp to a group it is not in. */
    readonly chown?: (path: string, uid: number, gid: number) => void | Promise<void>;
    /**
     * lstat(2) of the directory and its ancestors, for `provisionedDirProblem` — a test host
     * that cannot make a directory root's (or a group it is not in) states what root made.
     */
    readonly lstat?: (path: string) => DirFacts | null;
  };
}

export interface EgressGate {
  close(): Promise<void>;
}

/** The provisioned per-site directory: root:<site group>, the daemon writes in it by group. */
export const EGRESS_DIR_MODE = 0o770;
const SOCKET_MODE = 0o660;
/** A CONNECT head is one line and a Host header: anything larger is not a client of ours. */
const HEAD_LIMIT_BYTES = 8 * 1024;
const HEAD_TIMEOUT_MS = 5_000;
const DIAL_TIMEOUT_MS = 10_000;
/** The client's first TLS flight, after the 200: bounded in time and in bytes. */
const HELLO_TIMEOUT_MS = 5_000;
const HELLO_LIMIT_BYTES = 64 * 1024;
/** TLS record type `handshake`, handshake type `client_hello`, and the extensions read. */
const TLS_HANDSHAKE = 0x16;
const TLS_CLIENT_HELLO = 0x01;
const TLS_EXT_SERVER_NAME = 0x0000;
const TLS_EXT_ENCRYPTED_CLIENT_HELLO = 0xfe0d;
const TLS_MAX_RECORD = 16_384 + 2_048;
/** An MCP JSON-RPC request is small; the bound is the daemon's memory, not the protocol's. */
const MCP_BODY_LIMIT_BYTES = 4 * 1024 * 1024;
/** A run that loops refusals must not grow its own log without bound. */
const SINK_LINE_LIMIT = 200;
/**
 * The most client connections ONE run may hold on proxy.sock at once — pending heads, pending
 * lookups/dials and live tunnels alike. Every accepted connection is a DAEMON fd (two, once
 * its tunnel is up) and daemon buffers: the unit's TasksMax/MemoryMax bound only the unit's
 * side, so without this a runaway or hostile build/turn spends the budget of the daemon that
 * serves every other site. Above it: 503, one (deduplicated) line, the socket destroyed at
 * once, nothing resolved or dialled. Generous for a real client (a package manager's parallel
 * fetches share a handful of keep-alive tunnels), finite for a loop.
 */
export const MAX_PROXY_CLIENTS = 128;

const REQUEST_HEADERS: readonly string[] = Object.freeze([
  'content-type',
  'accept',
  'mcp-protocol-version',
  'mcp-session-id',
  'last-event-id',
]);
const RESPONSE_HEADERS: readonly string[] = Object.freeze(['content-type', 'mcp-session-id', 'cache-control']);
const MCP_METHODS: ReadonlySet<string> = new Set(['POST', 'GET', 'DELETE']);

const systemLookup: EgressLookup = host => dnsLookup(host, { all: true, verbatim: true });

const systemDial: EgressDial = (address, port) =>
  new Promise((resolve, reject) => {
    const socket = connect({ host: address, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`dial ${address}:${port} timed out`));
    }, DIAL_TIMEOUT_MS);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('error', error => {
      clearTimeout(timer);
      reject(error);
    });
  });

/** Agent-chosen text into the run's log: printable, one line, bounded. */
function printable(text: string): string {
  return text.replace(/[^\x20-\x7e]/g, '?').slice(0, 200);
}

/**
 * A per-run directory is `<something>/egress/<name>`, and nothing else. The refusal is the
 * structural half of "never the runtime root": a gate cannot be pointed at a
 * directory that holds the daemon's socket or its secrets.
 */
function assertPerRunDir(dir: string): void {
  if (!isAbsolute(dir) || basename(dirname(dir)) !== 'egress' || basename(dir) === '' || dir.includes('/../')) {
    throw new Error(
      `egress gate: '${dir}' is not a per-run directory under an egress/ directory — a gate is ` +
        `never opened on the runtime root, or anywhere else.`,
    );
  }
}

/**
 * The plan is HOSTNAMES — the grammar every producer of a plan already applies, applied again
 * at the one place the plan takes effect. Refused before anything is created.
 */
function assertPlanHosts(hosts: readonly string[]): void {
  const problems = hosts.map(host => hostProblem(host)).filter((problem): problem is string => problem !== null);
  if (problems.length > 0) {
    throw new Error(`egress gate: a plan names hostnames only, and this one does not — ${problems.join('; ')}.`);
  }
}

/** What `provisionedDirProblem` reads of a path — lstat(2), never following a link. */
export interface DirFacts {
  readonly kind: 'dir' | 'symlink' | 'other';
  readonly uid: number;
  readonly gid: number;
  /** Permission bits, `& 0o7777`. */
  readonly mode: number;
}

function systemLstat(path: string): DirFacts | null {
  try {
    const facts = lstatSync(path);
    return {
      kind: facts.isSymbolicLink() ? 'symlink' : facts.isDirectory() ? 'dir' : 'other',
      uid: facts.uid,
      gid: facts.gid,
      mode: facts.mode & 0o7777,
    };
  } catch {
    return null;
  }
}

const octal = (mode: number) => `0${mode.toString(8)}`;

/**
 * IS `dir` WHAT ROOT PROVISIONED, AND ONLY ROOT CAN RE-POINT? Null when it is; else why not.
 *
 * `dir` itself: a real directory (never a link), owned by `owner`, group `group`, exactly
 * 0770. EVERY ANCESTOR up to `/`: a real directory owned by `owner` or root, and not writable
 * by group or other unless sticky (`/tmp`) — so no uid but root's may rename, replace or
 * re-point any component of the path PID 1 will resolve as root. Exported: the daemon asks it
 * before a run opens anything, and names `provision apply` as the repair.
 */
export function provisionedDirProblem(
  dir: string,
  expected: { readonly owner: number; readonly group: number },
  lstat: (path: string) => DirFacts | null = systemLstat,
): string | null {
  const own = lstat(dir);
  if (!own) return `'${dir}' does not exist`;
  if (own.kind !== 'dir') return `'${dir}' is ${own.kind === 'symlink' ? 'a symlink' : 'not a directory'}`;
  if (own.uid !== expected.owner) return `'${dir}' is owned by uid ${own.uid}, not the provisioner's (${expected.owner})`;
  if (own.gid !== expected.group) return `'${dir}' is group ${own.gid}, not the site's private group (${expected.group})`;
  if (own.mode !== EGRESS_DIR_MODE) return `'${dir}' is mode ${octal(own.mode)}, not ${octal(EGRESS_DIR_MODE)}`;
  for (let parent = dirname(dir); ; parent = dirname(parent)) {
    const facts = lstat(parent);
    if (!facts) return `its ancestor '${parent}' cannot be read`;
    if (facts.kind !== 'dir') return `its ancestor '${parent}' is ${facts.kind === 'symlink' ? 'a symlink' : 'not a directory'}`;
    if (facts.uid !== 0 && facts.uid !== expected.owner) return `its ancestor '${parent}' is owned by uid ${facts.uid}, neither root nor the provisioner`;
    if ((facts.mode & 0o022) !== 0 && (facts.mode & 0o1000) === 0) {
      return `its ancestor '${parent}' (mode ${octal(facts.mode)}) is writable by others without the sticky bit — another uid could rename what lies below it`;
    }
    if (parent === dirname(parent)) return null;
  }
}

export async function openEgressGate(opts: EgressGateOptions): Promise<EgressGate> {
  assertPerRunDir(opts.dir);
  assertPlanHosts(opts.plan.hosts);
  if (typeof opts.group !== 'number' || !Number.isInteger(opts.group) || opts.group < 0) {
    throw new Error(
      `egress gate: no site group was given for '${opts.dir}'. A gate belongs to ONE site's private group ` +
        `(0770/0660) — without it the sockets would carry the daemon's own group, which every site ` +
        `identity is in. Nothing was opened.`,
    );
  }
  if (typeof opts.owner !== 'number' || !Number.isInteger(opts.owner) || opts.owner < 0) {
    throw new Error(`egress gate: no provisioner uid was given for '${opts.dir}'. Nothing was opened.`);
  }
  const problem = provisionedDirProblem(opts.dir, { owner: opts.owner, group: opts.group }, opts.seams?.lstat);
  if (problem) {
    throw new Error(
      `egress gate: the site's egress directory is not as root provisioned it — ${problem}. It is the source ` +
        `of a bind PID 1 resolves as root; run provision apply (it renders and applies the tmpfiles.d line). ` +
        `Nothing was opened.`,
    );
  }
  const chgrp = opts.seams?.chown ?? ((path: string, uid: number, gid: number) => chown(path, uid, gid));
  const group = opts.group;
  const lookup = opts.seams?.lookup ?? systemLookup;
  const dial = opts.seams?.dial ?? systemDial;
  const plannedHosts = new Set(opts.plan.hosts);

  const logged = new Set<string>();
  const log = (line: string) => {
    if (logged.has(line) || logged.size >= SINK_LINE_LIMIT) return;
    logged.add(line);
    try {
      opts.sink(line);
    } catch {
      // A broken sink must not break the run's egress.
    }
  };

  const proxyPath = join(opts.dir, PROXY_SOCKET);
  const mcpPath = join(opts.dir, MCP_SOCKET);
  // AN EARLIER RUN'S SOCKETS (a daemon killed mid-run) are unlinked; anything else in the
  // directory is not this gate's to serve beside, and refuses.
  const stale = await readdir(opts.dir);
  const foreign = stale.filter(name => name !== PROXY_SOCKET && name !== MCP_SOCKET);
  if (foreign.length > 0) {
    throw new Error(
      `egress gate: '${opts.dir}' holds ${foreign.map(name => `'${printable(name)}'`).join(', ')}, which no gate ` +
        `serves — refused, nothing was opened.`,
    );
  }
  await rm(proxyPath, { force: true });
  await rm(mcpPath, { force: true });
  const live = new Set<Socket>();
  const clients = new Set<Socket>();
  let proxy: Server | null = null;
  let mcp: ReturnType<typeof Bun.serve> | null = null;
  let closing: Promise<void> | null = null;

  const close = (): Promise<void> => {
    closing ??= (async () => {
      for (const socket of live) socket.destroy();
      live.clear();
      if (proxy) {
        const server = proxy;
        await new Promise<void>(resolve => server.close(() => resolve()));
      }
      if (mcp) await mcp.stop(true);
      await rm(proxyPath, { force: true });
      await rm(mcpPath, { force: true });
    })();
    return closing;
  };

  try {
    await opts.seams?.beforeServe?.(PROXY_SOCKET);
    proxy = createServer(client => handleProxyClient(client, { plannedHosts, lookup, dial, log, live, clients }));
    const server = proxy;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(proxyPath, () => {
        server.off('error', reject);
        resolve();
      });
    });
    await chgrp(proxyPath, -1, group);
    await chmod(proxyPath, SOCKET_MODE);

    if (opts.plan.mcp) {
      await opts.seams?.beforeServe?.(MCP_SOCKET);
      mcp = serveMcp(mcpPath, opts);
      await chgrp(mcpPath, -1, group);
      await chmod(mcpPath, SOCKET_MODE);
    }
  } catch (error) {
    await close();
    throw error;
  }

  return { close };
}

/* ── proxy.sock ────────────────────────────────────────────────────────────────────── */

interface ProxyContext {
  readonly plannedHosts: ReadonlySet<string>;
  readonly lookup: EgressLookup;
  readonly dial: EgressDial;
  readonly log: (line: string) => void;
  readonly live: Set<Socket>;
  /** The accepted proxy clients still open — what MAX_PROXY_CLIENTS counts. */
  readonly clients: Set<Socket>;
}

function reply(client: Socket, status: number, reason: string): void {
  client.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

function handleProxyClient(client: Socket, ctx: ProxyContext): void {
  ctx.live.add(client);
  client.once('close', () => ctx.live.delete(client));
  client.on('error', () => client.destroy());
  if (ctx.clients.size >= MAX_PROXY_CLIENTS) {
    ctx.log(`[egress] refused a connection — this run already holds ${MAX_PROXY_CLIENTS}, the gate's per-run cap`);
    // Destroyed once the reply is flushed, not left half-open: a refused socket that is not
    // counted must not be one the client can keep holding either.
    client.end(
      'HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n',
      () => client.destroy(),
    );
    return;
  }
  ctx.clients.add(client);
  client.once('close', () => ctx.clients.delete(client));

  let head = Buffer.alloc(0);
  const timer = setTimeout(() => {
    client.off('data', onData);
    reply(client, 408, 'Request Timeout');
  }, HEAD_TIMEOUT_MS);

  function onData(chunk: Buffer): void {
    head = Buffer.concat([head, chunk]);
    const end = head.indexOf('\r\n\r\n');
    if (end === -1) {
      if (head.length > HEAD_LIMIT_BYTES) {
        clearTimeout(timer);
        client.off('data', onData);
        reply(client, 431, 'Request Header Fields Too Large');
      }
      return;
    }
    clearTimeout(timer);
    client.off('data', onData);
    client.pause();
    const requestLine = head.subarray(0, head.indexOf('\r\n')).toString('latin1');
    const rest = head.subarray(end + 4);
    void decide(client, requestLine, rest, ctx);
  }
  client.on('data', onData);
}

async function decide(client: Socket, requestLine: string, rest: Buffer, ctx: ProxyContext): Promise<void> {
  const [method = '', target = ''] = requestLine.split(' ');
  if (method !== 'CONNECT') {
    ctx.log(`[egress] refused ${printable(method)} — only CONNECT <host>:${EGRESS_PORT} leaves this unit`);
    reply(client, 405, 'Method Not Allowed');
    return;
  }
  const colon = target.lastIndexOf(':');
  const host = (colon === -1 ? target : target.slice(0, colon)).toLowerCase();
  const port = colon === -1 ? '' : target.slice(colon + 1);
  const shown = printable(target);

  if (port !== String(EGRESS_PORT)) {
    ctx.log(`[egress] refused CONNECT ${shown} — only port ${EGRESS_PORT} is tunnelled`);
    reply(client, 403, 'Forbidden');
    return;
  }
  // A plan never holds a literal (assertPlanHosts), so the membership check below would refuse
  // one too — this branch is the NAMED refusal: the run's log says why, not only "not planned".
  if (host.startsWith('[') || isIP(host) !== 0) {
    ctx.log(`[egress] refused CONNECT ${shown} — an IP literal; egress is by hostname only`);
    reply(client, 403, 'Forbidden');
    return;
  }
  if (!ctx.plannedHosts.has(host)) {
    ctx.log(`[egress] refused CONNECT ${shown} — not a host this run may reach`);
    reply(client, 403, 'Forbidden');
    return;
  }

  let answers: readonly { address: string; family: number }[];
  try {
    answers = await ctx.lookup(host);
  } catch (error) {
    ctx.log(`[egress] refused CONNECT ${shown} — the name did not resolve (${printable(String(error))})`);
    reply(client, 502, 'Bad Gateway');
    return;
  }
  const refused = answers.filter(answer => !isPublicAddress(answer.address));
  if (answers.length === 0 || refused.length > 0) {
    ctx.log(
      `[egress] refused CONNECT ${shown} — it resolves to ${
        refused.length > 0 ? `a non-public address (${refused.map(a => printable(a.address)).join(', ')})` : 'nothing'
      }`,
    );
    reply(client, 403, 'Forbidden');
    return;
  }

  // EVERY vetted answer, in the resolver's order, until one dials: the agent CLI connected
  // directly before this gate existed and had its own multi-address fallback, so a host with
  // a broken IPv6 route or one dead A record must not lose every turn. It weakens nothing —
  // all of them were vetted from the ONE lookup above, and none is re-resolved.
  let upstream: Socket | null = null;
  let address = '';
  const failures: string[] = [];
  for (const answer of answers) {
    try {
      upstream = await ctx.dial(answer.address, EGRESS_PORT);
      address = answer.address;
      break;
    } catch (error) {
      failures.push(`${printable(answer.address)}: ${printable(String(error))}`);
      if (client.destroyed) break;
    }
  }
  if (!upstream) {
    ctx.log(`[egress] CONNECT ${shown} failed on every vetted address (${failures.join('; ')})`);
    reply(client, 502, 'Bad Gateway');
    return;
  }
  if (client.destroyed) {
    upstream.destroy();
    return;
  }
  ctx.live.add(upstream);
  upstream.once('close', () => {
    ctx.live.delete(upstream);
    client.destroy();
  });
  upstream.on('error', () => upstream.destroy());
  client.once('close', () => upstream.destroy());
  ctx.log(`[egress] CONNECT ${shown} → ${printable(address)}`);
  client.write('HTTP/1.1 200 Connection Established\r\n\r\n');

  // THE FIRST FLIGHT, before any byte goes upstream: it must be a TLS ClientHello naming the
  // CONNECT host. The CONNECT line is the agent's claim; the SNI is where the edge routes.
  const first = await readFirstFlight(client, rest);
  if (first.verdict.kind !== 'ok' || first.verdict.serverName !== host) {
    const why =
      first.verdict.kind === 'ok'
        ? `its TLS ClientHello names '${printable(first.verdict.serverName)}', not the CONNECT host`
        : first.verdict.why;
    ctx.log(`[egress] closed the tunnel to ${shown} — ${why}; nothing was sent upstream`);
    upstream.destroy();
    client.destroy();
    return;
  }
  upstream.write(first.bytes);
  client.pipe(upstream);
  upstream.pipe(client);
  client.resume();
}

/** What the client's first TLS flight says, once there is enough of it to say anything. */
export type ClientHelloVerdict =
  | { readonly kind: 'more' }
  | { readonly kind: 'refused'; readonly why: string }
  | { readonly kind: 'ok'; readonly serverName: string };

/**
 * Read the client's first bytes after the 200 until they are a complete ClientHello (or
 * plainly are not one), bounded by HELLO_TIMEOUT_MS and HELLO_LIMIT_BYTES. The bytes are
 * returned so that, on an accept, they are forwarded EXACTLY as received.
 */
type FirstFlightVerdict = Exclude<ClientHelloVerdict, { readonly kind: 'more' }>;

function readFirstFlight(client: Socket, rest: Buffer): Promise<{ bytes: Buffer; verdict: FirstFlightVerdict }> {
  return new Promise(resolve => {
    let bytes = rest;
    let settled = false;
    const finish = (verdict: FirstFlightVerdict) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.off('data', onData);
      client.off('close', onClose);
      client.pause();
      resolve({ bytes, verdict });
    };
    const judge = () => {
      const verdict = parseClientHello(bytes);
      if (verdict.kind !== 'more') finish(verdict);
      else if (bytes.length > HELLO_LIMIT_BYTES) finish({ kind: 'refused', why: 'its first flight is not a ClientHello within 64 KiB' });
    };
    const onData = (chunk: Buffer) => {
      bytes = Buffer.concat([bytes, chunk]);
      judge();
    };
    const onClose = () => finish({ kind: 'refused', why: 'the client closed before a ClientHello' });
    const timer = setTimeout(
      () => finish({ kind: 'refused', why: `no ClientHello within ${HELLO_TIMEOUT_MS / 1000}s` }),
      HELLO_TIMEOUT_MS,
    );
    client.on('data', onData);
    client.once('close', onClose);
    judge();
    if (!settled) client.resume();
  });
}

/**
 * THE SNI OF A TLS ClientHello, or why these bytes are not one this gate forwards.
 *
 * Reads TLS records (type 22) until the first handshake message is complete — a ClientHello
 * may span records — then walks its fixed fields to the extensions. Refused: anything that is
 * not a handshake record, a first message that is not a ClientHello, a hello with no
 * `server_name` (or a malformed/duplicate one), and a hello carrying Encrypted Client Hello,
 * whose OUTER name is the CDN's and whose inner one the gate cannot read. Every length is
 * bounds-checked: a lie is a refusal, never a read past the buffer.
 */
export function parseClientHello(bytes: Buffer): ClientHelloVerdict {
  const refused = (why: string): ClientHelloVerdict => ({ kind: 'refused', why });
  let handshake = Buffer.alloc(0);
  let offset = 0;
  for (;;) {
    if (bytes.length - offset < 5) return { kind: 'more' };
    if (bytes[offset] !== TLS_HANDSHAKE || bytes[offset + 1] !== 3) {
      return refused('its first flight is not a TLS handshake (only TLS leaves this unit)');
    }
    const length = bytes.readUInt16BE(offset + 3);
    if (length === 0 || length > TLS_MAX_RECORD) return refused('its TLS record length is malformed');
    if (bytes.length - offset - 5 < length) return { kind: 'more' };
    handshake = Buffer.concat([handshake, bytes.subarray(offset + 5, offset + 5 + length)]);
    offset += 5 + length;
    if (handshake.length < 4) continue;
    if (handshake[0] !== TLS_CLIENT_HELLO) return refused('its first handshake message is not a ClientHello');
    const messageLength = handshake.readUIntBE(1, 3);
    if (messageLength > HELLO_LIMIT_BYTES) return refused('its ClientHello is larger than 64 KiB');
    if (handshake.length >= 4 + messageLength) return helloServerName(handshake.subarray(4, 4 + messageLength));
  }
}

function helloServerName(body: Buffer): ClientHelloVerdict {
  const malformed: ClientHelloVerdict = { kind: 'refused', why: 'its ClientHello is malformed' };
  let at = 2 + 32; // legacy_version, random
  const skip = (lengthBytes: 1 | 2): boolean => {
    if (at + lengthBytes > body.length) return false;
    const length = lengthBytes === 1 ? (body[at] as number) : body.readUInt16BE(at);
    at += lengthBytes + length;
    return at <= body.length;
  };
  if (!skip(1) || !skip(2) || !skip(1)) return malformed; // session id, cipher suites, compression
  if (at === body.length) return { kind: 'refused', why: 'its ClientHello names no server (no SNI)' };
  if (at + 2 > body.length) return malformed;
  const end = at + 2 + body.readUInt16BE(at);
  if (end > body.length) return malformed;
  at += 2;
  let serverName: string | null = null;
  while (at < end) {
    if (at + 4 > end) return malformed;
    const type = body.readUInt16BE(at);
    const length = body.readUInt16BE(at + 2);
    const data = at + 4;
    if (data + length > end) return malformed;
    if (type === TLS_EXT_ENCRYPTED_CLIENT_HELLO) {
      return { kind: 'refused', why: 'its ClientHello carries Encrypted Client Hello, whose real server the gate cannot read' };
    }
    if (type === TLS_EXT_SERVER_NAME) {
      // The SNI the gate judges must be the ONLY one: with two, which one a TLS stack routes
      // on is its choice, not the gate's.
      if (serverName !== null) return { kind: 'refused', why: 'its ClientHello carries more than one server_name' };
      // server_name_list: one host_name entry (type 0) is all RFC 6066 permits.
      if (length < 5 || body.readUInt16BE(data) !== length - 2 || body[data + 2] !== 0) return malformed;
      const nameLength = body.readUInt16BE(data + 3);
      if (nameLength === 0 || 5 + nameLength !== length) return malformed;
      serverName = body.subarray(data + 5, data + 5 + nameLength).toString('latin1').toLowerCase();
    }
    at = data + length;
  }
  if (at !== end) return malformed;
  if (serverName === null) return { kind: 'refused', why: 'its ClientHello names no server (no SNI)' };
  return { kind: 'ok', serverName };
}

/* ── mcp.sock ──────────────────────────────────────────────────────────────────────── */

function serveMcp(path: string, opts: EgressGateOptions): ReturnType<typeof Bun.serve> {
  const upstreamUrl = `${opts.publicationApiUrl.replace(/\/+$/, '')}/mcp`;
  return Bun.serve({
    unix: path,
    maxRequestBodySize: MCP_BODY_LIMIT_BYTES,
    async fetch(request, server) {
      const url = new URL(request.url);
      if (url.pathname !== '/mcp' || !MCP_METHODS.has(request.method)) {
        return new Response(null, { status: 404 });
      }
      // An SSE stream may idle between events for longer than Bun's default idle timeout;
      // the run's own lifetime (the gate closes with it) is the bound instead.
      server.timeout(request, 0);
      const headers = new Headers();
      for (const name of REQUEST_HEADERS) {
        const value = request.headers.get(name);
        if (value !== null) headers.set(name, value);
      }
      if (opts.apiKey) headers.set('X-API-Key', opts.apiKey);
      let upstream: Response;
      try {
        upstream = await fetch(upstreamUrl, {
          method: request.method,
          headers,
          body: request.method === 'POST' ? await request.arrayBuffer() : undefined,
          redirect: 'manual',
          signal: request.signal,
        });
      } catch {
        return new Response(null, { status: 502 });
      }
      if (upstream.status >= 300 && upstream.status < 400) {
        await upstream.body?.cancel().catch(() => {});
        return new Response(null, { status: 502 });
      }
      const out = new Headers();
      for (const name of RESPONSE_HEADERS) {
        const value = upstream.headers.get(name);
        if (value !== null) out.set(name, value);
      }
      return new Response(upstream.body, { status: upstream.status, headers: out });
    },
  });
}
