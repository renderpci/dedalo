/**
 * PUBLICATION-HOST SECRETS — the per-host credentials the engine presents to a paired
 * agent (engineering/PUBLICATION_HOST_SPEC.md §2; phase-3 decision E3).
 *
 *   <private>/publication_hosts/            0700
 *   <private>/publication_hosts/<name>/     0700
 *     token              0600  the agent's SERVICE_TOKEN (≥ 32 printable chars, one line)
 *     engine_bundle.pem  0600  client certificate, client private key (PKCS#8), CA
 *                              certificate — in that order, exactly as the agent's
 *                              provisioner issues it (phase 2, D2). ABSENT for a host
 *                              paired over a unix socket (spec §1.1: no mTLS there).
 *
 * LAWS
 *  - Never in the registry file, never in ts_state.json, never in a payload, never in a
 *    log line. No message built here quotes a byte of a secret: a SecretError names the
 *    file and what is wrong with it, nothing else.
 *  - A secret whose file or directory is not owned by the engine user with the exact
 *    mode above, or that the engine user cannot open, is REFUSED, not used (`bad_mode` /
 *    `bad_owner`); a symlink is refused. On every read the secrets root AND the host dir
 *    are lstat'ed (a symlinked, non-directory or widened one is bad_mode/bad_owner) before
 *    the file is opened O_NOFOLLOW|O_NONBLOCK (a FIFO never blocks the loop). A
 *    non-directory where a directory belongs (ENOTDIR) is a refusal, never absence.
 *    Absence is not an error: `null` / `*_present: false`.
 *  - A bundle is checked for coherence before it is used or stored: the key matches the
 *    client certificate and the CA signed it (a mixed-up bundle names itself here, not
 *    as an opaque TLS failure on the first call).
 *  - TWO PRESENCE READS. `secretPresence` THROWS on a present-but-refused secret (callers
 *    that must stop: the pair CLI). `secretPresenceOutcome` NEVER throws a SecretError: it
 *    returns the refusal reason beside the booleans, so a panel listing N hosts renders
 *    every row even when one host's secret dir is broken (phase-3 E1).
 *  - Writes (the pairing CLI only) are temp 0600 → fsync → rename → fsync dir.
 */

