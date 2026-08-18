/**
 * export_hierarchy widget — the thesaurus-registry sync action; the EXPORT
 * action (psql dumps of hierarchy sections into the install files dir) is
 * engine-denied (install-file tooling).
 */

import { sql } from '../../db/postgres.ts';
import { composeContains, locatorJsonVariants } from '../../search/containment.ts';
import { engineDenied, type WidgetModule, type WidgetResponse } from './support.ts';

/**
 * The PURE per-row decision of the registry sync: does THIS active hierarchy
 * registry row get deactivated?
 *
 * Two skips, both load-bearing:
 *  - `active_ts === '1'` — the registry already agrees with the thesaurus, so
 *    writing again would be a needless component save plus a time-machine row
 *    per already-synced hierarchy.
 *  - `target === 'rsc197'` — the 'People' hierarchy is EXEMPT (PHP
 *    hierarchy::sync_hierarchy_active_status). Drop this arm and pressing the
 *    button deactivates People on every install.
 *
 * `active_ts` arrives from `->>`, i.e. text or NULL: the comparison is against
 * the STRING '1', never a number and never truthiness.
 */
export function shouldDeactivate(row: {
	active_ts: string | null;
	target: string | null;
}): boolean {
	if (row.active_ts === '1') return false; // in sync
	if (row.target === 'rsc197') return false; // 'People' hierarchy exempt
	return true;
}

/**
 * Deactivate every ACTIVE hierarchy (hierarchy1 hierarchy4 = dd64/1) whose
 * 'active in thesaurus' flag (hierarchy125) is NOT yes — the registry follows
 * the thesaurus (PHP hierarchy::sync_hierarchy_active_status). The 'People'
 * hierarchy (target rsc197) is exempted. Writes go through the standard
 * component save path (TM row + modification metadata included).
 */
/*
 * COVERAGE-EXEMPT (coverage plan §5.2; reason registered in
 * engineering/crap_coverage_exempt.json): the SELECT below is
 * `WHERE section_tipo='hierarchy1'` with NO `section_id` bound — a whole-registry
 * reconcile BY DESIGN — so no scratch-scoped invocation exists: one call would
 * deactivate every out-of-sync hierarchy in the suite database and write a TM row
 * for each. The DECISION it drives is gated as `shouldDeactivate()`
 * (test/unit/export_hierarchy_deactivate_native.test.ts); the write path is
 * `saveComponentData`, gated elsewhere.
 */
async function exportHierarchySyncActiveStatus(): Promise<WidgetResponse> {
	// READ probe over the Postgres matrix (not the MariaDB diffusion side): the
	// dd64/1 active flag is matched in BOTH typed section_id forms
	// (WC-2026-08-10-section-id-int-canonical) because jsonb `@>` is
	// type-strict and stored locators are string-form until the int sweep,
	// int-form after. `active_ts` reads through `->>`, which renders either
	// stored type as text, so the '1' comparison below is type-agnostic.
	const queryParams: string[] = [];
	const activeClause = composeContains(
		`relation->'hierarchy4'`,
		[locatorJsonVariants({ section_id: 1, section_tipo: 'dd64' }).map((json) => `[${json}]`)],
		(payload) => {
			queryParams.push(payload);
			return `$${queryParams.length}`;
		},
	);
	const rows = (await sql.unsafe(
		`SELECT section_id,
		        relation->'hierarchy125'->0->>'section_id' AS active_ts,
		        COALESCE(data->'hierarchy53', string->'hierarchy53')->0->>'value' AS target
		 FROM matrix_hierarchy_main
		 WHERE section_tipo = 'hierarchy1'
		   AND ${activeClause}
		 ORDER BY section_id`,
		queryParams,
	)) as { section_id: number; active_ts: string | null; target: string | null }[];

	let errorCount = 0;
	const { saveComponentData } = await import('../../section/record/save_component.ts');
	for (const row of rows) {
		if (!shouldDeactivate(row)) continue;
		const outcome = await saveComponentData({
			componentTipo: 'hierarchy4',
			sectionTipo: 'hierarchy1',
			sectionId: Number(row.section_id),
			lang: 'lg-nolan',
			userId: -1,
			changedData: [
				{
					action: 'set_data',
					id: null,
					// NUMERICAL_MATRIX_VALUE_NO — the full locator shape the
					// component save persists for the radio_button. section_id is
					// minted as an INT: that is the canonical stored form
					// (WC-2026-08-10-section-id-int-canonical), not a string.
					value: [
						{
							id: 1,
							type: 'dd151',
							section_id: 2,
							section_tipo: 'dd64',
							from_component_tipo: 'hierarchy4',
						},
					],
				},
			],
		});
		if (!outcome.ok) errorCount++;
	}
	return { data: errorCount === 0 };
}

/**
 * The panel value the client render reads (`value.export_hierarchy_path`).
 * ALWAYS null on this engine: the export action writes install dump files
 * into the PHP tree and is engineDenied below, so there is no configured
 * EXPORT_HIERARCHY_PATH to report. The client render treats a falsy path as
 * "exporting not enabled" and shows only the sync form — which is the whole
 * of what this widget can do here. Without a getValue at all the panel
 * refuses to load (maintenance.widget_unavailable) and the sync form is
 * unreachable too.
 */
async function exportHierarchyGetValue(): Promise<WidgetResponse> {
	return { data: { export_hierarchy_path: null } };
}

export const widget: WidgetModule = {
	getValue: exportHierarchyGetValue,
	spec: {
		id: 'export_hierarchy',
		category: 'data',
		class: 'success width_100',
		label: { kind: 'label', key: 'export_hierarchy' },
	},
	apiActions: {
		sync_hierarchy_active_status: exportHierarchySyncActiveStatus,
		export_hierarchy: engineDenied(
			'export_hierarchy.export_hierarchy',
			'it writes install hierarchy dump files into the PHP tree',
		),
	},
};
