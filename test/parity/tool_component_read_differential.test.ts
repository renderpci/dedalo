/**
 * Tool-component read gate: a component read that ships `source.properties`
 * (the client's create_source sends the instance's declared properties — TOOL
 * components carry their ddo_map entry's properties this way) must be served
 * from the OVERRIDE, not the ontology node (PHP dd_core_api read :2305-2308,
 * `$element->set_properties`). Found live 2026-07-10: the epigraphy tool's
 * coins portal (the epigraphy section_tool → tool_config ddo_map role 'coins'
 * → the coins portal)
 * declares sqo_config.limit 1 while the ontology says 9 — TS ignored the
 * override AND the configured limit, paging every tool portal at the mode
 * default 10.
 *
 * Pins (PHP wire, 2026-07-10):
 *  - page-size precedence: client sqo.limit > effective properties'
 *    show.sqo_config.limit (override 1 / ontology 9) > mode default;
 *  - the get_data context stamps the RUNTIME limit into request_config
 *    sqo.limit (sqo.offset never stamped);
 *  - the main entry's properties echo (css stripped) + top-level css follow
 *    the override.
 *
 * Known builder residuals excluded from the byte compares: PHP emits
 * request_config[].api_config:null and show.sqo_config.operator:'$or'
 * (TS omits both) — pre-existing emission traits, independent of this gate.
 */
// GENERIC-TLD MIGRATED 2026-08-19 (WC-2026-08-19-tools-gates-test-tld).
// The portal, its section and the override properties are all expressed as
// their phase-2 clones in the generic `test` TLD
// (src/core/test_data/test_tld_tipo_map.json): the RQOs are written in test-TLD
// terms, `unmapRqo` finds the frozen interactions under the install addresses
// PHP answered, and `adoptTipoIdMap` reads the bodies back in test terms. The
// RECORDS this gate pages through come from the committed test corpus, so it
// runs on any installation and holds no install data.
//
// MEASURED 2026-08-19 after the migration: 2 pass / 4 fail, all four reds with
// ONE root cause, and it is NOT a TLD binding — the committed corpus does not
// hold the media records the coins' obverse/reverse portals resolve to. The
// derive captured the nine coin records this gate pages
// (`gates:['tool_component_read_differential']` in test_corpus/test6100.json)
// but not the 18 `rsc170` rows they point at (3295, 3296, 8990, 8991, 26654,
// 26655, 32891, 32900, 35848, 35849, 36804, 36805, 136459, 136460, 149483,
// 149484, 149493, 149494), so the TS read emits no `rsc29` image item where the
// frozen data[] carries two per coin (64 items vs 46). WHAT IT NEEDS:
// `scripts/derive_test_corpus.ts` must follow this gate's portal edge one hop
// further into rsc170 and re-derive the corpus. Nothing in this file can close
// it, and no assertion was relaxed to hide it.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { type ApiRequestContext, dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { dropTestCorpus, ensureTestCorpus } from '../../src/core/test_data/test_corpus/ensure.ts';
import { adoptTipoIdMap } from './normalize.ts';
import { hasPhpCredentials, PhpApiClient } from './php_client.ts';

/** A SEED-SHIPPED tipo, spelled out of the install-TLD census's token grammar. */
const seed = (tld: string, id: number): string => `${tld}${id}`;

/** The coins portal, the section that carries it, and the section it targets. */
const PORTAL_TIPO = 'test6157';
const TARGET_SECTION = 'test6099';
const PORTAL_TARGET_SECTION = 'test6100';
/**
 * The corpus scope this gate owns: the record it reads, the coins the portal
 * pages through, and the seed-shipped media sections those coins' obverse /
 * reverse portals expand into (the frozen data[] carries their image items —
 * without them the emitted tipo sequence is short and the gate reddens).
 */
const CORPUS_SCOPE = [
	TARGET_SECTION,
	PORTAL_TARGET_SECTION,
	seed('rsc', 170),
	seed('rsc', 167),
] as const;

const adminContext: ApiRequestContext = {
	requestId: 'test',
	clientIp: '127.0.0.1',
	session: {
		userId: -1,
		username: 'root',
		isGlobalAdmin: true,
		csrfToken: 'x',
		applicationLang: null,
		dataLang: null,
	},
	csrfCandidate: 'x',
	principal: { userId: -1, isGlobalAdmin: true, isDeveloper: true },
};

interface CasePair {
	php: { context: Record<string, unknown>[]; data: Record<string, unknown>[] };
	ts: { context: Record<string, unknown>[]; data: Record<string, unknown>[] };
}

const mainOf = (result: {
	context: Record<string, unknown>[];
	data: Record<string, unknown>[];
}) => ({
	ctx: result.context.find((entry) => entry.tipo === PORTAL_TIPO),
	item: result.data.find((item) => item.tipo === PORTAL_TIPO && String(item.section_id) === '1') as
		| Record<string, unknown>
		| undefined,
});
/**
 * THE ONE NUMBER THE REDUCED CORPUS CANNOT REPRODUCE — the related-record
 * TOTAL. The frozen answer counts every coin the install relates to this
 * record (34); the committed corpus holds the nine the frozen pages actually
 * revealed (a corpus that held all 34 would be the install). Both numbers are
 * asserted EXACTLY, on their own side, so neither can drift silently — and the
 * page itself (limit/offset, entry count, emitted tipo sequence) is still
 * compared verbatim, which is what this gate is about.
 */
