<?php declare(strict_types=1);
/**
 * CLASS TOOL_COMMON
 *
 * Base class for all Dédalo tools.
 * It provides common functionality for tool initialization, configuration
 * management, context parsing, and registration logic.
 *
 * All specialized tools should extend this class to ensure consistency
 * across the application.
 *
 * Key features:
 * - Common tool structure and context creation
 * - Active tool registry management
 * - Tool configuration and permission handling
 * - Utility methods for file and data processing
 *
 * @package    Dédalo
 * @subpackage Tools
 */
class tool_common {



	/**
	* CLASS VARS
	*/
		/**
		 * Tool identifier name (same as class name).
		 * Set automatically from the called class name during instantiation.
		 * @var string $name
		 */
		public string $name;

		/**
		 * Tool configuration object loaded from register.json.
		 * Contains tool-specific settings, properties, and behavior definitions.
		 * @var ?object $config
		 */
		public ?object $config;

		/**
		 * Section tipo (ontology identifier) where the tool is being invoked.
		 * Defines the context section for tool operations.
		 * @var string $section_tipo
		 */
		public string $section_tipo;

		/**
		 * Section ID of the record being processed by the tool.
		 * Null when tool is invoked in list mode without specific record context.
		 * @var string|int|null $section_id
		 */
		public string|int|null $section_id;

		/**
		 * Static cache for all registered tools from the database.
		 * Stores the complete tools registry to avoid repeated DB queries.
		 * @var ?array $all_registered_tools_cache
		 */
		protected static $all_registered_tools_cache;

		/**
		 * Static cache for active tools database query result.
		 * Stores the raw db_result for active tools to avoid repeated filtering queries.
		 * @var db_result|false $active_tools_cache
		 */
		protected static $active_tools_cache;

		/**
		 * Static cache for individual tool configurations.
		 * Maps tool names to their parsed configuration objects.
		 * @var array $cache_config_tool
		 */
		protected static $cache_config_tool = [];

		/**
		 * Static cache for user-specific tool availability lists.
		 * Maps user IDs to their accessible tools based on permissions.
		 * @var array $user_tools_cache
		 */
		public static $user_tools_cache = [];



	/**
	* TOOL_DECLARES_AVAILABILITY
	* True when the tool class declares the optional availability hook:
	*
	*   public static function is_available(object $context) : bool
	*
	* Contract: `common::get_tools()` calls the hook with a context object
	* {caller_model, called_class, is_component, tipo, section_tipo, mode}
	* AFTER the affected_models/affected_tipos match; returning anything but
	* true excludes the tool for that element. Implementations must be fast
	* and side-effect-free (results are cached per user/tipo/section_tipo).
	* Lifecycle hooks like this one must NEVER be listed in API_ACTIONS.
	*
	* tool_common deliberately does NOT declare a default is_available, so
	* method_exists is true only for tools that opt in.
	*
	* @param string $tool_name Tool class name, e.g. 'tool_diffusion'
	* @return bool
	*/
	public static function tool_declares_availability(string $tool_name) : bool {

		static $memo = [];
		if (isset($memo[$tool_name])) {
			return $memo[$tool_name];
		}

		if (!class_exists($tool_name, false)) {
			$class_file = tool_paths::get_tool_class_file($tool_name);
			if ($class_file!==null && is_file($class_file)) {
				try {
					require_once $class_file;
				} catch (\Throwable $e) {
					// a tool class that cannot load declares nothing
					debug_log(__METHOD__
						. " Tool class failed to load: $tool_name " . $e->getMessage()
						, logger::WARNING
					);
				}
			}
		}

		return $memo[$tool_name] = (class_exists($tool_name, false) && method_exists($tool_name, 'is_available'));
	}//end tool_declares_availability



	/**
	* RESET_STATIC_CACHES
	* Clears all in-memory static caches of this class.
	* Called by `tools_register::invalidate_all_tool_caches()` so every
	* tool write path resets the full cache set in one place.
	* @return void
	*/
	public static function reset_static_caches() : void {
		self::$all_registered_tools_cache	= null;
		self::$active_tools_cache			= null;
		self::$cache_config_tool			= [];
		self::$user_tools_cache				= [];
	}//end reset_static_caches



	/**
	* __CONSTRUCT
	* @param string|int|null $section_id Section ID of the record being processed. Null in list mode.
	* @param string $section_tipo Section tipo (ontology identifier) where the tool is invoked
	* @return void
	*/
	public function __construct(string|int|null $section_id, string $section_tipo) {

		// set tool name as class name
		$this->name = get_called_class();

		// set
		$this->section_tipo	= $section_tipo;
		$this->section_id	= $section_id;
	}//end __construct



	/**
	* GET_JSON
	*
	* Gets tool context in JSON-compatible format.
	* This function preserves compatibility with Dédalo architecture
	* but is primarily used for structure context, not data.
	*
	* @param object|null $options Configuration options (get_context, get_data)
	* @return object JSON object containing the tool context
	*/
	public function get_json( ?object $options=null ) : object {

		// options
			$get_context	= $options->get_context ?? true;
			$get_data		= $options->get_data ?? false;

		// JSON object
			$json = new stdClass();
				if (true===$get_context) {
					$context_object	= $this->get_structure_context();
					$json->context	= [$context_object];
				}

		return $json;
	}//end get_json



