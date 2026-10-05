/**
 * THE PUBLICATION-HOST AGENT CLIENT (PUBLICATION_HOST_SPEC §2; phase-3 E6/E7).
 *
 * Every command the engine sends a paired publication agent is built here, and every byte
 * leaves through transport.ts (E5, the one door) — this file never dials and never spells
 * the agent's base path: paths are AGENT_PATHS entries, relative to it. The shape mirrors
 * tools/tool_sitebuilder/server/daemon_client.ts.
 *
 * ── THE PAIRING ORDER ─────────────────────────────────────────────────────────────────
 *  1. LOCAL: the host's token file must imply the registry fingerprint
 *     (publicationHostFingerprint(instance, token)) — refused before anything is dialled.
 *  2. LIVE: the unauthenticated GET /health must publish that fingerprint
 *     (publicationHostFingerprintMatches, constant time). Only then is the bearer sent.
 *  3. MUTATIONS (rules.apply, release.install, release.rollback) prove LIVE on EVERY call:
 *     a re-provisioned agent receives the anonymous /health and nothing else — no bearer,
 *     no actor, no body (Review Focus 1).
 *  4. READS (status, media.probe) may ride a cached proof (E6). The cache key is host name
 *     → registry fingerprint + registry address, so a re-pair from ANOTHER process (the pair
 *     CLI) changes the key and the next read re-proves; a removed host is `unconfigured`.
 *     ONLY SUCCESS is cached; it is dropped on any transport failure, on a 401 (followed by
 *     exactly one anonymous re-probe: mismatch → pairing_mismatch, match → auth), and on a
 *     status body naming another fingerprint. NAMED RESIDUAL: one read under a cached proof
 *     may carry the old bearer to an agent re-provisioned since the proof, before the 401
 *     re-probe catches it.
 *
 * WHAT THE FINGERPRINT PROVES — and what it does not. It is published on an
 * unauthenticated route, so anyone who reaches the real agent learns it. Its check detects
 * DRIFT and MISROUTING (a re-provisioned agent, another instance, a wrong address); it does
 * not keep an impostor out. Impostor resistance is the CHANNEL's: mTLS with the pinned CA
 * (a TCP host), the socket's filesystem permissions (a unix host — the door refuses a
 * socket that is a symlink or sits in a group/other-writable directory).
 *
 * THE REFUSAL IS ONE REFUSAL: wrong instance and wrong token are indistinguishable to the
 * caller. Log lines name the HOST only — never the token, a key, a fingerprint or the
 * address. The agent's problem `detail` is log-only (wire.ts, the only minter of
 * rejected/failed): an input this engine will not send is `engineRefusal(input_invalid)`
 * (`rejected`), a 2xx it cannot read is `engineFailure(unreadable_body)` (`failed`). A
 * token file the secrets store refuses (mode, owner, shape) is `unconfigured`.
 *
 * The install body stream is the CALLER's: a refusal before the bearer request (input,
 * registry, secrets, the live proof) leaves it unread.
 */

import type { DedaloError } from '../errors/index.ts';
import type { PublicationHostServer } from '../media/publication_host_rules.ts';
import { publicationHostFingerprint, publicationHostFingerprintMatches } from './pairing.ts';
import { getHost, HOST_NAME, type PublicationHostRecord, RegistryError } from './registry.ts';
import { readHostToken, SecretError } from './secrets.ts';
import { type AgentRequest, type AgentResponse, agentRequest } from './transport.ts';
import {
	agentResponseError,
	engineFailure,
	engineRefusal,
	hostError,
	registryError,
} from './wire.ts';

/** The /health field the pairing travels in (the agent's health route). */
export const AGENT_PAIRING_FIELD = 'instance_fingerprint';
/** The agent's actor convention on mutations. */
export const AGENT_ACTOR_HEADER = 'x-dedalo-actor';

export const AGENT_TIMEOUTS_MS = Object.freeze({
	health: 5_000,
	read: 10_000,
	rules: 60_000,
	rollback: 120_000,
	install: 900_000,
});
const HEALTH_MAX_BYTES = 4_096;

export type AgentApi = 'v1' | 'v2';

/** The agent's MediaProbe (GET /v1/media/probe, and `media` in status). */
export interface MediaProbe {
	mode: 'shared' | 'copy' | 'none';
	root: string | null;
	present: boolean;
	read_only: boolean | null;
	pub_readable: boolean | null;
	pub_markers: number | null;
	problems: string[];
}

