/**
 * END-TO-END PUBLISH GATE (DIFFUSION_PLAN P2 oracle spot-check + P4 keystone).
 *
 * Drives the REAL pipeline — compiled numisdata_mib plan → resolvePublication
 * → mariadb writer — against the live matrix + live MariaDB, into SCRATCH
 * tables only (the plan clone renames the table; real published tables are
 * never written):
 *
 * 1. FUNCTIONAL (spec §10 definition of done): the run creates the table,
 *    adds the typed columns, and sets per-lang rows for real records.
 * 2. ORACLE SPOT-CHECK: the scratch rows are diffed against the rows the OLD
 *    engine actually published in the same database for the same section_ids.
 *    Cell-level diffs are PRINTED (the real table may be stale vs today's
 *    matrix — spec §2.2), PLUS hard asserts for the value-parity columns
 *    closed by the P1/P2 tail work (cross-section chains, json wraps, media
 *    URLs, parents/typology truncation) on the rows the old engine holds:
 *    - EXACT_OLD_COLUMNS must equal the old cells byte-for-byte;
 *    - media URLs must equal them modulo the '/dedalo/<mediaDir>' prefix
 *      (DEDALO_MEDIA_DIR is install config: this self-contained TS install
 *      serves '/dedalo/media', the PHP install published '/dedalo/media_mib');
 *    - STALE_EMPTY_COLUMNS pin the MATRIX-derived expectation (null): those
 *      components hold NO data for these records, the ontology carries no
 *      empty_to_string for them, and neither current PHP chain-processor
 *      code (empty data → field absent from datum) nor the old engine's
 *      processor can produce their old '' cells today — relics of an earlier
 *      publish;
 *    - dd_tm differs by design (run-scoped publish timestamp).
 * 3. RESUME BYTE-EQUIVALENCE (P4 keystone, self-referential and HARD): an
 *    interrupted run resumed from its checkpoint produces byte-identical
 *    rows to an uninterrupted run (same runStartedAt).
 *
 * Skips cleanly when MariaDB or the diffusion domain is unavailable.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { config } from '../../src/config/config.ts';
import { getCompiledPlan } from '../../src/diffusion/plan/cache.ts';
import type { PublicationPlan, SectionPlan } from '../../src/diffusion/plan/types.ts';
import type { ProjectedRow } from '../../src/diffusion/project/lang_ladder.ts';
import { resolvePublication } from '../../src/diffusion/resolve/resolver.ts';
import { getTargetPool } from '../../src/diffusion/targets/mariadb/db.ts';
import { getDiffusionWriter } from '../../src/diffusion/writers/registry.ts';

const ELEMENT = 'numisdata29'; // 'Web MIB' → database web_numisdata_mib
const SECTION = 'numisdata4'; // 'coins' table — richest real section
const SCRATCH_FRESH = 'dedalo_ts_e2e_fresh';
const SCRATCH_RESUMED = 'dedalo_ts_e2e_resumed';
/** Per-section scratch tables for the ddo-fn value-parity gates. */
const SCRATCH_FN_COINS = 'dedalo_ts_e2e_fn_coins';
const SCRATCH_FN_MINTS = 'dedalo_ts_e2e_fn_mints';
const SCRATCH_FN_FINDSPOTS = 'dedalo_ts_e2e_fn_findspots';
const SCRATCH_FN_DESIGNS = 'dedalo_ts_e2e_fn_designs';
const RUN_STARTED_AT = 1751700000; // fixed — determinism across both runs

/**
 * Columns that must equal the OLD engine's published cells byte-for-byte
 * (P1/P2 value-parity tail): cross-section chain values resolved through
 * relation_list/portal hops into related sections' components, json-wrapped
 * locator projections, merge/pipe grouping, date parsing, parents+typology
 * truncation, and the raw relation-locator json.
 */
const EXACT_OLD_COLUMNS = [
	'mint',
	'mint_name',
	'mint_number',
	'mint_data',
	'type',
	'type_full_value',
	'catalogue_type_mint',
	'type_data',
	'type_main_reference_data',
	'material',
	'denomination',
	'date_in',
	'date_out',
	'findspot_place',
	'findspot_data',
	'dd_relations',
] as const;

