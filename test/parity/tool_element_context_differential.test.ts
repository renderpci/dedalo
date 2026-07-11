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
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

const TOOLS = ['tool_export', 'tool_time_machine', 'tool_lang'];

describe.if(hasPhpCredentials())(
	'tool element context differential (open_tool string branch)',
	() => {
		let client: PhpApiClient;
		let ready = false;

		beforeAll(async () => {
			if (!hasPhpCredentials()) return;
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
				const phpContext = (phpResponse.body?.result as unknown[])?.[0];
				const tsContext = await buildToolElementContext(toolName);
				expect(tsContext).toEqual(phpContext as Record<string, unknown>);
			});
		}
	},
);
