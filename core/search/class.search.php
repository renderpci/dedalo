<?php declare(strict_types=1);
include_once 'trait.select.php';
include_once 'trait.from.php';
include_once 'trait.where.php';
include_once 'trait.order.php';
include_once 'trait.count.php';
include_once 'trait.utils.php';
/**
* CLASS SEARCH
* Central SQL query builder for Dédalo's search subsystem. Translates a
* Search Query Object (SQO) into a parameterized PostgreSQL statement executed
* against the JSONB matrix tables.
*
* Architecture overview
* ---------------------
* The SQO is a Mango/CouchDB-style filter DTO (`search_query_object`) that
* describes what to retrieve. It travels from the client-side JS search widget
* through `sanitize_client_sqo` (the only untrusted gateway, in the HTTP API),
* then into `search::get_instance($sqo)`, which dispatches to one of three
* builder classes by `$sqo->mode`:
*
*   - search          — default list/edit mode; this class
*   - search_tm       — time-machine (matrix_time_machine); extends search
*   - search_related  — cross-table relation search; extends search
*
* The builder is organized into six traits, each owning a clause family:
*
*   - trait.select.php  — SELECT column projection
*   - trait.from.php    — FROM clause + table alias
*   - trait.where.php   — WHERE fragments (main, filter, join, projects/ACL)
*   - trait.order.php   — ORDER BY (custom + default)
*   - trait.count.php   — COUNT(*) wrapper for pagination totals
*   - trait.utils.php   — shared helpers (trim_tipo, get_placeholder, validators, …)
*
* Two-phase parse
* ---------------
* 1. `parse_sqo()` — "conform" phase: dispatches every filter/select/order item
*    to its component model (`$model::get_search_query()`), which returns a
*    `{sentence, params}` shape with named token placeholders (`_Q1_`, `_Q2_`…).
*    After this phase `$this->sqo->parsed = true`.
*
* 2. SQL build — `parse_sql_default()` / `parse_sql_full_count()` /
*    `parse_sql_filter_by_locators()` populate `$this->sql_obj` by calling the
*    trait methods in the order: FROM → SELECT → ORDER → WHERE. This order is
*    load-bearing: ORDER runs before WHERE because component-based ordering calls
*    `build_sql_join()`, which must see the base FROM alias already established.
*
* Prepared parameters
* -------------------
* `$this->params` is a 0-indexed positional list of bound values fed to
* `pg_execute`. `get_placeholder()` (trait.utils.php) deduplicates using strict
* comparison so distinct typed values never collapse. `_Q1_` tokens in leaf
* sentences are swapped to `$1`/`$2`… by `parse_search_object_sql()`.
*
* Security gates
* --------------
* `conform_filter()` validates every `section_tipo`, `component_tipo`, and `lang`
* in incoming path steps before any model dispatch (the only place single-level
* paths are reachable). `build_sql_join()` (trait.where.php) re-validates its
* multi-level join keys. Direct-column identifiers, ORDER direction, and
* `column_format_parser` operators are checked against explicit allowlists. Any
* value that cannot be parameterized must pass through one of these validators or
* be server-side in origin.
*
* Relationships
* -------------
* Extended by: search_tm, search_related.
* Traits used: select, from, where, order, count, utils.
* Called by: virtually every code path that needs to retrieve section records —
*   section::get_records_data(), dd_core_api, tools, component resolvers, …
*
* @package Dédalo
* @subpackage Core
*/
class search {

	// traits. Files added to current class file to split the large code.
	use select, from, where, order, count, utils;

	/**
	* The Search Query Object being processed by this instance.
	* Populated in set_up() from the caller-supplied SQO (cloned to prevent
	* mutation of the caller's copy). Mutated during the two-phase parse:
	* `parsed` is set to true after conform, and `total` is written back
	* after a count or children_recursive search.
	* @var object $sqo
	*/
	protected object $sqo;

	/**
	* Intermediate SQL clause container built during parse_sql_* methods.
	* Each property holds an array of SQL string fragments for one clause family:
	*   - select        : column projection expressions
	*   - from          : base table(s) in the FROM clause
	*   - join          : LEFT JOIN … ON … blocks added by build_sql_join()
	*   - main_where    : fixed structural predicates (section_tipo equality, root user guard)
	*   - where         : dynamic filter/ACL predicates assembled by the where-trait methods
	*   - order         : custom ORDER BY expressions from sqo->order
	*   - order_default : fallback ORDER BY (section_id ASC/DESC for activity section)
	*   - limit         : LIMIT n (built by build_limit_offset_sql())
	*   - offset        : OFFSET n (built by build_limit_offset_sql())
	* Initialized in set_up(). Never share this object between search instances.
	* @var object $sql_obj
	*/
	protected object $sql_obj;

	/**
	* Tables whose rows must NOT be filtered by user project membership.
	* These are system/administrative matrix tables that have no project
	* association column and should always be fully visible to any authenticated
	* user. Checked in set_up() to auto-set sqo->skip_projects_filter=true.
	* @var array $ar_tables_skip_projects
	*/
	// Set skip_projects_filter. Default is false
	private static array $ar_tables_skip_projects = [
		'matrix_list',
		'matrix_dd',
		'matrix_hierarchy',
		'matrix_hierarchy_main',
		'matrix_langs',
		'matrix_tools',
		'matrix_stats',
		'matrix_notes'
	];

	/**
	* Column names that map directly to physical matrix table columns and can
	* appear verbatim in ORDER BY / SELECT without a JOIN. Used by
	* build_sql_query_order() to distinguish "direct" orderings (e.g. by
	* `section_id`) from component-based orderings that need a join + jsonb
	* extraction.
	* @var array $ar_direct_columns
	*/
	// ar_direct_columns. Useful to calculate efficient order sentences
	public static array $ar_direct_columns = ['section_id','section_tipo','id'];

	/**
	* All section tipos the query spans. Derived from sqo->section_tipo in
	* set_up(). Always an array; may contain more than one entry when querying
	* across multiple heterogeneous sections (e.g. thesaurus multi-section
	* autocomplete), in which case build_union_query() produces a UNION ALL.
	* @var array $ar_section_tipo
	*/
	// ar_section_tipo : array
	public array $ar_section_tipo;

	/**
	* The first (primary) section tipo — reset($this->ar_section_tipo).
	* Used as the canonical section for main_where, projects filter, and
	* the default ORDER BY direction (activity section sorts DESC).
	* @var string $main_section_tipo
	*/
	// main_section_tipo : string
	public string $main_section_tipo;

