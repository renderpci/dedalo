/**
 * Phase 3/6 gate: the '!!' DUPLICATED operator vs live PHP — rows whose
 * value (in the request lang) also appears on another record of the same
 * section, unaccent-compared. Seeded on the disposable test section (the
 * self-join is too heavy for the big matrix table in a test run): two
 * records share a value (accent variance included), one is unique — both
 * engines must count exactly the duplicated pair.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

const SEEDS: [number, string][] = [
	[999911, 'DUP-Á'], // accent variant — f_unaccent must equate them
	[999912, 'DUP-A'],
	[999913, 'UNIQ-B'],
];

const COUNT_RQO = {
	action: 'count',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	options: {},
	source: {
		typo: 'source',
		model: 'section',
		tipo: 'test2',
		section_tipo: 'test2',
		action: 'count',
		mode: 'list',
		lang: 'lg-spa',
	},
	sqo: {
		section_tipo: ['test2'],
		limit: 10,
		offset: 0,
		filter: {
			$and: [
				{
					q: '!!',
					lang: 'lg-spa',
					path: [{ section_tipo: 'test2', component_tipo: 'numisdata16' }],
				},
			],
		},
	},
};

beforeAll(async () => {
	for (const [id, value] of SEEDS) {
		await sql.unsafe(
			`INSERT INTO matrix_test (section_id, section_tipo, string)
			 VALUES ($1, 'test2', $2::text::jsonb) ON CONFLICT DO NOTHING`,
			[id, JSON.stringify({ numisdata16: [{ id: 1, lang: 'lg-spa', value }] })],
		);
	}
});

afterAll(async () => {
	await sql.unsafe(
		`DELETE FROM matrix_test WHERE section_tipo = 'test2' AND section_id IN (999911, 999912, 999913)`,
		[],
	);
});

describe.if(hasPhpCredentials())("duplicated operator '!!' differential", () => {
	test('both engines count exactly the duplicated pair (accent-insensitive)', async () => {
		const token = createSession(-1, 'root', true);
		const session = getSession(token);
		const principal = await resolvePrincipal(-1);
		const tsResult = await dispatchRqo(
			structuredClone(COUNT_RQO) as never,
			{
				requestId: 't',
				clientIp: '127.0.0.1',
				session,
				csrfCandidate: session?.csrfToken ?? null,
				principal,
			} as never,
		);
		const tsTotal = Number((tsResult.body as { result?: { total?: unknown } }).result?.total);
		expect(tsTotal).toBe(2);

		if (!hasPhpCredentials()) return;
		const php = new PhpApiClient();
		await php.login(config.phpReference.username as string, config.phpReference.password as string);
		const phpBody = (await php.call(structuredClone(COUNT_RQO) as Record<string, unknown>))
			.body as { result?: { total?: unknown } };
		expect(Number(phpBody.result?.total)).toBe(tsTotal);
	});
});
