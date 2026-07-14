/**
 * component_json — raw JSON value component (PHP core/component_json). Stores its
 * data in the shared `misc` column. Not class-translatable.
 */
import type { ComponentModel } from '../types.ts';

export const component_json: ComponentModel = {
	model: 'component_json',
	column: 'misc',
	importValueProperty: true,
	importConform: 'json',
};
