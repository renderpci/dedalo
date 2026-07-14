import { describe, test, expect } from 'bun:test';
import { parseRelationMap, parseInverseRelationMap, normalizeResolveRelations, normalizeResolveInverseRelations } from '../src/services/resolve.service';

describe('parseRelationMap', () => {
  test('parses valid JSON object', () => {
    const result = parseRelationMap('{"image":"image","informant":"informant"}');
    expect(result).toEqual({ image: 'image', informant: 'informant' });
  });

  test('parses deep resolution with dot notation', () => {
    const result = parseRelationMap('{"eventos.documentos":"image"}');
    expect(result).toEqual({ 'eventos.documentos': 'image' });
  });

  test('parses link:auto', () => {
    const result = parseRelationMap('{"link":"auto"}');
    expect(result).toEqual({ link: 'auto' });
  });

  test('throws on invalid JSON', () => {
    expect(() => parseRelationMap('not json')).toThrow();
  });

  test('throws on array', () => {
    expect(() => parseRelationMap('["image","informant"]')).toThrow();
  });

  test('throws on non-string values', () => {
    expect(() => parseRelationMap('{"image":123}')).toThrow();
  });

  test('throws on null', () => {
    expect(() => parseRelationMap('null')).toThrow();
  });
});

describe('parseInverseRelationMap', () => {
  test('parses valid section_tipo to table mapping', () => {
    const result = parseInverseRelationMap('{"rsc170":"images","oh1":"interview"}');
    expect(result).toEqual({ rsc170: 'images', oh1: 'interview' });
  });

  test('throws on invalid JSON', () => {
    expect(() => parseInverseRelationMap('bad')).toThrow();
  });

  test('throws on non-string values', () => {
    expect(() => parseInverseRelationMap('{"rsc170":5}')).toThrow();
  });
});

describe('normalizeResolveRelations', () => {
  test('returns the string value as-is', () => {
    expect(normalizeResolveRelations('{"image":"image"}')).toBe('{"image":"image"}');
  });

  test('returns undefined for undefined input', () => {
    expect(normalizeResolveRelations(undefined)).toBeUndefined();
  });

  test('returns undefined for null input', () => {
    expect(normalizeResolveRelations(null)).toBeUndefined();
  });

  test('returns undefined for empty string', () => {
    expect(normalizeResolveRelations('')).toBeUndefined();
  });
});

describe('normalizeResolveInverseRelations', () => {
  test('returns true for "true"', () => {
    expect(normalizeResolveInverseRelations('true')).toBe(true);
  });

  test('returns true for "1"', () => {
    expect(normalizeResolveInverseRelations('1')).toBe(true);
  });

  test('returns the JSON string for non-boolean values', () => {
    expect(normalizeResolveInverseRelations('{"rsc170":"images"}')).toBe('{"rsc170":"images"}');
  });

  test('returns undefined for undefined input', () => {
    expect(normalizeResolveInverseRelations(undefined)).toBeUndefined();
  });

  test('returns undefined for null input', () => {
    expect(normalizeResolveInverseRelations(null)).toBeUndefined();
  });
});