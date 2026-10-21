/**
 * dd_ontology recovery file (UPDATE_PROCESS Phase 2 — the
 * build_database_version widget pair; PHP installer_ontology_manager::
 * build_recovery_version_file / restore_dd_ontology_recovery_from_file).
 *
 * BUILD: materialize the whitelisted-TLD slice table (db/dd_ontology.ts
 * createRecoverySlice), pg_dump ONLY that table, gzip it to the
 * recovery slot (default <private>/db/dd_ontology_recovery.sql.gz — see
 * DEDALO_ONTOLOGY_RECOVERY_PATH and runtime_paths.ts), drop the slice.
 * RESTORE: gunzip (capped — the file is local but the caps are free) and
 * feed psql; this RECREATES the dd_ontology_recovery table in the live DB —
 * it deliberately does NOT overwrite dd_ontology (PHP parity: the merge/swap
 * is a manual operator step).
 * No shell pipelines: pg_dump stdout streams through in-process gzip.
 *
 * ONE AT A TIME, EACH ON ITS OWN FILES (cross-write:r2). Build and restore both
 * DROP/CREATE the one shared `dd_ontology_recovery` table and write next to the
 * one slot, so they run under ONE single-flight lock — a Postgres advisory
 * lock (db/dd_ontology.ts withRecoverySliceLock: per database, across every
 * engine process): a second build or restore is refused "already running",
 * never raced. Every temp file is THIS session's (core/files/temp_path.ts
 * tempPathFor — a fixed `.part` was truncated and renamed by whichever session
 * opened it last, and unlinked by the other's `finally`); a failure removes
 * only its own. The lock holder sweeps the slot's stale temp siblings (a
 * crashed build's): no other session can be writing them.
 */

