<?php declare(strict_types=1);
/**
 * TRAIT SEARCH_COMPONENT_MEDIA_COMMON
 * From class component_media_common
 * Common search methods for media components
 */
trait search_component_media_common {


    
	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* Parses component SQO query
	* @param object $query_object
	* @return object|false $query_object
	* Edited/parsed version of received object
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



}//end search_component_media_common
