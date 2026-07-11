/**
 * Database backup (PHP core/backup/class.backup.php init_backup_sequence +
 * get_backup_files, behind the make_backup maintenance widget) — TS-NATIVE by
 * design: the TS server dumps the SHARED database with its own pg_dump into
 * its OWN backup directory (v7_ts/private/backups/db), never the PHP
 * install's DEDALO_BACKUP_PATH. File naming and the custom-format dump
 * command mirror PHP:
 *
 *   <Y-m-d_His>.<db>.postgresql_<user>_forced_dbv<maj-min-patch>.custom.backup
 *   pg_dump -F c -b <db>  (spawned detached; nice'd like PHP's nohup wrapper)
 *
 * The throttled (non-forced) window naming (<Y-m-d_H>… + the 8h
 * DEDALO_BACKUP_TIME_RANGE guard) applies when skipTimeRange is false.
 */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { config } from '../../config/config.ts';
import { privateDir } from '../../config/env.ts';
import { sql } from '../db/postgres.ts';
import { type JobRecord, jobFilePath } from '../media/jobs.ts';

/** Minimum hours between throttled backups (PHP DEDALO_BACKUP_TIME_RANGE). */
const BACKUP_TIME_RANGE_HOURS = config.ops.backupTimeRangeHours;

/**
 * The TS server's own backup directory: DEDALO_BACKUP_DIR override, else
 * <privateDir>/backups/db — derived from the SAME privateDir constant the
 * session store and .env use, never from the process cwd (audit S2-35: the
 * old cwd-based guess silently changed with the launch directory).
 */
export function getBackupDir(): string {
	const declared = config.ops.backupDir;
	if (typeof declared === 'string' && declared !== '') return declared;
	return join(privateDir, 'backups', 'db');
}

/** Current data version from matrix_updates (PHP get_current_data_version). */
export async function getCurrentDataVersion(): Promise<number[]> {
	try {
		const rows = (await sql.unsafe(
			`SELECT data FROM "matrix_updates"
			 ORDER BY string_to_array(data->>'dedalo_version', '.')::int[] DESC LIMIT 1`,
			[],
		)) as { data: { dedalo_version?: string } | null }[];
		const version = rows[0]?.data?.dedalo_version;
		if (typeof version === 'string') {
			return version.split('.').map((part) => Number(part));
		}
	} catch {
		// fresh installs without matrix_updates report [] (PHP behavior)
	}
	return [];
}

