/**
 * DIFFUSION field-local degradation + ddo-fn loudness gates
 * (audit 2026-08_oh1_beta B3 + §5.3 publishing majors).
 *
 * THE GUARANTEES under test:
 *
 * 1. B3 — ONE dangling ddo tipo must not abort the whole element. The oracle
 *    (diffusion_chain_processor::resolve_ddo_value :133-152 → component_common
 *    ::get_instance :394-406) logs "Component instance not found" and returns
 *    [] for THAT ddo, leaving the rest of the field and every other field of
 *    the element publishable. The TS compiler aborted the element instead, so
 *    the real oral-history element `mht2` (4 bibliography fields pointing at
 *    the absent Zenon tipos zenon4/5/6/9) could not compile at all.
 *    Degradation is per ddo ENTRY, recorded structurally on the plan, and
 *    surfaced on the run — never silent. It degrades the VALUE, never the
 *    SHAPE: the oracle derives a datum's `columns` from the FULL ddo_map
 *    (build_datum_context :1288-1308, with no ontology lookup at all), so the
 *    dangling entry KEEPS its place in the chain and its empty column slot.
 *
 * 1b. The dd1758 retry is SERIALIZED across concurrent runners and its
 *    unredeemed debt reaches the job row (not only stderr).
 *
 * 2. Genuinely STRUCTURAL failures stay fatal: the SQL identifier chokepoint
 *    (DIFFUSION_SPEC §8.3) and an unknown parser fn (§5) still refuse the
 *    whole element, and a compile that fails for one of those still REPORTS
 *    the degradations gathered on the way.
 *
 * 3. An unported/unresolvable component ddo fn is a LOUD per-field error, not
 *    an empty emission. `map_section_id_to_subtitles_url` (rsc546, the AV
 *    subtitles URL) published silently empty — no atoms, no error, validate
 *    clean — which is the worst possible outcome: a publish that looks
 *    successful and is not.
 *
 * 4. A media ddo's `options.quality` / `options.extension` select the tier
 *    (component_media_common::get_diffusion_data :530-560); an option the
 *    engine does not implement is refused loudly instead of ignored.
 *
 * 5. The dd1758 unpublish queue is retried OPPORTUNISTICALLY on a publish run
 *    (PHP dd_diffusion_api::diffuse :171-183, first chunk only), not only when
 *    an administrator presses the manual button — a deleted interview whose
 *    delete propagation failed must not stay live on the public site. The
 *    automatic door is NOT single-operator the way the manual one was, so the
 *    drain is single-flighted across concurrent runners, and the debt it could
 *    not redeem reaches the job row rather than only stderr.
 *
 * Ledger: engineering/wire_contract/WC-2026-08-09-diffusion-degradation-and-loud-ddo-fns.md
 * (1, 3 and 5 restore PHP; the run REPORT becoming stricter than PHP's, and the
 * refusal of the media options this engine cannot reproduce, are the divergences).
 *
 * HERMETIC: the plan compiler's ontology reads are INJECTED (CompileOptions
 * tree + resolveModelByTipo), the retry and its single-flight are INJECTED,
 * and the fn dispatch and the media primitive are pure functions over a
 * hand-built MatrixRecord. No database, no writes.
 *
 * ...and hermetic about the CONFIG too: the media tiers are derived from the
 * component_av model spec and the URL from `config.mediaDir`, never hardcoded.
 * Hardcoding them made the tier assertion pass only on an install whose AV
 * default quality happened to differ from the requested one.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../../src/config/config.ts';
import { mediaTypeOf } from '../../src/core/concepts/media.ts';
import type { MatrixRecord } from '../../src/core/db/matrix.ts';
import type { PendingRetrySingleFlight } from '../../src/diffusion/jobs/pending_retry.ts';
import { retryPendingUnpublishOpportunistically } from '../../src/diffusion/jobs/pending_retry.ts';
import { merge } from '../../src/diffusion/parsers/parser_helper.ts';
import type { CompileOptions, ParserClassifier } from '../../src/diffusion/plan/compile.ts';
import {
	compileElementPlan,
	PlanCompileError,
	planDegradationReportLines,
	validateElementPlan,
} from '../../src/diffusion/plan/compile.ts';
import type { ResolveStep } from '../../src/diffusion/plan/types.ts';
import type {
	OntologyIndex,
	RawOntologyNode,
	VirtualDiffusionTree,
	VirtualTreeNode,
} from '../../src/diffusion/plan/virtual_tree.ts';
import { defaultPublicationValue } from '../../src/diffusion/resolve/default_value.ts';
import { leafMergeColumns, resolveComponentFnAtoms } from '../../src/diffusion/resolve/resolver.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');

// ---------------------------------------------------------------------------
// A synthetic virtual diffusion tree: one sql element → one database → one
// table → the field nodes each test declares. Everything the compiler reads
// is served from these literals, so the gate needs no ontology.
// ---------------------------------------------------------------------------

/** One field node declaration (what the ontology row would hold). */
interface FieldSpec {
	tipo: string;
	/** Structure-lang term = the published column name. */
	label: string;
	/** properties->process of the field node. */
	process?: Record<string, unknown>;
}

