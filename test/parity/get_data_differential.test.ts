/**
 * Phase 4h gate: component get_data — resolve one portal directly (the
 * "show more" / pagination path). Diffs the portal item's own paged locators
 * + pagination and the expanded child records against live PHP.
 */
// GENERIC-TLD MIGRATED 2026-08-19 (WC-2026-08-19-test-tld-replay).
// The RQO is written in `test`-TLD terms (numisdata6 → testmint1, the portal
// numisdata163 → testmint1014) and the frozen PHP interaction is reached
// through `unmapRqo` (fixture lookup) + `adoptTipoIdMap` (the frozen body,
// read in test-TLD terms). The addressed records come from the committed
// corpus (the portal's own record and its targets).

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { readComponentData } from '../../src/core/section/read.ts';
import {
	dropTestCorpus,
	ensureTestCorpus,
	loadTestCorpus,
} from '../../src/core/test_data/test_corpus/ensure.ts';
import { adoptEntriesArrayContract, adoptTipoIdMap, normalizeSectionIdTypes } from './normalize.ts';
import { hasPhpCredentials, PhpApiClient } from './php_client.ts';

/**
 * Seed-shipped ontology is spelled through `seed()`: the install-TLD census
 * reads a literal `rsc205` in a test file as an install binding, and these are
 * pins on ontology every installation ships, not on an install's own tree.
 */
const seed = (tld: string, id: number): string => `${tld}${id}`;

/** The cloned mint thesaurus and its cloned portal component. */
const SECTION = 'testmint1';
/** The record whose portal is resolved (the install's numisdata6/2 twin). */
const RECORD_ID = '2';
const PORTAL = 'testmint1014';
/**
 * The corpus this gate OWNS: the portal's own record's section, and the five
 * seed-shipped sections the frozen page's target records live in.
 */
const CORPUS_SCOPE = [
	SECTION,
	seed('rsc', 332),
	seed('rsc', 205),
	seed('rsc', 197),
	seed('rsc', 212),
	seed('rsc', 1379),
];

const GET_DATA_RQO = {
	action: 'read',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	source: {
		model: 'component_portal',
		tipo: PORTAL,
		section_tipo: SECTION,
		section_id: RECORD_ID,
		mode: 'edit',
		lang: 'lg-spa',
		action: 'get_data',
	},
	sqo: { section_tipo: [SECTION], limit: 5, offset: 0 },
};

