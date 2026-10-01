/**
 * make_backup widget — TS-NATIVE backup surface (see ../backup.ts): the TS
 * server dumps the shared DB with its own pg_dump into its OWN backup
 * directory; MySQL backups are out of scope by the engine boundary (MariaDB is
 * the diffusion ENGINE's responsibility) — the mysql list is always empty.
 */

import type { Principal } from '../../security/permissions.ts';
import { failAction, type WidgetModule, type WidgetResponse } from './support.ts';

/**
 * The name the NEXT forced dump will get, from THE builder `initBackupSequence`
 * names its dumps with (`backupFileName`) — one grammar, gated by
 * test/unit/backup_inflight_native.test.ts leg f. (Until 2026-09-30 this widget
 * carried its own copy of the grammar, coverage plan §4.4 D14.)
 */
async function makeBackupGetValue(): Promise<WidgetResponse> {
	const { backupFileName, getBackupDir, getCurrentDataVersion } = await import('../backup.ts');
	const { config } = await import('../../../config/config.ts');
	const db = config.db as { database?: string };
	return {
		data: {
			dedalo_db_management: true,
			backup_path: getBackupDir(),
			// The make_psql_backup action below always forces, by user -1.
			file_name: backupFileName({
				now: new Date(),
				database: String(db.database ?? 'dedalo'),
				userId: -1,
				forced: true,
				version: await getCurrentDataVersion(),
			}),
			mysql_db: null,
		},
	};
}

/**
 * A six-field forward of `initBackupSequence` (gated in test/unit/ops_backup.test.ts).
 * No longer coverage-exempt (its old reason, "invoking it spawns a pg_dump of the
 * live database", stopped holding): backup_inflight_native leg r EXECUTES it with
 * the configured backup dir and pg binaries pointed at scratch (a fake pg_dump), so
 * the caller-owns-the-job wiring below is measured, not assumed.
 *
 * `extend.file_path` names the FINAL artifact, which exists only once the dump
 * has been promoted (pg_dump exit 0 + a full read, OPS-2): while it runs the
 * bytes live at `<file_path>.part`, invisible to get_dedalo_backup_files.
 *
 * The FILE is named by -1 (the forced dump's grammar, what `get_value` shows);
 * the JOB belongs to the caller — the record's `user_id`, who may stream and
 * stop it (WC-2026-09-30-backup-part-promotion, third addendum).
 */
async function makeBackupPsql(
	_options: Record<string, unknown>,
	principal: Principal,
): Promise<WidgetResponse> {
	const { initBackupSequence } = await import('../backup.ts');
	const outcome = await initBackupSequence(-1, true, {}, principal.userId);
	if (!outcome.ok) {
		failAction(
			outcome.errors.length === 0 ? outcome.msg : `${outcome.msg} (${outcome.errors.join('; ')})`,
		);
	}
	return {
		data: true,
		msg: outcome.msg,
		// pid + pfile: the copied widget feeds them straight into
		// update_process_status → dd_utils_api:get_process_status (SSE) so the
		// operator watches the dump live and sees the failure tail (S2-35). The
		// pid is the job's owner (this server) — never null, even while the job
		// is queued behind a full maintenance lane; the pfile names the job.
		extend: {
			pid: outcome.pid ?? null,
			file_path: outcome.file_path ?? null,
			pfile: outcome.pfile ?? null,
		},
	};
}

/**
 * COVERAGE-EXEMPT (coverage plan §5.1; reason registered in
 * engineering/crap_coverage_exempt.json): a slice over `getBackupFiles` plus the
 * constant empty MySQL list required by the engine boundary (MariaDB is the
 * diffusion engine's responsibility). The listing itself is gated in
 * test/unit/ops_backup.test.ts.
 */
async function makeBackupGetFiles(options: Record<string, unknown>): Promise<WidgetResponse> {
	const { getBackupFiles } = await import('../backup.ts');
	const maxFiles = typeof options.max_files === 'number' ? options.max_files : 10;
	return {
		data: {
			psql_backup_files: getBackupFiles().slice(0, maxFiles),
			mysql_backup_files: [], // engine boundary: MariaDB is the diffusion engine's
		},
	};
}

export const widget: WidgetModule = {
	spec: { id: 'make_backup', category: 'data', label: { kind: 'label', key: 'make_backup' } },
	apiActions: {
		make_psql_backup: makeBackupPsql,
		get_dedalo_backup_files: makeBackupGetFiles,
	},
	getValue: makeBackupGetValue,
};
