/**
 * component_text_area emit hook (audit S2-24; extracted verbatim from
 * section/read.ts):
 * - LIST values render embedded Dédalo tags to `<img>` HTML and are THEN
 *   HTML-truncated (PHP get_list_value :1928-1937 — TR::add_tag_img_on_the_fly
 *   first, truncate_html(max_chars=130) second, so a tag never splits);
 * - the item ALWAYS carries the fallback_value key (PHP
 *   component_text_area_json attaches it unconditionally — explicit null when
 *   the value is present or no cross-lang fallback exists; other literals
 *   attach it only when a fallback resolved);
 * - LIST values follow the record's ORIGINAL language (the related
 *   component_select_lang, e.g. rsc263), equivalence-aware.
 */

import { filterItemsByLang, readComponentItems } from '../../resolve/component_data.ts';
import type { DataItem } from '../../resolve/component_data.ts';
import { equivalentLangsOf } from '../../resolve/lang_alias.ts';
import { truncateHtml } from '../../resolve/truncate_html.ts';
import type { ComponentEmitHook, EmitHookContext } from '../emit_hooks.ts';
import { getOriginalLang } from './original_lang.ts';
import { addTagImgOnTheFly } from './tag_html.ts';

/** text_area list values are HTML-truncated (PHP get_list_value max_chars=130). */
const TEXT_AREA_LIST_MAX_CHARS = 130;

/** The list rendering of one stored string: tags → <img>, then HTML-truncate. */
function renderListString(value: string): string {
	return truncateHtml(TEXT_AREA_LIST_MAX_CHARS, addTagImgOnTheFly(value));
}

/** True when a lang slice holds at least one item with real text. */
function sliceHasText(items: unknown[], lang: string): boolean {
	return filterItemsByLang(items, lang).some(
		(item) =>
			item !== null &&
			typeof item === 'object' &&
			typeof (item as { value?: unknown }).value === 'string' &&
			(item as { value: string }).value !== '',
	);
}

export const textAreaEmitHook: ComponentEmitHook = {
	/**
	 * ORIGINAL-LANGUAGE forcing for LIST values (PHP get_list_value :2519-2525):
	 * a text_area whose ontology relates a component_select_lang ("Original
	 * language" — interviews are recorded in different languages per record)
	 * reads its list value in the RECORD's language, not the menu's.
	 *
	 * EQUIVALENCE-AWARE: when the original-language slice itself is empty but a
	 * declared same-language sibling holds the text (rsc263 says lg-vlca, the
	 * transcript was typed under lg-cat — Català === Valencià), the sibling IS
	 * the record's language and is forced instead. Without this the text
	 * arrived as raw fallback: visible, but stripped of its tag rendering.
	 *
	 * Cheap by construction: the no-related-select-lang answer is
	 * ontology-cached, the locator and the slices live in the ALREADY-LOADED
	 * record, and the lg1 code map is a save-invalidated cache. Null = no
	 * forcing (v6 semantics).
	 */
	async resolveEmitLang(context: EmitHookContext): Promise<string | null> {
		if (context.ddoMode !== 'list') return null;
		const originalLang = await getOriginalLang(
			context.ddo.tipo,
			context.row.section_tipo,
			context.row.section_id,
			context.record,
		);
		if (originalLang === null) return null;

		const items = readComponentItems(context.record, context.ddo.tipo, context.model);
		if (items === null || sliceHasText(items, originalLang)) return originalLang;
		for (const sibling of equivalentLangsOf(originalLang)) {
			if (sliceHasText(items, sibling)) return sibling;
		}
		return originalLang;
	},

	/**
	 * EDIT contexts carry the record's original language as
	 * `options.related_component_lang` (PHP component_text_area_json.php:61-69) —
	 * the key the transcription/indexation/lang tools read to open the component
	 * in the interview's own language. Null (no related select_lang, no value)
	 * emits no `options` key at all: the PHP wire shape.
	 */
	async resolveContextOptions(target: {
		tipo: string;
		sectionTipo: string;
		sectionId: number;
	}): Promise<Record<string, unknown> | null> {
		const originalLang = await getOriginalLang(target.tipo, target.sectionTipo, target.sectionId);
		return originalLang === null ? null : { related_component_lang: originalLang };
	},

	transformValue(value: unknown[] | null, context: EmitHookContext): unknown[] | null {
		if (context.ddoMode !== 'list' || !Array.isArray(value)) return value;
		return value.map((item) => {
			if (item === null || typeof item !== 'object') return item;
			const typedItem = item as { value?: unknown };
			if (typeof typedItem.value !== 'string' || typedItem.value === '') return item;
			return {
				...typedItem,
				value: renderListString(typedItem.value),
			};
		});
	},

	decorateItem(item: DataItem, context: EmitHookContext): void {
		if (!('fallback_value' in item)) {
			item.fallback_value = null;
		}
		// LIST fallbacks get the SAME rendering as list values (tags → <img>,
		// then truncate). transformValue only sees `value`, so a transcript that
		// surfaces through the cross-lang fallback used to reach the client with
		// raw [TC_…]/[index-…] literals — text without its tag representation.
		if (context.ddoMode === 'list' && Array.isArray(item.fallback_value)) {
			item.fallback_value = item.fallback_value.map((entry) => {
				if (entry === null || typeof entry !== 'object') return entry;
				const typedEntry = entry as { value?: unknown };
				if (typeof typedEntry.value !== 'string' || typedEntry.value === '') return entry;
				return { ...typedEntry, value: renderListString(typedEntry.value) };
			});
		}
	},
};
