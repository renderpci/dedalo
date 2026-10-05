/**
 * DIFFUSION FACADE — the diffusion reconciles as registry definitions
 * (core/reconcile/registry.ts, S-10). The ONE legal core→diffusion import
 * target for them (boundary_seam_tripwire: facade-only).
 *
 * Three definitions: `media_index` (pub/ markers derived from dbs/ markers — a
 * pure filesystem hygiene, applied at boot), `public_tier` (P1-12: what the
 * public tier holds — MariaDB rows, dbs/ markers, per-record files — against
 * what the matrix holds and flags publishable; operator-run, apply removes
 * ghosts only) and `media_copy` (pub/ ∩ public files against each copy-mode
 * publication agent's manifest, applied on its interval through the copy
 * worker's per-host lane — PUBLICATION_HOST_SPEC §5.2; its run lives in
 * media_copy_reconcile.ts).
 *
 * Stores: `.publication/dbs/<db>/<table>/<key>` (ground truth per publication
 * target, written by applyTableState) versus `.publication/pub/<key>` (the
 * union the web server stats). Drift = keys whose pub/ marker is missing or
 * stray. Apply = touch/unlink them — pure filesystem hygiene, idempotent,
 * never destructive of anything that is not itself derived, which is why the
 * BOOT run keeps applying (today's server.ts posture, oracle index.ts:1183).
 */

import { MEDIA_COPY_PERIOD_MS } from '../../core/publication_host/media_copy_status.ts';
import type {
	ReconcileDefinition,
	ReconcileReport,
	ReconcileRunOptions,
} from '../../core/reconcile/registry.ts';
import { runPublicTierReconcile } from '../targets/mariadb/public_tier_reconcile.ts';
import {
	diffMediaIndex,
	type MediaIndexFenceOptions,
	reconcileMediaIndex,
} from '../targets/mediastore/media_index.ts';
import { runMediaCopyReconcile } from './media_copy_reconcile.ts';

/**
 * The `media_index` run. The APPLY holds every marker database's fence (the
 * store's one apply door, media_index.ts reconcileMediaIndex, DIFF-2) within one
 * bounded wait; DEFERRED — a writer kept a database past it — applies nothing
 * and reports the drift a plain diff measures now (`applied` 0 against it, the
 * held target in `detail.deferred`), so the scheduler's warning and the gauge
 * show an apply that did not happen rather than a clean run. `fence` is the
 * gate's seam for the bound; the registry passes none.
 */
export async function runMediaIndexReconcile(
	{ apply }: ReconcileRunOptions,
	fence: MediaIndexFenceOptions = {},
): Promise<ReconcileReport> {
	if (!apply) {
		const diff = await diffMediaIndex();
		if (diff === null) return { drift: 0, applied: 0, detail: { enabled: false } };
		return {
			drift: diff.toAdd.length + diff.toRemove.length,
			applied: 0,
			detail: { enabled: true, to_add: diff.toAdd, to_remove: diff.toRemove },
		};
	}
	const healed = await reconcileMediaIndex(fence);
	if (healed === null) return { drift: 0, applied: 0, detail: { enabled: false } };
	if (healed.deferred !== undefined) {
		const diff = await diffMediaIndex();
		const drift = diff === null ? 0 : diff.toAdd.length + diff.toRemove.length;
		return { drift, applied: 0, detail: { enabled: true, deferred: healed.deferred } };
	}
	const drift = healed.added + healed.removed;
	return { drift, applied: drift, detail: { enabled: true, ...healed } };
}

export const MEDIA_INDEX_RECONCILE: ReconcileDefinition = {
	name: 'media_index',
	stores: [
		'.publication/dbs (per-target publication truth)',
		'.publication/pub (web-server union)',
	],
	description:
		'Rebuild the pub/ publication markers from the per-target dbs/ truth — heals a crash between a publication commit and its marker write; null-drift when the marker store is off.',
	scopeLabel: null,
	schedule: 'boot',
	autoApply: {
		reason:
			'pub/ is a pure derivation of dbs/: recomputing it can only add a marker the truth owns or drop one it does not; two directory walks, no SQL',
	},
	sources: ['src/diffusion/targets/mediastore/media_index.ts', 'src/diffusion/api/reconcile.ts'],
	// The pub/ union is derived from EVERY database's dbs/ subtree: the store's
	// one apply door holds the fence of every database that can write a marker
	// pair, and applies nothing from a round a new subtree appeared in
	// (media_index.ts reconcileMediaIndex, DIFF-2).
	run: (options) => runMediaIndexReconcile(options),
};

export const PUBLIC_TIER_RECONCILE: ReconcileDefinition = {
	name: 'public_tier',
	stores: [
		'matrix (record existence + publication flag)',
		'public tier (MariaDB rows, .publication/dbs markers, per-record rdf/xml/markdown files)',
	],
	description:
		'Report public-tier GHOSTS (records the matrix no longer holds or no longer flags publishable, still served) and MISSING publications (flagged, not in a target), plus the pending/terminal dd1758 unpublish debt; apply unpublishes ghosts only — a missing publication is a job, never a reconcile side effect. An unreachable MariaDB target is reported, its markers and files still compared.',
	scopeLabel: 'section tipo',
	schedule: 'operator',
	sources: [
		'src/diffusion/targets/mariadb/public_tier_reconcile.ts',
		'src/diffusion/api/reconcile.ts',
	],
	async run({ apply, scope }) {
		return runPublicTierReconcile(scope === undefined ? { apply } : { apply, scope });
	},
};

export const MEDIA_COPY_RECONCILE: ReconcileDefinition = {
	name: 'media_copy',
	stores: [
		'work host: .publication/pub ∩ public-quality media files',
		'copy-mode publication agents: media manifest + mirrored pub/ markers',
	],
	description:
		"Diff each copy-mode publication host's media (files + mirrored pub/ markers, from the agent manifest) against what the work host publishes; apply runs through the copy worker's per-host lane — copies what is missing (sha-verified), unmarks then deletes what is no longer published, verifies deletions against the manifest — and re-plans to measure what it fixed. Non-copy hosts are skipped (one withdrawn from copy mode while still holding bytes stays failed); an unreachable host is reported with its pending deletions, never as done.",
	scopeLabel: 'publication host name',
	schedule: { everyMs: MEDIA_COPY_PERIOD_MS },
	autoApply: {
		reason:
			'pure derivation of pub/ ∩ public files: an apply can only copy a file the work host already publishes or remove one it no longer does — withdrawn consent must not wait for an operator',
	},
	sources: [
		'src/diffusion/targets/mediastore/media_copy.ts',
		'src/diffusion/api/media_copy.ts',
		'src/diffusion/api/media_copy_reconcile.ts',
		'src/diffusion/api/reconcile.ts',
	],
	run: (options) => runMediaCopyReconcile(options),
};
