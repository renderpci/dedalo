import { z } from 'zod';

/**
 * FilterPathStepSchema / FilterPathStep
 * One step of a clause's `path` — a DDO chain element identifying a component
 * within a section. Ground truth: the path objects built in
 * core/common/class.search_query_object.php set_filter (~378-415) and consumed
 * in core/search/class.search.php conform_filter. PHP is open-ended here, so we
 * model the common keys and `.passthrough()` the rest.
 */
export const FilterPathStepSchema = z
	.object({
		section_tipo: z.string().optional(),
		component_tipo: z.string().optional(),
		model: z.string().optional(),
		name: z.string().optional(),
	})
	.passthrough();

export type FilterPathStep = z.infer<typeof FilterPathStepSchema>;

/**
 * FilterClauseSchema / FilterClause
 * A leaf clause inside a Mango-style filter group. The REAL wire shape
 * (set_filter ~378-415, search.php:744) carries a search string `q`, an
 * optional `q_operator`, and a `path` (array of path-step objects). All other
 * fields are optional clause modifiers. `.passthrough()` because PHP treats the
 * clause object as open-ended.
 */
export const FilterClauseSchema = z
	.object({
		q: z.any().optional(),
		q_operator: z.any().optional(),
		path: z.array(FilterPathStepSchema).optional(),
		format: z.any().optional(),
		use_function: z.any().optional(),
		q_split: z.any().optional(),
		unaccent: z.any().optional(),
		type: z.any().optional(),
		lang: z.any().optional(),
		column: z.any().optional(),
		tipo: z.any().optional(),
		data_path: z.any().optional(),
	})
	.passthrough();

export type FilterClause = z.infer<typeof FilterClauseSchema>;

/**
 * Filter
 * The Dédalo SQO `filter` is a Mango-Query-style tree where the OPERATOR IS THE
 * OBJECT KEY: `{ "$and": [ ...clauses or nested groups... ] }`. Ground truth:
 * set_filter (the top-level key must be `$and`/`$or`) and search.php:744
 * `foreach ($this->sqo->filter as $op => $filter_items)`. There is no `rules`
 * key and no `operator`/`value` leaf fields. We tolerate `$not` defensively.
 *
 * Each group value is an array whose items are either a leaf clause or another
 * nested group (hence `z.lazy()` for the self-reference).
 */
export type Filter = {
	$and?: Array<FilterClause | Filter>;
	$or?: Array<FilterClause | Filter>;
	$not?: Array<FilterClause | Filter>;
};

const FilterGroupItemSchema: z.ZodType<FilterClause | Filter> = z.lazy(() =>
	z.union([FilterSchema, FilterClauseSchema]),
);

export const FilterSchema: z.ZodType<Filter> = z.lazy(() =>
	z
		.object({
			$and: z.array(FilterGroupItemSchema).optional(),
			$or: z.array(FilterGroupItemSchema).optional(),
			$not: z.array(FilterGroupItemSchema).optional(),
		})
		.passthrough(),
) as z.ZodType<Filter>;
