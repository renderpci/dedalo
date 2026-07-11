/**
 * component_info — read-only computed/info display (PHP core/component_info).
 * Stores its data in the shared `misc` column. Not class-translatable. Legacy
 * aliases component_state / component_calculation resolve here.
 */
import type { ComponentModel } from '../types.ts';

export const component_info: ComponentModel = {
	model: 'component_info',
	column: 'misc',
	importValueProperty: true,
	emitHook: 'info',
	sortable: false, // PHP component_info::get_sortable() → false (also covers state/calculation aliases)
};
