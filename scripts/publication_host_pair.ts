#!/usr/bin/env bun
/**
 * PAIR THIS ENGINE WITH A PUBLICATION-HOST AGENT — add, replace or remove one entry of the
 * publication-host registry (engineering/PUBLICATION_HOST_SPEC.md §2; phase-3 decision E4).
 * Run it AS THE ENGINE USER, never as root:
 *
 *   sudo -u <engine user> bun run dedalo:pair-publication-host add <name> --fragment <engine.env.fragment> \
 *        --bundle <engine_bundle.pem> --token-file <0600 copy of the agent SERVICE_TOKEN>
 *   sudo cat <agent credential> | sudo -u <engine user> bun run dedalo:pair-publication-host add <name> --fragment <f> --token-stdin
 *   sudo -u <engine user> bun run dedalo:pair-publication-host replace <name> --fragment <f> [--bundle <p>] [--token-file <p>]
 *   sudo -u <engine user> bun run dedalo:pair-publication-host remove <name>
 *   add|replace|remove … --dry-run        prove (add/replace) or describe (remove); keep nothing
 *                                         (no sweep, no registry, no secret; the proof's
 *                                         transient staging copy is removed, see step 5)
 *
 * WHY THIS IS THE ONLY WAY IN. An agent address typed into a web form is an SSRF and a
 * credential-exfiltration surface, and the pairing ceremony already happens on a command line
 * on both machines. The maintenance panel can edit a host's public URL, qualities and probe
 * records, and can remove it; nothing else creates or re-points one.
 *
 * WHY THE ENGINE USER AND NOT ROOT (a deliberate reading of E4's "root-run"): the secrets are
 * 0600 and the engine refuses any secret it does not own (secrets.ts bad_owner). Written by
 * root they would block every host. So the caller must own the private directory, and a
 * private directory owned by root is refused outright — no shipped stack runs the engine as
 * root.
 *
 * THE ORDER IS THE CONTRACT:
 *   1. Run as the OWNER of the private directory (the engine user).
 *   2. Read the agent's fragment with the ENGINE's env parser (src/config/env.ts). Unknown
 *      keys, a pending fingerprint, both or neither of URL/SOCKET, a bundle on a socket
 *      pairing, a group-readable credential — including a fragment that carries the token —
 *      are refused before any connection.
 *   3. The token (a 0600 file, stdin, or the 0600 fragment — never argv, never echoed) and the
 *      instance must hash to the fragment's fingerprint: a mis-pasted token names itself
 *      before any connection.
 *   4. The registry slot is checked: add needs a free name, replace an existing one, and one
 *      agent never sits under two names. A corrupt registry is a refusal, never "empty".
 *   5. LIVE PROOF. The secrets are staged under a throwaway `pairing_<hex>` name (a prefix the
 *      registry refuses for a real host) and the agent's unauthenticated /health must publish
 *      the expected fingerprint over the very channel the engine will use
 *      (src/core/publication_host/agent_client.ts proveHostPairing: mTLS with this bundle, or
 *      the socket). No bearer is sent. The staging is removed whatever happens; a crash leaves
 *      it 0600 and the next run sweeps it after an hour.
 *   6. Only then, ALL under the registry lock: the slot re-checked, then the secrets under the
 *      real name, then the registry entry. A refused re-check writes nothing; an add whose
 *      registry write fails removes only the secrets it just wrote.
 *
 * Exit codes: 0 ok · 2 usage · 3 refused (input, owner, pairing, registry state) · 4 failed
 * (I/O, agent unreachable, lock). Nothing printed on any path carries the token, the key, a PEM
 * or a fingerprint.
 *
 * The fragment vocabulary is spelled here AND in the agent's renderer
 * (publication/host_agent/src/provision/render/engine_fragment.ts) — separate deployables that
 * share no module; test/unit/publication_host_pair_cli_native.test.ts holds them equal.
 */

