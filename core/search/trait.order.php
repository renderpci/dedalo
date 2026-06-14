<?php declare(strict_types=1);
/**
* TRAIT ORDER
* ORDER BY clause builder for Dédalo v7 search queries.
*
* Mixed into the `search` class (and its sub-classes `search_tm`, `search_related`) to
* provide the two-phase ordering strategy used by `parse_sql_default()`.
*
* DUAL-ARRAY ORDERING STRATEGY
* =============================
* Two separate arrays on `$this->sql_obj` carry ORDER BY fragments:
*
* 1. `sql_obj->order`  — custom, user-supplied sort criteria.
*    - Populated by `build_sql_query_order()` when `$this->sqo->order` is present.
*    - Each entry is a fully formed ORDER BY expression (alias + direction).
*    - Applied to the outer wrapper query so final pagination reflects the
*      caller's sort intent.
*
* 2. `sql_obj->order_default`  — deterministic tie-breaker, always populated.
*    - Populated by `build_sql_query_order_default()`, which is always called at
*      the end of `build_sql_query_order()`.
*    - Defaults to `<main_alias>.section_id ASC` for ordinary sections, and
*      `<main_alias>.section_id DESC` for the activity log section
*      (DEDALO_ACTIVITY_SECTION_TIPO = 'dd542'), where newest-first is conventional.
*    - Used by the inner DISTINCT ON subquery (which requires a matching ORDER BY
*      to disambiguate duplicate section_ids across JOINed rows) and as the outer
*      ORDER BY when no custom order was requested.
*
* EXECUTION SEQUENCE inside `parse_sql_default()`
* ================================================
*   1. build_main_from_sql()      — establishes base FROM and table aliases
*   2. build_sql_query_select()   — builds SELECT columns
*   3. build_sql_query_order()    — builds ORDER (calls order_default internally)
*   4. build_main_where()         — builds WHERE clauses
*
* WINDOW / SUBQUERY PATTERN
* =========================
* When JOINs or a custom ORDER are present, `parse_sql_default()` wraps the query in
* a window/subquery:
*   - Inner query: `ORDER BY order_default`  (needed by DISTINCT ON)
*   - Outer query: `ORDER BY order`  (custom) or `order_default` (fallback)
*
* This ensures DISTINCT ON semantics are correct (the grouped column must appear
* first in ORDER BY) while the caller's requested sort order is still honoured on
* the final result set, making pagination stable.
*
* COMPONENT-BASED ORDERING
* ========================
* When `$order_obj->path` does not resolve to a direct table column, the trait:
*   1. Calls `build_sql_join($path)` (in trait.where.php) to LEFT JOIN the related
*      matrix table under an alias derived from the path steps.
*   2. Resolves the component model class name via `ontology_node::get_model_by_tipo()`.
*   3. Looks up the JSONB column (e.g. 'string', 'integer') from
*      `section_record_data::$column_map[$model]`.
*   4. Delegates to the component model's static `build_order_select()` which
*      emits a `jsonb_path_query_first(…) #>> '{}'` expression — this extracts a
*      scalar sort key from the JSONB dato array, applying language filtering when
*      the component is translatable (DEDALO_DATA_LANG) or using the non-language
*      marker (DEDALO_DATA_NOLAN = 'lg-nolan') for language-neutral components.
*   5. Adds the generated expression to `sql_obj->select` under an alias
*      (`<component_tipo>_order`), and references that alias in ORDER BY.
*
* FOUR ORDER ENTRY CASES (handled by build_sql_query_order)
* ==========================================================
* a) `$end_path->column_sql` is set  — trusted server-built SQL fragment (e.g. date
*    components with complex expressions). Never sourced from HTTP client SQO.
* b) `$end_path->column` is set      — simple direct column name; strict identifier
*    regex applied to prevent SQL injection.
* c) `$component_tipo` is a member of `search::$ar_direct_columns`
*    (section_id, section_tipo, id)   — raw column reference, no alias.
* d) default                          — component dato via JOIN + build_order_select().
*
* SECURITY NOTES
* ==============
* - `$order_obj->direction` is user-supplied and allowlisted against ['ASC','DESC']
*   before concatenation into ORDER BY.
* - `$component_tipo` is validated: must be either a known direct column or match
*   the `^[a-z]+[0-9]+$` pattern (enforced by `search::trim_tipo()`).
* - `$end_path->column` is allowlisted against `/^[a-zA-Z_][a-zA-Z0-9_]*$/` before
*   use as a column reference.
* - `$end_path->column_sql` is treated as a trusted server-side fragment and must
*   NOT be accepted from the HTTP API SQO.
*
* SEARCH MODE VARIATIONS
* ======================
* - `search` (default):  full support for all four cases above.
* - `search_tm`:  overrides `build_sql_query_order_default()` to use `timestamp DESC`
*   instead of the section_id-based default; custom ordering is handled by calling
*   `parent::build_sql_query_order()`.
* - `search_related`:  inherits the base trait behaviour unchanged.
*
* @see search::parse_sql_default()      consumer that assembles the SQL fragments
* @see trait.where.php::build_sql_join  join builder called for component ordering
* @see trait.select.php                 select trait whose array is extended here
* @see component_common::build_order_select  baseline JSONB sort expression builder
* @see section_record_data::$column_map  model → JSONB column registry
*
* @package Dédalo
* @subpackage Core
*/
trait order {



