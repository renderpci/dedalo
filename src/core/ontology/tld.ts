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

/**
 * The ontology node section whose records deliberately declare a FOREIGN tld: a
 * localontology record OVERRIDES a canonical node (e.g. `rsc12`), so its
 * `ontology7` names the overridden node's tld, never `localontology`. See the
 * overwrite machinery in `parser.ts` (getOverwriteLocator + the `resolved`
 * accessor). Exempt from ONT-TLD below.
 */
const LOCAL_ONTOLOGY_SECTION = 'localontology0';

/**
 * THE ONT-TLD RULE, in one place.
 *
 * The tld a record of `sectionTipo` MUST declare in its `ontology7` component,
 * or null when the section is not governed by the invariant.
 *
 *   > ONT-TLD — a record of an ontology node section `<tld>0` (table
 *   > `matrix_ontology`) declares `ontology7 = <tld>`.
 *
 * The value is DERIVED, never typed: a record of section `actv0` parses into
 * node tipo `actv<section_id>` (parser.ts), so `actv` is the only tld it can
 * ever have. A record whose `ontology7` is missing parses to nothing and is
 * invisible in the ontology tree; one that names another tld parses into that
 * OTHER namespace (ontology_state's `foreign` drift). Both are always bugs.
 *
 * Governed: any `<tld>0` section — `dd0`, `rsc0`, `actv0`, and the grouper
 * sections `ontologytype0` / `hierarchytype0` / `hierarchymtype0` alike.
 * NOT governed, and both carve-outs are load-bearing:
 *   - `localontology0` (see above);
 *   - `matrix_ontology_main` (section `ontology35`), which holds the tld being
 *     DEFINED in `hierarchy6`, not `ontology7` — operator data, not derived.
 *     It is not `<tld>0`-shaped, so it falls out here for free.
 *
 * Pure string rule, no DB: `<tld>0` implies `matrix_ontology`, so no table
 * lookup is needed. The shape check is EXACT (`dd0x` is not `dd0`).
 */
export function requiredOntologyTld(sectionTipo: string): string | null {
	if (sectionTipo === LOCAL_ONTOLOGY_SECTION) {
		return null;
	}
	const tld = getTldFromTipo(sectionTipo);
	if (tld === null || sectionTipo !== `${tld}0`) {
		return null;
	}
	return safeTld(tld);
}

/** Build a tipo from a TLD and section_id (`es` + 1 → `es1`). */
export function buildTipo(tld: string, sectionId: number | string): string {
	return `${tld}${sectionId}`;
}

/** True when `tipo` is the main section (`<tld>0`) of `tld`. */
export function isMainTipo(tipo: string, tld: string): boolean {
	return tipo === `${tld}0`;
}
