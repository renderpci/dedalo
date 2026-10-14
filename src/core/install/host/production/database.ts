/**
 * host_database — THE INSTANCE'S DATABASE (terminal installer phase 4,
 * 2026-10-12).
 *
 *  - `--db-mode create` (the default on a local PostgreSQL 18): the role named
 *    like the SERVICE USER (the plan holds db_username to it — PEER maps the OS
 *    user to the role of the same name) with LOGIN and NO password — PEER authentication over the local
 *    socket, so no database password exists at rest (owner question Q2; fixes
 *    campaign 2 L59) — and the database `dedalo_<i>` it OWNS, UTF8 from
 *    template0 (critique A9: template1's encoding may differ) — then PUBLIC's
 *    CONNECT and TEMPORARY on it REVOKED and granted to the role alone
 *    (PostgreSQL grants them to PUBLIC by default: another instance's role
 *    connected to it and read its catalogs — campaign 3 C3-62). The SQL
 *    travels on psql's stdin. Then the outcome: the instance user reaches its database
 *    by peer (a cluster whose pg_hba refuses local peer is TOLD — pg_hba is
 *    global configuration, never edited), and the three trusted extensions the
 *    seed needs are available.
 *  - `--db-mode existing`: nothing is created; the engine's own
 *    test_db_connection probes it (with the password the operator gives).
 *
 * UNDO (critique B3): DROP only what this install CREATED, only with
 * `--confirm-database <db>`, and only an EMPTY database (the engine child's
 * --abort resets it first; a sealed engine refuses the whole host abort before
 * this). Never IF EXISTS on a name it did not create.
 */

import type { ExecCommand, HostCtx, HostPlanCtx, HostStepDefinition } from '../contract.ts';
import { executeCommands, requestOf } from '../execute.ts';
import { sqlLiteral } from '../facts.ts';
import { hostRefuse } from '../refuse.ts';
import { probeText, ran, verdictOf } from './common.ts';

/** A SQL identifier, double-quoted. */
export function sqlIdentifier(name: string): string {
	return `"${name.replace(/"/g, '""')}"`;
}

/** psql as `user` (postgres or the instance), over the local socket. */
function psql(
	ctx: HostPlanCtx,
	user: 'postgres' | 'instance',
	database: string,
	options: { sql?: string; stdin?: string; label: string; mutates: boolean },
): ExecCommand {
	const socket = ctx.answers.db_socket || '/var/run/postgresql';
	const args = [
		'-X',
		'-q',
		'-A',
		'-t',
		'-v',
		'ON_ERROR_STOP=1',
		'-h',
		socket,
		'-p',
		ctx.answers.db_port,
		'-d',
		database,
	];
	return {
		kind: 'exec',
		argv: [
			`${ctx.row.pgBinDir}/psql`,
			...args,
			...(options.sql === undefined ? [] : ['-c', options.sql]),
		],
		as: user,
		label: options.label,
		mutates: options.mutates,
		...(options.stdin === undefined ? {} : { stdin: { text: options.stdin } }),
	};
}

/** A probe that FAILS (exit 1) when the count is zero — an `unless` for "already there". */
function existsProbe(
	ctx: HostPlanCtx,
	catalog: 'pg_roles' | 'pg_database',
	column: string,
	name: string,
): ExecCommand {
	return psql(ctx, 'postgres', 'postgres', {
		sql: `SELECT 1 / count(*) FROM ${catalog} WHERE ${column} = ${sqlLiteral(name)}`,
		label: `${name} exists`,
		mutates: false,
	});
}

