/**
 * EXPORT RUN — BOUNDED MEMOS + IDENTITY THREADING (tool_export at scale, step 1).
 *
 * TWO CLAIMS, both measured on outcomes, never on source spellings.
 *
 * (a) BOUNDED. The export walk memoizes per run: the projection's own-children
 *     and parents chains (src/diffusion/export/atoms.ts) and the atom run's
 *     record + frontier answers (src/diffusion/resolve/resolver.ts). They were
 *     unbounded except the record cache, so a 300k-record export grew them with
 *     the archive. Now every one is capped by `cacheLimit`. The gate runs the
 *     SAME walk twice over a situation that fills each map to at least 3x the
 *     injected cap: once at the default cap, once at the tiny one. Every map's
 *     PEAK (observed on every insert, not sampled) stays <= the cap, and every
 *     cell is byte-identical to the uncapped run. A vacuity floor asserts the
 *     uncapped peaks really reach 3x the cap, so a situation that stopped
 *     exercising a map reddens instead of passing on an empty map.
 *
 * (b) IDENTITY. The export's bytes depend only on the identity the caller
 *     hands `openExportGrid` explicitly (principal, options.lang, the
 *     interface lang), never on the ambient request scope
 *     (engineering/REQUEST_ISOLATION.md, Rule 6). Leaf code on the walk DOES
 *     read the ALS backstops, and three of those reads reach the output:
 *     the interface lang (a component_date 'period' cell's unit labels,
 *     date_value.ts resolvePeriodLabels), the data lang (a component_external
 *     cell's remote row, external/cache.ts), and the PRINCIPAL (a relation
 *     cell's implicit label request_config, implicit.ts
 *     filterAuthorizedRelated → currentPrincipal(): no principal, no filter).
 *     `openExportGrid` runs every step inside its OWN scope built from the
 *     explicit context. The gates:
 *       1. the stream for a NON-ADMIN inside a full request scope === the
 *          producer called with NO ambient scope === the producer called under
 *          a CONTRARY ambient scope (install-default lang, decoy data lang, a
 *          global-admin request principal);
 *       2. a stream obtained inside the request and PULLED after the scope is
 *          gone gives the same bytes, and the producer's generator opened with
 *          no scope and DRAINED under a contrary one gives them too (a
 *          generator body runs in its puller's context — the per-step scope is
 *          what makes that irrelevant);
 *       3. LANG teeth: createExportRun({applicationLang}) resolves the period
 *          cell identically with and without an ambient scope, while an
 *          unthreaded run outside one falls back to the installation default;
 *       4. the PRINCIPAL cannot leak in from the ambient scope: gate 1's
 *          contrary scope carries a GLOBAL ADMIN principal and the reader's
 *          bytes still come out (measured 2026-09-23: on the export's value
 *          path the implicit-label filter is reached only when the owner
 *          declares no component children, where it has nothing to filter,
 *          so no built situation can make the ambient principal visible in a
 *          cell today — the scope pins it anyway, and gate 5 proves the scope's
 *          request context is the export's own);
 *       5. NARROWING IS NEVER SILENT: an SQO filter hop through a component
 *          the reader cannot read (test166, deliberately not granted) narrows
 *          the selection to nothing WITHOUT a throw; the refusal is carried on
 *          the opened grid's `frontierRefusals` outside a request (where the
 *          ambient notice would be dropped) and still reaches the request's
 *          own context when the caller NAMES it (`enclosingRequest`, what
 *          exportGridUnified passes) — never a context that is merely ambient
 *          (a detached job inherits its submitter's, long ended).
 *
 * THE SITUATION IS BUILT (generic `test` TLD). A non-admin (profile granting
 * test3 and its components at read level, one project) and a set of scratch
 * test3 records carrying that project: SOURCES pointing through test80
 * (portal, compact cell), test9 / test205 (autocomplete_hi fan-out),
 * test54 / test56 (relation_related fan-out) and test91 / test87 (select /
 * radio fan-out) at THREE shared TARGETS each, the targets chained
 * to two ancestors through test71 (parents chains), bilingual test52 values,
 * and a test173 period date. The profile grants every test3 component EXCEPT
 * test166 (the unreadable filter hop of gate 5). All rows are minted here and
 * swept in afterAll.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { encodeForJsonb } from '../../src/core/db/json_codec.ts';
import { deleteMatrixRecord } from '../../src/core/db/matrix_write.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { getLabels } from '../../src/core/labels/catalog.ts';
import { runWithRequestLangs } from '../../src/core/resolve/request_lang.ts';
import {
	clearPermissionsCache,
	clearPrincipalCache,
	clearUserProjectsCache,
	type Principal,
	resolvePrincipal,
} from '../../src/core/security/permissions.ts';
import {
	type RequestContext,
	runWithRequestContext,
} from '../../src/core/security/request_context.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import type { ToolActionContext } from '../../src/core/tools/module.ts';
import {
	collectGridAtoms,
	createExportRun,
	type ExportRun,
	resolveValueCell,
} from '../../src/diffusion/export/atoms.ts';
import { compileExportPlan } from '../../src/diffusion/export/compile_columns.ts';
import { exportGridUnified, openExportGrid } from '../../src/diffusion/export/index.ts';
import {
	EXPORT_RUN_CACHE_LIMIT,
	getBoundedRunMemo,
	setBoundedRunMemo,
} from '../../src/diffusion/resolve/resolver.ts';

// --- the situation ----------------------------------------------------------

const SECTION = 'test3';
const TABLE = 'matrix_test';
const TEXT = 'test52'; // component_input_text, translatable (the parents-chain term)
const PERIOD = 'test173'; // component_date, date_mode 'period'
const PORTAL = 'test80'; // component_portal → compact cell + parents
const FANOUT_TIPOS = ['test9', 'test205', 'test54', 'test56', 'test91', 'test87']; // relation leaves that fan out
const PARENT_LINK = 'test71'; // component_relation_parent
const FILTER = 'test101'; // component_filter (projects)
const DENIED = 'test166'; // component_input_text the reader holds NO grant on

const USER_ID = 948001;
const PROFILE_ID = 948011;
const PROJECT_ID = 948021;
const TARGET_IDS = [948111, 948112, 948113, 948114, 948115, 948116];
const SOURCE_IDS = [948101, 948102, 948103, 948104, 948105, 948106];
const PARENT_ID = 948150;
const ROOT_ID = 948151;
const OWNED_TEST3 = [...SOURCE_IDS, ...TARGET_IDS, PARENT_ID, ROOT_ID];
const IDENTITY_ROWS = [
	{ table: 'matrix_users', sectionTipo: 'dd128', sectionId: USER_ID },
	{ table: 'matrix_profiles', sectionTipo: 'dd234', sectionId: PROFILE_ID },
	{ table: 'matrix_projects', sectionTipo: 'dd153', sectionId: PROJECT_ID },
];

/** The cap the bounded run is given; the situation must fill each map to 3x. */
const TINY_CAP = 2;