	/**
	* GET_STRUCTURE_CONTEXT
	*
	* Parses and retrieves the full structural context of the tool.
	* This context is essential when tools are loaded in isolated environments (e.g., popups, time machine).
	* The data is derived from the 'Registered tools' section (dd1324) and the pre-parsed JSON structure
	* in component_json (dd1353).
	*
	* @return dd_object The complete Dédalo object representing the tool context
	* @throws Exception If the class name is strictly 'tool_common' (must be instantiated by a subclass)
	*/
	public function get_structure_context() : dd_object {

		// check valid name
			if ($this->name==='tool_common') {
				throw new Exception("Error. Tool name is wrong. Check your tool call using tool model", 1);
			}

		// tool name. Fixed on construct
			$name = $this->name;

			// tool_object
			// If is already resolved, get from cached file 'development_cache_tools_all_registered_tools.php'
			// else, fallback to 'tools_register::create_simple_tool_object' creation.
			$registered_tools = self::get_all_registered_tools();
			$tool_object = $registered_tools[$name] ?? tools_register::create_simple_tool_object( $this->section_tipo, $this->section_id );

			// sample tool object
				// {
				//   "name": "tool_transcription",
				//   "label": [
				// 	{
				// 	  "lang": "lg-cat",
				// 	  "value": "Transcripció"
				// 	}
				//   ],
				//   "labels": [
				// 	{
				// 	  "lang": "lg-spa",
				// 	  "name": "babel_transcriber",
				// 	  "value": "Babel"
				// 	}
				//   ],
				//   "version": "2.0.2",
				//   "ontology": null,
				//   "developer": [
				// 	{
				// 	  "lang": "lg-nolan",
				// 	  "value": [
				// 		"Dédalo team"
				// 	  ]
				// 	}
				//   ],
				//   "dd_version": "6.0.0",
				//   "properties": {
				// 	"open_as": "window",
				// 	"windowFeatures": null
				//   },
				//   "section_id": 26,
				//   "description": [
				// 	{
				// 	  "lang": "lg-cat",
				// 	  "value": [
				// 		"<p>Transcribir qualsevol tipus de media a text.</p>"
				// 	  ]
				// 	}
				//   ],
				//   "section_tipo": "dd1324",
				//   "always_active": false,
				//   "affected_tipos": null,
				//   "affected_models": [
				// 	"component_av",
				// 	"component_image",
				// 	"component_pdf"
				//   ],
				//   "show_in_component": true,
				//   "show_in_inspector": true,
				//   "requirement_translatable": false
				// }

			// tool_object check
			if (empty($tool_object)) {
				debug_log(__METHOD__
					. " Error. Invalid tool_object. Unable to continue !  " . PHP_EOL
					. ' name: '.to_string($name) .PHP_EOL
					// . ' component_tipo: '.to_string($component_tipo) .PHP_EOL
					. ' section_tipo: '.to_string($this->section_tipo) .PHP_EOL
					. ' section_id: '.to_string($this->section_id) .PHP_EOL
					. ' tool name: '.to_string($name) .PHP_EOL
					. ' tool_object: ' .json_encode($tool_object)
					, logger::ERROR
				);
			}

		// label. (JSON list) Try match current lang else use the first lang value
			$ar_labels = $tool_object->label ?? [];
			$tool_label_object = array_find($ar_labels, function($el){
				return $el->lang===DEDALO_APPLICATION_LANG;
			});
			$tool_label = is_object($tool_label_object) && isset($tool_label_object->value)
				? $tool_label_object->value
				: (is_object($ar_labels[0])
					? ($ar_labels[0]->value ?? null)
					: null);
			if (!is_string($tool_label)) {
				debug_log(__METHOD__
					. " Fixed invalid tool label " . PHP_EOL
					. ' tool_label: ' . to_string($tool_label) . PHP_EOL
					. ' tool_object: ' . to_string($tool_object) . PHP_EOL
					. ' name: ' . to_string($name) . PHP_EOL
					.' ar_labels: ' . to_string($ar_labels)
					, logger::ERROR
				);
				$tool_label = $name;
			}

		// developer
			$developer = $tool_object->developer;

		// description. (text_area) Try match current lang else use the first lang value
			$ar_description = $tool_object->description ?? [];
			$tool_description_object = array_find($ar_description, function($el){
				return $el->lang===DEDALO_APPLICATION_LANG;
			});
			$description = is_object($tool_description_object) && !empty($tool_description_object->value)
				? $tool_description_object->value
				: (isset($ar_description[0]->value)
					? $ar_description[0]->value
					: null);

		// labels. take care of empty objects like '{}' casting array on check.
			$labels = [];
			if(!empty((array)$tool_object->labels)) {

				// get the lang to be used to get the labels
					$current_lang = lang::get_label_lang( DEDALO_APPLICATION_LANG );

				// add label with lang fallback
				foreach ($tool_object->labels as $current_label_value) {

					$label_name = $current_label_value->name;
					if(!isset($labels[$label_name])) {

						$all_langs_label = array_filter((array)$tool_object->labels, function($el) use($label_name) {
							return $el->name===$label_name;
						});
						foreach ($all_langs_label as $item) {
							if (!isset($item->lang)) {
								// ignore
								debug_log(__METHOD__
									. " Ignored item without expected property 'lang'. Check this tool definition labels " . PHP_EOL
									. ' item: ' . to_string($item) .PHP_EOL
									. ' all_langs_label: ' . to_string($all_langs_label) .PHP_EOL
									. ' tool_object: ' . to_string($tool_object)
									, logger::ERROR
								);
							}

							if ($item->lang===$current_lang) {
								$labels[$label_name] = $item;
								continue 2;
							}
						}

						// fallback lang. Get the first one as fallback value setting as lang current lang
						$fallback_label = reset($all_langs_label);
						$fallback_label->lang = DEDALO_APPLICATION_LANG; // inject current lang to prevent find errors
						$labels[$label_name] = $fallback_label;
					}
				}

				// remove keys
				$labels = array_values($labels);
			}

		// properties
			$properties = empty($tool_object->properties)
				? null
				: $tool_object->properties; // object|array

		// config. Add if exists config data for current tool
			$ar_config		= tools_register::get_all_config_tool_client();
			$config_data	= $ar_config[$name] ?? null;
			// fallback to default config
			if(!is_array($config_data) || empty($config_data['config'])){
				$ar_config		= tools_register::get_all_default_config_tool_client();
				$config_data	= $ar_config[$name] ?? null;
			}
			// config
			$config = is_array($config_data)
				? $config_data['config']
				: null;

		// lang
			$lang = DEDALO_APPLICATION_LANG;

		// css. Multi-root aware: resolved per request (never stored in cache
		// files), so DEDALO_ADDITIONAL_TOOLS changes apply without staleness
			$tool_base_url = tool_paths::get_tool_url($name);
			$css = (object)[
				'url' => $tool_base_url . '/css/' .$name. '.css'
			];

		// icon
			$icon = $tool_base_url . '/img/icon.svg';

		// context
			$dd_object = new dd_object((object)[
				'name'				=> $name,
				'label'				=> $tool_label,
				'developer'			=> $developer,
				'tipo'				=> $tool_object->section_tipo ?? null,
				'section_tipo'		=> $tool_object->section_tipo ?? 'Unknown',
				'model'				=> $name,
				'lang'				=> $lang,
				'mode'				=> 'edit',
				'properties'		=> $properties,
				'css'				=> $css,
				'icon'				=> $icon,
				'labels'			=> $labels,
				'description'		=> $description,
				'show_in_inspector'	=> $tool_object->show_in_inspector ?? null,
				'show_in_component'	=> $tool_object->show_in_component ?? null,
				'config'			=> $config
			]);


		return $dd_object;
	}//end get_structure_context