export function databaseCommands(ctx: HostPlanCtx): ExecCommand[] {
	const { db_database: db, db_username: role } = ctx.answers;
	if (ctx.answers.db_mode !== 'create') return [];
	return [
		{
			...psql(ctx, 'postgres', 'postgres', {
				stdin: `CREATE ROLE ${sqlIdentifier(role)} LOGIN;\n`,
				label: `create the role ${role} (peer role = the service user: no password)`,
				mutates: true,
			}),
			unless: existsProbe(ctx, 'pg_roles', 'rolname', role),
		},
		{
			...psql(ctx, 'postgres', 'postgres', {
				stdin: `CREATE DATABASE ${sqlIdentifier(db)} OWNER ${sqlIdentifier(role)} ENCODING 'UTF8' TEMPLATE template0;\n`,
				label: `create the database ${db} owned by ${role}`,
				mutates: true,
			}),
			unless: existsProbe(ctx, 'pg_database', 'datname', db),
		},
		psql(ctx, 'postgres', 'postgres', {
			stdin: `REVOKE CONNECT, TEMPORARY ON DATABASE ${sqlIdentifier(db)} FROM PUBLIC;\nGRANT CONNECT, TEMPORARY ON DATABASE ${sqlIdentifier(db)} TO ${sqlIdentifier(role)};\n`,
			label: `only ${role} may connect to ${db} (PUBLIC's CONNECT and TEMPORARY revoked — another instance's role cannot reach it)`,
			mutates: true,
		}),
	];
}

/** The probe of PUBLIC's reach: `t` when any role may still connect (or make temporary tables). */
function publicReachProbe(ctx: HostPlanCtx): ExecCommand {
	const db = sqlLiteral(ctx.answers.db_database);
	return psql(ctx, 'postgres', 'postgres', {
		sql: `SELECT has_database_privilege('public', ${db}, 'CONNECT') OR has_database_privilege('public', ${db}, 'TEMPORARY')`,
		label: 'PUBLIC reaches the database',
		mutates: false,
	});
}

/** The outcome checks: peer reach as the instance user, the extensions available. */
async function databaseChecks(ctx: HostCtx): Promise<[boolean, string][]> {
	const reach = await probeText(
		ctx,
		psql(ctx, 'instance', ctx.answers.db_database, {
			sql: 'SELECT 1',
			label: 'peer login',
			mutates: false,
		}),
	);
	const extensions = await probeText(
		ctx,
		psql(ctx, 'postgres', 'postgres', {
			sql: "SELECT count(*) FROM pg_available_extensions WHERE name IN ('btree_gin', 'pg_trgm', 'unaccent')",
			label: 'extensions available',
			mutates: false,
		}),
	);
	const publicReach = await probeText(ctx, publicReachProbe(ctx));
	return [
		[
			publicReach.trim() === 'f',
			`PUBLIC may still connect to ${ctx.answers.db_database} (every role of the cluster, another instance's included) — REVOKE CONNECT, TEMPORARY ON DATABASE ${ctx.answers.db_database} FROM PUBLIC`,
		],
		[
			reach.trim() === '1',
			`${ctx.paths.user} cannot reach ${ctx.answers.db_database} by peer over ${ctx.answers.db_socket} — allow "local all all peer" in pg_hba.conf (global configuration: the installer never edits it)`,
		],
		[
			extensions.trim() === '3',
			'the extensions btree_gin, pg_trgm and unaccent are not all available (install the PostgreSQL contrib package)',
		],
	];
}

/** Refuse to drop a database that holds anything (only the empty one the child's abort left). */
async function assertEmpty(ctx: HostCtx): Promise<void> {
	const count = await probeText(
		ctx,
		psql(ctx, 'postgres', ctx.answers.db_database, {
			sql: "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')",
			label: 'database empty',
			mutates: false,
		}),
	);
	if (count.trim() !== '0') {
		hostRefuse(
			'install.state_conflict',
			`database ${ctx.answers.db_database} is not empty — nothing was dropped`,
		);
	}
}

/** One DROP over psql's stdin, as postgres. */
async function drop(ctx: HostCtx, sql: string, label: string): Promise<void> {
	await executeCommands(
		[psql(ctx, 'postgres', 'postgres', { stdin: `${sql}\n`, label, mutates: true })],
		ctx,
	);
}

