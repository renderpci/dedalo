<?php declare(strict_types=1);
/**
* TRAIT FROM
* Provides the FROM-clause builder for the search class.
*
* Isolates the single responsibility of registering the primary matrix table
* (and its alias) in the SQL fragment object before any JOIN, WHERE, or
* SELECT clause is assembled. Keeping this in its own file makes the split of
* the otherwise large search class symmetric with trait.select.php,
* trait.where.php, trait.order.php, and trait.count.php.
*
* The trait is consumed exclusively by class search (and its subclasses
* search_tm and search_related), which declare the properties it reads:
*   - $this->matrix_table          — the PostgreSQL table to query (e.g. 'matrix_oh1')
*   - $this->main_section_tipo_alias — the SQL alias for that table in the query
*   - $this->sql_obj->from         — the array of FROM-clause fragments being built
*
* build_union_query() (in class.search.php) depends on the exact string that
* build_main_from_sql() pushes into sql_obj->from: it searches for the
* literal substring 'FROM <matrix_table> AS <alias>' to replace it per
* UNION branch. Any format change here must be mirrored there.
*
* @package Dédalo
* @subpackage Core
*/
trait from {



	/**
	* BUILD_MAIN_FROM_SQL
	* Registers the primary matrix table and its SQL alias as the first entry in
	* the sql_obj->from fragment array.
	*
	* Called as step 1 in every parse_sql_* pipeline (parse_sql_default,
	* parse_sql_full_count, parse_sql_filter_by_locators) because all subsequent
	* clause builders — SELECT DISTINCT ON, WHERE, ORDER JOIN — reference the
	* alias produced here. Running it first guarantees that the alias is
	* available when build_sql_join() appends LEFT JOINs and when
	* build_union_query() substitutes the table name for each UNION branch.
	*
	* The alias is derived from main_section_tipo (trimmed to a short prefix +
	* numeric id, e.g. 'oh1') or the literal string 'mix' when the SQO spans
	* more than one section_tipo. Using an alias rather than the raw table name
	* keeps all clause references stable during UNION rewriting.
	*
	* (!) build_union_query() performs a verbatim string search for
	*     'FROM <matrix_table> AS <alias>' inside the assembled query to swap the
	*     table name per branch. The format produced here must not be changed
	*     without updating that search needle.
	*
	* @return void
	*/
	public function build_main_from_sql() : void {

		// Compose the primary FROM fragment: '<table> AS <alias>'.
		// The alias (main_section_tipo_alias) is either a trimmed tipo like 'oh1'
		// or 'mix' when the query covers multiple section_tipos.
		$main_from_sql = $this->matrix_table .' AS '. $this->main_section_tipo_alias;

		// Fix value
		$this->sql_obj->from[] = $main_from_sql;

		return;
	}//end build_main_from_sql



}//end from