import { randomBytes } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, rmdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { parseEnvFile, privateDir } from '../src/config/env.ts';
import { isDedaloError } from '../src/core/errors/dedalo_error.ts';
import { proveHostPairing } from '../src/core/publication_host/agent_client.ts';
import {
	publicationHostFingerprint,
	publicationHostFingerprintMatches,
} from '../src/core/publication_host/pairing.ts';
import {
	HOST_NAME,
	loadRegistry,
	type PublicationHostRecord,
	RESERVED_HOST_PREFIX,
	RegistryError,
	type RegistryFile,
	registryPath,
	updateRegistry,
} from '../src/core/publication_host/registry.ts';
import {
	hostSecretDir,
	readHostTls,
	removeHostSecrets,
	SecretError,
	secretPresenceOutcome,
	secretsRoot,
	secretsRootPresent,
	TOKEN_SHAPE,
	writeHostSecrets,
} from '../src/core/publication_host/secrets.ts';

export const EXIT = Object.freeze({ ok: 0, usage: 2, refused: 3, failed: 4 } as const);

/** The agent renderer's ENGINE_KEYS, value for value (held equal by the CLI gate). */
export const FRAGMENT_KEYS = Object.freeze({
	instance: 'DEDALO_PUBLICATION_HOST_INSTANCE',
	url: 'DEDALO_PUBLICATION_HOST_URL',
	socket: 'DEDALO_PUBLICATION_HOST_SOCKET',
	tlsBundle: 'DEDALO_PUBLICATION_HOST_TLS_BUNDLE',
	token: 'DEDALO_PUBLICATION_HOST_TOKEN',
	fingerprint: 'DEDALO_PUBLICATION_HOST_FINGERPRINT',
});
export const TOKEN_PLACEHOLDER = 'PASTE_THE_SERVICE_TOKEN_VALUE_HERE';
export const BUNDLE_PLACEHOLDER = 'PASTE_THE_ENGINE_BUNDLE_PATH_ON_THE_WORK_HOST_HERE';
export const FINGERPRINT_PENDING = 'PENDING_SERVICE_TOKEN_NOT_MINTED_RERUN_PROVISION_APPLY';
export const AGENT_BASE_PATH = '/publication/host_agent';
/** The live-proof staging prefix: the registry's reserved prefix (one spelling). */
export const STAGING_PREFIX = RESERVED_HOST_PREFIX;

const TAG = '[publication_host_pair]';
const AGENT_INSTANCE = /^[a-z][a-z0-9_]{1,31}$/;
const FINGERPRINT_SHAPE = /^[0-9a-f]{64}$/;
const MIN_TOKEN_LENGTH = 32;
const STAGING_STALE_MS = 60 * 60 * 1000;
const KNOWN_KEYS: ReadonlySet<string> = new Set(Object.values(FRAGMENT_KEYS));

const USAGE = [
	'Usage (as the engine user): sudo -u <engine user> bun run dedalo:pair-publication-host <add|replace|remove> <name> [options]',
	'  --fragment <file>      the agent engine.env.fragment (add/replace; 0600 if it carries the token)',
	'  --bundle <file>        engine_bundle.pem carried from the publication host (mTLS; 0600)',
	'  --token-file <file>    a 0600 copy of the agent SERVICE_TOKEN',
	'  --token-stdin          read the token from stdin instead',
	'  --dry-run              prove the pairing (or describe the removal); keep nothing, sweep nothing',
	'',
].join('\n');

export class PairRefusal extends Error {
	readonly exit: number;
	/** True when something WAS written before the failure (the message then says what). */
	readonly wrote: boolean;
	constructor(message: string, exit: number = EXIT.refused, wrote = false) {
		super(message);
		this.name = 'PairRefusal';
		this.exit = exit;
		this.wrote = wrote;
	}
}

export interface CliResult {
	code: number;
	stdout: string;
	stderr: string;
}

export interface FragmentFields {
	instance: string;
	fingerprint: string;
	url: string | null;
	socket: string | null;
	/** null = absent or the placeholder. */
	tlsBundle: string | null;
	/** null = absent or the placeholder. */
	token: string | null;
}

type Address = PublicationHostRecord['address'];

interface CliOptions {
	command: 'add' | 'replace' | 'remove';
	name: string;
	fragment: string | null;
	bundle: string | null;
	tokenFile: string | null;
	tokenStdin: boolean;
	dryRun: boolean;
}

// ------------------------------------------------------------------------------ pure parts

function unlessPlaceholder(value: string | undefined, placeholder: string): string | null {
	return value === undefined || value === placeholder ? null : value;
}

