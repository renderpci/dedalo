/**
 * A MariaDB row may declare at most 65535 bytes of in-row width (errno 1118 at
 * CREATE TABLE). A VARCHAR(n) in utf8mb4 reserves 4n bytes whatever it holds,
 * so an ontology table of 17 `varchar: 1024` fields (tch177 'documentation',
 * ~71.9 KB) could never be created: the run died in ensureSchema as an untyped
 * `diffusion.run_failed`, and took every OTHER table of the element with it.
 *
 * The plan compile now refuses such a table by name, before any DDL
 * (`tableRowSizeViolation`, sql_generator.ts) — the fix is an ontology edit.
 *
 * WHAT IS HELD:
 *   PURE — compileElementPlan on a synthetic tree: an over-wide sql table is a
 *          `diffusion.plan_compile_failed` naming the table and its widest
 *          columns; the same columns as field_text compile.
 *   LIVE — the byte formula IS the server's: on the suite MariaDB (PUB-05), a
 *          table the formula sizes at exactly 65535 bytes is CREATED and one at
 *          65536 is REFUSED with errno 1118. Every SQL type sqlTypeFor emits is
 *          present in both, so a mis-sized type moves the boundary and reds a leg.
 *          DDL only (scratch tables, dropped after) — no row is written.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { ParserClassifier } from '../../src/diffusion/plan/compile.ts';
import { compileElementPlan, PlanCompileError } from '../../src/diffusion/plan/compile.ts';
import type { FieldPlan, SectionPlan } from '../../src/diffusion/plan/types.ts';
import type {
	VirtualDiffusionTree,
	VirtualTreeNode,
} from '../../src/diffusion/plan/virtual_tree.ts';
import { closeAllTargetPools, getTargetPool } from '../../src/diffusion/targets/mariadb/db.ts';
import {
	generateCreateTable,
	MARIADB_MAX_ROW_BYTES,
	tableRowBytes,
} from '../../src/diffusion/targets/mariadb/sql_generator.ts';
import { dropSuiteScratchTables, requireSuiteMariadb } from '../helpers/suite_mariadb.ts';
import { zzdTargetDatabases } from '../helpers/zzd_diffusion_fixture.ts';

// ---------------------------------------------------------------------------
// PURE: the compile refuses an over-wide sql table, by name.
// ---------------------------------------------------------------------------

const testClassifier: ParserClassifier = () => 'runtime';
const WIDE_COUNT = 17; // the reported table's count of varchar:1024 fields

function syntheticTree(fieldModel: 'field_varchar' | 'field_text'): VirtualDiffusionTree {
	const fieldTipos = Array.from({ length: WIDE_COUNT }, (_, i) => `wide_${i + 1}`);
	const models: Record<string, string> = {
		dom: 'diffusion_domain',
		el: 'diffusion_element',
		db: 'database',
		tbl: 'table',
		...Object.fromEntries(fieldTipos.map((tipo) => [tipo, fieldModel])),
	};
	const labels: Record<string, string> = {
		db: 'web_synthetic',
		tbl: 'documentation',
		...Object.fromEntries(fieldTipos.map((tipo) => [tipo, tipo])),
	};
	const children: Record<string, string[]> = { tbl: fieldTipos };
	const index = {
		nodeOf: async (tipo: string) =>
			models[tipo] === undefined
				? null
				: {
						tipo,
						parent: null,
						model: models[tipo],
						term: labels[tipo] === undefined ? null : { 'lg-eng': labels[tipo] },
						properties: tipo.startsWith('wide_') ? { varchar: 1024 } : null,
						relations: null,
					},
		childTipos: async (tipo: string) => children[tipo] ?? [],
		relatedByModel: async () => [],
		relationTipos: async () => [],
		resolveAlias: async () => null,
	};
	const pathOf = (...tipos: string[]) =>
		tipos.map((tipo) => ({
			tipo,
			model: models[tipo],
			label: labels[tipo] ?? tipo,
			realTipo: null,
		}));
	const nodeOf = (tipo: string, parents: string[], extra: Partial<VirtualTreeNode> = {}) =>
		({
			tipo,
			model: models[tipo],
			label: labels[tipo] ?? tipo,
			properties: tipo === 'el' ? { diffusion: { type: 'sql' } } : null,
			realTipo: null,
			isAlias: false,
			parents: pathOf(...parents),
			childrenTipos: children[tipo] ?? [],
			directChildrenTipos: children[tipo] ?? [],
			relatedSections: [],
			...extra,
		}) as VirtualTreeNode;
	return {
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
}

describe('plan compile refuses a MariaDB table wider than the row ceiling', () => {
	test('17 × VARCHAR(1024) → plan_compile_failed naming the table and its columns', async () => {
		let caught: unknown = null;
		try {
			await compileElementPlan('el', {
				tree: syntheticTree('field_varchar'),
				classifyParserFn: testClassifier,
			});
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(PlanCompileError);
		const errors = (caught as PlanCompileError).compileErrors;
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain("table 'documentation' (tbl)");
		expect(errors[0]).toContain(`exceeds MariaDB's ${MARIADB_MAX_ROW_BYTES}`);
		expect(errors[0]).toContain('wide_1 VARCHAR(1024)');
		expect((caught as PlanCompileError).code).toBe('diffusion.plan_compile_failed');
	});

	test('the same fields as field_text compile (TEXT lives off-row)', async () => {
		const plan = await compileElementPlan('el', {
			tree: syntheticTree('field_text'),
			classifyParserFn: testClassifier,
		});
		expect(plan.sections).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// LIVE: the formula's boundary is the server's boundary.
// ---------------------------------------------------------------------------

const TARGET_DATABASE = zzdTargetDatabases()[0] as string;
const AT_LIMIT_TABLE = 'dedalo_ts_test_rowsize_at';
const OVER_LIMIT_TABLE = 'dedalo_ts_test_rowsize_over';

function column(id: string, fieldModel: string, varcharLength?: number): FieldPlan {
	return {
		id,
		columnName: id,
		sourceChain: [],
		transform: [],
		column: varcharLength === undefined ? { fieldModel } : { fieldModel, varcharLength },
		policy: {},
		outputFormat: 'string',
	};
}

/** One column of every type sqlTypeFor emits — each one's width is on trial. */
const EVERY_TYPE: FieldPlan[] = [
	column('c_text', 'field_text'),
	column('c_mediumtext', 'field_mediumtext'),
	column('c_point', 'field_point'),
	column('c_enum', 'field_enum'),
	column('c_date', 'field_date'),
	column('c_datetime', 'field_datetime'),
	column('c_year', 'field_year'),
	column('c_boolean', 'field_boolean'),
	column('c_decimal', 'field_decimal'),
	column('c_int', 'field_int'),
	column('c_short_varchar', 'field_varchar', 40), // 160 bytes: 1-byte length prefix
];