const DATA_LANG = 'lg-spa';
const DECOY_DATA_LANG = 'lg-eng';

const locator = (from: string, sectionTipo: string, sectionId: number, id = 1) => ({
	id,
	type: 'dd151',
	section_id: sectionId,
	section_tipo: sectionTipo,
	from_component_tipo: from,
});
const parentLocator = (sectionId: number) => ({
	id: 1,
	type: 'dd47',
	section_id: sectionId,
	section_tipo: SECTION,
	from_component_tipo: PARENT_LINK,
});
const bilingual = (spa: string, eng: string) => [
	{ id: 1, lang: 'lg-spa', value: spa },
	{ id: 1, lang: 'lg-eng', value: eng },
];
const projectSlot = { [FILTER]: [locator(FILTER, 'dd153', PROJECT_ID)] };

async function insertRow(
	table: string,
	sectionTipo: string,
	sectionId: number,
	columns: Record<string, unknown>,
): Promise<void> {
	const names = ['"section_tipo"', '"section_id"'];
	const placeholders = ['$1', '$2'];
	const params: (string | number)[] = [sectionTipo, sectionId];
	for (const [column, value] of Object.entries(columns)) {
		names.push(`"${column}"`);
		// ::text::jsonb — a bare ::jsonb bind stores a jsonb STRING scalar.
		placeholders.push(`$${params.length + 1}::text::jsonb`);
		params.push(encodeForJsonb(value));
	}
	await sql.unsafe(
		`INSERT INTO "${table}" (${names.join(', ')}) VALUES (${placeholders.join(', ')})`,
		params,
	);
}

