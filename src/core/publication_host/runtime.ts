/**
 * PUBLICATION-HOST RUNTIME STATE — the last OBSERVED result per paired host for phases 4–6:
 * the API releases pushed (v1/v2), the media-copy progress and its verified deletions, and
 * the public-URL probe verdict. File: `<dir of the registry>/publication_hosts_runtime.json`,
 * mode 0600, envelope `{"version":1,"hosts":{"<name>":HostRuntime}}`.
 *
 * SEPARATE FROM THE REGISTRY (registry.ts) ON PURPOSE: the registry is what the operator
 * DECLARED (paired by the root CLI, rarely written); this file is what the engine OBSERVED
 * (rewritten by every reconcile and probe). Both are read, written and locked ONLY through
 * the atomic JSON kernel (core/files/atomic_json.ts): regular 0600 engine-owned file, no
 * symlink, bounded read AND write, temp→fsync→rename→dir-fsync, flock — one implementation
 * (pinned by publication_host_runtime_native.test.ts).
 *
 * ASYNC ON PURPOSE. The publication_hosts widget and the reconcile definitions reach this
 * module from the API dispatch table, and the file grows with pending_deletions: it is read
 * with the kernel's ASYNC reader and locked with the kernel's ASYNC lock (its bounded wait
 * yields the event loop). The transform `fn` stays SYNCHRONOUS: one read, one pure
 * transform, one write under the lock — never an agent call, and never a nested update
 * (the lock is not re-entrant: a nested update is refused as `locked`).
 *
 * CORRUPT IS LOUD, NEVER A RESET. A file that cannot be read, does not parse or does not
 * have the exact shape (strict keys, like the registry) rejects with RuntimeStateError from
 * load, and update/remove REFUSE to overwrite it. Silently resetting would erase pending
 * deletions the panel must show red (Review Focus 3). Deleting the file by hand is always
 * SAFE: every field is re-derived by the next reconcile/probe from ground truth.
 *
 * Request-independent: no module state; every call reads the file.
 */

import { dirname, join } from 'node:path';
import {
	JsonFileError,
	readPrivateJsonText,
	withJsonFileLockAsync,
	writeJsonFileAtomic,
} from '../files/atomic_json.ts';
import { HOST_NAME, registryPath } from './registry.ts';

export const RUNTIME_FILE_NAME = 'publication_hosts_runtime.json';
/**
 * The most bytes a runtime read accepts and a write produces. Sized for a large unpublish
 * (~100 bytes per pending deletion → ~160k paths); past it the update is refused loudly
 * (`too_large`) and the file stays readable — never a file every later read refuses.
 */
export const RUNTIME_MAX_BYTES = 16 * 1024 * 1024;

export type PublicationApi = 'v1' | 'v2';

export interface ApiRuntime {
	state: 'ok' | 'failed' | 'pending' | 'unknown';
	release: string | null;
	error: string | null;
	at: string | null;
}

export interface MediaCopyRuntime {
	state: 'ok' | 'pending' | 'failed' | 'n/a';
	desired: number;
	present: number;
	pending_puts: number;
	pending_deletions: { path: string; since: string }[];
	last_verified_at: string | null;
	error: string | null;
}

export interface ProbeRuntime {
	state: 'ok' | 'failed' | 'unknown';
	at: string | null;
	published_status: number | null;
	unpublished_status: number | null;
	detail: string | null;
}

export interface HostRuntime {
	apis: Record<PublicationApi, ApiRuntime>;
	media_copy: MediaCopyRuntime;
	probe: ProbeRuntime;
}

export type RuntimeStateReason =
	| 'unreadable'
	| 'too_large'
	| 'invalid_json'
	| 'invalid_shape'
	| 'invalid_name'
	| 'locked';

export class RuntimeStateError extends Error {
	readonly reason: RuntimeStateReason;
	readonly path: string;

	constructor(reason: RuntimeStateReason, path: string, detail: string) {
		super(`publication host runtime state (${path}): ${reason} — ${detail}`);
		this.name = 'RuntimeStateError';
		this.reason = reason;
		this.path = path;
	}
}

