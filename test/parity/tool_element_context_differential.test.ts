/**
 * Tool element-context parity (Phase 6): the open_tool string branch. When the
 * client calls get_element_context with source:{model:'tool_x'} (no tipo), PHP
 * returns the full tool context (tipo/lang/labels/description/developer beyond
 * the toolbar simple context). This asserts the TS buildToolElementContext
 * matches PHP byte-for-byte for representative tools.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { buildToolElementContext } from '../../src/core/tools/registry.ts';
import { hasPhpCredentials, PhpApiClient } from './php_client.ts';

const TOOLS = ['tool_export', 'tool_time_machine', 'tool_lang'];

describe.if(hasPhpCredentials())(
	'tool element context differential (open_tool string branch)',
	() => {
		let client: PhpApiClient;
		let ready = false;

		beforeAll(async () => {
			client = new PhpApiClient();
			ready = await client.login(
				config.phpReference.username as string,
				config.phpReference.password as string,
			);
		});

		for (const toolName of TOOLS) {
			test(`${toolName}: TS tool context matches PHP get_element_context`, async () => {
				if (!ready) {
					console.warn('skipped: no PHP credentials/login');
					return;
				}
				const phpResponse = await client.call({
					dd_api: 'dd_core_api',
					action: 'get_element_context',
					prevent_lock: true,
					source: { model: toolName },
				});
				const phpContext = structuredClone((phpResponse.body?.result as unknown[])?.[0]) as Record<
					string,
					unknown
				>;
				const tsContext = structuredClone(
					(await buildToolElementContext(toolName)) as unknown,
				) as Record<string, unknown>;
				if (toolName === 'tool_export') {
					// WC-2026-08-23-tool-export-register-labels: the TS register grew
					// six label rows with the breakdown/columns export UI; the frozen
					// side predates them. Additive only — filter EXACTLY that name set
					// out of the TS labels, assert the frozen side has none of them,
					// and require the filter to have matched (never quietly stale).
					const ADDED = new Set([
						'activate_all_columns',
						'disable_all_columns',
						'active_elements',
						'breakdown',
						'tool_export',
						'value_with_parents',
					]);
					type LabelRow = { name?: unknown };
					const tsLabels = tsContext.labels as LabelRow[];
					const phpLabels = phpContext.labels as LabelRow[];
					expect(Array.isArray(tsLabels)).toBe(true);
					expect(Array.isArray(phpLabels)).toBe(true);
					const kept = tsLabels.filter((row) => !ADDED.has(String(row.name)));
					expect(kept.length).toBeLessThan(tsLabels.length); // matched at least one
					for (const row of phpLabels) expect(ADDED.has(String(row.name))).toBe(false);
					tsContext.labels = kept;
				}
				if (toolName === 'tool_lang') {
					// WC-2026-08-19-tool-lang-translator-engine-type-and-browser-transformer:
					// the frozen list predates the contract. Assert the frozen side IS
					// the pre-change shape and the TS side IS the WC shape (engine
					// name/type order pinned; `models` is per-install config, absent
					// from the register default), then compare the rest.
					type Engine = { name?: unknown; type?: unknown; label?: unknown; models?: unknown };
					const slot = (ctx: Record<string, unknown>): { value: Engine[] } =>
						(ctx.config as { translator_engine: { value: Engine[] } }).translator_engine;
					const phpEngines = slot(phpContext).value;
					const tsEngines = slot(tsContext).value;
					expect(phpEngines).toEqual([
						{ name: 'babel', label: 'Babel' },
						{ name: 'google_translation', label: 'Google translator' },
					] as Engine[]);
					expect(tsEngines.map((e) => [e.name, e.type])).toEqual([
						['babel', 'server'],
						['google_translation', 'server'],
						['browser_transformer', 'browser'],
					]);
					for (const engine of tsEngines) {
						expect(typeof engine.label).toBe('string');
						expect(String(engine.label).length).toBeGreaterThan(0);
					}
					slot(phpContext).value = [];
					slot(tsContext).value = [];
				}
				expect(tsContext).toEqual(phpContext);
			});
		}
	},
);
