/**
 * Workstream 0 gate: the transaction primitive (postgres.ts withTransaction /
 * acquireNodeLock) that every ontology/tree mutation is built on.
 *
 * The design (AsyncLocalStorage + a proxy over the pool) must reproduce PHP's
 * one-connection-per-request semantics: inside withTransaction every query
 * routes to the SAME reserved connection, so in-tx reads see in-tx writes and a
 * throw rolls the whole thing back — while concurrent transactions stay on
 * DISTINCT connections (no cross-request bleed, spec §4). The advisory node lock
 * must be byte-identical to PHP and refuse to run outside a transaction.
 */

import { afterAll, beforeAll, expect, test } from 'bun:test';
import {
	acquireNodeLock,
	isInTransaction,
	sql,
	withTransaction,
} from '../../src/core/db/postgres.ts';

const SCRATCH = 'zz_with_transaction_test';

beforeAll(async () => {
	await sql.unsafe(`CREATE TABLE IF NOT EXISTS ${SCRATCH} (n int)`);
	await sql.unsafe(`DELETE FROM ${SCRATCH}`);
});
afterAll(async () => {
	await sql.unsafe(`DROP TABLE IF EXISTS ${SCRATCH}`);
});

async function scratchCount(): Promise<number> {
	const rows = (await sql.unsafe(`SELECT count(*)::int AS c FROM ${SCRATCH}`)) as { c: number }[];
	return rows[0]!.c;
}

test('proxy routes tagged-template and unsafe forms to the pool', async () => {
	expect(isInTransaction()).toBe(false);
	const tagged = (await sql`SELECT 1 AS n`) as { n: number }[];
	expect(tagged[0]!.n).toBe(1);
	const unsafe = (await sql.unsafe('SELECT $1::int AS n', [7])) as { n: number }[];
	expect(unsafe[0]!.n).toBe(7);
});

test('inside a transaction every query shares one backend connection', async () => {
	await withTransaction(async () => {
		expect(isInTransaction()).toBe(true);
		const first = (await sql`SELECT pg_backend_pid() AS pid`) as { pid: number }[];
		await Bun.sleep(10);
		const second = (await sql.unsafe('SELECT pg_backend_pid() AS pid')) as { pid: number }[];
		expect(second[0]!.pid).toBe(first[0]!.pid);
	});
	expect(isInTransaction()).toBe(false);
});

test('in-transaction reads see in-transaction writes', async () => {
	await sql.unsafe(`DELETE FROM ${SCRATCH}`);
	await withTransaction(async () => {
		await sql.unsafe(`INSERT INTO ${SCRATCH} (n) VALUES (1)`);
		// Same connection → the uncommitted row is visible to a later read.
		expect(await scratchCount()).toBe(1);
	});
});

test('a throw rolls the whole transaction back', async () => {
	await sql.unsafe(`DELETE FROM ${SCRATCH}`);
	await expect(
		withTransaction(async () => {
			await sql.unsafe(`INSERT INTO ${SCRATCH} (n) VALUES (1)`);
			throw new Error('boom');
		}),
	).rejects.toThrow('boom');
	expect(await scratchCount()).toBe(0);
});

test('a clean return commits', async () => {
	await sql.unsafe(`DELETE FROM ${SCRATCH}`);
	await withTransaction(async () => {
		await sql.unsafe(`INSERT INTO ${SCRATCH} (n) VALUES (2)`);
	});
	expect(await scratchCount()).toBe(1);
});

test('concurrent transactions run on distinct connections (no store bleed)', async () => {
	const pids: number[] = [];
	await Promise.all([
		withTransaction(async () => {
			const p = (await sql`SELECT pg_backend_pid() AS pid`) as { pid: number }[];
			pids.push(p[0]!.pid);
			await Bun.sleep(30);
			const again = (await sql`SELECT pg_backend_pid() AS pid`) as { pid: number }[];
			expect(again[0]!.pid).toBe(p[0]!.pid); // stable across the sleep
		}),
		withTransaction(async () => {
			const p = (await sql`SELECT pg_backend_pid() AS pid`) as { pid: number }[];
			pids.push(p[0]!.pid);
			await Bun.sleep(30);
			const again = (await sql`SELECT pg_backend_pid() AS pid`) as { pid: number }[];
			expect(again[0]!.pid).toBe(p[0]!.pid);
		}),
	]);
	expect(pids[0]).not.toBe(pids[1]);
});

test('nested withTransaction reuses the ambient transaction', async () => {
	await sql.unsafe(`DELETE FROM ${SCRATCH}`);
	let innerPid = 0;
	let outerPid = 0;
	await expect(
		withTransaction(async () => {
			const o = (await sql`SELECT pg_backend_pid() AS pid`) as { pid: number }[];
			outerPid = o[0]!.pid;
			await sql.unsafe(`INSERT INTO ${SCRATCH} (n) VALUES (1)`);
			await withTransaction(async () => {
				const i = (await sql`SELECT pg_backend_pid() AS pid`) as { pid: number }[];
				innerPid = i[0]!.pid;
				await sql.unsafe(`INSERT INTO ${SCRATCH} (n) VALUES (2)`);
			});
			// Inner threw nothing; a later outer throw must still roll BOTH back
			// (single transaction, no independent inner commit).
			throw new Error('outer boom');
		}),
	).rejects.toThrow('outer boom');
	expect(innerPid).toBe(outerPid);
	expect(await scratchCount()).toBe(0);
});

test('acquireNodeLock refuses to run outside a transaction', async () => {
	expect(isInTransaction()).toBe(false);
	await expect(acquireNodeLock('zztest1', 1)).rejects.toThrow(/outside a transaction/);
});

test('acquireNodeLock serializes two transactions on the same node key', async () => {
	// A holds the lock and sleeps; B must wait for A's commit before it proceeds.
	const order: string[] = [];
	const a = withTransaction(async () => {
		await acquireNodeLock('zznode1', 5);
		order.push('A-locked');
		await Bun.sleep(60);
		order.push('A-releasing');
	});
	await Bun.sleep(15); // let A grab the lock first
	const b = withTransaction(async () => {
		await acquireNodeLock('zznode1', 5);
		order.push('B-locked');
	});
	await Promise.all([a, b]);
	// B's lock acquisition must come after A released (committed).
	expect(order).toEqual(['A-locked', 'A-releasing', 'B-locked']);
});