/**
 * A section whose formula width is EXACTLY `target`: every-type columns, wide
 * VARCHAR filler (off-page capable, so InnoDB's own page check stays out of
 * the way), then a searched last VARCHAR + 1-byte boolean pads.
 */
function sectionAtWidth(tableName: string, target: number): SectionPlan {
	const make = (fields: FieldPlan[]): SectionPlan => ({
		sectionTipo: 'test1',
		tableName,
		tableTipo: 'testdd0',
		fields,
	});
	const base = [...EVERY_TYPE];
	let filler = 0;
	while (
		tableRowBytes(make([...base, column(`f_${filler}`, 'field_varchar', 1000)])).total <
		target - 600
	) {
		base.push(column(`f_${filler}`, 'field_varchar', 1000));
		filler++;
	}
	for (let last = 64; last <= 1300; last++) {
		for (let pads = 0; pads <= 12; pads++) {
			const fields = [
				...base,
				column('f_last', 'field_varchar', last),
				...Array.from({ length: pads }, (_, i) => column(`p_${i}`, 'field_boolean')),
			];
			if (tableRowBytes(make(fields)).total === target) return make(fields);
		}
	}
	throw new Error(`sectionAtWidth: no column mix sums to ${target} bytes`);
}

async function createErrno(section: SectionPlan): Promise<number | null> {
	try {
		await getTargetPool(TARGET_DATABASE).unsafe(generateCreateTable(section), []);
		return null;
	} catch (error) {
		return (error as { errno?: number }).errno ?? -1;
	}
}

describe('the row-width formula matches the live MariaDB boundary', () => {
	beforeAll(async () => {
		await requireSuiteMariadb('test/unit/diffusion_row_size_native.test.ts', [TARGET_DATABASE]);
		await dropSuiteScratchTables(TARGET_DATABASE, [AT_LIMIT_TABLE, OVER_LIMIT_TABLE]);
	});
	afterAll(async () => {
		await dropSuiteScratchTables(TARGET_DATABASE, [AT_LIMIT_TABLE, OVER_LIMIT_TABLE]);
		await closeAllTargetPools();
	});

	test(`a table sized at ${MARIADB_MAX_ROW_BYTES} bytes is created`, async () => {
		const section = sectionAtWidth(AT_LIMIT_TABLE, MARIADB_MAX_ROW_BYTES);
		expect(await createErrno(section)).toBeNull();
	});

	test(`a table sized at ${MARIADB_MAX_ROW_BYTES + 1} bytes is refused (errno 1118)`, async () => {
		const section = sectionAtWidth(OVER_LIMIT_TABLE, MARIADB_MAX_ROW_BYTES + 1);
		expect(await createErrno(section)).toBe(1118);
	});
});
