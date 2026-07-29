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
 *
 * The sanitizer/validator moved to src/core/db/sql_identifier.ts (DIFF-A) so the
 * publish path (here) and the delete path (src/core/diffusion_bridge/, which
 * cannot import src/diffusion/**) share ONE producer. Re-exported here so every
 * existing `plan/identifier.ts` importer is unchanged.
 */

export {
	isValidSqlIdentifier,
	requireSqlIdentifier,
	sanitizeSqlName,
} from '../../core/db/sql_identifier.ts';

/** Backtick-escape an identifier (old engine escape_identifier, verbatim). */
export function escapeSqlIdentifier(name: string): string {
	return `\`${name.replace(/`/g, '``')}\``;
}
