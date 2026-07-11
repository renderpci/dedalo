/**
 * Request-config PRESETS gate (PHP core/common/class.request_config_presets.php +
 * common::resolve_preset_properties). An ACTIVE dd1244 layout preset for a
 * (tipo, section_tipo, mode) triple REPLACES the ontology-derived section
 * request_config, so the section renders the saved component layout instead of
 * the default edit-form tree.
 *
 * Fixture: dd1244 record 1 (demo, PUBLIC + ACTIVE) targets section test3 in
 * EDIT mode and shows a SINGLE component. The test derives its expectation from
 * the live preset record (never a hardcoded tipo), so it stays honest if the
 * demo layout changes — but FAILS LOUDLY if the preset record is removed or the
 * override stops applying (guarding against a vacuous green).
 *
 * Asserts:
 *  1. the TS reader hydrates the active preset for test3/edit;
 *  2. the TS section EDIT context collapses to exactly the preset's ddos;
 *  3. it equals live PHP EXACTLY (same tipos, same order);
 *  4. LIST mode does NOT inherit the edit-mode preset (mode-keyed match).
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import {
	type RequestConfigPreset,
	getActiveRequestConfigPresets,
} from '../../src/core/relations/request_config/presets.ts';
import { buildStructureContext } from '../../src/core/resolve/structure_context.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

const SECTION = 'test3';

type Ddoish = { tipo: string };

function ddoTiposFromEntry(entry: unknown): string[] {
	const config = (entry as { request_config?: { show?: { ddo_map?: Ddoish[] } }[] } | null)
		?.request_config;
	return (config?.[0]?.show?.ddo_map ?? []).map((ddo) => ddo.tipo);
}

async function phpSectionDdoTipos(client: PhpApiClient, mode: string): Promise<string[]> {
	const { body } = await client.call({
		action: 'get_element_context',
		dd_api: 'dd_core_api',
		source: { model: 'section', tipo: SECTION, section_tipo: SECTION, mode, lang: 'lg-spa' },
	} as unknown as Record<string, unknown>);
	return ddoTiposFromEntry((body.result as unknown[])[0]);
}

async function tsSectionDdoTipos(mode: string): Promise<string[]> {
	const entry = await buildStructureContext({
		tipo: SECTION,
		sectionTipo: SECTION,
		mode,
		lang: 'lg-spa',
		permissions: 3,
	});
	return ddoTiposFromEntry(entry);
}

describe.if(hasPhpCredentials())(
	'request_config presets differential (dd1244 layout override)',
	() => {
		let editPreset: RequestConfigPreset | undefined;
		let presetTipos: string[];
		let phpEditTipos: string[];
		let tsEditTipos: string[];
		let phpListTipos: string[];
		let tsListTipos: string[];

		beforeAll(async () => {
			if (!hasPhpCredentials()) return;
			const client = new PhpApiClient();
			await client.login(
				config.phpReference.username as string,
				config.phpReference.password as string,
			);

			const presets = await getActiveRequestConfigPresets();
			editPreset = presets.find(
				(preset) =>
					preset.tipo === SECTION && preset.sectionTipo === SECTION && preset.mode === 'edit',
			);
			presetTipos = (
				(editPreset?.data?.[0] as { show?: { ddo_map?: Ddoish[] } } | undefined)?.show?.ddo_map ??
				[]
			).map((ddo) => ddo.tipo);

			phpEditTipos = await phpSectionDdoTipos(client, 'edit');
			tsEditTipos = await tsSectionDdoTipos('edit');
			phpListTipos = await phpSectionDdoTipos(client, 'list');
			tsListTipos = await tsSectionDdoTipos('list');
		});

		test('the TS reader hydrates the active edit preset for test3 (fixture present)', () => {
			if (!hasPhpCredentials()) return;
			expect(editPreset).toBeDefined();
			expect(editPreset?.public).toBe(true);
			expect(presetTipos.length).toBeGreaterThan(0);
		});

		test('the TS edit context collapses to exactly the preset ddos, and equals PHP', () => {
			if (!hasPhpCredentials()) return;
			// The preset overrides the full edit-form tree down to its own ddo list.
			expect(tsEditTipos).toEqual(presetTipos);
			expect(tsEditTipos).toEqual(phpEditTipos);
		});

		test('LIST mode does not inherit the edit-mode preset (mode-keyed match)', () => {
			if (!hasPhpCredentials()) return;
			// The edit preset must not leak into list; both engines keep the default
			// section_list columns, which are more than the single edit-preset ddo.
			expect(tsListTipos).toEqual(phpListTipos);
			expect(tsListTipos).not.toEqual(presetTipos);
		});
	},
);
