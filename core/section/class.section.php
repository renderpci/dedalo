<?php declare(strict_types=1);
/**
* CLASS SECTION
*
* data_column_name : 'data'
*/
class section extends common {



	/**
	* CLASS VARS
	*/

		/**
		 * Array of button elements associated with this section.
		 * Populated during rendering based on section configuration and user permissions.
		 * @var ?array $ar_buttons
		 */
		public ?array $ar_buttons = null;

		/**
		 * List of all project languages available for this section.
		 * Used for multilingual content management and language switching.
		 * @var ?array $ar_all_project_langs
		 */
		public ?array $ar_all_project_langs = null;

		/**
		 * Whether to display the inspector panel for this section.
		 * Controls visibility of metadata and debugging information in the UI.
		 * @var bool $show_inspector
		 */
		public bool $show_inspector = true;

		/**
		 * Whether this section is a virtual section (ontology-based alias).
		 * Virtual sections map to a real section type for storage but have their own ontology definition.
		 * @var bool $section_virtual
		 */
		public bool $section_virtual = false;

		/**
		 * The real section tipo (type identifier) when this is a virtual section.
		 * Points to the actual section where data is stored in the database.
		 * @var ?string $section_real_tipo
		 */
		public ?string $section_real_tipo = null;

		/**
		 * Whether this section instance is temporary (e.g., 'temp1').
		 * Temp sections use 'session' save_handler and are not persisted to the database.
		 * @var bool $is_temp
		 */
		public bool $is_temp = false;

		/**
		 * Generic options object passed during instantiation.
		 * Allows flexible configuration without changing the constructor signature.
		 * @var ?object $options
		 */
		public ?object $options = null;

		/**
		 * Storage backend for this section: 'database' (default) or 'session'.
		 * Automatically switches to 'session' when section_id is a temp identifier (e.g., 'temp1').
		 * @var string $save_handler
		 */
		public string $save_handler = 'database';

		/**
		 * Static cache holding section instances to prevent duplicate object creation (singleton pattern).
		 * Cleared by clear() to prevent memory leaks across worker requests.
		 * @var array $ar_section_instances
		 */
		public static array $ar_section_instances = [];

		/**
		 * Whether this section has been modified since last save.
		 * Used by save logic to skip unnecessary database writes.
		 * @var bool $save_modified
		 */
		public bool $save_modified = true;

		/**
		 * The full database record object with all columns (id, section_tipo, section_id, data, etc.).
		 * Injected after load or directly assigned for performance in bulk operations.
		 * @var ?object $record
		 */
		public ?object $record = null;

		/**
		 * Name of the JSONB column where component data is stored in the database.
		 * Typically 'data' for standard sections. Defined per component context.
		 * @var ?string $data_column_name
		 */
		public ?string $data_column_name = null;

		/**
		 * Time Machine context data for tracking changes.
		 * Array of temporal metadata used by the time machine versioning system.
		 * @var ?array $tm_context
		 */
		public ?array $tm_context = null;

		/**
		 * Instance of JSON_RecordObj_matrix containing the raw section data source from the database.
		 * Provides direct access to the underlying JSONB record before object hydration.
		 * @var ?object $JSON_RecordObj_matrix
		 */
		protected ?object $JSON_RecordObj_matrix = null;

		/**
		 * Array of section_record instances belonging to this section.
		 * Used in list mode to iterate over records matching the current filter.
		 * @var array $section_records
		 */
		protected array $section_records = [];

		/**
		 * Static cache mapping section tipos to their child component tipos.
		 * Avoids repeated ontology lookups for section structure.
		 * @var array $cache_ar_children_tipo
		 */
		public static array $cache_ar_children_tipo = [];

		/**
		 * Static cache for resolved section map structures.
		 * Stores parsed section definitions to avoid re-processing ontology maps.
		 * @var array $section_map_cache
		 */
		public static array $section_map_cache = [];

		/**
		* CLEAR
		* Purges persistent caches to prevent memory leaks across worker requests.
		*/
		public static function clear() : void {
			self::$ar_section_instances = [];
			self::$cache_ar_children_tipo = [];
			self::$section_map_cache = [];
		}


	/**
	* GET_INSTANCE
	* Cache section instances (singleton pattern)
	* @param string $tipo
	* @param string|null $mode = 'list'
	* @param bool $cache = true
	* @param object|null $caller_dataframe = null
	* @return object|false $section
	* Returns false if the section cannot be created
	*/
	public static function get_instance( string $tipo, string $mode='list', bool $cache=true, ?object $caller_dataframe=null ) : section|false {

		// tipo check model (only section is expected)
			$model = ontology_node::get_model_by_tipo( $tipo, true );
			if(empty($model)) {
				$msg = " Error. model is empty for tipo: '$tipo'. Unable to create a section";
				debug_log(__METHOD__
					. $msg
					, logger::ERROR
				);
				return false;
			}else
			if ($model!=='section') {
				debug_log(__METHOD__
					. ' Expected model of tipo '.$tipo.' is section, but received is ' . PHP_EOL
					. ' model: ' . to_string($model)
					, logger::ERROR
				);
				return false;
			}

		// cache
			// $cache = false;

		// cache is false case. Use always (cache=false) in imports (!). Not cache new sections (without section_id)
			if ($cache===false || $mode==='update' || $mode==='tm') {

				// instance new section
				$section = new section($tipo, $mode);
				// dataframe case
				if(isset($caller_dataframe)){
					$section->set_caller_dataframe($caller_dataframe);
				}

				return $section;
			}//end if ($cache===false || empty($section_id))

		// cache is true case. Get cache instance if it exists. Otherwise, create a new one
			// cache overload
				$max_cache_instances	= 1200;
				$cache_slice_on			= 400;
				$total					= count(self::$ar_section_instances);
				if ( $total > $max_cache_instances ) {
					// new array
					$new_array = [];
					$i = 1;
					foreach (self::$ar_section_instances as $inst_key => $inst_value) {
						if ($i > $cache_slice_on) {
							$new_array[$inst_key] = $inst_value;
						}else{
							$i++;
						}
					}
					// replace matrix_instances array
					self::$ar_section_instances = $new_array;
				}

			// find current instance in cache
				$cache_key = implode('_', [$tipo, $mode]);
				if(isset($caller_dataframe)){
					$cache_key .= '_dataframe_'.$caller_dataframe->section_tipo_key.'_'.$caller_dataframe->section_id_key.'_'.$caller_dataframe->main_component_tipo;

				}
				if ( !isset(self::$ar_section_instances[$cache_key]) ) {
					self::$ar_section_instances[$cache_key] = new section( $tipo, $mode );
					// dataframe case
					if(isset($caller_dataframe)) {
						self::$ar_section_instances[$cache_key]->set_caller_dataframe($caller_dataframe);
					}
					// Manage cache size to prevent memory leaks (using inherited method)
					self::manage_cache_size(self::$ar_section_instances);
				}


		return self::$ar_section_instances[$cache_key];
	}//end get_instance



