/**
 * component_section_id — the record's own section id (PHP
 * core/component_section_id). Stores its data in the dedicated `section_id`
 * column. Not class-translatable.
 */
import type { ComponentModel } from '../types.ts';

export const component_section_id: ComponentModel = {
	model: 'component_section_id',
	flatValue: 'section_id',
	column: 'section_id',
	render: 'text',
	importAppend: {
		refuse: 'identity: the record id is the row key, it is never written by an import value',
	},
	monovalue: true,
	searchBuilder: 'section_id',
	emitHook: 'section_id',
};
