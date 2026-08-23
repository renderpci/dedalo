/**
 * The published-lang sweep is a DESTRUCTIVE operator action against a
 * publication database that is frequently SHARED with other content, so every
 * one of its refusals is an invariant here, not prose in a header
 * (AGENTS.md / DEC-12).
 *
 * What this gate pins (src/diffusion/targets/mariadb/lang_sweep.ts):
 *  - a table lacking the diffusion marker is NEVER read and NEVER swept — the
 *    marker is the generator's composite PRIMARY KEY (section_id, lang)
 *    (sql_generator.ts generateCreateTable) AND a table name the diffusion map
 *    declares. This is THE data-destruction guard: before 2026-08-23 discovery
 *    was "any table with a `lang` column", which reaches a CMS table, a
 *    translations table, or a colleague's working table in the same schema;
 *  - an empty / non-string / whitespace lang list is refused;
 *  - a lang that IS in the publication policy is refused, and cannot reach a
 *    DELETE even if the policy changed after the caller's report;
 *  - an unknown target database is refused;
 *  - the API action is REGISTERED, admin-only, and needs confirm:true.
 *
 * No live MariaDB and no ontology: the module takes its whole outside world as
 * an injected `LangSweepDependencies`, so the decision logic is gated as pure
 * logic with a recording fake pool. No install-specific TLD appears — this
 * gate builds the entire situation it tests.
 */

import { describe, expect, test } from 'bun:test';
import type { ApiRequestContext } from '../../src/core/api/handler_context.ts';
import { diffusionApiActions } from '../../src/core/api/handlers/dd_diffusion_api.ts';
import { DedaloError } from '../../src/core/errors/dedalo_error.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import {
	auditPublishedLangs,
	discoverPublishedTables,
	type LangSweepDependencies,
	type MariadbQueryable,
	normalizeSweepLangs,
	OPERATOR_AUDIT_BUDGET,
	PUBLISHED_TABLE_MARKER_SQL,
	sweepPhantomLangs,
} from '../../src/diffusion/targets/mariadb/lang_sweep.ts';

const TARGET_DB = 'zz_pub_test';
/** Diffusion-created: composite PK marker AND declared by the map. */
const MARKED_TABLE = 'zz_test_published';
/** Composite PK marker, but the map does not declare it (a stale/foreign clone). */
const UNDECLARED_TABLE = 'zz_test_not_in_map';
/** A stranger's table in the same schema: a `lang` column and nothing else. */
const FOREIGN_TABLE = 'cms_translations';

const POLICY = ['lg-spa', 'lg-eng'];
const PHANTOM = '["lg-cat"'; // the exact debris shape the JSON-split defect produced

interface RecordedStatement {
	sql: string;
	params: unknown[];
}

interface FakeTargetSpec {
	/** Tables whose PRIMARY KEY is exactly (section_id, lang). */
	markerTables: string[];
	/** How many tables of the schema carry a `lang` column at all. */
	langColumnTables: number;
	/** Rows per table, as the GROUP BY lang read would answer. */
	rowsByTable: Record<string, { lang: string | null; n: number }[]>;
}

/** A pool that answers the three statement shapes and records every one. */
function fakePool(spec: FakeTargetSpec, log: RecordedStatement[]): MariadbQueryable {
	const remaining = new Map<string, number>();
	for (const [table, rows] of Object.entries(spec.rowsByTable)) {
		for (const row of rows) {
			if (row.lang !== null) remaining.set(`${table}|${row.lang}`, row.n);
		}
	}
	return {
		unsafe(sql: string, params: unknown[] = []): PromiseLike<unknown> {
			log.push({ sql, params });
			if (sql.includes('INFORMATION_SCHEMA.STATISTICS')) {
				return Promise.resolve(spec.markerTables.map((name) => ({ table_name: name })));
			}
			if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) {
				return Promise.resolve([{ n: spec.langColumnTables }]);
			}
			const audited = /FROM `([^`]+)` GROUP BY lang/.exec(sql);
			if (audited !== null) {
				const table = audited[1] ?? '';
				const rows = (spec.rowsByTable[table] ?? []).filter(
					(row) => row.lang === null || (remaining.get(`${table}|${row.lang}`) ?? 0) > 0,
				);
				return Promise.resolve(rows);
			}
			const deleted = /DELETE FROM `([^`]+)`/.exec(sql);
			if (deleted !== null) {
				const key = `${deleted[1] ?? ''}|${String(params[0])}`;
				const affected = remaining.get(key) ?? 0;
				remaining.set(key, 0);
				return Promise.resolve({ affectedRows: affected });
			}
			throw new Error(`unexpected statement: ${sql}`);
		},
	};
}

