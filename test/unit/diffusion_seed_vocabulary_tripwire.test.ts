/**
 * TRIPWIRE — every shipped diffusion element speaks the engine's vocabulary
 * (audit 2026-08-26, PUB-04 / P1-13).
 *
 * WHY THIS EXISTS. The plan compiler resolves an element's output format as
 * `properties.diffusion.type` (src/diffusion/plan/compile.ts) and has NO alias
 * for the v6 spelling `class_name` — deliberately: an engine that reads a
 * retired key forever is an engine that never retires it. But every ontology
 * this repo shipped spoke v6: 49 × `class_name`, 0 × `type` across the
 * importable packages, and the generic `test` TLD source of record too. On a
 * fresh install not one shipped element compiled, and nobody saw it because
 * the maintainer's own database had been hand-migrated and both compile gates
 * authored a synthetic node with `type: 'sql'` hardcoded.
 *
 * The ontology has THREE shipped copies and a gate must read all three, or
 * the one it skips is where the retired key comes back:
 *   1. src/core/test_data/test_tld_ontology.json — the `test` TLD source of
 *      record, materialized at install and into the suite database;
 *   2. install/import/ontology/7.0/<tld>.copy.gz — the operator-importable
 *      matrix_ontology packages a museum pulls through the ontology-update
 *      manifest, corrected once by scripts/seed_diffusion_type_rewrite.ts;
 *   3. install/db/dedalo_install.pgsql.gz — the install seed, corrected at
 *      first boot by install/db/migrations/0008_diffusion_element_type.sql
 *      (migration-only, like 0004/0006/0007: the artefact itself still says
 *      `class_name`, so this leg asserts every retired value the seed ships
 *      is one the migration MAPS — the seed AS MIGRATED is clean).
 * Plus the two places the mapping is spelled — the migration's VALUES list and
 * the rewrite script's map — which must be the same three pairs, and the
 * engine's KNOWN_FORMATS, which must accept every type the mapping produces.
 *
 * The v5 copies (`propiedades` text, `ontology19` entries) are NOT judged: the
 * engine never reads them and the correction leaves them byte-identical. What
 * is judged is what the parser folds into `properties`: the JSON node's
 * `properties`, a package row's `ontology18`, the seed's `properties` column
 * and `ontology18` — and, for the seed, the v5 copy ONLY as "is this value
 * within the migration's reach".
 *
 * ENUMERATED, shrink-only exemption: dd60 (`diffusion_section_stats`, the v6
 * section-statistics renderer) has no v7 format; it keeps its retired key in
 * the `dd` package and the seed, and fails loudly at compile — pinned as the
 * positive control of the loud branch by diffusion_seed_compiles_native.
 *
 * ANTI-VACUITY: census floors on every corpus (files, rows, elements); every
 * judge fires on a planted offender (a `class_name` block, an unknown `type`,
 * a v5-only row the rewrite would still touch).
 *
 * HERMETIC: filesystem reads of tracked files only. No DB, no network.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import {
	COPY_MISC_COLUMN_INDEX,
	DIFFUSION_TYPE_BY_CLASS_NAME,
	decodeCopyField,
	ontologyPackageFiles,
	rewriteMisc,
	rewriteOntologyPackages,
} from '../../scripts/seed_diffusion_type_rewrite.ts';
import {
	coreClosure,
	loadTestTldOntologyDoc,
} from '../../src/core/test_data/test_tld_materialize.ts';
import { KNOWN_FORMATS } from '../../src/diffusion/plan/formats.ts';

const REPO = join(import.meta.dir, '..', '..');
const SEED = join(REPO, 'install', 'db', 'dedalo_install.pgsql.gz');
const MIGRATION = join(REPO, 'install', 'db', 'migrations', '0008_diffusion_element_type.sql');

/**
 * ENUMERATED exemption — shrink-only. Key: the node tipo; value: why.
 * The migration lane is UPDATE-only, so a node with no v7 format cannot be
 * retired from here; it stays loud at compile instead.
 */
const RETIRED_KEY_EXEMPTIONS: ReadonlyMap<string, string> = new Map([
	[
		'dd60',
		'diffusion_section_stats — the v6 section-statistics renderer has no v7 output format; compile refuses it loudly (diffusion_seed_compiles_native pins the error)',
	],
]);

