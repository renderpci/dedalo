/**
 * component_relation_index SEARCH builder — the computed-inverse pipeline
 * (PHP trait.search_component_relation_index.php). Only `*` (indexed) and
 * `!*` (orphan) exist; any other operator returns no clause (PHP leaves the
 * SQO sentence-less → the WHERE builder drops it; TS-native `false`).
 *
 * `*`  → the searched section's records that ARE the target of a dd96
 *        (indexation) locator anywhere;
 * `!*` → the ones that are not.
 *
 * ONE UNCORRELATED SEMI-JOIN, NOT A MATERIALISED ID LIST (audit PERF-05). The
 * port previously reproduced PHP's shape literally: fetch EVERY inverse dd96
 * reference into the process, dedup the referenced ids in JS, and inline them
 * into the statement TEXT as intval'd literals (`… IN (1,2,3,…)`). On a museum
 * corpus that is the whole indexation table on the wire and a megabyte-class
 * SQL string that no plan cache can ever reuse — for a set the database can
 * hash in place. The `intval'd LITERALS exactly like PHP` note this header used
 * to carry was a parity argument for an oracle that is dead: the ROWS the two
 * shapes select are identical (`x IN (…)` over the same id set), so this is a
 * PLAN change, not a wire change, and it needs no wire-contract entry.
 *
 * The empty cases need no special-casing either, which is why PHP's `1=0` /
 * `1=1` branches are gone rather than translated: an empty semi-join makes
 * `IN` false for every row and `NOT IN` true for every row, all by itself.
 * `NOT IN` is NULL-safe here — target_section_id is NOT NULL in the DDL, and
 * the subselect says so explicitly rather than trusting it.
 *
 * SCOPE, DELIBERATELY: this emits a PREDICATE, not a result set. It is ANDed
 * into the caller's own already-scoped search (buildSearchSql applies the
 * projects filter around it), so it must see every reference — a
 * principal-scoped subselect would hide records from their own owner. (This is
 * the reasoning the AUTHZ-05 door registry carried while this file reached the
 * inverse scan through search_related; the scan is gone, the reasoning is not.)
 *
 * The single-engine guard stays: matrix_relation_index is the ONLY relation
 * engine since the flat-function retirement, so an uncovered instance fails
 * LOUDLY (requireRelationIndex) instead of quietly answering from nothing.
 * NO _tm twin exists — matrix_time_machine searches throw loudly.
 */

import { DedaloError } from '../../errors/dedalo_error.ts';
import { type BuilderContext, type BuilderResult, fragment } from './types.ts';

/** DEDALO_RELATION_TYPE_INDEX_TIPO — the indexation locator type. */
const INDEX_RELATION_TYPE = 'dd96';

export async function buildRelationIndexFragment(
	_rawQ: unknown,
	qOperator: string | null,
	context: BuilderContext,
): Promise<BuilderResult> {
	if (context.table === 'matrix_time_machine') {
		throw new DedaloError('engine.uncovered_scope', {
			message:
				'relation_index search: no time-machine twin exists (PHP has none; the computed-inverse scan targets live relation columns)',
		});
	}
	if (qOperator !== '*' && qOperator !== '!*') return false; // PHP :135-149

	if (context.sectionTipo === '') return false; // unresolvable leaf section

	// The coverage gate keeps the strength the retired scan had: EVERY
	// relation-capable table, not just the searched one — the dd96 locators
	// pointing at this section are owned by records in any of them.
	const [{ getRelationTables }, { requireRelationIndex }] = await Promise.all([
		import('../search_related.ts'),
		import('../search_store.ts'),
	]);
	await requireRelationIndex(await getRelationTables());

	const referenced =
		'SELECT ri.target_section_id FROM matrix_relation_index ri ' +
		'WHERE ri.target_section_tipo = _Qri1_::text AND ri.type = _Qri2_::text ' +
		'AND ri.target_section_id IS NOT NULL';
	const tokenValues = { _Qri1_: context.sectionTipo, _Qri2_: INDEX_RELATION_TYPE };

	return fragment(
		`${context.alias}.section_id ${qOperator === '*' ? 'IN' : 'NOT IN'} (${referenced})`,
		tokenValues,
	);
}
