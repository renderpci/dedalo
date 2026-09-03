/**
 * DIFFUSION FACADE — the publication-marker reconcile as a registry definition
 * (core/reconcile/registry.ts, S-10). The ONE legal core→diffusion import
 * target for it (boundary_seam_tripwire: facade-only).
 *
 * Stores: `.publication/dbs/<db>/<table>/<key>` (ground truth per publication
 * target, written by applyTableState) versus `.publication/pub/<key>` (the
 * union the web server stats). Drift = keys whose pub/ marker is missing or
 * stray. Apply = touch/unlink them — pure filesystem hygiene, idempotent,
 * never destructive of anything that is not itself derived, which is why the
 * BOOT run keeps applying (today's server.ts posture, oracle index.ts:1183).
 */

import type { ReconcileDefinition } from '../../core/reconcile/registry.ts';
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