async function undoDatabase(ctx: HostCtx): Promise<string> {
	const { db_database: db, db_username: role } = ctx.answers;
	const { pg_database: database, pg_role: roleCreated } = ctx.created;
	if (!database && !roleCreated) return 'nothing was created';
	if (ctx.confirmDatabase !== db) {
		hostRefuse(
			'install.invalid_input',
			`--abort drops database ${db}: confirm with --confirm-database ${db}`,
		);
	}
	const dropped: string[] = [];
	if (database) {
		await assertEmpty(ctx);
		await drop(ctx, `DROP DATABASE ${sqlIdentifier(db)};`, `drop ${db}`);
		dropped.push(db);
	}
	if (roleCreated) {
		await drop(ctx, `DROP ROLE ${sqlIdentifier(role)};`, `drop ${role}`);
		dropped.push(role);
	}
	return `dropped ${dropped.join(' and ')}`;
}

/**
 * The System check could not see PostgreSQL (installed but stopped — the
 * packages step starts it — or psql failed): existence is measured NOW, before
 * the CREATE, and only an absent object is recorded as this install's. A role
 * that existed before the install is never dropped by its --abort.
 */
async function recordUnknownExistence(ctx: HostCtx): Promise<void> {
	if (ctx.answers.db_mode !== 'create') return;
	const { db_database: db, db_username: role } = ctx.answers;
	if (ctx.facts.roleExists === null && !ctx.created.pg_role)
		ctx.created.pg_role = await absentNow(ctx, existsProbe(ctx, 'pg_roles', 'rolname', role));
	if (ctx.facts.dbExists === null && !ctx.created.pg_database)
		ctx.created.pg_database = await absentNow(ctx, existsProbe(ctx, 'pg_database', 'datname', db));
	ctx.save();
}

/**
 * Is the object absent NOW? The probe divides by its count: exit 0 = present,
 * exit 1 (psql's SQL error: division by zero) = absent; anything else (exit 2:
 * no connection) is no answer — refused, never read as "absent".
 */
async function absentNow(ctx: HostCtx, probe: ExecCommand): Promise<boolean> {
	const result = await ctx.runner.run(requestOf(probe, ctx));
	if (result.exitCode === 0) return false;
	if (result.exitCode === 1 && !result.timedOut) return true;
	return hostRefuse(
		'install.step_failed',
		`PostgreSQL did not answer whether ${probe.label.replace(/ exists$/, '')} exists (exit ${result.exitCode}) — is the cluster running? Then --resume`,
	);
}

export const host_database: HostStepDefinition = {
	id: 'host_database',
	privilege: 'root',
	kind: 'action',
	needs: [],
	label: (plan) =>
		plan.answers.db_mode === 'create'
			? `database ${String(plan.answers.db_database)} owned by the peer role ${String(plan.answers.db_username)} (the service user)`
			: `existing database ${String(plan.answers.db_database)} (probed by the engine)`,
	commands: databaseCommands,
	verify: async (ctx) =>
		ctx.answers.db_mode === 'create'
			? verdictOf(
					await databaseChecks(ctx),
					`${ctx.answers.db_database} reachable by peer, extensions available`,
				)
			: { ok: true, detail: 'existing database — the engine probes it' },
	run: async (ctx) => {
		await recordUnknownExistence(ctx);
		await executeCommands(databaseCommands(ctx), ctx);
		return ran(
			ctx.answers.db_mode === 'create'
				? `${ctx.answers.db_database} created`
				: 'existing database kept as it is',
		);
	},
	intent: (ctx) => {
		if (ctx.answers.db_mode !== 'create') return;
		// Only a MEASURED absence is a creation; unknown (null) is measured in run().
		ctx.created.pg_role ||= ctx.facts.roleExists === false;
		ctx.created.pg_database ||= ctx.facts.dbExists === false;
	},
	undo: undoDatabase,
};
