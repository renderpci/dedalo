/**
 * Tool config resolution: dd996-over-dd1633 per-key merge and the client:true
 * filter. Uses the live registry (tool_lang ships a sample default_config with
 * translator_engine client:true and translator_config client:false).
 */

import { describe, expect, test } from 'bun:test';
import {
	getToolClientConfig,
	getToolConfig,
	getToolConfigValue,
} from '../../src/core/tools/config.ts';

describe('tool config resolution', () => {
	test('getToolConfigValue falls back when neither layer defines the key', async () => {
		expect(await getToolConfigValue('tool_does_not_exist', 'whatever', 'FALLBACK')).toBe(
			'FALLBACK',
		);
		expect(await getToolConfigValue('tool_lang', 'no_such_key', 42)).toBe(42);
	});

	test('getToolConfig returns every defined option (register defaults)', async () => {
		const config = await getToolConfig('tool_lang');
		// tool_lang's seeded default_config carries these option keys.
		expect(Object.keys(config)).toContain('translator_engine');
		expect(Object.keys(config)).toContain('translator_config');
	});

	test('getToolClientConfig exposes ONLY client:true options (never secrets)', async () => {
		const clientConfig = await getToolClientConfig('tool_lang');
		// translator_engine is client:true → exposed; translator_config is
		// client:false and info is a bare scalar → both withheld.
		expect(Object.keys(clientConfig)).toContain('translator_engine');
		expect(Object.keys(clientConfig)).not.toContain('translator_config');
		expect(Object.keys(clientConfig)).not.toContain('info');
	});

	test('getToolClientConfig is empty for a tool with no config', async () => {
		expect(await getToolClientConfig('tool_does_not_exist')).toEqual({});
	});
});
