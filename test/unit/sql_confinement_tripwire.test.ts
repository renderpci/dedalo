/**
 * SQL-CONFINEMENT TRIPWIRE — mechanical enforcement of the TIERED SQL rule
 * (DEC-09 / audit S2-18, S2-19; README.md "Hard rules").
 *
 * The old absolute ("all SQL lives behind src/core/db/") was dead as written:
 * the audit census found 76 files legitimately authoring SQL. Its enforceable
 * successor is tiered, and THIS file is the tripwire the old rule never had:
 *
 *   T1  Connection ownership: `new SQL(` exists ONLY in core/db/postgres.ts
 *       plus the two sanctioned separate pools (RAG pgvector DB, MariaDB
 *       diffusion target). Everything else uses the exported `sql` proxy /
 *       tx helpers — which is what makes parameterization and pool lifecycle
 *       structurally uniform.
 *   T2  matrix_* DML only via db/matrix_write + json_codec — owned by the
 *       write-path workstream (json_codec gate); not asserted here.
 *   T3  dd_ontology reads through core/ontology accessors (resolver.ts et
 *       al.), enforced as a RATCHET: the set of files still querying
 *       dd_ontology directly may only SHRINK. New code must use the
 *       resolver shapes (getNode / getOrderedSubtree / getChildrenNodes /
 *       getPropertiesByTipo / findFirstDescendantTipoByModel).
 *   T4  Named subsystem-owned tables keep local SQL — one owning module per
 *       table family, listed below; referencing those tables anywhere else
 *       fails.
 *
 * HONESTY CONTRACT: every list below is exact-file. Adding a violation makes
 * this suite FAIL (verified by temporary-violation probe at introduction);
 * removing one leaves a stale allowlist entry, which is safe (ratchet down
 * opportunistically). If a file on a list is MOVED (e.g. the WS-C resolve/
 * re-homing), update the entry in the same change.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Glob } from 'bun';
import { deleteTldNodes, upsertDdOntologyNode } from '../../src/core/db/dd_ontology.ts';
import type { DdOntologyNode } from '../../src/core/db/dd_ontology.ts';
import {
	clearOntologyCaches,
	compareSiblingOrder,
	findFirstDescendantTipoByModel,
	getChildrenNodes,
	getOrderedSubtree,
	getPropertiesByTipo,
} from '../../src/core/ontology/resolver.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/** All non-test TS source files under src/ and tools/, repo-relative paths. */
function sourceFiles(): string[] {
	const files: string[] = [];
	for (const dir of ['src', 'tools']) {
		const glob = new Glob('**/*.ts');
		for (const match of glob.scanSync({ cwd: join(REPO_ROOT, dir) })) {
			if (match.endsWith('.test.ts')) continue;
			files.push(relative(REPO_ROOT, join(REPO_ROOT, dir, match)));
		}
	}
	return files.sort();
}

function read(file: string): string {
	return readFileSync(join(REPO_ROOT, file), 'utf-8');
}

// ---------------------------------------------------------------------------
// T1 — connection ownership: `new SQL(` allowlist.
// ---------------------------------------------------------------------------

/**
 * The ONLY files allowed to construct a Bun SQL pool. Two sanctioned separate
 * pools exist by design: the RAG vector store (a SEPARATE pgvector database)
 * and the MariaDB diffusion target (a different DBMS entirely).
 */
const NEW_SQL_ALLOWLIST = new Set<string>([
	'src/core/db/postgres.ts', // THE system-of-record pool
	'src/ai/rag/vector_store.ts', // sanctioned: separate pgvector DB
	'src/diffusion/targets/mariadb/db.ts', // sanctioned: MariaDB publication target
]);

