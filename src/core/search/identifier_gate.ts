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
 * - pure functions, no I/O, no state → exhaustively unit- and fuzz-testable
 *   (ONE exception, `resolveSqlDataTipo`: it reads the alias target through a
 *   dynamic import of ontology/alias.ts, so this leaf never joins an import SCC);
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
import { DedaloError } from '../errors/dedalo_error.ts';

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
		// Typed (a caller fault, never internal): the MCP surface maps it to its
		// registry code + hint; the log line keeps the gate's own sentence.
		throw new DedaloError('request.invalid_tipo', {
			message: `search identifier gate: invalid tipo in ${where}: ${JSON.stringify(candidate)}`,
			coordinates: { where },
		});
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
		// Typed (a caller fault, never internal): the MCP surface maps it to its
		// registry code + hint; the log line keeps the gate's own sentence.
		throw new DedaloError('request.invalid_tipo', {
			message: `search identifier gate: invalid component_tipo in ${where}: ${JSON.stringify(candidate)}`,
			coordinates: { where },
		});
	}
	return candidate;
}

/** Throw unless a valid language code ('lg-*' or 'all'). */
export function assertValidLang(candidate: unknown, where: string): string {
	if (typeof candidate !== 'string' || !isValidLang(candidate)) {
		// Typed (a caller fault, never internal): the MCP surface maps it to its
		// registry code + hint; the log line keeps the gate's own sentence.
		throw new DedaloError('request.invalid', {
			message: `search identifier gate: invalid lang in ${where}: ${JSON.stringify(candidate)}`,
			coordinates: { where },
		});
	}
	return candidate;
}

/** Throw unless a known matrix data column. */
export function assertValidDataColumn(candidate: unknown, where: string): string {
	if (typeof candidate !== 'string' || !isValidDataColumn(candidate)) {
		// Typed (a caller fault, never internal): the MCP surface maps it to its
		// registry code + hint; the log line keeps the gate's own sentence.
		throw new DedaloError('request.invalid_tipo', {
			message: `search identifier gate: invalid data column in ${where}: ${JSON.stringify(candidate)}`,
			coordinates: { where },
		});
	}
	return candidate;
}

// --- SqlTipo: the data tipo a builder may interpolate (SURF-1 R4) ---------------

declare const sqlTipoBrand: unique symbol;

/**
 * A tipo that has passed the §7.6 gate FOR INTERPOLATION as a data key — the
 * only type the SQL sinks accept (`BuilderContext.tipo`, conform.ts's join-hop
 * key, sql_assembler.ts's order key). Minted ONLY by `asSqlTipo`; a raw string
 * reaching one of those sinks is a type error, so the zero-new-tsc-errors rule
 * turns a future unchecked sink into a build failure.
 */
export type SqlTipo = string & { readonly [sqlTipoBrand]: true };

/** THE one mint of a SqlTipo: the §7.6 tipo-or-column gate, then the brand. */
export function asSqlTipo(candidate: unknown, where: string): SqlTipo {
	return assertValidTipoOrColumn(candidate, where) as SqlTipo;
}

/**
 * The DATA tipo of `tipo` (component_alias, WC-020: the target's slot) as a
 * SqlTipo. `tipo` itself has already passed the caller's gate (it may be the
 * pseudo-tipo `section_id`, which resolves to itself and stays admitted). A
 * value that came THROUGH an alias is a different identifier the caller never
 * saw: it must pass `assertValidTipo` — never the bare-column allowance —
 * refused `request.invalid_tipo` at `<where> alias target`. The alias reader
 * (ontology/resolver.ts aliasTargetTipoOf) refuses a non-grammar target
 * already; this is the second, independent lock at the sink.
 */
export async function resolveSqlDataTipo(tipo: string, where: string): Promise<SqlTipo> {
	const { resolveDataTipo } = await import('../ontology/alias.ts');
	const resolved = await resolveDataTipo(tipo);
	if (resolved === tipo) return asSqlTipo(tipo, where);
	const aliasWhere = `${where} alias target`;
	return asSqlTipo(assertValidTipo(resolved, aliasWhere), aliasWhere);
}
