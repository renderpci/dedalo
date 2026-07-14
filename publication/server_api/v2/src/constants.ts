/**
 * The fixed values the API is built on. Three distinct kinds live here, and confusing them
 * is the mistake this header exists to prevent:
 *
 *   1. **Denial-of-service bounds** (MAX_LIMIT, MAX_BATCH_QUERIES, MAX_FRAGMENT_TERMS,
 *      MAX_TERM_LENGTH, MAX_SCAN_LENGTH, MAX_RESOLVE_*). These are SECURITY limits, not
 *      style preferences or round numbers someone liked. This is a public, unauthenticated-
 *      by-default read API over a database that may hold very large transcriptions; each of
 *      these caps one way a single cheap request could otherwise buy an expensive amount of
 *      CPU, memory or connection time. Raising one widens an attack surface — do it
 *      knowingly, and see docs/diffusion/publication_api/v2/security.md, which publishes
 *      these numbers as part of the contract.
 *   2. **Dédalo ontology names** (DEFAULT_TABLE/COLUMN, TABLES, COLUMNS). The API is
 *      otherwise schema-agnostic — it reads whatever the diffusion process published. These
 *      are the names a *standard Dédalo oral-history publication* uses, so the common case
 *      needs no configuration. They are conveniences, never assumptions the query layer is
 *      allowed to depend on.
 *   3. **Dédalo transcription markers** (TC_TAG_PATTERN, PAGE_TAG_PATTERN) — see below.
 *
 * Defaults that the client may override live in validators.ts, which imports them from here
 * so the documented default and the enforced default cannot drift apart.
 */

// Reported in the discovery index, /health and the MCP server handshake.
export const API_VERSION = '2.1.0';

// The table and column an MCP agent or a fragments call gets when it names neither: the
// interview transcription, which is what the overwhelming majority of queries are after.
export const DEFAULT_TABLE = 'interview';
export const DEFAULT_COLUMN = 'transcription';

export const DEFAULT_LIMIT = 100;
export const DEFAULT_OFFSET = 0;

// Page-size ceiling. Requesting more is a 400, deliberately, rather than a silent clamp —
// a client that asked for 5000 rows and quietly received 1000 would page through the
// dataset wrong and never know.
export const MAX_LIMIT = 1000;

// One /batch request fans out into at most this many sub-queries. It bounds the work a
// single HTTP request can commission; the rate limiter separately charges the caller for
// every one of them (security/rate-limiter.ts), so this is a latency bound, not a quota.
export const MAX_BATCH_QUERIES = 20;

// The shape of a fragment excerpt when the caller does not specify: ~320 characters of
// context around the first hit of each term.
export const DEFAULT_MAX_CHARACTERS = 320;
export const DEFAULT_MAX_OCCURRENCES = 1;

// Human-readable operator list, embedded in MCP tool descriptions so an agent can discover
// the filter DSL. Prose only — the query builder validates operators against its own map.
export const VALID_OPERATORS_HINT = 'eq, ne, gt, gte, lt, lte, like, in, not_in, is_null, is_not_null';

// Fragment-search bounds (enforced in utils/fragments.ts). Each term becomes its own regex
// scan over the text, so all three multiply into the cost of one request:
//   - terms beyond the 10th are dropped (a silent cap: extra words are noise, not abuse);
//   - a word longer than 64 chars is REJECTED, because no real search term looks like that
//     and a pathological one is a request to burn CPU;
//   - only the first megabyte of a transcription is scanned, which bounds the worst case
//     regardless of how large the published text grew.
export const MAX_FRAGMENT_TERMS = 10;
export const MAX_TERM_LENGTH = 64;
export const MAX_SCAN_LENGTH = 1_000_000;

/**
 * Column names the code refers to by meaning rather than by string literal.
 *
 * SECTION_ID and LANG are the load-bearing pair: a published table's PRIMARY KEY is the
 * composite (section_id, lang) — one row per record per language, with no surrogate id — so
 * "a record" is a set of rows, and almost every query in the service layer is shaped by
 * that. DD_RELATIONS names the column holding a record's relation map (JSON in a TEXT
 * column, like all Dédalo JSON), which is what the resolve service walks.
 *
 * The remaining entries are oral-history ontology names; a few (VIDEO, TERM_ID, TERM,
 * INDEXATION) are not currently referenced by any code.
 */
export const COLUMNS = {
  SECTION_ID: 'section_id',
  LANG: 'lang',
  CODE: 'code',
  TITLE: 'title',
  TRANSCRIPTION: 'transcription',
  VIDEO: 'rsc35',
  IMAGE: 'image',
  TERM_ID: 'term_id',
  TERM: 'term',
  INDEXATION: 'indexation',
  NAME: 'name',
  SURNAME: 'surname',
  DD_RELATIONS: 'dd_relations',
} as const;

// The single row (id = 1) in which diffusion records the publication's own schema —
// notably the dd_relations map that says which column points at which table. The resolve
// service reads it to expand relations, and caches it, since it changes only between
// diffusion runs.
export const PUBLICATION_SCHEMA_TABLE = 'publication_schema';
export const PUBLICATION_SCHEMA_ID = 1;

// Relation-expansion bounds. Resolving a relation issues further queries for the rows it
// points at, and those rows can point onward — so without a ceiling one request could walk
// an arbitrary slice of the database. Depth caps the recursion; MAX_RESOLVE_ROWS caps the
// fan-out at each step (excess related ids are dropped, not fetched).
export const MAX_RESOLVE_DEPTH = 3;
export const MAX_RESOLVE_ROWS = 50;

/**
 * Dédalo's inline transcription markers, embedded in the transcription text itself.
 *
 *   [tc-12.5-30.0]  a timecode span (seconds in / seconds out) synchronising the text that
 *                   follows it with the audiovisual media — this is what lets a text search
 *                   return a playable video position.
 *   [page-n-42]     the page of the source document the text that follows came from.
 *
 * HAZARD: both carry the `g` flag, which makes them STATEFUL (a /g regex keeps a mutable
 * `lastIndex` between calls). utils/fragments.ts therefore never uses these objects to
 * match — it rebuilds a fresh regex from `.source` each time. Calling .exec()/.test()
 * directly on these exported constants would make a match depend on whoever matched last.
 */
export const TC_TAG_PATTERN = /\[tc-(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\]/g;
export const PAGE_TAG_PATTERN = /\[page-n-(\d+)\]/g;