async function sweep(): Promise<void> {
	for (const row of [
		...IDENTITY_ROWS,
		...OWNED_TEST3.map((sectionId) => ({ table: TABLE, sectionTipo: SECTION, sectionId })),
	]) {
		await deleteMatrixRecord(row.table, row.sectionTipo, row.sectionId);
		await sql.unsafe(
			'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
			[row.sectionTipo, row.sectionId],
		);
	}
	clearPrincipalCache();
	clearUserProjectsCache();
	clearPermissionsCache();
}

/** Every component tipo of the test3 subtree — the reader is granted all at 1. */
async function test3ComponentTipos(): Promise<string[]> {
	const rows = (await sql.unsafe(
		`WITH RECURSIVE t AS (
			SELECT tipo, model FROM dd_ontology WHERE parent = $1
			UNION ALL SELECT o.tipo, o.model FROM dd_ontology o JOIN t ON o.parent = t.tipo)
		 SELECT tipo FROM t WHERE model LIKE 'component_%'`,
		[SECTION],
	)) as { tipo: string }[];
	return rows.map((row) => row.tipo);
}

let reader!: Principal;
/** An interface lang whose 'years' label differs from the installation default. */
let appLang!: string;
let appYears!: string;
let defaultYears!: string;

beforeAll(async () => {
	await assertTestDatabase('export_run_bounds_identity_native');
	await sweep();

	// Identity: one project, one read-level profile over test3, one non-admin.
	await insertRow('matrix_projects', 'dd153', PROJECT_ID, {
		string: { dd156: [{ id: 1, lang: 'lg-eng', value: 'zzbound scratch project' }] },
	});
	const tipos = await test3ComponentTipos();
	expect(tipos).toContain(PERIOD); // the situation's components exist
	expect(tipos).toContain(DENIED);
	const grants = [
		...[SECTION, ...tipos.filter((tipo) => tipo !== DENIED)].map((tipo) => ({
			tipo,
			section_tipo: SECTION,
		})),
	].map((grant, index) => ({ id: index + 1, ...grant, value: 1 }));
	await insertRow('matrix_profiles', 'dd234', PROFILE_ID, {
		string: { dd237: [{ id: 1, lang: 'lg-eng', value: 'zzbound reader profile' }] },
		misc: { dd774: grants },
	});
	await insertRow('matrix_users', 'dd128', USER_ID, {
		string: { dd132: [{ id: 1, lang: 'lg-nolan', value: 'zzbound_reader' }] },
		relation: {
			dd131: [locator('dd131', 'dd64', 1)],
			dd244: [locator('dd244', 'dd64', 2)],
			dd515: [locator('dd515', 'dd64', 2)],
			dd1725: [locator('dd1725', 'dd234', PROFILE_ID)],
			dd170: [locator('dd170', 'dd153', PROJECT_ID)],
		},
	});

	// Records: ROOT ← PARENT ← each TARGET (parents chain), SOURCE_j → TARGET_j.
	await insertRow(TABLE, SECTION, ROOT_ID, {
		string: { [TEXT]: bilingual('Raíz', 'Root') },
		relation: { ...projectSlot },
	});
	await insertRow(TABLE, SECTION, PARENT_ID, {
		string: { [TEXT]: bilingual('Padre', 'Parent') },
		relation: { ...projectSlot, [PARENT_LINK]: [parentLocator(ROOT_ID)] },
	});
	for (const [k, targetId] of TARGET_IDS.entries()) {
		await insertRow(TABLE, SECTION, targetId, {
			string: { [TEXT]: bilingual(`Destino ${k}`, `Target ${k}`) },
			relation: { ...projectSlot, [PARENT_LINK]: [parentLocator(PARENT_ID)] },
		});
	}
	for (const [j, sourceId] of SOURCE_IDS.entries()) {
		// Each source points at THREE targets (a sliding window), so targets are
		// SHARED across sources and one record's walk alone overflows the tiny
		// cap: evicted entries really are recomputed, and the byte-identity
		// below covers the recompute path, not just first misses.
		const targets = [0, 1, 2].map(
			(offset) => TARGET_IDS[(j + offset) % TARGET_IDS.length] as number,
		);
		const slot = (tipo: string) =>
			targets.map((target, index) => locator(tipo, SECTION, target, index + 1));
		const relation: Record<string, unknown> = { ...projectSlot, [PORTAL]: slot(PORTAL) };
		for (const tipo of FANOUT_TIPOS) relation[tipo] = slot(tipo);
		await insertRow(TABLE, SECTION, sourceId, {
			string: { [TEXT]: bilingual(`Origen ${j}`, `Source ${j}`) },
			date: { [PERIOD]: [{ id: 1, lang: 'lg-nolan', period: { year: j + 1, month: 2 } }] },
			relation,
		});
	}
	clearPrincipalCache();
	clearUserProjectsCache();
	clearPermissionsCache();

	reader = await resolvePrincipal(USER_ID);
	expect(reader.isGlobalAdmin).toBe(false);

	defaultYears = String((await getLabels(config.menu.applicationLang)).years);
	for (const candidate of Object.keys(config.lang.applicationLangs)) {
		const years = String((await getLabels(candidate)).years);
		if (years !== defaultYears) {
			appLang = candidate;
			appYears = years;
			break;
		}
	}
	// No second interface lang with a different label → the identity teeth
	// would be vacuous; refuse loudly rather than pass on equal strings.
	expect(appLang).toBeDefined();
});

