/**
 * A diffusion `table` node may CONTAIN another `table` node — in the mdcat
 * domain, 'documentales' → 'documentales_portal' and 8 more such pairs.
 *
 * VirtualTreeNode.childrenTipos is RECURSIVE: PHP builds it "to populate the
 * fields list for the UI" (diffusion_utils::walk_virtual_diffusion_tree :320).
 * Using it as the table's COLUMN source drags the nested table's fields into
 * the parent table and, when both declare the same field label, emits the
 * column twice — MariaDB then rejects the CREATE TABLE with
 * "Duplicate column name 'publicacion'", killing the whole publication run
 * before any DML (writers/mariadb_sql.ts ensureSchema).
 *
 * The oracle's column list is DIRECT children only:
 * dd_diffusion_api::process_datum :996 calls ontology_node::get_ar_children,
 * documented "direct (first-level only) child tipos" at
 * core/ontology_engine/class.ontology_node.php:1225 — so the nested table's
 * fields are grandchildren and simply never appear. VirtualTreeNode carries
 * that list as directChildrenTipos, and compileSectionPlan reads it.
 *
 * HERMETIC by construction: a synthetic tree + index reproducing the exact
 * topology, so the gate holds on every install (no dev domain nests tables).
 */

import { describe, expect, test } from 'bun:test';
import type { ParserClassifier } from '../../src/diffusion/plan/compile.ts';
import { compileElementPlan } from '../../src/diffusion/plan/compile.ts';
import type {
	VirtualDiffusionTree,
	VirtualTreeNode,
} from '../../src/diffusion/plan/virtual_tree.ts';

/** No field below declares a parser fn — the classifier is never consulted. */
const testClassifier: ParserClassifier = () => 'runtime';

const MODELS: Record<string, string> = {
	dom: 'diffusion_domain',
	el: 'diffusion_element',
	db: 'database',
	outer: 'table',
	inner: 'table',
	outer_pub: 'field_enum',
	outer_own: 'field_varchar',
	inner_pub: 'field_enum',
};
/** Column name = the field node's structure-lang term. */
const LABELS: Record<string, string> = {
	db: 'web_synthetic',
	outer: 'documentales',
	inner: 'documentales_portal',
	outer_pub: 'publicacion',
	outer_own: 'titulo',
	// the collision: the NESTED table declares the same field label
	inner_pub: 'publicacion',
};
const DIRECT_CHILDREN: Record<string, string[]> = {
	outer: ['outer_pub', 'outer_own', 'inner'],
	inner: ['inner_pub'],
};

const index = {
	nodeOf: async (tipo: string) => {
		const model = MODELS[tipo];
		if (model === undefined) return null;
		const label = LABELS[tipo];
		return {
			tipo,
			parent: null,
			model,
			term: label === undefined ? null : { 'lg-eng': label },
			properties: null,
			relations: null,
		};
	},
	childTipos: async (tipo: string) => DIRECT_CHILDREN[tipo] ?? [],
	relatedByModel: async () => [],
	// no relations → empty ddo_map → empty source chain → no DB access
	relationTipos: async () => [],
	resolveAlias: async () => null,
};

const pathOf = (...tipos: string[]) =>
	tipos.map((tipo) => ({
		tipo,
		model: MODELS[tipo] as string,
		label: LABELS[tipo] ?? tipo,
		realTipo: null,
	}));

const nodeOf = (tipo: string, parents: string[], extra: Partial<VirtualTreeNode> = {}) =>
	({
		tipo,
		model: MODELS[tipo] as string,
		label: LABELS[tipo] ?? tipo,
		properties: tipo === 'el' ? { diffusion: { type: 'sql' } } : null,
		realTipo: null,
		isAlias: false,
		parents: pathOf(...parents),
		// deliberately RECURSIVE for the outer table, as the real walk builds it
		childrenTipos:
			tipo === 'outer'
				? ['outer_pub', 'outer_own', 'inner', 'inner_pub']
				: (DIRECT_CHILDREN[tipo] ?? []),
		directChildrenTipos: DIRECT_CHILDREN[tipo] ?? [],
		relatedSections: [],
		...extra,
	}) as VirtualTreeNode;

const syntheticTree = {
	domainName: 'synthetic',
	domainTipo: 'dom',
	index,
	nodes: [
		nodeOf('dom', []),
		nodeOf('el', ['dom']),
		nodeOf('db', ['el', 'dom']),
		// the OUTER table is the published artifact of section 'sec1'
		nodeOf('outer', ['db', 'el', 'dom'], { relatedSections: ['sec1'] }),
		// the NESTED table: a child of outer, carrying its own 'publicacion'
		nodeOf('inner', ['outer', 'db', 'el', 'dom']),
	],
} as unknown as VirtualDiffusionTree;

describe('nested table nodes never leak columns into the parent table', () => {
	test('the parent table publishes its DIRECT fields only — no duplicate column', async () => {
		const plan = await compileElementPlan('el', {
			tree: syntheticTree,
			classifyParserFn: testClassifier,
		});

		const section = plan.sections.find((candidate) => candidate.sectionTipo === 'sec1');
		if (section === undefined) throw new Error('section sec1 did not compile');
		const columns = section.fields.map((field) => field.columnName);

		expect(section.tableName).toBe('documentales');
		// the nested table's field is NOT a column of the parent table
		expect(columns).not.toContain('inner_pub');
		expect(columns.filter((name) => name === 'publicacion')).toHaveLength(1);
		// ...and no column name repeats at all — the CREATE TABLE is emittable
		expect(new Set(columns).size).toBe(columns.length);
		// the parent's own fields survive (the fix must not narrow the schema)
		expect(columns).toContain('publicacion');
		expect(columns).toContain('titulo');
	});
});