	/**
	* Short SQL alias for the main table. Derived from trim_tipo() when there is
	* exactly one section tipo (e.g. 'oh1' → 'oh1'), or forced to 'mix' when
	* multiple sections are queried. Used throughout the builder as the alias
	* prefix in all clause fragments (e.g. `mix.section_id`, `oh1.relation`).
	* @var string $main_section_tipo_alias
	*/
	// main_section_tipo_alias : string
	public string $main_section_tipo_alias;

	/**
	* Monotonic counter used to give each multi-step filter clause a unique join
	* alias namespace, so same-path clauses get independent joins (cross-record AND/OR).
	* @var int $join_counter
	*/
	public int $join_counter = 0;

	/**
	* Primary PostgreSQL matrix table name (e.g. 'matrix_default', 'matrix_list').
	* Resolved in set_up() from the first resolvable entry in $ar_section_tipo via
	* `common::get_matrix_table_from_tipo()`. search_tm fixes this to
	* 'matrix_time_machine' directly on the subclass property.
	* @var string $matrix_table
	*/
	// matrix_table : string
	protected string $matrix_table;

	/**
	* Resolved matrix table names for each entry in $ar_section_tipo.
	* Populated by build_union_query() only when more than one distinct table
	* appears. Each entry becomes one UNION ALL branch.
	* @var array $ar_matrix_tables
	*/
	// ar_matrix_tables : array
	protected array $ar_matrix_tables;

	/**
	* Ordered list of bound parameter values for the prepared PostgreSQL statement.
	* 0-indexed; the placeholder `$N` in the SQL string maps to `$this->params[N-1]`.
	* Populated exclusively through get_placeholder() (trait.utils.php), which
	* deduplicates by strict comparison.
	* @see search::get_placeholder()
	* @var array $params
	*/
	// params array for prepared statements.
	// 0-indexed sequential list of bound values (the order pg_execute expects); the
	// placeholder $N maps to $this->params[N-1]. @see get_placeholder()
	protected array $params = [];

	/**
	* Final SQL query string after parse_sql_query() completes. Stored for debug
	* inspection via get_sql_query() / get_sql_query_resolved().
	* @var string $sql_query
	*/
	// sql_query : string (final query to execute stored for debug purposes)
	protected string $sql_query = '';

	/**
	* When true, allows negative section_ids (used for the root/system user record)
	* to appear in results for the users section. Normally the WHERE clause
	* excludes section_id ≤ 0 for DEDALO_SECTION_USERS_TIPO.
	* (!) Must be set server-side only; sanitize_client_sqo strips it.
	* @var bool $include_negative
	*/
	// include_negative
	// negative section_id used in profiles for the root user, root record could be avoid or include
	public bool $include_negative = false;



	/**
	* GET_INSTANCE
	* Factory method. Returns a new search builder instance whose class is
	* determined by `$search_query_object->mode`:
	*
	*   'tm'                 → search_tm   (time-machine history queries)
	*   'related'            → search_related (cross-section relation lookup)
	*   'edit'|'list'|other → search      (standard section query)
	*
	* Always create instances through this method rather than `new search()`
	* directly: the private constructor enforces the factory pattern and this
	* is the only place the three builder subclasses diverge.
	* @param object $search_query_object - SQO describing the search (must contain section_tipo)
	* @return search - new instance of search, search_tm, or search_related
	*/
	public static function get_instance(object $search_query_object) : search {

		// switch class from mode
		$mode = $search_query_object->mode ?? null;
		switch ($mode) {
			case 'tm':
				$search_class = 'search_tm';
				break;

			case 'related':
				$search_class = 'search_related';
				break;

			case 'edit':
			case 'list':
			default:
				$search_class = 'search';
				break;
		}

		// construct new instance of class (search|search_tm|search_related)
		$instance = new $search_class($search_query_object);


		return $instance;
	}//end get_instance



	/**
	* __CONSTRUCT
	* Private constructor; enforces use of get_instance() as the sole entry
	* point. Delegates immediately to set_up() to initialize all instance state.
	* @param object $search_query_object - validated SQO; must have section_tipo set
	*/
	private function __construct(object $search_query_object) {
		// Set up class minim vars
		$this->set_up($search_query_object);
	}//end __construct



	/**
	* SET_UP
	* Initializes all instance state from the caller-supplied SQO. This method
	* is called by the constructor (and by search_tm / search_related constructors
	* via parent::__construct). After set_up() the instance is ready for
	* parse_sql_query() or count().
	*
	* Responsibilities:
	*  - Validates that section_tipo is present; throws if missing.
	*  - Initializes $sql_obj to an empty clause container.
	*  - Normalizes section_tipo to an array; derives main_section_tipo and
	*    main_section_tipo_alias ('mix' when more than one section is given).
	*  - Resolves $matrix_table from the first ontology-resolvable entry in
	*    $ar_section_tipo (skips tipos with no installed model/table). For
	*    search_tm the subclass property is already 'matrix_time_machine'.
	*  - Clones the SQO to prevent mutation of the caller's copy.
	*  - Sets remove_distinct (forced true for multi-section to allow "duplicate"
	*    section_ids across section spaces) and skip_projects_filter (true for
	*    system tables that have no project filter column).
	*
	* @param object $search_query_object - raw SQO from get_instance()
	* @return void
	* @throws Exception when section_tipo is not set or empty
	*/
	protected function set_up(object $search_query_object) : void {

		// section tipo check and fixes
		if ( !isset($search_query_object->section_tipo) || empty($search_query_object->section_tipo) ) {
			throw new Exception("Error: section_tipo is not defined!", 1);
		}

		// Creates the Search Query Language Object:
		$this->sql_obj = new stdClass();
			$this->sql_obj->select			= [];
			$this->sql_obj->from			= [];
			$this->sql_obj->join			= [];
			$this->sql_obj->main_where		= [];
			$this->sql_obj->where			= [];
			$this->sql_obj->order			= [];
			$this->sql_obj->order_default	= [];
			$this->sql_obj->limit			= [];
			$this->sql_obj->offset			= [];

		// section_tipo is always and array
		$this->ar_section_tipo = (array)$search_query_object->section_tipo;

		// main_section_tipo is always the first section tipo
		$this->main_section_tipo = reset($this->ar_section_tipo);

		// Main section tipo alias. Sort version of main_section_tipo
		$count_ar_section_tipo = count($this->ar_section_tipo);
		$this->main_section_tipo_alias = ($count_ar_section_tipo > 1)
			? 'mix'
			: search::trim_tipo($this->main_section_tipo);

		// matrix_table
		// Note that for time machine (class 'search_tm') is always fixed as 'matrix_time_machine'
		if (get_class($this)==='search') {
			// get first reliable table from ar_section_tipo (skip non existing sections)
			// Note that in autocompletes, no all RQO config sections are always available
			// for current installation (for example 'dc1' in monedaiberica)
			$last_key = array_key_last($this->ar_section_tipo);
			foreach ($this->ar_section_tipo as $key => $current_tipo) {

				$model_name = ontology_node::get_model_by_tipo($current_tipo, true);

				// check model (some RQO config tipos could be not installed)
				if (empty($model_name)) {
					debug_log(__METHOD__
						. " Ignored section tipo without model " . PHP_EOL
						. ' current_tipo: ' . to_string($current_tipo)
						, logger::WARNING
					);
					// If the current tipo is the last tipo, we try to
					// resolve matrix table even when no model is resolved.
					// This happens in non installed Ontologies rare cases.
					if ( $key !== $last_key ) {
						continue;
					}
				}

				// matrix table
				$current_matrix_table = common::get_matrix_table_from_tipo($current_tipo);

				// Ignore invalid empty matrix tables
				if (empty($current_matrix_table)) {
					debug_log(__METHOD__
						. " Ignored section tipo without matrix table " . PHP_EOL
						. ' current_tipo: ' . to_string($current_tipo)
						, logger::WARNING
					);
					continue;
				}

				// add the first reliable table
				$this->matrix_table = $current_matrix_table;

				// only one is set here. Stop the loop
				break;
			}
		}

		// Set SQO property with cloned object
		$this->sqo = clone $search_query_object;

		// Set remove_distinct (useful for thesaurus search)
		// By default, distinct clause is set in the search query for avoid duplicates on joins
		// In some context (thesaurus search for example) we want "duplicate section_id's" because search is made against various section tipo
		$this->sqo->remove_distinct = ($count_ar_section_tipo > 1)
			? true // Force true when more than one section is passed
			: (isset($search_query_object->remove_distinct)
				? $search_query_object->remove_distinct
				: false); // false is default

		// skip_projects_filter. Set based on matrix table and SQO definition
		$this->sqo->skip_projects_filter = (!empty($this->matrix_table) && in_array($this->matrix_table, search::$ar_tables_skip_projects, true))
			? true
			: (isset($search_query_object->skip_projects_filter)
				? $search_query_object->skip_projects_filter
				: false);
	}//end set_up



