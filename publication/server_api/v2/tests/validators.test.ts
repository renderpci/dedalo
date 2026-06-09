import { describe, test, expect } from 'bun:test';
import { searchParamsSchema, batchRequestSchema, avIndexationParamsSchema } from '../src/validators';

describe('searchParamsSchema', () => {
  test('validates records mode with defaults', () => {
    const result = searchParamsSchema.safeParse({ mode: 'records', table: 'interview' });
    expect(result.success).toBe(true);
    if (result.success && result.data.mode === 'records') {
      expect(result.data.limit).toBe(100);
      expect(result.data.offset).toBe(0);
    }
  });

  test('validates fulltext mode requires q', () => {
    const result = searchParamsSchema.safeParse({ mode: 'fulltext', table: 'interview' });
    expect(result.success).toBe(false);
  });

  test('validates fulltext mode with q', () => {
    const result = searchParamsSchema.safeParse({ mode: 'fulltext', table: 'interview', q: 'guerra' });
    expect(result.success).toBe(true);
  });

  test('validates text-fragment mode requires section_id and terms', () => {
    const result = searchParamsSchema.safeParse({ mode: 'text-fragment', table: 'publications' });
    expect(result.success).toBe(false);
  });

  test('validates text-fragment mode with required params', () => {
    const result = searchParamsSchema.safeParse({
      mode: 'text-fragment',
      table: 'publications',
      section_id: '123',
      terms: 'economia',
    });
    expect(result.success).toBe(true);
  });

  test('validates av-fragment mode requires section_id and terms', () => {
    const result = searchParamsSchema.safeParse({ mode: 'av-fragment', table: 'interview' });
    expect(result.success).toBe(false);
  });

  test('validates av-fragment mode with required params', () => {
    const result = searchParamsSchema.safeParse({
      mode: 'av-fragment',
      table: 'interview',
      section_id: '46',
      terms: 'guerra',
    });
    expect(result.success).toBe(true);
  });

  test('rejects invalid mode', () => {
    const result = searchParamsSchema.safeParse({ mode: 'invalid', table: 'interview' });
    expect(result.success).toBe(false);
  });

  test('rejects missing table', () => {
    const result = searchParamsSchema.safeParse({ mode: 'records' });
    expect(result.success).toBe(false);
  });

  test('rejects limit out of range', () => {
    const result = searchParamsSchema.safeParse({ mode: 'records', table: 'interview', limit: '0' });
    expect(result.success).toBe(false);

    const result2 = searchParamsSchema.safeParse({ mode: 'records', table: 'interview', limit: '2000' });
    expect(result2.success).toBe(false);
  });

  test('coerces string numbers', () => {
    const result = searchParamsSchema.safeParse({ mode: 'records', table: 'interview', limit: '50', offset: '10' });
    expect(result.success).toBe(true);
    if (result.success && result.data.mode === 'records') {
      expect(result.data.limit).toBe(50);
      expect(result.data.offset).toBe(10);
    }
  });

  test('validates records mode with resolve_relations', () => {
    const result = searchParamsSchema.safeParse({
      mode: 'records',
      table: 'interview',
      resolve_relations: '{"image":"image"}',
    });
    expect(result.success).toBe(true);
  });

  test('validates records mode with resolve_inverse_relations true', () => {
    const result = searchParamsSchema.safeParse({
      mode: 'records',
      table: 'interview',
      resolve_inverse_relations: 'true',
    });
    expect(result.success).toBe(true);
  });

  test('validates records mode with resolve_inverse_relations JSON', () => {
    const result = searchParamsSchema.safeParse({
      mode: 'records',
      table: 'interview',
      resolve_inverse_relations: '{"rsc170":"images"}',
    });
    expect(result.success).toBe(true);
  });

  test('validates fulltext mode with resolve_relations', () => {
    const result = searchParamsSchema.safeParse({
      mode: 'fulltext',
      table: 'interview',
      q: 'guerra',
      resolve_relations: '{"informant":"informant"}',
    });
    expect(result.success).toBe(true);
  });

  test('validates records mode defaults resolve params to undefined', () => {
    const result = searchParamsSchema.safeParse({ mode: 'records', table: 'interview' });
    expect(result.success).toBe(true);
    if (result.success && result.data.mode === 'records') {
      expect(result.data.resolve_relations).toBeUndefined();
      expect(result.data.resolve_inverse_relations).toBeUndefined();
    }
  });
});

describe('batchRequestSchema', () => {
  test('validates valid batch request', () => {
    const result = batchRequestSchema.safeParse({
      queries: [
        { id: 'q1', endpoint: '/search', params: { table: 'interview' } },
        { id: 'q2', endpoint: '/schema', params: {} },
      ],
    });
    expect(result.success).toBe(true);
  });

  test('rejects empty queries', () => {
    const result = batchRequestSchema.safeParse({ queries: [] });
    expect(result.success).toBe(false);
  });

  test('rejects more than 20 queries', () => {
    const queries = Array.from({ length: 21 }, (_, i) => ({
      id: `q${i}`,
      endpoint: '/search',
      params: { table: 'interview' },
    }));
    const result = batchRequestSchema.safeParse({ queries });
    expect(result.success).toBe(false);
  });

  test('rejects duplicate query IDs', () => {
    const result = batchRequestSchema.safeParse({
      queries: [
        { id: 'q1', endpoint: '/search', params: { table: 'interview' } },
        { id: 'q1', endpoint: '/schema', params: {} },
      ],
    });
    expect(result.success).toBe(false);
  });

  test('rejects invalid endpoint', () => {
    const result = batchRequestSchema.safeParse({
      queries: [
        { id: 'q1', endpoint: '/invalid', params: {} },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe('avIndexationParamsSchema', () => {
  test('validates with required section_id', () => {
    const result = avIndexationParamsSchema.safeParse({ section_id: '46' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.section_id).toBe(46);
    }
  });

  test('validates with all params', () => {
    const result = avIndexationParamsSchema.safeParse({
      section_id: '46',
      section_tipo: 'rsc167',
      component_tipo: 'rsc36',
      tag_id: '1',
      tc_in: '120.5',
      tc_out: '180',
    });
    expect(result.success).toBe(true);
  });

  test('rejects missing section_id', () => {
    const result = avIndexationParamsSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  test('rejects negative section_id', () => {
    const result = avIndexationParamsSchema.safeParse({ section_id: '-1' });
    expect(result.success).toBe(false);
  });
});
