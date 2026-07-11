/**
 * Regression: MariaDB allows at most 64 keys per table. A wide diffusion element
 * (e.g. image/resource section rsc170, 60+ indexable fields) must NOT emit a
 * CREATE TABLE / ALTER chain that overflows the ceiling — otherwise publishing
 * fails with "Too many keys specified; max 64 keys allowed". The oracle
 * (diffusion_mysql::generate_keys) capped secondary indexes at 50; we match it
 * and apply the SAME cap to the additive-ALTER path (which the oracle did not).
 */

import { describe, expect, test } from 'bun:test';
import type { FieldPlan, SectionPlan } from '../../src/diffusion/plan/types.ts';
import {
	generateAddColumns,
	generateCreateTable,
} from '../../src/diffusion/targets/mariadb/sql_generator.ts';

function field(i: number, fieldModel = 'field_varchar'): FieldPlan {
	return {
		id: `oh${i}`,
		columnName: `col_${i}`,
		sourceChain: [],
		transform: [],
		column: { fieldModel, varcharLength: 100 },
		policy: {} as FieldPlan['policy'],
		outputFormat: 'string',
	};
}

function wideSection(fieldCount: number): SectionPlan {
	return {
		sectionTipo: 'rsc170',
		tableName: 'test_rsc170',
		tableTipo: 'ohT',
		fields: Array.from({ length: fieldCount }, (_, i) => field(i + 1)),
	};
}

function countKeys(create: string): { secondary: number; primary: number } {
	const secondary = (create.match(/\b(?:FULLTEXT )?KEY `col_/g) ?? []).length;
	const primary = (create.match(/PRIMARY KEY/g) ?? []).length;
	return { secondary, primary };
}

describe('MariaDB 64-key cap', () => {
	test('CREATE TABLE never exceeds MariaDB 64-key ceiling for wide sections', () => {
		const create = generateCreateTable(wideSection(70));
		const { secondary, primary } = countKeys(create);
		expect(secondary).toBe(50); // oracle cap
		expect(secondary + primary).toBeLessThanOrEqual(64);
	});

	test('a narrow section still indexes every field (no cap side-effect)', () => {
		const create = generateCreateTable(wideSection(10));
		expect(countKeys(create).secondary).toBe(10);
	});

	test('exact boundary: 50 fields → ALL 50 indexed (the cap is not off-by-one low)', () => {
		const create = generateCreateTable(wideSection(50));
		const { secondary, primary } = countKeys(create);
		expect(secondary).toBe(50);
		expect(secondary + primary).toBeLessThanOrEqual(64);
		// every column carries its key — nothing dropped below the cap
		for (let i = 1; i <= 50; i++) {
			expect(create).toContain(`KEY \`col_${i}\``);
		}
	});

	test('exact boundary: 51 fields → exactly 50 indexed (the 51st is the first dropped)', () => {
		const create = generateCreateTable(wideSection(51));
		expect(countKeys(create).secondary).toBe(50);
		// deterministic plan order: the FIRST 50 keep their key, col_51 loses it
		expect(create).toContain('KEY `col_50`');
		expect(create).not.toContain('KEY `col_51`');
		// the column itself still exists — only its index is capped
		expect(create).toContain('`col_51`');
	});

	test('mixed field_text/field_varchar: BOTH key kinds count against the one cap', () => {
		// Alternate FULLTEXT-indexed (field_text) and BTREE-indexed (field_varchar)
		// fields: if either kind escaped the shared budget, the total would
		// exceed 50.
		const section = wideSection(60);
		section.fields = section.fields.map((f, i) =>
			i % 2 === 0 ? field(i + 1, 'field_text') : field(i + 1, 'field_varchar'),
		);
		const create = generateCreateTable(section);
		const fulltext = (create.match(/FULLTEXT KEY `col_/g) ?? []).length;
		const btree = (create.match(/(?<!FULLTEXT )KEY `col_/g) ?? []).length;
		expect(fulltext).toBe(25); // first 50 fields = 25 text + 25 varchar
		expect(btree).toBe(25);
		expect(fulltext + btree).toBe(50);
		// ALTER path agrees on the same mixed budget
		const alters = generateAddColumns(
			section,
			section.fields.map((f) => f.columnName),
		);
		const withIndex = alters.filter((s) => /ADD (?:FULLTEXT )?KEY/.test(s)).length;
		expect(withIndex).toBe(50);
	});

	test('additive ALTER path applies the same 50-key cap', () => {
		const section = wideSection(70);
		const alters = generateAddColumns(
			section,
			section.fields.map((f) => f.columnName),
		);
		const withIndex = alters.filter((s) => /ADD (?:FULLTEXT )?KEY/.test(s)).length;
		expect(alters).toHaveLength(70); // every missing column added
		expect(withIndex).toBe(50); // but only 50 carry an index
	});
});
