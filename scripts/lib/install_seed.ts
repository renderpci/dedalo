/**
 * THE INSTALL SEED'S CONTRACT — constants and PURE readers shared by the one
 * builder (`scripts/build_install_seed.ts`, `bun run seed:build`) and the one
 * gate (`test/unit/install_seed_drift_tripwire.test.ts`).
 *
 * WHAT THE SEED IS (installer unification A2). `install/db/dedalo_install.pgsql.gz`
 * is a plain-format `pg_dump` of a CORE-ONLY database: the schema, the core
 * ontologies (`CORE_ONTOLOGY_TLDS` — one home, src/core/ontology/core_tlds.ts),
 * the languages thesaurus terms, the root user and the default project/profiles.
 * NO domain ontology (oh, tch… are an install ANSWER, imported by the
 * installer's ontology door), NO test TLD and NO test3 playground (both are the
 * SUITE's, added by `bun run test:db:setup` after it builds the suite database
 * through the installer's own doors). The derived search stores ship EMPTY
 * (`--exclude-table-data`): the installer fills them through the engine's own
 * door (db_assets.ts ensureSearchStores) right after the restore.
 *
 * HOW IT IS PRODUCED — never by hand. The builder restores the previous seed
 * into a uniquely named SCRATCH database it creates (and always drops), deletes
 * every non-core row, dumps it with `SEED_DUMP_OPTIONS`, measures the dump with
 * `seedCensus` + `seedCoreViolations` (a dump that fails them is never written)
 * and records its provenance in the sidecar (`SEED_BUILD_SIDECAR_PATH`). The
 * gate re-reads the committed seed with the SAME readers, so "what the builder
 * checked" and "what the gate checks" cannot drift apart.
 *
 * PURE: no SQL text (the builder's DML stays in the builder, the one psql-channel
 * file sql_confinement_tripwire attributes it to), no I/O, no config.
 */

import { type CopyBlock, copyBlockRecords, copyBlocks } from '../../src/core/db/copy_text.ts';

/** The committed seed, repo-relative. */
export const SEED_PATH = 'install/db/dedalo_install.pgsql.gz';

/** The seed's provenance sidecar, repo-relative (written by the builder, read by the gate). */
export const SEED_BUILD_SIDECAR_PATH = 'install/db/dedalo_install.build.json';

/** The builder, repo-relative (the sidecar names it; the gate checks it exists). */
export const SEED_BUILD_SCRIPT = 'scripts/build_install_seed.ts';

/**
 * The DERIVED search stores — rebuilt from the matrix tables by the engine
 * (ensureSearchStores), so the seed carries their schema and NO rows.
 */
export const SEED_DERIVED_STORE_TABLES: readonly string[] = Object.freeze([
	'matrix_string_search',
	'matrix_relation_index',
]);

/**
 * The exact `pg_dump` flags (besides the connection and the database). The
 * format the previous seeds used (plain SQL, large objects, verbose TOC comments,
 * no owner/privileges — an install restores as whatever role it connects with),
 * plus the derived-store exclusion.
 */
export const SEED_DUMP_OPTIONS: readonly string[] = Object.freeze([
	'-F',
	'p',
	'-b',
	'-v',
	'--no-owner',
	'--no-privileges',
	...SEED_DERIVED_STORE_TABLES.map((table) => `--exclude-table-data=public.${table}`),
]);

/**
 * `main_dd` (the legacy per-TLD counter list) keeps these non-ontology rows
 * besides the core TLDs: `localontology` is the counter of an installation's
 * own local ontology, which every install starts with.
 */
export const SEED_KEEP_COUNTER_TLDS: readonly string[] = Object.freeze(['localontology']);

/** Scratch databases the builder creates are named `<prefix><pid>_<epochSeconds>`. */
export const SEED_SCRATCH_PREFIX = 'dedalo_seedbuild_';

/** The ONE scratch-name rule (the builder never accepts a database name argument). */
export function seedScratchDatabaseName(pid: number, epochSeconds: number): string {
	return `${SEED_SCRATCH_PREFIX}${Math.trunc(pid)}_${Math.trunc(epochSeconds)}`;
}

/** The provenance sidecar — what built the committed seed, from what, and what it holds. */
export interface SeedBuildSidecar {
	_doc: string;
	script: string;
	built_at: string;
	git_rev: string;
	source: { path: string; sha256: string };
	pg_dump: string;
	dump_options: string[];
	core_tlds: string[];
	removed: Record<string, number>;
	seed_sha256: string;
	tables: Record<string, number>;
}

