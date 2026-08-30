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

import { basename } from 'node:path';
import { config } from '../../config/config.ts';
import { type BackupVerdict, newestUsableBackup } from '../area_maintenance/backup.ts';
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
 * pipeline's refusals must never compute a refusal a second time. That is also
 * why there is no "cheap mode" parameter below: a second, weaker verdict for
 * the panel would rebuild exactly the disagreement this function abolished.
 *
 * FRESHNESS IS NOT USABILITY (audit P0-13, 2026-08-30). It used to read the
 * newest `*.backup` MTIME, so a pg_dump that died at 60% — and a pg_dump still
 * RUNNING, which has the freshest mtime of all — satisfied the gate that turns
 * "no backup" into a refusal for a code update. The operator was told they had
 * a restore point and then replaced the whole code tree. The age now comes from
 * the newest artifact that a `pg_restore` read has not DISPROVED
 * (`newestUsableBackup`, deep pass); artifacts this host cannot judge (no
 * pg_restore, a foreign non-custom format, a verification that outran its
 * budget) still count, because refusing a legitimate update over a backup we
 * merely failed to READ would be an outage. Cost is paid once per artifact and
 * cached in a sidecar; our own dumps are verified the moment pg_dump exits, so
 * the common path spends a stat and a small JSON read.
 */
export function backupFreshness(backupDir?: string): {
	newest: number;
	hours: number | null;
	stale: boolean;
	/** Was the counted artifact PROVEN restorable (vs merely not disproved)? */
	verified: boolean;
	/** The artifact that COUNTED, or null when nothing in the directory did. */
	verdict: BackupVerdict | null;
	/** Verdicts of the NEWER artifacts that were refused — the operator's clue. */
	rejected: BackupVerdict[];
} {
	// deep:false ON THIS PATH, DELIBERATELY. `backupFreshness` is called from the
	// update PANEL and the code-update precondition — an HTTP request handler in a
	// SINGLE-THREADED Bun process. A deep verification is a full `pg_restore` read
	// of the whole archive (measured ~7.4 s/GB), and `newestUsableBackup` may try
	// several candidates: on a cold backup directory that is minutes of a frozen
	// server, with every other request queued behind it. A precondition that DoSes
	// the installation to tell you a backup is fine is not a precondition.
	//
	// The deep read happens where the cost is already being paid and the answer is
	// decisive — at CREATION, right after pg_dump (see `runBackup`) — and its
	// verdict is recorded in a sidecar. This path reads that sidecar. An artifact
	// with no sidecar is reported as NOT VERIFIED rather than blocking to find out;
	// `verified` is a distinct field from `stale` exactly so the panel can say
	// "fresh, but never proven restorable" without either lying or hanging.
	const { mtimeMs, verdict, rejected } = newestUsableBackup(backupDir, { deep: false });
	if (mtimeMs === 0) {
		return { newest: 0, hours: null, stale: true, verified: false, verdict: null, rejected };
	}
	const hours = (Date.now() - mtimeMs) / 3600000;
	return {
		newest: mtimeMs,
		hours,
		stale: hours > config.ops.backupTimeRangeHours,
		verified: verdict?.verified === true,
		verdict,
		rejected,
	};
}

/**
 * The recent-backup scan's finding, or null when fresh enough.
 *
 * The two original sentences are BYTE-FROZEN (update_data_version's response is
 * pinned). The third is new with P0-13 and only fires in a case that used to be
 * reported as a fresh backup: a dump exists, it is recent, and reading it back
 * DISPROVED it. Naming the artifact and the reason is the difference between an
 * operator who makes a new backup and one who hunts a phantom.
 */
function staleBackupFinding(backupDir?: string): string | null {
	const { hours, stale, rejected } = backupFreshness(backupDir);
	if (hours === null) {
		const refused = rejected[0];
		if (refused !== undefined) {
			return `No usable database backup found — the newest dump ('${basename(refused.filePath)}') did not verify (${refused.reason}); make a backup before updating`;
		}
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
 * `backupRequire: true` (code update, 2026-08-23) turns the same scan into a
 * REFUSAL: a code swap replaces the whole tree and its rollback contract leans
 * on a restorable state, so "no backup / stale backup" is `update.refused`,
 * not a warning. The warn path above stays byte-frozen — update_data_version's
 * responses are pinned. The refusal is waived ONLY by an explicit
 * `waive_backup: true` in the request, which the CALLER must log loudly.
 */
export function checkUpdatePreconditions(
	principal: Principal,
	options: { backupWarn?: boolean; backupDir?: string; backupRequire?: boolean } = {},
): UpdatePreconditions {
	if (principal.userId !== SUPERUSER_ID) {
		throw new DedaloError('perm.superuser_required', { coordinates: { user: principal.userId } });
	}
	if (getServerState().maintenance_mode !== true) {
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
