/**
 * THE RELEASE FILES DIRECTORY — provisioning for `DEDALO_CODE_FILES_DIR`, the
 * root a code server writes its release archives into
 * (`<dir>/<major>/<major.minor>/<version>.zip` + `.sha256`).
 *
 * WHY THIS EXISTS (2026-08-24). The key is CONFIGURED but the directory did
 * not exist, and nothing created it: `code_build.ts` only mkdirs the
 * `<major>/<major.minor>` leaf when a build actually runs, `code_manifest.ts`
 * answers "no releases" for a missing root, `code_serving.ts` serves nothing,
 * and the readiness panel's `files_dir` check just reported `blocked`. So a
 * freshly deployed code server looked misconfigured until someone mkdir'd by
 * hand — and, when they did, at whatever mode their umask happened to give.
 * (In this checkout the default target is the gitignored `<repo>/code/`, which
 * a fresh clone never carries.)
 *
 * THE SHAPE. A boot pass, like `provisionMediaTreeAtBoot`: the installer step
 * cannot reach a box that is long past installing, and a server can be turned
 * into a code server by an `.env` edit at any time. `CODE_DIR_MODE` (0750) is
 * the deliberate answer to "correct privileges": the archives are served by
 * this process alone (`serveCodeReleaseRequest`), never by the web server
 * directly, so nothing outside the Dédalo user needs to read them.
 *
 * NEVER THROWS and never refuses the boot (S1-15 posture): a code server that
 * cannot provision its release dir must still serve its own archive's records.
 * An EXISTING directory is never chmod'd — an operator who widened the mode
 * deliberately (a shared build user, a rsync mirror) keeps it, and gets one
 * warning line instead of a silent permission change under their feet.
 */

import { chmodSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { config } from '../../config/config.ts';
import { dirIsWritable } from '../install/dir_probe.ts';

/** The mode a release directory is CREATED at (0750 — see the header). */
export const CODE_DIR_MODE = 0o750;

/** What the boot pass did, for the gate to assert on. */
export interface CodeFilesDirReport {
	/** The configured root; null when the key is unset (nothing to provision). */
	readonly path: string | null;
	/** True when this pass created it (as opposed to finding it). */
	readonly created: boolean;
	/** Write+unlink probe result — false when it exists but is not usable. */
	readonly writable: boolean;
	/**
	 * False when something exists at the path and is NOT a directory. A distinct
	 * fact from `writable`: the probe on a regular file fails with ENOTDIR, and
	 * reporting that as "check the permissions" sends the operator after the
	 * wrong thing (the panel meanwhile reads `ok` — `directoryCheck` in status.ts
	 * asks the same question).
	 */
	readonly isDirectory: boolean;
	/** The observed mode of the path (permission bits), or null when absent. */
	readonly mode: number | null;
	/** The mkdir failure, when there was one. */
	readonly error: Error | null;
}

/** Permission bits of a path, or null when it cannot be stat'd. */
function modeOf(path: string): number | null {
	try {
		return statSync(path).mode & 0o777;
	} catch {
		return null;
	}
}

/**
 * FORCE the mode on every level this pass minted — `mkdirSync`'s `mode` is
 * `mode & ~umask` like every other mkdir, so under a hardened `UMask=0077`
 * (a common systemd default) the "0750" it was asked for lands as 0700. The
 * module exists precisely so the mode is NOT whatever the umask gave, and a
 * log line quoting CODE_DIR_MODE must not be able to lie about what is on
 * disk. `mkdirSync(…, {recursive:true})` returns the FIRST path it created,
 * which bounds the walk exactly: levels that already existed are never
 * touched, only the ones this call brought into being.
 */
function forceModeOnCreated(firstCreated: string, dir: string): void {
	const top = resolve(firstCreated);
	const segments = relative(top, resolve(dir))
		.split(sep)
		.filter((part) => part !== '');
	let path = top;
	chmodSync(path, CODE_DIR_MODE);
	for (const segment of segments) {
		path = resolve(path, segment);
		chmodSync(path, CODE_DIR_MODE);
	}
}

/**
 * Create the configured release files directory when it is missing.
 *
 * `recursive:true` because the configured path is routinely a fresh subtree
 * (`/srv/dedalo/code`); the mode is then FORCED on the levels it minted (see
 * `forceModeOnCreated` — the `mode` option alone is umask-dependent).
 */
export function ensureCodeFilesDir(dir: string): CodeFilesDirReport {
	if (existsSync(dir)) {
		const isDirectory = statSync(dir).isDirectory();
		return {
			path: dir,
			created: false,
			writable: isDirectory && dirIsWritable(dir),
			isDirectory,
			mode: modeOf(dir),
			error: null,
		};
	}
	try {
		const firstCreated = mkdirSync(dir, { recursive: true, mode: CODE_DIR_MODE });
		if (firstCreated !== undefined) forceModeOnCreated(firstCreated, dir);
	} catch (error) {
		return {
			path: dir,
			created: false,
			writable: false,
			isDirectory: false,
			mode: modeOf(dir),
			error: error as Error,
		};
	}
	return {
		path: dir,
		created: true,
		writable: dirIsWritable(dir),
		isDirectory: true,
		mode: modeOf(dir),
		error: null,
	};
}

/**
 * THE PRODUCTION ENTRY POINT — called from `src/server.ts` on every start.
 *
 * Gated on `IS_A_CODE_SERVER`: an ordinary install that inherited the key from
 * a copied `.env` has no business minting a release tree it will never write
 * to. Returns null when there is nothing to provision.
 */
export function ensureCodeFilesDirAtBoot(): CodeFilesDirReport | null {
	if (config.update.isCodeServer !== true) return null;
	const configured = config.update.codeFilesDir;
	if (configured === undefined || configured === '') return null;

	const report = ensureCodeFilesDir(configured);
	if (report.error !== null) {
		console.error(
			`[code files dir] could not create the release files directory '${configured}' ` +
				'(DEDALO_CODE_FILES_DIR) — this code server can publish and serve NOTHING until ' +
				'it exists. Cause:',
			report.error,
		);
		return report;
	}
	if (report.created) {
		// The OBSERVED mode, never the constant: the line is the operator's only
		// evidence of what landed on disk, so it must not restate an intention.
		console.warn(
			`[code files dir] created the release files directory '${configured}' at mode ` +
				`${(report.mode ?? 0).toString(8).padStart(4, '0')} (DEDALO_CODE_FILES_DIR).`,
		);
	}
	if (!report.isDirectory) {
		console.error(
			`[code files dir] '${configured}' (DEDALO_CODE_FILES_DIR) EXISTS but is not a ` +
				'directory — no release can be built or served from it. Move the file out of ' +
				'the way, or point the key somewhere else.',
		);
		return report;
	}
	if (!report.writable) {
		console.error(
			`[code files dir] the release files directory '${configured}' is NOT writable by this ` +
				'process — release builds will refuse. Fix its ownership/permissions.',
		);
	}
	return report;
}
