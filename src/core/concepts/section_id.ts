/**
 * SECTION_ID — the record address, always a safe integer.
 *
 * WC-2026-08-10-section-id-int-canonical: a matrix record address is an INT.
 * Everything that is not an int is a DIFFERENT CONCEPT wearing the same field
 * name, and this module is where the concepts separate:
 *
 *   - record address    → branded `SectionId` (safe integer; NEGATIVES ARE
 *                         VALID: -1 is the root/superuser record, -666 the
 *                         activity sentinel; the invariant is "integer",
 *                         never "positive integer")
 *   - external remote id → a STRING owned by the external-service subsystem
 *                         (zenon "001338683" — leading zeros significant;
 *                         wikidata "Q42" — opaque token). NEVER coerced.
 *   - synthetic wire id  → a client-minted token ('search_1', 'tmp_export_2')
 *                         that addresses no record and echoes verbatim.
 *   - absent             → null/undefined/'' — no address at all.
 *
 * The classifier below replaces the scattered `Number.isNaN` /
 * `startsWith('search_')` sniffs. BRANCH PARITY LAW: `synthetic` and
 * `external-ref` must land in the SAME code branches those NaN checks selected
 * (search-mode grant, per-record scope-gate skip) — gated by
 * test/unit/section_id_concept.test.ts.
 *
 * ONE DELIBERATE DIVERGENCE from the NaN era, recorded in the WC entry:
 * `''` classifies as `absent`. Historically `Number('') === 0` slipped an
 * empty id past `hasRecordId` and read record 0.
 *
 * DEPRECATION COUNTERS: every string→int coercion increments a per-source
 * counter (via the observer hook, wired to core/api/counters.ts at boot — the
 * registerOpsGauge inversion pattern keeps this module a pure leaf). Sources
 * split in two classes (D10): RQO-body doors are DEPRECABLE (the counter
 * trending to zero is the contraction evidence); URL-shaped doors
 * (URLSearchParams yields strings forever) coerce PERMANENTLY under their own
 * keys and are excluded from the contraction gate.
 */

import { SectionIdRefused } from '../errors/families.ts';

/** A validated matrix record address. The brand exists only at type level. */
export type SectionId = number & { readonly __brand: 'SectionId' };

/**
 * The conversion rule — shared verbatim with the v6 migration step and the
 * repair-script kernel (test-vector gated on both runtimes):
 * strict numeric text, NO leading zero ('0' itself is fine, '-0' is not),
 * optional leading minus. Anything else is not a record address in disguise.
 */
const STRICT_NUMERIC_STRING = /^(-?[1-9][0-9]*|0)$/;

/** True when the value already IS a record address (safe integer). */
export function isSectionId(value: unknown): value is SectionId {
	return typeof value === 'number' && Number.isSafeInteger(value);
}

/**
 * Assert a value already is a SectionId — internal call sites where a string
 * would be a BUG, not legacy input. Throws; never coerces, never counts.
 */
export function asSectionId(value: unknown): SectionId {
	if (isSectionId(value)) return value;
	throw new SectionIdRefused('section_id.not_an_address', {
		message: `section_id must be a safe integer, got ${typeof value} ${JSON.stringify(value)}`,
	});
}

/** True when a STRING is convertible to a record address under the shared rule. */
export function isConvertibleSectionIdString(value: string): boolean {
	if (!STRICT_NUMERIC_STRING.test(value)) return false;
	return Number.isSafeInteger(Number(value));
}

/**
 * WRITE-SIDE CANONICALIZATION — the one rule every locator writer applies to
 * the section_id it is about to persist (replaces the repealed
 * `String(section_id)` law of relations/save.ts:391 et al.):
 *
 *   - already an int            → verbatim
 *   - convertible string ('7')  → int (the canonical form)
 *   - anything else             → VERBATIM, never cast: external remote ids
 *     ('001338683', 'Q42') are the value; unexpected junk is preserved for the
 *     integrity report rather than corrupted into a wrong address.
 *
 * This is intentionally the SAME rule as the migration kernel and the v6
 * step (shared test vectors) — writers and sweep must converge on identical
 * bytes or the sweep never finishes.
 */
export function canonicalizeStoredSectionId(value: unknown): unknown {
	if (typeof value === 'string' && isConvertibleSectionIdString(value)) {
		return Number(value);
	}
	return value;
}

// ---------------------------------------------------------------------------
// Coercion observability (pure-leaf inversion: the server wires the observer
// to incrementCounter at boot; tests wire a probe; nothing here imports api/).
// ---------------------------------------------------------------------------

type CoercionObserver = (source: string) => void;
let coercionObserver: CoercionObserver = () => {};

/** Wired at boot to core/api/counters.ts incrementCounter (see server.ts). */
export function registerSectionIdCoercionObserver(observer: CoercionObserver): void {
	coercionObserver = observer;
}

/** Sampled WARN state: first coercion per source logs, then every 1000th. */
const warnCounts = new Map<string, number>();

/** Count one coercion at a door: observer + the sampled deprecation WARN. */
function noteCoercion(value: string, source: string): void {
	coercionObserver(source);
	const seen = (warnCounts.get(source) ?? 0) + 1;
	warnCounts.set(source, seen);
	if (seen === 1 || seen % 1000 === 0) {
		console.warn(
			`[section_id-string-coercion] '${value}' at door '${source}' (${seen} so far) — ` +
				'deprecated string form; int is canonical (WC-2026-08-10-section-id-int-canonical)',
		);
	}
}

