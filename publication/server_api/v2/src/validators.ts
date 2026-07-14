/**
 * The input contract: every value a client can send, and the only place it is decided
 * whether that value is acceptable.
 *
 * These schemas are the API's outer boundary. A route hands raw query params straight to
 * one of them and works with the parsed result afterwards, so anything a handler receives
 * has already been coerced to its real type and bounded. A ZodError thrown from here is
 * turned into a 400 problem+json with a per-field `errors` array by the error handler —
 * which is why no validator needs to build an error response itself.
 *
 * What is NOT decided here: SQL-identifier safety. `column`, `fields` and `sort` are plain
 * strings at this layer, and are checked against the identifier grammar (and against the
 * table's real columns) at the SQL boundary in db/query-builder.ts. That is deliberate —
 * identifier validation belongs at the one chokepoint that interpolates, not scattered
 * across every schema that happens to accept a column name.
 *
 * Bounds imported from constants.ts rather than written inline, so the documented limit and
 * the enforced limit are the same number.
 */

import { z } from 'zod';
import { DEFAULT_LIMIT, DEFAULT_OFFSET, MAX_LIMIT, DEFAULT_MAX_CHARACTERS, DEFAULT_MAX_OCCURRENCES, MAX_BATCH_QUERIES, DEFAULT_COLUMN } from './constants';

// A query string has no booleans — everything arrives as text — so the usual spellings are
// mapped by hand. Note that an empty value counts as FALSE, so a bare `?count` (which
// URLSearchParams reads as '') switches counting OFF, not on; it must be `?count=true`.
// Anything unrecognised falls through untouched and is rejected by z.boolean().
const queryBoolean = z.preprocess((val) => {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const lower = val.toLowerCase();
    if (lower === 'true' || lower === '1') return true;
    if (lower === 'false' || lower === '0' || val === '') return false;
  }
  return val;
}, z.boolean());

// Dédalo's own language codes (lg-eng, lg-spa) — not BCP-47, and not interchangeable with
// it. `lang` selects one row of the composite (section_id, lang) primary key, so a
// malformed code must fail loudly rather than quietly matching nothing.
const langSchema = z.string().regex(/^lg-[a-z]{2,5}$/, 'Expected lg-xx format');

// limit=0 is allowed: count-only requests skip the data query
// Over MAX_LIMIT is a 400, not a clamp — see the note on MAX_LIMIT in constants.ts.
const limitSchema = z.coerce.number().int().min(0).max(MAX_LIMIT).default(DEFAULT_LIMIT);
const offsetSchema = z.coerce.number().int().min(0).default(DEFAULT_OFFSET);

// Left as raw strings on purpose: both carry a JSON object ({"image":"image"}), whose shape
// is parsed and validated in services/resolve.service.ts, together with the recursion and
// fan-out bounds that only that layer can enforce.
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

// The excerpt bounds (max_characters, max_occurrences) are capped as well as floored: each
// term becomes a regex scan and each occurrence copies a window of text out of it, so the
// two multiply into the response size and the CPU cost of one request. The term string is
// capped at 512 chars here and split into at most MAX_FRAGMENT_TERMS words downstream.
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

// A section_id from the path. Coerced because a path segment is text, and constrained to a
// positive integer so a non-numeric id is a 400 at the boundary rather than a value handed
// to the query layer.
export const recordIdSchema = z.coerce.number().int().positive();

export type ListRecordsQuery = z.infer<typeof listRecordsQuerySchema>;
export type GetRecordQuery = z.infer<typeof getRecordQuerySchema>;
export type FulltextQuery = z.infer<typeof fulltextQuerySchema>;
export type FragmentsQuery = z.infer<typeof fragmentsQuerySchema>;
export type AvFragmentsQuery = z.infer<typeof avFragmentsQuerySchema>;

// tc_in/tc_out are media timecodes in SECONDS, so unlike every other numeric param here they
// are deliberately not .int() — a timecode is fractional ([tc-12.5-30.0], see
// TC_TAG_PATTERN). They are non-negative, since they index into a media file from its start.
export const avIndexationParamsSchema = z.object({
  section_id: z.coerce.number().int().positive(),
  section_tipo: z.string().optional(),
  component_tipo: z.string().optional(),
  tag_id: z.coerce.number().int().optional(),
  tc_in: z.coerce.number().min(0).optional(),
  tc_out: z.coerce.number().min(0).optional(),
});

export type AvIndexationParams = z.infer<typeof avIndexationParamsSchema>;

/**
 * One sub-query of a /batch envelope.
 *
 * `id` is the caller's own correlation handle: the response is an unordered array of results
 * carrying these ids back, which is how a client tells which answer belongs to which
 * question. `path` must be root-relative — it is re-entered against the internal routing
 * table (router.ts dispatch), not fetched — and services/batch.service.ts additionally
 * refuses a path with a query string (params go in `params`) and any non-data endpoint.
 *
 * `params` is restricted to scalars and arrays of scalars because it is rendered into a
 * query string: an array becomes a repeated key, and there is no encoding a nested object
 * could be given that the route schemas above would understand.
 */
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

// Ids must be unique or the response is ambiguous — a client keying results by id would
// silently lose one. Rejecting the envelope is the only honest answer, so this is a refine
// on the whole batch rather than a per-query check. The size cap is what bounds the fan-out
// a single request can commission (see MAX_BATCH_QUERIES).
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
