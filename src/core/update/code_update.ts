/**
 * Code-update ENGINE (UPDATE_PROCESS Phase 4 — PHP update_code::update_code).
 * Downloads the selected release archive, VERIFIES its sha256, PRE-VALIDATES
 * every zip entry (zipinfo) so no unsafe or symlink entry is ever extracted,
 * extracts into a QUARANTINE dir, installs its dependencies THERE, boots the
 * quarantine once (smoke_boot.ts), swaps it onto the TS tree (rename-based;
 * old tree backed up), writes the ROLLBACK SENTINEL, and restarts so the
 * supervisor boots the new code.
 *
 * CLEAN-ONLY (2026-08-23; WC-2026-08-23-update-mode-clean-only): the
 * incremental (`cpSync` overlay) mode is DELETED, not optional. An overlay
 * never deletes files the release removed, so the "updated" tree is a
 * superposition of two releases — and, worse, it CANNOT be rolled back: there
 * is no backup tree to restore, which is incompatible with the rollback
 * contract below. Clean rename-swap is the only path.
 *
 * SECURITY POSTURE (Opus-designed; deliberately STRICTER than PHP — WC-024):
 *  - TLS-on, origin-pinned, redirect-refused, capped download (code_download.ts).
 *  - sha256 verification against the manifest hash (PHP verifies nothing).
 *  - ZIP magic sniff (PK\x03\x04) before extraction.
 *  - Entry PRE-VALIDATION via `zipinfo`: reject any absolute/`..`/non-
 *    `dedalo_code/`-prefixed name and any SYMLINK-mode entry BEFORE extracting
 *    — closes the info-zip symlink-write-through escape (no zip lib in deps;
 *    adding one is spike-gated). Post-extraction walk is a belt over that.
 *  - Extraction into a quarantine dir, never over the live tree; rename-based
 *    swap with the old tree backed up (same-device asserted for atomicity),
 *    and a failed second rename RESTORES the backup in place.
 *  - Live swap REFUSED without a supervisor (a self-exit would not restart).
 *
 * DATA-SAFETY GATES (2026-08-23, the runtime-path census era):
 *  - `runtimePathsInsideTree(targetRoot)` non-empty → refuse: the swap would
 *    carry live runtime data (media, state, sessions…) into the backup.
 *  - A `backupRoot` inside `targetRoot` → refuse (its own swap would move it).
 *  - ROOT WHITELIST: any top-level entry of `targetRoot` that is neither
 *    shipped by the release, nor preserved/census-registered, refuses the
 *    swap — this is what catches `.dedalo.env`, `acc/`, stray `*.log` files
 *    before they vanish into a backup dir. NESTED entries under a shipped
 *    dir (e.g. `deploy/certs/*`) are covered by a SECRET-PATTERN walk
 *    (`certs/` dirs, `*.pem|key|crt|cer|p12|pfx`, `.env*`): a full nested
 *    diff is impossible without the OLD release's manifest — a file the new
 *    release legitimately REMOVED is indistinguishable from an operator
 *    drop-in — so only secret-shaped untracked entries refuse. That is the
 *    honest limit of the nested check.
 *  - `image` deployment channel (channel.ts) → refuse: a swap inside a
 *    container image lands in the writable layer and is discarded on the next
 *    recreation.
 *
 * ROLLBACK CONTRACT (deploy/dedalo-code-rollback.sh + boot_confirm.ts): the
 * sentinel `<backupRoot>/last_code_update.json` is written `status:"pending"`,
 * AWAITED AND VERIFIED, **BEFORE the first swap rename**, naming the
 * `backupDir` the swap INTENDS to create (the rollback script tolerates a
 * backupDir that does not exist yet). A failed sentinel write refuses the
 * update while the live tree is still UNTOUCHED — strictly better than the
 * old post-swap write, which left two crash windows (dead between the two
 * renames with no sentinel; dead after them with no sentinel) in which the
 * supervisor-side rollback found nothing to do. When the swap fails and the
 * old tree is fully restored in place, the pending sentinel is retracted
 * (best-effort — a leftover pending sentinel naming a nonexistent backupDir
 * is tolerated by the script). The BACKUP keeps its old `node_modules` (no longer carried forward — the
 * quarantine installs its own), which is exactly what makes the rollback
 * script's `mv backupDir targetRoot; systemctl start` yield a BOOTABLE server
 * with no network and no `bun install`. LOAD-BEARING: if that ever changes,
 * deploy/dedalo-code-rollback.sh changes with it.
 *
 * REUSED BY code_restore.ts (2026-08-25): the swap machinery below is exported
 * — `codeStagingDir`, `assertSwapPreconditions`/`swapPreconditionsWithFrame`,
 * `resolveBackupRootOrRefuse`, `acquireRunLockOrRefuse` (the SAME run lock, so
 * a restore and an update can never interleave), `prepareStagingDirOrRefuse`,
 * `backupDirName`, `installedDigestOf`, `sentinelGuardedSwap`,
 * `createPhaseTracker`, `cleanStagingDir`, `errorText`,
 * `refuseUnaccountedLiveEntries` — because a restore is this pipeline run in
 * reverse. It must never grow a second copy of any of it. The LIVE-TREE gates
 * in particular are about the SWAP, not about the archive: whatever moves the
 * live tree aside owes the operator the same refusal (2026-08-25 review — the
 * restore path shipped without them and would have carried `certs/` and
 * operator drop-ins into a backup dir in silence).
 *
 * The engine is seam-driven (`targetRoot`/`backupRoot`/`restart`/`verifySha`/
 * `supervised`/`installDeps`/`smokeBoot`/`channel`/`renameIntoPlace`) so tests
 * drive the full pipeline against a TEMP tree — the live projectRoot swap is
 * an operator drill (ledgered), never an automated test.
 */

