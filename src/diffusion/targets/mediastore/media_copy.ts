/**
 * MEDIA_COPY — the publication-host `copy` target (engineering/PUBLICATION_HOST_SPEC.md
 * §5.2). This file holds the desired set, the local sha cache, the planner and the REAL
 * bindings of a copy round (realCopyDeps / applyCopy / syncHost). The apply itself
 * (media_copy_apply.ts), the per-host worker (media_copy_worker.ts) and the pub/
 * transition seam (pub_transitions.ts) live beside this code.
 *
 * THE DESIRED SET IS RULE B'S OWN DECISION, not a second definition of "public": a file
 * under a public quality folder (filterPublicQualities — never a master tier) whose path
 * matches the generated Rule B pattern (the SAME MEDIA_FILENAME_GRAMMAR the Apache/nginx
 * rules interpolate) and whose record key has a pub/ marker. MINUS, so that "everything
 * present on a copy host is public" holds literally and every round can converge:
 *   - what the hardening block 404s for everyone (working, script and active-document
 *     extensions);
 *   - what the agent's media.put refuses to hold (its grammar.ts): a hidden segment, a
 *     master-tier segment below the quality, a control character, > 1024 bytes.
 * Both cuts only NARROW the copy (the safe direction). media_protection_tripwire pins the
 * classifier against the generated rules.
 *
 * SYMLINKS ARE NEVER FOLLOWED inside a quality folder: a link could point at a master.
 * (The quality folder itself may be a link — that is storage layout, not content.) This
 * makes copy NARROWER than a FollowSymLinks shared host, the safe direction.
 *
 * THE SHA CACHE is advisory, never authoritative: `(path, size, mtimeMs) → sha256` in
 * <private>/media_copy/sha_cache.ndjson (0700 dir, 0600 file), append + periodic
 * compaction, so multi-GB AV is not rehashed every round. A file that is not what the
 * walk saw (changed mid-hash, gone) hashes to null and is DEFERRED, never cached. Two
 * planners racing a compaction can lose appended lines — that costs a rehash, never a
 * wrong byte (the key includes size+mtime). A same-size rewrite inside the same mtime
 * tick is the residual blind spot of any (size, mtime) cache; the agent's own sha256 is
 * computed from the bytes it received, so a put is always verified.
 *
 * ASYNC ONLY. This module is reached from server.ts (the copy worker) and from dispatch
 * (the media_copy reconcile), and Bun serves every request from one event loop: a sync
 * read of a large ndjson, or a sync lstat per walked file, would stall the whole
 * installation. Only node:fs/promises and Bun.file streams are used
 * (sync_io_on_request_path_tripwire; media_copy_native pins "no *Sync( call").
 *
 * THE PLANNER writes nothing to the agent and takes no lock. It diffs the desired set
 * against the agent's media.manifest: `put` / `del` / `mark` (withdrawals FIRST). Every
 * `irregular` agent path (a link, a fifo, a dotfile) is drift and goes to `del`; a desired
 * path the agent holds irregularly is deferred, so a put never lands over a link in the
 * same round as its deletion.
 */

