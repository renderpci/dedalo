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

	public $context ;	//= 'inspector'; # inspector | tool_window

	
	public function __construct($component_obj, $modo='button') {
		
		# Fix modo
		$this->modo = $modo;

		# Fix current media component
		$this->component_obj = $component_obj;
			#dump($component_obj,"component_obj");

		$this->context = new stdClass();
			$this->context->context_name = 'inspector';
	}



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

		# GET INVERSE RELATIONS TO CURRENT TAG
		# And remove it
			$locator = new locator();
				$locator->set_type(DEDALO_RELATION_TYPE_INDEX_TIPO);
				$locator->set_section_tipo($section_tipo);
				$locator->set_section_id($section_id);
				$locator->set_component_tipo($component_tipo);
				$locator->set_tag_id($tag_id);				

						
			$ar_locators = search_development2::calculate_inverse_locators( $locator );
				#dump($ar_locators, ' ar_locators ++ '.to_string());
				#dump($locator, ' locator ++ '.to_string());

			foreach ($ar_locators as $pseudo_locator) {

				if (empty($pseudo_locator->from_component_tipo)) {
					debug_log(__METHOD__." Error on locate property from_component_tipo in locator ".json_encode($pseudo_locator), logger::ERROR);
					continue;
				}

				$current_component_tipo  = $pseudo_locator->from_component_tipo;
				$current_section_tipo 	 = $pseudo_locator->from_section_tipo;
				$current_section_id   	 = $pseudo_locator->from_section_id;

				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true);
				$component 		= component_common::get_instance($modelo_name,
																 $current_component_tipo,
																 $current_section_id,
																 'edit',
																 DEDALO_DATA_NOLAN,
																 $current_section_tipo);
				$current_locator = clone($locator);
				$component->remove_locator( $current_locator );
				$component->Save();

				debug_log(__METHOD__." Deleted inverse relation in $modelo_name - $current_section_tipo - $current_component_tipo - $current_section_id - ".json_encode($pseudo_locator), logger::DEBUG);

				$response->msg[] = "Deleted locator: ".json_encode($pseudo_locator);
			}//end oreach ($ar_locators as $current_locator)


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
			$response->msg[] = "Deleted in langs ".count($ar_tag_deleted)." the tag \"$tag_id\" from component_text_area $component_tipo [$section_tipo - $section_id]";
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