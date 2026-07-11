/**
 * Gate: tools/tool_assistant/register.json stays SECRET-FREE (WC-013).
 *
 * Before the server-driven rewrite, dd1633 carried server-model entries with
 * `api_url`/`api_key` wrapped `{value, client:true}` — the key was delivered
 * to EVERY browser through getToolClientConfigRaw. The rewrite emptied dd1633
 * (model config lives server-side in DEDALO_AGENT_MODELS); this test keeps it
 * that way: no api_key/api_url/api_model anywhere in the register, and the
 * client contract facts the new modules rely on (version, tool name).
 */

import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const REGISTER_PATH = resolve(import.meta.dir, '../../tools/tool_assistant/register.json');

function collectKeys(value: unknown, out: Set<string>): void {
	if (Array.isArray(value)) {
		for (const item of value) collectKeys(item, out);
		return;
	}
	if (typeof value === 'object' && value !== null) {
		for (const [key, child] of Object.entries(value)) {
			out.add(key);
			collectKeys(child, out);
		}
	}
}

describe('tool_assistant register.json (WC-013 secret-free contract)', () => {
	test('no api_key/api_url/api_model keys anywhere; dd1633 is empty', async () => {
		const register = (await Bun.file(REGISTER_PATH).json()) as {
			misc: Record<string, { id: number; value: unknown }[]>;
			string: Record<string, { value: string }[]>;
		};
		const keys = new Set<string>();
		collectKeys(register, keys);
		expect(keys.has('api_key')).toBe(false);
		expect(keys.has('api_url')).toBe(false);
		expect(keys.has('api_model')).toBe(false);

		// dd1633 (tool config) carries NO engines/models — the catalog is
		// server-side (DEDALO_AGENT_MODELS via dd_mcp_api:agent_models).
		const toolConfig = register.misc.dd1633?.[0]?.value;
		expect(toolConfig).toEqual({});

		// contract facts the modules rely on
		expect(register.string.dd1326?.[0]?.value).toBe('tool_assistant');
		expect(register.string.dd1327?.[0]?.value).toBe('2.0.0');
	});

	test('the deleted in-browser modules are gone; the new ones exist', async () => {
		const jsDir = resolve(import.meta.dir, '../../tools/tool_assistant/js');
		for (const dead of ['model_engine.js', 'mcp_client.js', 'client_tools.js']) {
			expect(await Bun.file(resolve(jsDir, dead)).exists()).toBe(false);
		}
		for (const live of ['assistant_controller.js', 'agent_stream.js', 'chat_render.js']) {
			expect(await Bun.file(resolve(jsDir, live)).exists()).toBe(true);
		}
	});

	test('ai_assistant.js survives ONLY as the frozen-client compat alias', async () => {
		// client/dedalo/core/menu/js/view_default_edit_menu.js dynamically imports
		// this exact path to open the edit-menu assistant panel. The client is
		// byte-identical and never edited — the alias is how the server side keeps
		// that contract. It must carry NO engine of its own.
		const shim = await Bun.file(
			resolve(import.meta.dir, '../../tools/tool_assistant/js/ai_assistant.js'),
		).text();
		expect(shim).toContain('export const ai_assistant = assistant_controller');
		expect(shim).toContain("from './assistant_controller.js'");
		// no resurrection of the in-browser engine
		expect(shim).not.toContain('transformers');
		expect(shim).not.toContain('cdn.jsdelivr.net');
		expect(shim).not.toContain('api_key');
		expect(shim.length).toBeLessThan(4000);
	});

	test('the frozen client still imports the alias (contract, not a leftover)', async () => {
		const menu = await Bun.file(
			resolve(import.meta.dir, '../../client/dedalo/core/menu/js/view_default_edit_menu.js'),
		).text();
		expect(menu).toContain('tools/tool_assistant/js/ai_assistant.js');
		expect(menu).toContain('new ai_assistant(');
		expect(menu).toContain('build_chat_ui()');
	});
});
