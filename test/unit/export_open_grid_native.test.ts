/**
 * `openExportGrid` — the ONE export line producer (src/diffusion/export/grid.ts),
 * extracted 2026-09-23 so a background job can consume the grid OUTSIDE a
 * request (tool_export at scale: the server-built spool).
 *
 * WHAT IT GUARDS.
 *   (a) THE WIRE DID NOT MOVE. For every data_format × breakdown (× both
 *       fill_the_gaps), the lines `openExportGrid` yields, serialized one JSON
 *       per line, are byte-for-byte the NDJSON body `get_export_grid` streams
 *       (exportGridUnified, ndjson_stream:true), and the buffered envelope is
 *       exactly those lines bucketed into meta/columns/rows/end(+unresolved).
 *       The baseline is produced by RUNNING the tool path on each call — never a
 *       stored snapshot of records (records are built here and torn down).
 *   (b) BATCHING IS INVISIBLE. A hydrate batch of 1 (a boundary between every
 *       record) yields the same bytes as the default batch.
 *   (c) CANCELLATION. An aborted signal stops the producer at the next batch
 *       boundary: the lines so far are an exact PREFIX of the full run, no
 *       record past the boundary is emitted, and there is NO 'end' line (the
 *       protocol's one abort signal).
 *   (d) NON-VACUOUS. Every case emits rows with cells, and the breakdown axis is
 *       actually exercised: the three grid_value breakdowns do not all produce
 *       the same bytes (the chain's portal leaf fans out to two items).
 *
 * The context passed is `{ principal, options, applicationLang }` only — no
 * request id, no request ALS: the shape a background job builds. (That the
 * producer is independent of the AMBIENT scope — principal, both langs, the
 * frontier-refusal collector — is gated in
 * export_run_bounds_identity_native.test.ts, which builds the situations those
 * reads need; here both sides run outside any scope, so the explicit
 * applicationLang is the installation default the tool path snapshots.)
 *
 * SITUATION: the BUILT zzexp chain (test/helpers/zzexp_export_chain.ts) — a
 * literal, a dataframe-bearing main and a portal hop landing on a literal, a
 * relation and a fanning-out portal leaf. Suite DB only (the situation writer
 * refuses a database without the dedalo_test_marker).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { dropSituation, ensureSituation } from '../../src/core/test_data/situations/situation.ts';
import type { ToolActionContext } from '../../src/core/tools/module.ts';
import { exportGridUnified, openExportGrid } from '../../src/diffusion/export/index.ts';
import {
	ZZEXP_DATAFRAME_MAIN,
	ZZEXP_HOP,
	ZZEXP_LEAF_LITERAL,
	ZZEXP_LEAF_PORTAL,
	ZZEXP_LEAF_RELATION,
	ZZEXP_LITERAL,
	ZZEXP_MAIN_SECTION,
	ZZEXP_RECORD_IDS,
	ZZEXP_SITUATION,
	ZZEXP_TARGET_SECTION,
} from '../helpers/zzexp_export_chain.ts';

let principal!: Principal;

beforeAll(async () => {
	principal = await resolvePrincipal(-1);
	await ensureSituation(ZZEXP_SITUATION);
});
afterAll(async () => {
	expect(await dropSituation(ZZEXP_SITUATION)).toBe(0);
});

type Line = Record<string, unknown>;

const step = (sectionTipo: string, componentTipo: string) => ({
	section_tipo: sectionTipo,
	component_tipo: componentTipo,
	name: componentTipo,
});

/** Every column kind the chain can express, in one export. */
const DDOS = [
	{ path: [step(ZZEXP_MAIN_SECTION, ZZEXP_LITERAL)] },
	{ path: [step(ZZEXP_MAIN_SECTION, ZZEXP_DATAFRAME_MAIN)] },
	{ path: [step(ZZEXP_MAIN_SECTION, ZZEXP_HOP), step(ZZEXP_TARGET_SECTION, ZZEXP_LEAF_LITERAL)] },
	{
		path: [step(ZZEXP_MAIN_SECTION, ZZEXP_HOP), step(ZZEXP_TARGET_SECTION, ZZEXP_LEAF_RELATION)],
		value_with_parents: true,
	},
	{ path: [step(ZZEXP_MAIN_SECTION, ZZEXP_HOP), step(ZZEXP_TARGET_SECTION, ZZEXP_LEAF_PORTAL)] },
];

