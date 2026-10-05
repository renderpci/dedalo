/**
 * THE PAIRED PRIVATE AGENT CHANNEL — the engine's FOURTH outbound door
 * (engineering/OUTBOUND_SPEC.md §2.1; engineering/PUBLICATION_HOST_SPEC.md §2).
 *
 * The only engine code that opens a socket to a publication agent. The agent lives on an
 * address that is private BY DESIGN (a WireGuard peer, a firewalled LAN port, a unix socket
 * on this machine), which `assertPublicUrl` refuses — so this is a named door with its own
 * policy, not `fetchGuardedText`, and not an exemption either. Its policy, in order:
 *
 *   1. THE ROUTE TABLE IS CLOSED. `path` is one of the agent's literal routes BELOW the base
 *      (`AGENT_PATHS`; the door prefixes `AGENT_BASE_PATH` itself, so callers never spell
 *      it), the method GET or POST (a GET carries no body), the bounds inside their ceilings,
 *      the bearer one token of the secrets store's own grammar (`TOKEN_SHAPE`), and the
 *      caller sets none of the transport's own headers. A query string is never part of
 *      `path`: a route that takes one declares its keys in `AGENT_QUERY_GRAMMAR`, each value
 *      must match its own closed grammar (no `/`, `%`, space or line break can pass), and the
 *      door encodes it. A breach is a programming error, refused before any socket.
 *   2. THE TARGET IS THE REGISTRY ENTRY, EXACTLY (`agentTarget`). TCP is
 *      `https://<host>:<port>` + `AGENT_BASE_PATH` with mTLS from the host's engine bundle:
 *      the client certificate and key, the CA PINNED as the only trust root,
 *      `rejectUnauthorized: true`, and the certificate checked against the REGISTRY host.
 *      The explicit `true` is load-bearing: measured on Bun 1.4.2, it is what keeps a rogue
 *      agent refused while NODE_TLS_REJECT_UNAUTHORIZED=0 is in the environment. A
 *      unix-socket host is dialled at its socket only when the filesystem vouches for it
 *      (`socketSafe`: a socket, not a symlink; its parent writable by its owner alone — no
 *      sticky exemption; the socket owned by the parent's owner, root or the engine user;
 *      every directory above unswappable by anyone else; below a sticky ancestor only a
 *      root- or engine-owned name) — otherwise `unreachable` (reason
 *      socket_perms) and no connection (the fingerprint is public; on a socket this check
 *      is what keeps an impostor's listener out). It trusts the owner of the directory the
 *      operator registered: the registry holds no agent uid. No caller text reaches the URL. A TCP host
 *      with no engine bundle — or one the secrets store refuses — is
 *      `publication_host.unconfigured`, and no socket opens.
 *   3. ONE REQUEST. `redirect: 'manual'`, and any 3xx is REFUSED with its body cancelled
 *      unread: the agent never redirects, so a 3xx means something else answered.
 *   4. BOUNDED. One total deadline from connect to the last body byte, an idle bound on the
 *      body (default min(deadline, 30 s); a caller may only lower it — an idle body is a
 *      timeout even with the deadline far off), and the body read through the shared capped reader (`readBytesCapped`), which
 *      cancels it over the ceiling. A request body may be a stream (release bundles).
 *
 * THE BEARER IS THE CALLER'S DECISION. It is attached only when passed, and the one
 * production caller (the publication-host client) passes it only after the pairing is proved
 * on the agent's unauthenticated /health. Nothing here logs, echoes or stores it, and no
 * failure carries it. Every failure is minted by wire.ts (`hostError`, and `engineFailure`
 * for the byte ceiling): `publication_host.unconfigured` / `unreachable` / `timeout` /
 * `failed` (wire reason `body_cap`), with LOG-ONLY coordinates (publication_host, reason,
 * stage).
 *
 * NAMED RESIDUAL — the proxy environment. Bun's fetch routes a TCP (https) target through
 * HTTPS_PROXY when it is set, and no per-request option turns that off (measured on Bun
 * 1.4.2: `proxy: false | null | ''` are all still proxied). HTTP_PROXY alone does not apply
 * to the https target, and a unix-socket agent is never proxied. mTLS still ends
 * at the agent, so a proxy sees the channel's address and ciphertext, never the bearer —
 * but the channel is then not private. The operator excludes the agent's address with
 * NO_PROXY. The residual canaries in publication_host_transport_native pin both sides.
 */