import {
	createWriteStream,
	existsSync,
	mkdirSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { envSnapshot } from '../../config/env.ts';
import {
	createRecoverySlice,
	dropRecoverySlice,
	withRecoverySliceLock,
} from '../db/dd_ontology.ts';
import { fsyncDirectory, fsyncFile } from '../files/durable.ts';
import { isTempSibling, tempPathFor } from '../files/temp_path.ts';
import { resolvePgBinary } from '../install/pg_bin.ts';
import { connArgs, connFromConfig, type DbConnDescriptor, runPsql } from '../install/pg_exec.ts';
import { recoveryFileWritePath, resolveRecoveryFilePath } from '../install/runtime_paths.ts';
import { gunzipWithCaps } from './data_io_import.ts';

/** PHP installer whitelist (narrower than config to_preserve_tld). */
export const RECOVERY_PRESERVE_TLDS = [
	'dd',
	'rsc',
	'lg',
	'hierarchy',
	'ontology',
	'ontologytype',
	'test',
] as const;

/**
 * The recovery slot moved OUT of the code tree (2026-08-23, runtime-path
 * census): a code-update tree swap used to carry the pre-update dump away with
 * the old tree — the one file you need after an update went wrong. Default is
 * now `<private>/db/dd_ontology_recovery.sql.gz` (DEDALO_ONTOLOGY_RECOVERY_PATH
 * relocates it); BUILD always writes there, RESTORE reads the effective path,
 * which falls back to a still-existing legacy in-tree file (with a warning)
 * so nobody's last good dump is orphaned. Resolution lives in
 * src/core/install/runtime_paths.ts, next to the census entry that reports it.
 */

export interface RecoveryFileResponse {
	/** INTERNAL outcome discriminator (never a wire body). */
	ok: boolean;
	msg: string;
	errors: string[];
	file_size?: string;
}

/**
 * Stream a byte source through in-process gzip into `path`, honouring
 * backpressure (a multi-hundred-MB dump must not buffer in memory). Resolves
 * only once every byte is in the file AND fsynced (durable.ts fsyncFile) — the
 * caller's rename then publishes durable bytes, and its directory fsync makes
 * the name durable too. REJECTS on any failure of the source, the compressor
 * or the sink (ENOSPC, EACCES, a read-only dir): one `pipeline` owns the three
 * streams, so a failure is never an unhandled stream 'error' (an uncaught
 * throw that killed the server) nor a wait that never settles (a destroyed
 * sink never drains), and the source is cancelled — a pg_dump behind it gets
 * a closed pipe instead of blocking forever. A failed call may leave a partial
 * `path`: the caller owns it (both callers write a `.part` and remove it).
 * Shared with the install seed builder (install/seed_build.ts) — the other
 * pg_dump this engine compresses.
 */
export async function gzipStreamToFile(
	source: AsyncIterable<Uint8Array>,
	path: string,
): Promise<void> {
	await pipeline(Readable.from(source), createGzip(), createWriteStream(path));
	fsyncFile(path);
}

/**
 * SURF-1: rows breaking the identifier grammar are left out of the slice (a
 * recovery file never carries a row its destination refuses) — say so, in one line.
 */
function skippedSliceLines(skipped: readonly string[]): string[] {
	if (skipped.length === 0) return [];
	const named = skipped
		.slice(0, 10)
		.map((tipo) => JSON.stringify(tipo).slice(0, 64))
		.join(', ');
	return [
		`dd_ontology_recovery: ${skipped.length} row(s) left out — they break the identifier grammar (run reconcile ontology_identifiers): ${named}`,
	];
}

/** A fresh, not-yet-ok outcome (every door of this module starts from one). */
function newResponse(): RecoveryFileResponse {
	return { ok: false, msg: '', errors: [] };
}

/** The refusal of a build or restore while another one holds the lock. */
function alreadyRunning(): RecoveryFileResponse {
	const response = newResponse();
	response.msg = 'Error. A recovery-file build or restore is already running';
	response.errors.push(
		'ontology recovery file: another build or restore holds the single-flight lock',
	);
	return response;
}

/** Run `work` holding the recovery single-flight lock (db/dd_ontology.ts), or refuse. */
function withRecoveryLock(
	work: () => Promise<RecoveryFileResponse>,
): Promise<RecoveryFileResponse> {
	return withRecoverySliceLock(work, alreadyRunning);
}

/**
 * Remove the stale temp siblings of `path` (tempPathFor's `<path>.tmp-<id>`) —
 * a crashed session's leftovers. Only the LOCK HOLDER calls it: no other
 * session can be writing them.
 */
function sweepStaleTempSiblings(path: string): void {
	const dir = dirname(path);
	if (!existsSync(dir)) return;
	const prefix = `${basename(path)}.tmp-`;
	for (const name of readdirSync(dir)) {
		if (name.startsWith(prefix) && isTempSibling(name)) rmSync(join(dir, name), { force: true });
	}
}

/** Build the recovery file (PHP build_recovery_version_file) — one at a time. */
export function buildRecoveryVersionFile(
	conn: DbConnDescriptor = connFromConfig(),
	outFile: string = recoveryFileWritePath(),
): Promise<RecoveryFileResponse> {
	return withRecoveryLock(() => buildUnderLock(conn, outFile));
}

/** The build, under the single-flight lock. */
async function buildUnderLock(
	conn: DbConnDescriptor,
	outFile: string,
): Promise<RecoveryFileResponse> {
	const response = newResponse();
	try {
		const slice = await createRecoverySlice(RECOVERY_PRESERVE_TLDS);
		response.errors.push(...skippedSliceLines(slice.skipped));
	} catch (error) {
		response.errors.push((error as Error).message);
		response.msg = 'Error. Unable to build the dd_ontology_recovery slice';
		return response;
	}
	// Defect D9 (fixed 2026-08-09): the dump is written to a temp sibling and
	// renamed onto the recovery slot ONLY after pg_dump exits 0 and the sink has
	// closed. Writing straight to outFile destroyed the last good artifact on
	// every failure, and a partial-but-valid gzip restores as a SILENTLY
	// truncated dd_ontology_recovery table. Rename is atomic on the same fs.
	// The sibling is THIS session's (tempPathFor), never a fixed shared name.
	const partFile = tempPathFor(outFile);
	try {
		sweepStaleTempSiblings(outFile);
		// The private-dir slot ('<private>/db/') may not exist on a box whose
		// dump always landed in-tree before; the build creates its parent.
		mkdirSync(dirname(outFile), { recursive: true });
		// The shared transport rule (DB_SOCKET wins) — this used to DROP `-h`
		// when a socket was set, so pg_dump reached libpq's compiled-in default
		// socket instead of the configured one.
		const args = connArgs(conn);
		args.push('-t', 'dd_ontology_recovery', conn.database);
		const child = Bun.spawn([resolvePgBinary('pg_dump'), ...args], {
			stdout: 'pipe',
			stderr: 'pipe',
			env: {
				...(envSnapshot() as Record<string, string>),
				...(conn.password !== '' ? { PGPASSWORD: conn.password } : {}),
			},
		});
		// A compressor failure rejects (and cancels the child's stdout: pg_dump
		// ends on the closed pipe) — the catch below reports it, `ok` stays false.
		await gzipStreamToFile(child.stdout, partFile);
		const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
		if (exitCode !== 0) {
			response.errors.push(`pg_dump failed: ${stderr.trim()}`);
			response.msg = 'Error. pg_dump failed building the recovery file';
			return response;
		}
		// The recovery file is the ontology update's safety net: its bytes were
		// fsynced by the compressor; the rename is made durable here — a power
		// cut after `ok` never leaves an empty or torn file in the slot.
		renameSync(partFile, outFile);
		fsyncDirectory(dirname(outFile));
		response.ok = true;
		response.msg = 'OK. Request done successfully';
		response.file_size = `${statSync(outFile).size} Bytes`;
		return response;
	} catch (error) {
		response.errors.push((error as Error).message);
		response.msg = 'Error. Request failed [build_recovery_version_file]';
		return response;
	} finally {
		// This session's temp file surviving here is a failed build: never a recovery slot.
		rmSync(partFile, { force: true });
		await dropRecoverySlice();
	}
}

/** Restore the slice table from the recovery file (PHP restore twin) — one at a time. */
export async function restoreDdOntologyRecoveryFromFile(
	conn: DbConnDescriptor = connFromConfig(),
	inFile: string = resolveRecoveryFilePath(),
): Promise<RecoveryFileResponse> {
	if (!existsSync(inFile)) {
		const response = newResponse();
		response.errors.push('source sql_file do not exists');
		response.msg = 'Error. source sql_file do not exists';
		return response;
	}
	return withRecoveryLock(() => restoreUnderLock(conn, inFile));
}

/** The restore, under the single-flight lock. */
async function restoreUnderLock(
	conn: DbConnDescriptor,
	inFile: string,
): Promise<RecoveryFileResponse> {
	const response = newResponse();
	// The plain intermediate is THIS session's (a fixed `<file minus .gz>` was
	// overwritten and removed by every concurrent restore's own `finally`).
	const plainBase = inFile.slice(0, -'.gz'.length);
	const plainPath = tempPathFor(plainBase);
	try {
		sweepStaleTempSiblings(plainBase);
		await gunzipWithCaps(inFile, plainPath);
		const run = await runPsql(conn, ['-v', 'ON_ERROR_STOP=1', '-f', plainPath]);
		if (run.exitCode !== 0) {
			response.errors.push(`psql restore failed: ${run.stderr.trim()}`);
			response.msg = 'Error. Request failed [restore_dd_ontology_recovery_from_file]';
			return response;
		}
		response.ok = true;
		response.msg = 'OK. Request done successfully';
		return response;
	} catch (error) {
		response.errors.push((error as Error).message);
		response.msg = 'Error. Request failed [restore_dd_ontology_recovery_from_file]';
		return response;
	} finally {
		rmSync(plainPath, { force: true });
	}
}
