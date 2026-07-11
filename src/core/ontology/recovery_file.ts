/**
 * dd_ontology recovery file (UPDATE_PROCESS Phase 2 — the
 * build_database_version widget pair; PHP installer_ontology_manager::
 * build_recovery_version_file / restore_dd_ontology_recovery_from_file).
 *
 * BUILD: materialize the whitelisted-TLD slice table (db/dd_ontology.ts
 * createRecoverySlice), pg_dump ONLY that table, gzip it to
 * <projectRoot>/install/db/dd_ontology_recovery.sql.gz, drop the slice.
 * RESTORE: gunzip (capped — the file is local but the caps are free) and
 * feed psql; this RECREATES the dd_ontology_recovery table in the live DB —
 * it deliberately does NOT overwrite dd_ontology (PHP parity: the merge/swap
 * is a manual operator step).
 * No shell pipelines: pg_dump stdout streams through in-process gzip.
 */

import { createWriteStream, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createGzip } from 'node:zlib';
import { envSnapshot, projectRoot } from '../../config/env.ts';
import { createRecoverySlice, dropRecoverySlice } from '../db/dd_ontology.ts';
import { resolvePgBinary } from '../install/pg_bin.ts';
import { type DbConnDescriptor, connFromConfig, runPsql } from '../install/pg_exec.ts';
import { gunzipWithCaps } from './data_io_import.ts';

/** PHP installer whitelist (narrower than config to_preserve_tld). */
export const RECOVERY_PRESERVE_TLDS = [
	'dd',
	'rsc',
	'lg',
	'hierarchy',
	'ontology',
	'ontologytype',
	'test'
] as const;

export const RECOVERY_FILE_PATH = join(projectRoot, 'install', 'db', 'dd_ontology_recovery.sql.gz');

export interface RecoveryFileResponse {
	result: boolean;
	msg: string;
	errors: string[];
	file_size?: string;
}

/** Build the recovery file (PHP build_recovery_version_file). */
export async function buildRecoveryVersionFile(
	conn: DbConnDescriptor = connFromConfig(),
): Promise<RecoveryFileResponse> {
	const response: RecoveryFileResponse = { result: false, msg: '', errors: [] };
	try {
		await createRecoverySlice(RECOVERY_PRESERVE_TLDS);
	} catch (error) {
		response.errors.push((error as Error).message);
		response.msg = 'Error. Unable to build the dd_ontology_recovery slice';
		return response;
	}
	try {
		const args: string[] = [];
		if (conn.host && !conn.socket) args.push('-h', conn.host);
		if (conn.port) args.push('-p', String(conn.port));
		if (conn.user) args.push('-U', conn.user);
		args.push('-t', 'dd_ontology_recovery', conn.database);
		const child = Bun.spawn([resolvePgBinary('pg_dump'), ...args], {
			stdout: 'pipe',
			stderr: 'pipe',
			env: {
				...(envSnapshot() as Record<string, string>),
				...(conn.password !== '' ? { PGPASSWORD: conn.password } : {}),
			},
		});
		const gzip = createGzip();
		const sink = createWriteStream(RECOVERY_FILE_PATH);
		gzip.pipe(sink);
		for await (const chunk of child.stdout) {
			gzip.write(chunk);
		}
		gzip.end();
		await new Promise<void>((resolveDone) => sink.on('close', () => resolveDone()));
		const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
		if (exitCode !== 0) {
			response.errors.push(`pg_dump failed: ${stderr.trim()}`);
			response.msg = 'Error. pg_dump failed building the recovery file';
			return response;
		}
		response.result = true;
		response.msg = 'OK. Request done successfully';
		response.file_size = `${statSync(RECOVERY_FILE_PATH).size} Bytes`;
		return response;
	} catch (error) {
		response.errors.push((error as Error).message);
		response.msg = 'Error. Request failed [build_recovery_version_file]';
		return response;
	} finally {
		await dropRecoverySlice();
	}
}

/** Restore the slice table from the recovery file (PHP restore twin). */
export async function restoreDdOntologyRecoveryFromFile(
	conn: DbConnDescriptor = connFromConfig(),
): Promise<RecoveryFileResponse> {
	const response: RecoveryFileResponse = { result: false, msg: '', errors: [] };
	if (!existsSync(RECOVERY_FILE_PATH)) {
		response.errors.push('source sql_file do not exists');
		response.msg = 'Error. source sql_file do not exists';
		return response;
	}
	const plainPath = RECOVERY_FILE_PATH.slice(0, -'.gz'.length);
	try {
		await gunzipWithCaps(RECOVERY_FILE_PATH, plainPath);
		const run = await runPsql(conn, ['-v', 'ON_ERROR_STOP=1', '-f', plainPath]);
		if (run.exitCode !== 0) {
			response.errors.push(`psql restore failed: ${run.stderr.trim()}`);
			response.msg = 'Error. Request failed [restore_dd_ontology_recovery_from_file]';
			return response;
		}
		response.result = true;
		response.msg = 'OK. Request done successfully';
		return response;
	} catch (error) {
		response.errors.push((error as Error).message);
		response.msg = 'Error. Request failed [restore_dd_ontology_recovery_from_file]';
		return response;
	} finally {
		const { rmSync } = await import('node:fs');
		rmSync(plainPath, { force: true });
	}
}
