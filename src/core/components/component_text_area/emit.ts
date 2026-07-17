/**
 * component_text_area emit hook (audit S2-24; extracted verbatim from
 * section/read.ts):
 * - LIST values render embedded Dédalo tags to `<img>` HTML and are THEN
 *   HTML-truncated (PHP get_list_value :1928-1937 — TR::add_tag_img_on_the_fly
 *   first, truncate_html(max_chars=130) second, so a tag never splits);
 * - the item ALWAYS carries the fallback_value key (PHP
 *   component_text_area_json attaches it unconditionally — explicit null when
 *   the value is present or no cross-lang fallback exists; other literals
 *   attach it only when a fallback resolved).
 */

import type { DataItem } from '../../resolve/component_data.ts';
import { truncateHtml } from '../../resolve/truncate_html.ts';
import type { ComponentEmitHook, EmitHookContext } from '../emit_hooks.ts';
import { addTagImgOnTheFly } from './tag_html.ts';

/** text_area list values are HTML-truncated (PHP get_list_value max_chars=130). */
const TEXT_AREA_LIST_MAX_CHARS = 130;

export const textAreaEmitHook: ComponentEmitHook = {
	transformValue(value: unknown[] | null, context: EmitHookContext): unknown[] | null {
		if (context.ddoMode !== 'list' || !Array.isArray(value)) return value;
		return value.map((item) => {
			if (item === null || typeof item !== 'object') return item;
			const typedItem = item as { value?: unknown };
			if (typeof typedItem.value !== 'string' || typedItem.value === '') return item;
			return {
				...typedItem,
				value: truncateHtml(TEXT_AREA_LIST_MAX_CHARS, addTagImgOnTheFly(typedItem.value)),
			};
		});
	},

	decorateItem(item: DataItem): void {
		if (!('fallback_value' in item)) {
			item.fallback_value = null;
		}
	},
};
