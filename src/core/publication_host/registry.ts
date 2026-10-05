/**
 * THE PUBLICATION-HOST REGISTRY — the work engine's list of its publication hosts
 * (engineering/PUBLICATION_HOST_SPEC.md §1.1 + §2; phase-3 decisions E1, E2).
 *
 * ONE FILE, `<private>/publication_hosts.json`, mode 0600, `{"version":1,"hosts":[…]}`,
 * holding NON-SECRET descriptors only. The bearer and the mTLS material live per host in
 * `secrets.ts`, never here. Not `ts_state.json`: `setServerState` is a non-atomic writer and
 * a corrupt state file silently resets to defaults; a host list the operator relies on
 * cannot inherit that.
 *
 * LAWS
 *  - The registry is the trust anchor for WHERE the engine dials: it is read only when it
 *    is a regular file (no symlink, no FIFO), mode exactly 0600, owned by the engine user;
 *    anything else is `unreadable` (shown as registry_invalid). The lock file is opened
 *    without following a symlink.
 *  - An ABSENT file is the empty registry. Any other file that cannot be read, parsed or
 *    validated THROWS a `RegistryError` naming its reason: never an empty list, never a
 *    partial one (Review Focus 2 — the panel shows `registry_invalid`).
 *  - The shape is STRICT: a missing key, an unknown key, a wrong type or a repeated name
 *    is invalid. A hand edit that adds a field is refused, not ignored.
 *  - Writes are ATOMIC and DURABLE (temp 0600 → fsync → rename → fsync of the directory,
 *    `core/files/durable.ts`) and SERIALIZED across processes (the engine and the root
 *    pairing CLI) by `flock(2)` on `<private>/publication_hosts.json.lock`. The kernel
 *    releases that lock when its holder dies, so there is no stale lock to judge and
 *    nothing is ever deleted: the pid-file shape is racy by construction (two waiters
 *    reading one dead pid each delete — the second deletes the first's fresh lock; review
 *    2026-09-30, test/helpers/suite_mariadb_lock.ts). The lock is not re-entrant: a
 *    nested write in the same process is refused as `locked`. flock comes from libc via
 *    bun:ffi — libSystem on macOS, glibc `libc.so.6` on Linux (this project's targets);
 *    a libc without that name fails the first WRITE loudly, reads are unaffected.
 *  - Every path goes through `publicationHostsBase()` — `privateDir`, or the test seam,
 *    which accepts only a temp directory that DECLARES itself one (marker file).
 */

import { dlopen, FFIType } from 'bun:ffi';
import {
	chmodSync,
	closeSync,
	constants,
	existsSync,
	fstatSync,
	fsyncSync,
	lstatSync,
	openSync,
	renameSync,
	rmSync,
} from 'node:fs';
import { isIP } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { privateDir } from '../../config/env.ts';
import { readBoundedSync } from '../files/bounded_read.ts';
import { fsyncDirectory, writeAllSync } from '../files/durable.ts';

/** Registry key of a host. */
export const HOST_NAME = /^[a-z][a-z0-9_]{1,31}$/;
/**
 * Reserved for the pairing CLI's live-proof staging dirs (scripts/publication_host_pair.ts).
 * No registered host may carry it, so the CLI's stale-staging sweep can never delete a
 * registered host's secrets.
 */
export const RESERVED_HOST_PREFIX = 'pairing_' as const;
/** The agent's INSTANCE (publication/host_agent/src/config.ts INSTANCE_PATTERN). */
const INSTANCE_NAME = /^[a-z][a-z0-9_]{1,31}$/;
/** sha256 lowercase hex — what the agent publishes as `instance_fingerprint`. */
const FINGERPRINT = /^[0-9a-f]{64}$/;
/** RFC 1123 host name (IP literals are accepted through `isIP`). */
const DNS_NAME =
	/^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;
/** An absolute unix socket path, no shell- or URL-significant characters. */
const SOCKET_PATH = /^\/[A-Za-z0-9._/-]+$/;
/** sun_path is 104 bytes on macOS (NUL included), 108 on Linux: the stricter target wins. */
const MAX_SOCKET_PATH_BYTES = 103;
/**
 * A public media quality, in the engine's own grammar: `/`-separated folders under the media
 * dir (`image/1.5MB`, `av/404`), each segment starting with `[A-Za-z0-9_]`, no `..` anywhere.
 * The rules builder filters it further (filterPublicQualities: no master tier, >= 2 segments).
 * A bare-folder grammar here refused every real public quality (Task 7 review, 2026-10-04).
 */
