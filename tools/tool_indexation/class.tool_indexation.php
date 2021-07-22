<?php
/*
* CLASS TOOL_INDEXATION
*
*
*/
class tool_indexation { // extends tool_common


	public $source_component;
	public $target_component;
	public $ar_source_langs;
	public $ar_source_components;
	public $target_langs;	# From filter 'Projects'
	public $last_target_lang;
	public $section_tipo;



	/**
	* __CONSTRUCT
	*/
	public function __construct($component_obj, $modo='button') {

		# Fix modo
		$this->modo = $modo;

		# Para unificar el acceso, se copia el componente a $this->component_obj
		$this->component_obj 	= $component_obj;

		# Fix component
		$this->source_component = $component_obj;
		$this->source_component->set_modo('tool_indexation');
		#$this->source_component->set_variant( tool_indexation::$source_variant );
			#dump($component_obj,'component_obj');

		$this->section_tipo = $component_obj->get_section_tipo();
	}//end __construct



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

						
			$ar_locators = search::calculate_inverse_locators( $locator );
				dump($ar_locators, ' ar_locators ++ '.to_string());
				dump($locator, ' locator ++ '.to_string());
				die();

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


}//end class
