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
 * A pending sentinel whose `version` is NOT the running engine's means either
 * a rollback already happened (we are the OLD tree booting again) or a
 * half-applied swap — both log LOUDLY and leave the sentinel untouched (the
 * rollback script owns it in that state). Never throws: confirmation is a
 * post-boot courtesy, and a broken sentinel must not take the server down.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RUNTIME_PATH_CENSUS } from '../install/runtime_paths.ts';
import { DEDALO_VERSION } from './version.ts';

/** The one sentinel shape (flat, machine-written; the rollback script greps it). */
export interface CodeUpdateSentinel {
	version: string;
	previousVersion: string;
	updateMode: string;
	stamp: string;
	backupDir: string;
	status: 'pending' | 'confirmed' | 'rolled_back';
	rollback_attempted: boolean;
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
 * Confirm (or loudly report) a pending code update. `sentinelPath` /
 * `runningVersion` are test seams; production passes nothing.
 */
export async function confirmBootedCodeUpdate(
	sentinelPath: string | null = codeUpdateSentinelPath(),
	runningVersion: string = DEDALO_VERSION,
): Promise<void> {
	try {
		if (sentinelPath === null || !existsSync(sentinelPath)) return;
		const sentinel = JSON.parse(readFileSync(sentinelPath, 'utf8')) as CodeUpdateSentinel;
		if (sentinel.status !== 'pending') return;
		if (sentinel.version === runningVersion) {
			await Bun.write(
				sentinelPath,
				JSON.stringify({ ...sentinel, status: 'confirmed' }, null, '\t'),
			);
			console.log(
				`[code update] boot CONFIRMED: running ${runningVersion} matches the pending update (sentinel flipped to confirmed)`,
			);
			return;
		}
		console.error(
			`[code update] LOUD: a PENDING code-update sentinel names version ${sentinel.version} but this process runs ${runningVersion} — a rollback happened, or the swap half-applied. The sentinel at ${sentinelPath} is left untouched; inspect it and the backup at ${sentinel.backupDir}.`,
		);
	} catch (error) {
		console.error('[code update] boot confirmation failed (sentinel unreadable?):', error);
	}
}
