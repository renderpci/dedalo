<?php declare(strict_types=1);
include_once 'trait.request_config_utils.php';
include_once 'trait.request_config_ddo.php';
include_once 'trait.request_config_v6.php';
include_once 'trait.request_config_v5.php';
/**
* COMMON (ABSTRACT CLASS)
* Shared methods by sections and components.
*
* This abstract class serves as a base for all section and component classes in the application.
* It defines shared functionality and reusable logic that is common across different components,
* such as data handling, validation, and permission checks.
*
* Sub-classes such as 'section' or 'component_common' extend this class, implementing or overriding
* specific methods to fulfill their specific behaviors.
*
* Note: This class is not meant to be instantiated directly.
*/
abstract class common {

	use request_config_utils, request_config_ddo, request_config_v6, request_config_v5;

	// Cache management constants
	const MAX_CACHE_SIZE = 1000;

	/**
	* MANAGE_CACHE_SIZE
	* Controls cache size to prevent memory leaks by limiting cache entries.
	* Keeps only the most recent entries when limit is exceeded.
	* @param array &$cache Reference to the cache array
	* @return void
	*/
	protected static function manage_cache_size(array &$cache) : void {
		if (count($cache) > self::MAX_CACHE_SIZE) {
			// Keep only the most recent entries
			$cache = array_slice($cache, -self::MAX_CACHE_SIZE, null, true);
		}
	}



	/**
	* CLASS VARS
	*/
		/**
		 * Ontology tipo (type identifier) of this element. Example: 'dd4525'.
		 * Unique code that identifies the element's definition in the ontology.
		 * @var ?string $tipo
		 */
		public ?string $tipo = null;

		/**
		 * Tipo of the section this element belongs to. Example: 'oh1'.
		 * Defines the parent section context for component instances.
		 * @var ?string $section_tipo
		 */
		public ?string $section_tipo = null;

		/**
		 * Identifier of the section record this element is bound to. Example: 1526.
		 * Can be a numeric ID, a temp string (e.g., 'temp1'), or null for new records.
		 * @var string|int|null $section_id
		 */
		public string|int|null $section_id = null;

		/**
		 * Mode of the element. Examples: 'edit', 'list', 'search', 'tm'.
		 * Determines which view and behavior are activated for the UI and the data format.
		 * Note that data in list mode is a reduction of the full data given in edit mode.
		 * @var ?string $mode
		 */
		public ?string $mode = null;

		/**
		 * Specific view variant combined with mode to drive element rendering.
		 * Allows multiple visual presentations for the same mode (e.g., 'mini', 'line').
		 * @var ?string $view
		 */
		public ?string $view = null;

		/**
		 * View variant for child elements nested under this element.
		 * Overrides the default rendering of grouped or related sub-elements.
		 * @var ?string $children_view
		 */
		public ?string $children_view = null;

		/**
		 * Component model (class name) of this element. Example: 'component_date'.
		 * Maps to the PHP class that implements the element's behavior.
		 * @var ?string $model
		 */
		public ?string $model = null;

		/**
		 * Language code for multilingual content. Example: 'lg-eng'.
		 * Uses 'lg-nolan' for non-translatable (language-neutral) values.
		 * @var ?string $lang
		 */
		public ?string $lang = null;

		/**
		 * Human-readable label for this element. Example: 'component_section_id'.
		 * Displayed in the UI as the field or section title.
		 * @var ?string $label
		 */
		public ?string $label = null;

		/**
		 * Legacy v6 raw data property. Not usable in v7.
		 * Always use get_data() and set_data() instead of accessing this directly.
		 * @var string $data
		 */
		private string $data = 'NO USABLE DATA';

		/**
		 * Ontology node object containing the full definition of this element.
		 * Loaded from the ontology and defines properties, relations, and behavior.
		 * @var ?object $ontology_node
		 */
		public ?object $ontology_node = null;

		/**
		 * Display order number for sorting elements within a section or group.
		 * Can be numeric or a string depending on the sorting scheme.
		 * @var string|int|float|null $order_number
		 */
		public string|int|float|null $order_number = null;

		/**
		 * Whether this element supports multilingual (translated) values.
		 * When true, the component stores separate values per language.
		 * @var ?bool $translatable
		 */
		public ?bool $translatable = null;

		/**
		 * User permission level for this element. Integer from 0 (none) to 3 (full).
		 * Controls read/write access in the UI and API.
		 * @var ?int $permissions
		 */
		public ?int $permissions = null;

		/**
		 * Pagination object for paginated lists (sections, portals, etc.).
		 * Holds offset, limit, and total count for dataset navigation.
		 * Used for relationable components like 'component_portal'
		 * @var ?object $pagination
		 */
		public ?object $pagination = null;

		/**
		 * Whether the element's structure data has already been loaded.
		 * Prevents redundant ontology lookups and re-processing.
		 * @var bool $bl_loaded_structure_data
		 */
		public bool $bl_loaded_structure_data = false;

		/**
		 * Context object describing the runtime environment of this element.
		 * Contains mode, view, permissions, and other rendering metadata.
		 * Cache-able because do not changes in each call.
		 * @var ?object $context
		 */
		public ?object $context = null;

		/**
		 * Parsed ontology properties object for this element.
		 * False when properties are explicitly absent; null when not yet loaded.
		 * @var object|false|null $properties
		 */
		public object|false|null $properties = null;

		/**
		 * Parent tipo used to link context DDO elements in nested structures.
		 * Establishes hierarchy relationships between components.
		 * @var ?string $from_parent
		 */
		public ?string $from_parent = null;

		/**
		 * Parent grouper tipo for grouping related elements in the UI.
		 * Links elements to their containing section_group or tab.
		 * @var ?string $parent_grouper
		 */
		public ?string $parent_grouper = null;

		/**
		 * Client-sent build options to customize data retrieval.
		 * Example: thesaurus models vs terms, portal external source update flags.
		 * @var ?object $build_options
		 */
		public ?object $build_options = null;

		/**
		 * Request configuration array defining show, select, and search for this element.
		 * Parsed from the ontology or client request to drive data loading.
		 * @var ?array $request_config
		 */
		public ?array $request_config = null;

		/**
		 * Static cache for resolved structure context objects.
		 * Avoids re-calculating context for elements with the same tipo and mode.
		 * @var array $cache_structure_context
		 */
		public static array $cache_structure_context = [];

		/**
		 * Static cache mapping section/component tipos to their matrix table names.
		 * Avoids repeated database lookups for storage table resolution.
		 * @var array $cache_matrix_table_from_tipo
		 */
		public static array $cache_matrix_table_from_tipo = [];

		/**
		 * Static cache for matrix tables that have relation columns.
		 * Used by diffusion and relation queries to target the correct tables.
		 * @var array $cache_tables_with_relations
		 */
		public static ?array $cache_tables_with_relations = null;

		/**
		 * Static cache for the current main language per section.
		 * Optimizes language resolution in multilingual contexts.
		 * @var array $current_main_lang
		 */
		public static array $current_main_lang = [];

		/**
		 * Static cache for model-related data lookups.
		 * Stores resolved information for components related by model.
		 * @var array $ar_related_by_model_data
		 */
		public static array $ar_related_by_model_data = [];

		/**
		 * Static cache for parsed request properties.
		 * Avoids re-parsing complex property expressions across requests.
		 * @var array $resolved_request_properties_parsed
		 */
		public static array $resolved_request_properties_parsed = [];

		/**
		 * Static cache for resolved tool definitions per element.
		 * Tools are expensive to calculate; this cache prevents recalculation.
		 * @var array $cache_get_tools
		 */
		public static array $cache_get_tools = [];

		/**
		 * Dataframe locator of the element that instantiated this one (component, section, area).
		 * Used for cross-referencing in dataframe and portal contexts.
		 * @var ?object $caller_dataframe
		 */
		public ?object $caller_dataframe = null;

		/**
		 * Source identifier for the data origin. 'tm' indicates time machine data.
		 * Distinguishes live data from historical or backup sources.
		 * @var ?string $data_source
		 */
		public ?string $data_source = null;

		/**
		 * Unique instance identifier for this element.
		 * Generated per instance to distinguish objects with identical tipo and section_id.
		 * @var ?string $uid
		 */
		public ?string $uid = null;

		/**
		 * Whether to include language version metadata in the output.
		 * When true, responses include all available language values.
		 * @var bool $with_lang_versions
		 */
		public bool $with_lang_versions = false;

		/**
		 * CLI process data object for background process messaging.
		 * Structure: { msg: string, property1: mixed, ... }.
		 * @var ?object $pdata
		 */
		public static ?object $pdata = null;

		/**
		 * Array of tool definitions attached to this element.
		 * If set, these tools are used directly instead of being recalculated from the ontology.
		 * @var ?array $tools
		 */
		public ?array $tools = null;

		/**
		 * Calculated buttons context for this element.
		 * Set to empty array in get_structure_context_simple mode to skip calculation.
		 * @var ?array $buttons_context
		 */
		public ?array $buttons_context = null;

		/**
		 * Name of the class that instantiated this element. Example: 'tool_export'.
		 * Used for tracing and conditional behavior based on the caller.
		 * @var ?string $caller
		 */
		public ?string $caller = null;

		/**
		 * Temporary model name mappings for legacy v5/v6 to v7 migration.
		 * Maps old component model names to their new equivalents.
		 * old model => new model
		 * @var array $ar_temp_map_models
		 */
		public static array $ar_temp_map_models = [
			'component_autocomplete_hi'	=> 'component_portal',
			'component_autocomplete'	=> 'component_portal',
			'section_group_div'			=> 'section_group',
			'component_calculation' 	=> 'component_info'
		];

		/**
		 * Temporary list of legacy models excluded from v7 processing.
		 * Models listed here are ignored during instantiation or migration.
		 * @var array $ar_temp_exclude_models
		 */
		public static array $ar_temp_exclude_models = [
			'component_security_areas',
			'component_autocomplete_ts',
			'component_html_file',
			'component_input_text_large',
			'component_ip',
			'component_layout',
			'component_relation_struct',
			'component_score',
			'component_security_tools',
			'component_state'
		];

		/**
		 * Registry of element types that act as UI groupers.
		 * Used to identify container elements (tabs, groups) for layout rendering.
		 * @var array $groupers
		 */
		public static array $groupers = [
			'section_group',
			'section_group_div',
			'section_tab',
			'tab'
		];

		/**
		* CLEAR
		* Purges persistent caches to prevent memory leaks across worker requests.
		*/
		public static function clear() : void {
			self::$cache_structure_context = [];
			self::$cache_matrix_table_from_tipo = [];
			self::$cache_tables_with_relations = null;
			self::$current_main_lang = [];
			self::$ar_related_by_model_data = [];
			self::$resolved_request_properties_parsed = [];
			self::$cache_get_tools = [];
			self::$pdata = null;
		}



	# ACCESSORS
	final public function __call(string $strFunction, array $arArguments) {

		if (is_callable(['diffusion_fn', $strFunction])) {
			// Forward the call: pass the instance as first argument,
			// then the original arguments (if any)
			return diffusion_fn::$strFunction($this, ...$arArguments);
		}

		$strMethodType		= substr($strFunction, 0, 4); # like set or get_
		$strMethodMember	= substr($strFunction, 4);
		switch($strMethodType) {
			case 'set_' :
				if(!isset($arArguments[0])) return(false);	#throw new Exception("Error Processing Request: called $strFunction without arguments", 1);
				return($this->SetAccessor($strMethodMember, $arArguments[0]));

			case 'get_' :
				return($this->GetAccessor($strMethodMember));
		}
		return(false);
	}
	# SET
	final protected function SetAccessor(string $strMember, $strNewValue) : bool {

		if(property_exists($this, $strMember)) {

			// fix value
			$this->$strMember = $strNewValue;

			return true;
		}else{
			return false;
		}
	}
	# GET
	final protected function GetAccessor(string $strMember) {

		return property_exists($this, $strMember)
			? $this->$strMember
			: false;
	}//end GetAccessor

	/**
	 * __GET
	 * Avoid to get undeclared properties
	 * @param string $name
	 * @throws Exception
	 * @return void
	 */
	public function __get(string $name) {
		if($name === 'data') {
			throw new Exception("Attempt to access undeclared property: $name");
		}
        // Or log it:
        // error_log("Access to undeclared property: $name");
        // return null;
    }

    /**
     * __SET
     * Avoid to set undeclared properties
     * @param string $name
     * @param mixed $value
     * @throws Exception
     * @return void
     */
	public function __set(string $name, mixed $value) {
		if($name === 'data') {
			throw new Exception("Attempt to set undeclared property: $name");
		}
	}


	/**
	* GET_PERMISSIONS
	* Do not use this method directly to resolve component permissions
	* @param string|null $parent_tipo = null
	* @param string|null $tipo = null
	* @return int $permissions
	*/
	public static function get_permissions( ?string $parent_tipo=null, ?string $tipo=null ) : int {

		// no logged case
			if(login::is_logged()!==true) {
				return 0;
			}

		// fixed read only cases
			if($parent_tipo === DEDALO_TIME_MACHINE_SECTION_TIPO) {
				return logged_user_is_global_admin() ? 1 : 0;
			}

		// check params
			if( empty($parent_tipo) ) {
				if(SHOW_DEBUG===true) {
					$bt = debug_backtrace();
					dump($bt[1], ' bt[1] ++ '.to_string());
				}
				debug_log(__METHOD__
					.' Error Processing Request (return 0). get_permissions: tipo is empty' . PHP_EOL
					.' parent_tipo: ' . to_string($parent_tipo)
					, logger::ERROR
				);
				return 0;
			}
			if( empty($tipo) ) {
				if(SHOW_DEBUG===true) {
					$bt = debug_backtrace();
					dump($bt[1], ' bt[1] ++ '.to_string());
				}
				debug_log(__METHOD__
					.' Error Processing Request (return 0). get_permissions: tipo is empty' . PHP_EOL
					.' tipo: ' .to_string($tipo)
					, logger::ERROR
				);
				return 0;
			}

		// get permissions looking in calculated permissions_table
			$permissions = security::get_security_permissions($parent_tipo, $tipo);


		return $permissions;
	}//end get_permissions



	/**
	* GET_MODEL
	* @return string $model
	* 	Is the self class name like 'component_autocomplete'
	*/
	public function get_model() : string {

		return get_called_class();
	}//end get_model



	/**
	* SET_PERMISSIONS
	* @param int $number
	*/
	public function set_permissions( int $number ) : void {

		$this->permissions = (int)$number;
	}//end set_permissions


	/**
	* LOAD STRUCTURE DATA
	* Get data once from Ontology (tipo, model, order_number, is_translatable, etc.)
	* @return bool
	*/
	protected function load_structure_data() : bool {

		// check mandatory property tipo
			if( empty($this->tipo) ) {
				// dump($this, " DUMP ELEMENT WITHOUT TIPO - THIS ");
				// throw new Exception("Error (3): tipo is mandatory!", 1);
				debug_log(__METHOD__."  Error: trying to load structure on element without tipo ! ". get_called_class(), logger::ERROR);
				return false;
			}

		if( !$this->bl_loaded_structure_data) {

			$this->ontology_node	= ontology_node::get_instance($this->tipo);

			// fix vars
				$this->model		= $this->ontology_node->get_model();
				$this->order_number	= $this->ontology_node->get_order_number();
				$this->label		= ontology_node::get_term_by_tipo($this->tipo,DEDALO_APPLICATION_LANG, true);

			// translatable
				$this->translatable	= $this->ontology_node->get_is_translatable();
				// If the element is not translatable, we set its 'lang' to 'lg-nolan' (DEDALO_DATA_NOLAN)
				if ($this->translatable===false) {
					$this->fix_language_nolan();
				}

			// properties : Always JSON decoded
				$properties = $this->ontology_node->get_properties();
				$this->properties = !empty($properties) ? $properties : false;

			// matrix_table
				// if(!isset($this->matrix_table))
				// $this->matrix_table = self::get_matrix_table_from_tipo($this->tipo);

			// bl_loaded_structure_data
				$this->bl_loaded_structure_data = true;
		}

		return true;
	}//end load_structure_data