/** The agent's AgentStatus (GET /v1/status). */
export interface AgentStatus {
	agent_version: string;
	bun_version: string;
	platform: string;
	instance_fingerprint: string;
	apis: Record<AgentApi, { current: string | null; previous: string | null }>;
	rules: { server: string; hash: string | null };
	media: MediaProbe;
	disk: { state_root_free_bytes: number };
}

/** The agent's InstallResult (POST /v1/releases/<api>). */
export interface InstallResult {
	api: AgentApi;
	from: string | null;
	to: string;
	reused: boolean;
	health: 'ok';
}

export interface RulesApplyInput {
	server: PublicationHostServer;
	text: string;
	hash: string;
}

/** A release id `<version>_<digest7>` (spec §3); host_status shapes agent-reported ids by it. */
export const AGENT_RELEASE_ID = /^\d+(\.\d+){1,3}_[0-9a-f]{7}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
/**
 * The agent's actor rule (1-200, no control characters) narrowed to what an HTTP header
 * value can carry as-is: printable Latin-1. A wider name would make fetch throw an untyped
 * TypeError at the door; it is refused here, typed, before anything is dialled.
 */
const ACTOR = /^[\x20-\x7e\xa0-\xff]{1,200}$/;
const APIS: ReadonlySet<string> = new Set(['v1', 'v2']);
const SERVERS: ReadonlySet<string> = new Set(['apache', 'nginx']);
const MEDIA_MODES: ReadonlySet<string> = new Set(['shared', 'copy', 'none']);

/**
 * READ PROOFS: host name → proofKey (registry fingerprint + address) its /health proved.
 * Process state about a fixed registry entry — no user, session or language. Success only;
 * deleted on transport failure, 401, status-fingerprint mismatch, any failed proof, and
 * forgetPairing. Mutations never consult it.
 */
const provenPairings = new Map<string, string>();

function proofKey(host: PublicationHostRecord): string {
	return JSON.stringify([host.fingerprint, host.address]);
}

interface Command {
	name: string;
	request: AgentRequest;
}

interface Answer {
	status: number;
	body: unknown;
}

function command(
	name: string,
	method: AgentRequest['method'],
	path: string,
	extra: Partial<AgentRequest> = {},
): Command {
	return { name, request: { method, path, timeoutMs: AGENT_TIMEOUTS_MS.read, ...extra } };
}

// ── input refusals (engine-authored, before any dial) ────────────────────────────────

/** wire.ts's engine refusal (`rejected`, reason input_invalid): the WHY is log-only. */
function refuse(name: string, commandName: string, why: string): DedaloError {
	return engineRefusal(name, 'input_invalid', {
		message: `publication host '${name}': ${commandName} refused before dialling: ${why}`,
		coordinates: { command: commandName },
	});
}

function assertActor(name: string, commandName: string, actor: string): void {
	if (!ACTOR.test(actor)) {
		throw refuse(name, commandName, 'the actor must be 1-200 printable Latin-1 characters');
	}
}

function assertApi(name: string, commandName: string, api: string): void {
	if (!APIS.has(api)) throw refuse(name, commandName, 'the api must be v1 or v2');
}

function assertRulesRequest(name: string, req: RulesApplyInput, actor: string): void {
	assertActor(name, 'rules.apply', actor);
	if (!SERVERS.has(req.server))
		throw refuse(name, 'rules.apply', 'the server must be apache or nginx');
	if (!SHA256_HEX.test(req.hash))
		throw refuse(name, 'rules.apply', 'the hash must be 64 lowercase hex');
	if (req.text.length === 0) throw refuse(name, 'rules.apply', 'the include text is empty');
}

function assertInstallRequest(
	name: string,
	api: string,
	releaseId: string,
	sha256: string,
	actor: string,
): void {
	assertApi(name, 'release.install', api);
	assertActor(name, 'release.install', actor);
	if (!AGENT_RELEASE_ID.test(releaseId)) {
		throw refuse(name, 'release.install', 'the release id must be <version>_<digest7>');
	}
	if (!SHA256_HEX.test(sha256))
		throw refuse(name, 'release.install', 'the bundle sha256 must be 64 lowercase hex');
}

// ── host + secrets ───────────────────────────────────────────────────────────────────

/** A registry that cannot be read is registry_invalid (Review Focus 2), never "no host". */
function loadHost(name: string): PublicationHostRecord | null {
	try {
		return getHost(name);
	} catch (error) {
		if (error instanceof RegistryError) throw registryError(error.reason);
		throw error;
	}
}

/** What a caller-supplied name that fails HOST_NAME is logged and coordinated as: never the raw text. */
const UNVETTED_NAME = '<invalid host name>';

