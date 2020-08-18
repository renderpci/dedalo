<?php
/**
* DD_CORE_API
* Manage API RESP data with Dédalo
*
*/
class dd_core_api {



	// Version. Important!
		static $version = "1.0.0";  // 05-06-2019

	// ar_dd_objects . store current ar_dd_objects received in context to allow external access (portals, etc.)
		static $ar_dd_objects;

	// $request_ddo . store current ddo items added by get_config_context methods (portals, etc.)
		static $request_ddo = [];

	// dd_request . store current dd_request received in context to allow external access (portals, etc.)
		static $dd_request;


	/**
	* __CONSTRUCT
	* @return bool
	*//*
	public function __construct() {

		return true;
	}//end __construct
	*/



	/**
	* CREATE
	* @return array $result
	*/
	static function create($json_data) {

		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('section_tipo');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				# if ($name==='max_records' || $name==='offset') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}

		# FIX SECTION TIPO
		define('SECTION_TIPO', $section_tipo);

		$section = section::get_instance( NULL, $section_tipo );

		# Section save returns the section_id created
		$section_id = $section->Save();

		// OJO : Aquí, cuando guardemos las opciones de búsqueda, resetearemos el count para forzar a recalculat el total
		//		 esto está ahora en 'section_records' pero puede cambiar..
			// Update search_query_object full_count property
				// $search_options = section_records::get_search_options($section_tipo);
				// if (isset($search_options->search_query_object)) {
				// 	$search_options->search_query_object->full_count = true; // Force re-count records
				// }

		$response->result 	= $section_id;
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
	}//end create



	/**
	* READ
	* @param object $json_data
	*	arrray $json_data->context
	* @return object $result
	*	array $result->context
	*	array $result->data
	*/
	static function read($json_data) {
		global $start_time;

		//session_write_close();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// context accept object and array of objects
			$dd_request = $json_data->dd_request;
			// dump($dd_request, ' read - $dd_request ++ '.to_string());
			// debug_log(__METHOD__." API DD_REQUEST ".str_repeat("==", 40).PHP_EOL.json_encode($dd_request, JSON_PRETTY_PRINT).PHP_EOL.str_repeat("==", 84), logger::DEBUG);

		// test 'test159' (Checking time machine)
			$dd_request99 = json_decode('
				[
				  {
				    "typo": "sqo",
				    "id": "a",
				    "mode": "tm",
				    "section_tipo": [
				      "test65"
				    ],
				    "filter_by_locators": [{
				        "section_tipo": "test65",
				        "section_id": "1",
				        "tipo": "test159",
				        "lang": "lg-eng"
				      }],
				    "full_count": false,
				    "limit": 10,
				    "offset": 0,
				    "order": [{
				        "direction": "DESC",
				        "path": [{
				            "component_tipo": "id"
				          }]
				      }]
				  },
				  {
				    "model": "component_input_text",
				    "tipo": "test159",
				    "section_tipo": "test65",
				    "mode": "list",
				    "parent": "test158",
				    "typo": "ddo",
				    "type": "component",
				    "label": "Input text X",
				    "debug_from": "calculated from section list or related terms"
				  },
				  {
				    "typo": "source",
				    "action": "search",
				    "model": "section",
				    "tipo": "test65",
				    "section_tipo": "test65",
				    "section_id": null,
				    "mode": "tm",
				    "lang": "lg-eng",
				    "pagination": {
				      "total": {},
				      "offset": 0
				    }
				  }
				]
			');
			// dump($dd_request, ' context 2 ++ '.to_string());

		$json_rows = self::build_json_rows($dd_request);

		$result = $json_rows;

		$response->result	= $result;
		$response->msg		= 'Ok. Request done';

		// Debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time = exec_time_unit($start_time,'ms')." ms";

				$response->debug = $debug;
			}

		return (object)$response;
	}//end read



