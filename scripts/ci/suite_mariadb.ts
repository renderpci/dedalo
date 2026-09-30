/**
 * SUITE MARIADB — start, stop or inspect this lane's suite MariaDB server (PUB-05).
 *
 *   bun run scripts/ci/suite_mariadb.ts start    # install (once) + start + provision + self-check
 *   bun run scripts/ci/suite_mariadb.ts stop     # SIGTERM the server, remove its socket dir
 *   bun run scripts/ci/suite_mariadb.ts status   # where it is, whether it answers
 *   bun run scripts/ci/suite_mariadb.ts sweep    # stop + delete the lane root (marked roots only)
 *
 * The lane is `testDatabaseName()` — `DEDALO_TEST_DATABASE`, else `<DB_NAME>_test` —
 * the same derivation `test:db:setup` and the test preloads use, so a developer's lane
 * key (`DEDALO_TEST_DATABASE=dedalo_mib_v7_test_l3`) selects the lane's own server.
 *
 * WHY A CLI, when every gate's `beforeAll` calls `requireSuiteMariadb()` (which starts
 * the server itself): a cold lane runs `mariadb-install-db` — seconds — and a hook is
 * the wrong place to pay that, or to read its failure. `scripts/ci/db_tier.sh` runs
 * `start` as a legible stage of its own, before any gate, and `stop` on EXIT.
 *
 * `start` RESETS the suite user's privileges before re-granting (so a widened grant
 * left by an earlier run cannot survive into this one) and EMPTIES the acquisition
 * ledger (so `scripts/ci/mariadb_tier.ts` counts only this tier's acquisitions).
 *
 * Every operation is on the lane's own server under `../private/test_mariadb/<lane>`;
 * none reads or writes the installation's MariaDB, the application database or
 * `../private/.env`.
 */

import {
	ensureSuiteMariadb,
	stopSuiteMariadb,
	suiteMariadbStatus,
	sweepSuiteMariadb,
	truncateAcquisitions,
} from '../../test/helpers/suite_mariadb.ts';

async function main(command: string | undefined): Promise<number> {
	switch (command) {
		case 'start': {
			const paths = await ensureSuiteMariadb({ reset: true });
			truncateAcquisitions(paths.suiteDb);
			console.log(
				`== suite_mariadb: lane ${paths.suiteDb} — server answering on ${paths.socket} (root ${paths.root}); provisioned, self-check green, ledger emptied`,
			);
			return 0;
		}
		case 'stop': {
			const { stopped } = await stopSuiteMariadb();
			console.log(`== suite_mariadb: ${stopped ? 'stopped' : 'no server was running'}`);
			return 0;
		}
		case 'sweep': {
			// A disposable lane (a shard clone) or a rebuild: nothing of it survives. Refuses
			// a root the suite did not create (no .dedalo_test_mariadb).
			const { stopped, removed } = await sweepSuiteMariadb();
			console.log(
				`== suite_mariadb: ${stopped ? 'stopped the server; ' : ''}${removed ? 'lane root removed' : 'no lane root'}`,
			);
			return 0;
		}
		case 'status': {
			const status = await suiteMariadbStatus();
			console.log(
				JSON.stringify(
					{
						lane: status.paths.suiteDb,
						root: status.paths.root,
						socket: status.paths.socket,
						pid: status.pid ?? null,
						running: status.running,
						answering: status.answering,
					},
					null,
					2,
				),
			);
			return status.answering ? 0 : 1;
		}
		default:
			console.error('usage: bun run scripts/ci/suite_mariadb.ts start|stop|status|sweep');
			return 2;
	}
}

if (import.meta.main) {
	try {
		process.exit(await main(process.argv[2]));
	} catch (error) {
		console.error(
			`== suite_mariadb: RED — ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exit(1);
	}
}