const optionsOf = (
	dataFormat: string,
	breakdown: string,
	fillTheGaps: boolean,
): Record<string, unknown> => ({
	section_tipo: ZZEXP_MAIN_SECTION,
	model: 'section',
	data_format: dataFormat,
	breakdown,
	fill_the_gaps: fillTheGaps,
	lang: 'lg-eng',
	ar_ddo_to_export: structuredClone(DDOS),
	sqo: {
		section_tipo: [ZZEXP_MAIN_SECTION],
		offset: 0,
		filter_by_locators: ZZEXP_RECORD_IDS.map((id) => ({
			section_tipo: ZZEXP_MAIN_SECTION,
			section_id: String(id),
		})),
	},
});

/** The tool path's context (what dd_tools_api hands the handler). */
const toolContext = (options: Record<string, unknown>): ToolActionContext =>
	({ principal, userId: -1, options, background: false }) as ToolActionContext;

/** The job's context: WHO, WHAT and in which interface lang — nothing from a
 * request. The lang is the one the tool path snapshots outside any scope. */
const jobContext = (options: Record<string, unknown>) => ({
	principal,
	options,
	applicationLang: config.menu.applicationLang,
});

const serialize = (lines: Line[]): string =>
	lines.map((line) => `${JSON.stringify(line)}\n`).join('');

async function drain(lines: AsyncGenerator<Line>): Promise<Line[]> {
	const out: Line[] = [];
	for await (const line of lines) out.push(line);
	return out;
}

/** Full-run bytes per case, for the non-vacuity check across breakdowns. */
const bytesByCase = new Map<string, string>();

describe('openExportGrid ≡ get_export_grid, byte for byte', () => {
	for (const dataFormat of ['value', 'grid_value', 'dedalo_raw']) {
		for (const breakdown of ['default', 'rows', 'columns']) {
			for (const fillTheGaps of [true, false]) {
				const name = `${dataFormat} × ${breakdown} × fill_the_gaps=${fillTheGaps}`;
				test(name, async () => {
					// BASELINE: run the tool path, stream and buffered.
					const streamed = await exportGridUnified(
						toolContext({ ...optionsOf(dataFormat, breakdown, fillTheGaps), ndjson_stream: true }),
					);
					const streamedBytes = await new Response(
						streamed.stream as ReadableStream<Uint8Array>,
					).text();
					const buffered = await exportGridUnified(
						toolContext(optionsOf(dataFormat, breakdown, fillTheGaps)),
					);

					// THE PRODUCER, as a job would call it.
					const grid = await openExportGrid(
						jobContext(optionsOf(dataFormat, breakdown, fillTheGaps)),
					);
					const lines = await drain(grid.lines);
					const bytes = serialize(lines);

					// (a) stream bytes
					expect(bytes).toBe(streamedBytes);
					// (a) buffered envelope = the same lines, bucketed
					expect(lines[0]).toBe(grid.meta);
					const end = lines[lines.length - 1] as Line;
					expect(end.t).toBe('end');
					const middle = lines.slice(1, -1);
					const rebuilt = {
						meta: grid.meta,
						columns: middle.filter((line) => line.t === 'col'),
						rows: middle.filter((line) => line.t !== 'col'),
						end,
						...(grid.unresolved.length === 0 ? {} : { unresolved: grid.unresolved }),
					};
					expect(JSON.stringify(rebuilt)).toBe(JSON.stringify(buffered.data));

					// (b) a boundary between every record changes nothing
					const perRecord = await openExportGrid(
						jobContext(optionsOf(dataFormat, breakdown, fillTheGaps)),
						{ hydrateBatch: 1 },
					);
					expect(serialize(await drain(perRecord.lines))).toBe(bytes);

					// (d) non-vacuous
					expect(grid.meta.total).toBe(ZZEXP_RECORD_IDS.length);
					expect(end.records).toBe(ZZEXP_RECORD_IDS.length);
					const rows = middle.filter((line) => line.t === 'row');
					expect(rows.length).toBeGreaterThanOrEqual(ZZEXP_RECORD_IDS.length);
					expect(rows.every((row) => Object.keys(row.c as object).length > 0)).toBe(true);
					bytesByCase.set(name, bytes);
				}, 60000);
			}
		}
	}

	test('the breakdown axis is exercised (grid_value breakdowns differ)', () => {
		const gridBytes = ['default', 'rows', 'columns'].map((breakdown) =>
			bytesByCase.get(`grid_value × ${breakdown} × fill_the_gaps=true`),
		);
		expect(gridBytes.every((bytes) => typeof bytes === 'string')).toBe(true);
		// 'columns' spreads the portal leaf's two items across suffixed columns;
		// 'rows' stacks them — the two must not coincide.
		expect(gridBytes[1]).not.toBe(gridBytes[2]);
	});
});

