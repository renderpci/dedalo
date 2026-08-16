/**
 * Shared operator preconditions for update/migration EXECUTEs (UPDATE_PROCESS
 * Phase 0) — the PHP update_data_version gate pair (superuser identity +
 * maintenance mode) plus a non-blocking recent-backup warning. PHP does not
 * auto-chain backups before updates and neither do we: a missing/stale backup
 * WARNS, never refuses (the operator can waive it).
 *
 * A REQUIRED check REFUSES BY THROWING (engineering/ERRORS_SPEC.md §4) — the
 * PHP refusal sentences became the registry messages of `perm.superuser_required`
 * and `maintenance.mode_required`, so this module builds no body and the caller
 * has nothing to forward.
 */

import { config } from '../../config/config.ts';
import { newestBackupMtimeMs } from '../area_maintenance/backup.ts';
import { DedaloError } from '../errors/index.ts';
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
 * `perm.superuser_required` for a non-superuser (403; operator-disclosure, the
 * sentence stays in the log by design), `maintenance.mode_required` for a
 * server that is not in maintenance mode (409, operator — the registry sentence
 * names the switch to flip).
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
		throw new DedaloError('perm.superuser_required', { coordinates: { user: principal.userId } });
	}
	if (getServerState().maintenance_mode !== true) {
		throw new DedaloError('maintenance.mode_required');
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
