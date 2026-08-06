/**
 * component_external EMIT HOOK — a REPLACE hook (the media / section_id shape):
 * it fully owns the ddo's emission and the generic path returns after it.
 *
 * It must own emission because there is nothing generic to run. The relation
 * branch reads `record.columns.relation[<tipo>]` and returns early on an empty
 * bag — and an external section has no matrix row at all (zenon1: zero rows in
 * any table, no `matrix_zenon`), so routing this model through the portal
 * resolver made it emit ZERO items, always. The literal branch would look for a
 * jsonb column this model does not have either. The value is DERIVED; the
 * derivation lives in value.ts, and this file is only the emission shape.
 *
 * THE ITEM IS LITERAL-SHAPED: `entries: string[]`, `lang: 'lg-nolan'` (the value
 * is whatever the remote service holds — it carries no Dédalo language), and
 * the host row's `section_id` ECHOED VERBATIM. The echo is load-bearing: the
 * remote id is a zero-padded string ('001338683'), the client matches its
 * instance by STRING equality of the two ids, and a `Number()` anywhere in the
 * chain both breaks that match and asks the service for a different record.
 *
 * NO PATH EMITS A SILENT BLANK — gated by external_degradation_tripwire. When
 * the values cannot be derived the item still emits, with `source_status`
 * naming the state (see value.ts).
 */

import { buildDataItem } from '../../resolve/component_data.ts';
import type { ComponentEmitHook, EmitHookContext } from '../emit_hooks.ts';
import { deriveExternalValue } from './value.ts';

export const externalEmitHook: ComponentEmitHook = {
	async emitItem(context: EmitHookContext): Promise<void> {
		const { ddo, row, ddoMode, callerTipo, emission } = context;
		// VERBATIM, both times: `rawSectionId` keeps whatever type the caller
		// carried (a locator's string id stays a string), and the remote id is its
		// String() form — never Number(), which drops the leading zeros.
		const rawSectionId = (row as { section_id: unknown }).section_id;
		const remoteId =
			rawSectionId === null || rawSectionId === undefined ? '' : String(rawSectionId);

		const derived = await deriveExternalValue(ddo.tipo, row.section_tipo, remoteId, {
			emission,
		});

		const item = buildDataItem(
			ddo.tipo,
			row.section_tipo,
			rawSectionId as number,
			ddoMode,
			'lg-nolan',
			derived.entries,
		);
		item.row_section_id = row.section_id;
		item.parent_tipo = callerTipo;
		// Both optional wire fields are emitted ONLY when they say something: a
		// plain fresh all-text success emits neither, so the ordinary item is
		// byte-identical to what a caller would emit with no provenance at all.
		if (derived.entries_kind !== undefined) item.entries_kind = derived.entries_kind;
		if (derived.source_status !== undefined) item.source_status = derived.source_status;
		emission.items.push(item);
	},
};
