<?php declare(strict_types=1);
/**
* CLASS SEARCH_TM
*
*
*/
class search_tm extends search {



	// matrix_table (fixed on get main select)
	protected string $matrix_table = 'matrix_time_machine';



	/**
	* BUILD_FULL_COUNT_SQL_QUERY_SELECT
	* @return string $sql_query_select
	*/
	public function build_full_count_sql_query_select() : string {

		// matrix_time_machine specific
		$sql_query_select = 'count('.$this->main_section_tipo_alias.'.section_id) as full_count';

		return $sql_query_select;
	}//end build_full_count_sql_query_select


	/**
	* BUILD_SQL_QUERY_ORDER
	* Creates the SQL to order based on search_query_object order property
	* @return void
	*/
	public function build_sql_query_order() : void {

		$string_query = 'id DESC';

		$this->sql_obj->order[] = $string_query;
		$this->sql_obj->order_default[] = $string_query;
	}//end build_sql_query_order



	/**
	* BUILD_SQL_FILTER_BY_LOCATORS_ORDER
	* @return void
	*/
	public function build_sql_filter_by_locators_order() : void {

		$string_query = 'id DESC';

		$this->sql_obj->order[] = $string_query;
	}//end build_sql_filter_by_locators_order



	/**
	* BUILD_SQL_QUERY_SELECT
	* select_object sample:
	* {
	* 	"column" : "relation" string column name
	* 	"key": "oh25" string|null component tipo
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

		$ar_sql_select = [];
		
		// Add all columns
		$ar_sql_select[] = '*';

		// Add order columns to select when needed
		foreach ((array)$this->order_columns as $select_line) {
			$ar_sql_select[] = $select_line;
		}

		// Join all
		$this->sql_obj->select[] = implode(','.PHP_EOL, $ar_sql_select);
	}//end build_sql_query_select



}//end class search_tm
