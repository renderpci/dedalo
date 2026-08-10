/**
 * SECTION_ID INTIFY KERNEL — the pure transform of the int-unification sweep
 * (WC-2026-08-10-section-id-int-canonical; plan P3b).
 *
 * Walks a decoded jsonb value (the locator_rewrite.ts walk shape) and converts
 * every locator-carried section_id / section_id_key / parent_section_id that
 * is a CONVERTIBLE STRING into the canonical int form. Everything else is
 * reported as a classed finding and NEVER cast:
 *
 *   external-skip  a NON-convertible string on an external-service tipo —
 *                  the string IS the remote id (zenon zero-padded, wikidata
 *                  opaque). Convertible strings convert ON ANY TIPO: an
 *                  address-shaped value is an address, and tipos carrying
 *                  legacy api_config residue (rsc205) hold real records.
 *   leading-zero   '007' / '-0' on a NON-external tipo: an external ref on a
 *                  mis-tipoed object or corruption — an integrity finding.
 *   out-of-range   numeric digits beyond IEEE-754 safe integers.
 *   empty          ''            (D17 purge class)
 *   null-literal   'null'        (D17 purge class)
 *   token          any other non-numeric string ('tmp', 'self', '${section_id}').
 *   float          a jsonb number that is not an integer.
 *   null-value     JSON null — the documented "no address" metadata shape
 *                  (create_record writes section_id: null); expected, tallied
 *                  so reports are complete, never purged mechanically.
 *   other          bool/object/array in id position.
 *
 * THE CONVERSION RULE IS SHARED verbatim with concepts/section_id.ts
 * (isConvertibleSectionIdString) and with the v6 migration step — the
 * test-vector file test/unit/fixtures/section_id_conversion_vectors.json is
 * asserted on both runtimes. Writers (relations/save.ts et al.) apply the same
 * rule via canonicalizeStoredSectionId, so sweep and live writes converge on
 * identical bytes.
 *
 * STRING SCALARS ARE NEVER DESCENDED INTO (D18): inline tag markers serialize
 * locator JSON inside text values, and those bytes are a pinned wire edge for
 * publication v1 — the walk touches only real objects/arrays.
 *
 * PURGE (D17): operator-adjudicated per-class element deletion. Only locator
 * OBJECTS that are direct ARRAY elements are removable (removing a keyed
 * object would change its container's shape), and only when their section_id
 * finding class is in ctx.purgeClasses. Dry-run reports identities first;
 * the driver enforces that discipline.
 */

export type IntifyFindingClass =
	| 'external-skip'
	| 'leading-zero'
	| 'out-of-range'
	| 'empty'
	| 'null-literal'
	| 'token'
	| 'float'
	| 'null-value'
	| 'other';

/** The address-bearing keys of the locator shape (census P0: the full set). */
const ADDRESS_KEYS = ['section_id', 'section_id_key', 'parent_section_id'] as const;
type AddressKey = (typeof ADDRESS_KEYS)[number];

export interface IntifyFinding {
	class: IntifyFindingClass;
	key: AddressKey;
	/** The section_tipo beside the value (section_tipo_key for section_id_key). */
	sectionTipo: string | null;
	/** The offending value, verbatim (JSON-safe by construction). */
	value: unknown;
}

export interface IntifyContext {
	/** External-service tipos (D15 prefetch) — their string ids are DATA. */
	externalTipos: ReadonlySet<string>;
	/** D17: finding classes whose carrier array-element is deleted. */
	purgeClasses?: ReadonlySet<string>;
}

export interface IntifyResult {
	/** True when the value was mutated (conversions and/or purges). */
	changed: boolean;
	/** Every non-converted, non-canonical value found, classed. */
	findings: IntifyFinding[];
	/** Count of string→int conversions performed. */
	converted: number;
	/** Count of array elements removed by purge classes. */
	purged: number;
}

/**
 * THE RULE (same as concepts/section_id.ts isConvertibleSectionIdString —
 * duplicated as a literal regex so this kernel stays import-free and the twin
 * PHP implementation can mirror it symbol-for-symbol; the shared test vectors
 * pin both to identical behavior).
 */
const STRICT_NUMERIC_STRING = /^(-?[1-9][0-9]*|0)$/;
const NUMERIC_SHAPED = /^-?[0-9]+$/;

function classifyString(value: string): { convertible: boolean; class?: IntifyFindingClass } {
	if (value === '') return { convertible: false, class: 'empty' };
	if (value === 'null') return { convertible: false, class: 'null-literal' };
	if (STRICT_NUMERIC_STRING.test(value)) {
		return Number.isSafeInteger(Number(value))
			? { convertible: true }
			: { convertible: false, class: 'out-of-range' };
	}
	// NUMERIC_SHAPED covers '-0' and '-07' too — anything digit-shaped that the
	// strict rule above refused has leading zeros (or a lone minus-zero).
	if (NUMERIC_SHAPED.test(value)) {
		return { convertible: false, class: 'leading-zero' };
	}
	return { convertible: false, class: 'token' };
}

