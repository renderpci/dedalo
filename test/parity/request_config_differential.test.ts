/**
 * Phase 4d gate: request_config explicit differential — the TS-parsed config on the
 * portal's context entry vs the live PHP context request_config for the same
 * RQO (portal numisdata163).
 *
 * Compared per item: api_engine, type, sqo.section_tipo (PHP enriches these
 * into dd_objects — compare the tipo identity), and the show ddo_map's
 * resolved (tipo, parent, section_tipo, mode) per ddo, in order. Enriched-ddo
 * extras (buttons/color/permissions on section ddos, fixed_filter expansion)
 * are ledgered as uncovered.
 */
// BINDS INSTALL TLDs: numisdata, rsc, zenon — install-specific fixtures, grandfathered in
// engineering/generic_tld_baseline.json (generic_tld_tripwire, shrink-only). This test
// is meaningful only on a database holding those installs' records. Migrate it to a
// built situation (src/core/test_data/situations) or the generic `test` TLD, then
// regenerate the baseline (`bun run scripts/generic_tld_baseline.ts`).

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { readSection } from '../../src/core/section/read.ts';
import { hasPhpCredentials, PhpApiClient } from './php_client.ts';

/**
 * The external-engine case needs the `zenon` ontology on the SUITE database.
 * The default suite DB is the test3 playground, which does not carry it — so
 * the case is reported as an explicit SKIP there (S2-40: never a silent green)
 * and runs on an installation whose DB has it. The DB-independent twin of the
 * same contract is test/unit/external_request_config_native.test.ts, which
 * builds its own scratch external section and always runs.
 */
const ZENON_ONTOLOGY_PRESENT =
	((await sql`SELECT tipo FROM dd_ontology WHERE tipo = 'zenon1' LIMIT 1`) as unknown[]).length > 0;

const READ_RQO = {
	action: 'read',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	source: {
		model: 'section',
		tipo: 'numisdata6',
		section_tipo: 'numisdata6',
		mode: 'list',
		lang: 'lg-spa',
		action: 'search',
	},
	sqo: {
		section_tipo: ['numisdata6'],
		filter_by_locators: [{ section_tipo: 'numisdata6', section_id: '2' }],
		limit: 1,
		offset: 0,
	},
	show: {
		// Case B (client narrowing): the rqo carries the portal's child, so both
		// engines narrow show.ddo_map to it. Case A (no children → ontology
		// list-default narrowing via with_value) is LEDGERED uncovered scope.
		ddo_map: [
			{ tipo: 'numisdata163', section_tipo: 'self', parent: 'self', mode: 'list' },
			{
				tipo: 'rsc473',
				section_tipo: 'rsc332',
				parent: 'numisdata163',
				mode: 'list',
				lang: 'lg-spa',
			},
		],
	},
};

interface RawDdo {
	tipo: string;
	parent?: string;
	section_tipo?: string | string[];
	mode?: string;
}

/** Normalized ddo identity both sides must agree on. */
function ddoIdentity(ddo: RawDdo): Record<string, unknown> {
	return {
		tipo: ddo.tipo,
		parent: ddo.parent,
		section_tipo: ddo.section_tipo,
		mode: ddo.mode,
	};
}

/** The first non-dedalo request_config item on ANY context entry (rsc368's zenon one). */
function externalItemOf(context: Record<string, unknown>[]): Record<string, unknown> | undefined {
	for (const entry of context ?? []) {
		const items = (entry.request_config as Record<string, unknown>[] | undefined) ?? [];
		const external = items.find((item) => (item.api_engine ?? 'dedalo') !== 'dedalo');
		if (external !== undefined) return external;
	}
	return undefined;
}