/**
 * The host the registry vouches for. A caller-supplied name is checked against the
 * registry's own grammar FIRST: one outside it is refused input_invalid and never echoed
 * (a CR/LF in it would forge `[publication_host]` log lines operators act on).
 */
function requireHost(name: string): PublicationHostRecord {
	if (!HOST_NAME.test(name)) {
		console.error(`[publication_host] refused a host name outside the registry grammar`);
		throw engineRefusal(UNVETTED_NAME, 'input_invalid', {
			message: `publication host name refused before any lookup: it must match ${HOST_NAME.source}`,
		});
	}
	const host = loadHost(name);
	if (host === null) {
		console.error(`[publication_host] no publication host named '${name}' in the registry`);
		throw hostError('publication_host.unconfigured', name, {
			message: `no publication host named '${name}'`,
		});
	}
	return host;
}

/** The token, or `unconfigured` — a token file the secrets store refuses is typed, never raw. */
function readToken(host: PublicationHostRecord): string | null {
	try {
		return readHostToken(host.name);
	} catch (error) {
		if (!(error instanceof SecretError)) throw error;
		console.error(
			`[publication_host] host '${host.name}': its token file is refused (${error.reason})`,
		);
		throw hostError('publication_host.unconfigured', host.name, {
			message: `publication host '${host.name}': token refused (${error.reason})`,
			coordinates: { reason: 'token', secret_reason: error.reason },
		});
	}
}

function requireToken(host: PublicationHostRecord): string {
	const token = readToken(host);
	if (token === null) {
		console.error(
			`[publication_host] host '${host.name}' has no token file; re-pair it with scripts/publication_host_pair.ts`,
		);
		throw hostError('publication_host.unconfigured', host.name, {
			message: `publication host '${host.name}' has no token`,
		});
	}
	return token;
}

// ── the pairing ──────────────────────────────────────────────────────────────────────

function pairingRefused(host: PublicationHostRecord, why: string): DedaloError {
	provenPairings.delete(host.name);
	console.error(
		`[publication_host] PAIRING REFUSED for host '${host.name}': ${why}. Nothing carrying the bearer was sent on this proof. ` +
			'Re-pair the host with scripts/publication_host_pair.ts from the agent artifacts.',
	);
	return hostError('publication_host.pairing_mismatch', host.name, {
		message: `publication host '${host.name}' did not prove the pairing: ${why}`,
	});
}

function assertLocalPairing(host: PublicationHostRecord, token: string): void {
	const implied = publicationHostFingerprint(host.instance, token);
	if (!publicationHostFingerprintMatches(host.fingerprint, implied)) {
		throw pairingRefused(host, 'its token file does not imply the registry fingerprint');
	}
}

/** A probe parse: `undefined` IS the answer for a non-JSON body (callers refuse it). */
function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function publishedFingerprint(host: PublicationHostRecord): Promise<unknown> {
	const res = await agentRequest(
		host,
		{
			method: 'GET',
			path: '/health',
			timeoutMs: AGENT_TIMEOUTS_MS.health,
			maxResponseBytes: HEALTH_MAX_BYTES,
		},
		null,
	);
	if (res.status !== 200) {
		console.error(
			`[publication_host] host '${host.name}': the pairing probe got HTTP ${res.status} from /health`,
		);
		throw hostError('publication_host.unreachable', host.name, {
			message: `publication host '${host.name}' answered its health route with HTTP ${res.status}`,
		});
	}
	const body = parseJson(res.text);
	return isRecord(body) ? body[AGENT_PAIRING_FIELD] : undefined;
}

/** A LIVE proof; returns the token it proved. Records success, forgets on any failure. */
async function provePairing(host: PublicationHostRecord): Promise<string> {
	provenPairings.delete(host.name);
	const token = requireToken(host);
	assertLocalPairing(host, token);
	const published = await publishedFingerprint(host);
	if (!publicationHostFingerprintMatches(host.fingerprint, published)) {
		throw pairingRefused(
			host,
			'the agent at its address published another fingerprint (another instance, another token, or no proof)',
		);
	}
	provenPairings.set(host.name, proofKey(host));
	return token;
}

/** THE EXPLICIT PROOF (the panel's, the pair CLI's): always live. */
export async function proveHostPairing(host: PublicationHostRecord): Promise<void> {
	await provePairing(host);
}

/** Whether THIS process holds a read proof for the host's CURRENT fingerprint + address. */
export function pairingProved(host: PublicationHostRecord): boolean {
	return provenPairings.get(host.name) === proofKey(host);
}