/**
 * The tipo that scopes an address key on one object — null when the paired
 * tipo key is ABSENT, which per the locator law (locator_rewrite.ts: a locator
 * is an object carrying section_tipo + section_id) means the object is NOT a
 * locator: e.g. a component_json value whose user JSON happens to hold a
 * `section_id` key. Such values are user data and are never touched.
 */
function tipoForKey(obj: Record<string, unknown>, key: AddressKey): string | null {
	const tipoKey = key === 'section_id_key' ? 'section_tipo_key' : 'section_tipo';
	const tipo = obj[tipoKey];
	return typeof tipo === 'string' ? tipo : null;
}

/**
 * Adjudicate ONE address value: 'convert' (a convertible string — the S0 rule:
 * an address-shaped value converts ON ANY TIPO; true external remote ids are
 * never convertible, and tipos carrying legacy api_config residue like rsc205
 * hold real records), a finding class, or null (already canonical).
 */
function adjudicateValue(
	value: unknown,
	isExternalTipo: boolean,
): IntifyFindingClass | 'convert' | null {
	if (typeof value === 'number') return classifyNumber(value);
	if (value === null) return 'null-value';
	if (typeof value !== 'string') return 'other';
	const verdict = classifyString(value);
	if (verdict.convertible) return 'convert';
	// External tipo: the non-convertible string IS the remote id.
	if (isExternalTipo) return 'external-skip';
	return verdict.class as IntifyFindingClass;
}

/** Number leg: canonical int → null; float / beyond-safe-range → findings. */
function classifyNumber(value: number): IntifyFindingClass | null {
	if (!Number.isInteger(value)) return 'float';
	if (!Number.isSafeInteger(value)) return 'out-of-range';
	return null;
}

/** Convert or report ONE address key of one object. Returns the finding class. */
function intifyOneKey(
	obj: Record<string, unknown>,
	key: AddressKey,
	ctx: IntifyContext,
	result: IntifyResult,
): IntifyFindingClass | null {
	const value = obj[key];
	const sectionTipo = tipoForKey(obj, key);
	// LOCATOR LAW: no paired tipo key → not a locator → user data, untouched
	// (a component_json value may legitimately carry a 'section_id' key).
	if (sectionTipo === null) return null;
	const isExternalTipo = ctx.externalTipos.has(sectionTipo);
	const verdict = adjudicateValue(value, isExternalTipo);
	if (verdict === 'convert') {
		obj[key] = Number(value);
		result.changed = true;
		result.converted++;
		return null;
	}
	if (verdict !== null) {
		result.findings.push({ class: verdict, key, sectionTipo, value });
	}
	return verdict;
}

/**
 * Process the address keys of ONE object in place. Returns the finding class
 * of the object's own `section_id` (the purge adjudicator) or null.
 */
function intifyObjectKeys(
	obj: Record<string, unknown>,
	ctx: IntifyContext,
	result: IntifyResult,
): IntifyFindingClass | null {
	let sectionIdClass: IntifyFindingClass | null = null;
	for (const key of ADDRESS_KEYS) {
		if (!(key in obj)) continue;
		const findingClass = intifyOneKey(obj, key, ctx, result);
		if (key === 'section_id') sectionIdClass = findingClass;
	}
	return sectionIdClass;
}

/**
 * Recursively intify a decoded jsonb value IN PLACE.
 *
 * Arrays are walked with purge support: an element object whose own
 * section_id finding class is in ctx.purgeClasses is REMOVED (splice), which
 * is the D17 adjudicated deletion — everything else only converts or reports.
 */
export function intifySectionIdsInValue(value: unknown, ctx: IntifyContext): IntifyResult {
	const result: IntifyResult = { changed: false, findings: [], converted: 0, purged: 0 };
	walk(value, ctx, result);
	return result;
}

function walk(value: unknown, ctx: IntifyContext, result: IntifyResult): void {
	if (Array.isArray(value)) {
		walkArray(value, ctx, result);
		return;
	}
	if (value !== null && typeof value === 'object') {
		const obj = value as Record<string, unknown>;
		intifyObjectKeys(obj, ctx, result);
		for (const key of Object.keys(obj)) {
			walk(obj[key], ctx, result);
		}
	}
	// scalars (incl. STRINGS — D18) are never descended into
}

/**
 * Array leg of the walk, with the D17 purge seam: only here can a locator
 * OBJECT be removed (splice), and only when its own section_id finding class
 * was adjudicated purgeable.
 */
function walkArray(value: unknown[], ctx: IntifyContext, result: IntifyResult): void {
	for (let index = value.length - 1; index >= 0; index--) {
		const element = value[index];
		if (!isPlainObject(element)) {
			walk(element, ctx, result);
			continue;
		}
		const sectionIdClass = intifyObjectKeys(element, ctx, result);
		if (shouldPurgeElement(sectionIdClass, ctx)) {
			value.splice(index, 1);
			result.changed = true;
			result.purged++;
			continue; // removed — do not descend into it
		}
		for (const key of Object.keys(element)) {
			walk(element[key], ctx, result);
		}
	}
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** D17: the element goes only when its own section_id class was adjudicated. */
function shouldPurgeElement(
	sectionIdClass: IntifyFindingClass | null,
	ctx: IntifyContext,
): boolean {
	return sectionIdClass !== null && ctx.purgeClasses?.has(sectionIdClass) === true;
}