import { lstatSync, realpathSync, type Stats, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { DedaloError, isDedaloError } from '../errors/index.ts';
import { readBytesCapped } from '../security/ssrf_guard.ts';
import { type PublicationHostRecord, publicationHostsTestRefusal } from './registry.ts';
import { type HostTls, readHostTls, SecretError, TOKEN_SHAPE } from './secrets.ts';
import { engineFailure, hostError } from './wire.ts';

/** Where the agent mounts its routes (the agent's router peels exactly this prefix). */
export const AGENT_BASE_PATH = '/publication/host_agent';

/** The agent's closed route table, below `AGENT_BASE_PATH`. Nothing else is ever dialled. */
export const AGENT_PATHS: readonly string[] = Object.freeze([
	'/health',
	'/v1/status',
	'/v1/media/probe',
	'/v1/rules/apply',
	'/v1/releases/v1',
	'/v1/releases/v2',
	'/v1/releases/v1/rollback',
	'/v1/releases/v2/rollback',
	'/v1/media/manifest',
]);

/**
 * THE ONLY QUERY KEYS ANY ROUTE TAKES, each with its value grammar (anchored, no flags).
 * A route absent here takes no query. The manifest cursor is the agent's own opaque
 * base64url (publication/host_agent/src/media/copy.ts CURSOR, same bound); the limit is
 * a plain decimal (the agent bounds it 1–5000).
 */
export const AGENT_QUERY_GRAMMAR: Readonly<Record<string, Readonly<Record<string, RegExp>>>> =
	Object.freeze({
		'/v1/media/manifest': Object.freeze({
			cursor: /^[A-Za-z0-9_-]{1,2000}$/,
			limit: /^[1-9][0-9]{0,3}$/,
		}),
	});

export const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
export const MAX_RESPONSE_BYTES_CEILING = 16 * 1024 * 1024;
export const DEFAULT_TIMEOUT_MS = 10_000;
/** A release install answers only after the agent's health checks: generous, still finite. */
export const MAX_TIMEOUT_MS = 30 * 60_000;
/** The longest the body may stay silent once the headers arrived. */
const IDLE_CEILING_MS = 30_000;

/** Headers only the transport sets. */
const TRANSPORT_HEADERS: readonly string[] = Object.freeze([
	'authorization',
	'host',
	'content-length',
	'transfer-encoding',
	'connection',
]);

export interface AgentRequest {
	method: 'GET' | 'POST';
	/** One of AGENT_PATHS — below the base path; the door prefixes it. */
	path: string;
	/** Only keys AGENT_QUERY_GRAMMAR declares for `path`, each matching its grammar; the door encodes. */
	query?: Readonly<Record<string, string>>;
	headers?: Record<string, string>;
	body?: string | ReadableStream<Uint8Array>;
	/** Default 1 MiB, ceiling 16 MiB. */
	maxResponseBytes?: number;
	/** Total deadline, connect to last body byte. Default 10 s, ceiling 30 min. */
	timeoutMs?: number;
	/**
	 * Longest silence between two body chunks. Default min(timeoutMs, 30 s); never above
	 * either. An idle body ends as publication_host.timeout even when the deadline is far off.
	 */
	idleTimeoutMs?: number;
}

export interface AgentResponse {
	status: number;
	headers: Headers;
	text: string;
}

type TransportFailureCode =
	| 'publication_host.unconfigured'
	| 'publication_host.unreachable'
	| 'publication_host.timeout';

type Coordinates = Record<string, string | number>;

interface Bounds {
	maxBytes: number;
	timeoutMs: number;
	idleMs: number;
}

interface AgentTarget {
	url: string;
	init:
		| { tls: { cert: string; key: string; ca: string; rejectUnauthorized: true } }
		| { unix: string };
}

/** A typed failure through the one minter; the host in the LOG only, never a secret. */
function failure(
	code: TransportFailureCode,
	host: PublicationHostRecord,
	coordinates: Coordinates,
	cause?: unknown,
): DedaloError {
	return hostError(code, host.name, { coordinates, cause });
}

/** A caller broke the door's contract: a bug, refused before any socket opens. */
function misuse(what: string): DedaloError {
	return new DedaloError('internal.unexpected', {
		message: `publication host transport: ${what}`,
	});
}

function assertRoute(req: AgentRequest): void {
	if (req.method !== 'GET' && req.method !== 'POST') throw misuse('method outside GET/POST');
	if (!AGENT_PATHS.includes(req.path)) throw misuse('path outside the agent route table');
	if (req.method === 'GET' && req.body !== undefined) throw misuse('a GET carries no body');
}

/** The grammar `path` declares for `key`, or undefined (own properties only: never a prototype key). */
function queryRule(path: string, key: string): RegExp | undefined {
	const grammar = Object.hasOwn(AGENT_QUERY_GRAMMAR, path) ? AGENT_QUERY_GRAMMAR[path] : undefined;
	return grammar !== undefined && Object.hasOwn(grammar, key) ? grammar[key] : undefined;
}

function assertQuery(req: AgentRequest): void {
	for (const [key, value] of Object.entries(req.query ?? {})) {
		const rule = queryRule(req.path, key);
		if (rule === undefined)
			throw misuse(`query key ${JSON.stringify(key)} is not declared for this route`);
		if (typeof value !== 'string' || !rule.test(value))
			throw misuse(`query ${key} outside its grammar`);
	}
}

/** The route plus its (already asserted) query — the only text appended to the base path. */
function routeWithQuery(req: AgentRequest): string {
	const query = new URLSearchParams(Object.entries(req.query ?? {})).toString();
	return query === '' ? req.path : `${req.path}?${query}`;
}

function assertHeaders(headers: Record<string, string> | undefined): void {
	for (const name of Object.keys(headers ?? {})) {
		if (TRANSPORT_HEADERS.includes(name.toLowerCase()))
			throw misuse(`header ${name} is the transport's`);
	}
}

function assertBearer(bearer: string | null): void {
	if (bearer !== null && !TOKEN_SHAPE.test(bearer)) throw misuse('bearer shape');
}

function inRange(value: number, ceiling: number): boolean {
	return Number.isSafeInteger(value) && value > 0 && value <= ceiling;
}

/** `value` (or its default) in (0, ceiling], else the caller's contract is broken. */
function bounded(
	value: number | undefined,
	fallback: number,
	ceiling: number,
	what: string,
): number {
	const chosen = value ?? fallback;
	if (!inRange(chosen, ceiling)) throw misuse(`${what} out of range`);
	return chosen;
}

function boundsOf(req: AgentRequest): Bounds {
	const maxBytes = bounded(
		req.maxResponseBytes,
		DEFAULT_MAX_RESPONSE_BYTES,
		MAX_RESPONSE_BYTES_CEILING,
		'maxResponseBytes',
	);
	const timeoutMs = bounded(req.timeoutMs, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS, 'timeoutMs');
	const idleCeiling = Math.min(timeoutMs, IDLE_CEILING_MS);
	const idleMs = bounded(req.idleTimeoutMs, idleCeiling, idleCeiling, 'idleTimeoutMs');
	return { maxBytes, timeoutMs, idleMs };
}

/** An IPv6 literal needs brackets in a URL authority. */
function urlHost(host: string): string {
	return host.includes(':') ? `[${host}]` : host;
}

function statOrNull(path: string, follow: boolean): Stats | null {
	try {
		return follow ? statSync(path) : lstatSync(path);
	} catch {
		return null;
	}
}

const STICKY = 0o1000;
/** Group or other write bits. */
const loose = (stat: Stats): boolean => (stat.mode & 0o022) !== 0;

/**
 * The prefixes of an absolute directory path, '/' first, each with the next component
 * below it (null for the last): `/a/b` → ['/', 'a'], ['/a', 'b'], ['/a/b', null].
 */
function prefixes(path: string): Array<[string, string | null]> {
	const parts = path.split('/').filter((part) => part !== '');
	return [...parts.keys(), parts.length].map((index) => [
		`/${parts.slice(0, index).join('/')}`,
		parts[index] ?? null,
	]);
}

/**
 * Every directory ABOVE the socket's parent (`/` down to the grandparent) could swap the
 * parent out from under the check, so each must be owned by a trusted uid and writable by
 * nobody else — except a sticky directory (`/tmp`), where only an entry's owner may rename
 * it. `trusted` = root, the engine user, and the parent's owner (the uid the operator's
 * registered path already trusts). The entry BELOW a sticky ancestor is judged against
 * `creator` = root and the engine user ONLY: in a sticky world-writable dir anyone may
 * CREATE a name, so its owner vouches for nothing — trusting the parent's owner there is
 * circular (a squatter's /tmp/x owns itself). Never parent.uid.
 */
function ancestorsSafe(
	parentPath: string,
	trusted: (uid: number) => boolean,
	creator: (uid: number) => boolean,
): boolean {
	return prefixes(dirname(parentPath)).every(([path, child]) =>
		ancestorSafe(path, child === null ? parentPath : joinBelow(path, child), trusted, creator),
	);
}

/** `path/child`, without a doubled slash below '/'. */
function joinBelow(path: string, child: string): string {
	return `${path === '/' ? '' : path}/${child}`;
}

/** One ancestor: a trusted real directory, and if loose, sticky with `next` made by a creator. */
function ancestorSafe(
	path: string,
	next: string,
	trusted: (uid: number) => boolean,
	creator: (uid: number) => boolean,
): boolean {
	const dir = statOrNull(path, true);
	if (dir === null || !dir.isDirectory() || !trusted(dir.uid)) return false;
	return !loose(dir) || stickyEntrySafe(dir, next, creator);
}

/** Below a loose ancestor only a sticky dir passes, and only for an entry root/the engine made. */
function stickyEntrySafe(dir: Stats, next: string, creator: (uid: number) => boolean): boolean {
	if ((dir.mode & STICKY) === 0) return false;
	const entry = statOrNull(next, false);
	return entry !== null && creator(entry.uid);
}

/**
 * THE UNIX IMPOSTOR CHECK. What it guarantees: the socket was placed by the owner of its
 * directory (or root, or the engine user), and no other uid can create, replace or rename
 * anything on the path to it — in particular no name below a sticky world-writable
 * ancestor (`/tmp/x`) is trusted unless root or the engine user owns it, so a squatted
 * directory is refused. Concretely: the node IS a socket (lstat: a symlink is
 * refused); its parent is a real directory with NO group/other write bit — no sticky
 * exemption: a sticky world-writable dir lets anyone CREATE the name (squatting); the
 * socket is owned by the parent's owner, root or the engine user; and every directory
 * above the parent, on the path as written AND on its realpath, passes ancestorsSafe.
 * What it does NOT know: which uid the agent runs as (the registry holds no uid), so it
 * trusts whoever owns the directory the operator registered. The provisioned shape —
 * the agent's RuntimeDirectory (0750, owned by the agent user) under root-owned /run —
 * passes. Any refusal is `unreachable` (reason socket_perms), nothing is sent.
 */
function socketSafe(socket: string): boolean {
	const node = statOrNull(socket, false);
	const parentPath = dirname(socket);
	const parent = statOrNull(parentPath, true);
	if (!socketInTightDir(node, parent)) return false;
	const engine = process.geteuid?.();
	const creator = (uid: number): boolean => uid === 0 || uid === engine;
	const trusted = (uid: number): boolean => creator(uid) || uid === parent?.uid;
	if (node === null || !trusted(node.uid)) return false;
	const real = realpathOrNull(parentPath);
	return (
		real !== null &&
		ancestorsSafe(parentPath, trusted, creator) &&
		ancestorsSafe(real, trusted, creator)
	);
}

/** The node is a socket (lstat) in a real directory with no group/other write bit. */
function socketInTightDir(node: Stats | null, parent: Stats | null): boolean {
	if (!node?.isSocket() || !parent?.isDirectory()) return false;
	return !loose(parent);
}

function realpathOrNull(path: string): string | null {
	try {
		return realpathSync(path);
	} catch {
		return null;
	}
}

function assertSocketSafe(host: PublicationHostRecord, socket: string): void {
	if (statOrNull(socket, false) === null)
		throw failure('publication_host.unreachable', host, { reason: 'transport', stage: 'connect' });
	if (!socketSafe(socket)) {
		throw failure('publication_host.unreachable', host, {
			reason: 'socket_perms',
			stage: 'connect',
		});
	}
}

/** THE ADDRESS POLICY: the registry entry, exactly — mTLS over TCP, or the unix socket. */
function agentTarget(host: PublicationHostRecord, tls: HostTls | null, path: string): AgentTarget {
	const address = host.address;
	if (address.kind === 'unix') {
		assertSocketSafe(host, address.socket);
		return { url: `http://localhost${AGENT_BASE_PATH}${path}`, init: { unix: address.socket } };
	}
	if (tls === null)
		throw failure('publication_host.unconfigured', host, { reason: 'engine_bundle' });
	return {
		url: `https://${urlHost(address.host)}:${address.port}${AGENT_BASE_PATH}${path}`,
		init: { tls: { cert: tls.cert, key: tls.key, ca: tls.ca, rejectUnauthorized: true } },
	};
}

function outgoingHeaders(req: AgentRequest, bearer: string | null): Headers {
	const headers = new Headers(req.headers);
	if (bearer !== null) headers.set('authorization', `Bearer ${bearer}`);
	return headers;
}

/** A TLS verification failure, told apart from a dead route in the LOG only. */
function transportReason(error: unknown): string {
	const code = String((error as { code?: unknown } | null)?.code ?? '');
	return /CERT|SIGNATURE|TLS|SSL|ISSUER/.test(code) ? 'tls' : 'transport';
}

function isIdle(error: unknown): boolean {
	return isDedaloError(error) && error.coordinates?.reason === 'idle';
}

function transportFailure(
	host: PublicationHostRecord,
	deadline: AbortSignal,
	stage: 'connect' | 'body',
	error: unknown,
): DedaloError {
	if (deadline.aborted || isIdle(error)) {
		return failure('publication_host.timeout', host, { reason: 'timeout', stage }, error);
	}
	return failure(
		'publication_host.unreachable',
		host,
		{ reason: transportReason(error), stage },
		error,
	);
}

async function connect(
	host: PublicationHostRecord,
	target: AgentTarget,
	req: AgentRequest,
	headers: Headers,
	deadline: AbortSignal,
): Promise<Response> {
	try {
		return await fetch(target.url, {
			method: req.method,
			headers,
			body: req.body,
			redirect: 'manual',
			signal: deadline,
			...target.init,
		});
	} catch (error) {
		throw transportFailure(host, deadline, 'connect', error);
	}
}

/** The agent never redirects: a 3xx is something else answering. Cancelled unread. */
async function refuseRedirect(host: PublicationHostRecord, response: Response): Promise<void> {
	if (response.status < 300 || response.status > 399) return;
	await response.body?.cancel().catch(() => undefined);
	throw failure('publication_host.unreachable', host, {
		reason: 'redirect',
		status: response.status,
	});
}

async function readAnswer(
	host: PublicationHostRecord,
	response: Response,
	bounds: Bounds,
	deadline: AbortSignal,
): Promise<string> {
	try {
		const { bytes } = await readBytesCapped(response, bounds.maxBytes, {
			idleTimeoutMs: bounds.idleMs,
			signal: deadline,
			onBreach: (maxBytes) =>
				engineFailure(host.name, 'body_cap', {
					message: `publication host '${host.name}': the answer exceeded ${maxBytes} bytes; read cancelled`,
					coordinates: { max_bytes: maxBytes },
				}),
		});
		return new TextDecoder().decode(bytes);
	} catch (error) {
		if (isDedaloError(error) && error.code.startsWith('publication_host.')) throw error;
		throw transportFailure(host, deadline, 'body', error);
	}
}

/**
 * The transport with its TLS material passed in. `agentRequest` is what production code
 * dials through; this seam exists for the door's own native gate (and is censused: no
 * production module may hold it — ssrf_one_guard_tripwire).
 */
export async function dialAgent(
	host: PublicationHostRecord,
	tls: HostTls | null,
	req: AgentRequest,
	withBearer: string | null,
): Promise<AgentResponse> {
	assertRoute(req);
	assertQuery(req);
	assertHeaders(req.headers);
	assertBearer(withBearer);
	const bounds = boundsOf(req);
	const target = agentTarget(host, tls, routeWithQuery(req));
	const deadline = AbortSignal.timeout(bounds.timeoutMs);
	const response = await connect(host, target, req, outgoingHeaders(req, withBearer), deadline);
	await refuseRedirect(host, response);
	const text = await readAnswer(host, response, bounds, deadline);
	return { status: response.status, headers: response.headers, text };
}

/**
 * THE DOOR. One request to a registered publication agent, its TLS material read from the
 * host's secret directory (never from the caller). A bundle the secrets store REFUSES
 * (widened mode, wrong owner, symlink, incoherent pieces) is `publication_host.unconfigured`
 * naming the store's reason in the log — a typed state, never an untyped throw. A non-2xx
 * answer is RETURNED — the agent's problem+json is the client's to map. In a TEST process
 * the door dials only from a scratch publication-hosts store (`publicationHostsTestRefusal`):
 * a test that runs a whole reconcile plan never sends the installation's bearer anywhere.
 */
export async function agentRequest(
	host: PublicationHostRecord,
	req: AgentRequest,
	withBearer: string | null,
): Promise<AgentResponse> {
	// bun test never reaches a real agent: refused before the TLS material is read
	const testRefusal = publicationHostsTestRefusal();
	if (testRefusal !== null) throw misuse(testRefusal);
	let tls: HostTls | null = null;
	if (host.address.kind === 'tls') {
		try {
			tls = readHostTls(host.name);
		} catch (error) {
			if (!(error instanceof SecretError)) throw error;
			throw hostError('publication_host.unconfigured', host.name, {
				message: `publication host '${host.name}': engine bundle refused (${error.reason})`,
				cause: error,
				coordinates: { reason: 'engine_bundle', secret_reason: error.reason },
			});
		}
	}
	return dialAgent(host, tls, req, withBearer);
}
