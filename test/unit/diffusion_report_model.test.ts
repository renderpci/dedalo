/**
 * tool_diffusion run-report MODEL gate (client-side, hermetic).
 *
 * The report the diffusion tool renders is a pure function of one SSE chunk.
 * This suite pins that function. It needs no DB, no server and no browser
 * because tools/tool_diffusion/js/report_model.js imports NOTHING — that
 * constraint exists precisely so this gate can exist.
 *
 * THE GUARANTEES under test:
 * - the verdict comes from the server's `state` when present, and falls back to
 *   the pinned message vocabulary only when it is absent — an unrecognised
 *   chunk classifies LOUDLY as 'unknown', never optimistically as success;
 * - LOSSLESSNESS BY CONSTRUCTION: for any chunk, including one carrying fields
 *   nobody has invented yet, every path of a deep walk is either consumed by a
 *   primary zone or present in the diagnostics readout. This is the mechanical
 *   form of the "no information lost" requirement — a hand-written field list
 *   would rot silently, an enumeration cannot;
 * - the two structural defects of the old renderer stay dead: a run whose
 *   `result.tables` is a truthy `[]` still surfaces its download URLs
 *   (the rdf/xml case), and a FAILED run with no `tables` key at all still
 *   produces a full model instead of rendering nothing;
 * - the table partition never loses a row, and the server's 50-error cap is
 *   reported as a cap rather than silently presented as the whole truth.
 *
 * NOTE the DOM and CSS are NOT covered here and are verified by hand — the
 * tool's client suite (client/dedalo/test/client/js/test_tool_diffusion.js) is
 * listed in `tool_suites_deferred` and gates nothing, so adding cases there
 * would buy a false sense of coverage.
 */

import { describe, expect, test } from 'bun:test';
import {
	build_report_model,
	classify_outcome,
	MSG,
	OUTCOMES,
	SEVERITY,
	tsv_errors,
	tsv_tables,
} from '../../tools/tool_diffusion/js/report_model.js';

/** A minimal well-formed chunk; each test overrides only what it exercises. */
function chunk(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		process_id: 'process_diffusion_-1_mdcat353_rsc170',
		is_running: false,
		started_at: 1785318056757,
		data: { msg: 'OK. Request done', counter: 10, total: 10 },
		total_time: '262 ms',
		errors: [],
		...overrides,
	};
}

/** Deep-walk a chunk the same way the model does, for the losslessness proof. */
function walkPaths(value: unknown, prefix = '', out: string[] = []): string[] {
	const leaves = ['result.tables', 'result.errors', 'errors'];
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		if (prefix !== '') out.push(prefix);
		return out;
	}
	for (const key of Object.keys(value as Record<string, unknown>)) {
		const path = prefix === '' ? key : `${prefix}.${key}`;
		if (leaves.includes(path)) {
			out.push(path);
			continue;
		}
		walkPaths((value as Record<string, unknown>)[key], path, out);
	}
	return out;
}

describe('classify_outcome — server state wins', () => {
	test('each server state maps to its outcome', () => {
		const cases: [string, string][] = [
			['queued', 'queued'],
			['running', 'running'],
			['completed', 'completed'],
			['failed', 'failed'],
			['cancelled', 'cancelled'],
			['interrupted', 'interrupted'],
			['gone', 'gone'],
		];
		for (const [state, expected] of cases) {
			expect(classify_outcome(chunk({ state }))).toBe(expected);
		}
	});

	test("'completed' with a false result is PARTIAL, not success", () => {
		const sse = chunk({
			state: 'completed',
			result: { result: false, msg: 'Partial success: 50 error(s) — see errors' },
		});
		expect(classify_outcome(sse)).toBe('partial');
		expect(SEVERITY[classify_outcome(sse) as keyof typeof SEVERITY]).toBe('warning');
	});

	test('every outcome has a severity', () => {
		for (const outcome of OUTCOMES) {
			expect(typeof SEVERITY[outcome as keyof typeof SEVERITY]).toBe('string');
		}
	});
});

describe('classify_outcome — message fallback (chunks without state)', () => {
	test('the pinned vocabulary still classifies', () => {
		const cases: [string, string][] = [
			[MSG.done, 'completed'],
			[MSG.done_legacy, 'completed'],
			[MSG.cancelled, 'cancelled'],
			[MSG.not_found, 'gone'],
			[`${MSG.partial_prefix}50 error(s) — see errors`, 'partial'],
			[`${MSG.failed_prefix}Duplicate column name 'publicacion'`, 'failed'],
			[MSG.starting, 'queued'],
		];
		for (const [msg, expected] of cases) {
			expect(classify_outcome(chunk({ data: { msg, counter: 0, total: 0 } }))).toBe(expected);
		}
	});

	test('is_running wins over any message', () => {
		expect(classify_outcome(chunk({ is_running: true, data: { msg: MSG.done } }))).toBe('running');
	});

	test('an unrecognised message is LOUD, never a silent success', () => {
		const outcome = classify_outcome(chunk({ data: { msg: 'something nobody pinned' } }));
		expect(outcome).toBe('unknown');
		expect(SEVERITY.unknown).toBe('danger');
	});
});

