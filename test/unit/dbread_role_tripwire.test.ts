/**
 * DB-READ ROLE TRIPWIRE — `dedalo_test_ro` can LOG IN, can READ, and a write
 * attempted AS THAT ROLE is refused by Postgres itself.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * scripts/test_db_setup.ts step 5b (landed 2026-08-25) ensures a SELECT-only
 * LOGIN role on the suite database, for the shard bands that never write. Every
 * property of that role has a silent failure mode a grants-listing gate cannot
 * see:
 *
 *  - A gate that only inspects information_schema/pg_roles is GREEN against a
 *    role nobody can even log in as (NOLOGIN, a password that fails scram, a
 *    missing CONNECT grant). The point of this gate is therefore an ACTUAL
 *    CONNECTION as the role and an ACTUAL WRITE ATTEMPT that Postgres refuses
 *    with SQLSTATE 42501 — the enforcement is asked to fire, not described.
 *  - The per-database grants DIE with every DROP DATABASE in a rebuild; step 5b
 *    re-issues them each run, and this gate is what notices a rebuild that
 *    stopped doing so (the role would still exist at the cluster level,
 *    half-granted — exactly the state a role census reports as fine).
 *
 * ── THE WRITE PROBES TOUCH ZERO ROWS, BY CONSTRUCTION ────────────────────────
 * Every probe statement is `… WHERE false` (INSERT via `SELECT … WHERE
 * false`). Postgres checks table privileges at executor initialization
 * REGARDLESS of row count, so the probe exercises the refusal without a single
 * row at stake — and the anti-vacuity control runs the SAME statements as the
 * suite's own configured user, where they must SUCCEED (touching 0 rows),
 * proving the role's failure is a PRIVILEGE refusal, not a syntax error both
 * users would share. That control is also why this gate may run on the marked
 * suite database at all: it writes nothing anywhere (hard rule: DB writes in
 * tests only on scratch surfaces — zero-row statements move no data).
 *
 * ── PENDING STATE, stated plainly ────────────────────────────────────────────
 * The suite fixture on this workstation predates step 5b (the role step ships
 * in the rebuilt scripts/test_db_setup.ts; the 907 s rebuild has not run yet,
 * and the role was measured ABSENT 2026-08-25). Until `bun run test:db:setup`
 * runs once, the 'role exists' test is DELIBERATELY RED with that exact
 * instruction, and the behavioural tests SKIP EXPLICITLY (they need the role
 * to exist before they can connect as it) — one red naming the fix, never a
 * silent pass.
 *
 * ── WITHOUT POSTGRES ─────────────────────────────────────────────────────────
 * The whole describe SKIPS LOUDLY via `describe.if(DB_READY)` (bun prints the
 * skip; the warn below names the build command). It never silently passes: a
 * skipped test is reported as skipped, and the hermetic tier has no database
 * for the role to protect.
 *
 * ── WHAT THIS DOES NOT PROVE, stated plainly ─────────────────────────────────
 *  - It probes INSERT/UPDATE/DELETE on the matrix_* tables and dd_ontology —
 *    the surfaces the suite's data law names. TRUNCATE/DDL/sequence grants are
 *    not probed (the grants census asserts no write privilege is GRANTED, but
 *    only the three DML verbs are fired as the role).
 *  - It proves the role's state on THIS cluster now, not that step 5b produced
 *    it: a hand-created identical role satisfies every assertion. The setup
 *    script's own source is pinned by its sibling gates.
 *  - Local pg_hba `trust` may accept the connection without ever checking the
 *    password; that the fixed credential works under CI's scram is proven only
 *    where scram is forced (engineering/CI.md).
 *
 * Registration (scripts/verify.ts TRIPWIRES + engineering/TRIPWIRES.md) is a
 * separate, deliberate edit — see the index's own contract.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { SQL } from 'bun';
import { readEnv } from '../../src/config/env.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { DB_READY } from '../helpers/db_ready.ts';

/** The role and its fixed, deliberately non-secret credential — the exact pair
 * scripts/test_db_setup.ts step 5b ensures (see its header for why a password
 * is mandatory and why it is not a secret). */