	/**
	* CREATE_TOOL_SIMPLE_CONTEXT
	*
	* Generates a lightweight tool context object from a simple_tool_object definition.
	* This is used to build the tool's representation in lists and menus without loading the full class.
	*
	* @param object $tool_object The simple_tool_object (usually from JSON component dd1353)
	* @param object|null $tool_config Optional tool configuration object (e.g., from properties)
	* @param string|null $tipo Component type identifier
	* @param string|null $section_tipo Section type identifier
	* @return dd_object The simplified tool context
	*/
	public static function create_tool_simple_context( object $tool_object, ?object $tool_config=null, ?string $tipo=null, ?string $section_tipo=null ) : dd_object {

		// old way. (!) Unification with context in progress..
			// label. (JSON list) Try match current lang else use the first lang value
				$ar_labels = $tool_object->label ?? [];
				$tool_label_object = array_find((array)$ar_labels, function($el){
					return $el->lang===DEDALO_APPLICATION_LANG;
				});
				$tool_label = is_object($tool_label_object) && isset($tool_label_object->value)
					? $tool_label_object->value
					: (is_object($ar_labels[0])
						? $ar_labels[0]->value ?? null
						: null);
				// fallback label to tool name
				if(empty($tool_label)) {
					$tool_label = $tool_object->name ?? 'Unknown';
				}

			// css. Multi-root aware (see tool_paths)
				$tool_base_url = tool_paths::get_tool_url($tool_object->name);
				$css = (object)[
					'url' => $tool_base_url . '/css/' .$tool_object->name. '.css'
				];

			// icon
				$icon = $tool_base_url . '/img/icon.svg';

			// developer
				$developer = isset($tool_object->developer[0])
					? ($tool_object->developer[0]->value[0] ?? null)
					: null;

			// context
				$tool_simple_context = new dd_object((object)[
					'name'				=> $tool_object->name,
					'label'				=> $tool_label,
					'developer'			=> $developer,
					// 'tipo'			=> $component_tipo,
					'section_tipo'		=> $tool_object->section_tipo,
					// 'section_id'		=> $tool_object->section_id,
					'model'				=> $tool_object->name,
					// 'lang'			=> $lang,
					'mode'				=> 'edit',
					'properties'		=> $tool_object->properties,
					'css'				=> $css,
					'icon'				=> $icon,
					// 'labels'			=> $labels,
					// 'description'	=> $description,
					'show_in_inspector'	=> $tool_object->show_in_inspector ?? null,
					'show_in_component'	=> $tool_object->show_in_component ?? null,
					// 'config'			=> !empty($config_data) ? $config_data->config : null
				]);

		// new way. (!) Unification with context in progress..
			// // short vars
			// 	$section_id		= $tool_object->section_id;
			// 	$section_tipo	= $tool_object->section_tipo;
			// 	$model			= $tool_object->name;

			// // tool construct and get JSON context
			// 	$element = new $model($section_id, $section_tipo);
			// 	// element JSON
			// 	$get_json_options = new stdClass();
			// 		$get_json_options->get_context	= true;
			// 		$get_json_options->get_data		= false;
			// 	$element_json = $element->get_json($get_json_options);
			// 	$context = $element_json->context;

			// // tool_simple_context
			// 	$tool_simple_context = $context;
			// 		// dump($tool_simple_context, ' ++ ============================== tool_simple_context ++ '.to_string($section_tipo.'-'.$section_id));
			// 		// dump($context, ' ++ ============================== context ++ '.to_string($section_tipo.'-'.$section_id));


		// tool_config add
			if (!empty($tool_config)) {
				// parse and resolve ddo_map self
					if (isset($tool_config->ddo_map)) {
						$tool_config->ddo_map = array_map(function($el) use($tipo, $section_tipo, $tool_config){

							if (!is_object($el)) {
								debug_log(__METHOD__
									. " Error. Bad ddo_map item" . PHP_EOL
									. ' el: ' . to_string($el) . PHP_EOL
									. ' tool_config->ddo_map: ' . to_string($tool_config->ddo_map)
									, logger::ERROR
								);
							}

							if ($el->tipo==='self') {
								$el->tipo = $tipo;
							}
							if ($el->section_tipo==='self') {
								$el->section_tipo = $section_tipo;
							}
							if (!isset($el->model)) {
								$el->model = ontology_node::get_model_by_tipo($el->tipo,true);
							}
							// check if the component is translatable and set to true or false
							$el->translatable = ontology_node::get_translatable($el->tipo);

							$el->label = ontology_node::get_term_by_tipo($el->tipo, DEDALO_APPLICATION_LANG, true, true);

							return $el;
						}, $tool_config->ddo_map);
					}

				// set parsed tool_config
					$tool_simple_context->tool_config = $tool_config;
			}//end if (!empty($tool_config))


		return $tool_simple_context;
	}//end create_tool_simple_context



