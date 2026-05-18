import { describe, test, expect } from 'bun:test';
import {
	TipoSchema,
	LangSchema,
	OptionalLangSchema,
	SectionIdSchema,
	LocatorSchema,
	PaginationSchema,
	FilterRuleSchema,
	FilterSchema,
	OrderClauseSchema,
} from '../src/tools/_shared/schemas.js';

describe('TipoSchema', () => {
	test('accepts alphanumeric tipos', () => {
		expect(TipoSchema.parse('oh1')).toBe('oh1');
		expect(TipoSchema.parse('dd1324')).toBe('dd1324');
		expect(TipoSchema.parse('rsc167_a')).toBe('rsc167_a');
	});
	test('rejects empty / invalid characters', () => {
		expect(() => TipoSchema.parse('')).toThrow();
		expect(() => TipoSchema.parse('oh-1')).toThrow();
		expect(() => TipoSchema.parse('oh 1')).toThrow();
	});
});

describe('LangSchema', () => {
	test('accepts lg-xxx codes', () => {
		expect(LangSchema.parse('lg-eng')).toBe('lg-eng');
		expect(LangSchema.parse('lg-spa')).toBe('lg-spa');
		expect(LangSchema.parse('lg-nolan')).toBe('lg-nolan');
	});
	test('rejects malformed codes', () => {
		expect(() => LangSchema.parse('eng')).toThrow();
		expect(() => LangSchema.parse('lg-eng-extra')).toThrow();
		expect(() => LangSchema.parse('lg-EN')).toThrow();
	});
	test('OptionalLangSchema accepts undefined', () => {
		expect(OptionalLangSchema.parse(undefined)).toBeUndefined();
	});
});

describe('SectionIdSchema', () => {
	test('coerces number to string', () => {
		expect(SectionIdSchema.parse(42)).toBe('42');
	});
	test('passes through string', () => {
		expect(SectionIdSchema.parse('42')).toBe('42');
	});
	test('rejects empty string and non-positive numbers', () => {
		expect(() => SectionIdSchema.parse('')).toThrow();
		expect(() => SectionIdSchema.parse(0)).toThrow();
		expect(() => SectionIdSchema.parse(-1)).toThrow();
	});
});

describe('LocatorSchema', () => {
	test('minimal locator', () => {
		const r = LocatorSchema.parse({ section_tipo: 'oh1', section_id: 1 });
		expect(r.section_tipo).toBe('oh1');
		expect(r.section_id).toBe('1');
	});
	test('with component_tipo', () => {
		const r = LocatorSchema.parse({ section_tipo: 'oh1', section_id: '5', component_tipo: 'oh14' });
		expect(r.component_tipo).toBe('oh14');
	});
	test('rejects missing section_id', () => {
		expect(() => LocatorSchema.parse({ section_tipo: 'oh1' })).toThrow();
	});
});

describe('PaginationSchema', () => {
	test('applies defaults', () => {
		const r = PaginationSchema.parse({});
		expect(r.limit).toBe(50);
		expect(r.offset).toBe(0);
		expect(r.full_count).toBe(false);
	});
	test('rejects out-of-range limit', () => {
		expect(() => PaginationSchema.parse({ limit: 0 })).toThrow();
		expect(() => PaginationSchema.parse({ limit: 1000 })).toThrow();
	});
});

describe('FilterRuleSchema', () => {
	test('basic rule', () => {
		const r = FilterRuleSchema.parse({ path: 'oh14', operator: 'contains', value: 'x' });
		expect(r.operator).toBe('contains');
	});
});

describe('FilterSchema (recursive)', () => {
	test('accepts nested AND/OR', () => {
		const r = FilterSchema.parse({
			operator: 'AND',
			rules: [
				{ path: 'oh14', operator: 'contains', value: 'Picasso' },
				{
					operator: 'OR',
					rules: [
						{ path: 'oh15', operator: '=', value: 'lg-eng' },
						{ path: 'oh15', operator: '=', value: 'lg-spa' },
					],
				},
			],
		});
		expect(r.operator).toBe('AND');
		expect(r.rules).toHaveLength(2);
	});
	test('operator is optional (defaults handled downstream)', () => {
		const r = FilterSchema.parse({ rules: [{ path: 'oh14', operator: '=', value: 1 }] });
		expect(r.operator).toBeUndefined();
	});
});

describe('OrderClauseSchema', () => {
	test('defaults direction to ASC', () => {
		expect(OrderClauseSchema.parse({ path: 'oh14' }).direction).toBe('ASC');
	});
});