export function parseFragment(text: string): FragmentFields {
	const declared = parseEnvFile(text);
	const keys = Object.keys(declared);
	if (keys.length === 0) {
		throw new PairRefusal(
			"the fragment declares no KEY=value lines. Is it the agent's engine.env.fragment?",
		);
	}
	const unknown = keys.filter((key) => !KNOWN_KEYS.has(key));
	if (unknown.length > 0) {
		throw new PairRefusal(
			`the fragment declares ${unknown.join(', ')}, which is not publication-host pairing vocabulary. ` +
				'A fragment from an agent newer than this engine? Update the engine first.',
		);
	}
	const instance = declared[FRAGMENT_KEYS.instance] ?? '';
	if (!AGENT_INSTANCE.test(instance)) {
		throw new PairRefusal(
			`${FRAGMENT_KEYS.instance} is missing or does not match ${AGENT_INSTANCE}.`,
		);
	}
	const fingerprint = declared[FRAGMENT_KEYS.fingerprint] ?? '';
	if (fingerprint === FINGERPRINT_PENDING) {
		throw new PairRefusal(
			`${FRAGMENT_KEYS.fingerprint} is still pending: the agent's service token was not minted when the ` +
				'fragment was rendered. Run `provision apply` on the publication host and carry the new fragment.',
		);
	}
	if (!FINGERPRINT_SHAPE.test(fingerprint)) {
		throw new PairRefusal(`${FRAGMENT_KEYS.fingerprint} is missing or not 64 lowercase hex.`);
	}
	const url = declared[FRAGMENT_KEYS.url] ?? null;
	const socket = declared[FRAGMENT_KEYS.socket] ?? null;
	if ((url === null) === (socket === null)) {
		throw new PairRefusal(
			`the fragment must set exactly one of ${FRAGMENT_KEYS.url} (mTLS) and ${FRAGMENT_KEYS.socket} (same machine).`,
		);
	}
	return {
		instance,
		fingerprint,
		url,
		socket,
		tlsBundle: unlessPlaceholder(declared[FRAGMENT_KEYS.tlsBundle], BUNDLE_PLACEHOLDER),
		token: unlessPlaceholder(declared[FRAGMENT_KEYS.token], TOKEN_PLACEHOLDER),
	};
}

export function parseAgentAddress(fields: Pick<FragmentFields, 'url' | 'socket'>): Address {
	if (fields.socket !== null) {
		if (!fields.socket.startsWith('/')) {
			throw new PairRefusal(`${FRAGMENT_KEYS.socket} must be an absolute socket path.`);
		}
		return { kind: 'unix', socket: fields.socket };
	}
	let url: URL;
	try {
		url = new URL(fields.url ?? '');
	} catch {
		throw new PairRefusal(`${FRAGMENT_KEYS.url} is not a URL.`);
	}
	const plain =
		url.protocol === 'https:' &&
		url.username === '' &&
		url.password === '' &&
		url.search === '' &&
		url.hash === '';
	if (!plain) {
		throw new PairRefusal(
			`${FRAGMENT_KEYS.url} must be a plain https:// URL (no credentials, query or fragment): the agent listens on mTLS only.`,
		);
	}
	if (url.pathname.replace(/\/$/, '') !== AGENT_BASE_PATH) {
		throw new PairRefusal(
			`${FRAGMENT_KEYS.url} must end in the agent base path ${AGENT_BASE_PATH}.`,
		);
	}
	return {
		kind: 'tls',
		host: url.hostname.replace(/^\[(.*)\]$/, '$1'),
		port: url.port === '' ? 443 : Number(url.port),
	};
}

