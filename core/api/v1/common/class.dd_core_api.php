<?php
/**
* DD_CORE_API
* Manage API RESP data with Dédalo
*
*/
final class dd_core_api {



	// Version. Important!
		static $version = "1.0.0";  // 05-06-2019

	// ar_dd_objects . store current ar_dd_objects received in context to allow external access (portals, etc.)
		// static $ar_dd_objects;

	// $request_ddo_value . store current ddo items added by get_config_context methods (portals, etc.)
		// static $request_ddo_value = [];

	// rqo . store current rqo received in context to allow external access (portals, etc.)
		static $rqo;

	// context_dd_objects . store calculated context dd_objects
		static $context_dd_objects;

	// context . Whole calculated context
		// static $context;
		static $ddo_map = []; // fixed in get_structure_context()

	// static debug sql_query searchs
		static $sql_query_searchs = [];



	/**
	* __CONSTRUCT
	* @return bool
	*//*
	public function __construct() {

		return true;
	}//end __construct
	*/



	/**
	* START
	* Builds the start page minimun context.
	* Normally is a menu and a section (based on url vars)
	* This function tells to page what must to be request based on url vars
	* Sample expected $json_data:
	* {
	*	"action": "start",
	*	"search_obj": {
	*		"t": "oh1",
	*		"m": "edit"
	*	},
	*	"menu": true,
	*	"prevent_lock": true
	* }
	* @return object $reponse
	*/
	public static function start(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->error	= null;

		// options
			$search_obj	= $options->search_obj ?? new StdClass(); // url vars
			$menu		= $options->menu ?? false;

		// page mode and tipo
			$default_section_tipo = MAIN_FALLBACK_SECTION; // 'test38';
			if (isset($search_obj->tool)) {

				// tool case
				$tool_name = $search_obj->tool;


			}else if (isset($search_obj->locator)) {

				// locator case
				$locator	= json_decode($search_obj->locator);
				$tipo		= $locator->section_tipo ?? $default_section_tipo;
				$section_id	= $locator->section_id ?? null;
				$mode		= $locator->mode ?? 'list';

			}else{

				// default case
				$tipo		= $search_obj->t	?? $search_obj->tipo		?? $default_section_tipo; // MAIN_FALLBACK_SECTION;
				$section_id	= $search_obj->id	?? $search_obj->section_id	?? null;
				$mode		= $search_obj->m	?? $search_obj->mode		?? 'list';
			}

		// context
			$context = [];
			if (true!==login::is_logged()) {

				// not logged case

				// check_basic_system (lang and structure files)
					$is_system_ready = check_basic_system();
					if ($is_system_ready->result===false) {
						return $is_system_ready;
					}

				// page context elements [login]
					$login = new login();

				// add to page context
					$context[] = $login->get_structure_context();

			}else{

				// already logged case

				// menu. Add the menu element context when is required
					if ($menu===true) {

						$menu = new menu();
						$menu->set_lang(DEDALO_DATA_LANG);

						// add to page context
							$context[] = $menu->get_structure_context();
					}

				// section/area/section_tool. Get the page element from get URL vars
					$model = $tool_name ?? RecordObj_dd::get_modelo_name_by_tipo($tipo, true);
					switch (true) {
						// Section_tool is depended of section, the order of the cases are important, section_tool need to be first, before section,
						// because section_tool depends of the section process and this case only add the config from properties.
						case ($model==='section_tool'):

							$section_tool_tipo = $tipo;

							$RecordObj_dd	= new RecordObj_dd($section_tool_tipo);
							$properties		= $RecordObj_dd->get_properties();

							// overwrite (!)
								$model	= 'section';
								$tipo	= $properties->config->target_section_tipo ?? $tipo;
								$config	= $properties->config ?? null;

							// tool_context
								$tool_name = isset($properties->tool_config) && is_object($properties->tool_config)
									? array_key_first(get_object_vars($properties->tool_config))
									: false;
								if ($tool_name) {
									$ar_tool_object	= tool_common::get_client_registered_tools([$tool_name]);
									if (empty($ar_tool_object)) {
										debug_log(__METHOD__." ERROR. No tool found for tool '$tool_name' in section_tool_tipo ".to_string($section_tool_tipo), logger::ERROR);
									}else{
										$tool_config	= $properties->tool_config->{$tool_name} ?? false;
										$tool_context	= tool_common::create_tool_simple_context($ar_tool_object[0], $tool_config);
										$config->tool_context = $tool_context;
										// dump($current_area->config, ' ++++++++++++++++++++++++++++++++++++++ current_area->config ++ '.to_string($section_tool_tipo));
									}
								}
							// (!) note non break switch here. It will continue with section normally.
							// section_tool don't load the section by itself.

						case ($model==='section'):

							$section = section::get_instance($section_id, $tipo, $mode);
							$section->set_lang(DEDALO_DATA_LANG);

							$current_context = $section->get_structure_context(
								1, // permissions
								true, // add_request_config
								null // callback
							);
							// section_tool config
							// the config is used by section_tool to set the tool to open, if is set inject the config into the context.
							if (isset($config)) {
								$current_context->config = $config;
							}

							// section_id given case. If is received section_id, we build a custom sqo with the proper filter
							// and override default request_config sqo into the section context
							if (!empty($section_id)) {

								$current_context->mode			= 'edit'; // force edit mode
								$current_context->section_id	= $section_id; // set section_id in context

								// request_config
									$request_config = array_find($current_context->request_config, function($el){
										return $el->api_engine==='dedalo';
									});
									if (!empty($request_config)) {
										// sqo
											$sqo = new search_query_object();
											$sqo->set_section_tipo([(object)[
												'tipo'	=> $tipo,
												'label'	=> ''
											]]);
											$sqo->set_filter_by_locators([(object)[
												'section_tipo'	=> $tipo,
												'section_id'	=> $section_id
											]]);

										// overwrite default sqo
										$request_config->sqo = $sqo;
									}
							}//end if (!empty($section_id))

							// add to page context
								$context[] = $current_context;
							break;

						case ($model==='area_thesaurus'):

							$area = area::get_instance($model, $tipo, $mode);
							$area->set_lang(DEDALO_DATA_LANG);

							// add to page context
								$current_context = $area->get_structure_context(1, true);

								if (isset($search_obj->thesaurus_mode)) {
									$current_context->thesaurus_mode = $search_obj->thesaurus_mode;
								}
								if (isset($search_obj->hierarchy_types)) {
									$current_context->hierarchy_types = json_decode($search_obj->hierarchy_types);
								}
								if (isset($search_obj->hierarchy_sections)) {
									$current_context->hierarchy_sections = json_decode($search_obj->hierarchy_sections);
								}
								if (isset($search_obj->hierarchy_terms)) {
									$current_context->hierarchy_terms = json_decode($search_obj->hierarchy_terms);
								}

							// add to page context
								$context[] = $current_context;
							break;

						case (strpos($model, 'tool_')===0):

							// resolve tool from name and user
								$user_id			= (int)navigator::get_user_id();
								$registered_tools	= tool_common::get_user_tools($user_id);
								$tool_found = array_find($registered_tools, function($el) use($model){
									return $el->name===$model;
								});
								if (empty($tool_found)) {
									debug_log(__METHOD__." Tool $model not found in tool_common::get_client_registered_tools ".to_string(), logger::ERROR);
								}else{
									$section_tipo	= $tool_found->section_tipo;
									$section_id		= $tool_found->section_id;

									$element = new $model($section_id, $section_tipo);
									// element JSON
									$get_json_options = new stdClass();
										$get_json_options->get_context	= true;
										$get_json_options->get_data		= false;
									$element_json = $element->get_json($get_json_options);

									// context add
									$context[] = $element_json->context;
								}
							break;

						case (strpos($model, 'area')===0):

							$area = area::get_instance($model, $tipo, $mode);
							$area->set_lang(DEDALO_DATA_LANG);

							$current_context =$area->get_structure_context(1, true);

							// add to page context
								$context[] = $current_context;
							break;

						default:
							// ..
							break;
					}//end switch (true)
			}//end if (login::is_logged()!==true)


		$response->result	= $context;
		$response->msg		= 'OK. Request done ['.__FUNCTION__.']';


		return $response;
	}//end start