const ELEMENT_TIPO = 'el1';

function pathItems(): VirtualTreeNode['parents'] {
	return [
		{
			tipo: ELEMENT_TIPO,
			model: 'diffusion_element',
			label: 'Test element',
			realTipo: null,
			type: 'sql',
		},
	];
}

function buildTree(fields: FieldSpec[]): VirtualDiffusionTree {
	const fieldNodes = new Map<string, RawOntologyNode>(
		fields.map((field) => [
			field.tipo,
			{
				tipo: field.tipo,
				parent: 'tb1',
				model: 'field_text',
				term: { 'lg-spa': field.label },
				properties: field.process === undefined ? null : { process: field.process },
				relations: null,
			},
		]),
	);

	const index: OntologyIndex = {
		nodeOf: async (tipo) => fieldNodes.get(tipo) ?? null,
		childTipos: async () => [],
		relatedByModel: async () => [],
		relationTipos: async () => [],
		resolveAlias: async () => null,
	};

	const nodes: VirtualTreeNode[] = [
		{
			tipo: ELEMENT_TIPO,
			model: 'diffusion_element',
			label: 'Test element',
			properties: { diffusion: { type: 'sql' } },
			realTipo: null,
			isAlias: false,
			parents: [],
			childrenTipos: [],
			directChildrenTipos: ['db1'],
			relatedSections: [],
		},
		{
			tipo: 'db1',
			model: 'database',
			label: 'web_test',
			properties: null,
			realTipo: null,
			isAlias: false,
			parents: pathItems(),
			childrenTipos: [],
			directChildrenTipos: ['tb1'],
			relatedSections: [],
		},
		{
			tipo: 'tb1',
			model: 'table',
			label: 'interview',
			properties: null,
			realTipo: null,
			isAlias: false,
			parents: pathItems(),
			childrenTipos: fields.map((field) => field.tipo),
			directChildrenTipos: fields.map((field) => field.tipo),
			relatedSections: ['oh1'],
		},
	];

	return { domainName: 'test', domainTipo: 'dom1', nodes, index };
}

/**
 * The injected model resolver: the ontology this gate pretends to have. Any
 * tipo not listed is DANGLING (the zenon4/5/6/9 situation on the real mht2).
 */
const MODELS: Record<string, string> = {
	rsc36: 'component_text_area',
	rsc175: 'component_section_id',
	rsc35: 'component_av',
	// CANONICAL models, i.e. what the injected resolver's real twin
	// (ontology/resolver.ts getModelByTipo) returns: rsc368 is stored as the
	// legacy `component_autocomplete`, whose descriptor aliases it to
	// component_portal — and only the RESOLVED model makes it a relation hop.
	rsc368: 'component_portal',
	// Real model of the live mht ontology (dd_ontology of dedalo7_mht), so the
	// mht2 topology case reproduces a true chain.
	rsc140: 'component_input_text',
};

const compileOptions = (fields: FieldSpec[]): CompileOptions => ({
	tree: buildTree(fields),
	classifyParserFn: ((fn) =>
		fn.startsWith('parser_') ? 'runtime' : 'unknown') as ParserClassifier,
	resolveModelByTipo: async (tipo) => MODELS[tipo] ?? null,
});

