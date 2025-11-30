<?php declare(strict_types=1);
/**
* CLASS SEARCH_TM
*
*
*/
class search_tm extends search {



	# matrix_table (fixed on get main select)
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
	* BUILD_SQL_FILTER_BY_LOCATORS_ORDER
	* @return string $string_query
	*/
	public function build_sql_filter_by_locators_order() : string {

		$string_query = 'ORDER BY id DESC';

		return $string_query;
	}//end build_sql_filter_by_locators_order



	/**
	* BUILD_SQL_QUERY_SELECT
	* @return true
	*/
	public function build_sql_query_select() : true {

		if ($this->sqo->full_count===true) {
				$this->sql_obj->select[] = $this->build_full_count_sql_query_select();
			return true;
		}

		$search_query_object = $this->search_query_object;

		$ar_sql_select = [];
		$ar_key_path   = [];

		$ar_sql_select[] = '*';

		# Add order columns to select when needed
			foreach ((array)$this->order_columns as $select_line) {
				$ar_sql_select[] = $select_line;
			}

		# Join all
			$this->sql_obj->select[] = implode(','.PHP_EOL, $ar_sql_select);


		return true;
	}//end build_sql_query_select



}//end class search_tm