describe('openExportGrid — cooperative cancellation at batch and record boundaries', () => {
	const options = () => optionsOf('grid_value', 'rows', true);

	test('an unaborted signal changes nothing', async () => {
		const full = serialize(await drain((await openExportGrid(jobContext(options()))).lines));
		const controller = new AbortController();
		const withSignal = await openExportGrid(jobContext(options()), {
			signal: controller.signal,
			hydrateBatch: 1,
		});
		expect(serialize(await drain(withSignal.lines))).toBe(full);
	}, 60000);

	test('aborted before the first batch: meta only, no end', async () => {
		const controller = new AbortController();
		controller.abort();
		const grid = await openExportGrid(jobContext(options()), { signal: controller.signal });
		const lines = await drain(grid.lines);
		expect(lines).toEqual([grid.meta]);
	}, 60000);

	test('aborted mid-run: stops at the next boundary, exact prefix, no end', async () => {
		const full = await drain((await openExportGrid(jobContext(options()))).lines);
		const [firstId, secondId] = ZZEXP_RECORD_IDS.map(String);

		const controller = new AbortController();
		const grid = await openExportGrid(jobContext(options()), {
			signal: controller.signal,
			hydrateBatch: 1, // one record per batch: a boundary between the two
		});
		const lines: Line[] = [];
		for await (const line of grid.lines) {
			lines.push(line);
			// Abort INSIDE the first record's batch: the batch finishes (the
			// check is at the boundary, never mid-record), the next never starts.
			if (line.t === 'row' && line.rec === firstId) controller.abort();
		}

		const rows = lines.filter((line) => line.t === 'row');
		const firstRecordRows = full.filter((line) => line.t === 'row' && line.rec === firstId);
		expect(firstRecordRows.length).toBeGreaterThan(1); // the prefix is a whole record
		expect(rows).toEqual(firstRecordRows);
		expect(lines.some((line) => line.rec === secondId)).toBe(false);
		expect(lines.some((line) => line.t === 'end')).toBe(false);
		expect(serialize(lines)).toBe(serialize(full.slice(0, lines.length)));
	}, 60000);

	test('aborted INSIDE one hydrate batch: stops at the next RECORD, not the end of the batch', async () => {
		const full = await drain((await openExportGrid(jobContext(options()))).lines);
		const [firstId, secondId] = ZZEXP_RECORD_IDS.map(String);
		const controller = new AbortController();
		// the DEFAULT batch: both records in ONE chunk — a Stop must not wait for it
		const grid = await openExportGrid(jobContext(options()), { signal: controller.signal });
		const lines: Line[] = [];
		for await (const line of grid.lines) {
			lines.push(line);
			if (line.t === 'row' && line.rec === firstId) controller.abort();
		}
		const firstRecordRows = full.filter((line) => line.t === 'row' && line.rec === firstId);
		expect(lines.filter((line) => line.t === 'row')).toEqual(firstRecordRows);
		expect(lines.some((line) => line.rec === secondId)).toBe(false);
		expect(lines.some((line) => line.t === 'end')).toBe(false);
	}, 60000);
});