/** A ddo_map entry as v7 properties stores it. */
const ddo = (tipo: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
	tipo,
	section_tipo: 'self',
	parent: 'self',
	...extra,
});

// ---------------------------------------------------------------------------
// 1. Dangling ddo tipo → field-local degradation (B3)
// ---------------------------------------------------------------------------

describe('B3: a dangling ddo tipo degrades the FIELD, never the element', () => {
	test('the element still compiles and the degradation is reported', async () => {
		const plan = await compileElementPlan(
			ELEMENT_TIPO,
			compileOptions([
				{ tipo: 'f_ok', label: 'title', process: { ddo_map: [ddo('rsc36')] } },
				{
					tipo: 'f_dangling',
					label: 'ref_publications_title',
					process: { ddo_map: [ddo('zenon4')] },
				},
			]),
		);

		// The element compiled: a 98-record run is possible again.
		expect(plan.sections).toHaveLength(1);
		const section = plan.sections[0];
		if (section === undefined) throw new Error('no section compiled');
		expect(section.fields.map((field) => field.columnName)).toEqual([
			'title',
			'ref_publications_title',
		]);

		// The degraded field keeps its COLUMN, and the dangling ddo keeps its
		// PLACE in the chain as a step that resolves to nothing. It is NOT
		// dropped: the oracle derives `columns` from the full ddo_map without
		// looking any tipo up (build_datum_context :1288-1308), so dropping it
		// would silently re-shape the field's leaf topology.
		const degraded = section.fields.find((field) => field.id === 'f_dangling');
		expect(degraded?.sourceChain).toEqual([
			{ kind: 'degraded', tipo: 'zenon4', reason: 'dangling_ddo_tipo' },
		]);

		// ...and the operator is told exactly which field and which ddo tipo.
		expect(plan.degradations).toEqual([
			{
				fieldId: 'f_dangling',
				columnName: 'ref_publications_title',
				reason: 'dangling_ddo_tipo',
				ddoTipo: 'zenon4',
				disabledDdoTipos: [],
				message:
					"field 'f_dangling' (ref_publications_title): ddo tipo 'zenon4' not found in the ontology" +
					' — it resolves to nothing (its column slot publishes empty); the field keeps its' +
					' column topology and its remaining ddos resolve normally',
			},
		]);
	});

	test('a PARTIALLY dangling chain keeps its resolvable ddos (oracle: per-entry skip)', async () => {
		const plan = await compileElementPlan(
			ELEMENT_TIPO,
			compileOptions([
				{
					tipo: 'f_mixed',
					label: 'ref_publications_url',
					process: {
						ddo_map: [
							ddo('rsc368'),
							{ tipo: 'rsc36', parent: 'rsc368' },
							{ tipo: 'zenon9', parent: 'rsc368' },
						],
					},
				},
			]),
		);
		const field = plan.sections[0]?.fields[0];
		// 1:1 with the ddo_map — the dangling entry is degraded IN PLACE.
		expect(
			field?.sourceChain.map((step: ResolveStep) => ('tipo' in step ? step.tipo : '')),
		).toEqual(['rsc368', 'rsc36', 'zenon9']);
		expect(field?.sourceChain.map((step: ResolveStep) => step.kind)).toEqual([
			'relation-hop',
			'component',
			'degraded',
		]);
		expect(plan.degradations.map((entry) => entry.ddoTipo)).toEqual(['zenon9']);
	});

	test('THE mht2 CASE: the dangling ddo stays a COLUMN, and its empty slot is published', async () => {
		// rsc1194 of the live mht ontology, verbatim (dedalo7_mht dd_ontology):
		// ddo_map [rsc368 (autocomplete hop), rsc140 under it, zenon4 under it],
		// no explicit parser → the parser-less merge path, merge:'string' with
		// `empty_columns` defaulting to TRUE.
		const plan = await compileElementPlan(
			ELEMENT_TIPO,
			compileOptions([
				{
					tipo: 'f_rsc1194',
					label: 'ref_publications_title',
					process: {
						ddo_map: [
							{ tipo: 'rsc368', section_tipo: 'self' },
							{ tipo: 'rsc140', label: 'Term', parent: 'rsc368' },
							{ tipo: 'zenon4', label: 'Term', parent: 'rsc368' },
						],
					},
				},
			]),
		);
		const field = plan.sections[0]?.fields[0];
		if (field === undefined) throw new Error('no field compiled');

		// PHP leaf rule (:1294): parents = {rsc368}; every other ddo is a column
		// — INCLUDING the dangling zenon4, whose tipo PHP never looks up.
		expect(leafMergeColumns(field.sourceChain)).toEqual([
			{ tipo: 'rsc140', model: 'component_input_text' },
			{ tipo: 'zenon4', model: '' },
		]);

		// ...and that empty slot is VISIBLE in the published bytes: the oracle
		// joins 'Historia' with the empty zenon4 column and emits 'Historia, '.
		// Dropping the ddo produced 'Historia' — a silent wire divergence on the
		// very field this whole change exists to unblock.
		const merged = merge(
			[
				{
					id: null,
					value: 'Historia',
					tipo: 'rsc140',
					lang: 'lg-spa',
					section_id: '4649',
					section_tipo: 'rsc2',
				},
			],
			{ columns: leafMergeColumns(field.sourceChain), merge: 'string' },
			{ langs: ['lg-spa'], mainLang: 'lg-spa' },
		);
		expect(merged?.map((item) => item.value)).toEqual(['Historia, ']);
	});

	test('ddos hanging UNDER a dangling one are named as disabled', async () => {
		// The subtree can never execute (nothing reaches a child of a hop that
		// resolved no locators — the oracle's outcome). It keeps its column
		// slots; what was missing was saying so.
		const plan = await compileElementPlan(
			ELEMENT_TIPO,
			compileOptions([
				{
					tipo: 'f_subtree',
					label: 'ref_publications_url',
					process: {
						ddo_map: [
							ddo('zenon9'),
							{ tipo: 'rsc36', parent: 'zenon9' },
							{ tipo: 'rsc368', parent: 'rsc36' },
						],
					},
				},
			]),
		);
		const degradation = plan.degradations[0];
		expect(degradation?.disabledDdoTipos).toEqual(['rsc36', 'rsc368']);
		expect(degradation?.message).toContain('the ddos hanging under it (rsc36, rsc368)');
		// The topology is untouched: zenon9 and rsc36 are parents, rsc368 is the
		// single leaf column — exactly what the oracle's context would carry.
		const field = plan.sections[0]?.fields[0];
		if (field === undefined) throw new Error('no field compiled');
		expect(leafMergeColumns(field.sourceChain).map((column) => column.tipo)).toEqual(['rsc368']);
	});

	test('a dangling FIRST ddo does not promote the second (no invented output_format)', async () => {
		// PHP reads the model of ddo_map[0] for the output_format fallback; a
		// tipo that is not in the ontology has none, so there is no fallback.
		// Dropping the entry would have made the relation-family rsc368 first
		// and stamped outputFormat 'json' the oracle never picks.
		const plan = await compileElementPlan(
			ELEMENT_TIPO,
			compileOptions([
				{
					tipo: 'f_first',
					label: 'ref_publications_authors',
					process: { ddo_map: [ddo('zenon5'), ddo('rsc368')] },
				},
			]),
		);
		expect(plan.sections[0]?.fields[0]?.outputFormat).toBeUndefined();
	});

	test('EVERY dangling ddo is reported, not just the first', async () => {
		const plan = await compileElementPlan(
			ELEMENT_TIPO,
			compileOptions([
				{ tipo: 'f_a', label: 'ref_publications_title', process: { ddo_map: [ddo('zenon4')] } },
				{ tipo: 'f_b', label: 'ref_publications_authors', process: { ddo_map: [ddo('zenon5')] } },
				{ tipo: 'f_c', label: 'ref_publications_date', process: { ddo_map: [ddo('zenon6')] } },
				{ tipo: 'f_d', label: 'ref_publications_url', process: { ddo_map: [ddo('zenon9')] } },
			]),
		);
		expect(plan.degradations.map((entry) => entry.ddoTipo)).toEqual([
			'zenon4',
			'zenon5',
			'zenon6',
			'zenon9',
		]);
		expect(planDegradationReportLines(plan)).toHaveLength(4);
	});

	test('validate reports the degradations alongside the compiled plan', async () => {
		const validation = await validateElementPlan(
			ELEMENT_TIPO,
			compileOptions([
				{
					tipo: 'f_dangling',
					label: 'ref_publications_title',
					process: { ddo_map: [ddo('zenon4')] },
				},
			]),
		);
		expect(validation.errors).toEqual([]);
		expect(validation.result).not.toBeNull();
		expect(validation.degradations.map((entry) => entry.ddoTipo)).toEqual(['zenon4']);
	});
});

