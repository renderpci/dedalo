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

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { readSection } from '../../src/core/section/read.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

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
