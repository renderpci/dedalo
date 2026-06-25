<?php declare(strict_types=1);
/**
* CLASS DD_CORE_API
* Central REST API controller for the Dédalo v7 core backend.
*
* This is the single entry point that the JSON API dispatcher
* (core/api/v1/json/index.php) calls for every client request. It owns:
*
* - The remote-callable method allowlist (API_ACTIONS), which is the sole
*   SEC-024 security gate: no public-static method is callable over the
*   network unless it is listed there.
* - The main lifecycle actions: start (page bootstrap), read, read_raw,
*   create, duplicate, delete, save, count.
* - Utility API actions: get_element_context, get_section_elements_context,
*   get_indexation_grid, get_environment, get_matrix_ontology_locator,
*   get_section_terms, test.
* - Internal helpers (get_page_globals, get_js_plain_vars, get_lang_labels,
*   build_json_rows, get_component_value, smart_remove_data_duplicates,
*   smart_remove_context_duplicates, log_activity) that are invoked from
*   PHP code only and intentionally absent from API_ACTIONS.
*
* All public action methods follow the same contract:
*   - Accept a single `object $rqo` (Request Query Object) parameter.
*   - Return a `stdClass $response` with at minimum:
*       $response->result  mixed   — false on hard failure, data on success
*       $response->msg     string  — human-readable status message
*       $response->errors  array   — empty array on clean success
*
* Permission checks are done early (before any DB or ontology work) to avoid
* timing oracles and schema leaks.
*
* @package Dédalo
* @subpackage Core
*/
final class dd_core_api {



	/**
	* SEC-024: explicit allowlist of methods callable as remote API actions.
	* Adding a new public-static method does NOT make it remotely callable; it
	* must also be added here. Internal helpers (get_page_globals,
	* get_js_plain_vars, get_lang_labels) are intentionally absent because they
	* take non-rqo arguments and are invoked from PHP code only.
	*
	* Note: get_activity_metric is intentionally excluded — it is called
	* internally by area_common and is not part of the public API surface.
	* @var array<string> API_ACTIONS
	*/
	public const API_ACTIONS = [
		'start',
		'read',
		'read_raw',
		'create',
		'duplicate',
		'delete',
		'save',
		'count',
		'get_element_context',
		'get_section_elements_context',
		'get_indexation_grid',
		'get_environment',
		'get_matrix_ontology_locator',
		'get_section_terms',
		'test'
	];



	/**
	* API version string in "Major.Minor.Patch" format.
	* Returned to clients via get_environment() → $response->result->page_globals.
	* Increment Minor on new API_ACTIONS entries; increment Major on breaking changes.
	* @var string $version
	*/
	public static string $version = "1.0.0";  // 05-06-2019

	/**
	* The RQO (Request Query Object) for the request currently being processed.
	* Set at the start of build_json_rows() and start() so that downstream
	* helpers — particularly common::build_request_config() — can recover
	* client-supplied SQO and source properties (navigation state, session key)
	* without requiring an explicit parameter chain.
	* (!) Stale across persistent-worker requests; must be overwritten at the
	*     top of every action method that sets it (not just carried forward).
	* @var ?object $rqo
	*/
	public static ?object $rqo = null;

	/**
	* Holds the last fully-resolved response context object.
	* Retained as a static for diagnostic / debug introspection; not used in
	* the normal request flow.
	* @var ?object $context
	*/
	public static ?object $context = null;

	/**
	* Accumulates SQL query strings executed during the current request.
	* Populated only when SHOW_DEBUG === true; appended by search layer helpers
	* and emitted under $response->debug->sql_query_search in read().
	* @var array<string> $sql_query_search
	*/
	public static array $sql_query_search = [];