	/**
	* GET_INFO
	* Returns a basic element information
	* @return object $info
	*/
	public function get_info() : object {
		return (object)[
			'section_tipo' 	=> $this->section_tipo ?? $this->tipo,
			'tipo' 			=> $this->tipo,
			'label' 		=> $this->label,
			'model' 		=> $this->model
		];
	}//end get_info



	/**
	* GET_DIFFUSION_DATA_INFO
	* Returns a basic element information for diffusion
	* formatted for diffusion data compatibility
	* @return array $diffusion_data_object
	*/
	public function get_diffusion_data_info() : array {

		// Default diffusion data object
		$diffusion_data_object = new diffusion_data_object( (object)[
			'tipo'	=> $this->tipo,
			'lang'	=> null,
			'value'	=> $this->get_info(),
			'id'	=> 'a'
		]);

		return [$diffusion_data_object];
	}//end get_diffusion_data_info




	/**
	* IS_TRANSLATABLE
	* @return bool
	*/
	public function is_translatable() : bool {

		$translatable = $this->translatable ?? false;

		return $translatable;
	}//end is_translatable



	/**
	* GET MATRIX_TABLE FROM TIPO
	* @param string $tipo
	* @return string|null $matrix_table
	*/
	public static function get_matrix_table_from_tipo(string $tipo) : ?string {

		$start_time=start_time();

		// check valid tipo
			if (empty($tipo)) {
				debug_log(__METHOD__
					." Error Processing Request. tipo is empty ".to_string($tipo)
					, logger::ERROR)
				;
				return null;
			}elseif ($tipo==='matrix') {
				debug_log(__METHOD__
					." Error Processing Request. tipo is invalid ".to_string($tipo)
					, logger::ERROR
				);
				return null;
			}

		// cache
			// Safe control: prevent big array memory and performance problems
			self::manage_cache_size(self::$cache_matrix_table_from_tipo);

			// check cache
			if(isset(self::$cache_matrix_table_from_tipo[$tipo])) {
				return self::$cache_matrix_table_from_tipo[$tipo];
			}

		// all case
			if ($tipo==='all') {
				return null;
			}

		// ONTOLOGY SECTIONS. Important exception. Introduced in v6.4
		// Ontology sections has a tipo with 0 in his own definition.
		// Sometimes this sections can be caller by other nodes of the ontology
		// but the section is not loaded (mistake or because is not used)
		// it happens with local definitions, to avoid the error
		// will return matrix_ontolog as table for all this sections.
			$section_id = get_section_id_from_tipo( $tipo );
			if( $section_id === '0' ){
				return 'matrix_ontology';
			}

		// model
			$model_name = ontology_node::get_model_by_tipo($tipo, true);
			// empty model case
			if (empty($model_name)) {
				$msg = "Current tipo ($tipo) model name is empty. Model is mandatory, check your model for tipo: '$tipo'";
				debug_log(__METHOD__
					. ' ' . $msg
					, logger::ERROR
				);
				if(SHOW_DEBUG===true) {
					$bt = debug_backtrace();
					dump($bt, ' bt ++ '.to_string());
				}
				return null;
			}
			// area model case
			if (str_starts_with($model_name, 'area') || $model_name==='menu' || $model_name==='section_tool') {
				return null;
			}
			// non section model case
			if ($model_name!=='section') {
				debug_log(__METHOD__
					. " Error. Don't use non section tipo to calculate matrix_table. Use always section_tipo". PHP_EOL
					. " tipo: $tipo " . PHP_EOL
					. " model: $model_name" . PHP_EOL
					. ' bt 0: ' . to_string( debug_backtrace()[0] ) . PHP_EOL
					. ' bt 1: ' . to_string( debug_backtrace()[1] ) . PHP_EOL
					// . ' bt all: ' . to_string( debug_backtrace() )
					, logger::ERROR
				);

				return null;
			}

		// section cases
			switch (true) {

				case ($tipo===DEDALO_SECTION_PROJECTS_TIPO):
					$matrix_table = 'matrix_projects';
					break;

				case ($tipo===DEDALO_SECTION_USERS_TIPO):
					$matrix_table = 'matrix_users';
					break;

				default:
					// try related. If section have TR of model name 'matrix_table' takes its matrix_table value
						$ar_related = common::get_ar_related_by_model('matrix_table', $tipo);
						if ( isset($ar_related[0]) ) {
							// real or virtual section
							$matrix_table = ontology_node::get_term_by_tipo($ar_related[0], DEDALO_STRUCTURE_LANG, true);
						}

					// try resolve virtual section fallback
						if ( empty($matrix_table) ) {
							// try real section
							$real_tipo = section::get_section_real_tipo_static($tipo);
							if ($real_tipo!==$tipo) {
								$ar_related	= common::get_ar_related_by_model('matrix_table', $real_tipo);
								if ( isset($ar_related[0]) ) {
									// real section
									$matrix_table = ontology_node::get_term_by_tipo($ar_related[0], DEDALO_STRUCTURE_LANG, true);
								}
							}
						}

					// fallback to default
						if (!isset($matrix_table)) {
							debug_log(__METHOD__
								. ' Using fallback to default table (matrix) in '.exec_time_unit($start_time, 'ms').'ms'. PHP_EOL
								. ' tipo: ' . to_string($tipo)
								, logger::WARNING
							);
							$matrix_table = 'matrix';
						}
			}//end switch

		// cache
			self::$cache_matrix_table_from_tipo[$tipo] = $matrix_table;


		return $matrix_table;
	}//end get_matrix_table_from_tipo



	/**
	* GET_MATRIX_TABLES_WITH_RELATIONS
	* Note: Currently tables are static. make a connection to db to do dynamic ASAP
	* @return array $ar_tables_with_relations
	*/
	public static function get_matrix_tables_with_relations() : array {

		// cache
			if (self::$cache_tables_with_relations !== null) {
				return self::$cache_tables_with_relations;
			}

		// tables
			$ar_tables_with_relations = [];
			$ar_children_tables = ontology_node::get_ar_children('dd627');
			foreach ($ar_children_tables as $table_tipo) {

				// model
				$model_name = ontology_node::get_model_by_tipo($table_tipo,true);
				if ($model_name!=='matrix_table') {
					debug_log(__METHOD__
						. " Ignored non matrix_table Ontology item "
						. ' tipo: ' . to_string($table_tipo)
						, logger::ERROR
					);
					continue;
				}

				// properties
				$ontology_node	= ontology_node::get_instance( $table_tipo );
				$properties		= $ontology_node->get_properties();
				if (isset($properties) && property_exists($properties,'inverse_relations')) {

					// table_name, such 'matrix_hierarchy'
					$table_name = ontology_node::get_term_by_tipo($table_tipo, DEDALO_STRUCTURE_LANG, true, false);

					if ($properties->inverse_relations===true) {

						// add table
						$ar_tables_with_relations[] = $table_name;

					}else if($table_name==='matrix_test' && (SHOW_DEBUG===true || DEVELOPMENT_SERVER===true)){

						// add table matrix_test only in development server context
						$ar_tables_with_relations[] = $table_name;
					}
				}
			}//end foreach ($ar_children_tables as $table_tipo)

		// fallback to defaults when a problem is detected
			if (empty($ar_tables_with_relations)) {
				debug_log(__METHOD__
					.' Error on read Ontology tables list. Old Ontology version < 26-01-2018 ! '
					, logger::ERROR
				);
				$ar_tables_with_relations = [
					"matrix",
					"matrix_list",
					"matrix_activities",
					"matrix_hierarchy"
				];
			}

		// v6.5 mandatory tables
			if (!in_array('matrix_ontology', $ar_tables_with_relations)) {
				$ar_tables_with_relations[] = 'matrix_ontology';
			}

		// cache
			self::$cache_tables_with_relations = $ar_tables_with_relations;


		return $ar_tables_with_relations;
	}//end get_matrix_tables_with_relations



	/**
	* SET_LANG
	* When isset lang, valor and data are cleaned
	* @param string $lang
	* @return bool
	*/
	public function set_lang(string $lang) : bool {

		#if($lang!==DEDALO_DATA_LANG) {
			# FORCE reload data from database when data is requested again
			$this->set_to_force_reload_data();
		#}

		$this->lang = $lang;

		return true;
	}//end set_lang



	/**
	* SET_TO_FORCE_RELOAD_DATA
	* Clean data caches and set the 'loaded_matrix_data' as false
	* forcing new get data actions to refresh the data.
	* It usually called when a set lang is made.
	* @return void
	*/
	public function set_to_force_reload_data() : void {

		// unset previous calculated data_resolved
		// (!) Do not apply in time machine mode because the data is injected
			if ($this->mode !== 'tm') {
				if (isset($this->data_resolved)) {
					unset($this->data_resolved);
				}
			}
	}//end set_to_force_reload_data



	/**
	* GET_MAIN_LANG
	* @param string|null $section_tipo = null
	* @param mixed $section_id = null
	* @return string $main_lang
	*/
	public static function get_main_lang( ?string $section_tipo, mixed $section_id=null ) : string {

		// Always fixed lang of languages as English (section tipo = lg1)
		if ($section_tipo===DEDALO_LANGS_SECTION_TIPO) {
			return 'lg-eng';
		}

		$uid = $section_tipo.'_'.$section_id;
		if (isset(self::$current_main_lang[$uid])) {
			return self::$current_main_lang[$uid];
		}

		// For now, the main_lang default for all hierarchies will be lg-spa because it is our base of work
		// TODO: Study the case where each section id can have a different main_lang
		// DEDALO_HIERARCHY_SECTION_TIPO = hierarchy1
		if ($section_tipo===DEDALO_HIERARCHY_SECTION_TIPO) {

			$main_lang = 'lg-spa'; # Default for hierarchy

			if (!is_null($section_id)) {
				$section		= section::get_instance($section_id, $section_tipo);
				$model_name	= ontology_node::get_model_by_tipo(DEDALO_HIERARCHY_LANG_TIPO,true);
				$component		= component_common::get_instance(
					$model_name,
					DEDALO_HIERARCHY_LANG_TIPO,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);
				 $data = $component->get_data();
				 if (isset($data[0])) {
					$lang_code = lang::get_code_from_locator($data[0]);
					$main_lang = $lang_code;
				 }
			}

		}else{

			#$matrix_table = common::get_matrix_table_from_tipo($section_tipo);
			#if ($matrix_table==='matrix_hierarchy') {
			#	$main_lang = hierarchy::get_main_lang( $section_tipo );
			#		dump($main_lang, ' main_lang ++ '.to_string());
			#}

			# If current section is virtual of DEDALO_THESAURUS_SECTION_TIPO, search main lang in self hierarchy
			$ar_related_section_tipo = common::get_ar_related_by_model('section', $section_tipo);

			switch (true) {

				# Thesaurus virtual
				case (isset($ar_related_section_tipo[0]) && $ar_related_section_tipo[0]===DEDALO_THESAURUS_SECTION_TIPO):
					$main_lang = hierarchy::get_main_lang($section_tipo);
					if (empty($main_lang)) {
						debug_log(__METHOD__." Empty main_lang for section_tipo: $section_tipo using 'hierarchy::get_main_lang'. Default value fallback is used (DEDALO_DATA_LANG_DEFAULT): ".DEDALO_DATA_LANG_DEFAULT, logger::WARNING);
						#trigger_error("Empty main_lang for section_tipo: $section_tipo using 'hierarchy::get_main_lang'. Default value fallback is used (DEDALO_DATA_LANG_DEFAULT): ".DEDALO_DATA_LANG_DEFAULT);
						$main_lang = DEDALO_DATA_LANG_DEFAULT;
					}
					break;

				default:
					$main_lang = DEDALO_DATA_LANG_DEFAULT;
					break;
			}
		}
		#debug_log(__METHOD__." main_lang ".to_string($main_lang), logger::DEBUG);

		self::$current_main_lang[$uid] = $main_lang;
		// Manage cache size to prevent memory leaks
		self::manage_cache_size(self::$current_main_lang);


		return (string)$main_lang;
	}//end get_main_lang



	/**
	* SETVAR
	* @param string $name
	* @param mixed $default = false
	* @return mixed
	*/
	public static function setVar(string $name, $default=false) : mixed {

		if($name==='name') throw new Exception("Error Processing Request [setVar]: Name 'name' is invalid", 1);

		$$name = $default;
		if(isset($_REQUEST[$name])) $$name = $_REQUEST[$name];

		if(isset($$name)) {

			$$name = safe_xss($$name);

			return $$name;
		}

		return false;
	}//end setVar



	/**
	* SETVARDATA
	* @param string $name
	* @param object|false $data_obj
	*/
	public static function setVarData(string $name, $data_obj, $default=false) : mixed {

		if($name==='name') throw new Exception("Error Processing Request [setVarData]: Name 'name' is invalid", 1);

		$$name = $default;
		if(isset($data_obj->{$name})) $$name = $data_obj->{$name};

		if(isset($$name)) {
			# Not sanitize here (can loose some transcriptions tags) !
			#$$name = safe_xss($$name);

			return $$name;
		}

		return false;
	}//end setVar



	/**
	* GET_AR_ALL_LANGS
	* Return array of langs of all projects in Dédalo
	* from the configuration constant DEDALO_PROJECTS_DEFAULT_LANGS.
	* @return array $ar_all_langs
	* Like ["lg-eng","lg-spa"]
	*/
	public static function get_ar_all_langs() : array {

		$ar_all_langs = DEDALO_PROJECTS_DEFAULT_LANGS;

		return (array)$ar_all_langs;
	}//end get_ar_all_langs



	/**
	* GET_AR_ALL_LANGS_RESOLVED
	* @param string $lang
	*	Default DEDALO_DATA_LANG
	* @return array $ar_all_langs_resolved
	* Like [
	*	lg-spa : Spanish,
	*   lg-eng : English,
	*   ..
	* ]
	*/
	public static function get_ar_all_langs_resolved( string $lang=DEDALO_DATA_LANG ) : array {

		$ar_all_langs = common::get_ar_all_langs();

		$ar_all_langs_resolved = [];
		foreach ($ar_all_langs as $current_lang) {

			$lang_name = lang::get_name_from_code( $current_lang, $lang );
			$ar_all_langs_resolved[$current_lang] = $lang_name;
		}

		return $ar_all_langs_resolved;
	}//end get_ar_all_langs_resolved



	/**
	* GET_PROPERTIES
	* Alias of $this->ontology_node->get_properties() but json decoded
	* @return object|array|null $properties
	*/
	public function get_properties() : ?object {

		if (isset($this->properties)) {
			// Ensure we don't return false or non-object if it was previously set as such
			return is_object($this->properties) ? $this->properties : null;
		}

		$raw_properties = $this->ontology_node->get_properties();
		if ($raw_properties) {
			// Cache the properties for the lifetime of this component instance
			$this->properties = $raw_properties;
		}

		return (isset($this->properties) && is_object($this->properties)) ? $this->properties : null;
	}//end get_properties



	/**
	* SET_PROPERTIES
	* @param mixed $value
	* @return bool
	*/
	public function set_properties($value) : bool {

		$properties = (is_string($value))
			? json_decode($value)
			: $value;

		// Fix properties object|null
		$this->properties = $properties;

		return true;
	}//end set_properties