	/**
	* SEARCH
	* Executes the full search pipeline and returns a lazy row iterator.
	*
	* Execution path:
	*  1. If `sqo->children_recursive === true`, first runs a separate unbounded
	*     parents search, then calls `search_children_recursive()` to expand
	*     to all descendant records and execute the combined query. This avoids
	*     side effects on the current instance's sql_obj state.
	*  2. Otherwise calls `parse_sql_query()` to build the prepared SQL string,
	*     then `matrix_db_manager::exec_search()` to execute it.
	*  3. Wraps the PostgreSQL result resource in a `db_result` iterator that
	*     parses JSONB columns on demand during iteration.
	*
	* Side effects:
	*  - Populates $this->params and $this->sql_query.
	*  - When SHOW_DEBUG is true, logs execution time and appends to
	*    dd_core_api::$sql_query_search for the API response.
	*  - Increments and updates metrics counters.
	*
	* @return db_result|false - lazy iterator over matching rows, or false on DB error
	*/
	public function search() : db_result|false {

		// debug
		if(SHOW_DEBUG===true) {
			$start_time=start_time();

			// metrics
			metrics::inc('search_total_calls');
		}

		// children recursive dedicated path
		// We use a dedicated search instance to fetch all parent records first (limit 'all'),
		// then we find their children and perform the final combined search.
		// This avoids side effects on the current instance.
		if (isset($this->sqo->children_recursive) && $this->sqo->children_recursive===true) {

			// Create a dedicated search for all parents
			$parents_sqo = clone $this->sqo;
			$parents_sqo->children_recursive = false;
			$parents_sqo->limit  = 'all';
			$parents_sqo->offset = 0;

			$parents_search = search::get_instance($parents_sqo);
			$parents_db_result = $parents_search->search();

			if (!$parents_db_result) {
				return false;
			}

			// Process parents to find children and execute final combined search
			return $this->search_children_recursive($parents_db_result);
		}

		// parse SQO. Converts JSON search_query_object to SQL query string
		$sql_query = $this->parse_sql_query();

		// execute search. Perform a SQL query in DB using pg_execute and parameters.
		$result	= matrix_db_manager::exec_search(
			$sql_query,
			$this->params, // 0-indexed sequential list of bound values ($1..$n)
			true
		);
		if ($result===false) {
			return false;
		}

		// children recursive
		// Note: intercepted at the beginning of search() if sqo->children_recursive is true
		// This block is left only for the case when search_children_recursive() is called directly (rarely)
		// but since we intercepted it above, this should be redundant for normal search calls.

		// debug
		if(SHOW_DEBUG===true) {
			$exec_time = exec_time_unit($start_time,'ms');
			$conn = DBi::_getConnection();
			$sql_query_debug = debug_prepared_statement($sql_query, $this->params, $conn);
			if($exec_time>SLOW_QUERY_MS) {
				debug_log(__METHOD__
					. " SLOW_QUERY. LOAD_SLOW_QUERY " . PHP_EOL
					. ' exec_time: '.$exec_time .PHP_EOL
					. ' sql_query: ' .$sql_query_debug
					, logger::WARNING
				);
			}

			$this->sqo->executed_time = $exec_time;

			// dd_core_api::$sql_query_search. Fulfill on API request
			if (!empty(dd_core_api::$rqo)) {
				dd_core_api::$sql_query_search[] = '-- TIME ms: '. $exec_time . PHP_EOL . $sql_query_debug;
			}

			// metrics
			metrics::add_time_ms('search_total_time', $exec_time);
			metrics::observe_max('search_max_time', $exec_time); // slowest single search
		}

		// json_columns to process based on mode
		$mode = $this->sqo->mode ?? null;
		$json_columns = ($mode==='tm') ? tm_db_manager::$json_columns : matrix_db_manager::$json_columns;

		// wrap result in db_result iterator (unless already wrapped by search_children_recursive)
		if ($result instanceof db_result) {
			$db_result = $result;
		} else {
			$db_result = new db_result(
				$result,
				$json_columns
			);
		}


		return $db_result;
	}//end search



