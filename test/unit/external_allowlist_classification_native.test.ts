/**
 * REGRESSION GATE — the egress allowlist must never block CLASSIFICATION
 * (2026-09-27: every time-machine restore failed with `update.refused …
 * blocked_host` on an install whose DEDALO_EXTERNAL_ALLOWED_HOSTS was the safe
 * default, EMPTY).
 *
 * The defect: `parseApiConfig` checked the api_url host against the allowlist.
 * Parse runs for every "is this section external?" question
 * (`isExternalReferenceSection`), and `listExternalSectionTipos` classifies
 * EVERY api_config carrier on EVERY restore — so one carrier (the suite's test3
 * carries a zenon binding) turned a restore of an unrelated component into a
 * refusal, although nothing was ever going to be contacted. The allowlist
 * belongs to the OUTBOUND DOOR (`fetchExternalJson`, refused before DNS —
 * external_secret_confinement_tripwire (c) drives it); parse checks SHAPE only.
 *
 * Every case runs with the allowlist FORCED EMPTY, so the ambient .env cannot
 * mask the defect. Re-adding the parse-time host check reddens (a)–(d).
 *
 * THE SITUATION IS BUILT (`zzxal`, dropped in afterAll, residue asserted 0):
 *   zzxal1 section — a TRUE external section bound to a non-allowlisted host
 *          (`external.invalid`; nothing fetches) + its component_external zzxal2;
 *   zzxal3 section — a plain LOCAL section on matrix_test + component_number
 *          zzxal4, the restore target.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { classifyWireSectionId } from '../../src/core/concepts/section_id.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import { listExternalSectionTipos } from '../../src/core/update/transform/section_id_restore.ts';
import { isExternalReferenceSection } from '../../src/external/api/index.ts';
import { externalSettings, overrideExternalSettingsForTests } from '../../src/external/settings.ts';
import { isAllowedExternalHost } from '../../src/external/transport.ts';
import { toolTimeMachineApplyValue } from '../../tools/tool_time_machine/server/tool_time_machine.ts';

const EXTERNAL = 'zzxal1';
const EXTERNAL_ID = 'zzxal2';
const LOCAL = 'zzxal3';
const LOCAL_NUMBER = 'zzxal4';
const HOST = 'external.invalid';

const S = situation({
	tld: 'zzxal',
	name: 'the allowlist never blocks classification',
	nodes: [
		{
			tipo: EXTERNAL,
			model: 'section',
			parent: 'dd14',
			properties: {
				api_config: {
					entity: 'zenon',
					api_url: `https://${HOST}/api/v1/record`,
					api_url_search: `https://${HOST}/api/v1/search`,
					ui_base_url: `https://${HOST}/Record/`,
					response_map: [{ local: 'ar_records', remote: 'records' }],
				},
			},
		},
		{
			tipo: EXTERNAL_ID,
			model: 'component_external',
			parent: EXTERNAL,
			properties: { fields_map: [{ local: 'dato', remote: 'id' }] },
		},
		{ tipo: LOCAL, model: 'section', parent: 'test1', relations: [{ tipo: 'test24' }] },
		{ tipo: LOCAL_NUMBER, model: 'component_number', parent: LOCAL },
	],
});

beforeAll(async () => {
	await ensureSituation(S);
	expect(await getMatrixTableFromTipo(LOCAL)).toBe('matrix_test');
});

afterAll(async () => {
	overrideExternalSettingsForTests(null);
	// The dd542 rows apply_value appends are outside the situation's own sweep.
	await sql.unsafe(`DELETE FROM matrix_activity WHERE data->>'section_tipo' = $1`, [LOCAL]);
	expect(await dropSituation(S)).toBe(0);
});

beforeEach(async () => {
	overrideExternalSettingsForTests({ allowedHosts: [] });
	await clearOntologyDerivedCaches();
	// Anti-vacuity: the premise of the defect, asserted rather than assumed.
	expect(externalSettings().allowedHosts).toEqual([]);
	expect(isAllowedExternalHost(HOST)).toBe(false);
});

afterEach(() => {
	overrideExternalSettingsForTests(null);
});

describe('with the allowlist EMPTY, classification still answers', () => {
	test('(a) isExternalReferenceSection on a non-allowlisted carrier answers true, no throw', async () => {
		expect(await isExternalReferenceSection(EXTERNAL)).toBe(true);
		expect(await isExternalReferenceSection(LOCAL)).toBe(false);
	});

	test('(b) listExternalSectionTipos returns the carrier set, no update.refused', async () => {
		const tipos = await listExternalSectionTipos();
		expect(tipos.has(EXTERNAL)).toBe(true);
		expect(tipos.has(LOCAL)).toBe(false);
	});

	test('(c) classifyWireSectionId on an external section keeps the remote id verbatim', async () => {
		expect(await classifyWireSectionId('001338683', EXTERNAL, 't')).toEqual({
			kind: 'external-ref',
			remoteId: '001338683',
		});
	});
});

describe('(d) a time-machine restore of a LOCAL component succeeds', () => {
	test('apply_value restores the historical value', async () => {
		const recordId = await createSectionRecord(LOCAL, -1);
		for (const changedData of [
			[{ action: 'insert', key: 0, value: { value: 10 } }],
			[{ action: 'update', id: 1, value: { id: 1, value: 20 } }],
		]) {
			const saved = await saveComponentData({
				componentTipo: LOCAL_NUMBER,
				sectionTipo: LOCAL,
				sectionId: recordId,
				lang: 'lg-nolan',
				changedData,
				userId: -1,
			});
			expect(saved.ok).toBe(true);
		}
		const rows = (await sql.unsafe(
			`SELECT id FROM matrix_time_machine
			 WHERE section_tipo = $1 AND section_id = $2 AND tipo = $3 ORDER BY id ASC`,
			[LOCAL, recordId, LOCAL_NUMBER],
		)) as { id: number }[];
		expect(rows.length).toBe(2);

		const response = await toolTimeMachineApplyValue({
			principal: await resolvePrincipal(-1),
			userId: -1,
			options: {
				section_tipo: LOCAL,
				section_id: recordId,
				tipo: LOCAL_NUMBER,
				lang: 'lg-nolan',
				matrix_id: rows[0]?.id,
			},
			background: false,
		});
		expect(response.ok).toBe(true);

		const [stored] = (await sql.unsafe(
			`SELECT number->$3 AS items FROM matrix_test WHERE section_tipo = $1 AND section_id = $2`,
			[LOCAL, recordId, LOCAL_NUMBER],
		)) as { items: { value?: number }[] }[];
		expect(stored?.items.map((item) => item.value)).toEqual([10]);
	});
});