/** The step-9 hydrated surface of an external item's show ddos. */
function externalDdoSurface(
	item: Record<string, unknown> | undefined,
): { tipo: unknown; fields_map: unknown; lang: unknown; permissions: unknown; model: unknown }[] {
	const map =
		((item?.show as { ddo_map?: Record<string, unknown>[] } | null)?.ddo_map as
			| Record<string, unknown>[]
			| undefined) ?? [];
	return map.map((ddo) => ({
		tipo: ddo.tipo,
		fields_map: ddo.fields_map,
		lang: ddo.lang,
		permissions: ddo.permissions,
		model: ddo.model,
	}));
}

/** Extract section tipos from a request_config sqo (PHP enriches to dd_objects). */
function sqoSectionTipos(sqo: { section_tipo?: unknown }): string[] {
	const entries = Array.isArray(sqo.section_tipo) ? sqo.section_tipo : [];
	return entries.map((entry) =>
		typeof entry === 'string' ? entry : ((entry as { tipo?: string }).tipo ?? ''),
	);
}

describe.if(hasPhpCredentials())('request_config explicit differential (Phase 4d gate)', () => {
	let phpConfig: Record<string, unknown>[];
	let tsConfig: Record<string, unknown>[];

	beforeAll(async () => {
		if (!hasPhpCredentials()) return;
		const client = new PhpApiClient();
		await client.login(
			config.phpReference.username as string,
			config.phpReference.password as string,
		);
		const { body } = await client.call(structuredClone(READ_RQO));
		const phpContext = (body.result as { context: Record<string, unknown>[] }).context;
		const phpPortal = phpContext.find((entry) => entry.tipo === 'numisdata163');
		phpConfig = (phpPortal?.request_config as Record<string, unknown>[]) ?? [];

		const tsResult = await readSection(READ_RQO as unknown as Rqo);
		const tsPortal = tsResult.context.find((entry) => entry.tipo === 'numisdata163');
		tsConfig = (tsPortal?.request_config as Record<string, unknown>[]) ?? [];
	});

	test('item count, api_engine, type and sqo target sections match', () => {
		if (!hasPhpCredentials()) return;
		expect(tsConfig.length).toBe(phpConfig.length);
		expect(tsConfig.length).toBeGreaterThan(0);
		for (let index = 0; index < phpConfig.length; index++) {
			const phpItem = phpConfig[index] as Record<string, unknown>;
			const tsItem = tsConfig[index] as Record<string, unknown>;
			expect(tsItem.api_engine).toBe(phpItem.api_engine ?? 'dedalo');
			expect(tsItem.type).toBe(phpItem.type ?? 'main');
			expect(sqoSectionTipos(tsItem.sqo as { section_tipo?: unknown })).toEqual(
				sqoSectionTipos(phpItem.sqo as { section_tipo?: unknown }),
			);
		}
	});

	test('case A (no rqo children): list-mode implicit fallback narrows to the section_list columns', async () => {
		if (!hasPhpCredentials()) return;
		const caseARqo = structuredClone(READ_RQO) as typeof READ_RQO;
		caseARqo.show.ddo_map = [
			{ tipo: 'numisdata163', section_tipo: 'self', parent: 'self', mode: 'list' },
		];

		const client = new PhpApiClient();
		await client.login(
			config.phpReference.username as string,
			config.phpReference.password as string,
		);
		const { body } = await client.call(structuredClone(caseARqo));
		const phpPortal = (body.result as { context: Record<string, unknown>[] }).context.find(
			(entry) => entry.tipo === 'numisdata163',
		);
		const phpMap = (
			(phpPortal?.request_config as Record<string, unknown>[])?.[0] as {
				show?: { ddo_map?: RawDdo[] };
			}
		)?.show?.ddo_map;

		const tsResult = await readSection(caseARqo as unknown as Rqo);
		const tsPortal = tsResult.context.find((entry) => entry.tipo === 'numisdata163');
		const tsMap = (
			(tsPortal?.request_config as Record<string, unknown>[])?.[0] as {
				show?: { ddo_map?: RawDdo[] };
			}
		)?.show?.ddo_map;

		expect(tsMap?.length).toBe(phpMap?.length);
		expect(tsMap?.length).toBe(1); // the section_list child's single column
		expect(ddoIdentity(tsMap?.[0] as RawDdo)).toEqual(ddoIdentity(phpMap?.[0] as RawDdo));
	}, 30000);

	/**
	 * THE EXTERNAL-ENGINE ITEM (rsc368's second request_config, api_engine
	 * 'zenon'). Two wire facts this pins, both live CLIENT contracts:
	 *
	 *  - `api_config` — component_portal.js:2054 builds the record link as
	 *    `api_config.ui_base_url + section_id`, and service_autocomplete.js:1039
	 *    POSTs to `api_config.api_url_search`. TS publishes a SHAPED copy
	 *    (publishApiConfig); on this installation's data that is field-identical
	 *    to the oracle's raw echo, which is what this asserts.
	 *  - the HYDRATED `fields_map` (step 9) — service_autocomplete.js:911/:1060
	 *    read `show.ddo_map[j].fields_map[0].remote` to shape the answer and to
	 *    build `&field[]=`. The ontology stores the flag `fields_map: true`; if
	 *    the engine leaves it a boolean the autocomplete asks for no fields.
	 *
	 * Driven through case A's rqo (the one whose harvested answer carries the
	 * rsc368 context).
	 */
	test.if(ZENON_ONTOLOGY_PRESENT)(
		'external engine item: api_config + hydrated fields_map match PHP',
		async () => {
			if (!hasPhpCredentials()) return;
			const caseARqo = structuredClone(READ_RQO) as typeof READ_RQO;
			caseARqo.show.ddo_map = [
				{ tipo: 'numisdata163', section_tipo: 'self', parent: 'self', mode: 'list' },
			];

			const client = new PhpApiClient();
			await client.login(
				config.phpReference.username as string,
				config.phpReference.password as string,
			);
			const { body } = await client.call(structuredClone(caseARqo));
			const phpItem = externalItemOf(
				(body.result as { context: Record<string, unknown>[] }).context,
			);
			const tsResult = await readSection(caseARqo as unknown as Rqo);
			const tsItem = externalItemOf(tsResult.context as unknown as Record<string, unknown>[]);

			// The fixture MUST still carry the case (a silent absence would make every
			// assertion below vacuous).
			expect(phpItem, 'no api_engine!==dedalo item in the oracle answer').toBeDefined();
			expect(tsItem).toBeDefined();

			// api_config: same fields, same values (key order is not a wire fact).
			expect(tsItem?.api_config).toEqual(phpItem?.api_config as never);
			expect(
				(tsItem?.api_config as { ui_base_url?: string })?.ui_base_url,
				'a non-http(s) ui_base_url would be stored XSS on the portal edit click',
			).toMatch(/^https?:\/\//);

			// The hydrated per-ddo surface the autocomplete reads.
			expect(externalDdoSurface(tsItem)).toEqual(externalDdoSurface(phpItem) as never);
			for (const ddo of externalDdoSurface(tsItem)) {
				expect(Array.isArray(ddo.fields_map), `${ddo.tipo} fields_map stayed a flag`).toBe(true);
			}
		},
		30000,
	);

	test('show ddo_map resolves identically (tipo/parent/section_tipo/mode, in order)', () => {
		if (!hasPhpCredentials()) return;
		for (let index = 0; index < phpConfig.length; index++) {
			const phpShow = (phpConfig[index] as { show?: { ddo_map?: RawDdo[] } }).show;
			const tsShow = (tsConfig[index] as { show?: { ddo_map?: RawDdo[] } }).show;
			const phpMap = phpShow?.ddo_map ?? [];
			const tsMap = tsShow?.ddo_map ?? [];
			expect(tsMap.length).toBe(phpMap.length);
			for (let ddoIndex = 0; ddoIndex < phpMap.length; ddoIndex++) {
				expect(ddoIdentity(tsMap[ddoIndex] as RawDdo)).toEqual(
					ddoIdentity(phpMap[ddoIndex] as RawDdo),
				);
			}
		}
	});
});
