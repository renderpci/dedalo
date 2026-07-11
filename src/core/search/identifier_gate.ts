/**
 * IDENTIFIER VALIDATION CHOKEPOINT — spec §7.6, plan A5.7.
 *
 * Section tipos, component tipos, language codes and matrix column names are
 * interpolated VERBATIM into JSONB path expressions and SQL identifiers by
 * the search engine ("datos#>>'{components,oh62,...}'", ORDER BY column
 * names…). They CANNOT be bound as parameters. This module is the single
 * gate every such identifier passes through BEFORE any SQL string is built.
 *
 * Design rules (why this file is deliberately tiny):
 * - pure functions, no I/O, no state → exhaustively unit- and fuzz-testable;
 * - allowlist logic only — no escaping, no "cleaning": invalid input is
 *   REJECTED, never repaired;
 * - the search engine imports ONLY the assert* functions, which throw — a
 *   forgotten boolean check cannot silently pass hostile input.
 *
 * PHP reference: core/search/trait.utils.php — is_valid_tipo (:165),
 * is_valid_lang (:195), is_valid_data_column (:213); enforced in
 * search::conform_filter (class.search.php:854-891).
 */

import { isValidLang, isValidTipo } from '../concepts/ontology.ts';

/**
 * Matrix data columns legal in search paths, SELECT projections and ORDER BY.
 * Mirrors PHP trait.utils.php $valid_columns exactly:
 * - the jsonb data columns of the v7 matrix contract,
 * - structural columns,
 * - the time-machine flat columns (searchable in mode 'tm').
 */
export const VALID_DATA_COLUMNS: readonly string[] = [
	// matrix jsonb data columns
	'data',
	'relation',
	'string',
	'date',
	'iri',
	'geo',
	'number',
	'media',
	'misc',
	'relation_search',
	'meta',
	// structural columns
	'section_id',
	'section_tipo',
	// time machine flat columns
	'id',
	'tipo',
	'lang',
	'type',
];

export function isValidDataColumn(candidate: string): boolean {
	return VALID_DATA_COLUMNS.includes(candidate);
}

/** Throw unless a valid ontology tipo (e.g. 'oh62', 'numisdata3'). */
export function assertValidTipo(candidate: unknown, where: string): string {
	if (typeof candidate !== 'string' || !isValidTipo(candidate)) {
		throw new Error(
			`search identifier gate: invalid tipo in ${where}: ${JSON.stringify(candidate)}`,
		);
	}
	return candidate;
}

/**
 * Throw unless a valid component reference in a search path: either an
 * ontology tipo OR a bare data-column name (PHP allows both in
 * path.component_tipo — e.g. ordering by 'section_id').
 */
export function assertValidTipoOrColumn(candidate: unknown, where: string): string {
	if (typeof candidate !== 'string' || (!isValidTipo(candidate) && !isValidDataColumn(candidate))) {
		throw new Error(
			`search identifier gate: invalid component_tipo in ${where}: ${JSON.stringify(candidate)}`,
		);
	}
	return candidate;
}

/** Throw unless a valid language code ('lg-*' or 'all'). */
export function assertValidLang(candidate: unknown, where: string): string {
	if (typeof candidate !== 'string' || !isValidLang(candidate)) {
		throw new Error(
			`search identifier gate: invalid lang in ${where}: ${JSON.stringify(candidate)}`,
		);
	}
	return candidate;
}

/** Throw unless a known matrix data column. */
export function assertValidDataColumn(candidate: unknown, where: string): string {
	if (typeof candidate !== 'string' || !isValidDataColumn(candidate)) {
		throw new Error(
			`search identifier gate: invalid data column in ${where}: ${JSON.stringify(candidate)}`,
		);
	}
	return candidate;
}
