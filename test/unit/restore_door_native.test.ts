/**
 * restore_door_native — A RESTORE IS A PROCEDURE THE ENGINE OWNS (audit
 * 2026-08-26 S-7; the P0-13 residual).
 *
 * THE DEFECT THIS GATE EXISTS FOR. The only restore recipe was prose:
 * `pg_restore --clean`, no full read of the artifact, no stop-the-engine step,
 * no `--single-transaction`, no `--exit-on-error`, no exit-status check.
 * `pg_restore` continues past errors by default, so a run whose COPY of one
 * table failed left that table's OLD rows beside restored neighbours, and
 * nothing an operator could see distinguished it from a successful restore.
 * The audit said the recipe "cannot be gated as written" — true of prose, not
 * of a door. `src/core/area_maintenance/restore_door.ts` is the door; this
 * gate drives it against a REAL Postgres with REAL archive bytes.
 *
 * ── WHAT IS ASSERTED, on a scratch target `dedalo_rdoor<pid>` ─────────────
 *
 *  1. A TRUNCATED artifact (the real suite-database archive cut to 60% — a
 *     prefix, never an invention; `--list` passes it, only a full read fails
 *     it) is REFUSED `recovery.artifact_unusable` BEFORE ANY WRITE: no sidecar
 *     database was ever created, the target's content fingerprint is unchanged,
 *     the reconcile seam did not run, no journal was written.
 *  2. A FOREIGN BACKEND on the target (a psql holding `pg_sleep`) is REFUSED
 *     `recovery.writers_active` naming its pid — same four "nothing happened"
 *     assertions.
 *  3. A MID-RESTORE FAILURE (pg_restore is a wrapper that swaps the artifact
 *     for the truncated one after the verification passed, so the real binary
 *     fails inside the data blocks) leaves the target fingerprint-equal, leaves
 *     NO `_restoring_` database behind, does not run the seam, and reports
 *     `recovery.restore_failed`.
 *  4. A CLEAN artifact RESTORES: the target now holds the archive's rows (the
 *     suite database's own counts), the previous content survives under
 *     `<db>_pre_restore_<stamp>` with its OLD fingerprint, the seam ran exactly
 *     ONCE and AFTER the swap (it recorded the target's fingerprint at the
 *     moment it ran), maintenance mode was stamped in the (scratch) ts_state,
 *     and the journal names artifact, target, previous, reconcile verdicts.
 *  5. `dropPrevious` removes the parked database and the journal says so.
 *  6. A SWAP FAILURE (the parked name `<db>_pre_restore_<stamp>` already
 *     exists, so the first RENAME fails with a real Postgres error) drops the
 *     sidecar, leaves the target fingerprint-equal, does not run the seam, and
 *     reports `recovery.restore_failed` saying the sidecar was dropped.
 *  7. THE DEFAULT PLAN RUNS in `restore` mode (no seam injected): the report's
 *     steps are POST_RESTORE_PLAN name for name with its apply flags, every
 *     step carries a registry report or an error CODE, and the registry's own
 *     run records show each name ran AFTER the door started — the production
 *     default (`runPostRestore`) is what the door wires, not a seam.
 *  8. A REHEARSAL (target != the configured database — the production
 *     `--database other` path) restores the rows but runs NO plan (an
 *     injected seam is never called, the registry's run records are
 *     byte-identical before and after) and NEVER stamps maintenance mode. This
 *     is the "live engine + wrong database" class: the plan runs through the
 *     pool, bound to the CONFIGURED database, and its two apply steps would
 *     write to production while the stamp flipped the serving engine into
 *     maintenance mode.
 *  9. POST_RESTORE_PLAN is TOTAL over `REGISTERED_NAMES` and its apply set is
 *     exactly {counters_media, media_index} — a new reconcile has to decide
 *     what a restore does with it, and widening the apply set is deliberate.
 * 10. `runPostRestore` RECORDS A THROWN STEP BY CODE AND CONTINUES: a plan
 *     step the registry does not know throws the registry's own
 *     `resource.not_found`; it lands in `failed` with its code, every later
 *     step still ran, and `held` is exactly the dry steps that reported drift.
 *
 * ── HONEST LIMITS ───────────────────────────────────────────────────────────
 *
 *  - THE PRODUCTION WIRING IS SIMULATED. The registry's definitions run through
 *    the shared pool, bound to the SUITE database for the life of this process,
 *    while the door restores into a scratch database. Legs 3-7 therefore tell
 *    the door the scratch target IS the configured database
 *    (`configuredDatabase`), which is exactly the production case (the CLI
 *    restores `config.db.database`); the plan in leg 7 then runs against the
 *    suite database — the same content the archive holds — and what is proved
 *    is that the door wires the real plan and when. The plan's per-step
 *    behaviour (raise-only counters, pub/ derivation) is
 *    `reconcile_registry_native`'s and the owners' gates', not this file's.
 *  - "TARGET UNTOUCHED" is asserted as a CONTENT FINGERPRINT (every table's row
 *    count plus an md5 over dd_ontology's tipo/model pairs) and by the set of
 *    databases in the cluster — not a byte comparison of the data directory.
 *  - Nothing here stops a service: the door's contract is "zero foreign
 *    backends or refuse", and that is what leg 2 proves.
 *  - Needs a reachable Postgres with CREATEDB on the suite role, pg_dump and
 *    pg_restore. Without them the whole describe SKIPS at collection time
 *    (`describe.if`, loudly) — never an early `return` inside a test body.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from '../../src/config/config.ts';
import {
	resolvePgDump,
	resolvePgRestore,
	verifyBackupArtifact,
} from '../../src/core/area_maintenance/backup.ts';
import {
	type RestoreDoorReport,
	restoreDatabaseNames,
	runRestoreDoor,
} from '../../src/core/area_maintenance/restore_door.ts';
import { DedaloError } from '../../src/core/errors/dedalo_error.ts';
import { type DbConnDescriptor, runPsql } from '../../src/core/install/pg_exec.ts';
import {
	POST_RESTORE_PLAN,
	type PostRestoreReport,
	runPostRestore,
} from '../../src/core/reconcile/post_restore.ts';
import { lastReconcileRun, REGISTERED_NAMES } from '../../src/core/reconcile/registry.ts';
import { getServerState, setServerState } from '../../src/core/resolve/server_state.ts';
import { sweepOrphanScratchDatabases } from '../helpers/scratch_database.ts';

const SCRATCH_PREFIX = 'dedalo_rdoor';
const TARGET = `${SCRATCH_PREFIX}${process.pid}`;
/** A real restore is ~5-6 s of pg_restore; bare `bun test <file>` defaults to 5 s. */
const RESTORE_TIMEOUT_MS = 120_000;
/** The registry's run records, one string — "the plan did not run" is this being equal. */
function registryRecords(): string {
	return JSON.stringify(REGISTERED_NAMES.map((name) => lastReconcileRun(name)));
}
/** What may follow the pid: the door's two derived names. */
const DERIVED = /^_(?:restoring|pre_restore)_[0-9]{8}_[0-9]{6}$/;