// ---------------------------------------------------------------------------
// The judge — one diffusion block, one verdict
// ---------------------------------------------------------------------------

/** What a v7 diffusion block must look like to compile. Pure. */
function judgeDiffusionBlock(
	where: string,
	tipo: string,
	block: Record<string, unknown> | null | undefined,
): string[] {
	if (block === null || block === undefined) return [];
	const faults: string[] = [];
	if (block.class_name !== undefined) {
		if (!RETIRED_KEY_EXEMPTIONS.has(tipo)) {
			faults.push(
				`${where} ${tipo}: carries the RETIRED properties.diffusion.class_name ${JSON.stringify(block.class_name)} — the engine reads only 'type'`,
			);
		}
		return faults;
	}
	const type = block.type;
	if (typeof type !== 'string' || !KNOWN_FORMATS.has(type)) {
		faults.push(
			`${where} ${tipo}: properties.diffusion.type ${JSON.stringify(type)} is not a KNOWN_FORMAT (${[...KNOWN_FORMATS].join(', ')})`,
		);
	}
	return faults;
}

function diffusionBlockOfProperties(properties: unknown): Record<string, unknown> | null {
	if (properties === null || typeof properties !== 'object' || Array.isArray(properties))
		return null;
	const block = (properties as Record<string, unknown>).diffusion;
	return block !== null && typeof block === 'object' && !Array.isArray(block)
		? (block as Record<string, unknown>)
		: null;
}

/** The diffusion blocks of a matrix_ontology `misc.ontology18` dataframe. */
function v7BlocksOfMisc(misc: unknown): Record<string, unknown>[] {
	if (misc === null || typeof misc !== 'object') return [];
	const entries = (misc as Record<string, unknown>).ontology18;
	if (!Array.isArray(entries)) return [];
	const blocks: Record<string, unknown>[] = [];
	for (const entry of entries) {
		const block = diffusionBlockOfProperties((entry as { value?: unknown })?.value);
		if (block !== null) blocks.push(block);
	}
	return blocks;
}

// ---------------------------------------------------------------------------
// COPY-block reader for the pg_dump seed (column names from the header)
// ---------------------------------------------------------------------------

interface CopyBlock {
	table: string;
	columns: string[];
	rows: string[][];
}

function copyBlocksOf(dump: string, tables: ReadonlySet<string>): CopyBlock[] {
	const lines = dump.split('\n');
	const blocks: CopyBlock[] = [];
	for (let i = 0; i < lines.length; i += 1) {
		const header = /^COPY public\.([a-z_]+) \(([^)]+)\) FROM stdin;$/.exec(lines[i] as string);
		if (header === null || !tables.has(header[1] as string)) continue;
		const block: CopyBlock = {
			table: header[1] as string,
			columns: (header[2] as string).split(',').map((column) => column.trim()),
			rows: [],
		};
		for (i += 1; i < lines.length && lines[i] !== '\\.'; i += 1) {
			block.rows.push((lines[i] as string).split('\t'));
		}
		blocks.push(block);
	}
	return blocks;
}

function cell(block: CopyBlock, row: string[], column: string): string | null {
	const index = block.columns.indexOf(column);
	if (index === -1) return null;
	return decodeCopyField(row[index] ?? '\\N');
}

/** Every `class_name` value a JSON text carries, at any depth. */
function classNamesIn(text: string | null): string[] {
	if (text === null) return [];
	return [...text.matchAll(/"class_name"\s*:\s*"([^"]*)"/g)].map((hit) => hit[1] as string);
}

// ---------------------------------------------------------------------------
// 1. The generic `test` TLD source of record
// ---------------------------------------------------------------------------

