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
 *     pending keeps its first `since`; a NEW unpublish — withdrawNowWith, a pre-empt,
 *     a compensation — renews it). A runtime file that refuses the record
 *     stops the round before anything is sent.
 *  2. WITHDRAW, in bounded target-lock units (MEDIA_COPY_UNIT_KEYS keys, then one
 *     MEDIA_DELETE_BATCH per unit): `media.mark false` for every key — the gate 404s
 *     from that instant — then `media.delete`.
 *  3. VERIFY. The agent manifest is read back: a pending path it no longer lists
 *     (as a file, an irregular path or a marker) is cleared, every other stays
 *     pending. Its marker list is the round's `known` set.
 *  A GRANT SUPERSEDES A PENDING WITHDRAWAL. A record republished before its deletion was
 *     verified (agent down at the unpublish; unpublished and republished inside a round)
 *     must not stay `deletion_unverified` forever: VERIFY also clears a pending marker whose
 *     key is published again, and (planned rounds only, never a withdraw-only pass) a
 *     pending file whose key is published under this host's Rule B and that the round
 *     does not delete; a `mark true` clears the key's pending
 *     marker, a landed put its own path. Only entries recorded no later than the instant
 *     before the deciding `pub/` check — a withdrawal recorded after it is a newer unpublish.
 *  4. GRANT, in units of MEDIA_COPY_UNIT_KEYS keys (pre-empting between them):
 *     `media.mark true` for each plan grant whose key is still published locally and not
 *     yet known. A marker with no file serves
 *     nothing (Rule B also needs the file), so granting first is gate-safe.
 *  5. PUT, per file, with the target lock held ONLY around its grant step:
 *     BEFORE the lock — check `pub/<key>` (gone → skipped), sha256 from the round's cache
 *     (a miss hashes the file; null = unstable → deferred), re-open with no link followed
 *     and re-stat (changed → deferred); UNDER the lock — re-check `pub/<key>` and ENSURE
 *     the agent marker (covers a deferred grant unit); AFTER it — stream, then re-check
 *     `pub/<key>`: a record unpublished while its bytes were in flight is COMPENSATED at
 *     once (recorded pending first, marker withdrawn, every file of that key landed this
 *     round deleted) and the round verifies again. No put outlives an unpublish (Review
 *     Focus 2).
 *  THE POOL BOUND. A lock unit is one main-pool transaction. A put's unit spans two
 *     local `pub/` checks and at most two `media.mark` calls (AGENT_TIMEOUTS_MS.media
 *     each) — never the hash nor the transfer, whatever the file size; a mark unit
 *     (grant / withdraw / pre-empt) spans at most MEDIA_COPY_UNIT_KEYS keys, a delete unit
 *     one media.delete batch — never the whole plan. Units of one host are serialized (one lane per host
 *     per process), so a copy round costs at most ONE main-pool connection per host, for
 *     control calls only; waiting for a busy lock holds none.
 *  WITHDRAWN CONSENT NEVER WAITS FOR A PUT. The worker sends a hook unpublish's
 *     `mark false` at once, outside the lane and every lock (withdrawNowWith) — never
 *     behind a streaming put. The agent re-checks the marker under its key lock before a
 *     put lands (a refused put is re-checked here: compensated when unpublished, deferred
 *     when not), and every `mark true` is followed by a `pub/<key>` re-check that undoes
 *     it when the record was unpublished meanwhile — whichever call reaches the agent
 *     first, an unpublished key ends unmarked.
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
 * after a round that deferred nothing is `failed` / `deletion_unverified`; a path the agent
 * ANSWERED it could not delete (media.delete `failed`) is data, not a stop: it stays
 * pending, the round goes on, and settles `failed` / `delete_failed`. A planned round
 * whose plan names linked files (media_copy.ts `plan.linked`, never put) is `failed` /
 * `linked_quality` — the narrowing is named on the panel, never a silent `pending`.
 *
 * Every dependency is injected (CopyDeps); media_copy.ts binds the real ones. The import
 * of media_copy.ts here is TYPE-only (erased), so the two never form a value cycle.
 * Callers outside the worker run a round inside media_copy_worker.ts inMediaCopyLane
 * (one lane per host); the worker calls this from inside the lane.
 */