	/**
	* SAVE
	* @return array $result
	*/
	static function save($json_data) {
		global $start_time;

		//session_write_close();

		// create the default save response
		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// get the context and data sended
		$context	= $json_data->context;
		$data		= $json_data->data;
		$section_id	= $json_data->section_id;

		//get the type of the dd_object that is calling to update
		$context_type = $context->type;
		// switch the type (component, section)
		switch ($context_type) {
			case 'component':

				// get the component information
					$model			= $context->model;
					$tipo			= $context->tipo;
					$section_tipo	= $context->section_tipo;
					$lang			= $context->lang;
					$changed_data	= $data->changed_data;

					$RecordObj_dd	= new RecordObj_dd($tipo);
					$component_lang	= $RecordObj_dd->get_traducible()==='si' ? $lang : DEDALO_DATA_NOLAN;

				// build the component
					$component = component_common::get_instance( $model,
																 $tipo,
																 $section_id,
																 'edit',
																 $component_lang,
																 $section_tipo);
				// get the component permisions
					$permissions = $component->get_component_permissions();
				// check if the user can update the component
					if($permissions < 2) return $response;

				// update the dato with the changed data sended by the client
					$component->update_data_value($changed_data);
				// save the new data to the component
					$component->Save();

				// force reacalculate dato
					$dato = $component->get_dato();

				// element json
					$get_json_options = new stdClass();
						$get_json_options->get_context 	= true;
						$get_json_options->get_data 	= true;
					$element_json = $component->get_json($get_json_options);

				// observers_data
					if (isset($component->observers_data)) {
						$element_json->data = array_merge($element_json->data, $component->observers_data);
					}

				// data add
					$result = $element_json;

				break;

			default:
				# code...
				break;
		}//end switch ($context_type)

		// result. if the process is correct, we return the $result to the client
			$response->result 	= $result;
			$response->msg 	  	= 'Ok. Request done';

		// Debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
					$debug->json_data 	= $json_data;

				$response->debug = $debug;
				// dump($debug->exec_time, ' debug->exec_time ++ '.to_string());
			}


