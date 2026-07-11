/**
 * component_av — audio/video media component (PHP core/component_av). Stores its
 * data in the shared `media` column. Not class-translatable.
 */
import type { ComponentModel } from '../types.ts';

export const component_av: ComponentModel = {
	model: 'component_av',
	flatValue: 'media',
	column: 'media',
	emitHook: 'media',
	sortable: false, // PHP component_media_common::get_sortable() → false
};
