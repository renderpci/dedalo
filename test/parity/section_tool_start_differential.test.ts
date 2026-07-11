/**
 * section_tool direct-URL gate: `start` for a section_tool page REROUTES to
 * the target section and carries the tool activation on config.tool_context
 * (PHP dd_core_api::start section_tool case, class.dd_core_api.php:386-458).
 *
 * The config is byte-pinned: the enriched tool_config.ddo_map is the contract
 * that makes the client build the tool's CONFIGURED components — without it
 * the client's tool_common.js cascade silently falls back to a synthetic
 * single-entry ddo_map and the tool renders component-less (numisdata201 /
 * numisdata670, fixed 2026-07-10). numisdata625 (a section_tool with NO
 * config/tool_config) pins PHP's answer: result:false — PHP fatals building a
 * section on the non-section tipo (set_lang on false, :430-434); TS refuses
 * loudly with the same envelope.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { type ApiRequestContext, dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

/**
 * The configured section_tool exemplars (AREA_SPEC §6: oh81 = transcription
 * over rsc167; numisdata201/670 = epigraphy/order over numisdata3) + the
 * config-less sibling.
 */
const REROUTED_TIPOS = ['numisdata201', 'numisdata670', 'oh81'];
const EMPTY_TIPO = 'numisdata625';

describe.if(hasPhpCredentials())('section_tool start differential', () => {
	const phpBodies: Record<string, Record<string, unknown>> = {};
	const tsBodies: Record<string, Record<string, unknown>> = {};
	const contextsOf = (body: Record<string, unknown>): Record<string, unknown>[] => {
		const result = body.result as { context?: Record<string, unknown>[] } | false | null;
		return result && typeof result === 'object' ? (result.context ?? []) : [];
	};

	beforeAll(async () => {
		if (!hasPhpCredentials()) return;
		const client = new PhpApiClient();
		await client.login(
			config.phpReference.username as string,
			config.phpReference.password as string,
		);
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
		for (const tipo of [...REROUTED_TIPOS, EMPTY_TIPO]) {
			const options = { search_obj: { t: tipo, m: 'list' }, menu: false };
			const { body } = await client.call({ action: 'start', prevent_lock: true, options });
			phpBodies[tipo] = body;
			const outcome = await dispatchRqo(
				{ action: 'start', dd_api: 'dd_core_api', options } as Rqo,
				adminContext,
			);
			tsBodies[tipo] = outcome.body;
		}
	});

	for (const tipo of REROUTED_TIPOS) {
		test(`${tipo}: reroutes to the target section (tipo/model/type/label match PHP)`, () => {
			if (!hasPhpCredentials()) return;
			const php = contextsOf(phpBodies[tipo]!)[0]!;
			const ts = contextsOf(tsBodies[tipo]!)[0]!;
			expect(php).toBeDefined();
			expect(ts).toBeDefined();
			expect(ts.tipo).toBe(php.tipo); // the TARGET section, not the section_tool
			expect(ts.model).toBe(php.model); // 'section'
			expect(ts.type).toBe(php.type);
			expect(ts.label).toBe(php.label);
		});

		test(`${tipo}: config is byte-equal (tool_context + enriched ddo_map)`, () => {
			if (!hasPhpCredentials()) return;
			const php = contextsOf(phpBodies[tipo]!)[0]!;
			const ts = contextsOf(tsBodies[tipo]!)[0]!;
			// WC-020 normalizer (numisdata201 only, post-alias-migration): the coins
			// role points at the component_alias numisdata203, which PHP cannot
			// resolve (it enriches model:'component_alias' verbatim; TS resolves the
			// TARGET model per the alias contract). Byte-pin everything EXCEPT that
			// entry, and pin the TS entry's alias shape explicitly. NO-OP while the
			// configs are byte-equal (pre-migration).
			if (tipo === 'numisdata201' && JSON.stringify(ts.config) !== JSON.stringify(php.config)) {
				type ToolConfig = {
					tool_context?: { tool_config?: { ddo_map?: Record<string, unknown>[] } };
				};
				const stripCoins = (cfg: unknown): unknown => {
					const clone = structuredClone(cfg) as ToolConfig;
					const map = clone.tool_context?.tool_config?.ddo_map;
					if (Array.isArray(map) && clone.tool_context?.tool_config) {
						clone.tool_context.tool_config.ddo_map = map.filter((entry) => entry.role !== 'coins');
					}
					return clone;
				};
				expect(JSON.stringify(stripCoins(ts.config))).toBe(JSON.stringify(stripCoins(php.config)));
				const tsCoins = (ts.config as ToolConfig).tool_context?.tool_config?.ddo_map?.find(
					(entry) => entry.role === 'coins',
				);
				expect(tsCoins?.tipo).toBe('numisdata203');
				expect(tsCoins?.model).toBe('component_portal'); // the alias TARGET's model
				expect(tsCoins?.properties).toBeUndefined(); // no inline copy survives
				return;
			}
			expect(JSON.stringify(ts.config)).toBe(JSON.stringify(php.config));
			// Vacuous-green guard: the pinned config must actually CARRY the
			// configured components with the create_tool_simple_context stamps.
			const ddoMap = (
				ts.config as { tool_context: { tool_config: { ddo_map: Record<string, unknown>[] } } }
			).tool_context.tool_config.ddo_map;
			expect(Array.isArray(ddoMap)).toBe(true);
			expect(ddoMap.length).toBeGreaterThan(0);
			for (const entry of ddoMap) {
				expect(typeof entry.model).toBe('string');
				expect(typeof entry.translatable).toBe('boolean');
				expect(typeof entry.label).toBe('string');
			}
		});

		test(`${tipo}: start context WITHOUT top-level request_config (PHP parity)`, () => {
			if (!hasPhpCredentials()) return;
			expect(contextsOf(phpBodies[tipo]!)[0]!.request_config).toBeUndefined();
			expect(contextsOf(tsBodies[tipo]!)[0]!.request_config).toBeUndefined();
		});
	}

	test(`${EMPTY_TIPO} (no config/tool_config): BOTH engines refuse with result:false`, () => {
		if (!hasPhpCredentials()) return;
		// PHP fatals building a section on the non-section tipo (set_lang on
		// false) and answers result:false; TS refuses loudly with the same
		// envelope (message text is TS's own — the SHAPE is the contract).
		expect(phpBodies[EMPTY_TIPO]!.result).toBe(false);
		expect(tsBodies[EMPTY_TIPO]!.result).toBe(false);
	});
});