describe('T1 — Postgres connection ownership', () => {
	test('`new SQL(` appears only in the sanctioned pool owners', () => {
		const violations: string[] = [];
		for (const file of sourceFiles()) {
			if (!read(file).includes('new SQL(')) continue;
			if (NEW_SQL_ALLOWLIST.has(file)) continue;
			// The rest of targets/mariadb/ may grow helpers around its pool file.
			if (file.startsWith('src/diffusion/targets/mariadb/')) continue;
			violations.push(file);
		}
		expect(
			violations,
			`Unsanctioned SQL pool construction. Use the exported proxy/tx helpers from src/core/db/postgres.ts (or, for a genuinely separate datastore, add the file here WITH justification): ${violations.join(', ')}`,
		).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// T3 — dd_ontology direct-read RATCHET.
// ---------------------------------------------------------------------------

/**
 * Files still running their own `FROM dd_ontology` queries (audit S2-19: 37
 * at census time; 4 hand-rolled walks already migrated onto the resolver
 * accessors). The canonical homes — src/core/db/ and src/core/ontology/ —
 * are exempt: that pair IS the repository layer the reads consolidate into.
 *
 * RULE: a file NOT on this list must not query dd_ontology directly — use
 * the src/core/ontology accessors. When you migrate a listed file, delete
 * its entry (the ratchet only goes down).
 */
const DD_ONTOLOGY_DIRECT_READ_RATCHET = new Set<string>([
	'src/core/area/dashboard.ts',
	'src/core/relations/children.ts',
	'src/core/relations/request_config/build.ts',
	'src/core/relations/request_config/implicit.ts',
	'src/core/relations/request_config/explicit.ts',
	// dd_info.ts, info_widgets.ts, tm_record.ts: migrated off direct dd_ontology
	// queries — entries retired 2026-07-07 (staleness self-test below now
	// enforces this pruning mechanically).
	'src/core/diffusion_bridge/diffusion_delete.ts',
	'src/core/diffusion_bridge/diffusion_map.ts',
	'src/core/resolve/environment.ts',
	'src/core/api/handlers/login_context.ts',
	'src/core/api/handlers/menu.ts',
	// ontology_delete.ts re-homed into src/core/ontology/ (WS-C S2-22) — that
	// directory IS the exempt canonical home, so its ratchet entry is retired.
	'src/core/resolve/relation_index.ts',
	'src/core/resolve/relation_list.ts',
	'src/core/resolve/section_elements_context.ts',
	'src/core/resolve/security_access_datalist.ts',
	// S2-23 split: widget_request.ts's dd_ontology readers moved verbatim into
	// their per-widget modules (the anti-lockout / root-area tipo lookups)
	'src/core/area_maintenance/widgets/config_areas.ts',
	'src/core/area_maintenance/widgets/menu_skip_tipos.ts',
	'src/core/search/search_related.ts',
	'src/core/section/buttons.ts',
	'src/core/section/list_definitions/node_find.ts',
	'src/core/section/list_definitions/section_list.ts',
	'src/core/section/record/create_record.ts',
	'src/core/ts_object/ts_object.ts',
	'src/diffusion/plan/virtual_tree.ts',
	'src/diffusion/resolve/resolver.ts',
]);

/**
 * Files still hand-rolling a `WITH RECURSIVE` ontology walk instead of using
 * getOrderedSubtree / findFirstDescendantTipoByModel (which own the ONE
 * sibling order/tiebreak policy). ALL nine census walks are migrated
 * (2026-07-07, debris workstream): relations/children.ts, area/tree.ts,
 * ontology/section_id_component.ts, ts_object/ts_object.ts, delete_record.ts,
 * diffusion_map.ts, diffusion resolver, virtual_tree, the two tool
 * list-shape walks. Only the canonical home remains.
 */
const RECURSIVE_WALK_RATCHET = new Set<string>([
	'src/core/ontology/resolver.ts', // the canonical home
]);

describe('T3 — dd_ontology read consolidation ratchet (S2-19)', () => {
	test('no NEW file queries dd_ontology directly', () => {
		const pattern = /FROM\s+dd_ontology\b/i;
		const violations: string[] = [];
		for (const file of sourceFiles()) {
			if (file.startsWith('src/core/db/') || file.startsWith('src/core/ontology/')) continue;
			if (!pattern.test(read(file))) continue;
			if (DD_ONTOLOGY_DIRECT_READ_RATCHET.has(file)) continue;
			violations.push(file);
		}
		expect(
			violations,
			`New direct dd_ontology query. Use the cached accessors in src/core/ontology/ (resolver.ts, labels.ts, section_map.ts) — do NOT extend this ratchet list upward: ${violations.join(', ')}`,
		).toEqual([]);
	});

	test('no NEW hand-rolled WITH RECURSIVE ontology walk', () => {
		const violations: string[] = [];
		for (const file of sourceFiles()) {
			const content = read(file);
			if (!content.includes('WITH RECURSIVE') || !/dd_ontology/.test(content)) continue;
			if (RECURSIVE_WALK_RATCHET.has(file)) continue;
			violations.push(file);
		}
		expect(
			violations,
			`New recursive ontology walk. Use getOrderedSubtree / findFirstDescendantTipoByModel from src/core/ontology/resolver.ts (one order/tiebreak policy): ${violations.join(', ')}`,
		).toEqual([]);
	});

	test('ratchets stay honest — no stale entries for files that no longer match (staleness self-test)', () => {
		// Same posture as module_state_tripwire's allowlist self-tests: a stale
		// entry makes the gate look stricter than it is (the file could regress
		// back to direct queries without a diff review noticing). A deleted/moved
		// file is stale too.
		const directReadPattern = /FROM\s+dd_ontology\b/i;
		const staleDirectRead = [...DD_ONTOLOGY_DIRECT_READ_RATCHET].filter((file) => {
			try {
				return !directReadPattern.test(read(file));
			} catch {
				return true; // file deleted or moved
			}
		});
		expect(
			staleDirectRead,
			`Stale DD_ONTOLOGY_DIRECT_READ_RATCHET entries — these files no longer query dd_ontology directly; delete their entries (the ratchet must match reality): ${staleDirectRead.join(', ')}`,
		).toEqual([]);

		const staleWalk = [...RECURSIVE_WALK_RATCHET].filter((file) => {
			try {
				const content = read(file);
				return !content.includes('WITH RECURSIVE') || !/dd_ontology/.test(content);
			} catch {
				return true;
			}
		});
		expect(staleWalk, `Stale RECURSIVE_WALK_RATCHET entries: ${staleWalk.join(', ')}`).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// T4 — subsystem-owned tables: one owning module per table family.
// ---------------------------------------------------------------------------

/**
 * The ACCEPT tier of DEC-09: these table families keep local SQL, owned by
 * exactly one module (plus src/core/db/, the T1 home, which may list table
 * names in its allowlist catalogs). Touching a family's tables from anywhere
 * else must go through the owner's exported API instead.
 */
const SUBSYSTEM_OWNED_TABLES: readonly {
	family: string;
	tablePattern: RegExp;
	owners: readonly string[];
}[] = [
	{
		family: 'component locks',
		tablePattern: /dedalo_ts_component_locks/,
		owners: ['src/core/section/locks.ts'],
	},
	{
		family: 'diffusion jobs',
		tablePattern: /dedalo_ts_diffusion_job/,
		owners: ['src/diffusion/jobs/'],
	},
	{
		family: 'RAG (separate pgvector DB)',
		tablePattern: /rag_embeddings|rag_index_queue/,
		owners: ['src/ai/rag/'],
	},
	{
		family: 'user activity stats',
		tablePattern: /matrix_stats/,
		owners: ['src/core/area_maintenance/user_stats.ts'],
	},
	{
		family: 'error-report intake (WC-017)',
		tablePattern: /dedalo_ts_error_reports/,
		owners: ['src/core/error_report/store.ts'],
	},
];

// ---------------------------------------------------------------------------
// T3 — behavioral gate for the canonical accessors themselves.
//
// The accessors exist so the 9 hand-rolled walks stop re-deciding semantics;
// this pins THE semantics: the sibling order/tiebreak policy, the DFS
// pre-order, the section-containment guard, and the virtual-section
// fallback. Scratch TLD 'zzw' rows only; purged in afterAll.
// ---------------------------------------------------------------------------

const SCRATCH_TLD = 'zzw';

function scratchNode(overrides: Partial<DdOntologyNode> & { tipo: string }): DdOntologyNode {
	return {
		tipo: overrides.tipo,
		parent: overrides.parent ?? null,
		term: overrides.term ?? null,
		model: overrides.model ?? null,
		order_number: overrides.order_number ?? null,
		relations: overrides.relations ?? null,
		tld: SCRATCH_TLD,
		properties: overrides.properties ?? null,
		model_tipo: overrides.model_tipo ?? null,
		is_model: overrides.is_model ?? false,
		is_translatable: overrides.is_translatable ?? false,
		is_main: overrides.is_main ?? false,
		propiedades: overrides.propiedades ?? null,
	};
}

afterAll(async () => {
	await deleteTldNodes(SCRATCH_TLD);
	clearOntologyCaches();
});

/**
 * Scratch subtree (order_number in parentheses; canonical sibling order is
 * order ASC nulls-last, tipo tiebreak):
 *
 *   zzw0 (section)
 *   ├─ zzw20 (2, section_group)   ── zzw21 (component_input_text, properties)
 *   ├─ zzw30 (2, section_group)              ← ties with zzw20 → tipo order
 *   └─ zzw10 (9, section)         ── zzw12 (component_filter)
 *                                     ↑ nested SECTION: returned, not descended
 *   zzwv0 (section, relations→[zzw0])        ← virtual section, no own subtree
 */
async function seedScratchSubtree(): Promise<void> {
	await upsertDdOntologyNode(scratchNode({ tipo: 'zzw0', model: 'section' }));
	await upsertDdOntologyNode(
		scratchNode({ tipo: 'zzw20', parent: 'zzw0', model: 'section_group', order_number: 2 }),
	);
	await upsertDdOntologyNode(
		scratchNode({ tipo: 'zzw30', parent: 'zzw0', model: 'section_group', order_number: 2 }),
	);
	await upsertDdOntologyNode(
		scratchNode({ tipo: 'zzw10', parent: 'zzw0', model: 'section', order_number: 9 }),
	);
	await upsertDdOntologyNode(
		scratchNode({
			tipo: 'zzw21',
			parent: 'zzw20',
			model: 'component_input_text',
			properties: { probe: 'value' },
		}),
	);
	await upsertDdOntologyNode(
		scratchNode({ tipo: 'zzw12', parent: 'zzw10', model: 'component_filter' }),
	);
	await upsertDdOntologyNode(
		scratchNode({ tipo: 'zzwv0', model: 'section', relations: [{ tipo: 'zzw0' }] }),
	);
	clearOntologyCaches();
}

describe('T3 — canonical accessor semantics (one policy for all walks)', () => {
	test('compareSiblingOrder: order ASC, NULLs (Infinity) last, tipo tiebreak', () => {
		const items = [
			{ tipo: 'b', orderNumber: Number.POSITIVE_INFINITY },
			{ tipo: 'c', orderNumber: 1 },
			{ tipo: 'a', orderNumber: 2 },
			{ tipo: 'b2', orderNumber: 2 },
			{ tipo: 'a9', orderNumber: Number.POSITIVE_INFINITY },
		];
		expect([...items].sort(compareSiblingOrder).map((item) => item.tipo)).toEqual([
			'c',
			'a',
			'b2',
			'a9',
			'b',
		]);
	});

	test('getOrderedSubtree: DFS pre-order, canonical sibling order, section-bounded', async () => {
		await seedScratchSubtree();
		const walk = await getOrderedSubtree('zzw0');
		// zzw20/zzw30 tie on order 2 → tipo order; zzw10 (9) last; the nested
		// section zzw10 is RETURNED but not descended (zzw12 absent).
		expect(walk.map((node) => node.tipo)).toEqual(['zzw20', 'zzw21', 'zzw30', 'zzw10']);
		const crossing = await getOrderedSubtree('zzw0', { crossSections: true });
		expect(crossing.map((node) => node.tipo)).toEqual([
			'zzw20',
			'zzw21',
			'zzw30',
			'zzw10',
			'zzw12',
		]);
		const withRoot = await getOrderedSubtree('zzw0', { includeRoot: true });
		expect(withRoot[0]?.tipo).toBe('zzw0');
	});

	test('getChildrenNodes: direct children in canonical order', async () => {
		await seedScratchSubtree();
		const children = await getChildrenNodes('zzw0');
		expect(children.map((node) => node.tipo)).toEqual(['zzw20', 'zzw30', 'zzw10']);
	});

	test('getPropertiesByTipo: cached node properties; null for unknown', async () => {
		await seedScratchSubtree();
		expect(await getPropertiesByTipo('zzw21')).toEqual({ probe: 'value' });
		expect(await getPropertiesByTipo('zzw-none')).toBeNull();
	});

	test('findFirstDescendantTipoByModel: bounded walk + virtual-section fallback', async () => {
		await seedScratchSubtree();
		expect(await findFirstDescendantTipoByModel('zzw0', 'component_input_text')).toBe('zzw21');
		// The nested section's own component is NOT reachable from the parent walk…
		expect(await findFirstDescendantTipoByModel('zzw0', 'component_filter')).toBeNull();
		// …but IS from the nested section itself.
		expect(await findFirstDescendantTipoByModel('zzw10', 'component_filter')).toBe('zzw12');
		// Virtual section resolves through relations[0].tipo by default…
		expect(await findFirstDescendantTipoByModel('zzwv0', 'component_input_text')).toBe('zzw21');
		// …and stays strict own-subtree when the caller opts out.
		expect(
			await findFirstDescendantTipoByModel('zzwv0', 'component_input_text', {
				virtualFallback: false,
			}),
		).toBeNull();
	});
});

describe('T4 — subsystem-owned table families', () => {
	for (const { family, tablePattern, owners } of SUBSYSTEM_OWNED_TABLES) {
		test(`${family}: tables referenced only by the owning module`, () => {
			const violations: string[] = [];
			for (const file of sourceFiles()) {
				if (file.startsWith('src/core/db/')) continue; // T1 home (name catalogs)
				if (owners.some((owner) => file === owner || file.startsWith(owner))) continue;
				if (tablePattern.test(read(file))) violations.push(file);
			}
			expect(
				violations,
				`'${family}' tables referenced outside owner ${owners.join(', ')} — call the owner's exported API: ${violations.join(', ')}`,
			).toEqual([]);
		});
	}
});
