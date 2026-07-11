/**
 * component_filter_records emit hook (audit S2-24; extracted verbatim from
 * section/read.ts): the client search render reads self.data.datalist and
 * iterates it (render_search_component_filter_records:165 datalist.length).
 * Without the key the render throws "Cannot read properties of undefined
 * (reading 'length')" and the instance never reaches 'rendered'. Attach an
 * array so the render completes; the full filter-field datalist is uncovered
 * scope (the dedicated suite's content asserts stay deferred), but this
 * unblocks the component sweeps.
 */

import type { DataItem } from '../../resolve/component_data.ts';
import type { ComponentEmitHook } from '../emit_hooks.ts';

export const filterRecordsEmitHook: ComponentEmitHook = {
	decorateItem(item: DataItem): void {
		item.datalist = Array.isArray((item as { datalist?: unknown }).datalist)
			? (item as { datalist?: unknown }).datalist
			: [];
	},
};