const FILE_OPTIONS = { maxBytes: RUNTIME_MAX_BYTES } as const;

const ENVELOPE_KEYS = ['hosts', 'version'] as const;
const HOST_KEYS = ['apis', 'media_copy', 'probe'] as const;
const APIS_KEYS = ['v1', 'v2'] as const;
const API_KEYS = ['at', 'error', 'release', 'state'] as const;
const MEDIA_COPY_KEYS = [
	'desired',
	'error',
	'last_verified_at',
	'pending_deletions',
	'pending_puts',
	'present',
	'state',
] as const;
const DELETION_KEYS = ['path', 'since'] as const;
const PROBE_KEYS = ['at', 'detail', 'published_status', 'state', 'unpublished_status'] as const;

const API_STATES: ReadonlySet<unknown> = new Set(['ok', 'failed', 'pending', 'unknown']);
const MEDIA_COPY_STATES: ReadonlySet<unknown> = new Set(['ok', 'pending', 'failed', 'n/a']);
const PROBE_STATES: ReadonlySet<unknown> = new Set(['ok', 'failed', 'unknown']);

/** Beside the registry, so any registry relocation (and the test seam) carries the runtime file with it. */
export function runtimePath(): string {
	return join(dirname(registryPath()), RUNTIME_FILE_NAME);
}

/** A host nothing has been observed for yet. A fresh object every call. */
export function defaultHostRuntime(): HostRuntime {
	return {
		apis: { v1: unknownApi(), v2: unknownApi() },
		media_copy: {
			state: 'n/a',
			desired: 0,
			present: 0,
			pending_puts: 0,
			pending_deletions: [],
			last_verified_at: null,
			error: null,
		},
		probe: {
			state: 'unknown',
			at: null,
			published_status: null,
			unpublished_status: null,
			detail: null,
		},
	};
}

function unknownApi(): ApiRuntime {
	return { state: 'unknown', release: null, error: null, at: null };
}

export function loadRuntime(): Promise<Record<string, HostRuntime>> {
	return loadRuntimeAt(runtimePath());
}

export function updateHostRuntime(
	name: string,
	fn: (cur: HostRuntime) => HostRuntime,
): Promise<HostRuntime> {
	return updateHostRuntimeAt(runtimePath(), name, fn);
}

export function removeHostRuntime(name: string): Promise<void> {
	return removeHostRuntimeAt(runtimePath(), name);
}

/** Absent → {}; anything not exactly the shape → RuntimeStateError (never a partial map). */
export async function loadRuntimeAt(path: string): Promise<Record<string, HostRuntime>> {
	const text = await kernelCall(path, () => readPrivateJsonText(path, FILE_OPTIONS));
	if (text === null) return {};
	return parseRuntimeHosts(text, path);
}

/** Load → fn(copy) → validate → atomic write, under the async lock. Resolves to a copy of what was written. */
export async function updateHostRuntimeAt(
	path: string,
	name: string,
	fn: (cur: HostRuntime) => HostRuntime,
): Promise<HostRuntime> {
	if (!HOST_NAME.test(name)) {
		throw new RuntimeStateError('invalid_name', path, `'${name}' is not a publication host name`);
	}
	return kernelCall(path, () => withJsonFileLockAsync(path, () => applyHostUpdate(path, name, fn)));
}

export async function removeHostRuntimeAt(path: string, name: string): Promise<void> {
	await kernelCall(path, () => withJsonFileLockAsync(path, () => applyHostRemoval(path, name)));
}

async function applyHostRemoval(path: string, name: string): Promise<void> {
	const hosts = await loadRuntimeAt(path);
	if (!Object.hasOwn(hosts, name)) return;
	delete hosts[name];
	writeJsonFileAtomic(path, { version: 1, hosts }, FILE_OPTIONS);
}

