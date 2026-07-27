<?php declare(strict_types=1);
/**
* CLASS SEARCH_RELATED
* Inverse-relation search: finds every record in the matrix that holds a locator
* pointing to one or more given source locators.
*
* This is the back-link engine of Dédalo. Where the base `search` class answers
* "which records match a forward filter?", search_related answers "which records
* link TO these targets?" — enabling relation_list components, inverse-reference
* panels, and delete-propagation to discover all upstream consumers of a record.
*
* Architecture
* ────────────
* search_related overrides only parse_sql_query(); the rest of the search
* lifecycle (set_up, search(), get_instance routing on mode='related') is
* inherited from the parent class.
*
* Instead of scanning the deeply nested `relation` JSONB column with a
* document-level GIN index, this class delegates to four PostgreSQL stored
* functions that pre-flatten the relation column into compact string arrays.
* Each function has a matching functional GIN index, turning @> containment
* queries into O(log n) index lookups:
*
*   data_relations_flat_st_si(relation)      → ["oh1_3", "es1_65", …]
*     Keyed on section_tipo + '_' + section_id.
*     Used when only a target section is known (no specific type or component).
*
*   data_relations_flat_fct_st_si(relation)  → ["oh25_oh1_3", …]
*     Keyed on from_component_tipo + '_' + section_tipo + '_' + section_id.
*     Used when the source component (the field holding the link) is also known.
*
*   data_relations_flat_ty_st_si(relation)   → ["dd151_oh1_3", …]
*     Keyed on relation-type + '_' + section_tipo + '_' + section_id.
*     Used when the semantic type of the relation is known but not the component.
*
*   data_relations_flat_ty_st(relation)      → ["dd151_oh1", …]
*     Keyed on relation-type + '_' + section_tipo (no section_id).
*     Used for coarser index-only queries that need only the type and section, not a
*     specific record (e.g. relation_index case).
*
* All four functions must exist in PostgreSQL before this class is usable.
* @see core/db/db_pg_definitions.php for the function and index DDL.
*
* Locator dispatch (switch in parse_sql_query)
* ─────────────────────────────────────────────
* For each incoming locator in sqo->filter_by_locators the switch selects the
* narrowest matching function:
*   1. No section_id + has type  → data_relations_flat_ty_st       (relation_index case)
*   2. Has from_component_tipo   → data_relations_flat_fct_st_si   (component-scoped link)
*   3. Has type + section_id     → data_relations_flat_ty_st_si    (typed, specific record)
*   4. default                   → data_relations_flat_st_si       (any link to target record)
*
* Breakdown mode
* ──────────────
* When sqo->breakdown is true the query cross-joins each row with
* jsonb_path_query(relation, '$.*[*]') so that each individual locator entry
* in the relation column becomes its own result row. This allows the caller
* (get_referenced_locators) to recover the exact locator object that matched,
* not just the owning section record. The breakdown WHERE clauses narrow the
* cross join to only the locator entries that satisfy the filter.
*
* Security
* ────────
* - Table names are restricted to common::get_matrix_tables_with_relations().
* - group_by entries are validated by regex before interpolation.
* - filter_by_locators_op is allowlisted to AND/OR.
* - All filter values go through get_placeholder() into pg_execute params.
* - ORDER BY table-alias prefixes are stripped (UNION queries have no aliases).
* - LIMIT is routed through search::sanitize_sql_limit().
*
* @package Dédalo
* @subpackage Core
* @see search             Parent class — lifecycle, set_up, search(), traits.
* @see search_query_object SQO contract — filter_by_locators, breakdown, mode.
* @see section_record::get_inverse_references()  Primary caller.
* @see relation_list::get_inverse_references()   Relation panel caller.
* @see core/db/db_pg_definitions.php             PostgreSQL function and index DDL.
*/
class search_related extends search {