/** What a dump holds, measured from its COPY blocks. Every list is sorted and distinct. */
export interface SeedCensus {
	/** COPY row count of EVERY table whose data the dump carries (0 for an empty block). */
	tables: Record<string, number>;
	/** Every `CREATE TABLE public.<t>` of the dump (schema, data or not). */
	createdTables: string[];
	/** dd_ontology.tld */
	ddOntologyTlds: string[];
	/** dd_ontology_recovery.tld */
	recoveryTlds: string[];
	/** matrix_ontology.section_tipo (`<tld>0`) */
	matrixOntologySections: string[];
	/** The ontology registry (matrix_ontology_main, ontology35): each record's TLD (hierarchy6). */
	registryTlds: string[];
	/** main_dd.tld */
	mainDdTlds: string[];
	/** matrix_dd section_tipo prefixes (the TLD a list record belongs to). */
	matrixDdTlds: string[];
}

/** One dd_ontology row of the seed, with the columns the reference classifier reads. */
export interface SeedOntologyRow {
	tipo: string;
	tld: string | null;
	parent: string | null;
	model_tipo: string | null;
	relations: { tipo?: unknown }[] | null;
	is_model: boolean;
}

const ONTOLOGY_REGISTRY_SECTION = 'ontology35';
const REGISTRY_TLD_COMPONENT = 'hierarchy6';

function sortedDistinct(values: readonly (string | null)[]): string[] {
	return [...new Set(values.map((value) => value ?? ''))].sort();
}

function blockOf(blocks: readonly CopyBlock[], table: string): CopyBlock | undefined {
	return blocks.find((block) => block.table === table);
}

/** One column's values across a table's rows (an absent table reads as no rows). */
function columnValues(
	blocks: readonly CopyBlock[],
	table: string,
	column: string,
): (string | null)[] {
	const block = blockOf(blocks, table);
	return block === undefined ? [] : copyBlockRecords(block).map((record) => record[column] ?? null);
}

/** The TLD a registry record's `string` column names (hierarchy6, first value). */
function registryTld(stringColumn: string | null): string {
	if (stringColumn === null) return '';
	const parsed = JSON.parse(stringColumn) as Record<string, { value?: unknown }[] | undefined>;
	const value = parsed[REGISTRY_TLD_COMPONENT]?.[0]?.value;
	return typeof value === 'string' ? value : '';
}

function registryTlds(blocks: readonly CopyBlock[]): string[] {
	const block = blockOf(blocks, 'matrix_ontology_main');
	const rows = block === undefined ? [] : copyBlockRecords(block);
	return sortedDistinct(
		rows
			.filter((row) => row.section_tipo === ONTOLOGY_REGISTRY_SECTION)
			.map((row) => registryTld(row.string ?? null)),
	);
}

/** COPY row counts per table. */
function tableCounts(blocks: readonly CopyBlock[]): Record<string, number> {
	return Object.fromEntries(blocks.map((block) => [block.table, block.rows.length]));
}