	/**
	* GET_PROPIEDADES : V5 compatibility for diffusion
	* Don't used it in V6 calls!!!
	*/
	public function get_propiedades() {

		# Read string from database str
		$propiedades = $this->ontology_node->get_propiedades();

		$propiedades_obj = !empty($propiedades)
			? json_decode($propiedades)
			: null;


		return $propiedades_obj;
	}//end get_propiedades



	/**
	* GET_AR_RELATED_COMPONENT_TIPO
	* @return array $ar_related_component_tipo
	*/
	public function get_ar_related_component_tipo() : array {

		$ar_related_component_tipo=array();

		$relations = $this->ontology_node->get_relations();
		if(is_array($relations)) {
			foreach ($relations as $value) {
				$tipo = reset($value);
				$ar_related_component_tipo[] = $tipo;
			}
		}

		return $ar_related_component_tipo;
	}//end get_ar_related_component_tipo



	/**
	* GET_AR_RELATED_BY_MODEL
	* @param string $model_name
	* @param string $tipo
	* @param bool $strict = true
	* @return array $ar_related_by_model
	*/
	public static function get_ar_related_by_model(string $model_name, string $tipo, bool $strict=true) : array {

		// cache
		$uid = $model_name.'_'.$tipo.'_'.(int)$strict;
		if (isset(self::$ar_related_by_model_data[$uid])) {
			return self::$ar_related_by_model_data[$uid];
		}

		$ar_related_by_model = [];

		$ontology_node	= ontology_node::get_instance($tipo);
		$relations		= $ontology_node->get_relations();
		// E.g. [{"tipo": "hierarchy20"}]

		// Expected array or null from $relations
		if ($relations===null) {
		    return self::$ar_related_by_model_data[$uid] = [];
		}

		foreach ($relations as $relation) {

			$current_tipo = $relation->tipo ?? null;
			if (!$current_tipo) {
				debug_log(__METHOD__
					. " Skip invalid relation " . PHP_EOL
					. ' tipo; ' . $tipo . PHP_EOL
					. ' relations: ' . to_string($relations)
					, logger::ERROR
				);
				continue;
			}

			$current_model_name = ontology_node::get_model_by_tipo($current_tipo, true);
			if ($strict===true) {
				// Default compare equal
				if ($current_model_name===$model_name) {
					$ar_related_by_model[] = $current_tipo;
				}
			}else{
				if (str_contains($current_model_name, $model_name)) {
					$ar_related_by_model[] = $current_tipo;
				}
			}
		}

		// cache
		self::$ar_related_by_model_data[$uid] = $ar_related_by_model;
		// Manage cache size to prevent memory leaks
		self::manage_cache_size(self::$ar_related_by_model_data);


		return $ar_related_by_model;
	}//end get_ar_related_by_model



	/**
	* GET_ALLOWED_RELATION_TYPES
	* Search in structure and return an array of tipos
	* @return array $ar_allowed
	*/
	public static function get_allowed_relation_types() : array {

		// For speed, we use constants now
		$ar_allowed = [
			DEDALO_RELATION_TYPE_CHILDREN_TIPO,
			DEDALO_RELATION_TYPE_PARENT_TIPO,
			DEDALO_RELATION_TYPE_RELATED_TIPO,
			// DEDALO_RELATION_TYPE_EQUIVALENT_TIPO,
			DEDALO_RELATION_TYPE_INDEX_TIPO,
			DEDALO_RELATION_TYPE_STRUCT_TIPO,
			DEDALO_RELATION_TYPE_MODEL_TIPO,
			DEDALO_RELATION_TYPE_LINK,
			DEDALO_RELATION_TYPE_FILTER
		]; // DEDALO_RELATION_TYPE_RECORD_TIPO


		return $ar_allowed;
	}//end get_allowed_relation_types



	/**
	* BUILD_ELEMENT_JSON_OUTPUT
	* It simply groups the context and the data into one object.
	* @param array $context
	* @param array $data
	* @return object $result
	*/
	public static function build_element_json_output(array $context, array $data=[]) : object {

		$result = new stdClass();
			$result->context	= $context;
			$result->data		= $data;

		return $result;
	}//end build_element_json_output



	/**
	* GET_JSON
	* Loads the JSON controller file and returns the normalized API response JSON object
	* @param object|null $request_options
	* @return object $json
	*	Object with data and context (configurable) like:
	*	{
	*		context : [...],
	*		data : [...]
	*	}
	*/
	public function get_json( ?object $request_options=null ) : object {

		// Debug
		if(SHOW_DEBUG===true) {
			$get_json_start_time = start_time();
		}

		// Create options object to easy select from JSON controller
		$options = new stdClass();
			$options->get_context		= $request_options->get_context ?? true;
			$options->context_type		= $request_options->context_type ?? 'default';
			$options->get_data			= $request_options->get_data ?? true;
			$options->get_request_config= $request_options->get_request_config ?? false;

		// path. Use called class (ex. component_input_text) to build 'component_input_text_json.php'
		$called_model = get_class($this);
		$path = DEDALO_CORE_PATH .'/'. $called_model .'/'. $called_model .'_json.php';

		// controller include
		try {
			$json = include( $path );
		} catch (Exception $e) {
			debug_log(__METHOD__
				. " Error loading json class file " . PHP_EOL
				. ' Caught exception: ' . $e->getMessage()
				. ' path: ' . $path
				, logger::ERROR
			);
		}

		// Debug
		if(SHOW_DEBUG===true) {

			$exec_time = exec_time_unit($get_json_start_time);

			$json->debug = new stdClass();
			$json->debug->exec_time = $exec_time;

			$current_section_tipo	= $this->get_section_tipo() ?? $this->tipo ?? '';
			$current_section_id		= $this->get_section_id() ?? '';

			$called_tipo = $this->get_tipo();
			$len = !empty($called_tipo)
				? strlen($called_tipo)
				: 0;
			$repeat = ($len < 21)
				? (21 - $len)
				: 0;
			$tipo_line = $called_tipo .' '. str_repeat('-', $repeat);
			debug_log(
				'--- get_json --------------------- '. $tipo_line .' '. number_format($exec_time,3) .' ms - '. $called_model.' - '.$current_section_tipo.'.'.$current_section_id,
				logger::DEBUG
			);
		}


		return $json;
	}//end get_json



	/**
	* GET_STRUCTURE_CONTEXT
	* 	Common function to resolve element context
	* @param int $permissions = 0
	* @param bool $add_request_config = false
	*
	* @return dd_object $dd_object
	*/
	public function get_structure_context(int $permissions=0, bool $add_request_config=false) : dd_object {

		if(SHOW_DEBUG===true) {
			$start_time = start_time();
			// metrics
			metrics::$structure_context_total_calls++;
		}

		// short vars
			$model			= get_class($this);
			$tipo			= $this->get_tipo();
			$section_tipo	= $this->get_section_tipo();
			$translatable	= $this->ontology_node->get_is_translatable();
			$mode			= $this->get_mode();
			$label			= $this->get_label();
			$lang			= $this->get_lang();
			$sortable		= $this->get_sortable() ?? false; // Used by section columns to sort list

		// cache structure_context using ddo_key
			// (!) Note that 'sections_json.php' will filter out duplicated context items using this criteria:
			// 	$el->tipo===$context_item->tipo &&
			// 	$el->section_tipo===$context_item->section_tipo &&
			// 	$el->mode===$context_item->mode;
				$use_cache = true;
				if ($use_cache===true) {
					$ddo_key = $tipo.'_'.$section_tipo.'_'.$mode;
					if (isset(self::$cache_structure_context[$ddo_key])) {
						if(SHOW_DEBUG===true) {
							$len = !empty($this->tipo)
								? strlen($this->tipo)
								: 0;
							$repeat = ($len < 21)
								? (21 - $len)
								: 0;
							$tipo_line = $this->tipo .' '. str_repeat('-', $repeat);
							debug_log(
								'--- get_structure_context CACHED - ' . $tipo_line .' '. number_format(exec_time_unit($start_time,'ms'),3).' ms' . " - $model ". json_encode($add_request_config),
								logger::DEBUG
							);
						}
						return self::$cache_structure_context[$ddo_key];
					}
				}

		// properties
			$properties_source = $this->get_properties();
			if (is_object($properties_source)) {
				// Clone to prevent accidental mutations of cached properties (SEC-023)
				$properties = clone $properties_source;
			} else {
				$properties = new stdClass();
			}

			$remove_edit_css = false;
			// set properties of the section_list node
			// section and component_portal could has a section_list node with the list definition
			// (in section case is mandatory but in component_portal is optional)
			// in this cases the properties will be get from the section_list instead the main node
			if(($model==='section' || $model==='component_portal') && $this->mode==='list'){
				// section list, get the section_list node as child of the main component.
				$ar_terms = (array)ontology_node::get_ar_tipo_by_model_and_relation(
					$this->tipo,
					'section_list',
					'children',
					true
				);
				if(isset($ar_terms[0])) {
					$ontology_node	= ontology_node::get_instance($ar_terms[0]);
					$properties		= $ontology_node->get_properties() ?? new stdClass();
					// Note: ontology_node->get_properties() already returns a deep clone
				}else{
					// in cases that section_list is not present (usually component_portal)
					// remove the edit css, it happens because the main term, by default, defines the edit behavior in ontology
					$remove_edit_css = true;
				}
			}else{
				// all other components need to remove edit css
				$remove_edit_css = true;
			}

		// css
			$css = $properties->css ?? null;
			$css = ($remove_edit_css === true && $this->mode==='list')
				? null
				: $css;

			if (isset($properties->css)) {
				// remove from local properties object (cloned above)
				unset($properties->css);
			}
			// (!) new. Section overwrite css (virtual sections case)
			// see sample at section 'rsc170'
			if (str_starts_with($model, 'component_')) {
				$ontology_node		= ontology_node::get_instance($section_tipo);
				$section_properties	= $ontology_node->get_properties();
				if (isset($section_properties->css) && isset($section_properties->css->{$tipo})) {
					$css = $section_properties->css->{$tipo};
				}
			}

		// parent
			// 1 . From requested context
				// if (isset(dd_core_api::$dd_request)) {

				// 	$dd_request		= dd_core_api::$dd_request;
				// 	$request_ddo	= array_find($dd_request, function($item){
				// 		return $item->typo==='request_ddo';
				// 	});

				// 	// ar_dd_objects . Array of all dd objects in requested context
				// 		// $ar_dd_objects = array_values( array_filter($dd_request, function($item) {
				// 		// 	 if($item->typo==='ddo') return $item;
				// 		// }) );
				// 		$ar_dd_objects = $request_ddo
				// 			? $request_ddo->value
				// 			: [];

				// 	if (isset($this->from_parent)) {
				// 		$current_from_parent = $this->from_parent;
				// 		$request_dd_object = array_reduce($ar_dd_objects, function($carry, $item) use($tipo, $section_tipo, $current_from_parent){
				// 			if ($item->tipo===$tipo && $item->section_tipo===$section_tipo && $item->parent===$current_from_parent) {
				// 				return $item;
				// 			}
				// 			return $carry;
				// 		});
				// 	}else{
				// 	 	$request_dd_object = array_reduce($ar_dd_objects, function($carry, $item) use($tipo, $section_tipo){
				// 			if ($item->tipo===$tipo && $item->section_tipo===$section_tipo) {
				// 				return $item;
				// 			}
				// 			return $carry;
				// 		});
				// 	}
				// 	if (!empty($request_dd_object->parent)) {
				// 		// set
				// 		$parent = $request_dd_object->parent;
				// 	}
				// }

			// 1 . From session
				if (isset($_SESSION['dedalo']['config']['ddo'][$section_tipo])) {

					$section_ddo = $_SESSION['dedalo']['config']['ddo'][$section_tipo];

					if (isset($this->from_parent)) {
						$current_from_parent = $this->from_parent;
						$dd_object = array_reduce($section_ddo, function($carry, $item) use($tipo, $section_tipo, $current_from_parent){
							if ($item->tipo===$tipo && $item->section_tipo===$section_tipo && $item->parent===$current_from_parent) {
								return $item;
							}
							return $carry;
						});
					}else{
						$dd_object = array_reduce($section_ddo, function($carry, $item) use($tipo, $section_tipo){
							if ($item->tipo===$tipo && $item->section_tipo===$section_tipo) {
								return $item;
							}
							return $carry;
						});
					}
					if (!empty($dd_object->parent)) {
						// set
						$parent = $dd_object->parent;
					}
				}

			// 2 . From injected 'from_parent'
				if (!isset($parent) && isset($this->from_parent)) {

					// injected by the element
					$parent = $this->from_parent;
				}

			// 3 . From structure (fallback)
				if (!isset($parent)) {

					// use section tipo as parent
					$parent = $this->get_section_tipo();
				}

			// 4 . From structure (area case)
				if (empty($parent)) {

					// use structure term tipo as parent
					$parent = $this->ontology_node->get_parent();
				}

		// parent_grouper (structure parent)
			$parent_grouper = !empty($this->parent_grouper)
				? $this->parent_grouper
				: $this->ontology_node->get_parent();

		// tools
			$tools = [];
			// get the section tools in list
			// get the component tools in edit
			// (!) Note that some tools like 'tool_upload' are used in list mode,
			// but they can load tools using only the name if needed
			if(( ($model==='section' || str_starts_with($model, 'area')) && $this->mode==='list') || ($this->mode!=='list')){
				$tools_list	= $this->get_tools();
				foreach ($tools_list as $tool_object) {

					// mode check. If defined and is not the actual, skip tool
						if (isset($tool_object->properties->mode) && $tool_object->properties->mode!==$mode) {
							continue;
						}

					// tool_config
						$tool_config = $properties->tool_config->{$tool_object->name} ?? null;

					// specific tool config in registered tools or tool configuration
						// when the tool has a specific properties in the register or in his configuration records
						// overwrite the ontology properties with them
						// flow of overwrite: the most specific overwrite the most generic
						//
						// configuration -> configuration register -> ontology
						// 1 if the configuration isset use it
						// 2 else get the configuration in register, if isset use it
						// 3 else get the ontology properties

						// get the config, get_config check is the specific configuration isset
						// else get the configuration in register record
							$tool_config_options = (object)[
								'tool_name'		=> $tool_object->name,
								'tipo'			=> $tipo,
								'section_tipo'	=> $section_tipo
							];

							$specific_tool_config = tool_common::get_tool_configuration(
								$tool_config_options,
								$tool_object->tool_config // already cached tool_config value
							);

						// if the configuration was defined, replace the ddo_map of the ontology with it.
							if( is_object($specific_tool_config) && isset($specific_tool_config->ddo_map) ){
								$tool_config ??= new stdClass();
								$tool_config->ddo_map = $specific_tool_config->ddo_map;
							}

					// tool context
						$current_tool_section_tipo	= $this->get_section_tipo() ?? $this->tipo;
						$tool_context				= tool_common::create_tool_simple_context(
							$tool_object,
							$tool_config,
							$this->tipo,
							$current_tool_section_tipo
						);
					// add
					$tools[] = $tool_context;
				}//end foreach ($tools_list as $tool_object)
			}

		// buttons
			$buttons = $this->get_buttons_context();

		// request_config
			$request_config = ($add_request_config===true)
				? $this->build_request_config() // array
				: null;

		// label
		// To overwrite the label using a user preset, add the
			if (isset($properties->label)) {
				if (isset($properties->label->{DEDALO_APPLICATION_LANG})) {
					$label = $properties->label->{DEDALO_APPLICATION_LANG};
				}else if (is_object($properties->label)) {
					foreach ($properties->label as $current_label) {
						if (!empty($current_label)) {
							$label = $current_label;
							break;
						}
					}
				}
			}

		// columns_map (the final calculation was moved to common JS)
			$columns_map = !empty($request_config)
				? ($this->get_columns_map() ?? [])
				: null;

		// legacy_model
			$legacy_model = ontology_node::get_legacy_model_by_tipo($this->tipo);

		// dd_object
			$dd_object = new dd_object((object)[
				'label'				=> $label, // *
				'tipo'				=> $tipo,
				'section_tipo'		=> $section_tipo, // *
				'model'				=> $model, // *
				'legacy_model'		=> $legacy_model,
				'parent'			=> $parent, // *
				'parent_grouper'	=> $parent_grouper,
				'lang'				=> $lang,
				'mode'				=> $mode,
				'translatable'		=> $translatable,
				'properties'		=> $properties,
				'css'				=> $css,
				'permissions'		=> $permissions,
				'tools'				=> $tools,
				'buttons'			=> $buttons,
				'request_config'	=> $request_config,
				'columns_map'		=> $columns_map,
				'sortable'			=> $sortable
			]);

		// optional properties
			// filter_by_list
				if (isset($properties->source->filter_by_list)) {
					// Calculate array of elements to show in filter. Resolve self section items
						$filter_list = array_map(function($item){
							$item->section_tipo = ($item->section_tipo==='self')
								? $this->get_section_tipo()
								: $item->section_tipo;
							return $item;
						}, $properties->source->filter_by_list);

					$filter_by_list = component_relation_common::get_filter_list_data($filter_list);
					$dd_object->filter_by_list = $filter_by_list;
				}

			// specific by model
				if (str_starts_with($model, 'component_')) {

					// component specific

					if (isset($properties->state_of_component)) {
						foreach ($properties->state_of_component as $soc_key => $soc_value) {
							if (isset($soc_value->target_component) && isset($soc_value->msg)) {
								// resolve label
								$base_label		= label::get_label( $soc_value->msg );
								$component_name	= ontology_node::get_term_by_tipo($soc_value->target_component, DEDALO_APPLICATION_LANG, true);
								$msg			= sprintf($base_label, $component_name);
								// replace label by just resolved version
								$soc_value->msg = $msg;
							}
						}
					}

					if ($sortable===true) {
						// add component path to allow sort columns properly
						// ? remove if because forbids cache list mode uniformly
						// if (!empty($this->from_parent)) {
							$dd_object->path = isset($this->request_config)
								? $this->get_order_path($tipo, $section_tipo)
								: [];
						// }
					}
					if ($mode==='search') {
						// search operators info (tool tips)
						$dd_object->search_operators_info	= $this->search_operators_info();
						$dd_object->search_options_title	= search::search_options_title($dd_object->search_operators_info);
					}else{

						$new_dataframe = ontology_node::get_ar_tipo_by_model_and_relation(
							$this->tipo,
							'component_dataframe',
							'children',
							true
						);

						$dd_object->new_dataframe = (!empty($new_dataframe))
							? $new_dataframe[0]
							: null;
					}

					// set the show_interface of shared sections
					// check if the matrix table of the target section is matrix_dd (shared table between installations as yes/no list)
					// if target section is a shared section, remove the button edit and button list of the interface
					// Note 03-06-2024: To prevent unneeded calculations (permissions too), restrict target_section_ddo to
					// calls with add_request_config = true
					if ($add_request_config===true) {

						$ar_target_section_ddo = $this->get_ar_target_section_ddo();

						// user id
						$user_id_logged = logged_user_id();

						foreach ($ar_target_section_ddo as $current_section_ddo) {
							if(		isset($current_section_ddo->matrix_table)
								&&  $current_section_ddo->matrix_table==='matrix_dd'
								&&  $user_id_logged!=DEDALO_SUPERUSER
								){

								if(!isset($properties->show_interface)){
									$properties->show_interface = new stdClass();
								}

								$properties->show_interface->button_edit = false;
								$properties->show_interface->button_list = false;
							}
						}
					}

				}else if($model==='section') {

					// section_map.
					// Used to point specific components into common definitions
					// ex:  "hierarchy25" in thesaurus or "tch152" components can be mapped to "term" to be searched in the same way
					// term will be "hierarchy25" in thesaurus or will be object name in tangible heritage.
					// Uses: 	to show children option in search panel
					// 			to show the term in the thesaurus tree
					// sample:
						// {
						//	"thesaurus": {
						//		"term": "hierarchy25",
						//		"model": "hierarchy27",
						//		"order": "hierarchy48",
						//		"parent": "hierarchy36",
						//		"is_indexable": "hierarchy24",
						//		"is_descriptor": "hierarchy23"
						//	}
						// }
						$dd_object->section_map = section::get_section_map( $section_tipo );

						$ar_children_tipo = section::get_ar_children_tipo_by_model_name_in_section(
							$this->tipo,
							['relation_list'], // ar_model_name_required
							true, // from cache
							true, // resolve virtual
							false, // bool recursive
							true // bool search_exact
						);
						if (!isset($dd_object->config)) {
							$dd_object->config = new stdClass();
						}
						$dd_object->config->relation_list_tipo = $ar_children_tipo[0] ?? null;

					// section matrix_table
						$dd_object->matrix_table = common::get_matrix_table_from_tipo( $section_tipo );

					// sqo from session. Add to sync client and server sqo across calls (propagation data problem)
					// this sqo will be injected into the section instance 'request_config_object' and 'rqo' when it is built
						$sqo_id = section::build_sqo_id($this->tipo);
						$dd_object->sqo_session = $_SESSION['dedalo']['config']['sqo'][$sqo_id] ?? null;
				}

			// view, all components has view, used to change the render view.
			// the default value is "default" except in component_portal
				$dd_object->view = $this->get_view();

			// children_view. Sometimes the component defines the view of his children (see rsc368)
				$dd_object->children_view = $this->get_children_view();

			// search
				if ($this->mode==='search') {
					// parent_grouper_label
					if (isset($parent_grouper)) {
						if (!isset($dd_object->config)) {
							$dd_object->config = new stdClass();
						}
						$dd_object->config->parent_grouper_label = ontology_node::get_term_by_tipo($parent_grouper);
					}
				}

		// cache. fix context dd_object
			if ($use_cache===true) {
				self::$cache_structure_context[$ddo_key] = $dd_object;
				// Manage cache size to prevent memory leaks
				self::manage_cache_size(self::$cache_structure_context);
			}

		// Debug
			if(SHOW_DEBUG===true) {
				$time = exec_time_unit($start_time,'ms');

				// metrics
				metrics::$structure_context_total_time += $time;

				$debug = new stdClass();
					$debug->exec_time = $time.' ms';

				$dd_object->debug = $debug;

				if ($time>15) {
					$time_string = $time>15
						? sprintf("\033[31m%s\033[0m", number_format($time,3))
						: number_format($time,3);
					$len = !empty($this->tipo)
						? strlen($this->tipo)
						: 0;
					$repeat = ($len < 14)
						? (14 - $len)
						: 0;
					$tipo_line = $this->tipo .' '. str_repeat('-', $repeat);
					$msg = "--- SLOW get_structure_context --- " . "$tipo_line $time_string ms" . " ---- $model - parent:" . $parent . ' ' . json_encode($add_request_config);
					debug_log($msg, logger::WARNING);
				}
			}


		return $dd_object;
	}//end get_structure_context



