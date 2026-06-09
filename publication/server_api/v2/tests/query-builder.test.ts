import { describe, test, expect } from 'bun:test';
import { validateTableName, validateColumnName } from '../src/db/query-builder';
import { parseFilters, parseOrder } from '../src/utils/filter-dsl';
import { ValidationError } from '../src/errors';

describe('Query Builder Validation', () => {
  test('validateTableName accepts valid names', () => {
    expect(() => validateTableName('interview')).not.toThrow();
    expect(() => validateTableName('ts_themes')).not.toThrow();
    expect(() => validateTableName('table_123')).not.toThrow();
  });

  test('validateTableName rejects invalid names', () => {
    expect(() => validateTableName('123table')).toThrow();
    expect(() => validateTableName('table-name')).toThrow();
    expect(() => validateTableName('table name')).toThrow();
    expect(() => validateTableName('')).toThrow();
  });

  test('validateColumnName accepts valid names', () => {
    expect(() => validateColumnName('section_id')).not.toThrow();
    expect(() => validateColumnName('code')).not.toThrow();
    expect(() => validateColumnName('rsc36')).not.toThrow();
  });

  test('validateColumnName rejects invalid names', () => {
    expect(() => validateColumnName('123column')).toThrow();
    expect(() => validateColumnName('column-name')).toThrow();
    expect(() => validateColumnName('')).toThrow();
  });
});

describe('Filter DSL', () => {
  test('parseFilters handles eq operator', () => {
    const result = parseFilters('section_id:eq:1');
    expect(result.sql).toBe('`section_id` = ?');
    expect(result.params).toEqual(['1']);
  });

  test('parseFilters handles ne operator', () => {
    const result = parseFilters('status:ne:deleted');
    expect(result.sql).toBe('`status` != ?');
    expect(result.params).toEqual(['deleted']);
  });

  test('parseFilters handles like operator', () => {
    const result = parseFilters('code:like:OH-%');
    expect(result.sql).toBe('`code` LIKE ?');
    expect(result.params).toEqual(['OH-%']);
  });

  test('parseFilters handles in operator with pipe-separated values', () => {
    const result = parseFilters('section_id:in:1|2|3');
    expect(result.sql).toBe('`section_id` IN (?,?,?)');
    expect(result.params).toEqual(['1', '2', '3']);
  });

  test('parseFilters handles not_in operator', () => {
    const result = parseFilters('lang:not_in:lg-eng|lg-spa');
    expect(result.sql).toBe('`lang` NOT IN (?,?)');
    expect(result.params).toEqual(['lg-eng', 'lg-spa']);
  });

  test('parseFilters handles is_null operator', () => {
    const result = parseFilters('parent:is_null');
    expect(result.sql).toBe('`parent` IS NULL');
    expect(result.params).toEqual([]);
  });

  test('parseFilters handles is_not_null operator', () => {
    const result = parseFilters('title:is_not_null');
    expect(result.sql).toBe('`title` IS NOT NULL');
    expect(result.params).toEqual([]);
  });

  test('parseFilters handles comparison operators', () => {
    const gt = parseFilters('section_id:gt:10');
    expect(gt.sql).toBe('`section_id` > ?');
    expect(gt.params).toEqual(['10']);

    const gte = parseFilters('section_id:gte:10');
    expect(gte.sql).toBe('`section_id` >= ?');

    const lt = parseFilters('section_id:lt:100');
    expect(lt.sql).toBe('`section_id` < ?');

    const lte = parseFilters('section_id:lte:100');
    expect(lte.sql).toBe('`section_id` <= ?');
  });

  test('parseFilters handles multiple conditions (AND)', () => {
    const result = parseFilters('lang:eq:lg-eng,code:like:OH-%');
    expect(result.sql).toBe('`lang` = ? AND `code` LIKE ?');
    expect(result.params).toEqual(['lg-eng', 'OH-%']);
  });

  test('parseFilters returns empty for empty input', () => {
    const result = parseFilters('');
    expect(result.sql).toBe('');
    expect(result.params).toEqual([]);
  });

  test('parseFilters rejects invalid field names', () => {
    expect(() => parseFilters('bad-field:eq:1')).toThrow(ValidationError);
    expect(() => parseFilters('123table:eq:1')).toThrow(ValidationError);
  });

  test('parseFilters rejects invalid operators', () => {
    expect(() => parseFilters('field:invalid:value')).toThrow(ValidationError);
  });

  test('parseFilters rejects malformed input', () => {
    expect(() => parseFilters('just_a_string')).toThrow(ValidationError);
  });

  test('parseFilters prevents SQL injection via field name', () => {
    expect(() => parseFilters('SELECT * FROM users:eq:1')).toThrow(ValidationError);
    expect(() => parseFilters('1;DROP TABLE users:eq:1')).toThrow(ValidationError);
  });
});

describe('Order DSL', () => {
  test('parseOrder handles single field ascending', () => {
    expect(parseOrder('title:asc')).toBe('`title` ASC');
  });

  test('parseOrder handles single field descending', () => {
    expect(parseOrder('title:desc')).toBe('`title` DESC');
  });

  test('parseOrder defaults to ASC when no direction', () => {
    expect(parseOrder('title')).toBe('`title` ASC');
  });

  test('parseOrder handles multiple fields', () => {
    expect(parseOrder('title:asc,section_id:desc')).toBe('`title` ASC, `section_id` DESC');
  });

  test('parseOrder returns empty for empty input', () => {
    expect(parseOrder('')).toBe('');
  });

  test('parseOrder rejects invalid field names', () => {
    expect(() => parseOrder('bad-field:asc')).toThrow(ValidationError);
  });

  test('parseOrder rejects invalid directions', () => {
    expect(() => parseOrder('title:invalid')).toThrow(ValidationError);
  });
});
