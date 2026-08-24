/**
 * Code-update DISCOVERY (UPDATE_PROCESS Phase 4) — the master-side release
 * manifest (PHP update_code::get_code_update_info) and the client-side linear
 * upgrade-path check (PHP update_code.js supported_code_version).
 *
 * The manifest advertises ONLY release archives that (a) sit on the linear
 * upgrade path from the caller's version and (b) actually exist on disk. The
 * TS UPDATE_CATALOG is EMPTY for 7.x, so a stock 7.0.0 master advertises no
 * releases — correct: there is no next version to build yet.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { UPDATE_CATALOG } from './catalog.ts';
import { compareVersionArrays } from './version.ts';

/**
 * One advertised release (PHP file_item).
 *
 * `sha256` is SNAKE-adjacent wire spelling because the client forwards the
 * whole item back as `options.file` (`file.sha256`). `force_update_mode` LEFT
 * the wire with the clean-only pipeline
 * (WC-2026-08-23-update-mode-clean-only): clean is the only install mode, so
 * the manifest advertises nothing to branch on.
 */
export interface CodeReleaseItem {
	version: string;
	url: string;
	date: string;
	/** sha256 of the archive, from the `<file>.zip.sha256` sidecar (WC-024). */
	sha256?: string;
}

export interface CodeUpdateInfo {
	info: {
		version: string;
		date: string;
		entity_id: number | string | null;
		entity: string | null;
		host: string | null;
	};
	files: CodeReleaseItem[];
}

/**
 * The versions on the LINEAR upgrade path from `clientVersion` (PHP
 * get_code_update_info walk): the next minor within the current major must be
 * exhausted before the next major boundary (x.0.0) becomes visible. Returns
 * the catalog target triples in ascending order.
 */
export function linearUpgradeTargets(
	clientVersion: readonly number[],
	catalog: typeof UPDATE_CATALOG = UPDATE_CATALOG,
): number[][] {
	const client = normalizedClientTriple(clientVersion);
	const targets: number[][] = [];
	let nextMajor: number[] | null = null;
	let nextMinor: number[] | null = null;
	for (const descriptor of Object.values(catalog)) {
		const triple = [descriptor.versionMajor, descriptor.versionMedium, descriptor.versionMinor];
		const rung = upgradeRung(triple, client);
		if (rung === 'major') nextMajor = triple;
		else if (rung === 'minor') nextMinor = triple;
		else if (rung === 'patch') targets.push(triple);
	}
	appendBoundaryTarget(targets, nextMinor, nextMajor);
	// One dedupe over the WHOLE list (defect D17, fixed 2026-08-09): the same
	// triple can be reached from two catalog keys, not only from the boundary
	// candidate, and a duplicated rung would be advertised twice in the manifest.
	const unique = [...new Map(targets.map((triple) => [triple.join('.'), triple])).values()];
	return unique.sort(compareVersionArrays);
}

/** The ONE boundary rung the manifest advertises: the minor candidate
 * OVERRIDES the major one — the next minor within the current major must be
 * exhausted before the x+1.0.0 boundary is visible. */
function appendBoundaryTarget(
	targets: number[][],
	nextMinor: number[] | null,
	nextMajor: number[] | null,
): void {
	const boundary = nextMinor ?? nextMajor;
	if (boundary !== null) targets.push(boundary);
}

/** The client version as an exact [major, minor, patch], missing parts = 0. */
function normalizedClientTriple(clientVersion: readonly number[]): [number, number, number] {
	return [clientVersion[0] ?? 0, clientVersion[1] ?? 0, clientVersion[2] ?? 0];
}

/**
 * Which rung of the linear upgrade path a catalog triple sits on, relative to
 * the client: the x+1.0.0 major boundary, the next minor within the current
 * major, the next patch within the current minor — or none.
 */
function upgradeRung(
	triple: readonly number[],
	[cMajor, cMinor, cPatch]: readonly [number, number, number],
): 'major' | 'minor' | 'patch' | null {
	if (tripleEquals(triple, cMajor + 1, 0, 0)) return 'major';
	if (tripleEquals(triple, cMajor, cMinor + 1, 0)) return 'minor';
	if (tripleEquals(triple, cMajor, cMinor, cPatch + 1)) return 'patch';
	return null;
}

function tripleEquals(
	triple: readonly number[],
	major: number,
	minor: number,
	patch: number,
): boolean {
	return triple[0] === major && triple[1] === minor && triple[2] === patch;
}

/**
 * Build the release manifest (PHP get_code_update_info). Advertises a release
 * only when its `<major.minor.patch>.zip` exists under `codeFilesDir`.
 */
