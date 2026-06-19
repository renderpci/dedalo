<?php declare(strict_types=1);
/**
 * CLASS TOOL_COMMON
 *
 * Base class for every Dédalo tool — the shared foundation that concrete tool
 * classes (tool_lang, tool_export, tool_print, …) extend.
 *
 * Responsibilities:
 * - Instantiate a tool with its section context ($section_tipo / $section_id).
 * - Build and return the tool's dd_object context (get_json / get_structure_context)
 *   which the browser JS uses to render the tool button, icon, labels, and config.
 * - Manage the three-layer static + file cache for the tool registry:
 *     all_registered_tools (entity-level) and user_tools (user-level).
 * - Resolve tool configuration with a two-tier fallback:
 *     user/install record (section dd996) → registry default (section dd1324).
 * - Provide utility helpers: read_files(), read_csv_file_as_array().
 *
 * Data shapes this class manages:
 * - simple_tool_object  — the parsed JSON stored in component_json dd1353,
 *   keyed by tool name in all_registered_tools_cache. Shape:
 *   { name, label, developer, version, ontology, properties, section_id,
 *     section_tipo, always_active, affected_tipos, affected_models,
 *     show_in_component, show_in_inspector, description }
 * - dd_object context   — a stdClass extending dd_object sent to the browser,
 *   produced by get_structure_context() / create_tool_simple_context().
 * - tool config array   — stored as ['config' => object] in dd996/dd1324.
 *
 * Relationships:
 * - Extended by every concrete tool class (tool_lang, tool_export, etc.).
 * - Delegates registry storage to tools_register.
 * - Uses tool_paths for multi-root filesystem/URL resolution (DEDALO_ADDITIONAL_TOOLS).
 * - Uses tool_ontology_map for tipo constants (dd1324 = registry, dd996 = config).
 * - Uses tool_security for API_ACTIONS enforcement (not directly here, see tool_security.php).
 * - Cache invalidation entry point: reset_static_caches() is called by
 *   tools_register::invalidate_all_tool_caches() after any registry write.
 *
 * @package    Dédalo
 * @subpackage Tools
 */
class tool_common {



	/**
	* CLASS VARS
	*/
		/**
		 * Tool identifier name — always identical to the concrete class name
		 * (e.g. 'tool_lang', 'tool_export'). Set via get_called_class() in __construct
		 * so subclasses get their own name automatically.
		 * @var string $name
		 */
		public string $name;

		/**
		 * Runtime configuration object for this tool instance, populated by
		 * concrete subclasses from their register.json or section dd996 record.
		 * May be null when the tool has no stored configuration.
		 * @var ?object $config
		 */
		public ?object $config;

		/**
		 * Ontology tipo of the section in whose context this tool operates
		 * (e.g. 'rsc167' for an interview section). Used when resolving the
		 * tool's simple_tool_object and when building ddo_map entries.
		 * @var string $section_tipo
		 */
		public string $section_tipo;

		/**
		 * Record ID within $section_tipo on which the tool is being invoked.
		 * Null when the tool is triggered from a list view (no single record context).
		 * The union type (string|int) reflects legacy numeric IDs arriving as strings
		 * from HTTP request parameters.
		 * @var string|int|null $section_id
		 */
		public string|int|null $section_id;

		/**
		 * Request-scoped cache for the complete registered-tools map.
		 * Shape: [ tool_name => simple_tool_object, … ]. Populated by
		 * get_all_registered_tools() from the entity-level file cache or
		 * from a live DB query when the file cache is absent/empty.
		 * Reset by reset_static_caches() on every registry write.
		 * @var ?array $all_registered_tools_cache
		 */
		protected static $all_registered_tools_cache;

		/**
		 * Request-scoped cache for the raw db_result returned by get_active_tools().
		 * Avoids re-running the active-tool SQO search for the same request.
		 * Reset by reset_static_caches() on registry writes.
		 * @var db_result|false $active_tools_cache
		 */
		protected static $active_tools_cache;

		/**
		 * Per-tool configuration cache for the current request.
		 * Shape: [ tool_name => ['config' => object|null] | null ].
		 * Populated lazily by get_config(); null entries mark a confirmed
		 * "no config found" result to prevent repeated look-ups.
		 * @var array $cache_config_tool
		 */
		protected static $cache_config_tool = [];

