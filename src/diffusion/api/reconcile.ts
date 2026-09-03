/**
 * DIFFUSION FACADE — the diffusion reconciles as registry definitions
 * (core/reconcile/registry.ts, S-10). The ONE legal core→diffusion import
 * target for them (boundary_seam_tripwire: facade-only).
 *
 * Two definitions: `media_index` (pub/ markers derived from dbs/ markers — a
 * pure filesystem hygiene, applied at boot) and `public_tier` (P1-12: what the
 * public tier holds — MariaDB rows, dbs/ markers, per-record files — against
 * what the matrix holds and flags publishable; operator-run, apply removes
 * ghosts only).
 *
 * Stores: `.publication/dbs/<db>/<table>/<key>` (ground truth per publication
 * target, written by applyTableState) versus `.publication/pub/<key>` (the
 * union the web server stats). Drift = keys whose pub/ marker is missing or
 * stray. Apply = touch/unlink them — pure filesystem hygiene, idempotent,
 * never destructive of anything that is not itself derived, which is why the
 * BOOT run keeps applying (today's server.ts posture, oracle index.ts:1183).
 */

import type { ReconcileDefinition } from '../../core/reconcile/registry.ts';
import { runPublicTierReconcile } from '../targets/mariadb/public_tier_reconcile.ts';
import { diffMediaIndex, reconcileMediaIndex } from '../targets/mediastore/media_index.ts';

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
	async run({ apply }) {
		if (!apply) {
			const diff = await diffMediaIndex();
			if (diff === null) return { drift: 0, applied: 0, detail: { enabled: false } };
			return {
				drift: diff.toAdd.length + diff.toRemove.length,
				applied: 0,
				detail: { enabled: true, to_add: diff.toAdd, to_remove: diff.toRemove },
			};
		}
		const healed = await reconcileMediaIndex();
		if (healed === null) return { drift: 0, applied: 0, detail: { enabled: false } };
		const drift = healed.added + healed.removed;
		return { drift, applied: drift, detail: { enabled: true, ...healed } };
	},
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