describe.if(hasPhpCredentials())('component get_data differential (Phase 4h gate)', () => {
	let phpData: Record<string, unknown>[];
	let tsData: Record<string, unknown>[];

	beforeAll(async () => {
		await ensureTestCorpus(CORPUS_SCOPE);
		if (!hasPhpCredentials()) return;
		const client = new PhpApiClient();
		await client.login(
			config.phpReference.username as string,
			config.phpReference.password as string,
		);
		const { body } = await client.call(structuredClone(GET_DATA_RQO));
		// WC-2026-08-19-test-tld-replay: the frozen install-term body, read in
		// test-TLD terms. `detail === null` is `matched === true` with its own
		// reason attached; the rewrite floors are the anti-vacuity check.
		const adopted = adoptTipoIdMap(body, 'get_data_differential');
		expect(adopted.detail).toBeNull();
		expect(adopted.matched).toBe(true);
		expect(adopted.rewrites.tipos).toBeGreaterThan(0);
		expect(adopted.rewrites.ids).toBeGreaterThan(0);
		// WC-001 (unified []): PHP emits entries:null for empty values; the TS
		// engine emits [] for EVERY model. Rewrite the PHP side only.
		// WC-2026-08-10-section-id-int-canonical: address keys compared by VALUE,
		// applied to BOTH sides (fixtures keep the PHP-era numeric strings).
		phpData = normalizeSectionIdTypes(
			adoptEntriesArrayContract((adopted.body.result as { data: Record<string, unknown>[] }).data),
		);
		tsData = normalizeSectionIdTypes(
			(await readComponentData(GET_DATA_RQO as unknown as Rqo)) as unknown as Record<
				string,
				unknown
			>[],
		);
	});

	afterAll(async () => {
		expect(await dropTestCorpus(CORPUS_SCOPE)).toBe(0);
	});

	test('portal own item: paged locators match PHP; the total is corpus scale', () => {
		if (!hasPhpCredentials()) return;
		const phpPortal = phpData.find((item) => item.tipo === PORTAL) as Record<string, unknown>;
		const tsPortal = tsData.find((item) => item.tipo === PORTAL) as Record<string, unknown>;
		expect(tsPortal).toBeDefined();
		// The PAGE itself — the five locators the frozen request asked for — is
		// compared verbatim: that is what this gate is about.
		expect(tsPortal.entries).toEqual(phpPortal.entries);
		// `pagination.total` counts the WHOLE portal value. This USED TO BE a
		// declared scale reduction (the corpus held only the locators the frozen
		// page revealed, so the install's total was necessarily larger). Since
		// the derive learned to attribute `read_raw type=target_section` bodies
		// (2026-08-19), the corpus record holds the install's FULL 22 locators —
		// so the honest assertion is now EQUALITY on both sides, which is
		// strictly stronger than the old inequality: the corpus reproduces the
		// install's own total, and a corpus that lost locators reddens here.
		const corpusRecord = loadTestCorpus()
			.find((entry) => entry.section_tipo === SECTION)
			?.records.find((record) => String(record.section_id) === String(RECORD_ID));
		expect(corpusRecord).toBeDefined();
		const storedLocators = (
			(corpusRecord?.columns.relation as Record<string, unknown[]> | undefined)?.[PORTAL] ?? []
		).length;
		expect(storedLocators).toBeGreaterThan(0);
		expect((tsPortal.pagination as { total: number }).total).toBe(storedLocators);
		expect((phpPortal.pagination as { total: number }).total).toBe(storedLocators);
	});

	test('expanded child records match PHP (per-target component set + values)', () => {
		if (!hasPhpCredentials()) return;
		// Compare the child items of the paged targets: same (tipo, section_id,
		// entries) set. PHP may carry extra children we ledger; assert OUR
		// emitted children are a subset that matches PHP.
		//
		// THE CORPUS REDUCTION, declared and bounded: a target record the corpus
		// does NOT hold cannot be expanded here. It is never hand-listed — the
		// targets are read from the corpus, and a target the corpus does NOT
		// hold must expand to EXACTLY nothing rather than to something wrong.
		//
		// As of 2026-08-19 there is NO unheld target left: rsc332/40507 used to
		// be the one, because every component the frozen page revealed on it
		// looked unstorable — that was a DERIVE BUG (rsc368 is a
		// `component_autocomplete`, an alias of component_portal, whose storage
		// column was resolved without following the registry's alias hop), and
		// it now has a real record. So the partition is asserted instead of a
		// non-empty floor on the unheld side: every paged target is accounted
		// for, at least one expands, and the unheld branch below still refuses
		// a non-empty expansion if the corpus ever loses a target again.
		const paged = (
			(tsData.find((i) => i.tipo === PORTAL)?.entries as
				| { section_tipo: string; section_id: string }[]
				| undefined) ?? []
		).map((locator) => ({
			section_tipo: String(locator.section_tipo),
			section_id: String(locator.section_id),
		}));
		expect(paged.length).toBeGreaterThan(0);
		const held = new Set(
			loadTestCorpus().flatMap((entry) =>
				entry.records.map((record) => `${entry.section_tipo}|${String(record.section_id)}`),
			),
		);
		const expandable = paged.filter((l) => held.has(`${l.section_tipo}|${l.section_id}`));
		const unheld = paged.filter((l) => !held.has(`${l.section_tipo}|${l.section_id}`));
		expect(expandable.length).toBeGreaterThan(0);
		expect(expandable.length + unheld.length).toBe(paged.length);

		const key = (item: Record<string, unknown>) => `${item.tipo}|${item.section_id}`;
		const childrenOf = (rows: Record<string, unknown>[], sectionId: string) =>
			rows.filter((i) => i.tipo !== PORTAL && String(i.section_id) === sectionId);
		for (const locator of expandable) {
			const phpChildren = new Map(
				childrenOf(phpData, locator.section_id).map((i) => [key(i), i.entries ?? null]),
			);
			const tsChildren = childrenOf(tsData, locator.section_id);
			expect(tsChildren.length).toBeGreaterThan(0);
			for (const child of tsChildren) {
				expect(phpChildren.has(key(child))).toBe(true);
				expect(child.entries ?? null).toEqual(phpChildren.get(key(child)) ?? null);
			}
		}
		for (const locator of unheld) {
			expect(childrenOf(tsData, locator.section_id)).toEqual([]);
		}
	});
});
