/**
 * The ontology sizes a diffusion column with TWO separate keys, exactly as the
 * old sql_generator read them (ctx.varchar / ctx.length):
 * - `varchar` → VARCHAR(n) (and the text-index prefix);
 * - `length`  → INT(n).
 *
 * The compile once conflated them (`varchar ?? length` into one value), so a
 * field_int carrying `varchar: 1024` (numisdata935 'ref_date_in') emitted
 * INT(1024) and MariaDB refused the CREATE TABLE — errno 1439 "Display width
 * out of range (max = 255)" — killing the whole publication run before any DML.
 *
 * HERMETIC: a synthetic tree compiled through compileElementPlan, then the
 * real generateCreateTable — the whole compile→DDL seam, no DB.
 */

import { describe, expect, test } from 'bun:test';
import type { ParserClassifier } from '../../src/diffusion/plan/compile.ts';
import { compileElementPlan } from '../../src/diffusion/plan/compile.ts';
import type {
	VirtualDiffusionTree,
	VirtualTreeNode,
} from '../../src/diffusion/plan/virtual_tree.ts';
import { generateCreateTable } from '../../src/diffusion/targets/mariadb/sql_generator.ts';

const testClassifier: ParserClassifier = () => 'runtime';

const MODELS: Record<string, string> = {
	dom: 'diffusion_domain',
	el: 'diffusion_element',
	db: 'database',
	tbl: 'table',
	int_varchar: 'field_int',
	int_length: 'field_int',
	int_bare: 'field_int',
	vc_length: 'field_varchar',
	vc_varchar: 'field_varchar',
};
const LABELS: Record<string, string> = {
	db: 'web_synthetic',
	tbl: 'widths',
	int_varchar: 'ref_date_in',
	int_length: 'int_length',
	int_bare: 'int_bare',
	vc_length: 'vc_length',
	vc_varchar: 'vc_varchar',
};
const PROPERTIES: Record<string, Record<string, unknown>> = {
	int_varchar: { varchar: 1024 }, // the reported node's shape
	int_length: { length: 11 },
	vc_length: { length: 500 },
	vc_varchar: { varchar: 60 },
};
const DIRECT_CHILDREN: Record<string, string[]> = {
	tbl: ['int_varchar', 'int_length', 'int_bare', 'vc_length', 'vc_varchar'],
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
			properties: PROPERTIES[tipo] ?? null,
			relations: null,
		};
	},
	childTipos: async (tipo: string) => DIRECT_CHILDREN[tipo] ?? [],
	relatedByModel: async () => [],
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
		childrenTipos: DIRECT_CHILDREN[tipo] ?? [],
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
		nodeOf('tbl', ['db', 'el', 'dom'], { relatedSections: ['sec1'] }),
	],
} as unknown as VirtualDiffusionTree;

describe('diffusion column width: varchar and length are separate keys', () => {
	test('compile → CREATE TABLE sizes INT by `length` and VARCHAR by `varchar` only', async () => {
		const plan = await compileElementPlan('el', {
			tree: syntheticTree,
			classifyParserFn: testClassifier,
		});
		const section = plan.sections.find((candidate) => candidate.sectionTipo === 'sec1');
		if (section === undefined) throw new Error('section sec1 did not compile');
		const create = generateCreateTable(section);

		// the reported failure: `varchar` on a field_int must NOT size the INT
		expect(create).toContain('`ref_date_in` INT(8) ');
		expect(create).not.toContain('INT(1024)');
		expect(create).toContain('`int_length` INT(11) ');
		expect(create).toContain('`int_bare` INT(8) ');
		// `length` on a field_varchar does not size the VARCHAR
		expect(create).toContain('`vc_length` VARCHAR(255) ');
		expect(create).toContain('`vc_varchar` VARCHAR(60) ');
		// no INT display width MariaDB would refuse (max 255)
		for (const match of create.matchAll(/\bINT\((\d+)\)/g)) {
			expect(Number(match[1])).toBeLessThanOrEqual(255);
		}
	});
});