	/**
	* PARSE_SQL_QUERY
	* Builds the full parameterized SQL query that locates all matrix records
	* whose `relation` column contains a link to any of the given target locators.
	*
	* The resulting query uses UNION ALL across every matrix table that carries
	* relation data, so that records stored in different tables (matrix, matrix_list,
	* matrix_hierarchy, etc.) are all returned in a single result set.
	*
	* For each target locator in sqo->filter_by_locators the method selects the
	* narrowest PostgreSQL flat-index function available (see class doc-block for
	* the dispatch rules). The flat-index approach was introduced because scanning
	* the raw `relation` JSONB with a plain GIN index was too slow on large databases.
	*
	* When sqo->breakdown is true each row is cross-joined with
	* jsonb_path_query(relation, '$.*[*]') so each individual locator entry in the
	* relation column becomes its own result row. This is required by
	* get_referenced_locators() to reconstruct the exact matching locator objects.
	*
	* All values that would otherwise be interpolated verbatim are either placed in
	* prepared-statement params (get_placeholder) or validated through allowlists.
	*
	* (!) Requires the four data_relations_flat_* PostgreSQL functions and their
	*     matching functional GIN indexes to exist in the database. If they are
	*     absent, every query in this method will result in a full-table scan or
	*     a runtime PostgreSQL error.
	*
	* @return string $sql_query - Parameterized SQL string ending with ';'.
	*     Bind values are in $this->params (0-indexed, $1..$n in the query).
	*     Returns 'SELECT NULL WHERE false;' when no valid table is available.
	*/
	public function parse_sql_query() : string {

		// tables where to search
		// Security: table names are interpolated verbatim into the FROM clause. When the
		// client SQO supplies them, restrict to the known matrix tables with relations
		// (the same set used as the default) so no arbitrary identifier can be injected.
			$ar_allowed_tables = common::get_matrix_tables_with_relations();
			$ar_tables_to_search = !empty($this->sqo->tables)
				? array_values(array_intersect((array)$this->sqo->tables, $ar_allowed_tables))
				: $ar_allowed_tables;
			if (empty($ar_tables_to_search)) {
				debug_log(__METHOD__
					." No valid tables to search (client tables not in allowed matrix tables)" . PHP_EOL
					.' sqo->tables: ' . to_string($this->sqo->tables ?? null)
					, logger::ERROR
				);
				return 'SELECT NULL WHERE false;';
			}

		// pagination
			$limit	= $this->sqo->limit ?? 10;
			$offset	= $this->sqo->offset ?? 0;

		// group_by
		// Security: group_by entries are interpolated verbatim as SQL column identifiers in
		// the SELECT and GROUP BY clauses below. They come from the client SQO and are not
		// parameterizable, so restrict each to a simple (optionally table-qualified) identifier
		// and drop anything else (sub-selects, commas, quotes, parens...).
			$group_by = $this->sqo->group_by ?? null;
			if (!empty($group_by)) {
				$group_by = array_values(array_filter((array)$group_by, static function($col){
					return is_string($col)
						&& preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/', $col)===1;
				}));
				if (count($group_by) !== count((array)$this->sqo->group_by)) {
					debug_log(__METHOD__
						." Dropped invalid group_by entries (only simple identifiers allowed)" . PHP_EOL
						.' group_by: ' . to_string($this->sqo->group_by)
						, logger::ERROR
					);
				}
				if (empty($group_by)) {
					$group_by = null;
				}
			}

		// breakdown
			$breakdown = $this->sqo->breakdown ?? false;

		// order
			$this->build_sql_query_order();

		// reference locator is the locator of the source section that will be
		// used to obtain the sections with calls to it.
			$ar_locators = $this->sqo->filter_by_locators ?? [];

		// filter by locators operator.
		// Security: interpolated verbatim between WHERE clauses; allowlist to AND/OR.
			$raw_locators_op = strtoupper(trim((string)($this->sqo->filter_by_locators_op ?? 'OR')));
			$filter_by_locators_op = in_array($raw_locators_op, ['AND','OR'], true)
				? $raw_locators_op
				: 'OR';

		// add filter of sections when the filter is not 'all', it's possible add specific section to get the related records only for these sections.
		// If the section has 'all', the filter don't add any section to the WHERE sentence.
			$section_filter = false;
			if (!empty($this->ar_section_tipo)) {
				$current_placeholders = [];
				foreach ($this->ar_section_tipo as $current_section_tipo) {
					if ($current_section_tipo ==='all') {
						continue;
					}

					// placeholder like $1, $2, ...
					$placeholder = $this->get_placeholder($current_section_tipo);

					$current_placeholders[] = $placeholder;
				}
				if (!empty($current_placeholders)) {
					$section_filter = 'section_tipo IN(' . implode(',', $current_placeholders) .')';
				}
			}

		// Per-table query fragments — combined later with UNION ALL.
		// Building one SELECT per table and UNIONing avoids cross-table JOINs while
		// still returning results from all relation-bearing matrix tables in one round-trip.
			$ar_query = array();
			foreach ($ar_tables_to_search as $table) {

				$query	 = '';

				// SELECT
				$query .= 'SELECT ';

				// add group_by
				// every concept need to be separated by commas
				$query .= !empty($group_by)
					? PHP_EOL . implode(', ', $group_by).', '
					: '';

				// add full count when is set
				// else get the row
				// In breakdown mode the third selected column is 'locator_data' rather
				// than 'relation', because the cross join already expanded each locator
				// entry into its own row (see cross-join below). The caller receives
				// individual locator objects instead of the whole relation blob.
				$query .= (isset($this->sqo->full_count) && $this->sqo->full_count===true)
					? 'COUNT(*) as full_count'
					: ( $breakdown===true
						? 'section_tipo, section_id, locator_data'
						: 'section_tipo, section_id, relation');

				// add regular sql_obj->select
				if (!empty($this->sql_obj->select)) {
					$query .= ',' . implode(',', $this->sql_obj->select );
				}

				// FROM
				$query .= PHP_EOL . 'FROM "'.$table.'"';

				// Breakdown cross-join
				// jsonb_path_query(relation, '$.*[*]') unnests every array element under
				// every key of the relation JSONB object. Each result row then represents
				// a single locator entry. The WHERE clauses below further filter these
				// rows to only the entries that match the requested filter_by_locators.
				// The older jsonb_array_elements(relation->'relations') alternative (left
				// commented in the line below) assumed a fixed 'relations' key that does
				// not exist in v7 — the v7 relation column is keyed by component_tipo.
				if( $breakdown===true ){
					$query .= PHP_EOL;
					// $query .= 'cross join jsonb_array_elements( relation->\'relations\' ) as locator_data';
					$query .= 'cross join jsonb_path_query(relation, \'$.*[*]\') as locator_data';
				}

				// Locator filter clauses — one per incoming filter locator.
				// The switch dispatches to the appropriate flat-index function based on
				// which locator properties are present. All values are bound via params.
				$locators_query = [];
				foreach ($ar_locators as $locator) {

					switch (true) {

						case !isset($locator->section_id) && isset($locator->type):
							// relation index case
							// No section_id is present: the caller knows the relation type and the
							// target section_tipo but not a specific record. Use the coarser
							// data_relations_flat_ty_st index (type_section_tipo only).
							// Flat index key format: "<type>_<section_tipo>" e.g. "dd151_oh1".
							$locator_index = $locator->type.'_'.$locator->section_tipo;
							$param_value = '['. json_encode($locator_index) . ']';
							$placeholder = $this->get_placeholder($param_value);
							$sql = PHP_EOL.'data_relations_flat_ty_st(relation) @> '.$placeholder.'::jsonb';
							// breakdown
							if( $breakdown===true ){
								// type
								$param_value = $locator->type;
								$placeholder = $this->get_placeholder($param_value);
								$sql .= PHP_EOL." AND locator_data->>'type' = $placeholder::text";

								// section_tipo
								$param_value = $locator->section_tipo;
								$placeholder = $this->get_placeholder($param_value);
								$sql .= PHP_EOL." AND locator_data->>'section_tipo' = $placeholder::text";
							}
							$locators_query[] = $sql;
							break;

						case isset($locator->from_component_tipo):
							// Component-scoped link case.
							// The caller knows exactly which component field holds the link, enabling
							// the narrowest possible index hit via data_relations_flat_fct_st_si.
							// Flat index key format: "<from_component_tipo>_<section_tipo>_<section_id>"
							// e.g. "oh25_oh1_3".
							$base_flat_locator = locator::get_term_id_from_locator($locator);
							$locator_index = $locator->from_component_tipo.'_'.$base_flat_locator;
							$param_value = '['. json_encode($locator_index) . ']';
							$placeholder = $this->get_placeholder($param_value);
							$sql = PHP_EOL.'data_relations_flat_fct_st_si(relation) @> '.$placeholder.'::jsonb';
							// breakdown
							if( $breakdown===true ){
								// from_component_tipo
								$param_value = $locator->from_component_tipo;
								$placeholder = $this->get_placeholder($param_value);
								$sql .= PHP_EOL." AND locator_data->>'from_component_tipo' = $placeholder::text";

								// section_tipo
								$param_value = $locator->section_tipo;
								$placeholder = $this->get_placeholder($param_value);
								$sql .= PHP_EOL." AND locator_data->>'section_tipo' = $placeholder::text";

								// section_id
								$param_value = $locator->section_id;
								$placeholder = $this->get_placeholder($param_value);
								$sql .= PHP_EOL." AND locator_data->>'section_id' = $placeholder::text";
							}
							$locators_query[] = $sql;
							break;

						case isset($locator->type):
							// Typed link to a specific record.
							// The locator has both a semantic type and a fully resolved target
							// (section_tipo + section_id). Use data_relations_flat_ty_st_si.
							// Flat index key format: "<type>_<section_tipo>_<section_id>"
							// e.g. "dd151_oh1_3".
							$base_flat_locator = locator::get_term_id_from_locator($locator);
							$locator_index = $locator->type.'_'.$base_flat_locator;
							$param_value = '['. json_encode($locator_index) . ']';
							$placeholder = $this->get_placeholder($param_value);
							$sql = PHP_EOL.'data_relations_flat_ty_st_si(relation) @> '.$placeholder.'::jsonb';
							if( $breakdown===true ){
								// type
								$param_value = $locator->type;
								$placeholder = $this->get_placeholder($param_value);
								$sql .= PHP_EOL." AND locator_data->>'type' = $placeholder::text";

								// section_tipo
								$param_value = $locator->section_tipo;
								$placeholder = $this->get_placeholder($param_value);
								$sql .= PHP_EOL." AND locator_data->>'section_tipo' = $placeholder::text";

								// section_id
								$param_value = $locator->section_id;
								$placeholder = $this->get_placeholder($param_value);
								$sql .= PHP_EOL." AND locator_data->>'section_id' = $placeholder::text";
							}
							$locators_query[] = $sql;
							break;

						default:
							// Plain section link — no type, no component scope.
							// The most common case: find every row that links to a specific
							// target section record regardless of the component or relation type.
							// Uses the broadest flat index: data_relations_flat_st_si.
							// Flat index key format: "<section_tipo>_<section_id>" e.g. "oh1_3".
							$base_flat_locator = locator::get_term_id_from_locator($locator);
							$param_value = '['. json_encode($base_flat_locator) . ']';
							$placeholder = $this->get_placeholder($param_value);
							$sql = PHP_EOL.'data_relations_flat_st_si(relation) @> '.$placeholder.'::jsonb';
							// breakdown
							if( $breakdown===true ){
								// section_tipo
								$param_value = $locator->section_tipo;
								$placeholder = $this->get_placeholder($param_value);
								$sql .= PHP_EOL." AND locator_data->>'section_tipo' = $placeholder::text";

								// section_id
								$param_value = $locator->section_id;
								$placeholder = $this->get_placeholder($param_value);
								$sql .= PHP_EOL." AND locator_data->>'section_id' = $placeholder::text";
							}
							$locators_query[] = $sql;
							break;
					}
					// Note: the previous model searched the relations jsonb directly with a GIN
					// index but was slow on large databases; tables now carry a flat contraction
					// of the locator (section_tipo + section_id) that is indexed for fast lookup.
				}//end foreach ($ar_locators as $locator)

				$where_clauses = [];
				if (!empty($locators_query)) {
					// Combine all locator clauses with the operator from filter_by_locators_op
					// (default OR). OR means "match any of the given targets"; AND means the
					// row must link to ALL listed targets simultaneously (multi-link filter).
					$where_clauses[] = '(' . implode(' '.$filter_by_locators_op.' ', $locators_query) . ')';
				}

				if ($section_filter!==false) {
					$where_clauses[] = '(' . $section_filter . ')';
				}

				// WHERE
				if (!empty($where_clauses)) {
					$query .= PHP_EOL . 'WHERE ' . implode(' AND ', $where_clauses);
				}

				// group by
				// when is set use GROUP BY clause
				$query .= !empty($group_by)
					? PHP_EOL . 'GROUP BY '.implode(', ', $group_by)
					: '';

				$ar_query[] = $query;
			}

		// final query union with all tables
			$str_query = implode(PHP_EOL .'UNION ALL ', $ar_query);

		// establish order to maintain stable results
		// count and pagination are optional
			if(empty($this->sqo->full_count)) {

				// $str_query .= !empty($this->sql_obj->order)
				// 	? PHP_EOL . 'ORDER BY ' . implode( PHP_EOL, $this->sql_obj->order )
				// 	: PHP_EOL . 'ORDER BY section_tipo, section_id ASC';

				// order (use custom order if available, otherwise use default)
				// Remove table aliases from ORDER BY since UNION queries don't have table aliases
				// The alias prefix (e.g. 'all.section_id') is added by build_sql_query_order()
				// for single-table queries where the table is aliased. UNION queries expose no
				// alias, so the prefix must be stripped here to avoid a PostgreSQL syntax error.
				$order_clauses = !empty($this->sql_obj->order)
					? $this->sql_obj->order
					: $this->sql_obj->order_default;

				$order_clauses_clean = array_map(function($order_clause) {
					// Remove table alias prefix (e.g., 'all.section_id' -> 'section_id')
					return preg_replace('/^[a-z0-9_]+\./', '', $order_clause);
				}, $order_clauses);

				$str_query .= PHP_EOL . 'ORDER BY ' . implode( ', ', $order_clauses_clean );

				// limit (coerced; 'all' sentinel preserved). Defense in depth: do not
				// interpolate a raw value even though client SQO is scrubbed upstream.
				$limit_sql = search::sanitize_sql_limit($limit);
				if($limit_sql !== null){
					$str_query .= PHP_EOL . 'LIMIT '.$limit_sql;
				}

				// offset
				$offset_int = (int)$offset;
				if($offset_int > 0){
					$str_query .= PHP_EOL . 'OFFSET '.$offset_int;
				}
			}

		$str_query .= ';';


		return $str_query;
	}//end parse_sql_query