/** The whole situation: one target database, three tables, one phantom lang. */
function buildDependencies(
	log: RecordedStatement[],
	overrides: Partial<FakeTargetSpec> & { policy?: string[]; declared?: string[] } = {},
): LangSweepDependencies {
	const spec: FakeTargetSpec = {
		markerTables: overrides.markerTables ?? [MARKED_TABLE, UNDECLARED_TABLE],
		langColumnTables: overrides.langColumnTables ?? 3, // + the foreign one
		rowsByTable: overrides.rowsByTable ?? {
			[MARKED_TABLE]: [
				{ lang: 'lg-spa', n: 40 },
				{ lang: PHANTOM, n: 7 },
				{ lang: null, n: 3 },
			],
			[UNDECLARED_TABLE]: [{ lang: PHANTOM, n: 11 }],
			[FOREIGN_TABLE]: [{ lang: PHANTOM, n: 99 }],
		},
	};
	const pool = fakePool(spec, log);
	return {
		getPool: () => pool,
		listTargetDatabases: async () => ({ databases: [TARGET_DB], invalid: [] }),
		listDeclaredTables: async () => new Set(overrides.declared ?? [MARKED_TABLE]),
		policyLangs: () => overrides.policy ?? [...POLICY],
	};
}

describe('discovery — the marker is the composite PK, not "has a lang column"', () => {
	test('the discovery statement reads the PRIMARY KEY anatomy the generator emits', () => {
		expect(PUBLISHED_TABLE_MARKER_SQL).toContain('INFORMATION_SCHEMA.STATISTICS');
		expect(PUBLISHED_TABLE_MARKER_SQL).toContain("INDEX_NAME = 'PRIMARY'");
		expect(PUBLISHED_TABLE_MARKER_SQL).toContain('COUNT(*) = 2');
		expect(PUBLISHED_TABLE_MARKER_SQL).toContain("= 'section_id'");
		expect(PUBLISHED_TABLE_MARKER_SQL).toContain(
			"SEQ_IN_INDEX = 2 THEN COLUMN_NAME END)) = 'lang'",
		);
	});

	test('only a table that is BOTH PK-marked and map-declared is discovered', async () => {
		const log: RecordedStatement[] = [];
		const discovery = await discoverPublishedTables(
			TARGET_DB,
			OPERATOR_AUDIT_BUDGET,
			buildDependencies(log),
		);
		expect(discovery.tables).toEqual([MARKED_TABLE]);
		// The two it refused are COUNTED, never silently dropped.
		expect(discovery.unmarked).toBe(2);
	});

	test('no declared table ⇒ nothing is discovered (an empty map deletes nothing)', async () => {
		const log: RecordedStatement[] = [];
		const discovery = await discoverPublishedTables(
			TARGET_DB,
			OPERATOR_AUDIT_BUDGET,
			buildDependencies(log, { declared: [] }),
		);
		expect(discovery.tables).toEqual([]);
	});

	test('the audit never even READS an unmarked table', async () => {
		const log: RecordedStatement[] = [];
		const report = await auditPublishedLangs(OPERATOR_AUDIT_BUDGET, buildDependencies(log));
		expect(report.applicable).toBe(true);
		expect(report.databases[0]?.tables.map((table) => table.table)).toEqual([MARKED_TABLE]);
		expect(report.phantom_langs).toEqual([PHANTOM]);
		expect(report.phantom_rows).toBe(7);
		expect(report.unmarked_tables).toBe(2);
		for (const statement of log) {
			expect(statement.sql).not.toContain(FOREIGN_TABLE);
			expect(statement.sql).not.toContain(UNDECLARED_TABLE);
		}
	});
});

