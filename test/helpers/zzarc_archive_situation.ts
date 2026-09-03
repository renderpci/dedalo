/**
 * THE ARCHIVE SITUATION — a built section set in which EVERY component model of
 * the registry has a stored value, so the archive round-trip gate
 * (test/unit/raw_roundtrip_native.test.ts) and the locator-existence gate
 * (test/unit/conform_locator_existence_native.test.ts) sweep the whole storage
 * surface rather than the models an author happened to remember.
 *
 * ── THE SHAPE ────────────────────────────────────────────────────────────────
 *   zzarc1     section  MAIN — one child component per registry model
 *     zzarc1<nn>   one node per model (VALUE_BY_MODEL below names the tipo)
 *   zzarc10    section  TARGET — the records the MAIN's locators point at
 *     zzarc1001    component_input_text
 *   zzarc20    section  OUTSIDE — exists in the source, NOT archived: the
 *     zzarc2001    component_input_text          external-reference twin
 *   zzarc30    section  VIRTUAL over zzarc10 (relations name the TARGET, a
 *                       node of model `section` — getSectionRealTipo → zzarc10,
 *                       like a thesaurus hierarchy over its real section): its
 *                       records store under zzarc10's component tipos, its own
 *                       child is a list decoration
 *     zzarc3001    exclude_elements
 *
 * Records: zzarc1/1 (every model holds a value; every jsonb column non-null),
 * zzarc1/2 (a sparse record — most columns SQL NULL, the null-preservation
 * control), zzarc10/1 + /2 (locator targets), zzarc20/1 (an external target
 * that EXISTS in the source), zzarc30/1 (the virtual section's record — its
 * column key zzarc1001 is defined by the REAL section only). One MAIN locator
 * points at zzarc20/999, which exists nowhere — the dangling control.
 *
 * TWO VALUES ARE PLANTED AS RAW TEXT after the situation is ensured, because
 * they cannot be expressed as a JS value: `1.10` (a jsonb numeric a
 * JSON.parse/stringify hop would turn into `1.1`) and a `relation_search`
 * ancestor index. The archive must carry both byte-exact.
 *
 * MEDIA: real files are planted in a MARKED scratch root — the image's default
 * quality + thumb and the AV posterframe — at the exact paths the engine's own
 * path grammar resolves for these nodes, so the extraction's file walk finds
 * them the way it would on an installation.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../../src/config/config.ts';
import { allComponentModels } from '../../src/core/components/registry.ts';
import { mediaTypeOf } from '../../src/core/concepts/media.ts';
import { updateMatrixRecord } from '../../src/core/db/matrix_write.ts';
import { buildMediaLocation, posterframeLocation } from '../../src/core/media/path.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import {
	dropSituation,
	ensureSituation,
	type Situation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';

export const ZZARC_TLD = 'zzarc';
export const ZZARC_MAIN = 'zzarc1';
export const ZZARC_TARGET = 'zzarc10';
export const ZZARC_OUTSIDE = 'zzarc20';
export const ZZARC_VIRTUAL = 'zzarc30';
/** The sections an archive of this situation covers — OUTSIDE is deliberately not one. */
export const ZZARC_ARCHIVED_SECTIONS = [ZZARC_MAIN, ZZARC_TARGET, ZZARC_VIRTUAL] as const;
export const ZZARC_MAIN_IDS = [1, 2] as const;
export const ZZARC_TARGET_IDS = [1, 2] as const;
export const ZZARC_VIRTUAL_IDS = [1] as const;
/** `tipo → ids` of every archived section (the snapshot walk of the gates). */
export const ZZARC_ARCHIVED_IDS: ReadonlyArray<readonly [string, readonly number[]]> = [
	[ZZARC_MAIN, ZZARC_MAIN_IDS],
	[ZZARC_TARGET, ZZARC_TARGET_IDS],
	[ZZARC_VIRTUAL, ZZARC_VIRTUAL_IDS],
];
/** The one child the TARGET defines — the column key of every zzarc10 AND zzarc30 record. */
export const ZZARC_TARGET_CHILD = 'zzarc1001';
/** The address that exists in the source but outside the set, and the one that exists nowhere. */
export const ZZARC_EXTERNAL_EXISTING = { section_tipo: ZZARC_OUTSIDE, section_id: 1 };
export const ZZARC_EXTERNAL_DANGLING = { section_tipo: ZZARC_OUTSIDE, section_id: 999 };

