/**
 * Legacy datum replay — the stage E-F parity keystone (DIFFUSION_PLAN D3-P1).
 *
 * The old engine's frozen PHP wire fixtures (copied verbatim into
 * test/parity/fixtures/diffusion/legacy_datum/) are mapped through a
 * TEST-ONLY `legacyDatumToIR` adapter at the TRANSFORM+PROJECTION seam:
 * datum field groups → MetaValueIR atoms + FieldTransformSpec, then the NEW
 * engine's transform (resolve/transform.ts) and lang ladder
 * (project/lang_ladder.ts) produce the rows, diffed EXACTLY against the old
 * engine's outputs:
 *
 * - contract/php_response.golden.json → contract/processed_tables.golden.json
 *   (whole database/table/records/deletions, incl. the 'delete' sentinel →
 *   deletions mapping — oracle contract.test.ts:55-72);
 * - php_response_multilang.json → the 5-level ladder expectations the oracle
 *   pinned in processor_fixtures.test.ts:43-82 (exact / nolan / main_lang /
 *   any-available / missing→null, one row per configured lang);
 * - php_response_column_order.json → the no-parser column-aware auto-merge
 *   (processor_fixtures.test.ts:84-92 — 'Madrid, Spain | Paris, France');
 * - php_response_minimal.json → nolan value landing in the single configured
 *   lang (processor_fixtures.test.ts:18-41).
 *
 * The adapter deliberately mirrors ONLY the wire-shape mapping (flatten_fields
 * :290-327, sanitize_column_name :818-824, database/table resolution
 * :185-213); every semantic step runs through the production modules.
 */

import { describe, expect, test } from 'bun:test';
import type { MetaValueIR, ParserContext } from '../../src/diffusion/parsers/types.ts';
import type { ParserStepConfig } from '../../src/diffusion/plan/types.ts';
import { NOLAN_KEY, projectRecordRows } from '../../src/diffusion/project/lang_ladder.ts';
import type {
	ColumnLangValues,
	FieldProjectionPolicy,
} from '../../src/diffusion/project/lang_ladder.ts';
import { fieldValuesToColumn } from '../../src/diffusion/resolve/transform.ts';
import type { FieldTransformSpec } from '../../src/diffusion/resolve/transform.ts';
import legacyGolden from '../parity/fixtures/diffusion/legacy_datum/php_response.golden.json';
import legacyColumnOrder from '../parity/fixtures/diffusion/legacy_datum/php_response_column_order.json';
import legacyMinimal from '../parity/fixtures/diffusion/legacy_datum/php_response_minimal.json';
import legacyMultilang from '../parity/fixtures/diffusion/legacy_datum/php_response_multilang.json';
import processedGolden from '../parity/fixtures/diffusion/legacy_datum/processed_tables.golden.json';

// ---------------------------------------------------------------------------
// Legacy wire shapes (oracle lib/types.ts:48-135) — test-only.
// ---------------------------------------------------------------------------

interface LegacyEntry {
	value: unknown;
	[extra: string]: unknown;
}
interface LegacyFieldGroup {
	tipo: string;
	lang: string | null;
	entries: LegacyEntry[];
	id: string | null;
	section_id?: number | string;
	section_tipo?: string;
}
interface LegacyContextField {
	term: string;
	tipo: string;
	model: string;
	parent: string;
	parser: Record<string, unknown> | Record<string, unknown>[];
	columns?: { tipo: string; model: string }[];
	output_format?: string;
	empty_to_string?: unknown;
	default_value?: unknown;
}
interface LegacyDatumRecord {
	section_id: number | string;
	fields: Record<string, LegacyFieldGroup[]> | 'delete';
}
interface LegacyDatumGroup {
	diffusion_tipo: string;
	section_tipo: string;
	term: string;
	model: string;
	context: LegacyContextField[];
	data: LegacyDatumRecord[];
}
interface LegacyResponse {
	result: boolean;
	langs?: Record<string, string>;
	main_lang?: string;
	main?: { diffusion_tipo: string; term?: string; model: string }[];
	datum?: LegacyDatumGroup[];
}

/** The old engine's processed table shape (oracle types.ts:153-166). */
interface ReplayedTable {
	database_name: string;
	table_name: string;
	section_tipo: string;
	records: {
		section_id: number | string;
		lang: string | null;
		columns: Record<string, string | null>;
	}[];
	deletions: (number | string)[];
}

// ---------------------------------------------------------------------------
// legacyDatumToIR — the wire-shape adapter.
// ---------------------------------------------------------------------------