const admin: DbConnDescriptor = {
	database: 'postgres',
	host: config.db.host,
	port: config.db.port,
	user: config.db.user,
	password: config.db.password,
};
const target: DbConnDescriptor = { ...admin, database: TARGET };

const scratch = mkdtempSync(join(tmpdir(), 'dedalo_restore_door_'));
const CLEAN = join(scratch, 'clean.custom.backup');
const TRUNCATED = join(scratch, 'truncated.custom.backup');
const JOURNAL_DIR = join(scratch, 'restores');

/** A real custom-format archive of the WHOLE suite database (a read). */
function buildArchive(): string {
	const run = Bun.spawnSync(
		[
			resolvePgDump(),
			'-h',
			config.db.host,
			'-p',
			String(config.db.port),
			'-U',
			config.db.user,
			'-F',
			'c',
			'-b',
			'-f',
			CLEAN,
			config.db.database,
		],
		{
			stdout: 'ignore',
			stderr: 'pipe',
			env: {
				...(process.env as Record<string, string>),
				...(config.db.password !== '' ? { PGPASSWORD: config.db.password } : {}),
			},
		},
	);
	if (run.exitCode !== 0) return `pg_dump failed: ${new TextDecoder().decode(run.stderr)}`;
	const bytes = readFileSync(CLEAN);
	if (bytes.length < 256 * 1024)
		return `archive is only ${bytes.length} bytes (bun run test:db:setup)`;
	writeFileSync(TRUNCATED, bytes.subarray(0, Math.floor(bytes.length * 0.6)));
	return '';
}