import { constants, promises as fs, type Stats } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { TargetLockOutcome } from '../../../core/diffusion_bridge/target_lock.ts';
import { DedaloError } from '../../../core/errors/index.ts';
import { absoluteFromRelative, requireMediaRoot } from '../../../core/media/path.ts';
import {
	hostStatus,
	MEDIA_DELETE_BATCH,
	type MediaDeleteResult,
	type MediaManifest,
	type MediaPutFile,
} from '../../../core/publication_host/agent_client.ts';
import { nonCopyRuntime } from '../../../core/publication_host/media_copy_status.ts';
import {
	type HostRuntime,
	loadRuntime,
	updateHostRuntime,
} from '../../../core/publication_host/runtime.ts';
import { isAgentRefusal } from '../../../core/publication_host/wire.ts';
import type { CopyPlan, DesiredFile } from './media_copy.ts';

/** The actor every copy command carries (the agent's audit names it). */
export const MEDIA_COPY_ACTOR = 'engine:media_copy';

/** How long one unit waits for a host another process is copying to. */
export const MEDIA_COPY_LOCK_BOUND_MS = 60_000;

/** The runtime error of a deletion the manifest still lists after a full round. */
export const DELETION_UNVERIFIED = 'deletion_unverified';

/**
 * The runtime error of a planned round that left desired files uncopied because their
 * quality folder is reached through a link (media_copy.ts header: never put through it).
 */
export const LINKED_QUALITY = 'linked_quality';

/**
 * The runtime error of a round in which the agent answered that it could not delete some
 * paths (media.delete `failed`: an errno code or escapes_root, logged per path). Those
 * paths stay pending; every other batch, the grants and the puts still ran.
 */
export const DELETE_FAILED = 'delete_failed';

/**
 * THE UNIT BOUND of a mark unit: at most this many keys per target-lock unit (grant,
 * withdraw, pre-empt) — 2 × this many `media.mark` calls at most (a grant may undo itself),
 * each a live-proved mutation. A delete unit is ONE media.delete batch (MEDIA_DELETE_BATCH
 * paths, one request). The lock is released between units, and the round pre-empts
 * between grant units, so a first sync of tens of thousands of records, or a mass
 * unpublish, never pins a main-pool connection for the whole plan.
 */
export const MEDIA_COPY_UNIT_KEYS = 50;

function chunked<T>(items: readonly T[], size: number): T[][] {
	const out: T[][] = [];
	for (let start = 0; start < items.length; start += size)
		out.push(items.slice(start, start + size));
	return out;
}

const TRANSIENT_CODES: ReadonlySet<string> = new Set([
	'publication_host.unreachable',
	'publication_host.timeout',
	'publication_host.busy',
]);

export type MediaCopyRuntime = HostRuntime['media_copy'];

/** What an apply needs from a plan (media_copy.ts CopyPlan carries more). */
export type ApplyPlan = Pick<CopyPlan, 'put' | 'del' | 'mark'> &
	Partial<Pick<CopyPlan, 'linked' | 'desired'>>;

export interface LocalFile {
	size: number;
	mtimeMs: number;
	body: ReadableStream<Uint8Array>;
}

export interface CopyDeps {
	put(host: string, file: MediaPutFile, actor: string): Promise<void>;
	/** Per-path failures are data (`failed`), never a throw: the round goes on. */
	del(
		host: string,
		paths: readonly string[],
		actor: string,
	): Promise<Pick<MediaDeleteResult, 'failed'>>;
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
	/** Paths media.delete removed or found absent (withdrawal + compensations). */
	deleted: number;
	/** Paths the agent answered it could not delete (kept pending; DELETE_FAILED). */
	delete_failed: number;
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
	/** A DedaloError code, `internal.unexpected`, `deletion_unverified` or `linked_quality` — never prose. */
	error: string | null;
}

type PutOutcome = 'put' | 'unpublished' | 'changed' | 'timed_out' | 'refused' | 'compensated';

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
	progress: RoundProgress;
}

