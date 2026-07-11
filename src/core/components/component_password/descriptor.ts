/**
 * component_password — password value (PHP core/component_password).
 * Stores {id,value,lang} items in the `string` column; CLASS-translatable.
 */
import type { ComponentModel } from '../types.ts';

export const component_password: ComponentModel = {
	model: 'component_password',
	column: 'string',
	classSupportsTranslation: true,
	importValueProperty: true,
};