	/**
	* GET_STRUCTURE_CONTEXT_SIMPLE
	* Alias of $this->get_structure_context method for compatibility.
	* @param int $permissions = 0 User permissions level for the tool
	* @param bool $add_request_config = false Whether to append request_config to the context
	* @return dd_object The complete Dédalo object representing the tool context
	*/
	public function get_structure_context_simple(int $permissions=0, bool $add_request_config=false) : dd_object {

		// call general method
		$full_ddo = $this->get_structure_context();


		return $full_ddo;
	}//end get_structure_context_simple



	/**
	* GET_ALL_REGISTERED_TOOLS_CACHE_NAME
	* Returns the filename used for file-based caching.
	* @return string The cache filename
	*/
	public static function get_all_registered_tools_cache_name() : string {
		return DEDALO_ENTITY . '_cache_tools_all_registered_tools.php';
	}



	/**
	* GET_ALL_REGISTERED_TOOLS
	*
	* Retrieves the full list of tools registered in the database.
	* This method constructs a simplified tool object for each registered tool,
	* including its name, label, and client configuration.
	*
	* @return array $registered_tools - List of simple_tool_objects
	*/
	public static function get_all_registered_tools() : array {

		$registered_tools = [];

		// cache
		// Enabled for performance in hydrate_tools_info and user_tools lookups.
		$use_cache = true;
		if ($use_cache===true) {
			// static cache
			if (isset(self::$all_registered_tools_cache)) {
				return self::$all_registered_tools_cache;
			}
			// file cache.
			// Note: an empty array is treated as a read MISS on purpose. This shared
			// entity-level cache is never legitimately empty on an installed system
			// (a real install always has registered tools), so honoring a cached []
			// would make a transiently-poisoned [] file (e.g. written during a failed
			// search or mid-import) a sticky "no tools" state. Read-miss + the write
			// guard below make any empty file self-heal on the next request.
			$all_registered_tools = dd_cache::cache_from_file((object)[
				'file_name'	=> self::get_all_registered_tools_cache_name(),
				'prefix' => ''
			]);
			if (!empty($all_registered_tools)) {
				// store in static cache for subsequent calls in this request
				self::$all_registered_tools_cache = $all_registered_tools;
				return $all_registered_tools;
			}
		}

		// active tools records (db_result)
		$db_result = tool_common::get_active_tools();

		// get the simple_tool_object
		if($db_result) {

			// get all tools config sections
			$ar_config = tools_register::get_all_config_tool_client();

			foreach ($db_result as $record) {

				$section_record = section_record::get_instance($record->section_tipo, (int)$record->section_id);
				$section_record->set_data( $record );

				// simple tool object 'dd1353'. Created on the fly.
				$current_simple_tool_object = tools_register::create_simple_tool_object($record->section_tipo, $record->section_id);

				// append config
				$current_config	= $ar_config[$current_simple_tool_object->name] ?? null;

				if(!is_array($current_config)){
					$default_config	= tools_register::get_all_default_config_tool_client();
					$current_config	= $default_config[$current_simple_tool_object->name] ?? null;
				}

				if(!is_array($current_config)){
					debug_log(__METHOD__
						. " Ignored bad config " . PHP_EOL
						. to_string($current_config)
						, logger::ERROR
					);
					continue;
				}

				$current_simple_tool_object->config = is_array($current_config)
					? $current_config['config']
					: null;

				// append tool object
				$registered_tools[$current_simple_tool_object->name] = $current_simple_tool_object;
			}//end foreach ($db_result as $record)
		}

		// cache
		if ($use_cache===true) {
			// static (always, for request consistency)
			self::$all_registered_tools_cache = $registered_tools;
			// file cache.
			// Fix C: never persist a failure/empty state. Writing only when the
			// search succeeded ($db_result !== false) AND produced tools prevents
			// poisoning this shared file with [] on a failed search or transient
			// empty compute. A genuinely empty result (fresh, pre-import install)
			// simply recomputes per request — one cheap indexed search — until
			// import_tools runs and clean_cache() lets the real list be cached.
			if ($db_result !== false && !empty($registered_tools)) {
				dd_cache::cache_to_file((object)[
					'file_name' => self::get_all_registered_tools_cache_name(),
					'prefix' => '',
					'data' => $registered_tools
				]);
			}
		}


		return $registered_tools;
	}//end get_all_registered_tools



