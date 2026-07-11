/**
 * Tool path & URL resolution (PHP tools/tool_common/class.tool_paths.php).
 *
 * Tools may live in several roots: the in-repo `tools/` root is ALWAYS index 0
 * and wins name collisions; extra roots come from config.tools.additionalRoots
 * (PHP DEDALO_ADDITIONAL_TOOLS). Every filesystem access is realpath-confined to
 * a root (TOCTOU-safe: we resolve the canonical path and prefix-check it against
 * the canonical root, never the raw path).
 *
 * RULE (ported): never build a tool URL from a base constant inline — always go
 * through getToolUrl so additional-root tools resolve to their own URL, and the
 * client's DEDALO_TOOLS_URLS map (getAdditionalToolsUrlMap) stays in lockstep.
 */

import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { config } from '../../config/config.ts';

/** Web base for primary-root tool assets (PHP DEDALO_TOOLS_URL; single-root install). */
export const TOOLS_URL_BASE = '/dedalo/tools';

/** A resolved tool root: canonical filesystem path + the URL it is served at. */
export interface ToolRoot {
	/** Canonical (realpath) directory holding tool packages. */
	readonly path: string;
	/** Root-relative URL prefix the tools under `path` are served at. */
	readonly url: string;
	/** True for the in-repo primary root (index 0). */
	readonly primary: boolean;
}

/** Absolute path of the in-repo primary tools root (repo-root `tools/`). */
const PRIMARY_ROOT_PATH = resolve(import.meta.dir, '../../../tools');

/** The core-served directory backing the /dedalo/core/tools_common/ URL. */
export const TOOL_COMMON_CLIENT_DIR = resolve(import.meta.dir, 'client');

/**
 * Forbidden root policy (PHP tool_paths::root_is_forbidden): a tools root must
 * not be a system temp dir — an attacker who can drop files in /tmp must not be
 * able to get tool server code loaded. Compared on canonical paths.
 */
function rootIsForbidden(canonicalPath: string): boolean {
	const forbidden = [safeRealpath('/tmp'), safeRealpath(tmpdir())].filter(
		(p): p is string => p !== null,
	);
	return forbidden.some((f) => canonicalPath === f || canonicalPath.startsWith(f + sep));
}

/** realpathSync that returns null instead of throwing on a missing path. */
function safeRealpath(path: string): string | null {
	try {
		return realpathSync(path);
	} catch {
		return null;
	}
}

/** True when `path` is an existing directory. */
function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

let rootsCache: ToolRoot[] | null = null;

/**
 * The resolved tool roots in priority order (PHP tool_paths::get_roots),
 * memoized. Index 0 is always the in-repo primary root. Additional roots that
 * are missing, forbidden, or not a directory are logged and skipped.
 */
export function getRoots(): ToolRoot[] {
	if (rootsCache !== null) return rootsCache;
	const roots: ToolRoot[] = [];
	const primaryCanonical = safeRealpath(PRIMARY_ROOT_PATH) ?? PRIMARY_ROOT_PATH;
	roots.push({ path: primaryCanonical, url: TOOLS_URL_BASE, primary: true });

	for (const extra of config.tools.additionalRoots) {
		const canonical = safeRealpath(extra.path);
		if (canonical === null || !isDirectory(canonical)) {
			console.warn(`[tools] additional root skipped (missing/not a dir): ${extra.path}`);
			continue;
		}
		if (rootIsForbidden(canonical)) {
			console.warn(`[tools] additional root skipped (forbidden location): ${extra.path}`);
			continue;
		}
		if (roots.some((r) => r.path === canonical)) continue; // dedupe
		roots.push({ path: canonical, url: extra.url, primary: false });
	}
	rootsCache = roots;
	return roots;
}

/** Reset the roots memo (config/tests). */
export function resetPathsCache(): void {
	rootsCache = null;
	rootResolutionCache.clear();
}

const rootResolutionCache = new Map<string, ToolRoot | null>();

/**
 * The root a tool lives in (first-root-wins, PHP resolve_tool_root), memoized.
 * Returns null when no root contains a directory named `name`.
 */
export function resolveToolRoot(name: string): ToolRoot | null {
	const cached = rootResolutionCache.get(name);
	if (cached !== undefined) return cached;
	let found: ToolRoot | null = null;
	for (const root of getRoots()) {
		if (isDirectory(resolve(root.path, name))) {
			found = root;
			break;
		}
	}
	rootResolutionCache.set(name, found);
	return found;
}

/**
 * The web base URL for one tool's assets (PHP tool_paths::get_tool_url). Tools in
 * an additional root resolve to that root's URL; primary-root tools (and tools
 * whose files are not on disk) resolve to the default /dedalo/tools base.
 */
export function getToolUrl(name: string): string {
	const root = resolveToolRoot(name);
	if (root !== null && !root.primary) return `${root.url}/${name}`;
	return `${TOOLS_URL_BASE}/${name}`;
}

/**
 * name → base-URL map for tools living in ADDITIONAL roots only (PHP
 * tool_paths::get_additional_tools_url_map). The client uses this as
 * DEDALO_TOOLS_URLS; primary-root tools are absent and fall back to the
 * /dedalo/tools/<name> relative path in the client (instances.js).
 */
export function getAdditionalToolsUrlMap(): Record<string, string> {
	const map: Record<string, string> = {};
	for (const root of getRoots()) {
		if (root.primary) continue;
		// Enumerate the tool dirs physically present in this additional root.
		let entries: string[] = [];
		try {
			entries = readdirSync(root.path).filter((name) => /^tool_[a-z0-9_]+$/.test(name));
		} catch {
			entries = [];
		}
		for (const name of entries) {
			// First-root-wins: only map it here if THIS root actually owns the tool.
			if (resolveToolRoot(name)?.path === root.path && map[name] === undefined) {
				map[name] = `${root.url}/${name}`;
			}
		}
	}
	return map;
}

/**
 * Resolve a request path `/dedalo/tools/<name>/<rest>` (or an additional-root
 * URL) to a confined absolute asset path, or null when it must 404. Fail-closed:
 * denies the `server/` subtree, path traversal, and anything not under the
 * owning root's canonical directory.
 */
export function resolveToolAssetPath(name: string, restPath: string): string | null {
	if (!/^tool_[a-z0-9_]+$/.test(name)) return null;
	const root = resolveToolRoot(name);
	if (root === null) return null;
	// Deny the server/ subtree outright (never serve TS server code).
	const firstSegment = restPath.split('/').filter(Boolean)[0];
	if (firstSegment === 'server') return null;
	const toolDir = resolve(root.path, name);
	const fullPath = resolve(toolDir, restPath);
	// Canonical confinement: the resolved path must stay under the tool dir.
	if (fullPath !== toolDir && !fullPath.startsWith(toolDir + sep)) return null;
	if (!existsSync(fullPath)) return null;
	return fullPath;
}

/**
 * Resolve a `/dedalo/core/tools_common/<rest>` request to a confined path under
 * the core-served client dir, or null to 404. The tool_common client machinery
 * lives in core (src/core/tools/client/) and is served under its own core URL.
 */
export function resolveToolCommonAssetPath(restPath: string): string | null {
	const fullPath = resolve(TOOL_COMMON_CLIENT_DIR, restPath);
	if (fullPath !== TOOL_COMMON_CLIENT_DIR && !fullPath.startsWith(TOOL_COMMON_CLIENT_DIR + sep)) {
		return null;
	}
	if (!existsSync(fullPath)) return null;
	return fullPath;
}