	/**
	* CONSTRUCT
	* Extends parent abstract class common
	* @param string $tipo
	* @param string|null $mode = 'edit'
	*/
	private function __construct( string $tipo, string $mode ) {

		// uid
			$this->uid = to_string( hrtime(true) ); // nanoseconds

		// Set general vars
			$this->lang			= DEDALO_DATA_NOLAN;
			$this->tipo			= $tipo;
			$this->mode			= $mode;

		// Column data name
			$this->data_column_name = section_record_data::get_column_name( get_called_class() );

		// Section records instances
			$this->section_records = [];

		// load_structure_data. When tipo is set, calculate structure data
			parent::load_structure_data();

		// pagination. Set defaults
			$this->pagination = new stdClass();
				$this->pagination->offset	= 0;
				$this->pagination->limit	= null;
	}//end __construct



	/**
	* CREATE_RECORD
	* Create new section record in matrix
	* @param object|null $options = null
	* {
	*   component_filter_data : array|null
	*   values : object|null
	* }
	* @return int|null $section_id
	*/
	public function create_record( ?object $options=null ) : int|false {
		$start_time = start_time();

		if(SHOW_DEBUG===true) {
			// metrics
				metrics::$section_save_total_calls++;
		}

		// Options
			// Project Inheritance. When a new section is created from a component_portal
			// the main section project is injected into the new section
			// because the projects from the main section needs to be the same.
			$component_filter_data = $options->component_filter_data ?? null;

			// values, inject a given values into new section record
			$values = $options->values ?? null;

			// section_id, force creation with specific section_id (import processes)
			$section_id = isset($options->section_id) ? (int)$options->section_id : null;

		// Tipo. Current section tipo
			$tipo = $this->get_tipo();

		// User id. Current logged user id
			$user_id = logged_user_id();

		// Column to store section data
			$data_column_name = $this->get_data_column_name();

		// These processes are for all sections except Activity section
		// Activity section is the logger section and this process is not correct.
		// All other sections has Time Machine, uses projects data and uses caches.
			if( $tipo===DEDALO_ACTIVITY_SECTION_TIPO ) {
				debug_log(__METHOD__
					. " Error to create a new section record, this section is an Activity section that can not be handle here! " . PHP_EOL
					. " section_tipo: " .$tipo
					, logger::ERROR
				);
				return false;
			}

		// 1. Create new record
			// Section record
			// To create the new record in the DDBB
			$section_record	= section_record::create( $tipo, $section_id, $values );
			if(!$section_record) {
				debug_log(__METHOD__
					. " Error to create a new section record " . PHP_EOL
					. " section_tipo: " .$tipo . PHP_EOL
					. " values: " .json_encode($values)
					, logger::ERROR
				);
				return false;
			}
			$section_id	= $section_record->section_id;

			// Check error when new record was created
			if( $section_id===false ){
				debug_log(__METHOD__
					. " Error to create a new section record " . PHP_EOL
					. " section_tipo: " .$tipo
					, logger::ERROR
				);

				return false;
			}
			// Store the section record instance
			$this->add_section_record( $section_record );

		// 2. Save section data
			// Section data
			// When section is created at first time, a basic data is set to write into the new section.
			$section_data = (object)[
				'section_id'			=> (int)$section_id,
				'section_tipo'			=> (string)$tipo,
				'label'					=> (string)ontology_node::get_term_by_tipo($tipo,null,true),
				'created_by_user_id'	=> (int)$user_id,
				'created_date'			=> dd_date::get_timestamp_now_for_db(), // Format 2012-11-05 19:50:44
				'diffusion_info'		=> null, // null by default
			];

			// Save data of the section
			$saved_data = $section_record->save_column(
				$data_column_name,
				$section_data
			);

			// Check an error saving data into the new record
			if( $saved_data===false ){
				debug_log(__METHOD__
					. " Error to create a new section record " . PHP_EOL
					. " section_tipo: " .$tipo. PHP_EOL
					. " section_id: " .$section_id
					, logger::ERROR
				);

				return false;
			}

			// Update modified section data. After set section data, resolve and add creation date and user to current section data
			$section_record->update_modified_section_data((object)[
				'mode' => 'new_record'
			]);

		// 3. Log the creation process
			// Logger activity
				logger::$obj['activity']->log_message(
					'NEW', // string $message
					logger::INFO, // int $log_level
					$tipo, // string $tipo_where
					null, // string $operations
					[ // associative array datos
						'msg'			=> 'Created section record',
						'section_id'	=> $section_id,
						'section_tipo'	=> $tipo,
						'tipo'			=> $tipo,
						'table'			=> common::get_matrix_table_from_tipo($tipo)
					],
					$user_id // int
				);

		// 4. Set defaults project data (dd153)
			$this->set_projects_to_new_section_record( $section_id, $component_filter_data );

		// 5. Reset caches
			switch ($tipo) {

				case DEDALO_REQUEST_CONFIG_PRESETS_SECTION_TIPO:
					request_config_presets::clean_cache();
					break;

				case DEDALO_REGISTER_TOOLS_SECTION_TIPO:
					tools_register::clean_cache();
					break;

				case DEDALO_SECTION_PROJECTS_TIPO:
					filter::clean_cache(
						$user_id, // user id. Current logged user id
						DEDALO_FILTER_MASTER_TIPO // dd170
					);
					break;

				default:
					// no cache to delete here
					break;
			}

		// 6. Debug
			if(SHOW_DEBUG===true) {

				$total_time_ms = exec_time_unit($start_time, 'ms');

				// metrics
					metrics::$section_save_total_time += $total_time_ms;

				debug_log(__METHOD__
					." Create new section finish: ($tipo - $section_id) in time: ".$total_time_ms.' ms'
					, logger::DEBUG
				);
			}


		return $section_id;
	}//end create_record



