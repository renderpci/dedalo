/**
 * THE ONTOLOGY PROPERTY CENSUS CORPUS (DEAD-08 / P2-27) — the two artefacts
 * that hold every `properties` key an install SHIPS, and the code trees that
 * could read one.
 *
 * WHAT IS IN. `install/db/dedalo_install.pgsql.gz` (the `COPY public.dd_ontology`
 * block — what a fresh install's ontology IS) and
 * `src/core/test_data/test_tld_ontology.json` (the generic `test` TLD, source
 * of record since the 2026-08-19 migration, and shipped in every install's Test
 * area). Together: 3814 seed rows + the test TLD, 404 distinct top-level keys.
 *
 * WHAT IS NOT, and why: `install/import/ontology/7.0/*.copy.gz` are matrix
 * RECORD packages (an ontology authored AS records), not dd_ontology rows —
 * their property bags only become dd_ontology through the parser, so they are a
 * different census with a different reader. An install's own authored nodes are
 * likewise out of a repo gate's reach: that half is `scripts/ontology_property_report.ts`.
 *
 * THE READER SIDE is the registered shared listers, never a private walk:
 * `writePathSourceFiles()` (src + tools + scripts) and `firstPartyClientFiles()`
 * (the browser trees). Comments are STRIPPED before the word scan — a key named
 * only in a comment, or in a commented-out branch, is exactly the dead-key
 * shape this census exists to find (`hard_delete` is one).
 *
 * HERMETIC: repo files only, no database.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { firstPartyClientFiles } from './browser_corpus.ts';
import { stripComments } from './strip_comments.ts';
import { REPO_ROOT, writePathSourceFiles } from './write_path_corpus.ts';

/** The shipped seed dump (mirrors src/core/install/paths.ts SEED_DUMP_PATH). */
export const SEED_DUMP_PATH = 'install/db/dedalo_install.pgsql.gz';
/** The generic `test` TLD ontology, source of record. */
export const TEST_TLD_ONTOLOGY_PATH = 'src/core/test_data/test_tld_ontology.json';

/** Anti-vacuity floors: the corpus measured 2026-09-05 was 3814 + 706 nodes. */
export const SEED_NODE_FLOOR = 3000;
export const PROPERTY_KEY_FLOOR = 300;

/** One node of the shipped corpus: its tipo and its raw properties bag. */
export interface CorpusNode {
	tipo: string;
	properties: unknown;
}

/** Undo psql COPY text escaping for one field (`\N` → null). */
function unescapeCopyField(field: string): string | null {
	if (field === '\\N') return null;
	return field
		.replace(/\\t/g, '\t')
		.replace(/\\n/g, '\n')
		.replace(/\\r/g, '\r')
		.replace(/\\\\/g, '\\');
}

/** Every dd_ontology row of the install seed, as {tipo, properties}. */
export function seedOntologyNodes(): CorpusNode[] {
	const raw = gunzipSync(readFileSync(join(REPO_ROOT, SEED_DUMP_PATH))).toString('utf8');
	const block = /COPY public\.dd_ontology \(([^)]*)\) FROM stdin;\n([\s\S]*?)\n\\\.\n/.exec(raw);
	if (block === null) throw new Error(`${SEED_DUMP_PATH}: dd_ontology COPY block not found`);
	const columns = (block[1] as string).split(',').map((column) => column.trim());
	const tipoIndex = columns.indexOf('tipo');
	const propertiesIndex = columns.indexOf('properties');
	if (tipoIndex === -1 || propertiesIndex === -1) {
		throw new Error(`${SEED_DUMP_PATH}: dd_ontology COPY block has no tipo/properties column`);
	}
	const nodes: CorpusNode[] = [];
	for (const line of (block[2] as string).split('\n')) {
		if (line === '') continue;
		const fields = line.split('\t');
		const rawProperties = unescapeCopyField(fields[propertiesIndex] ?? '\\N');
		let properties: unknown = null;
		if (rawProperties !== null) {
			try {
				properties = JSON.parse(rawProperties);
			} catch {
				properties = null;
			}
		}
		nodes.push({ tipo: fields[tipoIndex] ?? '', properties });
	}
	return nodes;
}

/** Every node of the generic `test` TLD ontology, as {tipo, properties}. */
export function testTldOntologyNodes(): CorpusNode[] {
	const doc = JSON.parse(readFileSync(join(REPO_ROOT, TEST_TLD_ONTOLOGY_PATH), 'utf8')) as {
		nodes: { tipo: string; properties: unknown }[];
	};
	return doc.nodes.map((node) => ({ tipo: node.tipo, properties: node.properties }));
}

/** The whole shipped corpus: seed rows + the generic test TLD. */
export function shippedOntologyNodes(): CorpusNode[] {
	return [...seedOntologyNodes(), ...testTldOntologyNodes()];
}

/** key → the tipos that carry it, over the shipped corpus. */
export function shippedPropertyKeyUsage(): Map<string, string[]> {
	const usage = new Map<string, string[]>();
	for (const node of shippedOntologyNodes()) {
		const properties = node.properties;
		if (properties === null || typeof properties !== 'object' || Array.isArray(properties))
			continue;
		for (const key of Object.keys(properties as Record<string, unknown>)) {
			const tipos = usage.get(key) ?? [];
			tipos.push(node.tipo);
			usage.set(key, tipos);
		}
	}
	return usage;
}

/** Every tipo the shipped corpus defines (the tipo-keyed-map self-check). */
export function shippedTipos(): Set<string> {
	return new Set(shippedOntologyNodes().map((node) => node.tipo));
}

/**
 * The ONE file the reader scan must not read: the registry that NAMES every
 * dead key in order to declare it dead. Counting it would make each enumerated
 * key "read" and empty the census — the gate would go green by existing.
 * ENUMERATED with its reason, shrink-only; anything else that mentions a key is
 * a reader.
 */
export const CODE_SCAN_EXCLUSIONS: Readonly<Record<string, string>> = {
	'src/core/ontology/property_census.ts':
		'the retired-key REGISTRY — it names each dead key to declare it dead, and would otherwise read as its own reader',
};

/**
 * The reader corpus: the registered shared listers' files, minus the
 * enumerated exclusion. OVER-approximates readership (a key spelled like an
 * ordinary word counts wherever that word occurs), which is the safe
 * direction: the unread set it yields is a lower bound.
 */
export function codeCorpusFiles(): string[] {
	return [...writePathSourceFiles(), ...firstPartyClientFiles()].filter(
		(file) => CODE_SCAN_EXCLUSIONS[file] === undefined,
	);
}

/**
 * Every identifier-shaped word of {@link codeCorpusFiles}, comments stripped.
 */
export function firstPartyCodeWords(): Set<string> {
	const words = new Set<string>();
	for (const file of codeCorpusFiles()) {
		const source = stripComments(readFileSync(join(REPO_ROOT, file), 'utf8'));
		for (const word of source.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) words.add(word);
	}
	return words;
}