/**
 * HELD BYTES STAY COUNTED. `present` (the last manifest count) is what lets a host withdrawn
 * from copy mode go silent `n/a` (media_copy_status.ts nonCopyRuntime). A file that landed
 * (or may have: a timed-out put) after the round's opening verify is not in it, so a round
 * that landed any re-reads the manifest at its close; a round stopped before that close
 * adds its `landed` count to `present` in settle (an upper bound, corrected by the next
 * verify) — never a stale 0 while the agent serves the bytes.
 */
interface RoundProgress {
	landed: number;
	closed: boolean;
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
		delete_failed: 0,
		put: 0,
		published: 0,
		skipped_unpublished: 0,
		deferred: 0,
		compensated: 0,
		pending_deletions: 0,
		error: null,
	};
}

/** A host a copy flow writes for is a copy host: never left `n/a` (see explicitCopyState). */
function asCopyHost(cur: MediaCopyRuntime): MediaCopyRuntime {
	return cur.state === 'n/a' ? { ...cur, state: 'pending' } : cur;
}

/** `deps` whose every runtime write lifts `n/a` (asCopyHost) — bound at each entry point. */
function copyHostDeps<D extends Pick<CopyDeps, 'updateRuntime'>>(deps: D): D {
	return {
		...deps,
		updateRuntime: (host: string, fn: (cur: MediaCopyRuntime) => MediaCopyRuntime) =>
			deps.updateRuntime(host, (cur) => asCopyHost(fn(cur))),
	};
}

/**
 * Add `paths` to pending_deletions. A path already pending keeps its first `since` —
 * unless `renew` (a NEW unpublish: withdrawNowWith, a pre-empt, a compensation, an undone
 * grant), which moves it to now: a supersede decided before this withdrawal (dropPending,
 * verifyDeletions compare `since` to their decision instant) must never drop it.
 */