	/**
	* ADD_SECTION_RECORD
	* Storage section_record given into the section_records instances
	* The array will replace the section_record with the same section_id
	* @param section_record $section_record
	* @return void
	*/
	public function add_section_record( section_record $section_record ) : void {
		$this->section_records[$section_record->section_id] = $section_record;
	}//end add_section_record



	/**
	* REMOVE_SECTION_RECORD
	* Remove section_record given from the section_records instances
	* Will be deleted the section_record given with the same section_id if exist
	* @param section_record $section_record
	* @return void
	*/
	public function remove_section_record( section_record $section_record ) : void {
		if( isset($this->section_records[$section_record->section_id]) ){
			unset( $this->section_records[$section_record->section_id] );
		}
	}//end remove_section_record



	/**
	* SET_PROJECTS_TO_NEW_SECTION_record
	* Assign the project to new sections, it could be inheritance from caller section
	* @param int $section_id
	* @param array|null $component_filter_data
	*/
	private function set_projects_to_new_section_record( int $section_id, ?array $component_filter_data ) {

		// tipo. Current section tipo
			$tipo = $this->get_tipo();

		// user id. Current logged user id
			$user_id = logged_user_id();

		// Projects set defaults data (dd153)
			if ($tipo===DEDALO_SECTION_PROJECTS_TIPO) {

				// Auto authorize this project for current user
				// If this newly created section is a project, the new project is added as authorized to the user who created it.
				// User currently logged in
					$component_filter_master = component_common::get_instance(
						'component_filter_master',
						DEDALO_FILTER_MASTER_TIPO, // dd170
						$user_id,
						'edit',
						DEDALO_DATA_NOLAN,
						DEDALO_SECTION_USERS_TIPO // dd153
					);
					$data_filter_master = $component_filter_master->get_data();

					$filter_master_locator = new locator();
						$filter_master_locator->set_section_id($section_id);
						$filter_master_locator->set_section_tipo(DEDALO_FILTER_SECTION_TIPO_DEFAULT);
						$filter_master_locator->set_type(DEDALO_RELATION_TYPE_FILTER);
						$filter_master_locator->set_from_component_tipo(DEDALO_FILTER_MASTER_TIPO);
					$data_filter_master[] = $filter_master_locator; // Add locator to dato

					$component_filter_master->set_data($data_filter_master);
					$component_filter_master->Save();
					debug_log(__METHOD__
						.' Added locator from section save to component_filter_master ' . PHP_EOL
						.' User filter caches will be deleted to force refresh the data ' . PHP_EOL
						.' user_id: ' .$user_id. PHP_EOL
						.' filter_master_locator: ' . to_string($filter_master_locator)
						, logger::DEBUG
					);
					// (!) Note that component_filter_master force refresh user projects caches on save

			}else{

				// Filter defaults.
				// Note that portal already saves inherited project to new created section
				// To prevent to saves twice, only set default project when not is a portal call to create new record

				// Default project for create standard sections
				// When a section record is created, it is auto assigned the default project (defined in config DEDALO_DEFAULT_PROJECT)
				// when the section has a 'component_filter' defined
				$ar_tipo_component_filter = section::get_ar_children_tipo_by_model_name_in_section(
					$tipo,
					['component_filter'],
					true, // from_cache
					true, // resolve_virtual
					true, // recursive
					true, // search_exact
					[] // ar_tipo_exclude_elements
				);
				if (empty($ar_tipo_component_filter[0])) {

					// section without project case (list of values mainly)
					debug_log(__METHOD__
						." Ignored set project default in section without component_filter: $tipo" . PHP_EOL
						.' section_tipo: ' . $tipo . PHP_EOL
						.' section label ' . ontology_node::get_term_by_tipo($tipo, DEDALO_APPLICATION_LANG)
						, logger::WARNING
					);

				}else{

					if (!empty($component_filter_data)) {

						// custom projects dato passed
						// set the component_filter with the dato sent by the caller (portals)
						$component_filter = component_common::get_instance(
							'component_filter',
							$ar_tipo_component_filter[0],
							$section_id,
							'list', // Important 'list' to avoid auto save default value !!
							DEDALO_DATA_NOLAN,
							$tipo
						);
						$component_filter->set_data( $component_filter_data );
						$component_filter->Save();

					}else{

						// default case

						// When component_filter is called in edit mode, the component check if data is empty and if is,
						// add default user project and save it
						// (!) Note that construct component_filter in edit mode, saves default value too. Here, current section is saved again
						$component_filter = component_common::get_instance(
							'component_filter',
							$ar_tipo_component_filter[0],
							$section_id,
							'edit', // Important edit !! // Already saves default project when load in edit mode
							DEDALO_DATA_NOLAN,
							$tipo
						);
						// note that section is auto-saved here
					}
				}//end if (empty($ar_tipo_component_filter[0]))

			}//end if ($this->tipo===DEDALO_SECTION_PROJECTS_TIPO)

	}//end set_projects_to_new_section_record




	/**
	* GET_SECTION_REAL_TIPO
	* Resolves current section real tipo if is a virtual section
	* @return string $section_real_tipo
	*/
	public function get_section_real_tipo() : string {

		if(isset($this->section_real_tipo)) {
			return $this->section_real_tipo;
		}

		$section_real_tipo = section::get_section_real_tipo_static( $this->tipo );
		if ($section_real_tipo!==$this->tipo) {
			// Fix section_real_tipo
			$this->section_real_tipo	= $section_real_tipo;
			$this->section_virtual		= true;
		}else{
			// Fix section_real_tipo
			$this->section_real_tipo	= $section_real_tipo;
			$this->section_virtual		= false;
		}

		return $section_real_tipo;
	} //end get_section_real_tipo



