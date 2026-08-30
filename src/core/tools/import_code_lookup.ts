/**
 * CODE → RECORD ADDRESS, for the mapped-import doors (MARC21 today; the Zotero
 * door is the second caller the day its parser is re-ported — see the
 * per-door notes below).
 *
 * WHY THIS MODULE EXISTS (audit DATA-08, closed 2026-08-30). An import file
 * carries a FOREIGN identifier: a library control number, a Zotero key, an
 * accession number. The MARC door used to hand that value to the shared import
 * executor AS THE section_id — so a control number of '42' wrote onto record 42
 * of the target section, whatever curated record already lived there, and when
 * no such row existed `saveComponentData`'s upsert branch minted one at that
 * meaningless id (save_component.ts :1064). Both were reported as success.
 *
 * The frozen engine never confused the two: `get_section_id_from_code`
 * (v7_php_frozen tools/tool_import_marc21/class.tool_import_marc21.php :1202,
 * and its twin in tool_import_zotero :1085) SEARCHED the identifier against the
 * section's own CODE component and let `resolve_target_section` create a record
 * when the search found none. That is the law this module restores, in the
 * engine's own search path rather than in a second hand-rolled query.
 *
 * THREE PROPERTIES A CALLER GETS:
 *
 *   1. THE SEARCH IS THE ENGINE'S. The lookup is an ordinary SQO run through
 *      `buildSearchSql` — the same assembler the list, the picker and every
 *      other search go through — so a code lookup can never drift from what the
 *      operator sees when they search that component by hand.
 *   2. THE MATCH IS EXACT, BY A SECOND READ. The `=` operator compares
 *      `f_unaccent(value) = f_unaccent(q)` and strips quotes from q
 *      (builder_string.ts :225-233), which is the right NARROWING but is not
 *      identity: 'Núñez-1' and 'Nunez-1' are one candidate set, and so are
 *      "O'Brien-1" and 'OBrien-1'. An identifier that resolves to a
 *      LOOK-ALIKE's record is the very defect this module closes, so every
 *      candidate's stored value is read back and compared as bytes; only an
 *      exact (trimmed) equal is an address.
 *   3. AMBIGUITY IS A REFUSAL, NOT A FIRST ROW. PHP took `limit 1` and wrote
 *      into whichever record the planner returned first. If two records already
 *      carry the identifier, no answer is honest — the caller is told, and
 *      writes nothing.
 *
 * SELECT-ONLY: this module resolves an address and never writes one.
 *
 * The heavy edges (the search assembler, the ontology resolver, the matrix
 * reader) are DYNAMIC imports, as they are in this directory's neighbours
 * (import_conform.ts, import_csv.ts): the tools layer sits above core, and the
 * import doors keep their static edge set small so a parser stays loadable when
 * an unrelated module below fails to parse.
 */

import { DedaloError } from '../errors/index.ts';
import type { Principal } from '../security/permissions.ts';

/** The component an identifier is matched against: the section's CODE component. */
export interface ImportCodeTarget {
	/** The section being imported into — the same one the records are written to. */
	sectionTipo: string;
	/** The code component inside it (PHP: the `id` map entry's ddo_map tipo). */
	componentTipo: string;
}

/**
 * How many candidate rows the narrowing search asks for. Two is enough to
 * answer the only question that matters — "is this identifier unique?" — and a
 * cap keeps a mis-pointed config (a code component that holds the same word on
 * thousands of records) from dragging a whole section back through the door.
 * The third row would not change the answer: >1 is already a refusal.
 */
const CANDIDATE_CAP = 2;

/** The stored values of one component on one record, as comparable strings. */
/**
 * ONE STORED ITEM AS COMPARABLE TEXT, or null when it carries none.
 *
 * A literal component stores `{lang, value}`; a value-less model stores something
 * else entirely, and a numeric code is compared by its text. NO lang filter: an
 * identifier is an identifier in every language slice, and the search leaf that
 * produced the candidate matched across langs too.
 */
function itemAsText(item: unknown): string | null {
	const value =
		item !== null && typeof item === 'object' ? (item as { value?: unknown }).value : item;
	if (typeof value === 'string') return value.trim();
	if (typeof value === 'number') return String(value);
	return null;
}