/** Oracle sanitize_column_name (diffusion_processor.ts:818-824). */
function sanitizeColumnName(term: string): string {
	return term
		.toLowerCase()
		.replace(/[^a-z0-9_]/g, '_')
		.replace(/_+/g, '_')
		.replace(/^_+|_+$/g, '');
}

/** Oracle resolve_database_name (:185-198), env fallback dropped to a constant. */
function resolveDatabaseName(response: LegacyResponse): string {
	const node = (response.main ?? []).find(
		(main) => (main.model === 'database' || main.model === 'database_alias') && main.term,
	);
	return node?.term ?? 'web_dedalo';
}

/** flatten_fields (:290-327): one group's entries → MetaValueIR atoms. */
function groupsToAtoms(groups: LegacyFieldGroup[]): MetaValueIR[] {
	const atoms: MetaValueIR[] = [];
	for (const group of groups) {
		for (const entry of group.entries) {
			const lang = !group.lang || group.lang === 'lg-nolan' ? null : group.lang;
			const raw = entry.value;
			const atom: MetaValueIR =
				raw === null ||
				raw === undefined ||
				typeof raw === 'string' ||
				typeof raw === 'number' ||
				typeof raw === 'boolean'
					? { kind: 'scalar', value: raw ?? null, lang }
					: { kind: 'json', value: raw, lang };
			atom.meta = {
				sourceId: group.id,
				tipo: group.tipo,
				sectionId: group.section_id ?? null,
				sectionTipo: group.section_tipo ?? null,
			};
			atoms.push(atom);
		}
	}
	return atoms;
}

/** Oracle parser normalization: {} → none, object → one step, array → chain. */
function normalizeParser(raw: LegacyContextField['parser']): ParserStepConfig[] {
	const list = Array.isArray(raw) ? raw : [raw];
	const steps: ParserStepConfig[] = [];
	for (const entry of list) {
		if (entry === null || typeof entry !== 'object') continue;
		const fn = (entry as { fn?: unknown }).fn;
		if (typeof fn !== 'string' || fn === '') continue;
		steps.push({
			fn,
			id: typeof (entry as { id?: unknown }).id === 'string' ? String(entry.id) : undefined,
			options: ((entry as { options?: unknown }).options as Record<string, unknown>) ?? {},
		});
	}
	return steps;
}

/**
 * Replay one legacy PHP response through the NEW transform + projection
 * modules — the whole point of the gate: only the adapter above is bespoke.
 */
function replayLegacyResponse(response: LegacyResponse): ReplayedTable[] {
	if (response.result !== true || !response.datum || !response.main) return [];
	const langs = Object.keys(response.langs ?? {});
	const mainLang = response.main_lang ?? null;
	const parserCtx: ParserContext = { langs, mainLang };
	const databaseName = resolveDatabaseName(response);

	const tables: ReplayedTable[] = [];
	for (const datum of response.datum) {
		const records: ReplayedTable['records'] = [];
		const deletions: (number | string)[] = [];

		for (const record of datum.data) {
			// The 'delete' sentinel → the unpublish path (deletions list).
			if (record.fields === 'delete') {
				deletions.push(record.section_id);
				continue;
			}

			const columnValues = new Map<string, ColumnLangValues>();
			const fieldPolicies = new Map<string, FieldProjectionPolicy>();
			for (const context of datum.context) {
				const columnName = sanitizeColumnName(context.term);

				const policy: FieldProjectionPolicy = {};
				if (context.empty_to_string) policy.emptyToString = true;
				if (context.default_value !== undefined && context.default_value !== null) {
					policy.defaultValue = String(context.default_value);
				}
				if (Object.keys(policy).length > 0) fieldPolicies.set(columnName, policy);

				const groups = record.fields[context.tipo] ?? [];
				const atoms = groupsToAtoms(groups);
				const spec: FieldTransformSpec = {
					transform: normalizeParser(context.parser),
					outputFormat: context.output_format,
				};
				if (context.columns !== undefined && context.columns.length > 0) {
					spec.mergeColumns = context.columns;
				}
				columnValues.set(columnName, fieldValuesToColumn(atoms, spec, parserCtx));
			}

			const rows = projectRecordRows(
				record.section_id,
				columnValues,
				{ langs, mainLang },
				fieldPolicies,
			);
			for (const row of rows) {
				records.push({ section_id: row.sectionId, lang: row.lang, columns: row.columns });
			}
		}

		tables.push({
			database_name: databaseName,
			table_name: datum.term || datum.diffusion_tipo,
			section_tipo: datum.section_tipo,
			records,
			deletions,
		});
	}
	return tables;
}

