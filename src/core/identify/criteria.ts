/**
 * CRITERION → SQO COMPILER — the write half of identification's read/match pair.
 *
 * `path_read.ts` reads what the SEED holds at a criterion's path; this module
 * turns that value plus the criterion into the SQO filter shape that finds every
 * OTHER record agreeing on it. Nothing here is a new query language: every
 * emitted node is an ordinary SQO leaf/`$and`/`$or` that `search/conform.ts`
 * already executes and `concepts/sqo.ts` already validates. The criterion path
 * travels verbatim as the leaf's `path`, so a criterion reaching outward through
 * portals compiles to conform's LATERAL join chain for free.
 *
 * PURE. No I/O, no ontology lookups, no module-level state, no ALS reads — the
 * value it compiles was resolved by the reader, which is where the ontology
 * questions were already answered. That makes the whole compiler unit-testable
 * against no database at all, which is the point: this is the layer whose bugs
 * are silent (a leaf with the wrong shape returns plausible, wrong candidates).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * VERIFIED RELATION-LEAF SEMANTICS (2026-07-28) — why OR is separate leaves
 * ────────────────────────────────────────────────────────────────────────────
 * An array of locators in ONE leaf is AND, not OR. Verified twice, end to end:
 *
 *  1. CODE. `search/builders/builder_relation.ts` compiles the q array through
 *     `search/containment.ts` (relationProbeGroups + composeContains): one
 *     probe GROUP per locator, ANDed together —
 *       `(rel @> {"<tipo>":[loc1]} …) AND (rel @> {"<tipo>":[loc2]} …)`
 *     which is the per-element decomposition of the historical whole-array
 *     `@> '{"<tipo>":[loc1,loc2]}'` probe: same AND semantics (every locator
 *     must be contained), now tolerant of mixed-typed stored data
 *     (WC-2026-08-10-section-id-int-canonical). The record must still hold
 *     loc1 AND loc2 — the DATABASE proof below remains the law.
 *  2. DATABASE. Against the live test store (matrix_test, test3/1, whose
 *     `test88` holds dd64/1 and dd64/2):
 *       @> {"test88":[dd64/1]}            → matches
 *       @> {"test88":[dd64/2]}            → matches
 *       @> {"test88":[dd64/1, dd64/2]}    → matches
 *       @> {"test88":[dd64/1, dd64/999]}  → NO ROWS   ← the AND proof
 *
 * Identification wants ANY of the seed's locators (a coin linking two Types
 * agrees with a coin linking either), so OR is expressed as SEPARATE leaves
 * under `$or` — conform recurses over `$or` (conform.ts:438-457) and each leaf
 * builds its own containment. A single-locator value stays ONE leaf.
 *
 * THIRD VERIFIED FACT — jsonb containment is TYPE-STRICT. `{"section_id": 1}`
 * does NOT match the stored `{"section_id": "1"}` (same probe: numeric id → no
 * rows). The old verbatim-pass law this fact used to justify is REPEALED
 * (WC-2026-08-10-section-id-int-canonical): builder_relation now probes BOTH
 * typed forms of every locator's section_id, so type-strictness can no longer
 * lose rows whatever form the seed stored. The compiler therefore emits the
 * CANONICAL form (canonicalizeStoredSectionId: '7'→7; a non-convertible
 * external remote id like '001338683' stays verbatim — the stored form is the
 * only form that exists for it).
 *
 * FOURTH VERIFIED FACT — the emitted q must carry only the fields identity
 * compares on. `@>` object containment is key-SUBSET, so extra fields only
 * narrow: shipping the stored `from_component_tipo`/`type` would demand the
 * candidate link the record through the same component slot, which is a
 * different question from "does it link the same record". The leaf's `path`
 * already scopes the component. So q carries `section_tipo` + `section_id` only
 * (`id` is stripped by the reader and by normalizeRelationQ:46 anyway).
 */

import { canonicalizeStoredSectionId } from '../concepts/section_id.ts';
import type { SqoFilterLeaf, SqoFilterNode } from '../concepts/sqo.ts';
import type { Criterion, CriterionPathStep, CriterionValue, ValueLocator } from './types.ts';

/** Seconds in one virtual Dédalo year (dd_date's 372-day calendar, 31×12). */
// Exported: the proposal engine labels date proposals in the same calendar.
// A second copy of this constant is a second calendar waiting to drift.
export const SECONDS_PER_VIRTUAL_YEAR = 372 * 24 * 60 * 60;

/** What a criterion compiles to: one leaf, or a boolean node over leaves. */
export type CriterionFilter = SqoFilterLeaf | SqoFilterNode;

/**
 * The criterion's path as an SQO `path`, projected to the two fields conform
 * reads (a defensive copy — a compiled filter must never alias the profile
 * record's own arrays, which a caller may still be editing).
 */
