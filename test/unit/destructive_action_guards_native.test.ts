/**
 * Destructive-action GUARDS — blast-free by construction (plan §4.2.8).
 *
 * Every case here guards an IRREVERSIBLE operator action. The subject is the
 * REFUSAL PATH, never the action: nothing in this file may run the aggregate
 * DELETE, the REINDEX/VACUUM, the hierarchy re-seed or the orphan removal. Two
 * properties make that structural rather than hopeful:
 *
 *  1. Every guard returns BEFORE its dynamic import, so a refusing call never
 *     even loads the destructive module.
 *  2. Each handler now takes an injected executor (the seams added alongside
 *     this gate). The gate passes a RECORDING STUB, so the assertion is
 *     "the executor was never invoked" — not merely "the return value looked
 *     like a refusal". A refusal test that only reads the response passes even
 *     when the operation ran and then reported failure.
 *
 * Parameter injection, deliberately, NOT `mock.module`: a stub that fails to
 * apply (this suite has a documented cross-file mock leak) would silently run
 * the real destructive import. An injected argument cannot fail open.
 *
 * The registry-wiring assertions are not ceremony: `install_hierarchies` and
 * `reset_hierarchies` differ ONLY by the options object, so swapping the two
 * map entries makes the non-destructive "Install" button DELETE and re-seed an
 * already-installed thesaurus, discarding operator edits irreversibly. The
 * handler-level assertions alone cannot see that swap.
 *
 * NO DATABASE WORK, hence no scratch band is consumed (938000-938999 / tipo
 * `zzgrd` were reserved for this item and are left untouched — the guards all
 * return before the DB, so provisioning rows would prove nothing and would
 * create the only blast surface in the file). The one synthetic user id used
 * below (938001) is passed to a STUB, never to the real writer.
 */

import { describe, expect, test } from 'bun:test';
import {
	addHierarchyInstall,
	addHierarchyReset,
	widget as addHierarchyWidget,
	type HierarchiesImporter,
} from '../../src/core/area_maintenance/widgets/add_hierarchy.ts';
import {
	databaseInfoOptimizeTables,
	databaseInfoRebuildUserStats,
	widget as databaseInfoWidget,
	type OptimizeTablesFn,
	type UserStatsDeps,
} from '../../src/core/area_maintenance/widgets/database_info.ts';
import {
	type DataframeScan,
	dataframeControlGetValue,
	dataframeControlRunFix,
	widget as dataframeControlWidget,
} from '../../src/core/area_maintenance/widgets/dataframe_control.ts';
import { DedaloError } from '../../src/core/errors/dedalo_error.ts';
import type { Principal } from '../../src/core/security/permissions.ts';

/** The DedaloError an async call rejected with (fails when nothing typed was thrown). */
async function rejectedBy(run: () => Promise<unknown>): Promise<DedaloError> {
	try {
		await run();
	} catch (error) {
		expect(error).toBeInstanceOf(DedaloError);
		return error as DedaloError;
	}
	throw new Error('expected a DedaloError, nothing was thrown');
}

const ADMIN: Principal = { userId: 938001, isGlobalAdmin: true, isDeveloper: false };

/** Recording stub for the dd1521 aggregate writer pair. Never touches the DB. */
function userStatsSpy(): { deps: UserStatsDeps; deleted: number[]; updated: number[] } {
	const deleted: number[] = [];
	const updated: number[] = [];
	const deps = {
		deleteUserActivityStats: async (userId: number) => {
			deleted.push(userId);
			return true;
		},
		updateUserActivityStats: async (userId: number) => {
			updated.push(userId);
			return { ok: true, value: [], msg: 'OK', errors: [] };
		},
	} as unknown as UserStatsDeps;
	return { deps, deleted, updated };
}

