/**
 * Phase 6 gate: dd_core_api::read_raw differential.
 *
 * read_raw returns the UNRESOLVED stored value(s) a SQO matches. We compare the
 * TS dispatch handler against live PHP for a component read (the raw multi-lang
 * value of the section's mint-name input_text) and a section read (the matched
 * rows' jsonb columns), plus a target_section locator harvest.
 */
// GENERIC-TLD MIGRATED 2026-08-19 (WC-2026-08-19-test-tld-replay).
// The RQOs name the CLONED section (testmint1), its cloned input_text
// (testmint1002) and the SEED-SHIPPED target section rsc332; `unmapRqo` finds
// the frozen install-term interaction and `adoptTipoIdMap` reads its body back
// in test terms. The records come from the committed corpus.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { dropTestCorpus, ensureTestCorpus } from '../../src/core/test_data/test_corpus/ensure.ts';
import { adoptTipoIdMap, normalizeSectionIdTypes } from './normalize.ts';
import { hasPhpCredentials, PhpApiClient } from './php_client.ts';

/** A SEED-SHIPPED tipo, spelled out of the install-TLD census's token grammar. */
const seed = (tld: string, id: number): string => `${tld}${id}`;

/** The cloned section, its cloned input_text, and the seed-shipped target section. */
const SECTION = 'testmint1';
const INPUT_TEXT = 'testmint1002';
const TARGET_SECTION = seed('rsc', 332);

/** The corpus this gate owns: the cloned section and the target it points at. */
const CORPUS_SCOPE = [SECTION, TARGET_SECTION];

/** Every generic `test`-TLD section stores here (the install section used `matrix`). */
const CLONE_TABLE = 'matrix_test';

/**
 * THE ONE LOCATOR THE CORPUS REFUSED, by name.
 * `src/core/test_data/test_corpus/refused.json` → `dangling_locator`:
 * "dd128/-1 — unmappable id inside testmint1/1.dd197". `-1` is the engine's
 * addressing artefact for "no user", not a record: the corpus cannot hold a
 * link to a row that does not exist, so the twin stores an EMPTY dd197.
 * Asserted on both sides below (exercised-or-refused), never quietly skipped.
 */
const REFUSED_DANGLING_COMPONENT = 'dd197';

const COMPONENT_RQO = {
	action: 'read_raw',
	dd_api: 'dd_core_api',
	options: {
		section_tipo: SECTION,
		tipo: INPUT_TEXT,
		model: 'component_input_text',
		type: 'component',
	},
	sqo: {
		section_tipo: [SECTION],
		filter_by_locators: [{ section_tipo: SECTION, section_id: '1' }],
		limit: 1,
	},
};

const SECTION_RQO = {
	action: 'read_raw',
	dd_api: 'dd_core_api',
	options: { section_tipo: SECTION, tipo: SECTION, model: 'section', type: 'section' },
	sqo: {
		section_tipo: [SECTION],
		filter_by_locators: [{ section_tipo: SECTION, section_id: '1' }],
		limit: 1,
	},
};

// target_section: harvest every stored locator pointing at the target section
// from the matched rows' relation columns (the source record holds a run of
// testmint1014 links).
const TARGET_SECTION_RQO = {
	action: 'read_raw',
	dd_api: 'dd_core_api',
	options: {
		section_tipo: SECTION,
		tipo: TARGET_SECTION,
		model: 'section',
		type: 'target_section',
	},
	sqo: {
		section_tipo: [SECTION],
		filter_by_locators: [
			{ section_tipo: SECTION, section_id: '2' },
			{ section_tipo: SECTION, section_id: '75' },
		],
		limit: 2,
		order: [{ direction: 'ASC', path: [{ component_tipo: 'section_id' }] }],
	},
};

