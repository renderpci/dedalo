/**
 * get_indexation_grid differential — TS engine (src/core/section/
 * indexation_grid.ts) vs live PHP dd_core_api::get_indexation_grid (:2845 →
 * indexation_grid::build_indexation_grid). The thesaurus "show indexations"
 * grid: ts_object.js show_indexations → dd_grid view 'indexation'.
 *
 * The corpus exercises every indexation_list config shape live on this
 * install: rsc897 (rsc205 publications: head+row, image/date/portal-with-
 * children/select_lang cells + pdf-format text_area custom columns),
 * numisdata247 (numisdata5: section_id cells, leaf portals, default-
 * request-config recursion), tchi92 (thesaurus records with portal+image
 * sub-ddo), oh6 (rsc167 tag_id locators grouped under section_top oh1),
 * a MISSING config (rsc420 → group skipped), a section with no config at
 * all (numisdata6 → empty grid), multi-section grids and pagination.
 * The whole grid JSON must be DEEP-EQUAL to the oracle's.
 */
// BINDS INSTALL TLDs: cont, dc, ds, numisdata, rsc, tchi, terr — install-specific fixtures, grandfathered in
// engineering/generic_tld_baseline.json (generic_tld_tripwire, shrink-only). This test
// is meaningful only on a database holding those installs' records. Migrate it to a
// built situation (src/core/test_data/situations) or the generic `test` TLD, then
// regenerate the baseline (`bun run scripts/generic_tld_baseline.ts`).

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { type ApiRequestContext, dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { CATEGORY_STATUS, specOf } from '../../src/core/errors/registry.ts';
import { runWithRequestLangs } from '../../src/core/resolve/request_lang.ts';
import { adoptErrorEnvelopeV2, normalizeSectionIdTypes } from './normalize.ts';
import { hasPhpCredentials, PhpApiClient } from './php_client.ts';

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

/** The exact rqo the client builds (ts_object.js show_indexations). */
function gridRqo(
	termTipo: string,
	termId: string,
	target: string[],
	limit = 200,
	offset = 0,
): Record<string, unknown> {
	return {
		action: 'get_indexation_grid',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		source: { section_tipo: termTipo, section_id: termId, tipo: 'hierarchy40', value: null },
		sqo: {
			mode: 'related',
			section_tipo: target,
			total: null,
			limit,
			offset,
			filter_by_locators: [{ section_tipo: termTipo, section_id: termId, tipo: 'hierarchy40' }],
		},
	};
}

async function tsGrid(rqo: Record<string, unknown>): Promise<{
	status: number;
	body: Record<string, unknown>;
}> {
	// PHP resolves labels/data in the install langs; pin the same request langs.
	const outcome = await runWithRequestLangs({ applicationLang: 'lg-spa', dataLang: 'lg-spa' }, () =>
		dispatchRqo(rqo as unknown as Rqo, adminContext()),
	);
	return { status: outcome.status, body: outcome.body };
}

describe.if(hasPhpCredentials())('get_indexation_grid differential', () => {
	let client: PhpApiClient;

	beforeAll(async () => {
		if (!hasPhpCredentials()) return;
		client = new PhpApiClient();
		await client.login(
			config.phpReference.username as string,
			config.phpReference.password as string,
		);
	});

	// [term_tipo, term_id, target_sections, limit?, offset?] — live corpus
	// verified 2026-07-09 (~48k dd96 relations on this install).
	const CASES: [string, string, string[], number?, number?][] = [
		// publications config (rsc897): head+row, portal-with-children, pdf text_area
		['cont1', '10', ['rsc205']],
		// coin-type config (numisdata247): section_id cells, leaf portals
		['dc1', '65', ['numisdata5']],
		// numisdata6 declares NO indexation_list → whole grid empty
		['terr1', '140', ['numisdata6']],
		// tag_id locators on rsc167 grouped under section_top oh1 (oh6 config)
		['cu1', '1', ['rsc167']],
		['dz1', '1024', ['rsc167']],
		// TWO section groups in one grid (rsc205 + tchi1's tchi92 config with
		// default-request-config portal recursion)
		['cont1', '38', ['rsc205', 'tchi1']],
		// rsc420 has no indexation_list → its group is skipped, rsc205 renders
		['ds1', '47', ['rsc205', 'rsc420']],
		// pagination: cont1_31 has 8 hits → limit 3 offset 2
		['cont1', '31', ['rsc205', 'tchi1'], 3, 2],
	];

	for (const [termTipo, termId, target, limit, offset] of CASES) {
		test(`grid for ${termTipo}_${termId} (${target.join('+')}${limit !== undefined ? `, limit ${limit} offset ${offset}` : ''}) is DEEP-EQUAL to PHP`, async () => {
			if (!hasPhpCredentials()) return;
			const rqo = gridRqo(termTipo, termId, target, limit ?? 200, offset ?? 0);
			const [ts, php] = [await tsGrid(rqo), await client.call(rqo)];
			expect(ts.status).toBe(200);
			// WC-2026-08-10-section-id-int-canonical: address keys compared by VALUE on BOTH sides (fixtures keep the PHP-era numeric strings).
			expect(normalizeSectionIdTypes(ts.body.data)).toEqual(
				normalizeSectionIdTypes(php.body.result) as never,
			);
		});
	}

	test('the gate is not vacuous: the rich case resolves real values', async () => {
		if (!hasPhpCredentials()) return;
		const ts = await tsGrid(gridRqo('cont1', '10', ['rsc205']));
		const json = JSON.stringify(ts.body.data);
		// real record values, not just structure
		expect(json).toContain('Ercávica celtibérica');
		expect(json).toContain('component_portal');
		expect(json).toContain('record_link');
		expect(json).toContain('caption section rsc205');
	});

	test('empty/invalid source → the SAME refusal, restated as envelope v2 (request.invalid_source, 400)', async () => {
		if (!hasPhpCredentials()) return;
		const rqo = {
			action: 'get_indexation_grid',
			dd_api: 'dd_core_api',
			prevent_lock: true,
			source: { section_tipo: 'cont1' }, // tipo + section_id missing
			sqo: {},
		};
		const ts = await tsGrid(rqo);
		const php = await client.call(rqo);
		// The frozen PHP body is projected through the parity reconciler
		// (FROZEN_ERROR_BODIES → registry code); TS answers the registry status
		// (envelope v2: ok:false ⇒ status ∉ 2xx — ERRORS_SPEC §3).
		const adopted = adoptErrorEnvelopeV2(php.body);
		expect(adopted.matched).toBe(true);
		expect(adopted.kind).toBe('error');
		expect(ts.status).toBe(CATEGORY_STATUS[specOf('request.invalid_source').category]);
		expect(ts.body.ok).toBe(false);
		expect((ts.body.error as { code: string }).code).toBe(
			(adopted.projection as { error: { code: string } }).error.code,
		);
	});

	test('no-permission answers the registered perm.denied (403, white-box)', async () => {
		// PHP permission_exception → dd_manager:458 'permissions_denied' at 200;
		// envelope v2 restates it as the registered `perm.denied` at the registry
		// status (the client's error policy keys on the code, not on a falsy result).
		const nonAdmin: ApiRequestContext = {
			requestId: 'test',
			clientIp: '127.0.0.1',
			session: {
				userId: 999999,
				username: 'nobody',
				isGlobalAdmin: false,
				csrfToken: 'tok',
				applicationLang: null,
				dataLang: null,
			},
			csrfCandidate: 'tok',
			principal: { userId: 999999, isGlobalAdmin: false, isDeveloper: false },
		};
		const outcome = await runWithRequestLangs(
			{ applicationLang: 'lg-spa', dataLang: 'lg-spa' },
			() => dispatchRqo(gridRqo('cont1', '10', ['rsc205']) as unknown as Rqo, nonAdmin),
		);
		expect(outcome.status).toBe(CATEGORY_STATUS[specOf('perm.denied').category]);
		expect(outcome.body.ok).toBe(false);
		expect((outcome.body.error as { code: string }).code).toBe('perm.denied');
	});
});
