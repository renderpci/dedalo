import { describe, test, expect } from 'bun:test';
import {
  listRecordsQuerySchema,
  getRecordQuerySchema,
  fulltextQuerySchema,
  fragmentsQuerySchema,
  avFragmentsQuerySchema,
  recordIdSchema,
  avIndexationParamsSchema,
  batchRequestSchema,
} from '../src/validators';

describe('listRecordsQuerySchema', () => {
  test('applies defaults', () => {
    const result = listRecordsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(100);
      expect(result.data.offset).toBe(0);
      expect(result.data.count).toBe(false);
    }
  });

  test('coerces numeric strings', () => {
    const result = listRecordsQuerySchema.safeParse({ limit: '5', offset: '10' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(5);
      expect(result.data.offset).toBe(10);
    }
  });

  test('allows limit=0 for count-only requests', () => {
    const result = listRecordsQuerySchema.safeParse({ limit: '0', count: 'true' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(0);
      expect(result.data.count).toBe(true);
    }
  });

  test('rejects limit above MAX_LIMIT', () => {
    expect(listRecordsQuerySchema.safeParse({ limit: '1001' }).success).toBe(false);
  });

  test('rejects negative offset', () => {
    expect(listRecordsQuerySchema.safeParse({ offset: '-1' }).success).toBe(false);
  });

  test('validates lang format', () => {
    expect(listRecordsQuerySchema.safeParse({ lang: 'lg-eng' }).success).toBe(true);
    expect(listRecordsQuerySchema.safeParse({ lang: 'english' }).success).toBe(false);
    expect(listRecordsQuerySchema.safeParse({ lang: 'lg-ENG' }).success).toBe(false);
  });

  test('count accepts boolean-like strings', () => {
    for (const [input, expected] of [['true', true], ['1', true], ['false', false], ['0', false], ['', false]] as const) {
      const result = listRecordsQuerySchema.safeParse({ count: input });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.count).toBe(expected);
    }
  });

  test('strips unknown params instead of failing', () => {
    const result = listRecordsQuerySchema.safeParse({ 'filter[code]': 'x', limit: '5' });
    expect(result.success).toBe(true);
    if (result.success) expect('filter[code]' in result.data).toBe(false);
  });
});

describe('getRecordQuerySchema', () => {
  test('accepts lang and fields', () => {
    const result = getRecordQuerySchema.safeParse({ lang: 'lg-spa', fields: 'code,title' });
    expect(result.success).toBe(true);
  });
});

describe('recordIdSchema', () => {
  test('coerces positive integers', () => {
    expect(recordIdSchema.safeParse('42').success).toBe(true);
    expect(recordIdSchema.parse('42')).toBe(42);
  });

  test('rejects zero, negatives, and non-numbers', () => {
    expect(recordIdSchema.safeParse('0').success).toBe(false);
    expect(recordIdSchema.safeParse('-1').success).toBe(false);
    expect(recordIdSchema.safeParse('abc').success).toBe(false);
    expect(recordIdSchema.safeParse('1.5').success).toBe(false);
  });
});

describe('fulltextQuerySchema', () => {
  test('requires q', () => {
    expect(fulltextQuerySchema.safeParse({}).success).toBe(false);
    expect(fulltextQuerySchema.safeParse({ q: 'guerra' }).success).toBe(true);
  });

  test('column defaults to transcription', () => {
    const result = fulltextQuerySchema.parse({ q: 'guerra' });
    expect(result.column).toBe('transcription');
  });

  test('rejects oversized q', () => {
    expect(fulltextQuerySchema.safeParse({ q: 'a'.repeat(513) }).success).toBe(false);
  });
});

describe('fragmentsQuerySchema', () => {
  test('requires terms', () => {
    expect(fragmentsQuerySchema.safeParse({}).success).toBe(false);
  });

  test('applies fragment defaults and bounds', () => {
    const result = fragmentsQuerySchema.parse({ terms: 'guerra' });
    expect(result.max_characters).toBe(320);
    expect(result.max_occurrences).toBe(1);
    expect(fragmentsQuerySchema.safeParse({ terms: 'x', max_characters: '5001' }).success).toBe(false);
    expect(fragmentsQuerySchema.safeParse({ terms: 'x', max_occurrences: '11' }).success).toBe(false);
  });

  test('av variant has no column param', () => {
    const result = avFragmentsQuerySchema.parse({ terms: 'guerra' });
    expect('column' in result).toBe(false);
  });
});

describe('avIndexationParamsSchema', () => {
  test('requires positive section_id', () => {
    expect(avIndexationParamsSchema.safeParse({ section_id: '1' }).success).toBe(true);
    expect(avIndexationParamsSchema.safeParse({ section_id: '0' }).success).toBe(false);
    expect(avIndexationParamsSchema.safeParse({}).success).toBe(false);
  });

  test('coerces timecodes', () => {
    const result = avIndexationParamsSchema.parse({ section_id: '1', tc_in: '1.5', tc_out: '3' });
    expect(result.tc_in).toBe(1.5);
    expect(result.tc_out).toBe(3);
  });
});

describe('batchRequestSchema', () => {
  test('accepts path-based queries', () => {
    const result = batchRequestSchema.safeParse({
      queries: [
        { id: 'a', path: '/dedalo_web/tables/interview/records', params: { limit: 1 } },
        { id: 'b', path: '/dedalo_web/tables' },
      ],
    });
    expect(result.success).toBe(true);
  });

  test('accepts array params for repeated keys (bracketed filters)', () => {
    const result = batchRequestSchema.safeParse({
      queries: [
        { id: 'a', path: '/db/tables/t/records', params: { 'filter[date][gte]': '1936', 'filter[code][in]': ['a|b'] } },
      ],
    });
    expect(result.success).toBe(true);
  });

  test('rejects duplicate ids', () => {
    const result = batchRequestSchema.safeParse({
      queries: [
        { id: 'a', path: '/x' },
        { id: 'a', path: '/y' },
      ],
    });
    expect(result.success).toBe(false);
  });

  test('rejects paths not starting with /', () => {
    expect(batchRequestSchema.safeParse({ queries: [{ id: 'a', path: 'tables' }] }).success).toBe(false);
  });

  test('rejects more than 20 queries', () => {
    const queries = Array.from({ length: 21 }, (_, i) => ({ id: `q${i}`, path: '/x' }));
    expect(batchRequestSchema.safeParse({ queries }).success).toBe(false);
  });

  test('rejects empty query list', () => {
    expect(batchRequestSchema.safeParse({ queries: [] }).success).toBe(false);
  });
});
