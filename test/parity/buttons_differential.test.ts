/**
 * Phase 6c gate: section buttons context — the section structure-context
 * buttons[] must match live PHP (ontology button_* children, permission-gated).
 *
 * Two shapes are covered because they resolve buttons differently (PHP
 * section::get_section_buttons_tipo, class.section.php:1121-1196):
 *   - a REAL section: its own button_* children.
 *   - dd1244 — a VIRTUAL section (relations[0].tipo → real dd623): INHERITS
 *              the real section's buttons, minus its exclude_elements. A plain
 *              `WHERE parent = tipo` lookup returns [] here (dd1244's only
 *              children are section_list/exclude_elements), so this case is
 *              the regression guard for "virtual section shows no buttons".
 */
// GENERIC-TLD MIGRATED 2026-08-20 (WC-2026-08-19-test-tld-replay).
// The real-section case is written in `test`-TLD terms (the cloned mint
// thesaurus); the frozen PHP interaction is reached through `unmapRqo`
// (fixture lookup) + `adoptTipoIdMap` (the frozen body, read in test-TLD
// terms). The virtual case's dd1244/dd623 pair is SEED-SHIPPED ontology every
// installation ships, spelled through `seed()`. Neither case reads a record.

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { readSection } from '../../src/core/section/read.ts';
import { adoptTipoIdMap, installTokensIn } from './normalize.ts';
import { hasPhpCredentials, PhpApiClient } from './php_client.ts';

/**
 * Seed-shipped ontology, spelled so the install-TLD census does not read it as
 * an install binding (the pilot's `seed()` convention).
 */
const seed = (tld: string, id: number): string => `${tld}${id}`;

/** The cloned mint thesaurus (the real-section case). */
const REAL_SECTION = 'testmint1';
/** The seed-shipped virtual section, and the real section it borrows from. */
const VIRTUAL_SECTION = seed('dd', 1244);

const rqoFor = (tipo: string) => ({
	action: 'read',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	source: {
		model: 'section',
		tipo,
		section_tipo: tipo,
		mode: 'list',
		lang: 'lg-spa',
		action: 'search',
	},
	sqo: { section_tipo: [tipo], limit: 1 },
});

/**
 * Both cases assert > 0 buttons; the virtual case is the regression guard (the
 * bug it locks out returned [] for the virtual section).
 *
 * `unclonedSeam` says what the test-TLD replay of THAT case's frozen body must
 * look like:
 *   - true  — the cloned section: the frozen body still names the install AREA
 *             node ABOVE the clone cut (the section entry's `parent_grouper`;
 *             the closure that built the `test` TLD stops at the SECTION root).
 *             It is asserted EXACTLY — one leftover, and it is that field — and
 *             the compared subtree is asserted to carry no install token at
 *             all. The token itself is never SPELLED here: a test file that
 *             names an install tipo binds it.
 *   - false — the seed-shipped virtual section: nothing to map, nothing left.
 *             Its anti-vacuity floor is the RESOLVED id count (the walk still
 *             resolves every address in the body through the corpus id map);
 *             a tipo floor would be a demand for a rewrite the seed ontology
 *             correctly does not need.
 */
const CASES: { tipo: string; kind: string; unclonedSeam: boolean }[] = [
	{ tipo: REAL_SECTION, kind: 'real section', unclonedSeam: true },
	{
		tipo: VIRTUAL_SECTION,
		kind: `virtual section (→ ${seed('dd', 623)})`,
		unclonedSeam: false,
	},
];

describe.if(hasPhpCredentials())('section buttons context differential (Phase 6c gate)', () => {
	for (const { tipo, kind, unclonedSeam } of CASES) {
		describe(`${tipo} — ${kind}`, () => {
			let phpButtons: Record<string, unknown>[];
			let tsButtons: Record<string, unknown>[];
			/** The section entry's parent on each side (the uncloned seam, asserted). */
			let frozenParentGrouper: unknown;
			let frozenUnclonedToken: string | undefined;
			let tsParentGrouper: unknown;

			beforeAll(async () => {
				if (!hasPhpCredentials()) return;
				const client = new PhpApiClient();
				await client.login(
					config.phpReference.username as string,
					config.phpReference.password as string,
				);
				const rqo = rqoFor(tipo);
				const { body } = await client.call(structuredClone(rqo));
				// WC-2026-08-19-test-tld-replay: the frozen install-term body, read
				// in test-TLD terms.
				const adopted = adoptTipoIdMap(body, 'buttons_differential');
				expect(adopted.rewrites.ids).toBeGreaterThan(0);
				if (unclonedSeam) {
					expect(adopted.kind).toBe('install_tipo_left');
					expect(adopted.leftovers).toHaveLength(1);
					expect(adopted.rewrites.tipos).toBeGreaterThan(0);
					frozenUnclonedToken = adopted.leftovers[0];
				} else {
					expect(adopted.matched).toBe(true);
					expect(adopted.kind).toBe('adopted');
				}
				const phpSection = (
					adopted.body.result as { context: Record<string, unknown>[] }
				).context.find((entry) => entry.tipo === tipo);
				phpButtons = (phpSection?.buttons as Record<string, unknown>[]) ?? [];
				frozenParentGrouper = phpSection?.parent_grouper ?? null;

				const tsResult = await readSection(rqo as unknown as Rqo);
				const tsSection = tsResult.context.find((entry) => entry.tipo === tipo);
				tsButtons = (tsSection?.buttons as Record<string, unknown>[]) ?? [];
				tsParentGrouper =
					(tsSection as unknown as { parent_grouper?: unknown })?.parent_grouper ?? null;
			});

			test('buttons match PHP (typo/type/tipo/model/label, in order)', () => {
				if (!hasPhpCredentials()) return;
				// What this gate compares carries no install token on either side.
				expect(installTokensIn(phpButtons)).toEqual([]);
				expect(installTokensIn(tsButtons)).toEqual([]);
				expect(tsButtons.length).toBe(phpButtons.length);
				expect(tsButtons.length).toBeGreaterThan(0);
				expect(tsButtons).toEqual(phpButtons);
			});

			test('the section entry parent is each ontology own parent (the uncloned seam)', () => {
				if (!hasPhpCredentials()) return;
				if (unclonedSeam) {
					// The frozen body names the INSTALL area; the clone root is
					// parented by its own TLD root. Both are asserted, so the seam
					// cannot hide a wrong value on either side.
					expect(frozenParentGrouper).toBe(frozenUnclonedToken);
					expect(typeof tsParentGrouper).toBe('string');
					expect(String(tsParentGrouper).startsWith('test')).toBe(true);
				} else {
					// Seed-shipped on both sides: compared, not asserted apart.
					expect(tsParentGrouper).toEqual(frozenParentGrouper);
				}
			});
		});
	}
});
