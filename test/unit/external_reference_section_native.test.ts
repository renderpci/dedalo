/**
 * THE ONE EXTERNALITY PREDICATE at the section_id doors (2026-09-24,
 * WC-2026-08-10-section-id-int-canonical addendum 2026-09-24).
 *
 * "Is this section external?" is `isExternalReferenceSection` (src/external/
 * record_fields.ts): the section binds a service (`api_config`) AND owns a
 * component_external. `api_config` ALONE is residue — `rsc205` carries a stale
 * copy over 21k real local records. The api_config-only boolean
 * (`isExternalSectionTipo`) was DELETED; two doors still decided on it:
 *
 *  1. the WIRE classifier (`classifyWireSectionId` — dd_core_api read/save,
 *     permissions, import_conform): a non-address on a residue section was
 *     `external-ref` (echoed / stored verbatim as a "remote id"); it is now the
 *     LOCAL rule — `synthetic`, or `section_id.numeric_shaped` refused;
 *  2. the RESTORE/SWEEP externality set (`listExternalSectionTipos` → the intify
 *     kernel): a residue section's junk passed as `external-skip`; it is now
 *     classed like any local section's (`empty`, `leading-zero`, `token`…).
 *
 * THE SITUATION IS BUILT (`zzxr`, dropped in afterAll, residue asserted 0):
 *   zzxr1 section — api_config RESIDUE (the rsc205 twin): the binding, a stored
 *         component, NO component_external;
 *   zzxr3 section — a TRUE external section: the binding + component_external zzxr4;
 *   zzxr5 section — VIRTUAL of zzxr3 (borrows its component_external) with its
 *         own api_config: external through the real section's subtree.
 * NO SOCKET: the api_config points at `external.invalid`; nothing fetches.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { classifyWireSectionId, type SectionId } from '../../src/core/concepts/section_id.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import { intifySectionIdsInValue } from '../../src/core/update/transform/section_id_intify.ts';
import { listExternalSectionTipos } from '../../src/core/update/transform/section_id_restore.ts';
import * as externalApi from '../../src/external/api/index.ts';
import { externalSettings, overrideExternalSettingsForTests } from '../../src/external/settings.ts';

const RESIDUE = 'zzxr1';
const RESIDUE_NOTE = 'zzxr2';
const EXTERNAL = 'zzxr3';
const EXTERNAL_ID = 'zzxr4';
const VIRTUAL = 'zzxr5';

const API_CONFIG = {
	entity: 'zenon',
	api_url: 'https://external.invalid/api/v1/record',
	ui_base_url: 'https://external.invalid/Record/',
	response_map: [{ local: 'ar_records', remote: 'records' }],
};

const S = situation({
	tld: 'zzxr',
	name: 'externality is the binding AND an owned component_external',
	nodes: [
		{
			tipo: RESIDUE,
			model: 'section',
			parent: 'dd14',
			properties: { api_config: API_CONFIG },
		},
		{ tipo: RESIDUE_NOTE, model: 'component_input_text', parent: RESIDUE },
		{
			tipo: EXTERNAL,
			model: 'section',
			parent: 'dd14',
			properties: { api_config: API_CONFIG },
		},
		{
			tipo: EXTERNAL_ID,
			model: 'component_external',
			parent: EXTERNAL,
			properties: { fields_map: [{ local: 'dato', remote: 'id' }] },
		},
		{
			tipo: VIRTUAL,
			model: 'section',
			parent: 'dd14',
			relations: [{ tipo: EXTERNAL }],
			properties: { api_config: API_CONFIG },
		},
	],
});

beforeAll(async () => {
	await ensureSituation(S);
});

afterAll(async () => {
	overrideExternalSettingsForTests(null);
	expect(await dropSituation(S)).toBe(0);
});

beforeEach(async () => {
	// Keep every host the ambient suite ontology binds (listExternalSectionTipos
	// validates EVERY api_config carrier) and add the situation's inert one.
	overrideExternalSettingsForTests({
		allowedHosts: [...externalSettings().allowedHosts, 'external.invalid'],
	});
	await clearOntologyDerivedCaches();
});

afterEach(() => {
	overrideExternalSettingsForTests(null);
});

describe('the predicate itself', () => {
	test('residue (binding, no component_external) is NOT external; the owner and its virtual are', async () => {
		expect(await externalApi.getExternalServiceForSection(RESIDUE)).not.toBeNull();
		expect(await externalApi.isExternalReferenceSection(RESIDUE)).toBe(false);
		expect(await externalApi.isExternalReferenceSection(EXTERNAL)).toBe(true);
		expect(await externalApi.isExternalReferenceSection(VIRTUAL)).toBe(true);
	});

	test('the facade offers no api_config-only boolean to decide on', () => {
		expect('isExternalSectionTipo' in externalApi).toBe(false);
	});
});

describe('the wire classifier on an api_config RESIDUE section obeys the LOCAL rule', () => {
	test("a non-numeric non-address is synthetic, not an external-ref ('abc' was echoed as a remote id)", async () => {
		expect(await classifyWireSectionId('abc', RESIDUE, 't')).toEqual({
			kind: 'synthetic',
			token: 'abc',
		});
	});

	test("a numeric-shaped non-address ('007', out-of-range) is REFUSED, never a remote id", async () => {
		await expect(classifyWireSectionId('007', RESIDUE, 't')).rejects.toMatchObject({
			code: 'section_id.numeric_shaped',
		});
		await expect(classifyWireSectionId('9007199254740992', RESIDUE, 't')).rejects.toMatchObject({
			code: 'section_id.numeric_shaped',
		});
	});

	test('a record address is a record, as on any tipo', async () => {
		expect(await classifyWireSectionId('7', RESIDUE, 't')).toEqual({
			kind: 'record',
			id: 7 as SectionId,
		});
	});
});

describe('the wire classifier on a TRUE external section is unchanged', () => {
	test('padded and opaque non-addresses are external-refs, verbatim', async () => {
		for (const remoteId of ['001338683', 'Q42', 'abc']) {
			expect(await classifyWireSectionId(remoteId, EXTERNAL, 't')).toEqual({
				kind: 'external-ref',
				remoteId,
			});
			// virtual-aware: the component_external is borrowed from the real section
			expect(await classifyWireSectionId(remoteId, VIRTUAL, 't')).toEqual({
				kind: 'external-ref',
				remoteId,
			});
		}
		expect(await classifyWireSectionId('7', EXTERNAL, 't')).toEqual({
			kind: 'record',
			id: 7 as SectionId,
		});
	});
});

describe('the restore/sweep externality set treats residue ids as LOCAL', () => {
	test('listExternalSectionTipos keeps the owner and its virtual, drops the residue', async () => {
		const externalTipos = await listExternalSectionTipos();
		expect(externalTipos.has(EXTERNAL)).toBe(true);
		expect(externalTipos.has(VIRTUAL)).toBe(true);
		expect(externalTipos.has(RESIDUE)).toBe(false);
	});

	test('the intify kernel classes residue junk like a local section, and still skips true remote ids', async () => {
		const externalTipos = await listExternalSectionTipos();
		const value = {
			zzxr_rel: [
				{ type: 'dd151', section_tipo: RESIDUE, section_id: '' },
				{ type: 'dd151', section_tipo: RESIDUE, section_id: '001338683' },
				{ type: 'dd151', section_tipo: RESIDUE, section_id: '12' },
				{ type: 'dd151', section_tipo: EXTERNAL, section_id: '001338683' },
			],
		};
		const result = intifySectionIdsInValue(value, { externalTipos });
		// (the kernel's walk order is not the contract — compare as a sorted set)
		const classes = result.findings
			.map((finding) => [finding.sectionTipo, finding.class])
			.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
		expect(classes).toEqual(
			[
				[RESIDUE, 'empty'],
				[RESIDUE, 'leading-zero'],
				[EXTERNAL, 'external-skip'],
			].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
		);
		// Addresses convert on any tipo; the remote id survives byte for byte.
		expect(value.zzxr_rel[2]?.section_id).toBe(12 as unknown as string);
		expect(value.zzxr_rel[3]?.section_id).toBe('001338683');
	});
});
