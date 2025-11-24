<?php declare(strict_types=1);
/**
* CLASS SEARCH
* TRAIT WHERE
*
*/
trait where {



	/**
	* BUILD_MAIN_WHERE_SQL
	* Build and fix main_where_sql filter.
	* @return string $this->main_where_sql
	*/
	public function build_main_where_sql() : string {

		// section_tipo is always and array
		$ar_section_tipo = $this->ar_section_tipo;

		$sentences = [];

		// main section tipo filter
		$sentences[] = count($ar_section_tipo) > 1
			? '(' . $this->main_section_tipo_alias.'.section_tipo IN (\'' . implode('\',\'', $ar_section_tipo) . '\'))'
			: '(' . $this->main_section_tipo_alias.'.section_tipo = \'' . $ar_section_tipo[0] . '\')';

		// avoid root user to be include in the results
		$sentences[] = $this->main_section_tipo_alias.'.section_id>0';

		// Fix value
		$this->main_where_sql = implode(' AND ', $sentences);


		return $this->main_where_sql;
	}//end build_main_where_sql



}//end where