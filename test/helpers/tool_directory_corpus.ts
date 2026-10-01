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

import { readdirSync, readFileSync } from 'node:fs';
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

/**
 * A GRANT-ONLY tool (2026-10-01, TOOLS-4 — first instance `tool_rag`): a tool
 * registry row that exists to be GRANTED, not opened. Its register.json declares
 * `properties.grant_only: true`; it ships no client (`js/`), no stylesheet and
 * no server module, shows nowhere (no affected models, not in the inspector or
 * on a component) and is never `always_active` — a profile's dd1067 grant of it
 * is read by an engine door through `assertToolGranted`. The UI laws (phone
 * ratchet, one entry sheet per tool) have no subject in it; the grant-only law
 * itself is gated in tools_register_validate.test.ts.
 */
export function isGrantOnlyTool(name: string): boolean {
	try {
		const raw = JSON.parse(readFileSync(join(TOOLS_DIR, name, 'register.json'), 'utf8')) as {
			properties?: { grant_only?: unknown } | null;
		};
		return raw.properties?.grant_only === true;
	} catch {
		return false;
	}
}