import { type Dirent, promises as fs, type Stats } from 'node:fs';
import path from 'node:path';
import { privateDir } from '../../../config/env.ts';
import {
	mediaCopyTargetLockKey,
	withTargetLock,
} from '../../../core/diffusion_bridge/target_lock.ts';
import { DedaloError } from '../../../core/errors/index.ts';
import {
	escapeRegexLiteral,
	filterPublicQualities,
	getPublicQualities,
	isMasterQuality,
	MEDIA_FILENAME_GRAMMAR,
	MEDIA_SCRIPT_DENY_PATTERN,
	MEDIA_WORKING_FILE_EXTENSIONS,
	mediaRoot,
} from '../../../core/media/protection.ts';
import { MEDIA_ACTIVE_DOCUMENT_EXTENSIONS } from '../../../core/media/svg_safety.ts';
import {
	hostMediaDelete,
	hostMediaManifest,
	hostMediaMark,
	hostMediaPut,
	type MediaManifest,
} from '../../../core/publication_host/agent_client.ts';
import { getHost, RegistryError } from '../../../core/publication_host/registry.ts';
import { updateHostRuntime } from '../../../core/publication_host/runtime.ts';
import { engineFailure, hostError, registryError } from '../../../core/publication_host/wire.ts';
import {
	type ApplyPlan,
	applyCopyWith,
	type CopyApplyReport,
	type CopyDeps,
	hostTakesCopy,
	MEDIA_COPY_LOCK_BOUND_MS,
	openLocalMediaFile,
	recordRoundFailure,
	syncHostWith,
} from './media_copy_apply.ts';
import { hasPubMarker, makeMarkerKey, markerStoreBase } from './media_index.ts';
import { type PubTransitionSink, registerPubTransitionSink } from './pub_transitions.ts';

export interface DesiredFile {
	/** Media-root-relative, '/'-separated — the agent's path and the URL tail after /dedalo/<mediaDir>/. */
	path: string;
	/** {section_tipo}_{section_id}: the pub/ marker this file is gated by. */
	key: string;
	size: number;
	mtimeMs: number;
}

// ---------------------------------------------------------------------------
// Classification — Rule B, minus the hardening denials and what the agent refuses
// ---------------------------------------------------------------------------

/** Everything the hardening block 404s for EVERYONE (htaccessHardeningBlock / nginxHardeningLocations). */
const HARDENING_DENIED = new RegExp(
	`\\.(?:${[...MEDIA_WORKING_FILE_EXTENSIONS, ...MEDIA_ACTIVE_DOCUMENT_EXTENSIONS].join('|')}|${MEDIA_SCRIPT_DENY_PATTERN})$`,
	'i',
);

/** Paths this module accepts: relative, no empty/./.. segment, no backslash, no control character. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: refusing control characters is the point
const UNSAFE_RELPATH = /(^|\/)\.{0,2}(\/|$)|^\/|[\\\u0000-\u001f\u007f]/;
/** The agent's MAX_MEDIA_PATH_BYTES (publication/host_agent/src/media/grammar.ts). */
const MAX_RELPATH_BYTES = 1024;
const SHA256_HEX = /^[0-9a-f]{64}$/;
/** The agent's RESERVED_TOP_LEVEL (grammar.ts): never a media path, never in a manifest. */
const AGENT_RESERVED_TOP_LEVEL: ReadonlySet<string> = new Set([
	'.publication',
	'.dedalo_host_agent_instance',
]);

function isSafeRelpath(relpath: string): boolean {
	return Buffer.byteLength(relpath, 'utf8') <= MAX_RELPATH_BYTES && !UNSAFE_RELPATH.test(relpath);
}

function isReservedRelpath(relpath: string): boolean {
	return AGENT_RESERVED_TOP_LEVEL.has(relpath.split('/', 1)[0] ?? '');
}

/** A segment the agent's put refuses: hidden, or a master tier below the quality folder. */
function hasRefusedSegment(relpath: string): boolean {
	return relpath.split('/').some((segment) => segment.startsWith('.') || isMasterQuality(segment));
}

/** Rule B compiled once for a quality list: relpath → record key, or null (not public). */
export function publicFileClassifier(
	qualities: readonly string[],
): (relpath: string) => string | null {
	const allowed = filterPublicQualities(qualities);
	if (allowed.length === 0) return () => null;
	const rule = new RegExp(
		`^(?:${allowed.map(escapeRegexLiteral).join('|')})/(?:.+/)?${MEDIA_FILENAME_GRAMMAR}`,
	);
	return (relpath) => {
		if (!isSafeRelpath(relpath) || HARDENING_DENIED.test(relpath) || hasRefusedSegment(relpath))
			return null;
		const match = rule.exec(relpath);
		return match === null ? null : `${match[1]}_${match[2]}`;
	};
}