function sqoPath(
	path: readonly CriterionPathStep[],
): { section_tipo: string; component_tipo: string }[] {
	return path.map((step) => ({
		section_tipo: step.section_tipo,
		component_tipo: step.component_tipo,
	}));
}

/** Fold alternatives: none → null, one → the leaf itself, many → `$or`. */
function anyOf(items: CriterionFilter[]): CriterionFilter | null {
	if (items.length === 0) return null;
	if (items.length === 1) return items[0] as CriterionFilter;
	return { $or: items } as SqoFilterNode;
}

/**
 * Render a number as a plain decimal literal. `search/builders/builder_number.ts`
 * coerceNumeric (:24-28) accepts `-?\d+(\.\d+)?` and silently turns ANYTHING
 * else into '0' — so an exponent-formatted bound ('1e-7') would compile into a
 * bound of zero. Null when the value cannot be written plainly.
 */
function toNumericLiteral(value: number): string | null {
	if (!Number.isFinite(value)) return null;
	const plain = String(value);
	if (/^-?\d+(\.\d+)?$/.test(plain)) return plain;
	const fixed = value.toFixed(10).replace(/0+$/, '').replace(/\.$/, '');
	return /^-?\d+(\.\d+)?$/.test(fixed) ? fixed : null;
}

/** Virtual-calendar seconds → the whole year they fall in (floor, negatives included). */
function secondsToYear(seconds: number): number {
	return Math.floor(seconds / SECONDS_PER_VIRTUAL_YEAR);
}

/**
 * One relation leaf: ONE locator's containment at the criterion path. Only the
 * identity fields travel (see the module doc's fourth verified fact), and
 * `section_id` travels in CANONICAL form (WC-2026-08-10: int for a record
 * address, verbatim for an external remote id) — recall does not depend on it,
 * because builder_relation probes both typed forms of whatever we emit.
 */
function locatorLeaf(locator: ValueLocator, path: CriterionPathStep[]): SqoFilterLeaf {
	return {
		q: [
			{
				section_tipo: locator.section_tipo,
				section_id: canonicalizeStoredSectionId(locator.section_id) as number | string,
			},
		],
		path: sqoPath(path),
	};
}

/**
 * Compile ONE criterion + the seed's value at its path into the SQO filter that
 * finds other records agreeing on it.
 *
 * Returns null when the criterion cannot be expressed as a filter: an
 * `image_similarity` criterion (routed to the vector store by the caller, never
 * SQL), or a value whose kind does not match the mode (a `numeric_tolerance`
 * criterion pointed at a text component — a profile authoring error the caller
 * should surface, not a query).
 */