export function resolveToken(fragmentToken: string | null, supplied: string | null): string {
	if (fragmentToken === null && supplied === null) {
		throw new PairRefusal(
			`${FRAGMENT_KEYS.token} in the fragment is the placeholder, not a token. Supply the agent's SERVICE_TOKEN ` +
				'with --token-file <a 0600 copy> or --token-stdin (`sudo cat <credential> | …`); it is never taken from argv.',
		);
	}
	if (fragmentToken !== null && supplied !== null && fragmentToken !== supplied) {
		throw new PairRefusal(
			'the fragment carries a token and a different one was supplied. One pairing, one token.',
		);
	}
	const token = supplied ?? fragmentToken ?? '';
	if (token.length < MIN_TOKEN_LENGTH) {
		throw new PairRefusal(
			`the token is shorter than ${MIN_TOKEN_LENGTH} characters; the agent refuses to boot with such a token, so it is not this agent's.`,
		);
	}
	if (!TOKEN_SHAPE.test(token)) {
		throw new PairRefusal(
			'the token is not one run of printable ASCII without spaces (the engine secrets store refuses any other shape). Copy it unedited.',
		);
	}
	return token;
}

export function resolveBundlePath(
	kind: 'tls' | 'unix',
	fragmentBundle: string | null,
	flagBundle: string | null,
): string | null {
	if (kind === 'unix') {
		if (fragmentBundle !== null || flagBundle !== null) {
			throw new PairRefusal(
				'a socket pairing carries no TLS bundle (spec §1.1: the socket group is the access decision). Drop --bundle.',
			);
		}
		return null;
	}
	if (fragmentBundle !== null && flagBundle !== null && fragmentBundle !== flagBundle) {
		throw new PairRefusal(
			`${FRAGMENT_KEYS.tlsBundle} in the fragment and --bundle name different files.`,
		);
	}
	const path = flagBundle ?? fragmentBundle;
	if (path === null) {
		throw new PairRefusal(
			'an mTLS pairing needs the engine bundle: pass --bundle <engine_bundle.pem> (client certificate, client key, CA — carried from the publication host).',
		);
	}
	return path;
}

/** Returns the fingerprint the registry stores. Wrong token and wrong instance: one sentence. */
export function assertFragmentFingerprint(
	fields: Pick<FragmentFields, 'instance' | 'fingerprint'>,
	token: string,
): string {
	const computed = publicationHostFingerprint(fields.instance, token);
	if (!publicationHostFingerprintMatches(fields.fingerprint, computed)) {
		throw new PairRefusal(
			`the instance and the token do not hash to the fragment's ${FRAGMENT_KEYS.fingerprint}: the token is not ` +
				"this agent's, or the fragment is another instance's.",
		);
	}
	return computed;
}

/**
 * The engine-user rule. A root-owned private dir is refused for EVERY caller: the engine
 * never runs as root, so secrets written there would be root's and the engine would refuse
 * them (bad_owner). Otherwise the caller must be the dir's owner.
 */
export function invocationOwnerProblem(dirUid: number, euid: number): string | null {
	if (dirUid === 0) {
		return (
			'the private directory is owned by root (uid 0). The engine does not run as root, so secrets written ' +
			'here would be unreadable to it. chown the private directory to the engine user, then run this as that ' +
			'user: `sudo -u <engine user> bun run dedalo:pair-publication-host …`.'
		);
	}
	if (dirUid === euid) return null;
	return (
		`run this as the owner of the private directory (uid ${dirUid}), not as uid ${euid}: the secrets are 0600 ` +
		'and must be owned by the engine user. `sudo -u <engine user> bun run dedalo:pair-publication-host …`.'
	);
}

function addressLabel(address: Address): string {
	if (address.kind === 'unix') return `unix:${address.socket}`;
	const host = address.host.includes(':') ? `[${address.host}]` : address.host;
	return `https://${host}:${address.port}`;
}

function sameAddress(a: Address, b: Address): boolean {
	if (a.kind === 'unix') return b.kind === 'unix' && a.socket === b.socket;
	return b.kind === 'tls' && a.host === b.host && a.port === b.port;
}

// ------------------------------------------------------------------------------ file reads

/**
 * Why a path could not be read — the errno CODE only. Never the path, never the errno message
 * (which repeats the path): a token pasted where a path belongs would be echoed otherwise.
 */
function readFailure(error: unknown): string {
	const code = (error as NodeJS.ErrnoException | null)?.code;
	return typeof code === 'string' && /^E[A-Z]+$/.test(code) ? code : 'not a readable regular file';
}

