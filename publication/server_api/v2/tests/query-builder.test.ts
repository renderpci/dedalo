import { describe, test, expect } from 'bun:test';
import { validateTableName, validateColumnName, validateWhereClause } from '../src/db/query-builder';

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

  test('validateWhereClause rejects SQL injection', () => {
    expect(() => validateWhereClause('1=1; DELETE FROM users')).toThrow();
    expect(() => validateWhereClause('UNION SELECT * FROM users')).toThrow();
    expect(() => validateWhereClause('1=1; DROP TABLE interview')).toThrow();
    expect(() => validateWhereClause('INTO OUTFILE "/tmp/test"')).toThrow();
  });

  test('validateWhereClause accepts valid clauses', () => {
    expect(() => validateWhereClause('section_id = 1')).not.toThrow();
    expect(() => validateWhereClause("code LIKE 'OH-%'")).not.toThrow();
    expect(() => validateWhereClause('lang = ? AND section_id IN (?, ?)')).not.toThrow();
  });
});
