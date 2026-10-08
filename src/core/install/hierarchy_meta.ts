/**
 * The vendored hierarchy DESCRIPTORS (install/import/hierarchy/hierarchies.json):
 * what each installable tld IS — its label, its typology, whether it should be
 * active in the thesaurus. ONE reader, shared by the two consumers that must agree:
 * the wizard's checkbox list (install/context.ts) and the activation that runs on
 * the tlds it returns (install/hierarchy_activate.ts). A second copy of this
 * lookup would let the wizard offer a hierarchy the activator cannot describe.
 *
 * TWO KINDS OF HIERARCHY (2026-10-08, installer unification A7):
 *  - CORE (`CORE_HIERARCHIES`): ALWAYS activated by the seed restore, never
 *    imported, never offered as a choice. Today only `lg`: its 21,705 `lg1`
 *    terms ship IN THE SEED, in `matrix_langs` — the table the engine reads
 *    (getMatrixTableFromTipo('lg1') = 'matrix_langs'). The old `lg1.copy.gz`
 *    import forced them into matrix_hierarchy instead, where nothing reads them:
 *    unread duplicates. Measured 2026-10-08 on the suite DB (rolled back):
 *    with ZERO lg rows in matrix_hierarchy, activateHierarchy applied
 *    'flagged active' / 'active in thesaurus: Yes' / 'hierarchy59: linked the
 *    existing root lg2/2' and inspectHierarchy reported it usable, its root
 *    lg1/1 resolved in matrix_langs. The descriptor lives HERE, not in
 *    hierarchies.json, so it can never be offered or imported.
 *  - OPTIONAL (hierarchies.json ∩ vendored `<tld>1.copy.gz`): the thesauri an
 *    operator chooses. `install_checked_default` in hierarchies.json is the ONE
 *    default every install front end shares (`defaultOptionalHierarchies`).
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HIERARCHY_IMPORT_DIR } from './paths.ts';

export interface HierarchyMeta {
	tld: string;
	label: string;
	typology: number;
	active_in_thesaurus: boolean;
	/** Pre-selected by every install front end (CLI, wizard, install.sh). */
	install_checked_default?: boolean;
}

/** The hierarchies every install activates, whatever the operator picks (see header). */
export const CORE_HIERARCHIES: readonly HierarchyMeta[] = Object.freeze([
	Object.freeze({ tld: 'lg', label: 'Languages', typology: 3, active_in_thesaurus: true }),
]);

/** Is `tld` a CORE hierarchy (always activated, never imported)? Case/space-insensitive. */
export function isCoreHierarchyTld(tld: string): boolean {
	const wanted = tld.trim().toLowerCase();
	return CORE_HIERARCHIES.some((meta) => meta.tld === wanted);
}

/** Read a JSON file from the vendored hierarchy dir, or a fallback on absence. */
export function readHierarchyJson<T>(fileName: string, fallback: T): T {
	try {
		const path = join(HIERARCHY_IMPORT_DIR, fileName);
		if (!existsSync(path)) return fallback;
		return JSON.parse(readFileSync(path, 'utf8')) as T;
	} catch {
		return fallback;
	}
}

/** The tlds we can actually install = the vendored `<tld>1.copy.gz` data files. */
export function availableHierarchyTlds(): Set<string> {
	try {
		if (!existsSync(HIERARCHY_IMPORT_DIR)) return new Set();
		return new Set(
			readdirSync(HIERARCHY_IMPORT_DIR)
				.filter((name) => /^[a-z]+1\.copy\.gz$/.test(name))
				.map((name) => name.replace(/1\.copy\.gz$/, '')),
		);
	} catch {
		return new Set();
	}
}

/** The hierarchies the wizard should offer: metadata ∩ vendored data files. */
export function offeredHierarchies(): HierarchyMeta[] {
	const meta = readHierarchyJson<HierarchyMeta[]>('hierarchies.json', []);
	const available = availableHierarchyTlds();
	if (available.size === 0) return []; // no data files vendored → nothing to offer
	return meta.filter((entry) => available.has(entry.tld));
}

/**
 * The ONE default set of optional thesauri — data-sourced from hierarchies.json
 * `install_checked_default`, restricted to what is vendored. The CLI default
 * and the wizard's pre-checked boxes both read this; a second list is a fork.
 */
export function defaultOptionalHierarchies(): string[] {
	return offeredHierarchies()
		.filter((meta) => meta.install_checked_default === true)
		.map((meta) => meta.tld);
}

/**
 * The descriptor for ONE tld — a CORE hierarchy first, then hierarchies.json —
 * or null when it is registered in neither.
 */
export function hierarchyMetaByTld(tld: string): HierarchyMeta | null {
	const wanted = tld.trim().toLowerCase();
	const core = CORE_HIERARCHIES.find((entry) => entry.tld === wanted);
	if (core !== undefined) return core;
	const meta = readHierarchyJson<HierarchyMeta[]>('hierarchies.json', []);
	return meta.find((entry) => entry.tld?.trim().toLowerCase() === wanted) ?? null;
}
