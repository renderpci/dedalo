/**
 * counters_status widget — the matrix_counter audit + repair (PHP
 * widgets/counters_status wrapping counter::check_counters/modify_counter).
 * Engine-neutral (shared DB), differential-gated against live PHP.
 */

import { sql } from '../../db/postgres.ts';
import { termByTipo } from '../../ontology/labels.ts';
import { getMatrixTableFromTipo, getModelByTipo } from '../../ontology/resolver.ts';
import type { WidgetModule, WidgetResponse } from './support.ts';

/**
 * counters_status.get_value — the matrix_counter audit (PHP
 * counter::check_counters wrapped by the widget's get_value).
 */
export async function countersStatusGetValue(): Promise<WidgetResponse> {
	const errors: string[] = [];
	const datalist: Record<string, unknown>[] = [];

	const rows = (await sql.unsafe(
		`SELECT tipo, value FROM "matrix_counter" ORDER BY tipo ASC`,
		[],
	)) as { tipo: string; value: number | string }[];

	for (const row of rows) {
		const sectionTipo = row.tipo;
		// Only section tipos may own a counter row (PHP model check, messages kept).
		const model = await getModelByTipo(sectionTipo);
		if (model !== 'section') {
			errors.push(
				model === null || model === ''
					? `Counter row with tipo: '${sectionTipo}' is empty model_name. Maybe deleted TLD?`
					: `Counter row with tipo: '${sectionTipo}' is a '${model}' . Only sections can use counters. Fix ASAP`,
			);
			continue;
		}
		// The section's real last id — drift vs the counter means a fix is needed.
		const table = await getMatrixTableFromTipo(sectionTipo);
		let lastSectionId = 0;
		if (table !== null) {
			try {
				const maxRows = (await sql.unsafe(
					`SELECT section_id FROM "${table}" WHERE section_tipo = $1 ORDER BY section_id DESC LIMIT 1`,
					[sectionTipo],
				)) as { section_id: number }[];
				lastSectionId = Number(maxRows[0]?.section_id ?? 0);
			} catch {
				// PHP: a failed table read reports 0 (e.g. a mapped table that does
				// not exist on this install) — the audit row still lists the counter.
				lastSectionId = 0;
			}
		}
		datalist.push({
			section_tipo: sectionTipo,
			label: await termByTipo(sectionTipo, 'lg-spa'),
			counter_value: Number(row.value),
			last_section_id: lastSectionId,
		});
	}

	return {
		result: { datalist, errors },
		msg: 'OK. Request done successfully',
		errors: [],
	};
}

/**
 * counters_status.modify_counter — reset (delete the counter row) or fix
 * (consolidate to the section's real MAX(section_id)) one matrix_counter row
 * (PHP counter::modify_counter → delete_counter / consolidate_counter).
 * Faithful outcomes: 'fix' with NO data rows returns false; a missing counter
 * row is NOT created by 'fix' (the PHP update_counter(…, 0) create branch
 * never fires — its value pre-increments to 1). The refreshed audit datalist
 * is attached as PHP does.
 */
async function countersStatusModifyCounter(
	options: Record<string, unknown>,
): Promise<WidgetResponse> {
	const sectionTipo = typeof options.section_tipo === 'string' ? options.section_tipo : '';
	const counterAction = typeof options.counter_action === 'string' ? options.counter_action : '';
	if (sectionTipo === '') {
		return { result: false, msg: 'Error: empty mandatory section_tipo', errors: [] };
	}

	let result = false;
	if (counterAction === 'reset') {
		await sql.unsafe(`DELETE FROM "matrix_counter" WHERE tipo = $1`, [sectionTipo]);
		result = true;
	} else if (counterAction === 'fix') {
		const table = await getMatrixTableFromTipo(sectionTipo);
		if (table !== null) {
			const maxRows = (await sql.unsafe(
				`SELECT section_id FROM "${table}" WHERE section_tipo = $1 AND section_id > 0 ORDER BY section_id DESC LIMIT 1`,
				[sectionTipo],
			)) as { section_id: number }[];
			const biggerSectionId = Number(maxRows[0]?.section_id ?? 0);
			if (biggerSectionId > 0) {
				// counter existence probe (PHP tests, then updates; the create path
				// is inert — see doc) — the UPDATE is a no-op on a missing row.
				await sql.unsafe(`UPDATE "matrix_counter" SET value = $1 WHERE tipo = $2`, [
					biggerSectionId,
					sectionTipo,
				]);
				result = true;
			}
		}
	}

	// refreshed audit (PHP re-runs check_counters and attaches its datalist)
	const audit = await countersStatusGetValue();
	const auditDatalist = (audit.result as { datalist?: unknown[] } | null)?.datalist ?? [];

	return {
		result,
		msg: result
			? `OK. ${counterAction} counter successfully ${sectionTipo}`
			: `Error on ${counterAction} counter ${sectionTipo}`,
		errors: [],
		...({ datalist: auditDatalist } as Record<string, unknown>),
	} as WidgetResponse;
}

export const widget: WidgetModule = {
	spec: {
		id: 'counters_status',
		category: 'integrity',
		class: 'width_100',
		label: { kind: 'literal', text: 'Dédalo counters status' },
	},
	apiActions: {
		get_value: countersStatusGetValue,
		modify_counter: countersStatusModifyCounter,
	},
	getValue: countersStatusGetValue,
};
