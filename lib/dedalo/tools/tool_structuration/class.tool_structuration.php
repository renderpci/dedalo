<?php
/*
* CLASS TOOL_STRUCTURATION
* Manages table of contents tags
*
*/
class tool_structuration extends tool_common {
	
	# Media component
	protected $component_obj ;

	# Tag label selected in component_text_area .Received when load inspector info trigger is called like [/index-n-1]
	public $selected_tagName ;

	
	public function __construct($component_obj, $modo='button') {
		
		# Fix modo
		$this->modo = $modo;

		# Fix current text component
		$this->component_obj = $component_obj;
	}//end __construct



	/**
	* UPDATE_PREVIEW
	* @return 
	*//*
	public static function update_preview( $request_options ) {
		
		$options = new stdClass();
			$options->section_tipo  = null;
			$options->section_id 	= null;
			$options->component_tipo= null;
			$options->lang 			= null;

			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($options->component_tipo,true);
		$component 		= component_common::get_instance($modelo_name,
														 $options->component_tipo,
														 $options->section_id,
														 'list',
														 $options->lang,
														 $options->section_tipo);
		$dato = $component->get_dato();

		#

	}//end update_preview
	*/



	/**
	* GET_STRUCT_NOTE_DATA
	* Get record from locator and return all information about
	* @return object $response
	*/
	public static function get_struct_note_data( $locator, $lang ) {
		
		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed (get_struct_note_data)';

		$ar_data = array();

		#
		# ORDER
		$tipo 			= DEDALO_STRUCTURATION_ORDER_TIPO;
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$component 		= component_common::get_instance($modelo_name,
														 $tipo,
														 $locator->section_id,
														 'list',
														 $lang,
														 $locator->section_tipo);

		$ar_data['order'] = $component->get_valor();

		#
		# TITLE
		$tipo 			= DEDALO_STRUCTURATION_TITLE_TIPO;
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$component 		= component_common::get_instance($modelo_name,
														 $tipo,
														 $locator->section_id,
														 'list',
														 $lang,
														 $locator->section_tipo);

		$ar_data['title'] = $component->get_valor();

		$response->result 	= $ar_data;
		$response->msg 		= 'Request done successfully';

		return $response;
	}//end get_struct_note_data



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
		# Delete all references to current tag in component_relation_struct
		$ar_index_deleted = (array)component_relation_struct::delete_tag_indexations($component_tipo, $section_tipo, $section_id, $tag_id, $lang);
			#dump($ar_index_deleted, ' ar_index_deleted ++ '.to_string());
			$response->msg[] = "Deleted ".count($ar_index_deleted)." indexations ";		
			$response->debug['index_deleted'] = $ar_index_deleted;	

		#
		# TEXT AREA
		# Remove tag from text
		$component_text_area = component_common::get_instance('component_text_area',
															  $component_tipo,
															  $section_id,
															  'edit',
															  $lang,
															  $section_tipo);		
		$ar_tag_deleted = (array)$component_text_area->delete_tag_from_all_langs($tag_id, $tag_type='struct'); // note that "tag" is complete in or out tag like [index-n-8]
			$response->msg[] = "Deleted in langs ".count($ar_tag_deleted)." the tag \"$options->tag_id\" from component_text_area $component_tipo [$section_tipo - $section_id]";
			$response->debug['ar_tag_deleted'] = $ar_tag_deleted;	
				
		
		
		$response->msg 	  = implode(PHP_EOL, $response->msg);	
		$response->result = true;

		return (object)$response;
	}//end delete_tag


	
}//end class tool_structuration
?>