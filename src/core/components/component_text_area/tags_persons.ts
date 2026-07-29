/**
 * TAGS_PERSONS — the transcription "people talking" helper feed (PHP
 * component_text_area::get_tags_persons, class.component_text_area.php:1415).
 *
 * An oral-history transcription names its speakers constantly, so the editor
 * offers per-person insert buttons (and Ctrl+<n> shortcuts). WHICH components
 * hold the speakers is declared in the text_area's ontology
 * `properties.tags_persons`, keyed by RELATED section tipo:
 *
 *   { "oh1": [
 *       { "state":"a", "section_tipo":"oh1",    "component_tipo":"oh24" },   // informants portal
 *       { "state":"b", "section_tipo":"rsc167", "component_tipo":"rsc50" }   // interviewer (crew)
 *   ] }
 *
 * Entries whose `section_tipo` equals the HOST record's section resolve
 * against the host itself (any ontology `section_id` is stale data and is
 * overwritten — PHP :1454); other entries resolve once per RELATED record of
 * the config key's tipo (the related_sections locators). Each stored person
 * locator becomes one element with the ready-to-insert tag string.
 *
 * Wire law: every section_id emitted here is a STRING — the client groups
 * with strict `===` against string ids (WC-065).
 */

import { readMatrixRecord } from '../../db/matrix.ts';
import type { MatrixRecord } from '../../db/matrix.ts';
import { termByTipo } from '../../ontology/labels.ts';
import { getMatrixTableFromTipo, getModelByTipo } from '../../ontology/resolver.ts';
import { readComponentItems } from '../../resolve/component_data.ts';
import { currentApplicationLang, currentDataLang } from '../../resolve/request_lang.ts';
import { getTermByLocator, getTermTipos } from '../../ts_object/term_resolver.ts';

/**
 * LEGACY person name/surname component tipos — the shipped people section's
 * (rsc197) pair, which PHP hardcoded outright (get_tag_person_label $ar_tipos,
 * class.component_text_area.php:1600). Used ONLY when the target section's
 * section_map resolves no term scope at all: the section_map IS the label
 * definition (see getTagPersonLabel), and this pair exists solely so a people
 * section that predates section_maps keeps resolving as it did in v6.
 */
const LEGACY_NAME_TIPO = 'rsc85';
const LEGACY_SURNAME_TIPO = 'rsc86';

export interface TagsPersonsConfigEntry {
	section_tipo?: string;
	component_tipo?: string;
	state?: string;
	tag_id?: number | string;
	section_id?: number | string;
	info?: string;
}

export interface PersonTagElement {
	type: 'person';
	/** OWNING record — the persons-modal grouping key, NOT the person. */
	section_tipo: string;
	section_id: string;
	/** Ready-to-insert wire tag: [person-a-1-DyaDa-data:{'…'}:data]. */
	tag: string;
	role: string;
	full_name: string;
	state: string;
	tag_id: number | string;
	/** Initials, the tag's visible label. */
	label: string;
	/** The PERSON record locator — tag identity on click/lookup. */
	data: { section_tipo: string; section_id: string; component_tipo: string };
}

/**
 * Build the person wire tag (PHP TR::build_tag 'person' case, class.TR.php:514).
 * The label field separator is '-', so labels are '-'→'_' sanitized and capped
 * at 22 chars (the v7 grammar RE_PERSON requires [^-]{0,22}; initials are ≤7
 * chars in practice, so real data is byte-identical to PHP, which trusted the
 * label). Data JSON swaps '"'→"'" — the payload lives in an HTML5 data-
 * attribute on the client (TR.php:504).
 */