/** Make the next read of `name` re-prove (correctness never depends on calling it). */
export function forgetPairing(name: string): void {
	provenPairings.delete(name);
}

/** Reads: the cached proof when its key still matches the registry entry, else a live one. */
async function tokenForRead(host: PublicationHostRecord): Promise<string> {
	if (!pairingProved(host)) return provePairing(host);
	const token = requireToken(host);
	assertLocalPairing(host, token); // a token file replaced since the proof
	return token;
}

// ── the bearer call ──────────────────────────────────────────────────────────────────

async function sendWithBearer(
	host: PublicationHostRecord,
	cmd: Command,
	token: string,
): Promise<AgentResponse> {
	try {
		return await agentRequest(host, cmd.request, token);
	} catch (error) {
		// A transport failure says nothing about who answers next time: re-prove first.
		provenPairings.delete(host.name);
		throw error;
	}
}

async function bearerRefused(host: PublicationHostRecord): Promise<never> {
	await provePairing(host); // throws pairing_mismatch / unreachable — the bearer is not re-sent
	provenPairings.delete(host.name);
	console.error(
		`[publication_host] host '${host.name}' proved the pairing but rejected the engine bearer (HTTP 401)`,
	);
	throw hostError('publication_host.auth', host.name, {
		message: `publication host '${host.name}' rejected the engine bearer`,
	});
}

/** A 2xx body this engine cannot read → `failed` (unreadable_body), minted by wire.ts. */
function unreadable(host: PublicationHostRecord, commandName: string, status: number): DedaloError {
	console.error(
		`[publication_host] host '${host.name}' answered ${commandName} (HTTP ${status}) with a body this engine cannot read`,
	);
	return engineFailure(host.name, 'unreadable_body', {
		message: `publication host '${host.name}': ${commandName} answered ${status} with a body this engine cannot read`,
		coordinates: { command: commandName, agent_status: status },
	});
}

async function bearerCall(
	host: PublicationHostRecord,
	cmd: Command,
	token: string,
): Promise<Answer> {
	const res = await sendWithBearer(host, cmd, token);
	if (res.status === 401) return await bearerRefused(host);
	if (res.status < 200 || res.status > 299)
		throw agentResponseError(host.name, res.status, res.text);
	return { status: res.status, body: parseJson(res.text) };
}

async function readCall(host: PublicationHostRecord, cmd: Command): Promise<Answer> {
	return bearerCall(host, cmd, await tokenForRead(host));
}

/** Mutations: a live proof on every call, whatever the cache says (Review Focus 1). */
async function mutateCall(host: PublicationHostRecord, cmd: Command): Promise<Answer> {
	return bearerCall(host, cmd, await provePairing(host));
}

function expectShape<T>(
	host: PublicationHostRecord,
	commandName: string,
	answer: Answer,
	guard: (value: unknown) => value is T,
): T {
	if (!guard(answer.body)) throw unreadable(host, commandName, answer.status);
	return answer.body;
}

// ── shape guards (the agent is another deployable: its answers are checked, not trusted) ─

function isNullableString(value: unknown): value is string | null {
	return value === null || typeof value === 'string';
}

function isNullableBoolean(value: unknown): value is boolean | null {
	return value === null || typeof value === 'boolean';
}

function isNullableCount(value: unknown): value is number | null {
	return value === null || Number.isSafeInteger(value);
}