// ---------------------------------------------------------------------------
// 2. Structural failures stay fatal
// ---------------------------------------------------------------------------

describe('structural failures stay FATAL (the chokepoints are deliberate)', () => {
	test('an invalid SQL column identifier still refuses the whole element', async () => {
		const promise = compileElementPlan(
			ELEMENT_TIPO,
			compileOptions([{ tipo: 'f_bad', label: '3d', process: { ddo_map: [ddo('rsc36')] } }]),
		);
		await expect(promise).rejects.toThrow(PlanCompileError);
	});

	test('an unknown parser fn still refuses the whole element (spec §5)', async () => {
		const promise = compileElementPlan(
			ELEMENT_TIPO,
			compileOptions([
				{
					tipo: 'f_parser',
					label: 'title',
					process: { ddo_map: [ddo('rsc36')], parser: [{ fn: 'nonesuch::method' }] },
				},
			]),
		);
		await expect(promise).rejects.toThrow(/unknown parser fn/);
	});

	test('a fatal compile STILL reports the degradations gathered on the way', async () => {
		const validation = await validateElementPlan(
			ELEMENT_TIPO,
			compileOptions([
				{
					tipo: 'f_dangling',
					label: 'ref_publications_title',
					process: { ddo_map: [ddo('zenon4')] },
				},
				{ tipo: 'f_bad', label: '3d', process: { ddo_map: [ddo('rsc36')] } },
			]),
		);
		expect(validation.result).toBeNull();
		expect(validation.errors.join(' ')).toMatch(/Invalid column identifier/);
		expect(validation.degradations.map((entry) => entry.ddoTipo)).toEqual(['zenon4']);
	});
});