async function recordPending(
	deps: Pick<CopyDeps, 'updateRuntime' | 'now'>,
	host: string,
	paths: readonly string[],
	renew = false,
): Promise<void> {
	if (paths.length === 0) return;
	const since = deps.now().toISOString();
	const wanted = new Set(paths);
	await deps.updateRuntime(host, (cur) => {
		const known = new Set(cur.pending_deletions.map((entry) => entry.path));
		const kept = renew
			? cur.pending_deletions.map((entry) => (wanted.has(entry.path) ? { ...entry, since } : entry))
			: cur.pending_deletions;
		const added = [...wanted].filter((path) => !known.has(path)).map((path) => ({ path, since }));
		return { ...cur, pending_deletions: [...kept, ...added] };
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
	deps: Pick<CopyDeps, 'mark'>,
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

/**
 * media.delete `paths`, counting what the agent could not delete as DATA: those paths stay
 * pending (the manifest still lists them, so verifyDeletions keeps them) and the round goes
 * on — one undeletable file never blocks the other batches, the grants or the puts.
 */
async function deleteCounted(
	deps: Pick<CopyDeps, 'del'>,
	host: string,
	paths: readonly string[],
	report: CopyApplyReport,
): Promise<void> {
	if (paths.length === 0) return;
	const { failed } = await deps.del(host, paths, MEDIA_COPY_ACTOR);
	report.deleted += paths.length - failed.length;
	report.delete_failed += failed.length;
	for (const failure of failed.slice(0, 20)) {
		console.error(
			`[media_copy] ${host}: the agent could not delete ${failure.path} (${failure.error}); kept pending`,
		);
	}
}

/**
 * `media.mark false` for `keys`, MEDIA_COPY_UNIT_KEYS per lock unit. Best-effort across
 * units (a refused key never shields later units); a transient failure stops at once.
 * Answers false when a unit could not take the lock (counted deferred: the keys stay
 * recorded and the next run withdraws them), and the first non-transient failure.
 */
async function unmarkUnits(
	deps: CopyDeps,
	host: string,
	keys: readonly string[],
	report: CopyApplyReport,
	onDone: (done: readonly string[]) => void = () => {},
): Promise<{ acquired: boolean; failure: unknown }> {
	let failure: unknown = null;
	for (const unit of chunked(keys, MEDIA_COPY_UNIT_KEYS)) {
		const held = await deps.lock(host, async () => {
			const unmarked = await unmarkEach(deps, host, unit);
			report.withdrawn += unmarked.done.length;
			onDone(unmarked.done);
			if (unmarked.failure !== null && isTransient(unmarked.failure)) throw unmarked.failure;
			return unmarked.failure;
		});
		if (!held.acquired) {
			report.deferred += 1;
			return { acquired: false, failure };
		}
		failure ??= held.value;
	}
	return { acquired: true, failure };
}

/** media.delete `paths`, one MEDIA_DELETE_BATCH per lock unit. False = a unit was deferred. */
async function deleteUnits(
	deps: CopyDeps,
	host: string,
	paths: readonly string[],
	report: CopyApplyReport,
): Promise<boolean> {
	for (const unit of chunked(paths, MEDIA_DELETE_BATCH)) {
		const held = await deps.lock(host, () => deleteCounted(deps, host, unit, report));
		if (!held.acquired) {
			report.deferred += 1;
			return false;
		}
	}
	return true;
}

async function withdraw(
	deps: CopyDeps,
	host: string,
	keys: readonly string[],
	paths: readonly string[],
	report: CopyApplyReport,
): Promise<void> {
	const unmarked = await unmarkUnits(deps, host, keys, report);
	if (unmarked.acquired) await deleteUnits(deps, host, paths, report);
	if (unmarked.failure !== null) throw unmarked.failure;
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
	await recordPending(deps, host, keys.map(agentMarkerPath), true);
	const { failure } = await unmarkUnits(deps, host, keys, report, (done) => {
		for (const key of done) round.known.delete(key);
		if (done.length > 0) round.reverify = true;
	});
	if (failure !== null) throw failure;
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
 * file whose key is published under this host's Rule B and that this round does not delete
 * — in a PLANNED round only (`deleting` = plan.del, which holds every agent path outside
 * the desired set, so a present file it omits IS desired). A withdraw-only pass has no
 * desired set (`deleting` null): it never supersedes a file deletion.
 */
async function isSuperseded(
	deps: CopyDeps,
	classify: (relpath: string) => string | null,
	deleting: ReadonlySet<string> | null,
	path: string,
): Promise<boolean> {
	if (path.startsWith(MARKER_PREFIX)) return deps.isPublished(path.slice(MARKER_PREFIX.length));
	if (deleting === null) return false;
	const key = classify(path);
	return key !== null && !deleting.has(path) && (await deps.isPublished(key));
}

async function supersededPaths(
	deps: CopyDeps,
	host: string,
	deleting: ReadonlySet<string> | null,
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
	deleting: ReadonlySet<string> | null,
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

/**
 * `mark true` for `key` unless the round knows the agent holds it, then RE-CHECK `pub/<key>`:
 * a withdrawal is sent outside the put units (withdrawNowWith), so it may reach the agent
 * BEFORE this grant — a record unpublished meanwhile is withdrawn again at once (recorded
 * pending first). Answers whether the key stands granted.
 */
async function ensureMarker(round: Round, key: string): Promise<boolean> {
	if (round.known.has(key)) return true;
	const { deps, host } = round;
	const decidedAt = deps.now().getTime();
	await deps.mark(host, key, true, MEDIA_COPY_ACTOR);
	if (!(await deps.isPublished(key))) {
		await recordPending(deps, host, [agentMarkerPath(key)], true);
		round.reverify = true;
		await deps.mark(host, key, false, MEDIA_COPY_ACTOR);
		round.report.withdrawn += 1;
		return false;
	}
	round.known.add(key);
	round.report.published += 1;
	await dropPending(deps, host, new Set([agentMarkerPath(key)]), decidedAt);
	return true;
}

/** MEDIA_COPY_UNIT_KEYS keys per lock unit, pre-empting between units. */
async function grantMarks(round: Round, keys: readonly string[]): Promise<void> {
	for (const unit of chunked(keys, MEDIA_COPY_UNIT_KEYS)) {
		await preempt(round);
		const held = await round.deps.lock(round.host, async () => {
			for (const key of unit) {
				if (await round.deps.isPublished(key)) await ensureMarker(round, key);
			}
		});
		if (!held.acquired) {
			round.report.deferred += 1;
			return;
		}
	}
}

/** Record first, withdraw the marker, delete every file of the key this round landed. */
async function compensate(round: Round, key: string): Promise<PutOutcome> {
	const { deps, host, report } = round;
	const paths = round.landed.get(key) ?? [];
	await recordPending(deps, host, [agentMarkerPath(key), ...paths], true);
	round.reverify = true;
	await deps.mark(host, key, false, MEDIA_COPY_ACTOR);
	round.known.delete(key);
	report.withdrawn += 1;
	await deleteCounted(deps, host, paths, report);
	round.landed.delete(key);
	return 'compensated';
}

async function openUnchanged(deps: CopyDeps, file: DesiredFile): Promise<LocalFile | null> {
	const local = await deps.open(file.path);
	if (local === null) return null;
	if (local.size === file.size && local.mtimeMs === file.mtimeMs) return local;
	await local.body.cancel();
	return null;
}

/** Stream one prepared file (its marker already ensured under the lock), outside every lock. */
async function sendFile(round: Round, file: DesiredFile, prepared: PreparedFile): Promise<void> {
	const decidedAt = round.deps.now().getTime();
	await round.deps.put(
		round.host,
		{ path: file.path, sha256: prepared.sha256, size: file.size, body: prepared.local.body },
		MEDIA_COPY_ACTOR,
	);
	round.landed.set(file.key, [...(round.landed.get(file.key) ?? []), file.path]);
	round.progress.landed++;
	await dropPending(round.deps, round.host, new Set([file.path]), decidedAt);
}

/** The agent refused the put because the key's marker is gone (a withdrawal landed first). */
function isKeyUnpublishedRefusal(error: unknown): boolean {
	return isAgentRefusal(error, 'key_unpublished');
}

type SendOutcome = 'sent' | 'timed_out' | 'refused';

/**
 * A put that TIMED OUT is deferred, never the end of the round: one file the link cannot
 * push in time must not starve every file sorted after it, round after round. Its bytes
 * may have landed all the same, so it counts as landed for a compensation, and a record
 * unpublished meanwhile is compensated exactly as after a put that answered. A put the
 * agent REFUSED for want of the key's marker (a withdrawal reached it first) is not a
 * failure either: the key is no longer known, and the caller re-checks `pub/<key>`.
 */
async function sendOrDefer(
	round: Round,
	file: DesiredFile,
	prepared: PreparedFile,
): Promise<SendOutcome> {
	try {
		await sendFile(round, file, prepared);
		return 'sent';
	} catch (error) {
		if (isKeyUnpublishedRefusal(error)) {
			round.known.delete(file.key);
			return 'refused';
		}
		if (!(error instanceof DedaloError) || error.code !== 'publication_host.timeout') throw error;
		console.error(`[media_copy] ${round.host}: put ${file.path} timed out (deferred):`, error);
		round.landed.set(file.key, [...(round.landed.get(file.key) ?? []), file.path]);
		round.progress.landed++;
		return 'timed_out';
	}
}

const SENT_OUTCOME = {
	sent: 'put',
	timed_out: 'timed_out',
	refused: 'refused',
} as const satisfies Record<SendOutcome, PutOutcome>;

interface PreparedFile {
	local: LocalFile;
	sha256: string;
}

/**
 * Everything a put needs BEFORE the target lock: the local `pub/` check, the sha (a cache
 * miss hashes the whole file — gigabytes for AV), the re-open + re-stat. Nothing here
 * holds a connection.
 */
async function prepareFile(
	deps: CopyDeps,
	file: DesiredFile,
): Promise<PreparedFile | 'unpublished' | 'changed'> {
	if (!(await deps.isPublished(file.key))) return 'unpublished';
	const sha256 = await deps.sha256(file);
	if (sha256 === null) return 'changed';
	const local = await openUnchanged(deps, file);
	return local === null ? 'changed' : { local, sha256 };
}

/**
 * THE ONLY STEP OF A PUT UNDER THE TARGET LOCK: re-check `pub/<key>` and ensure the agent
 * marker (ensureMarker re-checks after its `mark true`). Bound of that main-pool
 * transaction: two local `pub/` checks and at most two `media.mark` calls
 * (AGENT_TIMEOUTS_MS.media each), whatever the file size. Answers whether to send.
 */
async function grantForPut(
	round: Round,
	file: DesiredFile,
): Promise<'granted' | 'unpublished' | 'busy'> {
	const held = await round.deps.lock(round.host, async () => {
		if (!(await round.deps.isPublished(file.key))) return false;
		return ensureMarker(round, file.key);
	});
	if (!held.acquired) return 'busy';
	return held.value ? 'granted' : 'unpublished';
}

/** The transfer, outside every lock; then the `pub/` re-check (compensate when unpublished). */
async function transfer(
	round: Round,
	file: DesiredFile,
	prepared: PreparedFile,
): Promise<PutOutcome> {
	const sent = await sendOrDefer(round, file, prepared);
	if (!(await round.deps.isPublished(file.key))) return compensate(round, file.key);
	return SENT_OUTCOME[sent];
}

async function grantOrClose(
	round: Round,
	file: DesiredFile,
	prepared: PreparedFile,
): Promise<'granted' | 'unpublished' | 'busy'> {
	try {
		const granted = await grantForPut(round, file);
		if (granted !== 'granted') await prepared.local.body.cancel();
		return granted;
	} catch (error) {
		await prepared.local.body.cancel();
		throw error;
	}
}

const GRANT_REFUSAL = { unpublished: 'unpublished', busy: 'changed' } as const;

async function putUnit(round: Round, file: DesiredFile): Promise<PutOutcome> {
	const prepared = await prepareFile(round.deps, file);
	if (typeof prepared === 'string') return prepared;
	const granted = await grantOrClose(round, file, prepared);
	if (granted !== 'granted') return GRANT_REFUSAL[granted];
	return transfer(round, file, prepared);
}

const PUT_FIELD = {
	put: 'put',
	unpublished: 'skipped_unpublished',
	changed: 'deferred',
	timed_out: 'deferred',
	refused: 'deferred',
	compensated: 'compensated',
} as const satisfies Record<PutOutcome, keyof CopyApplyReport>;

async function putOne(round: Round, file: DesiredFile): Promise<void> {
	round.report[PUT_FIELD[await putUnit(round, file)]] += 1;
}

async function runRound(
	deps: CopyDeps,
	host: string,
	plan: ApplyPlan,
	withdrawn: readonly string[],
	report: CopyApplyReport,
	takeWithdrawn: () => readonly string[],
	withdrawOnly: boolean,
	progress: RoundProgress,
): Promise<void> {
	await withdraw(deps, host, withdrawn, plan.del, report);
	const deleting: ReadonlySet<string> | null = withdrawOnly ? null : new Set(plan.del);
	const known = await verifyDeletions(deps, host, deleting);
	const round: Round = {
		deps,
		host,
		report,
		known,
		landed: new Map(),
		takeWithdrawn,
		reverify: false,
		progress,
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
	if (round.reverify || progress.landed > 0) await verifyDeletions(deps, host, deleting);
	progress.closed = true;
}

function noteFailure(report: CopyApplyReport, error: unknown): void {
	report.error = error instanceof DedaloError ? error.code : 'internal.unexpected';
	console.error(`[media_copy] ${report.host}: round stopped (${report.error}):`, error);
}

function finalState(
	report: CopyApplyReport,
	pending: number,
	withdrawOnly = false,
	linked = 0,
): RoundOutcome {
	if (report.error !== null) {
		return { state: TRANSIENT_CODES.has(report.error) ? 'pending' : 'failed', error: report.error };
	}
	if (report.delete_failed > 0) return { state: 'failed', error: DELETE_FAILED };
	if (pending > 0 && report.deferred === 0 && !withdrawOnly)
		return { state: 'failed', error: DELETION_UNVERIFIED };
	if (linked > 0) return { state: 'failed', error: LINKED_QUALITY };
	if (pending > 0 || report.deferred > 0) return { state: 'pending', error: null };
	return { state: 'ok', error: null };
}

interface SettleFacts {
	/** Files that landed after the last manifest count (RoundProgress): added to `present`. */
	landedUnverified?: number;
	/** The plan's desired-file count (CopyPlan.desired); absent = kept. */
	desired?: number;
}

async function settle(
	deps: Pick<CopyDeps, 'updateRuntime'>,
	host: string,
	report: CopyApplyReport,
	pendingPuts: number | null,
	withdrawOnly = false,
	linked = 0,
	facts: SettleFacts = {},
): Promise<void> {
	let outcome: RoundOutcome = finalState(report, 0);
	const settled = await deps.updateRuntime(host, (cur) => {
		outcome = finalState(report, cur.pending_deletions.length, withdrawOnly, linked);
		return {
			...cur,
			state: outcome.state,
			error: outcome.error,
			pending_puts: pendingPuts ?? cur.pending_puts,
			present: cur.present + (facts.landedUnverified ?? 0),
			desired: facts.desired ?? cur.desired,
		};
	});
	report.state = outcome.state;
	report.error = outcome.error;
	report.pending_deletions = settled.pending_deletions.length;
}

/** Run one plan against one host (see the header). Never throws on an agent failure. */
export async function applyCopyWith(
	rawDeps: CopyDeps,
	host: string,
	plan: ApplyPlan,
	options: ApplyOptions = {},
): Promise<CopyApplyReport> {
	const deps = copyHostDeps(rawDeps);
	assertPlanPublic(deps, host, plan);
	const report = newReport(host);
	const withdrawn = plan.mark.filter((mark) => !mark.published).map((mark) => mark.key);
	await recordPending(deps, host, [...withdrawn.map(agentMarkerPath), ...plan.del]);
	const progress: RoundProgress = { landed: 0, closed: false };
	try {
		await runRound(
			deps,
			host,
			plan,
			withdrawn,
			report,
			options.takeWithdrawn ?? NOTHING_WITHDRAWN,
			options.withdrawOnly === true,
			progress,
		);
	} catch (error) {
		noteFailure(report, error);
	}
	const landedUnverified = progress.closed ? 0 : progress.landed;
	if (options.withdrawOnly === true) {
		await settle(deps, host, report, null, true, 0, { landedUnverified });
		return report;
	}
	const unsent = plan.put.length - report.put - report.skipped_unpublished - report.compensated;
	await settle(deps, host, report, Math.max(0, unsent), false, plan.linked?.length ?? 0, {
		landedUnverified,
		desired: plan.desired,
	});
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
 * The opened file IS `<real media root>/<relpath>`, reached through NO link: the realpath
 * of the lexical path equals that path under the root's own realpath (a media root that
 * is itself a link is storage layout), and the lstat of it is the very inode the handle
 * holds (a link swapped back between the open and this check is caught too). O_NOFOLLOW
 * guards only the last component; this guards every directory above it — a quality folder
 * swapped for a link to a master folder would otherwise stream the master's bytes.
 */
async function isReachedWithoutLink(
	handleIno: { dev: bigint; ino: bigint },
	absolute: string,
	root: string,
): Promise<boolean> {
	try {
		const expected = path.join(await fs.realpath(root), path.relative(root, absolute));
		if ((await fs.realpath(absolute)) !== expected) return false;
		const seen = await fs.lstat(expected, { bigint: true });
		return seen.dev === handleIno.dev && seen.ino === handleIno.ino;
	} catch (error) {
		if (isAbsentOrLink(error)) return false;
		throw error;
	}
}

async function statOpened(
	handle: fs.FileHandle,
	absolute: string,
	root: string,
): Promise<Stats | null> {
	const info = await handle.stat();
	if (!info.isFile()) return null;
	const ids = await handle.stat({ bigint: true });
	return (await isReachedWithoutLink(ids, absolute, root)) ? info : null;
}

/**
 * Open + stat + stream one media-root-relative file, confined to the media root
 * (absoluteFromRelative) and reached through NO link: O_NOFOLLOW at the last component
 * (the planner never yields a link: one swapped in since the walk could point at a
 * master), isReachedWithoutLink for every directory above it. Absent, a link anywhere on
 * the way, or not a regular file → null (the round defers it). The stream closes the file
 * when it ends or is cancelled.
 */
export async function openLocalMediaFile(
	relPath: string,
	mediaRoot?: string,
): Promise<LocalFile | null> {
	const absolute = absoluteFromRelative(`/${relPath}`, mediaRoot);
	const root = requireMediaRoot(mediaRoot);
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
	const info = await statOpened(handle, absolute, root).catch(async (error: unknown) => {
		await handle.close();
		throw error;
	});
	if (info === null) {
		await handle.close();
		return null;
	}
	const body = Readable.toWeb(handle.createReadStream()) as unknown as ReadableStream<Uint8Array>;
	return { size: info.size, mtimeMs: info.mtimeMs, body };
}

export interface TakesCopyIo {
	status(name: string): Promise<{ media: { mode: string } }>;
	/** The last state the runtime PROVES (explicitCopyState); undefined = no answer on record. */
	lastState(name: string): Promise<MediaCopyRuntime['state'] | undefined>;
	markNotCopy(name: string): Promise<void>;
}

/**
 * The state a runtime row PROVES. `n/a` is also the DEFAULT of every row another writer
 * creates (api_reconcile, the probe), so it counts only when stamped (nonCopyRuntime sets
 * `last_verified_at`; every copy-flow write lifts `n/a` to `pending` — asCopyHost — so a
 * stamped `n/a` is the agent's word). An unstamped `n/a` is no answer: undefined.
 */
export function explicitCopyState(
	row: MediaCopyRuntime | undefined,
): MediaCopyRuntime['state'] | undefined {
	if (row === undefined) return undefined;
	if (row.state === 'n/a' && row.last_verified_at === null) return undefined;
	return row.state;
}

const realTakesCopyIo: TakesCopyIo = {
	status: (name) => hostStatus(name),
	lastState: async (name) => explicitCopyState((await loadRuntime())[name]?.media_copy),
	// The agent's non-copy answer (media_copy_status.ts nonCopyRuntime): `n/a`, stamped, only
	// when the host holds nothing — its media routes are refused now, so nothing it holds can
	// be withdrawn or verified. A host withdrawn from copy mode while it still holds bytes or
	// unverified deletions is `failed` / copy_mode_withdrawn, its debt kept (red, never a
	// silent n/a: the old copy root may still be served).
	markNotCopy: async (name) => {
		const at = new Date().toISOString();
		await updateHostRuntime(name, (cur) => ({
			...cur,
			media_copy: nonCopyRuntime(cur.media_copy, at),
		}));
	},
};

/**
 * Is `name` a copy-mode host? The agent's own word (`status.media.mode`). When it cannot
 * be asked, the last PROVEN runtime state decides (explicitCopyState), and ONLY an `n/a`
 * the agent answered before answers false. No row, a default row another writer created,
 * or a runtime file that cannot be read answers true: an unpublish must never fail open —
 * its withdrawal is recorded pending and the panel turns red until the agent answers.
 */
export async function hostTakesCopy(
	name: string,
	io: TakesCopyIo = realTakesCopyIo,
): Promise<boolean> {
	let mode: string;
	try {
		mode = (await io.status(name)).media.mode;
	} catch {
		const last = await io.lastState(name).catch(() => undefined);
		return last !== 'n/a';
	}
	if (mode === 'copy') return true;
	await io.markNotCopy(name);
	return false;
}

export interface WithdrawNowDeps extends Pick<CopyDeps, 'mark' | 'updateRuntime' | 'now'> {
	takesCopy(host: string): Promise<boolean>;
}

/**
 * WITHDRAWN CONSENT, AT ONCE: `media.mark false` for `keys` on `host` outside every round
 * and every lock — never behind a put unit (an AV transfer may stream for minutes). Safe
 * without the target lock: the agent re-checks the marker under its per-key lock before a
 * put lands, and a grant re-checks `pub/<key>` after its `mark true` (ensureMarker), so
 * neither order of the two calls leaves an unpublished key marked. Recorded pending first;
 * the files are the queued run's plan to delete, the marker its manifest to verify.
 * Throws the first failure (the worker logs it; the queued run withdraws again).
 */
export async function withdrawNowWith(
	rawDeps: WithdrawNowDeps,
	host: string,
	keys: readonly string[],
): Promise<void> {
	const unique = [...new Set(keys)];
	if (unique.length === 0 || !(await rawDeps.takesCopy(host))) return;
	const deps = copyHostDeps(rawDeps);
	await recordPending(deps, host, unique.map(agentMarkerPath), true);
	const { failure } = await unmarkEach(deps, host, unique);
	if (failure !== null) throw failure;
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
