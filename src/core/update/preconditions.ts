/**
 * Shared operator preconditions for update/migration EXECUTEs (UPDATE_PROCESS
 * Phase 0) — the PHP update_data_version gate pair (superuser identity +
 * maintenance mode, refusal bytes verbatim) plus a non-blocking recent-backup
 * warning. PHP does not auto-chain backups before updates and neither do we:
 * a missing/stale backup WARNS, never refuses (the operator can waive it).
 */

import { config } from '../../config/config.ts';
import { newestBackupMtimeMs } from '../area_maintenance/backup.ts';
import type { WidgetResponse } from '../area_maintenance/widgets/support.ts';
import { getServerState } from '../resolve/server_state.ts';
import { type Principal, SUPERUSER_ID } from '../security/permissions.ts';

export interface UpdatePreconditions {
	ok: boolean;
	/** The PHP-byte refusal envelope when a REQUIRED check fails (else null). */
	refusal: WidgetResponse | null;
	/** Non-blocking findings (recent-backup); emission is the caller's call. */
	warnings: string[];
}

/**
 * Run the required checks in PHP order (superuser first, then maintenance
 * mode) and compute the backup warning. `backupWarn: false` skips the backup
 * scan for callers whose response is byte-frozen (update_data_version).
 * `backupDir` is a test seam; production callers use the configured dir.
 */
export function checkUpdatePreconditions(
	principal: Principal,
	options: { backupWarn?: boolean; backupDir?: string } = {},
): UpdatePreconditions {
	if (principal.userId !== SUPERUSER_ID) {
		return {
			ok: false,
			refusal: {
				result: false,
				msg: 'Error. Only Dédalo superuser can do this action',
				errors: [],
			},
			warnings: [],
		};
	}
	if (getServerState().maintenance_mode !== true) {
		return {
			ok: false,
			refusal: {
				result: false,
				msg: 'Error. Update data is not allowed if Dédalo is not in maintenance_mode',
				errors: [],
			},
			warnings: [],
		};
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
	return { ok: true, refusal: null, warnings };
}
