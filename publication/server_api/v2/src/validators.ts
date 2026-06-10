import { z } from 'zod';
import { DEFAULT_LIMIT, DEFAULT_OFFSET, MAX_LIMIT, DEFAULT_MAX_CHARACTERS, DEFAULT_MAX_OCCURRENCES, MAX_BATCH_QUERIES, DEFAULT_COLUMN } from './constants';

const queryBoolean = z.preprocess((val) => {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const lower = val.toLowerCase();
    if (lower === 'true' || lower === '1') return true;
    if (lower === 'false' || lower === '0' || val === '') return false;
  }
  return val;
}, z.boolean());

const langSchema = z.string().regex(/^lg-[a-z]{2,5}$/, 'Expected lg-xx format');

// limit=0 is allowed: count-only requests skip the data query
const limitSchema = z.coerce.number().int().min(0).max(MAX_LIMIT).default(DEFAULT_LIMIT);
const offsetSchema = z.coerce.number().int().min(0).default(DEFAULT_OFFSET);

const resolveParams = {
  resolve_relations: z.string().optional(),
  resolve_inverse_relations: z.string().optional(),
};

export const listRecordsQuerySchema = z.object({
  fields: z.string().optional(),
  sort: z.string().optional(),
  limit: limitSchema,
  offset: offsetSchema,
  lang: langSchema.optional(),
  count: queryBoolean.default(false),
  ...resolveParams,
});

export const getRecordQuerySchema = z.object({
  fields: z.string().optional(),
  lang: langSchema.optional(),
  ...resolveParams,
});

export const fulltextQuerySchema = z.object({
  q: z.string().min(1, 'q is required').max(512),
  column: z.string().default(DEFAULT_COLUMN),
  limit: limitSchema,
  offset: offsetSchema,
  count: queryBoolean.default(false),
  ...resolveParams,
});

export const fragmentsQuerySchema = z.object({
  terms: z.string().min(1, 'terms is required').max(512),
  column: z.string().default(DEFAULT_COLUMN),
  lang: langSchema.optional(),
  max_characters: z.coerce.number().int().min(10).max(5000).default(DEFAULT_MAX_CHARACTERS),
  max_occurrences: z.coerce.number().int().min(1).max(10).default(DEFAULT_MAX_OCCURRENCES),
});

export const avFragmentsQuerySchema = z.object({
  terms: z.string().min(1, 'terms is required').max(512),
  lang: langSchema.optional(),
  max_characters: z.coerce.number().int().min(10).max(5000).default(DEFAULT_MAX_CHARACTERS),
  max_occurrences: z.coerce.number().int().min(1).max(10).default(DEFAULT_MAX_OCCURRENCES),
});

export const recordIdSchema = z.coerce.number().int().positive();

export type ListRecordsQuery = z.infer<typeof listRecordsQuerySchema>;
export type GetRecordQuery = z.infer<typeof getRecordQuerySchema>;
export type FulltextQuery = z.infer<typeof fulltextQuerySchema>;
export type FragmentsQuery = z.infer<typeof fragmentsQuerySchema>;
export type AvFragmentsQuery = z.infer<typeof avFragmentsQuerySchema>;

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
  path: z.string().min(1).startsWith('/', 'path must start with "/"'),
  params: z.record(z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.union([z.string(), z.number(), z.boolean()])),
  ])).optional(),
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
