/**
 * S1-14 hardening gate: shared-cache clears fired INSIDE a transaction must be
 * DEFERRED to the transaction's settle point (withTransaction's finally) —
 * clearing mid-tx lets a concurrent request repopulate the cleared entry from
 * committed-but-about-to-be-stale state before COMMIT, and would let a future
 * in-tx cached read seed shared caches with uncommitted rows.
 *
 * Covers, against the real dev DB (real BEGIN/COMMIT/ROLLBACK, no writes):
 *  - clearOntologyDerivedCaches outside a tx fires immediately;
 *  - inside withTransaction it is queued and replayed after COMMIT;
 *  - it is replayed after ROLLBACK too (over-invalidation is harmless; a
 *    skipped replay is not);
 *  - a nested withTransaction defers to the OUTER settle point;
 *  - the `<tld>0` matrix-table short-circuit stays cache-independent, so
 *    mid-provisioning table resolution never needs a mid-tx clear.
 */

import { afterEach, expect, test } from 'bun:test';
import { deferPostTransaction, withTransaction } from '../../src/core/db/postgres.ts';
import {
	clearOntologyDerivedCaches,
	registerOntologyCacheClearer,
	unregisterOntologyCacheClearer,
} from '../../src/core/ontology/cache_invalidation.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';

let probeFireCount = 0;
const probeClearer = (): void => {
	probeFireCount++;
};

afterEach(() => {
	unregisterOntologyCacheClearer(probeClearer);
	probeFireCount = 0;
});

test('outside a transaction the hub fires clearers immediately', async () => {
	registerOntologyCacheClearer(probeClearer);
	await clearOntologyDerivedCaches();
	expect(probeFireCount).toBe(1);
});

test('deferPostTransaction returns false outside a transaction', () => {
	expect(deferPostTransaction(() => {})).toBe(false);
});

test('an in-tx hub fire is deferred and replayed after COMMIT', async () => {
	registerOntologyCacheClearer(probeClearer);
	await withTransaction(async () => {
		await clearOntologyDerivedCaches();
		await clearOntologyDerivedCaches();
		// Still zero: the clears are queued, not fired — an in-tx clear could
		// otherwise be repopulated by a concurrent request before COMMIT.
		expect(probeFireCount).toBe(0);
	});
	// Replayed in withTransaction's finally (both queued fires drain).
	expect(probeFireCount).toBe(2);
});

test('an in-tx hub fire is replayed after ROLLBACK too', async () => {
	registerOntologyCacheClearer(probeClearer);
	await expect(
		withTransaction(async () => {
			await clearOntologyDerivedCaches();
			expect(probeFireCount).toBe(0);
			throw new Error('boom');
		}),
	).rejects.toThrow('boom');
	expect(probeFireCount).toBe(1);
});

test('a NESTED withTransaction defers to the OUTER settle point', async () => {
	registerOntologyCacheClearer(probeClearer);
	await withTransaction(async () => {
		await withTransaction(async () => {
			await clearOntologyDerivedCaches();
		});
		// The inner block returned, but the (single, outer) transaction is
		// still open — the clear must still be pending.
		expect(probeFireCount).toBe(0);
	});
	expect(probeFireCount).toBe(1);
});

test('a throwing deferred action does not starve the rest of the queue', async () => {
	const bad = (): void => {
		throw new Error('bad clearer');
	};
	registerOntologyCacheClearer(bad);
	registerOntologyCacheClearer(probeClearer);
	try {
		await withTransaction(async () => {
			await clearOntologyDerivedCaches();
		});
		expect(probeFireCount).toBe(1);
	} finally {
		unregisterOntologyCacheClearer(bad);
	}
});

test("the '<tld>0' matrix-table short-circuit resolves in-tx without any clear", async () => {
	// A `<tld>0` tipo is an ontology main section: it must resolve to
	// matrix_ontology from the tipo alone (no node lookup), so provisioning
	// never depends on a mid-tx cache clear (the refuted S1-14 scenario).
	await withTransaction(async () => {
		expect(await getMatrixTableFromTipo('zzdeferred0')).toBe('matrix_ontology');
	});
});