	/**
	* GET_SECTION_REAL_TIPO_STATIC
	* Resolves current section real tipo if is a virtual section statically
	* @param string $section_tipo
	* @return string $section_real_tipo
	*	If there is no related section, the same section_tipo is returned.
	*/
	public static function get_section_real_tipo_static(string $section_tipo) : string {

		$ar_related = common::get_ar_related_by_model(
			'section', // string model_name
			$section_tipo
		);

		$section_real_tipo = $ar_related[0] ?? $section_tipo;


		return $section_real_tipo;
	}//end get_section_real_tipo_static



	/**
	* GET_SECTION_AR_CHILDREN_TIPO
	* @param string $section_tipo
	* @param array $ar_model_name_required
	* @param bool $from_cache
	*	default true
	* @param bool $resolve_virtual
	*	Force resolve section if is virtual section. default false
	*	Name of desired filtered model array. You can use partial name like 'component_' (string position search is made it)
	* @return array $section_ar_children_tipo
	*/
	public static function get_ar_children_tipo_by_model_name_in_section(
			string $section_tipo,
			array $ar_model_name_required,
			bool $from_cache=true,
			bool $resolve_virtual=false, // (!) keep default resolve_virtual=false
			bool $recursive=true,
			bool $search_exact=false,
			array|false $ar_tipo_exclude_elements=false,
			?array $ar_exclude_models=null
		) : array {


		$cache_uid = implode('_', [
			$section_tipo,
			implode('|', $ar_model_name_required),
			(int)$resolve_virtual,
			(int)$recursive,
			(int)$search_exact,
			md5(serialize($ar_tipo_exclude_elements)),
			md5(serialize($ar_exclude_models))
		]);
		if ($from_cache && isset(self::$cache_ar_children_tipo[$cache_uid])) {
			return self::$cache_ar_children_tipo[$cache_uid];
		}

		$ar_elements_to_be_exclude = [];

		#
		# RESOLVE_VIRTUAL : Resolve virtual section to real
		if($resolve_virtual === true) {

			# ORIGINAL TIPO : always keeps the original type (current)
			$original_tipo = $section_tipo;

			# SECTION VIRTUAL
			$section_real_tipo = section::get_section_real_tipo_static($section_tipo);

			if($section_real_tipo!==$original_tipo) {
				// Overwrite current section tipo with real section tipo
				$section_tipo = $section_real_tipo;
			}//end if($section_real_tipo!=$original_tipo) {

			# EXCLUDE ELEMENTS
			if ($ar_tipo_exclude_elements===false) {
				$ar_tipo_exclude_elements = ontology_node::get_ar_tipo_by_model_and_relation(
					$original_tipo, // string tipo
					'exclude_elements', // string model_name
					'children', // string relation_type
					true // $search_exact // bool search_exact
				);
			}

			$tipo_exclude_elements = $ar_tipo_exclude_elements[0] ?? false;
			if ($tipo_exclude_elements) {
				$ar_elements_to_be_exclude	= ontology_node::get_relation_nodes(
					$tipo_exclude_elements,
					false, // bool cache
					true // bool simple
				);
				foreach ($ar_elements_to_be_exclude as $element_tipo) {
					$additional_excludes = [];
					$model_name = ontology_node::get_model_by_tipo($element_tipo, true);
					if($model_name==='section_group' || $model_name === 'section_tab' || $model_name === 'tab') {
						$ar_recursive_children	= section::get_ar_recursive_children($element_tipo, $ar_exclude_models);
						$additional_excludes	= [...$additional_excludes, ...$ar_recursive_children];
					}
					$ar_elements_to_be_exclude = [...$ar_elements_to_be_exclude, ...$additional_excludes];
				}//end foreach ($ar_elements_to_be_exclude as $key => $element_tipo)
			}
		}//end if($resolve_virtual)

		$tipo						= $section_tipo;
		$section_ar_children_tipo	= array();


		// we obtain the child elements of this section
		if (count($ar_model_name_required)>1) {

			if (true===$recursive) { // Default is recursive
				$ar_recursive_children = section::get_ar_recursive_children($tipo, $ar_exclude_models);
			}else{
				$ontology_node			= ontology_node::get_instance($tipo);
				$ar_recursive_children	= $ontology_node->get_ar_children_of_this();
			}

		}else{

			switch (true) {
				// Components are searched recursively
				case (strpos($ar_model_name_required[0], 'component')!==false && $recursive!==false):
					$ar_recursive_children = section::get_ar_recursive_children($tipo, $ar_exclude_models);
					break;
				// Others (section_xx, buttons, etc.) are in the first level
				default:
					$ontology_node			= ontology_node::get_instance($tipo);
					$ar_recursive_children	= $ontology_node->get_ar_children_of_this();
					break;
			}
		}

		if( empty($ar_recursive_children) ) {
			// throw new Exception(__METHOD__." ar_recursive_children is empty! This section don't have: '$model_name_required' ");
			// debug_log(__METHOD__." ar_recursive_children is empty! This section id=$parent don't have: '$model_name_required' ". __METHOD__ );
			return $section_ar_children_tipo; # return empty array
		}

		// unset the exclude elements of the virtual section to the original section
		if($resolve_virtual === true) {
			$ar_recursive_children = array_diff($ar_recursive_children, $ar_elements_to_be_exclude);
		}

		// Filter children by models
		$section_ar_children_tipo = self::filter_children_by_models(
			$ar_recursive_children,
			$ar_model_name_required,
			$search_exact
		);

		// cache. Store in cache for speed
			self::$cache_ar_children_tipo[$cache_uid] = $section_ar_children_tipo;
			// Manage cache size to prevent memory leaks (using inherited method)
			self::manage_cache_size(self::$cache_ar_children_tipo);


		return $section_ar_children_tipo;
	}//end get_ar_children_tipo_by_model_name_in_section