const QUALITY = /^[A-Za-z0-9_][A-Za-z0-9._-]*(?:\/[A-Za-z0-9_][A-Za-z0-9._-]*)*$/;
const MAX_QUALITY_LENGTH = 128;
/** A media path relative to `/dedalo/<mediaDir>/` (phase-6 probe records). */
const PROBE_PATH = /^[A-Za-z0-9_][A-Za-z0-9._/-]{0,511}$/;

export const REGISTRY_VERSION = 1;
export const REGISTRY_FILE = 'publication_hosts.json';
/**
 * The most bytes a registry read takes. The read is synchronous (it also runs under the
 * flock, see updateRegistry), so it is CAPPED rather than sized by the file: ~1 KiB per
 * host leaves room for a thousand, and a file past it is `unreadable`, never parsed.
 */
export const REGISTRY_MAX_BYTES = 1024 * 1024;
/** The marker a temp directory must carry before the test seam will point the stores at it. */
export const PUBLICATION_HOSTS_TEST_MARKER = '.dedalo_test_publication_hosts';

const HOST_KEYS = [
	'name',
	'instance',
	'fingerprint',
	'address',
	'public_url',
	'qualities',
	'probe',
	'paired_at',
] as const;

/** How long a writer waits for the lock before refusing. Holders hold it for one small file write. */
const LOCK_WAIT_MS = 500;
const LOCK_POLL_MS = 10;
const LOCK_EX = 2;
const LOCK_NB = 4;
const LOCK_UN = 8;

export type PublicationHostAddress =
	| { kind: 'tls'; host: string; port: number }
	| { kind: 'unix'; socket: string };

export interface PublicationHostRecord {
	name: string;
	instance: string;
	fingerprint: string;
	address: PublicationHostAddress;
	public_url: string | null;
	qualities: string[] | null;
	probe: { published: string | null; unpublished: string | null };
	paired_at: string;
}

export interface RegistryFile {
	version: 1;
	hosts: PublicationHostRecord[];
}

export type RegistryErrorReason =
	| 'unreadable'
	| 'invalid_json'
	| 'invalid_shape'
	| 'duplicate_name'
	| 'locked';

/** Every failure of this store. The message names a path and a field, never file contents. */
export class RegistryError extends Error {
	readonly reason: RegistryErrorReason;

	constructor(reason: RegistryErrorReason, detail: string) {
		super(`publication host registry (${reason}): ${detail}`);
		this.name = 'RegistryError';
		this.reason = reason;
	}
}

// ---------------------------------------------------------------------------
// Paths + the test seam
// ---------------------------------------------------------------------------

/**
 * Test seam: a temp directory that carries PUBLICATION_HOSTS_TEST_MARKER replaces
 * `privateDir` for this store and secrets.ts. Anything else is refused, so no test can
 * point these writers at a real private dir. null restores production resolution.
 */
let baseOverrideForTests: string | null = null;

export function overridePublicationHostsBaseForTests(base: string | null): void {
	if (base !== null && !isDeclaredScratch(base)) {
		throw new RangeError(
			`overridePublicationHostsBaseForTests accepts only a temp directory carrying ${PUBLICATION_HOSTS_TEST_MARKER}`,
		);
	}
	baseOverrideForTests = base;
}

function isDeclaredScratch(base: string): boolean {
	const path = resolve(base);
	return (
		path.startsWith(resolve(tmpdir()) + sep) &&
		existsSync(join(path, PUBLICATION_HOSTS_TEST_MARKER))
	);
}

/** `<private>` in production; the declared scratch dir under the test seam. */
export function publicationHostsBase(): string {
	return baseOverrideForTests ?? privateDir;
}

/** `<private>/publication_hosts.json`. */
export function registryPath(): string {
	return join(publicationHostsBase(), REGISTRY_FILE);
}

function lockPath(): string {
	return `${registryPath()}.lock`;
}

// ---------------------------------------------------------------------------
// Validation (pure)
// ---------------------------------------------------------------------------