	/**
	* SEARCH_CHILDREN_RECURSIVE
	* Expands a set of "parent" section records to include all of their
	* recursive children, then executes a single combined search over the
	* full set and updates the instance SQO for correct pagination.
	*
	* Algorithm:
	*  1. Iterate $parents_db_result to collect all parent rows and their
	*     `{section_id, section_tipo}` root objects.
	*  2. Call `component_relation_children::get_children_recursive_batch()`
	*     to retrieve all descendant locators in one batched pass (shared
	*     visited set prevents cycles and redundant lookups).
	*  3. If no children exist, rewind the parents result and return it
	*     directly, setting sqo->total to the parent count.
	*  4. Otherwise, merge parents + children into one flat array, build a new
	*     SQO filter that targets those exact section_ids using an IN clause
	*     (via `generate_children_recursive_search()`), and execute a fresh
	*     search. Update the current instance's sqo->filter and sqo->total so
	*     that the caller's pagination layer sees the correct total count.
	*
	* (!) The parents result is fully iterated inside this method; rewinding
	* it (seek(0)) is required in the no-children fast path.
	*
	* @param db_result $parents_db_result - result from the pre-search of parent records
	* @return db_result|false - combined result including children, or false on error
	*/
	private function search_children_recursive( db_result $parents_db_result ) : db_result|false {

		$ar_records		= [];
		$ar_parent_roots = [];
		foreach ($parents_db_result as $row) {

			// row expected an object as {section_tipo: oh1, section_id: 2} (select previously changed on parse sqo)
			// Note: when full_count is set, section_tipo may not be selected, so we fall back to main_section_tipo
			$ar_records[] = $row;

			$section_id = $row->section_id ?? null;
			if ($section_id === null) {
				continue; // Skip rows without section_id
			}

			// Collect parent roots and resolve their children in a single batched pass
			// (shared visited set) instead of one recursive call per parent row.
			$root				= new stdClass();
			$root->section_id	= $section_id;
			$root->section_tipo	= $row->section_tipo ?? $this->main_section_tipo;
			$ar_parent_roots[]	= $root;
		}

		$ar_row_children = component_relation_children::get_children_recursive_batch(
			$ar_parent_roots, // array of {section_id, section_tipo}
			null // string|null component_tipo
		);

		// No children found case. Return the main search result rewound to start.
		if (empty($ar_row_children)) {
			// Update total with parents count even if no children are found
			$this->sqo->total = count($ar_records);

			if (SHOW_DEBUG===true) {
				debug_log(__METHOD__ . " No recursive children found. Parents count: " . count($ar_records), logger::DEBUG);
			}

			// Reset pointer to beginning since it was already iterated
			$parents_db_result->seek(0);
			return $parents_db_result;
		}

		// Merges parent and children records
		$ar_rows_mix = [...$ar_row_children, ...$ar_records];

		// Generates the new SQO with all section_id.
		$new_sqo = $this->generate_children_recursive_search($ar_rows_mix);

		// New full search execution.
		$children_search	= search::get_instance($new_sqo);
		$result				= $children_search->search();

		// Update current SQO changing properties to allow pagination
		$this->sqo->filter				= $new_sqo->filter;
		$this->sqo->total				= count($ar_rows_mix);
		$this->sqo->children_recursive	= false;
		$this->sqo->parsed				= true;

		if (SHOW_DEBUG===true) {
			debug_log(__METHOD__ . " Recursive children search completed. Total (parents+children): " . $this->sqo->total, logger::DEBUG);
		}


		return $result;
	}//end search_children_recursive



	/**
	* GENERATE_CHILDREN_RECURSIVE_SEARCH
	* Builds a new SQO that restricts the search to a specific set of
	* section records (parents + their children) using an `IN(…)` filter on
	* `section_id`. This replaces any previous filter so the follow-up search
	* returns exactly and only those records.
	*
	* The method clones the current instance's SQO and modifies it:
	*  - Disables `children_recursive` to break the recursive cycle.
	*  - Forces `parsed = false` so the conform phase re-runs on the new filter.
	*  - Removes `filter_by_locators` (already resolved by the parent search).
	*  - Disables `full_count` (caller handles totals from $ar_rows size).
	*  - Builds the filter: `($fixed_children_filter) AND ($or: section_id IN (…))`.
	*    section_id values are cast to `int` before `implode` to prevent any
	*    non-integer value from corrupting the reconstructed SQO.
	*
	* @param array $ar_rows - flat array of stdClass with section_id (and optionally section_tipo)
	* @return object $new_sqo - modified SQO ready for search::get_instance()
	*/
	public function generate_children_recursive_search( array $ar_rows ) : object {

		// clone original sqo
			$new_sqo = clone $this->sqo;

		// force re - parse
			$new_sqo->parsed = false;

		// remove children_recursive to avoid infinite loop
			$new_sqo->children_recursive = false;

		// remove possible filter_by_locators (parent searched previously)
			unset($new_sqo->filter_by_locators);

		// not count
			$new_sqo->full_count = false;

		// new full filter
			$filter	= new stdClass();
			$op_or	= '$or';
			$op_and	= '$and';

		// fixed_children_filter
			if(isset($new_sqo->fixed_children_filter)){
				$filter->{$op_and}[] = $new_sqo->fixed_children_filter;
			}

		// optimized version using IN
		// Build the filter object directly (no JSON string interpolation) and force
		// section_id values to int, so no raw value can corrupt the reconstructed SQO.
			$ar_section_id = array_map(static function($el){
				return (int)$el->section_id;
			}, $ar_rows);
			$section_tipo = $ar_rows[0]->section_tipo ?? '';

			$path_item = new stdClass();
				$path_item->section_tipo	= $section_tipo;
				$path_item->component_tipo	= 'section_id';
				$path_item->model			= 'component_section_id';
				$path_item->name			= 'Id';

			$item = new stdClass();
				$item->q			= implode(',', $ar_section_id);
				$item->q_operator	= null;
				$item->path			= [$path_item];

			$children_filter = [$item];

		// filter
			if(isset($filter->{$op_and})){

				$add_children = new stdClass();
				$add_children->{$op_or} = $children_filter;

				$filter->{$op_and}[] = $add_children;

			}else{

				$filter->{$op_or} = $children_filter;
			}

		// replace filter in sqo
			$new_sqo->filter = $filter;


		return $new_sqo;
	}//end generate_children_recursive_search