export function buildTagPerson(
	state: string,
	tagId: number | string,
	label: string,
	locator: PersonTagElement['data'],
): string {
	const safeLabel = label.trim().replace(/-/g, '_').slice(0, 22);
	const data = JSON.stringify(locator).replace(/"/g, "'");
	return `[person-${state}-${tagId}-${safeLabel}-data:${data}:data]`;
}

/**
 * Person display strings. The label definition belongs to the TARGET section:
 * its section_map term (scope 'default', with the standard main/thesaurus/
 * relation_list fallback walk) names the components that compose the record's
 * label — rsc197's rsc1023 declares default.term ["rsc86","rsc85"] — and
 * `getTermByLocator` is THE resolver every relation list already uses (cached,
 * lang-aware with hierarchy-main-lang fallback). The person tag shows the same
 * label as everywhere else in the app, and a people section with different
 * name components just declares its own section_map.
 *
 * initials = first word (3 chars) + next two words (2 chars each) of the
 * resolved label — the PHP 3+2+2 rule generalized to the section's own word
 * order (PHP hardcoded name+surname components and got the same split).
 * role = the ontology label of the SOURCE component (oh24 → "Informants").
 *
 * LEGACY: a target section whose section_map resolves NO term scope falls
 * back to the PHP-hardcoded rsc85/rsc86 pair (name first, v6 bytes).
 */
export async function getTagPersonLabel(
	locator: PersonTagElement['data'],
): Promise<{ initials: string; full_name: string; role: string }> {
	let full_name = '';
	const termTipos = await getTermTipos(locator.section_tipo, 'default');
	if (termTipos.length > 0) {
		full_name = (await getTermByLocator(locator, currentDataLang(), true, 'default')) ?? '';
	} else {
		// Legacy pair (see module doc) — name first, like PHP composed it.
		let name = '';
		let surname = '';
		const table = await getMatrixTableFromTipo(locator.section_tipo);
		if (table !== null) {
			const record = await readMatrixRecord(
				table,
				locator.section_tipo,
				Number(locator.section_id),
			);
			if (record !== null) {
				const firstValue = async (tipo: string): Promise<string> => {
					const model = await getModelByTipo(tipo);
					if (model === null) return '';
					const items = readComponentItems(record, tipo, model);
					const first = items?.[0] as { value?: unknown } | undefined;
					return typeof first?.value === 'string' ? first.value : '';
				};
				name = (await firstValue(LEGACY_NAME_TIPO)).trim();
				surname = (await firstValue(LEGACY_SURNAME_TIPO)).trim();
			}
		}
		full_name = surname.length > 0 && name.length > 0 ? `${name} ${surname}` : name || surname;
	}

	const words = full_name.split(/[\s,;|]+/).filter((word) => word.length > 0);
	const initials =
		(words[0]?.slice(0, 3) ?? '') + (words[1]?.slice(0, 2) ?? '') + (words[2]?.slice(0, 2) ?? '');
	const role = (await termByTipo(locator.component_tipo, currentApplicationLang())) ?? '';
	return { initials, full_name: full_name.trim(), role };
}

/**
 * The full tags_persons payload for one host record (PHP get_tags_persons).
 *
 * @param config the text_area's `properties.tags_persons` object.
 * @param host the record the text_area belongs to (e.g. rsc167/528).
 * @param hostRecord the already-loaded host row (the emit path has it).
 * @param relatedLocators the related-records locators (the related_sections
 *   sections item value) — owners for non-self config entries.
 */
export async function buildTagsPersons(
	config: Record<string, TagsPersonsConfigEntry[]>,
	host: { section_tipo: string; section_id: number | string },
	hostRecord: MatrixRecord | null,
	relatedLocators: { section_tipo: string; section_id: string }[],
): Promise<PersonTagElement[]> {
	const result: PersonTagElement[] = [];
	// Identity of the host row among owners (both sides built here with
	// String() ids, so key equality is exact — no loose-numeric hazard).
	const hostKey = `${host.section_tipo}_${String(host.section_id)}`;

	for (const [relatedSectionTipo, entries] of Object.entries(config)) {
		if (!Array.isArray(entries)) continue;
		// Dedup is scoped PER CONFIG KEY (PHP resets $ar_resolved per
		// get_tags_persons call): the same person may legitimately appear
		// under two different related-section groups.
		const resolved = new Set<string>();
		const refs = relatedLocators.filter((l) => l.section_tipo === relatedSectionTipo);

		for (const entry of entries) {
			if (typeof entry?.component_tipo !== 'string' || typeof entry.section_tipo !== 'string') {
				continue;
			}
			// Owners: the host itself for self entries (stale ontology
			// section_id ignored — PHP :1454), one per related record otherwise.
			const owners =
				entry.section_tipo === host.section_tipo
					? [{ section_tipo: host.section_tipo, section_id: String(host.section_id) }]
					: refs;

			const state = typeof entry.state === 'string' && entry.state.length > 0 ? entry.state : 'a';
			const tagId = entry.tag_id !== undefined && entry.tag_id !== null ? entry.tag_id : 1;
			const model = await getModelByTipo(entry.component_tipo);
			if (model === null) continue;

			for (const owner of owners) {
				let record: MatrixRecord | null;
				if (hostRecord !== null && `${owner.section_tipo}_${owner.section_id}` === hostKey) {
					record = hostRecord;
				} else {
					const table = await getMatrixTableFromTipo(owner.section_tipo);
					if (table === null) continue;
					record = await readMatrixRecord(table, owner.section_tipo, Number(owner.section_id));
				}
				if (record === null) continue;

				const items = readComponentItems(record, entry.component_tipo, model) ?? [];
				for (const item of items) {
					const stored = item as {
						section_tipo?: unknown;
						section_id?: unknown;
						from_component_tipo?: unknown;
					};
					if (typeof stored.section_tipo !== 'string' || stored.section_id === undefined) {
						continue;
					}
					const personLocator = {
						section_tipo: stored.section_tipo,
						section_id: String(stored.section_id),
						component_tipo:
							typeof stored.from_component_tipo === 'string'
								? stored.from_component_tipo
								: entry.component_tipo,
					};
					const dedupKey = `${personLocator.section_tipo}_${personLocator.section_id}`;
					if (resolved.has(dedupKey)) continue;
					resolved.add(dedupKey);

					const label = await getTagPersonLabel(personLocator);
					result.push({
						type: 'person',
						section_tipo: owner.section_tipo,
						section_id: owner.section_id,
						tag: buildTagPerson(state, tagId, label.initials, personLocator),
						role: label.role,
						full_name: label.full_name,
						state,
						tag_id: tagId,
						label: label.initials.trim().replace(/-/g, '_').slice(0, 22),
						data: personLocator,
					});
				}
			}
		}
	}

	return result;
}
