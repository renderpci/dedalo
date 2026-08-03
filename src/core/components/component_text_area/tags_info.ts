/**
 * TAGS_INFO — the RESOLVED tag payload of one transcription (PHP
 * dd_component_text_area_api::get_tags_info, which delegated to
 * component_text_area::get_tags_data_as_terms / get_annotations /
 * get_tags_persons).
 *
 * A transcription's text carries only tag MARKS — `[index-n-58-…]`,
 * `[note-a-3-data:{'section_tipo':'rsc326',…}:data]`. What each mark MEANS
 * (which thesaurus term the index points at, what the note says) lives in
 * other records, so any consumer that must display tags asks this feed once
 * and resolves every mark locally instead of one request per mark. Its only
 * caller today is `tool_tr_print` (the print/read layout).
 *
 * WHERE each type comes from is declared in the text_area's ontology
 * `properties` — a missing property means "this install does not use that tag
 * type", and the key is simply ABSENT from the result (PHP `isset` gating):
 *
 *   tags_index     {tipo:'rsc860', …}  the portal holding the index locators
 *   tags_reference {tipo:'rsc1368', …} same shape, reference tags
 *   tags_notes     {<section_tipo>:[{id,type,component_tipo}]} note ddo_map
 *   tags_persons   see tags_persons.ts (shared with the EDIT emit feed)
 *
 * Wire law (WC-077, the WC-065 rule applied here): every `section_id` and
 * `tag_id` emitted is a STRING — the client matches marks against this feed
 * with strict `===` on the values it scraped out of the text.
 */

import type { Locator } from '../../concepts/locator.ts';
import { compareLocators } from '../../concepts/locator.ts';
import type { MatrixRecord } from '../../db/matrix.ts';
import { readMatrixRecord } from '../../db/matrix.ts';
import { getEffectivePropertiesByTipo } from '../../ontology/alias.ts';
import {
	getMatrixTableFromTipo,
	getModelByTipo,
	getTranslatableByTipo,
} from '../../ontology/resolver.ts';
import { filterItemsByLang, readComponentItems } from '../../resolve/component_data.ts';
import { currentDataLang } from '../../resolve/request_lang.ts';
import { NOTE_PATTERN } from '../../resolve/tr_marks.ts';
import { getTermByLocator } from '../../ts_object/term_resolver.ts';
import type { PersonTagElement } from './tags_persons.ts';

/** PHP DEDALO_DATA_NOLAN — the lang of a non-translatable component. */
const NOLAN = 'lg-nolan';
/** component_publication 'yes' term (dd64/1) — a `type:'bool'` note ddo is true. */
const PUBLICATION_YES_ID = '1';

/** `properties.tags_index` / `properties.tags_reference`. */
interface TagsPointerConfig {
	/** The component holding the tag locators (a portal / autocomplete_hi). */
	tipo?: string;
}

/** One entry of `properties.tags_notes[<section_tipo>]`. */
interface NoteDdo {
	/** Output key on the note object ('title', 'body', 'publishable', …). */
	id?: string;
	/** 'text' → raw values; 'bool' → publication-state boolean. */
	type?: string;
	component_tipo?: string;
	section_tipo?: string;
}

interface TextAreaTagProperties {
	tags_index?: TagsPointerConfig;
	tags_reference?: TagsPointerConfig;
	tags_notes?: Record<string, NoteDdo[]>;
	tags_persons?: Record<string, import('./tags_persons.ts').TagsPersonsConfigEntry[]>;
}

/** A stored tag locator, normalized to string ids (see the module wire law). */
export interface TagLocator {
	section_tipo: string;
	section_id: string;
	component_tipo?: string;
	tag_id?: string;
	type?: string;
	[key: string]: unknown;
}

/** One resolved index/reference tag: the stored locator + its term label. */
export interface TagTermElement {
	data: TagLocator;
	label: string | null;
}

/** One resolved annotation: the note locator + one key per note ddo. */
export interface NoteElement {
	data: TagLocator;
	[ddoId: string]: unknown;
}

export interface TagsInfo {
	tags_index?: TagTermElement[];
	tags_reference?: TagTermElement[];
	tags_notes?: NoteElement[];
	tags_persons?: PersonTagElement[];
}

/** The record coordinates a tags_info build runs against. */
export interface TagsInfoHost {
	/** The text_area component tipo (whose properties declare the tag config). */
	tipo: string;
	section_tipo: string;
	section_id: number | string;
}

/** Read one record, tolerating a section whose matrix table cannot be resolved. */
async function readRecord(sectionTipo: string, sectionId: number | string) {
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (table === null) return null;
	return readMatrixRecord(table, sectionTipo, Number(sectionId));
}

