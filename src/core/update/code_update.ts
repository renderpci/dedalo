/**
 * Code-update ENGINE (UPDATE_PROCESS Phase 4 — PHP update_code::update_code +
 * update_clean/update_incremental). Downloads the selected release archive,
 * VERIFIES its sha256, PRE-VALIDATES every zip entry (zipinfo) so no unsafe
 * or symlink entry is ever extracted, extracts into a QUARANTINE dir, swaps
 * it onto the TS tree (rename-based; old tree backed up), writes a durable
 * pending-result record, and restarts so the supervisor boots the new code.
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
 *    swap with the old tree backed up (same-device asserted for atomicity).
 *  - Live swap REFUSED without a supervisor (a self-exit would not restart).
 * The engine is seam-driven (`targetRoot`/`backupRoot`/`restart`/`verifySha`/
 * `supervised`) so tests drive the full download→validate→extract→swap chain
 * against a TEMP tree — the live projectRoot swap is an operator drill
 * (ledgered), never an automated test.
 */

import { createHash } from 'node:crypto';
import {
	closeSync,
	cpSync,
	existsSync,
	lstatSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	readSync,
	renameSync,
	rmSync,
	statSync,
} from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { config } from '../../config/config.ts';
import { projectRoot, readEnv } from '../../config/env.ts';
import { DedaloError, ok } from '../errors/index.ts';
import type { ApiEnvelope } from '../errors/schema.ts';
import { currentRequestContext } from '../security/request_context.ts';
import { downloadReleaseArchive } from './code_download.ts';
import { engineOwnsInstall } from './ownership.ts';
import { refuseUpdate, rethrowOrRefuseUpdate } from './refuse.ts';
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
const PRESERVE_ROOT_ENTRIES: ReadonlySet<string> = new Set(['node_modules', '.git']);

/**
 * The pipeline's answer IS the wire body (the update_code widget returns it
 * verbatim), so it is ENVELOPE v2 — `data` is the installed release, `msg` an
 * extension key. Every gate REFUSES BY THROWING a registered `update.*` /
 * `request.invalid_options` code (./refuse.ts); nothing here builds a failure
 * body.
 */
export type CodeUpdateResponse = ApiEnvelope;

/** The current RQO's id (the widget dispatcher opens the scope), or '' outside a request. */
function currentRequestId(): string {
	return currentRequestContext()?.requestId ?? '';
}

export interface CodeUpdateSeams {
	targetRoot?: string;
	backupRoot?: string;
	restart?: (reason: string) => void;
	verifySha?: (filePath: string) => string;
	/** Override supervisor detection (tests). */
	supervised?: boolean;
}