function shapeError(where: string, what: string): RegistryError {
	return new RegistryError('invalid_shape', `${where} ${what}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(
	value: unknown,
	keys: readonly string[],
	where: string,
): Record<string, unknown> {
	if (!isPlainObject(value)) throw shapeError(where, 'must be an object');
	const found = Object.keys(value).sort().join(', ');
	const expected = [...keys].sort().join(', ');
	if (found !== expected) {
		throw shapeError(where, `must have exactly the keys [${expected}], found [${found}]`);
	}
	return value;
}

function matching(value: unknown, pattern: RegExp, where: string): string {
	if (typeof value !== 'string' || !pattern.test(value)) {
		throw shapeError(where, `must be a string matching ${pattern.source}`);
	}
	return value;
}

function cleanSegments(path: string, where: string): string {
	const bad = path.split('/').some((segment) => ['', '.', '..'].includes(segment));
	if (bad) throw shapeError(where, 'must not contain empty, "." or ".." segments');
	return path;
}

function validTlsHost(host: unknown): host is string {
	return typeof host === 'string' && (isIP(host) !== 0 || DNS_NAME.test(host));
}

function validateTlsAddress(value: unknown, where: string): PublicationHostAddress {
	const address = exactKeys(value, ['kind', 'host', 'port'], where);
	if (!validTlsHost(address.host)) {
		throw shapeError(`${where}.host`, 'must be a DNS name or an IP address');
	}
	const port = address.port;
	if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) {
		throw shapeError(`${where}.port`, 'must be an integer 1-65535');
	}
	return { kind: 'tls', host: address.host, port };
}

function validateUnixAddress(value: unknown, where: string): PublicationHostAddress {
	const address = exactKeys(value, ['kind', 'socket'], where);
	const socket = matching(address.socket, SOCKET_PATH, `${where}.socket`);
	if (Buffer.byteLength(socket) > MAX_SOCKET_PATH_BYTES) {
		throw shapeError(`${where}.socket`, `must be at most ${MAX_SOCKET_PATH_BYTES} bytes`);
	}
	cleanSegments(socket.slice(1), `${where}.socket`);
	return { kind: 'unix', socket };
}

function validateAddress(value: unknown, where: string): PublicationHostAddress {
	const kind = isPlainObject(value) ? value.kind : undefined;
	if (kind === 'tls') return validateTlsAddress(value, where);
	if (kind === 'unix') return validateUnixAddress(value, where);
	throw shapeError(`${where}.kind`, "must be 'tls' or 'unix'");
}

function isHttpsOrigin(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === 'https:' && url.origin === value;
	} catch {
		return false;
	}
}

function validatePublicUrl(value: unknown, where: string): string | null {
	if (value === null) return null;
	if (typeof value !== 'string' || !isHttpsOrigin(value)) {
		throw shapeError(where, 'must be null or an https origin (https://host[:port], no path)');
	}
	return value;
}

function qualityName(value: unknown, where: string): string {
	const quality = matching(value, QUALITY, where);
	if (quality.length > MAX_QUALITY_LENGTH || quality.includes('..')) {
		throw shapeError(where, `must be at most ${MAX_QUALITY_LENGTH} characters, without '..'`);
	}
	return quality;
}

/**
 * The registry's own `qualities` check, exported so a writer (the publication_hosts widget)
 * judges a field by the SAME grammar saveRegistry will apply: one grammar, no drift where
 * the writer accepts what the registry then refuses as a corrupt file.
 */
export function validateQualities(value: unknown, where = 'qualities'): string[] | null {
	if (value === null) return null;
	if (!Array.isArray(value) || value.length === 0) {
		throw shapeError(
			where,
			'must be null or a non-empty array (a host that may serve nothing is a misconfiguration)',
		);
	}
	const names = value.map((quality, index) => qualityName(quality, `${where}[${index}]`));
	if (new Set(names).size !== names.length) throw shapeError(where, 'must not repeat a quality');
	return names;
}

/** The registry's own probe-path check, exported for the same reason as validateQualities. */
export function validateProbePath(value: unknown, where = 'probe'): string | null {
	if (value === null) return null;
	return cleanSegments(matching(value, PROBE_PATH, where), where);
}

function validateProbe(value: unknown, where: string): PublicationHostRecord['probe'] {
	const probe = exactKeys(value, ['published', 'unpublished'], where);
	return {
		published: validateProbePath(probe.published, `${where}.published`),
		unpublished: validateProbePath(probe.unpublished, `${where}.unpublished`),
	};
}

function isCanonicalIso(value: string): boolean {
	const time = Date.parse(value);
	return !Number.isNaN(time) && new Date(time).toISOString() === value;
}

function validatePairedAt(value: unknown, where: string): string {
	if (typeof value !== 'string' || !isCanonicalIso(value)) {
		throw shapeError(where, 'must be an ISO-8601 UTC timestamp (Date.toISOString())');
	}
	return value;
}

function hostNameField(value: unknown, where: string): string {
	const name = matching(value, HOST_NAME, where);
	if (name.startsWith(RESERVED_HOST_PREFIX)) {
		throw shapeError(
			where,
			`must not start with '${RESERVED_HOST_PREFIX}' (reserved for pairing staging)`,
		);
	}
	return name;
}

function validateHost(value: unknown, index: number): PublicationHostRecord {
	const where = `hosts[${index}]`;
	const host = exactKeys(value, HOST_KEYS, where);
	return {
		name: hostNameField(host.name, `${where}.name`),
		instance: matching(host.instance, INSTANCE_NAME, `${where}.instance`),
		fingerprint: matching(host.fingerprint, FINGERPRINT, `${where}.fingerprint`),
		address: validateAddress(host.address, `${where}.address`),
		public_url: validatePublicUrl(host.public_url, `${where}.public_url`),
		qualities: validateQualities(host.qualities, `${where}.qualities`),
		probe: validateProbe(host.probe, `${where}.probe`),
		paired_at: validatePairedAt(host.paired_at, `${where}.paired_at`),
	};
}

function assertUniqueNames(hosts: readonly PublicationHostRecord[]): void {
	const seen = new Set<string>();
	for (const host of hosts) {
		if (seen.has(host.name)) {
			throw new RegistryError('duplicate_name', `host '${host.name}' is listed more than once`);
		}
		seen.add(host.name);
	}
}

/** The whole-file validator. Returns a fresh, fully-typed copy; throws RegistryError. */
export function validateRegistry(value: unknown): RegistryFile {
	const file = exactKeys(value, ['version', 'hosts'], 'registry');
	if (file.version !== REGISTRY_VERSION) {
		throw shapeError('registry.version', `must be ${REGISTRY_VERSION}`);
	}
	if (!Array.isArray(file.hosts)) throw shapeError('registry.hosts', 'must be an array');
	const hosts = file.hosts.map((host: unknown, index: number) => validateHost(host, index));
	assertUniqueNames(hosts);
	return { version: REGISTRY_VERSION, hosts };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

function errorCode(error: unknown): string {
	const code = (error as { code?: unknown } | null)?.code;
	return typeof code === 'string' ? code : 'unknown';
}

/** The capped read of an open registry file: a file past the cap is refused, never read. */
function readOpenRegistry(fd: number, path: string): string {
	const bytes = readBoundedSync(fd, REGISTRY_MAX_BYTES);
	if (bytes === null) {
		throw new RegistryError('unreadable', `${path} exceeds ${REGISTRY_MAX_BYTES} bytes`);
	}
	return bytes.toString('utf8');
}

/**
 * The registry is the trust anchor for WHERE the engine dials, so it is read the way a
 * secret is (secrets.ts readSecretFile): no symlink (O_NOFOLLOW), never blocking on a FIFO
 * (O_NONBLOCK), and only a regular file of mode exactly 0600 owned by the engine user.
 * Anything else is `unreadable` — the panel shows registry_invalid, nothing is dialled.
 */
const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;

function assertPrivateFile(fd: number, path: string): void {
	const stat = fstatSync(fd);
	if (!stat.isFile()) throw new RegistryError('unreadable', `${path} must be a regular file`);
	const mode = stat.mode & 0o777;
	if (mode !== 0o600) {
		throw new RegistryError('unreadable', `${path} must be mode 600, found ${mode.toString(8)}`);
	}
	if (stat.uid !== process.geteuid?.()) {
		throw new RegistryError('unreadable', `${path} must be owned by the engine user`);
	}
}

function openRefusal(path: string, error: unknown): RegistryError {
	const code = errorCode(error);
	return code === 'ELOOP'
		? new RegistryError('unreadable', `${path} must be a regular file, not a symlink`)
		: new RegistryError('unreadable', `${path} could not be read (${code})`);
}

function readRegistryText(path: string): string | null {
	let fd: number;
	try {
		fd = openSync(path, READ_FLAGS);
	} catch (error) {
		if (errorCode(error) === 'ENOENT') return null;
		throw openRefusal(path, error);
	}
	try {
		assertPrivateFile(fd, path);
		return readOpenRegistry(fd, path);
	} catch (error) {
		if (error instanceof RegistryError) throw error;
		throw new RegistryError('unreadable', `${path} could not be read (${errorCode(error)})`);
	} finally {
		closeSync(fd);
	}
}

function parseRegistryJson(text: string, path: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		throw new RegistryError('invalid_json', `${path} is not valid JSON`);
	}
}

/** Absent file → `{version:1,hosts:[]}`; anything else invalid → throws RegistryError. */
export function loadRegistry(): RegistryFile {
	const path = registryPath();
	const text = readRegistryText(path);
	if (text === null) return { version: REGISTRY_VERSION, hosts: [] };
	return validateRegistry(parseRegistryJson(text, path));
}

/** One host by name, or null. Throws RegistryError like loadRegistry. */
export function getHost(name: string): PublicationHostRecord | null {
	return loadRegistry().hosts.find((host) => host.name === name) ?? null;
}

// ---------------------------------------------------------------------------
// Write (atomic, durable, locked)
// ---------------------------------------------------------------------------

function writeRegistryFile(next: RegistryFile): RegistryFile {
	// Round-trip through JSON first: what is validated is exactly what is written.
	const valid = validateRegistry(JSON.parse(JSON.stringify(next)));
	const path = registryPath();
	const temp = `${path}.tmp-${process.pid}`;
	rmSync(temp, { force: true });
	const fd = openSync(temp, 'wx', 0o600);
	try {
		writeAllSync(fd, new TextEncoder().encode(`${JSON.stringify(valid, null, '\t')}\n`));
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
	try {
		chmodSync(temp, 0o600); // the umask may have narrowed it; the mode is exact either way
		renameSync(temp, path);
	} finally {
		rmSync(temp, { force: true });
	}
	fsyncDirectory(dirname(path));
	return valid;
}

type Flock = (fd: number, operation: number) => number;

function loadLibc(): { flock: Flock; close: () => void } {
	const path = process.platform === 'darwin' ? '/usr/lib/libSystem.B.dylib' : 'libc.so.6';
	const lib = dlopen(path, { flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 } });
	return { flock: lib.symbols.flock, close: () => lib.close() };
}

/** Is `fd` still the file at `path`? (someone may have deleted and re-created the lock file) */
function isCurrent(fd: number, path: string): boolean {
	try {
		const held = fstatSync(fd);
		const current = lstatSync(path);
		return held.ino === current.ino && held.dev === current.dev;
	} catch {
		return false;
	}
}

/** 'a+' without following a symlink: a planted link never redirects the lock file. */
const LOCK_FLAGS = constants.O_RDWR | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW;

function openLockFile(path: string): number {
	let fd: number;
	try {
		fd = openSync(path, LOCK_FLAGS, 0o600);
	} catch (error) {
		throw openRefusal(path, error);
	}
	if (!fstatSync(fd).isFile()) {
		closeSync(fd);
		throw new RegistryError('unreadable', `${path} must be a regular file`);
	}
	return fd;
}

/** One non-blocking attempt; the release function on success, null when held elsewhere. */
function tryLock(path: string, flock: Flock): (() => void) | null {
	const fd = openLockFile(path);
	if (flock(fd, LOCK_EX | LOCK_NB) === 0 && isCurrent(fd, path)) {
		return () => {
			flock(fd, LOCK_UN);
			closeSync(fd);
		};
	}
	closeSync(fd); // closing the descriptor drops any lock it took
	return null;
}

function acquireLock(path: string, flock: Flock): () => void {
	const deadline = Date.now() + LOCK_WAIT_MS;
	for (;;) {
		const release = tryLock(path, flock);
		if (release !== null) return release;
		if (Date.now() > deadline) {
			throw new RegistryError(
				'locked',
				`${path} is held by another writer (the pairing CLI or a panel action); retry when it finishes`,
			);
		}
		Bun.sleepSync(LOCK_POLL_MS);
	}
}

function withRegistryLock<T>(body: () => T): T {
	const libc = loadLibc();
	try {
		const release = acquireLock(lockPath(), libc.flock);
		try {
			return body();
		} finally {
			release();
		}
	} finally {
		libc.close();
	}
}

/** Validate → temp (0600) → fsync → rename → fsync dir, under the lock. */
export function saveRegistry(next: RegistryFile): void {
	withRegistryLock(() => writeRegistryFile(next));
}

/**
 * Load + `fn` + save under ONE lock hold: no other writer can interleave between the
 * read and the write. A throw from `fn`, from the load or from validation writes nothing.
 */
export function updateRegistry(fn: (current: RegistryFile) => RegistryFile): RegistryFile {
	return withRegistryLock(() => writeRegistryFile(fn(loadRegistry())));
}