	/**
	* BUILD_SQL_QUERY_ORDER
	* Translates `$this->sqo->order` entries into SQL ORDER BY fragments and, where
	* necessary, companion SELECT expressions.
	*
	* For each entry in the SQO order array:
	* - Resolves the sort direction (allowlisted to 'ASC' | 'DESC').
	* - Validates `component_tipo` against known direct columns or the tipo regex.
	* - Dispatches to one of four case handlers (column_sql / column / direct / default).
	* - For the default (component dato) case: ensures the relevant matrix table is
	*   LEFT JOINed, then calls the model's static `build_order_select()` to produce
	*   a `jsonb_path_query_first` scalar expression, language-filtered when appropriate.
	* - Appends `NULLS LAST` to the combined expression and always adds `section_id ASC`
	*   as an explicit tie-breaker when the primary sort does not already reference it.
	* - Always finishes by calling `build_sql_query_order_default()` to populate
	*   `sql_obj->order_default` regardless of whether custom order was present.
	*
	* Side effects:
	* - May append entries to `$this->sql_obj->select` (sort expressions as aliases).
	* - Appends to `$this->sql_obj->order` when custom order entries are processed.
	* - Always appends to `$this->sql_obj->order_default` via the nested call.
	* - May create JOIN entries in `$this->sql_obj->join` via `build_sql_join()`.
	*
	* @return void
	*/
	public function build_sql_query_order() : void {

		$sql_query_order = '';
		if (!empty($this->sqo->order)) {

			// Accumulate one ORDER BY expression per SQO order entry before joining.
				$ar_order = [];
				foreach ($this->sqo->order as $order_obj) {

					// direction. Allowlist (security: $order_obj->direction is user-supplied;
					// without this gate any string would be concatenated into ORDER BY as raw SQL).
					$raw_direction = strtoupper(trim((string)($order_obj->direction ?? 'ASC')));
					$direction = in_array($raw_direction, ['ASC','DESC'], true)
						? $raw_direction
						: 'ASC';

					$path			= $order_obj->path;
					$end_path		= end($path);
					$component_tipo	= $end_path->component_tipo;
					$column			= $end_path->column ?? null; // special optional full definition column (e.g. date)
					$column_sql		= $end_path->column_sql ?? null;

					// component_tipo validation (security: $component_tipo is user-supplied and
					// flows into select/order aliases). It must either be a direct column
					// (e.g. 'id', 'section_id') or a real component tipo (`^[a-z]+[0-9]+$`).
					$is_direct_column = in_array($component_tipo, search::$ar_direct_columns, true);
					if (!$is_direct_column && self::trim_tipo((string)$component_tipo) === null) {
						debug_log(__METHOD__
							." Ignored order entry with invalid component_tipo " . PHP_EOL
							.' component_tipo: ' . to_string($component_tipo)
							, logger::ERROR
						);
						continue;
					}

					if( isset($column_sql) ) {

						// SEC-036 follow-up: trusted server-built SQL fragment. Skip the
						// strict identifier regex because the value legitimately contains
						// jsonb-path/operators/parens. Only set this from server-side
						// builders that have already validated their interpolated tipos
						// and integer-cast their ids; HTTP API SQO must NOT carry this
						// field.
						$alias = $component_tipo . '_order';
						$select_sentence = (string)$column_sql . ' as ' . $alias;
						$this->sql_obj->select[] = $select_sentence;
						$order_sentence = $alias . ' ' . $direction;

					}else if( isset($column) ) {

						// column case. Special optional full definition column (e.g. date, section_id).
						//
						// Security: $column is read straight from the user-supplied SQO path object
						// (`$end_path->column`), so it MUST be a strict simple SQL identifier. The previous
						// denylist tolerated SELECT/parens-wrapped sub-queries (e.g. "(SELECT pg_sleep(5))")
						// which do not contain UNION/DROP/etc keywords. Allowlist-only fixes that.
						$column_str = (string)$column;
						if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $column_str)) {
							debug_log(__METHOD__
								." Ignored order entry with non-identifier column name " . PHP_EOL
								.' column: ' . to_string($column)
								, logger::ERROR
							);
							continue;
						}

						$alias = $component_tipo . '_order';

						// Add to select columns
						$select_sentence = $column_str . ' as ' . $alias; // add alias name;
						$this->sql_obj->select[] = $select_sentence;

						// Order sentence
						$order_sentence = $alias . ' ' . $direction;

					}else if (true===in_array($component_tipo, search::$ar_direct_columns)) {

						// direct column case
						// The component_tipo is one of 'section_id', 'section_tipo', or 'id' —
						// a bare column already present in the matrix table row; no JOIN or SELECT
						// alias is required.

						$column = $component_tipo;

						// Order sentence
						$order_sentence = $column . ' ' . $direction;

					}else{

						// default case: order by a component's dato stored in a JSONB column.
						// Requires a LEFT JOIN to reach the component row, then a jsonb_path_query
						// expression to extract a scalar sort key from the dato array.

						// Add join if not exists
						// (!) build_sql_join may return null when the matrix table is unresolvable;
						// fall back to the main alias so ordering degrades gracefully rather than
						// producing broken SQL.
						$table_name = $this->build_sql_join($path);
						if(empty($table_name)) {
							$table_name = $this->main_section_tipo_alias;
						}

						// Resolve the PHP model class name for the component tipo so we can look up
						// the correct JSONB column (e.g. 'string' vs 'integer') and delegate to the
						// model's own build_order_select() implementation.
						$model = $order_obj->model ?? ontology_node::get_model_by_tipo($component_tipo);
						$column = section_record_data::$column_map[$model] ?? null;

						$alias = $component_tipo . '_order';

						// Language selection: translatable components store one dato per language
						// inside the JSONB array (lang='lg-spa' etc.), so we filter by DEDALO_DATA_LANG.
						// Non-translatable components use the sentinel 'lg-nolan' (DEDALO_DATA_NOLAN).
						$lang = $order_obj->lang ??
							(ontology_node::get_translatable($component_tipo) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN);

						// build_order_select. Each model could have its own custom builder or use component common.
						// E.g.:
						// jsonb_path_query_first(
						// 	rs197_rs279_dd64.string->'dd62',
						// 	'$[*] ? (@.lang == \$lang).value',
						// 	'{"lang": "lg-spa"}'
						// ) #>> '{}' AS sort_val  -- expose sort column
						$select_sentence = $model::build_order_select((object)[
							'matrix_table'		=> $this->matrix_table,
							'table_name'		=> $table_name,
							'column'			=> $column,
							'lang'			 	=> $lang,
							'component_tipo'	=> $component_tipo,
							'alias'			 	=> $alias
						]);

						// Add to select columns
						$this->sql_obj->select[] = $select_sentence;

						// Order sentence. Using the alias defined for select (using window in parse_sql_default)
						$order_sentence = $alias . ' ' . $direction;
					}

					// line add
					$ar_order[] = $order_sentence;
				}