	/**
	* GET_STRUCTURE_CONTEXT_SIMPLE
	* Calculates the structure_context but ignoring some properties
	* such as tools, permissions, buttons context..
	* @param int $permissions = 0
	* @param bool $add_request_config = false
	* @return dd_object $ddo
	*/
	public function get_structure_context_simple(int $permissions=0, bool $add_request_config=false) : dd_object {

		// tools. Force set $this->tools to prevent calculate tools in simple mode
		$this->tools = [];

		// buttons_context. Force to avoid calculate buttons_context (also involves calculating permissions)
		$this->buttons_context = [];

		// permissions. Force set $this->permissions to prevent calculate permissions in simple mode
		$this->set_permissions($permissions);

		// call general method
		$ddo = $this->get_structure_context($permissions, $add_request_config);


		return $ddo;
	}//end get_structure_context_simple



	/**
	* GET_SUBDATUM
	* Used by sections and portal that has relations with other components and it need get the information of the other components
	* subdatum: is the context and data of every section or component that the caller (this component) need to show, search or select
	* ex: if the caller is a portal that call to toponymy section it will need the context and data of the pointer section and the components that will be showed or searched.
	* This method use the data of the caller (ar_locators) to get only the data to be used, ex: only the first records of the section to show in list mode.
	* For get the subdatum will used the request_config. If the request_config has external api it will get the section of the ontology that has the representation of the external service (Zenon)
	* @param string|null $from_parent = null
	* @param array $ar_locators = []
	* @param object|null $subdatum_options = null
	* @return object $subdatum
	* 	Object with two properties: context, data
	*/
	public function get_subdatum( ?string $from_parent=null, array $ar_locators=[], ?object $subdatum_options=null ) : object {

		// debug
			if(SHOW_DEBUG===true) {
				$start_time = start_time();
				$len = !empty($this->tipo)
					? strlen($this->tipo)
					: 0;
				$repeat = ($len < 32)
					? (32 - $len)
					: 0;
				$tipo_line = $this->tipo .' '. str_repeat('-', $repeat);
				debug_log(
					'--- get_subdatum start ----------- '. $tipo_line.' '. get_class($this) .' - '. ($this->get_section_tipo() ?? $this->tipo).'-'.$this->get_section_id(),
					logger::DEBUG
				);
			}

		$ar_subcontext	= [];
		$ar_subdata		= [];

		// request_config. On empty, return empty context and data object
			$request_config = $this->context->request_config ?? null;
			if(empty($request_config)) {
				debug_log(__METHOD__
					." Empty request config. Ignored subdatum  ". PHP_EOL
					.' tipo: ' . to_string($this->tipo). PHP_EOL
					.' context: ' . to_string($this->context)
					, logger::ERROR
				);
				// no request config case. Return empty here !
				return (object)[
					'context'	=> [],
					'data'		=> []
				];
			}

		// children_recursive closure (avoids global namespace pollution)
		// Used to get all children for specific ddo and inject the result to new request_config (inheritance request from parent)
			$get_children_recursive = static function(array $ar_ddo, object $dd_object) use (&$get_children_recursive) : array {
				$ar_children = [];
				foreach ($ar_ddo as $ddo) {
					if($ddo->parent===$dd_object->tipo) {
						$ar_children[] = $ddo;
						$result = $get_children_recursive($ar_ddo, $ddo);
						if (!empty($result)) {
							array_push($ar_children, ...$result);
						}
					}
				}

				return $ar_children;
			};

		// full_ddo_map. Get the full ddo in every request_config
			$full_ddo_map = [];
			foreach ($request_config as $request_config_object) {

				// skip empty ddo_map
				if(empty($request_config_object->show->ddo_map)) {
					debug_log(__METHOD__
						. " Ignored empty show ddo_map " . PHP_EOL
						. ' (tipo: '.$this->tipo.' - '. ontology_node::get_term_by_tipo($this->tipo) .')' . PHP_EOL
						. ' in request_config_object (It may be due to a lack of permissions in their children).' . PHP_EOL
						. ' request_config_object: ' . to_string($request_config_object),
						logger::WARNING
					);
					continue;
				}
				// merge all ddo of all request_config
				array_push($full_ddo_map, ...$request_config_object->show->ddo_map);
				// hide ddo_map add. If request config has 'hide' property defined, add his ddo_map to be resolved
				if( isset($request_config_object->hide) && isset($request_config_object->hide->ddo_map) ){
					array_push($full_ddo_map, ...$request_config_object->hide->ddo_map);
				}
			}//end foreach ($request_config as $request_config_object)
			// remove duplicates by composite key
			// Sometimes the portal point to other portal with two different bifurcations, and the portal pointed is duplicated in the request_config (dedalo, Zenon,...)
			$seen_ddo = [];
			$full_ddo_map = array_filter($full_ddo_map, function($ddo) use (&$seen_ddo) {
				$key = $ddo->tipo . '_' . ($ddo->parent ?? '') . '_' . json_encode($ddo->section_tipo);
				if (isset($seen_ddo[$key])) return false;
				return $seen_ddo[$key] = true;
			});

		// pre-group DDOs by section_tipo to avoid repeated array_filter per locator
			$ddo_by_section_tipo = [];
			$ddo_dataframes = [];
			foreach ($full_ddo_map as $ddo) {
				if (isset($ddo->model) && $ddo->model === 'component_dataframe') {
					$ddo_dataframes[] = $ddo;
					continue;
				}
				$tipos = is_array($ddo->section_tipo) ? $ddo->section_tipo : [$ddo->section_tipo];
				foreach ($tipos as $st) {
					$ddo_by_section_tipo[$st][] = $ddo;
				}
			}

		// hoist invariant values outside loops
			$source_model		= get_called_class();
			$is_component_caller	= str_starts_with($source_model, 'component_');

		// children_recursive cache (keyed by ddo tipo + api_engine, avoids recomputing across locators)
			$children_cache = [];

		// get the context and data for every locator
			foreach($ar_locators as $current_locator) {

				// check locator format
					if (!is_object($current_locator)) {
						debug_log(
							__METHOD__." Error Processing Request. Current_locator is NOT an expected object. Ignored locator !" .PHP_EOL
							.' locator: '.to_string($current_locator),
							logger::ERROR
						);
						continue;
					}

				$section_id			= $current_locator->section_id;
				$section_tipo		= $current_locator->section_tipo;
				$section_id_key		= $current_locator->section_id;
				$section_tipo_key	= $current_locator->section_tipo;

				// // get only the direct ddos that are compatible with the current locator. His section_tipo is the same that the current locator.
				// // but when the ddo is a component_dataframe (used as sub section as data frame of the locator) get include it.
				// $ar_ddo = array_filter($full_ddo_map, function($ddo) use($section_tipo){
				// 	return 	$ddo->section_tipo===$section_tipo ||
				// 			(is_array($ddo->section_tipo) && in_array($section_tipo, $ddo->section_tipo)) ||
				// 			(isset($ddo->model) && $ddo->model === 'component_dataframe');
				// });
				// get only the direct ddos compatible with the current locator (pre-grouped lookup + dataframes)
				$ar_ddo = array_merge(
					$ddo_by_section_tipo[$section_tipo] ?? [],
					$ddo_dataframes
				);

				// ar_ddo iterate
				foreach($ar_ddo as $dd_object) {
					// reset to avoid stale reference from previous iteration (correctness fix)
					unset($current_element);

					// debug timing
					if(SHOW_DEBUG===true) {
						$ddo_start_time = start_time();
					}

					// use the locator section_tipo.
					// when the ddo is a component_dataframe (used as sub section as data frame or semantic_node of the locator)
					// use his own section_tipo, it's totally dependent of the section_id of the locator and it's compatible.
					// Note: it's different of the multiple section_tipo as es1, fr1, etc that every locator define his own ddo compatibles.
						// reference: oh24 -> old semantic_node
						// reference: numisdata161 -> old dataframe

					// skip security_areas
						if($dd_object->tipo===DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO) {
							// 'component_security_areas' removed in v6 but the component will stay in ontology,
							// PROVISIONAL, only in the alpha state of V6 for compatibility of the ontology of V5.
							continue;
						}

					// short vars
						$current_tipo	= $dd_object->tipo;
						$view			= $dd_object->view ?? null;
						$model			= ( isset($dd_object->model) )
							? $dd_object->model
							: ontology_node::get_model_by_tipo($current_tipo, true);

					// dataframe case
						// dataframe ddo need to get section_tipo has it has defined
						// dataframe store his data in the same section than main component,
						// so, dataframe subdatum will be calculated with his own section_tipo definition
						// and the section_id of the main component (instead the locator, dataframe is not in the target section)
						if($model === 'component_dataframe'){
							$section_tipo = is_array($dd_object->section_tipo)
								? reset($dd_object->section_tipo)
								: $dd_object->section_tipo;

							$section_id_key		= $current_locator->section_id; // section_id_key link the dataframe data to the main locator
							$section_tipo_key	= $current_locator->section_tipo; // section_tipo_key link the dataframe data to the main locator
							$section_id			= $this->get_section_id(); // the section that call to component, not the component

						}else{
							// standard use of the locator to get data of the ddo
							$section_id			= $current_locator->section_id;
							$section_tipo		= $current_locator->section_tipo;
							$section_id_key		= $current_locator->section_id;
							$section_tipo_key	= $current_locator->section_tipo;
						}

						$current_section_tipo = $section_tipo;

						$mode = $this->mode==='tm'
							? 'tm' // propagate tm mode from parent
							: ($dd_object->mode ?? $this->get_mode());

					// prevent resolve non children from path ddo, remove the non direct child,
					// it will be calculated by his parent (in recursive loop)
						if (isset($dd_object->parent) && $dd_object->parent!==$this->tipo) {
							if(SHOW_DEBUG===true) {
								dump($dd_object, ' SKIP dd_object (parent!=$this->tipo) ++'.to_string($this->tipo));
							}
							continue;
						}

					// ar_subcontext_calculated
						// $cid = $current_section_tipo . '_' . $section_id . '_' . $current_tipo;
						// if (in_array($cid, $ar_subcontext_calculated)) {
						// // if (isset($ar_subcontext_calculated[$cid])) {
						// 	debug_log(__METHOD__." Error Processing Request. Already calculated! ".$cid .to_string(), logger::ERROR);
						// 	// throw new Exception("Error Processing Request. Already calculated! ".$cid, 1);
						// 	// continue;
						// 	// $current_element = $ar_subcontext_calculated[$cid];
						// }

					// common temporal excluded/mapped models *******
						$mapped_model = isset(common::$ar_temp_map_models[$model])
							? common::$ar_temp_map_models[$model]
							: false;
						if ($mapped_model!==false) {
							// mapped model
							$model = $mapped_model;
							debug_log(__METHOD__
								." Mapped model $model to $mapped_model from layout map"
								, logger::WARNING
							);
						}else if (in_array($model, common::$ar_temp_exclude_models)) {
							// excluded model
							debug_log(__METHOD__
								." Excluded model $model from layout map"
								, logger::WARNING
							);
							continue;
						}

					// current_element switch
						switch (true) {

							// section case (will be used in areas calculations with multiple sections)
							case ($model==='section'):
								// section
									$section = section::get_instance(
										$section_tipo,
										$mode,
										true // cache
									);

									$section_record = section_record::get_instance( $section_tipo, (int)$section_id );

									$section->add_section_record( $section_record );

								// set element
									$current_element = $section;
								break;

							// component case
							case (str_starts_with($model, 'component_')):

								// source_model and is_component_caller are hoisted before the loops

								// caller_dataframe cases
								$caller_dataframe = (str_starts_with($source_model, 'component_'))
									? (object)[
										'section_id_key'		=> $section_id_key,
										'section_tipo_key'		=> $section_tipo_key,
										'section_tipo'			=> $this->get_section_tipo(),
										'main_component_tipo'	=> $from_parent,
									  ]
									: null;

								// create the component child and inject his configuration (or use the default if the parent don't has specific request_config for it)
								$current_lang	= $dd_object->lang ?? common::get_element_lang($current_tipo, DEDALO_DATA_LANG);
								$current_element= component_common::get_instance(
									$model,
									$current_tipo,
									$section_id,
									$mode,
									$current_lang,
									$current_section_tipo,
									true,
									$caller_dataframe // object|null
								);

								// the the component is a dataframe and it's in time_machine call
								// set data_source as tm, and the matrix_id from the main component
								// it will get the correct data from the time_machine
								// used to load the component in edit mode in time_machine tool.
								if($model==='component_dataframe' && isset($this->matrix_id) ){
									$current_element->data_source = 'tm';
									$current_element->matrix_id = $this->matrix_id;
								}

								// Permissions inheritance.
								// Get the permissions to inject to children.
								// Situation :
								// The user can access to the source portal (permissions 1 or 2), but he/she can not access to target section (permissions 0).
								// In this situation, the user needs to read the data of the target section because he/she can access to the source portal
								// and he/she will be able to search with autocomplete, to assign data to the portal (or link data).
								// Behavior:
								// When a component has data to show but the user doesn't have permissions to access to target section
								// or target components, the target component needs to be set as read (permissions 1).
								// The user will need to read the portal and his data, even if they cannot change the target section.
								// The same case happens with the searched section with autocomplete.
								// The user will need to read the target section and his components to choose data.
								// Exception:
								// If the user can read or read/write permissions, do not change it.
									$current_element_permissions = $current_element->get_component_permissions();
									// Grant minimum read permission when user lacks access to target section
									if($is_component_caller && $current_element_permissions < 1) {
										$current_element->set_permissions(1);
									}
									// Cap permissions at caller level when caller is read-only
									if($is_component_caller && $this->permissions === 1 && $current_element_permissions > 1) {
										$current_element->set_permissions($this->permissions);
									}

								// component_text_area lang case. Change lang before get data (!)
									if ($model==='component_text_area') {
										$original_lang = $current_element->get_original_lang();
										if (!empty($original_lang) && $original_lang!==$current_lang) {
											$current_element->set_lang($original_lang);
										}
									}

								// component_info get data case.
								// get the data from database instead the calculation
								// do not use the default get_data() because it's calculated by observer and save in DB
									if ($model==='component_info') {
										$current_element->use_db_data = true;
									}

								// pagination->limit. Get limit from component calculation or if it's defined from ddo
								// Sample of use is request config: numisdata11 (ordered coins)
									if(isset($dd_object->limit)){
										$current_element->pagination->limit = $dd_object->limit;
									}

								// virtual request_config, create new request config to be injected to the current_ddo.
								// the current component has the configuration to all children components,
								// and it's necessary calculate the new request_config that will be use in the next loop
								// the main component has all config, his children has specific config (only his own part)
									// get the component rqo to be updated with the current config
									$component_request_config = $current_element->build_request_config();
									foreach ($request_config as $request_config_object) {

										// use the current api_engine to ensure the inheritance has correct relation dd_engine -> dd_engine, zenon - >zenon
											$api_engine = $request_config_object->api_engine;

										// cache children_recursive results (same dd_object + api_engine across locators)
											$cache_key = $dd_object->tipo . '_' . $api_engine;
											if (!isset($children_cache[$cache_key])) {
												$children_cache[$cache_key] = [
													'show'		=> isset($request_config_object->show)
														? $get_children_recursive($request_config_object->show->ddo_map, $dd_object)
														: null,
													'search'	=> isset($request_config_object->search)
														? $get_children_recursive($request_config_object->search->ddo_map, $dd_object)
														: null,
													'choose'	=> isset($request_config_object->choose)
														? $get_children_recursive($request_config_object->choose->ddo_map, $dd_object)
														: null,
													'hide'		=> isset($request_config_object->hide)
														? $get_children_recursive($request_config_object->hide->ddo_map, $dd_object)
														: null,
												];
											}
											$children_show		= $children_cache[$cache_key]['show'];
											$children_search	= $children_cache[$cache_key]['search'];
											$children_choose	= $children_cache[$cache_key]['choose'];
											$children_hide		= $children_cache[$cache_key]['hide'];

										// select the current api_engine
											$new_request_config_object = array_find($component_request_config, function($el) use($api_engine){
												return $el->api_engine===$api_engine;
											});
											if (empty($new_request_config_object) || !is_object($new_request_config_object)) {
												// debug_log(__METHOD__
												// 	. " Error. Expected request config but value is empty from component_request_config " . PHP_EOL
												// 	. ' tipo: ' 	 . $this->tipo . PHP_EOL
												// 	. ' dd_object: ' . to_string($dd_object) . PHP_EOL
												// 	. ' component_request_config: ' .PHP_EOL. json_encode($component_request_config, JSON_PRETTY_PRINT) . PHP_EOL
												// 	, logger::ERROR
												// );
												continue;
											}

										// set the ddo_map with the new config
											if (!empty($children_show)) {
												$new_request_config_object->show->ddo_map  = $children_show;
											}
											if (!empty($children_search)) {
												if (empty($new_request_config_object->search)) {
													$new_request_config_object->search = (object)[
														'ddo_map' => []
													];
												}
												$new_request_config_object->search->ddo_map  = $children_search;
											}
											if (!empty($children_choose)) {
												if (empty($new_request_config_object->choose)) {
													$new_request_config_object->choose = (object)[
														'ddo_map' => []
													];
												}
												$new_request_config_object->choose->ddo_map  = $children_choose;
											}
											if (!empty($children_hide)) {
												if (empty($new_request_config_object->hide)) {
													$new_request_config_object->hide = (object)[
														'ddo_map' => []
													];
												}
												$new_request_config_object->hide->ddo_map  = $children_hide;
											}
									}//end foreach ($request_config as $request_config_object)

								// Inject the request_config inside the component
									$current_element->request_config = $component_request_config;

								// Inject this tipo as related component from_component_tipo
									if (str_starts_with($source_model, 'component_')){
										$current_element->from_component_tipo	= $this->tipo;
										$current_element->from_section_tipo		= $this->get_section_tipo();
									}

								// inject view
									if(!empty($view)){
										$current_element->view = $view;
									}
								break;

							// grouper case
							case (in_array($model, common::$groupers)):
								$current_element = new $model($current_tipo, $current_section_tipo, $mode);
								break;

							// dd_grid in time machine case
							case ($model==='dd_grid' && $section_tipo===DEDALO_TIME_MACHINE_SECTION_TIPO):

								// tm case
								$tm_record = tm_record::get_instance((int)$section_id);

								$tm_data = $tm_record->get_data();
								$component_tipo = $tm_data->tipo;
								$component_data = $tm_data->data;
								$model = ontology_node::get_model_by_tipo($component_tipo);

								$current_component = component_common::get_instance(
									$model,
									$component_tipo,
									$section_id,
									$mode,
									$current_lang,
									$current_section_tipo,
								);

								$current_component->set_data($component_data);

								// component value
									$value = $current_component->get_grid_value();
								// data item
									$data_item = $current_component->get_data_item($value);
									// add matrix_id always
									$data_item->matrix_id = $section_id;
									// force tipo from ddo. If not forced, time_machine_list cannot match context ddo column
									$data_item->tipo = $current_tipo;
								// data add
									$ar_subdata[]		= $data_item;
									$ar_subcontext[]	= $dd_object;
								break;

							// others case
							default:
								debug_log(__METHOD__
									. " Ignored model '$model' - current_tipo: '$current_tipo'  - ". PHP_EOL
									. ontology_node::get_term_by_tipo($current_tipo)
									, logger::WARNING
								);
								break;
						}//end switch (true)

					// add
						if (isset($current_element)) {

							// Inject var from_parent as from_parent
								if (isset($from_parent)) {
									$current_element->from_parent = $from_parent;
								}

							// parent_grouper
								if (isset($dd_object->parent_grouper)) {
									$current_element->parent_grouper = $dd_object->parent_grouper;
								}

							// properties injection
								if (isset($dd_object->properties)) {
									$properties = $current_element->get_properties() ?? new stdClass();
									foreach ($dd_object->properties as $key => $value) {
										$properties->$key = $value;
									}
									$current_element->set_properties($properties);
								}

							// get the JSON context of the related component
								$item_options = new stdClass();
									$item_options->get_context	= true;
									$item_options->get_data		= true;
								$element_json = $current_element->get_json($item_options);

							// ar_subcontext
								array_push($ar_subcontext, ...$element_json->context);

							// row_section_id
							// add parent_section_id with the main locator section_id that define the row, to preserve row coherence between all columns
							// (some columns can has other portals or subdata and it's necessary to preserve the root locator section_id)
							// add parent_tipo with the caller tipo, it defines the global context (portal or section) that are creating the rows.
								$ar_final_subdata = [];
								foreach ($element_json->data as $value_obj) {

									$value_obj->row_section_id	= $current_locator->section_id;
									$value_obj->parent_tipo		= $this->tipo;

									$ar_final_subdata[] = $value_obj;
								}

							// dd_info, additional information to the component, like parents
								$value_with_parents = $dd_object->value_with_parents ?? false;
								if ($value_with_parents===true) {
									$dd_info = common::get_ddinfo_parents($current_locator, $this->tipo);
									$ar_final_subdata[] = $dd_info;
								}

							// data add
								array_push($ar_subdata, ...$ar_final_subdata);
						}//end if (isset($current_element))

					// debug
						if(SHOW_DEBUG===true) {
							$related_model = isset($current_element)
								? $current_element->get_model()
								: ($dd_object->tipo ?? null);
							$len = !empty($dd_object->tipo)
								? strlen($dd_object->tipo)
								: 0;
							$repeat = ($len < 21)
								? (21 - $len)
								: 0;
							$tipo_line = $dd_object->tipo .' '. str_repeat('-', $repeat);
							debug_log(
								'--- resolve ddo ------------------ '.$tipo_line.' '. number_format(exec_time_unit($ddo_start_time,'ms'), 3).' ms' . ' - ' . $related_model,
								logger::DEBUG
							);
						}
				}//end foreach ($layout_map as $section_tipo => $ar_list_tipos) foreach ($ar_list_tipos as $current_tipo)

			}//end foreach($ar_locators as $current_locator)


		// subdatum
			$subdatum = new stdClass();
				$subdatum->context	= $ar_subcontext;
				$subdatum->data		= $ar_subdata;

		// debug
			if(SHOW_DEBUG===true) {
				$time = exec_time_unit($start_time,'ms');
				$time_string = $time>50
					? sprintf("\033[31m%s\033[0m", number_format($time,3))
					: number_format($time,3);
				$len = !empty($this->tipo)
					? strlen($this->tipo)
					: 0;
				$repeat = ($len < 21)
					? (21 - $len)
					: 0;
				$tipo_line = $this->tipo .' '. str_repeat('-', $repeat);
				debug_log(
					'--- get_subdatum ----------------- '."$tipo_line $time_string ms - ". get_class($this) .' -- '. ($this->get_section_tipo() ?? $this->tipo).'-'.$this->get_section_id(),
					logger::DEBUG
				);
			}


		return $subdatum;
	}//end get_subdatum



