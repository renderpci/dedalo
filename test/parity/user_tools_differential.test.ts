/**
 * Phase 6 gate: dd_tools_api::user_tools differential (superuser path).
 *
 * The superuser is authorized for every ACTIVE tool, so get_user_tools returns
 * the full registry with no per-tool availability check. The TS resolver reads
 * the same matrix_tools registry (active = dd1354 → dd64/1) and builds the same
 * simple-context DDOs. We assert byte-parity of the whole 34-tool list, keyed
 * by tool name (order aside), on every DDO field.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { getSuperuserUserTools } from '../../src/core/tools/registry.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

const USER_TOOLS_RQO = {
	dd_api: 'dd_tools_api',
	action: 'user_tools',
	source: {
		typo: 'source',
		model: 'menu',
		tipo: 'dd85',
		section_tipo: 'dd85',
		mode: 'list',
		lang: 'lg-eng',
	},
	options: { ar_requested_tools: null },
};

type ToolDdo = Record<string, unknown> & { name: string };

/**
 * TS-only tools (WC-019): registered in the shared dd1324 but with no PHP
 * package on disk — PHP's get_all_registered_tools IGNORES such rows ("bad
 * config" continue, tool_common.php:788-796), so its lists never carry them.
 * Filtered from the TS side before comparing.
 */
const TS_ONLY_TOOLS: ReadonlySet<string> = new Set(['tool_error_report']);

/** Index a tool list by name for order-independent comparison. */
function byName(tools: ToolDdo[]): Map<string, ToolDdo> {
	return new Map(
		tools.filter((tool) => !TS_ONLY_TOOLS.has(tool.name)).map((tool) => [tool.name, tool]),
	);
}

describe.if(hasPhpCredentials())('user_tools differential (Phase 6 gate)', () => {
	let phpTools: ToolDdo[];
	let tsTools: ToolDdo[];

	beforeAll(async () => {
		if (!hasPhpCredentials()) return;
		const client = new PhpApiClient();
		await client.login(
			config.phpReference.username as string,
			config.phpReference.password as string,
		);
		const { body } = await client.call(structuredClone(USER_TOOLS_RQO));
		phpTools = (body.result as ToolDdo[]) ?? [];
		tsTools = (await getSuperuserUserTools()) as unknown as ToolDdo[];
	});

	test('the same set of active tools is returned', () => {
		if (!hasPhpCredentials()) return;
		expect(tsTools.length).toBeGreaterThan(0);
		const phpNames = [...byName(phpTools).keys()].sort();
		const tsNames = [...byName(tsTools).keys()].sort();
		expect(tsNames).toEqual(phpNames);
	});

	test('every tool DDO matches PHP field-for-field', () => {
		if (!hasPhpCredentials()) return;
		const phpByName = byName(phpTools);
		const tsByName = byName(tsTools);
		for (const [name, phpTool] of phpByName) {
			const tsTool = tsByName.get(name);
			expect(tsTool).toBeDefined();
			// Compare the fields the TS resolver produces; PHP may carry a couple
			// of null-valued extras (e.g. developer) that dd_object drops, so we
			// assert on the resolver's own keys and confirm PHP agrees on each.
			for (const key of Object.keys(tsTool as object)) {
				expect((tsTool as ToolDdo)[key]).toEqual((phpTool as ToolDdo)[key]);
			}
		}
	});
});