function isStringList(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isProbeHead(value: Record<string, unknown>): boolean {
	return (
		MEDIA_MODES.has(String(value.mode)) &&
		isNullableString(value.root) &&
		typeof value.present === 'boolean' &&
		isStringList(value.problems)
	);
}

function isProbeTail(value: Record<string, unknown>): boolean {
	return (
		isNullableBoolean(value.read_only) &&
		isNullableBoolean(value.pub_readable) &&
		isNullableCount(value.pub_markers)
	);
}

export function isMediaProbe(value: unknown): value is MediaProbe {
	return isRecord(value) && isProbeHead(value) && isProbeTail(value);
}

function isApiSlot(value: unknown): boolean {
	return isRecord(value) && isNullableString(value.current) && isNullableString(value.previous);
}

function isApis(value: unknown): boolean {
	return isRecord(value) && isApiSlot(value.v1) && isApiSlot(value.v2);
}

function isRules(value: unknown): boolean {
	return isRecord(value) && typeof value.server === 'string' && isNullableString(value.hash);
}

function isDisk(value: unknown): boolean {
	return isRecord(value) && Number.isSafeInteger(value.state_root_free_bytes);
}

function isStatusIdentity(value: Record<string, unknown>): boolean {
	return (
		typeof value.agent_version === 'string' &&
		typeof value.bun_version === 'string' &&
		typeof value.platform === 'string' &&
		typeof value.instance_fingerprint === 'string'
	);
}

function isStatusState(value: Record<string, unknown>): boolean {
	return (
		isApis(value.apis) && isRules(value.rules) && isMediaProbe(value.media) && isDisk(value.disk)
	);
}

export function isAgentStatus(value: unknown): value is AgentStatus {
	return isRecord(value) && isStatusIdentity(value) && isStatusState(value);
}

function isInstallResult(value: unknown): value is InstallResult {
	return (
		isRecord(value) &&
		APIS.has(String(value.api)) &&
		isNullableString(value.from) &&
		typeof value.to === 'string' &&
		typeof value.reused === 'boolean' &&
		value.health === 'ok'
	);
}

function isRulesApplied(value: unknown): value is { hash: string; reloaded: true } {
	return isRecord(value) && typeof value.hash === 'string' && value.reloaded === true;
}

function isSwap(value: unknown): value is { from: string; to: string } {
	return isRecord(value) && typeof value.from === 'string' && typeof value.to === 'string';
}

// ── the §6 commands ──────────────────────────────────────────────────────────────────

export async function hostStatus(name: string): Promise<AgentStatus> {
	const host = requireHost(name);
	const answer = await readCall(host, command('status', 'GET', '/v1/status'));
	const status = expectShape(host, 'status', answer, isAgentStatus);
	if (!publicationHostFingerprintMatches(host.fingerprint, status.instance_fingerprint)) {
		throw pairingRefused(
			host,
			'its status body names another fingerprint than the one its /health proved',
		);
	}
	return status;
}

export async function hostMediaProbe(name: string): Promise<MediaProbe> {
	const host = requireHost(name);
	const answer = await readCall(host, command('media.probe', 'GET', '/v1/media/probe'));
	return expectShape(host, 'media.probe', answer, isMediaProbe);
}

export async function hostApplyRules(
	name: string,
	req: RulesApplyInput,
	actor: string,
): Promise<{ hash: string; reloaded: true }> {
	assertRulesRequest(name, req, actor);
	const host = requireHost(name);
	const answer = await mutateCall(
		host,
		command('rules.apply', 'POST', '/v1/rules/apply', {
			headers: { 'content-type': 'application/json', [AGENT_ACTOR_HEADER]: actor },
			body: JSON.stringify({ server: req.server, text: req.text, hash: req.hash }),
			timeoutMs: AGENT_TIMEOUTS_MS.rules,
		}),
	);
	const applied = expectShape(host, 'rules.apply', answer, isRulesApplied);
	if (applied.hash !== req.hash) throw unreadable(host, 'rules.apply', answer.status);
	return { hash: applied.hash, reloaded: true };
}

export async function hostInstallRelease(
	name: string,
	api: AgentApi,
	releaseId: string,
	sha256: string,
	body: ReadableStream<Uint8Array>,
	actor: string,
): Promise<InstallResult> {
	assertInstallRequest(name, api, releaseId, sha256, actor);
	const host = requireHost(name);
	const answer = await mutateCall(
		host,
		command('release.install', 'POST', `/v1/releases/${api}`, {
			headers: {
				'content-type': 'application/gzip',
				'x-release-id': releaseId,
				'x-bundle-sha256': sha256,
				[AGENT_ACTOR_HEADER]: actor,
			},
			body,
			timeoutMs: AGENT_TIMEOUTS_MS.install,
		}),
	);
	const result = expectShape(host, 'release.install', answer, isInstallResult);
	if (result.api !== api || result.to !== releaseId)
		throw unreadable(host, 'release.install', answer.status);
	return result;
}

export async function hostRollbackRelease(
	name: string,
	api: AgentApi,
	actor: string,
): Promise<{ from: string; to: string }> {
	assertApi(name, 'release.rollback', api);
	assertActor(name, 'release.rollback', actor);
	const host = requireHost(name);
	const answer = await mutateCall(
		host,
		command('release.rollback', 'POST', `/v1/releases/${api}/rollback`, {
			headers: { [AGENT_ACTOR_HEADER]: actor },
			timeoutMs: AGENT_TIMEOUTS_MS.rollback,
		}),
	);
	const swap = expectShape(host, 'release.rollback', answer, isSwap);
	return { from: swap.from, to: swap.to };
}