	/**
	* BUILD_COMPONENT_SUBDATA
	* @return object $element_json
	*/
		// public function build_component_subdata(string $model, string $tipo, $section_id, string $section_tipo, string $mode, string $lang, string$source_model, $custom_data='no_value') : object {

		// 	// components
		// 		$current_component = component_common::get_instance(
		// 			$model,
		// 			$tipo,
		// 			$section_id,
		// 			$mode,
		// 			$lang,
		// 			$section_tipo
		// 		);
		// 	// null component, when the data is not correct or the tipo don't mach with the ontology (ex:time machine data of old components)
		// 		if($current_component === null){
		// 			$value = false;

		// 			// data item
		// 			$item  = $this->get_data_item($value);
		// 				$item->parent_tipo			= $this->get_tipo();
		// 				$item->parent_section_id	= $this->get_section_id();
		// 				$data = [$item];

		// 			$element_json = new stdClass();
		// 				$element_json->context 	= [];
		// 				$element_json->data 	= $data;

		// 			return $element_json;
		// 		}

		// 	// properties
		// 		// if (isset($dd_object->properties)){
		// 		// 	$current_component->set_properties($dd_object->properties);
		// 		// }
		// 	// Inject this tipo as related component from_component_tipo
		// 		if (strpos($source_model, 'component_')===0){
		// 			$current_component->from_component_tipo = $this->tipo;
		// 			$current_component->from_section_tipo 	= $this->section_tipo;
		// 		}