/**
 * The component's stored items, or NONE when this section cannot be read.
 *
 * Every un-readable shape answers with no items rather than a throw: a code lookup
 * that cannot read a section has found nothing there, which is a true answer and
 * keeps the caller's refusal logic in one place.
 */
async function readItems(
	sectionTipo: string,
	sectionId: number,
	componentTipo: string,
): Promise<unknown[]> {
	const { getMatrixTableFromTipo, getModelByTipo } = await import('../ontology/resolver.ts');
	const { isMatrixTable, readMatrixRecord } = await import('../db/matrix.ts');
	const { readComponentItems } = await import('../resolve/component_data.ts');
	const table = await getMatrixTableFromTipo(sectionTipo);
	const model = await getModelByTipo(componentTipo);
	if (table === null || model === null || !isMatrixTable(table)) return [];
	const record = await readMatrixRecord(table, sectionTipo, sectionId);
	if (record === null) return [];
	return readComponentItems(record, componentTipo, model) ?? [];
}

async function storedValues(
	sectionTipo: string,
	sectionId: number,
	componentTipo: string,
): Promise<string[]> {
	// A VIRTUAL section whose declared matrix_table is not a readable record store
	// (dd15 -> matrix_time_machine, flat columns) has no record to read;
	// `readMatrixRecord` would throw on it (assertMatrixTable). Same guard the
	// widget reader uses (widget_common.ts :246). Every un-readable shape answers
	// with no items rather than a throw: a code lookup that cannot read a section
	// has found nothing there, which is a true answer.
	const items = await readItems(sectionTipo, sectionId, componentTipo);
	const values: string[] = [];
	for (const item of items) {
		const text = itemAsText(item);
		if (text !== null) values.push(text);
	}
	return values;
}

/**
 * The record id whose code component holds EXACTLY `code`, or null when no
 * record carries it (the caller's cue to CREATE one).
 *
 * Throws `resource.conflict` when more than one record carries it: an
 * identifier that names two records names neither.
 *
 * The principal is the CALLER'S, never absent: `buildSearchSql` treats a missing
 * principal as an internal unscoped search, and resolving an import against
 * records the operator cannot see would let one project's import silently
 * update another's record (record_pool.ts states the same rule for the same
 * reason).
 */
export async function findSectionIdByCode(
	target: ImportCodeTarget,
	code: string,
	principal: Principal,
): Promise<number | null> {
	const wanted = code.trim();
	if (wanted === '') return null;

	const { sanitizeClientSqo } = await import('../concepts/sqo.ts');
	const { buildSearchSql } = await import('../search/sql_assembler.ts');
	const { sql } = await import('../db/postgres.ts');

	const sqo = sanitizeClientSqo({
		section_tipo: [target.sectionTipo],
		filter: {
			$and: [
				{
					// q_operator '=' is the engine's EXACT-match operator (the
					// single-char twin of '=='); the value travels as `q`, never glued
					// into the operator string, so an identifier that happens to start
					// with an operator character ('*x', '-x') is still read as data.
					q: wanted,
					q_operator: '=',
					path: [{ section_tipo: target.sectionTipo, component_tipo: target.componentTipo }],
				},
			],
		},
		limit: CANDIDATE_CAP,
	});
	const built = await buildSearchSql(sqo, { principal, idsOnly: true });
	const rows = (await sql.unsafe(built.sql, built.params as (string | number | null)[])) as {
		section_id: number;
	}[];

	// Property 2: the search NARROWS, the byte comparison DECIDES.
	const matches: number[] = [];
	for (const row of rows) {
		const sectionId = Number(row.section_id);
		const values = await storedValues(target.sectionTipo, sectionId, target.componentTipo);
		if (values.includes(wanted)) matches.push(sectionId);
	}

	if (matches.length === 0) return null;
	if (matches.length > 1) {
		const sentence =
			`The identifier '${wanted}' is held by more than one record of section ${target.sectionTipo} ` +
			`(${matches.join(', ')}), so it names none of them. Nothing was imported — resolve the duplicate ` +
			`codes in ${target.componentTipo} first.`;
		throw new DedaloError('resource.conflict', {
			message: sentence,
			publicMessage: sentence,
			coordinates: {
				section_tipo: target.sectionTipo,
				component_tipo: target.componentTipo,
			},
		});
	}
	return matches[0] as number;
}
