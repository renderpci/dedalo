/**
 * get_section_terms differential — TS dispatch vs live PHP
 * dd_core_api::get_section_terms (:3482), the batch section_map term resolver
 * the graph view (client build_graph_data.js fetch_section_terms) labels its
 * nodes with. Gates: the result MAP is byte-equal for a mixed batch (termed
 * section + cross-section + duplicate + malformed locators), the lang is
 * honored, and the bad-locators error envelope matches.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { type ApiRequestContext, dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

function adminContext(): ApiRequestContext {
	return {
		requestId: 'test',
		clientIp: '127.0.0.1',
		session: {
			userId: -1,
			username: 'root',
			isGlobalAdmin: true,
			csrfToken: 'tok',
			applicationLang: null,
			dataLang: null,
		},
		csrfCandidate: 'tok',
		principal: { userId: -1, isGlobalAdmin: true, isDeveloper: true },
	};
}

async function tsTerms(rqoExtras: Record<string, unknown>): Promise<{
	status: number;
	body: Record<string, unknown>;
}> {
	const outcome = await dispatchRqo(
		{ action: 'get_section_terms', dd_api: 'dd_core_api', ...rqoExtras } as unknown as Rqo,
		adminContext(),
	);
	return { status: outcome.status, body: outcome.body };
}

describe.if(hasPhpCredentials())('get_section_terms differential', () => {
	let client: PhpApiClient;
	// Real es1 records (section_map thesaurus.term = hierarchy25) from the SHARED DB.
	let es1Ids: string[] = [];

	beforeAll(async () => {
		if (!hasPhpCredentials()) return;
		client = new PhpApiClient();
		await client.login(
			config.phpReference.username as string,
			config.phpReference.password as string,
		);
		const rows = (await sql`
			SELECT section_id FROM matrix_hierarchy
			WHERE section_tipo = 'es1' AND section_id < 900000
			ORDER BY section_id LIMIT 2
		`) as { section_id: number }[];
		es1Ids = rows.map((row) => String(row.section_id));
	});

	async function phpTerms(rqoExtras: Record<string, unknown>): Promise<Record<string, unknown>> {
		const { body } = await client.call({
			action: 'get_section_terms',
			dd_api: 'dd_core_api',
			prevent_lock: true,
			...rqoExtras,
		});
		return body;
	}

	test('mixed batch resolves the SAME term map as PHP', async () => {
		if (!hasPhpCredentials()) return;
		expect(es1Ids.length).toBeGreaterThan(0);
		const locators: unknown[] = [
			...es1Ids.map((id) => ({ section_tipo: 'es1', section_id: id })),
			// duplicate — first occurrence wins, no double entry
			{ section_tipo: 'es1', section_id: es1Ids[0] },
			// malformed: bad tipo grammar, missing id, non-object — all silently skipped
			{ section_tipo: 'DROP TABLE', section_id: '1' },
			{ section_tipo: 'es1' },
			'not-an-object',
			// cross-section record (no thesaurus term expected; both engines must agree)
			{ section_tipo: 'numisdata6', section_id: '1' },
		];
		const ts = await tsTerms({ locators, lang: 'lg-spa' });
		const php = await phpTerms({ locators, lang: 'lg-spa' });
		expect(ts.status).toBe(200);
		expect(ts.body.result).toEqual(php.result as Record<string, unknown>);
		// the gate is not vacuous: the es1 records DID resolve a term
		const resolved = ts.body.result as Record<string, unknown>;
		expect(Object.keys(resolved)).toContain(`es1_${es1Ids[0]}`);
		expect(typeof resolved[`es1_${es1Ids[0]}`]).toBe('string');
	});

	test('lang is honored identically', async () => {
		if (!hasPhpCredentials()) return;
		const locators = es1Ids.map((id) => ({ section_tipo: 'es1', section_id: id }));
		const ts = await tsTerms({ locators, lang: 'lg-eng' });
		const php = await phpTerms({ locators, lang: 'lg-eng' });
		expect(ts.body.result).toEqual(php.result as Record<string, unknown>);
	});

	test('bad locators → same error envelope (HTTP 200, bad_locators)', async () => {
		if (!hasPhpCredentials()) return;
		const ts = await tsTerms({ locators: [] });
		const php = await phpTerms({ locators: [] });
		expect(ts.status).toBe(200);
		expect(ts.body.result).toBe(false);
		expect(php.result).toBe(false);
		expect(ts.body.errors).toEqual(php.errors as unknown[]);
		expect(ts.body.msg).toBe(php.msg as string);
	});
});