function sha256Of(filePath: string): string {
	return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/** Is a process supervisor present (systemd/docker/pm2)? A self-exit only
 * restarts under one — otherwise the live swap would kill the server dead. */
function isSupervised(): boolean {
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

/** One name-validity check shared by pre- and post-extraction. */
function entryNameIsSafe(name: string): boolean {
	if (name === '' || name.includes('\0')) return false;
	const normalized = name.replaceAll('\\', '/');
	if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) return false; // absolute
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
	// Verbose zipinfo shows the unix mode in the first column; 'l' = symlink.
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
			entries += 1;
			if (entries > MAX_ARCHIVE_ENTRIES) refuseArchive('archive exceeds the entry-count cap');
			if (stat.isDirectory()) walk(full);
			else if (stat.isFile()) {
				bytes += stat.size;
				if (bytes > MAX_EXTRACTED_TOTAL_BYTES) refuseArchive('archive exceeds the size cap');
			} else {
				refuseArchive(
					'the archive contains a non-regular entry',
					`non-regular extracted entry: ${name}`,
				);
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
 */
export function assertLinearUpgrade(
	current: readonly number[],
	target: readonly number[],
): string | null {
	if (compareVersionArrays(target, current) !== 1)
		return 'refusing a downgrade or same-version install';
	const [cMajor = 0, cMinor = 0] = current;
	const [tMajor = 0, tMinor = 0, tPatch = 0] = target;
	if (tMajor > cMajor + 1) return 'major version skip is not allowed';
	if (tMajor === cMajor && tMinor > cMinor + 1) return 'minor version skip is not allowed';
	if ((tMajor > cMajor || tMinor > cMinor) && tPatch !== 0)
		return 'a minor/major bump must land on .0';
	return null;
}

/** Rename-based clean swap: old tree → backup, new tree → target (atomic renames). */
function renameSwap(codeRoot: string, targetRoot: string, backupDir: string): void {
	// Same-device assert so the renames are atomic (a cross-device rename throws).
	if (statSync(targetRoot).dev !== statSync(resolve(backupDir, '..')).dev) {
		refuseArchive('backup dir is on a different filesystem — rename swap would not be atomic');
	}
	// Carry the preserved runtime entries into the new tree before the swap.
	for (const name of PRESERVE_ROOT_ENTRIES) {
		const from = join(targetRoot, name);
		if (existsSync(from)) {
			renameSync(from, join(codeRoot, name));
		}
	}
	renameSync(targetRoot, backupDir);
	renameSync(codeRoot, targetRoot);
}

/** Incremental overlay: new files onto the live tree, existing kept (test seam). */
function incrementalSwap(codeRoot: string, targetRoot: string): void {
	for (const name of readdirSync(codeRoot)) {
		if (PRESERVE_ROOT_ENTRIES.has(name)) continue;
		cpSync(join(codeRoot, name), join(targetRoot, name), { recursive: true, force: true });
	}
}

interface UpdateCodeOptions {
	file?: { version?: unknown; url?: unknown; sha256?: unknown; force_update_mode?: unknown };
	update_mode?: unknown;
}

/** The full code-update pipeline. Seam-driven; production passes no seams. */
export async function updateCode(
	rawOptions: unknown,
	seams: CodeUpdateSeams = {},
): Promise<CodeUpdateResponse> {
	if (!engineOwnsInstall()) {
		refuseUpdate('update.refused', 'Error. Code update is not runnable on this engine');
	}
	const options = (rawOptions ?? {}) as UpdateCodeOptions;
	const file = options.file ?? {};
	const url = typeof file.url === 'string' ? file.url : '';
	const version = typeof file.version === 'string' ? file.version : '';
	const declaredSha = typeof file.sha256 === 'string' ? file.sha256 : '';
	const updateMode =
		options.update_mode === 'clean' || file.force_update_mode === 'clean' ? 'clean' : 'incremental';
	if (url === '' || version === '') {
		refuseUpdate(
			'request.invalid_options',
			'Error. Missing release file/version (file.url and file.version are required)',
		);
	}
	// CMD-06 (2026-07-28 audit): `version` is used downstream as a path segment,
	// and parseVersionString/compareVersionArrays NaN-short-circuit — so a
	// traversal value like `../../x` could slip the linear-upgrade gate. Require a
	// strict numeric-dotted form up front so it can never be a path or an option.
	if (!/^\d+(\.\d+){1,3}$/.test(version)) {
		refuseUpdate(
			'request.invalid_options',
			'Error. Malformed release version (a numeric dotted release is required, e.g. 7.0.1)',
		);
	}
	const target = parseVersionString(version);
	const linear = assertLinearUpgrade(DEDALO_VERSION_TRIPLE, target);
	if (linear !== null) {
		refuseUpdate('update.refused', `Error. ${linear}`);
	}
	// A release is installed ONLY against a declared digest. The manifest carries
	// one for every built archive (code_manifest.readShaSidecar), so an ABSENT
	// hash means either a master that never wrote the sidecar or a hand-assembled
	// request — neither is a thing to swap a code tree for. Until 2026-08-15 an
	// empty `file.sha256` silently skipped the check, which made WC-024's whole
	// integrity guarantee inert (the manifest never carried a hash at all).
	if (!/^[a-f0-9]{64}$/.test(declaredSha)) {
		refuseUpdate(
			'request.invalid_options',
			'Error. Malformed or missing release checksum (sha256 must be 64 hex chars)',
		);
	}

	const targetRoot = seams.targetRoot ?? projectRoot;
	const supervised = seams.supervised ?? isSupervised();
	// Only the LIVE tree needs a supervisor (a self-exit must be respawned);
	// a seam-driven test swap of a temp tree does not restart the process.
	if (targetRoot === projectRoot && !supervised) {
		refuseUpdate(
			'update.refused',
			'Error. No supervisor detected; the server would not restart onto the new tree. Set DEDALO_SUPERVISED=true.',
		);
	}
	const backupRoot =
		seams.backupRoot ??
		(readEnv('DEDALO_BACKUP_PATH') as string | undefined) ??
		join(projectRoot, '..', 'backups', 'code');
	const stagingDir = join(backupRoot, '.code_staging');
	const restart = seams.restart ?? scheduleServerRestartReal;
	const verifySha = seams.verifySha ?? sha256Of;

	try {
		rmSync(stagingDir, { recursive: true, force: true });
		mkdirSync(stagingDir, { recursive: true });

		const codeServer = config.update.codeServers.find((entry) => {
			try {
				return new URL(entry.url).origin === new URL(url).origin;
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
		const zipPath = join(stagingDir, `${version}.zip`);
		// A download failure THROWS out of downloadReleaseArchive (typed).
		await downloadReleaseArchive({
			url,
			configuredOrigin: new URL(codeServer.url).origin,
			targetPath: zipPath,
		});

		if (verifySha(zipPath) !== declaredSha) {
			refuseUpdate('update.refused', 'Error. Release checksum mismatch — refusing to install');
		}
		if (!looksLikeZip(zipPath)) {
			refuseUpdate('update.refused', 'Error. Downloaded release is not a ZIP archive');
		}
		const preValidation = await preValidateArchive(zipPath);
		if (preValidation !== null) {
			refuseUpdate('update.refused', `Error. Unsafe release archive: ${preValidation}`);
		}

		const quarantine = join(stagingDir, 'extract');
		const codeRoot = await extractArchive(zipPath, quarantine);

		const stamp = new Date().toISOString().slice(0, 19).replaceAll(':', '-');
		if (updateMode === 'clean') {
			mkdirSync(backupRoot, { recursive: true });
			renameSwap(
				codeRoot,
				targetRoot,
				join(backupRoot, `dedalo_${DEDALO_VERSION_TRIPLE.join('.')}_${stamp}`),
			);
		} else {
			incrementalSwap(codeRoot, targetRoot);
		}

		writePendingResult(backupRoot, { version, updateMode, stamp, ok: true });
		const msg = `OK. Installed Dédalo ${version} (${updateMode}). Restarting to load the new code.`;
		restart(`code update to ${version}`);
		return ok(
			{ version, update_mode: updateMode },
			{ requestId: currentRequestId(), extend: { msg } },
		);
	} catch (error) {
		rethrowOrRefuseUpdate(error, 'update.failed', 'Error. Code update failed');
	} finally {
		rmSync(stagingDir, { recursive: true, force: true });
	}
}

function writePendingResult(
	backupRoot: string,
	record: { version: string; updateMode: string; stamp: string; ok: boolean },
): void {
	try {
		mkdirSync(backupRoot, { recursive: true });
		Bun.write(join(backupRoot, 'last_code_update.json'), JSON.stringify(record));
	} catch {
		// best-effort mirror
	}
}

function scheduleServerRestartReal(reason: string): void {
	void import('../install/restart.ts').then(({ scheduleServerRestart }) => {
		scheduleServerRestart(`code update: ${reason}`);
	});
}
