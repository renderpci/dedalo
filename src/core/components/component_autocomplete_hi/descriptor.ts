/**
 * component_autocomplete_hi — legacy hierarchical-autocomplete model (PHP v5/v6).
 * At runtime it is REPLACED by component_portal (see `alias`), so it never
 * reaches the relation resolver or search dispatcher under its own name — hence
 * no `resolveData`/`search` here. The `column` entry is retained defensively
 * (PHP section_record_data::$column_map lists it) for any pre-replacement column
 * lookup.
 */
import type { ComponentModel } from '../types.ts';

export const component_autocomplete_hi: ComponentModel = {
	model: 'component_autocomplete_hi',
	column: 'relation',
	alias: 'component_portal',
};
