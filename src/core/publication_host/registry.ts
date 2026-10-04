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
	existsSync,
	fstatSync,
	fsyncSync,
	openSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
} from 'node:fs';
import { isIP } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { privateDir } from '../../config/env.ts';
import { fsyncDirectory, writeAllSync } from '../files/durable.ts';

/** Registry key of a host. */
export const HOST_NAME = /^[a-z][a-z0-9_]{1,31}$/;
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
/** A media quality folder name (the rules builder filters it further: phase-1 contract). */
const QUALITY = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,63}$/;
/** A media path relative to `/dedalo/<mediaDir>/` (phase-6 probe records). */
const PROBE_PATH = /^[A-Za-z0-9_][A-Za-z0-9._/-]{0,511}$/;

export const REGISTRY_VERSION = 1;
export const REGISTRY_FILE = 'publication_hosts.json';
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

function validateQualities(value: unknown, where: string): string[] | null {
	if (value === null) return null;
	if (!Array.isArray(value) || value.length === 0) {
		throw shapeError(
			where,
			'must be null or a non-empty array (a host that may serve nothing is a misconfiguration)',
		);
	}
	const names = value.map((quality, index) => matching(quality, QUALITY, `${where}[${index}]`));
	if (new Set(names).size !== names.length) throw shapeError(where, 'must not repeat a quality');
	return names;
}

function probePath(value: unknown, where: string): string | null {
	if (value === null) return null;
	return cleanSegments(matching(value, PROBE_PATH, where), where);
}

function validateProbe(value: unknown, where: string): PublicationHostRecord['probe'] {
	const probe = exactKeys(value, ['published', 'unpublished'], where);
	return {
		published: probePath(probe.published, `${where}.published`),
		unpublished: probePath(probe.unpublished, `${where}.unpublished`),
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

function validateHost(value: unknown, index: number): PublicationHostRecord {
	const where = `hosts[${index}]`;
	const host = exactKeys(value, HOST_KEYS, where);
	return {
		name: matching(host.name, HOST_NAME, `${where}.name`),
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

function readRegistryText(path: string): string | null {
	try {
		return readFileSync(path, 'utf8');
	} catch (error) {
		if (errorCode(error) === 'ENOENT') return null;
		throw new RegistryError('unreadable', `${path} could not be read (${errorCode(error)})`);
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
		const current = statSync(path);
		return held.ino === current.ino && held.dev === current.dev;
	} catch {
		return false;
	}
}

/** One non-blocking attempt; the release function on success, null when held elsewhere. */
function tryLock(path: string, flock: Flock): (() => void) | null {
	const fd = openSync(path, 'a+', 0o600);
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