import { createHash } from 'node:crypto';
import {
	closeSync,
	existsSync,
	lstatSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	readSync,
	renameSync,
	rmSync,
	type Stats,
	statSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { config } from '../../config/config.ts';
import { projectRoot, readEnv } from '../../config/env.ts';
import { DedaloError, ok } from '../errors/index.ts';
import type { ApiEnvelope } from '../errors/schema.ts';
import { runtimePathsInsideTree } from '../install/runtime_paths.ts';
import type { Principal } from '../security/permissions.ts';
import { currentRequestContext } from '../security/request_context.ts';
import { type DeploymentChannel, detectDeploymentChannel } from './channel.ts';
import { downloadReleaseArchive } from './code_download.ts';
import {
	availableBytesAt,
	checkUpdateSpace,
	formatGb,
	looksLikeNoSpace,
	type SpaceSeams,
} from './disk_space.ts';
import { INSTALL_STAMP_PATH, type InstallChannel, parseInstallStamp } from './install_stamp.ts';
import { engineOwnsInstall } from './ownership.ts';
import { backupFreshness, checkUpdatePreconditions } from './preconditions.ts';
import { refuseUpdate, rethrowOrRefuseUpdate } from './refuse.ts';
import { smokeBootQuarantine } from './smoke_boot.ts';
import { compareVersionArrays, DEDALO_VERSION_TRIPLE, parseVersionString } from './version.ts';

/**
 * A code-update SHAPE refusal (the archive's contents, the swap's filesystem).
 * `publicSentence` is what the operator running the update is told — a vetted
 * fact about the archive or the backup dir; `detail` is the same sentence
 * enriched with the offending entry name for the LOG only, so an extracted
 * path never reaches the wire.
 */
function refuseArchive(publicSentence: string, detail = publicSentence): never {
	throw new DedaloError('update.refused', {
		message: detail,
		publicMessage: publicSentence,
	});
}

const ARCHIVE_ROOT_PREFIX = 'dedalo_code/';
const MAX_ARCHIVE_ENTRIES = 50_000;
const MAX_EXTRACTED_TOTAL_BYTES = 1024 * 1024 * 1024;
/**
 * Root entries carried from the old tree into the new one across the swap.
 * `node_modules` is DELIBERATELY NOT here (2026-08-23): the quarantine carries
 * a freshly `bun install`ed one for the NEW release's lockfile, and the BACKUP
 * keeps the OLD tree's node_modules — which is exactly what makes the
 * supervisor-side rollback (deploy/dedalo-code-rollback.sh) bootable offline.
 */
/**
 * Root entries the swap PRESERVES across the rename (never shipped by a
 * release, never "unaccounted"). Exported because `status.ts` reports the live
 * tree's unaccounted root entries BEFORE a download — it must derive that list
 * from this set, never from a second copy that could drift.
 */
export const PRESERVE_ROOT_ENTRIES: ReadonlySet<string> = new Set(['.git']);

/**
 * The pipeline's answer IS the wire body (the update_code widget's job payload
 * carries it verbatim), so it is ENVELOPE v2 — `data` is the installed release,
 * `msg` an extension key. Every gate REFUSES BY THROWING a registered
 * `update.*` / `request.invalid_options` code (./refuse.ts); nothing here
 * builds a failure body.
 */
export type CodeUpdateResponse = ApiEnvelope;

/** The current RQO's id (the widget dispatcher opens the scope), or '' outside a request. */
function currentRequestId(): string {
	return currentRequestContext()?.requestId ?? '';
}

// ---------------------------------------------------------------------------
// PHASE FRAMES — the progress wire the maintenance client renders.
// ---------------------------------------------------------------------------

/** Pipeline phases, in execution order. `health` is the CLIENT's post-restart poll. */
export const UPDATE_PHASES = [
	'download',
	'verify',
	'extract',
	'deps',
	'preflight',
	'swap',
	'restart',
	'health',
] as const;
export type UpdatePhaseId = (typeof UPDATE_PHASES)[number];
export type UpdatePhaseStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

/** One progress frame (the update_code client contract). */
export interface UpdatePhaseFrame {
	phase: UpdatePhaseId;
	phases: { id: UpdatePhaseId; status: UpdatePhaseStatus }[];
	/** The release being installed. */
	version: string;
	/** On the `restart` frame: the version /health must answer post-restart. */
	expected_version?: string;
	message?: string;
	rollback?: { performed: boolean; to: string };
	/**
	 * TRUE when this run proceeded with NO verified restore point (P2-16). The
	 * operator watching the panel should see it while it happens, not only in a
	 * log line that rotates away.
	 */
	backup_waived?: boolean;
}

export interface PhaseTracker {
	start: (phase: UpdatePhaseId, extra?: Partial<UpdatePhaseFrame>) => void;
	/** Mark a phase this pipeline does not run (code_restore.ts fetches nothing). */
	skip: (phase: UpdatePhaseId) => void;
	fail: (message: string) => void;
}

export function createPhaseTracker(
	version: string,
	onPhase: ((frame: UpdatePhaseFrame) => void) | undefined,
	/**
	 * Stamped on EVERY frame when the run proceeded with no verified restore
	 * point (P2-16 / LIFE-06). On every frame rather than one, because the panel
	 * shows the current frame: a flag that appeared once, early, would have
	 * scrolled away by the time anything went wrong.
	 */
	backupWaived = false,
): PhaseTracker {
	const statuses = new Map<UpdatePhaseId, UpdatePhaseStatus>(
		UPDATE_PHASES.map((id) => [id, 'pending']),
	);
	let current: UpdatePhaseId | null = null;
	const emit = (phase: UpdatePhaseId, extra: Partial<UpdatePhaseFrame> = {}): void => {
		onPhase?.({
			phase,
			phases: UPDATE_PHASES.map((id) => ({ id, status: statuses.get(id) ?? 'pending' })),
			version,
			...(backupWaived ? { backup_waived: true } : {}),
			...extra,
		});
	};
	return {
		skip(phase) {
			// Silent on purpose: the NEXT started phase carries the whole track,
			// so a restore does not open with four frames saying nothing happened.
			statuses.set(phase, 'skipped');
		},
		start(phase, extra = {}) {
			if (current !== null) statuses.set(current, 'done');
			statuses.set(phase, 'running');
			current = phase;
			emit(phase, extra);
		},
		fail(message) {
			// A refusal BEFORE any phase started (bad checksum, no supervisor, the
			// image channel, a runtime path inside the tree, an unknown root entry)
			// is the LIKELIEST first-run outcome, and it used to emit nothing at
			// all — the operator got a phase track sitting all-pending and a
			// generic sentence. Attribute it to the first phase so the track shows
			// WHERE the pipeline stopped; the refusal's own sentence rides along.
			const failed = current ?? UPDATE_PHASES[0];
			statuses.set(failed, 'failed');
			emit(failed, { message });
		},
	};
}

export interface CodeUpdateSeams {
	targetRoot?: string;
	backupRoot?: string;
	restart?: (reason: string) => void;
	verifySha?: (filePath: string) => string;
	/** Override supervisor detection (tests). */
	supervised?: boolean;
	/** Dependency install in the quarantine (default: pinned-bun `install --frozen-lockfile --production`). */
	installDeps?: (codeRoot: string) => Promise<void>;
	/** Pre-swap boot check of the quarantine (default: smoke_boot.ts). */
	smokeBoot?: (codeRoot: string, stagingDir: string) => Promise<void>;
	/** Override deployment-channel detection (tests). */
	channel?: DeploymentChannel;
	/** The FIRST swap rename, live tree → backup (tests inject an EBUSY-style
	 * failure to gate the nothing-moved guarantee, or observe the pre-rename
	 * sentinel ordering). */
	renameToBackup?: (from: string, to: string) => void;
	/** The SECOND swap rename (tests inject a failure to gate the restore path). */
	renameIntoPlace?: (from: string, to: string) => void;
	/** The RESTORE rename, backup → live tree (tests inject a failure to gate the
	 * double-failure parking path). */
	renameRestore?: (from: string, to: string) => void;
	/** Progress frames (the widget wires this to the job's onData). */
	onPhase?: (frame: UpdatePhaseFrame) => void;
	/** Disk-space measurement (tests inject a full filesystem; see disk_space.ts). */
	space?: SpaceSeams;
}

function sha256Of(filePath: string): string {
	return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/** Is a process supervisor present (systemd/docker/pm2)? A self-exit only
 * restarts under one — otherwise the live swap would kill the server dead.
 * Exported so the panel's readiness readout asks THIS function rather than
 * re-reading the env itself (a second copy would drift from the refusal). */
export function isSupervised(): boolean {
	const explicit = readEnv('DEDALO_SUPERVISED');
	if (explicit !== undefined) return explicit === 'true';
	return readEnv('INVOCATION_ID') !== undefined || readEnv('JOURNAL_STREAM') !== undefined;
}

/** First 4 bytes are the ZIP local-file magic PK\x03\x04. */
function looksLikeZip(filePath: string): boolean {
	const fd = openSync(filePath, 'r');
	const buffer = Buffer.alloc(4);
	try {
		readSync(fd, buffer, 0, 4, 0);
	} finally {
		closeSync(fd);
	}
	return buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
}

/** Absolute forms an archive entry name must never take (POSIX root or a Windows drive). */
function isAbsoluteEntryName(normalized: string): boolean {
	return normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized);
}

/** One name-validity check shared by pre- and post-extraction. */
function entryNameIsSafe(name: string): boolean {
	if (name === '' || name.includes('\0')) return false;
	const normalized = name.replaceAll('\\', '/');
	if (isAbsoluteEntryName(normalized)) return false;
	if (normalized.split('/').some((seg) => seg === '..' || seg === '.')) return false;
	return (
		normalized === ARCHIVE_ROOT_PREFIX.slice(0, -1) || normalized.startsWith(ARCHIVE_ROOT_PREFIX)
	);
}

/**
 * PRE-VALIDATE the archive with `zipinfo` BEFORE extracting: every entry must
 * carry the dedalo_code/ prefix, no traversal/absolute name, and NO symlink
 * mode (zipinfo's first column starts 'l' for a symlink). Rejecting symlink
 * entries here means none is ever created — the write-through escape cannot
 * happen. Returns null when safe, else the reason.
 */
export async function preValidateArchive(zipPath: string): Promise<string | null> {
	const child = Bun.spawn(['zipinfo', '-1', zipPath], { stdout: 'pipe', stderr: 'pipe' });
	const [names, exitList] = await Promise.all([new Response(child.stdout).text(), child.exited]);
	if (exitList !== 0) return 'zipinfo could not list the archive';
	const entryNames = names.split('\n').filter((line) => line !== '');
	if (entryNames.length > MAX_ARCHIVE_ENTRIES) return 'archive exceeds the entry-count cap';
	for (const name of entryNames) {
		if (!entryNameIsSafe(name)) return `unsafe archive entry name: ${name}`;
	}
	return scanArchiveModesForSymlinks(zipPath);
}

/**
 * Verbose zipinfo shows the unix mode in the first column; 'l' = symlink.
 * Returns null when no symlink entry exists, else the refusal reason.
 */
async function scanArchiveModesForSymlinks(zipPath: string): Promise<string | null> {
	const verbose = Bun.spawn(['zipinfo', zipPath], { stdout: 'pipe', stderr: 'pipe' });
	const [modeText, exitVerbose] = await Promise.all([
		new Response(verbose.stdout).text(),
		verbose.exited,
	]);
	if (exitVerbose !== 0) return 'zipinfo could not read the archive modes';
	for (const line of modeText.split('\n')) {
		// entry lines start with the 10-char permission block, e.g. '-rw-r--r--' / 'lrwxrwxrwx'
		if (/^l[rwxsStT-]{9}\s/.test(line)) return 'archive contains a symlink entry';
	}
	return null;
}

/**
 * The post-extraction belt's per-entry SHAPE refusals: symlink, path escaping
 * the extraction dir, non-regular (fifo/device/socket). After this an entry is
 * provably a plain directory or a plain file.
 */
function refuseUnsafeExtractedEntry(
	name: string,
	full: string,
	stat: Stats,
	destDir: string,
	destResolved: string,
): void {
	if (stat.isSymbolicLink()) {
		refuseArchive(
			'the archive contains a symlink entry',
			`extracted a symlink entry: ${relative(destDir, full)}`,
		);
	}
	if (!resolve(full).startsWith(destResolved + sep)) {
		refuseArchive(
			'an archive entry escapes the extraction directory',
			`extracted entry escapes the extraction dir: ${name}`,
		);
	}
	if (!stat.isDirectory() && !stat.isFile()) {
		refuseArchive(
			'the archive contains a non-regular entry',
			`non-regular extracted entry: ${name}`,
		);
	}
}

/** Extract a PRE-VALIDATED archive into `destDir`, then post-walk (belt). */
export async function extractArchive(zipPath: string, destDir: string): Promise<string> {
	mkdirSync(destDir, { recursive: true });
	const child = Bun.spawn(['unzip', '-o', '-q', zipPath, '-d', destDir], {
		stdout: 'ignore',
		stderr: 'pipe',
	});
	const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
	// The unzip stderr can name absolute paths — log-only `message`, registry
	// English on the wire (no publicMessage).
	if (exitCode !== 0) {
		throw new DedaloError('update.failed', { message: `unzip failed: ${stderr.trim()}` });
	}
	const codeRoot = join(destDir, 'dedalo_code');
	if (!existsSync(codeRoot)) refuseArchive("archive missing the required 'dedalo_code/' root");
	// Post-extraction belt: reject any symlink or escaping path, cap total size.
	const destResolved = resolve(destDir);
	let entries = 0;
	let bytes = 0;
	const walk = (dir: string): void => {
		for (const name of readdirSync(dir)) {
			const full = join(dir, name);
			const stat = lstatSync(full);
			refuseUnsafeExtractedEntry(name, full, stat, destDir, destResolved);
			entries += 1;
			if (entries > MAX_ARCHIVE_ENTRIES) refuseArchive('archive exceeds the entry-count cap');
			if (stat.isDirectory()) walk(full);
			else {
				bytes += stat.size;
				if (bytes > MAX_EXTRACTED_TOTAL_BYTES) refuseArchive('archive exceeds the size cap');
			}
		}
	};
	walk(destDir);
	// A real Dédalo TS tree carries these — a cheap structural sanity gate.
	for (const marker of ['package.json', join('src', 'server.ts'), '.bun-version']) {
		if (!existsSync(join(codeRoot, marker))) {
			refuseArchive(`archive is not a Dédalo tree (missing ${marker})`);
		}
	}
	return codeRoot;
}

/**
 * Strict linear upgrade guard (Opus §1.3) — a backstop against a malicious or
 * buggy code server offering a skip. Returns null when the target is a legal
 * next rung, else the reason.
 *
 * THE DEV CHANNEL (2026-08-24) relaxes exactly ONE clause: `target === current`
 * becomes legal, because a branch build carries no version bump — that is the
 * whole point of testing unreleased `v7` code on a remote install. It relaxes
 * an ORDERING guard, not an AUTHENTICITY one: the origin allowlist, the
 * no-redirect rule and the sha256-vs-sidecar check are untouched, so the worst
 * a forged `channel` buys is installing a same-version archive the configured
 * master really published. Downgrades and rung skips stay refused on both
 * channels, and an OMITTED channel never relaxes anything.
 */
export function assertLinearUpgrade(
	current: readonly number[],
	target: readonly number[],
	channel: InstallChannel = 'master',
): string | null {
	const order = compareVersionArrays(target, current);
	if (order === 0 && channel === 'dev') return null;
	if (order !== 1) return 'refusing a downgrade or same-version install';
	return versionSkipReason(current, target);
}

/**
 * The skip rules over a KNOWN-ascending pair (assertLinearUpgrade gates order
 * first) — the swap path's ONLY version gate, so it must be exact.
 *
 * The PATCH AXIS WAS NEVER CONSTRAINED: `cPatch` was not even destructured, so
 * `assertLinearUpgrade([7,0,0], [7,0,99999])` returned null and 7.0.0 → 7.0.3
 * installed in one hop, skipping every intervening rung's migrations. Nothing
 * else caught it — the sha is CLIENT-SUPPLIED and matches the genuinely
 * published sidecar of the skipped-to release, so a consumer pointed at a
 * master with several archives on disk could jump the queue.
 *
 * Now it asks ONE question, the same notion of "next rung" the manifest builds
 * from (code_manifest.ts upgradeRung): major+1.0.0, minor+1.0, or patch+1.
 */
function versionSkipReason(current: readonly number[], target: readonly number[]): string | null {
	const [cMajor = 0, cMinor = 0, cPatch = 0] = current;
	const [tMajor = 0, tMinor = 0, tPatch = 0] = target;
	if (isNextRung([cMajor, cMinor, cPatch], [tMajor, tMinor, tPatch])) return null;
	if (tMajor > cMajor) return 'major version skip is not allowed';
	if (tMinor <= cMinor) return 'patch version skip is not allowed';
	return tPatch !== 0 ? 'a minor/major bump must land on .0' : 'minor version skip is not allowed';
}

/** Is `target` the ONE rung above `current`: major+1.0.0, minor+1.0, or patch+1? */
function isNextRung(
	[cMajor, cMinor, cPatch]: readonly [number, number, number],
	[tMajor, tMinor, tPatch]: readonly [number, number, number],
): boolean {
	if (tMajor === cMajor + 1) return tMinor === 0 && tPatch === 0;
	if (tMajor !== cMajor) return false;
	if (tMinor === cMinor + 1) return tPatch === 0;
	return tMinor === cMinor && tPatch === cPatch + 1;
}

/**
 * Marker file dropped into the staging dir when a failed swap restore leaves
 * the ONLY remaining copy of a tree parked there. `cleanStagingDir` (the
 * pipeline's `finally`) and the next run's staging sweep both REFUSE to delete
 * a staging dir carrying it — at no point may the only surviving copy of a
 * tree live somewhere the cleanup will delete.
 */
export const STAGING_KEEP_MARKER = 'DO_NOT_DELETE_holds_live_tree';

/** The ONE staging path (`<backupRoot>/.code_staging`) — never re-joined by hand. */
export function codeStagingDir(backupRoot: string): string {
	return join(backupRoot, '.code_staging');
}

/**
 * Does staging hold a PARKED LIVE TREE from a failed swap restore? The pipeline
 * hard-REFUSES on this (prepareStagingDirOrRefuse), so the panel must report it
 * `blocked` — it used to see only "a .code_staging exists" and answer `warn`,
 * leaving `ready: true` and a headline of "Ready to update" over an install the
 * updater would refuse on its first act.
 */
export function stagingHoldsParkedTree(backupRoot: string): boolean {
	return existsSync(join(codeStagingDir(backupRoot), STAGING_KEEP_MARKER));
}

/** Is `dir` the staging dir itself, or under it? The one question
 * STAGING_KEEP_MARKER answers truthfully (see restoreAfterFailedSwap). */
function isInsideDir(dir: string, parent: string): boolean {
	const inner = resolve(dir);
	const outer = resolve(parent);
	return inner === outer || inner.startsWith(outer + sep);
}

/** The guarded staging cleanup — never deletes a staging dir holding a parked tree. */
export function cleanStagingDir(stagingDir: string): void {
	if (existsSync(join(stagingDir, STAGING_KEEP_MARKER))) {
		console.error(
			`[code update] staging dir KEPT — it holds a parked tree after a failed swap restore: ${stagingDir}`,
		);
		return;
	}
	rmSync(stagingDir, { recursive: true, force: true });
}

/**
 * Rename-based clean swap: old tree → backup, new tree → target.
 *
 * The two renames are INDIVIDUALLY atomic but the PAIR is not:
 *  - The FIRST rename moves nothing else beforehand: preserved entries
 *    (`.git`) are carried into the new tree FROM THE BACKUP only AFTER the
 *    first rename succeeded. Carrying them earlier opened a window where a
 *    first-rename failure (EBUSY on a bind-mounted checkout — exactly the
 *    tree_swap-blessed container deployment — or EACCES/EPERM) stranded
 *    `.git` inside the staging dir the cleanup deletes. A first-rename
 *    failure now provably leaves the live tree byte-identical.
 *  - A failed SECOND rename restores: preserved entries back into the
 *    backup, then backup → target, then refuses with the original cause.
 *  - A DOUBLE failure (the restore rename throws too) parks the new tree in
 *    staging, drops STAGING_KEEP_MARKER so no cleanup deletes it, and throws
 *    loudly naming both surviving trees; the pending sentinel stays, so the
 *    supervisor-side rollback can still restore the backup.
 */
function renameSwap(
	codeRoot: string,
	targetRoot: string,
	backupDir: string,
	stagingDir: string,
	seams: CodeUpdateSeams,
): void {
	const renameToBackup = seams.renameToBackup ?? renameSync;
	const renameIntoPlace = seams.renameIntoPlace ?? renameSync;
	// Same-device assert so the renames are atomic (a cross-device rename throws).
	if (statSync(targetRoot).dev !== statSync(resolve(backupDir, '..')).dev) {
		refuseArchive('backup dir is on a different filesystem — rename swap would not be atomic');
	}
	// FIRST rename: live tree aside. Nothing has moved before this point.
	try {
		renameToBackup(targetRoot, backupDir);
	} catch (error) {
		refuseUpdate(
			'update.failed',
			'Error. Code swap could not move the live tree aside (the first rename failed) — nothing changed',
			error,
		);
	}
	// Carry the preserved entries FROM THE BACKUP into the new tree, then swap in.
	const preservedMoved: string[] = [];
	try {
		carryPreservedEntries(backupDir, codeRoot, preservedMoved);
		renameIntoPlace(codeRoot, targetRoot);
	} catch (error) {
		restoreAfterFailedSwap(
			preservedMoved,
			codeRoot,
			targetRoot,
			backupDir,
			stagingDir,
			seams,
			error,
		);
	}
}

/**
 * Move the preserved root entries (`.git`) FROM THE BACKUP into the new tree.
 * Pushes each moved name so a failed second rename can move them back (the
 * partially-filled list is why the caller owns the array, not a return value).
 */
function carryPreservedEntries(backupDir: string, codeRoot: string, moved: string[]): void {
	for (const name of PRESERVE_ROOT_ENTRIES) {
		const from = join(backupDir, name);
		if (existsSync(from)) {
			renameSync(from, join(codeRoot, name));
			moved.push(name);
		}
	}
}

/**
 * The failed-second-rename repair: preserved entries back into the backup
 * FIRST (so a restore-rename failure never leaves them in staging), then the
 * old tree straight back where it was; on success refuse with the original
 * cause. A DOUBLE failure hands over to `refuseAfterDoubleFailure`, which parks
 * the incoming tree (when staging is where it sits) and throws naming both
 * surviving trees.
 */
function restoreAfterFailedSwap(
	preservedMoved: readonly string[],
	codeRoot: string,
	targetRoot: string,
	backupDir: string,
	stagingDir: string,
	seams: CodeUpdateSeams,
	error: unknown,
): never {
	const renameRestore = seams.renameRestore ?? renameSync;
	try {
		for (const name of preservedMoved) {
			renameSync(join(codeRoot, name), join(backupDir, name));
		}
		renameRestore(backupDir, targetRoot);
	} catch (restoreError) {
		refuseAfterDoubleFailure(codeRoot, backupDir, stagingDir, error, restoreError);
	}
	refuseUpdate(
		'update.failed',
		'Error. Code swap failed after the backup rename — the previous tree was restored in place; nothing changed',
		error,
	);
}

/**
 * THE DOUBLE FAILURE: the swap's second rename failed AND the restore rename
 * failed too, so there is no tree at targetRoot. The old tree survives in
 * `backupDir` (the pending sentinel is still there, so the supervisor-side
 * rollback can restore it); the incoming tree survives where it already was.
 *
 * THE MARKER IS A STATEMENT ABOUT STAGING, NOT ABOUT THE FAILURE (2026-08-25
 * review). An UPDATE's incoming tree is the quarantine UNDER `stagingDir`, so
 * STAGING_KEEP_MARKER both stops the sweep and tells the next run why. A
 * RESTORE's incoming tree is the restore point inside the BACKUP ROOT and
 * staging is empty: dropping the marker there parked nothing, kept an empty
 * directory forever, and made `prepareStagingDirOrRefuse` hard-refuse every
 * later update AND restore — quoting a recovery instruction that names a
 * directory holding no tree, on an installation that has just lost its live one.
 */
function refuseAfterDoubleFailure(
	codeRoot: string,
	backupDir: string,
	stagingDir: string,
	error: unknown,
	restoreError: unknown,
): never {
	const parkedInStaging = isInsideDir(codeRoot, stagingDir);
	if (parkedInStaging) {
		try {
			writeFileSync(
				join(stagingDir, STAGING_KEEP_MARKER),
				`swap restore failed; new tree parked at ${codeRoot}; old tree at ${backupDir}\n`,
			);
		} catch {
			// marker write best-effort — the error below still names both trees
		}
	}
	throw new DedaloError('update.failed', {
		message: `code swap failed (${String(error)}) AND the restore failed (${String(restoreError)}): old tree at ${backupDir}, new tree at ${codeRoot}${parkedInStaging ? ' — staging dir KEPT' : ''}`,
		publicMessage: parkedInStaging
			? 'Error. Code swap failed and the automatic restore also failed — the previous tree remains in the backup dir, the new tree is parked in staging (NOT deleted), and the pending rollback sentinel is in place. Operator recovery required; see the server log.'
			: 'Error. Code swap failed and the automatic restore also failed — the previous tree remains in the backup dir, the tree that was being installed remains where it was, and the pending rollback sentinel is in place. Operator recovery required; see the server log.',
	});
}

/**
 * Stamp the QUARANTINE with what it is, before it is smoke-booted and swapped
 * in (install_stamp.ts): the verified archive digest — the tree's only
 * per-bytes identity once the version stops changing — plus the channel that
 * built it, which is what makes a `v7` build report `.dev` instead of
 * impersonating the published release.
 *
 * Written BEFORE the smoke boot on purpose: the tree that is validated is then
 * byte-for-byte the tree that lands.
 */
function writeInstallStampSync(codeRoot: string, request: UpdateRequest): void {
	const stamp = {
		digest: request.declaredSha,
		channel: request.channel,
		source_url: request.url,
		installed_at: new Date().toISOString(),
	};
	const path = join(codeRoot, INSTALL_STAMP_PATH);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(stamp, null, '\t')}\n`);
}

/**
 * The digest of the archive the LIVE tree was installed from, read from that
 * tree's own stamp (never the running module's constant — the swap may target
 * a tree that is not this process's). Null for a tree installed before stamps
 * existed, or a dev checkout.
 */
export function installedDigestOf(targetRoot: string): string | null {
	try {
		return (
			parseInstallStamp(readFileSync(join(targetRoot, INSTALL_STAMP_PATH), 'utf8'))?.digest ?? null
		);
	} catch {
		return null;
	}
}

/**
 * The restore point's name. It carried only `dedalo_<version>_<stamp>`, which
 * on the dev channel names every iteration identically (the version does not
 * move) — five restore points, nothing but a timestamp to tell them apart. The
 * short digest of the tree the dir HOLDS makes it identifiable; a tree with no
 * stamp keeps the old name rather than inventing a token.
 */
export function backupDirName(
	previousVersion: string,
	previousDigest: string | null,
	stamp: string,
): string {
	return previousDigest === null
		? `dedalo_${previousVersion}_${stamp}`
		: `dedalo_${previousVersion}_${previousDigest.slice(0, 7)}_${stamp}`;
}

/** The rollback sentinel (deploy/dedalo-code-rollback.sh contract — flat, exact keys). */
export interface UpdateSentinel {
	version: string;
	previousVersion: string;
	updateMode: 'clean';
	stamp: string;
	backupDir: string;
	/** sha256 of the installed archive — what boot_confirm.ts compares (2026-08-24).
	 * OPTIONAL since 2026-08-25: a restore point installed before stamps existed
	 * has no digest, and boot_confirm.ts falls back to the version compare only
	 * when the FIELD IS ABSENT — writing an empty string would make it compare a
	 * digest that can never match and scream on every boot. */
	installDigest?: string;
	status: 'pending';
	rollback_attempted: false;
	/** The tree was swapped with NO verified restore point (P2-16 / LIFE-06). */
	backup_waived?: boolean;
}

/**
 * Write the sentinel AWAITED AND VERIFIED. The old best-effort try/catch
 * swallow is DEAD ON PURPOSE: the supervisor-side rollback contract depends on
 * this file existing, so a failed write must fail the update, never be
 * shrugged off.
 */
async function writeUpdateSentinel(backupRoot: string, sentinel: UpdateSentinel): Promise<void> {
	mkdirSync(backupRoot, { recursive: true });
	const path = join(backupRoot, 'last_code_update.json');
	const bytes = JSON.stringify(sentinel, null, '\t');
	await Bun.write(path, bytes);
	// Verify: readable and parseable, not merely "the write did not throw".
	const readBack = JSON.parse(readFileSync(path, 'utf8')) as UpdateSentinel;
	if (readBack.version !== sentinel.version || readBack.status !== 'pending') {
		// Typed even though the caller catches it and refuses with its own
		// sentence: an untyped throw is the failure signal the error taxonomy
		// retires, and "it is caught upstream" is how untyped debt accretes.
		refuseUpdate('update.failed', `sentinel verification failed at ${path}`);
	}
}

/** Default deps install: the PINNED bun (process.execPath — never a floating `bun`). */
async function installDepsReal(codeRoot: string): Promise<void> {
	const child = Bun.spawn([process.execPath, 'install', '--frozen-lockfile', '--production'], {
		cwd: codeRoot,
		stdout: 'ignore',
		stderr: 'pipe',
	});
	const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
	if (exitCode !== 0) {
		// A FULL DISK is the one failure whose sentence must not be generic: bun
		// reports it as a wall of per-package `NoSpaceLeft`/`FileNotFound`
		// extraction errors that read like a corrupt registry cache, and the
		// operator's action (free space) is nothing like "retry the download".
		const noSpace = looksLikeNoSpace(stderr);
		const available = availableBytesAt(codeRoot);
		// 503/retryable — correct for the offline case (registry unreachable).
		throw new DedaloError('update.failed', {
			message: `bun install failed in the quarantine (exit ${exitCode}): ${stderr.trim().split('\n').slice(-20).join('\n')}`,
			publicMessage: noSpace
				? `Error. The disk filled up while installing the release dependencies${available === null ? '' : ` (${formatGb(available)} available)`} — free space and retry; nothing was swapped`
				: 'Error. Installing the release dependencies failed — nothing was swapped',
		});
	}
}

interface UpdateCodeOptions {
	file?: { version?: unknown; url?: unknown; sha256?: unknown; channel?: unknown };
	waive_backup?: unknown;
}

/** The validated, typed update request — every field already shape-checked. */
interface UpdateRequest {
	url: string;
	version: string;
	declaredSha: string;
	/** The channel the manifest advertised this archive on ('master' unless 'dev'). */
	channel: InstallChannel;
	/**
	 * The operator explicitly proceeded without a verified restore point. Carried
	 * so it can be RECORDED (sentinel + progress frames), not just warned about
	 * once into a log that rotates — P2-16 / LIFE-06.
	 */
	backupWaived: boolean;
}

/**
 * STEP 0 + request validation, all BEFORE any network fetch. Operator
 * preconditions first: superuser AND maintenance mode REQUIRED (a code swap is
 * more disruptive than the data migration that already requires it), plus a
 * REQUIRED recent backup — waivable only explicitly. Then the request shape:
 *  - CMD-06 (2026-07-28 audit): `version` is used downstream as a path segment,
 *    and parseVersionString/compareVersionArrays NaN-short-circuit — so a
 *    traversal value like `../../x` could slip the linear-upgrade gate. Require
 *    a strict numeric-dotted form up front so it can never be a path or option.
 *  - A release is installed ONLY against a declared digest. The manifest
 *    carries one for every built archive (code_manifest.readShaSidecar), so an
 *    ABSENT hash means either a master that never wrote the sidecar or a
 *    hand-assembled request — neither is a thing to swap a code tree for.
 *    Until 2026-08-15 an empty `file.sha256` silently skipped the check, which
 *    made WC-024's whole integrity guarantee inert (the manifest never carried
 *    a hash at all).
 */
/**
 * The waiver's audit line: it records the FACT of a waiver, never the flag that
 * asked for one, and only over a backup that is actually missing or stale.
 *
 * Called only AFTER the identity gates have passed. Until 2026-08-26 it fired
 * before checkUpdatePreconditions, so any global admin (the widget door is
 * `isGlobalAdmin`, not SUPERUSER_ID) could fill the log with
 * `WAIVED … proceeding without a recent database backup` lines for requests
 * that were refused on the very next statement and proceeded with nothing. It
 * also fired over a FRESH backup — both drills always send the flag — so the
 * line implied a missing backup that was not missing.
 *
 * Extracted from parseUpdateRequest (2026-08-27): the caller carries the
 * DECISION, this carries the diagnostic, which is what keeps the door under the
 * complexity cap. No behaviour change.
 */
function warnBackupWaiver(waiveBackup: boolean, principal: Principal): void {
	if (!waiveBackup) return;
	const { hours, stale } = backupFreshness();
	if (hours !== null && !stale) return;
	console.warn(
		`[code update] BACKUP REQUIREMENT WAIVED by user ${principal.userId} — proceeding with ${
			hours === null
				? 'NO database backup at all'
				: `a database backup about ${Math.round(hours)} hours old`
		}`,
	);
}

function parseUpdateRequest(rawOptions: unknown, principal: Principal): UpdateRequest {
	const options = (rawOptions ?? {}) as UpdateCodeOptions;
	const waiveBackup = options.waive_backup === true;
	checkUpdatePreconditions(
		principal,
		waiveBackup ? { backupWarn: false } : { backupRequire: true },
	);
	warnBackupWaiver(waiveBackup, principal);
	const request: UpdateRequest = { ...readReleaseFields(options), backupWaived: waiveBackup };
	assertReleaseShape(request);
	return request;
}

/** The `file.*` strings, shape-untrusted (assertReleaseShape gates them next). */
function readReleaseFields(options: UpdateCodeOptions): Omit<UpdateRequest, 'backupWaived'> {
	const file = options.file ?? {};
	return {
		url: typeof file.url === 'string' ? file.url : '',
		version: typeof file.version === 'string' ? file.version : '',
		declaredSha: typeof file.sha256 === 'string' ? file.sha256 : '',
		// Anything that is not exactly 'dev' is the release channel: an unknown
		// or absent value must never be the one that relaxes a guard.
		channel: file.channel === 'dev' ? 'dev' : 'master',
	};
}

/**
 * The request-shape refusal chain, in its LOAD-BEARING order: missing fields →
 * malformed version → linear-upgrade guard → malformed/missing sha. All before
 * any network fetch, by contract.
 */
function assertReleaseShape({ url, version, declaredSha, channel }: UpdateRequest): void {
	if (url === '' || version === '') {
		refuseUpdate(
			'request.invalid_options',
			'Error. Missing release file/version (file.url and file.version are required)',
		);
	}
	if (!/^\d+(\.\d+){1,3}$/.test(version)) {
		refuseUpdate(
			'request.invalid_options',
			'Error. Malformed release version (a numeric dotted release is required, e.g. 7.0.1)',
		);
	}
	const linear = assertLinearUpgrade(DEDALO_VERSION_TRIPLE, parseVersionString(version), channel);
	if (linear !== null) {
		refuseUpdate('update.refused', `Error. ${linear}`);
	}
	if (!/^[a-f0-9]{64}$/.test(declaredSha)) {
		refuseUpdate(
			'request.invalid_options',
			'Error. Malformed or missing release checksum (sha256 must be 64 hex chars)',
		);
	}
}

/**
 * The pre-download REFUSAL BATTERY over the swap's filesystem — order is
 * load-bearing (tests pin it): supervisor → deployment channel → runtime-path
 * census → backup-root containment. Returns the resolved backup root.
 *
 *  - Only the LIVE tree needs a supervisor (a self-exit must be respawned); a
 *    seam-driven test swap of a temp tree does not restart the process.
 *  - DEPLOYMENT CHANNEL (channel.ts): on `image` the tree lives in the
 *    container image, so a swap writes into the writable layer and is
 *    DISCARDED on the next container recreation — silently reverting the
 *    install and destroying the backup. A bind-mounted checkout inside a
 *    container is tree_swap.
 *  - RUNTIME-PATH CENSUS (install/runtime_paths.ts): any runtime data
 *    resolving inside the code tree would be silently carried into the backup
 *    by the swap.
 *  - The backup root itself must not sit inside the tree the swap renames away.
 */
export function assertSwapPreconditions(targetRoot: string, seams: CodeUpdateSeams): string {
	const supervised = seams.supervised ?? isSupervised();
	if (targetRoot === projectRoot && !supervised) {
		refuseUpdate(
			'update.refused',
			'Error. No supervisor detected; the server would not restart onto the new tree. Set DEDALO_SUPERVISED=true.',
		);
	}

	const channel = seams.channel ?? detectDeploymentChannel(targetRoot);
	if (channel === 'image') {
		refuseUpdate(
			'update.refused',
			'Error. This install runs from a container IMAGE: a tree swap would land in the container writable layer and be discarded on the next recreation. Update the image instead (deploy/dedalo-image-update.sh).',
		);
	}

	refuseRuntimeDataInsideTree(targetRoot);
	return resolveBackupRootOrRefuse(targetRoot, seams);
}

/** The RUNTIME-PATH CENSUS gate (install/runtime_paths.ts): refuse any runtime
 * data resolving inside the code tree — the swap would carry it into the backup. */
function refuseRuntimeDataInsideTree(targetRoot: string): void {
	const insideTree = runtimePathsInsideTree(targetRoot);
	if (insideTree.length > 0) {
		const first = insideTree[0] as { id: string; envKey: string | null; path: string };
		const remedy =
			first.envKey === null
				? `move it (census id '${first.id}')`
				: `move it, or set ${first.envKey}`;
		throw new DedaloError('update.refused', {
			// The FIRST offender + its env key on the wire; the full list log-only.
			publicMessage: `Error. Runtime data lives inside the code tree: ${first.path} (${remedy}) — a code swap would carry it into the backup.`,
			message: `runtime paths inside the code tree: ${insideTree
				.map((entry) => `${entry.id} (${entry.envKey ?? 'hard-coded'}): ${entry.path}`)
				.join('; ')}`,
		});
	}
}

/**
 * WHERE the code-update backup root resolves — the location half only, with no
 * verdict attached. `status.ts` reports it (and the restore points inside it)
 * on a panel that must not throw; the refusal below adds the verdict.
 */
export function resolveCodeBackupRoot(): string {
	return (
		(readEnv('DEDALO_BACKUP_PATH') as string | undefined) ??
		join(projectRoot, '..', 'backups', 'code')
	);
}

/** Resolve the backup root and refuse one that sits inside the tree the swap
 * renames away (its own swap would move it). */
export function resolveBackupRootOrRefuse(targetRoot: string, seams: CodeUpdateSeams): string {
	const backupRoot = seams.backupRoot ?? resolveCodeBackupRoot();
	if (backupRootIsInsideTree(backupRoot, targetRoot)) {
		refuseUpdate(
			'update.refused',
			'Error. The code-backup dir resolves INSIDE the code tree — its own swap would move it. Point DEDALO_BACKUP_PATH outside the tree.',
		);
	}
	return backupRoot;
}

/** Does a backup root sit inside the tree the swap renames away? The ONE
 * predicate behind both the refusal above and the panel's readiness line. */
export function backupRootIsInsideTree(backupRoot: string, targetRoot: string): boolean {
	const rootResolved = resolve(targetRoot);
	const backupResolved = resolve(backupRoot);
	return backupResolved === rootResolved || backupResolved.startsWith(rootResolved + sep);
}

/**
 * The archive ACQUISITION + INTEGRITY chain (`download` and `verify` phases):
 * configured-origin match, capped TLS download, sha256 against the declared
 * digest, ZIP magic sniff, zipinfo pre-validation. Returns the verified zip's
 * path; every failure refuses (a download failure THROWS out of
 * downloadReleaseArchive, typed).
 */
async function acquireVerifiedArchive(
	request: UpdateRequest,
	stagingDir: string,
	seams: CodeUpdateSeams,
	phases: PhaseTracker,
): Promise<string> {
	const verifySha = seams.verifySha ?? sha256Of;
	const codeServer = config.update.codeServers.find((entry) => {
		try {
			return new URL(entry.url).origin === new URL(request.url).origin;
		} catch {
			return false;
		}
	});
	if (codeServer === undefined) {
		refuseUpdate(
			'request.invalid_options',
			'Error. Release URL is not on a configured code server',
		);
	}
	phases.start('download');
	const zipPath = join(stagingDir, `${request.version}.zip`);
	await downloadReleaseArchive({
		url: request.url,
		configuredOrigin: new URL(codeServer.url).origin,
		targetPath: zipPath,
	});

	phases.start('verify');
	if (verifySha(zipPath) !== request.declaredSha) {
		refuseUpdate('update.refused', 'Error. Release checksum mismatch — refusing to install');
	}
	if (!looksLikeZip(zipPath)) {
		refuseUpdate('update.refused', 'Error. Downloaded release is not a ZIP archive');
	}
	const preValidation = await preValidateArchive(zipPath);
	if (preValidation !== null) {
		refuseUpdate('update.refused', `Error. Unsafe release archive: ${preValidation}`);
	}
	return zipPath;
}

/** Filenames that smell like credentials/keys wherever they sit in the tree. */
const SECRET_LIKE_NAME = /\.(pem|key|crt|cer|p12|pfx)$/i;

/**
 * Walk the live tree for entries ABSENT from the release that match a secret
 * pattern (`certs/` dirs, key/cert extensions, `.env*`). A full nested diff
 * is impossible — a file the release removed is indistinguishable from an
 * operator drop-in — so only secret-shaped untracked entries are reported
 * (the module header states this limit). Returns tree-relative paths; a
 * flagged directory is reported once, without descending.
 */
function nestedUntrackedSecrets(codeRoot: string, targetRoot: string): string[] {
	const offenders: string[] = [];
	// `prefix` is '' at the root, else 'dir/…/': relPath is always prefix+name.
	const walk = (prefix: string): void => {
		for (const name of readdirSync(join(targetRoot, prefix))) {
			if (isSecretWalkSkipped(prefix, name)) continue;
			const relPath = prefix + name;
			if (!existsSync(join(codeRoot, relPath)) && isSecretShapedName(name)) {
				offenders.push(relPath);
				continue; // a flagged dir is enough — no need to descend
			}
			if (lstatSync(join(targetRoot, relPath)).isDirectory()) walk(`${relPath}/`);
		}
	};
	walk('');
	return offenders;
}

/** Entries the secret walk never descends into or reports: preserved root
 * entries, and node_modules/.git anywhere (huge, engine-owned). */
function isSecretWalkSkipped(prefix: string, name: string): boolean {
	return (
		name === 'node_modules' || name === '.git' || (prefix === '' && PRESERVE_ROOT_ENTRIES.has(name))
	);
}

/** Does a name match the secret pattern (`certs/` dirs, key/cert extensions, `.env*`)? */
function isSecretShapedName(name: string): boolean {
	return SECRET_LIKE_NAME.test(name) || name === 'certs' || name.startsWith('.env');
}

/**
 * Prepare the EXTRACTED quarantine for the swap (`deps` and `preflight`
 * phases): root whitelist, hard .bun-version gate, dependency install, smoke
 * boot. Nothing here touches the live tree.
 *
 *  - ROOT WHITELIST (post-extraction, pre-anything-destructive): every
 *    top-level entry of the live tree must be accounted for — shipped by the
 *    release, preserved across the swap, node_modules (backed up, by design),
 *    or a census-registered runtime path (already refused earlier if inside).
 *  - The HARD .bun-version gate: the swap hands the tree to the RUNNING bun
 *    (process.execPath) via the supervisor, so a release pinning a different
 *    Bun must not be installed until the operator installs that Bun. (The
 *    boot-time check in server.ts stays a warning — that tree is already
 *    running.)
 *  - PRE-FLIGHT SMOKE BOOT (smoke_boot.ts): boot the quarantine once; a tree
 *    that cannot start never replaces a working one.
 */

/**
 * The SECRET-SHAPE refusal, on its own (2026-08-26). The first rename carries
 * the WHOLE live tree into the backup dir, so an operator's `certs/`,
 * `.env.local` or `deploy/*.pem` — absent from the tree about to land — would
 * follow it there and the new tree would come up without them.
 *
 * DIRECTION-FREE, which is why it is the half a RESTORE can reuse: it asks
 * only "is this secret-shaped thing missing from the incoming tree?", a
 * question whose answer does not depend on which tree is newer. The walk
 * starts at `prefix: ''`, so root-level secrets are covered here too — the
 * root whitelist below adds nothing to the secret story.
 */
export function refuseUntrackedSecrets(codeRoot: string, targetRoot: string): void {
	const nestedSecrets = nestedUntrackedSecrets(codeRoot, targetRoot);
	if (nestedSecrets.length > 0) {
		refuseArchive(
			`Error. Untracked secret-shaped entries under shipped directories would be moved into the backup by the swap: ${nestedSecrets.join(', ')} — move them out of the tree before updating.`,
		);
	}
}

/** The ROOT WHITELIST + the secret walk (prepareQuarantine's first gates — see
 * its doc comment; the module header states the nested check's honest limit).
 *
 * UPDATE-ONLY, and the `shipped` set is why (2026-08-26). It reads the root of
 * the tree ABOUT TO LAND and refuses every live root entry missing from it —
 * sound only while the incoming tree is NEWER, so that what it ships is a
 * superset of what the outgoing one did. A RESTORE inverts that: the incoming
 * tree is older, so every root entry added by a release since the point was cut
 * (`SECURITY.md` + `.gitleaks.toml` in f6ded58d80, `cliff.toml` in 8a26b27a6d,
 * `install.sh` + `docker-compose.simple.yml` in 7e3a27e026 …) reads as
 * "unaccounted". Measured: restoring across 2026-08-03 refused with "move them
 * out of the tree (or delete them)" — telling the operator to delete SHIPPED
 * release files, in a sentence that says "before updating", on the one path
 * whose whole purpose is recovering a broken install. Worse, the verdict is
 * invisible to `restorabilityOf`, so the panel offered a button the pipeline
 * then refused — the disagreement both modules' headers forbid.
 *
 * So the restore path calls `refuseUntrackedSecrets` alone. What it gives up is
 * the non-secret-shaped operator drop-in, which on a restore is indistinguishable
 * from ordinary release drift; what it keeps is the hazard that actually loses
 * data. */
export function refuseUnaccountedLiveEntries(codeRoot: string, targetRoot: string): void {
	const shipped = new Set(readdirSync(codeRoot));
	const unknown = readdirSync(targetRoot).filter(
		(name) => !shipped.has(name) && !PRESERVE_ROOT_ENTRIES.has(name) && name !== 'node_modules',
	);
	if (unknown.length > 0) {
		refuseArchive(
			`Error. Unknown entries at the code-tree root would be moved into the backup by the swap: ${unknown.join(', ')} — move them out of the tree (or delete them) before updating.`,
		);
	}
	refuseUntrackedSecrets(codeRoot, targetRoot);
}

async function prepareQuarantine(
	codeRoot: string,
	targetRoot: string,
	stagingDir: string,
	seams: CodeUpdateSeams,
	phases: PhaseTracker,
): Promise<void> {
	refuseUnaccountedLiveEntries(codeRoot, targetRoot);

	phases.start('deps');
	const quarantinePin = readFileSync(join(codeRoot, '.bun-version'), 'utf8').trim();
	if (quarantinePin !== '' && quarantinePin !== Bun.version) {
		refuseUpdate(
			'update.refused',
			`Error. The release pins Bun ${quarantinePin} but this server runs Bun ${Bun.version} — install the pinned Bun first, then retry the update.`,
		);
	}
	await (seams.installDeps ?? installDepsReal)(codeRoot);

	phases.start('preflight');
	await (seams.smokeBoot ?? smokeBootQuarantine)(codeRoot, stagingDir);
}

/**
 * `assertSwapPreconditions`, but a refusal is REPORTED on the phase track
 * before it propagates. These gates (image channel, a runtime path inside the
 * tree, a backup root inside it) are the likeliest first-run outcomes, and they
 * fire before any phase has started — without this the operator watched an
 * all-pending track and got only a generic sentence.
 */
export function swapPreconditionsWithFrame(
	targetRoot: string,
	seams: CodeUpdateSeams,
	phases: PhaseTracker,
): string {
	try {
		return assertSwapPreconditions(targetRoot, seams);
	} catch (error) {
		phases.fail(errorText(error));
		throw error;
	}
}

/** The message a phase-frame carries for any thrown value. */
export function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * The EXCLUSIVE RUN LOCK — `<backupRoot>/.code_staging.lock`.
 *
 * Nothing in the request path serialized code updates. `stagingDir` is a fixed
 * path shared by every run; `prepareStagingDirOrRefuse` swept it
 * unconditionally; the client sends `prevent_lock: true` so the record lock is
 * bypassed; and `mediaJobs.submit` has NO duplicate guard (`hasLiveJobForTarget`
 * is advisory and only av_versions.ts consults it). Two admins pressing Update
 * — or one admin in two browsers, since the client's busy flag is per-browser
 * IndexedDB and sits on a different button — therefore ran two whole-tree
 * replacements against one staging dir. Three ways that ends badly, all
 * unattended, all on an install whose only recovery is the tree being replaced:
 *  - B sweeps A's quarantine AFTER A's smoke boot passed and nothing
 *    re-validates before the rename, so a partially-unlinked tree is renamed
 *    over the live one;
 *  - A's restart() fires 250 ms after its swap and can kill B between
 *    `renameToBackup` and `renameIntoPlace` — leaving NO tree at projectRoot;
 *  - both write `last_code_update.json`, so the second pending sentinel
 *    overwrites the first and the rollback contract names the wrong backupDir.
 *
 * The lock is a SIBLING of the staging dir, so the sweep cannot remove it. It
 * is reclaimable only from a provably dead owner: a stale lock left by a
 * successful swap (the process dies BY DESIGN in the restart) must never wedge
 * the next update.
 */
const RUN_LOCK_SUFFIX = '.lock';

/** `<backupRoot>/.code_staging.lock` — sibling of the staging dir it guards. */
export function codeRunLockPath(backupRoot: string): string {
	return `${codeStagingDir(backupRoot)}${RUN_LOCK_SUFFIX}`;
}

/** Is a pid live? `kill(pid, 0)` — EPERM means alive but not ours. */
function pidIsAlive(pid: number): boolean {
	if (!Number.isInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === 'EPERM';
	}
}

/**
 * Take the run lock or REFUSE. Returns the release function; only the holder
 * may sweep the staging dir.
 */
export function acquireRunLockOrRefuse(backupRoot: string, version: string): () => void {
	const lockPath = codeRunLockPath(backupRoot);
	mkdirSync(backupRoot, { recursive: true });
	for (let attempt = 0; attempt < 2; attempt++) {
		const release = takeRunLock(lockPath, version);
		if (release !== null) return release;
		// Held. Only a provably DEAD owner may be displaced.
		reclaimStaleRunLockOrRefuse(lockPath);
	}
	refuseUpdate('update.refused', 'Error. Could not take the code-update run lock.');
}

/**
 * One exclusive `wx` attempt: the release function when this process took the
 * lock, null when another holder has it. Any OTHER filesystem error is not a
 * contention answer and propagates.
 */
function takeRunLock(lockPath: string, version: string): (() => void) | null {
	let fd: number;
	try {
		fd = openSync(lockPath, 'wx');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'EEXIST') return null;
		throw error;
	}
	writeFileSync(
		fd,
		`${JSON.stringify({ pid: process.pid, version, startedAt: new Date().toISOString() })}\n`,
	);
	closeSync(fd);
	return () => {
		try {
			rmSync(lockPath, { force: true });
		} catch {
			/* a released lock that cannot be removed is reclaimed by the dead-pid rule */
		}
	};
}