/**
 * One component's stored items for a lang (PHP component get_dato: the lang
 * slice for a translatable component, the full array otherwise). NO fallback
 * chain — PHP's get_dato has none either, and a note resolved from another
 * lang's text would be a silent lie about what the transcription says.
 */
async function readItems(
	record: MatrixRecord,
	componentTipo: string,
	lang: string,
): Promise<unknown[]> {
	const model = await getModelByTipo(componentTipo);
	if (model === null) return [];
	const items = readComponentItems(record, componentTipo, model) ?? [];
	if (!(await getTranslatableByTipo(componentTipo))) return items;
	return filterItemsByLang(items, lang);
}

/** Normalize a stored locator to the string-id wire shape. */
function normalizeLocator(stored: Record<string, unknown>): TagLocator | null {
	const sectionTipo = stored.section_tipo;
	if (typeof sectionTipo !== 'string' || stored.section_id === undefined) return null;
	const locator: TagLocator = {
		...stored,
		section_tipo: sectionTipo,
		section_id: String(stored.section_id),
	};
	if (stored.tag_id !== undefined && stored.tag_id !== null) {
		locator.tag_id = String(stored.tag_id);
	}
	return locator;
}

/**
 * The raw tag locators of one tag type (PHP get_component_tags_data): the data
 * of the component named by `properties.tags_<type>.tipo`, read on the HOST
 * record. The config's own `section_tipo`/`section_id` are ignored — they are
 * the literal string 'self' on the shipped ontology, and PHP ignored them too.
 */
async function readTagLocators(
	config: TagsPointerConfig | undefined,
	_host: TagsInfoHost,
	hostRecord: MatrixRecord | null,
): Promise<TagLocator[]> {
	const componentTipo = config?.tipo;
	if (typeof componentTipo !== 'string' || componentTipo === '') return [];
	if (hostRecord === null) return [];
	// The tag portal is structural, never translated (PHP reads it in NOLAN).
	const items = await readItems(hostRecord, componentTipo, NOLAN);
	const locators: TagLocator[] = [];
	for (const item of items) {
		if (item === null || typeof item !== 'object') continue;
		const locator = normalizeLocator(item as Record<string, unknown>);
		if (locator !== null) locators.push(locator);
	}
	return locators;
}

/**
 * Index/reference tags resolved to their thesaurus term (PHP
 * get_tags_data_as_terms, 'array' format). The term resolves through the
 * shared resolver every relation list uses, so a tag shows the same label as
 * the record does everywhere else.
 */
async function buildTagsAsTerms(
	config: TagsPointerConfig | undefined,
	host: TagsInfoHost,
	hostRecord: MatrixRecord | null,
	lang: string,
): Promise<TagTermElement[]> {
	const locators = await readTagLocators(config, host, hostRecord);
	const elements: TagTermElement[] = [];
	for (const locator of locators) {
		const label = await getTermByLocator(
			{
				section_tipo: locator.section_tipo,
				section_id: locator.section_id,
				// PHP set the locator's component_tipo from from_component_tipo.
				component_tipo:
					typeof locator.from_component_tipo === 'string'
						? locator.from_component_tipo
						: locator.component_tipo,
			},
			lang,
			true,
		);
		elements.push({ data: locator, label });
	}
	return elements;
}

/**
 * The annotations of a transcription (PHP get_annotations): scan the text for
 * `[note-…-data:<locator>:data]` marks and resolve each note RECORD through
 * the `tags_notes` ddo_map.
 *
 * The mark payload is JSON with `"` written as `'` (the tag lives in an HTML5
 * data- attribute on the client, so it cannot carry double quotes) — swap them
 * back before parsing, exactly as the client does.
 *
 * A note whose mark is malformed is SKIPPED (PHP logged and continued); the
 * client additionally filters null holes out of this array.
 */
