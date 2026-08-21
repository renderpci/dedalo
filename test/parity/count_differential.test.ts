/**
 * Phase 5g gate: count action differential — TS dispatch 'count' vs live PHP
 * dd_core_api::count (plain + filtered), plus the white-box non-admin case
 * (projects ACL applied to totals — PHP-as-non-admin needs that user's
 * password, so the shared DB is the oracle there).
 */
// GENERIC-TLD MIGRATED 2026-08-19 (WC-2026-08-19-test-tld-replay-search-group).
// Every SQO is written in `test`-TLD terms (the frozen PHP interaction is
// reached through `unmapRqo`) and the records are the committed test corpus,
// owned by this gate. The non-admin case is white-box against direct SQL, so
// it builds its situation completely: the gated section is `testmint1`, and
// the project ids come from the corpus user's own record.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { type ApiRequestContext, dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { getUserProjects } from '../../src/core/security/permissions.ts';
import { dropTestCorpus, ensureTestCorpus } from '../../src/core/test_data/test_corpus/ensure.ts';
import { hasPhpCredentials, PhpApiClient } from './php_client.ts';

/** The counted section, its component_filter, and the corpus user with projects. */
const SECTION = 'testmint1';
const FILTER_TIPO = 'testmint1013';
const NON_ADMIN_USER_ID = 2;
const CORPUS_SECTIONS = [SECTION, 'dd128'] as const;

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
	return (outcome.body as { data: { total: number } }).data.total;
}

describe.if(hasPhpCredentials())('count differential (Phase 5g gate)', () => {
	let client: PhpApiClient;

	beforeAll(async () => {
		await ensureTestCorpus([...CORPUS_SECTIONS]);
		if (!hasPhpCredentials()) return;
		client = new PhpApiClient();
		await client.login(
			config.phpReference.username as string,
			config.phpReference.password as string,
		);
	});

	afterAll(async () => {
		expect(await dropTestCorpus([...CORPUS_SECTIONS])).toBe(0);
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
		const sqo = { section_tipo: ['testmint1'], limit: 10, offset: 0 };
		expect(await tsCount(structuredClone(sqo))).toBe(await phpCount(sqo));
	});

	test('filtered count matches PHP', async () => {
		if (!hasPhpCredentials()) return;
		const sqo = {
			section_tipo: ['testmint1'],
			limit: 10,
			offset: 0,
			filter: {
				$and: [
					{
						q: 'ar',
						path: [{ section_tipo: 'testmint1', component_tipo: 'testmint1002' }],
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
		// The corpus user holds real projects; the gated section's records
		// reference some of them. The counted total must equal the direct-SQL
		// set — never the ungated total.
		const projects = await getUserProjects(NON_ADMIN_USER_ID);
		expect(projects.length).toBeGreaterThan(0); // fixture guard
		const nonAdmin: ApiRequestContext = {
			requestId: 'test',
			clientIp: '127.0.0.1',
			session: {
				userId: NON_ADMIN_USER_ID,
				username: 'corpus_user',
				isGlobalAdmin: false,
				csrfToken: 'tok',
				applicationLang: null,
				dataLang: null,
			},
			csrfCandidate: 'tok',
			principal: { userId: NON_ADMIN_USER_ID, isGlobalAdmin: false, isDeveloper: false },
		};
		const outcome = await dispatchRqo(
			{
				action: 'count',
				dd_api: 'dd_core_api',
				source: { model: 'section', tipo: SECTION },
				sqo: { section_tipo: [SECTION], limit: 10 },
			} as unknown as Rqo,
			nonAdmin,
		);
		const truth = (await sql.unsafe(
			`SELECT count(DISTINCT section_id)::int AS n FROM matrix_test
			 WHERE section_tipo = $1
			   AND EXISTS (
				SELECT 1 FROM jsonb_array_elements(relation -> $2) e
				WHERE (e->>'section_id') = ANY($3::text[])
			)`,
			[SECTION, FILTER_TIPO, `{${projects.join(',')}}`],
		)) as { n: number }[];
		const ungated = (await sql.unsafe(
			`SELECT count(DISTINCT section_id)::int AS n FROM matrix_test WHERE section_tipo = $1`,
			[SECTION],
		)) as { n: number }[];
		// The gate is not vacuous: the section is genuinely partial for this user.
		expect(truth[0]?.n as number).toBeGreaterThan(0);
		expect(truth[0]?.n as number).toBeLessThan(ungated[0]?.n as number);
		if (outcome.status === 200) {
			expect((outcome.body as { data: { total: number } }).data.total).toBe(truth[0]?.n as number);
		} else {
			expect(outcome.status).toBe(403); // schema-level denial is also fail-closed
		}
	});
});
