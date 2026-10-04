/**
 * component_pdf — PDF media component (PHP core/component_pdf). Stores its data
 * in the shared `media` column. Not class-translatable.
 */
import type { ComponentModel } from '../types.ts';

export const component_pdf: ComponentModel = {
	model: 'component_pdf',
	flatValue: 'media',
	column: 'media',
	render: 'text',
	importAppend: {
		refuse:
			'media: the file is the value — replace it through the media tools, there is nothing to append',
	},
	monovalue: true,
	emitHook: 'media',
	sortable: false, // PHP component_media_common::get_sortable() → false
};