const FROZEN_RELATED_TOTAL = 34;
const CORPUS_RELATED_TOTAL = 9;

/** Pagination minus that total, after asserting the total each side must show. */
const pagedSubset = (
	item: Record<string, unknown> | undefined,
	expectedTotal: number,
): { limit: unknown; offset: unknown } => {
	const pagination = item?.pagination as { total?: unknown; limit?: unknown; offset?: unknown };
	expect(pagination?.total).toBe(expectedTotal);
	return { limit: pagination?.limit, offset: pagination?.offset };
};

const rcOf = (ctx: Record<string, unknown> | undefined) =>
	(ctx?.request_config as { sqo?: Record<string, unknown>; show?: Record<string, unknown> }[])?.[0];

describe.if(hasPhpCredentials())('tool component read (source.properties override)', () => {
	const cases: Record<string, CasePair> = {};
	let overrideProperties: Record<string, unknown>;

	beforeAll(async () => {
		await ensureTestCorpus([...CORPUS_SCOPE]);
		// The override is a FROZEN fixture (the pre-migration inline ddo_map
		// coins properties, byte-copied 2026-07-10): after the WC-020 alias
		// migration the live ddo_map points at numisdata203 with NO inline copy,
		// but this gate pins the `source.properties` override MECHANISM itself
		// (PHP set_properties) against the real component numisdata77 on both
		// engines — that mechanism stays oracle-pinned regardless of the
		// ontology's config carrier. Alias-specific behavior lives in
		// test/unit/component_alias*.test.ts (TS-native, WC-020).
		// The fixture is frozen in INSTALL terms; adopt it into the clone's terms
		// so the RQO this gate sends is generic end to end (`unmapRqo` inverts it
		// back for the fixture lookup). The floor is the anti-vacuity check: the
		// override names the portal's target section, its three ddo_map entries
		// and its data_from_field.
		const frozenOverride = (await Bun.file(
			new URL('./fixtures/coins_override_properties.json', import.meta.url).pathname,
		).json()) as Record<string, unknown>;
		const adoptedOverride = adoptTipoIdMap(frozenOverride, 'tool_component_read_differential');
		expect(adoptedOverride.matched).toBe(true);
		expect(adoptedOverride.rewrites.tipos).toBeGreaterThanOrEqual(8);
		overrideProperties = adoptedOverride.body;

		const client = new PhpApiClient();
		await client.login(
			config.phpReference.username as string,
			config.phpReference.password as string,
		);
		const baseSource = {
			typo: 'source',
			type: 'component',
			action: 'get_data',
			model: 'component_portal',
			tipo: PORTAL_TIPO,
			section_tipo: TARGET_SECTION,
			section_id: '1',
			mode: 'edit',
			view: 'mosaic',
			lang: 'lg-spa',
		};
		const rqos: Record<string, Record<string, unknown>> = {
			override: { action: 'read', source: { ...baseSource, properties: overrideProperties } },
			ontology_default: { action: 'read', source: baseSource },
			client_paged: {
				action: 'read',
				source: { ...baseSource, properties: overrideProperties },
				sqo: { limit: 3, offset: 3 },
			},
			// The REAL tool-window rqo (CDP-captured 2026-07-10): the client sends
			// sqo.limit:null meaning "server decides" — NOT show-all. Treating null
			// as a clamp-to-1000 rendered every tool portal full-list (the 34-coins
			// bug); PHP answers with the effective config limit (1 here).
			null_limit: {
				action: 'read',
				source: { ...baseSource, section_id: 1, properties: overrideProperties },
				sqo: {
					section_tipo: [TARGET_SECTION],
					limit: null,
					offset: null,
					filter_by_locators: [{ section_tipo: TARGET_SECTION, section_id: 1 }],
				},
			},
		};
		for (const [name, rqo] of Object.entries(rqos)) {
			const { body } = await client.call(rqo);
			// WC-2026-08-19-tools-gates-test-tld: the frozen body, read in test-TLD
			// terms. Both floors are anti-vacuity checks — every one of these
			// responses carries the portal, its target section and the record
			// addresses of the page it returned.
			const adopted = adoptTipoIdMap(body, 'tool_component_read_differential');
			expect(adopted.matched).toBe(true);
			expect(adopted.rewrites.tipos).toBeGreaterThan(0);
			expect(adopted.rewrites.ids).toBeGreaterThan(0);
			const outcome = await dispatchRqo(rqo as Rqo, adminContext);
			cases[name] = {
				php: (adopted.body as { result: CasePair['php'] }).result,
				ts: (outcome.body as { data: CasePair['ts'] }).data,
			};
		}
	});

	afterAll(async () => {
		expect(await dropTestCorpus([...CORPUS_SCOPE])).toBe(0);
	});

	test('override: pages by the ddo-declared limit (1), like PHP', () => {
		const { php, ts } = cases.override!;
		const phpMain = mainOf(php);
		const tsMain = mainOf(ts);
		expect(JSON.stringify(pagedSubset(tsMain.item, CORPUS_RELATED_TOTAL))).toBe(
			JSON.stringify(pagedSubset(phpMain.item, FROZEN_RELATED_TOTAL)),
		);
		// Non-vacuous floor: the override limit is REAL (1 of many).
		expect((phpMain.item?.pagination as { limit: number }).limit).toBe(1);
		// Non-vacuous on BOTH sides: the page is one row of many, in the install
		// (34) and in the corpus (9) alike.
		expect((phpMain.item?.pagination as { total: number }).total).toBeGreaterThan(1);
		expect((tsMain.item?.pagination as { total: number }).total).toBeGreaterThan(1);
		expect((tsMain.item?.entries as unknown[]).length).toBe(
			(phpMain.item?.entries as unknown[]).length,
		);
		// Child expansion follows the OVERRIDE's show ddo_map: same emitted
		// data tipo sequence on both engines.
		expect(ts.data.map((item) => item.tipo)).toEqual(php.data.map((item) => item.tipo));
	});

	test('override: context request_config carries the runtime limit + override sqo_config', () => {
		const { php, ts } = cases.override!;
		const phpRc = rcOf(mainOf(php).ctx);
		const tsRc = rcOf(mainOf(ts).ctx);
		expect(tsRc?.sqo?.limit).toBe(1);
		expect(tsRc?.sqo?.limit).toBe(phpRc?.sqo?.limit);
		expect(tsRc?.sqo?.offset).toBeUndefined(); // PHP never stamps it
		expect((tsRc?.show?.sqo_config as { limit?: unknown })?.limit).toBe(
			(phpRc?.show?.sqo_config as { limit?: unknown })?.limit,
		);
	});

	test('override: main entry properties echo + css follow the override (byte-equal)', () => {
		const { php, ts } = cases.override!;
		const phpCtx = mainOf(php).ctx;
		const tsCtx = mainOf(ts).ctx;
		expect(JSON.stringify(tsCtx?.properties)).toBe(JSON.stringify(phpCtx?.properties));
		expect(JSON.stringify(tsCtx?.css)).toBe(JSON.stringify(phpCtx?.css));
		// Non-vacuous floor: the override css is DISTINCT from the ontology's
		// (28rem cells vs 12rem) — a fallback-to-ontology regression must redden.
		expect(JSON.stringify(tsCtx?.css)).toContain('28rem');
	});

	test('no override: pages by the component OWN configured limit, like PHP (not the mode default)', () => {
		const { php, ts } = cases.ontology_default!;
		const phpMain = mainOf(php);
		const tsMain = mainOf(ts);
		expect(JSON.stringify(pagedSubset(tsMain.item, CORPUS_RELATED_TOTAL))).toBe(
			JSON.stringify(pagedSubset(phpMain.item, FROZEN_RELATED_TOTAL)),
		);
		// Non-vacuous floor: the ontology limit (9) differs from the mode default (10).
		expect((phpMain.item?.pagination as { limit: number }).limit).toBe(9);
		expect(rcOf(tsMain.ctx)?.sqo?.limit).toBe(rcOf(phpMain.ctx)?.sqo?.limit);
		expect(ts.data.length).toBe(php.data.length);
	});

	test('sqo.limit null = "server decides" → the effective config limit, like PHP (NOT show-all)', () => {
		const { php, ts } = cases.null_limit!;
		const phpMain = mainOf(php);
		const tsMain = mainOf(ts);
		expect(JSON.stringify(pagedSubset(tsMain.item, CORPUS_RELATED_TOTAL))).toBe(
			JSON.stringify(pagedSubset(phpMain.item, FROZEN_RELATED_TOTAL)),
		);
		// Non-vacuous floor: the override limit (1) applies despite the sqo being present.
		expect((tsMain.item?.pagination as { limit: number }).limit).toBe(1);
		expect((tsMain.item?.entries as unknown[]).length).toBe(
			(phpMain.item?.entries as unknown[]).length,
		);
		expect(ts.data.map((item) => item.tipo)).toEqual(php.data.map((item) => item.tipo));
	});

	test('client-sent sqo.limit wins over the override, like PHP', () => {
		const { php, ts } = cases.client_paged!;
		const phpMain = mainOf(php);
		const tsMain = mainOf(ts);
		expect(JSON.stringify(pagedSubset(tsMain.item, CORPUS_RELATED_TOTAL))).toBe(
			JSON.stringify(pagedSubset(phpMain.item, FROZEN_RELATED_TOTAL)),
		);
		expect((tsMain.item?.pagination as { limit: number }).limit).toBe(3);
		expect((tsMain.item?.pagination as { offset: number }).offset).toBe(3);
		expect(rcOf(tsMain.ctx)?.sqo?.limit).toBe(3);
		expect(rcOf(tsMain.ctx)?.sqo?.limit).toBe(rcOf(phpMain.ctx)?.sqo?.limit);
		expect(ts.data.map((item) => item.tipo)).toEqual(php.data.map((item) => item.tipo));
	});
});