const RO_ROLE = 'dedalo_test_ro';
const RO_PASSWORD = 'dedalo_test_ro';

const BUILD_COMMAND = 'bun run test:db:setup';

if (!DB_READY) {
	console.warn(
		`[dbread_role] no suite Postgres — every assertion about '${RO_ROLE}' is SKIPPED (loudly, never passed). Build the suite database (and the role, step 5b) with: ${BUILD_COMMAND}`,
	);
}

/**
 * Host or unix socket, the same way the engine resolves it. DUPLICATED UNDER
 * PROTEST from src/core/db/postgres.ts buildSqlOptions — the same duplication
 * test/preload/test_database.ts carries, for the same reason it documents: a
 * socket DIRECTORY passed as `hostname` fails as a swallowed 'Connection
 * closed', not loudly. Keep the copies in step.
 */
function connectionTarget(): { path: string } | { hostname: string; port: number } {
	const host = readEnv('DB_HOST') ?? 'localhost';
	const port = Number(readEnv('DB_PORT') ?? 5432);
	return host.startsWith('/') ? { path: `${host}/.s.PGSQL.${port}` } : { hostname: host, port };
}

/** Does the role exist AND can it log in? Asked once, top-level, so the
 * behavioural tests can gate at COLLECTION time (test.if — an explicit SKIP,
 * never an if-return silent pass; see test/helpers/db_ready.ts). */
const ROLE_EXISTS: boolean = DB_READY
	? await (async () => {
			const rows = (await sql`
				SELECT rolcanlogin FROM pg_roles WHERE rolname = ${RO_ROLE}
			`) as { rolcanlogin: boolean }[];
			return rows.length === 1 && rows[0]?.rolcanlogin === true;
		})()
	: false;

/** The write-probe statements — every one touches ZERO rows by construction
 * (see the header). Verified valid against the suite schema 2026-08-25. */
const WRITE_PROBES: { label: string; statement: string }[] = [
	{
		label: 'INSERT matrix_hierarchy',
		statement: `INSERT INTO matrix_hierarchy (section_id, section_tipo) SELECT 0, 'gate-probe' WHERE false`,
	},
	{
		label: 'UPDATE matrix_hierarchy',
		statement: `UPDATE matrix_hierarchy SET section_tipo = section_tipo WHERE false`,
	},
	{ label: 'DELETE matrix_hierarchy', statement: `DELETE FROM matrix_hierarchy WHERE false` },
	{
		label: 'INSERT dd_ontology',
		statement: `INSERT INTO dd_ontology (tipo) SELECT 'gate-probe' WHERE false`,
	},
	{ label: 'UPDATE dd_ontology', statement: `UPDATE dd_ontology SET tipo = tipo WHERE false` },
	{ label: 'DELETE dd_ontology', statement: `DELETE FROM dd_ontology WHERE false` },
];

let roPool: SQL | undefined;

/** A live connection AS the role — created lazily, closed in afterAll. */
function roConnection(): SQL {
	roPool ??= new SQL({
		...connectionTarget(),
		username: RO_ROLE,
		password: RO_PASSWORD,
		// THE DATABASE THIS PROCESS IS ALREADY POINTED AT — never testDatabaseName().
		//
		// That helper DERIVES `<DB_NAME>_test`, and by the time a test body runs,
		// `test/preload/test_database.ts` has ALREADY rewritten DB_NAME to the suite
		// database. Deriving again yields `<app>_test_test`, and the probe below
		// then failed with `database "dedalo_v7_mht_test_test" does not exist`
		// (3D000) instead of the privilege refusal it exists to prove — MEASURED,
		// not hypothetical. It is the same double-suffix trap
		// `scripts/lib/parity_census.ts` records in its header, arriving here by the
		// same route: a helper whose output is also its own input.
		database: readEnv('DB_NAME'),
		max: 1,
	});
	return roPool;
}

afterAll(async () => {
	await roPool?.end();
});