	/**
	 * FILTER_CHILDREN_BY_MODELS
	 * Filter children by models in section
	 * @param array $ar_recursive_children
	 * @param array $ar_model_name_required
	 * @param bool $search_exact
	 * @return array
	 */
	private static function filter_children_by_models(
		array $ar_recursive_children,
		array $ar_model_name_required,
		bool $search_exact
		): array {

		$result = [];
		$result_keys = []; // For O(1) lookups

		foreach($ar_recursive_children as $current_tipo) {
			if (isset($result_keys[$current_tipo])) {
				continue; // Already added
			}

			$model_name = ontology_node::get_model_by_tipo($current_tipo, true);

			foreach($ar_model_name_required as $model_name_required) {
				$matches = $search_exact
					? ($model_name === $model_name_required)
					: str_contains($model_name, $model_name_required);

				if ($matches) {
					$result[] = $current_tipo;
					$result_keys[$current_tipo] = true;
					break; // Found match, no need to check other required models
				}
			}
		}

		return $result;
	}//end filter_children_by_models



	/**
	* GET_AR_RECURSIVE_CHILDREN : private alias of ontology_node::get_ar_recursive_children
	* Note the use of $ar_exclude_models to exclude not desired section elements, like auxiliary sections in ich
	* @param string $tipo
	* @param array|null $ar_exclude_models = null
	* @return array $ar_recursive_children
	*/
	public static function get_ar_recursive_children( string $tipo, ?array $ar_exclude_models=null ) : array {

		# AR_EXCLUDE_MODELS
		$default_ar_exclude_models = [
			'box elements',
			'area',
			'component_semantic_node' // used in v5 but unused in v6
		];

		# Current elements and children are not considerate part of section and must be excluded in children results
		$exclude_models = !empty($ar_exclude_models)
			? [...$default_ar_exclude_models, ...$ar_exclude_models]
			: $default_ar_exclude_models;


		$ar_recursive_children = ontology_node::get_ar_recursive_children(
			$tipo, // string tipo
			false, // bool is recursion
			$exclude_models, // array ar_exclude_models
		);

		return $ar_recursive_children;
	}//end get_ar_recursive_children



	/**
	* GET_SECTION_BUTTONS_TIPO
	* Calculates current section buttons tipo considering virtual section cases
	* @return array $ar_buttons_tipo
	*/
	public function get_section_buttons_tipo() : array {

		// section_real_tipo
			$section_real_tipo = $this->get_section_real_tipo();

		// section virtual case
		if ($section_real_tipo!==$this->tipo) {

			// ar_excluded_tipo. Exclude elements of layout edit
			// vars: $section_tipo, $ar_model_name_required, $from_cache=true, $resolve_virtual=false, $recursive=true, $search_exact=false, $ar_tipo_exclude_elements=false
				$ar_excluded_tipo			= false;
				$ar_exclude_elements_tipo	= section::get_ar_children_tipo_by_model_name_in_section(
					$this->tipo, // section_tipo
					['exclude_elements'], // ar_model_name_required
					true, // from_cache
					false, // resolve_virtual
					false, // recursive
					false, // search_exact
					false // ar_tipo_exclude_elements
				);
				if (!isset($ar_exclude_elements_tipo[0])) {
					debug_log(__METHOD__
						." Warning. exclude_elements of section $this->tipo not found (2). All virtual section must has defined exclude_elements ",
						logger::WARNING
					);
				}else{
					// locate excluded tipos (related terms) in this virtual section
					$ar_excluded_tipo = ontology_node::get_relation_nodes(
						$ar_exclude_elements_tipo[0],
						false, // bool cache
						true // bool simple
					);
				}

			// real section
				$children_real_tipos = section::get_ar_children_tipo_by_model_name_in_section(
					$section_real_tipo, // section_tipo
					['button_'], // ar_model_name_required
					true, // from_cache
					false, // resolve_virtual
					false, // recursive
					false, // search_exact
					$ar_excluded_tipo // ar_tipo_exclude_elements
				);

			// virtual section. Add the specific buttons of the virtual section, if the virtual have buttons add to the list.
				$children_virtual_tipos = section::get_ar_children_tipo_by_model_name_in_section(
					$this->tipo, // section_tipo
					['button_'], // ar_model_name_required
					true, // from_cache
					false, // resolve_virtual
					false, // recursive
					false, // search_exact
					$ar_excluded_tipo // ar_tipo_exclude_elements
				);

			$ar_buttons_tipo = [...$children_real_tipos, ...$children_virtual_tipos];

		}else{

			// if the section is a real section, add the buttons directly
			$ar_buttons_tipo = section::get_ar_children_tipo_by_model_name_in_section(
				$this->tipo, // section_tipo
				['button_'], // ar_model_name_required
				true, // from_cache
				false, // resolve_virtual
				false, // recursive
				false, // search_exact
				false //ar_tipo_exclude_elements
			);

		}//end if ($this->section_virtual==true )


		return $ar_buttons_tipo;
	}//end get_section_buttons_tipo



	/**
	* GET_SECTION_TIPO : alias of $this->get_tipo()
	* @return string $section_tipo
	*/
	public function get_section_tipo() : string {

		return $this->get_tipo();
	}//end get_section_tipo