describe('database_info.rebuild_user_stats — the aggregate DELETE is guarded', () => {
	test('missing users → refusal is REPORTED and the delete never runs', async () => {
		const spy = userStatsSpy();
		const error = await rejectedBy(() => databaseInfoRebuildUserStats({}, ADMIN, spy.deps));
		expect(error.code).toBe('maintenance.action_refused');
		// the operator-visible half: not a silent no-op
		expect(String(error.publicMessage)).toContain('Empty users value');
		expect(spy.deleted).toEqual([]);
		expect(spy.updated).toEqual([]);
	});

	test('EMPTY users array → same refusal, delete never runs', async () => {
		const spy = userStatsSpy();
		const error = await rejectedBy(() =>
			databaseInfoRebuildUserStats({ users: [] }, ADMIN, spy.deps),
		);
		expect(error.code).toBe('maintenance.action_refused');
		expect(String(error.publicMessage)).toContain('Empty users value');
		expect(spy.deleted).toEqual([]);
		expect(spy.updated).toEqual([]);
	});

	test('POSITIVE CONTROL: a named user does reach the writer (the guard is not "refuse everything")', async () => {
		const spy = userStatsSpy();
		const response = await databaseInfoRebuildUserStats({ users: [938001] }, ADMIN, spy.deps);
		expect(spy.deleted).toEqual([938001]);
		expect(spy.updated).toEqual([938001]);
		expect(response.data).toBe(true);
		expect(response.errors).toBeUndefined();
	});
});

describe('database_info.optimize_tables — REINDEX/VACUUM is guarded', () => {
	function optimizeSpy(): { fn: OptimizeTablesFn; calls: unknown[][] } {
		const calls: unknown[][] = [];
		const fn = (async (...args: unknown[]) => {
			calls.push(args);
			return { ok: true, msg: 'OK', errors: [], reindex: {}, vacuum: {}, prune: {} };
		}) as unknown as OptimizeTablesFn;
		return { fn, calls };
	}

	test('no tables key → "No tables selected" and optimizeTables never runs', async () => {
		const spy = optimizeSpy();
		const error = await rejectedBy(() => databaseInfoOptimizeTables({}, ADMIN, spy.fn));
		expect(error.code).toBe('maintenance.action_refused');
		expect(String(error.publicMessage)).toContain('No tables selected');
		expect(spy.calls.length).toBe(0);
	});

	test('EMPTY tables array → "No tables selected" and optimizeTables never runs', async () => {
		const spy = optimizeSpy();
		const error = await rejectedBy(() => databaseInfoOptimizeTables({ tables: [] }, ADMIN, spy.fn));
		expect(error.code).toBe('maintenance.action_refused');
		expect(String(error.publicMessage)).toContain('No tables selected');
		expect(spy.calls.length).toBe(0);
	});

	test('a BARE STRING → "Invalid tables parameter"; the string is never iterated into identifier positions', async () => {
		const spy = optimizeSpy();
		const error = await rejectedBy(() =>
			databaseInfoOptimizeTables({ tables: 'matrix_test' }, ADMIN, spy.fn),
		);
		expect(error.code).toBe('maintenance.action_refused');
		expect(String(error.publicMessage)).toContain('Invalid tables parameter');
		expect(spy.calls.length).toBe(0);
	});

	test('POSITIVE CONTROL: a real array reaches optimizeTables, with dryRun false', async () => {
		const spy = optimizeSpy();
		await databaseInfoOptimizeTables({ tables: ['matrix_test'] }, ADMIN, spy.fn);
		expect(spy.calls.length).toBe(1);
		expect(spy.calls[0]?.[0]).toEqual(['matrix_test']);
		expect(spy.calls[0]?.[1]).toEqual({ dryRun: false });
	});

	/**
	 * The plan DROPPED this case because proving it needed a `mock.module` stub of
	 * `db_assets` — a stub that fails to apply fires REINDEX CONCURRENTLY on the
	 * shared suite DB mid-run. The injected executor removes that hazard entirely
	 * (nothing can reach the real function), so the case is reinstated here.
	 * `dry_run` is OPT-IN by exact boolean: a truthy string must NOT be read as a
	 * preview, or an operator who typed 'true' gets the destructive run they were
	 * trying to avoid — and a `!== false` coercion would silently make every real
	 * run a preview that changes nothing while reporting success.
	 */
	test('dry_run only counts as an exact boolean true — "true" is NOT a preview', async () => {
		const stringy = optimizeSpy();
		await databaseInfoOptimizeTables(
			{ tables: ['matrix_test'], dry_run: 'true' },
			ADMIN,
			stringy.fn,
		);
		expect(stringy.calls[0]?.[1]).toEqual({ dryRun: false });

		const real = optimizeSpy();
		await databaseInfoOptimizeTables({ tables: ['matrix_test'], dry_run: true }, ADMIN, real.fn);
		expect(real.calls[0]?.[1]).toEqual({ dryRun: true });
	});

	test('the registry maps each verb to its own handler (a swap sends one guard the other verb)', () => {
		expect(databaseInfoWidget.apiActions?.rebuild_user_stats).toBe(databaseInfoRebuildUserStats);
		expect(databaseInfoWidget.apiActions?.optimize_tables).toBe(databaseInfoOptimizeTables);
	});
});

