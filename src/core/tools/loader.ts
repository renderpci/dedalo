/**
 * Tool server-module loader (PHP tool_paths::get_tool_class_file +
 * tools_register class-contract checks, re-expressed for the TS plugin model).
 *
 * Discovery is a deterministic, allowlisted directory scan over the tool roots
 * (paths.ts): for each root in priority order, every directory matching
 * ^tool_[a-z0-9_]+$ that contains a server/index.ts is dynamically imported and
 * its exported `tool` validated against the ToolServerModule contract. First
 * root wins name collisions (reported). The registry is a Map filled ONCE at
 * boot (or lazily on first use) — a tool method is reachable only if its module
 * loaded here, so there is no request-time reflection.
 *
 * The import specifier is NEVER request-influenced: it is built only from an
 * allowlisted root path + a name that already matched the strict pattern, and
 * the canonical path is confined under the root before import (TOCTOU-safe).
 */

import { existsSync, readdirSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { LIFECYCLE_KEYS, type ToolServerModule } from './module.ts';
import { getRoots } from './paths.ts';

/** A successfully loaded tool: its module plus provenance for confinement/reporting. */
export interface LoadedTool {
	module: ToolServerModule;
	/** Canonical directory the tool was loaded from. */
	dir: string;
	/** Index of the root it lives in (0 = primary). */
	rootIndex: number;
}

const TOOL_NAME_PATTERN = /^tool_[a-z0-9_]+$/;

/** The loaded-tools registry, populated once. Null until the first load. */
let loadedTools: Map<string, LoadedTool> | null = null;
/** Names that collided across roots (first-root-wins); reported, not fatal. */
let collisions: string[] = [];
/** In-flight load promise so concurrent callers share one scan. */
let loadingPromise: Promise<Map<string, LoadedTool>> | null = null;

/**
 * Validate a dynamically imported module object against the contract. Returns
 * the typed module or throws with a precise reason (caught per-tool by the
 * scanner so one bad tool never aborts the whole load).
 */
function validateModule(imported: unknown, expectedName: string): ToolServerModule {
	const tool = (imported as { tool?: unknown }).tool;
	if (tool === undefined || tool === null || typeof tool !== 'object') {
		throw new Error('server/index.ts must export a `tool` object');
	}
	const module = tool as ToolServerModule;
	if (module.name !== expectedName) {
		throw new Error(`tool.name '${module.name}' must equal directory name '${expectedName}'`);
	}
	if (!TOOL_NAME_PATTERN.test(module.name)) {
		throw new Error(`tool.name '${module.name}' must match ^tool_[a-z0-9_]+$`);
	}
	if (typeof module.apiActions !== 'object' || module.apiActions === null) {
		throw new Error('tool.apiActions must be an object');
	}
	for (const key of LIFECYCLE_KEYS) {
		if (Object.hasOwn(module.apiActions, key)) {
			throw new Error(`lifecycle hook '${key}' must not appear inside apiActions`);
		}
	}
	for (const [method, spec] of Object.entries(module.apiActions)) {
		if (typeof spec?.handler !== 'function') {
			throw new Error(`apiActions.${method}.handler must be a function`);
		}
	}
	return module;
}

/** Run the scan across all roots and build the registry (idempotent per call). */
async function scanRoots(): Promise<Map<string, LoadedTool>> {
	const registry = new Map<string, LoadedTool>();
	const collided: string[] = [];
	const roots = getRoots();

	for (let rootIndex = 0; rootIndex < roots.length; rootIndex++) {
		const root = roots[rootIndex];
		if (root === undefined) continue;
		let entries: string[];
		try {
			entries = readdirSync(root.path);
		} catch {
			continue;
		}
		for (const name of entries) {
			if (!TOOL_NAME_PATTERN.test(name)) continue;
			const serverEntry = resolve(root.path, name, 'server', 'index.ts');
			if (!existsSync(serverEntry)) continue;

			// First-root-wins: a later root's same-named tool is a reported collision.
			if (registry.has(name)) {
				collided.push(name);
				continue;
			}
			// Canonical confinement: the entry must resolve inside the root.
			let canonical: string;
			try {
				canonical = realpathSync(serverEntry);
			} catch {
				continue;
			}
			if (canonical !== root.path && !canonical.startsWith(root.path + sep)) {
				console.warn(`[tools] refused (outside root): ${serverEntry}`);
				continue;
			}
			try {
				const imported = await import(canonical);
				const module = validateModule(imported, name);
				registry.set(name, {
					module,
					dir: resolve(root.path, name),
					rootIndex,
				});
			} catch (error) {
				// A broken tool fails ONLY itself (missing dep, bad contract, syntax).
				console.warn(`[tools] failed to load '${name}': ${(error as Error).message}`);
			}
		}
	}
	collisions = collided;
	return registry;
}

/** Ensure the registry is loaded (once). Concurrent callers share one scan. */
export async function loadToolModules(): Promise<Map<string, LoadedTool>> {
	if (loadedTools !== null) return loadedTools;
	if (loadingPromise === null) {
		loadingPromise = scanRoots().then((registry) => {
			loadedTools = registry;
			loadingPromise = null;
			return registry;
		});
	}
	return loadingPromise;
}

/** The loaded tool for `name`, or undefined. Triggers the load if needed. */
export async function getLoadedTool(name: string): Promise<LoadedTool | undefined> {
	const registry = await loadToolModules();
	return registry.get(name);
}

/** Names that collided across roots on the last load (reporting). */
export function getToolLoadCollisions(): string[] {
	return [...collisions];
}

/** Drop the registry so the next call rescans (tests / after registration). */
export function resetLoadedTools(): void {
	loadedTools = null;
	loadingPromise = null;
	collisions = [];
}
