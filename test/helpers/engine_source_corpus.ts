/**
 * THE ENGINE SOURCE CORPUS — the one lister that owns the engine's own source
 * roots for gates that census `src/`.
 *
 * `census_derivation_tripwire` refuses a gate that chooses its own walk root
 * in-file: a corpus that can drift per gate is a census nobody can trust. The
 * roots live HERE and nowhere else; a gate imports a shape and never names a
 * directory. Every lister is zero-argument on purpose — a parameterized lister
 * hands the root choice back to the caller, which is the thing the rule is about.
 */

import { readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/** The engine roots. The ONLY place they are named. */
export const ENGINE_SRC = join(REPO_ROOT, 'src');
export const API_HANDLERS_DIR = join(REPO_ROOT, 'src/core/api/handlers');
export const MEDIA_DIR = join(REPO_ROOT, 'src/core/media');

/**
 * THE READ PATH — the three trees a section read flows through (relations,
 * resolve, section). Owned here so the bare-`readMatrixRecord` census and any
 * later read-path census walk the SAME corpus.
 */
export const READ_PATH_ROOTS = [
	'src/core/relations',
	'src/core/resolve',
	'src/core/section',
] as const;

/** The search-family fragment builders (src/core/search/builders). */
export const SEARCH_BUILDERS_DIR = join(REPO_ROOT, 'src/core/search/builders');

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, out);
		else if (extname(entry) === '.ts') out.push(full);
	}
	return out;
}

/** Every .ts under src/, absolute, sorted. */
export function engineSourceFiles(): string[] {
	return walk(ENGINE_SRC).sort();
}

/** Every .ts under src/, repo-relative with POSIX separators, sorted. */
export function engineSourceFilesRelative(): string[] {
	return engineSourceFiles().map((path) => relative(REPO_ROOT, path).split('\\').join('/'));
}

/** Every .ts of the API handler tree (src/core/api/handlers), absolute, sorted. */
export function apiHandlerFiles(): string[] {
	return walk(API_HANDLERS_DIR).sort();
}

/** Every .ts under the media subsystem (src/core/media), absolute, sorted. */
export function mediaSourceFiles(): string[] {
	return walk(MEDIA_DIR).sort();
}

/** Every .ts under the read-path roots, absolute, sorted. */
export function readPathSourceFiles(): string[] {
	const out: string[] = [];
	for (const root of READ_PATH_ROOTS) walk(join(REPO_ROOT, root), out);
	return out.sort();
}

/** Every .ts of the search builder family, absolute, sorted. */
export function searchBuilderFiles(): string[] {
	return walk(SEARCH_BUILDERS_DIR).sort();
}
