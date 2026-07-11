/**
 * component_filter_records — saved record-filter component (PHP
 * core/component_filter_records). Stores its data in the shared `misc` column.
 * Not class-translatable. NOTE: unlike component_filter/_master (relation
 * column), this one stores in `misc`, so it is not a relation-resolver model.
 */
import type { ComponentModel } from '../types.ts';

export const component_filter_records: ComponentModel = {
	model: 'component_filter_records',
	column: 'misc',
	importValueProperty: true,
	emitHook: 'filter_records',
};
