/**
 * component_external — a component whose value is NOT stored: it is DERIVED, at
 * read time, from a third-party bibliographic API (Zenon, today). The record it
 * shows lives in the remote service; the local "record" is the remote id.
 *
 * WHY THERE IS NO resolveData. Until 2026-08-05 this descriptor named the
 * PORTAL resolver, which routed the model into expandPortal — a function that
 * reads `record.columns.relation[<tipo>]` and returns early when it finds
 * nothing. There is no matrix row anywhere for an external section (zenon1 has
 * ZERO rows in any matrix table, and no `matrix_zenon` exists), so the model
 * emitted zero items ALWAYS. v6 never read a column either: component_external
 * extends component_common and its get_dato() fetches from the remote API.
 * Emission is therefore owned by `emitHook: 'external'`
 * (component_external/emit.ts), and the relation resolver is simply not part of
 * this model's story. The named exemption lives in
 * descriptor_completeness_tripwire (NO_RESOLVE_DATA).
 *
 * WHY `column: 'relation'` SURVIVES, AND IS INERT. It is column-map parity with
 * PHP's section_record_data::$column_map, nothing more. No code path writes it
 * (the model is absent from component_relation_common::get_components_with_relations()
 * — see tools/tool_propagate_component_data PHP_LIST_EXCLUSIONS), and nothing
 * reads it (the emit hook fully owns emission, ahead of the relation branch in
 * section/read.ts emitDdoData). Moving the model off the relation column would
 * ALSO delete its search face, which the search dispatcher and
 * relation_search_builders.test.ts depend on — the column stays.
 *
 * WHY THERE IS NO importConform. The value is derived from a remote service, so
 * there is nothing an import may legitimately write: the local record has no
 * slot for it. With the facet omitted, a flat import cell is REFUSED per cell —
 * `IGNORED: '<model>' has no flat-value import form` (tools/import_data.ts:287-296,
 * the `conformImportData` no-facet tail) — leaving the existing record
 * untouched. Named exemption: NO_IMPORT_CONFORM in the descriptor tripwire.
 *
 * WHY NOTHING WRITES IT EITHER (2026-08-06,
 * WC-2026-08-06-external-write-refusal). `emitHook: 'external'` is the PREDICATE
 * the write refusal keys on, not this model's name: a save addressed to such a
 * tipo throws `ExternalWriteRefused` (section/record/save_component.ts), and
 * `delete_data` skips the model (EXCLUDED_EMPTY_MODELS). Between them a Time
 * Machine restore can no longer put a remote value back — v6's
 * `# Tool Time machine case` branch did, and the zero-row census is what
 * licenses dropping it. Gate: external_write_refusal_tripwire.
 *
 * SQO SEARCH is UNPORTED and THROWS: there is no SQL surface to search. The
 * value lives in a third-party API, so an external search goes through the
 * service adapter (buildSearchRequest, src/external/search.ts — IMPLEMENTED
 * 2026-08-06, reached through the dd_external_api::search action), never
 * through SQO. Throwing is the honest answer here; a silently empty result set
 * would look like "no matches".
 */
import type { ComponentModel } from '../types.ts';

export const component_external: ComponentModel = {
	model: 'component_external',
	column: 'relation', // INERT — column-map parity only (see the header)
	search: {
		status: 'unported',
		reason:
			'not searchable through SQO — there is no SQL surface: the value lives in a third-party API, so external search goes through the service adapter (buildSearchRequest, src/external/search.ts) and the dd_external_api::search action, never through a SQL builder',
	},
	emitHook: 'external',
	// 'external', NOT 'string': the flat cell is derived through the service
	// adapter (there is no stored jsonb value to lang-slice). zenon8's
	// section_list really does list zenon3..zenon6 as columns, so this path is live.
	flatValue: 'external',
};
