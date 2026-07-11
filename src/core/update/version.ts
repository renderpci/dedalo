/**
 * Engine version — the ONE source of truth (UPDATE_PROCESS Phase 0).
 * PHP twin: core/base/version.inc (DEDALO_VERSION/DEDALO_MAJOR_VERSION) +
 * shared/core_functions.php get_dedalo_version(). Every engine/data version
 * literal derives from the triple below; the update_ownership_tripwire literal
 * scan keeps new hardcodes out of src/. Leaf module — imports nothing.
 */

/** The engine version triple (PHP get_dedalo_version() shape). */
export const DEDALO_VERSION_TRIPLE: readonly [number, number, number] = Object.freeze([
	7, 0, 0,
]) as [number, number, number];

/**
 * Prerelease tag appended to the code-version string ('' on release builds).
 * PHP appends '.dev' when DEVELOPMENT_SERVER; this install literal is pinned
 * for wire parity ([install]).
 */
const PRERELEASE_TAG = '.dev';

/** '7.0.0' — the data-version string (matrix_updates rows, login About panel). */
export const DEDALO_VERSION: string = DEDALO_VERSION_TRIPLE.join('.');

/** '7.0.0.dev' — the code-version string the client displays (PHP DEDALO_VERSION). */
export const DEDALO_ENGINE_VERSION: string = `${DEDALO_VERSION}${PRERELEASE_TAG}`;

/** '7.0' — the ontology IO directory segment (patch releases share one dir, PHP parity). */
export const DEDALO_VERSION_MAJOR_MINOR: string = `${DEDALO_VERSION_TRIPLE[0]}.${DEDALO_VERSION_TRIPLE[1]}`;

/**
 * Semantic int[] version compare: -1 / 0 / 1. Missing segments count as 0
 * ([7,0] equals [7,0,0]) — the matrix_updates ordering contract (PHP
 * string_to_array(...)::int[] DESC) and PHP version_compare padding.
 */
export function compareVersionArrays(a: readonly number[], b: readonly number[]): number {
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const da = a[i] ?? 0;
		const db = b[i] ?? 0;
		if (da > db) return 1;
		if (da < db) return -1;
	}
	return 0;
}

/** '7.0.0.dev' → [7,0,0]: strip a trailing prerelease tag, split on dots. */
export function parseVersionString(version: string): number[] {
	return version
		.replace(/\.dev$/, '')
		.split('.')
		.map(Number);
}
