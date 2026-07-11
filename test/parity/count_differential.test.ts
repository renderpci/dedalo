/**
 * Phase 5g gate: count action differential — TS dispatch 'count' vs live PHP
 * dd_core_api::count (plain + filtered), plus the white-box non-admin case
 * (projects ACL applied to totals — PHP-as-non-admin needs that user's
 * password, so the shared DB is the oracle there).
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

async function tsCount(sqo: Record<string, unknown>, context = adminContext()): Promise<number> {
	const outcome = await dispatchRqo(
		{
			action: 'count',
			dd_api: 'dd_core_api',
			source: { model: 'section', tipo: (sqo.section_tipo as string[])[0] },
			sqo,
		} as unknown as Rqo,
		context,
	);
	expect(outcome.status).toBe(200);
	return (outcome.body.result as { total: number }).total;
}

describe.if(hasPhpCredentials())('count differential (Phase 5g gate)', () => {
	let client: PhpApiClient;

	beforeAll(async () => {
		if (!hasPhpCredentials()) return;
		client = new PhpApiClient();
		await client.login(
			config.phpReference.username as string,
			config.phpReference.password as string,
		);
	});

	async function phpCount(sqo: Record<string, unknown>): Promise<number> {
		const { body } = await client.call({
			action: 'count',
			dd_api: 'dd_core_api',
			prevent_lock: true,
			source: { model: 'section', tipo: (sqo.section_tipo as string[])[0], mode: 'list' },
			sqo,
		});
		return (body.result as { total: number }).total;
	}

	test('plain section count matches PHP', async () => {
		if (!hasPhpCredentials()) return;
		const sqo = { section_tipo: ['numisdata6'], limit: 10, offset: 0 };
		expect(await tsCount(structuredClone(sqo))).toBe(await phpCount(sqo));
	});

	test('filtered count matches PHP', async () => {
		if (!hasPhpCredentials()) return;
		const sqo = {
			section_tipo: ['numisdata6'],
			limit: 10,
			offset: 0,
			filter: {
				$and: [
					{
						q: 'ar',
						path: [{ section_tipo: 'numisdata6', component_tipo: 'numisdata16' }],
						lang: 'lg-spa',
					},
				],
			},
		};
		const total = await tsCount(structuredClone(sqo));
		expect(total).toBe(await phpCount(sqo));
		expect(total).toBeGreaterThan(0);
	});

	test('non-admin count is projects-gated (white-box vs direct SQL)', async () => {
		const nonAdmin: ApiRequestContext = {
			requestId: 'test',
			clientIp: '127.0.0.1',
			session: {
				userId: 16,
				username: 'user16',
				isGlobalAdmin: false,
				csrfToken: 'tok',
				applicationLang: null,
				dataLang: null,
			},
			csrfCandidate: 'tok',
			principal: { userId: 16, isGlobalAdmin: false, isDeveloper: false },
		};
		// user 16 has read on numisdata267? Their profile grants — if not, the
		// permission gate 403s, which is also correct; assert either the gated
		// count or the denial, but never the ungated total.
		const outcome = await dispatchRqo(
			{
				action: 'count',
				dd_api: 'dd_core_api',
				source: { model: 'section', tipo: 'numisdata267' },
				sqo: { section_tipo: ['numisdata267'], limit: 10 },
			} as unknown as Rqo,
			nonAdmin,
		);
		const truth = (await sql`
			SELECT count(DISTINCT section_id)::int AS n FROM matrix
			WHERE section_tipo = 'numisdata267'
			  AND EXISTS (SELECT 1 FROM jsonb_array_elements(relation->'numisdata21') e WHERE e->>'section_id' = '7')
		`) as { n: number }[];
		if (outcome.status === 200) {
			expect((outcome.body.result as { total: number }).total).toBe(truth[0]?.n as number);
		} else {
			expect(outcome.status).toBe(403); // schema-level denial is also fail-closed
		}
	});
});
