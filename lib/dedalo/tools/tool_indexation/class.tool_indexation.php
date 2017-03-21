<?php
/*
* CLASS TOOL IMAGE VERSION
*/
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
require_once(DEDALO_LIB_BASE_PATH . '/common/class.TR.php');


class tool_indexation extends tool_common {
	
	# media component
	protected $component_obj ;

	# Tag label selected in component_text_area .Received when load inspector info trigger is called like [/index-n-1]
	public $selected_tagName ;

	public $context = 'inspector'; # inspector | tool_window

	
	public function __construct($component_obj, $modo='button') {
		
		# Fix modo
		$this->modo = $modo;

		# Fix current media component
		$this->component_obj = $component_obj;
			#dump($component_obj,"component_obj");
	}



	/**
	* GET_AR_INVERSE
	* Format, filter and sort inverse_locators values for use in selector
	* @return array $ar_inverse
	*//* MOVED TO TOOL_COMMON
	public function get_ar_inverse( $inverse_locators ) {
		$ar_inverse=array();

		$section_name = RecordObj_dd::get_termino_by_tipo( TOP_TIPO );
		foreach ((array)$inverse_locators as $current_locator) {
			if ($current_locator->section_tipo!=TOP_TIPO) {
				continue;
			}			
			$ar_inverse[$current_locator->section_id] = "$section_name - $current_locator->section_id";				
		}
		natsort($ar_inverse);
		
		return $ar_inverse;
	}#end get_ar_inverse
	*/



	/**
	* DELETE_TAG
	* @param object $request_options
	* @return object $response
	* Deletes all tag relations (index and portal) and finally removes the tag in all langs
	* @see trigger.tool_indexation.php
	*/
	public static function delete_tag( $request_options ) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= [];
		
		$options = new stdClass();
			$options->section_tipo 	= null;
			$options->section_id 	= null;
			$options->component_tipo= null;
			$options->tag_id 		= null;
			$options->lang 			= null;
			foreach ($request_options as $key => $value) {
				if (property_exists($options, $key)) {
					$options->$key = $value;
					$$key = $value; // Create simple variables for easy select
				}
			}

		#
		# INDEX
		# Delete all references to current tag in component_relation_index
		$ar_index_deleted = (array)component_relation_index::delete_tag_indexations($component_tipo, $section_tipo, $section_id, $tag_id, $lang);
			#dump($ar_index_deleted, ' ar_index_deleted ++ '.to_string());
			$response->msg[] = "Deleted ".count($ar_index_deleted)." indexations ";		
			$response->debug['index_deleted'] = $ar_index_deleted;
			

		#
		# PORTALS
		# Delete all references to current tag in component_portal
		$ar_pointer_deleted = (array)component_portal::delete_tag_pointers($component_tipo, $section_tipo, $section_id, $tag_id, $lang);
			$response->msg[] = "Deleted ".count($ar_pointer_deleted)." portal pointers ";	
			$response->debug['portal_pointers_deleted'] = $ar_pointer_deleted;		


		#
		# TEXT AREA
		# Remove tag from text
		$component_text_area = component_common::get_instance('component_text_area',
															  $component_tipo,
															  $section_id,
															  'edit',
															  $lang,
															  $section_tipo);		
		$ar_tag_deleted = (array)$component_text_area->delete_tag_from_all_langs($tag_id, $tag_type='index'); // note that "tag" is complete in or out tag like [index-n-8]
			$response->msg[] = "Deleted in langs ".count($ar_tag_deleted)." the tag \"$tag\" from component_text_area $component_tipo [$section_tipo - $section_id]";
			$response->debug['ar_tag_deleted'] = $ar_tag_deleted;	
				
		
		
		$response->msg 	  = implode(PHP_EOL, $response->msg);	
		$response->result = true;

		return (object)$response;
	}//end delete_tag



	/**
	* NEW_INDEX_DATA_RECORD
	* @return object $response
	*/
	public static function new_index_data_record() {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed';

		#$user_id = navigator::get_user_id();
		$section_tipo = DEDALO_INDEXATION_SECTION_TIPO;

		$section 	= section::get_instance(null, $section_tipo);
		$section_id = $section->Save();

		$locator = new locator();
			$locator->set_section_tipo($section_tipo);
			$locator->set_section_id($section_id);
		
		$response->result = $locator;
		$response->msg 	  = 'Created new_index_data_record successfully with locator: '.json_encode($locator);

		return (object)$response;
	}//end new_index_data_record
	

	
}
?>