	/**
	* PARSE_SQO
	* "Conform" phase of the two-phase parse. Iterates each filter item,
	* select column, and order column and dispatches each to its component
	* model, which adds the concrete SQL sentence + parameter tokens.
	*
	* Filter processing is recursive via `conform_filter()`. Select and order
	* objects are normalized via `conform_select()` (resolves the physical
	* column name from the ontology tipo when `column` is absent).
	*
	* This method is idempotent: if `sqo->parsed === true` it returns
	* immediately without re-processing. Set `parsed = false` to force a
	* re-parse (e.g. after `generate_children_recursive_search()` replaces
	* the filter).
	*
	* Side effect: sets `$this->sqo->parsed = true` on completion.
	* @return void
	*/
	public function parse_sqo() : void {

		// already parsed case
		$parsed = $this->sqo->parsed ?? false;
		if ($parsed===true) {
			return;
		}

		// filter
		if (!empty($this->sqo->filter)) {
			// conform_filter. Conform recursively each filter object asking the components
			foreach ($this->sqo->filter as $op => $filter_items) {
				$this->join_counter = 0;
				$new_sqo_filter = $this->conform_filter($op, $filter_items);
				break; // Only expected one
			}
			// Replace filter array with components pre-parsed values
			$this->sqo->filter = $new_sqo_filter ?? null;
		}

		// select
		if (!empty($this->sqo->select)) {
			$new_sqo_select = [];
			foreach ($this->sqo->select as $select_object) {
				$new_sqo_select[] = search::conform_select( $select_object );
			}
			// Replace select array with components pre-parsed values
			$this->sqo->select = $new_sqo_select;
		}

		// order. Note that order is parsed with same parser as 'select' (conform_select)
		if (!empty($this->sqo->order)) {
			$new_sqo_order = [];
			foreach ((array)$this->sqo->order as $select_object) {
				$new_sqo_order[] = search::conform_select( $select_object );
			}
			// Replace select array with components pre-parsed values
			$this->sqo->order = $new_sqo_order;
		}

		// Set object as parsed
		$this->sqo->parsed = true;
	}//end parse_sqo



	/**
	* CONFORM_FILTER
	* Security chokepoint and conform dispatcher for the SQO filter tree.
	* Walks the filter recursively and, for each leaf item (one that has a
	* `path` property), validates all path steps and dispatches to the
	* component model for SQL generation.
	*
	* Two structural cases per item in $filter_items:
	*  - Operator group (no `path` key): the item is itself a `{$and: […]}` or
	*    `{$or: […]}` group. Recurse into it.
	*  - Leaf query item (has `path`): validate section_tipo, component_tipo,
	*    and lang, then call `$model::get_search_query($search_object)` which
	*    adds `{sentence, params}` to the item.
	*
	* Security:
	*  `section_tipo` and `component_tipo` from the client path are interpolated
	*  verbatim as JSONB keys / jsonpath member steps by the per-component
	*  builders and cannot be parameterized. Both are validated here via
	*  `is_valid_tipo()` or `is_valid_data_column()` (the latter covers the
	*  legitimate pseudo-tipos: section_id, id, tipo, lang, type, section_tipo).
	*  `lang` is validated via `is_valid_lang()`. Any invalid value throws.
	*  This one gate covers ALL component traits and ALL path depths,
	*  including single-level paths that never reach build_sql_join().
	*
	* @param string $op - logical operator key from the SQO filter tree (e.g. '$and', '$or')
	* @param array $filter_items - array of filter leaf objects or nested operator groups; each leaf is:
	*   {q, q_operator, path:[{section_tipo, component_tipo, model, name}], lang?, format?, …}
	* @return object $new_query_object - conformed filter object `{$op: […conformed_items]}`
	* @throws Exception when a path step contains an invalid section_tipo, component_tipo, or lang
	*/
	public function conform_filter(string $op, array $filter_items) : object {

		$new_query_object = new stdClass();
			$new_query_object->$op = [];

		// foreach ($filter_items as $search_object) {
		$filter_items_size = sizeof($filter_items);
		for ($i=0; $i < $filter_items_size; $i++) {

			$search_object = $filter_items[$i];

			// is object check
				if (!is_object($search_object)) {

					debug_log(__METHOD__
						.' Invalid (IGNORED) non object search_object: ' . PHP_EOL
						.' type: ' 			. gettype($search_object) . PHP_EOL
						.' search_object: ' . json_encode($search_object, JSON_PRETTY_PRINT) . PHP_EOL
						.' filter_items: ' 		. json_encode($filter_items, JSON_PRETTY_PRINT)
						, logger::ERROR
					);
					continue;
				}

			// Check if the filter is a logical or query.
			// logical: group of queries with the logical operator ($or/$and)
			// query: filter definition item with value in q and its path to find the value
			if ( !property_exists($search_object, 'path') ) {

				// Case object is a group of filter items with a operator as key ($or/$and).
				// in those cases, go deep into the filter and conform with the deeper filter item recursively
				$op2			= array_key_first(get_object_vars($search_object));
				$filter_items2	= $search_object->$op2;

				$nested_query_object = $this->conform_filter($op2, $filter_items2);

				$nested_query_object_array = get_object_vars($nested_query_object);
				if (!empty(reset($nested_query_object_array))) {
					$new_query_object->$op[] = $nested_query_object;
				}

			}else{

				$path						= $search_object->path;

				// Security chokepoint (covers ALL component traits at one point).
				// section_tipo / component_tipo from a client path are interpolated verbatim
				// into JSONB keys and jsonpath member steps ($.{tipo}[*]) by the per-component
				// search builders and cannot be parameterized. Single-level paths never reach
				// build_sql_join (which validates multi-level joins), so validate here before
				// any model dispatch. Pseudo-tipos (section_id, id, tipo, lang, type, section_tipo)
				// are legitimate path terminals (e.g. generate_children_recursive_search).
				// Also validate the optional lang selector (string-interpolated as a SQL literal).
				foreach ($path as $path_step) {
					$step_section_tipo	= $path_step->section_tipo ?? null;
					$step_component_tipo= $path_step->component_tipo ?? null;
					if ( isset($step_section_tipo) && !search::is_valid_tipo((string)$step_section_tipo) ) {
						debug_log(__METHOD__
							. " Rejected invalid section_tipo in search path (possible injection attempt) " . PHP_EOL
							. ' section_tipo: ' . to_string($step_section_tipo)
							, logger::ERROR
						);
						throw new Exception("Error: invalid section_tipo in search path", 1);
					}
					if ( isset($step_component_tipo)
						&& !search::is_valid_tipo((string)$step_component_tipo)
						&& !search::is_valid_data_column((string)$step_component_tipo) ) {
						debug_log(__METHOD__
							. " Rejected invalid component_tipo in search path (possible injection attempt) " . PHP_EOL
							. ' component_tipo: ' . to_string($step_component_tipo)
							, logger::ERROR
						);
						throw new Exception("Error: invalid component_tipo in search path", 1);
					}
				}
				if ( isset($search_object->lang) && !search::is_valid_lang((string)$search_object->lang) ) {
					debug_log(__METHOD__
						. " Rejected invalid lang in search filter (possible injection attempt) " . PHP_EOL
						. ' lang: ' . to_string($search_object->lang)
						, logger::ERROR
					);
					throw new Exception("Error: invalid lang in search filter", 1);
				}

				// Multi-step paths (value lives inside a related record reached through a
				// relation/portal) get a unique join_id so each clause traverses the relation
				// INDEPENDENTLY. This makes "value A AND value B" match across different linked
				// records, not within a single one. Single-step paths keep join_id null (legacy).
				$join_id = (count($path) > 1) ? ++$this->join_counter : null;
				$search_object->join_id		= $join_id;
				$search_object->table_alias	= $this->get_table_alias_from_path( $path, $join_id );
				$search_object->table		= $this->matrix_table;

				// Case object is a end search object
				if (isset($search_object->format) && $search_object->format==='column' && isset($search_object->q)) {

					// column format parser
					$search_object	= $this->column_format_parser($search_object);
					$ar_query_object = [$search_object];

				}else{

					$search_component			= end($path);
					// model (with fallback if do not exists)
					if (!isset($search_component->model)) {
						$search_component->model = ontology_node::get_model_by_tipo($search_component->component_tipo, true);
					}
					// check for empty models like elements that this installation don't have (e.g. 'numisdata303' from request config fixed filter in Objects -tch1-)
					if (empty($search_component->model)) {
						debug_log(__METHOD__
							. " Error resolving component model. Ignored search element " . PHP_EOL
							. ' tipo: ' . to_string($search_component->component_tipo)
							, logger::ERROR
						);
						continue;
					}
					$model_name = $search_component->model;

					$ar_query_object = $model_name::get_search_query($search_object);
				}

				$new_query_object->$op = [...$new_query_object->$op, ...$ar_query_object];
			}
		}//end for ($i=0; $i < $filter_items_size; $i++)


		return $new_query_object;
	}//end conform_filter