describe('diffusion seed vocabulary — test_tld_ontology.json', () => {
	test('every diffusion element with a v7 block declares a KNOWN_FORMAT type, never class_name; every SHIPPED element has one', async () => {
		const doc = await loadTestTldOntologyDoc();
		const shipped = new Set((await coreClosure(doc.nodes)).map((node) => node.tipo));
		const elements = doc.nodes.filter((node) => (node.model ?? '').startsWith('diffusion_element'));
		expect(elements.length, 'census floor: diffusion elements in the JSON').toBeGreaterThan(10);
		expect(doc.nodes.length, 'census floor: nodes in the JSON').toBeGreaterThan(8000);

		const faults: string[] = [];
		let shippedElements = 0;
		let judged = 0;
		for (const node of elements) {
			const block = diffusionBlockOfProperties(node.properties);
			if (block !== null) judged += 1;
			faults.push(...judgeDiffusionBlock('json', node.tipo, block));
			// A SHIPPED element (the install's core closure) with no v7 block at
			// all cannot compile either — properties NULL is the same silence as
			// the retired key. Aliases resolve to their real element and carry none.
			if (shipped.has(node.tipo) && node.model === 'diffusion_element') {
				shippedElements += 1;
				if (block === null) {
					faults.push(
						`json ${node.tipo}: SHIPPED (core closure) diffusion_element without properties.diffusion — cannot compile`,
					);
				}
			}
		}
		expect(judged, 'census floor: elements carrying a v7 diffusion block').toBeGreaterThan(4);
		expect(shippedElements, 'census floor: shipped diffusion_element nodes').toBeGreaterThan(2);
		expect(faults).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// 2. The importable packages (install/import/ontology/7.0/*.copy.gz)
// ---------------------------------------------------------------------------

describe('diffusion seed vocabulary — install/import/ontology/7.0 packages', () => {
	test('every ontology18 diffusion block is typed, and the rewrite has nothing left to do', () => {
		const files = ontologyPackageFiles();
		expect(files.length, 'census floor: packages').toBeGreaterThan(100);

		const faults: string[] = [];
		let judged = 0;
		for (const file of files) {
			const name = file.slice(file.lastIndexOf('/') + 1);
			const tld = name.replace(/\.copy\.gz$/, '');
			const text = gunzipSync(readFileSync(file)).toString('utf8');
			for (const line of text.split('\n')) {
				if (line === '') continue;
				const fields = line.split('\t');
				const raw = decodeCopyField(fields[COPY_MISC_COLUMN_INDEX] ?? '\\N');
				if (raw === null) continue;
				const misc = JSON.parse(raw) as unknown;
				const tipo = `${tld}${decodeCopyField(fields[0] as string) ?? ''}`;
				for (const block of v7BlocksOfMisc(misc)) {
					judged += 1;
					faults.push(...judgeDiffusionBlock(name, tipo, block));
				}
			}
		}
		expect(judged, 'census floor: ontology18 diffusion blocks across the packages').toBeGreaterThan(
			10,
		);
		expect(faults).toEqual([]);

		// The v5-only shape (block only in ontology19) is what the rewrite ports;
		// a package the rewrite would still touch ships a retired spelling.
		const pending = rewriteOntologyPackages({ write: false }).filter(
			(result) => result.rewritten > 0,
		);
		expect(
			pending.map((result) => `${result.file}: ${result.rewritten} rows`),
			'run `bun run scripts/seed_diffusion_type_rewrite.ts`',
		).toEqual([]);
		// ...and the only value it leaves unmapped is the enumerated exemption.
		const unmapped = new Set(
			rewriteOntologyPackages({ write: false }).flatMap((result) => result.unmapped),
		);
		expect([...unmapped]).toEqual(['diffusion_section_stats']);
	});
});

// ---------------------------------------------------------------------------
// 3. The install seed, AS MIGRATED by 0008
// ---------------------------------------------------------------------------

/** The `(class_name, type)` pairs the migration's VALUES lists spell. */
function migrationMapping(sqlText: string): Record<string, string> {
	const mapping: Record<string, string> = {};
	for (const hit of sqlText.matchAll(/\('(diffusion_[a-z_]+)',\s*'([a-z]+)'\)/g)) {
		mapping[hit[1] as string] = hit[2] as string;
	}
	return mapping;
}

describe('diffusion seed vocabulary — install/db/dedalo_install.pgsql.gz + migration 0008', () => {
	const migrationSql = readFileSync(MIGRATION, 'utf8');

	test('the migration and the rewrite script spell the SAME mapping, and every mapped type is a KNOWN_FORMAT', () => {
		expect(migrationMapping(migrationSql)).toEqual({ ...DIFFUSION_TYPE_BY_CLASS_NAME });
		for (const type of Object.values(DIFFUSION_TYPE_BY_CLASS_NAME)) {
			expect(
				KNOWN_FORMATS.has(type),
				`mapped type '${type}' must be accepted by the compiler`,
			).toBe(true);
		}
		expect(migrationSql).toContain('-- SHARED-ROW SEED CORRECTION:');
	});

	test('every retired spelling the seed ships is within the migration’s reach (typed blocks are KNOWN_FORMATs)', () => {
		const dump = gunzipSync(readFileSync(SEED)).toString('utf8');
		const blocks = copyBlocksOf(
			dump,
			new Set(['dd_ontology', 'dd_ontology_recovery', 'matrix_ontology']),
		);
		expect(blocks.map((block) => block.table).sort()).toEqual([
			'dd_ontology',
			'dd_ontology_recovery',
			'matrix_ontology',
		]);
		const mapping = migrationMapping(migrationSql);
		const faults: string[] = [];
		let retiredValues = 0;
		let typedBlocks = 0;
		for (const block of blocks) {
			expect(block.rows.length, `census floor: ${block.table} rows in the seed`).toBeGreaterThan(
				100,
			);
			for (const row of block.rows) {
				const isNodeTable = block.table !== 'matrix_ontology';
				const tipo = isNodeTable
					? (cell(block, row, 'tipo') ?? '?')
					: `${(cell(block, row, 'section_tipo') ?? '').replace(/0$/, '')}${cell(block, row, 'section_id') ?? ''}`;
				// (i) the v7 copy the engine reads: typed, or exempt.
				const v7Text = isNodeTable ? cell(block, row, 'properties') : cell(block, row, 'misc');
				const v7Blocks = isNodeTable
					? [diffusionBlockOfProperties(v7Text === null ? null : JSON.parse(v7Text))].filter(
							(item): item is Record<string, unknown> => item !== null,
						)
					: v7BlocksOfMisc(v7Text === null ? null : JSON.parse(v7Text));
				for (const v7Block of v7Blocks) {
					if (typeof v7Block.class_name === 'string') {
						// Retired in the artefact — admissible ONLY because 0008 maps it
						// (or it is the enumerated exemption).
						retiredValues += 1;
						if (mapping[v7Block.class_name] === undefined && !RETIRED_KEY_EXEMPTIONS.has(tipo)) {
							faults.push(
								`${block.table} ${tipo}: v7 class_name '${v7Block.class_name}' is neither mapped by 0008 nor an enumerated exemption`,
							);
						}
					} else {
						typedBlocks += 1;
						faults.push(...judgeDiffusionBlock(block.table, tipo, v7Block));
					}
				}
				// (ii) the v5 copy: every class_name it carries must be one the
				// migration ports (shape b) — or the exemption.
				const v5Text = isNodeTable
					? cell(block, row, 'propiedades')
					: (() => {
							const misc = v7Text === null ? null : (JSON.parse(v7Text) as Record<string, unknown>);
							return misc === null || misc.ontology19 === undefined
								? null
								: JSON.stringify(misc.ontology19);
						})();
				for (const className of classNamesIn(v5Text)) {
					retiredValues += 1;
					if (mapping[className] === undefined && !RETIRED_KEY_EXEMPTIONS.has(tipo)) {
						faults.push(
							`${block.table} ${tipo}: v5 class_name '${className}' is neither mapped by 0008 nor an enumerated exemption`,
						);
					}
				}
			}
		}
		// The seed DOES still ship retired spellings (migration-only correction,
		// by precedent) — that is what makes this leg a real census: if the seed
		// is ever regenerated clean, this floor moves to the typed count.
		expect(
			retiredValues + typedBlocks,
			'census floor: diffusion blocks in the seed',
		).toBeGreaterThan(8);
		expect(faults).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// 4. Anti-vacuity — every judge fires on a planted offender
// ---------------------------------------------------------------------------

describe('diffusion seed vocabulary — planted offenders', () => {
	test('the block judge refuses class_name, an unknown type and a missing type; accepts every KNOWN_FORMAT', () => {
		expect(judgeDiffusionBlock('probe', 'zzsv1', { class_name: 'diffusion_mysql' })).toHaveLength(
			1,
		);
		expect(judgeDiffusionBlock('probe', 'zzsv1', { type: 'mysql' })).toHaveLength(1);
		expect(judgeDiffusionBlock('probe', 'zzsv1', {})).toHaveLength(1);
		expect(judgeDiffusionBlock('probe', 'zzsv1', null)).toEqual([]);
		for (const type of KNOWN_FORMATS) {
			expect(judgeDiffusionBlock('probe', 'zzsv1', { type, service_name: 'x' })).toEqual([]);
		}
		// The exemption is by tipo, and ONLY for a retired key — a wrong `type`
		// on dd60 would still be refused.
		expect(judgeDiffusionBlock('probe', 'dd60', { class_name: 'diffusion_section_stats' })).toEqual(
			[],
		);
		expect(judgeDiffusionBlock('probe', 'dd60', { type: 'section_stats' })).toHaveLength(1);
	});

	test('the rewrite ports every shipped shape and leaves the exemption alone', () => {
		// (a) retired key in the v7 entry
		const a = rewriteMisc({
			ontology18: [
				{ id: 1, value: { diffusion: { class_name: 'diffusion_rdf', service_name: 'n' } } },
			],
		});
		expect(a.changed).toBe(true);
		expect(v7BlocksOfMisc(a.misc)).toEqual([{ service_name: 'n', type: 'rdf' }]);
		// (b) v5-only, no v7 entry
		const b = rewriteMisc({
			ontology19: [{ id: 1, value: { diffusion: { class_name: 'diffusion_mysql' }, x: 1 } }],
		});
		expect(b.changed).toBe(true);
		expect(v7BlocksOfMisc(b.misc)).toEqual([{ type: 'sql' }]);
		expect(b.misc.ontology19).toEqual([
			{ id: 1, value: { diffusion: { class_name: 'diffusion_mysql' }, x: 1 } },
		]);
		// (b') v5-only, EMPTY v7 entry
		const c = rewriteMisc({
			ontology18: [{ id: 1, value: {} }],
			ontology19: [{ id: 1, value: { diffusion: { class_name: 'diffusion_socrata' } } }],
		});
		expect(c.changed).toBe(true);
		expect(v7BlocksOfMisc(c.misc)).toEqual([{ type: 'socrata' }]);
		// the exemption: untouched, reported
		const d = rewriteMisc({
			ontology18: [{ id: 1, value: { diffusion: { class_name: 'diffusion_section_stats' } } }],
		});
		expect(d.changed).toBe(false);
		expect(d.unmapped).toEqual(['diffusion_section_stats']);
		// already typed: idempotent
		const e = rewriteMisc({ ontology18: [{ id: 1, value: { diffusion: { type: 'sql' } } }] });
		expect(e.changed).toBe(false);
	});

	test('the seed reader finds a planted class_name in a synthetic COPY block', () => {
		const dump = [
			'COPY public.dd_ontology (id, tipo, properties, propiedades) FROM stdin;',
			'1\tzz9\t{"diffusion": {"class_name": "diffusion_xyz"}}\t\\N',
			'2\tzz8\t\\N\t{\\n  "diffusion": {"class_name": "diffusion_abc"}}',
			'\\.',
		].join('\n');
		const [block] = copyBlocksOf(dump, new Set(['dd_ontology']));
		expect(block?.rows).toHaveLength(2);
		const v7 = diffusionBlockOfProperties(
			JSON.parse(
				cell(block as CopyBlock, (block as CopyBlock).rows[0] as string[], 'properties') as string,
			),
		);
		expect(v7?.class_name).toBe('diffusion_xyz');
		expect(
			classNamesIn(
				cell(block as CopyBlock, (block as CopyBlock).rows[1] as string[], 'propiedades'),
			),
		).toEqual(['diffusion_abc']);
		expect(migrationMapping("('diffusion_mysql', 'sql'),\n('diffusion_rdf', 'rdf')")).toEqual({
			diffusion_mysql: 'sql',
			diffusion_rdf: 'rdf',
		});
	});
});
