import { expect, test, describe } from "bun:test";
import { generate_create_table, generate_add_column_sql } from "../lib/sql_generator";
import type { processed_table } from "../lib/types";

describe('sql_generator column types', () => {

	const mock_table: processed_table = {
		database_name: 'test_db',
		table_name:    'test_table',
		section_tipo:  'test3',
		records: [
			{
				section_id: 1,
				lang: 'lg-eng',
				columns: {
					'birthdate': '2024-01-01',
					'age':       '25',
					'name':      'John',
					'bio':       'Some text',
					'content':   'Medium text content',
					'active':    '1',
					'price':     '12.50',
					'location':  'POINT(1 1)',
					'created_at': '2024-01-01 10:00:00'
				}
			}
		],
		deletions: [],
		columns_context: {
			'birthdate': {
				term: 'Birthdate',
				tipo: 'rsc101',
				model: 'field_date',
				parent: 'section1',
				parser: {}
			},
			'age': {
				term: 'Age',
				tipo: 'rsc102',
				model: 'field_int',
				parent: 'section1',
				parser: {},
				length: 10
			},
			'name': {
				term: 'Name',
				tipo: 'rsc103',
				model: 'field_varchar',
				parent: 'section1',
				parser: {},
				varchar: 100
			},
			'bio': {
				term: 'Bio',
				tipo: 'rsc104',
				model: 'field_text',
				parent: 'section1',
				parser: {}
			},
			'content': {
				term: 'Content',
				tipo: 'rsc105',
				model: 'field_mediumtext',
				parent: 'section1',
				parser: {}
			},
			'active': {
				term: 'Active',
				tipo: 'rsc106',
				model: 'field_boolean',
				parent: 'section1',
				parser: {}
			},
			'price': {
				term: 'Price',
				tipo: 'rsc107',
				model: 'field_decimal',
				parent: 'section1',
				parser: {}
			},
			'location': {
				term: 'Location',
				tipo: 'rsc108',
				model: 'field_point',
				parent: 'section1',
				parser: {}
			},
			'created_at': {
				term: 'Created At',
				tipo: 'rsc109',
				model: 'field_datetime',
				parent: 'section1',
				parser: {}
			}
		}
	};

	test('generates CREATE TABLE with correct types and comments', () => {
		const sql = generate_create_table(mock_table);
		
		expect(sql).toContain('`section_id` INT(12) NOT NULL');
		expect(sql).toContain('`lang` VARCHAR(16) DEFAULT NULL');
		expect(sql).toContain('`birthdate` DATE DEFAULT NULL COMMENT \'Birthdate - rsc101\'');
		expect(sql).toContain('`age` INT(10) DEFAULT NULL COMMENT \'Age - rsc102\'');
		expect(sql).toContain('`name` VARCHAR(100) DEFAULT NULL COMMENT \'Name - rsc103\'');
		expect(sql).toContain('`bio` TEXT DEFAULT NULL COMMENT \'Bio - rsc104\'');
		expect(sql).toContain('`content` MEDIUMTEXT DEFAULT NULL COMMENT \'Content - rsc105\'');
		expect(sql).toContain('`active` TINYINT(1) DEFAULT NULL COMMENT \'Active - rsc106\'');
		expect(sql).toContain('`price` DECIMAL(19,4) DEFAULT NULL COMMENT \'Price - rsc107\'');
		expect(sql).toContain('`location` POINT DEFAULT NULL COMMENT \'Location - rsc108\'');
		expect(sql).toContain('`created_at` DATETIME DEFAULT NULL COMMENT \'Created At - rsc109\'');
	});

	test('generates ALTER TABLE with correct types and comments', () => {
		const sqls = generate_add_column_sql(mock_table, ['birthdate', 'age']);
		
		expect(sqls[0]).toContain('ADD COLUMN `birthdate` DATE DEFAULT NULL COMMENT \'Birthdate - rsc101\'');
		expect(sqls[1]).toContain('ADD COLUMN `age` INT(10) DEFAULT NULL COMMENT \'Age - rsc102\'');
	});

	test('falls back to TEXT if context is missing', () => {
		const sqls = generate_add_column_sql(mock_table, ['missing_col']);
		expect(sqls[0]).toContain('`missing_col` TEXT DEFAULT NULL');
	});
});
