/**
 * Coexistence gate: the tree/ontology mutation node lock must be mutually
 * exclusive with a SECOND, independent database client — the exact situation
 * during PHP↔TS coexistence, where the PHP server and the TS server hold their
 * own connections but must never mutate the same node concurrently.
 *
 * We stand in for "the other server" with a separate Bun SQL client and take
 * the lock the PHP way (pg_advisory_xact_lock(hashtext('<tipo>_<id>'))) inside a
 * manual transaction. The assertion: while client A holds the node lock, client
 * B's acquisition of the SAME key blocks until A commits — proving the two
 * engines serialize on the identical hashtext input (acquireNodeLock parity).
 */

import { afterAll, expect, test } from 'bun:test';
import { SQL } from 'bun';
import { config } from '../../src/config/config.ts';

function makeClient(): SQL {
	const { database, host, port, user, password } = config.db;
	const common = { database, username: user, password: password || undefined, max: 1 };
	return host.startsWith('/')
		? new SQL({ ...common, path: `${host}/.s.PGSQL.${port}` })
		: new SQL({ ...common, hostname: host, port });
}

const clientA = makeClient();
const clientB = makeClient();

afterAll(async () => {
	await clientA.end();
	await clientB.end();
});

test('an independent client blocks on a node lock held by another (PHP↔TS coexistence)', async () => {
	const order: string[] = [];
	// A grabs the lock and holds it across a sleep, standing in for the "other server".
	const a = clientA.begin(async (tx: SQL) => {
		await tx.unsafe("SELECT pg_advisory_xact_lock(hashtext('zzcoexist1_9'))");
		order.push('A-locked');
		await Bun.sleep(120);
		order.push('A-releasing');
	});
	await Bun.sleep(25); // ensure A takes the lock first
	const b = clientB.begin(async (tx: SQL) => {
		await tx.unsafe("SELECT pg_advisory_xact_lock(hashtext('zzcoexist1_9'))");
		order.push('B-locked');
	});
	await Promise.all([a, b]);
	// B must not acquire until A has released (committed).
	expect(order).toEqual(['A-locked', 'A-releasing', 'B-locked']);
});