		// 	// inject data if is received
		// 		if ($custom_data!=='no_value') {
		// 			$current_component->set_data($custom_data);
		// 		}

		// 	// get component json
		// 		$get_json_options = new stdClass();
		// 			$get_json_options->get_context	= false;
		// 			$get_json_options->get_data		= true;
		// 		$element_json = $current_component->get_json($get_json_options);

		// 	// dd_info, additional information to the component, like parents
		// 		// $value_with_parents = $dd_object->value_with_parents ?? false;
		// 		// if ($value_with_parents===true) {
		// 		// 	$dd_info = common::get_ddinfo_parents($locator, $this->tipo);
		// 		// 	$ar_subdata[] = $dd_info;
		// 		// }

		// 	// dump($element_json, ' element_json ++ '.to_string("$model, $tipo, $section_id, $section_tipo, $mode, $lang, $source_model - data: ") . to_string($data));

		// 	return $element_json;
		// }//end build_component_subdata



	/**
	* BUILD_REQUEST_CONFIG
	* Calculate the SQO for the components or section that need search by their own (section, autocomplete, portal, ...)
	* The search_query_object_context (request_config) have at least:
	* one sqo, that define the search with filter, offset, limit, etc, the select option it's not used (it will use the ddo)
	* one ddo for the searched section (source ddo)
	* one ddo for the component searched.
	* 	It is possible to create more than one ddo for different components.
	* @return array $this->request_config
	*/
	public function build_request_config() : array {
		$start_time=start_time();

		// 1. Return if already calculated in this instance
			if (isset($this->request_config)) {
				return $this->request_config;
			}

		// 2. Attempt to retrieve from static cache
		// No use cache here. Atomic cache is used instead

		// 3. Attempt to build from the client's API request (RQO)
			// requested_source is fixed from RQO calls to API when they exists like
			// {
			//     "typo": "source",
			//     "action": "search",
			//     "model": "section",
			//     "tipo": "dd64",
			//     "section_tipo": "dd64",
			//     "section_id": null,
			//     "mode": "edit",
			//     "lang": "lg-eng"
			// }
			$requested_source	= dd_core_api::$rqo->source ?? null;
			$requested_sqo		= dd_core_api::$rqo->sqo ?? null;

			if( isset($requested_source) &&
				($requested_source->tipo===$this->tipo ||
					(isset($requested_sqo) && in_array($this->tipo, (array)$requested_sqo->section_tipo)))
				) {

				// set the request_config with the API rqo sent by client

				// requested_show. get the rqo sent to the API
				$requested_show = isset(dd_core_api::$rqo) && isset(dd_core_api::$rqo->show)
					? unserialize(serialize(dd_core_api::$rqo->show))
					: false;

				if (!empty($requested_show)) {

					// consolidate ddo items properties
						$new_show_ddo_map = [];
						foreach ($requested_show->ddo_map as $key => $current_ddo) {
							// get the direct ddo linked by the source
							$new_ddo = unserialize(serialize($current_ddo));
							if ($new_ddo->parent===$requested_source->tipo || $new_ddo->parent==='self') {
								// check if the section_tipo of the current_ddo, is compatible with the section_tipo of the current instance
								if(in_array($this->tipo, (array)$new_ddo->section_tipo) || $new_ddo->section_tipo==='self'){
									$new_ddo->parent		= $this->tipo;
									$new_ddo->section_tipo	= $this->tipo;
								}
							}

							// added label & mode if not are already defined
							if(!isset($new_ddo->label)) {
								$new_ddo->label = ontology_node::get_term_by_tipo($new_ddo->tipo, DEDALO_APPLICATION_LANG, true, true);
							}
							if(!isset($new_ddo->mode)) {
								$new_ddo->mode = $this->mode;
							}
							$new_show_ddo_map[] = $new_ddo;
						}//end foreach ($requested_show->ddo_map as $key => $current_ddo)

					// request_config_object. Create the new request_config_object with the caller
						$request_config_object = new request_config_object();
							$request_config_object->api_engine		= 'dedalo';
							$request_config_object->type			= 'main';
							$request_config_object->show			= new stdClass();
							$request_config_object->show->ddo_map	= $new_show_ddo_map;

						// requested_search
							$requested_search = isset(dd_core_api::$rqo) && isset(dd_core_api::$rqo->search)
								? unserialize(serialize(dd_core_api::$rqo->search))
								: false;
							if (!empty($requested_search)) {

								$new_search_ddo_map = [];
								// consolidate ddo items properties
								foreach ($requested_search->ddo_map as $key => $current_ddo) {

									// new_ddo. Get the direct ddo linked by the source
										$new_ddo = unserialize(serialize($current_ddo));
										if ($new_ddo->parent===$requested_source->tipo || $new_ddo->parent==='self') {
											// check if the section_tipo of the current_ddo, is compatible with the section_tipo of the current instance
											if(in_array($this->tipo, (array)$new_ddo->section_tipo) || $new_ddo->section_tipo==='self'){
												$new_ddo->parent		= $this->tipo;
												$new_ddo->section_tipo	= $this->tipo;
											}
										}

									// label add if not are already defined
										if(!isset($new_ddo->label)) {
											$new_ddo->label = ontology_node::get_term_by_tipo($new_ddo->tipo, DEDALO_APPLICATION_LANG, true, true);
										}

									// mode add if not are already defined
										if(!isset($new_ddo->mode)) {
											$new_ddo->mode = $this->mode;
										}

									// add to search ddo_map
										$new_search_ddo_map[] = $new_ddo;
								}//end foreach ($requested_show->ddo_map as $key => $current_ddo)

								$request_config_object->search			= new stdClass();
								$request_config_object->search->ddo_map	= $new_search_ddo_map;
							}//end if (!empty($requested_search))

						// sqo add
							if (isset(dd_core_api::$rqo->sqo)) {
								$sqo = unserialize(serialize(dd_core_api::$rqo->sqo));
								$sqo->section_tipo = array_map(function($el){
									return (object)[
										'tipo' => $el
									];
								}, $sqo->section_tipo);
								$request_config_object->sqo = $sqo;
							}

						// fix request_config
							$this->request_config = [$request_config_object];

					return $this->request_config; // we have finished ! Note we stop here (!)
				}//end if (!empty($requested_show))
			}//end if( isset($requested_source) &&...

		// Create a new fresh request_config with fallback options

			// short vars
			$mode			= $this->get_mode();
			$tipo			= $this->get_tipo();
			$section_tipo	= $this->get_section_tipo();

		// 4. Attempt to build from user presets (section 'dd1244' Layout map (request config) presets)
		// Currently, only sections can modify their default request configuration. It is possible that components could be added in time.
			if (get_called_class()==='section') {

				$user_preset = request_config_presets::get_request_config(
					$tipo,
					$section_tipo,
					$mode
				);
				if (!empty($user_preset)) {

					// set resolved request_config value
					// $request_config = $user_preset; // OLD WAY < 10-06-2025

					// Overwrite properties request_config to allow get_ar_request_config do the unified hard work
					$this->properties = $this->get_properties() ?? new stdClass();
					if (!isset($this->properties->source)) {
						$this->properties->source = new stdClass();
					}
					$this->properties->source->request_config = $user_preset;

					debug_log(__METHOD__.
						" request_config calculated from request_config_presets [$section_tipo-$tipo] ",
						logger::DEBUG
					);
				}
			}

		// 5. Attempt to build from Ontology
			if (empty($request_config)) {

				$request_config = $this->get_ar_request_config();
			}

		// fix request_config value
			$this->request_config = $request_config;

		// fix ddo_map (dd_core_api static var)
			$dedalo_request_config = array_find($request_config, function($el){
				return isset($el->api_engine) && $el->api_engine==='dedalo';
			});
			if (is_object($dedalo_request_config)) {

				// fix missing type
				$dedalo_request_config->type = $dedalo_request_config->type ?? 'main';

				// sqo. Preserves filter across calls using session sqo if exists
				$model	= ontology_node::get_model_by_tipo($tipo, true);
				$sqo_id	= ($model==='section')
					? section::build_sqo_id($tipo)
					: null; // cache key sqo_id
				if ($model==='section') {
					// dd_core_api::$rqo->sqo is set case
					// Fixed in dd_core_api::start if user browser has SQO value for this section on local DDBB
					// Note that $requested_sqo is dd_core_api::$rqo->sqo
					if (!empty($requested_sqo)) {
						foreach ($requested_sqo as $sqo_key => $sqo_value) {

							// sqo. Crete once
							if (!isset($dedalo_request_config->sqo)) {
								$dedalo_request_config->sqo = new stdClass();
							}

							// ignore section_tipo
							if ($sqo_key==='section_tipo') {
								continue;
							}

							if ($sqo_key==='limit') {
								// limit null value from server NOT overwrite request config value if exists
								$dedalo_request_config->sqo->{$sqo_key} = $sqo_value ?? $dedalo_request_config->sqo->{$sqo_key} ?? null;
							}else{
								$dedalo_request_config->sqo->{$sqo_key} = $sqo_value;
							}
						}
					}
					// fallback to session (note that always is saved navigation SQO in session to allow preserve records on tools like tool_export)
					// Here it is mainly used to preserve the navigation of section_tool because the 'tipo' is different from real section
					else if (isset($_SESSION['dedalo']['config']['sqo'][$sqo_id])) {
						// replace default sqo with the already stored in session (except section_tipo to prevent to
						// loose labels and limit to avoid overwrite list in edit and vice-versa)
						foreach ($_SESSION['dedalo']['config']['sqo'][$sqo_id] as $key => $value) {
							if($key==='section_tipo' || $key==='generated_time') continue;
							// limit. Do no t apply null value. instead leave to calculate defaults
							if ($key==='limit' && $value===null) {
								continue;
							}
							if (!isset($dedalo_request_config->sqo)) {
								$dedalo_request_config->sqo = new stdClass();
							}
							$dedalo_request_config->sqo->{$key} = $value;
						}
					}
				}
			}//end if ($model==='section')

		// debug
			if(SHOW_DEBUG===true) {
				$len = !empty($this->tipo)
					? strlen($this->tipo)
					: 0;
				$repeat = ($len < 21)
					? (21 - $len)
					: 0;
				$tipo_line = $this->tipo .' '. str_repeat('-', $repeat);
				debug_log(
					"--- build_request_config --------- {$tipo_line} ". number_format(exec_time_unit($start_time,'ms'),3). " ms - " . get_called_class() . " - {$this->tipo} - {$this->section_tipo} - {$this->section_id}",
					logger::DEBUG
				);
			}


		return $this->request_config;
	}//end build_request_config




	/**
	* GET_AR_REQUEST_CONFIG
	* Resolves the component config context with backward compatibility
	* The proper config in v6 is on term properties config, NOT as related terms
	* Note that section tipo 'self' will be replaced by current '$section_tipo'
	*
	* ARCHITECTURE (using traits for separation of concerns):
	* - request_config_utils: utility methods (validation, caching, pagination)
	* - request_config_ddo: ddo_map processing (validation, enrichment, self-resolution)
	* - request_config_v6: V6 style parsing (properties->source->request_config)
	* - request_config_v5: V5 legacy fallback (ontology relation nodes)
	*
	* FLOW:
	* 1. Extract context variables (tipo, section_tipo, section_id, mode, model)
	* 2. Validate section_tipo is a valid section or area
	* 3. Check cache for previously resolved config
	* 4. Resolve source properties (may come from section_list child in list mode)
	* 5. Calculate pagination defaults based on model/mode
	* 6. Build request config using V6 or V5 strategy
	* 7. Cache and return result
	*
	* @return array $ar_request_config Array of request_config_object instances
	*/
	public function get_ar_request_config() : array {

		// 1. EXTRACT CONTEXT VARIABLES
		// These define the current element being processed
		$tipo			= $this->get_tipo();
		$section_tipo	= $this->get_section_tipo();
		$section_id		= $this->get_section_id();
		$mode			= $this->get_mode();
		$model			= get_called_class();

		// 2. VALIDATE SECTION_TIPO
		// Ensure section_tipo is a valid 'section' or 'area*' model
		// Invalid tipos return empty array to prevent downstream errors
		if (!$this->validate_section_tipo_model($section_tipo)) {
			return [];
		}

		// 3. CACHE CHECK
		// Build unique cache key from context variables
		// Cache prevents re-processing identical configurations
		$resolved_key = $this->build_request_config_cache_key(
			$tipo,
			$section_tipo,
			false,	// external flag (deprecated, always false)
			$mode,
			(int)$section_id
		);

		// Return cached result if available
		$cached = $this->get_cached_request_config($resolved_key);
		if ($cached !== null) {
			return $cached;
		}

		// 4. RESOLVE SOURCE PROPERTIES
		// In list mode, properties may come from 'section_list' child term
		// This allows different display configurations for list vs edit views
		$properties = $this->resolve_source_properties($tipo, $mode, $model);

		// 5. CALCULATE PAGINATION DEFAULTS
		// Limit/offset values come from multiple sources with priority:
		// - Instance pagination property (highest)
		// - Properties request_config->sqo->limit
		// - Mode/model defaults (section=1/10, component=10/1)
		$pagination = $this->resolve_pagination_defaults($properties, $model, $mode);

		// 6. BUILD REQUEST CONFIG
		// Two strategies based on ontology version:
		// - V6: properties->source->request_config exists (modern approach)
		// - V5: fallback using ontology relation nodes (legacy compatibility)
		// Context object passes all needed data to strategy methods
		$context = (object)[
			'tipo'			=> $tipo,
			'section_tipo'	=> $section_tipo,
			'section_id'	=> $section_id,
			'mode'			=> $mode,
			'model'			=> $model
		];

		// Choose V6 or V5 strategy
		$ar_request_query_objects = isset($properties->source->request_config)
			? $this->build_request_config_v6($properties, $context, $pagination)
			: $this->build_request_config_v5($context, $pagination);

		// 7. CACHE AND RETURN
		// Store result for future requests with same context
		$this->cache_request_config($resolved_key, $ar_request_query_objects);

		return $ar_request_query_objects;
	}//end get_ar_request_config




	/**
	* GET_REQUEST_CONFIG_OBJECT
	* Call method get_ar_request_config whit current options
	* and return the first request_config_object
	* @return request_config_object|null $request_config_object
	*/
	public function get_request_config_object() : ?request_config_object {

		$ar_request_query_objects = $this->get_ar_request_config();

		// request_config_object
			$request_config_object = !empty($ar_request_query_objects)
				? reset($ar_request_query_objects)
				: null;


		return $request_config_object;
	}//end get_request_config_object



	/**
	* GET_RECORDS_MODE
	* @return string $records_mode
	*/
	public function get_records_mode() : string {

		$model			= get_called_class();
		$properties		= $this->get_properties();
		$records_mode	= isset($properties->source->records_mode)
			? $properties->source->records_mode
			: (in_array($model, component_relation_common::get_components_with_relations())
				? 'list'
				: $this->get_mode()
			);

		return $records_mode;
	}//end get_records_mode



	/**
	* GET_SOURCE
	* Unified source object builder
	* @return object $source
	*/
	public function get_source() : object {

		$source = (object)[
			'tipo'			=> $this->get_tipo(),
			'model'			=> get_class($this),
			'section_tipo'	=> $this->get_section_tipo(),
			'section_id'	=> $this->get_section_id(),
			'lang'			=> $this->get_lang(),
			'mode'			=> $this->get_mode()
		];


		return $source;
	}//end get_source



