<?php
/**
* DD_CORE_API
* Manage API RESP data with Dédalo
*
*/
class dd_core_api {



	// Version. Important!
		static $version = "1.0.0";  // 05-06-2019

	// ar_dd_objects . store current ar_dd_objects received in context to allwo external acces (portals, etc.)
		static $ar_dd_objects;



	/**
	* __CONSTRUCT
	* @return bool
	*
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


		# Update search_query_object full_count property
		$search_options = section_records::get_search_options($section_tipo);
		if (isset($search_options->search_query_object)) {
			$search_options->search_query_object->full_count = true; // Force re-count records
		}


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
	* @return array $result
	*/
	static function read($json_data) {
		global $start_time;

		//session_write_close();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		$context = $json_data->context;

		$json_rows = self::build_json_rows($context);

		$result = $json_rows;

		$response->result 	= $result;
		$response->msg 	  	= 'Ok. Request done';

		// Debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";

				$response->debug = $debug;

					#dump($response, ' $response->result 	= $result; ++ '.to_string());
			}


		return (object)$response;
	}//end read



	/**
	* SAVE
	* @return array $result
	*/
	static function save($json_data) {
		global $start_time;

		session_write_close();
		// create the default save response
		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		// get the context and data sended
		$context 	= $json_data->context;
		$data 		= $json_data->data;
		$section_id	= $json_data->section_id;

		//get the type of the dd_object that is calling to update
		$context_type = $context->type;
		// switch the type (component, section)
		switch ($context_type) {
			case 'component':

				// get the component information
					$model 			= $context->model;
					$tipo 			= $context->tipo;
					$section_tipo 	= $context->section_tipo;
					$lang 			= $context->lang;
					$changed_data 	= $data->changed_data;

				// build the component
					$component = component_common::get_instance( $model,
																 $tipo,
																 $section_id,
																 'edit',
																 $lang,
																 $section_tipo);
				// get the component permisions
					$permissions = $component->get_component_permissions();
				// check if the user can update the component
					if($permissions < 2) return $response;

				// update the dato with the change data send by client
					$component->update_data_value($changed_data);
				// save the new data to the component
					$component->Save();

					$dato = $component->get_dato();

				// element json
					$get_json_options = new stdClass();
						$get_json_options->get_context 	= true;
						$get_json_options->get_data 	= true;
					$element_json = $component->get_json($get_json_options);

				// data add
					$result = $element_json;

				break;

			default:
				# code...
				break;
		}
		// if the proces is correct we return the $result to the client, for component is the section_id
		$response->result 		= $result;
		$response->msg 	  		= 'Ok. Request done';

		# Debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
					$debug->json_data 	= $json_data;

				$response->debug = $debug;
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
	* @return array $result
	*/
	static function count($json_data) {
		global $start_time;

		session_write_close();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		$sqo = $json_data->sqo;

		// search
			$search	= new search($sqo);
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
	*
	* @param object $json_data
	*
	* @return object $response
	*/
	static function get_element_context($json_data){

		session_write_close();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		// vars from json_data
			$source 		= $json_data->source;
				$tipo 			= $source->tipo;
				$section_tipo 	= $source->section_tipo;
				$model 			= $source->model ?? RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
				$lang 			= $source->lang ?? DEDALO_DATA_LANG;
				$mode 			= $source->mode ?? 'list';

		// build element
			switch ($model) {
				case 'section':
					$element 		= section::get_instance(null, $section_tipo);
					break;

				case 'component':
				default:
					$element 		= component_common::get_instance($model,
																	 $tipo,
																	 null,
																	 $mode,
																	 $lang,
																	 $section_tipo);
					break;
			}

		// element json
			$get_json_options = new stdClass();
				$get_json_options->get_context 	= true;
				$get_json_options->get_data 	= false;
			$element_json = $element->get_json($get_json_options);

		// context add
			$context = $element_json->context;


		$response->result 		= $context;
		$response->msg 	  		= 'Ok. Request done';

		return (object)$response;
	}//end get_element_context



	/**
	* GET_SECTION_ELEMENTS_CONTEXT
	* Get all components of current section (used in section filter)
	* @param object $json_data
	*	array $json_data->ar_section_tipo
	* @return object $response
	*/
	static function get_section_elements_context($json_data){
		global $start_time;

		session_write_close();

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

		session_write_close();

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

		session_write_close();

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

		session_write_close();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

			$user_id 		 	 = navigator::get_user_id();
			$target_section_tipo = $json_data->target_section_tipo;

			$filter_components = search::filter_get_user_presets($user_id, $target_section_tipo);

		// Debug
			if(SHOW_DEBUG===true) {
				$response->debug = new stdClass();
					$response->debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
			}

		$response->result 		= $filter_components;
		$response->msg 	  		= 'Ok. Request done';

		return (object)$response;
	}//end filter_get_user_presets



	/**
	* ONTOLOGY_GET_AREAS
	* @return object $response
	*/
	static function ontology_get_childrens_recursive($json_data){
		global $start_time;

		session_write_close();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

			$target_tipo = $json_data->target_tipo;

			$childrens = ontology::get_childrens_recursive($target_tipo);

		// Debug
			if(SHOW_DEBUG===true) {
				$response->debug = new stdClass();
					$response->debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
			}

		$response->result 		= $childrens;
		$response->msg 	  		= 'Ok. Request done';

		return (object)$response;
	}//end ontology_get_areas





	// private methods ///////////////////////////////////



	/**
	* BUILD_JSON_ROWS
	* @return object $result
	*/
	private static function build_json_rows($sqo_context) {

		$start_time=microtime(1);

		// default result
			$result = new stdClass();
				$result->context = [];
				$result->data 	 = [];


		// ar_dd_objects . Array of all dd objects in requested context
			$ar_dd_objects = array_filter($sqo_context, function($item) {
				 if($item->typo==='ddo') return $item;
			});
			// set as static to allow external access
			dd_core_api::$ar_dd_objects = $ar_dd_objects;

		// ddo_source
			$ddo_source = array_reduce($sqo_context, function($carry, $item){
				if (isset($item->typo) && $item->typo==='source') {
					return $item;
				}
				return $carry;
			});

			$action 		= $ddo_source->action;
			$mode 			= $ddo_source->mode;
			$lang 			= $ddo_source->lang ?? null;
			$section_tipo 	= $ddo_source->section_tipo ?? null;
			$section_id 	= $ddo_source->section_id ?? null;
			$tipo 			= $ddo_source->tipo ?? null;
			$model 			= $ddo_source->model ?? RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$limit 			= $ddo_source->pagination->limit ?? null;
			$offset 		= $ddo_source->pagination->offset ?? null;

		// sqo
			$search_query_object = array_reduce($sqo_context, function($carry, $item){
				if (isset($item->typo) && $item->typo==='sqo') {
					return $item;
				}
				return $carry;
			});


		// CONTEXT
			$context = [];

				switch ($action) {

					case 'search':

						// sections
							$element = sections::get_instance(null, $search_query_object, $section_tipo, $mode, $lang);

						break;

					case 'get_data':

						if (strpos($model, 'component')===0) {

							// component
								$element = component_common::get_instance($model,
																		  $tipo,
																		  $section_id,
																		  $mode,
																		  $lang,
																		  $section_tipo);
						}else{

							// others (area, etc.)
								$element = new $model($tipo, $mode);
						}
						break;

					default:
						# not defined modelfro context / data
						debug_log(__METHOD__." 1. Ignored action '$action' - tipo: $tipo ".to_string(), logger::WARNING);
						break;
				}// end switch (true)


				// element json
					$get_json_options = new stdClass();
						$get_json_options->get_context 	= true;
						$get_json_options->get_data 	= false;
					$element_json = $element->get_json($get_json_options);

				// context add
					$context = $element_json->context;

			$context_exec_time	= exec_time_unit($start_time,'ms')." ms";


		// DATA
			$data = [];

			$data_start_time=microtime(1);


					switch ($action) {

						case 'search':
							/*
								// search
									$search = new search($current_sqo);
									$rows_data 			 = $search->search();

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

							// setions
								$element = sections::get_instance(null, $search_query_object, $tipo, $mode, $lang);

							// store search_query_object
								//$context[] = $current_sqo;

							break;

						case 'get_data':

							if (strpos($model, 'component')===0) {

								// component
									$element 	= component_common::get_instance($model,
																				 $tipo,
																				 $section_id,
																				 $mode,
																				 $lang,
																				 $section_tipo);
								// pagination. fix pagination vars
									$pagination = new stdClass();
										$pagination->limit 	= $limit;
										$pagination->offset = $offset;

									$element->pagination = $pagination;
							}else{

								// others (area, etc.)
									$element = new $model($tipo, $mode);
							}
							break;

						default:
							# not defined modelfro context / data
							debug_log(__METHOD__." 1. Ignored action '$action' - tipo: $tipo ".to_string(), logger::WARNING);
							break;
					}// end switch (true)


					// add if exists
						if (isset($element)) {

							// element json
								$get_json_options = new stdClass();
									$get_json_options->get_context 	= false;
									$get_json_options->get_data 	= true;
								$element_json = $element->get_json($get_json_options);

							// data add
								$data = array_merge($data, $element_json->data);

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
					$debug->context_exec_time 	= $context_exec_time;
					$debug->data_exec_time 		= $data_exec_time;
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
