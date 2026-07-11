/**
 * choose.sqo_config.limit SERVER-side synthesis (PHP parse_choose_config,
 * trait.request_config_v6.php:549-563): a config WITH a choose block always
 * ships the autocomplete selection limit — choose's own → search.sqo_config →
 * show.sqo_config → 25 — while a choose-LESS config (numisdata161) stays
 * choose-less (the byte-identical client owns that fallback chain, common.js
 * build_rqo_search). Live corpus anchors probed vs PHP 2026-07-09: oh25
 * (choose without sqo_config, search limit 30 → PHP emits {limit:30}).
 */

import { describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { getNode } from '../../src/core/ontology/resolver.ts';
import { buildExplicitRequestConfig } from '../../src/core/relations/request_config/explicit.ts';
import { runWithRequestLangs } from '../../src/core/resolve/request_lang.ts';

let hasDb = false;
try {
	await sql`SELECT 1`;
	hasDb = true;
} catch {
	console.warn('[request_config_choose_limit] DB unavailable — corpus drives SKIPPED');
}

const buildFor = async (tipo: string, sectionTipo: string) =>
	runWithRequestLangs({ applicationLang: 'lg-spa', dataLang: 'lg-spa' }, async () =>
		buildExplicitRequestConfig((await getNode(tipo))?.properties ?? null, {
			ownerTipo: tipo,
			ownerSectionTipo: sectionTipo,
			mode: 'list',
			ownerIsSection: false,
		}),
	);

describe.if(hasDb)('choose.sqo_config.limit synthesis (oh25 / numisdata161 corpus)', () => {
	test('choose without sqo_config inherits the SEARCH limit (oh25 → 30)', async () => {
		const config = await buildFor('oh25', 'oh1');
		const choose = config[0]?.choose as { sqo_config?: { limit?: number } } | null;
		expect(choose?.sqo_config?.limit).toBe(30);
	});

	test('a choose-less config stays choose-less (numisdata161 — client-owned fallback)', async () => {
		const config = await buildFor('numisdata161', 'numisdata4');
		expect(config[0]?.choose).toBeNull();
		// its search/show maps still parse fully (the picker's source definitions)
		expect((config[0]?.search?.ddo_map ?? []).length).toBeGreaterThan(0);
		expect((config[0]?.show?.ddo_map ?? []).length).toBeGreaterThan(0);
	});
});