	/**
	* READ
	* Get context and data from given source
	* Different modes are available
	* @see self::build_json_rows
	*
	* @param object $rqo
	*	array $json_data->context
	* @return object $response
	* 	$response->result = {
	* 		array context
	* 		array data
	* 	}
	*/
	public static function read(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->error	= null;

		// validate input data
			if (empty($rqo->source->section_tipo)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty source \'section_tipo\' (is mandatory)';
				return $response;
			}

		// build rows (context & data)
			$json_rows = self::build_json_rows($rqo);

		// response success
			$response->result	= $json_rows;
			$response->msg		= 'OK. Request done';

		// debug
			if(SHOW_DEBUG===true) {
				$response->debug = new stdClass();
				if (!empty(dd_core_api::$sql_query_searchs)) {
					$response->debug->sql_query_searchs = dd_core_api::$sql_query_searchs;
				}
			}


		return $response;
	}//end read



	/**
	* READ_RAW
	* Get full record data
	* @param object $rqo
	*	array $json_data->context
	* @return object $response
	*/
	public static function read_raw(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->error	= null;

		// validate input data
			if (empty($rqo->source->section_tipo)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty source \'section_tipo\' (is mandatory)';
				return $response;
			}

		// short vars
			$section_tipo	= $rqo->source->section_tipo;
			$section_id		= $rqo->source->section_id;

		// section data raw
			$section	= section::get_instance($section_id, $section_tipo);
			$dato		= $section->get_dato();

		// response success
			$response->result	= $dato;
			$response->msg		= 'OK. Request done';


		return $response;
	}//end read_raw



	/**
	* CREATE
	* @param object $json_data
	* @return array $result
	*/
	public static function create(object $json_data) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->error	= null;

		// section_tipo
			$section_tipo = $json_data->section_tipo;
			if (empty($section_tipo)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty section_tipo (is mandatory)';
				return $response;
			}

		// fix section tipo
			// define('SECTION_TIPO', $section_tipo);

		// section
			$section	= section::get_instance(null, $section_tipo);
			$section_id	= $section->Save(); // Section save, returns the created section_id

		// OJO : Aquí, cuando guardemos las opciones de búsqueda, resetearemos el count para forzar a recalculat el total
			//   esto está ahora en 'section_records' pero puede cambiar..
			// Update search_query_object full_count property
				// $search_options = section_records::get_search_options($section_tipo);
				// if (isset($search_options->search_query_object)) {
				// 	$search_options->search_query_object->full_count = true; // Force re-count records
				// }

		$response->result	= $section_id;
		$response->msg		= 'OK. Request done ['.__FUNCTION__.']';


