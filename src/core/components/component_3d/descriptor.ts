/**
 * component_3d — 3D-model media component (PHP core/component_3d). Stores its
 * data in the shared `media` column. Not class-translatable.
 */
import type { ComponentModel } from '../types.ts';

export const component_3d: ComponentModel = {
	model: 'component_3d',
	column: 'media',
	emitHook: 'media',
	sortable: false, // PHP component_media_common::get_sortable() → false
};
