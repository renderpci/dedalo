/**
 * THE MIGRATION CENSUS of this install (terminal installer phase 4,
 * 2026-10-12) — which install/db/migrations/* files the database has NOT
 * recorded yet (dedalo_ts_schema_migrations), online ones included.
 *
 *   bun run scripts/ops/boot_status.ts [--json]
 *
 * Run AS THE INSTANCE USER in its own tree (it reads that install's
 * ../private/.env like the server does): the production route's
 * host_first_boot waits until `pending` is empty before it arms the watchdog —
 * a watchdog armed while boot migrations still ran killed the first boot
 * (campaign 2 L7). Read-only: one SELECT.
 *
 * Output: `{"applied":<n>,"pending":["0012_x.sql",…]}` (--json) or one line per
 * pending file. Exit 0 when the census was read (pending or not), 1 when the
 * database could not be asked.
 */

import { pendingMigrations } from '../../install/db/migrate.ts';

const json = Bun.argv.includes('--json');

try {
	// The runner's own census (the same file filter it applies with — install/db/migrate.ts).
	const { applied, pending } = await pendingMigrations();
	if (json) console.log(JSON.stringify({ applied, pending }));
	else for (const name of pending) console.log(name);
	process.exit(0);
} catch (error) {
	console.error(`boot_status: the database could not be asked (${(error as Error).name})`);
	process.exit(1);
}
