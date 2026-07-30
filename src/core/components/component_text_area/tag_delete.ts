/**
 * TAG_DELETE — remove ONE transcription tag's marks from EVERY language of a
 * text_area (PHP component_text_area::delete_tag_from_all_langs, :639, plus
 * delete_tag_from_text, :713).
 *
 * A tag lives in two places: the marks inside the transcription text
 * (`[index-n-58-…]` … `[/index-n-58-…]`, once per language) and the locator in
 * the indexation portal. Deleting the tag means removing BOTH — and the marks
 * must go from every language at once, because a tag id is shared across the
 * translations of the same transcription. This module owns the TEXT half only;
 * the portal half is `dd_component_portal_api::delete_locator`, which PHP
 * deliberately moved out of this flow and the client already calls right after
 * this one (tool_indexation.js:853).
 *
 * WHY ONE SAVE PER LANGUAGE, not one transaction over all of them (WC-077):
 * mark deletion is IDEMPOTENT — a retry re-runs a pattern that no longer
 * matches — so a failure part-way through is fully recoverable by re-issuing
 * the request, and the response names exactly which languages changed. This is
 * the opposite of the timecode bulk-offset (WC-061), where a retry would
 * DOUBLE-apply the offset and atomicity was therefore mandatory. Wrapping the
 * loop in an outer transaction would also drag saveComponentData's deliberately
 * post-commit hooks (permissions-cache invalidation, observer propagation —
 * rsc36 declares `observers`) inside the transaction.
 */

import { readMatrixRecord } from '../../db/matrix.ts';
import { getMatrixTableFromTipo, getModelByTipo } from '../../ontology/resolver.ts';
import { filterItemsByLang, readComponentItems } from '../../resolve/component_data.ts';
import { type IdTargetedMarkType, markPatternById } from '../../resolve/tr_marks.ts';
import { saveComponentData } from '../../section/record/save_component.ts';

export interface DeleteTagRequest {
	/** The text_area component tipo (rsc36). */
	componentTipo: string;
	sectionTipo: string;
	sectionId: number;
	/** Numeric tag id as it appears in the mark (validated by markPatternById). */
	tagId: string;
	tagType: IdTargetedMarkType;
	userId: number;
}

export interface DeleteTagResult {
	/** The langs whose text actually changed (PHP $ar_langs_changed). */
	langsChanged: string[];
	/** Total marks removed across every lang. */
	removedCount: number;
	/** Set when a lang's save failed — the langs before it are already written. */
	error?: string;
}

/**
 * Remove every mark of `tagId` from every language slice that holds data.
 *
 * The language list is the set of langs PRESENT in the stored items, in stored
 * order — PHP's get_component_ar_langs returns the keys of the component's
 * lang-keyed data (class.component_common.php:2476), i.e. exactly the langs
 * that hold text. Iterating every project lang instead would read (and
 * potentially write) slices that do not exist.
 */
export async function deleteTagFromAllLangs(request: DeleteTagRequest): Promise<DeleteTagResult> {
	const { componentTipo, sectionTipo, sectionId, tagId, tagType, userId } = request;

	// Throws on a bad type/id BEFORE any read — the validation is the guard.
	const pattern = markPatternById(tagType, tagId);

	const model = await getModelByTipo(componentTipo);
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (model === null || table === null) {
		return { langsChanged: [], removedCount: 0, error: 'component or section not found' };
	}
	const record = await readMatrixRecord(table, sectionTipo, sectionId);
	if (record === null) {
		return { langsChanged: [], removedCount: 0, error: 'record not found' };
	}
	const storedItems = readComponentItems(record, componentTipo, model) ?? [];

	const langs: string[] = [];
	for (const item of storedItems) {
		const lang = (item as { lang?: unknown } | null)?.lang;
		if (typeof lang === 'string' && lang !== '' && !langs.includes(lang)) {
			langs.push(lang);
		}
	}

	const langsChanged: string[] = [];
	let removedCount = 0;

	for (const lang of langs) {
		// The slice this lang's save will replace whole — read and write must
		// address the SAME slice (the tool_tc lesson), so the read uses the
		// write engine's own lang filter.
		const slice = filterItemsByLang(storedItems, lang);
		let langRemoved = 0;
		const newSlice = slice.map((item) => {
			const value = (item as { value?: unknown } | null)?.value;
			if (typeof value !== 'string' || value === '') return item;
			pattern.lastIndex = 0;
			const matches = value.match(pattern);
			if (matches === null) return item;
			langRemoved += matches.length;
			return { ...(item as Record<string, unknown>), value: value.replace(pattern, '') };
		});
		if (langRemoved === 0) continue;

		// ONE save for the whole slice (PHP set_dato + Save per lang). 'set_data'
		// is lang-sliced for translation-supporting literals, so the sibling
		// languages are untouched; the data write + TM row land in one tx.
		const saved = await saveComponentData({
			componentTipo,
			sectionTipo,
			sectionId,
			lang,
			changedData: [{ action: 'set_data', value: newSlice }],
			userId,
		});
		if (!saved.ok) {
			// Loud + honest: report what DID change rather than claiming a clean
			// failure. The operation is idempotent, so a retry finishes the job.
			return {
				langsChanged,
				removedCount,
				error: `save failed for lang '${lang}': ${saved.message ?? 'unknown error'}`,
			};
		}
		langsChanged.push(lang);
		removedCount += langRemoved;
	}

	return { langsChanged, removedCount };
}
