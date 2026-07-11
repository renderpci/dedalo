/**
 * component_section_id emit hook (audit S2-24; extracted verbatim from
 * section/read.ts): read-only, mode-agnostic (PHP get_data() always returns
 * [int|null] regardless of edit/list/tm) — the record's OWN section_id, never
 * JSONB-stored data. Owns the whole emission (the generic literal path would
 * look for a JSONB column this model does not have).
 */

import { buildDataItem } from '../../resolve/component_data.ts';
import type { ComponentEmitHook, EmitHookContext } from '../emit_hooks.ts';

export const sectionIdEmitHook: ComponentEmitHook = {
	async emitItem(context: EmitHookContext): Promise<void> {
		const { ddo, row, ddoMode, callerTipo, emission } = context;
		const entries = [row.section_id > 0 ? row.section_id : null];
		const item = buildDataItem(
			ddo.tipo,
			row.section_tipo,
			row.section_id,
			ddoMode,
			'lg-nolan',
			entries,
		);
		item.row_section_id = row.section_id;
		item.parent_tipo = callerTipo;
		emission.items.push(item);
	},
};