import { createPrivateKey, X509Certificate } from 'node:crypto';
import {
	chmodSync,
	closeSync,
	constants,
	existsSync,
	fstatSync,
	fsyncSync,
	lstatSync,
	mkdirSync,
	openSync,
	renameSync,
	rmSync,
	type Stats,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { readBoundedSync } from '../files/bounded_read.ts';
import { fsyncDirectory, writeAllSync } from '../files/durable.ts';
import { HOST_NAME, publicationHostsBase } from './registry.ts';

export const HOST_SECRETS_DIR = 'publication_hosts';
export const TOKEN_FILE = 'token';
export const BUNDLE_FILE = 'engine_bundle.pem';
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;
/**
 * One bearer: printable ASCII, no space (it rides an Authorization header), 32–1024 chars.
 * THE one bearer grammar: transport.ts imports it, so a token this store accepts is never
 * refused by the door (the agent's own SERVICE_TOKEN bound is ≥ 32, no maximum).
 */
export const TOKEN_SHAPE = /^[\x21-\x7e]{32,1024}$/;
/**
 * The most bytes one secret read takes. Reads are synchronous on the panel's request path,
 * so they are CAPPED rather than sized by the file: a token is ≤ 1025 bytes and an engine
 * bundle (cert + PKCS#8 key + CA) a few KiB, so a file past this is refused, never read.
 */
export const SECRET_MAX_BYTES = 64 * 1024;
const PEM_BLOCK =
	/-----BEGIN ([A-Z0-9 ]+)-----\r?\n[A-Za-z0-9+/=\r\n]+?-----END \1-----(?:\r?\n|$)/g;
const BUNDLE_LAYOUT = 'CERTIFICATE|PRIVATE KEY|CERTIFICATE';
/** open(2) refusals that mean "the engine user may not read this" — a refusal, not a crash. */
const UNREADABLE_CODES: ReadonlySet<string> = new Set(['EACCES', 'EPERM']);

export interface HostTls {
	cert: string;
	key: string;
	ca: string;
}

export type SecretErrorReason = 'bad_name' | 'bad_mode' | 'bad_owner' | 'bad_token' | 'bad_bundle';

/** What the panel reads: presence of a USABLE secret, plus why one was refused. */
export interface SecretPresenceOutcome {
	/** true only for a present AND accepted token. */
	token_present: boolean;
	/** true only for a present AND accepted engine bundle. */
	bundle_present: boolean;
	/** The first refusal (token checked first), or null when nothing present was refused. */
	refused: SecretErrorReason | null;
}

/** Every failure of this store. The message names a path and a rule, never a secret byte. */
export class SecretError extends Error {
	readonly reason: SecretErrorReason;

	constructor(reason: SecretErrorReason, detail: string) {
		super(`publication host secret (${reason}): ${detail}`);
		this.name = 'SecretError';
		this.reason = reason;
	}
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** `<private>/publication_hosts` — the 0700 parent of every host's secret dir. */
export function secretsRoot(): string {
	return join(publicationHostsBase(), HOST_SECRETS_DIR);
}

/** `<private>/publication_hosts/<name>` (0700). The name is validated: it is a path segment. */
export function hostSecretDir(name: string): string {
	if (!HOST_NAME.test(name)) {
		throw new SecretError('bad_name', `'${name}' must match ${HOST_NAME.source}`);
	}
	return join(secretsRoot(), name);
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function errorCode(error: unknown): string {
	const code = (error as { code?: unknown } | null)?.code;
	return typeof code === 'string' ? code : 'unknown';
}

function assertPrivate(path: string, stat: Stats, mode: number): void {
	const actual = stat.mode & 0o777;
	if (actual !== mode) {
		throw new SecretError(
			'bad_mode',
			`${path} must be mode ${mode.toString(8)}, found ${actual.toString(8)}`,
		);
	}
	if (stat.uid !== process.geteuid?.()) {
		throw new SecretError('bad_owner', `${path} must be owned by the engine user`);
	}
}

/** The SecretError an open(2) failure means, or null when it is not a refusal. */
function openRefusal(path: string, code: string): SecretError | null {
	if (code === 'ELOOP') {
		return new SecretError('bad_mode', `${path} must be a regular file, not a symlink`);
	}
	if (UNREADABLE_CODES.has(code)) {
		return new SecretError('bad_mode', `${path} is not readable by the engine user (${code})`);
	}
	return null;
}

/**
 * Open for reading without following a symlink and without blocking (a FIFO opens, then
 * fails the regular-file check); null when absent. ENOTDIR means a path component is not
 * a directory — a broken store, refused as bad_mode, never reported as absence.
 */
function openIfPresent(path: string): number | null {
	try {
		return openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
	} catch (error) {
		const code = errorCode(error);
		if (code === 'ENOENT') return null;
		if (code === 'ENOTDIR') {
			return throwBadMode(`${dirname(path)} must be a directory`);
		}
		throw openRefusal(path, code) ?? error;
	}
}

function throwBadMode(detail: string): never {
	throw new SecretError('bad_mode', detail);
}

/**
 * A 0700 directory of the store, judged WITHOUT following a symlink (lstat): absent →
 * false; a symlink, a regular file or any other node → bad_mode; a real directory with
 * another mode or owner → bad_mode / bad_owner.
 */
function privateDirPresent(path: string): boolean {
	let stat: Stats;
	try {
		stat = lstatSync(path);
	} catch (error) {
		const code = errorCode(error);
		if (code === 'ENOENT') return false;
		if (code === 'ENOTDIR') return throwBadMode(`${dirname(path)} must be a directory`);
		throw openRefusal(path, code) ?? error;
	}
	if (!stat.isDirectory()) {
		throwBadMode(`${path} must be a real directory (not a symlink or a file)`);
	}
	assertPrivate(path, stat, DIR_MODE);
	return true;
}

/**
 * The checked text of a secret file, or null when it (or its directory) is absent. The
 * read is CAPPED at SECRET_MAX_BYTES: a larger file is refused as `oversize`, unread.
 */
function readSecretFile(path: string, oversize: SecretErrorReason): string | null {
	// the root and the host dir are lstat'ed first: a symlinked or widened directory is
	// refused before anything under it is opened. Both are engine-owned 0700, so no other
	// uid can swap them between this check and the O_NOFOLLOW open below.
	if (!privateDirPresent(secretsRoot())) return null;
	if (!privateDirPresent(dirname(path))) return null;
	const fd = openIfPresent(path);
	if (fd === null) return null;
	try {
		const stat = fstatSync(fd);
		if (!stat.isFile()) throw new SecretError('bad_mode', `${path} must be a regular file`);
		assertPrivate(path, stat, FILE_MODE);
		const bytes = readBoundedSync(fd, SECRET_MAX_BYTES);
		if (bytes === null)
			throw new SecretError(oversize, `${path} exceeds ${SECRET_MAX_BYTES} bytes`);
		return bytes.toString('utf8');
	} finally {
		closeSync(fd);
	}
}

function assertToken(token: string, source: string): string {
	if (!TOKEN_SHAPE.test(token)) {
		throw new SecretError(
			'bad_token',
			`${source} must hold one token of 32-1024 printable ASCII characters (no spaces)`,
		);
	}
	return token;
}

function bundleIsCoherent(tls: HostTls): boolean {
	try {
		const cert = new X509Certificate(tls.cert);
		const ca = new X509Certificate(tls.ca);
		return cert.checkPrivateKey(createPrivateKey(tls.key)) && ca.ca && cert.verify(ca.publicKey);
	} catch {
		return false;
	}
}

/** The three PEM blocks in bundle order, or null for any other layout or stray text. */
function bundleBlocks(pem: string): [string, string, string] | null {
	const blocks = [...pem.matchAll(PEM_BLOCK)];
	const layout = blocks.map((match) => match[1]).join('|');
	const outside = pem.replace(PEM_BLOCK, '').trim();
	if (layout !== BUNDLE_LAYOUT || outside !== '') return null;
	const [cert, key, ca] = blocks.map((match) => match[0]);
	return cert && key && ca ? [cert, key, ca] : null;
}

/**
 * Split an engine bundle into its three PEM blocks. Pure. Refuses any other layout,
 * any text outside the blocks, and a bundle whose pieces do not belong together.
 */
export function splitEngineBundle(pem: string, source: string): HostTls {
	const blocks = bundleBlocks(pem);
	if (blocks === null) {
		throw new SecretError(
			'bad_bundle',
			`${source} must hold exactly a client certificate, its PKCS#8 private key and the CA certificate, in that order`,
		);
	}
	const tls = { cert: blocks[0], key: blocks[1], ca: blocks[2] };
	if (!bundleIsCoherent(tls)) {
		throw new SecretError(
			'bad_bundle',
			`${source}: the key does not match the client certificate, or the CA did not sign it`,
		);
	}
	return tls;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** The bearer, or null when absent. Throws SecretError on a bad mode/owner or shape. */
export function readHostToken(name: string): string | null {
	const path = join(hostSecretDir(name), TOKEN_FILE);
	const text = readSecretFile(path, 'bad_token');
	if (text === null) return null;
	return assertToken(text.endsWith('\n') ? text.slice(0, -1) : text, path);
}

/** The engine's TLS material for `name`, or null when absent. Throws SecretError. */
export function readHostTls(name: string): HostTls | null {
	const path = join(hostSecretDir(name), BUNDLE_FILE);
	const text = readSecretFile(path, 'bad_bundle');
	return text === null ? null : splitEngineBundle(text, path);
}

/**
 * Presence, STRICT: checks mode, owner and shape, and THROWS SecretError on a present but
 * refused secret. For a caller that must stop on one (the pair CLI). A panel uses
 * secretPresenceOutcome.
 */
export function secretPresence(name: string): { token_present: boolean; bundle_present: boolean } {
	return {
		token_present: readHostToken(name) !== null,
		bundle_present: readHostTls(name) !== null,
	};
}

function presenceOf(read: () => unknown): { present: boolean; refused: SecretErrorReason | null } {
	try {
		return { present: read() !== null, refused: null };
	} catch (error) {
		if (error instanceof SecretError) return { present: false, refused: error.reason };
		throw error;
	}
}

/**
 * Presence for the panel: the same checks, but a refused secret is REPORTED (`refused`,
 * the reason), never thrown and never reported as plain absence. Throws only what is not
 * a SecretError (an engine bug).
 */
export function secretPresenceOutcome(name: string): SecretPresenceOutcome {
	const token = presenceOf(() => readHostToken(name));
	const bundle = presenceOf(() => readHostTls(name));
	return {
		token_present: token.present,
		bundle_present: bundle.present,
		refused: token.refused ?? bundle.refused,
	};
}

// ---------------------------------------------------------------------------
// Write (the pairing CLI only)
// ---------------------------------------------------------------------------

function ensurePrivateDir(dir: string): void {
	mkdirSync(dir, { recursive: true, mode: DIR_MODE });
	// refuse a symlink BEFORE chmod (chmod follows one): a planted link is never written through
	if (!lstatSync(dir).isDirectory()) {
		throwBadMode(`${dir} must be a real directory (not a symlink or a file)`);
	}
	chmodSync(dir, DIR_MODE); // exact, whatever the umask or an older mode was
	fsyncDirectory(dirname(dir));
}

function writeSecretFile(path: string, body: string): void {
	const temp = `${path}.tmp-${process.pid}`;
	rmSync(temp, { force: true });
	const fd = openSync(temp, 'wx', FILE_MODE);
	try {
		writeAllSync(fd, new TextEncoder().encode(body));
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
	try {
		chmodSync(temp, FILE_MODE);
		renameSync(temp, path);
	} finally {
		rmSync(temp, { force: true });
	}
}

/**
 * Store `name`'s secrets. `bundlePem` null = a host with no engine bundle (a unix-socket
 * pairing): only `token` is written and a stale `engine_bundle.pem` from an earlier mTLS
 * pairing is REMOVED. An empty string is not "no bundle": it is refused as `bad_bundle`.
 * Everything is validated BEFORE anything is written, so a bad token or a mixed-up bundle
 * leaves the previous secrets untouched.
 */
export function writeHostSecrets(name: string, token: string, bundlePem: string | null): void {
	const dir = hostSecretDir(name);
	assertToken(token, 'the token');
	if (bundlePem !== null) splitEngineBundle(bundlePem, 'the engine bundle');
	ensurePrivateDir(secretsRoot());
	ensurePrivateDir(dir);
	writeSecretFile(join(dir, TOKEN_FILE), `${token}\n`);
	if (bundlePem === null) rmSync(join(dir, BUNDLE_FILE), { force: true });
	else writeSecretFile(join(dir, BUNDLE_FILE), bundlePem);
	fsyncDirectory(dir);
}

/** Remove `name`'s secret dir (absent is fine). */
export function removeHostSecrets(name: string): void {
	const dir = hostSecretDir(name);
	rmSync(dir, { recursive: true, force: true });
	if (existsSync(secretsRoot())) fsyncDirectory(secretsRoot());
}