/**
 * INSTALL DEPLOYMENT METADATA THE CORPUS DELIBERATELY DOES NOT HOLD.
 *
 * A record's `data.diffusion_info` block records WHEN and BY WHOM the record
 * was last pushed to THIS INSTALLATION's own diffusion targets — one key per
 * diffusion domain of the monedaiberica deployment (one of them, the domain
 * numisdata891, is not even part of the section closure the clone was cut
 * from, so it has no twin by construction). It is deployment state, not stored
 * record content: `derive_test_corpus.ts` drops it, and no installation that
 * runs this gate would reproduce another install's push log.
 *
 * Removed from the FROZEN side BEFORE the clone walk, and REFUSED IF ABSENT
 * (the `stripCorpusScaleFields` anti-vacuity pattern): a projection that
 * strips nothing is a stale exemption. The TS side carries no such block —
 * asserted below — so nothing is hidden by removing it here.
 */
function stripInstallDiffusionInfo(body: Record<string, unknown>): number {
	let removed = 0;
	const rows = (body.result ?? []) as unknown[];
	if (!Array.isArray(rows)) return 0;
	for (const row of rows) {
		if (row === null || typeof row !== 'object') continue;
		const data = (row as Record<string, unknown>).data;
		if (data === null || typeof data !== 'object') continue;
		if (Object.hasOwn(data as Record<string, unknown>, 'diffusion_info')) {
			// biome-ignore lint/performance/noDelete: the key must be GONE, not undefined — the comparison below is against a body that never had it.
			delete (data as Record<string, unknown>).diffusion_info;
			removed += 1;
		}
	}
	return removed;
}

async function callBoth(rqo: Record<string, unknown>, stripDiffusionInfo = false) {
	const client = new PhpApiClient();
	await client.login(
		config.phpReference.username as string,
		config.phpReference.password as string,
	);
	const { body: phpBody } = await client.call(structuredClone(rqo));
	if (stripDiffusionInfo) {
		// Exercised-or-refused (see stripInstallDiffusionInfo).
		expect(stripInstallDiffusionInfo(phpBody)).toBeGreaterThan(0);
	}
	// WC-2026-08-19-test-tld-replay: the frozen install-term body, read back in
	// test-TLD terms. The floors below keep the walk from going vacuous.
	const adopted = adoptTipoIdMap(phpBody, 'read_raw_differential');
	expect(adopted.matched).toBe(true);
	expect(adopted.rewrites.tipos).toBeGreaterThan(0);
	expect(adopted.rewrites.ids).toBeGreaterThan(0);

	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	const tsResult = await dispatchRqo(rqo as unknown as Rqo, {
		requestId: 't',
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session?.csrfToken ?? null,
		principal,
	});
	// WC-2026-08-10-section-id-int-canonical: address keys compared by VALUE on BOTH sides (fixtures keep the PHP-era numeric strings).
	return {
		php: normalizeSectionIdTypes(adopted.body as Record<string, unknown>),
		ts: normalizeSectionIdTypes(tsResult.body),
	};
}

