/**
 * component_inverse — computed inverse-relation display (PHP
 * core/component_inverse). Stores its (computed) data in the shared `misc`
 * column. Not class-translatable. NOTE: despite relating records, its matrix
 * column is `misc`, so it is not part of the relation-resolver registry.
 */
import type { ComponentModel } from '../types.ts';

export const component_inverse: ComponentModel = {
	model: 'component_inverse',
	column: 'misc',
};