/** A credential at rest: a regular file, not group/other-readable. Its CONTENT never reaches a message. */
function assertPrivateMode(path: string, what: string): void {
	let mode: number;
	try {
		const st = statSync(path);
		if (!st.isFile()) throw new Error('not a regular file');
		mode = st.mode & 0o777;
	} catch (error) {
		throw new PairRefusal(`${what} could not be read (${readFailure(error)}).`);
	}
	if ((mode & 0o077) !== 0) {
		throw new PairRefusal(
			`${what} is readable by group or others (mode ${mode.toString(8)}). It is a credential: chmod 600 it, then re-run.`,
		);
	}
}

function readPrivateFile(path: string, what: string): string {
	assertPrivateMode(path, what);
	return readFileSync(path, 'utf8');
}

/** The fragment. Placeholders only: any mode. Carrying a real token: held to the credential rule. */
function readFragmentFields(path: string): FragmentFields {
	let text: string;
	try {
		text = readFileSync(path, 'utf8');
	} catch (error) {
		throw new PairRefusal(`the fragment could not be read (${readFailure(error)}).`);
	}
	const fields = parseFragment(text);
	if (fields.token !== null) assertPrivateMode(path, 'the fragment (it carries the token)');
	return fields;
}

async function suppliedToken(
	opts: CliOptions,
	readStdin: () => Promise<string>,
): Promise<string | null> {
	if (opts.tokenStdin) return (await readStdin()).trim();
	if (opts.tokenFile !== null) return readPrivateFile(opts.tokenFile, 'the token file').trim();
	return null;
}

// ---------------------------------------------------------------------------- registry slot

function assertSlot(
	registry: RegistryFile,
	command: 'add' | 'replace',
	name: string,
	address: Address,
	fingerprint: string,
): PublicationHostRecord | null {
	const existing = registry.hosts.find((host) => host.name === name) ?? null;
	if (command === 'add' && existing !== null) {
		throw new PairRefusal(
			`a publication host named '${name}' is already registered. Use \`replace\` to re-pair it.`,
		);
	}
	if (command === 'replace' && existing === null) {
		throw new PairRefusal(`no publication host named '${name}' is registered. Use \`add\`.`);
	}
	const twin = registry.hosts.find(
		(host) =>
			host.name !== name &&
			(sameAddress(host.address, address) || host.fingerprint === fingerprint),
	);
	if (twin !== undefined) {
		throw new PairRefusal(
			`this agent is already registered as '${twin.name}'. One agent, one registry entry.`,
		);
	}
	return existing;
}

function buildRecord(
	name: string,
	instance: string,
	address: Address,
	fingerprint: string,
	existing: PublicationHostRecord | null,
): PublicationHostRecord {
	return {
		name,
		instance,
		fingerprint,
		address,
		public_url: existing?.public_url ?? null,
		qualities: existing?.qualities ?? null,
		probe: existing?.probe ?? { published: null, unpublished: null },
		paired_at: new Date().toISOString(),
	};
}

// ------------------------------------------------------------------------------ live proof

/**
 * A crashed earlier run may have left a 0600 staging dir; anything older than an hour goes.
 * An entry that only LOOKS like staging (fails HOST_NAME, so this command never wrote it) is
 * named and left alone: it must never abort the run (remove included).
 */
function sweepStaleStaging(now: number, out: string[]): void {
	const root = secretsRoot();
	// the root itself is judged like the read path judges it (lstat: real dir, 0700, engine
	// uid) BEFORE readdir/rm: a symlinked root is refused, never walked or deleted through
	if (!secretsRootPresent()) return;
	const skip = (entry: string): void => {
		out.push(
			`${TAG} skipped '${entry}' under ${root}: not a staging dir this command writes. Remove it by hand.`,
		);
	};
	for (const entry of readdirSync(root)) {
		if (!entry.startsWith(STAGING_PREFIX)) continue;
		if (!HOST_NAME.test(entry)) {
			skip(entry);
			continue;
		}
		// lstat, never stat: a (dangling) symlink is not a staging dir and is never followed
		let st: ReturnType<typeof lstatSync>;
		try {
			st = lstatSync(join(root, entry));
		} catch {
			skip(entry);
			continue;
		}
		if (!st.isDirectory()) {
			skip(entry);
			continue;
		}
		if (now - st.mtimeMs > STAGING_STALE_MS) removeHostSecrets(entry);
	}
}

