/**
 * ITEM 3.10a PART 2 — the ensureSearchStores DECISION seam
 * (src/core/db/db_assets.ts): observeSearchStores / decideSearchStores and the
 * shell that consumes them.
 *
 * PART 1 (search_store_ensure_native.test.ts) gates the DDL probe half
 * (expectedTriggerNames / inspectSearchStores / the backfill row filter). This
 * file gates the other half: what the boot DECIDES to do given what the probes
 * observed. Both directions of that decision are expensive and silent — a false
 * `ddlNeeded` re-runs the extension/table/function/trigger/index passes on every
 * restart, and a lost `holdsRows`/`exists`/`sourceProducesRows` guard rewrites
 * a populated multi-million-row store on boot.
 *
 * PER (store, table) since DATA-32 (P2-17): the observation is one pair, and the
 * decision names the pairs to refill — a store populated for other tables is
 * no longer evidence that THIS table is covered.
 *
 * Compute-then-act, NOT a dryRun flag: `decideSearchStores` is the object the
 * production boot path (ensureSearchStores → startServer) consumes, so the arms
 * gated here are the arms that run in production. The consequential arms
 * ("needs DDL", "needs backfill") are driven with SYNTHETIC observations —
 * never by breaking the shared suite database, and the executed passes
 * (createExtensions / rebuildTables / rebuildFunctions / rebuildTriggers /
 * rebuildIndexes / backfillSearchStores) stay exempt from execution here per
 * the coverage plan's §5.2 exemption, which is valid only alongside this gate.
 *
 * READ-ONLY: the one live-DB describe issues SELECTs only. No scratch surface.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	decideSearchStores,
	inspectSearchStores,
	observeSearchStores,
	SEARCH_STORE_BACKFILLS,
	type SearchStoreObservation,
} from '../../src/core/db/db_assets.ts';

const DB_ASSETS_PATH = join(import.meta.dir, '../../src/core/db/db_assets.ts');

/** An observation with the healthy-install defaults, overridable per case. */
function observation(partial: Partial<SearchStoreObservation> = {}): SearchStoreObservation {
	return {
		store: 'matrix_string_search',
		table: 'matrix_test',
		exists: true,
		holdsRows: true,
		sourceProducesRows: false,
		...partial,
	};
}

describe('decideSearchStores (pure fold — the boot decision)', () => {
	test('a missing sync trigger decides REBUILD, and is not healthy', () => {
		// The inspection arm the environment cannot give us: on this database the
		// triggers are all present. Driven synthetically instead of by dropping a
		// trigger on the shared DB.
		const decision = decideSearchStores({ ddlNeeded: true }, [observation()]);
		expect(decision.ddlNeeded).toBe(true);
		expect(decision.healthy).toBe(false);
		// ANTI-VACUITY: the DDL arm must not drag the backfill arm with it — a
		// healthy populated store is still not backfilled while the DDL runs.
		expect(decision.tablesNeedingBackfill).toEqual([]);
	});

	test('a COVERED (store, table) is NOT refilled — while an uncovered pair beside it IS', () => {
		// The pairing is the anti-vacuity: `tablesNeedingBackfill === []` alone is
		// satisfied by a fold that never selects anything. And the uncovered pair
		// is on the SAME store as a covered one: a populated store is no evidence
		// for a table it has never seen (DATA-32).
		const decision = decideSearchStores({ ddlNeeded: false }, [
			observation({ store: 'matrix_relation_index', table: 'matrix_test', holdsRows: true }),
			observation({
				store: 'matrix_relation_index',
				table: 'matrix_users',
				holdsRows: false,
				sourceProducesRows: true,
			}),
		]);
		expect(decision.tablesNeedingBackfill).toEqual([
			{ store: 'matrix_relation_index', table: 'matrix_users' },
		]);
		expect(decision.healthy).toBe(false);
	});

	test('a table whose rows would produce NO store rows is left alone (nothing to index)', () => {
		const decision = decideSearchStores({ ddlNeeded: false }, [
			observation({ holdsRows: false, sourceProducesRows: false }),
		]);
		expect(decision.tablesNeedingBackfill).toEqual([]);
		expect(decision.healthy).toBe(true);
	});

	test('a store that does NOT exist is never backfilled (its DDL failed)', () => {
		const decision = decideSearchStores({ ddlNeeded: true }, [
			observation({ exists: false, holdsRows: false, sourceProducesRows: true }),
		]);
		expect(decision.tablesNeedingBackfill).toEqual([]);
	});

	test('`healthy` is derived from BOTH probes, never defaulted', () => {
		const clean = observation();
		const needy = observation({ holdsRows: false, sourceProducesRows: true });
		expect(decideSearchStores({ ddlNeeded: false }, [clean]).healthy).toBe(true);
		expect(decideSearchStores({ ddlNeeded: true }, [clean]).healthy).toBe(false);
		expect(decideSearchStores({ ddlNeeded: false }, [needy]).healthy).toBe(false);
		expect(decideSearchStores({ ddlNeeded: true }, [needy]).healthy).toBe(false);
	});
});

