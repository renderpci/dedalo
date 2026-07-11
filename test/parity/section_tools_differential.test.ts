/**
 * Phase 6 gate: section-context tools differential (PHP common::get_tools for a
 * section, superuser).
 *
 * A section's toolbar is get_user_tools filtered to the tools that apply to the
 * 'section' model: 'section' in affected_models, or the tipo matching
 * affected_tipos (with tipo_in_array wildcard/regex), or the section declaring
 * the tool in properties.tool_config; then affected_tipos restriction +
 * requirement_translatable + per-tool is_available.
 *
 * We assert the TS filter reproduces the PHP tool set exactly, treating the
 * availability-ledgered tools (tool_diffusion, whose is_available needs the
 * diffusion section-map) as covered when they appear in the resolver's
 * `ledgered` list. Each emitted DDO is compared field-for-field.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { getSectionTools } from '../../src/core/tools/registry.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

const SECTION_TIPO = 'numisdata6';

const SECTION_RQO = {
	action: 'read',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	source: {
		model: 'section',
		tipo: SECTION_TIPO,
		section_tipo: SECTION_TIPO,
		mode: 'list',
		lang: 'lg-spa',
		action: 'search',
	},
	sqo: { section_tipo: [SECTION_TIPO], limit: 1 },
};

type ToolDdo = Record<string, unknown> & { name: string };

describe.if(hasPhpCredentials())('section tools differential (Phase 6 gate)', () => {
	let phpTools: ToolDdo[];
	let tsTools: ToolDdo[];
	let tsLedgered: string[];

	beforeAll(async () => {
		if (!hasPhpCredentials()) return;
		const client = new PhpApiClient();
		await client.login(
			config.phpReference.username as string,
			config.phpReference.password as string,
		);
		const { body } = await client.call(structuredClone(SECTION_RQO));
		const context = (body.result as { context?: Record<string, unknown>[] }).context ?? [];
		const section = context.find(
			(entry) => entry.model === 'section' && entry.tipo === SECTION_TIPO,
		);
		phpTools = (section?.tools as ToolDdo[]) ?? [];

		const result = await getSectionTools(SECTION_TIPO);
		// tool_error_report (WC-019) is TS-ONLY: PHP's get_all_registered_tools
		// ignores its shared dd1324 row (no on-disk PHP package → "bad config"
		// continue, tool_common.php:788-796), so PHP lists never carry it.
		tsTools = (result.tools as unknown as ToolDdo[]).filter(
			(tool) => tool.name !== 'tool_error_report',
		);
		tsLedgered = result.ledgered;
	});

	test('TS tools + ledgered reproduce the PHP section tool set exactly', () => {
		if (!hasPhpCredentials()) return;
		expect(phpTools.length).toBeGreaterThan(0);
		const phpNames = phpTools.map((tool) => tool.name).sort();
		const tsNames = [...tsTools.map((tool) => tool.name), ...tsLedgered].sort();
		expect(tsNames).toEqual(phpNames);
	});

	test('the availability-ledgered tools are a subset PHP actually shows', () => {
		if (!hasPhpCredentials()) return;
		// Anything ledgered must be a tool PHP included (we did not wrongly drop a
		// tool that should have been excluded outright, e.g. tool_ontology).
		const phpNames = new Set(phpTools.map((tool) => tool.name));
		for (const name of tsLedgered) {
			expect(phpNames.has(name)).toBe(true);
		}
		// tool_ontology has 'section' in affected_models but an affected_tipos
		// regex numisdata6 does not match — it must be EXCLUDED (not ledgered).
		expect(tsLedgered).not.toContain('tool_ontology');
		expect(tsTools.map((tool) => tool.name)).not.toContain('tool_ontology');
	});

	test('each emitted tool DDO matches PHP field-for-field', () => {
		if (!hasPhpCredentials()) return;
		const phpByName = new Map(phpTools.map((tool) => [tool.name, tool]));
		for (const tsTool of tsTools) {
			const phpTool = phpByName.get(tsTool.name);
			expect(phpTool).toBeDefined();
			for (const key of Object.keys(tsTool)) {
				expect(tsTool[key]).toEqual((phpTool as ToolDdo)[key]);
			}
		}
	});
});

// tool_diffusion negative case: a section OUTSIDE the diffusion section-map
// (test3 — the matrix_test bench has no diffusion element) must not show the
// tool on EITHER engine; the TS map itself must agree.
describe.if(hasPhpCredentials())('tool_diffusion availability (diffusion section-map)', () => {
	test('non-diffusion section shows no tool_diffusion on either engine', async () => {
		if (!hasPhpCredentials()) return;
		const php = new PhpApiClient();
		await php.login(config.phpReference.username as string, config.phpReference.password as string);
		const body = (
			await php.call({
				action: 'get_element_context',
				dd_api: 'dd_core_api',
				prevent_lock: true,
				source: {
					typo: 'source',
					model: 'section',
					tipo: 'test3',
					section_tipo: 'test3',
					mode: 'edit',
					lang: 'lg-spa',
				},
			})
		).body as { result?: { context?: Record<string, unknown>[] } };
		const section = (body.result?.context ?? []).find(
			(entry) => entry.model === 'section' && entry.tipo === 'test3',
		);
		const phpNames = ((section?.tools as { name?: string }[]) ?? []).map((tool) => tool.name);
		expect(phpNames).not.toContain('tool_diffusion');

		const { haveSectionDiffusion } = await import(
			'../../src/core/diffusion_bridge/diffusion_map.ts'
		);
		expect(await haveSectionDiffusion('test3')).toBe(false);
		expect(await haveSectionDiffusion(SECTION_TIPO)).toBe(true); // numisdata6 positive

		const result = await getSectionTools('test3');
		expect(result.tools.map((tool) => (tool as { name?: string }).name)).not.toContain(
			'tool_diffusion',
		);
		expect(result.ledgered).toEqual([]);
	}, 60000);
});