	/**
	* GET_ACTIVE_TOOLS
	* Search all active tools in registered tools section
	* @param bool $use_cache = true Whether to use static cache for the query result
	* @return db_result|false Database result containing active tools, or false on failure
	*/
	public static function get_active_tools( bool $use_cache=true ) : db_result|false {

		// cache
			if ($use_cache===true) {
				if(isset(self::$active_tools_cache)) {
					return self::$active_tools_cache;
				}
			}

		// get all active and registered tools
			$sqo_data = (object)[
				'select' => [
					(object)['column' => 'section_id'],
					(object)['column' => 'section_tipo']
				],
				'section_tipo' => [DEDALO_REGISTER_TOOLS_SECTION_TIPO],
				'limit' => 0,
				'offset' => 0,
				'filter' => (object)[
					'$and' => [
						(object)[
							'q' => (object)[
								'section_id' => '1',
								'section_tipo' => 'dd64',
								'type' => 'dd151',
								'from_component_tipo' => tool_ontology_map::ACTIVE
							],
							'q_operator' => null,
							'path' => [
								(object)[
									'section_tipo' => DEDALO_REGISTER_TOOLS_SECTION_TIPO,
									'component_tipo' => tool_ontology_map::ACTIVE,
									'model' => 'component_radio_button',
									'name' => 'Active'
								]
							]
						]
					]
				],
				'full_count' => false
			];
			$sqo = new search_query_object($sqo_data);

		// search
			$search	= search::get_instance($sqo);
			$db_result = $search->search();

		// cache
			if ($use_cache===true) {
				// static
				self::$active_tools_cache = $db_result;
			}


		return $db_result;
	}//end get_active_tools



	/**
	* GET_ACTIVE_TOOL_NAMES
	* Get active tools in tool section and return only the names as: ["tool_lang", "tool_time_machine"]
	* Used in update code to get the tool list from the master
	* @return array $tool_names
	*/
	public static function get_active_tool_names() : array {

		$active_tools = tool_common::get_active_tools();

		$tool_names = [];
		foreach ($active_tools as $current_tool_row) {

			$section_tipo	= $current_tool_row->section_tipo;
			$section_id		= $current_tool_row->section_id;

			// name
			// create the component to get his value
			$component_tipo	= tools_register::$tipo_tool_name; // 'dd1326';
			$model			= ontology_node::get_model_by_tipo($component_tipo,true);
			$component		= component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);

			// get value as 'tool_lang'
			$name = $component->get_value();

			// check it, if nothing isset continue to next one.
			if( empty($name) ){
				continue;
			}

			$tool_names[] = $name;
		}