/**
 * Registry models that store NOTHING in a jsonb column — the ENUMERATED,
 * shrink-only exemption list of the census, each with its reason.
 */
export const ZZARC_STORAGE_EXEMPT: Readonly<Record<string, string>> = {
	component_section_id:
		"descriptor column is 'section_id' — the structural column, not a jsonb one; the archive carries it as the record key",
};

interface ModelValue {
	tipo: string;
	column: string;
	value: unknown;
}

const locator = (
	tipo: string,
	target: { section_tipo: string; section_id: number },
	extra = {},
) => ({
	type: 'dd151',
	section_tipo: target.section_tipo,
	section_id: target.section_id,
	from_component_tipo: tipo,
	...extra,
});
const T1 = { section_tipo: ZZARC_TARGET, section_id: 1 };
const T2 = { section_tipo: ZZARC_TARGET, section_id: 2 };

/** tipo + column + stored value for EVERY model with a storage column (record zzarc1/1). */
export const VALUE_BY_MODEL: Readonly<Record<string, ModelValue>> = {
	component_input_text: {
		tipo: 'zzarc101',
		column: 'string',
		value: [
			{ value: 'Hello', lang: 'lg-eng', id: 1 },
			{ value: 'Hola', lang: 'lg-spa', id: 2 },
		],
	},
	component_text_area: {
		tipo: 'zzarc102',
		column: 'string',
		value: [{ value: '<p>first<br>second\nthird</p>', lang: 'lg-eng', id: 1 }],
	},
	component_html_text: {
		tipo: 'zzarc103',
		column: 'string',
		value: [{ value: '<b>bold</b><br/>x', lang: 'lg-eng', id: 1 }],
	},
	component_input_text_large: {
		tipo: 'zzarc104',
		column: 'string',
		value: [{ value: 'large', lang: 'lg-eng', id: 1 }],
	},
	component_email: { tipo: 'zzarc105', column: 'string', value: [{ value: 'a@b.test', id: 1 }] },
	component_password: { tipo: 'zzarc106', column: 'string', value: [{ value: '$2y$x', id: 1 }] },
	component_number: { tipo: 'zzarc107', column: 'number', value: [{ value: 3, id: 1 }] }, // 1.10 is planted RAW below
	component_date: {
		tipo: 'zzarc108',
		column: 'date',
		value: [
			{ value: { start: { year: 2020, month: 1, day: 2, hour: 0, minute: 0, second: 0 } }, id: 1 },
		],
	},
	component_iri: {
		tipo: 'zzarc109',
		column: 'iri',
		value: [{ iri: 'https://example.test/x', title: 'x', id: 1 }],
	},
	component_geolocation: {
		tipo: 'zzarc110',
		column: 'geo',
		value: [{ lat: 39.4699, lon: -0.3763, zoom: 12, alt: 0, id: 7 }],
	},
	component_image: { tipo: 'zzarc111', column: 'media', value: [{ id: 1, files_info: [] }] },
	component_av: { tipo: 'zzarc112', column: 'media', value: [{ id: 1, files_info: [] }] },
	component_pdf: { tipo: 'zzarc113', column: 'media', value: [{ id: 1, files_info: [] }] },
	component_svg: { tipo: 'zzarc114', column: 'media', value: [{ id: 1, files_info: [] }] },
	component_3d: { tipo: 'zzarc115', column: 'media', value: [{ id: 1, files_info: [] }] },
	component_info: { tipo: 'zzarc116', column: 'misc', value: [{ value: 'info', id: 1 }] },
	component_calculation: { tipo: 'zzarc117', column: 'misc', value: [{ value: 42, id: 1 }] },
	component_state: { tipo: 'zzarc118', column: 'misc', value: [{ value: 'ok', id: 1 }] },
	component_json: {
		tipo: 'zzarc119',
		column: 'misc',
		value: [{ value: { config: { a: 1, b: [true, null] } }, id: 1 }],
	},
	component_inverse: { tipo: 'zzarc120', column: 'misc', value: [{ value: 'x', id: 1 }] },
	component_filter_records: { tipo: 'zzarc121', column: 'misc', value: [{ value: 'y', id: 1 }] },
	component_security_access: { tipo: 'zzarc122', column: 'misc', value: [{ value: 2, id: 1 }] },
	component_portal: { tipo: 'zzarc123', column: 'relation', value: [locator('zzarc123', T1)] },
	component_autocomplete: {
		tipo: 'zzarc124',
		column: 'relation',
		value: [locator('zzarc124', T2)],
	},
	component_autocomplete_hi: {
		tipo: 'zzarc125',
		column: 'relation',
		value: [locator('zzarc125', T1)],
	},
	component_check_box: { tipo: 'zzarc126', column: 'relation', value: [locator('zzarc126', T1)] },
	component_dataframe: {
		tipo: 'zzarc127',
		column: 'relation',
		value: [locator('zzarc127', T2, { type: 'dd490', id_key: 1 })],
	},
	component_external: { tipo: 'zzarc128', column: 'relation', value: [locator('zzarc128', T1)] },
	component_filter: { tipo: 'zzarc129', column: 'relation', value: [locator('zzarc129', T1)] },
	component_filter_master: {
		tipo: 'zzarc130',
		column: 'relation',
		value: [locator('zzarc130', T2)],
	},
	component_publication: {
		tipo: 'zzarc131',
		column: 'relation',
		value: [locator('zzarc131', T1)],
	},
	component_radio_button: {
		tipo: 'zzarc132',
		column: 'relation',
		value: [locator('zzarc132', T1)],
	},
	component_relation_children: {
		tipo: 'zzarc133',
		column: 'relation',
		value: [locator('zzarc133', T2, { type: 'dd48' })],
	},
	component_relation_index: {
		tipo: 'zzarc134',
		column: 'relation',
		value: [locator('zzarc134', T1, { type: 'dd96', tag_id: 1 })],
	},
	component_relation_model: {
		tipo: 'zzarc135',
		column: 'relation',
		value: [locator('zzarc135', T1, { type: 'dd98' })],
	},
	component_relation_parent: {
		tipo: 'zzarc136',
		column: 'relation',
		value: [locator('zzarc136', T2, { type: 'dd47' })],
	},
	component_relation_related: {
		tipo: 'zzarc137',
		column: 'relation',
		value: [locator('zzarc137', T1, { type: 'dd89' })],
	},
	component_select: { tipo: 'zzarc138', column: 'relation', value: [locator('zzarc138', T1)] },
	component_select_lang: {
		tipo: 'zzarc139',
		column: 'relation',
		value: [locator('zzarc139', T2)],
	},
	component_security_tools: {
		tipo: 'zzarc140',
		column: 'relation',
		// THE EXTERNAL PAIR: one address outside the archived set that exists in
		// the source, one that exists nowhere.
		value: [
			locator('zzarc140', ZZARC_EXTERNAL_EXISTING),
			locator('zzarc140', ZZARC_EXTERNAL_DANGLING),
		],
	},
};

