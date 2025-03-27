<?php declare(strict_types=1);
/**
* DD_CORE_API
* Manage API REST data with Dédalo
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

	// static debug sql_query search
		static $sql_query_search = [];



	/**
	* START
	* Builds the start page minimum context.
	* Normally is a menu and a section (based on url vars)
	* This function tells to page what must to be request, based on given url vars
	* Note that a full context is calculated for each element
	* @param object $options
	* sample:
	* {
	*	"action": "start",
	*	"prevent_lock": true,
	*	"options" : {
	*		"search_obj": {
	*			"t": "oh1",
	*			"m": "edit"
	*		 },
	*		"menu": true
	*	},
	*	"sqo": {		// optional to preserve navigation
	*		"section_tipo": [
	*			"dd1324"
	*		],
	*		"limit": 10,
	*		"offset": 0
	*	},
	* 	"source": {		// optional to preserve navigation
	*		"tipo": "dd1324",
	*		"section_tipo": "dd1324",
	*		"mode": "list"
	*	}
	* }
	* @return object $response
	*/
	public static function start(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// test jer_dd without term data catch 22 situation
			// if(defined('DEDALO_INSTALL_STATUS') && DEDALO_INSTALL_STATUS==='installed') {
			// 	try {
			// 		$RecordObj_dd = new RecordObj_dd('dd1', 'dd');
			// 		$term = $RecordObj_dd->get_term();
			// 		if (empty($term)) {
			// 			$result = area_maintenance::recover_jer_dd_column();
			// 			if ($result===false) {
			// 				debug_log(__METHOD__
			// 					. " Error recovering term column from jer_dd table" . PHP_EOL
			// 					, logger::ERROR
			// 				);
			// 			}
			// 		}
			// 	} catch (Exception $e) {
			// 		debug_log(__METHOD__
			// 			. " Error (exception) on check term jer_dd_column" . PHP_EOL
			// 			. ' Caught exception: ' . $e->getMessage()
			// 			, logger::ERROR
			// 		);
			// 	}
			// }

		// options
			$options	= $rqo->options ?? new StdClass();
			$search_obj	= $options->search_obj ?? new StdClass(); // url vars
			$menu		= $options->menu ?? false;
			// (!) properties 'sqo' and 'source' could be received too, but they are not used here but in common->build_request_config

		// recovery mode. Note that GET vars are inside $options->search_obj
		// If a URL recovery param is received as ?recovery=XXX and the value matches
		// the config DEDALO_RECOVERY_KEY, the system enters in recovery and maintenance modes
		// to allow root user login and fix the Ontology problem
			if (isset($search_obj->recovery)) {
				$dedalo_recovery_key = defined('DEDALO_RECOVERY_KEY') ? DEDALO_RECOVERY_KEY : null;
				if (!empty($dedalo_recovery_key) && $search_obj->recovery===$dedalo_recovery_key) {
					// set recovery mode (modifies config_core)
					area_maintenance::set_recovery_mode((object)[
						'value' => true
					]);
					// set maintenance mode too (modifies config_core)
					area_maintenance::set_maintenance_mode((object)[
						'value' => true
					]);
				}else{
					// return error. Prevent to calculate the environment here
					$response->msg		= 'Error. Invalid recovery key';
					$response->errors[]	= 'invalid recovery key';

					return $response;
				}
			}

		// response environment
			$response->environment = dd_core_api::get_environment();

		// fix rqo
		// Note that this RQO is used later in common->build_request_config to recover SQO and source if they exists
		// Properties 'sqo' and 'source' are used to preserve user last filter and pagination values fixed previously in browser local DDBB
		// by section build method and get by page build method
			dd_core_api::$rqo = $rqo;

		// install check
		// check if Dédalo was installed, if not, run the install process
		// else start the normal behavior
			// check constant DEDALO_TEST_INSTALL (config.php) Default value is true.
			// Change manually to false after install to prevent to do this check on every start call
			if (!defined('DEDALO_TEST_INSTALL') || DEDALO_TEST_INSTALL===true) {
				// check the dedalo install status (config_auto.php)
				// When install is finished, it will be set automatically to 'installed'
				if(!defined('DEDALO_INSTALL_STATUS') || DEDALO_INSTALL_STATUS!=='installed') {

					// run install process
						$install = new install();

					// get the install context, client only need context of the install to init the install instance
						$context[] = $install->get_structure_context();

					// response to client
						$response->result = (object)[
							'context'	=> $context,
							'data'		=> []
						];
						$response->msg = 'OK. Request done ['.__FUNCTION__.']';

						return $response;
				}
			}

		// Notify invalid rqo->options if it happens (after install check)
			if (!isset($rqo->options)) {
				debug_log(__METHOD__
					. " start rqo options is mandatory! " . PHP_EOL
					. ' rqo: '.to_string($rqo)
					, logger::ERROR
				);
			}

		// page mode and tipo
			$default_section_tipo = MAIN_FALLBACK_SECTION; // 'test38';
			if (isset($search_obj->tool)) {

				// tool case
				$tool_name = $search_obj->tool;

			}else if (isset($search_obj->locator)) {

				// locator case (pseudo locator)
				$locator		= is_string($search_obj->locator) ? json_decode($search_obj->locator) : $search_obj->locator;
				$tipo			= $locator->tipo ?? $default_section_tipo;
				$section_tipo	= $locator->section_tipo ?? $tipo;
				$section_id		= $locator->section_id ?? null;
				$mode			= $locator->mode ?? 'list';
				$lang			= $search_obj->lang	?? $search_obj->lang ?? DEDALO_DATA_LANG;
				$view			= $search_obj->view ?? null;
				$session_key	= $search_obj->session_key ?? null;

			}else{

				// default and fallback case
				$tipo			= $search_obj->t	?? $search_obj->tipo			?? $default_section_tipo; // MAIN_FALLBACK_SECTION;
				$section_tipo	= $search_obj->st	?? $search_obj->section_tipo	?? $tipo;
				$section_id		= $search_obj->id	?? $search_obj->section_id		?? null;
				$mode			= $search_obj->m	?? $search_obj->mode			?? 'list';
				$lang			= $search_obj->lang	?? $search_obj->lang			?? DEDALO_DATA_LANG;
				$view			= $search_obj->view ?? null;
				$session_key	= $search_obj->session_key ?? null;
			}

		// context
			$context = [];
			if (true!==login::is_logged()) {

				// not logged case

				// check_basic_system (lang and structure files)
					$is_system_ready = check_basic_system();
					if ($is_system_ready->result===false) {
						$msg = 'System is not ready. check_basic_system returns errors';
						$response->result	= false;
						$response->errors[]	= 'system not ready';
						$response->msg		= $msg;

						return $response;
					}

				// page context elements [login]
					$login = new login();

				// add to page context
					try {
						$login_context = $login->get_structure_context();
					} catch (Exception $e) {
						debug_log(__METHOD__
							. ' Caught exception: Error on get login context: ' . PHP_EOL
							. ' exception message: '. $e->getMessage()
							, logger::ERROR
						);
					}
					if (empty($login_context) ||
						empty($login_context->properties->login_items) // indicates Ontology tables serious problem
						) {

						// Warning: running with database problems. Load installer context instead login context
							if(defined('DEDALO_INSTALL_STATUS') &&  DEDALO_INSTALL_STATUS==='installed') {

								// status is 'installed' but database it's not available
								$msg = "Error. Your installation is set as 'installed' (DEDALO_INSTALL_STATUS) but the ontology tables are not ready (empty login_context or login_context->properties->login_items)";
								debug_log(__METHOD__
									. " $msg " . PHP_EOL
									. ' rqo: '.to_string($rqo)
									, logger::ERROR
								);
								$response->result	= false;
								$response->errors[]	= 'ontology tables not ready';
								$response->msg		= $msg;

								return $response;

							}else{

								// run install process
								$install = new install();
								$context[] = $install->get_structure_context();
							}

					}else{

						// all is OK.

						$context[] = $login_context;
					}

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
					$model		= $tool_name ?? RecordObj_dd::get_modelo_name_by_tipo($tipo, true);
					$last_error	= $_ENV['DEDALO_LAST_ERROR'] ?? '';
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

									$user_tools = tool_common::get_user_tools( logged_user_id() );
									$tool_info = array_find($user_tools, function($el) use($tool_name) {
										return $el->name===$tool_name;
									});
									if (!is_object($tool_info)) {
										debug_log(__METHOD__
											." ERROR. No tool found for tool '$tool_name' in section_tool_tipo: ".to_string($section_tool_tipo)
											, logger::ERROR
										);
									}else{
										$tool_config	= $properties->tool_config->{$tool_name} ?? false;
										$tool_context	= tool_common::create_tool_simple_context($tool_info, $tool_config);
										$config->tool_context = $tool_context;
									}
								}
							// (!) note non break switch here. It will continue with section normally.
							// section_tool don't load the section by itself.

						case ($model==='section'):

							$section = section::get_instance(
								$section_id,
								$tipo,
								$mode
							);
							$section->set_lang(DEDALO_DATA_LANG);

							// set view
								if (!empty($view)) {
									$section->set_view($view);
								}

							// structure_context
							// Using 'get_structure_context_simple' instead 'get_structure_context'
							// skips the calculation of tools and buttons that are not needed in the current step
								$current_context = $section->get_structure_context_simple(
									1, // permissions
									false // add_request_config
								);

							// section_tool config
							// the config is used by section_tool to set the tool to open, if is set, inject the config into the context.
								if (isset($config)) {
									$current_context->config = $config;
								}

							// session_key. Restore previous SQO from session when it exists
								if (isset($session_key) && isset($_SESSION['dedalo']['config']['sqo'][$session_key])) {

									// request_config
										$request_config = array_find($current_context->request_config ?? [], function($el){
											return $el->api_engine==='dedalo';
										});
										if (is_object($request_config)) {
											// overwrite default SQO with previously saved session SQO
											// This allows to refresh the page without loosing the last SQO (filter, pagination, etc.)
											// Is normally called as iframe from component_portal link button in order to select a item
											$request_config->sqo = $_SESSION['dedalo']['config']['sqo'][$session_key];
										}
								}

							// section_id given case. If is received section_id, we build a custom sqo with the proper filter
							// and override default request_config SQO into the section context
								if (!empty($section_id)) {

									$current_context->mode			= 'edit'; // force edit mode
									$current_context->section_id	= $section_id; // set section_id in context

									// request_config
										$request_config = array_find($current_context->request_config ?? [], function($el){
											return $el->api_engine==='dedalo';
										});
										if (is_object($request_config)) {
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

							// set view
								if (!empty($view)) {
									$area->set_view($view);
								}

							// structure_context
							// Using 'get_structure_context_simple' instead 'get_structure_context'
							// skips the calculation of tools and buttons that are not needed in the current step
								$current_context = $area->get_structure_context_simple(
									1, // permissions
									false // add_request_config
								);

							// set properties with received vars
								if (isset($search_obj->thesaurus_mode)) {
									$current_context->properties->thesaurus_mode = $search_obj->thesaurus_mode;
								}
								if (isset($search_obj->hierarchy_types)) {
									$current_context->properties->hierarchy_types = json_decode($search_obj->hierarchy_types);
								}
								if (isset($search_obj->hierarchy_sections)) {
									$current_context->properties->hierarchy_sections = json_decode($search_obj->hierarchy_sections);
								}
								if (isset($search_obj->hierarchy_terms)) {
									$current_context->properties->hierarchy_terms = json_decode($search_obj->hierarchy_terms);
								}

							// add to page context
								$context[] = $current_context;
							break;

						case (strpos($model, 'tool_')===0):

							// resolve tool from name and user
								$user_id			= logged_user_id();
								$registered_tools	= tool_common::get_user_tools($user_id);
								$tool_found = array_find($registered_tools, function($el) use($model){
									return $el->name===$model;
								});
								if (!is_object($tool_found)) {
									debug_log(__METHOD__
										." Tool $model not found in tool_common::get_user_tools "
										, logger::ERROR
									);
								}else{
									$section_tipo	= $tool_found->section_tipo;
									$section_id		= $tool_found->section_id;

									$element = new $model($section_id, $section_tipo);

									// structure_context
									// Using 'get_structure_context_simple' instead 'get_structure_context'
									// skips the calculation of tools and buttons that are not needed in the current step
										$current_context = $element->get_structure_context_simple(
											1, // permissions
											false // add_request_config
										);
									// add to page context
										$context[] = $current_context;
								}
							break;

						case (strpos($model, 'area')===0):

							$area = area::get_instance($model, $tipo, $mode);
							$area->set_lang(DEDALO_DATA_LANG);

							// set view
								if (!empty($view)) {
									$area->set_view($view);
								}

							// structure_context
							// Using 'get_structure_context_simple' instead 'get_structure_context'
							// skips the calculation of tools and buttons that are not needed in the current step
								$current_context = $area->get_structure_context_simple(
									1, // permissions
									false // add_request_config
								);

							// add to page context
								$context[] = $current_context;
							break;

						case (strpos($model, 'component_')===0):

							$component_lang	= (RecordObj_dd::get_translatable($tipo)===true)
								? $lang
								: DEDALO_DATA_NOLAN;

							// component
								$element = component_common::get_instance(
									$model,
									$tipo,
									null, // do not use section_id here because force unneeded load dato
									$mode,
									$component_lang,
									$section_tipo
								);

							// set view
								if (!empty($view)) {
									$element->set_view($view);
								}

							// structure_context
							// Using 'get_structure_context_simple' instead 'get_structure_context'
							// skips the calculation of tools and buttons that are not needed in the current step
								$current_context = $element->get_structure_context_simple(
									1, // permissions
									false // add_request_config
								);

							// add section_id
								$current_context->section_id = $section_id;

							// view. Overwrite default if is passed
								if (!empty($view)) {
									$current_context->view = $view;
								}

							// context add
								$context[] = $current_context;
							break;

						case (strpos($last_error, 'get_connection')!==false):
							// DB connection error
							// This case could be caused by database connection error
							// such as PostgreSQL unavailable
							// Normally comes from RecordDataBoundObject::get_connection
							$response->errors[] = 'Invalid database connection. Check that PostgreSQL is running and is available.';
							break;

						default:
							// other cases

							if (empty($model)) {
								// Bad tipo error case
								debug_log(__METHOD__
									. " Invalid tipo is received. The model cannot be resolved " . PHP_EOL
									. ' tipo: ' . to_string($tipo)
									, logger::ERROR
								);
								$response->errors[] = 'Invalid tipo ' . $tipo;
							}
							break;
					}//end switch (true)


				// unlock user components. Normally this occurs when user force reload the page
					if (DEDALO_LOCK_COMPONENTS===true) {
						lock_components::force_unlock_all_components( logged_user_id() );
					}
			}//end if (login::is_logged()!==true)

		// response OK
			$response->result = (object)[
				'context'	=> $context,
				'data'		=> []
			];
			$response->msg = empty($response->errors)
				? 'OK. Request done'
				: 'Warning! Request done with errors. ' . to_string($response->errors);


		return $response;
	}//end start



	/**
	* READ
	* Get context and data from given source
	* Different modes are available using source->action value:
	* @see dd_core_api::build_json_rows()
	* 	search			// Used by section and service autocomplete
	* 	related_search	// Used to get the related sections that call to the source section
	* 	get_data		// Used by components and areas to get basic context and data
	* 	resolve_data	// Used by components in search mode like portals to resolve locators data
	* @see self::build_json_rows
	*
	* @param object $rqo
	* sample:
		* {
		*    "id": "section_rsc167_rsc167_edit_lg-eng",
		*    "action": "read",
		*    "source": {
		*        "typo": "source",
		*        "action": "search",
		*        "model": "section",
		*        "tipo": "rsc167",
		*        "section_tipo": "rsc167",
		*        "section_id": null,
		*        "mode": "edit",
		*        "lang": "lg-eng"
		*    },
		*    "sqo": {
		*        "section_tipo": [
		*            "rsc167"
		*        ],
		*        "offset": 0,
		*        "select": [],
		*        "full_count": false,
		*        "limit": 1
		*    }
		* }
	* @return object $response
	* sample:
		*  $response->result = {
		* 		context : array
		* 		data : array
		*  }
	*/
	public static function read(object $rqo) : object {

		// response
		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// validate input data
			if (empty($rqo->source->section_tipo)) {

				$response->msg		= 'Error: ('.__FUNCTION__.') Empty source \'section_tipo\' (is mandatory)';
				$response->errors[]	= 'empty source section_tipo';

				debug_log(__METHOD__
					." $response->msg " . PHP_EOL
					.' rqo: ' . to_string($rqo)
					, logger::ERROR
				);

				return $response;
			}

		// redirect to the method
			switch ($rqo->source->action) {
				case 'get_value':
					// get component value (plain value)
					$response = self::get_component_value($rqo);
					break;

				default:
					// build rows (context & data)
					$response = self::build_json_rows($rqo);
					break;
			}

		// activity. Logging activity with Dédalo logger
			self::log_activity((object)[
				'rqo'			=> $rqo,
				'section_id'	=> $response->result->data[0]->value[0]->section_id ?? null
			]);

		// debug
			if(SHOW_DEBUG===true) {
				$response->debug = new stdClass();
				if (!empty(dd_core_api::$sql_query_search)) {
					$response->debug->sql_query_search = dd_core_api::$sql_query_search;
				}
			}


		return $response;
	}//end read



	/**
	* READ_RAW
	* Get full record data of section
	* @param object $rqo
	* sample:
	* {
	*    "action": "read_raw",
	*    "source": {
	*        "typo": "source",
	*        "model": "section",
	*        "tipo": "rsc167",
	*        "section_tipo": "rsc167",
	*        "section_id": "1",
	*        "mode": "edit",
	*        "lang": "lg-eng"
	*    }
	* }
	* @return object $response
	*/
	public static function read_raw(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.'] ';
			$response->errors	= [];

		// validate input data
			if (empty($rqo->source->section_tipo)) {
				$response->msg = 'API Error: ('.__FUNCTION__.') Empty source \'section_tipo\' (is mandatory)';
				$response->errors[] = 'empty source section_tipo';
				return $response;
			}

		// short vars
			$section_tipo	= $rqo->source->section_tipo;
			$section_id		= $rqo->source->section_id;

		// safe section_id
			if ( (int)$section_id<1 ) {
				$response->msg .= 'Invalid section_id: '.to_string($section_id);
				$response->errors[] = 'invalid section_id';
				return $response;
			}

		// section data raw
			$section	= section::get_instance($section_id, $section_tipo);
			$dato		= $section->get_dato();

		// response success
			$response->result	= $dato;
			$response->table	= common::get_matrix_table_from_tipo($section_tipo);
			$response->msg		= empty($response->errors)
				? 'OK. Request done'
				: 'Warning! Request done with errors';


		return $response;
	}//end read_raw



	/**
	* CREATE
	* Creates a new database record of given section tipo
	* and returns the new section_id assigned by the counter
	* @param object $json_data
	* sample:
	* {
	*    "action": "create",
	*    "source": {
	*        "section_tipo": "oh1"
	*    }
	* }
	* @return object $response
	*/
	public static function create(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// short vars
			$source			= $rqo->source;
			$section_tipo	= $source->section_tipo;

		// section_tipo
			if (empty($section_tipo)) {
				$response->msg = 'API Error: ('.__FUNCTION__.') Empty section_tipo (is mandatory)';
				return $response;
			}

		// section
			$section	= section::get_instance(null, $section_tipo);
			$section_id	= $section->Save(); // Section save, returns the created section_id

			if (empty($section_id)) {
				$response->errors[] = 'Failed to save the section';
			}

		// OJO : Aquí, cuando guardemos las opciones de búsqueda, resetearemos el count para forzar a recalcular el total
			//   esto está ahora en 'section_records' pero puede cambiar..
			// Update search_query_object full_count property
				// $search_options = section_records::get_search_options($section_tipo);
				// if (isset($search_options->search_query_object)) {
				// 	$search_options->search_query_object->full_count = true; // Force re-count records
				// }

		$response->result	= $section_id;
		$response->msg		= empty($response->errors)
			? 'OK. Request done'
			: 'Warning! Request done with errors';


		return $response;
	}//end create



	/**
	* DUPLICATE
	* Duplicates a section record of given section tipo and section_id
	* and returns the new section_id assigned by counter
	* @param object $rqo
	* sample:
	* {
	*    "action": "duplicate ",
	*    "source": {
	*        "section_tipo": "oh1"
	* 		"section_id": "2"
	*    }
	* }
	* @return object $response
	*/
	public static function duplicate(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.'] ';
			$response->errors	= [];

		// short vars
			$source			= $rqo->source;
			$section_tipo	= $source->section_tipo;
			$section_id		= $source->section_id;

		// section_tipo
			if (empty($section_tipo)) {
				$response->msg = 'API Error: ('.__FUNCTION__.') Empty section_tipo (is mandatory)';
				$response->errors[] = 'empty section tipo';
				return $response;
			}

		// section
		// section duplicate current.Returns the section_id created
			$section	= section::get_instance($section_id, $section_tipo);
			$section_id	= $section->duplicate_current_section();

			if (empty($section_id)) {
				$response->errors[] = 'Failed to duplicate the section';
			}

		$response->result	= $section_id;
		$response->msg		= empty($response->errors)
			? 'OK. Request done'
			: 'Warning! Request done with errors';


		return $response;
	}//end duplicate



	/**
	* DELETE
	* Removes one or more section records from database
	* If sqo is received, it will be used to search target sections,
	* else a new sqo will be created based on current section_tipo, section_id
	* Note that 'delete_mode' must be declared (delete_data|delete_record)
	* @param object $rqo
	* sample:
		* {
		*	"action": "delete",
		*	"source": {	*
		*		"action": "delete",
		*		"model": "section",
		*		"tipo": "oh1",
		*		"section_tipo": "oh1",
		*		"section_id": null,
		*		"mode": "list",
		*		"lang": "lg-eng",
		*		"delete_mode": "delete_record"
		* 	},
		*	"options": {
		*		"delete_diffusion_records": true
		*	},
		*	"sqo": {
		*		"section_tipo": [
		*		"oh1"
		*		],
		*		"filter_by_locators": [
		*			{
		*				"section_tipo": "oh1",
		*				"section_id": "127"
		*			}
		*		],
		*		"limit": 1
		*		}
		* }
	* @return object $response
	*/
	public static function delete(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed. ';
			$response->errors	= [];

		// ddo_source
			$ddo_source = $rqo->source ?? null;
			if (!$ddo_source) {
				$response->errors[] = 'missing dd_source';
				$response->msg .= ' [1] Missing ddo_source.';
				return $response;
			}

		// source vars
			$tipo	= $ddo_source->tipo;
			$model	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			// Ensure model is 'section'
			if($model!=='section') {
				$response->errors[] = 'invalid model';
				$response->msg 	.= '[1] Model is not expected section: '.$model;
				debug_log(__METHOD__
					." $response->msg " . PHP_EOL
					.' rqo: '.to_string($rqo)
					, logger::ERROR
				);
				return $response;
			}

		// options
			$options = new stdClass();
				$options->delete_mode				= $ddo_source->delete_mode ?? 'delete_data';
				$options->section_tipo				= $ddo_source->section_tipo ?? $tipo;
				$options->section_id				= $ddo_source->section_id ?? null;
				$options->caller_dataframe			= $ddo_source->caller_dataframe ?? null;
				$options->sqo						= $rqo->sqo ?? null;
				$options->delete_diffusion_records	= $rqo->options->delete_diffusion_records ?? null;
				$options->delete_with_children		= $rqo->options->delete_with_children ?? false;

		// Delete in sections
			$sections = sections::get_instance( null, null );
			$response = $sections->delete( $options );


		return $response;
	}//end delete



	/**
	* SAVE
	* Saves the given value to the component data into the database.
	* @see $component_common->update_data_value
	* save actions:
	* 	insert		// add given value in dato
	* 	update		// updates given value selected by key in dato
	* 	remove		// removes a item value from the component data array
	* 	set_data	// set the whole data sent by the client without check the array key (bulk insert or update)
	* 	sort_data	// re-organize the whole component data based on target key given. Used by portals to sort rows
	* @param object $json_data
	* sample:
		* {
		*    "action": "save",
		*    "source": {
		*        "typo": "source",
		*        "type": "component",
		*        "action": null,
		*        "model": "component_input_text",
		*        "tipo": "oh16",
		*        "section_tipo": "oh1",
		*        "section_id": "124",
		*        "mode": "edit",
		*        "lang": "lg-eng"
		*    },
		*    "data": {
		*        "section_id": "124",
		*        "section_tipo": "oh1",
		*        "tipo": "oh16",
		*        "lang": "lg-eng",
		*        "from_component_tipo": "oh16",
		*        "value": [
		*            "title2"
		*        ],
		*        "parent_tipo": "oh1",
		*        "parent_section_id": "124",
		*        "fallback_value": [
		*            "title"
		*        ],
		*        "debug_model": "component_input_text",
		*        "debug_label": "Title",
		*        "debug_mode": "edit",
		*        "row_section_id": "124",
		*        "changed_data": [{
		*            "action": "update",
		*            "key": 0,
		*            "value": "title2"
		*        }]
		*    }
		* }
	* @return object $response
	*/
	public static function save(object $rqo) : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// rqo vars
			$source	= $rqo->source;
			$data	= $rqo->data ?? new stdClass();

		// short vars
			$tipo				= $source->tipo;
			$model				= $source->model ?? RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$section_tipo		= $source->section_tipo;
			$section_id			= $source->section_id;
			$mode				= $source->mode ?? 'list';
			$view				= $source->view ?? null;
			$lang				= $source->lang;
			$type				= $source->type; // the type of the dd_object that is calling to update like 'component'
			$changed_data		= $data->changed_data ?? null;
			$caller_dataframe	= $source->caller_dataframe ?? null;

		// activity section check
			if ($section_tipo===DEDALO_ACTIVITY_SECTION_TIPO && strpos($section_id, 'search_')===false) {
				$response->msg = 'Error. Illegal save to activity';
				$response->errors[] = 'illegal section tipo';
				debug_log(__METHOD__
					. " $response->msg "
					, logger::ERROR
				);

				return $response;
			}

		// switch by the element context type (component, section)
		switch ($type) {
			case 'component':

				// build the component
					$component = component_common::get_instance(
						$model,
						$tipo,
						$section_id,
						$mode,
						$lang,
						$section_tipo,
						true,
						$caller_dataframe ?? null
					);

				// view
					if (!empty($view)) {
						$component->set_view($view);
					}

				// permissions. Get the component permissions and check if the user can update the component
					$permissions = $component->get_component_permissions();
					if($permissions < 2) {
						$response->errors[]	= 'insufficient permissions';
						$response->msg		= 'Error. You don\'t have enough permissions to edit this component ('.$tipo.'). permissions:'.to_string($permissions);
						debug_log(__METHOD__
							. " $response->msg " . PHP_EOL
							. " model:$model (tipo:$tipo - section_tipo:$section_tipo - section_id:$section_id) "
							, logger::ERROR
						);
						return $response;
					}

				// changed_data is array always. Check to safe value
					if (!is_array($changed_data)) {
						$changed_data = [$changed_data];
						$response->errors[]	= 'changed_data must be array';
						debug_log(__METHOD__
							." ERROR. var 'changed_data' expected to be array. Received type: " . PHP_EOL
							.' type: ' 			. gettype($changed_data) . PHP_EOL
							.' changed:data: ' 	. to_string($changed_data)
							, logger::ERROR
						);
					}

				if ($mode==='search') {

					// force same changed_data (whole dato)
						$changed_data_item	= $changed_data[0] ?? null;
						$value				= !empty($changed_data_item) && isset($changed_data_item->value)
							? $changed_data_item->value
							: null;
						$component->set_dato([$value]);

				}else{

					// changed_data is array always. Update items
						foreach ($changed_data as $changed_data_item) {
							// update the dato with the changed data sent by the client
							$update_result = (bool)$component->update_data_value($changed_data_item);
							if ($update_result===false) {
								$response->errors[]	 = 'update_data_value failed';
								$response->msg		.= ' Error on update_data_value. New data it\'s not saved! ';
								debug_log(__METHOD__
									. " $response->msg " . PHP_EOL
									. " model:$model (tipo:$tipo - section_tipo:$section_tipo - section_id:$section_id) " . PHP_EOL
									.' rqo: '.to_string($rqo)
									, logger::ERROR
								);
								return $response;
							}
						}

					// save
						debug_log(__METHOD__
							." --> API ready to save record $model ($tipo - $section_tipo - $section_id): "
							.' exec time: '.exec_time_unit($start_time).' ms'
							, logger::DEBUG
						);
						$save_result = $component->Save();
						if (is_null($save_result)) {
							$response->errors[]	 = 'error on save';
							$response->msg		.= ' Error on component Save. data it\'s not saved! ';
							debug_log(__METHOD__
								. " $response->msg " . PHP_EOL
								. " model:$model (tipo:$tipo - section_tipo:$section_tipo - section_id:$section_id) " . PHP_EOL
								.' rqo: '.to_string($rqo)
								, logger::ERROR
							);
							return $response;
						}

					// force recalculate dato
						$dato = $component->get_dato();

					// changed_data action: sort_data, add_new_element, insert, remove ..
						$changed_data_action = isset($changed_data[0])
							? $changed_data[0]->action
							: null;

					// pagination. Update offset based on save request (portals)
						// data->pagination->limit
						if (isset($data->pagination->limit)) {
							// useful when user selects 'Show all' in portal pagination
							$component->pagination->limit = $data->pagination->limit;
						}

						switch ($changed_data_action) {
							case 'add_new_element': // from button add
							case 'insert': // from service_autocomplete choose selection

								// pagination
									$total	= empty($dato) ? 0 : count($dato);
									$limit	= isset($component->pagination->limit)
										? (int)$component->pagination->limit
										: 10;
									$pages	= $limit>0
										? (int)ceil($total / $limit)
										: 1;
									$offset	= $limit>=$total
										? 0
										: $limit * ($pages - 1);

									// overwrite values
									$component->pagination->limit	= $limit;
									$component->pagination->total	= $total;
									$component->pagination->offset	= $offset;
									if(SHOW_DEBUG===true) {
										// dump($component->pagination, ' ))))) component->pagination ++ pages: '.to_string($pages));
									}
								break;

							default:
								// Nothing to do
								break;
						}

					// pagination. Update offset based on save request (portals)
						// if (isset($data->pagination) && isset($data->pagination->offset)) {
						// 	$component->pagination->offset = $data->pagination->offset;
						// }
						// if (isset($data->pagination) && isset($data->pagination->limit)) {
						// 	$component->pagination->limit = $data->pagination->limit;
						// }
				}

				// datalist. if is received, inject to the component for recycle
					if (isset($data->datalist)) {
						$component->set_datalist($data->datalist);
					}

				// force recalculate dato
					$component->set_dato_resolved(null);

				// element JSON
					$get_json_options = new stdClass();
						$get_json_options->get_context	= true;
						$get_json_options->get_data		= true;
					$element_json = $component->get_json($get_json_options);

				// observers_data
					if (isset($component->observers_data)) {
						$element_json->data = array_merge($element_json->data, $component->observers_data);
					}

				// context and data set
					$result = $element_json;

				break;

			default:
				debug_log(__METHOD__
					. " Error. This type '$type' is not defined and will be ignored. Use 'component' as type if you are saving a component data" . PHP_EOL
					. " model:$model (tipo:$tipo - section_tipo:$section_tipo - section_id:$section_id) " . PHP_EOL
					.' rqo: '.to_string($rqo)
					, logger::ERROR
				);
				break;
		}//end switch ($type)

		// result. If the process is successful, we return the $element_json as result to client
			$response->result	= $result ?? false;
			$response->msg		= empty($response->errors)
				? 'OK. Request save done successfully'
				: 'Warning! Request save done with errors';


		return $response;
	}//end save



	/**
	* COUNT
	* Exec a SQL records count of given SQO
	* @param object $json_data
	* sample:
		* {
		*    "action": "count",
		*    "source": {
		*        "typo": "source",
		*        "type": "tm",
		*        "action": null,
		*        "model": "service_time_machine",
		*        ..
		*    },
		*    "sqo": {
		*        "id": "tmp",
		*        "mode": "tm",
		*        "section_tipo": [
		*            "oh1"
		*        ]
		*    },
		*    "prevent_lock": true
		* }
	* @return object $response
	*/
	public static function count(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// rqo vars
			$tipo	= $rqo->source->tipo;
			$model	= $rqo->source->model ?? RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$sqo	= $rqo->sqo;
			$mode	= $rqo->source->mode ?? 'list'; //set default for section count

		// prevent_lock. Close session if not already closed
			if (!isset($rqo->prevent_lock)) {
				session_write_close();
			}

		// permissions check. If user don't have access to any section, set total to zero and prevent search
			$ar_section_tipo = $sqo->section_tipo;
			if( empty($ar_section_tipo) ){
				$response->result = 0;
				return $response;
			}
			foreach ($ar_section_tipo as $current_section_tipo) {
				if($current_section_tipo===DEDALO_SECTION_USERS_TIPO) {
					$permissions = common::get_permissions($current_section_tipo, $current_section_tipo);
					if($permissions<1){
						$result = (object)[
							'total' => 0
						];
					}
				}
			}

		// session filter check
			// If session filter exists from current section, add to the sqo
			// to be consistent with the last search
			$sqo_id = ($model==='section')
				? section::build_sqo_id($tipo)
				: 'undefined';
			$sqo_session = $_SESSION['dedalo']['config']['sqo'][$sqo_id] ?? null;
			if ( !property_exists($sqo, 'filter') && isset($sqo_session) && isset($sqo_session->filter) ) {
				$sqo->filter = $sqo_session->filter;
			}
			if ( !property_exists($sqo, 'filter_by_locators') && isset($sqo_session) && isset($sqo_session->filter_by_locators) ) {
				$sqo->filter_by_locators = $sqo_session->filter_by_locators;
			}

		// search
			if (!isset($result)) {
				$search	= search::get_instance($sqo);
				$result	= $search->count();
			}

		// response OK
			$response->result	= $result;
			$response->msg		= empty($response->errors)
				? 'OK. Request done successfully'
				: 'Warning! Request done with errors. ' . $response->msg;


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
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// rqo vars
			$source			= $rqo->source;
			$tipo			= $source->tipo ?? null;
			$section_tipo	= $source->section_tipo ?? $source->tipo ?? null;
			$model			= $source->model ?? RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$lang			= $source->lang ?? DEDALO_DATA_LANG;
			$mode			= $source->mode ?? 'list';
			$section_id		= $source->section_id ?? null; // only used by tools (it needed to load the section_tool record to get the context )
			$simple			= $rqo->simple ?? false; // simple context response

		// build element
			switch (true) {
				case $model==='section':
					$element = section::get_instance(null, $section_tipo, $mode);
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

					$component_lang	= (RecordObj_dd::get_translatable($tipo)===true)
						? $lang
						: DEDALO_DATA_NOLAN;

					$element = component_common::get_instance(
						$model,
						$tipo,
						null, // string section_id
						$mode,
						$component_lang,
						$section_tipo
					);
					break;

				case strpos($model, 'tool_')===0:

					// tool section_tipo and section_id can be resolved from model if is necessary
						// if (empty($section_id) || empty($section_id)) {
						// 	// resolve
						// 	$registered_tools = tool_common::get_all_registered_tools();
						// 	$tool_found = array_find($registered_tools, function($el) use($model){
						// 		return $el->name===$model;
						// 	});
						// 	if (!empty($tool_found)) {
						// 		$section_tipo	= $tool_found->section_tipo;
						// 		$section_id		= $tool_found->section_id;
						// 	}else{
						// 		debug_log(__METHOD__." Tool $model not found in tool_common::get_all_registered_tools ".to_string(), logger::ERROR);
						// 	}
						// }

					// resolve tool from name and user
						$user_id			= logged_user_id();
						$registered_tools	= tool_common::get_user_tools($user_id);
						$tool_found			= array_find($registered_tools, function($el) use($model){
							return $el->name===$model;
						});
						if (!is_object($tool_found)) {
							debug_log(__METHOD__
								." Tool '$model' not found in tool_common::get_user_tools " .PHP_EOL
								.' rqo: '.to_string($rqo)
								, logger::ERROR
							);
							$response->msg = 'Error. tool not found: '.$model;
							$response->errors[] = 'tool not found';

							return $response;
						}

					// create tool instance
						$section_tipo	= $tool_found->section_tipo;
						$section_id		= $tool_found->section_id;

						$element = new $model($section_id, $section_tipo);
					break;

				default:

					// others

					try {
						$element = new $model($mode);
					} catch (Exception $e) {
						// throw new Exception("Error Processing Request", 1);
						debug_log(__METHOD__
							." invalid element. exception msg: ".$e->getMessage()
							, logger::ERROR
						);
						$response->msg = 'Error. model not found: '.$model;
						$response->errors[] = 'model not found';
						return $response;
					}
					break;
			}


		// context
			if ($simple===true) {

				// simple context case

				$context = $element->get_structure_context_simple(
					1, // permissions
					false // add_request_config
				);
			}else{

				// default case

				// element JSON
					$get_json_options = new stdClass();
						$get_json_options->get_context	= true;
						$get_json_options->get_data		= false;
					$element_json = $element->get_json($get_json_options);

				$context = $element_json->context;
			}

		// response
			$response->result	= $context;
			$response->msg		= empty($response->errors)
				? 'OK. Request done successfully'
				: 'Warning! Request done with errors';


		return $response;
	}//end get_element_context



	/**
	* GET_SECTION_ELEMENTS_CONTEXT
	* Get all components of current section (used in section search filter and tool export)
	* Used by filter and tool_export
	* @param object $rqo
	*	{
	*		action			: 'get_section_elements_context',
	*		prevent_lock	: true,
	*		"source": {
	*			"typo": "source",
	*			"type": "filter",
	*			"action": null,
	*			"model": "search",
	*			"section_tipo": "numisdata4",
	*			"section_id": 0,
	*			"mode": "list",
	*			"view": null,
	*			"lang": "lg-eng"
	*		},
	*		options			: {
	*			context_type			: 'simple',
	*			ar_section_tipo			: section_tipo,
	*			use_real_sections		: true,
	*			ar_components_exclude	: ar_components_exclude
	*		}
	*	}
	* @return object $response
	*/
	public static function get_section_elements_context(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// options
			$options				= $rqo->options;
			$context_type			= $options->context_type;
			$ar_section_tipo		= (array)$options->ar_section_tipo;
			$use_real_sections		= $options->use_real_sections ?? false;
			$ar_components_exclude	= $options->ar_components_exclude ?? null;
			$skip_permissions		= $options->skip_permissions ?? false;

		// section_elements_context_options
			$section_elements_context_options = (object)[
				'context_type'		=> $context_type,
				'ar_section_tipo'	=> $ar_section_tipo,
				'use_real_sections'	=> $use_real_sections,
				'skip_permissions'	=> $skip_permissions
			];
			if (isset($ar_components_exclude)) {
				$section_elements_context_options->ar_components_exclude = $ar_components_exclude;
			}

		// filtered_components
			$filtered_components = common::get_section_elements_context(
				$section_elements_context_options
			);

		// response
			$response->result	= $filtered_components;
			$response->msg		= empty($response->errors)
				? 'OK. Request done successfully'
				: 'Warning! Request done with errors';


		return $response;
	}//end get_section_elements_context



	// search methods ///////////////////////////////////



	/**
	* BUILD_JSON_ROWS
	* Gets context and data from given element (section, component, area)
	* @see class.request_query_object.php
	* @param object $rqo
	* @return object $response
	*/
	private static function build_json_rows(object $rqo) : object {
		$start_time	= start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

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

		// source vars
			$action				= $ddo_source->action ?? 'search';
			$mode				= $ddo_source->mode ?? 'list';
			$view				= $ddo_source->view ?? null;
			$lang				= $ddo_source->lang ?? null;
			$tipo				= $ddo_source->tipo ?? null;
			$section_tipo		= $ddo_source->section_tipo ?? $ddo_source->tipo;
			$section_id			= $ddo_source->section_id ?? null;
			$model				= $ddo_source->model ?? RecordObj_dd::get_modelo_name_by_tipo($ddo_source->tipo,true);
			$caller_dataframe	= $ddo_source->caller_dataframe ?? null;
			$properties			= $ddo_source->properties ?? null;
			$session_save		= $ddo_source->session_save ?? true;
			$session_key		= $ddo_source->session_key ?? (($model==='section')
				? section::build_sqo_id($tipo)
				: 'undefined'
			); // cache key sqo_id;

		// sqo (search_query_object)
			// If empty, we look at the session, and if not exists, we will create a new one with default values
			$sqo_id			= $session_key; // cache key sqo_id
			$sqo_session	= $_SESSION['dedalo']['config']['sqo'][$sqo_id] ?? null;
			if ( !empty($rqo->sqo) ) {

				// received case

				$sqo = clone $rqo->sqo;

				// Session search
				// Two scenarios: in the main window, in secondary window
				// if the session_save is false, the user is outside the main window, the search will be exactly the client send
				// if the session_save is true, the user is inside the main window
				// to maintain the filter and order, get it from session when the client doesn't send it
				if($session_save===true){
					// add filter from session if not defined (and session yes)
					if ( !property_exists($sqo, 'filter') && isset($sqo_session) && isset($sqo_session->filter) ) {
						$sqo->filter = $_SESSION['dedalo']['config']['sqo'][$sqo_id]->filter;
					}

					// add order from session if not defined (and session yes)
					if ( !property_exists($sqo, 'order') && isset($sqo_session) && isset($sqo_session->order) ) {
						$sqo->order = $_SESSION['dedalo']['config']['sqo'][$sqo_id]->order;
					}

					// add limit from session if not defined (and session yes)
					if ( !property_exists($sqo, 'limit') && isset($sqo_session) && isset($sqo_session->limit) ) {
						$sqo->limit = $_SESSION['dedalo']['config']['sqo'][$sqo_id]->limit;
					}

					// add offset from session if not defined (and session yes)
					if ( !property_exists($sqo, 'offset') && isset($sqo_session) && isset($sqo_session->offset) ) {
						$sqo->offset = $_SESSION['dedalo']['config']['sqo'][$sqo_id]->offset;
					}

					// add filter_by_locators from session if not defined (and session yes)
					if ( !property_exists($sqo, 'filter_by_locators') && isset($sqo_session) && isset($sqo_session->filter_by_locators) ) {
						$sqo->filter_by_locators = $_SESSION['dedalo']['config']['sqo'][$sqo_id]->filter_by_locators;
					}
					// add children_recursive from session if not defined (and session yes)
					if ( !property_exists($sqo, 'children_recursive') && isset($sqo_session) && isset($sqo_session->children_recursive) ) {
						$sqo->children_recursive = $_SESSION['dedalo']['config']['sqo'][$sqo_id]->children_recursive;
					}
				}

			}else{

				// non received case

				if ( $model==='section' && ($mode==='edit' || $mode==='list') && isset($sqo_session) ) {

					// use session already set sqo
					$sqo = $sqo_session;

				}else{

					// create a new sqo from scratch

					// limit. get the limit from the show
						$limit = (isset($rqo->show) && isset($rqo->show->sqo_config->limit))
							? $rqo->show->sqo_config->limit
							: (function() use($tipo, $section_tipo, $mode){
								// user preset check (defined sqo limit)
								$user_preset = request_config_presets::search_request_config(
									$tipo,
									$section_tipo,
									logged_user_id(), // int $user_id
									$mode,
									null // view
								);
								if (!empty($user_preset[0])) {
									$user_preset_rqo = $user_preset[0]->rqo;
									if (isset($user_preset_rqo) && isset($user_preset_rqo->show->sqo_config->limit)) {
										$limit = $user_preset_rqo->show->sqo_config->limit;
									}
								}
								return $limit ?? ($mode==='list' ? 10 : 1);
							  })();

					// offset . reset to zero
						$offset	= 0;

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
				}
			}//end if (!empty($rqo->sqo))

		// DATA
			switch ($action) {

				case 'search': // Used by section and service autocomplete

					// check if the search has a dataframe associated (time_machine of the component with dataframe)
					// when the component has a dataframe need to be re_created using his own data with the dataframe data
					// it will be showed as an unique component, the main component and his dataframe
						// if( $ddo_source->mode === 'tm'
						// 	&& isset($ddo_source->has_dataframe)
						// 	&& $ddo_source->has_dataframe=== true ){

						// 	$original_limit		= $sqo->limit;
						// 	$original_offset	= $sqo->offset;
						// 	// set the limit and offset to 0 to search all data in time_machine
						// 	$sqo->limit = 0;
						// 	$sqo->offset = 0;
						// 	$full_data = [];

						// 	// 1 first get the data of the main component
						// 	// using the sqo sent by the client
						// 		$source_sections  = sections::get_instance(
						// 			null, // ?array $ar_locators
						// 			$sqo, // object $search_query_object = null
						// 			$tipo, // string $caller_tipo = null (section/portal)
						// 			$mode, // string $mode = 'list'
						// 			$lang // string $lang = DEDALO_DATA_NOLAN
						// 		);
						// 		$full_data = array_merge($full_data, $source_sections->get_dato());

						// 	// 2 get the data of his dataframe
						// 		$original_ddo = array_find($rqo->show->ddo_map ?? [], function($item){
						// 			return isset($item->has_dataframe) && $item->has_dataframe===true;
						// 		});
						// 		if (!is_object($original_ddo)) {
						// 			debug_log(__METHOD__
						// 				. " Error: original_ddo (has_dataframe) not found in ddo_map!  " . PHP_EOL
						// 				. ' $rqo->show->ddo_map: ' . to_string($rqo->show->ddo_map)
						// 				, logger::ERROR
						// 			);
						// 		}else if ( isset($original_ddo->dataframe_ddo) ) {
						// 			$dataframe_ddo = $original_ddo->dataframe_ddo;
						// 			// clone the $sqo to change without changes the original
						// 			// the sqo will be set with the dataframe tipo and lg-nolan as lang
						// 			// dataframe always are portals.
						// 			$dataframe_sqo = json_decode(json_encode($sqo));
						// 			foreach ($dataframe_sqo->filter_by_locators as $current_filter_by_locator) {
						// 					$current_filter_by_locator->tipo = $dataframe_ddo->tipo;
						// 					$current_filter_by_locator->lang = DEDALO_DATA_NOLAN;
						// 			}

						// 			// get the data of the dataframe component
						// 			// using the sqo sent by the client
						// 				$dataframe_sections = sections::get_instance(
						// 					null, // ?array $ar_locators
						// 					$dataframe_sqo, // object $search_query_object = null
						// 					$tipo, // string $caller_tipo = null (section/portal)
						// 					$mode, // string $mode = 'list'
						// 					$lang // string $lang = DEDALO_DATA_NOLAN
						// 				);
						// 			$full_data = array_merge($full_data, $dataframe_sections->get_dato());
						// 		}
						// 		// order the full data ASC by date
						// 		usort($full_data, function($a, $b) {
						// 			return strtotime($a->timestamp) - strtotime($b->timestamp);
						// 		});

						// 	// 3 mix the both data into one
						// 	// the source_data will be the data of the main component
						// 	// dataframe_data will be the data of the dataframe
						// 	// when the source_data changes will be set with the previous dataframe_data
						// 	// when the dataframe changes it will be set with previous source_data
						// 	// dataframe_data has a array with the key of his section_id_key, it will
						// 	// used to identify the value associated to the source_data and recreate it
						// 		$source_data	= null;
						// 		$dataframe_data	= [null];
						// 		if (is_object($original_ddo)) {
						// 			foreach ($full_data as $current_data) {
						// 				if($current_data->tipo === $original_ddo->tipo ){
						// 					$source_data = $current_data->dato;
						// 				}
						// 				if($current_data->tipo === $original_ddo->dataframe_ddo->tipo ){
						// 					$dataframe_data[$current_data->section_id_key] = $current_data->dato;
						// 				}
						// 				$current_data->dato				= $source_data;
						// 				$current_data->dataframe_data	= $dataframe_data;
						// 				$current_data->tipo				= $original_ddo->tipo;
						// 				$current_data->dataframe_tipo	= $original_ddo->dataframe_ddo->tipo ;
						// 			}
						// 		}

						// 		// order the full data DESC by date
						// 		usort($full_data, function($a, $b) {
						// 			return strtotime($b->timestamp) - strtotime($a->timestamp);
						// 		});

						// 		// remove paginated rows as original sqo set
						// 		$offset	= (int)$original_offset;
						// 		$limit	= (int)$original_limit;

						// 		$sqo->limit = $original_limit;
						// 		$full_data = array_slice($full_data, $offset, $limit);

						// 	// 4 get the data of the main component with the full data
						// 		$element  = sections::get_instance(
						// 			null, // ?array $ar_locators
						// 			$sqo, // object $search_query_object = null
						// 			$tipo, // string $caller_tipo = null (section/portal)
						// 			$mode, // string $mode = 'list'
						// 			$lang // string $lang = DEDALO_DATA_NOLAN
						// 		);
						// 		$element->set_dato( $full_data );
						// }else{

							// prevent edit mode set limit greater than 1
								if ($model==='section' && $mode==='edit' && (!isset($sqo->limit) || (int)$sqo->limit > 1)) {
									$sqo->limit = 1;
								}

							// sections instance
								$element = sections::get_instance(
									null, // ?array $ar_locators
									$sqo, // object $search_query_object = null
									$tipo, // string $caller_tipo = null (section/portal)
									$mode, // string $mode = 'list'
									$lang // string $lang = DEDALO_DATA_NOLAN
								);
						// }

					// session sqo. Store section SQO in session.
					// It's not used to main navigation, but it's needed by some tools like tool_export
					// in addition to section_tool navigation (like transcription, translation, etc.)
						if ($model==='section' && ($mode==='edit' || $mode==='list') && $session_save===true) {

							$safe_sqo = clone $sqo;

							$_SESSION['dedalo']['config']['sqo'][$sqo_id] = $safe_sqo;
							debug_log(__METHOD__
								. " -> saved in session sqo sqo_id: '$sqo_id'" . PHP_EOL
								. ' sqo:' . to_string($safe_sqo)
								, logger::DEBUG
							);
							// close current session and set as read only to unlock thread
							session_write_close();
						}

					// data_source. Used by time machine as 'tm' to force component to load data from different sources. data_source='tm'
						if (isset($ddo_source->data_source)) {
							$element->data_source = $ddo_source->data_source;
						}

					// properties (optional). If received, overwrite element properties
						if (!empty($properties)){
							$element->set_properties($properties);
						}

					// view
						if (isset($view)) {
							$element->set_view($view);
						}

					// unlock user components. Normally this occurs when user navigate across sections or paginate
						if (DEDALO_LOCK_COMPONENTS===true) {
							lock_components::force_unlock_all_components( logged_user_id() );
						}
					break;

				case 'related_search': // Used to get the related sections that call to the source section

					// sections
						$element = sections::get_instance(
							null,
							$sqo,
							$tipo, // string $caller_tipo = null (section/portal)
							$mode,
							$lang ?? DEDALO_DATA_LANG
						);

					// store sqo section
						if ($model==='section' && ($mode==='edit' || $mode==='list') && $session_save===true) {
							$_SESSION['dedalo']['config']['sqo'][$sqo_id] = clone $sqo;
							// close current session and set as read only to unlock thread
							session_write_close();
						}
					break;

				case 'get_data': // Used by components and areas

					if (strpos($model, 'component_')===0) {

						if ($section_id<1) {
							// invalid call
							debug_log(__METHOD__
								. " WARNING data:get_data invalid section_id: "
								. to_string($section_id)
								, logger::WARNING
							);
							$response->errors[] = 'invalid section_id';

						}else{

							// component
								$element = component_common::get_instance(
									$model,
									$tipo,
									$section_id,
									$mode,
									$lang,
									$section_tipo,
									true, // cache
									$caller_dataframe ?? null
								);

							// time machine matrix_id.
								// if ($mode==='tm') {
								if (isset($ddo_source->matrix_id)) {
									// set matrix_id value to component to allow it search dato in
									// matrix_time_machine component function 'get_dato' will be
									// overwritten to get time machine dato instead the real dato
									$element->matrix_id = $ddo_source->matrix_id;
								}

							// data_source. Used by time machine as 'tm' to force component to load data from different sources. data_source='tm'
								if (isset($ddo_source->data_source)) {
									$element->data_source = $ddo_source->data_source;
								}

							// view optional
								if (!empty($view)) {
									$element->set_view($view);
								}

							// properties optional
								if (!empty($properties)){
									$element->set_properties($properties);
								}

							// pagination. Fix pagination vars (defined in class component_common)
								if (isset($rqo->sqo->limit) || isset($rqo->sqo->offset)) {
									$pagination = new stdClass();
										if (isset($rqo->sqo->limit)) {
											$pagination->limit = $rqo->sqo->limit;
										}
										if (isset($rqo->sqo->offset)) {
											$pagination->offset	= $rqo->sqo->offset;
										}
										if( isset($rqo->sqo->total) ){
											$pagination->total = $rqo->sqo->total;
										}
									$element->pagination = $pagination;
								}

							// ar_target_section_tipo
								if( isset($ddo_source->ar_target_section_tipo) ){
									$element->ar_target_section_tipo = $ddo_source->ar_target_section_tipo;
								}

						}//end if ($section_id>=1)

					}else if (strpos($model, 'area')===0) {

						// areas
							$element = area::get_instance($model, $tipo, $mode);
							$element->properties = $element->get_properties() ?? new stdClass();

						// thesaurus_mode
							if (isset($ddo_source->properties->thesaurus_mode)) {
								$element->properties->thesaurus_mode = $ddo_source->properties->thesaurus_mode;
							}

						// search_action
							$search_action = $ddo_source->search_action ?? 'show_all';

								$element->properties->action = $search_action;
								$element->properties->sqo	 = $sqo;
								if (isset($ddo_source->properties->hierarchy_types)) {
									$element->properties->hierarchy_types = $ddo_source->properties->hierarchy_types;
								}
								if (isset($ddo_source->properties->hierarchy_sections)) {
									$element->properties->hierarchy_sections = $ddo_source->properties->hierarchy_sections;
								}
								if (isset($ddo_source->properties->hierarchy_terms)) {
									$element->properties->hierarchy_terms = $ddo_source->properties->hierarchy_terms;
								}

					}else if ($model==='section') {

						// $element = section::get_instance($section_id, $section_tipo);
						// (!) Not used anymore
						debug_log(__METHOD__." WARNING data:get_data model section skip. Use action 'search' instead.", logger::WARNING);
						$response->errors[] = 'invalid action for section';

					}else if (class_exists($model)) {

						// case menu and similar generic elements

						$element = new $model();

					}else{

						// others
							// get data model not defined
							debug_log(__METHOD__." WARNING data:get_data model not defined for tipo: $tipo - model: $model", logger::WARNING);
							$response->errors[] = 'unimplemented model [get_data]';
					}
					break;

				case 'resolve_data': // Used by components in search mode like portals to resolve locators data

					if (strpos($model, 'component')===0) {

						// component
							$component_lang	= (RecordObj_dd::get_translatable($tipo)===true)
								? $lang
								: DEDALO_DATA_NOLAN;
							$element = component_common::get_instance(
								$model,
								$tipo,
								$section_id,
								$mode,
								$component_lang,
								$section_tipo
							);

							if(!empty($element)){

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
							}

					}else{

						// others
							// resolve_data model not defined
							debug_log(__METHOD__." WARNING data:resolve_data model not defined for tipo: $tipo - model: $model", logger::WARNING);
							$response->errors[] = 'unimplemented model [resolve_data]';
					}
					break;

				case 'get_relation_list': // Used by relation list only (legacy compatibility)

					$element = new relation_list(
						$tipo,
						$section_id,
						$section_tipo,
						$mode
					);
					$element->set_sqo($sqo);
					break;

				default:
					// not defined model from context / data
					debug_log(__METHOD__." 1. Ignored action '$action' - tipo: $tipo ", logger::WARNING);
					$response->errors[] = 'unimplemented model [default]';
					break;
			}//end switch($action)

			// add if exists
				if (isset($element)) {

					// build_options
						$build_options = $ddo_source->build_options ?? null;
						$element->set_build_options($build_options);

					// element JSON
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
					debug_log(__METHOD__." Ignored action '$action' - tipo: $tipo (No element was generated) ", logger::WARNING);
					$response->errors[] = 'invalid element';
					$context = $data = [];
				}

		// result. Set result object
			$result->context	= $context;
			$result->data		= $data;

		// permissions check. Prevent mistaken data resolutions
			$permissions = common::get_permissions($section_tipo, $tipo);
			if (!empty($result->data) && $permissions<1 && $element->get_model()!=='menu') {

				// $result->data = [];

				debug_log(__METHOD__
					.' Identified non enough permissions call' . PHP_EOL
					.' User: '. logged_user_id() . PHP_EOL
					.' tipo: '. $tipo . PHP_EOL
					.' section_tipo: '. $section_tipo . PHP_EOL
					.' Permissions: ' .$permissions . PHP_EOL
					.' rqo: '.to_string($rqo)
					, logger::ERROR
				);
			}

		// debug
			if(SHOW_DEBUG===true) {
				// dump($context, ' context ++ '.to_string());
				// dump($data, ' data ++ '.to_string());
				// if (isset($_SESSION['dedalo']['config']['sqo'][$sqo_id])) {
				// 	dump($_SESSION['dedalo']['config']['sqo'][$sqo_id], ' $_SESSION[dedalo][config][sqo][$sqo_id] ++ '.to_string($sqo_id));
				// }
				$debug = new stdClass();
					$debug->sqo				= $sqo ?? null;
					// $debug->rqo			= $rqo;
					$debug->exec_time		= exec_time_unit($start_time,'ms').' ms';
					$debug->memory_usage	= dd_memory_usage();
				$result->debug = $debug;
			}

		// response
			$response->result	= $result;
			$response->msg		= empty($response->errors)
				? 'OK. Request done successfully'
				: 'Warning! Request done with errors';


		return $response;
	}//end build_json_rows



	/**
	* SMART_REMOVE_DATA_DUPLICATES
	* @param array $data
	* @return array $clean_data
	*/
	private static function smart_remove_data_duplicates(array $data) : array {

		$clean_data = [];
		foreach ($data as $value_obj) {
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
	* SMART_REMOVE_CONTEXT_DUPLICATES
	* @param array $data
	* @return array $clean_data
	*/
	private static function smart_remove_context_duplicates(array $context) : array {

		$clean_context = [];
		foreach ($context as $value_obj) {
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



	/**
	* GET_COMPONENT_VALUE
	* Used to get the component value as text representation of the component data
	* @param object $json_data
	* @return object $response
	*/
	private static function get_component_value(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		session_write_close();

		// rqo vars
			$source			= $rqo->source;
			$tipo			= $source->tipo ?? null;
			$section_tipo	= $source->section_tipo ?? $source->tipo ?? null;
			$model			= $source->model ?? RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$lang			= $source->lang ?? DEDALO_DATA_LANG;
			$mode			= $source->mode ?? 'list';
			$section_id		= $source->section_id ?? null; // only used by tools (it needed to load the section_tool record to get the context )

		// build element
			switch (true) {

				case strpos($model, 'component_')===0:

					$component_lang	= (RecordObj_dd::get_translatable($tipo)===true)
						? $lang
						: DEDALO_DATA_NOLAN;

					$element = component_common::get_instance(
						$model,
						$tipo,
						$section_id, // string section_id
						$mode,
						$component_lang,
						$section_tipo
					);
					break;

				default:
					// throw new Exception("Error Processing Request", 1);
					debug_log(__METHOD__
						." invalid element. exception msg: only components are accepted here "
						, logger::ERROR
					);
					$response->msg = 'Error. model not valid: '.$model;
					$response->errors[] = 'invalid model';
					return $response;
			}

		// element JSON
			$value = $element->get_value();

		// response
			$response->result	= $value;
			$response->msg		= empty($response->errors)
				? 'OK. Request done successfully'
				: 'Warning! Request done with errors';


		return $response;
	}//end get_component_value




	// end private methods ///////////////////////////////////



	/**
	* GET_INDEXATION_GRID
	* @see class.request_query_object.php
	* @param object $rqo
	* {
	*	action	: 'get_indexation_grid',
	*	source	: {
	*		section_tipo	: section_tipo,
	*		section_id		: section_id,
	*		tipo			: "test25", component_tipo
	*		value			: value // ["oh1",] array of section_tipo \ used to filter the locator with specific section_tipo (like 'oh1')
	*	}
	* }
	* @return object $response
	*/
	public static function get_indexation_grid(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// rqo vars
			// ddo_source
			$ddo_source		= $rqo->source;
			// source vars
			$section_tipo	= $ddo_source->section_tipo ?? $ddo_source->tipo;
			$section_id		= $ddo_source->section_id ?? null;
			$tipo			= $ddo_source->tipo ?? null;
			$value			= $ddo_source->value ?? null; // ["oh1",] array of section_tipo \ used to filter the locator with specific section_tipo (like 'oh1')
			// pagination
			$sqo			= $rqo->sqo ?? new stdClass();

		// validate input data
			if (empty($rqo->source->section_tipo) || empty($rqo->source->tipo) || empty($rqo->source->section_id)) {
				$response->msg .= ' Trigger Error: ('.__FUNCTION__.') Empty source properties (section_tipo, section_id, tipo are mandatory)';
				$response->errors[] = 'invalid rqo source';

				debug_log(__METHOD__
					. " $response->msg " .PHP_EOL
					. ' source: '. to_string($rqo->source)
					, logger::ERROR
				);

				return $response;
			}

		// diffusion_index_ts
			$indexation_grid	= new indexation_grid($section_tipo, $section_id, $tipo, $value);
			$index_grid			= $indexation_grid->build_indexation_grid($sqo);

		// response OK
			$response->result	= $index_grid;
			$response->msg		= empty($response->errors)
				? 'OK. Request done successfully'
				: 'Warning! Request done with errors';


		return $response;
	}//end get_indexation_grid



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
	* @return object $response
	* {
	* 	result : mixed,
	* 	msg : string,
	* 	error : int|null
	* }
	*/
		// public static function service_request(object $rqo) : object {

		// 	$response = new stdClass();
		// 		$response->result	= false;
		// 		$response->msg		= 'Error. Request failed ['.__METHOD__.']. ';
		// 		$response->errors	= [];

		// 	// short vars
		// 		$source			= $rqo->source;
		// 		$service_name	= $source->model;
		// 		$service_method	= $source->action;
		// 		$arguments		= $source->arguments ?? new stdClass();

		// 	// load services class file
		// 		$class_file = DEDALO_CORE_PATH . '/services/' .$service_name. '/class.' . $service_name .'.php';
		// 		if (!file_exists($class_file)) {
		// 			$response->msg = 'Error. services class_file do not exists. Create a new one in format class.my_service_name.php ';
		// 			if(SHOW_DEBUG===true) {
		// 				$response->msg .= '. file: '.$class_file;
		// 			}
		// 			return $response;
		// 		}
		// 		require $class_file;

		// 	// method (static)
		// 		if (!method_exists($service_name, $service_method)) {
		// 			$response->msg = 'Error. services method \''.$service_method.'\' do not exists ';
		// 			return $response;
		// 		}
		// 		try {

		// 			$fn_result = call_user_func(array($service_name, $service_method), $arguments);

		// 		} catch (Exception $e) { // For PHP 5

		// 			trigger_error($e->getMessage());

		// 			$fn_result = new stdClass();
		// 				$fn_result->result	= false;
		// 				$fn_result->msg		= 'Error. Request failed on call_user_func service_method: '.$service_method;

		// 		}

		// 		$response = $fn_result;


		// 	return $response;
		// }//end service_request



	/**
	* GET_ENVIRONMENT -> WORK IN PROGRESS
	* Calculate the minimum Dédalo environment to work
	* Note that the value is different from logged and not logged cases
	* @return object $response
	*/
	public static function get_environment() : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// page_globals
			$page_globals = dd_core_api::get_page_globals(); // return object

		// plain vars. Plain global vars
			$plain_vars = dd_core_api::get_js_plain_vars(); // return array assoc

		// lang labels
			$lang_labels_string = dd_core_api::get_lang_labels(DEDALO_APPLICATION_LANG); // return string
			$lang_labels_json = !empty($lang_labels_string)
				? json_decode($lang_labels_string)
				: new stdClass();

		// environment
			$environment = new stdClass();
				$environment->page_globals	= $page_globals; // object
				$environment->plain_vars	= $plain_vars; // array assoc
				$environment->get_label		= $lang_labels_json; // string (JSON stringified)

		// response
			$response->result	= $environment;
			$response->msg		= empty($response->errors)
				? 'OK. Request done successfully'
				: 'Warning! Request done with errors';

		// metrics
			$metrics = [
				// permissions stats
				'Environment',
				'--> calculated environment time: '.exec_time_unit($start_time).' ms'
			];
			debug_log(__METHOD__ . PHP_EOL
				. implode(PHP_EOL, $metrics)
				, logger::WARNING
			);


		return $response;
	}//end get_environment



	/**
	* GET_PAGE_GLOBALS
	* Builds whole environment page_globals object
	* It is used as window.page_globals in environment.j.php file
	* @return object $obj
	*/
	public static function get_page_globals() : object {

		$obj = new stdClass();
			$obj->dedalo_last_error					= $_ENV['DEDALO_LAST_ERROR'] ?? null;
			// logged informative only
			$obj->is_logged							= login::is_logged();
			$obj->is_global_admin					= logged_user_is_global_admin();
			$obj->is_developer						= logged_user_is_developer();
			$obj->is_root							= logged_user_id()==DEDALO_SUPERUSER;
			$obj->user_id							= logged_user_id();
			$obj->username							= logged_user_username();
			$obj->full_username						= logged_user_full_username();
			// entity
			$obj->dedalo_entity						= DEDALO_ENTITY;
			$obj->dedalo_entity_id					= DEDALO_ENTITY_ID;
			// version
			$obj->dedalo_version					= DEDALO_VERSION;
			$obj->dedalo_build						= DEDALO_BUILD;
			// mode
			$obj->mode								= $_GET['m'] ?? $_GET['mode'] ?? (!empty($_GET['id']) ? 'edit' : 'list');
			// lang
			$obj->dedalo_application_langs_default	= DEDALO_APPLICATION_LANGS_DEFAULT;
			$obj->dedalo_application_lang			= DEDALO_APPLICATION_LANG;
			$obj->dedalo_data_lang					= DEDALO_DATA_LANG;
			$obj->dedalo_data_lang_selector			= defined('DEDALO_DATA_LANG_SELECTOR') ? DEDALO_DATA_LANG_SELECTOR : true;
			$obj->dedalo_data_lang_sync				= defined('DEDALO_DATA_LANG_SYNC') ? DEDALO_DATA_LANG_SYNC : false;
			$obj->dedalo_data_nolan					= DEDALO_DATA_NOLAN;
			$obj->dedalo_application_langs			= array_map(function($label, $value) {
				return [
					'label'	=> $label,
					'value'	=> $value
				];
			}, DEDALO_APPLICATION_LANGS, array_keys(DEDALO_APPLICATION_LANGS));
			$obj->dedalo_projects_default_langs		= array_map(function($current_lang) {
				return [
					'label'	=> lang::get_name_from_code($current_lang),
					'value'	=> $current_lang,
					'tld2'	=> lang::get_alpha2_from_code($current_lang)
				];
			}, DEDALO_PROJECTS_DEFAULT_LANGS);
			// quality defaults
			$obj->dedalo_image_quality_default	= DEDALO_IMAGE_QUALITY_DEFAULT;
			$obj->dedalo_av_quality_default		= DEDALO_AV_QUALITY_DEFAULT;
			$obj->dedalo_quality_thumb			= defined('DEDALO_QUALITY_THUMB') ? DEDALO_QUALITY_THUMB : 'thumb';
			// tag_id
			$obj->tag_id						= isset($_REQUEST['tag_id']) ? safe_xss($_REQUEST['tag_id']) : null;
			// dedalo_protect_media_files
			$obj->dedalo_protect_media_files	= (defined('DEDALO_PROTECT_MEDIA_FILES') && DEDALO_PROTECT_MEDIA_FILES===true) ? 1 : 0;
			// notifications
			$obj->DEDALO_NOTIFICATIONS			= defined('DEDALO_NOTIFICATIONS') ? (int)DEDALO_NOTIFICATIONS : 0;
			// ip_api
			$obj->ip_api						= defined('IP_API') ? IP_API : null;
			$obj->fallback_image				= DEDALO_CORE_URL . '/themes/default/default.svg';
			$obj->locale						= DEDALO_LOCALE;
			$obj->dedalo_date_order				= DEDALO_DATE_ORDER;
			$obj->component_active				= null;
			$obj->stream_readers				= [];
			// maintenance mode
			$obj->maintenance_mode				= defined('DEDALO_MAINTENANCE_MODE_CUSTOM')
				? DEDALO_MAINTENANCE_MODE_CUSTOM
				: (defined('DEDALO_MAINTENANCE_MODE') ? DEDALO_MAINTENANCE_MODE : false);
			$obj->dedalo_notification			= defined('DEDALO_NOTIFICATION_CUSTOM') && !empty(DEDALO_NOTIFICATION_CUSTOM)
				? DEDALO_NOTIFICATION_CUSTOM
				: (defined('DEDALO_NOTIFICATION') ? DEDALO_NOTIFICATION : false);
			// recovery mode
			$obj->recovery_mode					= $_ENV['DEDALO_RECOVERY_MODE'] ?? false;

			// debug only
			if(SHOW_DEBUG===true || SHOW_DEVELOPER===true) {
				$obj->dedalo_db_name = DEDALO_DATABASE_CONN;
				if ($obj->is_logged===true && defined('DEDALO_INSTALL_STATUS') && DEDALO_INSTALL_STATUS==='installed') {
					$obj->pg_version = (function() {
						try {
							$conn = DBi::_getConnection() ?? false;
							if ($conn) {
								return pg_version(DBi::_getConnection())['server'];
							}
							return 'Failed!';
						}catch(Exception $e){
							return 'Failed with Exception!';
						}
					})();
				}
				$obj->php_version	= PHP_VERSION;
				// $obj->php_version .= ' jit:'. (int)(opcache_get_status()['jit']['enabled'] ?? false);
				$obj->php_memory	= ini_get('memory_limit') ?? 'Unknown';
				if ( strpos(DEDALO_HOST, 'localhost')===0 ) {
					$obj->dedalo_root_path = DEDALO_ROOT_PATH;
				}
			}


		return $obj;
	}//end get_page_globals



	/**
	* GET_JS_PLAIN_VARS
	* Builds whole environment JS plain vars
	* They are used as constants declared in environment.j.php file
	* @return array $plain_vars
	*/
	public static function get_js_plain_vars() : array {

		$plain_vars = [
			'DEDALO_ENVIRONMENT'				=> true,
			'DEDALO_API_URL'					=> defined('DEDALO_API_URL') ? DEDALO_API_URL : (DEDALO_CORE_URL . '/api/v1/json/'),
			'DEDALO_CORE_URL'					=> DEDALO_CORE_URL,
			'DEDALO_ROOT_WEB'					=> DEDALO_ROOT_WEB,
			'DEDALO_MEDIA_URL'					=> DEDALO_MEDIA_URL,
			'DEDALO_TOOLS_URL'					=> DEDALO_TOOLS_URL,
			'SHOW_DEBUG'						=> SHOW_DEBUG,
			'SHOW_DEVELOPER'					=> SHOW_DEVELOPER,
			'DEVELOPMENT_SERVER'				=> DEVELOPMENT_SERVER,
			'DEDALO_SECTION_ID_TEMP'			=> DEDALO_SECTION_ID_TEMP,
			'DEDALO_UPLOAD_SERVICE_CHUNK_FILES'	=> DEDALO_UPLOAD_SERVICE_CHUNK_FILES,
			'DEDALO_LOCK_COMPONENTS'			=> DEDALO_LOCK_COMPONENTS,
			'DEDALO_MAINTENANCE_MODE'			=> (defined('DEDALO_MAINTENANCE_MODE') ? DEDALO_MAINTENANCE_MODE : null), // DEPRECATED . legacy support only (remove early)
			'DEDALO_NOTIFICATION'				=> null, // DEPRECATED . legacy support only (remove early)
			// DD_TIPOS . Some useful dd tipos (used in client by tool_user_admin for example)
			'DD_TIPOS' => [
				'DEDALO_RELATION_TYPE_INDEX_TIPO'		=> DEDALO_RELATION_TYPE_INDEX_TIPO,
				'DEDALO_SECTION_INFO_INVERSE_RELATIONS'	=> DEDALO_SECTION_INFO_INVERSE_RELATIONS,
				'DEDALO_RELATION_TYPE_LINK'				=> DEDALO_RELATION_TYPE_LINK,
				'DEDALO_SECTION_RESOURCES_IMAGE_TIPO'	=> DEDALO_SECTION_RESOURCES_IMAGE_TIPO,
				'DEDALO_COMPONENT_RESOURCES_IMAGE_TIPO'	=> DEDALO_COMPONENT_RESOURCES_IMAGE_TIPO
			]
		];


		return $plain_vars;
	}//end get_js_plain_vars



	/**
	* GET_LANG_LABELS
	* Load requested lang file content
	* (JSON object generated on update Ontology)
	* @param string $lang
	* 	Normally DEDALO_APPLICATION_LANG like 'lg-eng'
	* @return string $lang_labels
	* {
	* 	"diameter": "Diameter",
	*	"code": "Code",
	* 	...
	* }
	*/
	public static function get_lang_labels(string $lang) : string {

		$lang_path		= '/common/js/lang/' . $lang . '.js';
		$lang_labels	= file_get_contents(DEDALO_CORE_PATH . $lang_path);

		// file not found case
		if ($lang_labels===false) {
			debug_log(__METHOD__
				.' File not found: ' . DEDALO_CORE_PATH . $lang_path
				, logger::ERROR
			);
			$lang_labels = '{"invalid_lang_file" : "Error on get current lang file: '.$lang_path.'"};' . PHP_EOL;
		}


		return $lang_labels;
	}//end get_lang_labels



	/**
	* GET_ONTOLOGY_INFO
	* Transform tipo like 'dd1' to an ontology section_tipo, section_id object
	* @param object $rqo
	* @return object $response
	*/
	public static function get_ontology_info( object $rqo ) : object|false {

		// tipo
		$tipo = $rqo->tipo;

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// tipo check
			if ( safe_tipo($tipo)===false ) {
				$response->msg		= 'Error. Invalid tipo: '.to_string($tipo);
				$response->errors[] = 'Bad tipo';
				return $response;
			}

		$section_id				= get_section_id_from_tipo($tipo);
		$tld					= get_tld_from_tipo($tipo);
		$target_section_tipo	= ontology::map_tld_to_target_section_tipo($tld);

		$response->result = (object)[
			'section_tipo'	=> $target_section_tipo,
			'section_id'	=> $section_id
		];
		$response->msg = empty($response->errors)
			? 'OK. Request done successfully'
			: 'Warning! Request done with errors';


		return $response;
	}//end get_ontology_info



	/**
	* LOG_ACTIVITY
	* Writes log_message in Dédalo logger
	* It is used to registrate the navigation of the users by sections and areas.
	* @see dd_core_api::read
	* @param object $options
	* {
	* 	rqo: object (full rqo object from read request)
	* 	section_id: int|null (available in edit mode only)
	* }
	* @return void
	*/
	private static function log_activity(object $options) : void {

		// options
			$rqo		= $options->rqo;
			$section_id	= $options->section_id ?? null;

		// short vars
			$tipo	= $rqo->source->tipo ?? '';
			$mode	= $rqo->source->mode ?? '';

		// Prevent search mode write activity
			if ($mode==='search') {
				return;
			}

		// Prevent infinite loop saving self
			if (in_array($tipo, logger_backend_activity::$ar_elements_activity_tipo, true)) {
				return;
			}

		// exclude other tipos
			$ar_exclude_tipo = [
				DEDALO_TEMP_PRESET_SECTION_TIPO, // dd655
				DEDALO_SEARCH_PRESET_SECTION_TIPO, // dd623
			];
			if (in_array($tipo, $ar_exclude_tipo, true)) {
				return;
			}

		// exclude modes
			if ($mode==='tm') {
				return;
			}

		// exclude components
		// only sections and areas generate activity (prevent autocomplete activity footprint)
			$model = RecordObj_dd::get_modelo_name_by_tipo($tipo, true);
			if (strpos($model, 'section')===false && strpos($model, 'area')===false) {
				return;
			}

		// mode. set mode_to_activity
		// In cases like 'tool_transcription' the mode passed is neither 'edit' nor 'list' so we will
		// force 'edit' in the logger as there are only 2 page load options defined: 'LOAD EDIT' and 'LOAD LIST'
			$mode_to_activity = in_array($mode, ['edit','list'])
				? $mode
				: 'edit';

		// dato_activity. Create dato_activity array
			$dato_activity = [
				'msg' => 'HTML Page is loaded in mode: '.$mode_to_activity .' ['.$mode.']'
			];

		// create custom log based on caller and context
			switch (true) {

				// area
				case (strpos($model, 'area')!==false):
					$dato_activity['tipo'] = $tipo;
					break;

				// section
				case ($model==='section'):

					switch ($mode) {
						case 'edit' :
							$dato_activity['id']	= $section_id;
							$dato_activity['tipo']	= $tipo;
							break;
						case 'list' :
						default:
							$dato_activity['tipo'] = $tipo;
							break;
					}
					break;

				default:

					break;
			}

		// logger activity. Write message
			logger::$obj['activity']->log_message(
				'LOAD ' . strtoupper($mode_to_activity), // string message
				logger::INFO, // int log_level
				$tipo, // string|null tipo_where
				null, // string|null operations
				$dato_activity, // array|null datos
				logged_user_id() // int
			);
	}//end log_activity



}//end dd_core_api