		return $response;
	}//end create



	/**
	* DELETE
	* Remove one or more section records from database
	* If sqo is received, it will be used to search target sections
	* Else a new sqo will be createds based on current section_ti, section_id
	* Note that 'delete_mode' must be declared (delete_data|delete_record)
	* @param object $rqo
	* @return array $result
	*/
	public static function delete(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed. ';
			$response->error	= null;

		// ddo_source
			$ddo_source = $rqo->source;

		// source vars
			$action			= $ddo_source->action ?? 'delete';
			$delete_mode	= $ddo_source->delete_mode ?? 'delete_data';
			$section_tipo	= $ddo_source->section_tipo ?? $ddo_source->tipo;
			$section_id		= $ddo_source->section_id ?? null;
			$tipo			= $ddo_source->tipo;
			$model			= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			if($model!=='section') {
				$response->error = 1;
				$response->msg 	.= 'Model is not expected section: '.$model;
				return $response;
			}

		// permissions
			$permissions = common::get_permissions($section_tipo, $section_tipo);
			debug_log(__METHOD__." permissions: $permissions ".to_string($section_tipo), logger::DEBUG);
			if ($permissions<2) {
				$response->error = 2;
				$response->msg 	.= 'Insufficient permissions: '.$permissions;
				return $response;
			}

		// sqo. search_query_object. If empty, we will create a new one with default values
			$sqo = $rqo->sqo;
			if(empty($sqo)){
				// we build a new sqo based on the current source section_id

				// section_id check (is mandatory when no sqo is received)
					if (empty($section_id)) {
						$response->error = 3;
						$response->msg 	.= 'section_id = null and $sqo = null, impossible to determinate the sections to delete. ';
						return $response;
					}

				// sqo to create new one
					$limit			= null; // overwrite the default 10 records
					$self_locator	= new locator();
						$self_locator->set_section_tipo($section_tipo);
						$self_locator->set_section_id($section_id);
					$sqo = new search_query_object();
						$sqo->set_section_tipo([$section_tipo]);
						$sqo->set_limit($limit);
						$sqo->set_filter_by_locators([$self_locator]);
			}

		// search the sections to delete
			$search		= search::get_instance($sqo);
			$rows_data	= $search->search();
			$ar_records = $rows_data->ar_records;
			// check empty records
			if (empty($ar_records)) {
				$response->result = [];
				$response->msg 	.= 'no records found to delete ';
				return $response;
			}

			$errors = [];
			foreach ($ar_records as $record) {

				$current_section_tipo	= $record->section_tipo;
				$current_section_id		= $record->section_id;

				# Delete method
				$section 	= section::get_instance($current_section_id, $current_section_tipo);
				$deleted 	= $section->Delete($delete_mode);

				if ($deleted!==true) {
					$errors[] = (object)[
						'section_tipo'	=> $current_section_tipo,
						'section_id'	=> $current_section_id
					];
				}
			}

		// ar_delete section_id
			$ar_delete_section_id = array_map(function($record){
				return $record->section_id;
			}, $ar_records);

		// check deleted all found sections. Exec the same search again expecting to obtain zero records
			if ($delete_mode==='delete_record') {

				$check_search		= search::get_instance($sqo);
				$check_rows_data	= $search->search();
				$check_ar_records	= $check_rows_data->ar_records;
				if(count($check_ar_records)>0) {

					$check_ar_section_id = array_map(function($record){
						return $record->section_id;
					}, $check_ar_records);

					$response->error = 4;
					$response->msg 	.= 'Some records were not deleted: '.json_encode($check_ar_section_id, JSON_PRETTY_PRINT);
					return $response;
				}
			}

		// response OK
			$response->result		= $ar_delete_section_id;
			$response->error		= !empty($errors) ? $errors : null;
			$response->delete_mode	= $delete_mode;
			$response->msg			= !empty($errors)
				? 'Some errors occurred when delete sections.'
				: 'OK. Request done successfully.';


		return $response;
	}//end delete



	/**
	* SAVE
	* @param object $json_data
	* @return object $response
	*/
	public static function save(object $json_data) : object {

		// create the default save response
		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->error	= null;

		// json_data. get the context and data sended
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
					$mode			= $context->mode;
					$changed_data	= $data->changed_data;

					$RecordObj_dd	= new RecordObj_dd($tipo);
					$component_lang	= $RecordObj_dd->get_traducible()==='si' ? $lang : DEDALO_DATA_NOLAN;

				// build the component
					$component = component_common::get_instance(
						$model,
						$tipo,
						$section_id,
						$mode,
						$component_lang,
						$section_tipo
					);
					// component_semantic_node case
						if(isset($data->row_locator) && $model==='component_semantic_node'){
							$component->set_row_locator($data->row_locator);
							$component->set_parent_section_tipo($data->parent_section_tipo);
							$component->set_parent_section_id($data->parent_section_id);
						}

				// permissions. Get the component permissions and check if the user can update the component
					$permissions = $component->get_component_permissions();
					if($permissions < 2) return $response;

				if ($mode==='search') {

					// force same changed_data
						$component->set_dato([$changed_data->value]);

				}else{

					// update the dato with the changed data sent by the client
						$component->update_data_value($changed_data);

					// save the new data to the component
						$component->Save();

					// force recalculate dato
						$dato = $component->get_dato();
				}

				// pagination. Update offset based on save request (portals)
					$pagination = $json_data->data->pagination ?? null;
					if (isset($pagination) && isset($pagination->offset)) {
						$component->pagination->offset = $pagination->offset;
					}

				// datalist. if is received, inject to the component for recycle
					if (isset($json_data->data->datalist)) {
						$component->datalist = $json_data->data->datalist;
					}

				// element JSON
					$get_json_options = new stdClass();
						$get_json_options->get_context	= true;
						$get_json_options->get_data		= true;
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
			$response->result	= $result;
			$response->msg		= 'OK. Request done';


		return $response;
	}//end save



	/**
	* ADD_NEW_ELEMENT
	* Used by component_portal to add created target section to current component with project values inheritance
	* @return object $response
	*/
	public static function add_new_element(object $rqo) : object {

		// create the default response
		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->error	= null;

		// rqo. get the context and data sent
			$source					= $rqo->source;
			$target_section_tipo	= $rqo->target_section_tipo;

		// get the component information
			$model			= $source->model;
			$tipo			= $source->tipo;
			$section_tipo	= $source->section_tipo;
			$section_id		= $source->section_id;
			$lang			= $source->lang;
			$mode			= $source->mode;

			$RecordObj_dd	= new RecordObj_dd($tipo);
			$component_lang	= $RecordObj_dd->get_traducible()==='si' ? $lang : DEDALO_DATA_NOLAN;

		// build the component
			$component = component_common::get_instance(
				$model,
				$tipo,
				$section_id,
				$mode,
				$component_lang,
				$section_tipo
			);
		// get the component permissions
			$permissions = $component->get_component_permissions();
		// check if the user can update the component
			if($permissions < 2) return $response;

		// component add_new_element
			$component->add_new_element((object)[
				'target_section_tipo' => $target_section_tipo
			]);

		// // element json
			// 	$get_json_options = new stdClass();
			// 		$get_json_options->get_context 	= true;
			// 		$get_json_options->get_data 	= true;
			// 	$element_json = $component->get_json($get_json_options);

			// // observers_data
			// 	if (isset($component->observers_data)) {
			// 		$element_json->data = array_merge($element_json->data, $component->observers_data);
			// 	}

			// // context and data as result
			// 	$result = $element_json;

		// result. if the process is correct, we return the $result to the client
			$response->result 	= true;
			$response->msg 	  	= 'OK. Request done';


		return $response;
	}//end add_new_element



	/**
	* COUNT
	* @param object $json_data
	* @return object $response
	*/
	public static function count(object $json_data) : object {

		session_write_close();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->error	= null;

		$search_query_object = $json_data->sqo;

		// permissions check. If user don't have access to any section, set total to zero and prevent search
			$ar_section_tipo = $search_query_object->section_tipo;
			foreach ($ar_section_tipo as $current_section_tipo) {
				$permissions	= common::get_permissions($current_section_tipo, $current_section_tipo);
				if($permissions<1){
					$result = (object)[
						'total' => 0
					];
				}
			}

		// search
			if (!isset($result)) {
				$search	= search::get_instance($search_query_object);
				$result	= $search->count();
			}

		// response ok
			$response->result	= $result;
			$response->msg		= 'Ok. Request done';


		return $response;
	}//end count



	/**
	* GET_ELEMENT_CONTEXT
	* Used by search.get_component(source) calling data_manager
	* @param object $json_data
	* @return object $response
	*/
	public static function get_element_context(object $rqo) : object {

		session_write_close();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->error	= null;

		// rqo vars
			$source			= $rqo->source;

			$tipo			= $source->tipo ?? null;
			$section_tipo	= $source->section_tipo ?? $source->tipo ?? null;
			$model			= $source->model ?? RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$lang			= $source->lang ?? DEDALO_DATA_LANG;
			$mode			= $source->mode ?? 'list';
			$section_id 	= $source->section_id ?? null; // only used by tools (it needed to load the section_tool record to get the context )

		// build element
			switch (true) {
				case $model==='section':
					$element = section::get_instance(null, $section_tipo);
					break;

				// case $model==='section_tm':
					// 	$section_id 	= $source->section_id;
					// 	$element 		= section_tm::get_instance($section_id, $section_tipo);
					// 	// set rqo (source)
					// 	$element->set_rqo([$source]); // inject whole source
					// 	break;

				case strpos($model, 'area')===0:
					$element = area::get_instance($model, $tipo, $mode);
					break;

				case strpos($model, 'component_')===0:

					$RecordObj_dd	= new RecordObj_dd($tipo);
					$component_lang	= $RecordObj_dd->get_traducible()==='si' ? $lang : DEDALO_DATA_NOLAN;

					$element = component_common::get_instance($model,
															  $tipo,
															  null,
															  $mode,
															  $component_lang,
															  $section_tipo);
					break;

				case strpos($model, 'tool_')===0:

					// tool section_tipo and section_id can be resolved from model if is necessary
						// if (empty($section_id) || empty($section_id)) {
						// 	// resolve
						// 	$registered_tools = tool_common::get_client_registered_tools();
						// 	$tool_found = array_find($registered_tools, function($el) use($model){
						// 		return $el->name===$model;
						// 	});
						// 	if (!empty($tool_found)) {
						// 		$section_tipo	= $tool_found->section_tipo;
						// 		$section_id		= $tool_found->section_id;
						// 	}else{
						// 		debug_log(__METHOD__." Tool $model not found in tool_common::get_client_registered_tools ".to_string(), logger::ERROR);
						// 	}
						// }

					// resolve tool from name and user
						$user_id			= (int)navigator::get_user_id();
						$registered_tools	= tool_common::get_user_tools($user_id);
						$tool_found = array_find($registered_tools, function($el) use($model){
							return $el->name===$model;
						});
						if (empty($tool_found)) {
							debug_log(__METHOD__." Tool $model not found in tool_common::get_client_registered_tools ".to_string(), logger::ERROR);
						}else{
							$section_tipo	= $tool_found->section_tipo;
							$section_id		= $tool_found->section_id;
						}

					$element = new $model($section_id, $section_tipo);
					break;

				default:
					#throw new Exception("Error Processing Request", 1);
					$response->msg = 'Error. model not found: '.$model;
					return $response;
					break;
			}

		// element JSON
			$get_json_options = new stdClass();
				$get_json_options->get_context	= true;
				$get_json_options->get_data		= false;
			$element_json = $element->get_json($get_json_options);

		// context add
			$context = $element_json->context;

		// response
			$response->result	= $context;
			$response->msg		= 'Ok. Request done';


		return $response;
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
		// 						$page_element->rqo  = null;
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
		// 						// rqo
		// 							$area = area::get_instance($model, $tipo, $mode);
		// 							$rqo = $area->get_rqo();
		//
		// 						$page_element->rqo = $rqo;
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
		// 					// rqo
		// 						$section = section::get_instance($section_id, $section_tipo, $mode);
		// 						$section->set_lang($lang);
		// 						$rqo = $section->get_rqo();
		//
		// 					$page_element = new StdClass();
		// 						$page_element->model 		 = $model;
		// 						$page_element->type 		 = 'section';
		// 						$page_element->tipo 		 = $section_tipo;
		// 						$page_element->section_tipo  = $section_tipo;
		// 						$page_element->section_id 	 = $section_id;
		// 						$page_element->mode 		 = $mode;
		// 						$page_element->lang 		 = $lang;
		// 						$page_element->rqo	 = $rqo;
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
		// 					// rqo
		// 						$section = section_tm::get_instance($section_id, $section_tipo, $mode);
		// 						$section->set_lang($lang);
		// 						$rqo = $section->get_rqo();
		//
		// 					$page_element = new StdClass();
		// 						$page_element->model		 = $model;
		// 						$page_element->type			 = 'section';
		// 						$page_element->tipo			 = $section_tipo;
		// 						$page_element->section_tipo  = $section_tipo;
		// 						$page_element->section_id	 = $section_id;
		// 						$page_element->mode 		 = $mode;
		// 						$page_element->lang 		 = $lang;
		// 						$page_element->rqo	 = $rqo;
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
		// 					#debug_log(__METHOD__." Error Processing Request. property target_section_tipo does not exist) ".to_string(), logger::ERROR);
		//
		// 					$section_tipo 	= $tipo;
		// 					$section_id		= null;
		// 					$lang 	 	 	= DEDALO_DATA_LANG;
		//
		// 					// rqo
		// 						$section = section::get_instance($section_id, $section_tipo, $mode);
		// 						$section->set_lang($lang);
		// 						$section->config = $properties->config;
		// 						$rqo = $section->get_rqo();
		//
		// 					$page_element = new StdClass();
		// 						$page_element->model 		 = 'section';
		// 						$page_element->type 		 = 'section';
		// 						$page_element->section_tipo  = $section_tipo;
		// 						$page_element->section_id 	 = $section_id;
		// 						$page_element->mode 	 	 = $mode;
		// 						$page_element->lang 	 	 = $lang;
		// 						$page_element->rqo   = $rqo;
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
		// 	return $response;
		// }//end get_page_element
		//



	// search methods ///////////////////////////////////



	/**
	* GET_SECTION_ELEMENTS_CONTEXT
	* Get all components of current section (used in section search filter)
	* @param object $json_data
	*	array $json_data->ar_section_tipo
	* @return object $response
	*/
	public static function get_section_elements_context(object $json_data) : object {

		session_write_close();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->error	= null;

		// json_data
			$ar_section_tipo	= (array)$json_data->ar_section_tipo;
			$context_type		= $json_data->context_type;

		// filtered_components
			$filtered_components = common::get_section_elements_context((object)[
				'ar_section_tipo'	=> $ar_section_tipo,
				'context_type'		=> $context_type
			]);

		// response
			$response->result	= $filtered_components;
			$response->msg		= 'OK. Request done';


		return $response;
	}//end get_section_elements_context



	/**
	* FILTER_GET_EDITING_PRESET
	* @return object $response
	*/
	public static function filter_get_editing_preset(object $json_data) : object {

		session_write_close();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->error	= null;

		$user_id				= navigator::get_user_id();
		$target_section_tipo	= $json_data->target_section_tipo;

		$editing_preset = search::get_preset($user_id, $target_section_tipo, DEDALO_TEMP_PRESET_SECTION_TIPO);

		// response
			$response->result	= $editing_preset;
			$response->msg		= 'Ok. Request done';


		return $response;
	}//end filter_get_editing_preset



	/**
	* FILTER_SET_EDITING_PRESET
	* @return object $response
	*/
	public static function filter_set_editing_preset(object $json_data) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->error	= null;

		$user_id		= (int)navigator::get_user_id();
		$section_tipo	= $json_data->section_tipo;
		$filter_obj		= $json_data->filter_obj;

		$save_temp_preset = search::save_temp_preset($user_id, $section_tipo, $filter_obj);

		// response
			$response->result	= $save_temp_preset;
			$response->msg		= 'OK. Request done';


		return $response;
	}//end filter_set_editing_preset



	/**
	* FILTER_GET_USER_PRESETS
	* @return object $response
	*/
	public static function filter_get_user_presets(object $json_data) : object {

		session_write_close();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->error	= null;

		$user_id				= navigator::get_user_id();
		$target_section_tipo	= $json_data->target_section_tipo;

		$filter_components = search::filter_get_user_presets($user_id, $target_section_tipo);

		// response
			$response->result	= $filter_components;
			$response->msg		= 'OK. Request done';


		return $response;
	}//end filter_get_user_presets



	/**
	* ONTOLOGY_GET_CHILDREN_RECURSIVE
	*
	* @param object $json_data
	* @return object $response
	*/
	public static function ontology_get_children_recursive(object $json_data) : object {

		// session_write_close();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->error	= null;

		// ontology call
			$target_tipo	= $json_data->target_tipo;
			$children		= ontology::get_children_recursive($target_tipo);

		// response ok
			$response->result	= $children;
			$response->msg		= 'OK. Request done';


		return $response;
	}//end ontology_get_children_recursive



	// private methods ///////////////////////////////////



	/**
	* BUILD_JSON_ROWS
	* @see class.request_query_object.php
	* @return object $result
	*/
	private static function build_json_rows(object $rqo) : object {
		$start_time	= start_time();

		// default result
			$result = new stdClass();
				$result->context	= [];
				$result->data		= [];

		// fix rqo
			dd_core_api::$rqo = $rqo;

		// des
			// // ar_dd_objects . Array of all dd objects in requested context
			// 	$ar_dd_objects = array_values( array_filter($rqo, function($item) {
			// 		 if($item->typo==='ddo') return $item;
			// 	}) );
			// 	// set as static to allow external access
			// 	dd_core_api::$ar_dd_objects = array_values($ar_dd_objects);

		// ddo_source
			$ddo_source = $rqo->source;
			// 	$ar_source = array_filter($rqo, function($item) {
			// 		 if(isset($item->typo) && $item->typo==='source') return $item;
			// 	});
			// 	if (count($ar_source)!==1) {
			// 		throw new Exception("Error Processing Request. Invalid number of 'source' items in context. Only one is allowed. Found: ".count($ar_source), 1);
			// 		return $result;
			// 	}
			// 	$ddo_source = reset($ar_source);


		// source vars
			$action			= $ddo_source->action ?? 'search';
			$mode			= $ddo_source->mode ?? 'list';
			$lang			= $ddo_source->lang ?? null;
			$section_tipo	= $ddo_source->section_tipo ?? $ddo_source->tipo;
			$section_id		= $ddo_source->section_id ?? null;
			$tipo			= $ddo_source->tipo ?? null;
			$model			= $ddo_source->model ?? RecordObj_dd::get_modelo_name_by_tipo($ddo_source->tipo,true);

		// sqo. search_query_object. If empty, we look at the session, and if not exists, we will create a new one with default values
			$sqo_id	= implode('_', [$model, $section_tipo]);
			$sqo	= !empty($rqo->sqo)
				? $rqo->sqo
				: (($model==='section' && ($mode==='edit' || $mode==='list') && isset($_SESSION['dedalo']['config']['sqo'][$sqo_id]))
					? $_SESSION['dedalo']['config']['sqo'][$sqo_id]
					: (function() use($model, $tipo, $section_tipo, $section_id, $mode, $rqo, $sqo_id, $start_time) {

						// limit. get the limit from the show
							$limit = (isset($rqo->show) && isset($rqo->show->sqo_config->limit))
								? $rqo->show->sqo_config->limit
								: (function() use($tipo, $section_tipo, $mode){
									// user preset check (defined sqo limit)
									$user_preset = layout_map::search_user_preset_layout_map(
										$tipo,
										$section_tipo,
										navigator::get_user_id(),
										$mode,
										$view=null
									);
									if (!empty($user_preset)) {
										$user_preset_rqo = $user_preset->rqo;
										if (isset($user_preset_rqo) && isset($user_preset_rqo->show->sqo_config->limit)) {
											$limit = $user_preset_rqo->show->sqo_config->limit;
										}
									}
									return $limit ?? ($mode==='list' ? 10 : 1);
								  })();
						// offset . reset to zero
							$offset	= 0;

						// build the new sqo from show or user preset

						// des
							// $sqo_options = new stdClass();
							// 	$sqo_options->id			= $sqo_id;
							// 	$sqo_options->mode			= $mode;
							// 	$sqo_options->section_tipo	= [$section_tipo];
							// 	$sqo_options->tipo			= $section_tipo;
							// 	$sqo_options->full_count	= false;
							// 	$sqo_options->add_select	= false;
							// 	$sqo_options->limit			= $limit;
							// 	$sqo_options->offset		= $offset;
							// 	$sqo_options->direct		= true;
							// 	// filter_by_locators. when section_id is received

							// 	if (!empty($section_id)) {
							// 		$self_locator = new locator();
							// 			$self_locator->set_section_tipo($section_tipo);
							// 			$self_locator->set_section_id($section_id);
							// 		$sqo_options->filter_by_locators = [$self_locator];

							// 	}
							// $sqo = common::build_search_query_object($sqo_options);

						// sqo create
							$sqo = new search_query_object();
								$sqo->set_id($sqo_id);
								$sqo->set_mode($mode);
								$sqo->set_section_tipo([$section_tipo]);
								$sqo->set_limit($limit);
								$sqo->set_offset($offset);

								if (!empty($section_id)) {
									$self_locator = new locator();
										$self_locator->set_section_tipo($section_tipo);
										$self_locator->set_section_id($section_id);
									$sqo->set_filter_by_locators([$self_locator]);
								}

						// tm case
							// if ($mode==='tm') {
							// 	$search_query_object->order = json_decode('[{"direction": "DESC","path": [{"component_tipo": "id"}]}]');
							// 	$search_query_object->limit = 10;
							// 	$search_query_object->offset= 0;
							// 	// add component tipo and lang to locator for tm search
							// 	$component_ddo = array_find($rqo, function($item){
							// 		return (isset($item->typo) && $item->typo==='ddo' && $item->type==='component');
							// 	});
							// 	$locator = reset($search_query_object->filter_by_locators);
							// 	$locator->tipo = $component_ddo->tipo;
							// 	$locator->lang = $component_ddo->lang;
							// }
							// dump($search_query_object, ' search_query_object 2 (autogenerated) ++ '.to_string());

						// debug
							// error_log("------------------------- build_json_rows sqo ------- $tipo ----". exec_time_unit($start_time,'ms').' ms');

						return $sqo;
					  })());


		// CONTEXT
			// $context = [];

			// 	switch ($action) {

			// 		case 'search': // example use: get section records in list or edit mode, search in autocomplete service

			// 			// sections
			// 				$element = sections::get_instance(null, $sqo, $tipo, $mode, $lang);

			// 				// set always
			// 				// $element->set_rqo($rqo); // inject whole rqo context

			// 			break;

			// 		case 'get_data': // example use: paginate a component portal or component autocomplete

			// 			if(strpos($model, 'component')===0) {
			// 				// component
			// 					$RecordObj_dd	= new RecordObj_dd($tipo);
			// 					$component_lang	= $RecordObj_dd->get_traducible()==='si' ? $lang : DEDALO_DATA_NOLAN;
			// 					$element		= component_common::get_instance($model,
			// 																	 $tipo,
			// 																	 $section_id,
			// 																	 $mode,
			// 																	 $component_lang,
			// 																	 $section_tipo);
			// 					if ($mode==='tm') {
			// 						// set matrix_id value to component to allow it search dato in
			// 						// matrix_time_machine component function 'get_dato' will be
			// 						// overwritten to get time machine dato instead the real dato
			// 						$element->matrix_id = $ddo_source->matrix_id;
			// 					}
			// 			}else if(strpos($model, 'area')===0) {
			// 				// area
			// 					$element = area::get_instance($model, $tipo, $mode);
			// 			}else{
			// 				// others
			// 					// get data model not defined
			// 					debug_log(__METHOD__." WARNING context:get_data model not defined for ".to_string($model), logger::WARNING);
			// 			}
			// 			break;

			// 		default:
			// 			# not defined model from context / data
			// 			debug_log(__METHOD__." 1. Ignored action '$action' - tipo: $tipo ".to_string(), logger::WARNING);
			// 			break;
			// 	}// end switch (true)


			// 	// element json
			// 		$get_json_options = new stdClass();
			// 			$get_json_options->get_context	= true;
			// 			$get_json_options->get_data		= false;
			// 		$element_json = $element->get_json($get_json_options);

			// 	// context add
			// 		$context = $element_json->context;
			// 		// $context[] = (object)[
			// 		// 	// 'source'	=> 'request_ddo',
			// 		// 	'typo'	=> 'request_ddo',
			// 		// 	'value'	=> dd_core_api::$request_ddo_value
			// 		// ];

			// 	// fix final static var context
			// 		// dd_core_api::$context = $context;

			// $context_exec_time	= exec_time_unit($start_time,'ms').' ms';


		// DATA
			// $data = [];

				$data_start_time = start_time();

				unset($element);

				switch ($action) {

					case 'search': // Used by section and service autocomplete

						// if ($model==='section'){

							// sections
								$element = sections::get_instance(null, $sqo, $tipo, $mode, $lang);

							// store sqo section
								if ($model==='section' && ($mode==='edit' || $mode==='list')) {
									$_SESSION['dedalo']['config']['sqo'][$sqo_id] = $sqo;
								}

						// }else if ($model==='area_thesaurus'){
							// IN PROCESS TO IMPLEMENT
							// // area_thesaurus
							// 	$element = area::get_instance($model, $tipo, $mode);

							// // search_action
							// 	$obj = new stdClass();
							// 		$obj->sqo	 = $sqo;
							// 	$element->set_search_action($obj);
						// }
						break;

					case 'related_search': // Used to get the related sections that call to the source section

						// sections
							$element = sections::get_instance(null, $sqo, $tipo, $mode, $lang);

						// store sqo section
							if ($model==='section' && ($mode==='edit' || $mode==='list')) {
								$_SESSION['dedalo']['config']['sqo'][$sqo_id] = $sqo;
							}
						break;

					case 'get_data': // Used by components and areas

						if (strpos($model, 'component')===0) {

							if ($section_id>=1) {
								// invalid call
								debug_log(__METHOD__." WARNING data:get_data invalid section_id ", logger::WARNING);

								// component
									$RecordObj_dd	= new RecordObj_dd($tipo);
									$component_lang	= $RecordObj_dd->get_traducible()==='si' ? $lang : DEDALO_DATA_NOLAN;
									$element		= component_common::get_instance(
										$model,
										$tipo,
										$section_id,
										$mode,
										$component_lang,
										$section_tipo,
										true // cache
									);
									if ($mode==='tm') {
										// set matrix_id value to component to allow it search dato in
										// matrix_time_machine component function 'get_dato' will be
										// overwritten to get time machine dato instead the real dato
										$element->matrix_id = $ddo_source->matrix_id;
									}
									// error_log("------------------------- build_json_rows ------- $tipo ----". exec_time_unit($start_time,'ms').' ms');

								// pagination. fix pagination vars (defined in class component_common)
									if (isset($rqo->sqo->limit) || isset($rqo->sqo->offset)) {
										$pagination = new stdClass();
											$pagination->limit	= $rqo->sqo->limit;
											$pagination->offset	= $rqo->sqo->offset;

										$element->pagination = $pagination;
									}
							}//end if ($section_id>=1)

						}else if (strpos($model, 'area')===0) {

							// areas
								$element = area::get_instance($model, $tipo, $mode);

							// thesaurus_mode
								if (isset($ddo_source->thesaurus_mode)) {
									$element->thesaurus_mode = $ddo_source->thesaurus_mode;
								}

							// search_action
								$search_action = $ddo_source->search_action ?? 'show_all';

								$obj = new stdClass();
									$obj->action = $search_action;
									$obj->sqo	 = $sqo;
									if (isset($ddo_source->hierarchy_sections)) {
										$obj->hierarchy_sections = $ddo_source->hierarchy_sections;
									}
									if (isset($ddo_source->hierarchy_terms)) {
										$obj->hierarchy_terms = $ddo_source->hierarchy_terms;
									}
								$element->set_search_action($obj);

						}else if ($model==='section') {

							// $element = section::get_instance($section_id, $section_tipo);
							// (!) Not used anymore
							debug_log(__METHOD__." WARNING data:get_data model section skip. Use action 'search' instead.", logger::WARNING);

						}else if (class_exists($model)) {

							// case menu and similar generic elements

							$element = new $model();

						}else{

							// others
								// get data model not defined
								debug_log(__METHOD__." WARNING data:get_data model not defined for tipo: $tipo ".to_string($model), logger::WARNING);
						}
						break;

					case 'resolve_data': // Used by components in search mode like portals to resolve locators data

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
							// inject custom value to the component (usually an array of locators)
								$value = $rqo->source->value ?? [];
								$element->set_dato($value);

							// pagination. fix pagination vars (defined in class component_common)
								if (isset($rqo->sqo->limit) || isset($rqo->sqo->offset)) {
									$pagination = new stdClass();
										$pagination->limit	= $rqo->sqo->limit;
										$pagination->offset	= $rqo->sqo->offset;

									$element->pagination = $pagination;
								}

						}else{

							// others
								// resolve_data model not defined
								debug_log(__METHOD__." WARNING data:resolve_data model not defined for tipo: $tipo ".to_string($model), logger::WARNING);
						}
						break;

					default:
						# not defined model from context / data
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
								$get_json_options->get_context	= true;
								$get_json_options->get_data		= true;
							$element_json = $element->get_json($get_json_options);

						// data add
							// $data = array_merge($data, $element_json->data);

						// context and data add
							$context	= $element_json->context;
							$data		= $element_json->data;

						// ar_all_section_id (experimental)
							// $ar_all_section_id = $element->get_ar_all_section_id();
							// 	dump($ar_all_section_id, ' ar_all_section_id ++ '.to_string());

					}//end if (isset($element))
					else {
						debug_log(__METHOD__." Ignored action '$action' - tipo: $tipo (No element was generated) ".to_string(), logger::WARNING);
						$context = $data = [];
					}


			// smart remove data duplicates (!)
				#$data = self::smart_remove_data_duplicates($data);

			$data_exec_time	= exec_time_unit($data_start_time,'ms').' ms';

				// dump($context, ' context ++ '.to_string());
				// dump($data, ' data ++ '.to_string());

		// Set result object
			$result->context = $context;
			$result->data 	 = $data;

		// Debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->sqo						= $sqo ?? null;
					// $debug->rqo					= $rqo;
					// $debug->context_exec_time	= $context_exec_time;
					$debug->data_exec_time			= $data_exec_time;
					$debug->exec_time				= exec_time_unit($start_time,'ms').' ms';
					$debug->memory_usage			= dd_memory_usage();
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
	private static function smart_remove_data_duplicates(array $data) : array {

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
	private static function smart_remove_context_duplicates(array $context) : array {

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



	// en private methods ///////////////////////////////////



	/**
	* GET_INDEXATION_GRID
	* @see class.request_query_object.php
	* @return dd_grid object $result
	*/
	public static function get_indexation_grid(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->error	= null;

		// validate input data
			if (empty($rqo->source->section_tipo) || empty($rqo->source->tipo) || empty($rqo->source->section_id)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty source properties (is mandatory)';
				return $response;
			}

		// ddo_source
			$ddo_source = $rqo->source;

		// source vars
			$section_tipo	= $ddo_source->section_tipo ?? $ddo_source->tipo;
			$section_id		= $ddo_source->section_id ?? null;
			$tipo			= $ddo_source->tipo ?? null;
			$value			= $ddo_source->value ?? null; // ["oh1",] array of section_tipo \ used to filter the locator with specific section_tipo (like 'oh1')

		// diffusion_index_ts
			$indexation_grid	= new indexation_grid($section_tipo, $section_id, $tipo, $value);
			$index_grid			= $indexation_grid->build_indexation_grid();

		// reponse ok
			$response->msg		= 'Ok. Request done';
			$response->result	= $index_grid;


		return $response;
	}//end get_indexation_grid



	/**
	* GET_RELATION_LIST
	* @see class.request_query_object.php
	* @return dd_grid object $result
	*/
	public static function get_relation_list(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->error	= null;

		// validate input data
			if (empty($rqo->source->section_tipo) || empty($rqo->source->tipo) || empty($rqo->source->section_id)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty source properties (is mandatory)';
				return $response;
			}

		// ddo_source
			$ddo_source = $rqo->source;

		// source vars
			$section_tipo	= $ddo_source->section_tipo ?? $ddo_source->tipo;
			$section_id		= $ddo_source->section_id ?? null;
			$tipo			= $ddo_source->tipo ?? null;
			$modo			= $ddo_source->modo ?? 'edit'; // ["oh1",] array of section_tipo \ used to filter the locator with specific section_tipo (like 'oh1')
			$sqo  			= !empty($rqo->sqo) ? $rqo->sqo : null;

		# RELATION_LIST
			$relation_list 	= new relation_list($tipo, $section_id, $section_tipo, $modo);
			$relation_list->set_sqo($sqo);

			$relation_list_json = $relation_list->get_json();

		// response ok
			$response->result 	= $relation_list_json;
			$response->msg 		= 'OK. Request done ['.__FUNCTION__.']';


		return $response;
	}//end get_relation_list



	/**
	* SERVICE_REQUEST
	* Call to service method given and return and object with the response
	*
	* Class file of current service must be exists in path: DEDALO_SERVICES_PATH / my_service / class.service.php
	* Method must be static and accept a only one object argument
	* Method must return an object like { result: mixed, msg: string }
	*
	* @param object $rqo
	* sample:
	* {
	* 	action: "service_request"
	* 	dd_api: "dd_core_api"
	* 	source: {typo: "source", action: "build_subtitles_text", model: "subtitles", arguments: {
	*   	sourceText: "rsc860"
	*		maxCharLine: 90
	*		type: "srt"
	*		tc_in_secs: 10
	*		tc_out_secs: 35
	*   }}
	* }
	* @return object response { result: mixed, msg: string }
	*/
	public static function service_request(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__METHOD__.']. ';
			$response->error	= null;

		// short vars
			$source			= $rqo->source;
			$service_name	= $source->model;
			$service_method	= $source->action;
			$arguments		= $source->arguments ?? new stdClass();

		// load services class file
			$class_file = DEDALO_CORE_PATH . '/services/' .$service_name. '/class.' . $service_name .'.php';
			if (!file_exists($class_file)) {
				$response->msg = 'Error. services class_file do not exists. Create a new one in format class.my_service_name.php ';
				if(SHOW_DEBUG===true) {
					$response->msg .= '. file: '.$class_file;
				}
				return $response;
			}
			require $class_file;

		// method (static)
			if (!method_exists($service_name, $service_method)) {
				$response->msg = 'Error. services method \''.$service_method.'\' do not exists ';
				return $response;
			}
			try {

				$fn_result = call_user_func(array($service_name, $service_method), $arguments);

			} catch (Exception $e) { // For PHP 5

				trigger_error($e->getMessage());

				$fn_result = new stdClass();
					$fn_result->result	= false;
					$fn_result->msg		= 'Error. Request failed on call_user_func service_method: '.$service_method;

			}

			$response = $fn_result;


		return $response;
	}//end service_request




}//end dd_core_api
