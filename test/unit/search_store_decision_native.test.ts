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
 * restart, and a lost `empty`/`exists`/`sourceWithRows` guard TRUNCATEs and
 * rebuilds a populated multi-million-row store on boot.
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
		exists: true,
		empty: false,
		sourceWithRows: null,
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
		expect(decision.storesNeedingBackfill).toEqual([]);
	});

	test('a POPULATED store is NOT backfilled — while an empty one beside it IS', () => {
		// The pairing is the anti-vacuity: `storesNeedingBackfill === []` alone is
		// satisfied by a fold that never selects anything.
		const decision = decideSearchStores({ ddlNeeded: false }, [
			observation({ store: 'matrix_string_search', empty: false, sourceWithRows: null }),
			observation({ store: 'matrix_relation_index', empty: true, sourceWithRows: 'matrix_test' }),
		]);
		expect(decision.storesNeedingBackfill).toEqual(['matrix_relation_index']);
		expect(decision.healthy).toBe(false);
	});

	test('an EMPTY store whose sources would produce NO rows is left alone (empty install)', () => {
		const decision = decideSearchStores({ ddlNeeded: false }, [
			observation({ empty: true, sourceWithRows: null }),
		]);
		expect(decision.storesNeedingBackfill).toEqual([]);
		expect(decision.healthy).toBe(true);
	});

	test('a store that does NOT exist is never backfilled (its DDL failed)', () => {
		const decision = decideSearchStores({ ddlNeeded: true }, [
			observation({ exists: false, empty: true, sourceWithRows: 'matrix_test' }),
		]);
		expect(decision.storesNeedingBackfill).toEqual([]);
	});

	test('`healthy` is derived from BOTH probes, never defaulted', () => {
		const clean = observation();
		const needy = observation({ empty: true, sourceWithRows: 'matrix_test' });
		expect(decideSearchStores({ ddlNeeded: false }, [clean]).healthy).toBe(true);
		expect(decideSearchStores({ ddlNeeded: true }, [clean]).healthy).toBe(false);
		expect(decideSearchStores({ ddlNeeded: false }, [needy]).healthy).toBe(false);
		expect(decideSearchStores({ ddlNeeded: true }, [needy]).healthy).toBe(false);
	});
});

describe('observeSearchStores (read-only backfill probe, live DB)', () => {
	test('reports both declared stores as existing and NON-empty on this install', async () => {
		const observations = await observeSearchStores(new Set(['matrix_test']));
		expect(observations.map(({ store }) => store)).toEqual(
			SEARCH_STORE_BACKFILLS.map(({ store }) => store),
		);
		for (const observed of observations) {
			expect(observed.exists).toBe(true);
			expect(observed.empty).toBe(false);
			// a non-empty store short-circuits before any source probe
			expect(observed.sourceWithRows).toBeNull();
		}
	});

	test('the live probes fold to "healthy, nothing to do" — no DDL, no backfill', async () => {
		const inspection = await inspectSearchStores();
		const decision = decideSearchStores(inspection, await observeSearchStores(inspection.present));
		expect(decision.ddlNeeded).toBe(false);
		expect(decision.storesNeedingBackfill).toEqual([]);
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
		expect(body).toContain('decision.storesNeedingBackfill');
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
