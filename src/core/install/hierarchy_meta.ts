/**
 * The vendored hierarchy DESCRIPTORS (install/import/hierarchy/hierarchies.json):
 * what each installable tld IS — its label, its typology, whether it should be
 * active in the thesaurus. ONE reader, shared by the two consumers that must agree:
 * the wizard's checkbox list (install/context.ts) and the activation that runs on
 * the tlds it returns (install/hierarchy_activate.ts). A second copy of this
 * lookup would let the wizard offer a hierarchy the activator cannot describe.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { HIERARCHY_IMPORT_DIR } from './paths.ts';

export interface HierarchyMeta {
	tld: string;
	label: string;
	typology: number;
	active_in_thesaurus: boolean;
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

/** The descriptor for ONE tld, or null when it is not registered in hierarchies.json. */
export function hierarchyMetaByTld(tld: string): HierarchyMeta | null {
	const wanted = tld.trim().toLowerCase();
	const meta = readHierarchyJson<HierarchyMeta[]>('hierarchies.json', []);
	return meta.find((entry) => entry.tld?.trim().toLowerCase() === wanted) ?? null;
}
