/**
 * component_svg — SVG media component (PHP core/component_svg). Stores its data
 * in the shared `media` column. Not class-translatable.
 */
import type { ComponentModel } from '../types.ts';

export const component_svg: ComponentModel = {
	model: 'component_svg',
	flatValue: 'media',
	column: 'media',
	emitHook: 'media',
	sortable: false, // PHP component_media_common::get_sortable() → false
};