describe('sweep — the DELETE is as narrow as the audit that justified it', () => {
	test('a marked table loses only the requested phantom lang', async () => {
		const log: RecordedStatement[] = [];
		const result = await sweepPhantomLangs({ langs: [PHANTOM] }, buildDependencies(log));
		expect(result.swept).toEqual([
			{ database: TARGET_DB, table: MARKED_TABLE, lang: PHANTOM, rows: 7 },
		]);
		expect(result.total_rows).toBe(7);
		expect(result.errors).toEqual([]);
	});

	test('NO DELETE is ever issued against a table lacking the marker', async () => {
		const log: RecordedStatement[] = [];
		await sweepPhantomLangs({ langs: [PHANTOM] }, buildDependencies(log));
		const deletes = log.filter((statement) => statement.sql.startsWith('DELETE'));
		expect(deletes).toHaveLength(1);
		expect(deletes[0]?.sql).toContain(`\`${MARKED_TABLE}\``);
		for (const statement of log) {
			expect(statement.sql).not.toContain(FOREIGN_TABLE);
			expect(statement.sql).not.toContain(UNDECLARED_TABLE);
		}
	});

	test('a lang in the policy is refused before anything is read', async () => {
		const log: RecordedStatement[] = [];
		const failure = await sweepPhantomLangs({ langs: ['lg-spa'] }, buildDependencies(log)).then(
			() => null,
			(error: unknown) => error,
		);
		expect(failure).toBeInstanceOf(DedaloError);
		expect((failure as DedaloError).code).toBe('request.invalid_options');
		expect(log).toHaveLength(0);
	});

	test('a policy lang cannot be deleted even if the caller names it alongside a phantom', async () => {
		// The per-table re-audit is the last narrowing: a lang the policy holds is
		// not phantom, so it never reaches a statement — here the policy acquired
		// 'lg-cat' after the operator read their report.
		const log: RecordedStatement[] = [];
		const dependencies = buildDependencies(log, {
			policy: ['lg-spa', 'lg-cat'],
			rowsByTable: {
				[MARKED_TABLE]: [
					{ lang: 'lg-cat', n: 12 },
					{ lang: PHANTOM, n: 7 },
				],
			},
			markerTables: [MARKED_TABLE],
			langColumnTables: 1,
		});
		const result = await sweepPhantomLangs({ langs: [PHANTOM, 'lg-cat'] }, dependencies).then(
			(value) => value,
			(error: unknown) => error,
		);
		// Naming a policy lang is refused outright — the sweep never starts.
		expect(result).toBeInstanceOf(DedaloError);
		const deletes = log.filter((statement) => statement.sql.startsWith('DELETE'));
		expect(deletes).toHaveLength(0);
	});

	test('a lang the policy acquired between report and sweep is not deleted', async () => {
		const log: RecordedStatement[] = [];
		// The caller passes a lang that is outside the policy snapshot they read,
		// but the table's live audit classifies it as policy data.
		const dependencies = buildDependencies(log, {
			policy: ['lg-spa'],
			markerTables: [MARKED_TABLE],
			langColumnTables: 1,
			rowsByTable: { [MARKED_TABLE]: [{ lang: 'lg-spa', n: 5 }] },
		});
		const result = await sweepPhantomLangs({ langs: [PHANTOM] }, dependencies);
		expect(result.swept).toEqual([]);
		expect(log.filter((statement) => statement.sql.startsWith('DELETE'))).toHaveLength(0);
	});

	test('an unknown target database is refused', async () => {
		const log: RecordedStatement[] = [];
		const failure = await sweepPhantomLangs(
			{ langs: [PHANTOM], databases: ['somebody_elses_db'] },
			buildDependencies(log),
		).then(
			() => null,
			(error: unknown) => error,
		);
		expect(failure).toBeInstanceOf(DedaloError);
		expect((failure as DedaloError).code).toBe('request.invalid_options');
		expect(log.filter((statement) => statement.sql.startsWith('DELETE'))).toHaveLength(0);
	});
});

