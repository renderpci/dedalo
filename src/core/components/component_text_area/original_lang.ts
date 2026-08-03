/**
 * THE ORIGINAL LANGUAGE of a text_area's record (PHP
 * component_text_area::get_original_lang, class.component_text_area.php:2806).
 *
 * WHY THIS EXISTS. Interviews in one installation are recorded in different
 * languages — some Spanish, some Catalan, some Valencian — so an AV section
 * carries a `component_select_lang` ("Original language", rsc263 in the shipped
 * ontology) beside the transcription text_area. The transcription is authored in
 * THAT language; which language the data-lang menu happens to be on is
 * irrelevant to it. This resolver answers, per record: "which lang does this
 * text_area's content actually live in?" — and its two consumers force the
 * text_area there:
 *
 *   - the EDIT context injects it as `context.options.related_component_lang`,
 *     which the transcription/indexation/lang tools read to open the component
 *     in the original language (and to hint the speech recogniser);
 *   - the LIST emission reads the value in the original language, so a list of
 *     interviews shows each transcript in its own language instead of an empty
 *     current-lang slice.
 *
 * HOW (v6-faithful): the text_area's ontology declares a RELATED component of
 * model `component_select_lang`; its stored value is a LOCATOR into the
 * languages section (lg1); the lg1 record's code component ('hierarchy41')
 * yields the Dédalo tag, 'lg-<code>'.
 *
 * COST DISCIPLINE. The ontology half (which select_lang, if any, relates to this
 * text_area) is resolver-cached, so a text_area with NO related select_lang —
 * the overwhelmingly common case — costs nothing per record. The lg1 code map is
 * cached with save-event invalidation. The RECORD half is never module-cached
 * (module_state_tripwire): list callers hand in the already-loaded row.
 */

import type { MatrixRecord } from '../../db/matrix.ts';
import { readMatrixRecord } from '../../db/matrix.ts';
import { getMatrixTableFromTipo, relatedTipoByModel } from '../../ontology/resolver.ts';
import { getLangCodeBySectionId } from '../../relations/select_lang.ts';
import { readComponentItems } from '../../resolve/component_data.ts';

/**
 * The related select_lang tipo of a text_area, or null when its ontology
 * declares none. Split out so hot paths can pre-check cheaply (resolver-cached).
 */
export async function relatedSelectLangTipo(textAreaTipo: string): Promise<string | null> {
	return relatedTipoByModel(textAreaTipo, 'component_select_lang');
}

/**
 * The record's original language as a Dédalo tag ('lg-vlca'), or null when the
 * text_area has no related select_lang, the record has no value in it, or the
 * lg1 target carries no code. Null always means "no forcing" — the caller keeps
 * the request lang, exactly as PHP did.
 *
 * @param record the already-loaded matrix row, when the caller has one (the
 *   list path) — passing it makes the per-row cost purely in-memory.
 */
export async function getOriginalLang(
	textAreaTipo: string,
	sectionTipo: string,
	sectionId: number,
	record?: MatrixRecord | null,
): Promise<string | null> {
	const selectLangTipo = await relatedSelectLangTipo(textAreaTipo);
	if (selectLangTipo === null) return null;

	let row = record ?? null;
	if (row === null) {
		const table = await getMatrixTableFromTipo(sectionTipo);
		if (table === null) return null;
		row = await readMatrixRecord(table, sectionTipo, sectionId);
	}
	if (row === null) return null;

	const items = readComponentItems(row, selectLangTipo, 'component_select_lang');
	const locator = items?.[0] as { section_id?: unknown } | undefined;
	const lg1Id = Number(locator?.section_id ?? Number.NaN);
	if (!Number.isInteger(lg1Id) || lg1Id < 1) return null;

	return getLangCodeBySectionId(lg1Id);
}