/** RAW-planted twins (jsonb text, bound verbatim) — see the header. */
export const ZZARC_RAW_NUMBER = `{"zzarc107": [{"id": 1, "value": 1.10}, {"id": 2, "value": 2}]}`;
export const ZZARC_RAW_RELATION_SEARCH = `{"zzarc125": [{"section_id": 1, "section_tipo": "zzarc10"}]}`;

/** Group the per-model values by column, the way a matrix row stores them. */
function columnsOfMain(): Record<string, Record<string, unknown>> {
	const columns: Record<string, Record<string, unknown>> = {};
	for (const { tipo, column, value } of Object.values(VALUE_BY_MODEL)) {
		columns[column] = { ...(columns[column] ?? {}), [tipo]: value };
	}
	columns.meta = { [ZZARC_MAIN]: { archived_by: 'zzarc situation' } };
	return columns;
}

export function zzarcSituation(): Situation {
	const nodes: Parameters<typeof situation>[0]['nodes'] = [
		{ tipo: ZZARC_MAIN, model: 'section' },
		{ tipo: ZZARC_TARGET, model: 'section' },
		{ tipo: ZZARC_OUTSIDE, model: 'section' },
		// VIRTUAL: the relation names the TARGET section (model `section`), so the
		// real tipo — and the table — resolve through it; no matrix_table of its own.
		{ tipo: ZZARC_VIRTUAL, model: 'section', relations: [{ tipo: ZZARC_TARGET }] },
		{ tipo: 'zzarc3001', model: 'exclude_elements', parent: ZZARC_VIRTUAL },
		{
			tipo: ZZARC_TARGET_CHILD,
			model: 'component_input_text',
			parent: ZZARC_TARGET,
			is_translatable: true,
		},
		{
			tipo: 'zzarc2001',
			model: 'component_input_text',
			parent: ZZARC_OUTSIDE,
			is_translatable: true,
		},
	];
	for (const [model, { tipo, column }] of Object.entries(VALUE_BY_MODEL)) {
		nodes.push({
			tipo,
			model,
			parent: ZZARC_MAIN,
			is_translatable: column === 'string',
			properties: column === 'media' ? { max_items_folder: 1000 } : null,
		});
	}
	return situation({
		tld: ZZARC_TLD,
		name: 'zzarc archive situation',
		nodes,
		records: [
			{ section_tipo: ZZARC_MAIN, section_id: 1, columns: columnsOfMain() },
			{
				section_tipo: ZZARC_MAIN,
				section_id: 2,
				columns: {
					string: { zzarc101: [{ value: 'sparse', lang: 'lg-eng', id: 1 }] },
					relation: { zzarc123: [locator('zzarc123', T1)] },
				},
			},
			{
				section_tipo: ZZARC_TARGET,
				section_id: 1,
				columns: { string: { zzarc1001: [{ value: 'target one', lang: 'lg-eng', id: 1 }] } },
			},
			{
				section_tipo: ZZARC_TARGET,
				section_id: 2,
				columns: { string: { zzarc1001: [{ value: 'target two', lang: 'lg-eng', id: 1 }] } },
			},
			{
				section_tipo: ZZARC_OUTSIDE,
				section_id: 1,
				columns: { string: { zzarc2001: [{ value: 'outside', lang: 'lg-eng', id: 1 }] } },
			},
			{
				section_tipo: ZZARC_VIRTUAL,
				section_id: 1,
				columns: {
					string: { [ZZARC_TARGET_CHILD]: [{ value: 'virtual one', lang: 'lg-eng', id: 1 }] },
				},
			},
		],
	});
}