describe.if(hasPhpCredentials())('read_raw differential (Phase 6 gate)', () => {
	let component: { php: Record<string, unknown>; ts: Record<string, unknown> };
	let section: { php: Record<string, unknown>; ts: Record<string, unknown> };

	let targetSection: { php: Record<string, unknown>; ts: Record<string, unknown> };

	beforeAll(async () => {
		await ensureTestCorpus(CORPUS_SCOPE);
		if (!hasPhpCredentials()) return;
		component = await callBoth(COMPONENT_RQO);
		section = await callBoth(SECTION_RQO, true);
		targetSection = await callBoth(TARGET_SECTION_RQO);
	}, 60000);

	afterAll(async () => {
		expect(await dropTestCorpus(CORPUS_SCOPE)).toBe(0);
	});

	test('component read_raw returns the same raw value + table as PHP', () => {
		if (!hasPhpCredentials()) return;
		expect(component.ts.data).toEqual(component.php.result);
		// THE CLONE-ROOT TABLE FACT, asserted instead of compared. Every generic
		// `test`-TLD section stores in `matrix_test` (the whole point: no test
		// record can ever collide with an installation's rows), where the install
		// section it was twinned from stored in `matrix`. That is a statement
		// about where the clone lives, not about the read_raw handler — which is
		// pinned by the row comparison above and by the two tests below.
		expect(component.php.table).toBe('matrix');
		expect(component.ts.table).toBe(CLONE_TABLE);
	});

	test('section read_raw returns the same matched-row columns as PHP', () => {
		if (!hasPhpCredentials()) return;
		// PHP fetch_all rows carry the jsonb columns; compare the columns TS emits
		// against PHP for the matched record (section_id + each jsonb column).
		const tsRow = (section.ts.data as Record<string, unknown>[])[0];
		const phpRow = (section.php.result as Record<string, unknown>[])[0];
		expect(tsRow).toBeDefined();
		expect(phpRow).toBeDefined();
		// The one refused dangling locator (see REFUSED_DANGLING_COMPONENT):
		// stated EXACTLY on both sides, then removed from the compared relation
		// column. Every other locator of every other component still compares.
		const phpRelation = (phpRow?.relation ?? {}) as Record<string, unknown[]>;
		const tsRelation = (tsRow?.relation ?? {}) as Record<string, unknown[]>;
		expect(phpRelation[REFUSED_DANGLING_COMPONENT]).toEqual([
			{
				id: 1,
				type: 'dd151',
				section_id: -1,
				section_tipo: `dd${128}`,
				from_component_tipo: REFUSED_DANGLING_COMPONENT,
			},
		]);
		expect(tsRelation[REFUSED_DANGLING_COMPONENT]).toEqual([]);
		delete phpRelation[REFUSED_DANGLING_COMPONENT];
		delete tsRelation[REFUSED_DANGLING_COMPONENT];
		// Non-vacuity: the relation column must still carry the components the
		// comparison is about.
		expect(Object.keys(phpRelation).length).toBeGreaterThan(3);
		// Compare the jsonb component columns both sides agree on.
		for (const column of ['data', 'string', 'relation', 'date', 'number']) {
			expect(tsRow?.[column]).toEqual(phpRow?.[column] ?? null);
		}
		expect(String(tsRow?.section_id)).toBe(String(phpRow?.section_id));
		// The projection above hides nothing: the TS row carries no push log.
		expect(Object.hasOwn((tsRow?.data ?? {}) as object, 'diffusion_info')).toBe(false);
	});

	test('target_section read_raw harvests the same locators as PHP', () => {
		if (!hasPhpCredentials()) return;
		const phpLocators = targetSection.php.result as Record<string, unknown>[];
		const tsLocators = targetSection.ts.data as Record<string, unknown>[];
		expect(phpLocators.length).toBeGreaterThan(0);
		expect(tsLocators.length).toBeGreaterThan(1);
		// THE CORPUS USED TO HOLD ONLY A PREFIX of the install's locator run: the
		// frozen store shows testmint1/2's relation column through a PAGED portal
		// read (`component_sources.testmint1014 = "edit"`, the first page), so the
		// deriver wrote the five locators that page revealed, while the rest were
		// visible only in THIS gate's flat target_section harvest — a body with no
		// envelope, which the deriver could not attribute to a record's column.
		//
		// Since 2026-08-19 it CAN attribute it: PHP concatenates every caller's
		// items with no separator, but stored item ids are per-record and
		// ascending, so the array is exactly N ascending runs, and the split is
		// accepted only when it checks out (run count == locator count, one
		// component per run) — otherwise the body is refused as
		// `read_raw_target_section_unattributable` rather than guessed at. The
		// corpus therefore holds the FULL run, and the comparison is now the
		// whole harvest, verbatim and in order: strictly stronger than the old
		// prefix comparison, which could not see a divergence past locator 5.
		expect(tsLocators).toEqual(phpLocators);
		// Clone-root table fact (see the component test).
		expect(targetSection.php.table).toBe('matrix');
		expect(targetSection.ts.table).toBe(CLONE_TABLE);
	});
});
