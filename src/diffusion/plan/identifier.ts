/**
 * SQL identifier chokepoint for diffusion targets (DIFFUSION_SPEC §8.3).
 *
 * Database, table, and column names in diffusion derive from ontology node
 * LABELS — institution-editable text becoming SQL identifiers. This module is
 * the ONE place that text is made safe, applied at plan-compile/validate time
 * BEFORE any run starts (a violation is a loud `validate` error, never a
 * runtime surprise). Mirrors the REWRITE_SPEC §7.6 identifier-chokepoint
 * philosophy; backtick-escaping stays mandatory on top (defense in depth).
 *
 * Oracle parity:
 * - sanitizeSqlName reproduces the old engine's sanitize_column_name
 *   (diffusion_processor.ts) byte-for-byte — column names in the published
 *   tables must not drift across the rewrite.
 * - escapeSqlIdentifier reproduces sql_generator.ts escape_identifier.
 */

/** Strict post-sanitize grammar: leading letter, then [a-z0-9_], max 64 total. */
const SQL_IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

/**
 * Old-engine sanitize_column_name, verbatim semantics: lowercase, every
 * non-[a-z0-9_] run becomes '_', collapse runs, trim edge underscores.
 * NOTE: this is a NORMALIZER, not a validator — 'Título 7' → 't_tulo_7' is
 * still subject to validateSqlIdentifier afterwards.
 */
export function sanitizeSqlName(term: string): string {
	return term
		.toLowerCase()
		.replace(/[^a-z0-9_]/g, '_')
		.replace(/_+/g, '_')
		.replace(/^_|_$/g, '');
}

/** True when `name` satisfies the strict identifier grammar. */
export function isValidSqlIdentifier(name: string): boolean {
	return SQL_IDENTIFIER_PATTERN.test(name);
}

/**
 * The chokepoint: sanitize an ontology-derived name and REQUIRE the result to
 * satisfy the strict grammar. Throws with a compile-friendly message naming
 * the offending source — plan compilation surfaces it through `validate`.
 */
export function requireSqlIdentifier(
	rawName: string,
	role: 'database' | 'table' | 'column',
): string {
	const sanitized = sanitizeSqlName(rawName);
	if (!isValidSqlIdentifier(sanitized)) {
		throw new Error(
			`Invalid ${role} identifier ${JSON.stringify(rawName)} (sanitized: ${JSON.stringify(sanitized)}) — diffusion target names must sanitize to ^[a-z][a-z0-9_]{0,63}$ (fix the ontology node label)`,
		);
	}
	return sanitized;
}

/** Backtick-escape an identifier (old engine escape_identifier, verbatim). */
export function escapeSqlIdentifier(name: string): string {
	return `\`${name.replace(/`/g, '``')}\``;
}