/** Plant the media files zzarc1/1 owns into `mediaRoot` (a MARKED scratch root). Returns their paths. */
export function plantZzarcMedia(mediaRoot: string): string[] {
	const image = mediaTypeOf('component_image');
	const av = mediaTypeOf('component_av');
	if (image === null || av === null) throw new Error('media specs unavailable');
	const pathOpts = { initialMediaPath: '', maxItemsFolder: 1000, mediaRoot };
	const imageIdentity = {
		componentTipo: VALUE_BY_MODEL.component_image?.tipo as string,
		sectionTipo: ZZARC_MAIN,
		sectionId: 1,
		lang: null,
	};
	const avIdentity = {
		...imageIdentity,
		componentTipo: VALUE_BY_MODEL.component_av?.tipo as string,
	};
	const planted: string[] = [];
	const plant = (absolutePath: string, content: string): void => {
		mkdirSync(dirname(absolutePath), { recursive: true });
		writeFileSync(absolutePath, content);
		planted.push(absolutePath);
	};
	plant(
		buildMediaLocation(image, imageIdentity, image.defaultQuality, image.defaultExtension, pathOpts)
			.absolutePath,
		'zzarc image default quality bytes',
	);
	plant(
		buildMediaLocation(
			image,
			imageIdentity,
			config.media.thumb.quality,
			config.media.thumb.extension,
			pathOpts,
		).absolutePath,
		'zzarc image thumb bytes',
	);
	const posterframe = posterframeLocation(av, avIdentity, pathOpts);
	if (posterframe === null) throw new Error('component_av has no posterframe location');
	plant(posterframe.absolutePath, 'zzarc av posterframe bytes');
	return planted;
}

/** Ensure the situation AND plant the raw twins the JS value path cannot express. */
export async function ensureZzarc(s: Situation): Promise<void> {
	// A door of its own (the raw twins below are a matrix write this helper
	// makes itself), so it asks the marker under its own name, first.
	await assertTestDatabase('ensureZzarc');
	await ensureSituation(s);
	const table = await getMatrixTableFromTipo(ZZARC_MAIN);
	if (table === null) throw new Error('zzarc: no table for the main section');
	await updateMatrixRecord(
		table,
		ZZARC_MAIN,
		1,
		{ number: ZZARC_RAW_NUMBER, relation_search: ZZARC_RAW_RELATION_SEARCH },
		{ rawTextPassthrough: true },
	);
}

export { dropSituation };

/** Registry models the situation must hold a value for: TOTAL minus the enumerated exemptions. */
export function storageModelsOfRegistry(): string[] {
	return allComponentModels()
		.map((d) => d.model)
		.filter((model) => !(model in ZZARC_STORAGE_EXEMPT));
}
