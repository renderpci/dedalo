/**
 * make_backup widget — TS-NATIVE backup surface (see ../backup.ts): the TS
 * server dumps the shared DB with its own pg_dump into its OWN backup
 * directory; MySQL backups are out of scope by the engine boundary (MariaDB is
 * the diffusion ENGINE's responsibility) — the mysql list is always empty.
 */

import type { WidgetModule, WidgetResponse } from './support.ts';

async function makeBackupGetValue(): Promise<WidgetResponse> {
	const { getBackupDir, getCurrentDataVersion } = await import('../backup.ts');
	const { config } = await import('../../../config/config.ts');
	const db = config.db as { database?: string };
	const now = new Date();
	const pad = (value: number) => String(value).padStart(2, '0');
	const fileName =
		`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
		`_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}` +
		`.${db.database ?? 'dedalo'}.postgresql_-1_forced_dbv${(await getCurrentDataVersion()).join('-')}.custom.backup`;
	return {
		result: {
			dedalo_db_management: true,
			backup_path: getBackupDir(),
			file_name: fileName,
			mysql_db: null,
		},
		msg: 'OK. Request done successfully',
		errors: [],
	};
}

async function makeBackupPsql(): Promise<WidgetResponse> {
	const { initBackupSequence } = await import('../backup.ts');
	const outcome = await initBackupSequence(-1, true);
	return {
		result: outcome.result,
		msg: outcome.msg,
		errors: outcome.errors,
		// pid + pfile: the copied widget feeds them straight into
		// update_process_status → dd_utils_api:get_process_status (SSE) so the
		// operator watches the dump live and sees the failure tail (S2-35).
		...({
			pid: outcome.pid ?? null,
			file_path: outcome.file_path ?? null,
			pfile: outcome.pfile ?? null,
		} as Record<string, unknown>),
	} as WidgetResponse;
}

async function makeBackupGetFiles(options: Record<string, unknown>): Promise<WidgetResponse> {
	const { getBackupFiles } = await import('../backup.ts');
	const maxFiles = typeof options.max_files === 'number' ? options.max_files : 10;
	return {
		result: {
			psql_backup_files: getBackupFiles().slice(0, maxFiles),
			mysql_backup_files: [], // engine boundary: MariaDB is the diffusion engine's
		},
		msg: 'OK. Request done',
		errors: [],
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
