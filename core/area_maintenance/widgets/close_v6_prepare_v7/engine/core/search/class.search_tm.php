<?php declare(strict_types=1);
/**
* CLASS SEARCH_TM
* SQO-to-SQL query builder specialised for the `matrix_time_machine` table.
*
* `search_tm` is the time-machine mode subclass of `search`.  It is selected
* automatically by `search::get_instance()` when `$sqo->mode === 'tm'` and
* targets `matrix_time_machine` — the versioning store where every component
* save produces a snapshot row.  That table's schema differs from the normal
* `matrix_*` tables in one critical way: it has no per-section-tipo partitioning
* and no `section_tipo` column at the top level, so the standard
* `build_main_where()` that emits a `section_tipo = $n` predicate must be
* suppressed entirely.
*
* Responsibilities of this class:
* - Pins `$matrix_table` to `'matrix_time_machine'` at declaration time,
*   bypassing the dynamic per-section-tipo resolution performed in
*   `search::set_up()` (which runs only for `get_class($this)==='search'`).
* - Overrides `build_main_where()` with a no-op so the base-class method that
*   filters on `section_tipo` is not emitted for this schema-incompatible table.
* - Overrides `build_sql_query_select()` to emit `SELECT *` for normal queries
*   and to delegate to `build_full_count_sql_query_select()` when the SQO
*   requests a count (`sqo->full_count === true`).
* - Overrides `build_full_count_sql_query_select()` to count by `section_id`
*   (the column whose alias is `main_section_tipo_alias.section_id`), matching
*   the pattern the parent class uses for the full-count subquery.
* - Overrides `build_sql_query_order_default()` to use `timestamp DESC` as the
*   natural chronological order for snapshot rows, instead of the parent's
*   `section_id ASC` / `section_id DESC` (activity) heuristic.
* - Delegates `build_sql_query_order()` entirely to the parent, which handles
*   the custom `sqo->order` array (including the direct-column `id` shorthand
*   used by the time-machine tool).
*
* Inherited behaviour (from `search` + its traits):
* - `parse_sqo()` / `parse_sql_query()` / `parse_sql_default()` etc. are all
*   inherited unchanged and function correctly against `matrix_time_machine`
*   because the table's JSONB column is named `data` and is listed in
*   `tm_db_manager::$json_columns` which `search()` uses to wrap the result in
*   a `db_result` iterator.
* - Filter conforming, injection guarding, and prepared-parameter logic are
*   inherited from `search` and the shared traits.  `search_tm` does not need
*   to re-implement any of those.
*
* Column shape of `matrix_time_machine` (see also `tm_db_manager`):
*   id            — auto-assigned serial PK (int)
*   section_tipo  — tipo of the parent section (string)
*   section_id    — record ID within that section (int)
*   tipo          — tipo of the changed component (string)
*   lang          — active language at save time (string)
*   timestamp     — server-assigned save time (timestamptz)
*   user_id       — user who triggered the save (int)
*   bulk_process_id — optional bulk-process reference (int|null)
*   data          — JSONB snapshot of the component datum (array|object)
*
* Related classes:
*   search             — parent builder (contains all shared query assembly)
*   search_related     — sibling specialisation for relation-list mode
*   tm_db_manager      — DAL for matrix_time_machine (CREATE/READ/UPDATE/DELETE)
*   tm_record_data     — domain façade wrapping tm_db_manager
*   search_tm_Test     — SQL-string unit tests (test/server/search/search_tm_Test.php)
*
* @package Dédalo
* @subpackage Core
*/
class search_tm extends search {



	/**
	* Fixed matrix table name for time-machine queries.
	*
	* Declared here at class level so `set_up()` (which resolves the table
	* dynamically from `ar_section_tipo` but only for `get_class($this)==='search'`)
	* does not overwrite it.  This value is what causes `build_main_from_sql()`
	* (inherited from trait `from`) to emit `FROM matrix_time_machine AS <alias>`.
	* @var string $matrix_table
	*/
	// matrix_table (fixed on get main select)
	protected string $matrix_table = 'matrix_time_machine';



	/**
	* BUILD_MAIN_WHERE
	* No-op override that intentionally emits no WHERE predicate for the section tipo.
	*
	* The base-class `build_main_where()` (in `trait where`) always appends a
	* `section_tipo = $n` (or `section_tipo IN (…)`) clause to `sql_obj->main_where`.
	* `matrix_time_machine` rows can span all section tipos — filtering by tipo is
	* done through the component-level `filter_by_locators` mechanism instead, not
	* through a top-level `main_where` predicate.  Emitting the standard predicate
	* here would either produce no results (wrong tipo) or an invalid SQL column
	* reference.
	* @return void
	*/
	public function build_main_where() : void {

		// Nothing to add here. matrix_time_machine table do not have self section_tipo column.

	}//end build_main_where