	/**
	* GET_REFERENCED_LOCATORS
	* Returns every locator object that points to any of the given target locators,
	* across all matrix tables. This is the "inverse reference" resolver: given a
	* set of source locators (the targets), it finds every record that holds a back-link
	* to those targets.
	*
	* The method builds an SQO with mode='related' and breakdown=true, then executes
	* the search via the inherited search::get_instance() + search() pipeline. Because
	* breakdown=true is set, the database query cross-joins each row with its individual
	* locator entries. Each result row therefore represents one specific locator in one
	* specific record, not the whole record.
	*
	* The returned locator objects are enriched with two extra properties that are not
	* stored in the relation column but are required by callers that need to construct
	* component instances (e.g. section_record::remove_all_inverse_references):
	*   - from_section_tipo  — the section_tipo of the record that holds the link
	*   - from_section_id    — the section_id  of the record that holds the link
	*   - from_component_tipo — already present in the locator_data when the relation
	*                           was stored by a relation component; remains intact.
	*
	* Contract
	* ────────
	* - Returns an empty array if no records reference the given targets.
	* - $count parameter is accepted for API symmetry but currently unused; full_count
	*   is always false (breakdown mode is incompatible with COUNT(*)).
	* - $target_section defaults to ['all'], meaning results are returned from every
	*   matrix table. Pass a specific section_tipo array to narrow the result set.
	*
	* @param array $filter_locators
	*   One or more locator objects, each with at minimum section_tipo and section_id.
	*   Optional properties (type, from_component_tipo) activate narrower flat-index functions.
	* @param int|null $limit [= null] - Result limit; null means no limit is applied to the query.
	* @param int|null $offset [= null] - Result offset for pagination; null defaults to 0.
	* @param bool $count [= false] - Currently unused; reserved for future full_count support.
	* @param array $target_section [= ['all']] - Section tipos to restrict the result set.
	*   'all' (the default sentinel) returns results from all matrix tables with relations.
	* @return array $ar_inverse_locators - Array of stdClass locator objects enriched with
	*   from_section_tipo and from_section_id. Empty when no inverse references exist.
	* @see section_record::get_inverse_references()   Primary consumer.
	* @see relation_list::get_inverse_references()    Relation panel consumer.
	*/
	public static function get_referenced_locators( array $filter_locators, ?int $limit=null, ?int $offset=null, bool $count=false, array $target_section=['all'] ) : array {
		$start_time = start_time();

		// new way done in relations field with standard sqo
		// Build a minimal SQO wired for inverse-relation discovery:
		//   mode='related'  → search::get_instance() routes to this class
		//   breakdown=true  → the SQL cross-joins relation entries so each row is one locator
			$sqo = new search_query_object();
				$sqo->set_section_tipo($target_section);
				$sqo->set_mode('related');
				$sqo->set_full_count(false);
				$sqo->set_limit($limit);
				$sqo->set_offset($offset);
				$sqo->set_filter_by_locators($filter_locators);
				$sqo->set_breakdown(true);

			$search		= search::get_instance($sqo);
			$db_result	= $search->search();

			// Note that row relations contains all relations and not just searched, because we need
			// to filter the relationship array for each record to get only the desired matches

		// debug
			if(SHOW_DEBUG===true) {
				$total_records	= $db_result->row_count();
				$time_ms		= exec_time_unit($start_time, 'ms');
				debug_log(__METHOD__
					. " Calculated referenced_locators step 1 (total: $total_records)" . PHP_EOL
					. ' reference_locator: ' . to_string($filter_locators) . PHP_EOL
					. ' time: ' . $time_ms .' ms' . PHP_EOL
					.' backtrace_sequence: ' . to_string( array_reverse(get_backtrace_sequence()) )
					, logger::DEBUG
				);
			}

		$ar_inverse_locators = [];

		// Reconstruct enriched locator objects from the breakdown rows.
		// Each $row->locator_data is the raw JSON of one locator entry from the
		// relation column. We decode it and attach the owning record's section_tipo
		// and section_id so callers can instantiate the component that holds the link.
		foreach ($db_result as $row) {

			$current_locator = json_decode($row->locator_data);

			// Add some temporal info to current locator for build component later
			$current_locator->from_section_tipo	= $row->section_tipo;
			$current_locator->from_section_id	= $row->section_id;
			// Note that '$current_locator' contains 'from_component_tipo' property, useful for know when component is called
			$ar_inverse_locators[] = $current_locator;
		}

		// debug
			debug_log(__METHOD__
				. ' Calculated referenced_locators step 2 (total: ' .count($ar_inverse_locators). ')' . PHP_EOL
				. ' filter_locators: ' . to_string($filter_locators) . PHP_EOL
				. ' time: ' . exec_time_unit($start_time, 'ms').' ms'
				// . ' - memory: ' .dd_memory_usage()
				, logger::DEBUG
			);


		return $ar_inverse_locators;
	}//end get_referenced_locators



}//end class search_related
