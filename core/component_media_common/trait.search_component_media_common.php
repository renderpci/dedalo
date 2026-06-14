<?php declare(strict_types=1);
/**
* TRAIT SEARCH_COMPONENT_MEDIA_COMMON
* Search integration stubs for all media component families in Dédalo.
*
* This trait is mixed into component_media_common (and therefore into every concrete
* media component: component_3d, component_av, component_image, component_pdf,
* component_svg). It fulfils two roles within the SQO → SQL search pipeline:
*
* 1. resolve_query_object_sql() — intentional no-op that returns false, signalling to
*    the search engine that media components cannot currently be filtered by value.
*    Media data (file paths, sizes, dates) is not indexed for full-text or predicate
*    search. Any SQO targeting a media component is silently dropped with an ERROR log.
*
* 2. build_order_select() — provides a media-specific override of the generic
*    ORDER BY expression builder defined in search_component_common. Instead of the
*    generic '$[*].value' JSONPath, this version dives into the nested files_info
*    array and extracts 'original_file_name', which is the human-supplied upload
*    filename used as the sort key for media records (e.g. 'montaje3.jpg').
*
* Relationship to the search pipeline:
*   Client SQO → sanitize_client_sqo → section::conform_filter
*              → component model::resolve_query_object_sql (returns false here)
*              → SQO discarded / search continues without this filter.
*
*   ORDER BY path:
*   trait.order::build_sql_query_order() → $model::build_order_select() [this trait]
*              → SQL SELECT fragment added to sql_obj->select
*              → ORDER BY <alias> referenced in the outer query.
*
* Data shape targeted by build_order_select():
*   The JSONB media column stores an array of data objects. Each data object has:
*     {
*       "files_info": [{"quality": "original", "file_name": "...", ...}, …],
*       "original_file_name": "montaje3.jpg",   ← sort key extracted here
*       "original_normalized_name": "dd522_dd128_1.jpg",
*       …
*     }
*
* @see class.component_media_common.php      host class that uses this trait
* @see trait.search_component_common.php     generic fallback build_order_select
* @see core/search/trait.order.php           dispatcher that calls build_order_select()
*
* @package Dédalo
* @subpackage Core
*/
trait search_component_media_common {



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* Intentional no-op: media components are not currently searchable by value.
	*
	* This method satisfies the search contract (every component must expose
	* resolve_query_object_sql) but always returns false to signal to the search
	* engine that no SQL WHERE predicate can be built for this component type.
	* The incoming SQO is logged at ERROR level so developers know a search
	* request reached a media component, which indicates a configuration error
	* in the caller's SQO.
	*
	* When the pipeline receives false from this method, the SQO filter for the
	* media component is dropped and the broader search continues unaffected.
	*
	* @param object $query_object - The incoming Search Query Object; not mutated.
	* @return object|false        - Always returns false (media not searchable).
	*/
	public static function resolve_query_object_sql(object $query_object) : object|false {

		// media components are not searchable at now
		debug_log(__METHOD__
			. " media components are not searchable at now " . PHP_EOL
			. ' query_object: ' . to_string($query_object)
			, logger::ERROR
		);


		return false;
	}//end resolve_query_object_sql



	/**
	* BUILD_ORDER_SELECT
	* Build the SELECT column sentence used to ORDER BY a component's value.
	* It extracts the file info original_file_name from the component's JSONB data.
	*
	* Media-specific override of the generic build_order_select in
	* search_component_common. Instead of sorting on '$[*].value' (the generic
	* per-language slot), this implementation targets the 'original_file_name'
	* key nested inside the files_info array of the media JSONB column. This is
	* the human-supplied upload filename (e.g. 'montaje3.jpg') and is the most
	* meaningful sort key available for media records.
	*
	* Generated SQL pattern:
	*   (jsonb_path_query_first(
	*       <table_name>.<column>->'<component_tipo>',
	*       '$[*].files_info.[*].original_file_name'
	*   ) #>> '{}') AS <alias>
	*
	* The '#>> '\''{}'\'' operator unwraps the jsonb scalar result to plain SQL text.
	* The alias is consumed by the ORDER BY clause added by the caller
	* (trait.order::build_sql_query_order()).
	*
	* (!) NOTE — $entry_point is hard-coded to 'original_file_name' with a @TODO
	* comment; other per-file keys (e.g. 'file_size', 'upload_date') are not
	* yet exposed for sorting. Extend $entry_point logic here when needed.
	*
	* (!) POTENTIAL BUG — 'original_file_name' lives at the TOP level of each
	* data object, NOT inside 'files_info'. The JSONPath
	* '$[*].files_info.[*].original_file_name' descends into files_info items
	* and then looks for 'original_file_name' on each item, where it does not
	* exist per the documented data shape. The correct path for the top-level
	* field would be '$[*].original_file_name'. This may silently return NULL
	* for all rows, effectively making sort by media original_file_name a no-op.
	* DO NOT change the path here — flag for the owning team to verify and fix.
	*
	* (!) STALE COMMENT — the inline SQL example and the "language value" note
	* are copy-pasted from the generic build_order_select in
	* search_component_common. Media components have no per-language structure;
	* that comment does not apply here and should be removed when the code is
	* next modified.
	*
	* @param object $options {
	*   @var string $table_name     Table alias or name in the query
	*                               (e.g. 'mix', 'rs197_rs279_dd64').
	*   @var string $column         JSONB data column on that table
	*                               (e.g. 'media', 'av').
	*   @var string $component_tipo Ontology tipo of the component (e.g. 'dd522');
	*                               used as the top-level JSONB key.
	*   @var string $alias          SQL alias for the extracted sort column
	*                               (e.g. 'dd522_order').
	* }
	* @return string $select_sentence  Ready-to-embed SQL SELECT fragment with alias.
	*/
	public static function build_order_select(object $options) : string {

		$table_name		= $options->table_name;
		$column			= $options->column;
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

		// entry point. Default is 'original_file_name'
		// @TODO: Dynamically change to use others for sort records.
		$entry_point = 'original_file_name';

		// select sentence add as order column
		$select_sentence  = "(jsonb_path_query_first(";
		$select_sentence .= "{$table_name}.{$column}->'{$component_tipo}',";
		$select_sentence .= "'$[*].files_info.[*].{$entry_point}'";
		$select_sentence .= ") #>> '{}') AS $alias";


		return $select_sentence;
	}//end build_order_select




}//end search_component_media_common