describe('losslessness by construction (the acceptance gate)', () => {
	test('every walked path is consumed by a zone or present in diagnostics', () => {
		// deliberately carries fields the model was never taught about
		const sse = chunk({
			state: 'completed',
			data: {
				msg: 'OK. Request done',
				counter: 10,
				total: 10,
				section_label: 'Imagen',
				current: { section_id: 319081, time: 228138 },
				total_ms: 228138,
				future_progress_field: 'invented tomorrow',
			},
			result: {
				result: true,
				msg: 'OK. Request done',
				tables: [{ table_name: 'image', records_count: 5, records_affected: 5 }],
				errors: [],
				future_result_field: { nested: 'also invented' },
			},
		});

		const model = build_report_model(sse, {});
		const reachable = new Set<string>([
			...model.consumed,
			...model.diagnostics.map((row: { path: string }) => row.path),
		]);

		const missing = walkPaths(sse).filter((path) => !reachable.has(path));
		expect(missing).toEqual([]);
	});

	test('an unknown field is tagged as un-curated so it is visibly raw', () => {
		const sse = chunk({ data: { msg: 'OK. Request done', counter: 1, total: 1, brand_new: 42 } });
		const model = build_report_model(sse, {});
		const row = model.diagnostics.find((r: { path: string }) => r.path === 'data.brand_new');
		expect(row).toBeDefined();
		expect(row.kind).toBe('unknown');
		expect(row.value).toBe(42);
	});

	test('the complete chunk is always kept verbatim as raw JSON', () => {
		const sse = chunk({ data: { msg: 'OK. Request done', counter: 1, total: 1 } });
		const model = build_report_model(sse, {});
		expect(JSON.parse(model.raw_json)).toEqual(sse);
	});
});

describe('tables partition', () => {
	const sse = chunk({
		state: 'completed',
		result: {
			result: true,
			msg: 'OK. Request done',
			tables: [
				{ table_name: 'documentales', records_count: 0, records_affected: 0 },
				{ table_name: 'image', records_count: 1224190, records_affected: 1224190 },
				{ table_name: 'creditos', records_count: 0, records_affected: 0 },
				{ table_name: 'project', records_count: 590, records_affected: 570 },
			],
		},
	});

	test('no row is lost and plan order survives', () => {
		const { tables } = build_report_model(sse, {});
		expect(tables.total_count).toBe(4);
		expect(tables.nonzero_count + tables.zero_count).toBe(tables.total_count);
		expect(tables.rows.map((r: { table_name: string }) => r.table_name)).toEqual([
			'documentales',
			'image',
			'creditos',
			'project',
		]);
	});

	test('totals are the column sums, and a delta is flagged', () => {
		const { tables } = build_report_model(sse, {});
		expect(tables.totals.records_count).toBe(1224780);
		expect(tables.totals.records_affected).toBe(1224760);
		expect(tables.any_delta).toBe(true);
		expect(tables.rows.find((r: { table_name: string }) => r.table_name === 'project').delta).toBe(
			true,
		);
	});

	test('TSV carries every row including the zeros', () => {
		const model = build_report_model(sse, {});
		expect(tsv_tables(model).split('\n')).toHaveLength(5); // header + 4
	});

	test('success that wrote nothing anywhere is an ANOMALY, not a green tick', () => {
		const model = build_report_model(
			chunk({
				state: 'completed',
				result: {
					result: true,
					msg: 'OK. Request done',
					tables: [{ table_name: 'image', records_count: 0, records_affected: 0 }],
				},
			}),
			{},
		);
		expect(model.tables.all_zero).toBe(true);
		expect(model.all_zero_anomaly).toBe(true);
		expect(model.severity).toBe('warning');
		expect(model.zone_open.tables_zeros).toBe(true);
	});
});