		return (object)$response;
	}//end save



	/**
	* DELETE
	* @return array $result
	*/
	function delete($json_data) {

	}//end delete



	/**
	* COUNT
	* @param object $json_data
	* @return object $response
	*/
	static function count($json_data) {
		global $start_time;

		////////////session_write_close();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		$search_query_object = $json_data->sqo;

		// search
			$search	= search::get_instance($search_query_object);
			$total	= $search->count();
			$result	= $total;

		// Debug
			if(SHOW_DEBUG===true) {
				$result->debug  = $result->debug ?? new stdClass();
				$result->debug->exec_time = exec_time_unit($start_time,'ms')." ms";
			}

		$response->result 		= $result;
		$response->msg 	  		= 'Ok. Request done';

		return (object)$response;
	}//end count



	/**
	* GET_ELEMENT_CONTEXT
	* Used by search.get_component(source) calling data_manager
	* @param object $json_data
	* @return object $response
	*/
	public static function get_element_context($json_data){

		//////////session_write_close();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// vars from json_data
			$source			= $json_data->source;

			$tipo			= $source->tipo;
			$section_tipo	= $source->section_tipo ?? $source->tipo;
			$model			= $source->model ?? RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$lang			= $source->lang ?? DEDALO_DATA_LANG;
			$mode			= $source->mode ?? 'list';

		// build element
			switch (true) {
				case $model==='section':
					$element = section::get_instance(null, $section_tipo);
					break;

				case $model==='section_tm':
					$section_id 	= $source->section_id;
					$element 		= section_tm::get_instance($section_id, $section_tipo);
					// set dd_request (source)
					$element->set_dd_request([$source]); // inject whole source
					break;

				case strpos($model, 'area')===0:
					$element = area::get_instance($model, $tipo, $mode);

					break;

				case strpos($model, 'component')!==false:
					$RecordObj_dd	= new RecordObj_dd($tipo);
					$component_lang	= $RecordObj_dd->get_traducible()==='si' ? $lang : DEDALO_DATA_NOLAN;

					$element = component_common::get_instance($model,
															  $tipo,
															  null,
															  $mode,
															  $component_lang,
															  $section_tipo);
					break;

				default:
					#throw new Exception("Error Processing Request", 1);
					$response->msg = 'Error. model not found: '.$model;
					return $response;
					break;
			}

		// element json
			$get_json_options = new stdClass();
				$get_json_options->get_context	= true;
				$get_json_options->get_data		= false;
			$element_json = $element->get_json($get_json_options);

		// context add
			$context = $element_json->context; //dump($context, ' $context ++ '.to_string($model));

		// response
			$response->result	= $context;
			$response->msg		= 'Ok. Request done';


		return (object)$response;
	}//end get_element_context


	//
	// /**
	// * GET_PAGE_ELEMENT
	// * Creates a full ready page element from basic vars (tipo, model, lang, mode, section_id)
	// * @param object $options
	// * @return object $response
	// */
		// public static function get_page_element($request) {
		//
		// 	$response = new stdClass();
		// 		$response->result 	= false;
		// 		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';
		//
		// 	// set options from request
		// 		if (!$options = $request->options) {
		// 			return $response;
		// 		}
		//
		// 	// sort vars
		// 		$tipo 			= $options->tipo ?? null;
		// 		$model 			= $options->model ?? (isset($tipo) ? RecordObj_dd::get_modelo_name_by_tipo($tipo,true) : null);
		// 		$lang 			= $options->lang ?? DEDALO_DATA_LANG;
		// 		$mode 			= $options->mode ?? 'list';
		// 		$section_id 	= $options->section_id ?? null;
		// 		$component_tipo = $options->component_tipo ?? null;
		//
		// 	// page elements
		// 		switch (true) {
		//
		// 			case $model==='menu' :
		// 				$page_element = (function(){
		//
		// 					$menu = new menu();
		//
		// 					// menu json
		// 						$get_json_options = new stdClass();
		// 							$get_json_options->get_context 	= true;
		// 							$get_json_options->get_data 	= true;
		// 						$menu_json = $menu->get_json($get_json_options);
		//
		// 					$page_element = new StdClass();
		// 						$page_element->model 		= 'menu';
		// 						$page_element->type 		= 'menu';
		// 						$page_element->tipo 		= 'dd85';
		// 						$page_element->mode 		= 'edit';
		// 						$page_element->lang 		= DEDALO_APPLICATION_LANG;
		// 						$page_element->dd_request  = null;
		// 						$page_element->datum 		= $menu_json;
		//
		// 					return $page_element;
		// 				})();
		// 				break;
		//
		// 			case strpos($model, 'area')===0:
		// 				$page_element = (function() use ($model, $tipo, $mode){
		//
		// 					$page_element = new StdClass();
		// 						$page_element->model 		= $model;
		// 						$page_element->type  		= 'area';
		// 						$page_element->tipo  		= $tipo;
		// 						$page_element->mode 	 	= $mode;
		// 						$page_element->lang 	 	= DEDALO_DATA_LANG;
		// 						$page_element->section_tipo = $tipo;
		//
		// 						// dd_request
		// 							$area = area::get_instance($model, $tipo, $mode);
		// 							$dd_request = $area->get_dd_request();
		//
		// 						$page_element->dd_request = $dd_request;
		//
		// 					return $page_element;
		// 				})();
		// 				break;
		//
		// 			case $model==='section':
		// 				$page_element = (function() use ($model, $tipo, $section_id, $mode, $lang, $component_tipo){
		//
		// 					$section_tipo = $tipo;
		//
		// 					// dd_request
		// 						$section = section::get_instance($section_id, $section_tipo, $mode);
		// 						$section->set_lang($lang);
		// 						$dd_request = $section->get_dd_request();
		//
		// 					$page_element = new StdClass();
		// 						$page_element->model 		 = $model;
		// 						$page_element->type 		 = 'section';
		// 						$page_element->tipo 		 = $section_tipo;
		// 						$page_element->section_tipo  = $section_tipo;
		// 						$page_element->section_id 	 = $section_id;
		// 						$page_element->mode 		 = $mode;
		// 						$page_element->lang 		 = $lang;
		// 						$page_element->dd_request	 = $dd_request;
		//
		// 					return $page_element;
		// 				})();
		// 				break;
		//
		// 			case $model==='section_tm':
		// 				$page_element = (function() use ($model, $tipo, $section_id, $mode, $lang, $component_tipo){
		//
		// 					$section_tipo = $tipo;
		//
		// 					// dd_request
		// 						$section = section_tm::get_instance($section_id, $section_tipo, $mode);
		// 						$section->set_lang($lang);
		// 						$dd_request = $section->get_dd_request();
		//
		// 					$page_element = new StdClass();
		// 						$page_element->model		 = $model;
		// 						$page_element->type			 = 'section';
		// 						$page_element->tipo			 = $section_tipo;
		// 						$page_element->section_tipo  = $section_tipo;
		// 						$page_element->section_id	 = $section_id;
		// 						$page_element->mode 		 = $mode;
		// 						$page_element->lang 		 = $lang;
		// 						$page_element->dd_request	 = $dd_request;
		//
		// 					return $page_element;
		// 				})();
		// 				break;
		//
		// 			case $model==='section_tool':
		// 				$page_element = (function() use ($model, $tipo, $mode){
		//
		// 					# Configure section from section_tool data
		// 					$RecordObj_dd = new RecordObj_dd($tipo);
		// 					$properties  = $RecordObj_dd->get_properties(true);
		//
		// 					#$section_tipo = isset($properties->config->target_section_tipo) ? $properties->config->target_section_tipo :
		// 					#debug_log(__METHOD__." Error Processing Request. property target_section_tipo don't exist) ".to_string(), logger::ERROR);
		//
		// 					$section_tipo 	= $tipo;
		// 					$section_id		= null;
		// 					$lang 	 	 	= DEDALO_DATA_LANG;
		//
		// 					// dd_request
		// 						$section = section::get_instance($section_id, $section_tipo, $mode);
		// 						$section->set_lang($lang);
		// 						$section->config = $properties->config;
		// 						$dd_request = $section->get_dd_request();
		//
		// 					$page_element = new StdClass();
		// 						$page_element->model 		 = 'section';
		// 						$page_element->type 		 = 'section';
		// 						$page_element->section_tipo  = $section_tipo;
		// 						$page_element->section_id 	 = $section_id;
		// 						$page_element->mode 	 	 = $mode;
		// 						$page_element->lang 	 	 = $lang;
		// 						$page_element->dd_request   = $dd_request;
		//
		// 					return $page_element;
		// 				})();
		// 				break;
		//
		// 			default:
		// 				#throw new Exception("Error Processing Request", 1);
		// 				$response->msg = 'Error. model not found: '.$model;
		// 				return $response;
		//
		// 		}//end switch ($model)
		//
		//
		// 	$response->result 	= $page_element;
		// 	$response->msg 	  	= 'Ok. Request done';
		//
		//
		// 	return (object)$response;
		// }//end get_page_element
		//



	// search methods ///////////////////////////////////



	/**
	* GET_SECTION_ELEMENTS_CONTEXT
	* Get all components of current section (used in section filter)
	* @param object $json_data
	*	array $json_data->ar_section_tipo
	* @return object $response
	*/
	static function get_section_elements_context($json_data){
		global $start_time;

		////////session_write_close();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

			$ar_section_tipo 	= (array)$json_data->ar_section_tipo;
			$context_type 		= $json_data->context_type;

			$filter_components = common::get_section_elements_context([
				'ar_section_tipo' 	=> $ar_section_tipo,
				'context_type' 		=> $context_type
			]);

		// Debug
			if(SHOW_DEBUG===true) {
				$response->debug = new stdClass();
					$response->debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
			}

		$response->result 		= $filter_components;
		$response->msg 	  		= 'Ok. Request done';

		// Debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
					$debug->json_data 	= $json_data;
				$response->debug = $debug;
				#dump($debug, ' debug ++ '.to_string());
			}

		return (object)$response;
	}//end get_section_elements_context



	/**
	* FILTER_GET_EDITING_PRESET
	* @return object $response
	*/
	static function filter_get_editing_preset($json_data){
		global $start_time;

		//////session_write_close();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

			$user_id 		 	 = navigator::get_user_id();
			$target_section_tipo = $json_data->target_section_tipo;

			$editing_preset 	= search::get_preset($user_id, $target_section_tipo, DEDALO_TEMP_PRESET_SECTION_TIPO);

		// Debug
			if(SHOW_DEBUG===true) {
				$response->debug = new stdClass();
					$response->debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
			}

		$response->result 		= $editing_preset;
		$response->msg 	  		= 'Ok. Request done';

		return (object)$response;
	}//end filter_get_editing_preset



	/**
	* FILTER_SET_EDITING_PRESET
	* @return object $response
	*/
	static function filter_set_editing_preset($json_data){
		global $start_time;

		////session_write_close();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

			$user_id 		= navigator::get_user_id();
			$section_tipo 	= $json_data->section_tipo;
			$filter_obj 	= $json_data->filter_obj;

			$save_temp_preset = search::save_temp_preset($user_id, $section_tipo, $filter_obj);

		// Debug
			if(SHOW_DEBUG===true) {
				$response->debug = new stdClass();
					$response->debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
			}

		$response->result 		= $save_temp_preset;
		$response->msg 	  		= 'Ok. Request done';

		return (object)$response;
	}//end filter_set_editing_preset



	/**
	* FILTER_GET_USER_PRESETS
	* @return object $response
	*/
	static function filter_get_user_presets($json_data){
		global $start_time;

		//session_write_close();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

			$user_id			= navigator::get_user_id();
			$target_section_tipo= $json_data->target_section_tipo;

			$filter_components = search::filter_get_user_presets($user_id, $target_section_tipo);

		// Debug
			if(SHOW_DEBUG===true) {
				$response->debug = new stdClass();
					$response->debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
			}

		$response->result	= $filter_components;
		$response->msg		= 'Ok. Request done';

		return (object)$response;
	}//end filter_get_user_presets



	/**
	* ONTOLOGY_GET_AREAS
	* @return object $response
	*/
	static function ontology_get_children_recursive($json_data){
		global $start_time;

		// session_write_close();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

			$target_tipo = $json_data->target_tipo;

			$childrens = ontology::get_children_recursive($target_tipo);

		// Debug
			if(SHOW_DEBUG===true) {
				$response->debug = new stdClass();
					$response->debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
			}

		$response->result	= $childrens;
		$response->msg		= 'Ok. Request done';

		return (object)$response;
	}//end ontology_get_areas



	// private methods ///////////////////////////////////



	/**
	* BUILD_JSON_ROWS
	* @return object $result
	*/
	private static function build_json_rows($dd_request) {
		$start_time=microtime(1);

		// default result
			$result = new stdClass();
				$result->context = [];
				$result->data 	 = [];

		// fix dd_request
			self::$dd_request = $dd_request;

		// ar_dd_objects . Array of all dd objects in requested context
			$ar_dd_objects = array_values( array_filter($dd_request, function($item) {
				 if($item->typo==='ddo') return $item;
			}) );
			// set as static to allow external access
			dd_core_api::$ar_dd_objects = array_values($ar_dd_objects);

		// ddo_source
			$ar_source = array_filter($dd_request, function($item) {
				 if($item->typo==='source') return $item;
			});
			if (count($ar_source)!==1) {
				throw new Exception("Error Processing Request. Invalid number of 'source' items in context. Only one is allowed", 1);
				return $result;
			}
			$ddo_source = reset($ar_source);

			// source vars
				$action			= $ddo_source->action ?? 'search';
				$mode			= $ddo_source->mode ?? 'list';
				$lang			= $ddo_source->lang ?? null;
				$section_tipo	= $ddo_source->section_tipo ?? $ddo_source->tipo;
				$section_id		= $ddo_source->section_id ?? null;
				$tipo			= $ddo_source->tipo ?? null;
				$model			= $ddo_source->model ?? RecordObj_dd::get_modelo_name_by_tipo($ddo_source->tipo,true);

		// sqo. search_query_object
			$sqo_id = $section_tipo . '_' . $mode;
			$search_query_object = array_find($dd_request, function($item){
				return (isset($item->typo) && $item->typo==='sqo');
			});
			if (empty($search_query_object)) {
				if ($model==='section' && isset($_SESSION['dedalo']['config']['sqo'][$sqo_id])) {
					$search_query_object = $_SESSION['dedalo']['config']['sqo'][$sqo_id];
				}else{

					$sqo_options = new stdClass();
						$sqo_options->id			= $sqo_id;
						$sqo_options->mode			= $mode;
						$sqo_options->tipo			= $section_tipo;
						$sqo_options->section_tipo	= [$section_tipo];
						$sqo_options->full_count	= false;
						$sqo_options->add_select	= false;
						$sqo_options->limit			= ($mode==='list') ? 10 : 1;
						$sqo_options->offset		= 0;
						$sqo_options->mode			= $mode;
						$sqo_options->direct		= true;
						// filter_by_locators. when section_id is received
						if (!empty($section_id)) {
							$self_locator = new locator();
								$self_locator->set_section_tipo($section_tipo);
								$self_locator->set_section_id($section_id);
							$sqo_options->filter_by_locators = [$self_locator];
						}
					$search_query_object = common::build_search_query_object($sqo_options);

					// tm case
						// if ($mode==='tm') {
						// 	$search_query_object->order = json_decode('[{"direction": "DESC","path": [{"component_tipo": "id"}]}]');
						// 	$search_query_object->limit = 10;
						// 	$search_query_object->offset= 0;
						// 	// add component tipo and lang to locator for tm search
						// 	$component_ddo = array_find($dd_request, function($item){
						// 		return (isset($item->typo) && $item->typo==='ddo' && $item->type==='component');
						// 	});
						// 	$locator = reset($search_query_object->filter_by_locators);
						// 	$locator->tipo = $component_ddo->tipo;
						// 	$locator->lang = $component_ddo->lang;
						// }
					// dump($search_query_object, ' search_query_object 2 (autogenerated) ++ '.to_string());
				}
			}

			// pagination vars from sqo
				$limit	= $search_query_object->limit ?? null;
				$offset	= $search_query_object->offset ?? null;


		// CONTEXT
			$context = [];

				switch ($action) {

					case 'search': // example. get section records in list or edit mode, search in autocomplete service

						// sections
							$element = sections::get_instance(null, $search_query_object, $section_tipo, $mode, $lang);

							// set always
							// $element->set_dd_request($dd_request); // inject whole dd_request context

						break;

					case 'get_data': // example: paginate a component portal or component autocomplete

						if (strpos($model, 'component')===0) {

							// component
								$RecordObj_dd = new RecordObj_dd($tipo);
								$component_lang = $RecordObj_dd->get_traducible()==='si' ? $lang : DEDALO_DATA_NOLAN;
								$element = component_common::get_instance($model,
																		  $tipo,
																		  $section_id,
																		  $mode,
																		  $component_lang,
																		  $section_tipo);

								if ($mode==='tm') {
									// set matrix_id value to component to allow it search dato in
									// matrix_time_machine component function 'get_dato' will be
									// overwrited to get time machine dato instead the real dato
									$element->matrix_id = $ddo_source->matrix_id;
								}
						}else if (strpos($model, 'area')===0) {

							// areas
								$element = area::get_instance($model, $tipo, $mode);

						// }else{

						// 	// others
						// 		$element = new $model($tipo, $mode);
						}
						break;

					default:
						# not defined modelfro context / data
						debug_log(__METHOD__." 1. Ignored action '$action' - tipo: $tipo ".to_string(), logger::WARNING);
						break;
				}// end switch (true)


				// element json
					$get_json_options = new stdClass();
						$get_json_options->get_context	= true;
						$get_json_options->get_data		= false;
					$element_json = $element->get_json($get_json_options);

				// context add
					$context = $element_json->context;
					$context[] = (object)[
						'source'	=> 'request_ddo',
						'value'		=> dd_core_api::$request_ddo
					];

			$context_exec_time	= exec_time_unit($start_time,'ms')." ms";


		// DATA
			$data = [];

			$data_start_time=microtime(1);


					switch ($action) {

						case 'search':
							/*
								// search
									$search 	= search::get_instance($search_query_object);
									$rows_data 	= $search->search();

								// section. generated the self section_data
								foreach ($current_sqo->section_tipo as $current_section_tipo) {

									$section_data = new stdClass();
										$section_data->tipo 		= $current_section_tipo;
										$section_data->section_tipo = $current_section_tipo;
										$ar_section_id = [];
										foreach ($rows_data->ar_records as $current_row) {
											if ($current_row->section_tipo===$current_section_tipo) {
												$ar_section_id[] = $current_row->section_id;
											}
										}
										$section_data->value 		= $ar_section_id;

										// pagination info
										$section_data->offset 		= $current_sqo->offset;
										$section_data->limit 		= $current_sqo->limit;
										$section_data->total 		= $current_sqo->full_count;

									$data[] = $section_data;
								}

								// Iterate records
								$i=0; foreach ($rows_data->ar_records as $record) {

									$section_id   	= $record->section_id;
									$section_tipo 	= $record->section_tipo;
									$datos			= json_decode($record->datos);

									if (!isset($section_dd_object)) {
										$section_dd_object = array_reduce($ar_dd_objects, function($carry, $item) use($section_tipo){
											if($item->model==='section' && $item->section_tipo===$section_tipo) return $item;
											return $carry;
										});
									}

									$mode = $section_dd_object->mode;

									// Inject known dato to avoid re connect to database
										$section = section::get_instance($section_id, $section_tipo, $mode, $cache=true);
										$section->set_dato($datos);
										$section->set_bl_loaded_matrix_data(true);

									// get section json
										$get_json_options = new stdClass();
											$get_json_options->get_context 	= false;
											$get_json_options->get_data 	= true;
										$section_json = $section->get_json($get_json_options);

									// data add
										$data = array_merge($data, $section_json->data);

									// get_ddinfo_parents
										if (isset($current_sqo->value_with_parents) && $current_sqo->value_with_parents===true) {

											$locator = new locator();
												$locator->set_section_tipo($section_tipo);
												$locator->set_section_id($section_id);

											$dd_info = common::get_ddinfo_parents($locator, $current_sqo->source_component_tipo);

											$data[] = $dd_info;
										}


								$i++; }//end iterate records
								*/

							// sections
								$element = sections::get_instance(null, $search_query_object, $tipo, $mode, $lang);

							// store search_query_object
								//$context[] = $current_sqo;
								if ($model==='section') {
									$_SESSION['dedalo']['config']['sqo'][$sqo_id] = $search_query_object;
								}								
							break;

						case 'get_data':

							if (strpos($model, 'component')===0) {

								// component
									$RecordObj_dd	= new RecordObj_dd($tipo);
									$component_lang	= $RecordObj_dd->get_traducible()==='si' ? $lang : DEDALO_DATA_NOLAN;
									$element		= component_common::get_instance($model,
																					 $tipo,
																					 $section_id,
																					 $mode,
																					 $component_lang,
																					 $section_tipo);
									if ($mode==='tm') {
										// set matrix_id value to component to allow it search dato in
										// matrix_time_machine component function 'get_dato' will be
										// overwrited to get time machine dato instead the real dato
										$element->matrix_id = $ddo_source->matrix_id;
									}

								// pagination. fix pagination vars (defined in class component_common)
									$pagination = new stdClass();
										$pagination->limit	= $limit;
										$pagination->offset	= $offset;

									$element->pagination = $pagination;

							}else if (strpos($model, 'area')===0) {

								// areas
									$element = area::get_instance($model, $tipo, $mode);

								// search_action
									$search_action = $ddo_source->search_action ?? 'show_all';
									$obj = new stdClass();
										$obj->action				= $search_action;
										$obj->search_query_object	= $search_query_object;
									$element->set_search_action($obj);

							// }else{

							// 	// others (area, etc.)
							// 		$element = new $model($tipo, $mode);

							// 		// build_options
							// 			$build_options = $ddo_source->build_options ?? null;
							// 			$element->set_build_options($build_options);
							}
							break;

						default:
							# not defined modelfro context / data
							debug_log(__METHOD__." 1. Ignored action '$action' - tipo: $tipo ".to_string(), logger::WARNING);
							break;
					}// end switch (true)


					// add if exists
						if (isset($element)) {

							// build_options
								$build_options = $ddo_source->build_options ?? null;
								$element->set_build_options($build_options);

							// element json
								$get_json_options = new stdClass();
									$get_json_options->get_context	= false;
									$get_json_options->get_data		= true;
								$element_json = $element->get_json($get_json_options);

							// data add
								$data = array_merge($data, $element_json->data);

							// ar_all_section_id (experimental)
								// $ar_all_section_id = $element->get_ar_all_section_id();
								// 	dump($ar_all_section_id, ' ar_all_section_id ++ '.to_string());

						}//end if (isset($element))


			// smart remove data duplicates (!)
				#$data = self::smart_remove_data_duplicates($data);

			$data_exec_time	= exec_time_unit($data_start_time,'ms')." ms";


		// Set result object
			$result->context = $context;
			$result->data 	 = $data;


		// Debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->search_query_object	= $search_query_object ?? null;
					$debug->dd_request			= $dd_request;
					$debug->context_exec_time	= $context_exec_time;
					$debug->data_exec_time		= $data_exec_time;
					$debug->exec_time			= exec_time_unit($start_time,'ms')." ms";
				$result->debug = $debug;
				#dump($debug, ' debug ++ '.to_string());
			}


		return $result;
	}//end build_json_rows



	/**
	* SMART_REMOVE_DATA_DUPLICATES
	* @param array $data
	* @return array $clean_data
	*/
	private static function smart_remove_data_duplicates($data) {

		$clean_data = [];
		foreach ($data as $key => $value_obj) {
			#if (!in_array($value_obj, $clean_data, false)) {
			#	$clean_data[] = $value_obj;
			#}
			$found = array_filter($clean_data, function($item) use($value_obj){
				if (
					isset($item->section_tipo) && isset($value_obj->section_tipo) && $item->section_tipo===$value_obj->section_tipo &&
					isset($item->section_id) && isset($value_obj->section_id) && $item->section_id===$value_obj->section_id &&
					isset($item->tipo) && isset($value_obj->tipo) && $item->tipo===$value_obj->tipo &&
					isset($item->from_component_tipo) && isset($value_obj->from_component_tipo) && $item->from_component_tipo===$value_obj->from_component_tipo &&
					isset($item->lang) && isset($value_obj->lang) && $item->lang===$value_obj->lang
				){
					return $item;
				}
			});

			if (empty($found)) {
				$clean_data[] = $value_obj;
			}
		}

		#$clean_data = array_unique($data, SORT_REGULAR);
		#$clean_data = array_values($clean_data);

		return $clean_data;
	}//end smart_remove_data_duplicates



	/**
	* SMART_REMOVE_context_DUPLICATES
	* @param array $data
	* @return array $clean_data
	*/
	private static function smart_remove_context_duplicates($context) {

		$clean_context = [];
		foreach ($context as $key => $value_obj) {
			#if (!in_array($value_obj, $clean_context, false)) {
			#	$clean_context[] = $value_obj;
			#}
			$found = array_filter($clean_context, function($item) use($value_obj){
				if (
					$item->section_tipo===$value_obj->section_tipo &&
					$item->tipo===$value_obj->tipo &&
					$item->lang===$value_obj->lang
				){
					return $item;
				}
			});

			if (empty($found)) {
				$clean_context[] = $value_obj;
			}
		}

		#$clean_context = array_unique($context, SORT_REGULAR);
		#$clean_context = array_values($clean_context);

		return $clean_context;
	}//end smart_remove_context_duplicates



}//end dd_core_api