// ---------------------------------------------------------------------------
// 3. ddo fns: ported ones resolve, unported ones are LOUD
// ---------------------------------------------------------------------------

/** A minimal loaded record (only what the pure fn dispatch reads). */
function recordOf(sectionId: number, columns: MatrixRecord['columns'] = {}): MatrixRecord {
	return { id: 1, section_id: sectionId, section_tipo: 'oh1', columns, rawText: {} };
}

const fnEnv = {
	langs: ['lg-spa', 'lg-eng'],
	pairedGeolocationTipo: async () => null,
};

const componentStep = (
	tipo: string,
	model: string,
	fn: string,
): Extract<ResolveStep, { kind: 'component' }> => ({
	kind: 'component',
	tipo,
	model,
	sectionTipo: 'oh1',
	fn,
});

describe('a ddo fn either resolves or fails LOUDLY (never a silent empty publish)', () => {
	test('map_section_id_to_subtitles_url emits one URL per diffusion lang', async () => {
		const atoms = await resolveComponentFnAtoms(
			fnEnv,
			recordOf(1),
			componentStep('rsc175', 'component_section_id', 'map_section_id_to_subtitles_url'),
		);
		expect(atoms).toEqual([
			{
				kind: 'scalar',
				value: '/dedalo/publication/server_api/v1/subtitles/?section_id=1&lang=lg-spa',
				lang: 'lg-spa',
				meta: { tipo: 'rsc175' },
			},
			{
				kind: 'scalar',
				value: '/dedalo/publication/server_api/v1/subtitles/?section_id=1&lang=lg-eng',
				lang: 'lg-eng',
				meta: { tipo: 'rsc175' },
			},
		]);
	});

	test('an UNPORTED fn throws even when the component slice is EMPTY', async () => {
		// hierarchy83's map_target_section_tipo: latent today because the slice is
		// usually empty — which is exactly how it stayed invisible.
		const promise = resolveComponentFnAtoms(
			fnEnv,
			recordOf(1),
			componentStep('hierarchy53', 'component_input_text', 'map_target_section_tipo'),
		);
		await expect(promise).rejects.toThrow(/map_target_section_tipo/);
	});
});