/**
 * REFUSE while the recorded owner is alive; remove the lock when it is provably
 * gone. A stale lock left by a successful swap (the process dies BY DESIGN in
 * the restart) must never wedge the next update.
 */
function reclaimStaleRunLockOrRefuse(lockPath: string): void {
	let owner: { pid?: number; version?: string } = {};
	try {
		owner = JSON.parse(readFileSync(lockPath, 'utf8')) as typeof owner;
	} catch {
		owner = {};
	}
	if (typeof owner.pid === 'number' && pidIsAlive(owner.pid)) {
		refuseUpdate(
			'update.refused',
			`Error. A code update to ${owner.version ?? 'an unknown version'} is already running on this installation (pid ${owner.pid}) — wait for it to finish before starting another.`,
		);
	}
	console.error(
		`[code update] reclaiming a stale run lock at ${lockPath} (owner pid ${String(owner.pid ?? 'unknown')} is gone)`,
	);
	rmSync(lockPath, { force: true });
}

/** Refuse a staging dir holding a PARKED tree (a previous run's failed swap
 * restore — never sweep it), else sweep and recreate it empty. */
export function prepareStagingDirOrRefuse(stagingDir: string): void {
	if (existsSync(join(stagingDir, STAGING_KEEP_MARKER))) {
		refuseUpdate(
			'update.refused',
			'Error. The code-staging dir holds a parked tree from a previously failed swap restore — recover it (see the server log of that run) before updating.',
		);
	}
	rmSync(stagingDir, { recursive: true, force: true });
	mkdirSync(stagingDir, { recursive: true });
}

