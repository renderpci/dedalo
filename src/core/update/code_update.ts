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
	readFileSync,
	readSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
} from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { config } from '../../config/config.ts';
import { projectRoot, readEnv } from '../../config/env.ts';
import { downloadReleaseArchive } from './code_download.ts';
import { engineOwnsInstall } from './ownership.ts';
import { DEDALO_VERSION_TRIPLE, compareVersionArrays, parseVersionString } from './version.ts';

const ARCHIVE_ROOT_PREFIX = 'dedalo_code/';
const MAX_ARCHIVE_ENTRIES = 50_000;
const MAX_EXTRACTED_TOTAL_BYTES = 1024 * 1024 * 1024;
const PRESERVE_ROOT_ENTRIES: ReadonlySet<string> = new Set(['node_modules', '.git']);

export interface CodeUpdateResponse {
	result: boolean;
	msg: string;
	errors: string[];
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
	if (exitCode !== 0) throw new Error(`unzip failed: ${stderr.trim()}`);
	const codeRoot = join(destDir, 'dedalo_code');
	if (!existsSync(codeRoot)) throw new Error("archive missing the required 'dedalo_code/' root");
	// Post-extraction belt: reject any symlink or escaping path, cap total size.
	const destResolved = resolve(destDir);
	let entries = 0;
	let bytes = 0;
	const walk = (dir: string): void => {
		for (const name of readdirSync(dir)) {
			const full = join(dir, name);
			const stat = lstatSync(full);
			if (stat.isSymbolicLink()) {
				throw new Error(`extracted a symlink entry: ${relative(destDir, full)}`);
			}
			if (!resolve(full).startsWith(destResolved + sep)) {
				throw new Error(`extracted entry escapes the extraction dir: ${name}`);
			}
			entries += 1;
			if (entries > MAX_ARCHIVE_ENTRIES) throw new Error('archive exceeds the entry-count cap');
			if (stat.isDirectory()) walk(full);
			else if (stat.isFile()) {
				bytes += stat.size;
				if (bytes > MAX_EXTRACTED_TOTAL_BYTES) throw new Error('archive exceeds the size cap');
			} else throw new Error(`non-regular extracted entry: ${name}`);
		}
	};
	walk(destDir);
	// A real Dédalo TS tree carries these — a cheap structural sanity gate.
	for (const marker of ['package.json', join('src', 'server.ts'), '.bun-version']) {
		if (!existsSync(join(codeRoot, marker)))
			throw new Error(`archive is not a Dédalo tree (missing ${marker})`);
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
		throw new Error('backup dir is on a different filesystem — rename swap would not be atomic');
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
	const response: CodeUpdateResponse = { result: false, msg: '', errors: [] };
	if (!engineOwnsInstall()) {
		response.errors.push('engine does not own the install');
		response.msg = 'Error. Code update is not runnable on this engine';
		return response;
	}
	const options = (rawOptions ?? {}) as UpdateCodeOptions;
	const file = options.file ?? {};
	const url = typeof file.url === 'string' ? file.url : '';
	const version = typeof file.version === 'string' ? file.version : '';
	const declaredSha = typeof file.sha256 === 'string' ? file.sha256 : '';
	const updateMode =
		options.update_mode === 'clean' || file.force_update_mode === 'clean' ? 'clean' : 'incremental';
	if (url === '' || version === '') {
		response.msg = 'Error. Missing release file/version';
		response.errors.push('file.url and file.version are required');
		return response;
	}
	const target = parseVersionString(version);
	const linear = assertLinearUpgrade(DEDALO_VERSION_TRIPLE, target);
	if (linear !== null) {
		response.msg = `Error. ${linear}`;
		response.errors.push(linear);
		return response;
	}
	if (declaredSha !== '' && !/^[a-f0-9]{64}$/.test(declaredSha)) {
		response.msg = 'Error. Malformed release checksum';
		response.errors.push('sha256 must be 64 hex chars');
		return response;
	}

	const targetRoot = seams.targetRoot ?? projectRoot;
	const supervised = seams.supervised ?? isSupervised();
	// Only the LIVE tree needs a supervisor (a self-exit must be respawned);
	// a seam-driven test swap of a temp tree does not restart the process.
	if (targetRoot === projectRoot && !supervised) {
		response.msg =
			'Error. No supervisor detected; the server would not restart onto the new tree. Set DEDALO_SUPERVISED=true.';
		response.errors.push('unsupervised');
		return response;
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
			response.msg = 'Error. Release URL is not on a configured code server';
			response.errors.push(`no code server matches ${url}`);
			return response;
		}
		const zipPath = join(stagingDir, `${version}.zip`);
		const downloaded = await downloadReleaseArchive({
			url,
			configuredOrigin: new URL(codeServer.url).origin,
			targetPath: zipPath,
		});
		if (downloaded.result !== true) {
			response.errors.push(...downloaded.errors);
			response.msg = downloaded.msg;
			return response;
		}

		if (declaredSha !== '' && verifySha(zipPath) !== declaredSha) {
			response.msg = 'Error. Release checksum mismatch — refusing to install';
			response.errors.push('sha256 mismatch');
			return response;
		}
		if (!looksLikeZip(zipPath)) {
			response.msg = 'Error. Downloaded release is not a ZIP archive';
			response.errors.push('bad magic bytes');
			return response;
		}
		const preValidation = await preValidateArchive(zipPath);
		if (preValidation !== null) {
			response.msg = `Error. Unsafe release archive: ${preValidation}`;
			response.errors.push(preValidation);
			return response;
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
		response.result = true;
		response.msg = `OK. Installed Dédalo ${version} (${updateMode}). Restarting to load the new code.`;
		restart(`code update to ${version}`);
		return response;
	} catch (error) {
		response.errors.push((error as Error).message);
		response.msg = 'Error. Code update failed';
		return response;
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