/** Exists WITHOUT following a symlink (a dangling link to the root is not "absent"). */
function lexists(path: string): boolean {
	try {
		lstatSync(path);
		return true;
	} catch {
		return false;
	}
}

function assertBundleSplits(staging: string, kind: Address['kind']): void {
	if (kind === 'unix') return;
	let tls: ReturnType<typeof readHostTls> = null;
	try {
		tls = readHostTls(staging);
	} catch {
		tls = null;
	}
	if (tls === null) {
		throw new PairRefusal(
			'the engine bundle is not three PEM blocks — client certificate, client private key (PKCS#8), CA certificate, ' +
				'in that order. Carry the file `provision apply` wrote, unedited.',
		);
	}
}

/**
 * The live proof over the very channel the engine will use. The door takes TLS material
 * only from the secrets store (transport.ts agentRequest — the one-door law), so the proof
 * needs a transient 0600 staging copy; it is removed whatever happens. `dryRun` also
 * removes the secrets root when this proof created it: a dry run leaves no trace.
 */
async function proveStaged(
	record: PublicationHostRecord,
	token: string,
	bundlePem: string | null,
	dryRun: boolean,
	out: string[],
): Promise<void> {
	const staging = `${STAGING_PREFIX}${randomBytes(4).toString('hex')}`;
	const createdRoot = !lexists(secretsRoot());
	try {
		writeHostSecrets(staging, token, bundlePem);
		assertBundleSplits(staging, record.address.kind);
		await proveHostPairing({ ...record, name: staging });
	} finally {
		removeHostSecrets(staging);
		if (dryRun && createdRoot) removeOwnEmptyRoot(out);
	}
}

/**
 * The dry run's own root, removed only while it is still EMPTY. A root a concurrent pair run
 * wrote into is no longer only the dry run's, so it stays (ENOTEMPTY/ENOENT ignored), and
 * no cleanup error ever replaces the proof's own verdict: anything else is a note.
 */
function removeOwnEmptyRoot(out: string[]): void {
	try {
		rmdirSync(secretsRoot());
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === 'ENOTEMPTY' || code === 'EEXIST' || code === 'ENOENT') return;
		out.push(
			`${TAG} note: could not remove the dry run's empty secrets root (${code ?? 'error'}).`,
		);
	}
}

// ------------------------------------------------------------------------------- commands

/**
 * The real write, ALL under the registry lock: the slot is re-checked first, and only a slot
 * that passes gets the secrets — so a refused slot (a concurrent `add` won the name, root
 * removed the host being replaced) writes nothing, never touches another host's credentials,
 * and never leaves a credential no panel lists. Exported for the in-process race gate.
 */
export function commit(
	command: 'add' | 'replace',
	proved: PublicationHostRecord,
	token: string,
	bundlePem: string | null,
): void {
	let wroteSecrets = false;
	try {
		updateRegistry((current) => {
			const existing = assertSlot(
				current,
				command,
				proved.name,
				proved.address,
				proved.fingerprint,
			);
			const record = buildRecord(
				proved.name,
				proved.instance,
				proved.address,
				proved.fingerprint,
				existing,
			);
			wroteSecrets = true;
			writeHostSecrets(proved.name, token, bundlePem);
			return {
				version: 1,
				hosts: [...current.hosts.filter((host) => host.name !== proved.name), record],
			};
		});
	} catch (error) {
		if (!wroteSecrets) throw error;
		// The locked check found the slot as this run needs it, so on add the name was free:
		// the secrets under it are this run's own and may go.
		if (command === 'add') {
			removeHostSecrets(proved.name);
			throw error;
		}
		throw new PairRefusal(
			`the secrets of '${proved.name}' were replaced but the registry was not (${(error as Error).name}). ` +
				'The panel shows pairing_mismatch for it (no bearer is sent) until `replace` is re-run.',
			EXIT.failed,
			true,
		);
	}
}