afterAll(async () => {
	await assertTestDatabase('export_run_bounds_identity_native');
	await sweep();
});

// --- shared pieces ----------------------------------------------------------

const ddo = (componentTipo: string, withParents = false) => ({
	path: [{ section_tipo: SECTION, component_tipo: componentTipo, name: componentTipo }],
	...(withParents ? { value_with_parents: true } : {}),
});
const EXPORT_DDOS = [
	ddo(TEXT),
	ddo(PERIOD),
	ddo(PORTAL, true),
	...FANOUT_TIPOS.map((tipo) => ddo(tipo, true)),
];

/** A Map that records its peak size on EVERY insert (not a sample). */
class PeakMap<K, V> extends Map<K, V> {
	peak = 0;
	override set(key: K, value: V): this {
		super.set(key, value);
		if (this.size > this.peak) this.peak = this.size;
		return this;
	}
}

interface Peaks {
	ownChildren: number;
	parentsChains: number;
	frontierRecordCache: number;
	recordCache: number;
}

/** Walk every source × field in both projections; return cells + map peaks. */
async function walk(cacheLimit?: number): Promise<{ cells: string[]; peaks: Peaks }> {
	const run: ExportRun = createExportRun(cacheLimit === undefined ? {} : { cacheLimit });
	run.atoms.frontier = { principal: reader, surface: 'export', door: 'tool_export' };
	const ownChildren = new PeakMap<string, never>();
	const parentsChains = new PeakMap<string, string | null>();
	const frontierRecordCache = new PeakMap<string, boolean>();
	const recordCache = new PeakMap<string, never>();
	run.ownChildren = ownChildren;
	run.parentsChains = parentsChains;
	run.atoms.frontierRecordCache = frontierRecordCache;
	run.atoms.recordCache = recordCache;

	const plan = await compileExportPlan(EXPORT_DDOS as never, SECTION);
	const fields = plan.sections[0]?.fields ?? [];
	expect(fields.length).toBe(EXPORT_DDOS.length);
	const cells: string[] = [];
	for (const sourceId of SOURCE_IDS) {
		for (const field of fields) {
			const unresolved: string[] = [];
			const value = await resolveValueCell(run, field, SECTION, sourceId, DATA_LANG, unresolved);
			const atoms = await collectGridAtoms(run, field, SECTION, sourceId, DATA_LANG, unresolved);
			cells.push(JSON.stringify({ sourceId, value, atoms, unresolved }));
		}
	}
	return {
		cells,
		peaks: {
			ownChildren: ownChildren.peak,
			parentsChains: parentsChains.peak,
			frontierRecordCache: frontierRecordCache.peak,
			recordCache: recordCache.peak,
		},
	};
}

/** Drain a stream-mode exportGridUnified response into its NDJSON lines. */
async function streamLines(context: ToolActionContext): Promise<string[]> {
	const response = (await exportGridUnified(context)) as unknown as {
		ok: boolean;
		stream?: ReadableStream<Uint8Array>;
	};
	expect(response.ok).toBe(true);
	expect(response.stream).toBeDefined();
	const text = await new Response(response.stream).text();
	return text.split('\n').filter((line) => line !== '');
}

