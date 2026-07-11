/**
 * export_hierarchy widget — the thesaurus-registry sync action; the EXPORT
 * action (psql dumps of hierarchy sections into the install files dir) is
 * engine-denied (install-file tooling).
 */

import { sql } from '../../db/postgres.ts';
import { type WidgetModule, type WidgetResponse, engineDenied } from './support.ts';

/**
 * Deactivate every ACTIVE hierarchy (hierarchy1 hierarchy4 = dd64/1) whose
 * 'active in thesaurus' flag (hierarchy125) is NOT yes — the registry follows
 * the thesaurus (PHP hierarchy::sync_hierarchy_active_status). The 'People'
 * hierarchy (target rsc197) is exempted. Writes go through the standard
 * component save path (TM row + modification metadata included).
 */
async function exportHierarchySyncActiveStatus(): Promise<WidgetResponse> {
	const rows = (await sql.unsafe(
		`SELECT section_id,
		        relation->'hierarchy125'->0->>'section_id' AS active_ts,
		        COALESCE(data->'hierarchy53', string->'hierarchy53')->0->>'value' AS target
		 FROM matrix_hierarchy_main
		 WHERE section_tipo = 'hierarchy1'
		   AND relation->'hierarchy4' @> '[{"section_id":"1","section_tipo":"dd64"}]'::jsonb
		 ORDER BY section_id`,
		[],
	)) as { section_id: number; active_ts: string | null; target: string | null }[];

	let errorCount = 0;
	const { saveComponentData } = await import('../../section/record/save_component.ts');
	for (const row of rows) {
		if (row.active_ts === '1') continue; // in sync
		if (row.target === 'rsc197') continue; // 'People' hierarchy exempt
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
					// NUMERICAL_MATRIX_VALUE_NO — the full locator shape PHP's
					// component save persists for the radio_button
					value: [
						{
							id: 1,
							type: 'dd151',
							section_id: '2',
							section_tipo: 'dd64',
							from_component_tipo: 'hierarchy4',
						},
					],
				},
			],
		});
		if (!outcome.ok) errorCount++;
	}
	return {
		result: errorCount === 0,
		msg: 'OK. Request done successfully',
		errors: [],
	};
}

export const widget: WidgetModule = {
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