async function pair(
	opts: CliOptions,
	readStdin: () => Promise<string>,
	out: string[],
): Promise<void> {
	const command = opts.command as 'add' | 'replace';
	const fields = readFragmentFields(opts.fragment ?? '');
	const address = parseAgentAddress(fields);
	const token = resolveToken(fields.token, await suppliedToken(opts, readStdin));
	const bundlePath = resolveBundlePath(address.kind, fields.tlsBundle, opts.bundle);
	const bundlePem = bundlePath === null ? null : readPrivateFile(bundlePath, 'the engine bundle');
	const fingerprint = assertFragmentFingerprint(fields, token);
	const existing = assertSlot(loadRegistry(), command, opts.name, address, fingerprint);
	const record = buildRecord(opts.name, fields.instance, address, fingerprint, existing);
	await proveStaged(record, token, bundlePem, opts.dryRun, out);
	out.push(
		`${TAG} pairing proved: '${opts.name}' → ${addressLabel(address)} (the agent published the expected fingerprint on this channel; no bearer was sent).`,
	);
	if (opts.dryRun) {
		out.push(`${TAG} --dry-run: nothing was kept (the proof's transient staging was removed).`);
		return;
	}
	commit(command, record, token, bundlePem);
	out.push(
		`${TAG} ${command === 'add' ? 'added' : 'replaced'} '${opts.name}': registry ${registryPath()}, secrets ${hostSecretDir(opts.name)} ` +
			`(token${bundlePem === null ? '' : ' + engine bundle'}, 0600). Maintenance → Publication hosts shows its state.`,
	);
}

function remove(name: string, dryRun: boolean, out: string[]): void {
	const existing = loadRegistry().hosts.find((host) => host.name === name) ?? null;
	// The non-throwing read: a host whose secret the engine refuses (bad mode/owner/shape)
	// must still be removable — that is exactly the host an operator wants gone.
	const presence = secretPresenceOutcome(name);
	const leftovers = presence.token_present || presence.bundle_present || presence.refused !== null;
	if (existing === null && !leftovers) {
		throw new PairRefusal(`no publication host named '${name}' (registry: ${registryPath()}).`);
	}
	const what =
		existing === null
			? 'its leftover secrets (no registry entry)'
			: 'its registry entry and secrets';
	if (dryRun) {
		out.push(`${TAG} --dry-run: would remove '${name}': ${what}. Nothing was written.`);
		return;
	}
	// The widget's order: the secrets go INSIDE the lock, before the entry is dropped, so a
	// failed delete leaves the host listed (and removable) rather than an invisible credential.
	if (existing !== null) {
		updateRegistry((current) => {
			removeHostSecrets(name);
			return { version: 1, hosts: current.hosts.filter((host) => host.name !== name) };
		});
	} else {
		removeHostSecrets(name);
	}
	out.push(`${TAG} removed '${name}': ${what}. The agent itself is untouched.`);
}

// ---------------------------------------------------------------------------------- runner

/** parseArgs' own messages repeat the offending argument verbatim: never shown (a pasted token). */
function parseArgv(argv: readonly string[]) {
	try {
		return parseArgs({
			args: [...argv],
			allowPositionals: true,
			strict: true,
			options: {
				fragment: { type: 'string' },
				bundle: { type: 'string' },
				'token-file': { type: 'string' },
				'token-stdin': { type: 'boolean', default: false },
				'dry-run': { type: 'boolean', default: false },
			},
		});
	} catch {
		throw new Error(
			'an option is unknown, misspelled, given a value it does not take, or missing its value (not shown: it may be a pasted token).',
		);
	}
}

function parseCliArgs(argv: readonly string[]): CliOptions {
	const { values, positionals } = parseArgv(argv);
	const [command, name, ...rest] = positionals;
	// Never echo a stray positional: it is exactly where a pasted token would land.
	if (rest.length > 0)
		throw new Error(`${rest.length} unexpected positional argument(s) (not shown).`);
	if (command !== 'add' && command !== 'replace' && command !== 'remove') {
		throw new Error('the command is add, replace or remove.');
	}
	if (name === undefined || !HOST_NAME.test(name) || name.startsWith(STAGING_PREFIX)) {
		throw new Error(
			`the host name must match ${HOST_NAME} and must not start with '${STAGING_PREFIX}' (reserved).`,
		);
	}
	const opts: CliOptions = {
		command,
		name,
		fragment: values.fragment ?? null,
		bundle: values.bundle ?? null,
		tokenFile: values['token-file'] ?? null,
		tokenStdin: values['token-stdin'] === true,
		dryRun: values['dry-run'] === true,
	};
	const pairingInputs =
		opts.fragment !== null || opts.bundle !== null || opts.tokenFile !== null || opts.tokenStdin;
	if (command === 'remove' && pairingInputs)
		throw new Error('remove takes only <name> [--dry-run].');
	if (command !== 'remove' && opts.fragment === null)
		throw new Error(`${command} needs --fragment.`);
	if (opts.tokenFile !== null && opts.tokenStdin)
		throw new Error('--token-file and --token-stdin are exclusive.');
	return opts;
}