	/**
	* CONFORM_SELECT
	* Resolves the physical matrix column name for a select descriptor when
	* only the ontology tipo (component key) is provided and `column` is absent.
	*
	* Select descriptor shape:
	*   {
	*     "column": string|null  — physical column name (e.g. 'string', 'relation')
	*     "key":    string|null  — ontology component tipo (e.g. 'oh25')
	*   }
	*
	* If both `column` and `key` are present, the descriptor is already resolved
	* and returned unchanged. If only `key` is given, the model is looked up via
	* `ontology_node::get_model_by_tipo()` and the column is derived from
	* `section_record_data::get_column_name()`.
	*
	* @param object $select_object - select descriptor; modified in place when column is absent
	* @return object $select_object - same object with column populated if it was missing
	*/
	public static function conform_select( object $select_object ) : object {

		// key is not defined or has empty value
		if( empty($select_object->key) ){
			return $select_object; // No check the component column
		}

		// column is defined and has a value
		if( !empty($select_object->column) ){
			return $select_object;
		}

		// Resolve each column name
		$model_name				= ontology_node::get_model_by_tipo($select_object->key,true);
		$select_object->column	= section_record_data::get_column_name( $model_name );

		return $select_object;
	}//end conform_select



	/**
	* BUILD_UNION_QUERY
	* Rewrites a single-table SQL query string to a UNION ALL query when
	* `$ar_section_tipo` spans more than one matrix table.
	*
	* Each branch is an independent SELECT that differs only in the `FROM` table.
	* The main FROM clause produced by `build_main_from_sql()` (exact string
	* `'FROM <table> AS <alias>'`) is replaced with the branch's own table name;
	* only that exact substring is replaced, never a regex, to avoid corrupting
	* correlated subqueries that use different aliases (e.g. the `!!` duplicated
	* operator emits `FROM <table> AS m2`).
	*
	* After UNION ALL, table alias qualifiers (e.g. `mix.`) are stripped from
	* the outer ORDER BY because UNION result columns are not alias-qualified.
	*
	* @param string $sql_query - the single-table SQL query to expand
	* @return string $sql_query - expanded UNION ALL query, or the original if only one table
	*/
	public function build_union_query(string $sql_query) : string {

		// Calculate matrix tables based on section tipos
		$this->ar_matrix_tables = [];
		foreach ($this->ar_section_tipo as $key => $current_section_tipo) {

			$model_name = ontology_node::get_model_by_tipo($current_section_tipo, true);

			// check model (some RQO config tipos could be not installed)
			if (empty($model_name)) {
				debug_log(__METHOD__
					. " Ignored section tipo without model " . PHP_EOL
					. ' current_section_tipo: ' . to_string($current_section_tipo)
					, logger::WARNING
				);
				continue;
			}

			$current_matrix_table = common::get_matrix_table_from_tipo($current_section_tipo);

			// Ignore invalid empty matrix tables
			if (empty($current_matrix_table)) {
				debug_log(__METHOD__
					. " Ignored invalid empty matrix table " . PHP_EOL
					. ' section_tipo: ' . $current_section_tipo
					, logger::ERROR
				);
				continue;
			}

			// Add unique matrix tables to the list
			if (!in_array($current_matrix_table, $this->ar_matrix_tables)) {
				$this->ar_matrix_tables[] = $current_matrix_table;
			}
		}

		// If there are multiple matrix tables, build UNION query
		if (count($this->ar_matrix_tables)>1) {
			$tables_query = [];

			// Add current query (first table)
			$tables_query[] = $sql_query;

			// Each UNION branch is an independent SELECT with its own alias scope, so every
			// branch keeps the same main alias ($this->main_section_tipo_alias, 'mix' here) and
			// only the main FROM table is swapped. We replace an EXACT substring (the exact
			// clause build_main_from_sql produced) instead of a regex: this never touches the
			// FROM clauses of correlated subqueries (e.g. the '!!' duplicated operator emits
			// "FROM <table> AS m2", a different alias) and removes the previous 'mix.' string
			// surgery that corrupted those subqueries.
			$main_from_needle = 'FROM ' . $this->matrix_table . ' AS ' . $this->main_section_tipo_alias;

			foreach ($this->ar_matrix_tables as $key => $current_matrix_table) {

				// Ignore the first table (already added unchanged)
				if ($key===0) {
					continue;
				}

				$branch_from	= 'FROM ' . $current_matrix_table . ' AS ' . $this->main_section_tipo_alias;
				$current_query	= str_replace($main_from_needle, $branch_from, $sql_query);

				// Add the modified query to the list
				$tables_query[] = $current_query;
			}

			// Replace the original query with UNION ALL clauses
			$sql_query = implode(PHP_EOL . 'UNION ALL' . PHP_EOL, $tables_query);
		}


		return $sql_query;
	}//end build_union_query