async function buildAnnotations(
	config: Record<string, NoteDdo[]>,
	rawValues: string[],
	lang: string,
): Promise<NoteElement[]> {
	const annotations: NoteElement[] = [];
	for (const rawValue of rawValues) {
		if (typeof rawValue !== 'string' || rawValue === '') continue;
		NOTE_PATTERN.lastIndex = 0;
		let match = NOTE_PATTERN.exec(rawValue);
		while (match !== null) {
			const payload = match[6] ?? '';
			match = NOTE_PATTERN.exec(rawValue);
			if (payload === '') continue;
			let stored: Record<string, unknown>;
			try {
				stored = JSON.parse(payload.replace(/'/g, '"')) as Record<string, unknown>;
			} catch {
				continue; // malformed mark payload — not a reason to fail the view
			}
			const locator = normalizeLocator(stored);
			if (locator === null) continue;

			const ddoMap = config[locator.section_tipo];
			if (!Array.isArray(ddoMap)) continue;

			const note: NoteElement = { data: locator };
			const noteRecord = await readRecord(locator.section_tipo, locator.section_id);
			for (const ddo of ddoMap) {
				if (typeof ddo?.id !== 'string' || typeof ddo.component_tipo !== 'string') continue;
				if (noteRecord === null) {
					note[ddo.id] = ddo.type === 'bool' ? false : [];
					continue;
				}
				const items = await readItems(noteRecord, ddo.component_tipo, lang);
				if (ddo.type === 'bool') {
					// component_publication: the 'yes' term is section_id 1 (PHP
					// compared ONLY section_id here, so the reference locator does
					// too — via the locator law's own comparator, which gives the
					// loose-numeric semantics a stored '01' needs).
					const first = items[0] as Locator | undefined;
					note[ddo.id] =
						first !== undefined &&
						first !== null &&
						compareLocators(
							first,
							{ section_tipo: first.section_tipo, section_id: PUBLICATION_YES_ID },
							['section_id'],
						);
					continue;
				}
				// WC-077: literal ddos emit STRING values, not stored items — the
				// client renders them directly (`note.title.join(' | ')`).
				note[ddo.id] = items.map((item) => {
					if (item !== null && typeof item === 'object') {
						const value = (item as { value?: unknown }).value;
						return typeof value === 'string' ? value : (value ?? '');
					}
					return item;
				});
			}
			annotations.push(note);
		}
	}
	return annotations;
}

/**
 * The full tags_info payload for one text_area record.
 *
 * @param types the requested tag types (PHP `options.ar_type`), e.g.
 *   ['index','note','reference']. An unknown type resolves nothing and is
 *   reported back so the caller can say so out loud instead of serving a
 *   silently narrower payload.
 */
export async function buildTagsInfo(
	types: readonly string[],
	host: TagsInfoHost,
	lang: string = currentDataLang(),
): Promise<{ tags_info: TagsInfo; unknown_types: string[] }> {
	const properties = ((await getEffectivePropertiesByTipo(host.tipo)) ??
		{}) as TextAreaTagProperties;
	const hostRecord = await readRecord(host.section_tipo, host.section_id);
	const tagsInfo: TagsInfo = {};
	const unknownTypes: string[] = [];

	for (const type of types) {
		switch (type) {
			case 'index':
				if (properties.tags_index !== undefined && properties.tags_index !== null) {
					tagsInfo.tags_index = await buildTagsAsTerms(
						properties.tags_index,
						host,
						hostRecord,
						lang,
					);
				}
				break;
			case 'reference':
				if (properties.tags_reference !== undefined && properties.tags_reference !== null) {
					tagsInfo.tags_reference = await buildTagsAsTerms(
						properties.tags_reference,
						host,
						hostRecord,
						lang,
					);
				}
				break;
			case 'note':
				if (properties.tags_notes !== undefined && properties.tags_notes !== null) {
					// The notes live in the TEXT of the transcription itself.
					const rawValues =
						hostRecord === null
							? []
							: (await readItems(hostRecord, host.tipo, lang)).map((item) => {
									if (item !== null && typeof item === 'object') {
										const value = (item as { value?: unknown }).value;
										return typeof value === 'string' ? value : '';
									}
									return typeof item === 'string' ? item : '';
								});
					tagsInfo.tags_notes = await buildAnnotations(properties.tags_notes, rawValues, lang);
				}
				break;
			case 'person':
				if (properties.tags_persons !== undefined && properties.tags_persons !== null) {
					// Same producer as the EDIT emit feed (tags_persons.ts), fed by
					// the record's related-section locators.
					const { buildRelatedSections } = await import('../../resolve/related_sections.ts');
					const { buildTagsPersons } = await import('./tags_persons.ts');
					const related = await buildRelatedSections(
						[{ section_tipo: host.section_tipo, section_id: String(host.section_id) }],
						{
							callerTipo: host.section_tipo,
							lang,
							sectionTipos: 'all',
							limit: false,
						},
					);
					const sectionsEntry = related.data.find(
						(entry) => (entry as { typo?: string }).typo === 'sections',
					) as { value?: { section_tipo: string; section_id: string }[] } | undefined;
					tagsInfo.tags_persons = await buildTagsPersons(
						properties.tags_persons,
						{ section_tipo: host.section_tipo, section_id: host.section_id },
						hostRecord,
						sectionsEntry?.value ?? [],
					);
				}
				break;
			default:
				unknownTypes.push(type);
		}
	}

	return { tags_info: tagsInfo, unknown_types: unknownTypes };
}
