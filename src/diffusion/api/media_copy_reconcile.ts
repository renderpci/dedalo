/**
 * MEDIA COPY RECONCILE — the run of the `media_copy` definition
 * (src/diffusion/api/reconcile.ts; engineering/PUBLICATION_HOST_SPEC.md §5.2; plan M3/M4/M6).
 *
 * STORES. Desired = `pub/` ∩ public-quality files on the work host (desiredPublicFiles —
 * Rule B's own decision, M1) against each COPY-mode publication agent's manifest (files +
 * mirrored pub/ markers). Drift per host = the planned puts, deletions and mark changes.
 *
 * ONE LANE, ONE MODE RULE. Everything host-facing goes through the facade beside this file
 * (src/diffusion/api/media_copy.ts):
 *   - DRY: planMediaCopyHost — Task 9's hostTakesCopy with no n/a write, then planCopy.
 *     Writes NOTHING but the local sha cache (no runtime, no agent mutation).
 *   - APPLY: syncMediaCopyHost — the started worker's per-host serialized lane (direct in a
 *     CLI process; the advisory target lock orders it across processes), so a scheduled run
 *     never interleaves with a pub/ hook run. Mode detection, the non-copy verdict (debt
 *     kept: media_copy_status.ts nonCopyRuntime), round failures (transient → pending,
 *     other → failed, by CODE) and the pending-deletion bookkeeping are all Task 9's; this
 *     run writes the runtime ONLY when the lane itself throws (no other writer records
 *     that), as `failed` + the code, with `pending_deletions` untouched.
 *
 * MEASURED, NEVER CLAIMED. An apply plans first (`planned`), syncs, then RE-PLANS against
 * the agent manifest (`remaining`): `applied = planned − remaining`. An unpublish the agent
 * never confirmed stays pending debt (red in the panel past one period) and is never
 * reported as done. A host the agent no longer declares copy while it still holds bytes
 * or debt answers its runtime code (copy_mode_withdrawn) as the outcome error. Hosts run
 * one at a time; one failing host never hides another; a corrupt registry or runtime file
 * still throws (loud, never "no hosts").
 */

import { DedaloError } from '../../core/errors/dedalo_error.ts';
import { loadRegistry, type PublicationHostRecord } from '../../core/publication_host/registry.ts';
import { loadRuntime, updateHostRuntime } from '../../core/publication_host/runtime.ts';
import type {
	ReconcileReport,
	ReconcileRunOptions,
	ReconcileScope,
} from '../../core/reconcile/registry.ts';
import { type CopyPlan, planCopy } from '../targets/mediastore/media_copy.ts';
import type { CopyApplyReport } from '../targets/mediastore/media_copy_apply.ts';
import { planMediaCopyHost, syncMediaCopyHost } from './media_copy.ts';

export interface MediaCopyHostOutcome {
	/** Task 9's copy-mode verdict; null when it could not be decided (the run failed first). */
	takes_copy: boolean | null;
	/** The plan measured before any change; null on a skip or a failed planning pass. */
	planned: { put: number; del: number; mark: number } | null;
	/** What the lane sent (CopyApplyReport); null on a dry run or a skip. */
	sent: { put: number; deleted: number; marked: number } | null;
	/** The lane's round state (CopyApplyReport.state); null on a dry run or a skip. */
	state: 'ok' | 'pending' | 'failed' | null;
	/** Runtime pending deletions after this run (the unverified-deletion debt). */
	pending_deletions: number;
	/** Plan size re-measured after an error-free apply; null otherwise. */
	remaining: number | null;
	/** A code (DedaloError code, internal.unexpected, deletion_unverified…) — the text goes to the log. */
	error: string | null;
}

type Counts = NonNullable<MediaCopyHostOutcome['planned']>;
type MediaCopyRow = Awaited<ReturnType<typeof loadRuntime>>[string]['media_copy'];

function emptyOutcome(): MediaCopyHostOutcome {
	return {
		takes_copy: null,
		planned: null,
		sent: null,
		state: null,
		pending_deletions: 0,
		remaining: null,
		error: null,
	};
}

function countsOf(plan: CopyPlan): Counts {
	return { put: plan.put.length, del: plan.del.length, mark: plan.mark.length };
}

function sizeOf(counts: Counts | null): number {
	return counts === null ? 0 : counts.put + counts.del + counts.mark;
}

function loggedCode(name: string, phase: string, error: unknown): string {
	console.error(`[media_copy] ${name} (${phase}) failed:`, error);
	return error instanceof DedaloError ? error.code : 'internal.unexpected';
}

async function runtimeRow(name: string): Promise<MediaCopyRow | undefined> {
	return (await loadRuntime())[name]?.media_copy;
}

async function pendingDeletions(name: string): Promise<number> {
	return (await runtimeRow(name))?.pending_deletions.length ?? 0;
}

