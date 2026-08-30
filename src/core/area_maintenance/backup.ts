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
 *
 * FRESHNESS IS NOT USABILITY (audit P0-13, 2026-08-30). Until that date the
 * only thing this module asked of a finished dump was `existsSync && size > 0`,
 * so a pg_dump killed at 60% left an artifact that the widget listed, that
 * `newestBackupMtimeMs` counted, and that satisfied the code-update
 * precondition — the operator swapped the whole code tree believing they had a
 * restore point. The restore-point verdict now lives in
 * `verifyBackupArtifact` / `newestUsableBackup` at the foot of this file, and
 * `newestBackupMtimeMs` keeps its honest, narrow meaning: RECENCY only.
 */

import {
	closeSync,
	existsSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	readSync,
	renameSync,
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
		// (!) `WHERE data ? 'dedalo_version'`: matrix_updates also carries NON-version
		// rows (the section_id_int_normalize marker, WC-2026-08-10-section-id-int-canonical) — without the guard their NULL version sorts FIRST under DESC
		// (Postgres NULLS FIRST default) and version detection silently breaks.
		const rows = (await sql.unsafe(
			`SELECT data FROM "matrix_updates"
			 WHERE data ? 'dedalo_version'
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
	/** Did the sequence start (or legitimately skip)? An INTERNAL outcome — never a wire body. */
	ok: boolean;
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
	/** pg_restore used to VERIFY the finished artifact (P0-13). `null` = the
	 * machine has none, which degrades to "unverifiable", never to a lie. */
	pgRestoreBin?: string | null;
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
 * Newest `*.backup` mtimeMs in the backup dir (0 = none) — RECENCY ONLY.
 *
 * FRESHNESS IS NOT USABILITY: this answers "when was something last written
 * here", never "is there a restore point". A dump that died at 60%, and a dump
 * that is being written RIGHT NOW, both have the freshest mtime of all. Every
 * caller that must know whether a RESTORE POINT exists — the throttle below and
 * core/update/preconditions.ts — asks `newestUsableBackup` instead (P0-13).
 * Kept exported and unchanged because it is also the honest answer to the
 * narrow question, and test/unit/backup_recency_native.test.ts pins it.
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
		// PER-ENTRY guard. An unstatable entry — a dangling symlink to backup
		// storage that has been moved or unmounted, or a rotation cron deleting
		// between readdir and stat — used to throw ENOENT out of the WHOLE scan.
		// That throw escapes into the code-update path (checkUpdatePreconditions
		// runs before the pipeline's try), where it surfaces as
		// `internal.unexpected` with no phase track, and it degrades the panel's
		// `backup_fresh` check to `unknown` — which is excluded from `ready`, so
		// the panel says "ready to update" precisely because it failed to look.
		let mtime: number;
		try {
			mtime = statSync(join(backupDir, name)).mtimeMs;
		} catch {
			continue;
		}
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
 * - the detached completion check verifies the artifact, logs the .log tail on
 *   failure, and RETIRES a failed artifact so get_backup_files never lists it
 *   as restorable.
 *
 * P0-13 (2026-08-30): "non-empty" is not a verification. The completion check
 * now demands pg_dump's own exit 0 — the ONLY proof the dump ran to completion —
 * AND a DEEP `pg_restore` read of the archive, and records that verdict in a
 * `<artifact>.verified` sidecar so no later reader has to re-derive it. An
 * artifact that fails is renamed `*.failed` (never left as a corpse that looks
 * like a backup) and, when empty, deleted.
 */
export async function initBackupSequence(
	userId: number,
	skipTimeRange = true,
	overrides: BackupOverrides = {},
): Promise<BackupResponse> {
	const response: BackupResponse = {
		ok: false,
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

	// Throttle window (PHP: newest *.backup mtime within the range → skip).
	// USABLE, not merely present (P0-13): skipping the nightly dump because a
	// truncated corpse is 3 hours old is how an install ends up with no restore
	// point at all. The check is the cheap TOC read (~30 ms on a 400 MB archive,
	// measured 2026-08-30), and it can only ever decide to dump MORE often.
	if (!skipTimeRange) {
		const newest = newestUsableBackup(backupDir).mtimeMs;
		const hours = Math.round(Date.now() / 3600000 - Math.round(newest / 1000) / 3600);
		if (newest > 0 && hours < BACKUP_TIME_RANGE_HOURS) {
			response.ok = true;
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
		// Name collision (same second, forced). Skipping is only honest if what
		// is already there IS a backup (P0-13). A DISPROVED artifact is retired
		// and the dump proceeds; anything else — including a dump another
		// process may still be WRITING to this very path — is left untouched and
		// skipped, because clobbering a live dump would destroy the restore point
		// this function exists to create.
		const existing = verifyBackupArtifact(filePath, { pgRestoreBin: overrides.pgRestoreBin });
		if (!artifactDisproved(existing)) {
			response.ok = true;
			response.msg = ` Skipped backup. A recent backup already exists ('${filePath}'). It is not necessary to build another one`;
			return response;
		}
		retireFailedArtifact(filePath);
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
		const completion =
			fastExit === null ? null : dumpCompletionVerdict(filePath, fastExit, overrides);
		if (completion !== null && !completion.ok) {
			const tail = logTail(logPath);
			retireFailedArtifact(filePath);
			response.errors.push(completion.reason);
			response.msg = `Error. Backup failed (${completion.reason}). ${tail}`;
			console.error(`[backup] pg_dump failed (${completion.reason}): ${tail}`);
			writeProcessRecord(
				child.pid,
				'error',
				`Error. Backup failed (${completion.reason})`,
				tail !== '' ? [tail] : [completion.reason],
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
					const verdict = dumpCompletionVerdict(filePath, exitCode, overrides);
					if (!verdict.ok) {
						const tail = logTail(logPath);
						retireFailedArtifact(filePath);
						console.error(
							`[backup] pg_dump for '${fileName}' FAILED (${verdict.reason}): ${tail || `see ${logPath}`}`,
						);
						writeProcessRecord(
							child.pid,
							'error',
							`Error. Backup failed (${verdict.reason})`,
							tail !== '' ? [tail] : [verdict.reason],
							startedAt,
						);
					} else {
						const size = statSync(filePath).size;
						console.log(`[backup] completed: ${fileName} (${size} bytes, ${verdict.reason})`);
						writeProcessRecord(
							child.pid,
							'done',
							`OK. Backup done: ${fileName} (${size} bytes, ${verdict.reason})`,
							[],
							startedAt,
						);
					}
				})
				.catch((error) => console.error('[backup] completion check failed:', error));
			child.unref();
		} else {
			// Fast SUCCESS (tiny DB / test dump): the artifact is already verified
			// — `completion` above ran the same deep check the detached path runs.
			writeProcessRecord(
				child.pid,
				'done',
				`OK. Backup done: ${fileName} (${completion?.reason ?? 'verified'})`,
				[],
				startedAt,
			);
		}
		response.ok = true;
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

/**
 * The pg_dump binary matching the SERVER version (PHP system::get_pg_bin_path
 * — explicit config first, then platform locations). A client older than the
 * server refuses to dump, so version-suffixed Homebrew installs are probed
 * newest-first before falling back to PATH.
 */
export function resolvePgDump(): string {
	const candidates = pgDumpCandidates(config.ops.pgBinPath);
	// The last entry is the bare-PATH fallback: it is RETURNED without an
	// existsSync probe (PATH resolution is the shell's job), so only the
	// preceding absolute paths are probed.
	const fallback = candidates[candidates.length - 1] ?? 'pg_dump';
	for (const candidate of candidates.slice(0, -1)) {
		if (existsSync(candidate)) return candidate;
	}
	return fallback;
}

/**
 * The pg_dump binaries `resolvePgDump` probes, IN ORDER — pure, so the order
 * itself is gateable without touching the filesystem.
 *
 * The order is load-bearing and NEWEST-FIRST: a pg_dump older than the server
 * refuses to dump, so a machine carrying both pg15 and pg19 must not pick
 * pg15 — that backup fails silently into a `.log` nobody reads (audit S2-35).
 * A newly released major belongs at the FRONT of the version list, never the
 * end. The explicitly configured directory always wins, and the bare
 * `pg_dump` (PATH) is always last.
 */
export function pgDumpCandidates(declaredDir: unknown): string[] {
	return pgBinCandidates(declaredDir, 'pg_dump');
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

/* ------------------------------------------------------------------------- *
 * RESTORE-POINT VERIFICATION (audit P0-13, 2026-08-30)
 *
 * THE DEFECT THIS SECTION EXISTS TO PREVENT: the old `artifactIsUsable` was
 * `existsSync(file) && size > 0`. A pg_dump killed at 60% leaves a large,
 * non-empty, PERFECTLY FRESH file — it passed, the widget listed it, the
 * update panel counted it, and the code-update precondition told the operator
 * they had a restore point before they replaced the whole code tree.
 *
 * WHAT EACH CHECK ACTUALLY PROVES (measured 2026-08-30 on this machine, against
 * the 400 MB `2026-07-11_102750….custom.backup` artifact, pg_restore 17):
 *
 *   pg_restore --list        0.03 s. Reads header + TOC only (the archive is
 *                            seekable), so it catches a NON-archive, a garbage
 *                            or error-text file, and a death early enough to
 *                            cut the header/TOC (a 2 KB prefix fails with
 *                            "could not read from input file: end of file").
 *                            It does NOT catch data truncation: the same
 *                            archive cut to 60% (240 MB) STILL listed all 1121
 *                            entries and exited 0. Never call this "verified".
 *   pg_restore -f /dev/null  2.97 s on the whole 400 MB archive (~7.4 s/GB,
 *                            no server connection — it emits SQL to the file).
 *                            Reads and decompresses EVERY data block, so the
 *                            60% copy fails in 1.7 s with the same EOF error.
 *                            This is the only read that disproves truncation.
 *   pg_dump's own exit 0     The only proof the dump ran to COMPLETION; nothing
 *                            read back from the file can substitute for it,
 *                            which is why our own dumps record it in a sidecar.
 *
 * COST DISCIPLINE: the deep read is paid ONCE per artifact and cached in a
 * `<artifact>.verified` sidecar keyed on (size, mtime), so the panel — which a
 * human is waiting on and which polls — pays a stat plus a small JSON read on
 * every call after the first. Our own dumps never make anyone wait at all:
 * their sidecar is written the moment pg_dump exits. MEASURED 2026-08-30 on
 * this machine: update_status_native.test.ts, whose panel probes read the real
 * 400 MB archive, ran in ~4.0 s cold and ~1.0 s once the sidecar existed.
 * Both the panel and the code-update refusal ask the SAME (deep) question —
 * core/update/preconditions.ts exists precisely so those two never differ, and
 * a cheaper verdict for the panel would rebuild that disagreement.
 *
 * DEGRADATION IS NEVER A REFUSAL: when we CANNOT judge an artifact (no
 * pg_restore on the host, a foreign non-custom-format dump, a verification that
 * outran its budget) the verdict is `usable: true, verified: false`. A guard
 * that refuses a legitimate update because it could not look is an outage, and
 * this module refuses only what it has actually DISPROVED.
 * ------------------------------------------------------------------------- */

/**
 * How recent an UNVERIFIED artifact may be before we assume a dump is still
 * WRITING it. A dump in progress has the freshest mtime in the directory and
 * (measured above) its partial file can still list a full TOC, so recency is
 * exactly the wrong signal — this inverts it. Our own dumps are unaffected:
 * `dumpCompletionVerdict` writes their sidecar the moment pg_dump exits, so
 * they count immediately. Only a FOREIGN dump (the deploy/ systemd timer) waits
 * out this window before it counts as a restore point.
 */
const IN_PROGRESS_WINDOW_MS = 90_000;

/** Wall clock one verification may spend before we degrade to "unverifiable". */
const VERIFY_TIMEOUT_MS = 120_000;

/**
 * How many artifacts a scan verifies before giving up on the directory. If the
 * ten newest dumps are all corpses the eleventh will not rescue the operator,
 * and verifying a hundred of them only delays the answer.
 */
const MAX_VERIFY_CANDIDATES = 10;

/** First bytes of a pg_dump custom-format archive (`pg_backup_custom.c`). */
const CUSTOM_ARCHIVE_MAGIC = 'PGDMP';

/**
 * Why an artifact does or does not count as a restore point. Decisive reasons
 * (`verified_*`, `not_an_archive`, `truncated`) are cached in the sidecar;
 * situational ones (`in_progress`) and degraded ones (`unverifiable_*`) are not,
 * because they describe THIS MOMENT or THIS HOST, not the file.
 */
export type BackupVerdictReason =
	| 'verified_deep'
	| 'verified_toc'
	| 'missing'
	| 'empty'
	| 'in_progress'
	| 'not_an_archive'
	| 'truncated'
	| 'unverifiable_no_pg_restore'
	| 'unverifiable_foreign_format'
	| 'unverifiable_timeout';

export interface BackupVerdict {
	filePath: string;
	size: number;
	mtimeMs: number;
	/** May this count as a restore point? (Refused only when DISPROVED.) */
	usable: boolean;
	/** Was it PROVEN restorable? `verified_toc` is usable but NOT proven. */
	verified: boolean;
	reason: BackupVerdictReason;
	/** pg_restore's own words, when it had any. */
	detail?: string;
}

/** The cached verdict lives beside the artifact; the name must not end `.backup`. */
function verificationSidecarPath(filePath: string): string {
	return `${filePath}.verified`;
}

interface SidecarRecord {
	size: number;
	mtimeMs: number;
	reason: BackupVerdictReason;
	verifiedAt: number;
	detail?: string;
}

/**
 * A cached verdict, or null when there is none, it is stale, or it is weaker
 * than what the caller asked for. Keyed on (size, mtime): any rewrite of the
 * artifact invalidates it, so a stale sidecar can never vouch for a new file.
 */
/**
 * A recorded verdict that counts the artifact as a restore point. Named because the
 * two spellings mean different strengths — `verified_deep` PROVED the archive reads
 * end to end, `verified_toc` only proved it has a header and a table of contents —
 * and `readVerdictSidecar` refuses a TOC verdict when a deep answer was asked for.
 */
function verdictIsUsableReason(reason: SidecarRecord['reason']): boolean {
	return reason === 'verified_deep' || reason === 'verified_toc';
}

function readVerdictSidecar(
	filePath: string,
	size: number,
	mtimeMs: number,
	deep: boolean,
): BackupVerdict | null {
	let record: SidecarRecord;
	try {
		record = JSON.parse(readFileSync(verificationSidecarPath(filePath), 'utf-8')) as SidecarRecord;
	} catch {
		return null;
	}
	if (record.size !== size || record.mtimeMs !== mtimeMs) return null;
	// A cheap TOC pass does not answer a deep question (it cannot see
	// truncation), so a deep caller re-verifies. The reverse is fine.
	if (deep && record.reason === 'verified_toc') return null;
	const usable = verdictIsUsableReason(record.reason);
	return {
		filePath,
		size,
		mtimeMs,
		usable,
		verified: record.reason === 'verified_deep',
		reason: record.reason,
		detail: record.detail,
	};
}

/** Best-effort cache write: a read-only backup dir loses the cache, never the verdict. */
/**
 * Was this artifact DISPROVED as a restore point — as opposed to merely unproven?
 *
 * The distinction decides whether today's dump is skipped. An artifact we could not
 * judge (no pg_restore on the host, a foreign format, a verification that timed out)
 * is NOT a reason to overwrite what may be the only restore point there is; only a
 * verdict that actually caught it — empty, not an archive, truncated — is.
 */
function artifactDisproved(verdict: BackupVerdict): boolean {
	return (
		verdict.reason === 'empty' ||
		verdict.reason === 'not_an_archive' ||
		verdict.reason === 'truncated'
	);
}

function writeVerdictSidecar(verdict: BackupVerdict): void {
	const record: SidecarRecord = {
		size: verdict.size,
		mtimeMs: verdict.mtimeMs,
		reason: verdict.reason,
		verifiedAt: Date.now(),
		detail: verdict.detail,
	};
	try {
		writeFileSync(verificationSidecarPath(verdict.filePath), JSON.stringify(record));
	} catch {
		/* the sidecar is a cache; every reader can re-derive the verdict */
	}
}

/**
 * The pg binaries a resolver probes, IN ORDER — pure, so the order itself is
 * gateable without touching the filesystem. Shared by pg_dump and pg_restore so
 * a host with a version-suffixed install resolves BOTH the same way: a
 * pg_restore older than the archive's format version refuses to read it, and
 * that refusal would otherwise be indistinguishable from a broken backup.
 */
export function pgBinCandidates(declaredDir: unknown, binName: string): string[] {
	const candidates: string[] = [];
	if (typeof declaredDir === 'string' && declaredDir !== '') {
		candidates.push(join(declaredDir, binName));
	}
	for (const version of [18, 17, 16, 15]) {
		candidates.push(`/opt/homebrew/opt/postgresql@${version}/bin/${binName}`);
	}
	candidates.push(binName);
	return candidates;
}

/**
 * The pg_restore that verifies an artifact, or null when this host has none.
 * Null is a first-class answer: it degrades every verdict to "unverifiable"
 * (usable, unproven) instead of refusing backups the host simply cannot read.
 * Unlike resolvePgDump the bare-PATH entry is RESOLVED (Bun.which), because
 * here "not found" is a verdict, not a fallback.
 */
export function resolvePgRestore(): string | null {
	const candidates = pgBinCandidates(config.ops.pgBinPath, 'pg_restore');
	for (const candidate of candidates.slice(0, -1)) {
		if (existsSync(candidate)) return candidate;
	}
	return Bun.which('pg_restore');
}

/**
 * First `length` bytes of a file as latin1 text ('' when unreadable). Opened
 * and read by DESCRIPTOR, never `readFileSync`: these files are gigabytes, and
 * reading one whole archive into memory to look at five bytes would turn a
 * panel probe into an OOM on the smallest install.
 */
function fileMagic(filePath: string, length: number): string {
	let fd: number | null = null;
	try {
		fd = openSync(filePath, 'r');
		const buffer = Buffer.alloc(length);
		const read = readSync(fd, buffer, 0, length, 0);
		return buffer.subarray(0, read).toString('latin1');
	} catch {
		return '';
	} finally {
		if (fd !== null) closeSync(fd);
	}
}

interface PgRestoreOutcome {
	ok: boolean;
	timedOut: boolean;
	detail: string;
}

/**
 * Run pg_restore synchronously under the budget; its stderr is the detail.
 * No PGPASSWORD and no connection parameters: every mode used here READS THE
 * FILE (`--list`, and `-f` to a path) and never opens a database, so the child
 * has no business carrying the credential.
 */
function runPgRestore(bin: string, args: string[]): PgRestoreOutcome {
	const result = Bun.spawnSync([bin, ...args], {
		stdout: 'ignore',
		stderr: 'pipe',
		timeout: VERIFY_TIMEOUT_MS,
	});
	const detail = new TextDecoder()
		.decode(result.stderr ?? new Uint8Array())
		.trim()
		.slice(0, 500);
	// A killed child reports exitCode null with a signal — that is OUR timeout,
	// not the archive's verdict, and must never read as "the backup is broken".
	const timedOut = result.exitCode === null && result.signalCode !== null;
	return { ok: !timedOut && result.exitCode === 0, timedOut, detail };
}

/**
 * Is this artifact a restore point? See the section header for what each layer
 * proves. `deep: true` adds the full read that disproves truncation.
 *
 * The magic-byte gate before pg_restore is deliberate: an install whose
 * `*.backup` files are plain-SQL or foreign dumps must keep behaving exactly as
 * it did before P0-13 (counted, unproven) rather than being refused for a
 * format we never claimed to verify.
 */
export function verifyBackupArtifact(
	filePath: string,
	options: { deep?: boolean; pgRestoreBin?: string | null; nowMs?: number } = {},
): BackupVerdict {
	const deep = options.deep === true;
	let size: number;
	let mtimeMs: number;
	try {
		const stats = statSync(filePath);
		size = stats.size;
		mtimeMs = stats.mtimeMs;
	} catch {
		return { filePath, size: 0, mtimeMs: 0, usable: false, verified: false, reason: 'missing' };
	}
	const base = { filePath, size, mtimeMs };
	if (size === 0) return { ...base, usable: false, verified: false, reason: 'empty' };

	const cached = readVerdictSidecar(filePath, size, mtimeMs, deep);
	if (cached !== null) return cached;

	// AGE IS THE LAST RESORT, NOT THE FIRST TEST — and getting that order wrong is
	// an outage, not a nuisance. A blanket "younger than IN_PROGRESS_WINDOW_MS does
	// not count" rejects a FINISHED, verified dump for the first 90 seconds of its
	// life: an operator who takes a backup and immediately tries to update is told
	// there is no restore point. (It broke test/unit/update_preconditions.test.ts
	// the day it landed, 2026-08-30.)
	//
	// Whether a dump is still being written is DECIDABLE, so decide it: a partial
	// archive fails the read, a complete one passes. Measured 2026-08-30 on a
	// 7.6 MB custom dump truncated to 60%: `pg_restore --list` exits 0 (the TOC
	// lives at the FRONT and the data blocks are never touched — which is why the
	// TOC alone can never be the usability test), while `pg_restore -f /dev/null`
	// exits 1 with "could not read from input file: end of file".
	//
	// The age window survives only for the host that CANNOT ask — no pg_restore, or
	// a format this binary will not read. There a heuristic is the honest answer,
	// and refusing for 90 seconds costs the operator one retry.
	// THE TWO HOSTS THAT CANNOT ASK — here, and only here, age is the best answer
	// available, so the in-progress heuristic lives in these two branches.
	const now = options.nowMs ?? Date.now();
	const looksInProgress = now - mtimeMs < IN_PROGRESS_WINDOW_MS;
	if (fileMagic(filePath, CUSTOM_ARCHIVE_MAGIC.length) !== CUSTOM_ARCHIVE_MAGIC) {
		if (looksInProgress) return { ...base, usable: false, verified: false, reason: 'in_progress' };
		return { ...base, usable: true, verified: false, reason: 'unverifiable_foreign_format' };
	}
	const bin = options.pgRestoreBin === undefined ? resolvePgRestore() : options.pgRestoreBin;
	if (bin === null) {
		if (looksInProgress) return { ...base, usable: false, verified: false, reason: 'in_progress' };
		return { ...base, usable: true, verified: false, reason: 'unverifiable_no_pg_restore' };
	}

	const toc = runPgRestore(bin, ['--list', filePath]);
	if (toc.timedOut) {
		return { ...base, usable: true, verified: false, reason: 'unverifiable_timeout' };
	}
	if (!toc.ok) {
		const verdict: BackupVerdict = {
			...base,
			usable: false,
			verified: false,
			reason: 'not_an_archive',
			detail: toc.detail,
		};
		writeVerdictSidecar(verdict);
		return verdict;
	}
	if (!deep) {
		const verdict: BackupVerdict = {
			...base,
			usable: true,
			verified: false,
			reason: 'verified_toc',
		};
		writeVerdictSidecar(verdict);
		return verdict;
	}
	const full = runPgRestore(bin, ['-f', '/dev/null', filePath]);
	if (full.timedOut) {
		console.warn(
			`[backup] verification of '${filePath}' outran ${VERIFY_TIMEOUT_MS} ms — counted as a restore point WITHOUT proof`,
		);
		return { ...base, usable: true, verified: false, reason: 'unverifiable_timeout' };
	}
	const verdict: BackupVerdict = full.ok
		? { ...base, usable: true, verified: true, reason: 'verified_deep' }
		: { ...base, usable: false, verified: false, reason: 'truncated', detail: full.detail };
	writeVerdictSidecar(verdict);
	return verdict;
}

export interface NewestUsableBackup {
	/** mtime of the newest artifact that counts as a restore point (0 = none). */
	mtimeMs: number;
	/** Its verdict, or null when nothing in the directory counts. */
	verdict: BackupVerdict | null;
	/** Newer artifacts that were REFUSED — what the operator must be told about. */
	rejected: BackupVerdict[];
}

/**
 * The newest artifact in `backupDir` that counts as a RESTORE POINT, newest
 * first. This — not `newestBackupMtimeMs` — is what every "do we have a backup"
 * question must ask (P0-13).
 */
/**
 * The `.backup` entries that can actually be stat'd, with their mtimes.
 *
 * Per-entry guard, same as `newestBackupMtimeMs`: an unstatable entry — a dangling
 * symlink to unmounted backup storage, a rotation cron deleting between readdir and
 * stat — must not throw out of the whole scan and into the code-update path. A file
 * that cannot be stat'd is not a restore point either way.
 */
function statableBackups(backupDir: string, names: string[]): { path: string; mtimeMs: number }[] {
	const candidates: { path: string; mtimeMs: number }[] = [];
	for (const name of names) {
		if (!name.endsWith('.backup')) continue;
		const path = join(backupDir, name);
		try {
			candidates.push({ path, mtimeMs: statSync(path).mtimeMs });
		} catch {
			/* gone or unreadable */
		}
	}
	return candidates;
}

export function newestUsableBackup(
	backupDir: string = getBackupDir(),
	options: { deep?: boolean; pgRestoreBin?: string | null; nowMs?: number } = {},
): NewestUsableBackup {
	let names: string[];
	try {
		names = readdirSync(backupDir);
	} catch {
		return { mtimeMs: 0, verdict: null, rejected: [] };
	}
	const candidates = statableBackups(backupDir, names);
	candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
	const rejected: BackupVerdict[] = [];
	for (const candidate of candidates.slice(0, MAX_VERIFY_CANDIDATES)) {
		const verdict = verifyBackupArtifact(candidate.path, options);
		if (verdict.usable) return { mtimeMs: candidate.mtimeMs, verdict, rejected };
		rejected.push(verdict);
	}
	return { mtimeMs: 0, verdict: null, rejected };
}

/**
 * The completion verdict for a dump WE spawned: pg_dump's exit status (the only
 * proof it ran to completion) and then a DEEP read of what it wrote. Success
 * leaves the `<artifact>.verified` sidecar, so the panel and the update
 * precondition inherit the proof instead of paying for it again.
 */
function dumpCompletionVerdict(
	filePath: string,
	exitCode: number,
	overrides: BackupOverrides,
): { ok: boolean; reason: string } {
	if (exitCode !== 0) return { ok: false, reason: `pg_dump exited ${exitCode}` };
	const verdict = verifyBackupArtifact(filePath, {
		deep: true,
		pgRestoreBin: overrides.pgRestoreBin,
		// The dump JUST finished, so the in-progress window would refuse it: the
		// exit status above already proved nothing is still writing this file.
		nowMs: Number.MAX_SAFE_INTEGER,
	});
	if (verdict.usable) return { ok: true, reason: verdict.reason };
	return {
		ok: false,
		reason: `pg_dump exited 0 but the artifact did not verify: ${verdict.reason}${
			verdict.detail !== undefined && verdict.detail !== '' ? ` (${verdict.detail})` : ''
		}`,
	};
}

/**
 * Retire an artifact a failed dump left behind: delete it when empty, otherwise
 * rename it `*.failed`. NEVER leave a corpse that looks like a backup — the
 * name is what every scanner here matches on (`*.backup`), so a renamed corpse
 * disappears from the widget list, from `newestBackupMtimeMs` and from the
 * update precondition, while staying on disk for the operator to look at.
 */
function retireFailedArtifact(filePath: string): void {
	if (!existsSync(filePath)) return;
	try {
		if (statSync(filePath).size === 0) {
			unlinkSync(filePath);
			return;
		}
		const retired = `${filePath}.failed`;
		if (existsSync(retired)) unlinkSync(retired);
		renameSync(filePath, retired);
		console.error(`[backup] failed dump retired as '${retired}' — it is NOT a restore point`);
	} catch (error) {
		console.error(`[backup] could not retire failed artifact '${filePath}': ${error}`);
	}
}