// ---------------------------------------------------------------------------
// 4. Media ddo options
// ---------------------------------------------------------------------------

describe('a media ddo honours options.quality / options.extension', () => {
	// HERMETIC BY CONSTRUCTION. The first version of this suite hardcoded
	// 'original' as the requested tier and '/dedalo/media/...' as the expected
	// URL, which only proved anything because THIS install happens to default
	// component_av to quality '404' and DEDALO_MEDIA_DIR to 'media'. On an
	// install whose AV default is 'original' the test stayed green while
	// asserting nothing — the silent vacuity the testing rules exist to stop.
	// So the tiers are DERIVED from the model spec, the requested one is
	// asserted to differ from the default, and the URL is built from config.
	const avSpec = mediaTypeOf('component_av');
	if (avSpec === null) throw new Error('component_av is not a media model');
	const defaultQuality = avSpec.defaultQuality;
	const requestedQuality = avSpec.qualities.find((quality) => quality !== defaultQuality);
	if (requestedQuality === undefined) {
		throw new Error('component_av declares a single quality — the tier test cannot mean anything');
	}
	const extension = avSpec.defaultExtension;
	const urlOf = (quality: string): string =>
		`/dedalo/${config.mediaDir}/av/${quality}/7.${extension}`;

	// component_av stores in the `media` jsonb column (getColumnNameByModel).
	const mediaRecord = recordOf(7, {
		media: {
			rsc35: [
				{
					files_info: [
						{
							quality: defaultQuality,
							extension,
							file_exist: true,
							file_path: `/av/${defaultQuality}/7.${extension}`,
						},
						{
							quality: requestedQuality,
							extension,
							file_exist: true,
							file_path: `/av/${requestedQuality}/7.${extension}`,
						},
					],
				},
			],
		},
	} as MatrixRecord['columns']);

	const publishedUrlOf = (ddoOptions?: Record<string, unknown>): unknown => {
		const atoms = defaultPublicationValue(
			mediaRecord,
			'rsc35',
			'component_av',
			{ tipo: 'rsc35' },
			ddoOptions,
		);
		expect(atoms).toHaveLength(1);
		return (atoms[0] as { value: unknown }).value;
	};

	test('the tiers under test are genuinely different (anti-vacuity guard)', () => {
		expect(requestedQuality).not.toBe(defaultQuality);
	});

	test('no options → the model default tier', () => {
		expect(publishedUrlOf()).toBe(urlOf(defaultQuality));
	});

	test('the requested quality wins over the default tier', () => {
		expect(publishedUrlOf({ quality: requestedQuality, extension })).toBe(urlOf(requestedQuality));
	});

	test('an option the engine does not implement is refused loudly', () => {
		expect(() =>
			defaultPublicationValue(
				mediaRecord,
				'rsc35',
				'component_av',
				{ tipo: 'rsc35' },
				{
					avoid_cache: true,
				},
			),
		).toThrow(/avoid_cache/);
	});

	test('an unimplemented option set FALSY publishes normally (PHP `?? false`)', () => {
		// component_media_common :530-536 reads every one of these as
		// `$ddo->options->x ?? false`, so spelling out PHP's own default is
		// semantically identical to omitting the key. Refusing on key PRESENCE
		// broke a ddo that asked for nothing this engine cannot do.
		expect(
			publishedUrlOf({ quality: requestedQuality, extension, absolute: false, test_file: false }),
		).toBe(urlOf(requestedQuality));
		expect(publishedUrlOf({ default_add: 0, avoid_cache: '', test_file: null })).toBe(
			urlOf(defaultQuality),
		);
	});

	test('...and the SAME option set truthy is still refused', () => {
		expect(() => publishedUrlOf({ absolute: true })).toThrow(/absolute/);
		expect(() => publishedUrlOf({ test_file: 'placeholder.jpg' })).toThrow(/test_file/);
	});
});

// ---------------------------------------------------------------------------
// 5. Opportunistic dd1758 unpublish retry (PHP dd_diffusion_api::diffuse :174)
// ---------------------------------------------------------------------------