function selectHosts(scope: ReconcileScope | undefined): PublicationHostRecord[] {
	const hosts = loadRegistry().hosts;
	if (scope === undefined) return hosts;
	const unknown = scope.filter((name) => !hosts.some((host) => host.name === name));
	if (unknown.length > 0) {
		throw new DedaloError('resource.not_found', {
			message: `media_copy: unknown publication host(s): ${unknown.join(', ')}`,
			coordinates: { publication_host: unknown.join(',') },
		});
	}
	return hosts.filter((host) => scope.includes(host.name));
}

/** The dry pass: writes nothing (but the sha cache). Also the apply's `planned` measurement. */
async function dryOutcome(name: string): Promise<MediaCopyHostOutcome> {
	try {
		const found = await planMediaCopyHost(name);
		const planned = found.takesCopy ? countsOf(found.plan) : null;
		return {
			...emptyOutcome(),
			takes_copy: found.takesCopy,
			planned,
			pending_deletions: await pendingDeletions(name),
		};
	} catch (error) {
		const code = loggedCode(name, 'plan', error);
		return { ...emptyOutcome(), pending_deletions: await pendingDeletions(name), error: code };
	}
}

async function remainingAfter(name: string, report: CopyApplyReport): Promise<number | null> {
	if (report.error !== null) return null;
	try {
		return sizeOf(countsOf(await planCopy(name)));
	} catch (error) {
		loggedCode(name, 're-plan', error);
		return null;
	}
}

/** The lane itself threw: the one outcome no other writer records. Debt untouched. */
async function laneThrew(
	name: string,
	error: unknown,
	planned: Counts | null,
): Promise<MediaCopyHostOutcome> {
	const code = loggedCode(name, 'apply', error);
	await updateHostRuntime(name, (cur) => ({
		...cur,
		media_copy: { ...cur.media_copy, state: 'failed', error: code },
	}));
	return {
		...emptyOutcome(),
		takes_copy: true,
		planned,
		state: 'failed',
		pending_deletions: await pendingDeletions(name),
		error: code,
	};
}

/** Skipped as non-copy: the runtime verdict decides whether debt is still held (copy_mode_withdrawn). */
async function notCopyOutcome(name: string): Promise<MediaCopyHostOutcome> {
	const row = await runtimeRow(name);
	const error = row?.state === 'failed' ? (row.error ?? 'failed') : null;
	return {
		...emptyOutcome(),
		takes_copy: false,
		pending_deletions: row?.pending_deletions.length ?? 0,
		error,
	};
}

async function sentOutcome(
	name: string,
	planned: Counts | null,
	report: CopyApplyReport,
): Promise<MediaCopyHostOutcome> {
	return {
		takes_copy: true,
		planned,
		sent: {
			put: report.put,
			deleted: report.deleted,
			marked: report.withdrawn + report.published,
		},
		state: report.state,
		pending_deletions: report.pending_deletions,
		remaining: await remainingAfter(name, report),
		error: report.error,
	};
}

async function applyOutcome(name: string): Promise<MediaCopyHostOutcome> {
	// A pre-plan that fails (an unreachable agent) yields planned null; the lane runs
	// anyway, so Task 9 records the round failure through its own writer.
	const { planned } = await dryOutcome(name);
	let report: CopyApplyReport | null;
	try {
		report = await syncMediaCopyHost(name);
	} catch (error) {
		return laneThrew(name, error, planned);
	}
	if (report === null) return notCopyOutcome(name);
	return sentOutcome(name, planned, report);
}

/** A failed host's drift is its known debt (at least 1: its state is unknown). */
function hostDrift(outcome: MediaCopyHostOutcome): number {
	if (outcome.error !== null) return Math.max(1, outcome.pending_deletions);
	const debt = outcome.takes_copy === false ? outcome.pending_deletions : 0;
	return Math.max(sizeOf(outcome.planned), outcome.remaining ?? 0, debt);
}

function hostApplied(outcome: MediaCopyHostOutcome): number {
	if (outcome.planned === null || outcome.remaining === null) return 0;
	return Math.max(0, sizeOf(outcome.planned) - outcome.remaining);
}

export async function runMediaCopyReconcile({
	apply,
	scope,
}: ReconcileRunOptions): Promise<ReconcileReport> {
	const hosts: Record<string, MediaCopyHostOutcome> = {};
	for (const host of selectHosts(scope)) {
		hosts[host.name] = apply ? await applyOutcome(host.name) : await dryOutcome(host.name);
	}
	const outcomes = Object.values(hosts);
	return {
		drift: outcomes.reduce((sum, outcome) => sum + hostDrift(outcome), 0),
		applied: outcomes.reduce((sum, outcome) => sum + hostApplied(outcome), 0),
		detail: { hosts },
	};
}