		/**
		 * Per-user tool list cache for the current request.
		 * Shape: [ user_id => simple_tool_object[] ].
		 * Declared public so the persistent-worker state-bleed audit
		 * can verify it is cleared between requests via reset_static_caches().
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
	* Initialises the tool with its invocation context.
	* get_called_class() is used instead of a hard-coded name so every
	* subclass (tool_lang, tool_export, …) gets its own class name without
	* overriding this constructor, which keeps the hierarchy shallow.
	* @param string|int|null $section_id Section ID of the record being processed. Null in list mode.
	* @param string $section_tipo Ontology tipo of the section where the tool is invoked (e.g. 'rsc167').
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
	* Returns the tool's JSON envelope in the standard Dédalo API shape:
	*   { context: [dd_object] }
	*
	* Follows the same contract as component_common::get_json() so the browser
	* JS can load a tool through the same pipeline as a component. Only the
	* context slice is currently produced here; the data slice ($get_data) is
	* declared for future expansion but is not populated by this base class.
	*
	* Note: $get_data defaults to false and is intentionally unused at this
	* level — tools carry their data through API_ACTIONS, not through this envelope.
	*
	* @param object|null $options Options object. Recognised keys:
	*   - get_context (bool, default true)  — include the context array
	*   - get_data    (bool, default false) — include data (currently no-op)
	* @return object stdClass with optional 'context' key.
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
	* Builds and returns the full dd_object context for this tool instance.
	*
	* The context is the authoritative description of the tool that the browser
	* receives: label, icon, CSS URL, properties, labels (multilingual UI strings),
	* description, inspector/component visibility flags, and config. It is used
	* when the tool is loaded in any isolated context (popup, time machine,
	* component inspector) where the full tool class may not yet be available.
	*
	* Resolution order for the simple_tool_object:
	*   1. all_registered_tools file/static cache (keyed by tool name) — fast path.
	*   2. tools_register::create_simple_tool_object() — on-the-fly fallback used
	*      during development or when the cache has not yet been built.
	*
	* Label resolution: iterates the lang-wrapped label array and selects the entry
	* matching DEDALO_APPLICATION_LANG; falls back to ar_labels[0] if no match.
	*
	* Config resolution: user/install config (dd996) wins; falls back to the
	* registry default config (dd1324). The resolved 'config' key is a plain
	* object ready for the browser.
	*
	* CSS/icon URLs are computed at request time via tool_paths::get_tool_url()
	* to support DEDALO_ADDITIONAL_TOOLS roots without stale cache entries.
	*
	* @return dd_object The complete Dédalo context object for this tool.
	* @throws Exception If $this->name is literally 'tool_common' (base class was
	*   instantiated directly instead of through a concrete subclass).
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

		// label — lang-wrapped array [{lang, value}, …]
		// Prefer the entry matching DEDALO_APPLICATION_LANG; fall back to
		// ar_labels[0] for installs where the current language has no translation.
		// If the resolved value is still not a string (e.g. null, array from a
		// malformed register.json), fall back to the tool's class name so the
		// browser always receives a usable string.
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

		// labels — multilingual UI-string map stored in component_json dd1372.
		// Shape on the simple_tool_object: flat array of {lang, name, value}.
		// The 'name' key acts as a logical label slot (e.g. 'babel_transcriber').
		// Multiple entries with the same name but different langs coexist in the array.
		// This block deduplicates by 'name', picking the entry for $current_lang,
		// or falling back to the first available translation when the current lang
		// has no entry. The (array) cast on $tool_object->labels guards against
		// register.json files where 'labels' was serialised as an empty JSON object
		// ('{}') rather than an empty array ('[]').
			$labels = [];
			if(!empty((array)$tool_object->labels)) {

				// get the lang to be used to get the labels
					$current_lang = lang::get_label_lang( DEDALO_APPLICATION_LANG );

				// add label with lang fallback
				foreach ($tool_object->labels as $current_label_value) {

					// Defensive: skip malformed/stale entries that are not label
					// objects (e.g. a lang-wrapped value from an outdated cache).
					// The canonical shape is a flat list of {lang,name,value}.
					if (!is_object($current_label_value) || !isset($current_label_value->name)) {
						continue;
					}

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

		// config — two-tier resolution for the browser-facing config object.
		// Tier 1: user/install config from section dd996 (get_all_config_tool_client).
		// Tier 2: factory default from section dd1324 (get_all_default_config_tool_client).
		// Only the inner 'config' key of the config_data array is sent to the browser;
		// the wrapping array also carries the tool name and other registry metadata.
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
	* Generates a lightweight dd_object context from a simple_tool_object, without
	* instantiating the concrete tool class. This is the path used by common::get_tools()
	* when populating tool buttons and menus for a component or section.
	*
	* Compared to get_structure_context() (which runs on an instantiated tool),
	* this static method skips: multilingual labels deduplication, description
	* resolution, and the full config two-tier look-up. Those fields are left out
	* (see the commented-out 'new way' block below) pending a planned unification.
	*
	* When $tool_config is provided and contains a ddo_map, every entry with
	* tipo==='self' or section_tipo==='self' is resolved to the supplied $tipo and
	* $section_tipo values. The model, translatable flag, and label for each ddo_map
	* entry are also resolved here so the browser JS does not need a round-trip.
	*
	* (!) The 'new way' block below (currently commented out) represents the planned
	* unification where context is generated by instantiating the tool and calling
	* get_json(). It is kept as reference for a future refactor.
	*
	* @param object $tool_object The simple_tool_object (from component_json dd1353).
	* @param object|null $tool_config Optional resolved tool_config object (e.g. from properties).
	*   When provided, its ddo_map entries are resolved against $tipo/$section_tipo.
	* @param string|null $tipo The invoking component tipo — used to resolve 'self' ddo_map entries.
	* @param string|null $section_tipo The invoking section tipo — used to resolve 'self' ddo_map entries.
	* @return dd_object The simplified tool context ready for browser consumption.
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
		// When a tool_config object is provided (e.g. from properties->tool_config in
		// the register record or the user config), resolve any ddo_map entries that use
		// the sentinel value 'self'. 'self' means "the component/section that triggered
		// this tool", so it must be replaced with the runtime $tipo/$section_tipo before
		// the context is sent to the browser JS, which cannot perform this substitution.
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
	* Thin compatibility alias for get_structure_context().
	* Older callers (and some generic rendering loops) call this signature
	* with $permissions / $add_request_config arguments matching the component
	* convention. Tool contexts do not vary by permission level or carry a
	* request_config at this layer, so both parameters are accepted but unused —
	* the full context is always returned. Kept to avoid breaking callers.
	* @param int $permissions [= 0] User permissions level (accepted but ignored at this layer).
	* @param bool $add_request_config [= false] Whether to append request_config (accepted but ignored).
	* @return dd_object The complete Dédalo context object for this tool.
	*/
	public function get_structure_context_simple(int $permissions=0, bool $add_request_config=false) : dd_object {

		// call general method
		$full_ddo = $this->get_structure_context();


		return $full_ddo;
	}//end get_structure_context_simple



