/**
 * POLARITY-AWARE DUAL CONTAINMENT PROBES — the search-side half of the
 * section_id int unification (WC-2026-08-10-section-id-int-canonical).
 *
 * jsonb `@>` containment is TYPE-STRICT: `{"section_id":7}` does not match a
 * stored `{"section_id":"7"}`. During the expand window (int-canonical writers
 * live, data not yet swept — and permanently for old-backup restores until
 * contraction) both forms coexist IN THE SAME COLUMN, possibly in the same
 * array. Every containment probe over locator data must therefore try both
 * typed forms of `section_id`.
 *
 * TWO LAWS this module enforces:
 *
 * 1. PER-ELEMENT DECOMPOSITION. `col @> '{"t":[A,B]}'` requires EVERY element
 *    contained — but a half-migrated row can hold A as a string locator and B
 *    as an int locator, so neither an all-string nor an all-int whole-array
 *    probe matches. The correct tolerant form decomposes per element:
 *        (col @> {t:[A_str]} OR col @> {t:[A_int]})
 *    AND (col @> {t:[B_str]} OR col @> {t:[B_int]})
 *    which is semantically identical to the whole-array probe on
 *    uniformly-typed data and correct on mixed data.
 *
 * 2. POLARITY. Negated operators ('!=', '!==') must NOT wrap the OR pair in a
 *    single NOT — `NOT (a OR b)` is `NOT a AND NOT b` per VARIANT, but the
 *    caller-visible semantic is "does not contain the locator IN EITHER
 *    FORM". For a multi-element q, "does not contain all of q" is the De
 *    Morgan dual of law 1:
 *        (NOT contains-A-any-form) OR (NOT contains-B-any-form)
 *    where contains-X-any-form is the OR pair. Getting this wrong makes a
 *    negated relation search wrongly match rows that DO contain the relation
 *    in the other typed form.
 *
 * Gate: test/unit/search_containment_dual_probe.test.ts (SQL-executing, both
 * polarities, mixed-typed fixture data).
 *
 * External-service locators (leading-zero / opaque remote ids) are NOT
 * convertible under the shared rule and get a single verbatim variant — the
 * stored form is the only form that exists for them.
 */

import { isConvertibleSectionIdString } from '../concepts/section_id.ts';

/**
 * The typed variants of ONE locator: the locator as given plus (when its
 * section_id converts under the shared rule) the twin with section_id in the
 * OTHER type. Non-convertible ids (external refs, tokens, absent key) yield
 * the single verbatim variant.
 */
export function sectionIdTypeVariants(locator: Record<string, unknown>): Record<string, unknown>[] {
	const raw = locator.section_id;
	if (typeof raw === 'number' && Number.isSafeInteger(raw)) {
		return [locator, { ...locator, section_id: String(raw) }];
	}
	if (typeof raw === 'string' && isConvertibleSectionIdString(raw)) {
		return [locator, { ...locator, section_id: Number(raw) }];
	}
	return [locator];
}

/** JSON text of each typed variant (stable input order: as-given first). */
export function locatorJsonVariants(locator: Record<string, unknown>): string[] {
	return sectionIdTypeVariants(locator).map((variant) => JSON.stringify(variant));
}

/**
 * Per-element probe groups for a relation-column q: one group per locator,
 * each group holding the `{"<tipo>":[<locator json>]}` payload of every typed
 * variant. The compose helpers below turn groups into SQL of either polarity.
 */
export function relationProbeGroups(
	tipo: string,
	locators: readonly Record<string, unknown>[],
): string[][] {
	return locators.map((locator) =>
		locatorJsonVariants(locator).map(
			(json) => `{"${JSON.stringify(tipo).slice(1, -1)}":[${json}]}`,
		),
	);
}

/**
 * POSITIVE containment over probe groups (law 1):
 * AND over groups of (OR over `col @> <bound payload>::text::jsonb`).
 * `bind` maps a payload string to its SQL placeholder (params collector or
 * fragment token — both callers bind, never inline).
 */
export function composeContains(
	columnRef: string,
	groups: readonly (readonly string[])[],
	bind: (payload: string) => string,
): string {
	const groupSql = groups.map((variants) => {
		const ors = variants.map((payload) => `${columnRef} @> ${bind(payload)}::text::jsonb`);
		return ors.length === 1 ? ors[0] : `(${ors.join(' OR ')})`;
	});
	return groupSql.length === 1 ? (groupSql[0] as string) : `(${groupSql.join(' AND ')})`;
}

/**
 * NEGATED containment over probe groups (law 2, De Morgan of composeContains):
 * OR over groups of (AND over `NOT (col @> …)`).
 */
export function composeNotContains(
	columnRef: string,
	groups: readonly (readonly string[])[],
	bind: (payload: string) => string,
): string {
	const groupSql = groups.map((variants) => {
		const nots = variants.map((payload) => `NOT (${columnRef} @> ${bind(payload)}::text::jsonb)`);
		return nots.length === 1 ? nots[0] : `(${nots.join(' AND ')})`;
	});
	return groupSql.length === 1 ? (groupSql[0] as string) : `(${groupSql.join(' OR ')})`;
}