describe('add_hierarchy — install vs reset differ ONLY by the options object', () => {
	function importerSpy(): { fn: HierarchiesImporter; calls: unknown[][] } {
		const calls: unknown[][] = [];
		const fn = (async (...args: unknown[]) => {
			calls.push(args);
			return { ok: true, msg: 'OK', errors: [], responses: [] };
		}) as unknown as HierarchiesImporter;
		return { fn, calls };
	}

	test('install passes NO options object at all (replace stays false — additive)', async () => {
		const spy = importerSpy();
		await addHierarchyInstall({ hierarchies: ['zzgrd'] }, ADMIN, spy.fn);
		expect(spy.calls.length).toBe(1);
		const call = spy.calls[0] as unknown[];
		expect(call[0]).toEqual(['zzgrd']);
		expect(call[2]).toBe(938001);
		// the whole point: no fourth argument, so `replace` cannot be true
		expect(call.length).toBe(3);
		expect(call[3]).toBeUndefined();
	});

	test('reset passes EXACTLY {replace:true}', async () => {
		const spy = importerSpy();
		await addHierarchyReset({ hierarchies: ['zzgrd'] }, ADMIN, spy.fn);
		expect(spy.calls.length).toBe(1);
		const call = spy.calls[0] as unknown[];
		expect(call[0]).toEqual(['zzgrd']);
		expect(call[2]).toBe(938001);
		expect(call[3]).toEqual({ replace: true });
	});

	test('a non-array hierarchies option selects NO tld (neither handler improvises a target)', async () => {
		const install = importerSpy();
		const reset = importerSpy();
		await addHierarchyInstall({ hierarchies: 'zzgrd' }, ADMIN, install.fn);
		await addHierarchyReset({}, ADMIN, reset.fn);
		expect((install.calls[0] as unknown[])[0]).toEqual([]);
		expect((reset.calls[0] as unknown[])[0]).toEqual([]);
	});

	test('the registry maps each verb to its own handler (a swap is the silent-DELETE regression)', () => {
		expect(addHierarchyWidget.apiActions?.install_hierarchies).toBe(addHierarchyInstall);
		expect(addHierarchyWidget.apiActions?.reset_hierarchies).toBe(addHierarchyReset);
	});
});

describe('dataframe_control — the fix flag separates a read from a destructive removal', () => {
	function scanSpy(): { fn: DataframeScan; calls: unknown[][] } {
		const calls: unknown[][] = [];
		const fn = (async (...args: unknown[]) => {
			calls.push(args);
			return { data: {}, msg: 'OK', errors: [] };
		}) as unknown as DataframeScan;
		return { fn, calls };
	}

	test('get_value / run_check pass fix=false (read-only), unscoped', async () => {
		const spy = scanSpy();
		await dataframeControlGetValue({}, ADMIN, spy.fn);
		expect(spy.calls.length).toBe(1);
		expect(spy.calls[0]?.[0]).toBe(false);
		expect(spy.calls[0]?.[1]).toBe(null);
	});

	test('run_fix passes fix=true', async () => {
		const spy = scanSpy();
		await dataframeControlRunFix({}, ADMIN, spy.fn);
		expect(spy.calls.length).toBe(1);
		expect(spy.calls[0]?.[0]).toBe(true);
	});

	test('the registry keeps get_value AND run_check on the read-only handler', () => {
		expect(dataframeControlWidget.apiActions?.get_value).toBe(dataframeControlGetValue);
		expect(dataframeControlWidget.apiActions?.run_check).toBe(dataframeControlGetValue);
		expect(dataframeControlWidget.apiActions?.run_fix).toBe(dataframeControlRunFix);
		// WC-071: the panel load must NOT be able to fire the scan at all
		expect(dataframeControlWidget.getValue).toBeUndefined();
	});
});
