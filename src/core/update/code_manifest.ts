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
 * The two data-carrying keys are SNAKE_CASE because they are wire names the
 * client reads verbatim: `render_update_code.js` branches on
 * `force_update_mode === 'clean'` and `update_code.ts` forwards the whole item
 * back as `options.file` (`file.sha256`, `file.force_update_mode`). A camelCase
 * spelling here serializes fine and is silently never read.
 */
export interface CodeReleaseItem {
	version: string;
	url: string;
	date: string;
	/** sha256 of the archive, from the `<file>.zip.sha256` sidecar (WC-024). */
	sha256?: string;
	force_update_mode?: 'clean';
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
	const targets: number[][] = [];
	let nextMajor: number[] | null = null;
	let nextMinor: number[] | null = null;
	const clientMajor = clientVersion[0] ?? 0;
	for (const descriptor of Object.values(catalog)) {
		const triple = [descriptor.versionMajor, descriptor.versionMedium, descriptor.versionMinor];
		// next major boundary x+1.0.0
		if (
			descriptor.versionMajor === clientMajor + 1 &&
			descriptor.versionMedium === 0 &&
			descriptor.versionMinor === 0
		) {
			nextMajor = triple;
		}
		// next minor within the current major (overrides the major candidate)
		if (
			descriptor.versionMajor === clientMajor &&
			descriptor.versionMedium === (clientVersion[1] ?? 0) + 1 &&
			descriptor.versionMinor === 0
		) {
			nextMinor = triple;
		}
		// next patch within the current minor
		if (
			descriptor.versionMajor === clientMajor &&
			descriptor.versionMedium === (clientVersion[1] ?? 0) &&
			descriptor.versionMinor === (clientVersion[2] ?? 0) + 1
		) {
			targets.push(triple);
		}
	}
	const boundary = nextMinor ?? nextMajor;
	if (boundary !== null) targets.push(boundary);
	// One dedupe over the WHOLE list (defect D17, fixed 2026-08-09): the same
	// triple can be reached from two catalog keys, not only from the boundary
	// candidate, and a duplicated rung would be advertised twice in the manifest.
	const unique = [...new Map(targets.map((triple) => [triple.join('.'), triple])).values()];
	return unique.sort(compareVersionArrays);
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
			const versionString = triple.join('.');
			const fileName = `${versionString}.zip`;
			const filePath = codeReleasePath(options.codeFilesDir, triple, fileName);
			if (filePath === null || !existsSync(filePath)) continue;
			const key = `${triple[0]}${triple[1]}${triple[2]}`;
			const descriptor = (options.catalog ?? UPDATE_CATALOG)[key];
			const sha256 = readShaSidecar(filePath);
			files.push({
				version: versionString,
				url: `${options.publicBaseUrl}/${versionString}/${fileName}`,
				date: new Date(statSync(filePath).mtimeMs).toISOString(),
				...(sha256 === null ? {} : { sha256 }),
				...(descriptor?.forceUpdateMode === 'clean' ? { force_update_mode: 'clean' as const } : {}),
			});
		}
	}
	return {
		info: { version: options.serverVersion.join('.'), ...options.info },
		files,
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

/** Release archive path: <codeFilesDir>/<major>/<major.minor>/<file>. Confined. */
export function codeReleasePath(
	codeFilesDir: string,
	triple: readonly number[],
	fileName: string,
): string | null {
	if (!/^[0-9]+\.[0-9]+\.[0-9]+\.zip$/.test(fileName)) return null;
	const dir = join(codeFilesDir, String(triple[0]), `${triple[0]}.${triple[1]}`);
	const resolved = resolve(join(dir, fileName));
	if (!resolved.startsWith(`${resolve(codeFilesDir)}${sep}`)) return null;
	return resolved;
}

/** Which built-release version subdirs exist (server-side build-panel listing). */
export function existingReleaseVersions(codeFilesDir: string | undefined): string[] {
	if (codeFilesDir === undefined || !existsSync(codeFilesDir)) return [];
	const versions: string[] = [];
	for (const major of readdirSync(codeFilesDir)) {
		const majorDir = join(codeFilesDir, major);
		if (!statSync(majorDir).isDirectory()) continue;
		for (const minor of readdirSync(majorDir)) {
			const minorDir = join(majorDir, minor);
			if (!statSync(minorDir).isDirectory()) continue;
			for (const file of readdirSync(minorDir)) {
				if (file.endsWith('.zip')) versions.push(file.replace(/\.zip$/, ''));
			}
		}
	}
	return versions.sort();
}
