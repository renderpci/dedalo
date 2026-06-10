import { describe, test, expect } from 'bun:test';
import { validateTableName, validateColumnName } from '../src/db/query-builder';

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
    expect(() => validateTableName('table;drop')).toThrow();
    expect(() => validateTableName('table`')).toThrow();
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
    expect(() => validateColumnName('col`umn')).toThrow();
  });
});
