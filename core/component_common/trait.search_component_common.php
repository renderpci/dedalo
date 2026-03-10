<?php declare(strict_types=1);
/**
* TRAIT SEARCH_COMPONENT_COMMON
* From class component_common
* Common search methods for components
*/
trait search_component_common {



	/**
	* BUILD_ORDER_SELECT
	* Build the SELECT column sentence used to ORDER BY a component's value.
	* It extracts the value from the component's JSONB data.
	* @param object $options {
	* 	@var string $table_name The alias or name of the table (e.g., 'mix' or 'rs197_rs279_dd64').
	* 	@var string $column The data column name (e.g., 'string', 'text', 'section_id').
	* 	@var string $lang The language code to filter by (e.g., 'lg-spa', 'nolan').
	* 	@var string $component_tipo The ontology tipo of the component.
	* 	@var string $alias The alias for the resulting sort column.
	* }
	* @return string $select_sentence
	*/
	public static function build_order_select(object $options) : string {

		$table_name		= $options->table_name;
		$column			= $options->column;
		$lang			= $options->lang;
		$component_tipo	= $options->component_tipo;
		$alias			= $options->alias;

		/*
		* SQL Example:
		* (jsonb_path_query_first(
		* 	rs197_rs279_dd64.string->'dd62',
		* 	'$[*] ? (@.lang == "lg-spa").value',
		* 	'{}'
		* ) #>> '{}') AS dd62_order
		*
		* Note: We use jsonb_path_query_first with a filter to efficiently extract the specific language value.
		*/

		// select sentence add as order column
		$select_sentence  = "(jsonb_path_query_first(";
		$select_sentence .= "{$table_name}.{$column}->'{$component_tipo}',";
		$select_sentence .= "'$[*].value'";
		$select_sentence .= ") #>> '{}') AS $alias";


		return $select_sentence;
	}//end build_order_select



}//end search_component_common