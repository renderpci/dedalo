/**
 * Build provenance — reads the sibling `build_info.txt` once at module init.
 *
 * The committed file holds the literal `$Format:%H %cI$` placeholder; a
 * release zip is produced by `git archive` (code_build.ts) and `.gitattributes`
 * marks the file `export-subst`, so INSIDE a release archive it holds the real
 * `<commit sha> <commit ISO date>`. That one signal answers both provenance
 * questions:
 *  - DEDALO_BUILD: the commit date on a release, null on a dev checkout —
 *    what the update_code widget shows as "Current build", so after an update
 *    the operator can SEE that new code is live.
 *  - DEDALO_PRERELEASE_TAG: '.dev' on a dev checkout, '' on a release —
 *    replaces the pre-provenance hardcoded '.dev' pin in version.ts.
 *
 * Imports only version.ts (a leaf) + node builtins; never throws at import —
 * any unreadable/malformed file degrades to the dev posture.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INSTALLED_CHANNEL, type InstallChannel } from './install_stamp.ts';
import { DEDALO_VERSION } from './version.ts';

/** Parsed provenance: null build ⇒ dev tree. */
export interface BuildInfo {
	/** Commit sha of the release archive, or null on a dev checkout. */
	sha: string | null;
	/** Commit ISO date of the release archive, or null on a dev checkout. */
	build: string | null;
}

const DEV: BuildInfo = Object.freeze({ sha: null, build: null });

/**
 * Parse build_info.txt content. The unexpanded `$Format:` placeholder, an
 * empty/missing file, or ANY malformed content → dev values (never a throw:
 * a broken stamp must not take the server down).
 */
export function parseBuildInfo(content: string): BuildInfo {
	const line = content.trim();
	if (line === '' || /^\$Format:/.test(line)) return DEV;
	const match = /^([0-9a-f]{7,64})\s+(\d{4}-\d{2}-\d{2}T[0-9:.+\-Z]+)$/.exec(line);
	if (match === null) return DEV;
	return Object.freeze({ sha: match[1] as string, build: match[2] as string });
}

function readBuildInfo(): BuildInfo {
	try {
		return parseBuildInfo(readFileSync(join(import.meta.dir, 'build_info.txt'), 'utf8'));
	} catch {
		return DEV;
	}
}

const INFO = readBuildInfo();

/** Release build stamp (commit ISO date) — null on a dev checkout. */
export const DEDALO_BUILD: string | null = INFO.build;

/**
 * The COMMIT the running release was built from — null on a dev checkout.
 * The date alone answers "is new code live?"; the sha answers "WHICH code",
 * which is what an operator needs when comparing an install against a master's
 * HEAD (update_code's status panel shows both side by side).
 */
export const DEDALO_BUILD_SHA: string | null = INFO.sha;

/**
 * Prerelease tag appended to the code-version string: '.dev' on a dev checkout
 * OR a dev-channel install, '' on a published release (PHP appended '.dev'
 * when DEVELOPMENT_SERVER; here the signal is provenance, not config).
 *
 * THE CHANNEL CLAUSE IS LOAD-BEARING (2026-08-24). Build provenance alone
 * cannot answer "is this a release": `build_info.txt` is `export-subst`, so a
 * `v7` branch build is expanded exactly like a `master` one, and a dev-channel
 * install would otherwise report a bare `7.0.1` everywhere it is asked —
 * /health, page_globals.dedalo_version, the login About panel, the maintenance
 * panel — while running code that was never released. An archive with no
 * install stamp (any release built before stamps existed) keeps the bare
 * string: absence of evidence is not evidence of a branch build.
 */
export function prereleaseTagFor(
	build: string | null,
	channel: InstallChannel | null,
): string {
	if (build === null) return '.dev';
	return channel === 'dev' ? '.dev' : '';
}

export const DEDALO_PRERELEASE_TAG: string = prereleaseTagFor(INFO.build, INSTALLED_CHANNEL);

/** The code-version string the client displays (PHP DEDALO_VERSION). */
export const DEDALO_ENGINE_VERSION: string = `${DEDALO_VERSION}${DEDALO_PRERELEASE_TAG}`;