const streamContext = (): ToolActionContext =>
	({
		principal: reader,
		userId: USER_ID,
		background: false,
		options: {
			section_tipo: SECTION,
			data_format: 'grid_value',
			breakdown: 'rows',
			ndjson_stream: true,
			lang: DATA_LANG,
			ar_ddo_to_export: EXPORT_DDOS,
			sqo: {
				section_tipo: [SECTION],
				filter_by_locators: SOURCE_IDS.map((id) => ({ section_tipo: SECTION, section_id: id })),
			},
		},
	}) as ToolActionContext;

// --- (a) bounded run memos --------------------------------------------------

describe('export run memos are bounded and eviction never moves the output', () => {
	test('default cap is the record cache bound', () => {
		expect(createExportRun().atoms.cacheLimit).toBe(EXPORT_RUN_CACHE_LIMIT);
		expect(EXPORT_RUN_CACHE_LIMIT).toBe(8000);
	});

	test('eviction is LRU: the OLDEST entry goes, a hit keeps a key young, a hot key survives a working set past the cap', () => {
		const map = new Map<string, number | null>();
		for (const key of ['a', 'b', 'c']) setBoundedRunMemo(map, key, 1, 3);
		expect(getBoundedRunMemo(map, 'a')).toBe(1); // a is now the youngest
		setBoundedRunMemo(map, 'd', 1, 3); // evicts b, the oldest — never the whole map
		expect([...map.keys()]).toEqual(['c', 'a', 'd']);
		setBoundedRunMemo(map, 'n', null, 3);
		expect(getBoundedRunMemo(map, 'n')).toBeNull(); // a stored null is a hit
		expect(getBoundedRunMemo(map, 'absent')).toBeUndefined();
		// The measured failure: a 100-entry memo, 10,000 distinct cold keys, one
		// target every record shares. Cleared-whole, the hot key was re-queried
		// after every clear (~100 probes); LRU keeps it: ONE miss.
		const memo = new Map<string, number>();
		let hotMisses = 0;
		for (let n = 0; n < 10_000; n++) {
			if (getBoundedRunMemo(memo, 'HOT') === undefined) {
				hotMisses++;
				setBoundedRunMemo(memo, 'HOT', 1, 100);
			}
			setBoundedRunMemo(memo, `cold${n}`, 1, 100);
			expect(memo.size).toBeLessThanOrEqual(100);
		}
		expect(hotMisses).toBe(1);
	});

	test(`a 3x-cap workload keeps every map <= ${TINY_CAP}, cells byte-identical`, async () => {
		const uncapped = await walk();
		// Vacuity floor: the situation really fills each map past 3x the cap.
		for (const [name, peak] of Object.entries(uncapped.peaks)) {
			expect({ name, reaches3x: peak >= 3 * TINY_CAP }).toEqual({ name, reaches3x: true });
		}
		const capped = await walk(TINY_CAP);
		for (const [name, peak] of Object.entries(capped.peaks)) {
			expect({ name, bounded: peak <= TINY_CAP }).toEqual({ name, bounded: true });
		}
		expect(capped.cells).toEqual(uncapped.cells);
		// Non-vacuous output: the period, the parents chain and a fan-out value
		// all made it into the cells being compared.
		const joined = uncapped.cells.join('\n');
		expect(joined).toContain('Padre > Raíz');
		expect(joined).toContain('Destino 0');
		expect(joined).toContain('Origen 0');
	});
});

// --- (b) identity threading ------------------------------------------------

