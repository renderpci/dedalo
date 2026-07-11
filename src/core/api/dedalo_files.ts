/**
 * get_dedalo_files — the service-worker pre-cache manifest (PHP
 * dd_utils_api::get_dedalo_files, class.dd_utils_api.php:1897).
 *
 * The client SW (sw.js / worker_cache.js) calls this on install and whenever a
 * new dedalo_version is detected, then pre-caches every returned URL. PHP walks
 * the real filesystem rather than keeping a static list so newly added files
 * are included automatically; this port keeps that behavior, but walks the
 * trees the TS server actually SERVES so every returned URL resolves here:
 *
 *  - core:        client/dedalo/core (the copied client tree) → /dedalo/core/…
 *  - tools:       the in-repo primary tools root               → /dedalo/tools/…
 *    (PHP scans only DEDALO_TOOLS_PATH; additional roots are likewise not
 *    manifested here.)
 *  - tool_common: PHP serves it from tools/tool_common; the TS server relocated
 *    that client machinery to src/core/tools/client, served at
 *    /dedalo/core/tools_common/ (see core/tools/paths.ts) — the manifest emits
 *    the TS URL so the SW caches a fetchable path.
 *
 * Filter rules are a 1:1 port of the PHP method (including its case
 * sensitivity quirks and the tools-branch entries all being typed 'js').
 */

import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { TOOLS_URL_BASE, TOOL_COMMON_CLIENT_DIR, getRoots } from '../tools/paths.ts';
import { DEDALO_ENGINE_VERSION } from '../update/version.ts';

/** One manifest entry ({type,url}, PHP shape). */
export interface DedaloFileEntry {
	type: 'js' | 'css';
	url: string;
}

/** Absolute root of the copied client core tree (served at /dedalo/core/). */
const CLIENT_CORE_ROOT = resolve(import.meta.dir, '../../../client/dedalo/core');

/** Web bases (PHP DEDALO_CORE_URL and the TS tools_common seam). */
const CORE_URL = '/dedalo/core';
const TOOLS_COMMON_URL = `${CORE_URL}/tools_common`;

/**
 * Recursively collect files with an allowed extension under `dir` (PHP
 * get_dir_files, shared/core_functions.php:772). Returns root-relative paths
 * with a leading '/'. PHP's RecursiveDirectoryIterator order is
 * filesystem-dependent; we sort per directory so the manifest is deterministic
 * (differential gates normalize order).
 */
function walkDirFiles(root: string, extensions: readonly string[], relBase = ''): string[] {
	let entries: import('node:fs').Dirent[];
	try {
		entries = readdirSync(relBase === '' ? root : root + relBase, { withFileTypes: true });
	} catch {
		// PHP get_dir_files warns and returns [] on a missing directory.
		return [];
	}
	entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
	const files: string[] = [];
	for (const entry of entries) {
		const rel = `${relBase}/${entry.name}`;
		if (entry.isDirectory()) {
			files.push(...walkDirFiles(root, extensions, rel));
			continue;
		}
		if (!entry.isFile()) continue; // fail-closed on symlinks/specials
		const dot = entry.name.lastIndexOf('.');
		const ext = dot === -1 ? '' : entry.name.slice(dot + 1);
		if (extensions.includes(ext)) files.push(rel);
	}
	return files;
}

/**
 * Core JS filter (PHP get_dedalo_files, core branch) — exact port, including
 * which checks are case-insensitive (PHP stripos) vs case-sensitive (strpos).
 */
function coreFileUrl(rel: string): string | null {
	const lower = rel.toLowerCase();
	if (
		lower.includes('/acc/') ||
		rel.includes('/themes/') || // ignore themes directory
		rel.includes('/ontology/') || // ignore old ontology files (no modules)
		lower.includes('/old/') ||
		lower.includes('/lib/') || // ignore libraries
		rel.includes('/test/') || // ignore test
		rel.includes('/plug-ins/') ||
		rel.includes('/fonts/') || // ignore fonts
		rel.includes('worker_cache.js') ||
		rel.includes('/sw.js') // ignore service worker
	) {
		return null;
	}
	// only js dirs
	if (!rel.includes('/js/')) return null;
	return CORE_URL + rel;
}

/**
 * Tools filter (PHP get_dedalo_files, tools branch): drop /acc/ /old/ /lib/
 * (case-insensitive), and require the first level under the tool dir to be
 * js/ or css/ (rel = '/<tool>/js/…' → segments ['', '<tool>', 'js', …]).
 * Deeper nesting under js/ is allowed (e.g. tool_common js/processors/…).
 */
function toolFileRelIsIncluded(rel: string): boolean {
	const lower = rel.toLowerCase();
	if (lower.includes('/acc/') || lower.includes('/old/') || lower.includes('/lib/')) {
		return false;
	}
	const segments = rel.split('/');
	return segments[2] === 'js' || segments[2] === 'css';
}

/**
 * The full manifest response body: result ({type,url}[], main.css first),
 * dedalo_version (SW cache key), msg — the PHP wire shape verbatim.
 */
export function buildDedaloFilesResponse(): {
	result: DedaloFileEntry[];
	dedalo_version: string;
	msg: string;
} {
	const files: DedaloFileEntry[] = [];

	// CORE — css: main.css first to preserve coherence (its /page/css/ path
	// does not match the /js/ rule and would otherwise be skipped).
	files.push({ type: 'css', url: `${CORE_URL}/page/css/main.css` });
	// CORE — js.
	for (const rel of walkDirFiles(CLIENT_CORE_ROOT, ['js'])) {
		const url = coreFileUrl(rel);
		if (url !== null) files.push({ type: 'js', url });
	}

	// TOOL_COMMON — the TS relocation seam (see module doc). Filtered with the
	// tools rule by prefixing the tool dir PHP sees ('/tool_common/js/…').
	for (const rel of walkDirFiles(TOOL_COMMON_CLIENT_DIR, ['js', 'css'])) {
		if (toolFileRelIsIncluded(`/tool_common${rel}`)) {
			files.push({ type: 'js', url: TOOLS_COMMON_URL + rel });
		}
	}

	// TOOLS — primary root only (PHP DEDALO_TOOLS_PATH). PHP quirk kept: every
	// tools-branch entry is typed 'js', css files included (the SW only reads
	// url; the type must still match the oracle byte-for-byte).
	const primaryToolsRoot = getRoots()[0]?.path;
	if (primaryToolsRoot !== undefined) {
		for (const rel of walkDirFiles(primaryToolsRoot, ['js', 'css'])) {
			if (toolFileRelIsIncluded(rel)) {
				files.push({ type: 'js', url: TOOLS_URL_BASE + rel });
			}
		}
	}

	return {
		result: files,
		// dedalo_version: used to set the cache version in the worker (PHP
		// DEDALO_VERSION).
		dedalo_version: DEDALO_ENGINE_VERSION,
		msg: 'OK. Request done successfully',
	};
}
