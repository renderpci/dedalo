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
 *     never only after the round (M2). Its files are deleted by the queued run's plan.
 *
 * Before any call the plan is checked against this host's OWN Rule B (the injected
 * classifier = media_copy.ts publicFileClassifier over the host's qualities): a put
 * entry that is not a plain relative path classifying to its own key is an internal
 * invariant failure — never copied.
 *
 * A transport failure (unreachable / timeout / busy) stops the round as `pending`, any
 * other as `failed`; the CODE (never agent prose) goes to the runtime file and the
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

type PutOutcome = 'put' | 'unpublished' | 'changed' | 'compensated';

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

async function withdraw(
	deps: CopyDeps,
	host: string,
	keys: readonly string[],
	paths: readonly string[],
	report: CopyApplyReport,
): Promise<void> {
	if (keys.length === 0 && paths.length === 0) return;
	const held = await deps.lock(host, async () => {
		for (const key of keys) await deps.mark(host, key, false, MEDIA_COPY_ACTOR);
		await deps.del(host, paths, MEDIA_COPY_ACTOR);
	});
	if (!held.acquired) {
		report.deferred += 1;
		return;
	}
	report.withdrawn += keys.length;
	report.deleted += paths.length;
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
		for (const key of keys) await deps.mark(host, key, false, MEDIA_COPY_ACTOR);
	});
	if (!held.acquired) {
		report.deferred += 1;
		return;
	}
	for (const key of keys) round.known.delete(key);
	report.withdrawn += keys.length;
}

/** Clears verified deletions; answers the marker keys the agent holds now. */
async function verifyDeletions(deps: CopyDeps, host: string): Promise<Set<string>> {
	const manifest = await deps.manifest(host);
	const present = new Set([
		...manifest.entries.map((entry) => entry.path),
		...manifest.irregular,
		...manifest.markers.map(agentMarkerPath),
	]);
	const at = deps.now().toISOString();
	await deps.updateRuntime(host, (cur) => ({
		...cur,
		pending_deletions: cur.pending_deletions.filter((entry) => present.has(entry.path)),
		present: manifest.entries.length,
		last_verified_at: at,
	}));
	return new Set(manifest.markers);
}

async function ensureMarker(round: Round, key: string): Promise<void> {
	if (round.known.has(key)) return;
	await round.deps.mark(round.host, key, true, MEDIA_COPY_ACTOR);
	round.known.add(key);
	round.report.published += 1;
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
	await round.deps.put(
		round.host,
		{ path: file.path, sha256, size: file.size, body },
		MEDIA_COPY_ACTOR,
	);
	round.landed.set(file.key, [...(round.landed.get(file.key) ?? []), file.path]);
}

async function putUnderLock(round: Round, file: DesiredFile): Promise<PutOutcome> {
	const { deps } = round;
	if (!(await deps.isPublished(file.key))) return 'unpublished';
	const sha256 = await deps.sha256(file);
	if (sha256 === null) return 'changed';
	const local = await openUnchanged(deps, file);
	if (local === null) return 'changed';
	await sendFile(round, file, local, sha256);
	return (await deps.isPublished(file.key)) ? 'put' : compensate(round, file.key);
}

const PUT_FIELD = {
	put: 'put',
	unpublished: 'skipped_unpublished',
	changed: 'deferred',
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
	const known = await verifyDeletions(deps, host);
	const round: Round = { deps, host, report, known, landed: new Map(), takeWithdrawn };
	await preempt(round);
	await grantMarks(
		round,
		plan.mark.filter((mark) => mark.published).map((mark) => mark.key),
	);
	for (const file of plan.put) {
		await preempt(round);
		await putOne(round, file);
	}
	if (report.compensated > 0) await verifyDeletions(deps, host);
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