function assertOwner(): void {
	let uid: number;
	try {
		uid = statSync(privateDir).uid;
	} catch (error) {
		throw new PairRefusal(
			`the private directory ${privateDir} is not readable (${(error as Error).message}).`,
			EXIT.failed,
		);
	}
	const problem = invocationOwnerProblem(uid, process.geteuid?.() ?? -1);
	if (problem !== null) throw new PairRefusal(problem);
}

const AGENT_VERDICTS: Readonly<Record<string, readonly [number, string]>> = {
	'publication_host.pairing_mismatch': [
		EXIT.refused,
		"pairing_mismatch: the agent at that address published a DIFFERENT fingerprint — the token or instance is not that agent's, the agent was re-provisioned, or the address reaches another agent. No bearer was sent.",
	],
	'publication_host.unreachable': [
		EXIT.failed,
		'unreachable: the agent did not answer on the paired channel (address, firewall, mTLS bundle, or socket group).',
	],
	'publication_host.timeout': [EXIT.failed, 'timeout: the agent did not answer /health in time.'],
};

function classify(error: unknown): readonly [number, string] {
	if (error instanceof PairRefusal)
		return [error.exit, error.wrote ? error.message : `${error.message} Nothing was written.`];
	if (error instanceof RegistryError) {
		if (error.reason === 'locked') {
			return [
				EXIT.failed,
				`the registry ${registryPath()} is locked by another writer. Retry. Nothing was written.`,
			];
		}
		return [
			EXIT.refused,
			`registry_invalid (${error.reason}): ${registryPath()} is not a valid publication-host registry. It is never ` +
				'treated as empty: restore it from a backup or repair it, then re-run. Nothing was written.',
		];
	}
	if (error instanceof SecretError) {
		return [
			EXIT.refused,
			`a secret was refused by the engine's secrets store (${error.reason}). Carry the agent artifacts unedited; ` +
				'a secret dir with a wrong mode or owner: run as the engine user. Nothing was written.',
		];
	}
	if (isDedaloError(error)) {
		const verdict = AGENT_VERDICTS[error.code] ?? [
			EXIT.failed,
			`the agent call failed (${error.code}).`,
		];
		return [verdict[0], `${verdict[1]} Nothing was written.`];
	}
	return [
		EXIT.failed,
		`unexpected failure (${error instanceof Error ? error.name : typeof error}). Nothing was written.`,
	];
}

function text(lines: string[]): string {
	return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
}

export async function runPublicationHostPairCli(
	argv: readonly string[],
	readStdin: () => Promise<string> = () => Bun.stdin.text(),
): Promise<CliResult> {
	let opts: CliOptions;
	try {
		opts = parseCliArgs(argv);
	} catch (error) {
		return { code: EXIT.usage, stdout: '', stderr: `${TAG} ${(error as Error).message}\n${USAGE}` };
	}
	const out: string[] = [];
	try {
		assertOwner();
		if (!opts.dryRun) sweepStaleStaging(Date.now(), out); // a dry run deletes nothing
		if (opts.command === 'remove') remove(opts.name, opts.dryRun, out);
		else await pair(opts, readStdin, out);
		return { code: EXIT.ok, stdout: text(out), stderr: '' };
	} catch (error) {
		const [code, message] = classify(error);
		const verb = code === EXIT.refused ? 'REFUSED' : 'FAILED';
		return { code, stdout: text(out), stderr: `${TAG} ${verb} — ${message}\n` };
	}
}

if (import.meta.main) {
	const result = await runPublicationHostPairCli(process.argv.slice(2));
	if (result.stdout !== '') process.stdout.write(result.stdout);
	if (result.stderr !== '') process.stderr.write(result.stderr);
	process.exit(result.code);
}
