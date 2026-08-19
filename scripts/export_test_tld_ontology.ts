/**
 * Export the generic `test` TLD ontology FROM THE INSTALL SEED to reviewable JSON.
 *
 *   bun run scripts/export_test_tld_ontology.ts          # rewrite the JSON
 *   bun run scripts/export_test_tld_ontology.ts --check  # exit 1 if JSON ≠ seed
 *
 * ── WHY ──────────────────────────────────────────────────────────────────────
 * The generic `test` TLD (test3 and its siblings, ~217 nodes) is the substrate
 * of the whole test suite AND a shipped product feature (the Test area, the
 * unit_test maintenance widget, `db_restore.ts` seeding test3 on every fresh
 * install — decision 2026-08-19: it stays shipped). Its ONLY source was the
 * 2 MB binary dump `install/db/dedalo_install.pgsql.gz`, unreviewable in a
 * diff. This exporter derives `src/core/test_data/test_tld_ontology.json`
 * (~97 kB, one `DdOntologyNode` per row, the same shape a situation takes)
 * from the seed, and `test/unit/test_tld_ontology_gate.test.ts` asserts the
 * two agree — so a seed edit that touches the generic structure is a visible
 * JSON diff, never a silent change inside a gzip.
 *
 * DIRECTION: seed → JSON. The seed is the source of record for what an
 * install ships; the JSON is its readable twin (and the situation loader can
 * materialize it into any database). There is deliberately NO JSON → seed
 * path here — regenerating the dump is an installer concern.
 *
 * READS THE DUMP DIRECTLY (gunzip + the `COPY public.dd_ontology … FROM stdin`
 * block), so it runs on a plain clone with no database. `id` is dropped (the
 * sequence assigns it); jsonb columns are parsed; `\N` → null; booleans → bool;
 * `order_number` → number. Rows sorted by tipo (natural: tld + numeric part).
 *
 * HERMETIC: repo files only.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const REPO = join(import.meta.dir, '..');
export const SEED_PATH = 'install/db/dedalo_install.pgsql.gz';
export const JSON_PATH = 'src/core/test_data/test_tld_ontology.json';
export const TLD = 'test';

const JSONB_COLUMNS = new Set(['term', 'relations', 'properties']);
const BOOL_COLUMNS = new Set(['is_model', 'is_translatable', 'is_main']);
const NUM_COLUMNS = new Set(['order_number']);

/** Undo psql COPY text escaping for one field. */
function unescapeCopy(field: string): string | null {
	if (field === '\\N') return null;
	return field
		.replace(/\\t/g, '\t')
		.replace(/\\n/g, '\n')
		.replace(/\\r/g, '\r')
		.replace(/\\\\/g, '\\');
}

export interface TestTldNode {
	tipo: string;
	parent: string | null;
	term: Record<string, string> | null;
	model: string | null;
	order_number: number | null;
	relations: { tipo: string }[] | null;
	tld: string;
	properties: Record<string, unknown> | null;
	model_tipo: string | null;
	is_model: boolean;
	is_translatable: boolean;
	is_main: boolean;
	propiedades: string | null;
}

/** Parse the seed's dd_ontology COPY block; return the `test` TLD rows as nodes. */
export function readTestTldFromSeed(): TestTldNode[] {
	const path = join(REPO, SEED_PATH);
	if (!existsSync(path)) throw new Error(`seed not found: ${SEED_PATH}`);
	const raw = gunzipSync(readFileSync(path)).toString('utf8');
	const m = /COPY public\.dd_ontology \(([^)]*)\) FROM stdin;\n([\s\S]*?)\n\\\.\n/.exec(raw);
	if (m === null) throw new Error('seed: dd_ontology COPY block not found');
	const columns = (m[1] as string).split(',').map((c) => c.trim());
	const nodes: TestTldNode[] = [];
	for (const line of (m[2] as string).split('\n')) {
		const fields = line.split('\t');
		const row: Record<string, unknown> = {};
		columns.forEach((col, i) => {
			const v = unescapeCopy(fields[i] ?? '\\N');
			if (col === 'id') return;
			if (v === null) row[col] = null;
			else if (JSONB_COLUMNS.has(col)) row[col] = JSON.parse(v);
			else if (BOOL_COLUMNS.has(col)) row[col] = v === 't';
			else if (NUM_COLUMNS.has(col)) row[col] = Number(v);
			else row[col] = v;
		});
		if (row.tld !== TLD) continue;
		for (const b of BOOL_COLUMNS) if (row[b] === null) row[b] = false;
		nodes.push(row as unknown as TestTldNode);
	}
	nodes.sort((a, b) => {
		const na = Number(a.tipo.replace(/^[a-z]+/, ''));
		const nb = Number(b.tipo.replace(/^[a-z]+/, ''));
		return na - nb;
	});
	return nodes;
}

export function loadTestTldJson(): { tld: string; nodes: TestTldNode[] } {
	return JSON.parse(readFileSync(join(REPO, JSON_PATH), 'utf8')) as {
		tld: string;
		nodes: TestTldNode[];
	};
}

if (import.meta.main) {
	const nodes = readTestTldFromSeed();
	const doc = {
		_doc: `Generic \`${TLD}\` TLD ontology — derived FROM ${SEED_PATH} by scripts/export_test_tld_ontology.ts (seed → JSON, never the reverse). Reviewable twin of what every install ships in its Test area; test/unit/test_tld_ontology_gate.test.ts asserts seed ≡ this file. Same node shape a situation takes (src/core/test_data/situations). DO NOT hand-edit: change the seed, re-export.`,
		tld: TLD,
		node_count: nodes.length,
		nodes,
	};
	if (process.argv.includes('--check')) {
		const current = loadTestTldJson();
		const same = Bun.deepEquals(current.nodes, nodes, true);
		console.log(
			same ? 'test_tld_ontology: JSON ≡ seed' : 'test_tld_ontology: JSON ≠ seed — re-export',
		);
		process.exit(same ? 0 : 1);
	}
	writeFileSync(join(REPO, JSON_PATH), `${JSON.stringify(doc, null, '\t')}\n`);
	Bun.spawnSync(['bunx', 'biome', 'format', '--write', JSON_PATH], { cwd: REPO });
	console.log(`test_tld_ontology: wrote ${JSON_PATH} — ${nodes.length} nodes`);
}