function timestampName(now: Date, forced: boolean): string {
	const pad = (value: number) => String(value).padStart(2, '0');
	const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
	return forced
		? `${date}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
		: `${date}_${pad(now.getHours())}`;
}

export interface BackupResponse {
	result: boolean;
	msg: string;
	errors: string[];
	pid?: number | null;
	file_path?: string;
	/** Process-record basename inside ../private/processes — the handle the
	 * copied make_backup widget polls via dd_utils_api:get_process_status. */
	pfile?: string;
}

/** Test-injection seams (production callers pass nothing). */
export interface BackupOverrides {
	backupDir?: string;
	pgDumpBin?: string;
	/** ms to wait for a FAST failure before reporting the background pid. */
	fastFailWindowMs?: number;
}

/** The last N lines of the sidecar .log, for surfacing pg_dump's own words. */
function logTail(logPath: string, lines = 5): string {
	try {
		return readFileSync(logPath, 'utf-8').trim().split('\n').slice(-lines).join('\n');
	} catch {
		return '';
	}
}

/**
 * Newest `*.backup` mtimeMs in the backup dir (0 = none). The recency
 * primitive behind the throttle window below and the update-preconditions
 * "recent backup exists" warning (core/update/preconditions.ts).
 */
export function newestBackupMtimeMs(backupDir: string = getBackupDir()): number {
	let newest = 0;
	let names: string[];
	try {
		names = readdirSync(backupDir);
	} catch {
		return 0; // dir absent/unreadable = no backups
	}
	for (const name of names) {
		if (!name.endsWith('.backup')) continue;
		const mtime = statSync(join(backupDir, name)).mtimeMs;
		if (mtime > newest) newest = mtime;
	}
	return newest;
}

/**
 * PHP init_backup_sequence: throttle window (unless forced), then spawn a
 * DETACHED custom-format pg_dump of the configured database into the backup
 * dir. Returns with the pid; the dump continues in background.
 *
 * Audit S2-35 hardening:
 * - PGPASSWORD is threaded from config.db.password (password-auth Postgres —
 *   exactly what production uses — previously failed with fe_sendauth into a
 *   .log nobody surfaced, while the widget reported success);
 * - a short fast-fail window catches immediate exits (auth/connection errors)
 *   and reports them as FAILURE with the .log tail in the widget message;
 * - the detached completion check verifies a NON-EMPTY artifact, logs the .log
 *   tail on failure, and deletes the empty artifact so get_backup_files never
 *   lists a zero-byte "backup" as restorable.
 */
export async function initBackupSequence(
	userId: number,
	skipTimeRange = true,
	overrides: BackupOverrides = {},
): Promise<BackupResponse> {
	const response: BackupResponse = {
		result: false,
		msg: 'Error. Request failed initBackupSequence',
		errors: [],
	};
	const backupDir = overrides.backupDir ?? getBackupDir();
	try {
		mkdirSync(backupDir, { recursive: true, mode: 0o700 });
	} catch (error) {
		response.errors.push(`unable to create backups folder: ${(error as Error).message}`);
		return response;
	}

	// throttle window (PHP: newest *.backup mtime within the range → skip)
	if (!skipTimeRange) {
		const newest = newestBackupMtimeMs(backupDir);
		const hours = Math.round(Date.now() / 3600000 - Math.round(newest / 1000) / 3600);
		if (newest > 0 && hours < BACKUP_TIME_RANGE_HOURS) {
			response.result = true;
			response.msg = ` Skipped backup. A recent backup (about ${hours} hours early) already exists. It is not necessary to build another one`;
			return response;
		}
	}

	const db = config.db as { database?: string; host?: string; port?: number; user?: string };
	const databaseName = String(db.database ?? 'dedalo');
	const version = await getCurrentDataVersion();
	const fileName = `${timestampName(new Date(), skipTimeRange)}.${databaseName}.postgresql_${userId}${
		skipTimeRange ? '_forced' : ''
	}_dbv${version.join('-')}.custom.backup`;
	const filePath = join(backupDir, fileName);
	if (existsSync(filePath)) {
		response.result = true;
		response.msg = ` Skipped backup. A recent backup already exists ('${filePath}'). It is not necessary to build another one`;
		return response;
	}

	// detached pg_dump (custom format with blobs — PHP: pg_dump … -F c -b);
	// stderr streams to a sibling .log (PHP writes it to the process file)
	const args = ['-F', 'c', '-b', '-f', filePath];
	if (db.host) args.push('-h', String(db.host));
	if (db.port) args.push('-p', String(db.port));
	if (db.user) args.push('-U', String(db.user));
	args.push(databaseName);
	const logPath = `${filePath}.log`;
	// Process record (S2-15/DEC-22a): the same pfile registry the media jobs
	// use — the copied make_backup widget streams it live through
	// dd_utils_api:get_process_status (core/api/process_status.ts). owner_pid
	// is the pg_dump CHILD: while it runs the record is provably live; if the
	// SERVER dies mid-dump, the lazy reconcile flips it to 'interrupted' once
	// the child is gone, so the widget never spins on a dead backup.
	const processId = `backup_${process.pid}_${Date.now()}`;
	const pfileName = `${processId}.json`;
	const writeProcessRecord = (
		childPid: number,
		status: JobRecord['status'],
		msg: string,
		errors: string[],
		startedAt: number,
	): void => {
		try {
			const record: JobRecord = {
				id: processId,
				kind: 'backup',
				pid: childPid,
				owner_pid: childPid,
				status,
				progress: status === 'done' ? 100 : null,
				data: { msg, file_path: filePath },
				errors,
				startedAt,
				updatedAt: Date.now(),
			};
			writeFileSync(jobFilePath(processId), JSON.stringify(record));
		} catch {
			/* the pfile is a best-effort progress mirror; the response is authoritative */
		}
	};
	try {
		const logFile = Bun.file(logPath);
		const child = Bun.spawn([overrides.pgDumpBin ?? resolvePgDump(), ...args], {
			stdout: 'ignore',
			stderr: logFile,
			env: {
				...(process.env as Record<string, string>),
				// Password auth (S2-35): pg_dump has no config file here; without
				// this it fails fe_sendauth on every password-auth install.
				...(config.db.password !== '' ? { PGPASSWORD: config.db.password } : {}),
			},
		});
		const startedAt = Date.now();
		writeProcessRecord(child.pid, 'running', `Backup running: ${fileName}`, [], startedAt);
		// Fast-fail window: an auth/connection error exits within milliseconds —
		// report THAT as failure with pg_dump's own words instead of "running".
		const fastExit = await Promise.race([
			child.exited,
			Bun.sleep(overrides.fastFailWindowMs ?? 1500).then(() => null),
		]);
		if (fastExit !== null && (fastExit !== 0 || !artifactIsUsable(filePath))) {
			const tail = logTail(logPath);
			if (existsSync(filePath) && statSync(filePath).size === 0) unlinkSync(filePath);
			response.errors.push(`pg_dump exited ${fastExit}`);
			response.msg = `Error. Backup failed (pg_dump exited ${fastExit}). ${tail}`;
			console.error(`[backup] pg_dump failed (exit ${fastExit}): ${tail}`);
			writeProcessRecord(
				child.pid,
				'error',
				`Error. Backup failed (pg_dump exited ${fastExit})`,
				tail !== '' ? [tail] : [`pg_dump exited ${fastExit}`],
				startedAt,
			);
			return response;
		}
		if (fastExit === null) {
			// Still running: verify the artifact when it finishes (detached — the
			// widget already answered). A silent empty "backup" is the data-loss
			// discovered-at-restore-time failure mode this exists to prevent.
			child.exited
				.then((exitCode) => {
					if (exitCode !== 0 || !artifactIsUsable(filePath)) {
						const tail = logTail(logPath);
						if (existsSync(filePath) && statSync(filePath).size === 0) unlinkSync(filePath);
						console.error(
							`[backup] pg_dump for '${fileName}' FAILED (exit ${exitCode}): ${tail || `see ${logPath}`}`,
						);
						writeProcessRecord(
							child.pid,
							'error',
							`Error. Backup failed (pg_dump exited ${exitCode})`,
							tail !== '' ? [tail] : [`pg_dump exited ${exitCode}`],
							startedAt,
						);
					} else {
						const size = statSync(filePath).size;
						console.log(`[backup] completed: ${fileName} (${size} bytes)`);
						writeProcessRecord(
							child.pid,
							'done',
							`OK. Backup done: ${fileName} (${size} bytes)`,
							[],
							startedAt,
						);
					}
				})
				.catch((error) => console.error('[backup] completion check failed:', error));
			child.unref();
		} else {
			// Fast SUCCESS (tiny DB / test dump): the artifact is already verified.
			writeProcessRecord(child.pid, 'done', `OK. Backup done: ${fileName}`, [], startedAt);
		}
		response.result = true;
		response.pid = child.pid;
		response.file_path = filePath;
		response.pfile = pfileName;
		response.msg = `OK. backup process running for db: ${fileName}`;
	} catch (error) {
		response.errors.push((error as Error).message);
		response.msg = `Exception: Error on backup_sequence: ${(error as Error).message}`;
	}
	return response;
}

/** A restorable artifact exists and is non-empty. */
function artifactIsUsable(filePath: string): boolean {
	return existsSync(filePath) && statSync(filePath).size > 0;
}

/**
 * The pg_dump binary matching the SERVER version (PHP system::get_pg_bin_path
 * — explicit config first, then platform locations). A client older than the
 * server refuses to dump, so version-suffixed Homebrew installs are probed
 * newest-first before falling back to PATH.
 */
export function resolvePgDump(): string {
	const declared = config.ops.pgBinPath;
	if (typeof declared === 'string' && declared !== '') {
		const candidate = join(declared, 'pg_dump');
		if (existsSync(candidate)) return candidate;
	}
	for (const version of [18, 17, 16, 15]) {
		const candidate = `/opt/homebrew/opt/postgresql@${version}/bin/pg_dump`;
		if (existsSync(candidate)) return candidate;
	}
	return 'pg_dump';
}

/** PHP backup::get_backup_files: newest-first {name, size} of *.backup files. */
export function getBackupFiles(): { name: string; size: string }[] {
	const backupDir = getBackupDir();
	if (!existsSync(backupDir)) return [];
	const formatSize = (bytes: number): string => {
		// PHP format_size_units
		if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
		if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
		if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
		if (bytes > 1) return `${bytes} bytes`;
		if (bytes === 1) return '1 byte';
		return '0 bytes';
	};
	return readdirSync(backupDir)
		.sort()
		.reverse()
		.filter((name) => name.endsWith('.backup'))
		.map((name) => ({
			name,
			size: formatSize(statSync(join(backupDir, name)).size),
		}));
}
