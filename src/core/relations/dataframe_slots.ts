/**
 * THE DATAFRAME SLOTS OF A MAIN COMPONENT, and the frames they hold — the one
 * discovery both halves of the Time Machine frame contract read:
 *
 *  - the CAPTURE half (section/record/save_component.ts): an append-import
 *    save composes the slots' frames into the main's TM row (PHP
 *    `component_common::get_time_machine_data_to_save` :1580 — the main's own
 *    data followed by every slot's FULL data);
 *  - the RESTORE half (tools/tool_time_machine/server/dataframe_restore.ts):
 *    apply_value and the dd800 bulk revert plan the slot writes from a
 *    snapshot against these slots.
 *
 * Lives in core because the save path is core and must not import a tool; the
 * tool re-exports it, so there is one discovery, never two that drift.
 *
 * WHY THE SLOT SET IS A UNION (deliberate divergence,
 * WC-2026-08-09-time-machine-restore-replays-paired-dataframe-frames): PHP
 * discovers slots from the main's `request_config` show map alone, which
 * misses a LITERAL main whose frames activate on `has_dataframe` + ontology
 * parentage. The union is the ontology children plus the own-config ddos (show
 * AND hide) that resolve to `component_dataframe`.
 */

import type { MatrixJsonbColumn } from '../db/matrix.ts';
import { sql } from '../db/postgres.ts';
import { getColumnNameByModel, getModelByTipo, getPropertiesByTipo } from '../ontology/resolver.ts';
import { getDataframeChildTipos } from '../section/list_definitions/section_list.ts';

/** The `tipo` strings of one ddo_map (anything else in it names nothing). */
function ddoMapTipos(map: unknown): string[] {
	if (!Array.isArray(map)) return [];
	return map
		.map((ddo) => (ddo as { tipo?: unknown } | null)?.tipo)
		.filter((tipo): tipo is string => typeof tipo === 'string');
}

/** Every `tipo` named by a ddo of the component's OWN request_config (show + hide). */
function ownConfigDdoTipos(properties: unknown): string[] {
	const source = (properties as { source?: { request_config?: unknown } } | null)?.source;
	const config = source?.request_config;
	if (!Array.isArray(config)) return [];
	return config.flatMap((item) => {
		const blocks = item as Record<string, { ddo_map?: unknown }> | null;
		return [...ddoMapTipos(blocks?.show?.ddo_map), ...ddoMapTipos(blocks?.hide?.ddo_map)];
	});
}

/**
 * The dataframe slot tipos of a main component (PHP `get_dataframe_ddo`,
 * broadened per the header): ontology children with model
 * `component_dataframe` ∪ own-config ddos that resolve to that model.
 * Order is stable (children first, then config order) so a composed TM
 * snapshot is deterministic.
 */
export async function resolveDataframeSlotTipos(mainTipo: string): Promise<string[]> {
	const candidates = [
		...(await getDataframeChildTipos(mainTipo)),
		...ownConfigDdoTipos(await getPropertiesByTipo(mainTipo)),
	];
	const slots: string[] = [];
	for (const tipo of candidates) {
		if (slots.includes(tipo)) continue;
		if ((await getModelByTipo(tipo)) === 'component_dataframe') slots.push(tipo);
	}
	return slots;
}

/**
 * Every frame the main component's slots hold on one record, slot by slot in
 * `resolveDataframeSlotTipos` order — the FULL slot data, as PHP appends it.
 * Read on the ambient connection: inside a save's transaction it sees the row
 * the save holds `FOR UPDATE`. `[]` for a main without slots.
 */
export async function readDataframeSlotFrames(
	table: string,
	sectionTipo: string,
	sectionId: number,
	mainTipo: string,
): Promise<unknown[]> {
	const slots = await resolveDataframeSlotTipos(mainTipo);
	if (slots.length === 0) return [];
	const column = getColumnNameByModel('component_dataframe') as MatrixJsonbColumn | null;
	if (column === null) return [];
	const frames: unknown[] = [];
	for (const slot of slots) {
		const rows = (await sql.unsafe(
			`SELECT "${column}"->$3 AS frames FROM "${table}" WHERE section_tipo = $1 AND section_id = $2`,
			[sectionTipo, sectionId, slot],
		)) as { frames: unknown }[];
		const slotFrames = rows[0]?.frames;
		if (Array.isArray(slotFrames)) frames.push(...slotFrames);
	}
	return frames;
}