/**
 * Accept an int, or coerce a legacy STRING form at a named boundary door.
 *
 * - int (safe)                  → returned as-is, no counter.
 * - strict-numeric string       → int + `section_id_string_coercions.<source>`
 *                                 counter + sampled WARN tagged
 *                                 [section_id-string-coercion] (the access-log
 *                                 cross-check greps for this tag).
 * - anything else               → SectionIdRefused (`section_id.not_an_address`).
 *                                 Leading-zero strings land here BY
 *                                 DESIGN: a padded id is an external remote id
 *                                 or corruption, never an address — the caller
 *                                 must classify by tipo first
 *                                 (classifyWireSectionId), not coerce blind.
 */
export function coerceSectionId(value: unknown, source: string): SectionId {
	if (isSectionId(value)) return value;
	if (typeof value === 'string' && isConvertibleSectionIdString(value)) {
		noteCoercion(value, source);
		return Number(value) as SectionId;
	}
	throw new SectionIdRefused('section_id.not_an_address', {
		message: `section_id at door '${source}' is not a record address: ${typeof value} ${JSON.stringify(value)}`,
		coordinates: { source },
	});
}

// ---------------------------------------------------------------------------
// The wire classifier
// ---------------------------------------------------------------------------

export type WireSectionId =
	| { kind: 'record'; id: SectionId }
	| { kind: 'synthetic'; token: string }
	| { kind: 'external-ref'; remoteId: string }
	| { kind: 'absent' };

/**
 * Classify a wire-supplied section_id for a given section tipo.
 *
 *   absent       null / undefined / '' (the '' divergence — see header)
 *   record       safe int, or a strict-numeric string (counted coercion) —
 *                ON ANY TIPO. (!) An address-shaped value is an address:
 *                classifying it external because the tipo CARRIES an
 *                api_config was an S0 (adversarial round 2026-08-10) —
 *                sections like rsc205 hold legacy api_config residue AND
 *                thousands of real matrix records, and their saves silently
 *                landed in the never-write echo branch. TRUE external remote
 *                ids are never convertible (zenon zero-padded, wikidata
 *                opaque) — that invariant, not the tipo, is what protects
 *                them here; the external spec's derived-children rule keeps
 *                new services that way.
 *   external-ref a NON-convertible string on an external-service tipo,
 *                verbatim (leading zeros and opaque tokens are the remote
 *                id's own bytes).
 *   synthetic    any other non-numeric string ('search_1', 'tmp_export_2',
 *                'self') — NaN-branch parity: these took the "not a number"
 *                branch before and must keep doing so.
 *   SectionIdRefused (`section_id.numeric_shaped` / `section_id.unusable_type`
 *                — catch sites say isErrorInDomain(e, 'section_id'))
 *                numeric-shaped strings that are NOT addresses on a
 *                NON-external tipo: leading zeros ('007'), out-of-safe-range
 *                digits — loud, never guessed (WC-noted divergence: the NaN
 *                era silently read Number('007') === 7).
 *
 * ASYNC because the external check consults the ontology; the external
 * subsystem is a PEER of core, reached by dynamic import per the CONVENTIONS
 * layering rules. A malformed api_config THROWS through — a configuration
 * error must not classify as anything. The external predicate is only
 * consulted for NON-convertible strings, so a broken api_config can never
 * block a real record address.
 */
export async function classifyWireSectionId(
	raw: unknown,
	sectionTipo: string,
	source: string,
): Promise<WireSectionId> {
	if (isAbsentWireId(raw)) return { kind: 'absent' };
	if (typeof raw === 'number') {
		return { kind: 'record', id: asSectionId(raw) };
	}
	if (typeof raw !== 'string') {
		throw new SectionIdRefused('section_id.unusable_type', {
			message: `section_id at door '${source}' has unusable type ${typeof raw}: ${JSON.stringify(raw)}`,
			coordinates: { source },
		});
	}
	if (isConvertibleSectionIdString(raw)) {
		return { kind: 'record', id: coerceSectionId(raw, source) };
	}
	return classifyNonConvertibleString(raw, sectionTipo, source);
}

/** No address at all: null/undefined/'' (the '' divergence — see the header). */
function isAbsentWireId(raw: unknown): boolean {
	return raw === null || raw === undefined || raw === '';
}

/** The non-convertible-string tail of the classifier (split for legibility). */
async function classifyNonConvertibleString(
	raw: string,
	sectionTipo: string,
	source: string,
): Promise<WireSectionId> {
	// facade import (S3-02 boundary-seam rule: core→external goes through external/api/)
	const { isExternalSectionTipo } = await import('../../external/api/index.ts');
	if (await isExternalSectionTipo(sectionTipo)) {
		return { kind: 'external-ref', remoteId: raw };
	}
	// Numeric-SHAPED but not convertible = padded or out-of-range digits on a
	// matrix tipo: corruption or a mis-tipoed external ref. Loud.
	if (/^-?[0-9]+$/.test(raw)) {
		throw new SectionIdRefused('section_id.numeric_shaped', {
			message:
				`section_id at door '${source}' is numeric-shaped but not a record address ` +
				`('${raw}': leading zeros or beyond safe-integer range) on non-external tipo '${sectionTipo}'`,
			coordinates: { source, section_tipo: sectionTipo },
		});
	}
	return { kind: 'synthetic', token: raw };
}

/** Test seam: reset the sampled-WARN state between unit tests. */
export function resetSectionIdCoercionStateForTests(): void {
	warnCounts.clear();
	coercionObserver = () => {};
}