	/**
	* BUILD_FULL_COUNT_SQL_QUERY_SELECT
	* Returns the SELECT fragment used when counting records (sqo->full_count === true).
	*
	* Produces `count(<alias>.section_id) as full_count`, where `<alias>` is the
	* main section tipo alias resolved during `set_up()`.  The parent's
	* `parse_sql_full_count()` wraps this in `SELECT COUNT(*) FROM (…) x`, so this
	* method only needs to produce the inner select expression.
	*
	* Note: `matrix_time_machine` rows are not unique per section_id (multiple snapshot
	* rows share the same section_id), so a bare `COUNT(section_id)` includes duplicates
	* intentionally — the caller (time-machine tool) wants total snapshot count, not
	* distinct record count.  This is consistent with the inline comment in the parent's
	* `parse_sql_full_count()`.
	*
	* @return string - SQL fragment, e.g. `count(dd623.section_id) as full_count`
	*/
	public function build_full_count_sql_query_select() : string {

		// matrix_time_machine specific
		$sql_query_select = 'count('.$this->main_section_tipo_alias.'.section_id) as full_count';

		return $sql_query_select;
	}//end build_full_count_sql_query_select


	/**
	* BUILD_SQL_QUERY_ORDER
	* Thin wrapper that delegates entirely to the parent trait implementation.
	*
	* The parent `build_sql_query_order()` (in `trait order`) already handles:
	* - Direct-column ordering (e.g. `id DESC` — the typical time-machine request).
	* - Component-based ordering via `build_sql_join()` + `build_order_select()`.
	* - Appending `build_sql_query_order_default()` as a tie-breaker.
	*
	* This override exists to make the delegation explicit for readers of this class
	* and to give a natural extension point if `search_tm`-specific order logic is
	* needed in the future (e.g. handling the `timestamp` column as a direct-column
	* shorthand).  See `build_sql_query_order_default()` for the time-machine default.
	* @return void
	*/
	public function build_sql_query_order() : void {

		// Call parent method to handle custom order from sqo->order
		parent::build_sql_query_order();
	}//end build_sql_query_order



	/**
	* BUILD_SQL_QUERY_ORDER_DEFAULT
	* Sets `timestamp DESC` as the fallback ORDER BY for time-machine queries.
	*
	* Overrides the parent implementation (which defaults to `section_id ASC/DESC`
	* depending on whether the section is the activity section) because
	* `matrix_time_machine` rows are snapshot records naturally ordered by their
	* creation timestamp — the most recent change should appear first in the
	* time-machine UI by default.
	*
	* The guard `!in_array(…)` prevents duplicate entries when this method is called
	* more than once on the same instance (e.g. via `parse_sql_filter_by_locators()`
	* and `parse_sql_default()` in the same request).
	* @return void
	*/
	public function build_sql_query_order_default() : void {

		// default order
		$string_query = 'timestamp DESC';
		if (!in_array($string_query, $this->sql_obj->order_default)) {
			$this->sql_obj->order_default[] = $string_query;
		}
	}//end build_sql_query_order_default



	/**
	* BUILD_SQL_QUERY_SELECT
	* Populates `sql_obj->select` for time-machine queries.
	*
	* Two cases:
	* 1. `sqo->full_count === true` — Delegates to `build_full_count_sql_query_select()`
	*    which returns the count expression and returns early without touching
	*    `sql_obj->select`.  This mirrors the guard in the parent's `build_sql_query_select()`
	*    but without the full-count result being added to `sql_obj->select` automatically;
	*    the parent's `parse_sql_full_count()` handles that separately.
	*
	*    (!) Note: the current implementation calls `build_full_count_sql_query_select()`
	*    for its return value but does NOT push that value into `sql_obj->select`.  The
	*    full-count path is assembled by `parse_sql_full_count()` in the parent, which
	*    builds its own SELECT expression directly from the returned string — the call
	*    here is effectively used as an early-return guard.
	*
	* 2. Normal query — Emits `SELECT *`, selecting all `matrix_time_machine` columns.
	*    This is appropriate because the table has a bounded, stable column set and
	*    the time-machine tool consumes every column.
	*
	* select_object shape (from sqo->select, unused for tm):
	* {
	*   "column" : string  — column name
	*   "key"    : string|null — component tipo
	* }
	* @return void
	*/
	public function build_sql_query_select() : void {

		// Unique column for count
		// If the SQO has active full_count set the SELECT with specific count for the section_id column
		if ( isset($this->sqo->full_count) && $this->sqo->full_count===true ) {
			$this->build_full_count_sql_query_select();
			return;
		}

		// Join all
		$this->sql_obj->select[] = '*';
	}//end build_sql_query_select



}//end class search_tm
