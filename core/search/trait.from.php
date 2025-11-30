<?php declare(strict_types=1);
/**
* CLASS SEARCH
* TRAIT from
*
*/
trait from {


	/**
	* BUILD_MAIN_FROM_SQL
	* @return void
	*/
	public function build_main_from_sql() : void {

		$main_from_sql = $this->matrix_table .' AS '. $this->main_section_tipo_alias;

		// Fix value
		$this->sql_obj->from[] = $main_from_sql;

		return;
	}//end build_main_from_sql


}//end from