	/**
	* GET_DDINFO_PARENTS
	* Creates ddinfo object with parents data
	* @param object $locator
	* @param string $source_component_tipo
	* @return object $dd_info
	*/
	public static function get_ddinfo_parents(object $locator, string $source_component_tipo) : object {

		$section_id		= $locator->section_id;
		$section_tipo	= $locator->section_tipo;

		// dd_info_value array|null
		$dd_info_value = component_relation_common::get_locator_value(
			$locator, // object locator
			DEDALO_DATA_LANG, // string lang
			true, // bool show_parents
			null, // array|null ar_components_related
			false // bool include_self
		);

		$dd_info = new stdClass();
			$dd_info->tipo			= 'ddinfo';
			$dd_info->section_id	= $section_id;
			$dd_info->section_tipo	= $section_tipo;
			$dd_info->value			= $dd_info_value;
			$dd_info->parent		= $source_component_tipo;


		return $dd_info;
	}//end get_ddinfo_parents



	/**
	* RESOLVE_GET_DDO_MAP
	* @param array $ar_section_tipo
	* @param object $get_ddo_map
	* @return array $ar_ddo_calcutaled
	*/
	private function resolve_get_ddo_map(array $ar_section_tipo, $get_ddo_map) : array {

		if ($get_ddo_map === false) {
			return [];
		}

		$ar_ddo_calcutaled	= [];

		switch ($get_ddo_map->model) {

			case 'section_map':
				$procesed_component_tipo = [];
				foreach ($ar_section_tipo as $current_section_tipo) {

					$section_map = section::get_section_map( $current_section_tipo );
					if(empty($section_map)) {
						debug_log(__METHOD__
							." Ignored section_tipo without section_map (1) current_section_tipo: ".to_string($current_section_tipo) . PHP_EOL
							.' tipo: ' . $this->tipo . PHP_EOL
							.' section_tipo: ' . $this->section_tipo . PHP_EOL
							.' section_id: ' . $this->section_id
							, logger::WARNING
						);
						continue;
					}
					foreach ($get_ddo_map->columns as $original_column) {


						$current_column = is_array($original_column)
							? (object)[ // compatibility with previous version ontology of 10-08-2024
								'path' => $original_column
							  ]
							: $original_column;

						$current_column_path = $current_column->path;

						$section_map_value = get_object_property($section_map, $current_column_path);

						// ignore value
						if(empty($section_map_value)){
							debug_log(__METHOD__
								." Ignored section_tipo without section_map (2) current_section_tipo: ".to_string($current_section_tipo) . PHP_EOL
								.' tipo: ' . $this->tipo . PHP_EOL
								.' section_tipo: ' . ($this->section_tipo ?? null) . PHP_EOL
								.' section_id: ' . $this->section_id
								, logger::WARNING
							);
							continue;
						}
						$ar_component_tipo = (array)$section_map_value;

						foreach ($ar_component_tipo as $current_component_tipo) {
							if(in_array($current_component_tipo, $procesed_component_tipo)){

								$to_change_ddo = array_find($ar_ddo_calcutaled, function($ddo) use($current_component_tipo){
									return $ddo->tipo === $current_component_tipo;
								});
								if (is_object($to_change_ddo)) {
									$to_change_ddo->section_tipo = [...(array)$to_change_ddo->section_tipo, $current_section_tipo];
								}

							}else{
								// $column_name = end($current_column_path);
								$ddo = new dd_object();
									$ddo->set_tipo($current_component_tipo);
									$ddo->set_section_tipo($current_section_tipo);
									$ddo->set_parent( $this->get_tipo() );
									// $ddo->set_column($column_name);

								foreach ($current_column as $current_column_key => $current_column_value) {

									if($current_column_key === 'path'){
										continue;
									}
									$set_ddo_key = 'set_'.$current_column_key;
									$ddo->{$set_ddo_key}($current_column_value);
								}

								$procesed_component_tipo[] = $current_component_tipo;
								$ar_ddo_calcutaled[] = $ddo;
							}
						}
					}
				}//end foreach ($ar_section_tipo as $current_section_tipo)
				break;

			default:
				// Nothing to do
				break;
		}//end switch ($get_ddo_map->model)

		return $ar_ddo_calcutaled;
	}// end resolve_get_ddo_map()



	/**
	* GET SECTION ID
	* @param string|int|null
	*/
	public function get_section_id() : string|int|null {

		return $this->section_id ?? null;
	}//end get_section_id



	/**
	* GET_DATA_ITEM
	* Only to maintain vars and format unified
	* @param mixed $value
	* @return object $item
	*/
	public function get_data_item($value) : object {

		$item = new stdClass();
			$item->section_id			= $this->get_section_id();
			$item->section_tipo			= $this->get_section_tipo();
			$item->tipo					= $this->get_tipo();
			$item->pagination			= $this->get_pagination();
			$item->from_component_tipo	= $this->from_component_tipo ?? $this->get_tipo();
			$item->value				= $value;

		return $item;
	}//end get_data_item



	/**
	* GET_ELEMENT_LANG
	* Used to resolve component lang before construct it
	* @param string $tipo
	* @param string|null $data_lang
	* @return string lang
	* 	code like 'lg-spa'
	*/
	public static function get_element_lang( string $tipo, ?string $data_lang=null ) : string {

		if (empty($data_lang)) {
			$data_lang = DEDALO_DATA_LANG;
		}

		$translatable	= ontology_node::get_translatable($tipo);
		$lang			= ($translatable===true) ? $data_lang : DEDALO_DATA_NOLAN;

		return $lang;
	}//end get_element_lang



	/**
	* GET_SECTION_ELEMENTS_CONTEXT
	* Get list of all components available for current section using get_context_simple
	* Used to build search presets in filter, and components list in tool_export
	* @param object $options
	* {
	* 	ar_section_tipo: array|null
	* 	use_real_sections: bool = false
	* 	skip_permissions: bool = false
	* 	ar_tipo_exclude_elements: array (optional)
	* 	ar_components_exclude: array (optional)
	* }
	* @return array $context
	*/
	public static function get_section_elements_context(object $options) : array {

		// options
			$ar_section_tipo			= $options->ar_section_tipo ?? [];
			$use_real_sections			= $options->use_real_sections ?? false;
			$skip_permissions			= $options->skip_permissions ?? false;
			$caller_tipo				= $options->caller_tipo ?? null;
			$ar_tipo_exclude_elements	= $options->ar_tipo_exclude_elements ?? false;
			$ar_components_exclude		= $options->ar_components_exclude ?? [
				'component_3d',
				'component_av',
				'component_image',
				'component_pdf',
				'component_password',
				'component_security_access',
				'component_geolocation',
				'component_info',
				'component_inverse',
				'section_tab',
				//'component_filter_records',
				//'component_relation_children',
				//'component_relation_related',
				//'component_relation_parent',
				//'component_relation_index'
			];
			$ar_include_elements = $options->ar_include_elements ?? [
				'component',
				'section_group',
				'section_group_div',
				'section_tab'
			];

		// common section info
			$first_section_tipo = $ar_section_tipo[0] ?? null;
			if (empty($first_section_tipo)) {
				return [];
			}

			if ($first_section_tipo === DEDALO_TIME_MACHINE_SECTION_TIPO) {
				$section_info_elements = [];
			}else{
				$section_info_tipos = ontology_node::get_ar_tipo_by_model_and_relation(
					DEDALO_SECTION_INFO_SECTION_GROUP,
					'component',
					'children',
					false // bool search_exact
				);
				$section_info_elements = [DEDALO_SECTION_INFO_SECTION_GROUP, ...$section_info_tipos];
			}

		// Manage multiple sections
		// section_tipo can be an array of section_tipo. To prevent duplicates, check and group similar sections (like es1, co1, ..)
		$resolved_section	= [];
		$context			= [];
		foreach ((array)$ar_section_tipo as $section_tipo) {

			// store base section tipo
				$base_section_tipo = $section_tipo;

			// skip_permissions thesaurus case
				// Because some different thesaurus sections share same real section as hierarchy20
				// it's not possible control the permissions separately.
				// Use then skip_permissions as true in this cases (area_thesaurus calling 'dd100')
				if($caller_tipo===DEDALO_THESAURUS_TIPO) {
					$skip_permissions = true;
				}

			// permissions
				$section_permisions = ($skip_permissions === true)
					? 1
					: security::get_security_permissions($base_section_tipo, $section_tipo);
				// skip section if permissions are not enough (except thesaurus 'hierarchy20')
				if ( $section_permisions<1 ) {
					// user don't have access to current section. skip section
					continue;
				}

			// use_real_sections. If true, replace current section_tipo to prevent duplicates in output (thesaurus case)
				if ($use_real_sections===true) {
					$section_real_tipo = section::get_section_real_tipo_static($section_tipo);
					if (in_array($section_real_tipo, $resolved_section)) {
						continue;
					}
					$resolved_section[] = $section_real_tipo;

					// replace section_tipo value from here (!)
					$section_tipo = $section_real_tipo;
				}

			// create the section instance and get the context_simple
				$dd_section = section::get_instance(
					$section_tipo, // string section_tipo
					'list', // string list
					true // bool cache
				);

			// skip if section instance could not be created (invalid tipo or missing model)
				if ($dd_section === false) {
					debug_log(__METHOD__
						. " Skipped section '$section_tipo': instance creation failed (missing model or invalid tipo)"
						, logger::ERROR
					);
					continue;
				}

			// item context add to context
				$item_context = [
					$dd_section->get_structure_context_simple(
						$section_permisions,
						false // bool add_rqo
					)
				];
				$context = [...$context, ...$item_context];

			// section children
				$ar_elements = section::get_ar_children_tipo_by_model_name_in_section(
					$section_tipo, // section_tipo
					$ar_include_elements, // ar_include_elements
					true, // from_cache
					true, // resolve_virtual
					true, // recursive
					false, // search_exact
					$ar_tipo_exclude_elements // exclude_elements
				);

			// Add common section info elements (only if ar_elements if not empty)
				if (!empty($ar_elements)) {
					foreach ($section_info_elements as $current_section_info_el) {
						$ar_elements[] = $current_section_info_el;
					}
				}

			foreach ($ar_elements as $element_tipo) {

				// security_areas_profiles
					if($element_tipo===DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO) {
						// 'component_security_areas' removed in v6 but the component will stay in ontology,
						// PROVISIONAL, only in the alpha state of V6 for compatibility of the ontology of V5.
						continue;
					}

				// permissions (element: component, grouper)
					$element_permisions = ($skip_permissions === true)
						? 1
						: security::get_security_permissions($base_section_tipo, $element_tipo);

					// section_info_elements
						// check the section info components
						// if the user are not global_admin, the components will not showed.
						if( in_array($element_tipo, $section_info_elements) ){

							$user_id			= logged_user_id();
							$is_global_admin	= security::is_global_admin($user_id);
							if( $is_global_admin === true ){
								$element_permisions = 1;
							}
						}

					// skip element if permissions are not enough
					if ( $element_permisions<1 ) {
						// user don't have access to current element. skip element
						continue;
					}

				// model
					$model = ontology_node::get_model_by_tipo($element_tipo,true);
					if (in_array($model, $ar_components_exclude) || $model==='component_password') {
						continue;
					}
					if ($model==='section_group') {
						$legacy_model = ontology_node::get_legacy_model_by_tipo($element_tipo);
						if ($legacy_model==='section_group_div') {
							continue;
						}
					}

				// common temporal excluded/mapped models *******
					$mapped_model = isset(common::$ar_temp_map_models[$model])
						? common::$ar_temp_map_models[$model]
						: false;
					if (false!==$mapped_model) {
						debug_log(__METHOD__." +++ Mapped model $model to $mapped_model from layout map ".to_string(), logger::WARNING);
						$model = $mapped_model;
					}else if (in_array($model, common::$ar_temp_exclude_models)) {
						debug_log(__METHOD__." +++ Excluded model $model from layout map ".to_string(), logger::WARNING);
						continue;
					}

				switch (true) {

					// component case
					case (str_starts_with($model, 'component_')):
						$translatable	= ontology_node::get_translatable($element_tipo);
						$current_lang	= $translatable ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
						$element		= component_common::get_instance(
							$model,
							$element_tipo,
							null,
							'search',
							$current_lang,
							$section_tipo
						);
						break;

					// grouper case
					case (in_array($model, common::$groupers)):
						$grouper_model	= ($model==='section_group_div') ? 'section_group' : $model;
						$element		= new $grouper_model($element_tipo, $section_tipo, 'list');
						break;

					// others case
					default:
						debug_log(__METHOD__
							." Ignored model '$model' - current_tipo: '$element_tipo' "
							, logger::WARNING
						);
						break;
				}//end switch (true)

				// empty element case
					if(empty($element)){
						debug_log(__METHOD__
							." Ignored empty element !!!!".PHP_EOL
							."tipo: ".to_string($element_tipo).PHP_EOL
							."model: ".to_string($model)
							, logger::ERROR
						);
						continue;
					}

				// item context simple
					$ddo =$element->get_structure_context_simple(
						$section_permisions,
						false // bool add_rqo
					);

				// target section tipo add
					if ($model==='component_portal' || $model==='component_dataframe' || $model==='component_filter') {
						$target_section_tipo = $element->get_ar_target_section_tipo();
						$ddo->target_section_tipo = $target_section_tipo;
					}

				// component_relation_model
				// for component_relation_model section_tipo is multiple when is used in thesaurus tree ($use_real_sections===true)
				// in this case, set the ar_target_section_tipo with the resolution of the sections selected by user in the filter
				// the component will check every selected section_tipo to get his model in hierarchy section.
				// note that the component will be created with the real section
				// but it will use the ar_target_section_tipo to obtain the list of values (possible values to search)
					if( $model==='component_relation_model' && $use_real_sections===true ){

						$ar_el_target_section_tipo = [];
						// create the component with every section_tipo selected by user to obtain his model
						foreach ((array)$ar_section_tipo as $el_section_tipo) {
							$element		= component_common::get_instance(
								$model,
								$element_tipo,
								null,
								'search',
								$current_lang,
								$el_section_tipo
							);

							$ar_el_target_section_tipo = [...$ar_el_target_section_tipo, ...$element->get_ar_target_section_tipo()];
						}
						// add all target_section possibilities to the ddo
						// see in get_component_instance() in search.js
						// see get_list_of_values() in class.component_common.php
						$ddo->ar_target_section_tipo = $ar_el_target_section_tipo;
					}

					$item_context = [$ddo];

				// context add
					$context = [...$context, ...$item_context];

			}//end foreach ($ar_elements as $element_tipo)
		}//end foreach ((array)$ar_section_tipo as $section_tipo)


		return $context;
	}//end get_section_elements_context



