/**
 * SQL identifier sanitizer — the ONE normalization of an ontology-derived name
 * (institution-editable LABEL text) into a safe SQL identifier.
 *
 * Lives in core (not src/diffusion/) because BOTH sides of the diffusion
 * publish/delete lockstep must use the SAME function, and src/core/** may not
 * import from src/diffusion/** (the boundary is diffusion → core). Before
 * DIFF-A (2026-07-28 audit) the publish path sanitized (src/diffusion/plan/
 * identifier.ts) while the delete path (src/core/diffusion_bridge/) used the RAW
 * label — so a node labelled `Web` published to table `web` but deleted from
 * `` `Web` ``, the delete raised errno 1146 (missing table), which was counted
 * as a successful unpublish, and the record stayed live in the public tier.
 * One producer removes the drift by construction.
 *
 * Oracle parity: reproduces the old engine's sanitize_column_name
 * (diffusion_processor.ts) byte-for-byte.
 */

import { DedaloError } from '../errors/dedalo_error.ts';

/** Strict post-sanitize grammar: leading letter, then [a-z0-9_], max 64 total. */
const SQL_IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

/**
 * Old-engine sanitize_column_name, verbatim semantics: lowercase, every
 * non-[a-z0-9_] run becomes '_', collapse runs, trim edge underscores. This is a
 * NORMALIZER, not a validator — 'Título 7' → 't_tulo_7' still faces the grammar.
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
 * satisfy the strict grammar. Throws with a source-naming message.
 */
export function requireSqlIdentifier(
	rawName: string,
	role: 'database' | 'table' | 'column',
): string {
	const sanitized = sanitizeSqlName(rawName);
	if (!isValidSqlIdentifier(sanitized)) {
		throw new DedaloError('internal.invariant', {
			message: `Invalid ${role} identifier ${JSON.stringify(rawName)} (sanitized: ${JSON.stringify(sanitized)}) — diffusion target names must sanitize to ^[a-z][a-z0-9_]{0,63}$ (fix the ontology node label)`,
			coordinates: { role, raw_name: rawName, sanitized },
		});
	}
	return sanitized;
}