export function buildCodeUpdateInfo(options: {
	clientVersion: readonly number[];
	serverVersion: readonly number[];
	codeFilesDir: string | undefined;
	publicBaseUrl: string;
	info: Omit<CodeUpdateInfo['info'], 'version'>;
	catalog?: typeof UPDATE_CATALOG;
}): CodeUpdateInfo {
	const files: CodeReleaseItem[] = [];
	const targets = linearUpgradeTargets(options.clientVersion, options.catalog ?? UPDATE_CATALOG);
	if (options.codeFilesDir !== undefined && existsSync(options.codeFilesDir)) {
		for (const triple of targets) {
			const item = releaseItemFor(options.codeFilesDir, options.publicBaseUrl, triple);
			if (item !== null) files.push(item);
		}
	}
	return {
		info: { version: options.serverVersion.join('.'), ...options.info },
		files,
	};
}

/**
 * The public URL of one published archive — the ONE builder.
 *
 * Both the manifest (`releaseItemFor`) and the code-server panel
 * (status.ts `collectReleaseDir`) hand a consumer a release URL, and they drifted:
 * the panel appended the `/dedalo/install/code` prefix to a base that already
 * carried it, emitting a path `resolveCodeReleaseFile` refuses. `base` is
 * always the prefix WITHOUT a trailing slash.
 */
export function codeReleaseUrl(base: string, version: string, fileName: string): string {
	return `${base}/${version}/${fileName}`;
}

/** One advertised release item, or null when its archive does not exist on disk. */
function releaseItemFor(
	codeFilesDir: string,
	publicBaseUrl: string,
	triple: readonly number[],
): CodeReleaseItem | null {
	const versionString = triple.join('.');
	const fileName = `${versionString}.zip`;
	const filePath = codeReleasePath(codeFilesDir, triple, fileName);
	if (filePath === null || !existsSync(filePath)) return null;
	const sha256 = readShaSidecar(filePath);
	return {
		version: versionString,
		url: codeReleaseUrl(publicBaseUrl, versionString, fileName),
		date: new Date(statSync(filePath).mtimeMs).toISOString(),
		...(sha256 === null ? {} : { sha256 }),
	};
}

/**
 * The digest from the `<archive>.sha256` sidecar `code_build.ts` writes next to
 * every built release (`<64 hex>  <name>.zip\n`), or null when there is no
 * sidecar / it is not a plain 64-hex digest. Advertising it is what makes the
 * consumer's verification possible at all: `updateCode` REFUSES any release
 * whose request carries no 64-hex digest, so an unsigned archive is simply not
 * installable (WC-024's 2026-08-15 addendum). A master that answers with no
 * `sha256` is therefore advertising a release nobody can install — which is the
 * intended, loud outcome of a build whose sidecar was lost.
 */
function readShaSidecar(archivePath: string): string | null {
	const sidecar = `${archivePath}.sha256`;
	if (!existsSync(sidecar)) return null;
	const digest = readFileSync(sidecar, 'utf8').trim().split(/\s+/)[0] ?? '';
	return /^[a-f0-9]{64}$/.test(digest) ? digest : null;
}

/**
 * Release archive path: <codeFilesDir>/<major>/<major.minor>/<file>. Confined.
 *
 * TWO channels resolve, ONE is advertised: the published `<v>.zip` and the
 * developer `<v>-dev.zip` (code_build_plan.ts releaseFileName) are both
 * servable through code_serving.ts, but `buildCodeUpdateInfo` above only ever
 * LOOKS FOR `<v>.zip` — a dev build is fetchable by an operator who knows its
 * URL, never offered to a consumer as a release. That separation is a security
 * property; do not teach the manifest the `-dev` name.
 */
export function codeReleasePath(
	codeFilesDir: string,
	triple: readonly number[],
	fileName: string,
): string | null {
	if (!/^[0-9]+\.[0-9]+\.[0-9]+(-dev)?\.zip$/.test(fileName)) return null;
	const dir = join(codeFilesDir, String(triple[0]), `${triple[0]}.${triple[1]}`);
	const resolved = resolve(join(dir, fileName));
	if (!resolved.startsWith(`${resolve(codeFilesDir)}${sep}`)) return null;
	return resolved;
}

/** Which built-release version subdirs exist (server-side build-panel listing). */
export function existingReleaseVersions(codeFilesDir: string | undefined): string[] {
	if (codeFilesDir === undefined || !existsSync(codeFilesDir)) return [];
	const versions: string[] = [];
	for (const majorDir of subdirsOf(codeFilesDir)) {
		for (const minorDir of subdirsOf(majorDir)) {
			versions.push(...zipVersionsIn(minorDir));
		}
	}
	return versions.sort();
}

/** The version strings of the `<v>.zip` files directly inside a dir. */
function zipVersionsIn(dir: string): string[] {
	const versions: string[] = [];
	for (const file of readdirSync(dir)) {
		if (file.endsWith('.zip')) versions.push(file.replace(/\.zip$/, ''));
	}
	return versions;
}

/** Absolute paths of a directory's immediate subdirectories. */
function subdirsOf(dir: string): string[] {
	const dirs: string[] = [];
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) dirs.push(full);
	}
	return dirs;
}
