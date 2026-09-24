/**
 * THE TOOL DIRECTORY CORPUS — the one lister that owns the `tools/` root for
 * gates that need the tool NAMES of this checkout (the `tools/tool_<name>/`
 * directories).
 *
 * `census_derivation_tripwire` refuses a gate that chooses its own walk root
 * in-file; the root lives HERE and nowhere else (registered in its
 * SHARED_LISTERS). Zero-argument on purpose — a parameterized lister hands the
 * root choice back to the caller.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/** The tools root. The ONLY place a gate's tool-name census names it. */
export const TOOLS_DIR = join(REPO_ROOT, 'tools');

/** Every `tools/tool_<name>/` directory name of this checkout, sorted. */
export function toolDirectoryNames(): string[] {
	return readdirSync(TOOLS_DIR, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && /^tool_[a-z0-9_]+$/.test(entry.name))
		.map((entry) => entry.name)
		.sort();
}