const pgRestoreBin = resolvePgRestore();
const archiveNote = pgRestoreBin === null ? 'no pg_restore on this host' : buildArchive();
const READY = archiveNote === '';
if (!READY) console.warn(`[restore_door] SKIPPED (not passed): ${archiveNote}`);

/** Every row count plus an ontology digest — "the target is untouched" in one string. */
async function fingerprint(database: string): Promise<string> {
	const run = await runPsql(
		admin,
		[
			'-tAc',
			`SELECT string_agg(relname || ':' || n_live_tup, ',' ORDER BY relname) FROM pg_stat_user_tables`,
			'-tAc',
			"SELECT coalesce(md5(string_agg(tipo || '/' || coalesce(model, ''), ',' ORDER BY tipo)), 'no-ontology') FROM dd_ontology",
			'-v',
			'ON_ERROR_STOP=1',
		],
		{ database },
	);
	// A missing dd_ontology (the sentinel-only target) is a fingerprint too.
	return run.exitCode === 0 ? run.stdout : `tables-only:${await tableList(database)}`;
}

async function tableList(database: string): Promise<string> {
	const run = await runPsql(
		admin,
		['-tAc', "SELECT string_agg(relname, ',' ORDER BY relname) FROM pg_stat_user_tables"],
		{ database },
	);
	return run.stdout;
}

async function scalar(database: string, query: string): Promise<string> {
	const run = await runPsql(admin, ['-tAc', query, '-v', 'ON_ERROR_STOP=1'], { database });
	if (run.exitCode !== 0) throw new Error(`${query}: ${run.stderr}`);
	return run.stdout.trim();
}

async function databasesLike(prefix: string): Promise<string[]> {
	const out = await scalar(
		'postgres',
		`SELECT coalesce(string_agg(datname, ',' ORDER BY datname), '') FROM pg_database WHERE datname LIKE '${prefix.replace(/_/g, '\\_')}%'`,
	);
	return out === '' ? [] : out.split(',');
}

/** The seam recorder: how often, and what the target looked like when it ran. */
function recorder(): { calls: string[]; run: () => Promise<PostRestoreReport> } {
	const calls: string[] = [];
	return {
		calls,
		run: async () => {
			calls.push(await fingerprint(TARGET));
			return { steps: [], held: [], failed: [] };
		},
	};
}

async function refusal(promise: Promise<unknown>): Promise<DedaloError> {
	try {
		await promise;
	} catch (error) {
		if (error instanceof DedaloError) return error;
		throw error;
	}
	throw new Error('the door did not refuse');
}

let stampCounter = 0;
/** Distinct, identifier-safe stamps per run (a real run uses the clock). */
function nextStamp(): string {
	stampCounter += 1;
	return `20260903_${String(100000 + stampCounter).slice(1)}`;
}

beforeAll(async () => {
	if (!READY) return;
	await sweepOrphanScratchDatabases(admin, SCRATCH_PREFIX, { derivedSuffix: DERIVED });
	for (const name of await databasesLike(TARGET)) {
		await runPsql(admin, ['-c', `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`]);
	}
	// The OLD contents: a database that is NOT the archive, so "untouched" and
	// "the previous copy survives" are both distinguishable from the restore.
	const created = await runPsql(admin, ['-c', `CREATE DATABASE "${TARGET}"`]);
	expect(created.stderr).toBe('');
	const seeded = await runPsql(target, [
		'-c',
		"CREATE TABLE restore_door_sentinel (v text); INSERT INTO restore_door_sentinel VALUES ('old contents')",
		'-v',
		'ON_ERROR_STOP=1',
	]);
	expect(seeded.stderr).toBe('');
	setServerState({ maintenance_mode: false });
});

afterAll(async () => {
	for (const name of await databasesLike(TARGET).catch(() => [] as string[])) {
		await runPsql(admin, ['-c', `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`]);
	}
	setServerState({ maintenance_mode: false });
	rmSync(scratch, { recursive: true, force: true });
});