async function applyHostUpdate(
	path: string,
	name: string,
	fn: (cur: HostRuntime) => HostRuntime,
): Promise<HostRuntime> {
	const hosts = await loadRuntimeAt(path);
	const next = fn(structuredClone(hosts[name] ?? defaultHostRuntime()));
	if (!isHostRuntime(next)) {
		throw new RuntimeStateError(
			'invalid_shape',
			path,
			`the update for '${name}' produced an invalid runtime record — nothing written`,
		);
	}
	writeJsonFileAtomic(path, { version: 1, hosts: { ...hosts, [name]: next } }, FILE_OPTIONS);
	return structuredClone(next);
}

/** Runs a kernel call, translating its refusals into this store's vocabulary. */
async function kernelCall<T>(path: string, run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (error) {
		if (error instanceof JsonFileError) {
			throw new RuntimeStateError(error.reason, path, error.message);
		}
		throw error;
	}
}

function parseRuntimeHosts(text: string, path: string): Record<string, HostRuntime> {
	const raw = parseJson(text, path);
	if (!hasExactKeys(raw, ENVELOPE_KEYS) || raw.version !== 1 || !isRecord(raw.hosts)) {
		throw new RuntimeStateError(
			'invalid_shape',
			path,
			'expected exactly {"version":1,"hosts":{…}}',
		);
	}
	return assertHosts(raw.hosts, path);
}

function parseJson(text: string, path: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		throw new RuntimeStateError('invalid_json', path, 'the file is not valid JSON');
	}
}

function assertHosts(hosts: Record<string, unknown>, path: string): Record<string, HostRuntime> {
	for (const [name, entry] of Object.entries(hosts)) {
		if (!HOST_NAME.test(name) || !isHostRuntime(entry)) {
			throw new RuntimeStateError(
				'invalid_shape',
				path,
				`host entry '${name}' is not a valid runtime record`,
			);
		}
	}
	return hosts as Record<string, HostRuntime>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** An object with EXACTLY these keys: a hand edit that adds a field is refused, not ignored. */
function hasExactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
	return isRecord(value) && Object.keys(value).sort().join(',') === keys.join(',');
}

function isHostRuntime(value: unknown): value is HostRuntime {
	if (!hasExactKeys(value, HOST_KEYS) || !hasExactKeys(value.apis, APIS_KEYS)) return false;
	return (
		isApiRuntime(value.apis.v1) &&
		isApiRuntime(value.apis.v2) &&
		isMediaCopyRuntime(value.media_copy) &&
		isProbeRuntime(value.probe)
	);
}

function isApiRuntime(value: unknown): boolean {
	return (
		hasExactKeys(value, API_KEYS) &&
		API_STATES.has(value.state) &&
		isNullableString(value.release) &&
		isNullableString(value.error) &&
		isNullableString(value.at)
	);
}

function isMediaCopyRuntime(value: unknown): boolean {
	return (
		hasExactKeys(value, MEDIA_COPY_KEYS) &&
		MEDIA_COPY_STATES.has(value.state) &&
		hasCopyCounts(value) &&
		isDeletionList(value.pending_deletions) &&
		isNullableString(value.last_verified_at) &&
		isNullableString(value.error)
	);
}

function hasCopyCounts(value: Record<string, unknown>): boolean {
	return isCount(value.desired) && isCount(value.present) && isCount(value.pending_puts);
}

function isDeletionList(value: unknown): boolean {
	return Array.isArray(value) && value.every(isDeletion);
}

function isDeletion(value: unknown): boolean {
	return (
		hasExactKeys(value, DELETION_KEYS) &&
		typeof value.path === 'string' &&
		typeof value.since === 'string'
	);
}

function isProbeRuntime(value: unknown): boolean {
	return (
		hasExactKeys(value, PROBE_KEYS) &&
		PROBE_STATES.has(value.state) &&
		isNullableString(value.at) &&
		isHttpStatus(value.published_status) &&
		isHttpStatus(value.unpublished_status) &&
		isNullableString(value.detail)
	);
}

function isCount(value: unknown): boolean {
	return Number.isInteger(value) && (value as number) >= 0;
}

function isHttpStatus(value: unknown): boolean {
	if (value === null) return true;
	return Number.isInteger(value) && (value as number) >= 100 && (value as number) <= 599;
}

function isNullableString(value: unknown): boolean {
	return value === null || typeof value === 'string';
}
