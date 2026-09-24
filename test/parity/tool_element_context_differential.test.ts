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
					// and require EVERY exempted name to be a TS label (never quietly
					// stale). The labels come from the REGISTERED tool (matrix_tools):
					// a DB registered before the addendum is red here until its tools
					// are registered again (bun run test:db:setup).
					// Addendum 2026-09-24 (same entry, and
					// WC-2026-09-24-tool-export-server-built-artifacts): 22 more names,
					// the server-built export UI (status line, pager, downloads, Stop,
					// Delete).
					const ADDED = new Set([
						'activate_all_columns',
						'disable_all_columns',
						'active_elements',
						'breakdown',
						'tool_export',
						'value_with_parents',
						// 2026-09-24 addendum
						'delete_export',
						'delete_export_confirm',
						'download_media',
						'download_ndjson',
						'export_deleted',
						'export_ended',
						'export_failed',
						'export_interrupted',
						'export_running',
						'export_starting',
						'file_failed',
						'first_page',
						'last_page',
						'media',
						'no_columns_selected',
						'preparing_file',
						'print_current_page_note',
						'quality_for',
						'records',
						'records_per_page',
						'stop',
						'waiting_file',
					]);
					type LabelRow = { name?: unknown };
					const tsLabels = tsContext.labels as LabelRow[];
					const phpLabels = phpContext.labels as LabelRow[];
					expect(Array.isArray(tsLabels)).toBe(true);
					expect(Array.isArray(phpLabels)).toBe(true);
					const kept = tsLabels.filter((row) => !ADDED.has(String(row.name)));
					// EXACT, never "matched at least one": every exempted name must still
					// be a TS label, so a label dropped or renamed without editing this
					// set (and its WC entry) turns the gate red instead of staying exempt.
					const tsNames = new Set(tsLabels.map((row) => String(row.name)));
					expect([...ADDED].filter((name) => !tsNames.has(name))).toEqual([]);
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