describe.if(READY)('restore door — the artifact, the writers, the failure, the restore', () => {
	test('the situation is real: a verified archive, a truncated prefix --list cannot see, an old target', async () => {
		expect(verifyBackupArtifact(CLEAN, { deep: true, pgRestoreBin }).reason).toBe('verified_deep');
		expect(verifyBackupArtifact(TRUNCATED, { deep: false, pgRestoreBin }).reason).toBe(
			'verified_toc',
		);
		expect(verifyBackupArtifact(TRUNCATED, { deep: true, pgRestoreBin }).reason).toBe('truncated');
		expect(await scalar(TARGET, 'SELECT v FROM restore_door_sentinel')).toBe('old contents');
		expect(await databasesLike(TARGET)).toEqual([TARGET]);
		// The rehearsal leg relies on the scratch target NOT being the configured one.
		expect(config.db.database).not.toBe(TARGET);
	});

	test('1. a truncated artifact is refused before any write', async () => {
		// The verdict sidecar the situation leg just wrote would answer for the
		// door's own read: remove it, so what is measured is the door ASKING for a
		// full read, not a cached answer to someone else's question.
		rmSync(`${TRUNCATED}.verified`, { force: true });
		const before = await fingerprint(TARGET);
		const seam = recorder();
		const stamp = nextStamp();
		const error = await refusal(
			runRestoreDoor({
				artifact: TRUNCATED,
				connection: target,
				configuredDatabase: TARGET,
				pgRestoreBin: pgRestoreBin as string,
				reconcile: seam.run,
				journalDir: JOURNAL_DIR,
				stamp,
			}),
		);
		expect(error.code).toBe('recovery.artifact_unusable');
		expect(error.message).toContain('truncated');
		expect(await databasesLike(TARGET)).toEqual([TARGET]);
		expect(await fingerprint(TARGET)).toBe(before);
		expect(seam.calls).toEqual([]);
		expect(existsSync(join(JOURNAL_DIR, `${stamp}.json`))).toBe(false);
		// Refused in phase 1: not even maintenance mode was stamped.
		expect(getServerState().maintenance_mode).toBe(false);
	});

	test('2. a foreign backend on the target is refused, named by pid', async () => {
		const holder = Bun.spawn(
			[
				(await import('../../src/core/install/pg_bin.ts')).resolvePgBinary('psql'),
				`--dbname=${TARGET}`,
				'-h',
				String(config.db.host),
				'-p',
				String(config.db.port),
				'-U',
				config.db.user,
				'-tAc',
				'SELECT pg_backend_pid(); SELECT pg_sleep(30)',
			],
			{
				stdout: 'pipe',
				stderr: 'ignore',
				env: {
					...(process.env as Record<string, string>),
					...(config.db.password !== '' ? { PGPASSWORD: config.db.password } : {}),
				},
			},
		);
		try {
			// Wait until the backend is visible to pg_stat_activity.
			let backendPid = '';
			for (let i = 0; i < 100 && backendPid === ''; i++) {
				backendPid = await scalar(
					'postgres',
					`SELECT coalesce(string_agg(pid::text, ','), '') FROM pg_stat_activity WHERE datname = '${TARGET}' AND backend_type = 'client backend'`,
				);
				if (backendPid === '') await Bun.sleep(50);
			}
			expect(backendPid).not.toBe('');
			const before = await fingerprint(TARGET);
			const seam = recorder();
			const stamp = nextStamp();
			const error = await refusal(
				runRestoreDoor({
					artifact: CLEAN,
					connection: target,
					configuredDatabase: TARGET,
					pgRestoreBin: pgRestoreBin as string,
					reconcile: seam.run,
					journalDir: JOURNAL_DIR,
					stamp,
				}),
			);
			expect(error.code).toBe('recovery.writers_active');
			expect(error.message).toContain(`pid ${backendPid}`);
			expect(await databasesLike(TARGET)).toEqual([TARGET]);
			expect(await fingerprint(TARGET)).toBe(before);
			expect(seam.calls).toEqual([]);
			expect(existsSync(join(JOURNAL_DIR, `${stamp}.json`))).toBe(false);
			expect(getServerState().maintenance_mode).toBe(false);
		} finally {
			holder.kill();
			await holder.exited;
			// Killing the client leaves the backend inside pg_sleep until it next
			// touches the socket: end it server-side, then wait for it to be gone.
			await scalar(
				'postgres',
				`SELECT count(pg_terminate_backend(pid)) FROM pg_stat_activity WHERE datname = '${TARGET}'`,
			);
		}
		// The backend is gone before the next leg asks for zero connections.
		for (let i = 0; i < 100; i++) {
			const left = await scalar(
				'postgres',
				`SELECT count(*) FROM pg_stat_activity WHERE datname = '${TARGET}' AND backend_type = 'client backend'`,
			);
			if (left === '0') break;
			await Bun.sleep(50);
		}
	});

	test(
		'3. a mid-restore failure leaves the target untouched and no sidecar behind',
		async () => {
			// The wrapper answers the VERIFICATION runs (`--list`, `-f /dev/null`) with
			// the real binary on the real arguments, so phase 1 passes on the clean
			// archive — and swaps the artifact for the truncated prefix on the one call
			// that carries `--dbname`, so the real pg_restore fails INSIDE THE DATA
			// BLOCKS of a single transaction. A genuine mid-restore failure, not a
			// simulated exit code.
			const wrapper = join(scratch, 'pg_restore_midfail.sh');
			writeFileSync(
				wrapper,
				[
					'#!/bin/sh',
					'case " $* " in',
					`  *" --dbname "*) set -- "$@"; args=""; for a in "$@"; do if [ "$a" = '${CLEAN}' ]; then a='${TRUNCATED}'; fi; args="$args \\"$a\\""; done; eval exec '${pgRestoreBin}' $args ;;`,
					`  *) exec '${pgRestoreBin}' "$@" ;;`,
					'esac',
				].join('\n'),
			);
			chmodSync(wrapper, 0o755);
			const before = await fingerprint(TARGET);
			const seam = recorder();
			const stamp = nextStamp();
			const error = await refusal(
				runRestoreDoor({
					artifact: CLEAN,
					connection: target,
					configuredDatabase: TARGET,
					pgRestoreBin: wrapper,
					reconcile: seam.run,
					journalDir: JOURNAL_DIR,
					stamp,
				}),
			);
			expect(error.code).toBe('recovery.restore_failed');
			expect(error.message).toContain('sidecar dropped');
			expect(error.message).toContain('end of file');
			expect(await databasesLike(TARGET)).toEqual([TARGET]);
			expect(await fingerprint(TARGET)).toBe(before);
			expect(await scalar(TARGET, 'SELECT v FROM restore_door_sentinel')).toBe('old contents');
			expect(seam.calls).toEqual([]);
			expect(existsSync(join(JOURNAL_DIR, `${stamp}.json`))).toBe(false);
			// Phase 2 passed, so the stamp was set — and stays set: an operator whose
			// restore failed still wants a restarted engine to refuse ordinary logins.
			expect(getServerState().maintenance_mode).toBe(true);
			setServerState({ maintenance_mode: false });
		},
		RESTORE_TIMEOUT_MS,
	);

	let restored: RestoreDoorReport;
	test(
		'4. a clean artifact restores atomically, keeps the previous copy, reconciles after the swap, journals',
		async () => {
			const oldFingerprint = await fingerprint(TARGET);
			const suiteOntologyRows = await scalar(
				config.db.database,
				'SELECT count(*) FROM dd_ontology',
			);
			const seam = recorder();
			const stamp = nextStamp();
			const names = restoreDatabaseNames(TARGET, stamp);
			restored = await runRestoreDoor({
				artifact: CLEAN,
				connection: target,
				configuredDatabase: TARGET,
				pgRestoreBin: pgRestoreBin as string,
				reconcile: seam.run,
				journalDir: JOURNAL_DIR,
				stamp,
			});
			// The target IS the archive now.
			expect(await scalar(TARGET, 'SELECT count(*) FROM dd_ontology')).toBe(suiteOntologyRows);
			expect(await scalar(TARGET, "SELECT to_regclass('public.restore_door_sentinel')::text")).toBe(
				'',
			);
			// The previous copy survives, intact, under the parked name; no sidecar remains.
			expect(await databasesLike(TARGET)).toEqual([TARGET, names.previous].sort());
			expect(await fingerprint(names.previous)).toBe(oldFingerprint);
			expect(await scalar(names.previous, 'SELECT v FROM restore_door_sentinel')).toBe(
				'old contents',
			);
			// The seam ran ONCE, AFTER the swap: what it saw was the restored target.
			expect(seam.calls.length).toBe(1);
			expect(seam.calls[0]).toBe(await fingerprint(TARGET));
			expect(seam.calls[0]).not.toBe(oldFingerprint);
			// Maintenance mode stamped for the engine's next boot.
			expect(getServerState().maintenance_mode).toBe(true);
			// The report and the journal agree and name everything an operator needs.
			expect(restored.mode).toBe('restore');
			expect(restored.configured_database).toBe(TARGET);
			expect(restored.maintenance_mode_stamped).toBe(true);
			expect(restored.previous).toBe(names.previous);
			expect(restored.previous_dropped).toBe(false);
			expect(restored.sidecar).toBe(names.sidecar);
			expect(restored.artifact.reason).toBe('verified_deep');
			expect(restored.pg_restore.args).toContain('--single-transaction');
			expect(restored.pg_restore.args).toContain('--exit-on-error');
			expect(restored.pg_restore.args).toContain('--no-owner');
			expect(restored.reconcile).toEqual({ steps: [], held: [], failed: [] });
			const journal = JSON.parse(readFileSync(join(JOURNAL_DIR, `${stamp}.json`), 'utf8'));
			expect(journal).toEqual(JSON.parse(JSON.stringify(restored)));
			expect(journal.target).toBe(TARGET);
			expect(journal.artifact.filePath).toBe(CLEAN);
		},
		RESTORE_TIMEOUT_MS,
	);

	test(
		'5. --drop-previous removes the parked copy and the journal says so',
		async () => {
			const seam = recorder();
			const stamp = nextStamp();
			const names = restoreDatabaseNames(TARGET, stamp);
			const report = await runRestoreDoor({
				artifact: CLEAN,
				connection: target,
				configuredDatabase: TARGET,
				pgRestoreBin: pgRestoreBin as string,
				reconcile: seam.run,
				journalDir: JOURNAL_DIR,
				stamp,
				dropPrevious: true,
			});
			expect(report.previous).toBeNull();
			expect(report.previous_dropped).toBe(true);
			// Only the target and leg 4's kept copy remain — no `_restoring_`, no new `_pre_restore_`.
			expect(await databasesLike(TARGET)).toEqual([TARGET, restored.previous as string].sort());
			expect(await databasesLike(names.previous)).toEqual([]);
			expect(seam.calls.length).toBe(1);
		},
		RESTORE_TIMEOUT_MS,
	);

	test(
		'6. a swap failure drops the sidecar, leaves the target as it was, names the failure',
		async () => {
			const seam = recorder();
			const stamp = nextStamp();
			const names = restoreDatabaseNames(TARGET, stamp);
			// The parked name already exists, so the first RENAME fails for real.
			const taken = await runPsql(admin, ['-c', `CREATE DATABASE "${names.previous}"`]);
			expect(taken.stderr).toBe('');
			const before = await fingerprint(TARGET);
			const clusterBefore = await databasesLike(TARGET);
			try {
				const error = await refusal(
					runRestoreDoor({
						artifact: CLEAN,
						connection: target,
						configuredDatabase: TARGET,
						pgRestoreBin: pgRestoreBin as string,
						reconcile: seam.run,
						journalDir: JOURNAL_DIR,
						stamp,
					}),
				);
				expect(error.code).toBe('recovery.restore_failed');
				expect(error.coordinates?.phase).toBe('swap');
				expect(error.message).toContain('sidecar dropped, target untouched');
				expect(error.message).toContain(names.previous);
				// No `_restoring_` database survives; the target is what it was.
				expect(await databasesLike(TARGET)).toEqual(clusterBefore);
				expect(await fingerprint(TARGET)).toBe(before);
				expect(seam.calls).toEqual([]);
				expect(existsSync(join(JOURNAL_DIR, `${stamp}.json`))).toBe(false);
			} finally {
				await runPsql(admin, ['-c', `DROP DATABASE IF EXISTS "${names.previous}" WITH (FORCE)`]);
			}
		},
		RESTORE_TIMEOUT_MS,
	);

	test(
		'7. restore mode runs the DEFAULT plan (no seam): every plan step, through the registry, after the door started',
		async () => {
			const stamp = nextStamp();
			const startedAt = Date.now();
			const report = await runRestoreDoor({
				artifact: CLEAN,
				connection: target,
				configuredDatabase: TARGET,
				pgRestoreBin: pgRestoreBin as string,
				journalDir: JOURNAL_DIR,
				stamp,
				dropPrevious: true,
			});
			expect(report.mode).toBe('restore');
			expect(report.reconcile).not.toBeNull();
			const reconcile = report.reconcile as PostRestoreReport;
			// Name for name, flag for flag: the plan, not a subset of it.
			expect(reconcile.steps.map((s) => s.name)).toEqual(POST_RESTORE_PLAN.map((s) => s.name));
			expect(reconcile.steps.map((s) => s.apply)).toEqual(POST_RESTORE_PLAN.map((s) => s.apply));
			for (const step of reconcile.steps) {
				// A registry report, or the thrown step's code — never neither, never both.
				expect((step.report === null) !== (step.error === null)).toBe(true);
				if (step.report !== null) expect(Number.isFinite(step.report.drift)).toBe(true);
			}
			// The registry remembers each run — and each ran after the door started.
			for (const step of POST_RESTORE_PLAN) {
				const record = lastReconcileRun(step.name);
				expect(record, `${step.name} never ran through the registry`).not.toBeNull();
				expect(Date.parse((record as { ranAt: string }).ranAt)).toBeGreaterThanOrEqual(
					startedAt - 1000,
				);
				expect((record as { apply: boolean }).apply).toBe(step.apply);
			}
			expect(reconcile.held).toEqual(
				reconcile.steps
					.filter((s) => !s.apply && s.report !== null && s.report.drift > 0)
					.map((s) => s.name),
			);
			const journal = JSON.parse(readFileSync(join(JOURNAL_DIR, `${stamp}.json`), 'utf8'));
			expect(journal.reconcile.steps.map((s: { name: string }) => s.name)).toEqual(
				POST_RESTORE_PLAN.map((s) => s.name),
			);
		},
		RESTORE_TIMEOUT_MS,
	);

	test(
		'8. a REHEARSAL (target != configured database) restores the rows, runs NO plan, stamps NO maintenance mode',
		async () => {
			setServerState({ maintenance_mode: false });
			const seam = recorder();
			const stamp = nextStamp();
			const recordsBefore = registryRecords();
			const suiteOntologyRows = await scalar(
				config.db.database,
				'SELECT count(*) FROM dd_ontology',
			);
			// No `configuredDatabase`: the door compares against the real config,
			// which is the suite database, so this IS the CLI's `--database other`.
			const report = await runRestoreDoor({
				artifact: CLEAN,
				connection: target,
				pgRestoreBin: pgRestoreBin as string,
				reconcile: seam.run,
				journalDir: JOURNAL_DIR,
				stamp,
				dropPrevious: true,
			});
			expect(report.mode).toBe('rehearsal');
			expect(report.configured_database).toBe(config.db.database);
			// Restored for real...
			expect(await scalar(TARGET, 'SELECT count(*) FROM dd_ontology')).toBe(suiteOntologyRows);
			expect(report.previous_dropped).toBe(true);
			// ...but nothing that belongs to the configured database happened.
			expect(report.reconcile).toBeNull();
			expect(seam.calls).toEqual([]);
			expect(registryRecords()).toBe(recordsBefore);
			expect(report.maintenance_mode_stamped).toBe(false);
			expect(getServerState().maintenance_mode).toBe(false);
			const journal = JSON.parse(readFileSync(join(JOURNAL_DIR, `${stamp}.json`), 'utf8'));
			expect(journal.mode).toBe('rehearsal');
			expect(journal.reconcile).toBeNull();
		},
		RESTORE_TIMEOUT_MS,
	);

	test(
		'10. runPostRestore records a thrown step by its code and runs the rest; held = dry steps with drift',
		async () => {
			const unknown = {
				name: 'zz_restore_door_unregistered',
				apply: false,
				why: 'a name the registry does not know: its own resource.not_found is the real throw this leg needs',
			};
			const report = await runPostRestore({ plan: [unknown, ...POST_RESTORE_PLAN] });
			expect(report.steps.length).toBe(POST_RESTORE_PLAN.length + 1);
			expect(report.steps[0]?.name).toBe(unknown.name);
			expect(report.steps[0]?.error).toBe('resource.not_found');
			expect(report.steps[0]?.report).toBeNull();
			expect(report.failed).toContain(unknown.name);
			// Every later step still ran: a report or a code, in plan order.
			expect(report.steps.slice(1).map((s) => s.name)).toEqual(
				POST_RESTORE_PLAN.map((s) => s.name),
			);
			for (const step of report.steps.slice(1)) {
				expect((step.report === null) !== (step.error === null)).toBe(true);
			}
			expect(report.held).toEqual(
				report.steps
					.filter((s) => !s.apply && s.report !== null && s.report.drift > 0)
					.map((s) => s.name),
			);
			expect(report.failed).toEqual(
				report.steps.filter((s) => s.error !== null).map((s) => s.name),
			);
		},
		RESTORE_TIMEOUT_MS,
	);
});