	/**
	* GET_PUBLICATION_DATE
	* @see class.diffusion definitions for publication_first_tipo, publication_last_tipo, etc.
	* @param string $component_tipo
	* @return string|null $local_date
	*/
	public function get_publication_date(string $component_tipo) : ?string {

		$local_date = null;

		// tipos
			$section_id		= $this->section_id;
			$section_tipo	= $this->tipo;

		// component
			$model_name	= ontology_node::get_model_by_tipo($component_tipo,true);
			$component	= component_common::get_instance(
				$model_name,
				$component_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$dato = $component->get_dato();

		// local_date
			if (!empty($dato) && !empty($dato[0]) && !empty($dato[0]->start)) {

				$dd_date	= new dd_date($dato[0]->start);
				$timestamp	= $dd_date->get_dd_timestamp();
				$local_date	= dd_date::timestamp_to_date($timestamp, true); // string|null
			}


		return $local_date;
	}//end get_publication_date



	/**
	* GET_PUBLICATION_USER
	* @param string $component_tipo
	* @return string|null $user_name
	*/
	public function get_publication_user(string $component_tipo) : ?string {

		// tipos
			$section_id		= $this->section_id;
			$section_tipo	= $this->tipo;

		// component
			$model_name	= ontology_node::get_model_by_tipo($component_tipo,true);
			$component	= component_common::get_instance(
				$model_name,
				$component_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$dato = $component->get_dato();

		// user name
			if (empty($dato)) {

				$user_name = null;

			}else{
				$user_id	= isset($dato[0]) && isset($dato[0]->section_id)
					? (int)$dato[0]->section_id
					: null;
				$user_name	= isset($user_id)
					? section::get_user_name_by_user_id($user_id, false)
					: null;
			}


		return $user_name;
	}//end get_publication_user



	/**
	* GET_AR_ALL_SECTION_RECORDS_UNFILTERED
	* @see diffusion::build_table_data_recursive
	*
	* @param string $section_tipo
	* @return array $ar_records
	*/
	public static function get_ar_all_section_records_unfiltered( string $section_tipo ) : array {

		$result = section::get_resource_all_section_records_unfiltered(
			$section_tipo
		);

		if(SHOW_DEBUG===true) {
			$n_rows = pg_num_rows($result);
			if ($n_rows>1000) {
				debug_log(__METHOD__
					." WARNING: TOO MANY RESULTS IN THE QUERY. TO OPTIMIZE MEMORY, DO NOT STORE RESULTS IN ARRAY IN THIS SEARCH. BEST USE 'get_resource_all_section_records_unfiltered' "
					, logger::ERROR
				);
			}
		}
		$ar_records = [];
		while ($rows = pg_fetch_assoc($result)) {
			$ar_records[] = $rows['section_id'];
		}

		return $ar_records;
	}//end get_ar_all_section_records_unfiltered



	/**
	* GET_RESOURCE_ALL_SECTION_RECORDS_UNFILTERED
	* Iterate result as:
	* while ($rows = pg_fetch_assoc($result)) {
	*	$current_id = $rows['section_id'];
	* }
	* @param string $section_tipo
	* @param string $select = 'section_id'
	* @return PgSql\Result|bool $result
	*/
	public static function get_resource_all_section_records_unfiltered( string $section_tipo, string $select='section_id' ) {

		$matrix_table	= common::get_matrix_table_from_tipo($section_tipo);
		// Ignore invalid empty matrix tables
		if (empty($matrix_table)) {
			debug_log(__METHOD__
				. " ERROR: invalid empty matrix table " . PHP_EOL
				. ' section_tipo: ' . $section_tipo
				, logger::ERROR
			);
			return false;
		}
		$sql   = "-- ".__METHOD__." \nSELECT $select FROM \"$matrix_table\" WHERE section_tipo = $1 ORDER BY section_id ASC ";
		$result	= matrix_db_manager::exec_search($sql, [$section_tipo]);

		return $result;
	}//end get_resource_all_section_records_unfiltered




	### /DIFFUSION INFO #####################################################################################



	/**
	* GET_DIFFUSION_INFO
	* Get property 'diffusion_info' from section dato
	* sample:
	* {
	*   ...
	* 	diffusion_info : null
	* }
	* @return object|null $diffusion_info
	*/
	public function get_diffusion_info() : ?object {

		$dato			= $this->get_dato();
		$diffusion_info	= $dato->diffusion_info ?? null;


		return $diffusion_info;
	}//end get_diffusion_info



	/**
	* ADD_DIFFUSION_INFO_DEFAULT
	* Add default base diffusion_info to section only if not already set
	* @param string $diffusion_element_tipo
	* @return bool
	* true if not already set and is fixed, false if is already set
	*/
	public function add_diffusion_info_default(string $diffusion_element_tipo) : bool {

		$dato = $this->get_dato();

		// empty cases
			if (!isset($dato->diffusion_info)) {
				$dato->diffusion_info = new stdClass();
			}

		// set property $diffusion_element_tipo
		if (!isset($dato->diffusion_info->$diffusion_element_tipo)) {

			$date		= date('Y-m-d H:i:s');
			$user_id	= logged_user_id();

			$dato->diffusion_info->{$diffusion_element_tipo} = (object)[
				'date'		=> $date,
				'user_id'	=> $user_id
			];

			// Force update section dato
			$this->set_dato($dato);

			return true;
		}

		return false;
	}//end add_diffusion_info_default




	### RELATIONS #####################################################################################



	/**
	* GET_RELATIONS
	* Get section container 'relations' array of locators values
	* Consider the variable in the section when constructing the object ......	*
	* @param string $relations_container = 'relations'
	* @return array $relations
	*/
	public function get_relations( string $relations_container='relations' ) : array {

		if (empty($this->section_id)) {
			// Section do not exists yet. Return empty array
			return [];
		}

		$dato = $this->get_dato(); // Force load data

		$relations = $dato->{$relations_container} ?? [];


		return $relations;
	}//end get_relations



	/**
	* ADD_RELATION
	* @param object $locator
	*	locator with valid 'type' property defined is mandatory
	* @param string $relations_container = 'relations'
	* @return bool
	* 	true if is added
	*/
	public function add_relation( object $locator, string $relations_container='relations' ) : bool {

		// check locator is valid
			if(empty($locator)) {
				debug_log(__METHOD__
					." Invalid empty locator is received to add (empty)." . PHP_EOL
					." Locator was ignored (type:".gettype($locator).") " . PHP_EOL
					.' locator: '.to_string($locator)
					, logger::ERROR
				);
				return false;
			}
			if (!is_object($locator)) {
				debug_log(__METHOD__
					." Invalid locator is received to add. (non object)" . PHP_EOL
					." Locator was ignored (type:".gettype($locator).") " . PHP_EOL
					.' locator: ' . to_string($locator)
					, logger::ERROR
				);
				return false;
			}
			if (!isset($locator->type)) {
				debug_log(__METHOD__
					." Invalid locator is received to add. (type is not set)" . PHP_EOL
					." Locator was ignored (type:".gettype($locator).") " . PHP_EOL
					.' locator: ' . to_string($locator)
					, logger::ERROR
				);
				return false;
			}

		// paginated_key. Remove possible property paginated_key if it exists
			if (isset($locator->paginated_key)) {
				debug_log(__METHOD__
					. " Removing temporal property 'paginated_key' from locator " . PHP_EOL
					. ' locator: ' . to_string($locator)
					, logger::ERROR
				);
				unset($locator->paginated_key);
			}

		// relations. section relations data. Could be empty
			$relations = $this->get_relations( $relations_container );
			if (!empty($relations)) {
				// data integrity check: Clean possible bad formed locators (old and beta errors)
				foreach ($relations as $current_relation) {
					if (!is_object($current_relation) ||
						!isset($current_relation->section_id) ||
						!isset($current_relation->section_tipo) ||
						!isset($current_relation->type)
						) {

						debug_log(__METHOD__
							." Invalid relations locator found. " . PHP_EOL
							.' !! FOUNDED BAD FORMAT RELATION LOCATOR IN SECTION_RELATION DATA:' . PHP_EOL
							.' The execution will stop until this erroneous data is corrected!' . PHP_EOL
							.' locator: '. json_encode($current_relation) . PHP_EOL
							.' relations: '. json_encode($relations)
							, logger::ERROR
						);
						// throw new Exception("Error Processing Request. !! FOUNDED BAD FORMAT RELATION LOCATOR IN SECTION_RELATION DATA: (type:".gettype($current_relation).") ".to_string($current_relation), 1);
					}
				}
			}

		// safe array index to prevent accidental assoc array
			$relations = array_values($relations);

		// Add if not already exists
			$locator_exists = locator::in_array_locator( $locator, $relations );
			if ($locator_exists===true) {

				debug_log(__METHOD__
					.' Ignored add locator action: locator already exists: ' . PHP_EOL
					.' locator: '. to_string($locator)
					, logger::WARNING
				);

				return false;
			}
			array_push($relations, $locator);

		// Force load 'dato' if not exists / loaded
		// (!) removed because is not necessary. get_relations method already loads section dato
			if ( empty($this->dato) && $this->section_id>0 ) {
				$this->get_dato();
			}
			if ( empty($this->dato) || !is_object($this->dato) ) {
				$this->dato = new stdClass();
			}

		// Update whole container
			$this->dato->{$relations_container} = $relations;


		return true;
	}//end add_relation



	/**
	* REMOVE_RELATION
	* @param object locator $locator
	* locator with valid 'type' property defined is mandatory
	* @param string $relations_container = 'relations'
	* @return bool
	* 	true if is removed
	*/
	public function remove_relation( object $locator, string $relations_container='relations' ) : bool {

		// ar_properties. Used to compare existing locators with given
			$ar_properties=array('section_id','section_tipo','type');
			// optional properties, based on given locator
			if (isset($locator->from_component_tipo))	$ar_properties[] = 'from_component_tipo';
			if (isset($locator->tag_id))				$ar_properties[] = 'tag_id';
			if (isset($locator->component_tipo))		$ar_properties[] = 'component_tipo';
			if (isset($locator->section_top_tipo))		$ar_properties[] = 'section_top_tipo';
			if (isset($locator->section_top_id))		$ar_properties[] = 'section_top_id';

		// add locators to new_relations array excluding given locator
			$removed		= false;
			$new_relations	= [];
			$relations		= $this->get_relations( $relations_container );
			foreach ($relations as $current_locator_obj) {

				// Test if already exists
				$equal = locator::compare_locators( $current_locator_obj, $locator, $ar_properties );
				if ( $equal===false ) {

					// add
					$new_relations[] = $current_locator_obj;

				}else{

					// no add
					$removed = true;
				}
			}

		// Updates current dato relations with clean array of locators
			if ($removed===true) {
				$this->dato->{$relations_container} = $new_relations;
			}


		return $removed;
	}//end remove_relation



	/**
	* REMOVE_RELATIONS_FROM_COMPONENT_TIPO
	* Delete all locators of type requested from section relation dato
	* (!) Note that this method do not save
	* @param object $options
	* {
	*	component_tipo: string ,
	* 	relations_container: string 'relations',
	* 	model: string 'component_dataframe',
	* 	caller_dataframe: {
	* 		section_tipo: string "numisdata4",
	* 		section_id: string "1",
	* 		section_id_key: string "1",
	* 		tipo_key: string "numisdata161"
	* 	}
	* }
	* @return array $ar_deleted_locators
	*/
	public function remove_relations_from_component_tipo( object $options ) : array {

		// options
			$component_tipo			= $options->component_tipo;
			$relations_container	= $options->relations_container ?? 'relations';
			$model					= $options->model ?? null;
			$caller_dataframe		= $options->caller_dataframe ?? null;

		$removed				= false;
		$ar_deleted_locators	= [];
		$new_relations			= [];
		$relations				= $this->get_relations( $relations_container );
		foreach ($relations as $current_locator) {

			// dataframe case
			// by default, component_dataframe is built with caller_dataframe except when import data.
			// When import data from CSV files, the component is built without dataframe
			// because is not possible to create different instances for every dataframe data.
			// In those cases the component_dataframe manage its data as other components with whole data.
			if($model === 'component_dataframe' && isset($caller_dataframe) ) {

				if (
					( isset($current_locator->from_component_tipo) && $current_locator->from_component_tipo===$component_tipo)
					&& ( isset($current_locator->section_id_key) && intval($current_locator->section_id_key)===intval($caller_dataframe->section_id_key) )
					&& ( isset($current_locator->section_tipo_key) && $current_locator->section_tipo_key===$caller_dataframe->section_tipo_key)
					&& ( isset($current_locator->main_component_tipo) && $current_locator->main_component_tipo===$caller_dataframe->main_component_tipo)
					){
						$ar_deleted_locators[] = $current_locator;

						debug_log(__METHOD__
							. " Removed COMPONENT_DATAFRAME locator from section relations" . PHP_EOL
							. ' current_locator: ' . to_string($current_locator)
							, logger::WARNING
						);

						$removed = true;
				}else{
					// Add normally
					$new_relations[] = $current_locator;
				}

			}else{

				// Test if from_component_tipo
				if (isset($current_locator->from_component_tipo) && $current_locator->from_component_tipo===$component_tipo) {

					$ar_deleted_locators[] = $current_locator;

					// debug
						// debug_log(__METHOD__
						// 	. " Removed $model locator from section relations" . PHP_EOL
						// 	. ' current_locator: ' . to_string($current_locator)
						// 	, logger::WARNING
						// );

					$removed = true;

				}else{
					// Add normally
					$new_relations[] = $current_locator;
				}
			}
		}//end foreach ($relations as $current_locator)

		if ($removed===true) {
			// Update section dato relations on finish
			$this->dato->{$relations_container} = $new_relations;
		}


		return $ar_deleted_locators;
	}//end remove_relations_from_component_tipo




	### /RELATIONS #####################################################################################



	/**
	* GET_SECTION_MAP
	* Section map data is stored in 'properties' of element of model 'section_map'
	* placed in the first level of section.
	* Note that virtual section could have different section_map than the real section
	* furthermore, we try first without resolve and if result is empty, resolving real section
	* @param string $section_tipo
	* @return object|null $setion_map
	* output sample:
	* {
	*	"thesaurus": {
	*		"term": "test52",
	*		"model": "test169",
	*		"parent": "test71",
	*		"is_descriptor": "test88"
	*	}
	* }
	*/
	public static function get_section_map( string $section_tipo ) : ?object {

		// cache
			if( isset(self::$section_map_cache[$section_tipo]) ) {
				return self::$section_map_cache[$section_tipo];
			}

		$ar_model_name_required	= ['section_map'];

		// Locate section_map element in current section (virtual or not)
			$ar_children = section::get_ar_children_tipo_by_model_name_in_section(
				$section_tipo,
				$ar_model_name_required,
				true, // bool from_cache
				false, // bool resolve_virtual
				false, // bool recursive
				true // bool search_exact
			);

		// If not found children, try resolving real section (resolve_virtual=true)
			if (empty($ar_children)) {
				$ar_children = section::get_ar_children_tipo_by_model_name_in_section(
					$section_tipo,
					$ar_model_name_required,
					true, // bool from_cache
					true, // // bool resolve_virtual
					false, // bool recursive
					true // bool search_exact
				);
			}

		// section_map
			$section_map = null;
			if( isset($ar_children[0]) ) {

				$tipo			= $ar_children[0];
				$ontology_node	= ontology_node::get_instance($tipo);
				$section_map	= $ontology_node->get_properties() ?? null;
			}

		// cache. Store in cache for speed
			self::$section_map_cache[$section_tipo] = $section_map;
			// Manage cache size to prevent memory leaks (using inherited method)
			self::manage_cache_size(self::$section_map_cache);


		return $section_map;
	}//end get_section_map




	/**
	* GET_SEARCH_QUERY
	* Used for compatibility of search queries when we need filter by section_tipo
	* inside filter (thesaurus case for example)
	* @param object $query_object
	* @return array $ar_query_object
	*/
	public static function get_search_query(object $query_object) : array {

		// component path default
			$query_object->component_path = ['section_tipo'];

		// component class name calling here
			$called_class = get_called_class();

		// component lang
			if (!isset($query_object->lang)) {
				// default apply
				$query_object->lang = 'all';
			}

		// current_query_object default
			$current_query_object = $query_object;

		// conform each object
			if (search::is_search_operator($current_query_object)===true) {
				foreach ($current_query_object as $operator => $ar_elements) {
					foreach ($ar_elements as $c_query_object) {
						// Inject all resolved query objects
						$c_query_object = $called_class::resolve_query_object_sql($c_query_object);
					}
				}
			}else{
				$current_query_object = $called_class::resolve_query_object_sql($current_query_object);
			}

		// convert to array always
			$ar_query_object = is_array($current_query_object)
				? $current_query_object
				: [$current_query_object];


		return $ar_query_object;
	}//end get_search_query



	/**
	* GET_METADATA_DEFINITION
	* Returns a resolved object with all needed to set section
	* @return stdClass $modified_section_tipos
	*/
	public static function get_metadata_definition() : stdClass {

		$item = new stdClass();

		$item->created_by_user = new stdClass();
		$item->created_by_user->tipo = 'dd200';
		$item->created_by_user->model = 'component_select';

		$item->created_date = new stdClass();
		$item->created_date->tipo = 'dd199';
		$item->created_date->model = 'component_date';

		$item->modified_by_user = new stdClass();
		$item->modified_by_user->tipo = DEDALO_SECTION_INFO_MODIFIED_BY_USER; // dd197
		$item->modified_by_user->model = 'component_select';

		$item->modified_date = new stdClass();
		$item->modified_date->tipo = DEDALO_SECTION_INFO_MODIFIED_DATE; // dd201
		$item->modified_date->model = 'component_date';


		return $item;
	} //end get_metadata_definition



	/**
	* GET_METADATA_DEFINITION_TIPOS
	* Return the list of fixed
	* @return array $ar_tipos
	*/
	public static function get_metadata_definition_tipos() : array {

		$ar_tipos = [];
		foreach( section::get_metadata_definition() as $key => $value ) {
			$ar_tipos[] = $value->tipo;
		}

		return $ar_tipos;
	}//end get_metadata_definition_tipos



	/**
	* GET_AR_GROUPER_MODELS
	* Returns the list of grouper models
	* @return array $ar_groupers_models
	*/
	public static function get_ar_grouper_models() : array {

		$ar_groupers_models = ['section_group','section_group_div','section_tab','tab'];

		return $ar_groupers_models;
	}//end get_ar_grouper_models




	/**
	* GET_PERMISSIONS
	* @return int $this->permissions
	*/
	public function get_section_permissions() : int {

		// check if the permissions are set previously, then return it.
			if(isset($this->permissions)){
				return $this->permissions;
			}

		// common cases permissions calculation
			$this->permissions = common::get_permissions($this->tipo, $this->tipo);

		// maintains dedalo_activity_section_tipo < 2 to prevent edition
		if ($this->tipo===DEDALO_ACTIVITY_SECTION_TIPO && $this->permissions>1){
			$this->permissions = 1;
		}


		return $this->permissions;
	}//end get_permissions



	/**
	* BUILD_SQO_ID
	* Unified way to compound sqo_id value
	* This string is used as key for section session SQO
	* like $_SESSION['dedalo']['config']['sqo'][$sqo_id]
	* @param string $tipo
	* 	section tipo like 'oh1'
	* @return string $sqo_id
	* 	final sqo_id like 'oh1'
	*/
	public static function build_sqo_id(string $tipo) {

		$sqo_id = $tipo;

		return $sqo_id;
	}//end build_sqo_id





}//end class section