	/**
	* GET_ALL_REGISTERED_TOOLS_CACHE_NAME
	* Returns the entity-scoped filename used for the shared file-based tool registry cache.
	* The DEDALO_ENTITY prefix ensures multi-entity installs do not share the same cache file.
	* The '.php' extension places the file under PHP include protection (the file begins
	* with a PHP die() guard written by dd_cache::cache_to_file).
	* @return string The cache filename (no directory component — dd_cache resolves the path).
	*/
	public static function get_all_registered_tools_cache_name() : string {
		return DEDALO_ENTITY . '_cache_tools_all_registered_tools.php';
	}



	/**
	* GET_ALL_REGISTERED_TOOLS
	* Returns the complete map of registered tools keyed by tool name.
	*
	* Shape: [ 'tool_lang' => simple_tool_object, 'tool_export' => simple_tool_object, … ]
	*
	* Cache layers (hit order):
	*   1. Static in-memory  — self::$all_registered_tools_cache  (per-request, fastest).
	*   2. File cache        — entity-level .php file written by dd_cache::cache_to_file.
	*      An empty array read from file is treated as a MISS (see note in code) so that
	*      a poisoned/transient empty file self-heals on the next request.
	*   3. Live DB query     — get_active_tools() SQO + create_simple_tool_object() per record.
	*      Results are written to static and file caches only when $db_result !== false
	*      and $registered_tools is non-empty (prevents persisting a failed search result).
	*
	* Config is merged into each simple_tool_object->config from:
	*   - tools_register::get_all_config_tool_client() (dd996 user config)
	*   - tools_register::get_all_default_config_tool_client() (dd1324 default)
	* Tools that have no valid config array at all are skipped (logged as ERROR).
	*
	* @return array Map of simple_tool_objects keyed by tool name; empty array when
	*   no tools are registered or the DB is unreachable.
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
	* Queries section dd1324 ('Registered Tools') for all records whose ACTIVE
	* radio-button component (tool_ontology_map::ACTIVE = 'dd1354') is set to
	* value '1' in section dd64 (the radio-button value section).
	*
	* Returns a raw db_result iterable over rows with {section_id, section_tipo}.
	* Callers typically pass each row to tools_register::create_simple_tool_object()
	* to build the full simple_tool_object.
	*
	* The result is stored in self::$active_tools_cache for the duration of the
	* request ($use_cache=false bypasses the cache for testing or forced refresh).
	*
	* @param bool $use_cache [= true] Whether to serve from / store in static cache.
	* @return db_result|false Iterable result of active tool rows, or false on search failure.
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
	* Returns the plain-text class-name list of all active registered tools,
	* e.g. ['tool_lang', 'tool_time_machine', 'tool_export'].
	*
	* Used by the update subsystem to compare the master's installed tool set
	* with a remote instance. Unlike get_all_registered_tools() (which returns
	* full objects), this method reads the tool name component (tool_ontology_map::TOOL_NAME
	* = dd1326) directly from each active record — bypassing the cache — so it
	* always reflects the live database state.
	*
	* @return array<string> Ordered list of active tool names; empty when none are active.
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
	* Returns the full configuration array for a tool, with a two-tier fallback:
	*   1. User/install config from section dd996 (tools_register::get_all_config).
	*   2. Factory default config from section dd1324 (tools_register::get_all_default_config).
	*
	* Fallback is wholesale: if a dd996 config array exists for the tool it is
	* returned as-is, even if it sets only some keys. For per-key inheritance
	* (where dd996 sets one key and the rest come from dd1324 defaults) use
	* get_config_value() instead.
	*
	* Shape of the returned array: ['config' => object, …] where 'config' is the
	* parsed JSON object from the tool's configuration component (dd999/dd1633).
	*
	* Results are cached in self::$cache_config_tool per tool per request.
	* A null cache entry records that no config was found, preventing repeated look-ups.
	*
	* @param string $tool_name Tool class name (e.g. 'tool_lang').
	* @return array|null Configuration array, or null when no config exists in either tier.
	*/
	public static function get_config(string $tool_name) : ?array {

		// debug
			if(SHOW_DEBUG===true) {
				$start_time=start_time();
				// metrics
				metrics::inc('get_tool_config_total_calls');
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
				metrics::add_time_ms('get_tool_config_total_time', $total_time_ms);
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
	* Returns the filenames inside $dir whose extension is in $valid_extensions.
	* Results are sorted in natural order (so 'file10.csv' sorts after 'file9.csv').
	* Directories and files with non-matching extensions are silently skipped
	* (DEBUG log entry written for each skipped file). Scandir errors are caught
	* and logged; an empty array is returned on any failure.
	* Note: recursive scanning is prepared in the commented-out block below but
	* is not currently activated.
	*
	* @param string $dir Absolute path to the directory to scan.
	* @param array $valid_extensions [= ['csv']] Lowercase extension strings to include.
	* @return array<string> Filenames (basename only, no directory prefix) in natural order.
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
	* Parses a CSV file into a two-dimensional array (rows × columns).
	*
	* Encoding handling:
	* - A UTF-8 BOM at the start of the first cell is stripped transparently.
	* - Non-UTF-8 input is detected via mb_check_encoding() on each row.
	*   When detected, mb_convert_encoding() with mb_list_encodings() is used to
	*   convert every cell; subsequent rows are converted without re-checking
	*   (the $convert_to_utf8 flag is latched true after the first detection).
	*
	* PHP 8.1 compatibility: auto_detect_line_endings (ini) was removed in PHP 8.1;
	* the ini_set calls are guarded by a version check and skipped on 8.1+.
	*
	* (!) fopen() is checked for false (TOCTOU / permission failure) before the
	* read loop to avoid passing false to fgetcsv() which would be a TypeError.
	*
	* @param string $file Absolute path to the CSV file.
	* @param bool $skip_header [= false] When true, the first row is skipped.
	* @param string $csv_delimiter [= ';'] Field separator character.
	* @param string $enclosure [= '"'] Field enclosure character.
	* @param string $escape [= '"'] Escape character within enclosed fields.
	* @return array<array<string>> Two-dimensional array of trimmed cell strings;
	*   empty array when the file is absent or cannot be opened.
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
	* Placeholder for a generic component-method dispatcher that would let tools
	* invoke arbitrary component methods through a unified API action.
	* The implementation is currently stubs out with an unconditional throw;
	* the commented-out body below shows the intended logic:
	*   instantiate the component via component_common::get_instance(),
	*   call $method($method_arguments), and return a {result, msg} response.
	*
	* (!) DO NOT call this method — it always throws. It is kept here so the
	* planned implementation has a home and the commented design is preserved.
	*
	* @param object $options Options object. Intended keys:
	*   tipo (string), section_id (string|int), section_tipo (string),
	*   method (string), method_arguments (mixed).
	* @return object stdClass with result and msg properties (never actually returns).
	* @throws Exception Always, with code 1 ("Error Processing Request").
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
	* Resolves the per-tipo/per-section tool configuration object from the tool's
	* configuration record, applying the precedence chain:
	*
	*   user/install config (dd996)  →  registry default (dd1324)  →  null
	*
	* The resolved config is expected to contain:
	*   config->properties->tool_config: array of {section_tipo, tipo, …} entries
	* This method finds the entry whose section_tipo and tipo match $options->section_tipo
	* and $options->tipo respectively, and returns it.
	*
	* When $tool_config is provided by the caller (e.g. from user_tools cache) it is
	* used directly, avoiding a redundant get_config() call. Pass null to force
	* resolution from get_config().
	*
	* Returns null when: no config exists, the config has no properties->tool_config,
	* or no entry in tool_config matches the given tipo+section_tipo pair.
	*
	* @param object $options Options with keys:
	*   - tool_name (string) — e.g. 'tool_lang'
	*   - tipo (string) — component tipo e.g. 'dd47'
	*   - section_tipo (string) — section tipo e.g. 'rsc167'
	* @param array|null $tool_config [= null] Pre-resolved config array ['config' => object, …].
	*   When null, get_config($tool_name) is called.
	* @return object|null The matching tool_config entry object, or null.
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
	}//end get_tool_configuration



	/**
	* HYDRATE_TOOLS_INFO
	* Enriches a relation-datalist (component_relation data) with tool metadata
	* (tool_name, always_active) by joining against the registered-tools map.
	*
	* Called by security components rendered in 'view_tools' mode — specifically
	* the component that lists which tools are assigned to a user profile (dd1067).
	* Each item in $datalist carries a value->section_id referencing a tool registry
	* record (section dd1324). This method resolves that section_id to the tool's
	* class name and always_active flag so the view can render them without another
	* DB query.
	*
	* The lookup uses a pre-built section_id→tool O(1) map over the cached
	* registered-tools list, making the total cost O(N registry) + O(M datalist).
	*
	* Note: $lang is accepted for interface uniformity with other hydrate helpers
	* but is not used here — tool names and always_active flags are not translated.
	*
	* @param array $datalist Array of relation-value objects; each is expected to have
	*   a value->section_id property pointing to a dd1324 record.
	* @param string $lang Application language code (accepted but unused in this method).
	* @return array The same array with tool_name (string) and always_active (bool)
	*   injected into each item. Items with no matching tool get 'Unknown'/false.
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