	/**
	* GET_TOOLS
	* Resolves current element (component, section, ...) tools filtered by user permissions
	* Gets tool_common::get_user_tools and filters the tools that affect this element
	* Note that the resultant tools list is always shorter than the user full tools list
	* @return array $tools
	*/
	public function get_tools() : array {

		// debug
			if(SHOW_DEBUG===true) {
				$start_time=start_time();
				// metrics
				metrics::$get_tools_total_calls++;
			}

		// already set
			if (isset($this->tools)) {
				return $this->tools;
			}

		// autocomplete case. For speed and accessibility, return fixed value here
			$autocomplete = dd_core_api::$rqo->source->config->autocomplete ?? false;
			if ($autocomplete) {
				return [];
			}

		// cache
			$use_cache = true;
			if ($use_cache===true) {
				$cache_key = $this->tipo.'_'.($this->get_section_tipo() ?? '');
				if (isset(self::$cache_get_tools[$cache_key])) {
					if(SHOW_DEBUG===true) {
						// metrics
						metrics::$get_tools_total_calls_cached++;
					}
					return self::$cache_get_tools[$cache_key];
				}
			}

		$tools = [];

		// user_id
			$user_id = logged_user_id();
			if (empty($user_id)) {
				return $tools;
			}

		// user_tools (cached on file cache_user_tools.php)
			$user_tools	= tool_common::get_user_tools($user_id);

		// short vars
			$model				= get_class($this);
			$tipo				= $this->tipo;
			$is_component		= str_starts_with($model, 'component_');
			$properties			= $this->get_properties();
			$with_lang_versions	= $this->with_lang_versions;

		// element tools
			foreach ($user_tools as $tool) {

				$affected_tipos				= isset($tool->affected_tipos)  ? (array)$tool->affected_tipos : [];
				$affected_models			= isset($tool->affected_models) ? (array)$tool->affected_models : [];
				$requirement_translatable	= isset($tool->requirement_translatable) ? (bool)$tool->requirement_translatable : false;
				$in_properties				= $properties->tool_config->{$tool->name} ?? null;

				if(		in_array($model, $affected_models)
					||	tipo_in_array($tipo,  $affected_tipos)
					||	($is_component===true && in_array('all_components', $affected_models))
					||	!is_null($in_properties)
				  ) {

					// affected_tipos specific restriction like tool_indexation (only 'rsc36')
						if (!empty($affected_tipos[0])) {
							if(!tipo_in_array($tipo, $affected_tipos)) {
								continue;
							}
						}

					// diffusion case. Skip non diffusion defined (in Ontology) sections
						if ($tool->name==='tool_diffusion') {
							$have_section_diffusion = diffusion_utils::have_section_diffusion($tipo);
							if ($have_section_diffusion===false) {
								continue;
							}
						}

					// time machine case
						if ($tool->name==='tool_time_machine' && get_called_class()==='component_relation_children') {
							// skip tool for component_relation_children because it has no data
							continue;
						}

					// dd15 section case. Only tool_export is allowed for time machine section
						if ($this->get_section_tipo()===DEDALO_TIME_MACHINE_SECTION_TIPO && $tool->name!=='tool_export') {
							continue;
						}

					if ($requirement_translatable===true) {

						$translatable = ($is_component===true)
							? (($this->translatable===false && $with_lang_versions!==true) ? false : true)
							: false;

						if ($requirement_translatable===$translatable) {
							$tools[] = $tool;
						}

					}else{

						$tools[] = $tool;
					}
				}
			}//end foreach ($registered_tools as $tool)

		// cache
			if ($use_cache===true) {
				// static
				self::$cache_get_tools[$cache_key] = $tools;
				// Manage cache size to prevent memory leaks
				self::manage_cache_size(self::$cache_get_tools);
			}

		// debug
			if(SHOW_DEBUG===true) {
				// metrics
				$total_time_ms = exec_time_unit($start_time, 'ms');
				metrics::$get_tools_total_time += $total_time_ms;
			}


		return $tools;
	}//end get_tools



	/**
	* GET_BUTTONS_CONTEXT
	* @return array $ar_button_ddo
	* 	Array of dd_object
	*/
	public function get_buttons_context() : array {

		// already calculated
			if (isset($this->buttons_context)) {
				return $this->buttons_context;
			}

		// ar_button_ddo is array always
			$ar_button_ddo = [];

		// model validation (only areas and section are allowed)
			$model = get_called_class();
			if ($model!=='section' && !str_starts_with($model, 'area')) {
				return []; // null;
			}

		// tipo
			$tipo = $this->tipo;

		// ar_buttons_tipo
			$ar_buttons_tipo = (get_called_class()==='section')
				? $this->get_section_buttons_tipo()
				: ontology_node::get_ar_tipo_by_model_and_relation($tipo, 'button_', 'children', false);

		// ar_button_objects create
			foreach ($ar_buttons_tipo as $current_button_tipo) {

				// permissions
					$permissions = common::get_permissions($tipo, $current_button_tipo);
					if($permissions<2) {
						continue;
					}

				// model
					$model = ontology_node::get_model_by_tipo($current_button_tipo, true);
					// skip exclude_models
					if(in_array($model, common::$ar_temp_exclude_models)){
						continue;
					}

				// label $term, $lang=NULL, $from_cache=false, $fallback=true
					$button_label = ontology_node::get_term_by_tipo($current_button_tipo, DEDALO_APPLICATION_LANG, true, true);

				// properties
					$ontology_node		= ontology_node::get_instance($current_button_tipo);
					$button_properties	= $ontology_node->get_properties();
					if(isset($button_properties->disable) && $button_properties->disable === true ){
						continue;
					}

				// button_import and button_trigger cases for compatibility with v5 ontology
				// in future version will be merge both with new model button_tool
				// in the mid-time use button_trigger for general cases to dispatch tools.
					$tools = null;
					if($model==='button_import' || $model==='button_trigger'){

						// tools_list
						// (!) Use here the full list of user tools,
						// not the filtered version for '$this->get_tools'
						$tools_list	= tool_common::get_user_tools( logged_user_id() );

						$tools = [];
						foreach ($tools_list as $tool_object) {

							// get the tool_config definition in the ontology
							// the tool_config has the tool_name to identify the tool
							// get the definition that match with the current button.
							$tool_config = isset($button_properties->tool_config->{$tool_object->name})
								? $button_properties->tool_config->{$tool_object->name}
								: null;

							// specific tool config in registered tools or tool configuration
							// when the tool has a specific properties in the register or in his configuration records
							// overwrite the ontology properties with them
							// flow of overwrite: the most specific overwrite the most generic
							//
							// configuration -> configuration register -> ontology
							// 1 if the configuration isset use it
							// 2 else get the configuration in register, if isset use it
							// 3 else get the ontology properties

							// get the config, get_config check is the specific configuration isset
							// else get the configuration in register record
								$tool_config_options = new stdClass();
									$tool_config_options->tool_name		= $tool_object->name;
									$tool_config_options->tipo			= $current_button_tipo;
									$tool_config_options->section_tipo	= $tipo;

								$specific_tool_config = tool_common::get_tool_configuration(
									$tool_config_options,
									$tool_object->tool_config // already cached tool_config value
								);

							// if the configuration was defined, replace the ddo_map of the ontology with it.
								if( is_object($specific_tool_config) && isset($specific_tool_config->ddo_map) ){
									if (!isset($tool_config)) {
										$tool_config = new stdClass();
									}
									$tool_config->ddo_map = $specific_tool_config->ddo_map;
								}

							if(!isset($tool_config)) continue;

							$current_section_tipo	= $this->get_section_tipo() ?? $this->tipo;
							$tool_context			= tool_common::create_tool_simple_context(
								$tool_object,
								$tool_config,
								$this->tipo,
								$current_section_tipo
							);

							$tools[] = $tool_context;
						}//end foreach ($tools_list as $item)
					}//end if($model === 'button_import')

				// button object
					$button_obj = new dd_object();
						$button_obj->set_type('button');
						$button_obj->set_tipo($current_button_tipo);
						$button_obj->set_model($model);
						$button_obj->set_label($button_label);
						$button_obj->set_properties($button_properties);
						$button_obj->set_tools($tools);

				// add button ddo
				$ar_button_ddo[] = $button_obj;
			}//end foreach ($ar_buttons_tipo as $current_button_tipo)

		// fix value
			$this->buttons_context = $ar_button_ddo;


		return $ar_button_ddo;
	}//end get_buttons_context



	/**
	* GET_COLUMNS_MAP
	* Columns_map define the order and how the section or component will build the columns in list, the columns maps was defined in the properties.
	* @return array|null $columns_map
	*/
	public function get_columns_map() : ?array {

		$mode = $this->get_mode();
		$tipo = $this->get_tipo();

		// get the properties, if the mode is list, get the child term 'section_list' that had has the configuration of the list (for sections and portals)
		// by default or edit mode get the properties of the term itself.
			switch ($mode) {
				case 'list':
				case 'tm':
				// case 'portal_list':
					// in the case that section_list is defined
					$ar_terms = (array)ontology_node::get_ar_tipo_by_model_and_relation($tipo, 'section_list', 'children', true);
					if(isset($ar_terms[0])) {
						# Use found related terms as new list
						$current_term	= $ar_terms[0];
						$ontology_node	= ontology_node::get_instance($current_term);
						$properties		= $ontology_node->get_properties();
					}
					else{
						// sometime the portals don't has section_list defined, in these cases get the properties of the current tipo
						$properties	= $this->get_properties();
					}
					break;

				default:
					// edit mode or components without section_list defined (other than portals or sections)
					$properties	= $this->get_properties();
					break;
			}

		$columns_map = $properties->source->columns_map ?? null;


		return $columns_map;
	}//end get_columns_map



	/**
	* GET_AR_INVERTED_PATHS
	* Resolve the unique and isolated paths into the ddo_map with all dependencies (portal into portals, portals into sections, etc)
	* get the path in inverse format, the last in the chain will be the first object [0]
	* @return array ar_inverted_paths the the specific paths, with inverse path format.
	* (!) Commented because nobody calls it (21-11-2022)
	*/
		// public function get_ar_inverted_paths(array $full_ddo_map) : array {

		// 	// get the parents for the column, creating the inverse path
		// 	// (from the last component to the main parent, the column will be with the data of the first item of the column)
		// 		if (!function_exists('get_parents')) {
		// 			function get_parents($ar_ddo, $dd_object) {
		// 				$ar_parents = [];

		// 				$parent = array_find($ar_ddo, function($item) use($dd_object){
		// 					return $item->tipo===$dd_object->parent;
		// 				});
		// 				if (!empty($parent)) {
		// 					$ar_parents[]	= $parent;
		// 					$new_parents	= get_parents($ar_ddo, $parent);
		// 					$ar_parents[]	= array_merge($ar_parents, $new_parents);
		// 				}

		// 				return $ar_parents;
		// 			}
		// 		}

		// 	// every ddo will be checked if it is a component_portal or if is the last component in the chain
		// 	// set the valid_ddo array with only the valid ddo that will be used.
		// 		$ar_inverted_paths = [];
		// 		$ddo_length = count($full_ddo_map);
		// 		for ($i=0; $i < $ddo_length; $i++) {

		// 			$current_ddo = $full_ddo_map[$i];
		// 			// check if the current ddo has children associated, it's necessary identify the last ddo in the path chain, the last ddo create the column
		// 			// all parents has the link and data to get the data of the last ddo.
		// 			// interview -> people to study -> name
		// 			// «name» will be the column, «interview» and «people under study» has the locator to get the data.
		// 			$current_ar_valid_ddo = array_find($full_ddo_map, function($item) use($current_ddo){
		// 				return $item->parent === $current_ddo->tipo;
		// 			});
		// 			if(!empty($current_ar_valid_ddo)) continue;
		// 			$column = [];

		// 			// get the path with inverse order
		// 			// people to study -> interview
		// 			$parents = get_parents($full_ddo_map, $current_ddo);

		// 			// join all with the inverse format
		// 			// name -> people to study -> interview
		// 			$column[]				= $current_ddo;
		// 			$column					= array_merge($column, $parents);
		// 			$ar_inverted_paths[]	= $column;
		// 		}

		// 	return $ar_inverted_paths;
		// }//end get_ar_inverted_paths



	/**
	* SET_VIEW
	* @return void
	*/
	public function set_view(?string $view) : void {

		$this->view = $view;
	}//end set_view



	/**
	* GET_VIEW
	* @return string|null $view
	*/
	public function get_view() : ?string {

		// When view is injected by ddo_map
			if(isset($this->view)) {
				return $this->view;
			}

		// list mode
			if ($this->mode==='list' &&
				(str_starts_with(get_called_class(), 'component_') || get_called_class()==='section')){
				// section list
				$ar_terms = (array)ontology_node::get_ar_tipo_by_model_and_relation(
					$this->tipo,
					'section_list',
					'children',
					true
				);
				if(isset($ar_terms[0])) {
					$current_term	= $ar_terms[0];
					$ontology_node	= ontology_node::get_instance($current_term);
					$properties		= $ontology_node->get_properties();
					if( isset($properties->view) ) {
						return $properties->view;
					}
				}
			}

		// properties defined case
			$properties = $this->get_properties();
			if( isset($properties->view) ) {
				return $properties->view;
			}

		// resolve legacy models and exceptions
			$options = new stdClass();
				$options->model	= $this->get_model();
				$options->tipo	= $this->get_tipo();

			$view = common::resolve_view($options);


		return $view;
	}//end get_view



	/**
	* RESOLVE_VIEW
	* @param object $options
	* @return string|null $view
	*/
	public static function resolve_view(object $options) : ?string {

		// options
			$model	= $options->model;
			$tipo	= $options->tipo;

		// non relation components cases as 'component_input_text'
			$components_to_change = [
				'component_portal',
				'component_text_area'
			];

		// relation components like 'component_portal'
			$legacy_model = (in_array($model, $components_to_change))
				? ontology_node::get_legacy_model_by_tipo($tipo)
				: $model;

		// view
			switch ($legacy_model) {
				case 'component_portal':
					$view = 'default';
					break;
				case 'component_relation_children':
				case 'component_relation_parent':
				case 'component_relation_index':
				case 'component_relation_related':
				case 'component_autocomplete':
				case 'component_autocomplete_hi':
					$view = 'line';
					break;
				case 'component_html_text':
					$view = 'html_text';
					break;
				default:
					$view = null;
					break;
			}

		return $view;
	}//end resolve_view



	/**
	* GET_CHILDREN_VIEW
	* @return string|null $children_view
	*/
	public function get_children_view() : ?string {

		// When view is injected by ddo_map
			if(isset($this->children_view)){
				return $this->children_view;
			}

		// properties defined case
			$properties = $this->get_properties();
			if(isset($properties->children_view)){
				return $properties->children_view;
			}

		// based on legacy_model
			$legacy_model = ontology_node::get_legacy_model_by_tipo($this->get_tipo());
			switch ($legacy_model) {
				case 'component_relation_children':
				case 'component_relation_parent':
				case 'component_relation_index':
				case 'component_relation_related':
				case 'component_autocomplete':
				case 'component_autocomplete_hi':
					$children_view = 'text';
					break;
				default:
					$children_view = null;
					break;
			}

		return $children_view;
	}//end get_children_view



	/**
	* RESOLVE_LIMIT
	* @return int|null
	*/
	public function resolve_limit() : ?int {

		// properties check for request_config
		$properties = $this->get_properties();
		if (!property_exists($properties, 'source') ||
			!property_exists($properties->source, 'request_config')
			) {
			return null;
		}

		$request_config			= $properties->source->request_config ?? [];
		$request_config_item	= array_find($request_config, function($el){
			return $el->api_engine==='dedalo';
		});

		if (!is_object($request_config_item)) {
			return null;
		}

		// sqo try
		if (isset($request_config_item->sqo) && isset($request_config_item->sqo->limit)) {
			return (int)$request_config_item->sqo->limit;
		}

		// show try
		if (isset($request_config_item->show->sqo_config) && isset($request_config_item->show->sqo_config->limit)) {
			return (int)$request_config_item->show->sqo_config->limit;
		}


		return null;
	}//end resolve_limit



	/**
	 * WARNING INVALID TIPO
	 * Its used to prevent to show the same warning multiple times.
	 * @param string $tipo
	 * @param string|null $expected_model
	 */
	private function warning_invalid_tipo(string $tipo, ?string $expected_model=null) : void {

		static $warning_invalid_tipo_cache;
		if(isset($warning_invalid_tipo_cache[$tipo])){
			return;
		}

		debug_log(__METHOD__
			. " WARNING. Ignored non valid $expected_model. Maybe the TLD is not installed. " . PHP_EOL
			. ' tipo: ' . to_string($tipo)
			. ' expected_model: ' . to_string($expected_model)
			, logger::WARNING
		);

		$warning_invalid_tipo_cache[$tipo] = true;
	}//end warning_invalid_tipo



}//end class common