	/**
	* PARSE_SQL_QUERY
	* Top-level dispatcher for the SQL build phase. Runs `parse_sqo()` if the
	* SQO has not yet been conformed (guarded by `sqo->parsed`), then delegates
	* to the appropriate builder method based on the SQO's active flags:
	*
	*   full_count === true        → parse_sql_full_count()   (COUNT wrapper)
	*   filter_by_locators set     → parse_sql_filter_by_locators()
	*   default                    → parse_sql_default()
	*
	* After building, appends a trailing `;` and validates that a matrix table
	* was resolved (logs an error if not, which typically means all tipos in
	* ar_section_tipo were unresolvable). Stores the final SQL in $this->sql_query
	* for debug access. When SHOW_DEBUG is true, prepends a `-- type` comment line.
	*
	* @return string $sql_query - final parameterized SQL string ready for pg_execute
	*/
	public function parse_sql_query( ) : string {

		// pre_parse_sql_query if not already parsed
		$parsed = $this->sqo->parsed ?? false;
		if ($parsed!==true) {
			// Pre-parse search_query_object with components always before begins
			$this->parse_sqo();
		}

		$search_type = null;

		// parse SQL query
		switch (true) {

			// count case (place always at first case)
			case (isset($this->sqo->full_count) && $this->sqo->full_count===true):
				$search_type = 'full_count';
				$sql_query = $this->parse_sql_full_count();
				break;

			// sql_filter_by_locators
			case (isset($this->sqo->filter_by_locators) && !empty($this->sqo->filter_by_locators)):
				$search_type = 'filter_by_locators';
				$sql_query = $this->parse_sql_filter_by_locators();
				break;

			// without order
			// case (empty($this->sqo->order)):
			default:
				$search_type = 'default';
				$sql_query = $this->parse_sql_default();
				break;
		}

		$sql_query .= ';' . PHP_EOL;

		// check valid matrix table
		if (get_called_class()==='search' && empty($this->matrix_table) && !in_array('all', $this->ar_section_tipo)) {
			debug_log(__METHOD__
				. ' Error: Matrix table is mandatory. Check your ar_section_tipo to safe tipos with resolvable model.' . PHP_EOL
				. ' $this->ar_section_tipo: ' . to_string($this->ar_section_tipo) . PHP_EOL
				. ' sql_query: ' . $sql_query. PHP_EOL
				. ' class: ' . get_called_class() . PHP_EOL
				. ' this: ' . to_string($this)
				, logger::ERROR
			);
		}

		// set sql_query
		$this->sql_query = $sql_query;

		// debug
		if(SHOW_DEBUG===true) {
			$sql_query = '-- ' . $search_type . PHP_EOL . $sql_query ; // . ': ' . implode('|', array_reverse(get_backtrace_sequence())) . PHP_EOL . $sql_query;
			// $sql_query_debug = debug_prepared_statement($sql_query, $this->params, DBi::_getConnection() );
			// debug_log(__METHOD__
			// 	// . " sql_query params " . PHP_EOL
			// 	// . $sql_query . PHP_EOL
			// 	. " sql_query_debug: " . PHP_EOL
			// 		. PHP_EOL . $sql_query_debug . PHP_EOL
			// 		, logger::DEBUG
			// );
		}


		return $sql_query;
	}//end parse_sql_query



	/**
	* PARSE_SQL_DEFAULT
	* Builds the standard section-list SQL query (no full_count, no
	* filter_by_locators). This is the path taken for all normal edit/list
	* mode searches.
	*
	* EXECUTION ORDER IS CRITICAL:
	* ============================
	* 1. FROM must be built first to establish table aliases
	* 2. SELECT can then reference those aliases
	* 3. ORDER must come after FROM because:
	*    - Component-based ordering calls `build_sql_join()` to create table joins
	*    - These joins need the base FROM to be established first
	*    - Table aliases must exist before being referenced in ORDER BY
	* 4. WHERE clauses are built last
	*
	* WINDOW FUNCTION PATTERN:
	* ========================
	* The final query uses a window/subquery pattern:
	*   SELECT * FROM (
	*     SELECT ... FROM ... WHERE ... ORDER BY order_default
	*   ) main_select
	*   ORDER BY order (or order_default if no custom order)
	*   LIMIT ... OFFSET ...
	*
	* The window is enabled when the query has JOINs or a custom ORDER BY.
	* Without it, `DISTINCT ON` requires the leading ORDER BY column to match
	* the DISTINCT key, so the outer ORDER BY can freely apply the user's
	* custom sort. When there are no JOINs and no custom order, the inner
	* query doubles as the final result and LIMIT/OFFSET are appended inline.
	*
	* For multi-section searches, `build_union_query()` is called on the inner
	* query string before appending order/limit.
	*
	* @return string $sql_query - the built SQL string (without trailing semicolon)
	*/
	public function parse_sql_default() : string {

		// 1 from (must be first to establish table aliases)
		$this->build_main_from_sql();
		// 2 select
		$this->build_sql_query_select();
		// 3 order (after FROM to ensure joins and aliases are available)
		$this->build_sql_query_order();
		// 4 where
		$this->build_main_where();
		$this->build_sql_filter();
		$this->build_sql_projects_filter();
		$this->build_filter_by_user_records();

		$use_window = !empty($this->sql_obj->join) || !empty($this->sql_obj->order) ? true : false;

		// sql_query
		$sql_query = '';

		// query_inside
			$query_inside = '';

			// select
			$query_inside .= 'SELECT ' . implode(','.PHP_EOL, $this->sql_obj->select );

			// from
			$query_inside .= PHP_EOL . 'FROM ' . implode(PHP_EOL, $this->sql_obj->from );

			// join
			if (!empty($this->sql_obj->join)) {
				$query_inside .= PHP_EOL . implode(PHP_EOL, $this->sql_obj->join );
			}

			// where
			// merge main_where and where and remove empty sentences
			$all_where_sentences = array_filter([...$this->sql_obj->main_where, ...$this->sql_obj->where]);
			if( !empty( $all_where_sentences )){
				$query_inside .= PHP_EOL . 'WHERE ' . implode(PHP_EOL.' AND ', $all_where_sentences);
			}

			// multi section union case
			if (count($this->ar_section_tipo)>1) {
				$query_inside = $this->build_union_query($query_inside);
			}

			// order by default like 'section_id DESC' (for maintain result consistency)
			$order_query = PHP_EOL . 'ORDER BY ' . implode( ', ', $this->sql_obj->order_default );
			// order union case for various tables
			if (isset($this->ar_matrix_tables) && count($this->ar_matrix_tables)>1) {
				$order_query = str_replace('mix.', '', $order_query);
			}
			$query_inside .= $order_query;

			if (!$use_window) {
				// limit / offset (safe coerced tail)
				$query_inside .= $this->build_limit_offset_sql();
			}
			// end query_inside

		// main select.
		// Note that the use of the window is necessary to order when SELECT contains 'DISTINCT ON'
			if ($use_window) {
				$sql_query .= 'SELECT * FROM (';
				$sql_query .= PHP_EOL . $query_inside . PHP_EOL;
				$sql_query .= ') main_select';

				// order. Global order custom or default
				// Remove table aliases from outer ORDER BY since we're selecting from main_select subquery
				$outer_order = !empty($this->sql_obj->order)
					? $this->sql_obj->order
					: $this->sql_obj->order_default;

				$outer_order_clean = array_map(function($order_clause) {
					// Remove table alias prefix (e.g., 'te65.section_id' -> 'section_id')
					return preg_replace('/^[a-z0-9_]+\./', '', $order_clause);
				}, $outer_order);

				$sql_query .= PHP_EOL . 'ORDER BY ' . implode( ', ', $outer_order_clean );

				// limit / offset (safe coerced tail)
				$sql_query .= $this->build_limit_offset_sql();
			}else{
				$sql_query = $query_inside;
			}


		return $sql_query;
	}//end parse_sql_default