describe('the export reads identity from explicit arguments, not the request', () => {
	test('non-admin stream: in-request run === background-style run (no request context, decoy data lang)', async () => {
		const inRequest = await runWithRequestContext(
			{ principal: reader, session: null, requestId: 'zzbound-req', clientIp: '' },
			() =>
				runWithRequestLangs({ applicationLang: appLang, dataLang: DATA_LANG }, () =>
					streamLines(streamContext()),
				),
		);
		// Background-style: NO request context (currentPrincipal() is undefined),
		// the job's lang scope carries the interface lang and a DECOY data lang.
		const background = await runWithRequestLangs(
			{ applicationLang: appLang, dataLang: DECOY_DATA_LANG },
			() => streamLines({ ...streamContext(), background: true }),
		);
		expect(background).toEqual(inRequest);

		// Non-vacuous: rows exist, the data lang is the EXPLICIT one (spa values,
		// never the decoy's eng), and the period cell is in the threaded lang.
		const text = inRequest.join('\n');
		expect(inRequest.filter((line) => line.includes('"t":"row"')).length).toBeGreaterThan(0);
		expect(text).toContain('Origen 0');
		expect(text).not.toContain('Source 0');
		expect(text).toContain(`1 ${appYears}`);
	});

	test('createExportRun({applicationLang}) resolves the period cell identically with NO ambient scope', async () => {
		const plan = await compileExportPlan([ddo(PERIOD)] as never, SECTION);
		const field = plan.sections[0]?.fields[0];
		expect(field).toBeDefined();
		const cell = (run: ExportRun) =>
			resolveValueCell(run, field as never, SECTION, SOURCE_IDS[0] as number, DATA_LANG, []);

		const inScope = await runWithRequestLangs(
			{ applicationLang: appLang, dataLang: DATA_LANG },
			() => cell(createExportRun()),
		);
		const threaded = await cell(createExportRun({ applicationLang: appLang }));
		expect(threaded).toBe(inScope);
		expect(threaded).toContain(`1 ${appYears}`);

		// Threaded wins over a CONTRARY ambient scope, too.
		const contrary = await runWithRequestLangs(
			{ applicationLang: config.menu.applicationLang, dataLang: DECOY_DATA_LANG },
			() => cell(createExportRun({ applicationLang: appLang })),
		);
		expect(contrary).toBe(threaded);

		// Teeth: unthreaded, outside any scope, the ALS backstop answers the
		// installation default — the silent wrong answer threading prevents.
		const unthreaded = await cell(createExportRun());
		expect(unthreaded).toContain(`1 ${defaultYears}`);
		expect(unthreaded).not.toBe(threaded);
	});
});

// --- (b) the producer's own scope -------------------------------------------

/** Serialize an opened grid's lines (one JSON per line, NDJSON's bytes). */
async function drainOpened(opened: { lines: AsyncGenerator<Record<string, unknown>> }) {
	const out: string[] = [];
	for await (const line of opened.lines) out.push(JSON.stringify(line));
	return out;
}

const readerRequest = (): RequestContext => ({
	principal: reader,
	session: null,
	requestId: 'zzbound-req',
	clientIp: '',
});

/** The detached job's context: explicit principal, options, interface lang. */
const jobContext = (options: Record<string, unknown>, applicationLang: string) => ({
	principal: reader,
	options,
	applicationLang,
});

