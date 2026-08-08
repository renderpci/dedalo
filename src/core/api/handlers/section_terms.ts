/**
 * SECTION-TERMS LOCATOR NORMALIZATION — the pure input layer of
 * dd_core_api::get_section_terms (PHP :3482), the batch section_map term
 * resolver the graph view labels its nodes with.
 *
 * Extracted VERBATIM from the handler's inline loop (2026-08-08, CRAP tier 3.5)
 * so the validate + dedup + cap rules are testable without a DB, a principal or
 * an ontology: every entry that reaches the DB tier has already been proven to
 * carry a safe tipo and a usable section_id here.
 *
 * Order is load-bearing and matches PHP: the CAP is applied to the RAW batch
 * (malformed entries consume cap slots), then each surviving entry is validated,
 * then deduped by composite key with first-occurrence-wins.
 */

/** PHP safe_tipo grammar (shared/core_functions.php:2296). */
const SAFE_TIPO = /^[a-z]{2,}[0-9]+$/;

/** hard cap to prevent unbounded work from a hostile/huge batch (PHP :3491) */
export const MAX_TERM_LOCATORS = 1000;

/** A validated batch entry: the composite result key plus its locator parts. */
export interface NormalizedTermLocator {
	/** `${section_tipo}_${section_id}` — the key of the response term map. */
	key: string;
	section_tipo: string;
	/** Kept in its INCOMING form (string or number) — never coerced. */
	section_id: string | number;
}

/**
 * Validate, dedup and cap a raw `rqo.locators` batch.
 *
 * Dropped: non-objects, arrays, nulls, tipos failing the safe_tipo grammar,
 * absent/empty/non-scalar section_ids, and every repeat of an already-seen
 * composite key. Anything past the cap never gets looked at.
 */
export function normalizeTermLocators(rawLocators: unknown): NormalizedTermLocator[] {
	if (!Array.isArray(rawLocators)) return [];

	let locatorEntries = rawLocators as unknown[];
	if (locatorEntries.length > MAX_TERM_LOCATORS) {
		console.warn(
			`[dd_core_api] get_section_terms batch exceeds cap (${MAX_TERM_LOCATORS}); truncating from ${locatorEntries.length}`,
		);
		locatorEntries = locatorEntries.slice(0, MAX_TERM_LOCATORS);
	}

	const out: NormalizedTermLocator[] = [];
	const seen = new Set<string>();
	for (const entry of locatorEntries) {
		if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue;
		const sectionTipo = (entry as { section_tipo?: unknown }).section_tipo;
		const sectionId = (entry as { section_id?: unknown }).section_id;
		if (typeof sectionTipo !== 'string' || !SAFE_TIPO.test(sectionTipo)) continue;
		if (
			sectionId === null ||
			sectionId === undefined ||
			sectionId === '' ||
			(typeof sectionId !== 'string' && typeof sectionId !== 'number')
		) {
			continue;
		}
		const key = `${sectionTipo}_${sectionId}`;
		if (seen.has(key)) continue; // dedup — first occurrence wins
		seen.add(key);
		out.push({ key, section_tipo: sectionTipo, section_id: sectionId });
	}
	return out;
}
