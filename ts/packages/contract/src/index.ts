/**
 * @dedalo/contract
 * Zod wire-contract schemas + inferred TypeScript types for the Dédalo JSON API.
 *
 * What: the canonical request/response shapes exchanged over the JSON API —
 * RQO (request envelope), SQO (search query object), Locator, Source, Filter
 * and the API ResponseEnvelope. Each schema is paired with a `z.infer` type.
 *
 * Why: a single source of truth for the wire contract prevents drift between
 * the TS core rewrite, tests and any client. Schemas are strict where the PHP
 * envelope is fixed and permissive (`.passthrough()`) where it is open-ended,
 * matching core/api/v1/common/class.dd_manager.php and the captured golden
 * fixtures.
 */
export { IdValueSchema, LocatorSchema } from './locator.ts';
export type { IdValue, Locator } from './locator.ts';

export { FilterClauseSchema, FilterPathStepSchema, FilterSchema } from './filter.ts';
export type { FilterClause, FilterPathStep, Filter } from './filter.ts';

export { SourceSchema } from './source.ts';
export type { Source } from './source.ts';

export { OrderClauseSchema, SqoSchema } from './sqo.ts';
export type { OrderClause, Sqo } from './sqo.ts';

export { RqoSchema } from './rqo.ts';
export type { Rqo } from './rqo.ts';

export { ResponseEnvelopeSchema, isErrorResponse } from './response.ts';
export type { ResponseEnvelope } from './response.ts';
