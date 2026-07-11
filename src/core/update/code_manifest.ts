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

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { UPDATE_CATALOG } from './catalog.ts';
import { compareVersionArrays } from './version.ts';

/** One advertised release (PHP file_item). */
export interface CodeReleaseItem {
	version: string;
	url: string;
	date: string;
	forceUpdateMode?: 'clean';
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
	if (
		boundary !== null &&
		!targets.some((triple) => compareVersionArrays(triple, boundary) === 0)
	) {
		targets.push(boundary);
	}
	return targets.sort(compareVersionArrays);
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
			files.push({
				version: versionString,
				url: `${options.publicBaseUrl}/${versionString}/${fileName}`,
				date: new Date(statSync(filePath).mtimeMs).toISOString(),
				...(descriptor?.forceUpdateMode === 'clean' ? { forceUpdateMode: 'clean' as const } : {}),
			});
		}
	}
	return {
		info: { version: options.serverVersion.join('.'), ...options.info },
		files,
	};
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
