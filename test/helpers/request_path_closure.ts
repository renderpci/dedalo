/**
 * THE SERVER'S IMPORT CLOSURE — every module a served request can reach: the
 * closure of relative STATIC and DYNAMIC imports over the two root tables the
 * server dispatches through (`src/core/api/dispatch.ts`, the API action table;
 * `src/server.ts`, the route table).
 *
 * ONE walker for the gates that hold something OFF (or ON) that path —
 * test/unit/sync_io_on_request_path_tripwire.test.ts (no sync unbounded I/O on
 * it), test/unit/install_screen_model_tripwire.test.ts (the terminal
 * installer's UI, screen model and probe modules are never on it) and
 * test/unit/opentui_confinement_tripwire.test.ts (the full-screen UI and its
 * loader are never on it) — so they cannot disagree on what "reachable" means.
 * A side-effect import (`import './x.ts'`, no `from`) IS a static edge — the
 * server loads modules that way (src/server.ts registers the component models).
 *
 * HONEST LIMITATION: a regex walk of `from '…'` / `import '…'` / `import('…')` with a RELATIVE
 * literal specifier; a computed specifier or a non-relative import is
 * invisible. Reads tracked source only; writes nothing.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const REPO_ROOT = resolve(import.meta.dir, '..', '..');

/** The server's two root tables. */
export const REQUEST_PATH_ROOTS: readonly string[] = Object.freeze([
	'src/core/api/dispatch.ts',
	'src/server.ts',
]);

const STATIC_IMPORT_RE = /\bfrom\s*['"](\.[^'"]*)['"]/g;
/** `import './x.ts'` — a static edge with no binding (no `from`). */
const SIDE_EFFECT_IMPORT_RE = /\bimport\s*['"](\.[^'"]*)['"]/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*['"](\.[^'"]*)['"]\s*\)/g;

/** The relative `.ts` modules `file` (absolute) imports — static and, by default, dynamic. */
export function directImports(file: string, includeDynamic = true): string[] {
	if (!existsSync(file)) return [];
	const source = readFileSync(file, 'utf8');
	const statics = [STATIC_IMPORT_RE, SIDE_EFFECT_IMPORT_RE];
	const patterns = includeDynamic ? [...statics, DYNAMIC_IMPORT_RE] : statics;
	const targets: string[] = [];
	for (const pattern of patterns) {
		for (const match of source.matchAll(pattern)) {
			const target = resolve(dirname(file), match[1] as string);
			if (target.endsWith('.ts')) targets.push(target);
		}
	}
	return targets;
}

/**
 * The reachable set (absolute paths, sorted): close relative static + dynamic
 * imports over `roots` (repo-relative). `includeDynamic` exists so a gate's own
 * mutation control can prove the dynamic edge is load-bearing.
 */
export function reachableModules(
	includeDynamic = true,
	roots: readonly string[] = REQUEST_PATH_ROOTS,
): string[] {
	const seen = new Set<string>();
	const queue = roots.map((relative) => resolve(REPO_ROOT, relative));
	while (queue.length > 0) {
		const file = queue.pop() as string;
		if (seen.has(file) || !existsSync(file)) continue;
		seen.add(file);
		for (const target of directImports(file, includeDynamic)) {
			if (!seen.has(target)) queue.push(target);
		}
	}
	return [...seen].sort();
}
