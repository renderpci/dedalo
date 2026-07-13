/**
 * component_geolocation — geographic point/shape value (PHP
 * core/component_geolocation). Stores its data in the dedicated `geo` column.
 * Not class-translatable.
 */
import type { ComponentModel } from '../types.ts';

export const component_geolocation: ComponentModel = {
	model: 'component_geolocation',
	column: 'geo',
	sortable: false, // PHP component_geolocation::get_sortable() → false
	importConform: 'geolocation',
};