/**
 * The sentinel-guarded swap: pending sentinel FIRST (awaited and verified,
 * before the first rename — a failed write refuses while the live tree is
 * untouched), then the rename swap; when the swap fails FULLY RESTORED (live
 * tree back, no backup dir) the pending sentinel is retracted best-effort
 * (the rollback script tolerates a leftover pending sentinel naming a
 * nonexistent backupDir).
 */
export async function sentinelGuardedSwap(
	codeRoot: string,
	targetRoot: string,
	backupRoot: string,
	backupDir: string,
	stagingDir: string,
	sentinel: UpdateSentinel,
	seams: CodeUpdateSeams,
): Promise<void> {
	try {
		await writeUpdateSentinel(backupRoot, sentinel);
	} catch (error) {
		rethrowOrRefuseUpdate(
			error,
			'update.failed',
			'Error. Could not record the update sentinel (the rollback contract requires it) — nothing was swapped, the live tree is untouched',
		);
	}
	try {
		renameSwap(codeRoot, targetRoot, backupDir, stagingDir, seams);
	} catch (error) {
		retractSentinelIfFullyRestored(targetRoot, backupRoot, backupDir);
		throw error;
	}
}

/** Best-effort pending-sentinel retraction after a swap failure that left the
 * live tree fully restored in place (no backup dir was created). */