describe('normalizeSweepLangs — the list itself', () => {
	const refusals: { name: string; langs: unknown }[] = [
		{ name: 'an empty list', langs: [] },
		{ name: 'the empty string', langs: [''] },
		{ name: 'a whitespace-only lang', langs: ['  '] },
		{ name: 'a non-string element', langs: [{ lang: 'lg-cat' }] },
		{ name: 'a null element', langs: [null] },
		{ name: 'a non-array', langs: 'lg-cat' },
		{ name: 'a policy lang', langs: ['lg-eng'] },
		{ name: 'a phantom plus a policy lang', langs: [PHANTOM, 'lg-spa'] },
	];
	for (const refusal of refusals) {
		test(`refuses ${refusal.name}`, () => {
			let thrown: unknown = null;
			try {
				normalizeSweepLangs(refusal.langs, POLICY);
			} catch (error) {
				thrown = error;
			}
			expect(thrown).toBeInstanceOf(DedaloError);
			expect((thrown as DedaloError).code).toBe('request.invalid_options');
		});
	}

	test('accepts phantom values verbatim, de-duplicated and untrimmed', () => {
		expect(normalizeSweepLangs([PHANTOM, PHANTOM, ' lg-cat '], POLICY)).toEqual([
			PHANTOM,
			' lg-cat ',
		]);
	});
});

describe('the API action is registered and gated', () => {
	const NON_ADMIN: Principal = { userId: 987654321, isGlobalAdmin: false, isDeveloper: false };
	const ADMIN: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };

	test('dd_diffusion_api registers sweep_published_langs', () => {
		// check_config points the operator at this action name: an unregistered
		// action would make that advice a dead end.
		expect(diffusionApiActions.sweep_published_langs).toBeDefined();
	});

	async function callAction(principal: Principal, options: Record<string, unknown>) {
		const context = { principal, requestId: 'test' } as ApiRequestContext;
		const handler = diffusionApiActions.sweep_published_langs;
		return handler!(
			{ dd_api: 'dd_diffusion_api', action: 'sweep_published_langs', options } as never,
			context,
		).then(
			(value) => ({ threw: false as const, value }),
			(error: unknown) => ({ threw: true as const, error }),
		);
	}

	test('a non-admin is denied (perm.denied, 403)', async () => {
		const outcome = await callAction(NON_ADMIN, { mode: 'report' });
		expect(outcome.threw).toBe(true);
		expect((outcome as { error: DedaloError }).error).toBeInstanceOf(DedaloError);
		expect((outcome as { error: DedaloError }).error.code).toBe('perm.denied');
		expect((outcome as { error: DedaloError }).error.spec.status).toBe(403);
	});

	test('sweep mode without langs is refused', async () => {
		const outcome = await callAction(ADMIN, { mode: 'sweep', confirm: true });
		expect(outcome.threw).toBe(true);
		expect((outcome as { error: DedaloError }).error.code).toBe('request.invalid_options');
	});

	test('sweep mode with a non-string lang is refused (never silently filtered)', async () => {
		const outcome = await callAction(ADMIN, { mode: 'sweep', langs: [7], confirm: true });
		expect(outcome.threw).toBe(true);
		expect((outcome as { error: DedaloError }).error.code).toBe('request.invalid_options');
	});

	test('sweep mode without confirm:true is refused', async () => {
		const outcome = await callAction(ADMIN, { mode: 'sweep', langs: [PHANTOM] });
		expect(outcome.threw).toBe(true);
		expect((outcome as { error: DedaloError }).error.code).toBe('request.invalid_options');
	});

	test('an explicitly empty databases list is refused', async () => {
		const outcome = await callAction(ADMIN, {
			mode: 'sweep',
			langs: [PHANTOM],
			confirm: true,
			databases: [],
		});
		expect(outcome.threw).toBe(true);
		expect((outcome as { error: DedaloError }).error.code).toBe('request.invalid_options');
	});
});
