import { z } from 'zod';
import { LocatorSchema } from './locator.ts';
import { FilterSchema } from './filter.ts';

/**
 * OrderClauseSchema
 * A single sort clause `{ path, direction }` inside `Sqo.order`.
 */
export const OrderClauseSchema = z.object({
	path: z.string(),
	direction: z.enum(['ASC', 'DESC', 'asc', 'desc']),
});

export type OrderClause = z.infer<typeof OrderClauseSchema>;

/**
 * SqoSchema / Sqo
 * Search Query Object — controls pagination, filtering, sorting and
 * projection for `dd_core_api::read`, `::read_raw` and `::count`.
 *
 * Ground truth: core/common/class.search_query_object.php (declared
 * properties) and its `sanitize_client_sqo()` gate. The schema documents the
 * client-visible fields; it stays `.passthrough()` because the PHP side
 * strips server-only keys (`sentence`, `params`, `column_sql`, `table`,
 * `table_alias`, `skip_*`, `include_negative`) itself rather than rejecting
 * unknown keys, and additional builder fields appear over time.
 *
 * Note: `section_tipo` is declared `?array` PHP-side, but client SQOs and
 * mcp-common pass a bare string too, so the wire schema accepts both.
 */
export const SqoSchema = z
	.object({
		// PHP declares `string|int|null $id` (class.search_query_object.php:106).
		id: z.union([z.string(), z.number()]).nullable().optional(),
		section_tipo: z.union([z.string(), z.array(z.string())]).optional(),
		mode: z.string().optional(),
		limit: z.union([z.number(), z.string()]).optional(),
		offset: z.number().optional(),
		total: z.number().nullable().optional(),
		filter: FilterSchema.optional(),
		filter_by_locators: z.array(LocatorSchema).optional(),
		filter_by_locators_op: z.string().optional(),
		select: z.array(z.string()).optional(),
		group_by: z.array(z.any()).optional(),
		order: z.array(OrderClauseSchema).optional(),
		tables: z.array(z.any()).optional(),
		// Declared PHP properties (class.search_query_object.php).
		allow_sub_select_by_id: z.boolean().optional(),
		children_recursive: z.boolean().optional(),
		remove_distinct: z.boolean().optional(),
		breakdown: z.boolean().optional(),
		// sanitize_client_sqo forces this to false for client requests, but the
		// field can legitimately be present (and is coerced server-side).
		parsed: z.boolean().optional(),
		full_count: z.boolean().optional(),
		// ?float, set server-side after a search (class.search_query_object.php:290).
		generated_time: z.number().nullable().optional(),
		// NOTE: allow_dataset / fixed_mode / type are NOT declared SQO properties.
		// Clients sometimes still send them; they survive via .passthrough() below.
	})
	.passthrough();

export type Sqo = z.infer<typeof SqoSchema>;