function retractSentinelIfFullyRestored(
	targetRoot: string,
	backupRoot: string,
	backupDir: string,
): void {
	if (existsSync(targetRoot) && !existsSync(backupDir)) {
		try {
			rmSync(join(backupRoot, 'last_code_update.json'), { force: true });
		} catch {
			// best-effort retraction only
		}
	}
}

/**
 * THE DISK-SPACE GATE, before the first byte is downloaded. Peak cost of an
 * update is a second copy of the live tree in staging (archive + extracted tree
 * + its own node_modules); disk_space.ts measures both sides. An unmeasurable
 * side never refuses — see checkUpdateSpace.
 *
 * Placed here, and not later, because every phase after it SPENDS disk: the
 * remote install of 2026-08-25 downloaded, verified and extracted a release
 * before dying inside `bun install` with a screenful of NoSpaceLeft.
 *
 * PRESERVE_ROOT_ENTRIES is handed to the measure because those entries are
 * MOVED by the swap, never staged — counting `.git` would refuse updates that
 * fit comfortably (see disk_space.ts).
 */
async function refuseOnInsufficientSpace(
	targetRoot: string,
	backupRoot: string,
	seams: SpaceSeams,
): Promise<void> {
	const space = await checkUpdateSpace(targetRoot, backupRoot, PRESERVE_ROOT_ENTRIES, seams);
	if (space.sufficient) {
		// A null side means the gate could not run. It does not refuse (see
		// checkUpdateSpace), but it says so — an update that later dies of
		// ENOSPC must not look like one this check cleared.
		if (space.available === null || space.required === null) {
			console.warn(
				`[code update] disk-space gate DISARMED (available=${space.available}, required=${space.required}) — proceeding unchecked`,
			);
		}
		return;
	}
	refuseUpdate(
		'update.refused',
		`Error. Not enough free disk space to install a release: ${formatGb(space.available ?? 0)} available where the update stages (${backupRoot}), about ${formatGb(space.required ?? 0)} needed — free space and retry.`,
	);
}