	/**
	* PARSE_SQL_FULL_COUNT
	* Builds a `SELECT COUNT(*) as full_count FROM (…) x` wrapper query for
	* pagination total calculation. Called when `sqo->full_count === true`.
	*
	* Inner SELECT is `SELECT DISTINCT section_id` (non-distinct for the
	* activity section and time-machine, which can have multiple rows per
	* section_id). The full filter stack (main_where, filter, filter_by_locators,
	* projects filter, user-records filter) is applied. For multi-section queries
	* the inner SELECT is expanded with UNION ALL before wrapping in the COUNT.
	*
	* JOINs from ORDER BY are not needed for count (order is skipped entirely),
	* so the inner SELECT only includes the join virtual tables/filter projects
	* from sql_obj->join.
	*
	* @return string $sql_query - the built COUNT SQL string (without trailing semicolon)
	*/
	public function parse_sql_full_count() : string {

		// from
		$this->build_main_from_sql();
		// where sentences
		// The filters are built into the sql_obj->where array
		// The building should to be done in restrictive order.
		$this->build_main_where();
		$this->build_sql_filter();
		$this->build_sql_filter_by_locators();
		$this->build_sql_projects_filter();
		$this->build_filter_by_user_records();

		// column_id to count. default is 'section_id', but in time machine must be 'id' because 'section_id' is not unique
			// $column_id = ($this->matrix_table==='matrix_time_machine') ? 'id' : 'section_id';

		// sql_query
		$sql_query = '';

		// select
		$sql_query .= ($this->main_section_tipo===DEDALO_ACTIVITY_SECTION_TIPO || $this->matrix_table==='matrix_time_machine')
			? 'SELECT '.$this->main_section_tipo_alias.'.section_id'
			: 'SELECT DISTINCT '.$this->main_section_tipo_alias.'.section_id';

		// from
		$sql_query .= PHP_EOL . 'FROM ' . implode(PHP_EOL, $this->sql_obj->from);

		// join virtual tables/filter projects
		$join = implode( PHP_EOL, $this->sql_obj->join);
		if (!empty($join)) {
			$sql_query .= PHP_EOL . $join;
		}

		// where
		// merge main_where and where and remove empty sentences
		$all_where_sentences = array_filter([...$this->sql_obj->main_where, ...$this->sql_obj->where]);
		if( !empty( $all_where_sentences )){
			$sql_query .= PHP_EOL . 'WHERE ' . implode(PHP_EOL.' AND ', $all_where_sentences);
		}

		// multi-section union case
		if (count($this->ar_section_tipo)>1) {
			$sql_query = $this->build_union_query($sql_query);
		}

		// final
		$sql_query = 'SELECT COUNT(*) as full_count FROM (' . PHP_EOL . $sql_query . PHP_EOL. ') x';


		return $sql_query;
	}//end parse_sql_full_count



	/**
	* PARSE_SQL_FILTER_BY_LOCATORS
	* Builds a query that returns exactly the rows identified by the locators
	* in `sqo->filter_by_locators`. Each locator is an object with one or more
	* of: `section_id`, `section_tipo`, `tipo` (TM only), `type`, `lang` (TM
	* only), `matrix_id` (TM only). Multiple locators are combined with OR;
	* fields within a single locator are combined with AND.
	*
	* The result is always wrapped in a window subquery (`SELECT * FROM (…)
	* main_select`) so that an outer ORDER BY (custom or default) can be applied
	* cleanly without needing DISTINCT ON to match the leading sort column.
	* All parameter values are passed through `get_placeholder()` (prepared
	* statement — no verbatim interpolation).
	*
	* @return string $sql_query - the built filter-by-locators SQL string
	*/
	public function parse_sql_filter_by_locators() : string {

		$this->build_main_from_sql();

		$this->build_sql_filter_by_locators();

		// Always build order to ensure deterministic results
		if ( !empty($this->sqo->order) ) {
			$this->build_sql_query_order();
		} else {
			// Build default order when no custom order is specified
			$this->build_sql_query_order_default();
		}

		$sql_query = '';

		// select
		$sql_query .= 'SELECT * FROM (';
		$sql_query .= PHP_EOL . 'SELECT *';
		$sql_query .= PHP_EOL . 'FROM ' . implode(PHP_EOL, $this->sql_obj->from);
		if (!empty($this->sql_obj->join) ){
			$sql_query .= PHP_EOL . implode(PHP_EOL, $this->sql_obj->join);
		}
		$sql_query .= PHP_EOL . 'WHERE ' . implode(PHP_EOL, $this->sql_obj->where);
		$sql_query .= PHP_EOL . ') main_select';

		// order (always present, either custom or default)
		// Remove table aliases from outer ORDER BY since we're selecting from main_select subquery
		$outer_order = !empty($this->sql_obj->order)
			? $this->sql_obj->order
			: $this->sql_obj->order_default;

		$outer_order_clean = array_map(function($order_clause) {
			// Remove table alias prefix (e.g., 'te65.section_id' -> 'section_id')
			return preg_replace('/^[a-z0-9_]+\./', '', $order_clause);
		}, $outer_order);

		$sql_query .= PHP_EOL . 'ORDER BY ' . implode( ', ', $outer_order_clean );

		// limit / offset (safe coerced tail)
		$sql_query .= $this->build_limit_offset_sql();


		return $sql_query;
	}//end parse_sql_filter_by_locators



}//end class search