// ---------------------------------------------------------------------------
// Contract golden: whole input/output pair, deep-equal.
// ---------------------------------------------------------------------------

describe('contract golden (php_response.golden → processed_tables.golden)', () => {
	const tables = replayLegacyResponse(legacyGolden as unknown as LegacyResponse);

	test('one table with the exact database/table/section identity', () => {
		expect(tables).toHaveLength(1);
		const [table] = tables;
		const [golden] = processedGolden as unknown as ReplayedTable[];
		expect(table?.database_name).toBe(golden?.database_name as string);
		expect(table?.table_name).toBe(golden?.table_name as string);
		expect(table?.section_tipo).toBe(golden?.section_tipo as string);
	});

	test('records replay EXACTLY (deep-equal, lang expansion included)', () => {
		const [golden] = processedGolden as unknown as ReplayedTable[];
		expect(JSON.parse(JSON.stringify(tables[0]?.records))).toEqual(golden?.records);
	});

	test("the 'delete' sentinel maps to deletions [2]", () => {
		const [golden] = processedGolden as unknown as ReplayedTable[];
		expect(tables[0]?.deletions).toEqual(golden?.deletions as (number | string)[]);
	});
});

// ---------------------------------------------------------------------------
// Multilang ladder (oracle processor_fixtures.test.ts:43-82).
// ---------------------------------------------------------------------------

describe('multilang fixture — the 5-level ladder', () => {
	const tables = replayLegacyResponse(legacyMultilang as unknown as LegacyResponse);
	const records = tables[0]?.records ?? [];
	const byLang = Object.fromEntries(records.map((row) => [row.lang, row.columns])) as Record<
		string,
		Record<string, string | null>
	>;

	test('one record per configured language', () => {
		expect(records.map((row) => row.lang).sort()).toEqual(['lg-cat', 'lg-eng', 'lg-spa']);
	});

	test('level 1 — exact lang match', () => {
		expect(byLang['lg-eng']?.exact).toBe('exact-eng');
		expect(byLang['lg-spa']?.exact).toBe('exact-spa');
		expect(byLang['lg-cat']?.exact).toBe('exact-cat');
	});

	test('level 2 — nolan duplicated to every lang', () => {
		for (const lang of ['lg-eng', 'lg-spa', 'lg-cat']) {
			expect(byLang[lang]?.nolan_only).toBe('nolan-value');
		}
	});

	test('level 3 — main_lang fallback', () => {
		expect(byLang['lg-spa']?.main_only).toBe('main-value');
		expect(byLang['lg-cat']?.main_only).toBe('main-value');
	});

	test('level 4 — any available lang', () => {
		for (const lang of ['lg-eng', 'lg-spa', 'lg-cat']) {
			expect(byLang[lang]?.any_only).toBe('any-value');
		}
	});

	test('level 5 — no data at all → null', () => {
		for (const lang of ['lg-eng', 'lg-spa', 'lg-cat']) {
			expect(byLang[lang]?.missing).toBeNull();
		}
	});
});

// ---------------------------------------------------------------------------
// Column-order fixture — no-parser column-aware auto-merge (oracle :84-92).
// ---------------------------------------------------------------------------

describe('column_order fixture — auto column merge', () => {
	test('columns without a parser collapse via merge(columns, string)', () => {
		const tables = replayLegacyResponse(legacyColumnOrder as unknown as LegacyResponse);
		expect(tables[0]?.records).toHaveLength(1);
		expect(tables[0]?.records[0]?.columns.place).toBe('Madrid, Spain | Paris, France');
	});
});

// ---------------------------------------------------------------------------
// Minimal fixture (oracle :18-41) + guard branches.
// ---------------------------------------------------------------------------

describe('minimal fixture', () => {
	test('nolan value lands in the single configured lang', () => {
		const tables = replayLegacyResponse(legacyMinimal as unknown as LegacyResponse);
		expect(tables[0]?.database_name).toBe('web_test_diffusion');
		expect(tables[0]?.table_name).toBe('minimal');
		expect(tables[0]?.records).toEqual([
			{ section_id: 7, lang: 'lg-eng', columns: { code: 'only-value' } },
		]);
	});

	test('failed / empty responses replay to no tables (oracle guard)', () => {
		expect(replayLegacyResponse({ result: false } as LegacyResponse)).toEqual([]);
		expect(replayLegacyResponse({ result: true } as LegacyResponse)).toEqual([]);
	});

	test('NOLAN_KEY is the ladder sentinel the adapter relies on', () => {
		expect(NOLAN_KEY).toBe('nolan');
	});
});
