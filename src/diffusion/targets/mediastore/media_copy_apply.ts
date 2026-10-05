/**
 * MEDIA COPY — APPLY (PUBLICATION_HOST_SPEC §5.2, phase 5; decisions M2, M4, M6).
 *
 * Runs ONE plan (media_copy.ts planCopy) against ONE copy-mode publication host.
 * The agent lands a put ONLY while its `pub/<key>` marker exists (its src/media/copy.ts,
 * checked before streaming and again under its key lock), so a key is always MARKED
 * before its files are put, and UNMARKED before they are deleted:
 *
 *  1. RECORD. Every path the round will delete — a withdrawn key's agent marker
 *     (`.publication/pub/<key>`) and every `plan.del` path — goes into the host's
 *     runtime `pending_deletions` BEFORE the first agent call (a path already
 *     pending keeps its first `since`). A runtime file that refuses the record
 *     stops the round before anything is sent.
 *  2. WITHDRAW, one target-lock unit: `media.mark false` per key — the gate 404s
 *     from that instant — then `media.delete`.
 *  3. VERIFY. The agent manifest is read back: a pending path it no longer lists
 *     (as a file, an irregular path or a marker) is cleared, every other stays
 *     pending. Its marker list is the round's `known` set.
 *  A GRANT SUPERSEDES A PENDING WITHDRAWAL. A record republished before its deletion was
 *     verified (agent down at the unpublish; unpublished and republished inside a round)
 *     must not stay `deletion_unverified` forever: VERIFY also clears a pending marker whose
 *     key is published again, and a pending file whose key is published under this host's
 *     Rule B and that the round does not delete; a `mark true` clears the key's pending
 *     marker, a landed put its own path. Only entries recorded no later than the instant
 *     before the deciding `pub/` check — a withdrawal recorded after it is a newer unpublish.
 *  4. GRANT, one target-lock unit: `media.mark true` for each plan grant whose key
 *     is still published locally and not yet known. A marker with no file serves
 *     nothing (Rule B also needs the file), so granting first is gate-safe.
 *  5. PUT, one target-lock unit per file: re-check `pub/<key>` (gone → skipped);
 *     sha256 from the round's cache (null = unstable → deferred); re-open with no
 *     link followed and re-stat (changed → deferred); ENSURE the agent marker (covers
 *     a deferred grant unit); stream; re-check `pub/<key>` — a record unpublished
 *     while its bytes were in flight is COMPENSATED at once (recorded pending first,
 *     marker withdrawn, every file of that key landed this round deleted) and the
 *     round verifies again. No put outlives an unpublish (Review Focus 2).
 *  PRE-EMPT. Before the grant unit and before EVERY put unit the round drains the
 *     keys withdrawn since it began (ApplyOptions.takeWithdrawn — the worker's per-host
 *     set): recorded pending, then `media.mark false` in their own lock unit. A record
 *     unpublished during a long round stops being served at the next unit boundary,
 *     never only after the round (M2). Its files are deleted by the queued run's plan;
 *     its marker deletion is verified again at the round's end (as after a compensation).
 *
 * Before any call the plan is checked against this host's OWN Rule B (the injected
 * classifier = media_copy.ts publicFileClassifier over the host's qualities): a put
 * entry that is not a plain relative path classifying to its own key is an internal
 * invariant failure — never copied.
 *
 * A put that times out is DEFERRED (one file the link cannot push in time never starves
 * the files after it). Withdrawals are per key best-effort: a refused key never shields
 * the keys after it (a transient failure stops at once). Any other transport failure
 * (unreachable / timeout / busy) stops the round as `pending`, any other as `failed`; the CODE (never agent prose) goes to the runtime file and the
 * recorded deletions stay for the next round (Review Focus 3). A deletion still listed
 * after a round that deferred nothing is `failed` / `deletion_unverified`.
 *
 * Every dependency is injected (CopyDeps); media_copy.ts binds the real ones. The import
 * of media_copy.ts here is TYPE-only (erased), so the two never form a value cycle.
 * Callers outside the worker run a round inside media_copy_worker.ts inMediaCopyLane
 * (one lane per host); the worker calls this from inside the lane.
 */

