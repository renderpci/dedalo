<?php declare(strict_types=1);
/**
* TRAIT SEARCH_COMPONENT_COMMON
* Last-resort fallback search helpers mixed into every component via component_common.
*
* Responsibilities:
* - Provides build_order_select(), the baseline ORDER BY expression builder that
*   component families without a specialised override inherit automatically.
* - Acts as the catch-all used by component_common::build_order_select() when the
*   component class does not override it with a family-specific variant (e.g.
*   search_component_string_common, search_component_media_common,
*   search_component_section_id).
*
* Key difference from family-specific overrides:
* - This version uses the JSONPath expression '$[*].value' (no language filter).
*   Family-specific overrides such as search_component_string_common use
*   '$[*] ? (@.lang == $lang).value' to select a specific language slot.
*   The common version is therefore correct only for component types that store
*   data WITHOUT a per-language structure (e.g. single-value, non-translatable
*   scalar arrays whose items have a 'value' key but no 'lang' key).
*
* Inheritance / usage:
* - Used by: component_common (via `use search_component_common`).
* - component_common is the abstract parent of all Dédalo components.
* - Specific components or their family traits may shadow build_order_select()
*   with their own implementation; PHP trait precedence rules then apply.
*
* @see trait.search_component_sql_builder.php   shared SQO-parsing helpers
* @see trait.search_component_string_common.php  string-family override with lang filter
* @see trait.search_component_media_common.php   media-family override (original_file_name)
* @see trait.search_component_section_id.php     section_id override (direct column, no JSONB)
* @see core/search/trait.order.php               caller that dispatches to build_order_select()
*
* @package Dédalo
* @subpackage Core
*/
trait search_component_common {



	/**
	* BUILD_ORDER_SELECT
	* Builds the SQL SELECT fragment that exposes a component's sortable value as a
	* named column, which ORDER BY can then reference by alias.
	*
	* This is the generic fallback for components that store data in a JSONB column
	* as an array of objects each containing a 'value' key but NO 'lang' key (i.e.
	* non-translatable components). For translatable string components the override
	* in search_component_string_common adds a jsonb-path language predicate.
	*
	* Generated SQL pattern:
	*   (jsonb_path_query_first(
	*       <table_name>.<column>->'<component_tipo>',
	*       '$[*].value'
	*   ) #>> '{}') AS <alias>
	*
	* The '#>> '\''{}'\'' operator coerces the jsonb scalar result to a plain SQL text
	* value, which is what ORDER BY requires. NULLS LAST is appended by the caller
	* (search::build_sql_query_order()).
	*
	* (!) NOTE — $options->matrix_table and $options->lang are passed by the caller
	* (trait.order, build_order_select call) but are NOT read here. The common
	* implementation intentionally ignores lang because it targets non-language-keyed
	* data. If a component stored in a language-keyed structure ends up routed here
	* (no override), sorting will still work but will match the first element regardless
	* of the requested language.
	*
	* @param object $options {
	*   @var string $table_name    Table alias or name in the query (e.g. 'mix', 'rs197_rs279_dd64').
	*   @var string $column        JSONB data column on that table (e.g. 'string', 'relation', 'misc').
	*   @var string $lang          Language code supplied by the caller — NOT used in this implementation.
	*   @var string $component_tipo Ontology tipo of the component (e.g. 'dd62'); used as the JSONB key.
	*   @var string $alias         SQL alias for the extracted sort column (e.g. 'dd62_order').
	*   @var string $matrix_table  Matrix table name supplied by the caller — NOT used here.
	* }
	* @return string $select_sentence  Ready-to-embed SQL SELECT fragment with alias.
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