export function publicFileKey(relpath: string, qualities: readonly string[]): string | null {
	return publicFileClassifier(qualities)(relpath);
}

/** A manifest marker must be exactly a key media_index.ts would write. */
function isMarkerKey(key: string): boolean {
	const cut = key.lastIndexOf('_');
	return cut > 0 && makeMarkerKey(key.slice(0, cut), key.slice(cut + 1)) === key;
}

function isEnoent(error: unknown): boolean {
	return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';
}

/** Async lstat; absent → null, any other error propagates. */
async function lstatQuiet(abs: string): Promise<Stats | null> {
	try {
		return await fs.lstat(abs);
	} catch (error) {
		if (isEnoent(error)) return null;
		throw error;
	}
}

// ---------------------------------------------------------------------------
// The desired set
// ---------------------------------------------------------------------------

interface WalkContext {
	root: string;
	pubDir: string;
	classify: (relpath: string) => string | null;
	published: Map<string, boolean>;
	seen: Set<string>;
}

function unconfigured(message: string): DedaloError {
	return new DedaloError('publication_host.unconfigured', { message });
}

function requireMediaStores(): { root: string; pubDir: string } {
	const root = mediaRoot();
	const base = markerStoreBase();
	if (root === null || base === null)
		throw unconfigured('media copy: the media root is not configured');
	return { root, pubDir: path.join(base, 'pub') };
}

function byName(a: Dirent, b: Dirent): number {
	if (a.name === b.name) return 0;
	return a.name < b.name ? -1 : 1;
}

/** Regular files under root/rel, depth-first, sorted. Symlinks/sockets/fifos are never yielded nor descended. */
async function* walkFiles(root: string, rel: string): AsyncGenerator<string> {
	let entries: Dirent[];
	try {
		entries = await fs.readdir(path.join(root, rel), { withFileTypes: true });
	} catch (error) {
		if (isEnoent(error)) return;
		throw error;
	}
	for (const entry of entries.sort(byName)) {
		const child = `${rel}/${entry.name}`;
		if (entry.isDirectory()) yield* walkFiles(root, child);
		else if (entry.isFile()) yield child;
	}
}

async function isPublished(ctx: WalkContext, key: string): Promise<boolean> {
	let published = ctx.published.get(key);
	if (published === undefined) {
		published = (await lstatQuiet(path.join(ctx.pubDir, key))) !== null;
		ctx.published.set(key, published);
	}
	return published;
}

async function toDesired(ctx: WalkContext, relpath: string): Promise<DesiredFile | null> {
	if (ctx.seen.has(relpath)) return null; // overlapping quality folders
	ctx.seen.add(relpath);
	const key = ctx.classify(relpath);
	if (key === null || !(await isPublished(ctx, key))) return null;
	const stat = await lstatQuiet(path.join(ctx.root, relpath));
	return stat?.isFile() ? { path: relpath, key, size: stat.size, mtimeMs: stat.mtimeMs } : null;
}

/**
 * pub/ ∩ public files, per quality folder in list order. An empty surviving quality list
 * is REFUSED: a host that may serve nothing is a misconfiguration, never a mode.
 */
export async function* desiredPublicFiles(
	qualities: readonly string[] = getPublicQualities(),
): AsyncGenerator<DesiredFile> {
	const allowed = filterPublicQualities(qualities);
	if (allowed.length === 0) {
		throw unconfigured(
			'media copy: no public quality folder survives the filter (an empty list is a misconfiguration)',
		);
	}
	const ctx: WalkContext = {
		...requireMediaStores(),
		classify: publicFileClassifier(allowed),
		published: new Map(),
		seen: new Set(),
	};
	for (const quality of allowed) {
		for await (const relpath of walkFiles(ctx.root, quality)) {
			const file = await toDesired(ctx, relpath);
			if (file !== null) yield file;
		}
	}
}

