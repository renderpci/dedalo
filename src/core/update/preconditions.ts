/**
 * Shared operator preconditions for update/migration EXECUTEs (UPDATE_PROCESS
 * Phase 0) — the PHP update_data_version gate pair (superuser identity +
 * maintenance mode, refusal bytes verbatim) plus a non-blocking recent-backup
 * warning. PHP does not auto-chain backups before updates and neither do we:
 * a missing/stale backup WARNS, never refuses (the operator can waive it).
 */

import { config } from '../../config/config.ts';
import { newestBackupMtimeMs } from '../area_maintenance/backup.ts';
import { DedaloError } from '../errors/dedalo_error.ts';
import { getServerState } from '../resolve/server_state.ts';
import { type Principal, SUPERUSER_ID } from '../security/permissions.ts';

export interface UpdatePreconditions {
	/** Non-blocking findings (recent-backup); emission is the caller's call. */
	warnings: string[];
}

/**
 * Run the required checks in PHP order (superuser first, then maintenance
 * mode) and compute the backup warning. A REQUIRED check that fails THROWS
 * (engineering/ERRORS_SPEC.md §4 — a refusal is a typed throw, never a body):
 * `perm.developer_required` for a non-superuser (403; its sentence is
 * operator-disclosure and stays in the log by design), `maintenance.action_refused`
 * for a server that is not in maintenance mode (400, public — the operator must
 * be told exactly which switch to flip).
 *
 * `backupWarn: false` skips the backup scan for callers whose response is
 * byte-frozen (update_data_version). `backupDir` is a test seam; production
 * callers use the configured dir.
 */
export function checkUpdatePreconditions(
	principal: Principal,
	options: { backupWarn?: boolean; backupDir?: string } = {},
): UpdatePreconditions {
	if (principal.userId !== SUPERUSER_ID) {
		throw new DedaloError('perm.developer_required', {
			message: 'Error. Only Dédalo superuser can do this action',
		});
	}
	if (getServerState().maintenance_mode !== true) {
		throw new DedaloError('maintenance.action_refused', {
			publicMessage: 'Error. Update data is not allowed if Dédalo is not in maintenance_mode',
		});
	}

	const warnings: string[] = [];
	if (options.backupWarn !== false) {
		const newest = newestBackupMtimeMs(options.backupDir);
		if (newest === 0) {
			warnings.push('Warning. No database backup found — make a backup before updating');
		} else {
			const hours = (Date.now() - newest) / 3600000;
			if (hours > config.ops.backupTimeRangeHours) {
				warnings.push(
					`Warning. Newest database backup is about ${Math.round(hours)} hours old — make a fresh backup before updating`,
				);
			}
		}
	}
	return { warnings };
}
