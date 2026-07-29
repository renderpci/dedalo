/**
 * The diffusion output-format sets — ONE list, no forks.
 *
 * Extracted from plan/compile.ts (2026-07-29, WC-065) because a SECOND
 * consumer appeared: api/info.ts decides `connection_status` nullity from
 * "is this element's target a MariaDB database?", the exact question the
 * compiler already asks to arm the identifier chokepoint. A leaf module keeps
 * that one answer in one place without dragging the compiler's dependency
 * cone (ontology resolver + component registry) into the info panel path.
 */

/** The diffusion output formats PHP validate accepts (dd_diffusion_api :442). */
export const KNOWN_FORMATS: ReadonlySet<string> = new Set([
	'sql',
	'rdf',
	'xml',
	'socrata',
	'markdown',
]);

/** Formats whose target is a MariaDB database (identifier chokepoint applies). */
export const TABLE_FORMATS: ReadonlySet<string> = new Set(['sql', 'socrata']);

/**
 * True when an element's declared output type publishes into a MariaDB target
 * database — i.e. when a target-DB reachability verdict is MEANINGFUL. PHP
 * diffusion_utils::get_connection_status (:971) answered only for 'sql' and
 * returned null otherwise; the `socrata` writer publishes through the same
 * table target here, so it answers too (ledgered in WC-065).
 */
export function isMariadbTargetFormat(type: string | null | undefined): boolean {
	return typeof type === 'string' && TABLE_FORMATS.has(type);
}