		return $tool_names;
	}//end get_active_tool_names



	/**
	* GET_CONFIG
	* Get given tool config if isset
	* @param string $tool_name The name of the tool (same as class name)
	* @return array|null The tool configuration array, or null if not found
	*/
	public static function get_config(string $tool_name) : ?array {

		// debug
			if(SHOW_DEBUG===true) {
				$start_time=start_time();
				// metrics
				metrics::$get_tool_config_total_calls++;
			}

		// cache
			if( isset(self::$cache_config_tool[$tool_name]) ){
				return self::$cache_config_tool[$tool_name];
			}

		// get all tools config sections
			$ar_config = tools_register::get_all_config();

		// select current from all tool config
			$config = $ar_config[$tool_name] ?? null;

			if(!is_array($config)){
				// get all tools config sections
				$ar_config = tools_register::get_all_default_config();
				$config = $ar_config[$tool_name] ?? null;

				// no config is found at all
				if(!is_array($config)){
					//cache
					self::$cache_config_tool[$tool_name] = null;

					return null;
				}
			}

		// cache. save the result into the cache
			self::$cache_config_tool[$tool_name] = $config;

		// debug
			if(SHOW_DEBUG===true) {
				// metrics
				$total_time_ms = exec_time_unit($start_time, 'ms');
				metrics::$get_tool_config_total_time += $total_time_ms;
			}


		return $config;
	}//end get_config



	/**
	* GET_CONFIG_VALUE
	* Resolves a single tool config key with per-key precedence:
	*   1. user/install config record (section dd996)
	*   2. registry default config (section dd1324, default configuration)
	*   3. given $default
	* Unlike get_config(), which falls back wholesale (the dd996 array wins
	* as a whole when the record exists), this method resolves PER KEY, so a
	* dd996 record that sets only one key inherits the rest from defaults.
	* Property objects are unwrapped to their `value` when present.
	* @param string $tool_name The name of the tool (same as class name)
	* @param string $key The config property key
	* @param mixed $default Fallback value when the key is not defined anywhere
	* @return mixed
	*/
	public static function get_config_value(string $tool_name, string $key, mixed $default=null) : mixed {

		$resolve = function(?array $config_item) use ($key) : mixed {
			$config = $config_item['config'] ?? null;
			if (is_object($config)) {
				$config = (array)$config;
			}
			if (!is_array($config) || !array_key_exists($key, $config)) {
				return null;
			}
			$prop = $config[$key];

			return is_object($prop)
				? ($prop->value ?? $prop)
				: $prop;
		};

		// 1. user/install config (dd996)
			$user_value = $resolve( tools_register::get_all_config()[$tool_name] ?? null );
			if ($user_value !== null) {
				return $user_value;
			}

		// 2. registry default config (dd1324)
			$default_value = $resolve( tools_register::get_all_default_config()[$tool_name] ?? null );
			if ($default_value !== null) {
				return $default_value;
			}

		// 3. fallback
		return $default;
	}//end get_config_value



	/**
	* READ_FILES
	*
	* Reads files from a directory and returns an array of filenames,
	* filtered by the specified valid extensions.
	*
	* @param string $dir The directory path to scan
	* @param array $valid_extensions List of allowed file extensions (lowercase)
	* @return array List of matching filenames
	*/
	public static function read_files(string $dir, array $valid_extensions=['csv']) : array {

		$ar_data = [];

		// scan directory
			try {
				$root = is_dir($dir)
					? scandir($dir)
					: null;
			} catch (Exception $e) {
				debug_log(__METHOD__
					." Error on read dir: ".to_string($dir)
					, logger::ERROR
				);
			}

		// error on read the dir or empty result
			if (!$root) {
				return $ar_data; // empty array
			}

		// sort files in natural order
			natsort($root);

		// iterate and get only files. Skip others
			foreach($root as $value) {

				// Skip non valid extensions
					$file_parts = pathinfo($value);
					if(!isset($file_parts['extension']) || !in_array(strtolower($file_parts['extension']), $valid_extensions)) {
						debug_log(__METHOD__." Skipped file: $dir/$value ".json_encode($valid_extensions), logger::DEBUG);
						continue;
					}

				// Case file
					if(is_file("$dir/$value")) {
						$ar_data[] = $value;
					}

				// Case dir recursive ($recursive=true)
					// if($recursive) foreach(self::find_all_files("$dir/$value", $recursive) as $value) {
					// 	$ar_data[] = $value;
					// }
			}

		// SORT ARRAY (By custom core function build_sorter)
			// usort($ar_data, build_sorter('numero_recurso'));


		return $ar_data;
	}//end read_files



	/**
	* READ_CSV_FILE_AS_ARRAY
	*
	* Reads a CSV file and converts it into a multi-dimensional array.
	* Handles BOM removal for UTF-8 files and attempts encoding conversion
	* for non-UTF-8 files.
	*
	* @param string $file Absolute path to the CSV file
	* @param bool $skip_header Whether to skip the first row
	* @param string $csv_delimiter Character used as field delimiter
	* @param string $enclosure Character used as field enclosure
	* @param string $escape Character used for escaping
	*
	* @return array The CSV data as an array. Returns empty array if file is missing.
	*/
	public static function read_csv_file_as_array(string $file, bool $skip_header=false, string $csv_delimiter=';', string $enclosure='"', string $escape='"') : array {

		// file not found case
			if(!file_exists($file)) {
				debug_log(__METHOD__
					." File not found " . PHP_EOL
					.' file: '.to_string($file)
					, logger::ERROR
				);
				return [];
			}

		// auto_detect_line_endings
			$is_php81 = (version_compare(PHP_VERSION, '8.1.0') >= 0);
			if (!$is_php81) {
				ini_set('auto_detect_line_endings', true);
			}

		// open file in read mode
			$f = fopen($file, "r");
			// TOOLS-06: fopen can fail (missing file, permissions, TOCTOU). Bail out
			// cleanly instead of passing false to fgetcsv() (a TypeError/fatal).
			if ($f === false) {
				debug_log(__METHOD__ . ' Could not open CSV file for reading: ' . $file, logger::ERROR);
				return [];
			}

		// read contents line by line and store data
			$csv_array			= array();
			$convert_to_utf8	= false;
			$bom				= pack('H*','EFBBBF');
			$i=0;
			while (($line = fgetcsv($f, 0, $csv_delimiter, $enclosure, $escape)) !== false) {

				// skip header case
					if ($skip_header && $i===0) {
						$i++;
						continue;
					}

				// safe array type
					if (!is_array($line)) {
						$line = [$line];
					}

				// encoding check . Only UFT-8 is valid. Another encodings will be converted to UTF-8
					// $sample = reset($line);
					$sample = is_array($line) ? implode(', ', $line) : (string)$line;
					if ($convert_to_utf8===true || !mb_check_encoding($sample, 'UTF-8')) {
						foreach ($line as $key => $current_value) {
							// $line[$key] = utf8_encode($current_value);
							// replacement for PHP8.2 (https://php.watch/versions/8.2/utf8_encode-utf8_decode-deprecated)
							// $line[$key] = mb_convert_encoding($current_value, 'UTF-8', 'ISO-8859-1'); // ISO-8859-1 to UTF-8
							$line[$key] = mb_convert_encoding($current_value, 'UTF-8', mb_list_encodings()); // Any encoding to UTF-8
						}
						$convert_to_utf8 = true; // prevent to check more than once
					}

				// iterate line cells (columns from split text line by $csv_delimiter)
					foreach ($line as $cell) {
						// remove BOM in the first line when is set.
						$cell_clean = $i===0
							? preg_replace("/^$bom/", '', $cell)
							: $cell;

						$csv_array[$i][] = trim($cell_clean);
					}

				$i++;
			}//end while

		// close file a end
			fclose($f);

		// auto_detect_line_endings
			if (!$is_php81) {
				ini_set('auto_detect_line_endings', false);
			}


		return $csv_array;
	}//end read_csv_file_as_array



	/**
	* CALL_COMPONENT_METHOD (NOT USED AT THE MOMENT)
	* Call component method
	* @param object $options Options containing tipo, section_id, section_tipo, method, method_arguments
	* @return object Response object with result and msg properties
	* @throws Exception If the request cannot be processed
	*/
	public static function call_component_method(object $options) : object {

		// Working here... (!)
		throw new Exception("Error Processing Request", 1);

		// $response = new stdClass();
		// 	$response->result	= false;
		// 	$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// // options
		// 	$tipo				= $options->tipo ?? null;
		// 	$section_id			= $options->section_id ?? null;
		// 	$section_tipo		= $options->section_tipo ?? null;
		// 	$method				= $options->method ?? null;
		// 	$method_arguments	= $options->method_arguments ?? null;

		// // component
		// 	$model		= ontology_node::get_model_by_tipo($tipo,true);
		// 	$component	= component_common::get_instance(
		// 		$model,
		// 		$tipo,
		// 		$section_id,
		// 		'list',
		// 		DEDALO_DATA_NOLAN,
		// 		$section_tipo
		// 	);
		// 	if (!empty($method) && method_exists($component, $method)) {

		// 		// call component
		// 			$call_result = $component->{$method}($method_arguments);

		// 		// response
		// 			$response->result = isset($call_result->result)
		// 				? $call_result->result
		// 				: $call_result;
		// 			$response->msg = isset($call_result->msg)
		// 				? $call_result->msg
		// 				: 'Request done ['.__FUNCTION__.']';

		// 	}else{

		// 		// response error
		// 			$response->result	= false;
		// 			$response->msg		.= '. Method does not exists: '.$method .' in '.$model;
		// 	}


		// return $response;
	}//end call_component_method



	/**
	* GET_USER_TOOLS
	* Get filtered user authorized tools
	* Filtered by profiles security_tools data (DEDALO_COMPONENT_SECURITY_TOOLS_PROFILES_TIPO)
	*
	* Logic:
	* 1. Check Static Cache (InMemory)
	* 2. Check File Cache (Persistent). Uses user-specific prefix to strictly isolate user data.
	* 3. Logic:
	*    - Superuser: All registered tools
	*    - Normal User:
	*      - Tools flagged as 'always_active'
	*      - Tools explicitly assigned in user profile
	* 4. Resolve Configuration:
	*    - Appends 'tool_config' property to each tool object
	* 5. Save Cache (if calculated)
	*
	* Sample:
	* $user_tools = tool_common::get_user_tools($user_id);
	* foreach ($user_tools as $tool) {
	*    print $tool->name;
	* }
	*
	* @param int $user_id
	* @return array $user_tools List of simple_tool_objects
	*/
	public static function get_user_tools(int $user_id) : array {

		// default value (empty array)
			$user_tools = [];

		// empty or zero user case
			if (empty($user_id)) {
				return $user_tools;
			}

		// cache key
			$cache_key = $user_id;

		// 1. Static Cache (InMemory)
			if (isset(self::$user_tools_cache[$cache_key])) {
				return self::$user_tools_cache[$cache_key];
			}

		// 2. File Cache (Persistent)
			$use_file_cache = true;
			if ($use_file_cache===true) {

				$cache_file_name = tools_register::get_cache_user_tools_file_name(); // 'cache_user_tools.php'

				// Critical: Use specific prefix for the target user_id to avoid cache poisoning
				// when an admin views another user's tools, or when switching users.
				// Default prefix uses logged_user_id(), which might not match $user_id.
				$cache_prefix = DEDALO_ENTITY . '_' . $user_id . '_';

				$file_cache = dd_cache::cache_from_file((object)[
					'file_name'	=> $cache_file_name,
					'prefix'    => $cache_prefix
				]);
				if (!empty($file_cache)) {
					// read from file data
					$user_tools = $file_cache;

					// static cache update
					self::$user_tools_cache[$cache_key] = $user_tools;

					return $user_tools;
				}
			}

		// 3. Logic: Calculate tools

			// all unfiltered tools
				$registered_tools = tool_common::get_all_registered_tools();

			// filter process
				if ($user_id==DEDALO_SUPERUSER) {
					// Superuser has all tools
					$user_tools = $registered_tools;

				}else{

					// tool permissions (DEDALO_COMPONENT_SECURITY_TOOLS_PROFILES_TIPO)
						$security_tools_data = [];
						$user_profile = security::get_user_profile($user_id);

						if (!empty($user_profile)) {
							$user_profile_id = (int)$user_profile->section_id;

							// Get allowed tool IDs from security profile
							$security_tools_model	= ontology_node::get_model_by_tipo(DEDALO_COMPONENT_SECURITY_TOOLS_PROFILES_TIPO, true);
							$component				= component_common::get_instance(
								$security_tools_model,
								DEDALO_COMPONENT_SECURITY_TOOLS_PROFILES_TIPO,
								$user_profile_id,
								'list',
								DEDALO_DATA_NOLAN,
								DEDALO_SECTION_PROFILES_TIPO
							);
							// data
							$security_tools_data = $component->get_data();
						}

					// Optimization: Create a lookup map for faster checking O(1)
					// instead of linear search in_array O(N)
						$allowed_ids_map = [];
						if(is_array($security_tools_data)) {
							foreach($security_tools_data as $el) {
								if(isset($el->section_id)) {
									$allowed_ids_map[$el->section_id] = true;
								}
							}
						}

					// filter user authorized tools
						foreach ($registered_tools as $tool) {
							// Tool is active if "always_active" flag is true OR if it's in the allowed list
							$is_always_active = (isset($tool->always_active) && $tool->always_active===true);

							if ($is_always_active || isset($allowed_ids_map[$tool->section_id])) {
								$user_tools[] = $tool;
							}
						}
				}

		// 4. Resolve Configuration
		// Add resolved tool_config property to cached file
		// Will be used later to get resolved user tools config from cache
		// for example in get_structure_context or get_buttons_context
			foreach ($user_tools as $idx => $tool) {
				// Clone to avoid mutating the shared all_registered_tools_cache objects by reference.
				// The clone must be written back into the array; assigning only to the loop
				// variable would silently drop the resolved tool_config.
				$cloned_tool = clone $tool;
				$cloned_tool->tool_config = tool_common::get_config($cloned_tool->name);
				$user_tools[$idx] = $cloned_tool;
			}

		// 5. Save Cache
			if ($use_file_cache===true) {

				// static cache (always, for request consistency)
				self::$user_tools_cache[$cache_key] = $user_tools;

				// cache file write.
				// Skip writing an empty list: the file reader treats [] as a miss
				// (to avoid sticky empty poisoning), so persisting [] would just be
				// rewritten every request. An empty resolution (user authorized for
				// zero tools, or registry not yet built) recomputes cheaply — the
				// registry itself comes from the shared file cache.
				if (!empty($user_tools)) {
					dd_cache::cache_to_file((object)[
						'data'		=> $user_tools,
						'file_name'	=> $cache_file_name,
						'prefix'    => $cache_prefix // Same prefix as reading
					]);
				}
			}


		return $user_tools;
	}//end get_user_tools



	/**
	* GET_TOOL_CONFIGURATION
	* 	Get the specific tool config in registered tools or tool configuration
	*	when the tool has a specific properties in the register or in his configuration records
	*	overwrite the ontology properties with them
	*	flow of overwrite: the most specific overwrite the most generic
	*		configuration -> configuration register -> ontology
	*	1 if the configuration isset use it
	*	2 else get the configuration in register, if isset use it
	*	3 else get the ontology properties
	*
	* @param object $options Options object with properties:
	* {
	* 	tool_name: string as 'tool_lang'
	* 	tipo: string as 'dd47'
	* 	section_tipo: string as 'rsc167'
	* }
	* @param array|null $tool_config = null
	* 	Normally, is get from tools cache file, else will be calculated
	* @return object|null The matching tool configuration object, or null if not found
	*/
	public static function get_tool_configuration( object $options, ?array $tool_config=null ) : ?object {

		$tool_name		= $options->tool_name;
		$tipo			= $options->tipo;
		$section_tipo	= $options->section_tipo;

		// get the config, get_config check is the specific configuration isset
		// else get the configuration in register record
		$tool_configuration = $tool_config ?? tool_common::get_config($tool_name);

		// check if has a properties and tool_config definition
		if( isset($tool_configuration['config'])
			&& isset($tool_configuration['config']->properties)
			&& isset($tool_configuration['config']->properties->tool_config) ){
			// tool config is an array with specific object for tipo and section_tipo
			// (that need to match with the button_import definition and his section)
			// find the definition that match with current section
			$ar_tool_config = $tool_configuration['config']->properties->tool_config ?? [];

			$tool_config = array_find($ar_tool_config, function($item) use($section_tipo, $tipo) {
				return $item->section_tipo === $section_tipo && $item->tipo === $tipo;
			});

			return $tool_config;
		}


		return null;
	}//end get_tool_config



	/**
	* HYDRATE_TOOLS_INFO
	*
	* Enriches a list of tool references with additional metadata (name, activation status).
	* Typically used by security components (dd1353) rendered as 'view_tools'.
	*
	* @param array  $datalist Array of objects containing tool references ($item->value->section_id).
	* @param string $lang     Application language.
	* @return array The enriched list.
	*/
	public static function hydrate_tools_info( array $datalist, string $lang ) : array {

		if (empty($datalist)) {
			return $datalist;
		}

		// Use cache-enabled call to get all tool metadata O(N)
		// Metadata includes section_id, name, always_active, etc.
		$registered_tools = self::get_all_registered_tools();

		// Create a lookup map by section_id for O(1) access
		$tools_map = [];
		foreach ($registered_tools as $tool) {
			if (isset($tool->section_id)) {
				$tools_map[$tool->section_id] = $tool;
			}
		}

		// Enrich each item in the list
		foreach ($datalist as &$item) {

			// Extraction of section_id according to component_common::get_ar_list_of_values structure
			$section_id = $item->value->section_id ?? null;
			if (empty($section_id)) {
				continue;
			}

			$tool_info = $tools_map[$section_id] ?? null;

			if ($tool_info) {
				// Tool name (e.g., 'tool_lang')
				$item->tool_name     = $tool_info->name ?? '';
				// Activation status (always_active flag)
				$item->always_active = $tool_info->always_active ?? false;
			} else {
				// Fallback values for unknown or unregistered tools
				$item->tool_name     = 'Unknown';
				$item->always_active = false;
			}
		}

		return $datalist;
	}//end hydrate_tools_info


}//end class tool_common