describe('the dd1758 unpublish queue is retried opportunistically on every run', () => {
	/** A single-flight that always wins the lock (the uncontended runner). */
	const uncontended: PendingRetrySingleFlight = (work) => work();

	test('a debt STILL OWED after the retry reaches the job row, not only stderr', async () => {
		const report = await retryPendingUnpublishOpportunistically(
			async () => ({ total: 3, retried: 2, remaining: 1 }),
			uncontended,
		);
		// errors[], because one record the archive deleted is still live on the
		// public site. The header used to promise "report lines the run report
		// prints" while the runner only console.error'd them.
		expect(report.errors.join(' ')).toMatch(/3 row\(s\) owed/);
		expect(report.errors.join(' ')).toMatch(/retried 2/);
		expect(report.log).toEqual([]);
	});

	test('a FULLY drained queue is a log line, never an error', async () => {
		// The system worked. Flipping the run to "Partial success" for it would
		// make the one signal that matters meaningless.
		const report = await retryPendingUnpublishOpportunistically(
			async () => ({ total: 3, retried: 3, remaining: 0 }),
			uncontended,
		);
		expect(report.errors).toEqual([]);
		expect(report.log.join(' ')).toMatch(/retried 3/);
	});

	test('an empty queue is silent', async () => {
		const report = await retryPendingUnpublishOpportunistically(
			async () => ({ total: 0, retried: 0, remaining: 0 }),
			uncontended,
		);
		expect(report).toEqual({ log: [], errors: [] });
	});

	test('a failing retry NEVER fails the publish run (PHP fire-and-forget) but IS reported', async () => {
		const report = await retryPendingUnpublishOpportunistically(async () => {
			throw new Error('target down');
		}, uncontended);
		expect(report.errors.join(' ')).toMatch(/target down/);
	});

	test('SERIALIZATION: a runner that loses the lock does not drain, and says nothing', async () => {
		// The manual door was implicitly single-operator; the automatic one runs
		// on DEDALO_DIFFUSION_MAX_RUNNERS concurrent runners (2 by default), and
		// retryPendingDiffusion SELECTs its 100 rows with no claim. Two runners
		// draining in parallel = duplicate delete propagation to the target.
		let ran = 0;
		const report = await retryPendingUnpublishOpportunistically(
			async () => {
				ran++;
				return { total: 3, retried: 3, remaining: 0 };
			},
			async () => null, // another runner holds the advisory lock
		);
		expect(ran).toBe(0);
		expect(report).toEqual({ log: [], errors: [] });
	});

	test('the default single-flight takes a Postgres advisory lock on a RESERVED connection', () => {
		// A session-level advisory lock belongs to the connection that took it:
		// issued through the pool, the unlock could land elsewhere and leak the
		// lock for the life of the process. Asserted on the source because the
		// alternative is a two-process integration test for a one-line invariant.
		const source = readFileSync(join(REPO_ROOT, 'src/diffusion/jobs/pending_retry.ts'), 'utf8');
		expect(source).toContain('sql.reserve()');
		expect(source).toContain('pg_try_advisory_lock');
		expect(source).toContain('pg_advisory_unlock');
		expect(source).toContain('reserved.release()');
	});

	test('TRIPWIRE: the runner CALLS it, routes BOTH buckets, and seeds the plan degradations', () => {
		// Asserted on the call expressions, not the imports: importing a helper
		// and never invoking it — or invoking it and dropping half its result,
		// which is what the first version of this change did — is exactly the
		// regression this guards.
		const runner = readFileSync(join(REPO_ROOT, 'src/diffusion/runner.ts'), 'utf8');
		expect(runner).toContain('await retryPendingUnpublishOpportunistically()');
		expect(runner).toContain('planDegradationReportLines(plan)) trackError(');
		expect(runner).toContain('retryReport.errors) trackError(');
		expect(runner).toContain('retryReport.log)');
		// PHP guards the retry to the first chunk (dd_diffusion_api::diffuse
		// :174 `if (empty($rqo->sqo->offset))`): a checkpoint RESUME continues a
		// run that already paid this debt.
		expect(runner).toContain('isFirstInvocation');
	});
});
