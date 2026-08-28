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
 * The ONE backup-freshness verdict, shared by the refusal below and the
 * update_code panel's `backup_fresh` check (core/update/status.ts).
 *
 * It exists because the two had drifted by a ROUNDING STEP: the panel compared
 * `Math.round(hours) > backupTimeRangeHours`, this compared the raw fraction.
 * For every age in (T, T+0.5) hours the panel therefore answered `ok` /
 * "Ready to update" while the pipeline threw `update.refused` — a deterministic
 * half-hour window, once per backup cycle, in which the panel disagreed with
 * the only gate that matters. A panel whose whole job is to predict the
 * pipeline's refusals must never compute a refusal a second time.
 */
export function backupFreshness(backupDir?: string): {
	newest: number;
	hours: number | null;
	stale: boolean;
} {
	const newest = newestBackupMtimeMs(backupDir);
	if (newest === 0) return { newest, hours: null, stale: true };
	const hours = (Date.now() - newest) / 3600000;
	return { newest, hours, stale: hours > config.ops.backupTimeRangeHours };
}

/** The recent-backup scan's finding (byte-frozen wording), or null when fresh enough. */
function staleBackupFinding(backupDir?: string): string | null {
	const { hours, stale } = backupFreshness(backupDir);
	if (hours === null) {
		return 'No database backup found — make a backup before updating';
	}
	if (stale) {
		return `Newest database backup is about ${Math.round(hours)} hours old — make a fresh backup before updating`;
	}
	return null;
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
 *
 * `maintenance: false` (restore-point DELETE, 2026-08-28) skips the maintenance
 * gate — and ONLY that caller may: removing a backup directory never touches the
 * live tree and serves no request differently, so demanding an install be closed
 * to the public before it may reclaim its own disk would make the affordance
 * useless on exactly the installation that ran out of space. The superuser check
 * is NOT optional and has no flag.
 *
 * `backupRequire: true` (code update, 2026-08-23) turns the same scan into a
 * REFUSAL: a code swap replaces the whole tree and its rollback contract leans
 * on a restorable state, so "no backup / stale backup" is `update.refused`,
 * not a warning. The warn path above stays byte-frozen — update_data_version's
 * responses are pinned. The refusal is waived ONLY by an explicit
 * `waive_backup: true` in the request, which the CALLER must log loudly.
 */
export function checkUpdatePreconditions(
	principal: Principal,
	options: {
		backupWarn?: boolean;
		backupDir?: string;
		backupRequire?: boolean;
		maintenance?: boolean;
	} = {},
): UpdatePreconditions {
	if (principal.userId !== SUPERUSER_ID) {
		throw new DedaloError('perm.superuser_required', { coordinates: { user: principal.userId } });
	}
	if (options.maintenance !== false && getServerState().maintenance_mode !== true) {
		throw new DedaloError('maintenance.mode_required');
	}

	const warnings: string[] = [];
	if (options.backupWarn !== false) {
		const finding = staleBackupFinding(options.backupDir);
		if (finding !== null) {
			if (options.backupRequire === true) {
				const sentence = `Error. ${finding} (or pass waive_backup to proceed without one)`;
				throw new DedaloError('update.refused', { message: sentence, publicMessage: sentence });
			}
			warnings.push(`Warning. ${finding}`);
		}
	}
	return { warnings };
}