// ---------------------------------------------------------------------------
// The local sha cache (<private>/media_copy/sha_cache.ndjson)
// ---------------------------------------------------------------------------

const SHA_CACHE_FILE = 'sha_cache.ndjson';
/** Compact when the file holds more than 2× the live entries plus this slack. */
const COMPACT_SLACK = 256;

let stateDirOverrideForTests: string | null = null;

/** Test seam — temp-dir paths only, so a test can never write the real <private>/media_copy. */
export function overrideMediaCopyStateDirForTests(dir: string | null): void {
	if (dir !== null && !/\/(tmp|T)\//.test(dir) && !dir.startsWith('/tmp')) {
		throw new DedaloError('internal.invariant', {
			message: 'overrideMediaCopyStateDirForTests only accepts temp-dir paths',
		});
	}
	stateDirOverrideForTests = dir;
}

/** Censused as `media_copy_state_dir` (src/core/install/runtime_paths.ts). */
export function mediaCopyStateDir(): string {
	return stateDirOverrideForTests ?? path.join(privateDir, 'media_copy');
}

interface ShaEntry {
	p: string;
	s: number;
	m: number;
	h: string;
}

export interface ShaCache {
	/** null = the file is no longer what the walk saw (changed or gone); never cached. */
	sha256(file: DesiredFile): Promise<string | null>;
	maybeCompact(): Promise<boolean>;
	/** Entries kept. */
	compact(): Promise<number>;
	readonly stats: { hits: number; misses: number; unstable: number; skipped_lines: number };
}

function isShaEntry(value: unknown): value is ShaEntry {
	const e = value as Partial<ShaEntry> | null;
	return (
		typeof e?.p === 'string' &&
		isSafeRelpath(e.p) &&
		Number.isSafeInteger(e.s) &&
		(e.s as number) >= 0 &&
		Number.isFinite(e.m) &&
		typeof e.h === 'string' &&
		SHA256_HEX.test(e.h)
	);
}

function parseShaLine(line: string): ShaEntry | null {
	try {
		const value: unknown = JSON.parse(line);
		return isShaEntry(value) ? { p: value.p, s: value.s, m: value.m, h: value.h } : null;
	} catch {
		return null;
	}
}

async function statMatches(abs: string, seen: { size: number; mtimeMs: number }): Promise<boolean> {
	const stat = await lstatQuiet(abs);
	return stat?.isFile() === true && stat.size === seen.size && stat.mtimeMs === seen.mtimeMs;
}

/** sha256 of the bytes, or null when the file is not (or no longer) what the walk saw. */
async function hashStable(
	abs: string,
	seen: { size: number; mtimeMs: number },
): Promise<string | null> {
	if (!(await statMatches(abs, seen))) return null;
	const hasher = new Bun.CryptoHasher('sha256');
	try {
		for await (const chunk of Bun.file(abs).stream()) hasher.update(chunk);
	} catch (error) {
		if (isEnoent(error)) return null;
		throw error;
	}
	return (await statMatches(abs, seen)) ? hasher.digest('hex') : null;
}

/** tmp (0600) → write → fsync → rename: a reader sees the old file or the new, never a torn one. */
async function writeAtomic(file: string, text: string): Promise<void> {
	const tmp = `${file}.${process.pid}.tmp`;
	const handle = await fs.open(tmp, 'w', 0o600);
	try {
		await handle.writeFile(text);
		await handle.sync();
	} finally {
		await handle.close();
	}
	await fs.rename(tmp, file);
}

async function readCacheText(file: string): Promise<string> {
	try {
		return await fs.readFile(file, 'utf8');
	} catch (error) {
		if (isEnoent(error)) return '';
		throw error;
	}
}

class NdjsonShaCache implements ShaCache {
	readonly stats = { hits: 0, misses: 0, unstable: 0, skipped_lines: 0 };
	readonly #entries = new Map<string, ShaEntry>();
	readonly #root: string;
	readonly #file: string;
	#lines = 0;