describe('the post-restore plan is total over the registry', () => {
	test('9. every REGISTERED_NAMES entry has exactly one plan step with a reason; apply = {counters_media, media_index}', () => {
		expect(REGISTERED_NAMES.length).toBeGreaterThanOrEqual(7);
		expect(POST_RESTORE_PLAN.map((s) => s.name)).toEqual([...REGISTERED_NAMES]);
		for (const step of POST_RESTORE_PLAN) {
			expect(step.why.length, `${step.name} needs a substantive reason`).toBeGreaterThan(60);
		}
		expect(POST_RESTORE_PLAN.filter((s) => s.apply).map((s) => s.name)).toEqual([
			'counters_media',
			'media_index',
		]);
	});

	test('the door refuses a database name it cannot interpolate safely, before anything', () => {
		expect(() => restoreDatabaseNames('dedalo; DROP DATABASE x', '20260903_000000')).toThrow(
			DedaloError,
		);
		expect(() => restoreDatabaseNames('a'.repeat(60), '20260903_000000')).toThrow(DedaloError);
		expect(restoreDatabaseNames('dedalo', '20260903_000000')).toEqual({
			target: 'dedalo',
			sidecar: 'dedalo_restoring_20260903_000000',
			previous: 'dedalo_pre_restore_20260903_000000',
		});
	});
});