			// flat SQL sentences array
			$sql_query_order = implode(',', $ar_order);

			// NULLS LAST + tie-breaker
			// Append NULLS LAST so rows with no dato value sink to the bottom rather than
			// rising to the top (PostgreSQL default for ASC). Also append 'section_id ASC'
			// as an explicit tie-breaker when the primary sort does not already reference
			// section_id, making pagination stable across identical sort keys.
			if (!empty($sql_query_order)) {
				$sql_query_order .= ' NULLS LAST';
				if (strpos($sql_query_order, 'section_id')===false) {
					$sql_query_order .= ', section_id ASC';
				}
			}

			// Deduplicate: avoid adding the same expression twice if this method is
			// called more than once on the same search instance.
			if (!empty($sql_query_order) && !in_array($sql_query_order, $this->sql_obj->order)) {
				$this->sql_obj->order[] = $sql_query_order;
			}
		}

		// default order
		// Always build the default order so sql_obj->order_default is populated for the
		// inner DISTINCT ON query regardless of whether custom ordering was requested.
		$this->build_sql_query_order_default();
	}//end build_sql_query_order



	/**
	* BUILD_SQL_QUERY_ORDER_DEFAULT
	* Appends a deterministic fallback ORDER BY expression to `$this->sql_obj->order_default`.
	*
	* The expression is `<main_alias>.section_id ASC` for all ordinary sections, or
	* `<main_alias>.section_id DESC` for the activity log section
	* (DEDALO_ACTIVITY_SECTION_TIPO = 'dd542'), where newest records should surface first.
	*
	* This method is always called (even when a custom order exists) because
	* `sql_obj->order_default` is consumed by the inner DISTINCT ON subquery inside
	* `parse_sql_default()`. DISTINCT ON in PostgreSQL requires its grouping column to
	* appear first in ORDER BY; without this expression the inner query would be
	* syntactically invalid whenever a JOIN is present.
	*
	* When `SHOW_DEBUG` is true, a `-- default order` SQL comment is appended to make
	* the generated query easier to trace in logs.
	*
	* Sub-classes may override this method (e.g. `search_tm` uses `timestamp DESC`).
	*
	* @return void
	*/
	public function build_sql_query_order_default() : void {

		// default order
		// Activity section (dd542) is an append-only log; reverse chronological (DESC)
		// is the natural read order, so we flip the default direction for it alone.
		$section_tipo				= $this->main_section_tipo;
		$default_order				= ($section_tipo===DEDALO_ACTIVITY_SECTION_TIPO) ? 'DESC' : 'ASC';
		$sql_query_order_default	= $this->main_section_tipo_alias.'.section_id '.$default_order;

		$sentence = SHOW_DEBUG
			? $sql_query_order_default . ' -- default order'
			: $sql_query_order_default;

		// Deduplicate: guard against double-registration if the method is invoked more
		// than once on the same instance (e.g. from a sub-class that calls parent).
		if (!in_array($sentence, $this->sql_obj->order_default)) {
			$this->sql_obj->order_default[] = $sentence;
		}
	}//end build_sql_query_order_default



}//end order