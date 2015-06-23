<?php
die();








/* 

	TEST ONLY 

*/













































class locator {

	/**
	* ADD LOCATOR TO DATO
	* Add element (locator) received to locators array (dato) and return resultant array
	* @param $locator
	*	locator_index Object
	* @param $dato
	*	Array of locator_index Objects
	*/
	public static function add_locator_to_dato( stdClass $locator, array $dato) {

		$locator_exists=false;
		foreach ($dato as $key => $current_locator_obj) {
			if ((object)$locator==(object)$current_locator_obj) {
				$locator_exists=true; break;				
			}
			#dump( (object)$locator == (object)$current_locator_obj ,"equal $key");
		}
			#dump($dato,"locator_exists");

		if (!$locator_exists) {			
			$dato[] = $locator;
		}

		return $dato;
	}

	/*
	public static function build_locator_from_array($current_array) {
		$locator = new locator();
		foreach ($current_array as $key => $value) {
			$locator->$key = $value;
		}	
		return $locator;
	}
	*/

}#end class locator




/**
* LOCATOR_INDEX CLASS
*/
class locator_index extends locator {

	public $section_top_tipo;
	public $section_top_id_matrix;
	public $section_id_matrix;
	public $component_tipo;
	public $tag_id;

	function __construct($section_top_tipo=null, $section_top_id_matrix=null, $section_id_matrix=null, $component_tipo, $tag_id) {
			
		if ( empty($section_top_tipo) || strpos($section_top_tipo,'dd')===false ) {
			throw new Exception("Error Processing Request: build_locator - section_top_tipo is empty", 1);
		}
		if (empty($section_top_id_matrix) || $section_top_id_matrix=='0') {
			throw new Exception("Error Processing Request: build_locator - section_top_id_matrix is empty", 1);
		}
		if (empty($section_id_matrix)) {
			throw new Exception("Error Processing build_locator Request: build_locator - section_id_matrix is empty", 1);
		}

		$this->section_top_tipo			= $section_top_tipo;
		$this->section_top_id_matrix	= $section_top_id_matrix;
		$this->section_id_matrix		= $section_id_matrix;
		$this->component_tipo 			= $component_tipo;
		$this->tag_id					= $tag_id;
	}


	/**
	* BUILD_LOCATOR
	*/
	public static function build_locator($section_top_tipo, $section_top_id_matrix, $section_id_matrix, $component_tipo, $tag_id) {
		return new locator_index($section_top_tipo, $section_top_id_matrix, $section_id_matrix, $component_tipo, $tag_id);		
	}

	




	
}
?>