/** Media-URL columns: old cells modulo the install's '/dedalo/<mediaDir>'. */
const MEDIA_URL_COLUMNS = ['image_obverse', 'image_reverse'] as const;

/**
 * Old cells that read '' but whose live-matrix components are EMPTY and whose
 * ontology nodes carry no empty_to_string/default_value: today's pipeline
 * (PHP chain processor AND old engine included) resolves them to null — the
 * '' cells are stale relics. Pinned to the MATRIX-derived expectation.
 */
const STALE_EMPTY_COLUMNS = ['dies', 'number'] as const;

/**
 * Columns owned by the now-PORTED ddo fns (parse_tag_to_html on coins).
 * Two-mode assert: a NON-EMPTY old cell must match byte-for-byte (the fn is
 * ported, no ledgered diff remains); an old '' cell keeps the stale-empty pin
 * (live matrix holds NO data for those records — countermark_obverse/reverse
 * and public_info are '' for coins 1-6 while their numisdata154/197/150
 * slices are empty; the current PHP fn emits a value-null dd object there).
 */
const FN_OWNED_COLUMNS = ['public_info', 'countermark_obverse', 'countermark_reverse'] as const;

/** Rewrite an old media URL cell to this install's media prefix. */
function withLocalMediaPrefix(oldCell: string): string {
	return oldCell
		.split(' | ')
		.map((url) => url.replace(/^\/dedalo\/[^/]+\//, `/dedalo/${config.mediaDir}/`))
		.join(' | ');
}

let databaseName: string | null = null;

/**
 * Availability probe, evaluated ONCE at module load (S3-66): the e2e needs the
 * demo element's compiled plan (Postgres + dd1190 config) AND a reachable
 * MariaDB target. It used to silent-return from inside the tests — an install
 * lacking either reported PASS having run nothing. Now the whole file gates on
 * test.if(E2E_AVAILABLE) so bun reports explicit SKIPS, with the reason logged.
 */
const E2E = await (async (): Promise<{ ok: boolean; reason: string | null }> => {
	try {
		const plan = await getCompiledPlan(ELEMENT);
		if (plan.target.kind !== 'table') {
			return { ok: false, reason: `element ${ELEMENT} target is not a table` };
		}
		const pool = getTargetPool(plan.target.database);
		await pool.unsafe('SELECT 1');
		databaseName = plan.target.database;
		return { ok: true, reason: null };
	} catch (error) {
		return { ok: false, reason: String(error).slice(0, 300) };
	}
})();
const E2E_AVAILABLE = E2E.ok;
if (!E2E_AVAILABLE) {
	console.warn(
		`[diffusion_publish_e2e] SKIPPED — plan ${ELEMENT} not compilable or MariaDB unreachable on this install: ${E2E.reason}`,
	);
}

/**
 * FROZEN old-engine cells (S2-43 channel 3): the byte oracle for the ported
 * ddo fns lives in test/integration/fixtures/diffusion_old_engine_cells.json,
 * captured by scripts/capture_diffusion_old_cells.ts. The LIVE old tables are
 * prunable (mints#75 was deleted after the audit) — the gate asserts the
 * frozen oracle; live drift is reported by the labeled canary test below.
 */
interface FrozenCell {
	exists: boolean;
	value: string | null;
}
const OLD_CELLS_FIXTURE = (await Bun.file(
	join(import.meta.dir, 'fixtures/diffusion_old_engine_cells.json'),
).json()) as { meta: Record<string, unknown>; cells: Record<string, Record<string, FrozenCell>> };

function frozenOldCell(table: string, sectionId: number, column: string, lang: string): FrozenCell {
	const cell = OLD_CELLS_FIXTURE.cells[`${table}|${sectionId}|${column}`]?.[lang];
	if (cell === undefined) {
		throw new Error(
			`No frozen old-engine cell for ${table}#${sectionId}.${column}/${lang} — re-run scripts/capture_diffusion_old_cells.ts`,
		);
	}
	return cell;
}

afterAll(async () => {
	if (databaseName === null) return;
	const pool = getTargetPool(databaseName);
	for (const table of [
		SCRATCH_FRESH,
		SCRATCH_RESUMED,
		SCRATCH_FN_COINS,
		SCRATCH_FN_MINTS,
		SCRATCH_FN_FINDSPOTS,
		SCRATCH_FN_DESIGNS,
	]) {
		await pool.unsafe(`DROP TABLE IF EXISTS \`${table}\``).catch(() => {});
	}
});

/** Clone the plan down to ONE section with a scratch table name. */
function scratchPlan(
	plan: PublicationPlan,
	tableName: string,
	sectionTipo: string = SECTION,
): PublicationPlan {
	const section = plan.sections.find((entry) => entry.sectionTipo === sectionTipo);
	if (section === undefined) throw new Error(`plan has no section ${sectionTipo}`);
	const cloned = JSON.parse(JSON.stringify(plan)) as PublicationPlan;
	cloned.sections = [{ ...(JSON.parse(JSON.stringify(section)) as SectionPlan), tableName }];
	return cloned;
}

/** Publish the first `recordBudget` primary records of the section. */
async function publish(
	plan: PublicationPlan,
	options: {
		afterSectionId?: number;
		batchSize: number;
		stopAfterBatches?: number;
		sectionTipo?: string;
		skipPublicationStateCheck?: boolean;
	},
): Promise<{ cursor: number; rowsWritten: number }> {
	const writer = getDiffusionWriter(plan.format);
	const session = await writer.open(plan);
	let cursor = options.afterSectionId ?? 0;
	let rowsWritten = 0;
	let batchesDone = 0;
	try {
		await session.ensureSchema();
		const batches = resolvePublication(plan, {
			sectionTipo: options.sectionTipo ?? SECTION,
			runStartedAt: RUN_STARTED_AT,
			afterSectionId: options.afterSectionId,
			batchSize: options.batchSize,
			skipPublicationStateCheck: options.skipPublicationStateCheck,
			maxLevels: 0, // primaries only — the clone carries a single section
		});
		for await (const batch of batches) {
			if (batch.rows.length > 0) {
				await session.writeRows(batch.section, batch.rows as ProjectedRow[]);
				rowsWritten += batch.rows.length;
			}
			if (batch.unpublishIds.length > 0) {
				await session.removeRecords(batch.section, batch.unpublishIds);
			}
			cursor = batch.cursor;
			batchesDone += 1;
			if (options.stopAfterBatches !== undefined && batchesDone >= options.stopAfterBatches) {
				break; // simulated crash/interruption — checkpoint = cursor
			}
		}
		await session.close();
	} catch (error) {
		await session.abort().catch(() => {});
		throw error;
	}
	return { cursor, rowsWritten };
}

/** All rows of a scratch table, stably ordered and JSON-normalized. */
async function tableRows(table: string): Promise<Record<string, unknown>[]> {
	const pool = getTargetPool(databaseName ?? '');
	const rows = (await pool.unsafe(
		`SELECT * FROM \`${table}\` ORDER BY section_id, lang`,
	)) as Record<string, unknown>[];
	return rows;
}

describe('diffusion end-to-end publish (real plan → real matrix → scratch MariaDB)', () => {
	test.if(E2E_AVAILABLE)(
		'functional: table created, typed columns added, per-lang rows set',
		async () => {
			const plan: PublicationPlan = await getCompiledPlan(ELEMENT);
			if (plan.target.kind !== 'table') throw new Error('expected a table target');

			const fresh = scratchPlan(plan, SCRATCH_FRESH);
			// 2 batches × 3 records = 6 primaries end-to-end.
			const outcome = await publish(fresh, { batchSize: 3, stopAfterBatches: 2 });
			expect(outcome.rowsWritten).toBeGreaterThan(0);

			const database = plan.target.database;
			const pool = getTargetPool(database);
			const columns = (await pool.unsafe(
				'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
				[database, SCRATCH_FRESH],
			)) as { COLUMN_NAME: string }[];
			const columnNames = new Set(columns.map((row) => row.COLUMN_NAME));
			expect(columnNames.has('section_id')).toBe(true);
			expect(columnNames.has('lang')).toBe(true);
			// Every non-excluded plan column materialized.
			const sectionPlan = fresh.sections[0];
			for (const field of sectionPlan?.fields ?? []) {
				if (field.excludeColumn === true) continue;
				expect(columnNames.has(field.columnName)).toBe(true);
			}

			const rows = await tableRows(SCRATCH_FRESH);
			expect(rows.length).toBeGreaterThan(0);
			// One row per configured lang per published record.
			const langs = new Set(rows.map((row) => row.lang));
			expect(langs.size).toBe(Math.max(1, fresh.langPolicy.langs.length));
			// Substance check: each record has at least one non-null value column.
			const bySection = new Map<unknown, Record<string, unknown>[]>();
			for (const row of rows) {
				const list = bySection.get(row.section_id) ?? [];
				list.push(row);
				bySection.set(row.section_id, list);
			}
			for (const [sectionId, sectionRows] of bySection) {
				const hasValue = sectionRows.some((row) =>
					Object.entries(row).some(
						([key, value]) =>
							key !== 'section_id' && key !== 'lang' && value !== null && value !== '',
					),
				);
				expect(hasValue, `record ${sectionId} published with no values at all`).toBe(true);
			}
		},
		120000,
	);

	test.if(E2E_AVAILABLE)(
		'oracle spot-check: scratch rows vs the OLD engine-published rows (informational)',
		async () => {
			if (databaseName === null) throw new Error('availability probe did not set databaseName');
			const plan = await getCompiledPlan(ELEMENT);
			const realTable = plan.sections.find((s) => s.sectionTipo === SECTION)?.tableName;
			if (realTable === undefined) return;
			const pool = getTargetPool(databaseName);
			const scratch = await tableRows(SCRATCH_FRESH);
			const ids = [...new Set(scratch.map((row) => String(row.section_id)))];
			if (ids.length === 0) return;
			const placeholders = ids.map(() => '?').join(', ');
			const real = (await pool.unsafe(
				`SELECT * FROM \`${realTable}\` WHERE section_id IN (${placeholders}) ORDER BY section_id, lang`,
				ids,
			)) as Record<string, unknown>[];
			if (real.length === 0) {
				console.warn(`oracle spot-check: no old-engine rows for ids ${ids.join(',')} — skipped`);
				return;
			}
			// Same (section_id, lang) key set for the ids both engines published.
			const keyOf = (row: Record<string, unknown>) => `${row.section_id}|${row.lang}`;
			const realKeys = new Set(real.map(keyOf));
			const scratchKeys = new Set(scratch.map(keyOf));
			let matches = 0;
			let diffs = 0;
			let hardAssertedRows = 0;
			for (const row of scratch) {
				const counterpart = real.find((candidate) => keyOf(candidate) === keyOf(row));
				if (counterpart === undefined) continue;
				for (const [column, value] of Object.entries(row)) {
					if (column === 'section_id' || column === 'lang') continue;
					if (!(column in counterpart)) continue; // schema drift (old table evolved differently)
					const mine = value === null ? null : String(value);
					const theirs = counterpart[column] === null ? null : String(counterpart[column]);
					if (mine === theirs) {
						matches += 1;
					} else {
						diffs += 1;
						console.warn(
							`spot-diff ${keyOf(row)}.${column}: ts=${JSON.stringify(mine)?.slice(0, 80)} old=${JSON.stringify(theirs)?.slice(0, 80)}`,
						);
					}
				}

				// HARD value-parity asserts (see module doc, point 2) on every row the
				// old engine actually published for these ids.
				hardAssertedRows += 1;
				const cell = (source: Record<string, unknown>, column: string): string | null =>
					source[column] === null || source[column] === undefined ? null : String(source[column]);
				for (const column of EXACT_OLD_COLUMNS) {
					if (!(column in counterpart)) continue;
					expect(
						cell(row, column),
						`${keyOf(row)}.${column} must equal the old engine's cell`,
					).toBe(cell(counterpart, column) as string);
				}
				for (const column of MEDIA_URL_COLUMNS) {
					if (!(column in counterpart)) continue;
					const theirs = cell(counterpart, column);
					const expected = theirs === null ? null : withLocalMediaPrefix(theirs);
					expect(
						cell(row, column),
						`${keyOf(row)}.${column} must equal the old cell modulo the media prefix`,
					).toBe(expected as string);
				}
				for (const column of STALE_EMPTY_COLUMNS) {
					if (!(column in counterpart)) continue;
					// Matrix-derived expectation: empty component + no empty_to_string
					// resolves to null under both engines' CURRENT code (old '' = stale).
					expect(
						cell(row, column),
						`${keyOf(row)}.${column} must be null (live matrix empty; old '' is stale)`,
					).toBe(null as unknown as string);
				}
				for (const column of FN_OWNED_COLUMNS) {
					if (!(column in counterpart)) continue;
					const theirs = cell(counterpart, column);
					if (theirs !== null && theirs !== '') {
						// The fn is PORTED: a non-empty old cell is a hard byte gate.
						expect(
							cell(row, column),
							`${keyOf(row)}.${column} must equal the old engine's cell (fn ported)`,
						).toBe(theirs);
					} else if (theirs === '') {
						// Stale-empty pin (see FN_OWNED_COLUMNS doc).
						expect(
							cell(row, column),
							`${keyOf(row)}.${column} must be null (live matrix empty; old '' is stale)`,
						).toBe(null as unknown as string);
					}
				}
				// dd_tm is the run-scoped publish timestamp — differs from old BY DESIGN.
				if ('dd_tm' in counterpart) {
					expect(cell(row, 'dd_tm')).toBe(String(RUN_STARTED_AT));
				}
			}
			console.warn(
				`oracle spot-check: ${matches} matching cells, ${diffs} differing cells across ${scratchKeys.size} rows; hard value-parity asserts on ${hardAssertedRows} old-published row(s)`,
			);
			// Soft floor: engines sharing a live install must agree on SOMETHING.
			expect(matches).toBeGreaterThan(0);
			expect(realKeys.size).toBeGreaterThan(0);
		},
		60000,
	);

	test.if(E2E_AVAILABLE)(
		'P4 keystone: interrupted run resumed from checkpoint == uninterrupted run, byte-for-byte',
		async () => {
			const plan = await getCompiledPlan(ELEMENT);
			const resumed = scratchPlan(plan, SCRATCH_RESUMED);

			// Interrupted: 1 batch of 3, then "crash"; resume from the checkpoint.
			const first = await publish(resumed, { batchSize: 3, stopAfterBatches: 1 });
			const second = await publish(resumed, {
				batchSize: 3,
				afterSectionId: first.cursor,
				stopAfterBatches: 1,
			});
			expect(second.rowsWritten).toBeGreaterThan(0);

			// The fresh table already holds the same 6 records (2×3, same
			// runStartedAt) — the resumed table must be BYTE-IDENTICAL.
			const freshRows = await tableRows(SCRATCH_FRESH);
			const resumedRows = await tableRows(SCRATCH_RESUMED);
			expect(resumedRows.length).toBe(freshRows.length);
			for (let index = 0; index < freshRows.length; index++) {
				expect(JSON.stringify(resumedRows[index])).toBe(JSON.stringify(freshRows[index]));
			}
		},
		120000,
	);

	/**
	 * DDO-FN VALUE PARITY (parse_tag_to_html / get_geojson_data /
	 * get_diffusion_iconography — the three ported publication fns).
	 *
	 * Gate records were MINED from the old published DB (read-only queries):
	 * the only NON-EMPTY old cells these fns own in web_numisdata_mib are
	 * coins#64019.public_info, mints#75.georef_geojson and
	 * findspots#3.georef_geojson — those are HARD byte gates. countermark_*
	 * and every iconography column (types.creators_roles: 0 non-empty of all
	 * rows; designs.iconography: NULL on all 22 published rows) were NEVER
	 * published non-empty by the old engine, so their gates pin the
	 * MATRIX-derived expectation (PHP-current-code semantics) as literals:
	 * - coins#203 countermark_obverse: the old table has NO row for 203 at
	 *   all; the stored numisdata154 svg tag renders per the PHP TR + the
	 *   dd1190 numisdata1052 output_sample grammar;
	 * - designs#401 iconography: the old cell EXISTS and is NULL although the
	 *   matrix holds full scene/term data — proof the old engine never ran
	 *   this fn for that publish; the pinned literal is the PHP method's
	 *   composition over today's matrix (verified against the live thesaurus
	 *   terms icon1#24/216/26… via ts_object term resolution).
	 *
	 * Runs use skipPublicationStateCheck (gate parity is covered by the
	 * primary-run tests; these runs assert VALUE parity on specific records).
	 */
	test.if(E2E_AVAILABLE)(
		'ddo fns: parse_tag_to_html / get_geojson_data / get_diffusion_iconography parity',
		async () => {
			if (databaseName === null) throw new Error('availability probe did not set databaseName');
			const plan = await getCompiledPlan(ELEMENT);
			const pool = getTargetPool(databaseName);
			const langs = plan.langPolicy.langs;
			expect(langs.length).toBeGreaterThan(0);

			const publishOne = async (
				sectionTipo: string,
				table: string,
				sectionId: number,
			): Promise<void> => {
				const cloned = scratchPlan(plan, table, sectionTipo);
				await publish(cloned, {
					sectionTipo,
					afterSectionId: sectionId - 1,
					batchSize: 1,
					stopAfterBatches: 1,
					skipPublicationStateCheck: true,
				});
			};
			const scratchCell = async (
				table: string,
				sectionId: number,
				lang: string,
				column: string,
			): Promise<string | null> => {
				const rows = (await pool.unsafe(
					`SELECT \`${column}\` AS v FROM \`${table}\` WHERE section_id = ? AND lang = ?`,
					[sectionId, lang],
				)) as { v: unknown }[];
				expect(rows.length, `${table}#${sectionId}/${lang} row must exist`).toBe(1);
				const value = rows[0]?.v;
				return value === null || value === undefined ? null : String(value);
			};
			// 1. parse_tag_to_html — coins#64019 public_info: the ONLY non-empty
			// old public_info cell. HARD byte gate on every configured lang,
			// against the FROZEN old-engine oracle (S2-43 channel 3).
			await publishOne(SECTION, SCRATCH_FN_COINS, 64019);
			for (const lang of langs) {
				const old = frozenOldCell('coins', 64019, 'public_info', lang);
				expect(old.exists, `frozen coins#64019/${lang} cell must exist`).toBe(true);
				expect(old.value, 'the mined old cell must be non-empty').toBe('<p>ACIP 2</p><p></p>');
				expect(await scratchCell(SCRATCH_FN_COINS, 64019, lang, 'public_info')).toBe(old.value);
			}

			// 2. parse_tag_to_html — coins#203 countermark_obverse (svg tag).
			// Matrix-derived literal: the old engine NEVER published coins 203
			// (no row — frozen as exists:false), so no old byte-oracle exists; the
			// expectation is the PHP fn semantics over the stored numisdata154 value
			// "<p>[svg-n-1--data:{'section_tipo':'sccmk1','section_id':'461',…}:data]</p>"
			// and matches the dd1190 numisdata1052 output_sample grammar.
			const old203 = frozenOldCell('coins', 203, 'countermark_obverse', langs[0] as string);
			expect(old203.exists, 'coins#203 must be ABSENT from the old table (mined)').toBe(false);
			await publishOne(SECTION, SCRATCH_FN_COINS, 203);
			expect(
				await scratchCell(SCRATCH_FN_COINS, 203, langs[0] as string, 'countermark_obverse'),
			).toBe(
				`<p><img id="[svg-n-1-]" src="/dedalo/${config.mediaDir}/svg/web/hierarchy95_sccmk1_461.svg" class="svg" data-type="svg" data-tag_id="1" data-state="n" data-label="" data-data="{'section_tipo':'sccmk1','section_id':'461','component_tipo':'hierarchy95'}"></p>`,
			);

			// 3. get_geojson_data — findspots#3 (Polygon): frozen old-engine byte
			// gate (lib_data layers verbatim, [{layer_id,text,layer_data}]).
			await publishOne('tchi1', SCRATCH_FN_FINDSPOTS, 3);
			for (const lang of langs) {
				const old = frozenOldCell('findspots', 3, 'georef_geojson', lang);
				expect(old.exists, `frozen findspots#3/${lang} cell must exist`).toBe(true);
				expect(old.value ?? '').not.toBe('');
				expect(await scratchCell(SCRATCH_FN_FINDSPOTS, 3, lang, 'georef_geojson')).toBe(old.value);
			}

			// 3b. get_geojson_data — mints#75 (Point). The old engine HAD published
			// this row (the audit's oracle), but the live old table was pruned
			// after the audit and before the cells were frozen — the old bytes are
			// unrecoverable. The fn's byte-parity vs the old engine stays anchored
			// by the findspots#3 Polygon gate above; this pins the Point case as a
			// matrix-derived regression literal (same [{layer_id,text,layer_data}]
			// grammar over the stored numisdata264 geolocation).
			await publishOne('numisdata6', SCRATCH_FN_MINTS, 75);
			const MINTS_75_POINT_GEOJSON =
				'[{"layer_id":1,"text":"","layer_data":{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[3.120603218165126,42.13457368415802]},"properties":{}}]}}]';
			for (const lang of langs) {
				const frozen = frozenOldCell('mints', 75, 'georef_geojson', lang);
				expect(frozen.exists, 'old mints#75 rows were pruned live (ledgered rot)').toBe(false);
				expect(await scratchCell(SCRATCH_FN_MINTS, 75, lang, 'georef_geojson')).toBe(
					MINTS_75_POINT_GEOJSON,
				);
			}

			// 4. get_diffusion_iconography — designs#401 (portal numisdata65 →
			// scenes numisdata54 → inner numisdata722 terms). The frozen old cell
			// exists and is NULL (stale: the fn never ran in the old publish — ALL
			// 22 old designs rows carry NULL iconography while the matrix holds
			// 1390 design records with scene data). Pinned literal = the PHP
			// method's join over today's matrix/thesaurus.
			const oldDesign = frozenOldCell('designs', 401, 'iconography', langs[0] as string);
			expect(oldDesign.exists, 'frozen designs#401 cell must exist (mined)').toBe(true);
			expect(oldDesign.value, 'old iconography is NULL — never published (justification)').toBe(
				null as unknown as string,
			);
			await publishOne('numisdata38', SCRATCH_FN_DESIGNS, 401);
			expect(await scratchCell(SCRATCH_FN_DESIGNS, 401, langs[0] as string, 'iconography')).toBe(
				'Aqueloo | Toro androcéfalo, Media figura, a izquierda | Prótomo | Parte anterior',
			);
		},
		240000,
	);

	// LIVE-vs-FROZEN drift canary (labeled, informational): reports when the
	// live old-engine tables have drifted from the frozen oracle so the rot is
	// VISIBLE without turning the byte gates red (S2-43 channel 3). A drift
	// here means: adjudicate, then either keep the fixture (rot) or re-run
	// scripts/capture_diffusion_old_cells.ts --force (deliberate re-publish).
	test.if(E2E_AVAILABLE)(
		'old-engine drift canary (informational, never gates the fns)',
		async () => {
			if (databaseName === null) throw new Error('availability probe did not set databaseName');
			const pool = getTargetPool(databaseName);
			let drift = 0;
			for (const [key, perLang] of Object.entries(OLD_CELLS_FIXTURE.cells)) {
				const [table, sectionId, column] = key.split('|') as [string, string, string];
				for (const [lang, frozen] of Object.entries(perLang)) {
					const rows = (await pool.unsafe(
						`SELECT \`${column}\` AS v FROM \`${table}\` WHERE section_id = ? AND lang = ?`,
						[Number(sectionId), lang],
					)) as { v: unknown }[];
					const live: { exists: boolean; value: string | null } =
						rows.length === 0
							? { exists: false, value: null }
							: {
									exists: true,
									value:
										rows[0]?.v === null || rows[0]?.v === undefined ? null : String(rows[0]?.v),
								};
					if (live.exists !== frozen.exists || live.value !== frozen.value) {
						drift += 1;
						console.warn(
							`[OLD-ENGINE-DRIFT] ${key}/${lang}: frozen={exists:${frozen.exists}} live={exists:${live.exists}}`,
						);
					}
				}
			}
			if (drift === 0) {
				console.warn('[OLD-ENGINE-DRIFT] none — live old tables still match the frozen oracle');
			}
		},
		60000,
	);
});