describe('openExportGrid runs in its OWN identity scope', () => {
	test('in-request stream === detached producer === producer under a CONTRARY ambient scope', async () => {
		const inRequest = await runWithRequestContext(readerRequest(), () =>
			runWithRequestLangs({ applicationLang: appLang, dataLang: DATA_LANG }, () =>
				streamLines(streamContext()),
			),
		);
		const detached = await drainOpened(
			await openExportGrid(jobContext(streamContext().options, appLang)),
		);
		expect(detached).toEqual(inRequest);

		// Contrary ambient: install-default interface lang, decoy data lang, and a
		// GLOBAL ADMIN as the ambient principal. None of it may leak in.
		const admin = await resolvePrincipal(-1);
		expect(admin.isGlobalAdmin).toBe(true);
		const contrary = await runWithRequestContext(
			{ principal: admin, session: null, requestId: 'zzbound-contrary', clientIp: '' },
			() =>
				runWithRequestLangs(
					{ applicationLang: config.menu.applicationLang, dataLang: DECOY_DATA_LANG },
					async () =>
						drainOpened(await openExportGrid(jobContext(streamContext().options, appLang))),
				),
		);
		expect(contrary).toEqual(inRequest);

		// Non-vacuous: rows exist, spa data, period labels in the explicit lang.
		const text = inRequest.join('\n');
		expect(inRequest.filter((line) => line.includes('"t":"row"')).length).toBeGreaterThan(0);
		expect(text).toContain('Origen 0');
		expect(text).toContain(`1 ${appYears}`);
		expect(text).not.toContain(`1 ${defaultYears}`);
	});

	test('a stream obtained in the request and PULLED after its scope is gone is unchanged', async () => {
		const inScope = await runWithRequestContext(readerRequest(), () =>
			runWithRequestLangs({ applicationLang: appLang, dataLang: DATA_LANG }, () =>
				streamLines(streamContext()),
			),
		);
		// Only the response is taken inside the scope; the body is read outside.
		const response = (await runWithRequestContext(readerRequest(), () =>
			runWithRequestLangs({ applicationLang: appLang, dataLang: DATA_LANG }, () =>
				exportGridUnified(streamContext()),
			),
		)) as unknown as { stream: ReadableStream<Uint8Array> };
		const pulledLater = (await new Response(response.stream).text())
			.split('\n')
			.filter((line) => line !== '');
		expect(pulledLater).toEqual(inScope);
		expect(pulledLater.join('\n')).toContain(`1 ${appYears}`);

		// The generator itself: a generator body runs in the context of whoever
		// calls next(). Opened with NO ambient scope, drained under a CONTRARY one
		// (install-default lang, decoy data lang) — the bytes must not move.
		const opened = await openExportGrid(jobContext(streamContext().options, appLang));
		const drainedContrary = await runWithRequestLangs(
			{ applicationLang: config.menu.applicationLang, dataLang: DECOY_DATA_LANG },
			() => drainOpened(opened),
		);
		expect(drainedContrary).toEqual(inScope);
	});

	test('an unreadable filter hop narrows the selection LOUDLY: refusals travel on the grid', async () => {
		const options = {
			...streamContext().options,
			ar_ddo_to_export: [ddo(TEXT)],
			sqo: {
				section_tipo: [SECTION],
				filter_by_locators: SOURCE_IDS.map((id) => ({ section_tipo: SECTION, section_id: id })),
				filter: {
					$and: [
						{
							q: ['refused hop'],
							path: [
								{ section_tipo: SECTION, component_tipo: PORTAL, model: 'component_portal' },
								{ section_tipo: SECTION, component_tipo: DENIED, model: 'component_input_text' },
							],
						},
					],
				},
			},
		};
		const isDenied = (refusal: { sectionTipo: string; componentTipo?: string }) =>
			refusal.sectionTipo === SECTION && refusal.componentTipo === DENIED;

		// Detached (no request context): narrowed, no throw, refusal carried.
		const detached = await openExportGrid(jobContext(options, appLang));
		const lines = await drainOpened(detached);
		expect(detached.meta.total).toBe(0);
		expect(lines.some((line) => line.includes('"t":"row"'))).toBe(false);
		expect(detached.frontierRefusals.some(isDenied)).toBe(true);

		// A caller serving a request NAMES it: the SAME refusal also reaches that
		// request's context (the envelope's perm.out_of_scope notice source).
		const outer = readerRequest();
		const inRequest = await runWithRequestContext(outer, () =>
			openExportGrid(jobContext(options, appLang), { enclosingRequest: outer }),
		);
		expect(inRequest.frontierRefusals.some(isDenied)).toBe(true);
		expect((outer.frontierRefusals ?? []).some(isDenied)).toBe(true);

		// A request context that is merely AMBIENT (the detached job inherits the
		// submitting request's through the job manager) is never written: that
		// request has ended, the refusals travel on the grid alone.
		const ambient = readerRequest();
		const inherited = await runWithRequestContext(ambient, async () => {
			const opened = await openExportGrid(jobContext(options, appLang));
			await drainOpened(opened);
			return opened;
		});
		expect(inherited.frontierRefusals.some(isDenied)).toBe(true);
		expect(ambient.frontierRefusals ?? []).toEqual([]);

		// The request-serving door (exportGridUnified) names its own request.
		const served = readerRequest();
		await runWithRequestContext(served, () =>
			runWithRequestLangs({ applicationLang: appLang, dataLang: DATA_LANG }, () =>
				exportGridUnified({ ...streamContext(), options }),
			),
		);
		expect((served.frontierRefusals ?? []).some(isDenied)).toBe(true);

		// Control: without the unreadable hop the same selection is not empty.
		const control = await openExportGrid(
			jobContext({ ...options, sqo: { ...options.sqo, filter: undefined } }, appLang),
		);
		expect(control.meta.total).toBe(SOURCE_IDS.length);
		expect(control.frontierRefusals.length).toBe(0);
	});
});