describe.if(DB_READY)(`the read-only role '${RO_ROLE}'`, () => {
	test('exists and can log in (DELIBERATELY RED until the fixture is rebuilt — see the header)', () => {
		expect(
			ROLE_EXISTS,
			`role '${RO_ROLE}' is missing or NOLOGIN on this cluster. The suite fixture predates scripts/test_db_setup.ts step 5b (2026-08-25) — rebuild it once: ${BUILD_COMMAND}. The behavioural tests below SKIP until then; this red is the pending state, not noise.`,
		).toBe(true);
	});

	test.if(ROLE_EXISTS)(
		'holds NO write privilege on matrix_* or dd_ontology — and DOES hold SELECT',
		async () => {
			const rows = (await sql`
			SELECT tablename,
			       has_table_privilege(${RO_ROLE}, format('%I.%I', schemaname, tablename), 'SELECT') AS can_select,
			       has_table_privilege(${RO_ROLE}, format('%I.%I', schemaname, tablename), 'INSERT') AS can_insert,
			       has_table_privilege(${RO_ROLE}, format('%I.%I', schemaname, tablename), 'UPDATE') AS can_update,
			       has_table_privilege(${RO_ROLE}, format('%I.%I', schemaname, tablename), 'DELETE') AS can_delete
			FROM pg_tables
			WHERE schemaname = 'public'
			  AND (tablename LIKE 'matrix%' OR tablename = 'dd_ontology')
			ORDER BY tablename
		`) as {
				tablename: string;
				can_select: boolean;
				can_insert: boolean;
				can_update: boolean;
				can_delete: boolean;
			}[];
			// Anti-vacuity floor: the census must see the real schema (32 such tables
			// measured 2026-08-25) — an empty listing proves nothing about grants.
			expect(rows.length).toBeGreaterThan(10);
			const writable = rows.filter((r) => r.can_insert || r.can_update || r.can_delete);
			expect(
				writable.map((r) => r.tablename),
				`'${RO_ROLE}' holds a WRITE privilege on data tables — step 5b grants SELECT only; a rebuild or a hand GRANT widened it.`,
			).toEqual([]);
			const unreadable = rows.filter((r) => !r.can_select);
			expect(
				unreadable.map((r) => r.tablename),
				`'${RO_ROLE}' cannot SELECT these tables — the per-database grants died with a DROP and were not re-issued (half-granted role). Rebuild: ${BUILD_COMMAND}`,
			).toEqual([]);
		},
	);

	test.if(ROLE_EXISTS)('POSITIVE CONTROL: an actual connection AS the role can read', async () => {
		// This is the half a grants census cannot give: the credential pair
		// authenticates and the role reaches real data. Without it, every refusal
		// below could equally be "nobody can log in as this role at all".
		const ro = roConnection();
		const rows = (await ro`SELECT count(*)::int AS n FROM dd_ontology`) as { n: number }[];
		expect(rows[0]?.n).toBeGreaterThan(0);
	});

	test.if(ROLE_EXISTS)(
		'THE POINT: every write attempted AS the role raises SQLSTATE 42501',
		async () => {
			const ro = roConnection();
			for (const probe of WRITE_PROBES) {
				let refusal: { errno?: string; message?: string } | undefined;
				try {
					await ro.unsafe(probe.statement);
				} catch (error) {
					refusal = error as { errno?: string; message?: string };
				}
				expect(
					refusal,
					`${probe.label}: the statement SUCCEEDED as '${RO_ROLE}' — the role can write. It touched zero rows (WHERE false), but the privilege is real; revoke it and fix step 5b.`,
				).toBeDefined();
				expect(
					refusal?.errno,
					`${probe.label}: failed with '${refusal?.message}' (${refusal?.errno}) — expected the PRIVILEGE refusal 42501, so this error is about something else (schema drift? connection?), and the gate has not proven what it claims.`,
				).toBe('42501');
			}
		},
	);

	test.if(ROLE_EXISTS)(
		'ANTI-VACUITY: the same statements SUCCEED as the suite user (they are valid SQL touching zero rows)',
		async () => {
			// If a probe statement were malformed, the role's failure above would be
			// a syntax error dressed up as enforcement. Running the identical bytes
			// as the configured (owning) user must succeed — and, WHERE false, moves
			// no data on the marked suite database.
			for (const probe of WRITE_PROBES) {
				await sql.unsafe(probe.statement);
			}
			expect(true).toBe(true);
		},
	);
});