	private constructor(root: string, file: string) {
		this.#root = root;
		this.#file = file;
	}

	/** Create the 0700 state dir and load the ndjson — asynchronously. */
	static async open(root: string, dir: string): Promise<NdjsonShaCache> {
		await fs.mkdir(dir, { recursive: true, mode: 0o700 });
		const cache = new NdjsonShaCache(root, path.join(dir, SHA_CACHE_FILE));
		for (const line of (await readCacheText(cache.#file)).split('\n')) cache.#ingest(line);
		return cache;
	}

	#ingest(line: string): void {
		if (line === '') return;
		this.#lines++;
		const entry = parseShaLine(line);
		if (entry === null) {
			this.stats.skipped_lines++;
			return;
		}
		this.#entries.set(entry.p, entry);
	}

	async sha256(file: DesiredFile): Promise<string | null> {
		const cached = this.#entries.get(file.path);
		if (cached !== undefined && cached.s === file.size && cached.m === file.mtimeMs) {
			this.stats.hits++;
			return cached.h;
		}
		this.stats.misses++;
		const hash = await hashStable(path.join(this.#root, file.path), file);
		if (hash === null) {
			this.stats.unstable++;
			return null;
		}
		await this.#record({ p: file.path, s: file.size, m: file.mtimeMs, h: hash });
		return hash;
	}

	async #record(entry: ShaEntry): Promise<void> {
		this.#entries.set(entry.p, entry);
		await fs.appendFile(this.#file, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
		this.#lines++;
	}

	async maybeCompact(): Promise<boolean> {
		if (this.#lines <= 2 * this.#entries.size + COMPACT_SLACK) return false;
		await this.compact();
		return true;
	}

	/** Rewrites the file with one line per entry whose file still matches size+mtime. */
	async compact(): Promise<number> {
		const kept: ShaEntry[] = [];
		for (const entry of this.#entries.values()) {
			if (await statMatches(path.join(this.#root, entry.p), { size: entry.s, mtimeMs: entry.m }))
				kept.push(entry);
		}
		await writeAtomic(this.#file, kept.map((e) => `${JSON.stringify(e)}\n`).join(''));
		this.#entries.clear();
		for (const entry of kept) this.#entries.set(entry.p, entry);
		this.#lines = kept.length;
		return kept.length;
	}
}

/** Async load — no sync I/O on the request path. */
export async function openShaCache(): Promise<ShaCache> {
	return NdjsonShaCache.open(requireMediaStores().root, mediaCopyStateDir());
}

// ---------------------------------------------------------------------------
// The planner
// ---------------------------------------------------------------------------

export interface AgentManifestView {
	entries: ReadonlyMap<string, { size: number; sha256: string }>;
	/** Non-regular agent paths (links, fifos, dotfiles): always drift, always deleted. */
	irregular: ReadonlySet<string>;
	markers: ReadonlySet<string>;
}

export interface CopyPlan {
	put: DesiredFile[];
	/** Agent paths outside the desired set, plus every irregular path — sorted. */
	del: string[];
	/** Withdrawals ({published:false}) FIRST, then grants — M2's unpublish order. */
	mark: { key: string; published: boolean }[];
	/** Desired files that changed while hashed, or that the agent holds irregularly: not put this round. */
	deferred: string[];
	desired: number;
	present: number;
}

/** What a view built without a host in hand names in the log coordinates. */
const UNNAMED_HOST = '<media.manifest>';

function manifestInvalid(hostName: string, detail: string): DedaloError {
	return engineFailure(hostName, 'unreadable_body', {
		message: `publication host '${hostName}': media.manifest: ${detail}`,
		coordinates: { command: 'media.manifest' },
	});
}

function validEntry(entry: MediaManifest['entries'][number]): boolean {
	return (
		isSafeRelpath(entry.path) &&
		!isReservedRelpath(entry.path) &&
		Number.isSafeInteger(entry.size) &&
		entry.size >= 0 &&
		SHA256_HEX.test(entry.sha256)
	);
}

function viewEntries(
	raw: MediaManifest,
	hostName: string,
): Map<string, { size: number; sha256: string }> {
	const entries = new Map<string, { size: number; sha256: string }>();
	for (const entry of raw.entries) {
		if (!validEntry(entry) || entries.has(entry.path)) {
			throw manifestInvalid(hostName, `invalid or duplicate entry ${JSON.stringify(entry.path)}`);
		}
		entries.set(entry.path, { size: entry.size, sha256: entry.sha256 });
	}
	return entries;
}

function viewIrregular(
	raw: MediaManifest,
	entries: ReadonlyMap<string, unknown>,
	hostName: string,
): Set<string> {
	const irregular = new Set<string>();
	for (const p of raw.irregular) {
		if (!isSafeRelpath(p) || isReservedRelpath(p) || entries.has(p) || irregular.has(p)) {
			throw manifestInvalid(
				hostName,
				`invalid, duplicate or reserved irregular path ${JSON.stringify(p)}`,
			);
		}
		irregular.add(p);
	}
	return irregular;
}

/** Semantic validation of an agent manifest. Anything odd aborts the plan — never a partial diff. */
export function toManifestView(
	raw: MediaManifest,
	hostName: string = UNNAMED_HOST,
): AgentManifestView {
	const entries = viewEntries(raw, hostName);
	const irregular = viewIrregular(raw, entries, hostName);
	const bad = raw.markers.find((key) => !isMarkerKey(key));
	if (bad !== undefined) throw manifestInvalid(hostName, `invalid marker ${JSON.stringify(bad)}`);
	return { entries, irregular, markers: new Set(raw.markers) };
}

async function classifyDesired(
	plan: CopyPlan,
	file: DesiredFile,
	agent: AgentManifestView,
	sha: (file: DesiredFile) => Promise<string | null>,
): Promise<void> {
	if (agent.irregular.has(file.path)) {
		plan.deferred.push(file.path); // deleted this round, put the next: never over a link
		return;
	}
	const held = agent.entries.get(file.path);
	if (held === undefined || held.size !== file.size) {
		plan.put.push(file); // decided without hashing
		return;
	}
	const local = await sha(file);
	if (local === null) plan.deferred.push(file.path);
	else if (local === held.sha256) plan.present++;
	else plan.put.push(file);
}

function markDiff(desiredKeys: ReadonlySet<string>, held: ReadonlySet<string>): CopyPlan['mark'] {
	const withdraw = [...held].filter((key) => !desiredKeys.has(key)).sort();
	const grant = [...desiredKeys].filter((key) => !held.has(key)).sort();
	return [
		...withdraw.map((key) => ({ key, published: false })),
		...grant.map((key) => ({ key, published: true })),
	];
}

export async function diffCopyPlan(
	desired: AsyncIterable<DesiredFile> | Iterable<DesiredFile>,
	agent: AgentManifestView,
	sha: (file: DesiredFile) => Promise<string | null>,
): Promise<CopyPlan> {
	const plan: CopyPlan = { put: [], del: [], mark: [], deferred: [], desired: 0, present: 0 };
	const paths = new Set<string>();
	const keys = new Set<string>();
	for await (const file of desired) {
		plan.desired++;
		paths.add(file.path);
		keys.add(file.key);
		await classifyDesired(plan, file, agent, sha);
	}
	const stale = [...agent.entries.keys()].filter((p) => !paths.has(p));
	plan.del = [...stale, ...agent.irregular].sort();
	plan.mark = markDiff(keys, agent.markers);
	return plan;
}

export interface CopyPlanDeps {
	qualities: (host: string) => readonly string[];
	manifest: (host: string) => Promise<MediaManifest>;
}

function registryHost(name: string): ReturnType<typeof getHost> {
	try {
		return getHost(name);
	} catch (error) {
		if (error instanceof RegistryError) throw registryError(error.reason);
		throw error;
	}
}

/** The host's quality override (phase-3 E9), else the engine's — filtered again by desiredPublicFiles. */
function hostQualities(name: string): readonly string[] {
	const record = registryHost(name);
	if (record === null) {
		throw hostError('publication_host.unconfigured', name, {
			message: `media copy: no publication host '${name}' in the registry`,
		});
	}
	return record.qualities ?? getPublicQualities();
}

const DEFAULT_PLAN_DEPS: CopyPlanDeps = { qualities: hostQualities, manifest: hostMediaManifest };

/** Plan one host: validated agent manifest × desired set × sha cache. Writes only the local cache. */
export async function planCopy(
	host: string,
	deps: CopyPlanDeps = DEFAULT_PLAN_DEPS,
): Promise<CopyPlan> {
	const qualities = deps.qualities(host);
	const agent = toManifestView(await deps.manifest(host), host);
	const cache = await openShaCache();
	const plan = await diffCopyPlan(desiredPublicFiles(qualities), agent, (file) =>
		cache.sha256(file),
	);
	await cache.maybeCompact();
	return plan;
}

// ---------------------------------------------------------------------------
// The real bindings of a copy round (media_copy_apply.ts runs it)
// ---------------------------------------------------------------------------

/** The pub/ transition hook seam (decision M3): the copy worker registers here at boot. */
export function registerMediaCopySink(sink: PubTransitionSink): () => void {
	return registerPubTransitionSink(sink);
}

/** The agent manifest, semantically validated (toManifestView) before a round trusts it. */
async function validatedManifest(host: string): Promise<MediaManifest> {
	const raw = await hostMediaManifest(host);
	toManifestView(raw, host);
	return raw;
}

/**
 * The real dependencies of ONE copy round: the paired agent client, the marker store,
 * this host's Rule B (the same classifier and quality override the planner uses), a
 * per-round sha cache (opened lazily and asynchronously: it needs the media root), the
 * lock, the runtime file. Build it per round — never share it across rounds.
 */
export function realCopyDeps(): CopyDeps {
	let cache: Promise<ShaCache> | null = null;
	return {
		put: hostMediaPut,
		del: hostMediaDelete,
		mark: hostMediaMark,
		manifest: validatedManifest,
		isPublished: hasPubMarker,
		classifier: (host) => publicFileClassifier(hostQualities(host)),
		sha256: async (file) => {
			cache ??= openShaCache();
			return (await cache).sha256(file);
		},
		open: (relpath) => openLocalMediaFile(relpath),
		lock: (host, work) =>
			withTargetLock(mediaCopyTargetLockKey(host), work, {
				mode: { boundMs: MEDIA_COPY_LOCK_BOUND_MS },
			}),
		updateRuntime: async (host, fn) =>
			(await updateHostRuntime(host, (cur) => ({ ...cur, media_copy: fn(cur.media_copy) })))
				.media_copy,
		now: () => new Date(),
	};
}

/**
 * Apply one plan to one host (media_copy_apply.ts). RAW: the worker calls it from inside
 * the host lane; any other caller wraps plan + apply in inMediaCopyLane
 * (media_copy_worker.ts), so it never applies a stale plan beside a hook run.
 */
export function applyCopy(host: string, plan: ApplyPlan): Promise<CopyApplyReport> {
	return applyCopyWith(realCopyDeps(), host, plan);
}

/** One worker run for one host: withdraw the hook's keys first, then plan + apply. */
export function syncHost(
	host: string,
	withdrawnKeys: readonly string[],
): Promise<CopyApplyReport | null> {
	const deps = realCopyDeps();
	return syncHostWith(
		{
			takesCopy: (name) => hostTakesCopy(name),
			plan: (name) => planCopy(name),
			apply: (name, plan) => applyCopyWith(deps, name, plan),
			recordFailure: (name, error) => recordRoundFailure(deps, name, error),
		},
		host,
		withdrawnKeys,
	);
}