describe('the CLI (`bun run dedalo:restore`) refuses a malformed invocation before it opens anything', () => {
	// The argument grammar is the only part of the script reachable without a
	// cluster: `usage()` exits before connFromConfig() is read and before the
	// door is entered — so a wrong invocation can never reach pg_restore.
	const CLI = join(import.meta.dir, '../../scripts/restore.ts');
	const run = (args: string[]) => {
		const child = Bun.spawnSync(['bun', CLI, ...args], {
			cwd: join(import.meta.dir, '..', '..'),
			stdout: 'pipe',
			stderr: 'pipe',
		});
		return { status: child.exitCode, stderr: child.stderr.toString() };
	};

	test('no artifact: exit 1 with the usage line, no restore attempted', () => {
		const { status, stderr } = run([]);
		expect(status).toBe(1);
		expect(stderr).toContain('usage: bun scripts/restore.ts <artifact>');
		expect(stderr).toContain('exactly one artifact path is required');
	});

	test('a value flag without its value, and an unknown flag, are refused by name', () => {
		const missing = run(['--database']);
		expect(missing.status).toBe(1);
		expect(missing.stderr).toContain('--database needs a value');
		const unknown = run(['--force', '/nonexistent.backup']);
		expect(unknown.status).toBe(1);
		expect(unknown.stderr).toContain('unknown flag --force');
	});
});