import { constants, promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import type { TargetLockOutcome } from '../../../core/diffusion_bridge/target_lock.ts';
import { DedaloError } from '../../../core/errors/index.ts';
import { absoluteFromRelative } from '../../../core/media/path.ts';
import {
	hostStatus,
	type MediaManifest,
	type MediaPutFile,
} from '../../../core/publication_host/agent_client.ts';
import {
	type HostRuntime,
	loadRuntime,
	updateHostRuntime,
} from '../../../core/publication_host/runtime.ts';
import type { CopyPlan, DesiredFile } from './media_copy.ts';

/** The actor every copy command carries (the agent's audit names it). */
export const MEDIA_COPY_ACTOR = 'engine:media_copy';

/** How long one unit waits for a host another process is copying to. */
export const MEDIA_COPY_LOCK_BOUND_MS = 60_000;

/** The runtime error of a deletion the manifest still lists after a full round. */
export const DELETION_UNVERIFIED = 'deletion_unverified';

const TRANSIENT_CODES: ReadonlySet<string> = new Set([
	'publication_host.unreachable',
	'publication_host.timeout',
	'publication_host.busy',
]);

export type MediaCopyRuntime = HostRuntime['media_copy'];

/** What an apply needs from a plan (media_copy.ts CopyPlan carries more). */
export type ApplyPlan = Pick<CopyPlan, 'put' | 'del' | 'mark'>;

export interface LocalFile {
	size: number;
	mtimeMs: number;
	body: ReadableStream<Uint8Array>;
}

export interface CopyDeps {
	put(host: string, file: MediaPutFile, actor: string): Promise<void>;
	del(host: string, paths: readonly string[], actor: string): Promise<void>;
	mark(host: string, key: string, published: boolean, actor: string): Promise<void>;
	manifest(host: string): Promise<MediaManifest>;
	isPublished(key: string): Promise<boolean>;
	/** Rule B for this host: relpath → record key, or null (not public here). */
	classifier(host: string): (relpath: string) => string | null;
	/** null = the file is not what the planner saw (changed / gone): defer it. */
	sha256(file: DesiredFile): Promise<string | null>;
	open(path: string): Promise<LocalFile | null>;
	lock<T>(host: string, work: () => Promise<T>): Promise<TargetLockOutcome<T>>;
	updateRuntime(
		host: string,
		fn: (cur: MediaCopyRuntime) => MediaCopyRuntime,
	): Promise<MediaCopyRuntime>;
	now(): Date;
}

export interface CopyApplyReport {
	host: string;
	state: 'ok' | 'pending' | 'failed';
	/** Keys marked unpublished on the agent (withdrawals + compensations). */
	withdrawn: number;
	/** Paths sent to media.delete (withdrawal + compensations). */
	deleted: number;
	put: number;
	/** Keys marked published on the agent. */
	published: number;
	/** Puts not sent: the key was unpublished before its unit. */
	skipped_unpublished: number;
	/** Units not run: the lock was held past its bound, or the file changed/unstable since the plan. */
	deferred: number;
	/** Puts undone: the record was unpublished while its bytes were in flight. */
	compensated: number;
	pending_deletions: number;
	/** A DedaloError code, `internal.unexpected` or `deletion_unverified` — never prose. */
	error: string | null;
}

type PutOutcome = 'put' | 'unpublished' | 'changed' | 'timed_out' | 'compensated';

interface RoundOutcome {
	state: CopyApplyReport['state'];
	error: string | null;
}

/** One round's working state: the agent markers known to exist, the files landed per key. */
interface Round {
	deps: CopyDeps;
	host: string;
	report: CopyApplyReport;
	known: Set<string>;
	landed: Map<string, string[]>;
	takeWithdrawn: () => readonly string[];
	/** A deletion was recorded after the round's verify (pre-empt, compensation): verify again. */
	reverify: boolean;
}

export interface ApplyOptions {
	/** Keys withdrawn since the round began, drained before every unit (the worker's per-host set). */
	takeWithdrawn?: () => readonly string[];
	/**
	 * A withdraw-only pass ahead of a planned round (syncHostWith): it never judges older
	 * pending deletions (the plan that follows deletes them) and keeps `pending_puts`.
	 */
	withdrawOnly?: boolean;
}

const NOTHING_WITHDRAWN = (): readonly string[] => [];

/** The agent-side path of a key's marker (as recorded in pending_deletions). */
export function agentMarkerPath(key: string): string {
	return `.publication/pub/${key}`;
}

function isPlainRelative(path: string): boolean {
	return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function assertPlanPublic(deps: CopyDeps, host: string, plan: ApplyPlan): void {
	const classify = deps.classifier(host);
	const refused = plan.put
		.filter((file) => !isPlainRelative(file.path) || classify(file.path) !== file.key)
		.map((file) => file.path);
	if (refused.length === 0) return;
	throw new DedaloError('internal.invariant', {
		message: `media copy: the plan names ${refused.length} file(s) this host's Rule B never serves (never copied): ${refused.slice(0, 5).join(', ')}`,
	});
}

function newReport(host: string): CopyApplyReport {
	return {
		host,
		state: 'ok',
		withdrawn: 0,
		deleted: 0,
		put: 0,
		published: 0,
		skipped_unpublished: 0,
		deferred: 0,
		compensated: 0,
		pending_deletions: 0,
		error: null,
	};
}

async function recordPending(
	deps: Pick<CopyDeps, 'updateRuntime' | 'now'>,
	host: string,
	paths: readonly string[],
): Promise<void> {
	if (paths.length === 0) return;
	const since = deps.now().toISOString();
	await deps.updateRuntime(host, (cur) => {
		const known = new Set(cur.pending_deletions.map((entry) => entry.path));
		const added = [...new Set(paths)]
			.filter((path) => !known.has(path))
			.map((path) => ({ path, since }));
		return { ...cur, pending_deletions: [...cur.pending_deletions, ...added] };
	});
}

function isTransient(error: unknown): boolean {
	return error instanceof DedaloError && TRANSIENT_CODES.has(error.code);
}

/**
 * `media.mark false` for every key, BEST-EFFORT: a key the agent (or the client) refuses
 * never shields the keys after it from their withdrawal. A transient failure (the agent
 * is down) stops at once — the rest would fail the same way. Answers the keys withdrawn
 * and the first failure (null when none).
 */
async function unmarkEach(
	deps: CopyDeps,
	host: string,
	keys: readonly string[],
): Promise<{ done: string[]; failure: unknown }> {
	const done: string[] = [];
	let failure: unknown = null;
	for (const key of keys) {
		try {
			await deps.mark(host, key, false, MEDIA_COPY_ACTOR);
			done.push(key);
		} catch (error) {
			failure ??= error;
			if (isTransient(error)) break;
		}
	}
	return { done, failure };
}

async function withdraw(
	deps: CopyDeps,
	host: string,
	keys: readonly string[],
	paths: readonly string[],
	report: CopyApplyReport,
): Promise<void> {
	if (keys.length === 0 && paths.length === 0) return;
	const held = await deps.lock(host, async () => {
		const unmarked = await unmarkEach(deps, host, keys);
		report.withdrawn += unmarked.done.length;
		if (unmarked.failure !== null && isTransient(unmarked.failure)) throw unmarked.failure;
		await deps.del(host, paths, MEDIA_COPY_ACTOR);
		report.deleted += paths.length;
		if (unmarked.failure !== null) throw unmarked.failure;
	});
	if (!held.acquired) report.deferred += 1;
}

/**
 * Withdraw the keys unpublished since the round began, between units (see the header):
 * recorded pending first, then marked false in one lock unit. A held lock defers it —
 * the keys stay recorded and the worker's queued run withdraws them again.
 */
async function preempt(round: Round): Promise<void> {
	const keys = [...new Set(round.takeWithdrawn())];
	if (keys.length === 0) return;
	const { deps, host, report } = round;
	await recordPending(deps, host, keys.map(agentMarkerPath));
	const held = await deps.lock(host, async () => {
		const unmarked = await unmarkEach(deps, host, keys);
		for (const key of unmarked.done) round.known.delete(key);
		report.withdrawn += unmarked.done.length;
		if (unmarked.done.length > 0) round.reverify = true;
		if (unmarked.failure !== null) throw unmarked.failure;
	});
	if (!held.acquired) report.deferred += 1;
}

const MARKER_PREFIX = agentMarkerPath('');

/**
 * Drop `paths` from pending_deletions — a grant or a landed put SUPERSEDES the withdrawal
 * recorded for it. Only entries recorded no later than `decidedAt` (the instant before the
 * local `pub/` check that justified the drop): a withdrawal recorded after that check is
 * a newer unpublish, never superseded by it.
 */
async function dropPending(
	deps: Pick<CopyDeps, 'updateRuntime'>,
	host: string,
	paths: ReadonlySet<string>,
	decidedAt: number,
): Promise<void> {
	if (paths.size === 0) return;
	await deps.updateRuntime(host, (cur) => ({
		...cur,
		pending_deletions: cur.pending_deletions.filter(
			(entry) => !(paths.has(entry.path) && Date.parse(entry.since) <= decidedAt),
		),
	}));
}

/**
 * A pending path the work host wants served again: a marker whose key is published, or a
 * file whose key is published under this host's Rule B and that this round does not delete.
 */
async function isSuperseded(
	deps: CopyDeps,
	classify: (relpath: string) => string | null,
	deleting: ReadonlySet<string>,
	path: string,
): Promise<boolean> {
	if (path.startsWith(MARKER_PREFIX)) return deps.isPublished(path.slice(MARKER_PREFIX.length));
	const key = classify(path);
	return key !== null && !deleting.has(path) && (await deps.isPublished(key));
}

async function supersededPaths(
	deps: CopyDeps,
	host: string,
	deleting: ReadonlySet<string>,
): Promise<Set<string>> {
	const pending = (await deps.updateRuntime(host, (cur) => cur)).pending_deletions;
	const classify = deps.classifier(host);
	const superseded = new Set<string>();
	for (const { path } of pending) {
		if (await isSuperseded(deps, classify, deleting, path)) superseded.add(path);
	}
	return superseded;
}

/**
 * Clears verified deletions (absent from the manifest) and superseded ones (republished
 * since: see isSuperseded); answers the marker keys the agent holds now.
 */
async function verifyDeletions(
	deps: CopyDeps,
	host: string,
	deleting: ReadonlySet<string>,
): Promise<Set<string>> {
	const decidedAt = deps.now().getTime();
	const superseded = await supersededPaths(deps, host, deleting);
	const manifest = await deps.manifest(host);
	const present = new Set([
		...manifest.entries.map((entry) => entry.path),
		...manifest.irregular,
		...manifest.markers.map(agentMarkerPath),
	]);
	const at = deps.now().toISOString();
	await deps.updateRuntime(host, (cur) => ({
		...cur,
		pending_deletions: cur.pending_deletions.filter(
			(entry) =>
				present.has(entry.path) &&
				!(superseded.has(entry.path) && Date.parse(entry.since) <= decidedAt),
		),
		present: manifest.entries.length,
		last_verified_at: at,
	}));
	return new Set(manifest.markers);
}

async function ensureMarker(round: Round, key: string): Promise<void> {
	if (round.known.has(key)) return;
	const decidedAt = round.deps.now().getTime();
	await round.deps.mark(round.host, key, true, MEDIA_COPY_ACTOR);
	round.known.add(key);
	round.report.published += 1;
	await dropPending(round.deps, round.host, new Set([agentMarkerPath(key)]), decidedAt);
}

async function grantMarks(round: Round, keys: readonly string[]): Promise<void> {
	if (keys.length === 0) return;
	const held = await round.deps.lock(round.host, async () => {
		for (const key of keys) {
			if (await round.deps.isPublished(key)) await ensureMarker(round, key);
		}
	});
	if (!held.acquired) round.report.deferred += 1;
}

/** Record first, withdraw the marker, delete every file of the key this round landed. */
async function compensate(round: Round, key: string): Promise<PutOutcome> {
	const { deps, host, report } = round;
	const paths = round.landed.get(key) ?? [];
	await recordPending(deps, host, [agentMarkerPath(key), ...paths]);
	round.reverify = true;
	await deps.mark(host, key, false, MEDIA_COPY_ACTOR);
	round.known.delete(key);
	report.withdrawn += 1;
	await deps.del(host, paths, MEDIA_COPY_ACTOR);
	round.landed.delete(key);
	report.deleted += paths.length;
	return 'compensated';
}

async function openUnchanged(deps: CopyDeps, file: DesiredFile): Promise<LocalFile | null> {
	const local = await deps.open(file.path);
	if (local === null) return null;
	if (local.size === file.size && local.mtimeMs === file.mtimeMs) return local;
	await local.body.cancel();
	return null;
}

async function sendFile(
	round: Round,
	file: DesiredFile,
	local: LocalFile,
	sha256: string,
): Promise<void> {
	try {
		await ensureMarker(round, file.key);
	} catch (error) {
		await local.body.cancel();
		throw error;
	}
	const body = local.body;
	const decidedAt = round.deps.now().getTime();
	await round.deps.put(
		round.host,
		{ path: file.path, sha256, size: file.size, body },
		MEDIA_COPY_ACTOR,
	);
	round.landed.set(file.key, [...(round.landed.get(file.key) ?? []), file.path]);
	await dropPending(round.deps, round.host, new Set([file.path]), decidedAt);
}

/**
 * A put that TIMED OUT is deferred, never the end of the round: one file the link cannot
 * push in time must not starve every file sorted after it, round after round. Its bytes
 * may have landed all the same, so it counts as landed for a compensation, and a record
 * unpublished meanwhile is compensated exactly as after a put that answered.
 */
async function sendOrDefer(
	round: Round,
	file: DesiredFile,
	local: LocalFile,
	sha256: string,
): Promise<'sent' | 'timed_out'> {
	try {
		await sendFile(round, file, local, sha256);
		return 'sent';
	} catch (error) {
		if (!(error instanceof DedaloError) || error.code !== 'publication_host.timeout') throw error;
		console.error(`[media_copy] ${round.host}: put ${file.path} timed out (deferred):`, error);
		round.landed.set(file.key, [...(round.landed.get(file.key) ?? []), file.path]);
		return 'timed_out';
	}
}

async function putUnderLock(round: Round, file: DesiredFile): Promise<PutOutcome> {
	const { deps } = round;
	if (!(await deps.isPublished(file.key))) return 'unpublished';
	const sha256 = await deps.sha256(file);
	if (sha256 === null) return 'changed';
	const local = await openUnchanged(deps, file);
	if (local === null) return 'changed';
	const sent = await sendOrDefer(round, file, local, sha256);
	if (!(await deps.isPublished(file.key))) return compensate(round, file.key);
	return sent === 'sent' ? 'put' : 'timed_out';
}

const PUT_FIELD = {
	put: 'put',
	unpublished: 'skipped_unpublished',
	changed: 'deferred',
	timed_out: 'deferred',
	compensated: 'compensated',
} as const satisfies Record<PutOutcome, keyof CopyApplyReport>;

async function putOne(round: Round, file: DesiredFile): Promise<void> {
	const held = await round.deps.lock(round.host, () => putUnderLock(round, file));
	if (!held.acquired) {
		round.report.deferred += 1;
		return;
	}
	round.report[PUT_FIELD[held.value]] += 1;
}

async function runRound(
	deps: CopyDeps,
	host: string,
	plan: ApplyPlan,
	withdrawn: readonly string[],
	report: CopyApplyReport,
	takeWithdrawn: () => readonly string[],
): Promise<void> {
	await withdraw(deps, host, withdrawn, plan.del, report);
	const deleting: ReadonlySet<string> = new Set(plan.del);
	const known = await verifyDeletions(deps, host, deleting);
	const round: Round = {
		deps,
		host,
		report,
		known,
		landed: new Map(),
		takeWithdrawn,
		reverify: false,
	};
	await preempt(round);
	await grantMarks(
		round,
		plan.mark.filter((mark) => mark.published).map((mark) => mark.key),
	);
	for (const file of plan.put) {
		await preempt(round);
		await putOne(round, file);
	}
	if (round.reverify) await verifyDeletions(deps, host, deleting);
}

function noteFailure(report: CopyApplyReport, error: unknown): void {
	report.error = error instanceof DedaloError ? error.code : 'internal.unexpected';
	console.error(`[media_copy] ${report.host}: round stopped (${report.error}):`, error);
}

function finalState(report: CopyApplyReport, pending: number, withdrawOnly = false): RoundOutcome {
	if (report.error !== null) {
		return { state: TRANSIENT_CODES.has(report.error) ? 'pending' : 'failed', error: report.error };
	}
	if (pending > 0 && report.deferred === 0 && !withdrawOnly)
		return { state: 'failed', error: DELETION_UNVERIFIED };
	if (pending > 0 || report.deferred > 0) return { state: 'pending', error: null };
	return { state: 'ok', error: null };
}

async function settle(
	deps: Pick<CopyDeps, 'updateRuntime'>,
	host: string,
	report: CopyApplyReport,
	pendingPuts: number | null,
	withdrawOnly = false,
): Promise<void> {
	let outcome: RoundOutcome = finalState(report, 0);
	const settled = await deps.updateRuntime(host, (cur) => {
		outcome = finalState(report, cur.pending_deletions.length, withdrawOnly);
		return {
			...cur,
			state: outcome.state,
			error: outcome.error,
			pending_puts: pendingPuts ?? cur.pending_puts,
		};
	});
	report.state = outcome.state;
	report.error = outcome.error;
	report.pending_deletions = settled.pending_deletions.length;
}

/** Run one plan against one host (see the header). Never throws on an agent failure. */
export async function applyCopyWith(
	deps: CopyDeps,
	host: string,
	plan: ApplyPlan,
	options: ApplyOptions = {},
): Promise<CopyApplyReport> {
	assertPlanPublic(deps, host, plan);
	const report = newReport(host);
	const withdrawn = plan.mark.filter((mark) => !mark.published).map((mark) => mark.key);
	await recordPending(deps, host, [...withdrawn.map(agentMarkerPath), ...plan.del]);
	try {
		await runRound(deps, host, plan, withdrawn, report, options.takeWithdrawn ?? NOTHING_WITHDRAWN);
	} catch (error) {
		noteFailure(report, error);
	}
	if (options.withdrawOnly === true) {
		await settle(deps, host, report, null, true);
		return report;
	}
	const unsent = plan.put.length - report.put - report.skipped_unpublished - report.compensated;
	await settle(deps, host, report, Math.max(0, unsent));
	return report;
}

/** A round that failed before it had a plan (the planning walk / the manifest read). */
export async function recordRoundFailure(
	deps: Pick<CopyDeps, 'updateRuntime'>,
	host: string,
	error: unknown,
): Promise<CopyApplyReport> {
	const report = newReport(host);
	noteFailure(report, error);
	await settle(deps, host, report, null);
	return report;
}

function isAbsentOrLink(error: unknown): boolean {
	const code = (error as NodeJS.ErrnoException | null)?.code;
	return code === 'ENOENT' || code === 'ELOOP';
}

/**
 * Open + stat + stream one media-root-relative file, confined to the media root
 * (absoluteFromRelative) and with NO link followed at the last component (O_NOFOLLOW —
 * the planner never yields a link: one swapped in since the walk could point at a
 * master). Absent, a link, or not a regular file → null. The stream closes the file
 * when it ends or is cancelled.
 */
export async function openLocalMediaFile(
	relPath: string,
	mediaRoot?: string,
): Promise<LocalFile | null> {
	const absolute = absoluteFromRelative(`/${relPath}`, mediaRoot);
	let handle: fs.FileHandle;
	try {
		handle = await fs.open(
			absolute,
			constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
		);
	} catch (error) {
		if (isAbsentOrLink(error)) return null;
		throw error;
	}
	const info = await handle.stat().catch(async (error: unknown) => {
		await handle.close();
		throw error;
	});
	if (!info.isFile()) {
		await handle.close();
		return null;
	}
	const body = Readable.toWeb(handle.createReadStream()) as unknown as ReadableStream<Uint8Array>;
	return { size: info.size, mtimeMs: info.mtimeMs, body };
}

export interface TakesCopyIo {
	status(name: string): Promise<{ media: { mode: string } }>;
	lastState(name: string): Promise<MediaCopyRuntime['state'] | undefined>;
	markNotCopy(name: string): Promise<void>;
}

const realTakesCopyIo: TakesCopyIo = {
	status: (name) => hostStatus(name),
	lastState: async (name) => (await loadRuntime())[name]?.media_copy.state,
	markNotCopy: async (name) => {
		await updateHostRuntime(name, (cur) => ({
			...cur,
			media_copy: { ...cur.media_copy, state: 'n/a' },
		}));
	},
};

function tookCopy(state: MediaCopyRuntime['state'] | undefined): boolean {
	return state !== undefined && state !== 'n/a';
}

/**
 * Is `name` a copy-mode host? The agent's own word (`status.media.mode`). When it cannot
 * be asked, the last runtime state decides: a host that never took a copy (`n/a`) holds
 * nothing to withdraw; any other must have its withdrawal recorded. A runtime file that
 * cannot be read answers true: recording a withdrawal is never the unsafe side.
 */
export async function hostTakesCopy(
	name: string,
	io: TakesCopyIo = realTakesCopyIo,
): Promise<boolean> {
	let mode: string;
	try {
		mode = (await io.status(name)).media.mode;
	} catch {
		return tookCopy(await io.lastState(name).catch(() => 'failed' as const));
	}
	if (mode === 'copy') return true;
	await io.markNotCopy(name);
	return false;
}

export interface SyncDeps {
	takesCopy(host: string): Promise<boolean>;
	plan(host: string): Promise<ApplyPlan>;
	apply(host: string, plan: ApplyPlan, options?: ApplyOptions): Promise<CopyApplyReport>;
	recordFailure(host: string, error: unknown): Promise<CopyApplyReport>;
}

function withdrawOnlyPlan(keys: readonly string[]): ApplyPlan {
	return { put: [], del: [], mark: keys.map((key) => ({ key, published: false })) };
}

/**
 * One worker run for one host: skip a non-copy host; withdraw the hook's keys FIRST
 * (recorded pending, marker false — before the planning walk; a withdraw-only pass that
 * never judges older pending deletions, so a stale one never stops the plan that deletes
 * it); an agent that failed that stops here; otherwise plan from ground truth and apply.
 * `takeWithdrawn` drains the keys withdrawn while this run is in flight (pre-emption).
 */
export async function syncHostWith(
	deps: SyncDeps,
	host: string,
	withdrawnKeys: readonly string[],
	takeWithdrawn: () => readonly string[] = NOTHING_WITHDRAWN,
): Promise<CopyApplyReport | null> {
	if (!(await deps.takesCopy(host))) return null;
	if (withdrawnKeys.length > 0) {
		const first = await deps.apply(host, withdrawOnlyPlan(withdrawnKeys), {
			withdrawOnly: true,
			takeWithdrawn,
		});
		if (first.error !== null) return first;
	}
	let plan: ApplyPlan;
	try {
		plan = await deps.plan(host);
	} catch (error) {
		return deps.recordFailure(host, error);
	}
	return deps.apply(host, plan, { takeWithdrawn });
}
