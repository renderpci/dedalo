/**
 * component_input_text — short single-line free text (PHP core/component_input_text).
 * Stores {id,value,lang} items in the `string` matrix column; CLASS-translatable
 * (its data items are lang-filtered on read).
 */
import type { ComponentModel } from '../types.ts';

export const component_input_text: ComponentModel = {
	model: 'component_input_text',
	column: 'string',
	classSupportsTranslation: true,
	searchBuilder: 'string',
	flatValue: 'string',
	importValueProperty: true,
};