export function criterionToSqoLeaf(criterion: Criterion, value: CriterionValue): object | null {
	const path = criterion.path;
	if (path.length === 0) return null;

	switch (criterion.mode) {
		// ── the strictest relation test: the same linked record ────────────────
		case 'same_locator': {
			if (value.kind !== 'locators') return null;
			return anyOf(value.locators.map((locator) => locatorLeaf(locator, path)));
		}

		// ── same term, or (one day) a descendant of it ─────────────────────────
		case 'same_term': {
			if (value.kind !== 'locators') return null;
			// TODAY this is byte-identical to same_locator: exact term containment.
			//
			// HIERARCHY SEAM (deliberately UNWIRED). The descendant half —
			// "matching Spain must also match Madrid" — is the `relation_search`
			// column, and the machinery for it exists:
			// `builders/builder_relation.ts` buildRelationSearchAncestorFragment
			// (:93-105) emits `(relation contains q) OR (relation_search contains
			// q)`. It is NOT wired into the live conform dispatch, on purpose (see
			// its own header: PHP's add_relation_search wrap is live-defective, and
			// the relations registry deliberately withholds it). There is therefore
			// NO SQO leaf shape this compiler can emit today that reaches it — a
			// `format` or `column` field would be inventing a second query language,
			// which this subsystem does not get to do.
			//
			// TO WIRE IT: register the ancestor builder for the relation family in
			// relations/registry.ts's search face, then split this case to emit the
			// same leaves with whatever flag that dispatch keys on. Until then the
			// mode is honestly narrower than its name, and the caller must not
			// assume descendant recall.
			return anyOf(value.locators.map((locator) => locatorLeaf(locator, path)));
		}

		// ── text equality after normalization ──────────────────────────────────
		case 'normalized_text': {
			if (value.kind !== 'text') return null;
			// '==' is the string builder's EQUALITY shape
			// (builders/builder_string.ts:208-216): `f_unaccent(elem->>'value') =
			// f_unaccent(q)`. Accent-insensitive — f_unaccent is
			// `unaccent(unaccent, $1)` (db/db_pg_definitions.json f_unaccent), which
			// folds accents only.
			//
			// HONEST NARROWING: it is NOT case-insensitive. The builder's
			// case-insensitive matcher is the regex operator `~*`, and `~*` appears
			// only on its CONTAINS / begins / ends shapes (:186-205, :260-291) —
			// there is no anchored case-insensitive equality leaf in the whole
			// string builder, so no existing leaf expresses both halves of
			// "case/accent-insensitive equality" at once. We emit the equality shape
			// rather than inventing a regex-anchored q (`*^…$*` survives the wildcard
			// branch but that branch strips every `*` and `'` from q, so escaped
			// metacharacters and apostrophes corrupt silently). Closing this needs a
			// one-line builder change (`=` → a lower()-folded compare, or a new
			// operator) plus its WIRE_CONTRACT entry — not a shape hack here.
			const leaves = value.values
				.filter((text) => text !== '')
				.map((text) => ({ q: text, q_operator: '==', path: sqoPath(path) }) as SqoFilterLeaf);
			return anyOf(leaves);
		}

		// ── numbers within `tolerance` ─────────────────────────────────────────
		case 'numeric_tolerance': {
			if (value.kind !== 'number') return null;
			const tolerance = Math.abs(criterion.tolerance ?? 0);
			const leaves: CriterionFilter[] = [];
			for (const number of value.values) {
				// The number builder's BETWEEN lives inside q as '<low>...<high>'
				// (builders/builder_number.ts:57-66) — there is no q_operator for it.
				const low = toNumericLiteral(number - tolerance);
				const high = toNumericLiteral(number + tolerance);
				if (low === null || high === null) continue;
				leaves.push({ q: `${low}...${high}`, path: sqoPath(path) } as SqoFilterLeaf);
			}
			return anyOf(leaves);
		}

		// ── date ranges, widened by `tolerance` YEARS ──────────────────────────
		case 'date_overlap': {
			if (value.kind !== 'date') return null;
			const toleranceYears = Math.trunc(Math.abs(criterion.tolerance ?? 0));
			const leaves: CriterionFilter[] = [];
			for (const range of value.ranges) {
				// The ordinary-table date builder compares ONE jsonpath predicate,
				// `@.start.time <op> t`, where t is derived from a Y[/M/D] q
				// (builders/builder_date.ts:304-314) — so a window is TWO leaves, and
				// its granularity is the YEAR (which is also what `tolerance` is
				// measured in). Object q keeps negative years intact; the plain-text
				// branch would read a leading '-' as an operator.
				//
				// HONEST NARROWING: this is "the candidate's START falls inside the
				// seed's window", not true interval overlap — the builder has no
				// handle on `end.time` (its range/period date_mode handlers are
				// unported, ledgered in the builder's own header). A candidate whose
				// span brackets the seed but starts earlier is missed. Widening
				// `tolerance` is the curator's lever until those handlers land.
				const fromYear = secondsToYear(range.from) - toleranceYears;
				const throughYear = secondsToYear(range.to) + toleranceYears;
				leaves.push({
					$and: [
						{ q: { start: { year: fromYear } }, q_operator: '>=', path: sqoPath(path) },
						// '<' the year AFTER the last one, so the whole upper year is inside.
						{ q: { start: { year: throughYear + 1 } }, q_operator: '<', path: sqoPath(path) },
					],
				} as SqoFilterNode);
			}
			return anyOf(leaves);
		}

		// ── not an SQL question at all ─────────────────────────────────────────
		case 'image_similarity':
			// Visual similarity lives in the vector index; the caller routes this
			// criterion there and intersects the result with the SQO candidate pool.
			return null;

		default:
			return null;
	}
}

/**
 * The CANDIDATE-POOL query: the `$and` of every REQUIRED criterion the seed
 * actually holds a value for.
 *
 * Required criteria gate ("a candidate missing this criterion is not a match AT
 * ALL"); the rest only rank, so they never enter this filter. `ignored`
 * criteria are skipped whatever their `required` flag says — the role is the
 * curator's on/off switch and it wins.
 *
 * A required criterion the SEED has no value for is SKIPPED, not turned into an
 * impossible filter: the seed being incomplete is not evidence about candidates,
 * and an empty pool would silently look like "nothing matches". Callers that
 * need to know report it from `values` (a null entry is a visible gap) — the
 * same reason CriterionOutcome.agreed has a null state.
 *
 * Returns null when nothing compiled: there is no candidate-pool constraint, and
 * the caller must decide whether that means "score the whole section" or "refuse
 * to run". Never an empty `$and` — conform would read that as a true-for-all
 * group and hide the distinction.
 */
export function criteriaToFilter(
	criteria: readonly Criterion[],
	values: ReadonlyMap<string, CriterionValue | null>,
): SqoFilterNode | null {
	const items: CriterionFilter[] = [];
	for (const criterion of criteria) {
		if (!criterion.required || criterion.role === 'ignored') continue;
		const value = values.get(criterion.id);
		if (value === undefined || value === null) continue;
		const compiled = criterionToSqoLeaf(criterion, value);
		if (compiled === null) continue;
		items.push(compiled as CriterionFilter);
	}
	return items.length === 0 ? null : { $and: items };
}