/** Measure a plain-format dump (the decompressed seed text). */
export function seedCensus(dumpText: string): SeedCensus {
	const blocks = copyBlocks(dumpText);
	return {
		tables: tableCounts(blocks),
		createdTables: sortedDistinct(
			[...dumpText.matchAll(/^CREATE TABLE public\.(\w+) \(/gm)].map((match) => match[1] ?? ''),
		),
		ddOntologyTlds: sortedDistinct(columnValues(blocks, 'dd_ontology', 'tld')),
		recoveryTlds: sortedDistinct(columnValues(blocks, 'dd_ontology_recovery', 'tld')),
		matrixOntologySections: sortedDistinct(columnValues(blocks, 'matrix_ontology', 'section_tipo')),
		registryTlds: registryTlds(blocks),
		mainDdTlds: sortedDistinct(columnValues(blocks, 'main_dd', 'tld')),
		matrixDdTlds: sortedDistinct(
			columnValues(blocks, 'matrix_dd', 'section_tipo').map((tipo) =>
				(tipo ?? '').replace(/[0-9]+$/, ''),
			),
		),
	};
}

/** `actual` must equal `expected` as sets. */
function sameSet(label: string, actual: readonly string[], expected: readonly string[]): string[] {
	const want = [...new Set(expected)].sort();
	return JSON.stringify(actual) === JSON.stringify(want)
		? []
		: [`${label}: ${JSON.stringify(actual)} — expected exactly ${JSON.stringify(want)}`];
}

/** `actual` must be a subset of `allowed`. */
function subset(label: string, actual: readonly string[], allowed: readonly string[]): string[] {
	const extra = actual.filter((value) => !allowed.includes(value));
	return extra.length === 0
		? []
		: [`${label}: ${JSON.stringify(extra)} outside ${JSON.stringify([...allowed])}`];
}

/** A table that must carry no row. */
function emptyTable(census: SeedCensus, table: string): string[] {
	const rows = census.tables[table];
	if (rows === undefined) return [`${table}: no COPY block in the dump`];
	return rows === 0 ? [] : [`${table}: ${rows} row(s) — must ship empty`];
}

/** A derived store: its schema shipped, its data not (no COPY block, or an empty one). */
function derivedStore(census: SeedCensus, table: string): string[] {
	if (!census.createdTables.includes(table)) return [`${table}: the dump does not create it`];
	const rows = census.tables[table] ?? 0;
	return rows === 0 ? [] : [`${table}: ${rows} row(s) — a derived store ships without data`];
}

/**
 * Everything that makes a dump NOT a core-only seed, as sentences ([] = it is
 * one). The builder refuses to write a dump with any; the gate holds the
 * committed seed to the same list.
 */
export function seedCoreViolations(census: SeedCensus, core: readonly string[]): string[] {
	return [
		...sameSet('dd_ontology TLDs', census.ddOntologyTlds, core),
		...sameSet(
			'matrix_ontology sections',
			census.matrixOntologySections,
			core.map((tld) => `${tld}0`),
		),
		...sameSet('ontology registry (ontology35) TLDs', census.registryTlds, core),
		...subset('main_dd TLDs', census.mainDdTlds, [...core, ...SEED_KEEP_COUNTER_TLDS]),
		...subset('matrix_dd TLDs', census.matrixDdTlds, core),
		...subset('dd_ontology_recovery TLDs', census.recoveryTlds, core),
		...emptyTable(census, 'matrix_test'),
		...SEED_DERIVED_STORE_TABLES.flatMap((table) => derivedStore(census, table)),
	];
}

function parseRelations(raw: string | null): { tipo?: unknown }[] | null {
	if (raw === null || raw === '') return null;
	const parsed = JSON.parse(raw) as unknown;
	return Array.isArray(parsed) ? (parsed as { tipo?: unknown }[]) : null;
}

/** The seed's dd_ontology rows (the structural columns + is_model). */
export function seedOntologyRows(dumpText: string): SeedOntologyRow[] {
	const block = blockOf(copyBlocks(dumpText), 'dd_ontology');
	if (block === undefined) return [];
	return copyBlockRecords(block).map((row) => ({
		tipo: row.tipo ?? '',
		tld: row.tld ?? null,
		parent: row.parent ?? null,
		model_tipo: row.model_tipo ?? null,
		relations: parseRelations(row.relations ?? null),
		is_model: row.is_model === 't',
	}));
}

/** One JSON scalar as it appears on a pretty-printed array line. */
const JSON_SCALAR = String.raw`(?:"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)`;

/** A pretty-printed array of scalars: `<indent>["key": ]\[\n…items…\n<indent>\]`. */
const SCALAR_ARRAY = new RegExp(
	String.raw`^(\t*)((?:"(?:[^"\\]|\\.)*": )?)\[\n((?:\t+${JSON_SCALAR},?\n)+)\t*\]`,
	'gm',
);

/** Printed width of a line: a tab counts as 2 columns (biome's default indent width). */
function printedWidth(line: string): number {
	return line.replace(/\t/g, '  ').length;
}

/**
 * The sidecar as the repository's formatter writes JSON (biome.jsonc: tab
 * indent, line width 100): pretty-printed, with every array of scalars that
 * fits on one line collapsed onto it — so a freshly built sidecar is already
 * lint-clean and a rebuild never produces a formatting-only diff.
 */
export function formatSidecarJson(value: unknown, lineWidth = 100): string {
	const pretty = JSON.stringify(value, null, '\t');
	const collapsed = pretty.replace(
		SCALAR_ARRAY,
		(whole: string, indent: string, key: string, body: string) => {
			const items = body
				.split('\n')
				.filter((line) => line !== '')
				.map((line) => line.trim().replace(/,$/, ''));
			const line = `${indent}${key}[${items.join(', ')}]`;
			// The closing comma (when the array is not the last member) counts too.
			return printedWidth(line) + 1 <= lineWidth ? line : whole;
		},
	);
	return `${collapsed}\n`;
}
