/**
 * THE MASTER'S DEFINITION OF A TLD, AS THIS ENGINE RELEASE SHIPS IT — the `active_ontologies`
 * entry of the vendored `install/import/ontology/<major.minor>/ontology.json` (the master's own
 * export, replaced only with the code tree).
 *
 * WHY. A TLD's registry row (typology `hierarchy9`, name `hierarchy5`) is a DEFINITION, and
 * definitions belong to the master ontology (AGENTS.md). Normally a row reaches an installation
 * through an ontology import (ontology_write.ts syncMainSectionFromDefinition). The typology
 * GROUPER tlds (`hierarchytype`, `hierarchymtype`) are the exception: they are not core and no
 * ontology declares them as a dependency, so a default ACTIVE_ONTOLOGY_TLDS never imports them —
 * the engine registers them ON DEMAND the first time a thesaurus is provisioned
 * (createParentGrouper). That registration used invented values (typology Core 14, generic
 * labels) where the master says otherwise (`hierarchytype` / `hierarchymtype`: typology 12),
 * and no import ever corrected it. Now the registration takes the master's definition from
 * here; the invented values remain only the fallback for a tld this release does not define.
 * Gate: test/unit/ontology_root_registry_native.test.ts (D1–D3).
 *
 * Read on demand (a registration is rare — once per grouper tld per installation), async (never
 * a synchronous read on a request path), no module state. An absent or unreadable file, or a
 * tld it does not carry, is `null`: the caller's documented fallback applies.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { VENDORED_ONTOLOGY_DIR } from '../install/paths.ts';

/** The name items of a definition, as `FileItem.name_data` takes them. */
export interface ReleaseNameItem {
	id?: number;
	lang: string;
	value: string;
}

export interface ReleaseTldDefinition {
	/** The typology the master files the tld under (hierarchy9 → `ontologytype<id>`); null = none stated. */
	typologyId: number | null;
	/** The tld's name in every language the master states; null = none stated. */
	nameData: ReleaseNameItem[] | null;
}

/** A positive integer typology id, or null (the registry's own rule: only > 0 is a typology). */
function typologyIdOf(value: unknown): number | null {
	const id = typeof value === 'number' || typeof value === 'string' ? Number(value) : Number.NaN;
	return Number.isInteger(id) && id > 0 ? id : null;
}

/** One well-formed name item (a non-empty string `lang`, a scalar `value`), or null. */
function nameItemOf(raw: Record<string, unknown> | null | undefined): ReleaseNameItem | null {
	const lang = raw?.lang;
	const value = raw?.value;
	if (typeof lang !== 'string' || lang === '') return null;
	if (typeof value !== 'string' && typeof value !== 'number') return null;
	const item: ReleaseNameItem = { lang, value: String(value) };
	if (typeof raw?.id === 'number') item.id = raw.id;
	return item;
}

/** The well-formed name items, or null when none. */
function nameDataOf(value: unknown): ReleaseNameItem[] | null {
	if (!Array.isArray(value)) return null;
	const items = (value as Record<string, unknown>[])
		.map(nameItemOf)
		.filter((item): item is ReleaseNameItem => item !== null);
	return items.length > 0 ? items : null;
}

/**
 * PURE: `tld`'s definition in a parsed ontology.json (the FIRST `active_ontologies` entry of
 * the tld wins, as every reader of that file does), or null when the file does not define it.
 */
export function releaseTldDefinitionFrom(
	parsed: unknown,
	tld: string,
): ReleaseTldDefinition | null {
	const entries = (parsed as { active_ontologies?: unknown } | null)?.active_ontologies;
	if (!Array.isArray(entries)) return null;
	const entry = (entries as Record<string, unknown>[]).find((item) => item?.tld === tld);
	if (entry === undefined) return null;
	return { typologyId: typologyIdOf(entry.typology_id), nameData: nameDataOf(entry.name_data) };
}

/** `tld`'s definition in the release this engine ships; null when absent (or the file is unreadable). */
export async function releaseTldDefinition(tld: string): Promise<ReleaseTldDefinition | null> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(await readFile(join(VENDORED_ONTOLOGY_DIR, 'ontology.json'), 'utf8'));
	} catch {
		return null;
	}
	return releaseTldDefinitionFrom(parsed, tld);
}