describe('errors', () => {
	test('the server cap is reported as a cap, and raw stays byte-verbatim', () => {
		const errors = Array.from(
			{ length: 50 },
			(_, i) => `rsc170:${1000 + i} dd_lang: no section_tipo`,
		);
		const model = build_report_model(
			chunk({ state: 'completed', result: { result: false, msg: 'Partial', errors } }),
			{},
		);
		expect(model.errors.capped).toBe(true);
		expect(model.errors.raw).toHaveLength(50);
		expect(model.errors.raw).toEqual(errors);
		expect(tsv_errors(model).split('\n')).toHaveLength(50);
	});

	test('repeated per-record errors group but keep their ids', () => {
		const model = build_report_model(
			chunk({
				state: 'completed',
				result: {
					result: false,
					msg: 'Partial',
					errors: [
						'rsc170:1204 dd_lang: locator has no section_tipo',
						'rsc170:1207 dd_lang: locator has no section_tipo',
					],
				},
			}),
			{},
		);
		expect(model.errors.groups).toHaveLength(1);
		expect(model.errors.groups[0].count).toBe(2);
		expect(model.errors.groups[0].ids).toEqual(['rsc170:1204', 'rsc170:1207']);
	});

	test('job-level errors stay distinguishable from run errors', () => {
		const model = build_report_model(
			chunk({ state: 'failed', errors: ['runner died'], result: { result: false, msg: 'x' } }),
			{},
		);
		const job = model.errors.groups.filter((g: { source: string }) => g.source === 'job');
		expect(job).toHaveLength(1);
		expect(job[0].text).toBe('runner died');
	});
});

describe('the two structural defects of the old renderer stay dead', () => {
	test('defect 10.1 — files survive a truthy empty tables array', () => {
		// the old gate was `if (engine_result?.tables)`; [] is truthy, so the SQL
		// branch always won and rdf/xml download buttons were unreachable
		const model = build_report_model(
			chunk({
				state: 'completed',
				result: {
					result: true,
					msg: 'OK. Request done',
					diffusion_class: 'diffusion_rdf',
					tables: [],
					consolidated_files: {
						merged_url: '/media/rdf/merged.rdf',
						zip_url: '/media/rdf/all.zip',
					},
				},
			}),
			{},
		);
		expect(model.format).toBe('rdf');
		expect(model.files.entries).toHaveLength(2);
		expect(model.files.entries.map((e: { kind: string }) => e.kind)).toEqual(['merged', 'zip']);
		expect(model.files.entries[0].name).toBe('merged.rdf');
	});

	test('defect 10.2 — a failure with no tables still yields a full model', () => {
		const model = build_report_model(
			chunk({
				state: 'failed',
				data: {
					msg: "Error. Diffusion run failed: Duplicate column name 'publicacion'",
					counter: 0,
					total: 10,
				},
				result: {
					result: false,
					msg: "Error. Diffusion run failed: Duplicate column name 'publicacion'",
				},
			}),
			{},
		);
		expect(model.outcome).toBe('failed');
		expect(model.severity).toBe('danger');
		expect(model.tables.none_reported).toBe(true);
		expect(model.causes.list).toEqual(["Duplicate column name 'publicacion'"]);
		// a danger model never hides its evidence behind a click
		expect(model.zone_open.causes).toBe(true);
		expect(model.zone_open.diagnostics).toBe(true);
		expect(model.zone_open.raw).toBe(true);
	});

	test('a multi-cause compile failure becomes a list, keeping the original', () => {
		const raw =
			"Error. Diffusion run failed: diffusion plan compile failed for element 'mdcat353':\n" +
			"- missing or unknown properties->diffusion->type ''\n" +
			'- unable to resolve database name';
		const model = build_report_model(
			chunk({ state: 'failed', result: { result: false, msg: raw } }),
			{},
		);
		expect(model.causes.list).toHaveLength(3);
		expect(model.causes.list[1]).toBe("missing or unknown properties->diffusion->type ''");
		expect(model.causes.raw).toBe(raw); // splitting can never lose text
	});

	test('a format that writes unreported files says so instead of showing an empty box', () => {
		const model = build_report_model(
			chunk({
				state: 'completed',
				result: {
					result: true,
					msg: 'OK. Request done',
					diffusion_class: 'diffusion_markdown',
					tables: [],
				},
			}),
			{},
		);
		expect(model.files.entries).toHaveLength(0);
		expect(model.files.unreported_format).toBe(true);
	});
});

describe('robustness — the panel must never be the thing that breaks', () => {
	test('a falsy chunk yields the unknown skeleton rather than throwing', () => {
		const model = build_report_model(null, {});
		expect(model.outcome).toBe('unknown');
		expect(model.tables.none_reported).toBe(true);
		expect(model.errors.raw).toEqual([]);
	});

	test('subject falls back to parsing process_id, and flags that it did', () => {
		const model = build_report_model(chunk({ state: 'completed' }), {});
		expect(model.subject.element_tipo).toBe('mdcat353');
		expect(model.subject.section_tipo).toBe('rsc170');
		expect(model.subject.derived_from_process_id).toBe(true);
	});

	test('the client launch context wins over the parsed id', () => {
		const model = build_report_model(chunk({ state: 'completed' }), {
			item: { tipo: 'mdcat353', label: 'Publicación en web', type: 'sql' },
			section_tipo: 'rsc170',
		});
		expect(model.subject.label).toBe('Publicación en web');
		expect(model.subject.derived_from_process_id).toBe(false);
		expect(model.format).toBe('sql');
	});
});