	/**
	* START
	* Bootstraps the minimum page context needed by the browser on first load.
	*
	* Resolves the target element (section, area, tool, or component) from URL
	* query variables carried in $rqo->options->search_obj, builds its
	* structure context, and returns it together with the environment block.
	* The login page context is returned when the user is not authenticated.
	* The install context is returned when DEDALO_INSTALL_STATUS is not 'installed'.
	*
	* Special cases handled in order:
	* 1. Recovery mode — ?recovery=<DEDALO_RECOVERY_KEY> activates recovery and
	*    maintenance mode; any other value is rejected immediately.
	* 2. Install check — when DEDALO_TEST_INSTALL is true (default), the install
	*    wizard context is returned and normal boot is skipped.
	* 3. Not-logged — returns the login context (or installer context on DB error).
	* 4. Logged — resolves the element by model (section_tool → section, area_*,
	*    tool_*, component_*, default area), injects session SQO and section_id
	*    filter into the context's request_config when present.
	*
	* $rqo->sqo and $rqo->source (optional) preserve navigation state (filter,
	* pagination) from the browser's local DB and are forwarded untouched to
	* common::build_request_config().
	*
	* @param object $rqo
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
	*	"sqo": {		// optional — preserves user navigation state
	*		"section_tipo": [
	*			"dd1324"
	*		],
	*		"limit": 10,
	*		"offset": 0
	*	},
	* 	"source": {		// optional — preserves user navigation state
	*		"tipo": "dd1324",
	*		"section_tipo": "dd1324",
	*		"mode": "list"
	*	}
	* }
	* @return object $response
	*   $response->result = { context: array, data: [] }
	*   $response->environment is always populated even on failure paths
	*/
	public static function start(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// test dd_ontology without term data catch 22 situation
			// if(defined('DEDALO_INSTALL_STATUS') && DEDALO_INSTALL_STATUS==='installed') {
			// 	try {
			// 		$ontology_node = ontology_node::get_instance('dd1');
			// 		$term = $ontology_node->get_term_data();
			// 		if (empty($term)) {
			// 			$result = area_maintenance::recover_dd_ontology_column();
			// 			if ($result===false) {
			// 				debug_log(__METHOD__
			// 					. " Error recovering term column from dd_ontology table" . PHP_EOL
			// 					, logger::ERROR
			// 				);
			// 			}
			// 		}
			// 	} catch (Exception $e) {
			// 		debug_log(__METHOD__
			// 			. " Error (exception) on check term dd_ontology_column" . PHP_EOL
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
						$installer = new installer();

					// get the install context, client only need context of the install to init the install instance
						$context[] = $installer->get_structure_context();

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
			$tool_name		= null;
			$tipo			= $default_section_tipo;
			$section_tipo	= $default_section_tipo;
			$section_id		= null;
			$mode			= 'list';
			$lang			= DEDALO_DATA_LANG;
			$view			= null;
			$session_key	= null;
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
						$response->result 	= false;
						$response->errors 	= $is_system_ready->errors ?? ['system not ready'];
						$response->msg 		= 'System is not ready. check_basic_system returns errors: ' . PHP_EOL . ($is_system_ready->msg ?? '');

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
								$installer = new installer();
								$context[] = $installer->get_structure_context();
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
					$model		= $tool_name ?? ontology_node::get_model_by_tipo($tipo, true) ?? '';
					$last_error	= $_ENV['DEDALO_LAST_ERROR'] ?? '';
					switch (true) {
						// Section_tool is depended of section, the order of the cases are important, section_tool need to be first, before section,
						// because section_tool depends of the section process and this case only add the config from properties.
						case ($model==='section_tool'):

							$section_tool_tipo = $tipo;

							$ontology_node	= ontology_node::get_instance($section_tool_tipo);
							$properties		= $ontology_node->get_properties();

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
											." No tool found for tool_name '$tool_name' in section_tool_tipo: ".to_string($section_tool_tipo) . PHP_EOL
											." Maybe this user profile does not have access to this tool." . PHP_EOL
											.' tool_name: ' . to_string($tool_name) . PHP_EOL
											.' tool_info: ' . json_encode($tool_info, JSON_PRETTY_PRINT) . PHP_EOL
											.' user_tools: ' . json_encode($user_tools, JSON_PRETTY_PRINT)
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
							// (!) request_config is needed when a session SQO must be restored or a
							// section_id filter must be injected below; the context cache used to make
							// this work only when warm — now it must be requested explicitly.
								$add_request_config = (isset($session_key) && isset($_SESSION['dedalo']['config']['sqo'][$session_key]))
									|| !empty($section_id);
								$current_context = $section->get_structure_context_simple(
									1, // permissions
									$add_request_config // add_request_config
								);

							// section_tool config
							// the config is used by section_tool to set the tool to open, if is set, inject the config into the context.
								if (isset($config)) {
									$current_context->set_config($config);
								}

							// session_key. Restore previous SQO from session when it exists
								if (isset($session_key) && isset($_SESSION['dedalo']['config']['sqo'][$session_key])) {

									// request_config
										$request_config = array_find($current_context->get_request_config() ?? [], function($el){
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

									$current_context->set_mode('edit'); // force edit mode
									$current_context->section_id	= $section_id; // set section_id in context

									// request_config
										$request_config = array_find($current_context->get_request_config() ?? [], function($el){
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

						case ($model==='area_thesaurus' || $model==='area_ontology'):

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
									$current_context->get_properties()->thesaurus_mode = $search_obj->thesaurus_mode;
								}
								if (isset($search_obj->hierarchy_types)) {
									$current_context->get_properties()->hierarchy_types = json_decode($search_obj->hierarchy_types);
								}
								if (isset($search_obj->hierarchy_sections)) {
									$current_context->get_properties()->hierarchy_sections = json_decode($search_obj->hierarchy_sections);
								}
								if (isset($search_obj->hierarchy_terms)) {
									$current_context->get_properties()->hierarchy_terms = json_decode($search_obj->hierarchy_terms);
								}

							// add to page context
								$context[] = $current_context;
							break;

						case str_starts_with($model, 'tool_'):

							// resolve tool from name and user
								$user_id			= logged_user_id();
								$registered_tools	= tool_common::get_user_tools($user_id);
								$tool_found = array_find($registered_tools, function($el) use($model){
									return $el->name===$model;
								});
								if (!is_object($tool_found)) {
									debug_log(__METHOD__
										." Tool model '$model' not found in tool_common::get_user_tools. ". PHP_EOL
										." Maybe this user ($user_id) profile does not have access to this tool."
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

						case str_starts_with($model, 'area'):

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

						case str_starts_with($model, 'component_'):

							$component_lang	= (ontology_node::get_translatable($tipo)===true)
								? $lang
								: DEDALO_DATA_NOLAN;

							// component
								$element = component_common::get_instance(
									$model,
									$tipo,
									null, // do not use section_id here because force unneeded load data
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
									$current_context->set_view($view);
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
				// (!) disabled for now because it is not needed (read action unlock components too)
					// if (DEDALO_LOCK_COMPONENTS===true) {
					// 	lock_components::force_unlock_all_components( logged_user_id() );
					// }
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
	* Fetches context and data for a given source element.
	*
	* The special-case sub-action 'get_value' calls get_component_value() to return
	* a plain text representation of a component's stored data. All other source
	* actions are forwarded to build_json_rows(), which handles:
	*   search         — section list/edit fetch; also used by autocomplete services
	*   related_search — sections that point TO the source section (inverse relations)
	*   get_data       — component or area data-only fetch (no record search)
	*   resolve_data   — resolves an array of locators into rendered component data
	*
	* Always calls log_activity() after the sub-action returns so that section/area
	* page loads are recorded in the activity logger regardless of sub-action type.
	*
	* @see self::build_json_rows()
	* @see self::get_component_value()
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
	*   $response->result = { context: array, data: array }
	*   $response->debug  is populated when SHOW_DEBUG === true
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

		// Init the DB connection (consumes 4 - 8 ms)
			$conn = DBi::_getConnection();

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
				'section_id'	=> $response->result->data[0]->entries[0]->section_id ?? null
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
	* Returns unrendered, raw JSONB data from the matrix table for the
	* requested section_tipo, filtered by the given SQO.
	*
	* Three type modes governed by $rqo->options->type:
	*   'section'        — returns the full fetched rows as-is (fetch_all()).
	*   'component'      — resolves the data column for the component model and
	*                      returns only the component's own JSONB datum per row.
	*   'target_section' — walks relation JSONB on each row and returns only
	*                      locators whose section_tipo matches $options->tipo.
	*
	* Used by tool_export and other internal PHP callers that need the unprocessed
	* storage values before any rendering or language fallback is applied.
	* For literal components this includes all language keys; for relation
	* components it includes all stored locators.
	*
	* Two permission checks are applied:
	* 1. Per-sqo->section_tipo loop (same gate as count()).
	* 2. common::get_permissions() on the single options->section_tipo.
	*
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
	*    },
	* 	"sqo" : {
	* 		"section_tipo" : ["rsc167"],
	* 		"limit" 	   : 1,
	* 		"filter_by_locators": [
	*			{
	*				"section_tipo": "rsc167",
	*				"section_id": "1"
	*			}
	*		]
	* 	}
	* }
	* @return object $response
	*   $response->result  array  — raw data rows (shape depends on options->type)
	*   $response->table   string — matrix table name resolved from section_tipo
	*/
	public static function read_raw(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.'] ';
			$response->errors	= [];

		// validate input data
			if (empty($rqo->options->section_tipo)) {
				$response->msg = 'API Error: ('.__FUNCTION__.') Empty options \'section_tipo\' (is mandatory)';
				$response->errors[] = 'empty options section_tipo';
				return $response;
			}

		// check permissions using sqo->section_tipo
			$ar_section_tipo = $rqo->sqo->section_tipo ?? [$rqo->options->section_tipo];
			foreach ($ar_section_tipo as $curr_section_tipo) {
				$section = section::get_instance($curr_section_tipo);
				if (!$section) {
					$response->msg = 'API Error: Invalid section or insufficient permissions to evaluate';
					$response->errors[] = 'invalid_section';
					return $response;
				}
				$permissions = $section->get_section_permissions($curr_section_tipo, $curr_section_tipo);
				if ($permissions < 1) { // 1 = read, 2 = write, 3 = admin
					$response->msg = "API Error: Insufficient permissions to read section {$curr_section_tipo}";
					$response->errors[] = 'permissions_denied';
					return $response;
				}
			}

		// options
			$sqo			= $rqo->sqo ?? null;
			$options		= $rqo->options ?? null;
			$section_tipo	= $rqo->options->section_tipo ?? null;
			$tipo			= $options->tipo ?? null;
			// API-05: tipo is required to resolve the model below; fail cleanly instead
			// of dereferencing a missing property (PHP warning) then hitting a TypeError.
			if (empty($tipo)) {
				$response->msg .= 'Empty options \'tipo\' (is mandatory)';
				$response->errors[] = 'empty options tipo';
				return $response;
			}
			$model			= $options->model ?? ontology_node::get_model_by_tipo($tipo);
			$type 			= $options->type ?? null;

		// permissions check for the section
			$permissions = common::get_permissions($section_tipo, $section_tipo);
			if ($permissions < 1) {
				$response->msg = "Error. You don't have enough permissions to read this section ($section_tipo). permissions:$permissions";
				$response->errors[] = 'insufficient permissions';
				debug_log(__METHOD__ . " $response->msg ", logger::ERROR);
				return $response;
			}

		$raw_data = [];

		// search if not empty
		if (!empty($sqo)) {

			// search exec
				$search		= search::get_instance($sqo);
				$db_result	= $search->search();

			// check the type of the caller
			switch ($type) {
				case 'component':
					// component cases
					// table to use
					$column = section_record_data::get_column_name($model);
					if (empty($column)) {
						$response->msg = 'API Error: ('.__FUNCTION__.') Cannot resolve data column from model '.$model;
						$response->errors[] = 'cannot resolve data column from model '.$model;
						return $response;
					}

					foreach ($db_result as $section_record) {
						$raw_data[] = $section_record->$column->$tipo ?? null;
					}
					break;

				case 'section':
					$raw_data = $db_result->fetch_all();
					break;

				case 'target_section':
					// uses the relations to get all locators that call to target section given
					// related cases
					foreach ($db_result as $section_record) {
						// get all data in relations
						$relations_data = $section_record->relation ?? new stdClass();
						// get the component data
						foreach ($relations_data as $component_data) {
							foreach ($component_data as $current_locator) {
								if($tipo === $current_locator->section_tipo){
									$raw_data[] = $current_locator;
								}
							}
						}
					}
					break;
			}
		}

		// response success
			$response->result	= $raw_data;
			$response->table	= common::get_matrix_table_from_tipo($section_tipo);
			$response->msg		= empty($response->errors)
				? 'OK. Request done'
				: 'Warning! Request done with errors';


		return $response;
	}//end read_raw



	/**
	* CREATE
	* Inserts a new, empty record row into the matrix table for the given
	* section_tipo and returns the newly assigned section_id.
	*
	* The section_id is generated by the Dédalo counter service (not a DB
	* sequence), so it is stable and unique across all matrix tables.
	* Requires write permission (>= 2) on the section.
	*
	* @param object $rqo
	* sample:
	* {
	*    "action": "create",
	*    "source": {
	*        "section_tipo": "oh1"
	*    }
	* }
	* @return object $response
	*   $response->result  string|false — new section_id on success, false on failure
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

		// permissions. Get the section permissions and check if the user can create a record
			$permissions = common::get_permissions($section_tipo, $section_tipo);
			if($permissions < 2) {
				$response->errors[]	= 'insufficient permissions';
				$response->msg		= "Error. You don't have enough permissions to create a record in this section ($section_tipo). permissions:$permissions";
				debug_log(__METHOD__
					. " $response->msg " . PHP_EOL
					. " section_tipo:$section_tipo "
					, logger::ERROR
				);
				return $response;
			}

		// section
			$section	= section::get_instance( $section_tipo );
			$section_id	= $section->create_record(); // Section save, returns the created section_id

			if (empty($section_id)) {
				$response->errors[] = 'Failed to save the section';
			}

		// (!) When we save the search options here, we will reset the count to force recalculation of the total.
			//   This is currently handled in 'section_records' but may change in the future.
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
	* Deep-copies an existing section record identified by section_tipo and
	* section_id and returns the section_id of the newly created copy.
	*
	* Two security gates are applied before the copy:
	* 1. Section-level write permission (>= 2) — a read-only user must not be
	*    able to spawn records by cloning, even if they can view the source.
	*    (Audit §5.2.)
	* 2. Per-record scope check via security::assert_record_in_user_scope() —
	*    prevents a user with section-write but outside the source record's
	*    project scope from cloning records they cannot see. (SEC-024 §9.4.)
	*
	* @param object $rqo
	* sample:
	* {
	*    "action": "duplicate",
	*    "source": {
	*        "section_tipo": "oh1",
	* 		"section_id": "2"
	*    }
	* }
	* @return object $response
	*   $response->result  string|false — new section_id on success, false on failure
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

		// section_record
		// section_record duplicate current. Returns the section_id created

		// permissions check. Duplication produces a NEW record, so we require WRITE
			// (>=2) on the section. Do NOT relax this to >=1: a user with read-only
			// access must not be able to spawn new records by duplicating existing
			// ones. (Audit ref: §5.2.)
			$permissions = common::get_permissions($section_tipo, $section_tipo);
			if ($permissions < 2) {
				$response->errors[] = 'insufficient permissions';
				$response->msg      = 'Error. You don\'t have enough permissions to write to the section ('.$section_tipo.'). permissions:'.to_string($permissions);
				debug_log(__METHOD__
					. " $response->msg "
					, logger::ERROR
				);
				return $response;
			}

		// SEC-024 (§9.4): per-record gate. Duplicate reads the source record by
		// section_id; without this check a user with section-write but outside
		// the source's project scope could clone records they cannot see.
			if (!empty($section_id)) {
				security::assert_record_in_user_scope(
					$section_tipo,
					(int)$section_id,
					__METHOD__
				);
			}

			$section_record	= section_record::get_instance( $section_tipo, (int)$section_id );
			$section_id	= $section_record->duplicate();

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
	* Removes one or more section records from the database, delegating the
	* actual operation to sections::delete().
	*
	* The target set is determined in order of precedence:
	*   1. $rqo->sqo  — explicit SQO defines the row filter (preferred path for
	*                   multi-record deletes from list views).
	*   2. $rqo->source->section_id — single-record delete when no SQO is given.
	*
	* delete_mode controls the scope of the deletion:
	*   'delete_data'   — removes component data only (keeps the row skeleton).
	*   'delete_record' — removes the entire row and all its component data.
	*
	* Additional flags forwarded to sections::delete():
	*   delete_diffusion_records — also removes the corresponding diffusion rows.
	*   delete_with_children     — recursively removes child records in the TS tree.
	*
	* Only 'section' models are accepted; the method returns an error immediately
	* for any other model to prevent accidental deletion of ontology elements.
	* Requires write permission (>= 2) on the resolved section_tipo.
	*
	* @param object $rqo
	* sample:
		* {
		*	"action": "delete",
		*	"source": {
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
		*			"oh1"
		*		],
		*		"filter_by_locators": [
		*			{
		*				"section_tipo": "oh1",
		*				"section_id": "127"
		*			}
		*		],
		*		"limit": 1
		*	}
		* }
	* @return object $response — forwarded from sections::delete()
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
			$model	= ontology_node::get_model_by_tipo($tipo,true);
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
				$options->sqo						= $rqo->sqo ?? null;
				$options->delete_diffusion_records	= $rqo->options->delete_diffusion_records ?? null;
				$options->delete_with_children		= $rqo->options->delete_with_children ?? false;

		// permissions. Check if the user has enough permissions to delete (permissions >= 2)
			$permissions = common::get_permissions($options->section_tipo, $options->section_tipo);
			if ($permissions < 2) {
				$response->errors[] = 'insufficient permissions';
				$response->msg      = 'Error. You don\'t have enough permissions to delete this section ('.$options->section_tipo.'). permissions:'.to_string($permissions);
				debug_log(__METHOD__
					. " $response->msg "
					, logger::ERROR
				);
				return $response;
			}

		// Delete in sections
			$sections = sections::get_instance( null, null );
			$response = $sections->delete( $options );


		return $response;
	}//end delete



	/**
	* SAVE
	* Persists changed component data to the matrix JSONB store.
	*
	* Only 'component' type is currently implemented; other types are logged as
	* errors and ignored. In search mode the entire incoming value replaces the
	* component's stored data (filter preset save). In edit/list mode each item
	* in $rqo->data->changed_data is applied sequentially via
	* component_common::update_data_value() then component::save().
	*
	* Changed-data atomic actions (carried inside each changed_data item):
	*   insert          — appends the given value to the data array.
	*   update          — replaces the item at the given key.
	*   remove          — removes the item at the given key.
	*   set_data        — bulk-replaces the whole data array (no key check).
	*   sort_data       — reorders the data array by a target key (portals).
	*   sort_by_column  — reorders by a target section column value (portals,
	*                     gated by the 'sort_by_column' ontology property).
	*   add_new_element — alias of 'insert' from the button-add flow; adjusts
	*                     pagination offset to show the newly added item.
	*
	* After save the component re-resolves its data and the full element JSON
	* (context + data) is returned so the client can refresh in place.
	* If observers_data were set on the component during save they are merged
	* into the returned data array so dependent components update atomically.
	*
	* Blocks any save to DEDALO_ACTIVITY_SECTION_TIPO to prevent data corruption
	* of the activity audit trail (except section_id values starting with
	* 'search_' which are temporary preset records, not real activity rows).
	*
	* @see component_common::update_data_value()
	*
	* @param object $rqo
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
		*        "changed_data": [{
		*            "action": "update",
		*            "key": 0,
		*            "value": "title2"
		*        }]
		*    }
		* }
	* @return object $response
	*   $response->result  object|false — full element JSON {context, data} on success
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
			$tipo				= $source->tipo ?? null;
			$model				= $source->model ?? ontology_node::get_model_by_tipo($tipo,true);
			$section_tipo		= $source->section_tipo ?? null;
			$section_id			= $source->section_id ?? null;
			$mode				= $source->mode ?? 'list';
			$view				= $source->view ?? null;
			$lang				= $source->lang ?? DEDALO_DATA_LANG;
			$type				= $source->type ?? null; // the type of the dd_object that is calling to update like 'component'
			$changed_data		= $data->changed_data ?? null;
			$caller_dataframe	= $source->caller_dataframe ?? null;
			$is_temporal		= $source->is_temporal ?? false;

		// activity section check
			if ($section_tipo===DEDALO_ACTIVITY_SECTION_TIPO && !str_starts_with($section_id, 'search_')) {
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

				// is_temporal
					if ($is_temporal===true) {
						$component->is_temporal = true;
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
						$response->errors[]	= 'changed_data must be array';
						$response->msg		= 'Error. changed_data must be array';
						debug_log(__METHOD__
							." ERROR. var 'changed_data' expected to be array. Received type: " . PHP_EOL
							.' type: '			. gettype($changed_data) . PHP_EOL
							.' changed:data: '	. to_string($changed_data)
							, logger::ERROR
						);
						return $response;
					}

				if ($mode==='search') {

					// force same changed_data (whole data)
						$changed_data_item	= $changed_data[0] ?? null;
						$value				= !empty($changed_data_item) && isset($changed_data_item->value)
							? $changed_data_item->value
							: null;
						$component->set_data([$value]);

				}else{

					// changed_data is array always. Update items
						foreach ($changed_data as $changed_data_item) {

							if (!is_object($changed_data_item)) {
								debug_log(__METHOD__ . " Error: changed_data_item is not an object", logger::ERROR);
								continue;
							}

							// update the data with the changed data sent by the client
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
						$save_result = $component->save();
						if ($save_result === null) {
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

					// force recalculate data
						$component_data = $component->get_data();

					// changed_data action: sort_data, add_new_element, insert, remove ..
						$changed_data_action = $changed_data[0]?->action ?? null;

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
								$total	= empty($component_data) ? 0 : count($component_data);
								$limit	= isset($component->pagination->limit)
									? (int)$component->pagination->limit
									: 10;
								$pages	= $limit > 0
									? (int)ceil($total / $limit)
									: 1;
								$offset	= $limit >= $total
									? 0
									: $limit * ($pages - 1);

								// overwrite values
								$component->pagination->limit	= $limit;
								$component->pagination->total	= $total;
								$component->pagination->offset	= $offset;
								break;

							default:
								// Nothing to do
								break;
						}
				}

				// datalist. If is received, inject to the component for recycle
					if (isset($data->datalist)) {
						$component->set_datalist($data->datalist);
					}

				// force recalculate data
					$component->set_data_resolved(null);

				// element JSON
					$get_json_options = new stdClass();
						$get_json_options->get_context	= true;
						$get_json_options->get_data		= true;
					$element_json = $component->get_json($get_json_options);

				// observers_data
					if (isset($component->observers_data)) {
						$element_json->data = [...$element_json->data, ...$component->observers_data];
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
	* Executes a SQL COUNT query for the given SQO and returns the total.
	*
	* Used by section pagination widgets and tools that need the total record
	* count separately from a data fetch.
	*
	* Key behaviours:
	* - If $rqo->prevent_lock is absent (falsy), session_write_close() is called
	*   before the query to avoid blocking concurrent requests on the same PHP
	*   session.
	* - Permission check: if the user lacks read access (< 1) on ANY section_tipo
	*   in sqo->section_tipo, a zero total is returned instead of an error —
	*   this prevents leaking the existence of rows the user cannot see. (SEC-09)
	* - Session filter merge: when the SQO arrives without a 'filter',
	*   'filter_by_locators', or 'order', the last saved session values are
	*   injected so the count stays consistent with the visible list. (Only
	*   applied when a session SQO already exists for the sqo_id key.)
	* - full_count is forced to true so the DB query runs COUNT(*) rather than
	*   returning an estimate.
	*
	* @param object $rqo
	* sample:
		* {
		*    "action": "count",
		*    "source": {
		*        "typo": "source",
		*        "type": "tm",
		*        "action": null,
		*        "model": "service_time_machine",
		*        "tipo": "dd15",
		*        "section_tipo": "dd15",
		*        "mode": "list"
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
	*   $response->result  object|int — { total: int } or 0 on permission denial
	*/
	public static function count(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// rqo vars
			$tipo	= $rqo->source->tipo;
			$model	= $rqo->source->model ?? ontology_node::get_model_by_tipo($tipo,true);
			$sqo	= $rqo->sqo;
			$mode	= $rqo->source->mode ?? 'list'; //set default for section count

		// prevent_lock. Close session if not already closed
			if (!isset($rqo->prevent_lock)) {
				session_write_close();
			}

		// permissions check. If user don't have access to any section, set total to zero and prevent search
			// SEC-09: check permissions for all sections, not only DEDALO_SECTION_USERS_TIPO
			$ar_section_tipo = $sqo->section_tipo;
			if( empty($ar_section_tipo) ){
				$response->result = 0;
				return $response;
			}
			foreach ($ar_section_tipo as $current_section_tipo) {
				$permissions = common::get_permissions($current_section_tipo, $current_section_tipo);
				if ($permissions < 1) {
					$response->result	= (object)['total' => 0];
					$response->msg		= 'OK. Request done successfully';
					return $response;
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
		// full count
			$sqo->full_count = true;

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
	* Returns the structure context for a single element without fetching any
	* record data. Used primarily by the client-side search.get_component() path
	* (via data_manager) to lazy-load a component's context after the section
	* list has already rendered.
	*
	* When $rqo->simple is true, get_structure_context_simple() is called
	* (skips tool/button resolution — cheaper). Otherwise the full get_json()
	* path is used (context only, get_data=false).
	*
	* Supports all element families:
	*   section     — plain section context
	*   area*       — area context (area_thesaurus, area_ontology, etc.)
	*   component_* — component context; lang resolved via ontology_node::get_translatable()
	*   tool_*      — tool context; resolved via tool_common::get_user_tools() to
	*                 enforce tool membership before instantiation
	*   default     — other registered classes; guarded by SEC-049 identifier and
	*                 DEDALO_CORE_PATH path checks to prevent arbitrary class loading
	*
	* SEC: read permission is asserted on section_tipo before element build for
	* all non-tool models. Tools apply their own membership gate (get_user_tools).
	*
	* Closes the PHP session immediately (session_write_close) to avoid blocking
	* other concurrent requests, since this action is read-only.
	*
	* @param object $rqo
	* @return object $response
	*   $response->result  object — structure context of the requested element
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
			$model			= $source->model ?? ontology_node::get_model_by_tipo($tipo,true);
			$lang			= $source->lang ?? DEDALO_DATA_LANG;
			$mode			= $source->mode ?? 'list';
			$section_id		= $source->section_id ?? null; // only used by tools (it needed to load the section_tool record to get the context )
			$simple			= $rqo->simple ?? false; // simple context response

		// SEC: read permission required to inspect element context.
			// Tools have their own membership check (`get_user_tools`) below;
			// for section/area/component branches we gate by section_tipo here.
			if (!empty($section_tipo) && !str_starts_with((string)$model, 'tool_')) {
				security::assert_section_permission($section_tipo, 1, __METHOD__);
			}

		// build element
			switch (true) {
				case $model==='section':
					$element = section::get_instance($section_tipo, $mode);
					break;

				// case $model==='section_tm':
					// 	$section_id 	= $source->section_id;
					// 	$element 		= section_tm::get_instance($section_id, $section_tipo);
					// 	// set rqo (source)
					// 	$element->set_rqo([$source]); // inject whole source
					// 	break;

				case str_starts_with($model, 'area'):
					$element = area::get_instance($model, $tipo, $mode);
					break;

				case str_starts_with($model, 'component_'):

					$component_lang	= (ontology_node::get_translatable($tipo)===true)
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

				case str_starts_with($model, 'tool_'):

					// tool section_tipo and section_id can be resolved from model if is necessary
						// if (empty($section_id)) {
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
					// SEC-049: the default branch instantiates `new $model($mode)`
					// from a user-supplied `source.model`. Every legitimate
					// request matches one of the prefix branches above; this
					// default is only reached for a handful of ontology
					// element types (e.g. `dd_*`). Refuse anything that does
					// not look like a bare PHP class identifier, and require
					// the class to already be declared AND to live under
					// DEDALO_CORE_PATH so an attacker cannot instantiate a
					// random class shipped by vendor/ or lib/.
					if (!is_string($model) || !preg_match('/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/', (string)$model)) {
						debug_log(__METHOD__
							. ' SEC-049 refused model that is not a bare identifier: ' . to_string($model)
							, logger::ERROR
						);
						$response->msg = 'Error. invalid model';
						$response->errors[] = 'invalid model';
						return $response;
					}
					if (!class_exists($model, true)) {
						debug_log(__METHOD__
							. ' SEC-049 refused model: class not declared: ' . to_string($model)
							, logger::ERROR
						);
						$response->msg = 'Error. model not found: '.$model;
						$response->errors[] = 'model not found';
						return $response;
					}
					try {
						$reflection = new ReflectionClass($model);
						$file       = $reflection->getFileName();
						$core_root  = defined('DEDALO_CORE_PATH') ? realpath(DEDALO_CORE_PATH) : false;
						if ($file === false || $core_root === false
							|| strncmp($file, $core_root . DIRECTORY_SEPARATOR, strlen($core_root) + 1) !== 0) {
							debug_log(__METHOD__
								. ' SEC-049 refused model: class source outside DEDALO_CORE_PATH. file=' . to_string($file)
								. ' model=' . to_string($model)
								, logger::ERROR
							);
							$response->msg = 'Error. model not allowed: '.$model;
							$response->errors[] = 'model not allowed';
							return $response;
						}
					} catch (Throwable $e) {
						debug_log(__METHOD__
							. ' SEC-049 reflection failed: ' . $e->getMessage()
							, logger::ERROR
						);
						$response->msg = 'Error. model not allowed: '.$model;
						$response->errors[] = 'model not allowed';
						return $response;
					}
					try {
						$element = new $model($mode);
					} catch (Exception $e) {
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
	* Returns the structure contexts for all components belonging to one or more
	* sections. Delegates entirely to common::get_section_elements_context().
	*
	* Used by:
	*   - The section search filter panel (to populate the filterable field list).
	*   - tool_export (to enumerate the exportable columns).
	*
	* $options->context_type controls the depth of each returned context:
	*   'simple' — lightweight (get_structure_context_simple), no tool/button
	*              resolution; preferred for filter and export lists.
	*   (any)    — full context (get_structure_context).
	*
	* $options->use_real_sections — when true, resolves section_tipo through the
	* ontology to its real section (not a virtual/portal one).
	*
	* $options->ar_components_exclude — optional list of component tipos to omit.
	*
	* SEC-07: skip_permissions is hardcoded to false here regardless of what the
	* client sends; common::get_section_elements_context() applies its own
	* per-component permission filter.
	*
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
	*   $response->result  array — component structure context objects, one per component
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
			$skip_permissions		= false; // SEC-07: never allow client to skip permissions

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



	// search / read methods ///////////////////////////////////
	// build_json_rows, get_component_value: private helpers called by read()



	/**
	* BUILD_JSON_ROWS
	* Core read dispatcher: instantiates the requested element, runs its SQO,
	* and returns the combined { context, data } JSON payload for the client.
	*
	* Called by read() for all source->action values except 'get_value'.
	* Dispatches on $ddo_source->action:
	*   'search'          — builds a sections instance and runs the SQO; used
	*                       for section list/edit and service autocomplete.
	*   'related_search'  — same as 'search' but for inverse-relation queries.
	*   'get_data'        — data-only fetch for a component, area, or menu; no
	*                       SQO search is involved — returns component data only.
	*   'resolve_data'    — injects an arbitrary $value array into a component
	*                       instance and resolves it; used by portals.
	*   'get_relation_list' — legacy path for relation_list elements.
	*
	* Permission model (two gates):
	* 1. Pre-hoc source gate — runs before any DB or ontology work.
	*    - Skipped for 'menu' and 'service_*' models (see inline comment).
	*    - Component models use component_common::resolve_component_read_permission()
	*      for special-case grants (own-user, TM mode, search mode).
	* 2. Post-hoc result gate — after get_json(), wipes $result->data if
	*    permission < 1. Guards against edge cases where the pre-hoc gate was
	*    exempt but the resolved element data should still be suppressed.
	*
	* SQO resolution order:
	* 1. $rqo->sqo received  — clone it and merge any missing filter/order/limit/
	*    offset/filter_by_locators/children_recursive from session when session_save=true.
	* 2. No $rqo->sqo + section model + edit/list mode + session exists  — reuse
	*    the whole session SQO (navigation continuity on page reload).
	* 3. Fallback  — construct a fresh SQO with defaults; check for a user preset
	*    (request_config_presets) to determine the starting limit.
	*
	* The SQO is persisted to $_SESSION at the end of the 'search' action for
	* section models in edit/list/list_thesaurus mode when session_save=true.
	* session_write_close() is called after context/data resolution to release
	* the session lock for concurrent requests.
	*
	* @see class.search_query_object.php
	* @see component_common::resolve_component_read_permission()
	*
	* @param object $rqo
	* @return object $response
	*   $response->result  object — { context: array, data: array [, debug: object] }
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
			$lang				= $ddo_source->lang ?? DEDALO_DATA_LANG;
			$tipo				= $ddo_source->tipo ?? null;
			$section_tipo		= $ddo_source->section_tipo ?? $ddo_source->tipo;
			$section_id			= $ddo_source->section_id ?? null;
			$model				= $ddo_source->model ?? ontology_node::get_model_by_tipo($ddo_source->tipo,true);
			$caller_dataframe	= $ddo_source->caller_dataframe ?? null;
			$properties			= $ddo_source->properties ?? null;
			$is_temporal		= $ddo_source->is_temporal ?? false;
			$session_save		= $ddo_source->session_save ?? true;
			$session_key		= $ddo_source->session_key ?? (($model==='section')
				? section::build_sqo_id($tipo)
				: 'undefined'
			); // cache key sqo_id;

		// SEC: pre-hoc read permission check.
			// Was previously a POST-hoc check at the bottom of this method that wiped
			// $result->data after the search had already run, leaving $result->context
			// (full schema) leaked and a timing oracle on row count. The gate now runs
			// before any DB or ontology work. The 'menu' model is exempt (matches the
			// previous behaviour) because menus are discoverable scaffolding.
			//
			// Service / reflective wrappers (model starts with 'service_', e.g.
			// `service_time_machine`) are also exempt at THIS level because their
			// `source->section_tipo` is the bookkeeping section (e.g. `dd15`), not
			// the real read target. Their access is governed instead by the per-
			// `sqo->section_tipo[]` gate immediately below — same model the `count`
			// action uses (see dd_core_api::count).
			//
			// Component models use `component_common::resolve_component_read_permission()`
			// instead of the generic `common::get_permissions()` because components have
			// special-case rules (own-user access, TM mode, search mode, etc.) that the
			// generic check does not handle — see get_component_permissions().
			$is_service_model	= is_string($model) && str_starts_with($model, 'service_');
			$is_component_model	= is_string($model) && str_starts_with($model, 'component_');
			if (
				!empty($section_tipo)
				&& !empty($tipo)
				&& $model !== 'menu'
				&& !$is_service_model
			) {
				// Resolve only when section_tipo/tipo are confirmed non-empty strings.
				// Component models use resolve_component_read_permission() to honour
				// special-case grants (own-user, TM mode, search mode, etc.) that
				// common::get_permissions() does not handle. $section_id is cast to
				// ?int because JSON-decoded values may arrive as strings.
				$read_permission = $is_component_model
					? component_common::resolve_component_read_permission(
						$section_tipo,
						$tipo,
						isset($section_id) ? (int)$section_id : null,
						$mode
					)
					: common::get_permissions($section_tipo, $tipo);
			}
			if (
				!empty($section_tipo)
				&& !empty($tipo)
				&& $model !== 'menu'
				&& !$is_service_model
				&& isset($read_permission)
				&& $read_permission < 1
			) {
				debug_log(__METHOD__
					. ' Denied read: insufficient permissions' . PHP_EOL
					. ' user_id: ' . to_string(logged_user_id()) . PHP_EOL
					. ' section_tipo: ' . to_string($section_tipo) . PHP_EOL
					. ' section_id: ' . to_string($section_id) . PHP_EOL
					. ' tipo: ' . to_string($tipo) . PHP_EOL
					. ' model: ' . to_string($model) . PHP_EOL
					. ' read_permission: ' . to_string($read_permission) . PHP_EOL
					. ' rqo: ' .to_string($rqo)
					, logger::ERROR
				);
				$response->msg		= 'Error. Insufficient permissions to read ('.$section_tipo.' / '.$tipo.')';
				$response->errors[]	= 'permissions_denied';
				return $response;
			}

		// SEC: per-sqo target section gate. Mirrors `dd_core_api::count` so that
			// service / reflective models are still gated against the sections
			// they actually read. For non-service models this is redundant with
			// the source gate above, but cheap (cached `common::get_permissions`).
			if (!empty($rqo->sqo->section_tipo) && is_array($rqo->sqo->section_tipo)) {
				foreach ($rqo->sqo->section_tipo as $sqo_section_tipo) {
					if (empty($sqo_section_tipo)) {
						continue;
					}
					if (common::get_permissions($sqo_section_tipo, $sqo_section_tipo) < 1) {
						debug_log(__METHOD__
							. ' Denied read: insufficient permissions on sqo target' . PHP_EOL
							. ' user_id: ' . to_string(logged_user_id()) . PHP_EOL
							. ' sqo->section_tipo: ' . to_string($sqo_section_tipo) . PHP_EOL
							. ' model: ' . to_string($model)
							, logger::ERROR
						);
						$response->msg		= 'Error. Insufficient permissions to read ('.$sqo_section_tipo.')';
						$response->errors[]	= 'permissions_denied';
						return $response;
					}
				}
			}

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

				if ( $model==='section' && ( $mode==='edit' || $mode==='list' ) && isset($sqo_session) ) {

					// use session already set sqo
					$sqo = $sqo_session;

				}else{

					// create a new sqo from scratch

					// limit. get the limit from the show
						$limit = (isset($rqo->show) && isset($rqo->show->sqo_config->limit))
							? $rqo->show->sqo_config->limit
							: (function() use($tipo, $section_tipo, $mode){
								// user preset check (defined sqo limit)
								$user_preset = request_config_presets::get_request_config(
									$tipo,
									$section_tipo,
									$mode
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
							(string)$lang // string $lang = DEDALO_DATA_LANG
						);


					// session sqo. Store section SQO in session.
					// It's not used to main navigation, but it's needed by some tools like tool_export
					// in addition to section_tool navigation (like transcription, translation, etc.)
						$session_save_modes = ['edit','list','list_thesaurus'];
						if ($model==='section' && $session_save===true && in_array($mode, $session_save_modes)) {

							$safe_sqo = clone $sqo;

							if (session_status() !== PHP_SESSION_ACTIVE) {
								debug_log(__METHOD__
									. " Unable to write session because session is not active " . PHP_EOL
									. ' PHP_SESSION_ACTIVE: ' . to_string(PHP_SESSION_ACTIVE)
									, logger::ERROR
								);
							}
							$_SESSION['dedalo']['config']['sqo'][$sqo_id] = $safe_sqo;
							debug_log(__METHOD__
								. " -> saved in session sqo sqo_id: '$sqo_id'" . PHP_EOL
								. ' sqo:' . to_string($safe_sqo)
								, logger::DEBUG
							);
							// close current session and set as read only to unlock thread
							// session_write_close();
							// (!) Moved to after resolve context to allow component external to write
							// server availability (Zenon issues)
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

					// is_temporal
						if ($is_temporal===true) {
							$element->is_temporal = true;
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
							(string)($lang)
						);

					// store sqo section
						if ($model==='section' && ($mode==='edit' || $mode==='list') && $session_save===true) {
							$_SESSION['dedalo']['config']['sqo'][$sqo_id] = clone $sqo;
							// close current session and set as read only to unlock thread
							session_write_close();
						}
					break;

				case 'get_data': // Used by components and areas

					if (str_starts_with($model, 'component_')) {

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
								if (isset($ddo_source->matrix_id)) {
									// set matrix_id value to component to allow it search data in
									// matrix_time_machine component function 'get_data' will be
									// overwritten to get time machine data instead the real data
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

							// is_temporal
								if ($is_temporal===true) {
									$element->is_temporal = true;
								}

							// properties optional
								if (!empty($properties)) {
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

					}else if (str_starts_with($model, 'area')) {

						// areas
							$element = area::get_instance($model, $tipo, $mode);
							// (!) use set_properties (not a direct property write) so the
							// properties_injected flag fires: the request-specific values
							// injected below (action, sqo, thesaurus vars) must not be
							// served from / baked into the shared structure context cache
							$element->set_properties( $element->get_properties() ?? new stdClass() );

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

					if (str_starts_with($model, 'component')) {

						// component
							$component_lang	= (ontology_node::get_translatable($tipo)===true)
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
									$element->set_data($value);

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

		// close current session and set as read only to unlock thread
			session_write_close();

		// result. Set result object
			$result->context	= $context;
			$result->data		= $data;

		// permissions check. Prevent mistaken data resolutions.
			// Service / reflective models (e.g. `service_time_machine`) carry a
			// bookkeeping `source->section_tipo` (`dd15`) that does NOT
			// correspond to the data being read; their authorisation is enforced
			// by the per-`sqo->section_tipo[]` gate at the top of this method.
			// Apply the exemption based on the source `$model` (the original
			// $ddo_source->model, which is "service_time_machine") rather than
			// $element->get_model(): for action='search' the element is a
			// `sections` instance whose model is 'sections', not the service
			// label. Same check the pre-hoc gate uses.
			//
			// Component models use resolve_component_read_permission() to stay
			// consistent with the pre-hoc gate — otherwise the post-hoc gate
			// would wipe data that the pre-hoc gate correctly allowed through
			// component special cases (own-user, TM mode, search mode, etc.).
			$is_service_model	= is_string($model) && str_starts_with($model, 'service_');
			$is_component_model	= is_string($model) && str_starts_with($model, 'component_');
			$permissions = (!empty($section_tipo) && !empty($tipo))
				? ($is_component_model
					? component_common::resolve_component_read_permission(
						$section_tipo,
						$tipo,
						isset($section_id) ? (int)$section_id : null,
						$mode
					)
					: common::get_permissions($section_tipo, $tipo))
				: 1; // nothing to gate when section_tipo/tipo are absent
			if (
				!empty($result->data)
				&& $permissions < 1
				&& isset($element)
				&& $element->get_model() !== 'menu'
				&& $model !== 'menu'
				&& !$is_service_model
			) {

				$result->data = [];

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
	* Removes duplicate data items from a flat array of component data objects,
	* matching on the five-key composite identity: section_tipo, section_id,
	* tipo, from_component_tipo, lang.
	*
	* Uses a manual loop with array_filter() rather than array_unique(SORT_REGULAR)
	* because the data items are stdClass objects; the commented-out
	* array_unique() alternative did not handle object comparison reliably.
	*
	* @param array<object> $data - array of component datum objects to deduplicate
	* @return array<object> $clean_data - deduplicated array (preserves first occurrence)
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
	* Removes duplicate context items from a flat array of structure context
	* objects, matching on the three-key composite identity: section_tipo,
	* tipo, lang.
	*
	* Parallel to smart_remove_data_duplicates() but for context objects, which
	* carry fewer identity keys than data items.
	*
	* @param array<object> $context - array of structure context objects to deduplicate
	* @return array<object> $clean_context - deduplicated array (preserves first occurrence)
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
	* Returns a plain text representation of a component's current data value,
	* without building the full element JSON (no context, no data array).
	*
	* Invoked by read() when source->action === 'get_value'. Only component_*
	* models are accepted; any other model type returns an error immediately.
	* The value is obtained via component::get_value() which applies the
	* component's own text-rendering logic (language fallback, locator
	* resolution, etc.).
	*
	* Closes the PHP session immediately before element construction (read-only).
	*
	* @param object $rqo - same RQO structure as read(); action is 'get_value'
	* @return object $response
	*   $response->result  mixed — component value as rendered by get_value()
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
			$model			= $source->model ?? ontology_node::get_model_by_tipo($tipo,true);
			$lang			= $source->lang ?? DEDALO_DATA_LANG;
			$mode			= $source->mode ?? 'list';
			$section_id		= $source->section_id ?? null; // only used by tools (it needed to load the section_tool record to get the context )

		// build element
			switch (true) {

				case str_starts_with($model, 'component_'):

					$component_lang	= (ontology_node::get_translatable($tipo)===true)
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
	* Builds the indexation grid for a specific component within a section
	* record. The grid maps which thesaurus terms are associated with the
	* component's locators so the client can display an inline indexation UI.
	*
	* Delegates to indexation_grid::build_indexation_grid() with the given SQO
	* for pagination support.
	*
	* source->value is an optional filter — an array of section_tipo strings
	* used to restrict which locator types appear in the grid (e.g. ['oh1']).
	*
	* SEC: read permission on section_tipo is asserted before grid construction.
	*
	* @param object $rqo
	* {
	*	"action": "get_indexation_grid",
	*	"source": {
	*		"section_tipo"  : "oh1",
	*		"section_id"    : "42",
	*		"tipo"          : "test25",
	*		"value"         : ["oh1"]
	*	},
	*	"sqo": { "limit": 10, "offset": 0 }
	* }
	* @return object $response
	*   $response->result  object — indexation grid built by indexation_grid::build_indexation_grid()
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

		// SEC: read permission required to build the indexation grid
			security::assert_section_permission($section_tipo, 1, __METHOD__);

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



	// (!) DEAD CODE — service_request is entirely commented out.
	// It was a generic dispatcher that loaded service class files by name and
	// called a method on them via call_user_func(). Replaced by the per-tool
	// API action pattern (tool_ prefixed models in get_element_context / start).
	// Do not remove — kept for historical reference pending explicit cleanup.
	/**
	* SERVICE_REQUEST (INACTIVE — method body is commented out)
	* Generic service method dispatcher.
	*
	* Would call a static method on a service class loaded from
	* DEDALO_SERVICES_PATH/<service_name>/class.<service_name>.php.
	* Replaced by the tool_* model dispatch in get_element_context() and start().
	*
	* @param object $rqo
	* sample:
	* {
	* 	"action": "service_request",
	* 	"dd_api": "dd_core_api",
	* 	"source": {
	*   	"typo": "source",
	*   	"action": "build_subtitles_text",
	*   	"model": "subtitles",
	*   	"arguments": {
	*   		"sourceText": "rsc860",
	*   		"maxCharLine": 90,
	*   		"type": "srt",
	*   		"tc_in_secs": 10,
	*   		"tc_out_secs": 35
	*   	}
	*   }
	* }
	* @return object $response
	* {
	* 	"result" : mixed,
	* 	"msg"    : string,
	* 	"error"  : int|null
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
	* GET_ENVIRONMENT
	* Assembles the minimum environment payload that the browser needs to
	* bootstrap the Dédalo client application.
	*
	* Returns three bundles:
	*   page_globals   — PHP constants, user info, and feature flags as a
	*                    stdClass; exposed as window.page_globals on the client.
	*   plain_vars     — Associative array of URL and config constants injected
	*                    as JS const declarations in environment.j.php.
	*   get_label      — Decoded lang-labels JSON object (translated UI strings
	*                    for the active DEDALO_APPLICATION_LANG).
	*
	* Called both as an explicit API action and internally from start() to
	* include the environment in every page bootstrap response.
	*
	* The result is the same object shape regardless of login state; individual
	* fields within page_globals (e.g. dedalo_version, user_id) are null when
	* the user is not authenticated.
	*
	* @return object $response
	*   $response->result  object — { page_globals: object, plain_vars: array, get_label: object }
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
	* Builds the complete page_globals object that is serialised as
	* window.page_globals in environment.j.php and consumed by every
	* client-side module.
	*
	* Contains:
	* - Authenticated user identity and role flags (is_logged, is_global_admin,
	*   is_developer, is_root, user_id, username, full_username).
	* - Entity identity constants (dedalo_entity, dedalo_entity_id).
	* - Version strings — exposed only when the user is logged in (API-03: the
	*   exact build version is a reconnaissance aid, so it is withheld pre-auth).
	* - Active lang and all application lang options (needed by the lang selector).
	* - dedalo_projects_default_langs — full language metadata for the project;
	*   cached to dd_cache under 'cache_page_globals.php'. The cache is built on
	*   first logged-in call and is invalidated by backup::write_lang_file().
	* - Media-quality defaults and feature flags (lock, notifications, media
	*   protection mode, maintenance/recovery mode).
	* - data_version — current ontology data version; also cached to avoid
	*   repeated DB queries.
	* - Debug-only fields (pg_version, php_version, php_memory, dedalo_root_path)
	*   only when SHOW_DEBUG or SHOW_DEVELOPER is true.
	*
	* The file-based cache (dd_cache) is written only when logged in to avoid
	* populating it from unauthenticated requests.
	*
	* @return object $obj — the fully populated page_globals object
	*/
	public static function get_page_globals() : object {

		// cache
		$cache_file_name = 'cache_page_globals.php';
		$cache_data	= dd_cache::cache_from_file((object)[
			'file_name' => $cache_file_name
		]);
		if (empty($cache_data)) {
			$cache_data = [];
		}
		$cache_modified = false;

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
			// version (API-03: the exact build is a version-disclosure recon aid;
			// expose it only to authenticated callers. entity stays public for the
			// pre-auth login page branding.)
			$obj->dedalo_version					= $obj->is_logged ? DEDALO_VERSION : null;
			$obj->dedalo_build						= $obj->is_logged ? DEDALO_BUILD : null;
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

			// projects default langs
			if(isset($cache_data['dedalo_projects_default_langs'])) {
				$obj->dedalo_projects_default_langs = $cache_data['dedalo_projects_default_langs'];
			}else{
				// Use fallback for v6 to v7 migration
				$langs_resolved = lang::resolve_multiple(DEDALO_PROJECTS_DEFAULT_LANGS) ?? [
					(object)[
						"code" => "spa",
						"section_id" => 17344,
						"names" => (object)[
							"lg-eng" => "Spanish",
							"lg-spa" => "Castellano"
						]
					],
					(object)[
						"code" => "cat",
						"section_id" => 3032,
						"names" => (object)[
							"lg-eng" => "Catalan"
						]
					],
					(object)[
						"code" => "eng",
						"section_id" => 5101,
						"names" => (object)[
							"lg-spa" => "Inglés",
							"lg-eng" => "English"
						]
					]
				];
				$obj->dedalo_projects_default_langs = array_map(function ($item) {

					/// try to get the name in the requested language, else fallback to main lang or any.
					$name = lang::fallback_lang_value($item->names, DEDALO_DATA_LANG);

					return [
						'label' => $name ?? $item->code,
						'value' => 'lg-'.$item->code,
						'tld2' => lang::get_alpha2_from_code('lg-'.$item->code)
					];
				}, $langs_resolved);
				// Set cache
				$cache_data['dedalo_projects_default_langs'] = $obj->dedalo_projects_default_langs;
				$cache_modified = true;
			}

			// quality defaults
			$obj->dedalo_image_quality_default	= DEDALO_IMAGE_QUALITY_DEFAULT;
			$obj->dedalo_av_quality_default		= DEDALO_AV_QUALITY_DEFAULT;
			$obj->dedalo_quality_thumb			= defined('DEDALO_QUALITY_THUMB') ? DEDALO_QUALITY_THUMB : 'thumb';
			// tag_id
			$obj->tag_id						= isset($_REQUEST['tag_id']) ? safe_xss($_REQUEST['tag_id']) : null;
			// dedalo_protect_media_files ('private' or 'publication' media access mode active)
			$obj->dedalo_protect_media_files	= media_protection::get_mode()!==false ? 1 : 0;
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
			// data_version
			if(isset($cache_data['data_version'])) {
				$obj->data_version					= $cache_data['data_version'];
			}else{
				$obj->data_version					= get_current_data_version();
				$cache_data['data_version']			= $obj->data_version;
				$cache_modified = true;
			}

			// debug only
			if(SHOW_DEBUG===true || SHOW_DEVELOPER===true) {
				$obj->dedalo_db_name = DEDALO_DATABASE_CONN;
				if ($obj->is_logged===true && defined('DEDALO_INSTALL_STATUS') && DEDALO_INSTALL_STATUS==='installed') {
					if(isset($cache_data['pg_version'])) {
						$obj->pg_version					= $cache_data['pg_version'];
					}else{
						$obj->pg_version = (function() {
							try {
								$conn = DBi::_getConnection() ?? false;
								if ($conn) {
									return pg_version($conn)['server'];
								}
								return 'Failed!';
							}catch(Exception $e){
								return 'Failed with Exception!';
							}
						})();
						$cache_data['pg_version']			= $obj->pg_version;
						$cache_modified = true;
					}

				}
				$obj->php_version	= PHP_VERSION;
				// $obj->php_version .= ' jit:'. (int)(opcache_get_status()['jit']['enabled'] ?? false);
				$obj->php_memory	= ini_get('memory_limit') ?? 'Unknown';
				if (str_starts_with(DEDALO_HOST, 'localhost')) {
					$obj->dedalo_root_path = DEDALO_ROOT_PATH;
				}
			}

		// cache
		if ($cache_modified===true && login::is_logged()) {
			dd_cache::cache_to_file((object)[
				'file_name' => $cache_file_name,
				'data' => $cache_data
			]);
		}


		return $obj;
	}//end get_page_globals



	/**
	* GET_JS_PLAIN_VARS
	* Returns the associative array of PHP constants that are emitted as
	* JavaScript const declarations in environment.j.php.
	*
	* These become globally-scoped JS constants in the browser, used by
	* every client module (data_manager, components, tools, diffusion client).
	*
	* Notable entries:
	* - DEDALO_API_URL / DEDALO_DIFFUSION_API_URL — absolute URLs built from
	*   DEDALO_PROTOCOL + HTTP_HOST when not overridden by config constants.
	* - DEDALO_TOOLS_URLS — per-tool base-URL map from tool_paths::get_additional_tools_url_map()
	*   for tools registered under DEDALO_ADDITIONAL_TOOLS roots; an absent key
	*   means the tool lives in the primary DEDALO_TOOLS_URL root.
	* - DEDALO_MAINTENANCE_MODE / DEDALO_NOTIFICATION — deprecated legacy keys
	*   kept for client backward compatibility only; use page_globals equivalents.
	* - DD_TIPOS — subset of ontology tipo constants needed by client tools
	*   (e.g. tool_user_admin, indexation UI).
	*
	* @return array<string, mixed> $plain_vars — keyed by JS constant name
	*/
	public static function get_js_plain_vars(): array {

		$plain_vars = [
			'DEDALO_ENVIRONMENT'					=> true,
			'DEDALO_API_URL'						=> defined('DEDALO_API_URL') ? DEDALO_API_URL : (DEDALO_PROTOCOL . ($_SERVER['HTTP_HOST'] ?? DEDALO_HOST) . DEDALO_ROOT_WEB . '/core/api/v1/json/'),
			'DEDALO_DIFFUSION_API_URL'				=> defined('DEDALO_DIFFUSION_API_URL') ? DEDALO_DIFFUSION_API_URL : (DEDALO_ROOT_WEB . '/diffusion/api/v1/'),
			'DEDALO_CORE_URL'						=> DEDALO_CORE_URL,
			'DEDALO_ROOT_WEB'						=> DEDALO_ROOT_WEB,
			'DEDALO_MEDIA_URL'						=> DEDALO_MEDIA_URL,
			'DEDALO_TOOLS_URL'						=> DEDALO_TOOLS_URL,
			// tool_name => base_url map for tools living in DEDALO_ADDITIONAL_TOOLS
			// roots only. An absent key = primary root (client keeps its historical
			// URL building). Exposes only directory names, never filesystem paths.
			'DEDALO_TOOLS_URLS'						=> tool_paths::get_additional_tools_url_map(),
			'SHOW_DEBUG'							=> SHOW_DEBUG,
			'SHOW_DEVELOPER'						=> SHOW_DEVELOPER,
			'DEVELOPMENT_SERVER'					=> DEVELOPMENT_SERVER,
			'DEDALO_UPLOAD_SERVICE_CHUNK_FILES'		=> DEDALO_UPLOAD_SERVICE_CHUNK_FILES,
			'DEDALO_UPLOAD_SERVICE_MAX_CONCURRENT'	=> defined('DEDALO_UPLOAD_SERVICE_MAX_CONCURRENT') ? DEDALO_UPLOAD_SERVICE_MAX_CONCURRENT : 50,
			'DEDALO_LOCK_COMPONENTS'				=> defined('DEDALO_LOCK_COMPONENTS') ? DEDALO_LOCK_COMPONENTS : false,
			'DEDALO_MAINTENANCE_MODE'				=> defined('DEDALO_MAINTENANCE_MODE') ? DEDALO_MAINTENANCE_MODE : null, // DEPRECATED . legacy support only (remove early)
			'DEDALO_NOTIFICATION'					=> null, // DEPRECATED . legacy support only (remove early)
			'DEDALO_RR_WORKER'						=> defined('DEDALO_RR_WORKER') ? DEDALO_RR_WORKER : false,
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
	* Reads and returns the raw content of the pre-generated language labels
	* file for the given lang code.
	*
	* Lang label files live under DEDALO_CORE_PATH/common/js/lang/<lang>.js
	* and are generated (or regenerated) by backup::write_lang_file() whenever
	* the Ontology is updated. Each file is a JSON-stringified object mapping
	* component/field labels to their translated strings in the requested lang:
	*   { "diameter": "Diameter", "code": "Code", … }
	*
	* Recovery chain:
	* 1. Try to read the file. On failure, call backup::write_lang_file($lang)
	*    to regenerate it, then re-read.
	* 2. If the file is still missing or empty, fall back to
	*    DEDALO_APPLICATION_LANGS_DEFAULT (the install default lang).
	*
	* The returned string is consumed by get_environment(), which decodes it
	* via json_decode() before placing it in the environment payload.
	*
	* @param string $lang - lang code, e.g. 'lg-eng' (typically DEDALO_APPLICATION_LANG)
	* @return string $lang_labels - raw JSON string; may be empty on total failure
	*/
	public static function get_lang_labels(string $lang) : string {

		$lang_path		= '/common/js/lang/' . $lang . '.js';
		$lang_labels	= file_get_contents(DEDALO_CORE_PATH . $lang_path);

		//if the file doesn't exists, try to regenerate the file
		if ( $lang_labels===false ){
			$result = backup::write_lang_file( $lang );
			if( $result !== true){
				debug_log(__METHOD__
					.' Lang labels file is not created!!! get_labels_lang for: '. $lang . PHP_EOL
					.' lang_path: ' . $lang_path . PHP_EOL
					.' lang_labels: ' . to_string($lang_labels)
					, logger::ERROR
				);

			}
			$lang_labels = file_get_contents(DEDALO_CORE_PATH . $lang_path);
		}
		// file not found case
		if ($lang_labels===false || empty($lang_labels)) {
			debug_log(__METHOD__
				.' Lang file not found. Falling back to DEDALO_APPLICATION_LANGS_DEFAULT: ' . DEDALO_APPLICATION_LANGS_DEFAULT . PHP_EOL
				.' lang_path: ' . $lang_path . PHP_EOL
				.' lang_labels: ' . to_string($lang_labels)
				, logger::ERROR
			);

			// fallback to default application lang
			$lang_path		= '/common/js/lang/' . DEDALO_APPLICATION_LANGS_DEFAULT . '.js';
			$lang_labels	= file_get_contents(DEDALO_CORE_PATH . $lang_path);
		}


		return $lang_labels;
	}//end get_lang_labels



	/**
	* GET_MATRIX_ONTOLOGY_LOCATOR
	* Converts a tipo identifier (e.g. 'dd1') into a canonical locator object
	* containing the ontology section's section_tipo and section_id.
	*
	* Used by the client when it needs to open the ontology record for a given
	* tipo (e.g. to navigate from a component to its definition in the
	* ontology section). The mapping is derived from:
	*   - get_section_id_from_tipo($tipo)  — extracts the numeric section_id
	*   - get_tld_from_tipo($tipo)         — extracts the top-level domain prefix
	*   - ontology::map_tld_to_target_section_tipo($tld) — resolves the
	*                                        ontology section_tipo for that TLD
	*
	* SEC: read permission on the resolved target_section_tipo is asserted before
	* returning the locator so that the client cannot probe ontology records it
	* has no access to.
	*
	* @param object $rqo
	*   $rqo->source->tipo  string — tipo identifier to resolve (e.g. 'dd1')
	* @return object $response
	*   $response->result  object — { section_tipo: string, section_id: string }
	*/
	public static function get_matrix_ontology_locator( object $rqo ) : object {

		// tipo
		$source = $rqo->source ?? null;

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// Source check
			if ( empty($source) ) {
				$response->msg		= 'Error. Invalid source: '.to_string($source);
				$response->errors[] = 'Bad source';
				return $response;
			}

		// API-05: read defensively; safe_tipo() below returns a clean 'Bad tipo' error.
		$tipo = $source->tipo ?? null;

		// tipo check
			if ( safe_tipo($tipo)===false ) {
				$response->msg		= 'Error. Invalid tipo: '.to_string($tipo);
				$response->errors[] = 'Bad tipo';
				return $response;
			}

		$section_id				= get_section_id_from_tipo($tipo);
		$tld					= get_tld_from_tipo($tipo);
		$target_section_tipo	= ontology::map_tld_to_target_section_tipo($tld);

		// SEC: read permission required on the resolved target section
			if (!empty($target_section_tipo)) {
				security::assert_section_permission($target_section_tipo, 1, __METHOD__);
			}

		$response->result = (object)[
			'section_tipo'	=> $target_section_tipo,
			'section_id'	=> $section_id
		];
		$response->msg = empty($response->errors)
			? 'OK. Request done successfully'
			: 'Warning! Request done with errors';


		return $response;
	}//end get_matrix_ontology_locator



	/**
	* GET_SECTION_TERMS
	* Batch-resolves the authoritative display label (section_map 'term') for
	* one or more section records in a single request.
	*
	* Used by client visualizations (e.g. the relation graph view) to label
	* nodes with the proper term instead of a client-side heuristic. Each
	* locator in $rqo->locators is resolved independently; the result is an
	* stdClass keyed "{section_tipo}_{section_id}" → term string, which maps
	* directly to the graph node id format for O(1) client lookups.
	*
	* Filtering rules applied per locator:
	* - Invalid tipo or empty section_id: silently skipped.
	* - Duplicate composite key: first occurrence wins.
	* - Insufficient read permission on section_tipo: silently omitted (never leak).
	* - No section_map term tipos defined for the section: omitted so the client
	*   keeps its own label rather than receiving the fallback placeholder.
	*
	* Hard cap: batch is silently truncated to 1000 locators to bound CPU work.
	* scope=null triggers the default main → thesaurus → relation_list resolution chain.
	*
	* @param object $rqo
	* 	{
	* 		"action"   : "get_section_terms",
	* 		"locators" : [ { "section_tipo": "oh1", "section_id": "42" }, … ],
	* 		"scope"    : null,
	* 		"lang"     : "lg-eng"
	* 	}
	* @return object $response
	*   $response->result  object — stdClass map keyed "{section_tipo}_{section_id}" => term string
	*/
	public static function get_section_terms( object $rqo ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// hard cap to prevent unbounded work from a hostile/huge batch
		$max_locators = 1000;

		// locators check
			$ar_locators = $rqo->locators ?? null;
			if ( !is_array($ar_locators) || empty($ar_locators) ) {
				$response->msg		= 'Error. Invalid or empty locators';
				$response->errors[]	= 'bad_locators';
				return $response;
			}
			if ( count($ar_locators) > $max_locators ) {
				debug_log(__METHOD__
					." Locators batch exceeds cap ($max_locators). Truncating from ".count($ar_locators)
					, logger::WARNING
				);
				$ar_locators = array_slice($ar_locators, 0, $max_locators);
			}

		// resolution options
			$scope	= $rqo->scope ?? null; // null => chain main -> thesaurus -> relation_list
			$lang	= ( isset($rqo->lang) && is_string($rqo->lang) )
				? $rqo->lang
				: DEDALO_DATA_LANG;

		// resolve terms (deduped by composite key; skip invalid or unreadable sections)
			$terms = new stdClass();
			foreach ($ar_locators as $current_locator) {

				if (!is_object($current_locator)) {
					continue;
				}

				$section_tipo	= $current_locator->section_tipo ?? null;
				$section_id		= $current_locator->section_id ?? null;

				// validate
				if ( safe_tipo($section_tipo)===false || $section_id===null || $section_id==='' || !is_scalar($section_id) ) {
					continue;
				}

				$key = $section_tipo . '_' . $section_id;
				if ( isset($terms->{$key}) ) {
					continue; // dedup
				}

				// SEC: read permission required on the section (omit forbidden, never leak)
				if ( common::get_permissions($section_tipo, $section_tipo) < 1 ) {
					continue;
				}

				// Only return a term when a section_map term is actually defined.
				// Without this, get_term() returns the "{section_tipo}_{section_id}"
				// fallback string, which would clobber the client's own label.
				if ( empty(section_map::get_term_tipos($section_tipo, $scope)) ) {
					continue;
				}

				$term = section_map::get_term(
					(object)[
						'section_tipo'	=> $section_tipo,
						'section_id'	=> $section_id
					],
					$scope,
					$lang,
					true // from_cache
				);

				$terms->{$key} = $term;
			}

		$response->result	= $terms;
		$response->msg		= empty($response->errors)
			? 'OK. Request done successfully'
			: 'Warning! Request done with errors';


		return $response;
	}//end get_section_terms



	/**
	* LOG_ACTIVITY
	* Records a user navigation event in the Dédalo activity logger.
	*
	* Called by read() after every successful data fetch to track which
	* sections and areas users open. Only section and area models generate
	* activity entries — component requests (e.g. autocomplete) are excluded
	* to avoid polluting the activity trail with background UI calls.
	*
	* Early-return guards:
	* - Empty tipo or excluded modes ('search', 'tm') — no navigation event.
	* - Logger section tipos (logger_backend_activity::$ar_elements_activity_tipo) —
	*   prevents an infinite write loop where logging triggers further activity.
	* - Temp/search preset section tipos — ephemeral sections not worth logging.
	*
	* The logged message label is 'LOAD EDIT' or 'LOAD LIST'. Any mode that is
	* neither 'list' nor one of the excluded modes is normalised to 'edit' because
	* the activity log only distinguishes two page-load types (e.g. 'tool_transcription'
	* is reported as 'LOAD EDIT').
	*
	* The section_id is included in the log data only when the model is 'section'
	* and mode is 'edit', since it is only meaningful in that context.
	*
	* @see dd_core_api::read()
	* @see logger_backend_activity
	*
	* @param object $options
	*   {
	*     rqo:        object   — full RQO from the read request
	*     section_id: int|null — section_id available in edit mode only
	*   }
	* @return void
	*/
	private static function log_activity(object $options) : void {

		// options
			$rqo		= $options->rqo ?? null;
			$section_id	= $options->section_id ?? null;

		// short vars (using nullsafe operator to prevent errors if source is missing)
			$tipo	= $rqo?->source?->tipo ?? '';
			$mode	= $rqo?->source?->mode ?? '';

		// return early if no valid tipo or excluded modes
			if ($tipo === '' || $mode === 'search' || $mode === 'tm') {
				return;
			}

		// Prevent infinite loop saving self
			if (in_array($tipo, logger_backend_activity::$ar_elements_activity_tipo, true)) {
				return;
			}

		// exclude other tipos
			if ($tipo === DEDALO_TEMP_PRESET_SECTION_TIPO || $tipo === DEDALO_SEARCH_PRESET_SECTION_TIPO) {
				return;
			}

		// exclude components
		// only sections and areas generate activity (prevent autocomplete activity footprint)
			$model = ontology_node::get_model_by_tipo($tipo, true);
			if ($model !== 'section' && str_starts_with((string)$model, 'area') === false) {
				return;
			}

		// mode. set mode_to_activity
		// In cases like 'tool_transcription' the mode passed is neither 'edit' nor 'list' so we will
		// force 'edit' in the logger as there are only 2 page load options defined: 'LOAD EDIT' and 'LOAD LIST'
			$mode_to_activity = ($mode === 'list') ? 'list' : 'edit';

		// data_activity. Create data_activity array
			$data_activity = [
				'msg'  => 'HTML Page is loaded in mode: ' . $mode_to_activity . ' [' . $mode . ']',
				'tipo' => $tipo
			];

		// create custom log based on caller and context
			if ($model === 'section' && $mode === 'edit' && $section_id !== null) {
				$data_activity['id'] = $section_id;
			}

		// logger activity. Write message
			logger::$obj['activity']->log_message(
				'LOAD ' . strtoupper($mode_to_activity), // string message
				logger::INFO, // int log_level
				$tipo, // string|null tipo_where
				null, // string|null operations
				$data_activity, // array|null data
				logged_user_id() // int
			);
	}//end log_activity



	/**
	* GET_ACTIVITY_METRIC
	* Returns aggregated activity data for the dashboard timeline graph covering
	* the requested date range.
	*
	* Called when the user selects a time range larger than the default 1-month
	* pre-loaded window. Delegates to area_common::get_activity_metric().
	*
	* Input constraints:
	* - area_tipo is required (string); returns error immediately if absent.
	* - range_days is clamped to [1, 365] — non-integer or < 1 values are reset
	*   to 30; values > 365 are capped at 365 to prevent runaway queries.
	*
	* Note: get_activity_metric is intentionally NOT listed in API_ACTIONS and
	* is therefore not reachable via the public JSON API dispatcher. It is called
	* from internal PHP code only.
	*
	* @param object $rqo
	*   $rqo->options->area_tipo   string — section tipo of the area to aggregate
	*   $rqo->options->range_days  int    — number of days back from today (default 30)
	* @return object $response
	*   $response->result  bool   — true on success
	*   $response->data    mixed  — aggregated metric data from area_common
	*/
	public static function get_activity_metric(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		$options		= $rqo->options ?? new stdClass();
		$area_tipo		= $options->area_tipo ?? null;
		$range_days		= $options->range_days ?? 30;

		if (empty($area_tipo) || !is_string($area_tipo)) {
			$response->msg = 'Error: area_tipo is required';
			$response->errors[] = 'empty area_tipo';
			return $response;
		}
		if (!is_int($range_days) || $range_days < 1) {
			$range_days = 30;
		}
		// Cap at 1 year to prevent unmanageable queries
		if ($range_days > 365) {
			$range_days = 365;
		}

		$data = area_common::get_activity_metric($area_tipo, $range_days);

		$response->result	= true;
		$response->msg		= 'OK';
		$response->data		= $data;

		return $response;
	}//end get_activity_metric



	/**
	* TEST
	* Lightweight endpoint for API connectivity and network latency tests.
	*
	* Returns the full environment payload alongside a simple boolean result so
	* callers can verify both that the API is reachable and that the environment
	* is correctly configured in one round trip.
	*
	* Listed in API_ACTIONS, so it is reachable without authentication (the
	* environment payload itself contains only public entity info when
	* not logged in — see get_page_globals() for the auth-conditional fields).
	*
	* @return object $response
	*   $response->result         bool   — always true on success
	*   $response->dedalo_entity  string — entity name from page_globals
	*   $response->environment    object — full get_environment() result
	*/
	public static function test() : object {

		// environment calculation
		$environment = dd_core_api::get_environment();

		$response = new stdClass();
			$response->result			= true;
			$response->dedalo_entity	= $environment->result->page_globals->dedalo_entity;
			$response->environment		= $environment->result;
			$response->msg				= 'OK. Test request done successfully';
			$response->errors			= [];


		return $response;
	}//end test



}//end dd_core_api
