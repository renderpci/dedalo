/**
 * BOOT CONFIRMATION of a code update (2026-08-23) — the second half of the
 * sentinel contract that deploy/dedalo-code-rollback.sh reads.
 *
 * code_update.ts writes `<backupRoot>/last_code_update.json` with
 * `status:"pending"` BEFORE restarting. The systemd rollback path
 * (dedalo-ts.service OnFailure / the watchdog) acts on a sentinel that STAYS
 * pending — so the freshly booted tree must flip it to `"confirmed"` once it
 * is demonstrably alive (listener up + first DB ping green). server.ts calls
 * this at exactly that point.
 *
 * A pending sentinel the running tree does NOT match means either a rollback
 * already happened (we are the OLD tree booting again) or a half-applied swap
 * — both log LOUDLY and leave the sentinel untouched (the rollback script owns
 * it in that state). Never throws: confirmation is a post-boot courtesy, and a
 * broken sentinel must not take the server down.
 *
 * WHAT "MATCHES" MEANS (2026-08-24, dev channel): the INSTALLED ARCHIVE DIGEST,
 * not the version. A dev-channel install swaps a tree whose version is
 * unchanged, so a version comparison confirms the rolled-back OLD tree just as
 * happily as the new one — silently disarming the supervisor-side rollback for
 * exactly the class of build (unreleased branch code) most likely to need it.
 * The digest is per-BYTES, so it separates them. Sentinels written before this
 * (no `installDigest`) still fall back to the version compare: an old pending
 * sentinel must not become unconfirmable across the upgrade that introduces
 * the field.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RUNTIME_PATH_CENSUS } from '../install/runtime_paths.ts';
import { INSTALLED_DIGEST } from './install_stamp.ts';
import { DEDALO_VERSION } from './version.ts';

/** The one sentinel shape (flat, machine-written; the rollback script greps it). */
export interface CodeUpdateSentinel {
	version: string;
	previousVersion: string;
	updateMode: string;
	stamp: string;
	backupDir: string;
	/** sha256 of the installed archive — the tree's identity (absent: pre-2026-08-24). */
	installDigest?: string;
	status: 'pending' | 'confirmed' | 'rolled_back';
	rollback_attempted: boolean;
	/**
	 * TRUE when this tree was swapped WITHOUT a verified restore point
	 * (`waive_backup`) — P2-16 / LIFE-06.
	 *
	 * The waiver was already well gated (superuser + maintenance mode, and the
	 * shipped client exposes no control for it). What it had was no MEMORY: the
	 * only record was one `console.warn`, so once journald rotated there was no
	 * durable evidence that an update had proceeded with no backup behind it.
	 * That is the first question an incident asks. Absent on sentinels written
	 * before 2026-08-31, which is why it is optional.
	 */
	backup_waived?: boolean;
}

/**
 * Same resolution as the updater's backupRoot — read THROUGH the census
 * `backup_path` entry (install/runtime_paths.ts), the one authoritative
 * resolver, so this module never constructs its own tree-anchored path.
 */
export function codeUpdateSentinelPath(): string | null {
	const entry = RUNTIME_PATH_CENSUS.find((candidate) => candidate.id === 'backup_path');
	const backupRoot = entry?.resolve() ?? null;
	return backupRoot === null ? null : join(backupRoot, 'last_code_update.json');
}

/**
 * Does the booted tree match what the pending sentinel installed? Digest when
 * the sentinel carries one, version otherwise (legacy sentinels).
 */
function bootedTreeMatches(
	sentinel: CodeUpdateSentinel,
	runningVersion: string,
	runningDigest: string | null,
): boolean {
	return sentinel.installDigest === undefined
		? sentinel.version === runningVersion
		: sentinel.installDigest === runningDigest;
}

/**
 * Confirm (or loudly report) a pending code update. `sentinelPath` /
 * `runningVersion` / `runningDigest` are test seams; production passes nothing.
 */
export async function confirmBootedCodeUpdate(
	sentinelPath: string | null = codeUpdateSentinelPath(),
	runningVersion: string = DEDALO_VERSION,
	runningDigest: string | null = INSTALLED_DIGEST,
): Promise<void> {
	try {
		if (sentinelPath === null || !existsSync(sentinelPath)) return;
		const sentinel = JSON.parse(readFileSync(sentinelPath, 'utf8')) as CodeUpdateSentinel;
		if (sentinel.status !== 'pending') return;
		if (!bootedTreeMatches(sentinel, runningVersion, runningDigest)) {
			reportBootMismatch(sentinel, sentinelPath, runningVersion, runningDigest);
			return;
		}
		await Bun.write(sentinelPath, JSON.stringify({ ...sentinel, status: 'confirmed' }, null, '\t'));
		reportBootConfirmed(runningVersion, runningDigest);
	} catch (error) {
		console.error('[code update] boot confirmation failed (sentinel unreadable?):', error);
	}
}

/** The booted tree IS what the sentinel installed. */
function reportBootConfirmed(runningVersion: string, runningDigest: string | null): void {
	console.log(
		`[code update] boot CONFIRMED: running ${runningVersion} (installed digest ${runningDigest ?? 'none'}) matches the pending update (sentinel flipped to confirmed)`,
	);
}

/**
 * It is NOT. The sentinel is left untouched on purpose: it is the only evidence
 * that a swap was in flight, and a rollback must not erase it.
 */
function reportBootMismatch(
	sentinel: CodeUpdateSentinel,
	sentinelPath: string,
	runningVersion: string,
	runningDigest: string | null,
): void {
	console.error(
		`[code update] LOUD: a PENDING code-update sentinel names version ${sentinel.version} / digest ${sentinel.installDigest ?? 'none'} but this process runs ${runningVersion} / digest ${runningDigest ?? 'none'} — a rollback happened, or the swap half-applied. The sentinel at ${sentinelPath} is left untouched; inspect it and the backup at ${sentinel.backupDir}.`,
	);
}
