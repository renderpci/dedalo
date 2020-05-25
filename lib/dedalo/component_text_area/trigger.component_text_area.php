<?php
$start_time=microtime(1);
include( dirname(dirname(__FILE__)).'/config/config4.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();


// general editor features



	/**
	* LOAD_TR
	*/
	function load_tr($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('tipo','parent','section_tipo','lang','top_tipo','top_id');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}


		$modelo_name 		 = 'component_text_area';
		$modo 				 = 'load_tr';
		$component_text_area = component_common::get_instance($modelo_name,
															  $tipo,
															  $parent,
															  $modo,
															  $lang,
															  $section_tipo);

		$html = $component_text_area->get_html();


		$response->result 	= $html;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end load_tr



	/**
	* SET_SECTION_TITLES
	* Used by new text editor
	* @return object $response
	*/
	function set_section_titles($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed (set_section_titles)';

		$vars = array('ar_locators', 'lang');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				if ($$name===false) {
					$response->msg = 'Error. Empty mandatory var '.$name;
					return $response;
				}
			}
		$ar_locators = json_decode($ar_locators);

		if (is_array($ar_locators)) {

			$result = array();
			foreach ($ar_locators as $current_string_locator) {

				$locator = json_decode( str_replace("'", '"', $current_string_locator) );
				if ($locator) {
					# get_struct_note_data from db
					$struct_note_data = tool_structuration::get_struct_note_data($locator, $lang);
					if ($struct_note_data->result!==false) {
						$result[$current_string_locator] = (object)$struct_note_data->result;
					}
				}
			}
			$response->result 	= $result;
			$response->msg 		= 'Request done successfully (set_section_titles) Total: '.count($result);
		}

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end set_section_titles



	/**
	* SHOW_STRUCTURATION_INFO
	* @return object $response
	*/
	function show_structuration_info($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('section_tipo','section_id','lang');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				# if ($name==='max_records' || $name==='offset') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}

		$section = section::get_instance($section_id, $section_tipo);

		// Section info
		$section_info = new stdClass();
			$section_info->modified_by_userID 	= $section->get_modified_by_userID();
			$section_info->modified_date 		= $section->get_modified_date();
			$section_info->created_by_userID 	= $section->get_created_by_userID();
			$section_info->created_by_user_name = $section->get_created_by_user_name();
			$section_info->created_date 		= $section->get_created_date();

		// COMPONENT_TEXT_HTML
		$ar_component_tipo = array(DEDALO_STRUCTURATION_TITLE_TIPO, DEDALO_STRUCTURATION_DESCRIPTION_TIPO);
			$html = '';
			foreach ($ar_component_tipo as $component_tipo) {

				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
				$component 	 	= component_common::get_instance($modelo_name,
																 $component_tipo,
																 $section_id,
																 'edit',
																 $lang,
																 $section_tipo);
				$html .= $component->get_html();
			}//foreach

		$structuration_info = new stdClass();
			$structuration_info->section_info 	= $section_info;
			$structuration_info->html 	    	= $html;


		$response->result 				= true;
		$response->msg 					= 'Request done successfully [show_structuration_info]';
		#$response->fragment_text 		= $fragment_text;
		#$response->indexations_list 	= $indexations_list;
		$response->structuration_info 	= isset($structuration_info) ? $structuration_info : null;

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end show_note_info



// person tag



	/**
	* LOAD_TAGS_PERSON
	* @return object $response
	*/
	function load_tags_person($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('tipo','parent','section_tipo','lang','top_tipo');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				# if ($name==='max_records' || $name==='offset') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}
			/*
			if (TOP_TIPO===false) {
				$response->msg .= ' top tipo is empty';
				return $response;
			}*/


		# Component text area build
		$modelo_name 		 = 'component_text_area';
		$modo 				 = 'load_tr';
		$component_text_area = component_common::get_instance($modelo_name,
															  $tipo,
															  $parent,
															  $modo,
															  $lang,
															  $section_tipo);
		# TAGS_PERSON
		$ar_tags_person = $component_text_area->get_tags_person($top_tipo);
			#dump($ar_tags_person, ' ar_tags_person ++ '.to_string());

		/*
		ob_start();
		include ( dirname(__FILE__) .'/html/component_text_area_persons.phtml' );
		$html =  ob_get_clean();
		*/
		$response->result 	= $ar_tags_person;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end load_tags_person




	/**
	* SHOW_PERSON_INFO
	* @return
	*/
	function show_person_info($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('locator');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				# if ($name==='max_records' || $name==='offset') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}

		if(!$locator = json_decode($locator)) {
			return (object)$response;
		}

		# Label
		$label = (object)component_text_area::get_tag_person_label($locator);

		$response = new stdClass();
			$response->result 	= $label;
			$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end show_person_info



	/**
	* PERSON_USED
	* @return array $ar_section_id
	*/
	function person_used($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('locator');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				# if ($name==='max_records' || $name==='offset') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}

		$locator = json_decode($locator);

		$ar_section_id = component_text_area::person_used($locator);
			#dump($ar_section_id, ' ar_section_id ++ '.to_string());

		$response = new stdClass();
			$response->result 	= (array)$ar_section_id;
			$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end person_used



// note tag



	/**
	* CREATE_NEW_NOTE
	* @return
	*/
	function create_new_note($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('note_number');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				# if ($name==='max_records' || $name==='offset') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}

		$response = (object)component_text_area::create_new_note();

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end create_new_note



	/**
	* SHOW_NOTE_INFO
	* @return
	*/
	function show_note_info($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('section_tipo','section_id','lang');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				# if ($name==='max_records' || $name==='offset') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}


		// COMPONENT_TEXT_HTML
		$tipo 			= DEDALO_NOTES_TEXT_TIPO;
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$component_text = component_common::get_instance($modelo_name,
														 $tipo,
														 $section_id,
														 'edit_note',
														 $lang,
														 $section_tipo);
		$component_text_html = $component_text->get_html();

		// Component publication html
		$tipo 			= DEDALO_NOTES_PUBLICATION_TIPO;
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$component_publication = component_common::get_instance($modelo_name,
														 $tipo,
														 $section_id,
														 'edit_note',
														 $lang,
														 $section_tipo);
		$component_publication_html = $component_publication->get_html();

		// SECTION INFO
		$section = section::get_instance($section_id, $section_tipo);
		$modified_by_userID 	= $section->get_modified_by_userID();
		$modified_date 			= $section->get_modified_date();
		$created_by_userID 		= $section->get_created_by_userID();
		$created_by_user_name 	= $section->get_created_by_user_name();
		$created_date 			= $section->get_created_date();


		$response->result 				= true;
		$response->msg 					= 'Request done successfully [show_note_info]';
		$response->component_text_html 	= $component_text_html . $component_publication_html;
		$response->modified_by_userID 	= $modified_by_userID;
		$response->modified_date 		= $modified_date;
		$response->created_by_userID 	= $created_by_userID;
		$response->created_by_user_name = $created_by_user_name;
		$response->created_date 		= $created_date;

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end show_note_info



	/**
	* DELETE_NOTE
	* @return object $response
	*/
	function delete_note($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('section_tipo','section_id','lang');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				# if ($name==='max_records' || $name==='offset') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}


		$section = section::get_instance($section_id, $section_tipo);
		$result  = $section->Delete($delete_mode='delete_record');
		if ($result===true) {
			$response->result 	= true;
			$response->msg 		= 'Section '.$section_tipo.' - '.$section_id.' deleted successfully [delete_note]';
		}

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end delete_note



// reference tag



	/**
	* SHOW_REFERENCE_INFO
	* @return object $response
	*/
	function show_reference_info($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('data','lang');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				# if ($name==='max_records' || $name==='offset') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}

		$user_id 		= navigator::get_user_id();
		$temp_id		= DEDALO_SECTION_ID_TEMP.'_reference_'.$user_id;

		$component_tipo = DEDALO_TS_REFERENCES_COMPONENT_TIPO;
		$section_tipo 	= DEDALO_TS_REFERENCES_SECTION_TIPO;
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true); // 'component_autocomplete_hi'
		$component 		= component_common::get_instance($modelo_name,
														 $component_tipo,
														 $temp_id,
														 'edit',
														 DEDALO_DATA_NOLAN,
														 $section_tipo);
		// Inject custom propiedades
			// $propiedades = json_decode('{
			//   "source": {
			//     "mode": "autocomplete",
			//     "hierarchy_types": [1],
			//     "hierarchy_sections": []
			//   },
			//   "value_with_parents": false,
			//   "limit": 1
			// }');
			// $component->set_propiedades( $propiedades );


		# Inject custom permissions
		$component->set_permissions(2);
		if ($data = json_decode($data)) {
			$component->set_dato($data);
		}
		# Component html
		$response->component_html = $component->get_html();

		$response->result 	= true;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end show_reference_info



// image tag



	/**
	* SHOW_IMAGE_INFO (image selectors)
	* @return object $response
	*/
	function show_image_info($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
			// data : locator already existing in tag element or null
			// section_tipo : section tipo of current caller component
			// component_tipo : tipo of current caller component
			$vars = array('data','component_tipo');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				if ($name==='data') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}

				dump($data, ' data ++ '.to_string());

		// properties
			$RecordObj_dd 	= new RecordObj_dd($component_tipo);
			$properties 	= $RecordObj_dd->get_propiedades(true);
			$image_tag 		= property_exists($properties, 'image_tag') ? $properties->image_tag : false;
			if (empty($image_tag)) {
				$response->msg .= ' - image_tag is not defined in component properties (tipo: '.$component_tipo.')';
				return $response;
			}

		// DEDALO_IMAGE_TAGS_SECTION_TIPO
		// DEDALO_IMAGE_TAGS_COMPONENT_PORTAL_TIPO

		#$image_tag->component_tipo = 'rsc88';
		$image_tag->component_tipo 	= 'hierarchy102';
		$image_tag->section_tipo 	= 'on1';

		// temp_id
			$temp_id = DEDALO_SECTION_ID_TEMP.'_image_'.navigator::get_user_id();

		// section. remove previous session value if exists
			// $temp_data_uid = $image_tag->section_tipo.'_'.$temp_id;
			// if (isset($_SESSION['dedalo4']['section_temp_data'][$temp_data_uid])) {
			// 	unset($_SESSION['dedalo4']['section_temp_data'][$temp_data_uid]);
			// }

		// component (portal)
			$model = RecordObj_dd::get_modelo_name_by_tipo($image_tag->component_tipo, true); // component_portal expected
			if ($model!=='component_portal') {
				$response->msg .= ' - wrong model defined in properties (tipo: '.to_string($image_tag->component_tipo).'). Expected model is "component_portal" ';
				return $response;
			}
			$component 		= component_common::get_instance($model,
															 DEDALO_IMAGE_TAGS_COMPONENT_PORTAL_TIPO,
															 $temp_id,
															 'edit',
															 DEDALO_DATA_NOLAN,
															 DEDALO_IMAGE_TAGS_SECTION_TIPO,
															 false);


			# Inject custom permissions
			$component->set_permissions(2);
			$component->set_dato($data);
			$component->Save(); // save into session data (important (!))

			# Component html
			$component_html = $component->get_html();

		// response ok
			$response->result 			= true;
			$response->component_html 	= $component_html;
			$response->msg 				= 'Ok. Request done ['.__FUNCTION__.']';

		// Debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
					foreach($vars as $name) {
						$debug->{$name} = $$name;
					}

				$response->debug = $debug;
			}


		return (object)$response;
	}//end show_image_info


