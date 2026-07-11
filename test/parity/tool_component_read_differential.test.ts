/**
 * Tool-component read gate: a component read that ships `source.properties`
 * (the client's create_source sends the instance's declared properties — TOOL
 * components carry their ddo_map entry's properties this way) must be served
 * from the OVERRIDE, not the ontology node (PHP dd_core_api read :2305-2308,
 * `$element->set_properties`). Found live 2026-07-10: the epigraphy tool's
 * coins portal (numisdata201 → tool_config ddo_map role 'coins' → numisdata77)
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

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { type ApiRequestContext, dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

const PORTAL_TIPO = 'numisdata77';
const TARGET_SECTION = 'numisdata3';

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
const rcOf = (ctx: Record<string, unknown> | undefined) =>
	(ctx?.request_config as { sqo?: Record<string, unknown>; show?: Record<string, unknown> }[])?.[0];

describe.if(hasPhpCredentials())('tool component read (source.properties override)', () => {
	const cases: Record<string, CasePair> = {};
	let overrideProperties: Record<string, unknown>;

	beforeAll(async () => {
		if (!hasPhpCredentials()) return;
		// The override is a FROZEN fixture (the pre-migration inline ddo_map
		// coins properties, byte-copied 2026-07-10): after the WC-020 alias
		// migration the live ddo_map points at numisdata203 with NO inline copy,
		// but this gate pins the `source.properties` override MECHANISM itself
		// (PHP set_properties) against the real component numisdata77 on both
		// engines — that mechanism stays oracle-pinned regardless of the
		// ontology's config carrier. Alias-specific behavior lives in
		// test/unit/component_alias*.test.ts (TS-native, WC-020).
		overrideProperties = (await Bun.file(
			new URL('./fixtures/coins_override_properties.json', import.meta.url).pathname,
		).json()) as Record<string, unknown>;

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
					section_tipo: ['numisdata3'],
					limit: null,
					offset: null,
					filter_by_locators: [{ section_tipo: 'numisdata3', section_id: 1 }],
				},
			},
		};
		for (const [name, rqo] of Object.entries(rqos)) {
			const { body } = await client.call(rqo);
			const outcome = await dispatchRqo(rqo as Rqo, adminContext);
			cases[name] = {
				php: (body as { result: CasePair['php'] }).result,
				ts: (outcome.body as { result: CasePair['ts'] }).result,
			};
		}
	});

	test('override: pages by the ddo-declared limit (1), like PHP', () => {
		if (!hasPhpCredentials()) return;
		const { php, ts } = cases.override!;
		const phpMain = mainOf(php);
		const tsMain = mainOf(ts);
		expect(JSON.stringify(tsMain.item?.pagination)).toBe(JSON.stringify(phpMain.item?.pagination));
		// Non-vacuous floor: the override limit is REAL (1 of many).
		expect((phpMain.item?.pagination as { limit: number }).limit).toBe(1);
		expect((phpMain.item?.pagination as { total: number }).total).toBeGreaterThan(1);
		expect((tsMain.item?.entries as unknown[]).length).toBe(
			(phpMain.item?.entries as unknown[]).length,
		);
		// Child expansion follows the OVERRIDE's show ddo_map: same emitted
		// data tipo sequence on both engines.
		expect(ts.data.map((item) => item.tipo)).toEqual(php.data.map((item) => item.tipo));
	});

	test('override: context request_config carries the runtime limit + override sqo_config', () => {
		if (!hasPhpCredentials()) return;
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
		if (!hasPhpCredentials()) return;
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
		if (!hasPhpCredentials()) return;
		const { php, ts } = cases.ontology_default!;
		const phpMain = mainOf(php);
		const tsMain = mainOf(ts);
		expect(JSON.stringify(tsMain.item?.pagination)).toBe(JSON.stringify(phpMain.item?.pagination));
		// Non-vacuous floor: the ontology limit (9) differs from the mode default (10).
		expect((phpMain.item?.pagination as { limit: number }).limit).toBe(9);
		expect(rcOf(tsMain.ctx)?.sqo?.limit).toBe(rcOf(phpMain.ctx)?.sqo?.limit);
		expect(ts.data.length).toBe(php.data.length);
	});

	test('sqo.limit null = "server decides" → the effective config limit, like PHP (NOT show-all)', () => {
		if (!hasPhpCredentials()) return;
		const { php, ts } = cases.null_limit!;
		const phpMain = mainOf(php);
		const tsMain = mainOf(ts);
		expect(JSON.stringify(tsMain.item?.pagination)).toBe(JSON.stringify(phpMain.item?.pagination));
		// Non-vacuous floor: the override limit (1) applies despite the sqo being present.
		expect((tsMain.item?.pagination as { limit: number }).limit).toBe(1);
		expect((tsMain.item?.entries as unknown[]).length).toBe(
			(phpMain.item?.entries as unknown[]).length,
		);
		expect(ts.data.map((item) => item.tipo)).toEqual(php.data.map((item) => item.tipo));
	});

	test('client-sent sqo.limit wins over the override, like PHP', () => {
		if (!hasPhpCredentials()) return;
		const { php, ts } = cases.client_paged!;
		const phpMain = mainOf(php);
		const tsMain = mainOf(ts);
		expect(JSON.stringify(tsMain.item?.pagination)).toBe(JSON.stringify(phpMain.item?.pagination));
		expect((tsMain.item?.pagination as { limit: number }).limit).toBe(3);
		expect((tsMain.item?.pagination as { offset: number }).offset).toBe(3);
		expect(rcOf(tsMain.ctx)?.sqo?.limit).toBe(3);
		expect(rcOf(tsMain.ctx)?.sqo?.limit).toBe(rcOf(phpMain.ctx)?.sqo?.limit);
		expect(ts.data.map((item) => item.tipo)).toEqual(php.data.map((item) => item.tipo));
	});
});
