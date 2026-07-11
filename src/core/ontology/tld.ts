/**
 * TLD identity — the pure rules that turn a top-level-domain namespace and a
 * section_id into an ontology/section tipo, and back.
 *
 * Every Dédalo tipo is `<tld><number>`: the TLD is a lowercase-letter namespace
 * (`dd`, `rsc`, `hierarchy`, `ontology`, or a user-defined thesaurus TLD like
 * `es`), the number is the section_id within it. Two anchoring rules the whole
 * ontology depends on:
 *   - a HIERARCHY record with TLD `es` and section_id 1/2 provisions sections
 *     `es1` (descriptors) and `es2` (models);
 *   - an ONTOLOGY main section is ALWAYS `<tld>0` (e.g. `dd0`, `rsc0`) — real
 *     nodes start at 1, so 0 is reserved for the section root.
 *
 * No SQL, no imports: these are byte-for-byte ports of the PHP helpers
 * (shared/core_functions.php: safe_tld :2272, get_tld_from_tipo :2356,
 * get_section_id_from_tipo :2331; ontology::map_tld_to_target_section_tipo
 * :1449), unit-tested against the PHP edge cases. Shared by the parser, the
 * write drivers, provisioning and deletion so the derivation lives in ONE place.
 */

/** PHP safe_tld: a valid TLD is two-or-more lowercase letters, nothing else. */
const SAFE_TLD_RE = /^[a-z]{2,}$/;
/** PHP get_tld_from_tipo: the leading run of two-or-more lowercase letters. */
const TLD_PREFIX_RE = /^[a-z]{2,}/;
/** PHP get_section_id_from_tipo: the first run of digits anywhere in the tipo. */
const SECTION_ID_RE = /[0-9]+/;

/**
 * Validate a TLD (PHP safe_tld). Returns the TLD unchanged when it is a legal
 * namespace, else null. Note PHP is strict: digits or hyphens are rejected —
 * `safe_tld('es-x')` and `safe_tld('dd1')` are both false.
 */
export function safeTld(tld: string): string | null {
	return SAFE_TLD_RE.test(tld) ? tld : null;
}

/**
 * The TLD prefix of a tipo (PHP get_tld_from_tipo): `dd0` → `dd`,
 * `ontologytype14` → `ontologytype`. Null when the tipo has no leading letters.
 */
export function getTldFromTipo(tipo: string): string | null {
	const match = TLD_PREFIX_RE.exec(tipo);
	return match ? match[0] : null;
}

/**
 * The section_id part of a tipo (PHP get_section_id_from_tipo): the FIRST digit
 * run — NOT anchored to the end (PHP quirk: preserved for parity). Returned as a
 * string so `'0'` is distinguishable and never coerced away. Null when there is
 * no digit at all.
 */
export function getSectionIdFromTipo(tipo: string): string | null {
	const match = SECTION_ID_RE.exec(tipo);
	return match ? match[0] : null;
}

/**
 * The main ontology section tipo for a TLD (PHP map_tld_to_target_section_tipo):
 * `<safeTld>0`. Throws on an invalid TLD — the caller must never build a tipo
 * from an unvalidated namespace.
 */
export function mapTldToTargetSectionTipo(tld: string): string {
	const safe = safeTld(tld);
	if (safe === null) {
		throw new Error(`mapTldToTargetSectionTipo: invalid tld '${tld}'`);
	}
	return `${safe}0`;
}

/** Build a tipo from a TLD and section_id (`es` + 1 → `es1`). */
export function buildTipo(tld: string, sectionId: number | string): string {
	return `${tld}${sectionId}`;
}

/** True when `tipo` is the main section (`<tld>0`) of `tld`. */
export function isMainTipo(tipo: string, tld: string): boolean {
	return tipo === `${tld}0`;
}
