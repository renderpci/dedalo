import { z } from 'zod';
import { DEFAULT_LIMIT, DEFAULT_OFFSET, MAX_LIMIT, DEFAULT_MAX_CHARACTERS, DEFAULT_MAX_OCCURRENCES, MAX_BATCH_QUERIES } from './constants';

const modeEnum = z.enum(['records', 'fulltext', 'text-fragment', 'av-fragment']);

const baseSearchParams = z.object({
  mode: modeEnum.default('records'),
  table: z.string().min(1, 'table is required'),
});

const recordsParams = baseSearchParams.extend({
  mode: z.literal('records').default('records'),
  fields: z.string().optional(),
  filter: z.string().optional(),
  order: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(DEFAULT_OFFSET),
  section_id: z.string().optional(),
  lang: z.string().regex(/^lg-[a-z]{2,5}$/, 'Expected lg-xx format').optional(),
  count: z.coerce.boolean().default(false),
  resolve_relations: z.string().optional(),
  resolve_inverse_relations: z.string().optional(),
});

const fulltextParams = baseSearchParams.extend({
  mode: z.literal('fulltext'),
  q: z.string().min(1, 'q is required for fulltext mode'),
  column: z.string().default('transcription'),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(DEFAULT_OFFSET),
  count: z.coerce.boolean().default(false),
  resolve_relations: z.string().optional(),
  resolve_inverse_relations: z.string().optional(),
});

const textFragmentParams = baseSearchParams.extend({
  mode: z.literal('text-fragment'),
  section_id: z.string().min(1, 'section_id is required for text-fragment mode'),
  terms: z.string().min(1, 'terms is required for text-fragment mode'),
  column: z.string().default('transcription'),
  max_characters: z.coerce.number().int().min(10).max(5000).default(DEFAULT_MAX_CHARACTERS),
  max_occurrences: z.coerce.number().int().min(1).max(10).default(DEFAULT_MAX_OCCURRENCES),
});

const avFragmentParams = baseSearchParams.extend({
  mode: z.literal('av-fragment'),
  section_id: z.string().min(1, 'section_id is required for av-fragment mode'),
  terms: z.string().min(1, 'terms is required for av-fragment mode'),
  max_characters: z.coerce.number().int().min(10).max(5000).default(DEFAULT_MAX_CHARACTERS),
  max_occurrences: z.coerce.number().int().min(1).max(10).default(DEFAULT_MAX_OCCURRENCES),
});

export const searchParamsSchema = z.discriminatedUnion('mode', [
  recordsParams,
  fulltextParams,
  textFragmentParams,
  avFragmentParams,
]);

export type SearchParams = z.infer<typeof searchParamsSchema>;
export type RecordsParams = z.infer<typeof recordsParams>;
export type FulltextParams = z.infer<typeof fulltextParams>;
export type TextFragmentParams = z.infer<typeof textFragmentParams>;
export type AvFragmentParams = z.infer<typeof avFragmentParams>;

export const schemaParamsSchema = z.object({
  table: z.string().optional(),
});

export type SchemaParams = z.infer<typeof schemaParamsSchema>;

export const avIndexationParamsSchema = z.object({
  section_id: z.coerce.number().int().positive(),
  section_tipo: z.string().optional(),
  component_tipo: z.string().optional(),
  tag_id: z.coerce.number().int().optional(),
  tc_in: z.coerce.number().min(0).optional(),
  tc_out: z.coerce.number().min(0).optional(),
});

export type AvIndexationParams = z.infer<typeof avIndexationParamsSchema>;

const batchQuerySchema = z.object({
  id: z.string().min(1),
  endpoint: z.enum(['/schema', '/search', '/av-indexation-fragment']),
  params: z.record(z.unknown()),
});

export const batchRequestSchema = z.object({
  queries: z.array(batchQuerySchema).min(1).max(MAX_BATCH_QUERIES),
}).refine(
  (data) => {
    const ids = data.queries.map(q => q.id);
    return new Set(ids).size === ids.length;
  },
  { message: 'Batch query IDs must be unique' },
);

export type BatchRequest = z.infer<typeof batchRequestSchema>;
export type BatchQuery = z.infer<typeof batchQuerySchema>;