describe('observeSearchStores (read-only backfill probe, live DB)', () => {
	test('reports (store, matrix_test) for both declared stores as existing and COVERED on this install', async () => {
		const observations = await observeSearchStores(new Set(['matrix_test']));
		expect(observations.map(({ store, table }) => `${store}/${table}`)).toEqual(
			SEARCH_STORE_BACKFILLS.map(({ store }) => `${store}/matrix_test`),
		);
		for (const observed of observations) {
			expect(observed.exists).toBe(true);
			expect(observed.holdsRows).toBe(true);
			// a covered pair short-circuits before any source probe
			expect(observed.sourceProducesRows).toBe(false);
		}
	});

	test('the live probes fold to "healthy, nothing to do" — no DDL, no backfill', async () => {
		const inspection = await inspectSearchStores();
		const observations = await observeSearchStores(inspection.present);
		// anti-vacuity: the census is every PRESENT declared table of every store
		expect(observations.length).toBeGreaterThan(2 * 5);
		const decision = decideSearchStores(inspection, observations);
		expect(decision.ddlNeeded).toBe(false);
		expect(inspection.staleFunctions).toEqual([]);
		expect(decision.tablesNeedingBackfill).toEqual([]);
		expect(decision.healthy).toBe(true);
	});
});

describe('ensureSearchStores rewire (the shell consumes the decision)', () => {
	const source = readFileSync(DB_ASSETS_PATH, 'utf-8');
	const body = (source.split('export async function ensureSearchStores')[1] ?? '').split(
		'\n/** One index dropped',
	)[0] as string;

	test('the shell delegates to observeSearchStores + decideSearchStores', () => {
		expect(body).toContain('await observeSearchStores(');
		expect(body).toContain('decideSearchStores(');
		expect(body).toContain('decision.tablesNeedingBackfill');
		expect(body).toContain('backfillSearchStoreTables(');
		// never a store-wide TRUNCATE at boot (DATA-32)
		expect(body).not.toContain('backfillSearchStores(');
		expect(body).toContain('result.healthy = decision.healthy');
	});

	test('the inline probe/decision code is GONE — no parallel source of truth', () => {
		// each of these was a line of the inline step-2 loop that the extraction
		// MOVED; leaving any of them live means the seam gates nothing.
		expect(body).not.toContain('SEARCH_STORE_BACKFILLS');
		expect(body).not.toContain('tableExists(');
		expect(body).not.toContain('LIMIT 1');
		expect(body).not.toContain('needBackfill');
		expect(body).not.toContain('ar_trigger');
		// and `healthy` is assigned from the fold, not flipped ad hoc
		expect(body).not.toContain('result.healthy = false');
	});
});