/** The full code-update pipeline. Seam-driven; production passes no seams. */
export async function updateCode(
	rawOptions: unknown,
	principal: Principal,
	seams: CodeUpdateSeams = {},
): Promise<CodeUpdateResponse> {
	if (!engineOwnsInstall()) {
		refuseUpdate('update.refused', 'Error. Code update is not runnable on this engine');
	}
	// Preconditions + request shape FIRST — a malformed request (including a
	// missing/malformed sha) refuses BEFORE any network fetch, by contract.
	const request = parseUpdateRequest(rawOptions, principal);
	const { version } = request;

	const targetRoot = seams.targetRoot ?? projectRoot;
	// The tracker is built BEFORE the swap preconditions so their refusals (the
	// image channel, a runtime path inside the tree, an unknown root entry — the
	// likeliest first-run outcomes) still reach the operator's phase track.
	// Built after parseUpdateRequest because the frames carry the version.
	const phases = createPhaseTracker(version, seams.onPhase, request.backupWaived);
	const backupRoot = swapPreconditionsWithFrame(targetRoot, seams, phases);
	const stagingDir = codeStagingDir(backupRoot);
	const restart = seams.restart ?? scheduleServerRestartReal;

	// SINGLE-FLIGHT. Taken before anything reads or writes the shared staging
	// dir, and released only in the `finally` — a second run refuses here
	// instead of sweeping the first run's quarantine out from under it.
	const releaseRunLock = acquireRunLockOrRefuse(backupRoot, version);

	try {
		prepareStagingDirOrRefuse(stagingDir);
		await refuseOnInsufficientSpace(targetRoot, backupRoot, seams.space ?? {});

		const zipPath = await acquireVerifiedArchive(request, stagingDir, seams, phases);

		phases.start('extract');
		const quarantine = join(stagingDir, 'extract');
		const codeRoot = await extractArchive(zipPath, quarantine);
		writeInstallStampSync(codeRoot, request);

		await prepareQuarantine(codeRoot, targetRoot, stagingDir, seams, phases);

		phases.start('swap');
		const stamp = new Date().toISOString().slice(0, 19).replaceAll(':', '-');
		const previousVersion = DEDALO_VERSION_TRIPLE.join('.');
		const backupDir = join(
			backupRoot,
			backupDirName(previousVersion, installedDigestOf(targetRoot), stamp),
		);
		mkdirSync(backupRoot, { recursive: true });

		// ROLLBACK SENTINEL FIRST — `status:"pending"`, naming the backupDir the
		// swap INTENDS to create, awaited and verified, BEFORE the first rename.
		// A crash anywhere inside the swap always leaves a pending sentinel for
		// the supervisor-side rollback (which tolerates a not-yet-created backupDir).
		await sentinelGuardedSwap(
			codeRoot,
			targetRoot,
			backupRoot,
			backupDir,
			stagingDir,
			{
				version,
				previousVersion,
				updateMode: 'clean',
				stamp,
				backupDir,
				installDigest: request.declaredSha,
				status: 'pending',
				rollback_attempted: false,
				backup_waived: request.backupWaived,
			},
			seams,
		);

		const msg = `OK. Installed Dédalo ${version} (clean). Restarting to load the new code.`;
		// The LAST frame before the restart: the client uses expected_version to
		// tell "restarting into new code" apart from "died", then polls /health.
		phases.start('restart', { expected_version: version });
		restart(`code update to ${version}`);
		return ok({ version }, { requestId: currentRequestId(), extend: { msg } });
	} catch (error) {
		phases.fail(errorText(error));
		rethrowOrRefuseUpdate(error, 'update.failed', 'Error. Code update failed');
	} finally {
		cleanStagingDir(stagingDir);
		// Released AFTER the staging sweep, so no other run can enter while this
		// one is still touching the dir. On the success path the process dies in
		// the restart moments later; the lock left behind names a pid that is
		// gone, which the dead-owner rule reclaims on the next attempt.
		releaseRunLock();
	}
}

function scheduleServerRestartReal(reason: string): void {
	void import('../install/restart.ts').then(({ scheduleServerRestart }) => {
		scheduleServerRestart(`code update: ${reason}`);
	});
}
