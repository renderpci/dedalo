<?php
declare(strict_types=1);
/*
* CLASS COMPONENT_RELATION_COMMON
* Used as common base from all components that works from section relations data, instead standard component dato
* like component_model, component_parent, etc..
*/
class component_relation_common extends component_common {



	/**
	* CLASS VARS
	* @var
	*/
		# relation_type (set in constructor).
		# Defines type used in section relation locators to set own locator type
		# protected $relation_type;

		# Overwrite __construct var lang passed in this component
		// protected $lang = DEDALO_DATA_NOLAN;

		# save_to_database_relations
		# On false, avoid propagate to table relation current component locators at save
		# @see class geonames::import_data
		public $save_to_database_relations = true;

		// $dato_full. component dato with all langs
		public $dato_full;

		# relation_type . Determines inverse resolutions and locator format
		# DEDALO_RELATION_TYPE_RELATED_TIPO (Default)
		protected $relation_type ; // Set on construct from properties

		# type of rel (like unidirectional, bidirectional, multi directional, etc..) This info is inside each locator of current component dato
		# DEDALO_RELATION_TYPE_RELATED_UNIDIRECTIONAL_TIPO (Default)
		# DEDALO_RELATION_TYPE_RELATED_BIDIRECTIONAL_TIPO
		# DEDALO_RELATION_TYPE_RELATED_MULTIDIRECTIONAL_TIPO
		# protected $relation_type_rel = DEDALO_RELATION_TYPE_RELATED_UNIDIRECTIONAL_TIPO; // Default
		protected $relation_type_rel ; // Set on construct from properties

		// array|null ar_target_section_tipo
		protected $ar_target_section_tipo;

		// sub_columns_divison
		protected $sub_columns_divison;

		// default_relation_type
		protected $default_relation_type;
		// default_relation_type_rel
		protected $default_relation_type_rel;



	/**
	* __CONSTRUCT
	* @param string $tipo = null
	* @param string|null $section_id = null
	* @param string $mode = 'list'
	* @param string $lang = null
	* @param string $section_tipo = null
	*
	* @return bool
	*/
	protected function __construct(string $tipo=null, $section_id=null, string $mode='list', string $lang=null, string $section_tipo=null, bool $cache=true) {

		// lang. translatable conditioned
			$translatable = RecordObj_dd::get_translatable($tipo);
			if ($translatable===true) {
				if (empty($lang)) {
					$lang = DEDALO_DATA_LANG;
				}else{
					if ($lang===DEDALO_DATA_NOLAN) {
						debug_log(__METHOD__
							." Changed component wrong lang [TRANSLATABLE $section_tipo - $tipo] from $lang to ".DEDALO_DATA_LANG
							, logger::ERROR
						);
						$lang = DEDALO_DATA_LANG;
					}
				}
			}else{
				if (empty($lang)) {
					$lang = DEDALO_DATA_NOLAN;
				}else{
					if ($lang!==DEDALO_DATA_NOLAN) {
						// debug_log(__METHOD__." Changed component wrong lang [NON TRANSLATABLE $section_tipo - $tipo] from $lang to ".DEDALO_DATA_NOLAN, logger::ERROR);
						// $bt = debug_backtrace()[1]; dump($bt, ' bt ++ '.to_string());
						$lang = DEDALO_DATA_NOLAN;
					}
				}
			}

		// relation config . Set current component relation_type and relation_type_rel based on properties config
			$RecordObj_dd	= new RecordObj_dd($tipo);
			$properties		= $RecordObj_dd->get_properties();

			// relation_type
				$this->relation_type = isset($properties->config_relation->relation_type)
					? $properties->config_relation->relation_type
					: $this->default_relation_type;

			// relation_type_rel
				$this->relation_type_rel = isset($properties->config_relation->relation_type_rel)
					? $properties->config_relation->relation_type_rel
					: $this->default_relation_type_rel;

		// Build the component normally
			parent::__construct($tipo, $section_id, $mode, $lang, $section_tipo, $cache);
	}//end __construct



	/**
	* GET_COMPONENTS_WITH_RELATIONS
	* Array of components model name that using locators in dato and extends component_relation_common
	* @return array
	*/
	public static function get_components_with_relations() : array {

		$components_with_relations = [
			'component_autocomplete',
			'component_autocomplete_hi',
			'component_check_box',
			'component_filter',
			'component_filter_master',
			'component_portal',
			'component_publication',
			'component_radio_button',
			'component_relation_children',
			'component_relation_index',
			'component_relation_model',
			'component_relation_parent',
			'component_relation_related',
			'component_relation_struct',
			'component_select',
			'component_select_lang',
			'component_inverse',
		];

		return $components_with_relations;
	}//end get_components_with_relations



	/**
	* GET_DATO
	* Returns dato from container 'relations', not from component dato container
	* @return array $dato
	*	$dato is always an array of locators or an empty array
	*/
	public function get_dato() {
		/*
		if(isset($this->dato_resolved)) {
			return $this->dato_resolved;
		}

		// time machine mode case
			if ($this->mode==='tm') {

				if (empty($this->matrix_id)) {
					debug_log(__METHOD__." ERROR. 'matrix_id' IS MANDATORY IN TIME MACHINE MODE  ".to_string(), logger::ERROR);
					return [];
				}

				// tm dato. Note that no lang or section_id is needed, only matrix_id
				$dato_tm = component_common::get_component_tm_dato($this->tipo, $this->section_tipo, $this->matrix_id);
				// inject dato to component
				$this->dato_resolved = $dato_tm;
				return $this->dato_resolved;
			}

		// load. Load matrix data and set this->dato
			$this->load_component_dato();
		*/

		// common get_dato
			parent::get_dato();

		// fallback to empty array
			$dato = $this->dato ?? [];


		return $dato;
	}//end get_dato



	/**
	* GET_DATO_FULL
	* Returns dato from container 'relations', not for component dato container
	* @return array $dato
	*	$dato is always an array of locators or an empty array
	*/
	public function get_dato_full() {

		if(isset($this->dato_resolved)) {

			// dato_resolved. Already resolved case

			$dato_full = $this->dato_resolved;

		}else{

			// load. Load matrix data and set this->dato
			$this->load_component_dato();

			$dato_full = $this->dato_full;
		}


		return $dato_full;
	}//end get_dato_full



	/**
	* GET_DATO_AS_STRING
	* Return JSON encoded dato
	* @return string
	*/
	public function get_dato_as_string() : string {

		return json_handler::encode($this->get_dato());
	}//end get_dato_as_string



	/**
	* LOAD MATRIX DATA
	* Get data once from matrix about parent, dato
	* @return bool
	*/
	protected function load_component_dato() : bool {

		if( empty($this->section_id) || $this->mode==='dummy' || $this->mode==='search') {
			// return null;
			return false;
		}

		if( $this->bl_loaded_matrix_data!==true ) {

			// dato full
			$this->dato_full = $this->get_all_data();

			// dato
			if (!empty($this->dato_full)) {

				$this->dato = [];
				$translatable = $this->RecordObj_dd->get_traducible();
				foreach ($this->dato_full as $locator) {
					if ($translatable!=='si') {
						$this->dato[] = $locator;
					}else if(isset($locator->lang) && $locator->lang===$this->lang){
						$this->dato[] = $locator;
					}
				}
			}else{
				$this->dato = $this->dato_full;
			}

			# Set as loaded
			$this->bl_loaded_matrix_data = true;
		}

		return true;
	}//end load_component_dato



	/**
	* GET_GRID_VALUE
	* Get the value of the components. By default will be get_dato().
	* overwrite in every different specific component
	* Some the text components can set the value with the dato directly
	* the relation components need to process the locator to resolve the value
	* @param object|null $ddo = null
	*
	* @return dd_grid_cell_object $value
	*/
	public function get_grid_value(object $ddo=null) : dd_grid_cell_object {

		// ddo customs: set the separator if the ddo has a specific separator, it will be used instead the component default separator
			$fields_separator	= $ddo->fields_separator ?? null;
			$records_separator	= $ddo->records_separator ?? null;
			$class_list			= $ddo->class_list ?? null;

		// data
			$data = $this->get_dato() ?? [];

		// set the label of the component as column label
			$label = $this->get_label();

		// request_config. Get/build the request_config of the component
		// the caller can built a request_config that will used instead the default request_config
			$request_config = isset($this->request_config)
				? $this->request_config
				: $this->build_request_config();

		// get the correct rqo (use only the dedalo api_engine)
			$dedalo_request_config = array_find($request_config, function($el){
				return $el->api_engine==='dedalo';
			});

		// ddo_map. Get the ddo_map to be used to create the components related to the portal
			$ddo_map = $dedalo_request_config->show->ddo_map;

		// short vars
			$ar_cells				= [];
			$ar_columns_obj			= [];
			$sub_row_count			= 0;
			// $sub_column_count	= null;
			// the column_object could be injected for the caller or build new one
			if(isset($this->column_obj)){
				$column_obj = $this->column_obj;
			}else{
				$column_obj = new stdClass();
					$column_obj->id = $this->section_tipo.'_'.$this->tipo;
			}

		// children_recursive function, get all ddo chain that depends of this component
			if (!function_exists('get_children_recursive')) {
				function get_children_recursive($ar_ddo, $dd_object) {
					$ar_children = [];

					foreach ($ar_ddo as $ddo) {
						if($ddo->parent===$dd_object->tipo) {
							$ar_children[] = $ddo;
							$result = get_children_recursive($ar_ddo, $ddo);
							if (!empty($result)) {
								$ar_children = array_merge($ar_children, $result);
							}
						}
					}
					return $ar_children;
				}
			}

		// get last column
			// 	if (!function_exists('get_last_column_recursive')) {
			// 		function get_last_column_recursive($ar_column) {
			// 			$ar_last_children = [];
			// 			foreach ($ar_column as $column) {
			// 				if(isset($column->cell_type)) {
			// 					$ar_last_children[] = $column;
			// 				}else{
			// 					$result				=  get_last_column_recursive($column->value);
			// 					$ar_last_children	= array_merge($ar_last_children, $result);
			// 				}
			// 			}
			// 			return $ar_last_children;
			// 		}
			// 	}

		// get only the direct_children of the current component, if the child component is a portal it will resolve his children
			$ddo_direct_children = array_filter($ddo_map, function($el){
				return $el->parent === $this->tipo;
			});
			if (empty($ddo_direct_children)) {
				debug_log(__METHOD__
					. " WARNING! Empty direct_children for tipo: $this->tipo" .PHP_EOL
					. 'ddo: ' . to_string($ddo)
					, logger::WARNING
				);
			}

		$components_with_relations = component_relation_common::get_components_with_relations();
		// removed at 18-03-2023 because portal error, it's not possible resolve section_tipo here
		// if(empty($data)){
		// 	$pseudo_locator = new stdClass();
		// 		$pseudo_locator->type			= DEDALO_RELATION_TYPE_LINK; // 'dd151';
		// 		$pseudo_locator->section_tipo	= null;
		// 		$pseudo_locator->section_id		= null;
		// 	$data[] = $pseudo_locator;
		// }
		foreach($data as $current_key => $locator) {

			// component_relation_index case, it doesn't has request_config and it's necessary calculate it
			// get the locator to build pointed section and get his request config of relation_list.
			// if($this->model==='dd432' && empty($ddo_direct_children)) {
			if (get_called_class()==='component_relation_index' && empty($ddo_direct_children)) {

				$datum		= $this->get_section_datum_from_locator($locator);
				$context	= $datum->context;

				$section_context = array_find($context, function($el) use ($locator){
					return $el->section_tipo === $locator->section_tipo;
				});

				// get the correct rqo (use only the dedalo api_engine)
				$dd_request_config = array_find($section_context->request_config, function($el){
					return $el->api_engine==='dedalo';
				});

				// section_id_tipo
				$ar_section_id_tipo	= section::get_ar_children_tipo_by_model_name_in_section(
					$locator->section_tipo,
					['component_section_id'],
					true, // bool from cache
					true, // bool resolve_virtual
					true, // bool recursive
					true // search_exact
				);
				$section_id_tipo = reset($ar_section_id_tipo);

				$ddo_section_id = new dd_object();
					$ddo_section_id->set_tipo($section_id_tipo);
					$ddo_section_id->set_section_tipo($locator->section_tipo);
					$ddo_section_id->set_parent($this->tipo);

				// ddo_map. Get the ddo_map to be used to create the components related to the portal
				$ddo_map = array_merge([$ddo_section_id], $dd_request_config->show->ddo_map);
				$ddo_direct_children = array_filter($ddo_map, function($el){
					return $el->parent === $this->tipo;
				});
			}

			$locator_column_obj	= [];
			$ar_columns			= [];
			foreach ($ddo_direct_children as $ddo) {

				// model check
				if (!isset($ddo->model)) {
					$ddo->model = RecordObj_dd::get_modelo_name_by_tipo($ddo->tipo,true);
					debug_log(__METHOD__
						. " ddo without model ! Added calculated model: $ddo->model" . PHP_EOL
						. ' ddo: ' . to_string($ddo) . PHP_EOL
						. ' bt[1]: ' . to_string( debug_backtrace()[1] )
						, logger::WARNING
					);
				}

				// the the ddo has a multiple section_tipo (such as toponymy component_autocomplete), reset the section_tipo
				$ddo_section_tipo		= is_array($ddo->section_tipo) ? reset($ddo->section_tipo) : $ddo->section_tipo;
				$locator->section_tipo	= $locator->section_tipo ?? $ddo_section_tipo;
				// set the path that will be used to create the column_obj id
				$current_path			= $locator->section_tipo.'_'.$ddo->tipo;
				$translatable			= RecordObj_dd::get_translatable($ddo->tipo);
				// if the component has a dataframe component, create his caller_dataframe to related with the locator
				$caller_dataframe 		= ($ddo->model === 'component_dataframe')
					? (object)[
						'section_tipo'		=> $ddo->section_tipo,
						'section_id_key'	=> $locator->section_id,
					]
					: null;
				$current_lang			= $translatable===true ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
				$component_model		= RecordObj_dd::get_modelo_name_by_tipo($ddo->tipo,true);
				// create the component with the ddo definition
				// dataframe case: the data of the component_dataframe is inside the same section than the caller, so, his section_tipo and section_id need to be the same as the main component
				$current_component		= component_common::get_instance(
					$component_model,
					$ddo->tipo,
					($ddo->model === 'component_dataframe')
						? $this->section_id
						: $locator->section_id,
					$this->mode,
					$current_lang,
					($ddo->model === 'component_dataframe')
						? $this->section_tipo
						: $locator->section_tipo,
					true,
					$caller_dataframe
				);

				// set the locator to the new component, it will used in the next loop
				$current_component->set_locator($this->locator);

				// get the ddo path for inject to the next component level resolution.
				$sub_ddo_map = get_children_recursive($ddo_map, $ddo);

				// if the component has sub_ddo, create the request_config to be injected to component
				// the request_config will be used instead the default request_config.
				if (!empty($sub_ddo_map)) {

					$show = new stdClass();
						$show->ddo_map = $sub_ddo_map;

					$request_config = new stdClass();
						$request_config->api_engine	= 'dedalo';
						$request_config->type		= 'main';
						$request_config->show		= $show;

					$current_component->request_config = [$request_config];
				}

				// if the component it's a relation component, set the sub_columns_division to true, it will be test in the next loop
				if (in_array($component_model, $components_with_relations)) {
					$current_component->sub_columns_divison = true;
				}
				//if the component it's a relation component check if the component has sub_columns_division (it could have been set by the previous loop)
				// if true, add the locator position to the column_path
				if(isset($this->sub_columns_divison) && $this->sub_columns_divison===true && $current_key>0){
					$current_path = $current_path.'|'.$current_key;
				}
				// create the new column obj id getting the previous id and add the new path
				// it will set to the column_obj for the next loop
				$current_column_obj = new stdClass();
					$current_column_obj->id		= $column_obj->id.'_'.$current_path;
					$current_column_obj->group	= $column_obj->id.'_'.$locator->section_tipo;
				$current_component->column_obj = $current_column_obj;

				// get the value and fallback_value of the component and stored to be joined
				$current_column		= $current_component->get_grid_value($ddo);
				$sub_row_count		= $current_column->row_count ?? 0;
				// if (in_array($component_model, $components_with_relations)) {
				// 	$current_column = get_last_column_recursive([$current_column]);
				// }
				// get the value and fallback_value of the component and stored to be joined
				$locator_column_obj	= array_merge($locator_column_obj, $current_column->ar_columns_obj);

				// store the columns into the full columns array
				$ar_columns[] = $current_column;
			}//end foreach ($ddo_direct_children as $ddo)

			// in the case that the portals has sub-data, this sub-data will separated only in columns, not in rows
			if(isset($this->sub_columns_divison) && $this->sub_columns_divison || $this->section_id === null){
				$ar_cells = array_merge($ar_cells, $ar_columns);
			}else{
				//create the row of the portal for the main locator only
				$grid_row = new dd_grid_cell_object();
					$grid_row->set_type('row');
					$grid_row->set_value($ar_columns);
				// store the current column with all values
					$ar_cells[] = $grid_row;
			}

			// get the columns position to re-order the ar_columns_obj
			// it will join the columns see if the column is a column created by the locator
			// when the component is portal inside portal, like 'photograph' inside 'identifying image' inside 'interview'.
			// 'photograph' locators will be exploded in columns not in rows and the column is identify by the section_id of the photograph
			// the final format will be: name ; surname ; name|1 ; surname|1 ; name|2 etc of the photograph
			foreach ($locator_column_obj as $column_pos => $current_column_obj) {

				// check if the current column exists in the full column array
				$id_obj = array_find($ar_columns_obj, function($el) use($current_column_obj){
					return ($el->id===$current_column_obj->id);
				});

				// if not exist we need add it, the columns are joined from the deep of the portals to the parents
				if($id_obj===null){
					// check if the current column_id is a locator column, else add the column_object at the end
					$current_column_path = explode('|', $current_column_obj->id);
					if(isset($this->sub_columns_divison) && $this->sub_columns_divison===true && $current_key>0 || sizeof($current_column_path)>1){
						// get the last position of the column group
						$position = false;
						foreach ($ar_columns_obj as $column_key => $column_value) {
							if($column_value->group === $current_column_obj->group){
								$position = $column_key;
							}
						}
						// if the position is set, insert the columns after the last column_object found
						// if not add the current column_object at the end
						if($position){
							array_splice($ar_columns_obj, $position+1, 0, [$current_column_obj]);
						}else{
							$ar_columns_obj[] = $current_column_obj;
						}
					}else{
						$ar_columns_obj[] = $current_column_obj;
					}
				}
			}//end foreach ($locator_column_obj as $column_pos => $current_column_obj)
		}

		// get the total of locators of the data, it will be use to render the rows separated.
			$locator_count	= sizeof($data);
			$row_count		= $locator_count + $sub_row_count;
			if($row_count === 0){
				$row_count = 1;
			}
		// get the total of columns
			$column_count = sizeof($ar_columns_obj);

		// set the separator text that will be used to render the column
		// separator will be the "glue" to join data in the client and can be set by caller or could be defined in preferences of the component.
			$properties = $this->get_properties();

			$fields_separator = isset($fields_separator)
				? $fields_separator
				: (isset($dedalo_request_config->show->fields_separator)
					? $dedalo_request_config->show->fields_separator
					: (isset($properties->fields_separator)
						? $properties->fields_separator
						: ', '));

			$records_separator = isset($records_separator)
				? $records_separator
				: (isset($dedalo_request_config->show->records_separator)
					? $dedalo_request_config->show->records_separator
					: (isset($properties->records_separator)
						? $properties->records_separator
						: ' | '));

		// value object (dd_grid_cell_object)
			$value = new dd_grid_cell_object();
				$value->set_type('column');
				$value->set_row_count($row_count);
				$value->set_column_count($column_count);
				$value->set_label($label);
				$value->set_ar_columns_obj($ar_columns_obj);
				if(isset($class_list)){
					$value->set_class_list($class_list);
				}
				$value->set_fields_separator($fields_separator);
				$value->set_records_separator($records_separator);
				$value->set_value($ar_cells);


		return $value;
	}//end get_grid_value



	/**
	* GET_DATO_FULL
	* Returns dato from container 'relations', not for component dato container
	* @return array $all_data
	*	$dato is always an array of locators or an empty array
	*/
	public function get_all_data() : array {

		$my_section = $this->get_my_section();
		$relations  = $my_section->get_relations();

		# Filtered case
		$all_data = [];

		// foreach ($relations as $locator) {
		$relations_size = sizeof($relations);
		for ($i=0; $i < $relations_size; $i++) {

			$locator = $relations[$i];

			if(	isset($locator->from_component_tipo) && $locator->from_component_tipo===$this->tipo ) {
				$all_data[] = $locator;
			}
		}

		return $all_data;
	}//end get_all_data



	/**
	* GET_DATO_GENERIC
	* Get the component dato locators with no other property than section_tipo and section_id
	* @return array $dato_generic
	*/
	public function get_dato_generic() : array {

		# Dato without from_component_tipo property
		$dato_generic = [];
		foreach ((array)$this->dato as $key => $current_locator) {
			$generic_locator = new stdClass();
				$generic_locator->section_tipo 	= $current_locator->section_tipo;
				$generic_locator->section_id 	= $current_locator->section_id;
				#$generic_locator->type 		= $current_locator->type;
			$dato_generic[] = $generic_locator;
		}

		return $dato_generic;
	}//end get_dato_generic



	/**
	* GET_DATO_WITH_REFERENCES
	* Return the dato to all components, except the components that has references calculated,
	* like component_relation_related
	* this will mix the real dato and the result of the calculation
	* (!) Default is the component dato, but overwrite it if component need it
	* @return array $dato_with_references
	*/
	public function get_dato_with_references() : array {

		$dato_with_references = $this->get_dato();

		return $dato_with_references;
	}//end get_dato_with_references



	/**
	* SET_DATO
	* Set raw dato overwrite existing dato.
	* Usually, dato is built element by element, adding one locator to existing dato, but sometimes we need
	* to insert complete array of locators at once. Use this method in this cases
	* @return bool
	*/
	public function set_dato($dato) : bool {

		$safe_dato = [];

		// translatable
			$translatable	= $this->RecordObj_dd->get_traducible();
			$lang			= $this->get_lang();

		// non empty dato case
			if (!empty($dato)) {

				// Tool Time machine case, dato is string
				if (is_string($dato)) {
					$dato = json_decode($dato);
				}

				// Bad formed array case
				if (is_object($dato)) {
					$dato = array($dato);
				}

				// Ensures dato is a real non-associative array (avoid JSON encode as object)
				$dato = is_array($dato) ? array_values($dato) : (array)$dato;

				// Verify all locators are well formed
				$relation_type			= $this->relation_type;
				$from_component_tipo	= $this->tipo;

				// debug
					// if (empty($this->relation_type)) {
					// 	dump($this->tipo, ' set dato this empty this->relation_type+ +++++++++++++++++++++++++++++++++++++++ ++ '.to_string($this->default_relation_type));
					// }
					// dump($dato, ' dato ++ '.to_string());
					// error_log(json_encode($dato, JSON_PRETTY_PRINT));
					// die();

				foreach ((array)$dato as $key => $current_locator) {

					// is empty check
						if (empty($current_locator)) {
							$msg = ' Error on set locator. The locator is empty and will be ignored ';
							debug_log( __METHOD__ . $msg, logger::ERROR);
							continue;
						}

					// is_object check
						if (!is_object($current_locator)) {
							$msg = " Error on set locator (is not object)";
							debug_log(__METHOD__
								. $msg . PHP_EOL
								. ' type: ' . gettype($current_locator) . PHP_EOL
								. ' locator: ' . json_encode($current_locator)
								, logger::ERROR
							);
							dump($current_locator, '$current_locator ++ dato: '.to_string($dato));
							// throw new Exception("Error Processing Request. Look server log for details", 1);
							if(SHOW_DEBUG===true) {
								$bt = debug_backtrace();
								dump($bt, ' bt ++ '.to_string());
							}
							continue;
						}

					// section_id
						if (!isset($current_locator->section_id) || !isset($current_locator->section_tipo)) {
							debug_log(__METHOD__
								." IGNORED bad formed locator (empty section_id or section_tipo) [$this->section_tipo, $this->parent, $this->tipo] ". PHP_EOL
								. ' called_class: ' . get_called_class() .PHP_EOL
								. ' current_locator: '.to_string($current_locator)
								, logger::ERROR
							);
							continue;
						}

					// Clone locator to prevent issues with external data or observers (modification of the original locator).
					// When the component is observed by other component, the locator is saved into the observer changed the from_component_tipo (get the component_tipo as his own from_component_tipo)
					// if the locator is not cloned, the original locator of the original component will changed with the last from_component_tipo of the observers
					// the original component will save normally but the changed locator will send to client with incorrect from_component_tipo.
						$locator_copy = clone $current_locator;

					// type
						if (!isset($locator_copy->type)) {
							debug_log(__METHOD__
								." Fixing bad formed locator (empty type) [$this->section_tipo, $this->parent, $this->tipo] ". get_called_class().' - locator_copy: '.to_string($locator_copy)
								, logger::WARNING
							);
							$locator_copy->type = $relation_type;
						}

					// from_component_tipo
						if (!isset($locator_copy->from_component_tipo)) {
							$locator_copy->from_component_tipo = $from_component_tipo;
						}else if ($locator_copy->from_component_tipo!==$from_component_tipo) {
							$locator_copy->from_component_tipo = $from_component_tipo;
							debug_log(__METHOD__
								. " Fixed bad formed locator (bad from_component_tipo $locator_copy->from_component_tipo)" . PHP_EOL
								. ' source_locator: ' . to_string($current_locator) . PHP_EOL
								. ' result_locator: ' . to_string($locator_copy) . PHP_EOL
								. ' called_class: ' . get_called_class()
								, logger::WARNING
							);
						}

					// lang
						if ($translatable==='si') {
							if (!isset($locator_copy->lang)) {
								$locator_copy->lang = $lang;
							}else if ($locator_copy->lang!==$lang) {
								$locator_copy->lang = $lang;
								debug_log(__METHOD__
									. " Fixed bad formed locator (bad lang in translatable locator. Lang: $locator_copy->lang) ". PHP_EOL
									. ' source_locator: ' . to_string($current_locator) . PHP_EOL
									. ' result_locator: ' . to_string($locator_copy) . PHP_EOL
									. ' called_class: ' . get_called_class()
									, logger::WARNING
								);
							}// end if (!isset($locator_copy->lang))
						}// end if ($translatable==='si')

					// paginated_key
						if (isset($locator_copy->paginated_key)) {
							// remove temporal property paginated_key
							unset($locator_copy->paginated_key);
						}

					// normalized locator
						$normalized_locator = new locator($locator_copy);

					// Add. Check if locator already exists
						$locator_properties_to_check = $this->get_locator_properties_to_check();
						$found = locator::in_array_locator($locator_copy, $safe_dato, $locator_properties_to_check);
						if ($found===false) {
							$safe_dato[] = $normalized_locator;
						}else{
							debug_log(__METHOD__
								.' Ignored set_dato of already existing locator '. PHP_EOL
								.' locator_copy: ' . to_string($locator_copy)
								, logger::WARNING
							);
						}
				}//end foreach ((array)$dato as $key => $current_locator)
			}//end if (!empty($dato))

		// set again the safe dato to current component dato
		// (this action force to refresh component property 'dato' with the new safe values)
			parent::set_dato( (array)$safe_dato );

		// translatable cases
			if ($translatable==='si') {
				$new_dato_full = [];
				// remove old locators of current lang
				foreach ((array)$this->dato_full as $locator) {
					if (!isset($locator->lang) || $locator->lang!==$lang) {
						$new_dato_full[] = $locator;
					}
				}
				// merge data and cleaned dato_full
				$this->dato_full = array_merge($new_dato_full, (array)$safe_dato);
			}else{
				$this->dato_full = (array)$safe_dato;
			}


		return true;
	}//end set_dato



	/**
	* GET_LOCATOR_PROPERTIES_TO_CHECK
	* return the properties to be check to compare locators
	* @return array $locator_properties_to_check
	*/
	public function get_locator_properties_to_check() {

		return (RecordObj_dd::get_translatable($this->tipo))
			? ['section_id','section_tipo','type','tag_id','lang']
			: ['section_id','section_tipo','type','tag_id'];

	}//end get_locator_properties_to_check



	/**
	* GET_VALOR_LANG (DEPRECATED)
	* Return the component lang depending of is translatable or not
	* If the component need change this langs (selects, radio buttons...) overwrite this function
	* @return string $lang
	*/
		// public function get_valor_lang() : string {

		// 	$related = (array)$this->RecordObj_dd->get_relaciones();
		// 	if(empty($related)){
		// 		return $this->lang;
		// 	}

		// 	$termonioID_related	= array_values($related[0])[0];
		// 	$translatable		= RecordObj_dd::get_translatable($termonioID_related);

		// 	$lang = $translatable===true
		// 		? DEDALO_DATA_LANG
		// 		: DEDALO_DATA_NOLAN;


		// 	return $lang;
		// }//end get_valor_lang



	/**
	* GET_VALOR_EXPORT
	* Return component value sent to export data
	* @return string $valor
	*/
	public function get_valor_export($valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null) {

		if (empty($valor)) {
			// if not already received 'valor', force component load 'dato' from DB
			$dato = $this->get_dato();
		}else{
			// use parsed received JSON string as dato
			$this->set_dato( json_decode($valor) );
		}

		$valor_export = $this->get_valor($lang);

		// replace html '<br>'' for plain text return '\nl'
		if(!empty($valor_export)) {
			$valor_export = br2nl($valor_export);
		}


		return $valor_export;
	}//end get_valor_export



	/**
	* ADD_LOCATOR_TO_DATO
	* Add one locator to current 'dato'. Verify is exists to avoid duplicates
	* @param object $locator
	* @return bool
	*/
	public function add_locator_to_dato( object $locator ) : bool {

		if(empty($locator)) return false;

		if (!is_object($locator) || !isset($locator->type)) {
			if(SHOW_DEBUG===true) {
				throw new Exception("Error Processing Request. var 'locator' do not contains property 'type'. Type is mandatory ", 1);
			}
			debug_log(__METHOD__
				." Invalid locator is received to add. Locator was ignored (type:".gettype($locator).") " . PHP_EOL
				.' locator: ' . to_string($locator) . PHP_EOL
				.' Type is mandatory : locator->type: ' . $locator->type
				, logger::ERROR
			);
			return false;
		}

		$current_type 	= $locator->type;
		$dato 	  		= $this->get_dato();
		$added 			= false;

		// maintain array index after unset value. ! Important for encode JSON as array later (if keys are not correlatives, undesired object is created)
		$dato = array_values($dato);

		// Test if already exists
		/*
		$ar_properties=array('section_id','section_tipo','type');
		if (isset($locator->from_component_tipo)) 	$ar_properties[] = 'from_component_tipo';
		if (isset($locator->tag_id)) 		 		$ar_properties[] = 'tag_id';
		if (isset($locator->component_tipo)) 		$ar_properties[] = 'component_tipo';
		if (isset($locator->section_top_tipo))		$ar_properties[] = 'section_top_tipo';
		if (isset($locator->section_top_id)) 		$ar_properties[] = 'section_top_id';
		$object_exists = locator::in_array_locator( $locator, $dato, $ar_properties );
		*/
		$object_exists = locator::in_array_locator( $locator, $dato );
		if ($object_exists===false) {

			// Add to dato
			array_push($dato, $locator);

			$added = true;
		}else{
			debug_log(__METHOD__
				." Ignored add locator action because already exists. Tested properties: " . PHP_EOL
				.' locator: ' . json_encode($locator)
				, logger::ERROR
			);
		}

		// Updates current dato
		if ($added===true) {
			$this->set_dato( $dato );
		}


		return $added;
	}//end add_locator_to_dato



	/**
	* REMOVE_LOCATOR_FROM_DATO
	* Removes from dato one or more locators that accomplish given locator equality
	* (!) Not save the result
	* @param object $locator
	* @param array $ar_properties = []
	* @return bool
	*/
	public function remove_locator_from_dato( object $locator_to_remove, array $ar_properties=['section_tipo','section_id','from_component_tipo','type'] ) : bool {

		// empty case
			if (empty($locator_to_remove)) {
				return false;
			}

		// clone for safe modification
			$locator = clone($locator_to_remove);

		// type issues check
			if (!isset($locator->type)) {

				// fix missing locator type property
				$locator->type = $this->relation_type;

				debug_log(__METHOD__
					." Received locator to remove, don't have 'type'. Auto-set type: $this->relation_type to locator: " . PHP_EOL
					.to_string($locator)
					, logger::WARNING
				);
			}elseif ($locator->type!==$this->relation_type) {
				// trigger_error("Incorrect locator type ! Expected $this->relation_type and received $locator->type. tipo:$this->tipo, section_tipo:$this->section_tipo, parent:$this->parent");
				debug_log(__METHOD__
					." Error: Incorrect locator type property! Remove action was aborted" . PHP_EOL
					.' expected: ' . $this->relation_type . PHP_EOL
					.' received: ' . $locator->type . PHP_EOL
					.' locator_to_remove: ' . to_string($locator_to_remove) . PHP_EOL
					.' model: ' . get_called_class() . PHP_EOL
					.' tipo: ' . $this->tipo . PHP_EOL
					.' section_tipo: ' . $this->tipo . PHP_EOL
					.' section_id: ' . $this->section_id
					, logger::ERROR
				);
				return false;
			}

		// iterate and add to new_relations only different locators
			$removed		= false;
			$new_relations	= array();
			$dato			= $this->get_dato();
			if (!empty($dato)) {
				foreach($dato as $current_locator_obj) {

					// Test if already exists
					$equal = locator::compare_locators(
						$current_locator_obj,
						$locator,
						$ar_properties, // array check properties
						['paginated_key'] // $ar_exclude_properties (prevent errors in accidental saved paginated_key cases)
					);
					if ($equal===true) {

						$removed = true;

					}else{

						$new_relations[] = $current_locator_obj;
					}
				}
			}

		// Updates current dato relations with clean array of locators
			if ($removed===true) {
				$this->set_dato( $new_relations );
			}


		return (bool)$removed;
	}//end remove_locator_from_dato



	/**
	* SAVE
	* Save component data in matrix using parent section
	* Verify all necessary vars to save and call section 'save_component_dato($this)'
	* @see section->save_component_dato($this)
	* @return int|null $section_id
	*/
	public function Save() : ?int {

		// short vars
			$section_tipo	= $this->get_section_tipo();
			$section_id		= $this->get_section_id();
			$tipo			= $this->get_tipo();
			$mode			= $this->get_mode();
			$lang			= DEDALO_DATA_LANG;

		// check component minimum vars before save
			if( empty($section_id) || empty($tipo) || empty($lang) ) {
				debug_log(__METHOD__
					. " Error on save: Few vars! . Ignored order" . PHP_EOL
					. ' section_id: ' . to_string($section_id) . PHP_EOL
					. ' section_tipo: ' . $section_tipo . PHP_EOL
					. ' tipo: ' . $tipo . PHP_EOL
					. ' model: ' . get_class($this) . PHP_EOL
					. ' mode: ' . $mode . PHP_EOL
					. ' lang: ' . $lang
					, logger::ERROR
				);
				return null;
			}

		// tm mode case
			if ($this->mode==='tm' || $this->data_source==='tm') {
				debug_log(__METHOD__
					. " Error on save: invalid mode (tm)! . Ignored order" . PHP_EOL
					. ' section_id: ' . to_string($section_id) . PHP_EOL
					. ' section_tipo: ' . $section_tipo . PHP_EOL
					. ' tipo: ' . $tipo . PHP_EOL
					. ' model: ' . get_class($this) . PHP_EOL
					. ' mode: ' . $mode . PHP_EOL
					. ' data_source: ' . $this->data_source . PHP_EOL
					. ' lang: ' . $lang
					, logger::ERROR
				);
				return null;
			}

		// save_to_database. Verify component main vars
			// if (!isset($this->save_to_database) || $this->save_to_database!==false) {
			// 	// section_id validate
			// 		if ( abs(intval($section_id))<1 && strpos((string)$section_id, DEDALO_SECTION_ID_TEMP)===false ) {
			// 			if(SHOW_DEBUG===true) {
			// 				dump($this, "this section_tipo:$section_tipo - section_id:$section_id - tipo:$tipo - lang:$lang");
			// 			}
			// 			trigger_error('Error Processing component save. Inconsistency detected: component trying to save without section_id: '. $section_id);
			// 			return null;
			// 		}
			// }

		// section save. The section will be the responsible to save the component data
			$save_to_database	= isset($this->save_to_database) ? (bool)$this->save_to_database : true; // default is true
			$section			= $this->get_my_section();
			$section_id			= $section->save_component_dato(
				$this, // object $component_obj
				'relation', // string $component_data_type
				$save_to_database // bool $save_to_database
			);

		// relations table links update (default is true)
			if ($this->save_to_database_relations===true) {
				// Dataframe
				// When the component is a dataframe it get only the section_id_key
				// but to save in relations will need the full data (all locators of the component) to replace relations rows
				// so remove the caller_dataframe for the component and all caches (dato_resolved and bl_loaded_matrix_data)
				// to get the full data of the component.
				if(get_called_class() === 'component_dataframe'){
					$current_caller_dataframe		= $this->get_caller_dataframe();
					$this->caller_dataframe			= null;
					$this->dato_resolved			= null;
					$this->bl_loaded_matrix_data	= false;
				}

				$current_dato = $this->get_dato_full();

				$relation_options = new stdClass();
					$relation_options->section_tipo			= $section_tipo;
					$relation_options->section_id			= $section_id;
					$relation_options->from_component_tipo	= $tipo;
					$relation_options->ar_locators			= $current_dato;

				search::propagate_component_dato_to_relations_table($relation_options);

				// Dataframe
				// restores the caller dataframe of the component
				// and delete his data caches to be re-calculated for other calls with the caller_dataframe
				if(get_called_class() === 'component_dataframe'){
					$this->caller_dataframe			= $current_caller_dataframe;
					$this->dato_resolved			= null;
					$this->bl_loaded_matrix_data	= false;
				}
			}

		// save_to_database. Optional stop the save process to delay ddbb access
			if ($save_to_database===false) {
				# Stop here (remember make a real section save later!)
				# No component time machine data will be saved when section saves later
				return (int)$section_id;
			}

		// activity
			$this->save_activity();

		// Observers. The observers will be need to be notified for re-calculate your own dato with the new component dato
			$this->propagate_to_observers();


		return (int)$section_id;
	}//end Save



	/**
	* GET_LOCATOR_VALUE
	* Resolve locator to string value to show in list etc.
	*
	* @param object $locator
	* @param string $lang = DEDALO_DATA_LANG
	* @param bool $show_parents = false
	* @param array|null $ar_components_related
	* @param bool $include_self = true
	*
	* @return array|null $ar_value
	* 	Sample: ['pepe','lope']
	*/
	public static function get_locator_value(
		object $locator,
		string $lang=DEDALO_DATA_LANG,
		bool $show_parents=false,
		?array $ar_components_related=null, // array|bool
		bool $include_self=true
		) : ?array {

		// locator
			if (empty($locator) || !is_object($locator)) {
				return null;
			}
			// parse as real locator class object
			$locator = new locator($locator);

		$ar_value = [];
		if(!empty($ar_components_related)){

			$value = array();
			foreach ($ar_components_related as $component_tipo) {

				$model_name			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
				$current_component	= component_common::get_instance(
					$model_name,
					$component_tipo,
					$locator->section_id,
					'list',
					$lang,
					$locator->section_tipo
				);

				$current_value = component_common::extract_component_value_fallback(
					$current_component, // object component
					$lang, // string lang
					true, // bool mark
					DEDALO_DATA_LANG_DEFAULT // string main_lang
				);
				// dump($current_value , ' $current_value  ++ '.to_string($component_tipo));

				$value[] = $current_value;
			}//end foreach ($ar_components_related as $component_tipo)

			$ar_values_clean = [];
			foreach ((array)$value as $key => $element_value) {
				if (empty($element_value) || $element_value==='<mark></mark>' || $element_value===' ') continue;
				$ar_values_clean[] = $element_value;
			}

			// $locator_value = implode($fields_separator, $ar_values_clean);
			$ar_value = array_merge($ar_value, $ar_values_clean);
		}else{

			if ($show_parents===true) {

				$ar_current_values = [];
				if ($include_self===true) {
					$ar_current_values[] = ts_object::get_term_by_locator( $locator, $lang, true );
				}

				// parents_recursive
				$ar_parents = component_relation_parent::get_parents_recursive(
					$locator->section_id,
					$locator->section_tipo,
					(object)[
						'skip_root' => true
					]
				);
				foreach ($ar_parents as $current_locator) {

					$current_value = ts_object::get_term_by_locator( $current_locator, $lang, true );
					if (!empty($current_value)) {
						$ar_current_values[]  = $current_value;
					}
				}

				// $locator_value = implode($fields_separator, $ar_current_values);
				$ar_value = array_merge($ar_value, $ar_current_values);

			}else{

				$locator_value = ts_object::get_term_by_locator( $locator, $lang, true );

				$ar_value[] = $locator_value;

			}//end if ($show_parents===true)
		}


		return $ar_value;
	}//end get_locator_value



	/**
	* REMOVE_PARENT_REFERENCES
	* Calculate parents and removes references to current section
	* @param string $section_tipo
	* @param int $section_id
	* @param array $filter
	* 	Is array of locators. Default is bool false
	* @return object $response
	*/
	public static function remove_parent_references(string $section_tipo, $section_id, array $filter=null) : object {

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= '';

		// short vars
			$section_table		= common::get_matrix_table_from_tipo($section_tipo); // Normally 'matrix_hierarchy'
			$hierarchy_table	= hierarchy::$table;	// Normally 'hierarchy'. Look too in 'matrix_hierarchy_main' table for references
			$ar_tables			= [$section_table, $hierarchy_table];
			$parents			= component_relation_parent::get_parents(
				$section_id,
				$section_tipo,
				null, // string|null from_component_tipo
				$ar_tables,
				(object)[
					'search_in_main_hierarchy' => true
				]
			);

		// parents to remove
			$ar_removed=array();
			foreach ((array)$parents as $current_parent) {

				$current_component_tipo	= $current_parent->from_component_tipo;
				$current_section_tipo	= $current_parent->section_tipo;
				$current_section_id		= $current_parent->section_id;

				if (!empty($filter)) {
					# compare current with filter
					$process=false;
					foreach ($filter as $current_locator) {
						if ($current_locator->section_id==$current_section_id && $current_locator->section_tipo===$current_section_tipo) {
							$process = true; break;
						}
					}
					if(!$process) continue; // Skip current section
				}


				# Target section data
				$model_name						= RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true); // 'component_relation_children';
				$mode							= 'edit';
				$lang							= DEDALO_DATA_NOLAN;
				$component_relation_children	= component_common::get_instance(
					$model_name,
					$current_component_tipo,
					$current_section_id,
					$mode,
					$lang,
					$current_section_tipo
				);

				# NOTE: remove_me_as_your_child deletes current section references from component_relation_children and section->relations container
				# $removed = (bool)$component_relation_children->remove_child_and_save($child_locator);
				$removed = (bool)$component_relation_children->remove_me_as_your_child( $section_tipo, $section_id );
				if ($removed===true) {
					$component_relation_children->Save();
					debug_log(__METHOD__
						." Removed references in component_relation_children ($current_section_id, $current_section_tipo) to $section_id, $section_tipo "
						, logger::DEBUG
					);
					$ar_removed[] = array(
						'section_tipo'		=> $current_section_tipo,
						'section_id'		=> $current_section_id,
						'component_tipo'	=> $current_component_tipo
					);
				}
			}//end foreach ((array)$parents as $current_parent)

		// response
			if (!empty($ar_removed)) {
				$response->result		= true;
				$response->msg			= 'Removed references: '.count($ar_removed);
				$response->ar_removed	= $ar_removed;
			}


		return $response;
	}//end remove_parent_references



	/**
	* GET_SELECT_QUERY
	* @return object
	*/
	public static function get_select_query( object $select_object ) : object {
		/*
		[path] => Array
			(
				[0] => stdClass Object
					(
						[name] => Título
						[model] => component_input_text
						[section_tipo] => numisdata224
						[component_tipo] => numisdata231
					)

			)

		[lang] => lg-spa
		[component_path] => valor_list
		*/

		# component path
		if(!isset($select_object->component_path)) {

			# Set default
			$select_object->component_path = ['relations'];
		}

		if(!isset($select_object->type)) {
			$select_object->type = 'jsonb';
		}


		return $select_object;
	}//end get_select_query



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* Parses given SQO to use it into the SQL query
	* @param object $query_object
	* @return object $query_object
	*/
	public static function resolve_query_object_sql( object $query_object ) : object {

		// Always set fixed values
		$query_object->type		= 'jsonb';
		$query_object->unaccent	= false;

		// component path
		$query_object->component_path = ['relations'];

		$q = $query_object->q;


		// For unification, all non string are JSON encoded
		// This allow accept mixed values (encoded and no encoded)
		if (!is_string($q)) {
			$q = json_encode($q);
		}

		// remove initial and final array square brackets if they exists
		// $q = str_replace(array('[',']'), '', $q);
		if (strpos($q, '[')===0) {
			$re	= '/^(\[)(.*)(\])$/m';
			$q	= preg_replace($re, '$2', $q);
		}

		$q_operator		= $query_object->q_operator ?? null;
		$component_tipo	= end($query_object->path)->component_tipo;

		switch (true) {
			// IS DIFFERENT
			case ($q_operator==='!=' && !empty($q)):
				$operator = '@>';
				$q_clean  = '\'['.$q.']\'::jsonb=FALSE';
				$query_object->operator = $operator;
				$query_object->q_parsed = $q_clean;
				break;
			// IS NULL
			case ($q_operator==='!*'):
				$operator = '@>';
				if (!empty($query_object->use_function)) {
					$q_clean  = '\'['.$q.']\' = FALSE';
				}else{
					$q_obj = new stdClass();
						$q_obj->from_component_tipo = $component_tipo ;
					$ar_q 	  = array($q_obj);
					$q_clean  = '\''.json_encode($ar_q).'\'::jsonb=FALSE';
				}
				$query_object->operator = $operator;
				$query_object->q_parsed	= $q_clean;
				break;
			// IS NOT NULL
			case ($q_operator==='*'):
				$operator = '@>';
				$q_obj = new stdClass();
					$q_obj->from_component_tipo = $component_tipo ;
				$ar_q 	  = array($q_obj);
				$q_clean  = '\''.json_encode($ar_q).'\'';
				$query_object->operator = $operator;
				$query_object->q_parsed = $q_clean;
				break;
			// CONTAIN
			default:
				$operator = '@>';
				$q_clean  = '\'['.$q.']\'';
				$query_object->operator = $operator;
				$query_object->q_parsed	= $q_clean;
				break;
		}//end switch (true)


		// relations_search. only for component_autocomplete_hi
			$legacy_model = RecordObj_dd::get_legacy_model_name_by_tipo($component_tipo);
			if ($legacy_model==='component_autocomplete_hi'){
				$query_object = component_relation_common::add_relations_search($query_object);
			}


		return $query_object;
	}//end resolve_query_object_sql



	/**
	* ADD_RELATIONS_SEARCH
	* @param object $query_object
	* @return object $new_query_object
	*/
	protected static function add_relations_search( object $query_object) : object {

		// q_operator
			$q_operator = $query_object->q_operator ?? null;

		# Clone and modify query_object for search in relations_search too if the operator is different to ==
			$relation_search_obj = clone $query_object;
			if ($q_operator!=='==') {
				$relation_search_obj->component_path = ['relations_search'];
			}

		# Group the two query_object in a 'or' clause
		$operator = '$or';
		if ($q_operator==='!=') {
			$operator = '$and';
		}
		$new_query_object = new stdClass();
			$new_query_object->{$operator} = [$query_object,$relation_search_obj];


		return $new_query_object;
	}//end add_relations_search



	/**
	* SEARCH_OPERATORS_INFO
	* Return valid operators for search in current component
	* @return array $ar_operators
	*/
	public function search_operators_info() : array {

		$ar_operators = [
			'!='	=> 'different_from',
			'!*'	=> 'empty',
			'*'		=> 'no_empty' // not null
		];

		return $ar_operators;
	}//end search_operators_info



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a mysql field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @return string|null $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value(?string $lang=null, ?object $option_obj=null) : ?string {

		$dato = $this->get_dato();

		$diffusion_value = !empty($dato)
			? json_encode($dato)
			: null;

		return $diffusion_value;
	}//end get_diffusion_value



	/**
	* GET_DIFFUSION_DATO
	* @return string $diffusion_value
	*/
	public function get_diffusion_dato() : ?string {

		$dato = $this->get_dato();
		if (is_array($dato)) {
			$ar_id = array();
			foreach ($dato as $current_locator) {
				$ar_id[] = $current_locator->section_id;
			}
			$final_dato = $ar_id;
		}
		$diffusion_value = isset($final_dato)
			? json_encode($final_dato)
			: null; // json_encode([]);

		return $diffusion_value;
	}//end get_diffusion_dato



	/**
	* GET_DIFFUSION_RESOLVE_VALUE
	* Alias of static diffusion_sql::resolve_value
	* @return mixed
	*/
	public function get_diffusion_resolve_value(object $option_obj=null) : mixed {

		$args_list = func_get_args();
		if (count($args_list)>1) {

			$dato = $this->get_dato();

			$ar_value = [];
			foreach ($args_list as $current_option_obj) {

				$lang = $current_option_obj->lang ?? $this->lang; // $this->lang

				$options = new stdClass();
					$options->lang			= $lang;
					$options->properties	= $current_option_obj;

				$value = diffusion_sql::resolve_value($options, $dato);

				$ar_value[] = $value;
			}

			return $ar_value;
		}

		// example $option_obj
			// {
			//     "process_dato_arguments": {
			//         "target_component_tipo": "numisdata698",
			//         "component_method": "get_diffusion_value"
			//     },
			//	   "lang" : "lg-spa"
			// }

		$dato = $this->get_dato();

		$lang = $option_obj->lang; // $this->lang

		$options = new stdClass();
			$options->lang			= $lang;
			$options->properties	= $option_obj;

		$value = diffusion_sql::resolve_value($options, $dato);


		return $value;
	}//end get_diffusion_resolve_value



	/**
	* GET_DIFFUSION_VALUE_TERM_ID
	* @return string json_encoded array
	*/
	public function get_diffusion_value_term_id() {

		$dato = $this->get_dato();

		$ar_term = [];
		foreach ((array)$dato as $key => $current_locator) {

			// Check target is publicable
				$current_is_publicable = diffusion::get_is_publicable($current_locator);
				if ($current_is_publicable!==true) {
					debug_log(__METHOD__." + Skipped locator not publicable: ".to_string($current_locator), logger::DEBUG);
					continue;
				}

			$term_id = locator::get_term_id_from_locator($current_locator);
			$ar_term[] = $term_id;
		}

		$result = json_encode($ar_term);


		return $result;
	}//end get_diffusion_value_term_id



	/**
	* SET_DATO_EXTERNAL
	* Get the dato from other component that reference at the current section of the component (portal, autocomplete, select, etc)
	* the result will be the result of the search to the external section and component
	* and the combination with the dato of the component (portal, autocomplete, select, etc) (that save the result for user manipulation, order, etc)
	* @see used by component_autocomplete and component_portal
	* @param object options
	* @return bool
	*/
	public function set_dato_external(object $options) : bool {
		$start_time=start_time();

		// options
			$save				= $options->save ?? false;
			$changed			= $options->changed ?? false;
			$current_dato		= $options->current_dato ?? false;
			$references_limit	= $options->references_limit ?? 10;

		// dato set
			$dato = ($current_dato!==false)
				? $current_dato
				: $this->get_dato();

		// properties . get the properties for get search section and component
			$properties				= $this->get_properties();
			$ar_section_to_search	= $properties->source->section_to_search ?? null;
			$ar_component_to_search	= $properties->source->component_to_search ?? false;
			$component_to_search	= is_array($ar_component_to_search)
				? reset($ar_component_to_search)
				: $ar_component_to_search;

		// current section tipo/id
			$section_id		= $this->get_section_id();
			$section_tipo	= $this->get_section_tipo();

		// data source is got and processed from the observer field, it could need to be processed to be saved.
		// in case as component_text_area, data is in the middle of the text as svg, or person tag see: numisdata575 and numisdata197
		// in cases when the component has locators data it will save directly.
			if (isset($properties->source->set_observed_data)){
				// get the observer_data properties
				$set_observed_data = $properties->source->set_observed_data;
				foreach ($set_observed_data as $current_ddo) {

					$current_component_tipo	= $current_ddo->tipo;
					$model_name				= RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo, true);
					$is_translatable		= RecordObj_dd::get_translatable($current_component_tipo);
					$observer_component		= component_common::get_instance(
						$model_name,
						$current_component_tipo,
						$section_id,
						'list',
						$is_translatable ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN,
						$section_tipo,
						false
					);
					if(isset($current_ddo->perform)){
						// get the locators from components literals, as component_text_area
						$function			= $current_ddo->perform->function;
						$params_definition	= $current_ddo->perform->params ?? [];
						$params = is_array($params_definition)
							? $params_definition
							: [$params_definition];

						// check function exits
							if (!method_exists($observer_component, $function)) {
								debug_log(__METHOD__
									. " An error occurred calling function - Method do not exists !  " . PHP_EOL
									. ' function: ' . to_string($function) . PHP_EOL
									. ' component_name: ' . $model_name . PHP_EOL
									. ' component_tipo: ' . $current_component_tipo
									, logger::ERROR
								);
							}

						$final_data = call_user_func_array(array($observer_component, $function), $params);

					}else{
						// get the dato from components with data locators
						$final_data = $observer_component->get_dato();
					}
					$this->set_dato($final_data);
					debug_log(__METHOD__
						."Set observed data ($model_name - $current_component_tipo - $section_tipo - $section_id)"
						, logger::DEBUG
					);
					$this->Save();
				// task done. return
					return true;

				}//end foreach
			}//end if set_observed_data


		// data source overwrite (tool cataloging case)
			if (isset($properties->source->source_overwrite) && isset($properties->source->component_to_search)) {

				// overwrite source locator
					$component_to_search_tipo	= $component_to_search; // $ar_component_to_search[0] ?? null;
					$model_name					= RecordObj_dd::get_modelo_name_by_tipo($component_to_search_tipo, true);
					$component_to_search		= component_common::get_instance(
						$model_name,
						$component_to_search_tipo,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);
					$component_to_search_dato = $component_to_search->get_dato();
					foreach ($component_to_search_dato as $current_locator) {
						$locator = new locator();
							$locator->set_section_id($current_locator->section_id);
							$locator->set_section_tipo($current_locator->section_tipo);
							// $locator->set_from_component_tipo($component_to_search_tipo);
						break; // Only first is allowed
					}

				// get overwrite source data when exists
					if (isset($locator)) {

						$data_from_field_tipo	= $properties->source->source_overwrite->data_from_field;
						$model_name				= RecordObj_dd::get_modelo_name_by_tipo($data_from_field_tipo, true);
						$component_overwrite	= component_common::get_instance(
							$model_name,
							$data_from_field_tipo,
							$locator->section_id,
							'list',
							DEDALO_DATA_NOLAN,
							$locator->section_tipo
						);
						$overwrite_dato = $component_overwrite->get_dato();

						$this->set_dato($overwrite_dato);
						debug_log(__METHOD__." Overwritten dato ($model_name - $data_from_field_tipo - $locator->section_tipo - $locator->section_id)".to_string(), logger::DEBUG);
						$this->Save();
					}

				// task done. return
					return true;
			}

		// new dato
			$new_relation_locators = [];

		// default normal case
		// locator . get the locator of the current section for search in the component that call this section
			$locator = new locator();
				$locator->set_section_id($section_id);
				$locator->set_section_tipo($section_tipo);
				if($ar_component_to_search !== false){
					$locator->set_from_component_tipo($component_to_search);
				}

			$new_relation_locators[] = $locator;


		// data_from_field. get if the search need add fields data:
			if( isset($properties->source->data_from_field) ) {
				$data_from_field  = $properties->source->data_from_field;

				foreach ($data_from_field as $current_component_tipo) {
					$model_name					= RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo, true);
					$component_data_for_search	= component_common::get_instance(
						$model_name,
						$current_component_tipo,
						$locator->section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$locator->section_tipo,
						false
					);
					$component_dato = $component_data_for_search->get_dato_with_references();

					foreach ($component_dato as $current_locator) {
						$locator_dato = new locator();
							$locator_dato->set_section_id($current_locator->section_id);
							$locator_dato->set_section_tipo($current_locator->section_tipo);
							// from_component_tipo
							$locator_dato->set_from_component_tipo($component_to_search);
						$new_relation_locators[] = $locator_dato;
					}
				}
			}

		// Add locator at end
		// $new_relation_locators[] = $locator;
		// get the inverse references
			//old way done in relations table
				// $ar_result 	= $this->get_external_result_from_relations_table($new_relation_locators, $ar_component_to_search);
			//old way done with direct calculation
				// $result = search::calculate_inverse_locators( $locator );

			// sqo. new way done in relations field with standard sqo
				$start_time2=start_time();
				$target_section_to_search = $ar_section_to_search ?? ['all'];
				$sqo = new search_query_object();
					$sqo->set_section_tipo($target_section_to_search);
					$sqo->set_mode('related'); // force use of class.search_related.php
					$sqo->set_full_count(false);
					$sqo->set_limit($references_limit); // default 0 ('ALL')
					$sqo->set_filter_by_locators($new_relation_locators);

				$search		= search::get_instance($sqo);
				$rows_data	= $search->search();
				$ar_records	= & $rows_data->ar_records; // create reference
				if(SHOW_DEBUG===true) {
					$total = exec_time_unit($start_time2,'ms');
					if ($total>30) {
						debug_log(__METHOD__." Search external data: $total ms".PHP_EOL.to_string($sqo), logger::DEBUG);
					}
				}

			// locators. Create a custom locator for each record
				$component_tipo = $this->get_tipo();
				$ar_result = [];
				foreach ($ar_records as $inverse_section) {

					$current_locator = new locator();
						$current_locator->set_section_tipo($inverse_section->section_tipo);
						$current_locator->set_section_id($inverse_section->section_id);
						// $current_locator->set_type($inverse_section->type);
						$current_locator->set_from_component_tipo($component_tipo);

					$ar_result[] = $current_locator;
				}

			$total_ar_result	= sizeof($ar_result);
			$total_ar_dato		= sizeof($dato);
			$final_dato			= [];

			if ($total_ar_result===0 && $total_ar_dato===0) {
				// empty values
				$changed = false;

			}else if ($total_ar_result===0 && $total_ar_dato > 0){

				$changed = true;

			}else if ($total_ar_result>2000) {
				// Not maintain order, is too expensive above 1000 locators
				if ($total_ar_dato!==$total_ar_result) {
					$changed = false; // avoid expensive save
					$this->set_dato($ar_result);
					debug_log(__METHOD__
						." Saving big result with different data (dato:$total_ar_dato - result:$total_ar_result) "
						, logger::DEBUG
					);
				}
			}else{
				// preserve order
					foreach ((array)$dato as $key => $current_locator) {

						$found = array_find($ar_result, function($el) use($current_locator){
							return ($el->section_id===$current_locator->section_id && $el->section_tipo===$current_locator->section_tipo);
						});
						// if (empty($found)) {
						// 	unset($dato[$key]);
						// 	$changed = true;
						// 	break;
						// }
						if(!empty($found)){
							$final_dato[] = $current_locator;
							$changed = true;
						}
					}

				// add new locators than was not saved in dato.
					foreach ($ar_result as $current_locator) {
						if(	locator::in_array_locator( $current_locator, $final_dato, $ar_properties=['section_id','section_tipo'])===false ){
							array_push($final_dato, $current_locator);
							$changed = true;
						}
					}
			}//end if ($total_ar_result>2000)


		// changed true
			if ($changed===true) {
				$dato = array_values($final_dato);
				// foreach ($new_relation_locators as $current_locator) {

					$component_to_update = component_common::get_instance(
						get_called_class(),
						$this->tipo,
						$this->section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$this->section_tipo,
						false
					);

					// set the dato in all instances, included the same instance that current.
					$component_to_update->set_dato($dato);
					if ($save===true) {
						$component_to_update->Save();
						debug_log(__METHOD__
							." Saved modified dato to preserve the order - Total: $total_ar_result locators in section_id: $section_id "
							, logger::DEBUG
						);
					}

				// current_locator check
					if (!isset($current_locator)) {
						debug_log(__METHOD__
							. " Warning. current_locator is not exists. If you are deleting, is normal " . PHP_EOL
							. ' options: ' . to_string($options) . PHP_EOL
							. ' section_tipo: ' . $this->section_tipo . PHP_EOL
							. ' section_id: ' . $this->section_id . PHP_EOL
							. ' model: ' .get_class($this) . PHP_EOL
							. ' label: ' . RecordObj_dd::get_termino_by_tipo($this->tipo, DEDALO_DATA_LANG, true, true) . PHP_EOL
							. ' dato: ' . to_string($dato)
							, logger::WARNING
						);
					}

					// if the current section_id is the same of the current instance update the dato of the current
					// else update the dato of the other instances (references with the same dato)
					if(isset($current_locator) && $current_locator->section_id==$this->section_id){
						$this->set_dato($dato);
					}
				// }//end foreach ($new_relation_locators as $current_locator)
			}//end if ($changed===true)

		// debug
			if(SHOW_DEBUG===true) {
				$total = exec_time_unit($start_time,'ms')." ms";
				debug_log(__METHOD__
					." Total time $total - $total_ar_result locators [$this->section_tipo, $this->tipo, $this->parent] ".get_class($this) .' : '. RecordObj_dd::get_termino_by_tipo($this->tipo, DEDALO_DATA_LANG, true, true)
					, logger::DEBUG
				);
			}


		return true;
	}//end set_dato_external



	/**
	* GET_EXTERNAL_RESULT_FROM_RELATIONS_TABLE
	* @return array $ar_result
	* 	Array of locators
	*/
		// private function DES_get_external_result_from_relations_table($new_dato, $ar_component_to_search) {
		// 	$start_time=start_time();

		// 	if (empty($new_dato)) {
		// 		debug_log(__METHOD__." ERROR. Empty new_dato is received !! Skipped search of external results from relations table. ".to_string(), logger::ERROR);
		// 		return [];
		// 	}

		// 	$value_to_search  = $new_dato;
		// 	$ar_filter_fields = [];
		// 	foreach ($ar_component_to_search as $component_to_search_tipo) {

		// 		// get the query model of the component to search
		// 		foreach ($value_to_search as $current_locator) {
		// 			# model: (a.target_section_tipo='numisdata3' AND a.target_section_id=14 AND a.from_component_tipo='numisdata161')
		// 			$ar_filter_fields[]	= '(target_section_tipo=\''.$current_locator->section_tipo.'\' AND target_section_id='.(int)$current_locator->section_id.' AND from_component_tipo=\''.$component_to_search_tipo.'\')';
		// 		}
		// 		break; // Only one exists
		// 	}
		// 	$filter_fields = implode( PHP_EOL.' OR ', $ar_filter_fields);


		// 	# Build the search query
		// 		$strQuery =  PHP_EOL.'-- '.__METHOD__ .PHP_EOL. 'SELECT section_id, section_tipo FROM "relations" WHERE' .PHP_EOL . $filter_fields;
		// 		if(SHOW_DEBUG===true) {
		// 			error_log("***+++ set_dato_external *** ".$strQuery);
		// 		}

		// 	$result	= JSON_RecordObj_matrix::search_free($strQuery, false);

		// 	if(SHOW_DEBUG===true) {
		// 		//$subtotal = exec_time_unit($start_time,'ms')." ms";
		// 		//debug_log(__METHOD__." Sub-subtotal time $subtotal [$this->section_tipo, $this->tipo, $this->parent] ".get_class($this) .' : '. RecordObj_dd::get_termino_by_tipo($this->tipo) ." ". to_string($strQuery), logger::DEBUG);
		// 	}

		// 	# Build the locators with the result
		// 		$ar_result = array();
		// 		while ($rows = pg_fetch_assoc($result)) {
		// 			$locator = new locator();
		// 				$locator->set_section_id($rows['section_id']);
		// 				$locator->set_section_tipo($rows['section_tipo']);
		// 				$locator->set_type($this->get_relation_type());
		// 				$locator->set_from_component_tipo($this->get_tipo());
		// 			$ar_result[] = $locator;
		// 		}


		// 	return $ar_result;
		// }//end get_external_result_from_relations_table



	/**
	* GET_RELATIONS_SEARCH_VALUE
	* Resolve component search values (parent recursive) to easy search
	* @return array|null $relations_search_value
	* 	Null is default response for calls to this method. Overwritten for component_autocomplete_hi
	* 	Array of locators calculated with thesaurus parents of current section and used only for search
	*/
	public function get_relations_search_value() : ?array {

		// only for component_autocomplete_hi
			$legacy_model = RecordObj_dd::get_legacy_model_name_by_tipo($this->tipo);
			if ($legacy_model!=='component_autocomplete_hi') {
				return null;
			}

		// dato
			$dato = $this->get_dato();
			if (empty($dato)) {
				return null;
			}

		// relations_search_value
			$relations_search_value = [];
			foreach ((array)$dato as $current_locator) {

				$section_id		= $current_locator->section_id;
				$section_tipo	= $current_locator->section_tipo;

				$parents_recursive = component_relation_parent::get_parents_recursive(
					$section_id, // string section_id
					$section_tipo, // string section_tipo
					(object)[
						'skip_root' => true
					]
				);

				foreach ($parents_recursive as $parent_locator) {

					$locator = new locator();
						$locator->set_section_tipo($parent_locator->section_tipo);
						$locator->set_section_id($parent_locator->section_id);
						$locator->set_from_component_tipo($this->tipo);
						$locator->set_type($this->relation_type); // mandatory and equal as component dato relation_type

					if (!in_array($locator, $relations_search_value)) {
						$relations_search_value[] = $locator;
					}
				}
			}


		return $relations_search_value;
	}//end get_relations_search_value



	/**
	* GET_FILTER_LIST_DATA
	* Create all data needed for build service autocomplete filter options interface
	* @param array $filter_by_list
	* @return array $filter_fields_data
	*/
	public static function get_filter_list_data(array $filter_by_list) : array {

		$filter_list_data = [];
		foreach ($filter_by_list as $current_obj_value) {

			$f_section_tipo   	= $current_obj_value->section_tipo;
			$f_component_tipo 	= $current_obj_value->component_tipo;

			// Calculate list values of each element
				$c_model_name 		= RecordObj_dd::get_modelo_name_by_tipo($f_component_tipo,true);
				$current_component  = component_common::get_instance(
					$c_model_name,
					$f_component_tipo,
					null,
					'edit',
					DEDALO_DATA_LANG,
					$f_section_tipo
				);

			// get section JSON
				$get_json_options = new stdClass();
					$get_json_options->get_context	= true;
					$get_json_options->context_type	= 'simple';
					$get_json_options->get_data		= true;

				$json_data = $current_component->get_json($get_json_options);

				$filter_list = new stdClass();
					$filter_list->context	= $json_data->context[0];
					$filter_list->datalist	= $json_data->data[0]->datalist ?? [];
				$filter_list_data[] = $filter_list;
		}


		return $filter_list_data;
	}//end get_filter_list_data



	/**
	* PARSE_STATS_VALUES
	* @return array $ar_clean
	*/
	public static function parse_stats_values(string $tipo, string $section_tipo, $properties, string $lang=DEDALO_DATA_LANG, string $selector='valor_list') : array {

		// Search
			if (isset($properties->stats_look_at)) {
				$related_tipo = reset($properties->stats_look_at);
				if (isset($properties->valor_arguments)) {
					$selector = 'dato';
				}
			}else{
				$related_tipo = false;
			}
			$path 		= search::get_query_path($tipo, $section_tipo, true, $related_tipo);
			$end_path 	= end($path);
			$end_path->selector = $selector;

			$search_query_object = '{
			  "section_tipo": "'.$section_tipo.'",
			  "allow_sub_select_by_id": false,
			  "remove_distinct": true,
			  "limit": 0,
			  "select": [
				{
				  "path": '.json_encode($path).'
				}
			  ]
			}';
			#dump($search_query_object, ' search_query_object ** ++ '.to_string());
			$search_query_object = json_decode($search_query_object);
			$search 			 = search::get_instance($search_query_object);
			$result 			 = $search->search();
			#dump($result, ' result ** ++ '.to_string());

		// Parse results for stats
			$ar_clean = [];
			// foreach ($result->ar_records as $key => $item) {
			$ar_records_size = sizeof($result->ar_records);
			for ($i=0; $i < $ar_records_size; $i++) {

				$item = $result->ar_records[$i];

				#$uid = $locator->section_tipo.'_'.$locator->section_id;

				$value = end($item);

				// locators case (like component_select)
				if (strpos($value, '[{')===0 && !isset($properties->valor_arguments)) {
					$ar_locators = $value;
					foreach ((array)$ar_locators as $locator) {

						$label = ts_object::get_term_by_locator( $locator, $lang, true );
						$label = !empty($label) ? strip_tags(trim($label)) : $label;

						$uid = $locator->section_tipo.'_'.$locator->section_id;

						if(!isset($ar_clean[$uid])){
							$ar_clean[$uid] = new stdClass();
							$ar_clean[$uid]->count = 0;
							$ar_clean[$uid]->tipo  = $tipo;
						}

						$ar_clean[$uid]->count++;
						$ar_clean[$uid]->value = $label;
					}
				// resolved string case (like component_portal)
				}else{

					$label = strip_tags(trim($value));
					if ($label==='[]') {
						$label = 'not defined';
					}

					// Override label with custom component parse
					if (isset($properties->stats_look_at) && isset($properties->valor_arguments)) {
						$model_name	= RecordObj_dd::get_modelo_name_by_tipo(reset($properties->stats_look_at), true);
						$label		= $model_name::get_stats_value_with_valor_arguments($value, $properties->valor_arguments);
					}

					$uid = $label;

					if(!isset($ar_clean[$uid])){
						$ar_clean[$uid] = new stdClass();
						$ar_clean[$uid]->count = 0;
						$ar_clean[$uid]->tipo  = $tipo;
					}

					$ar_clean[$uid]->count++;
					$ar_clean[$uid]->value = $label;
				}
			}//end foreach


		return $ar_clean;
	}//end parse_stats_values



	/**
	* GET_HIERARCHY_TERMS_FILTER
	* Create a sqo filter from
	* @see get_request_config
	*
	* @param array $ar_terms
	* @return array $filter
	*/
	public static function get_hierarchy_terms_filter(array $ar_terms) : array {

		$filter = [];

		foreach ($ar_terms as $current_item) {

			$recursive = (bool)$current_item->recursive;

			// Get children
			$ar_children = component_relation_children::get_children(
				$current_item->section_id,
				$current_item->section_tipo,
				null, // string|null component_tipo
				$recursive
			);
			$component_section_id_tipo = section::get_ar_children_tipo_by_model_name_in_section(
				$current_item->section_tipo, // string section_tipo
				['component_section_id'], // ar_model_name _required
				true, // bool from_cache
				true, // bool resolve_virtual
				true, // bool recursive
				true, // bool search exact
				false // ar_tipo_exclude
			);

			$path = new stdClass();
				$path->section_tipo		= $current_item->section_tipo;
				$path->component_tipo	= reset($component_section_id_tipo);
				$path->model			= 'component_section_id';
				$path->name				= 'Id';

			$ar_section_id = array_map(function($children){
				return $children->section_id;
			}, $ar_children);

			$filter_item = new stdClass();
				$filter_item->q		= implode(',', $ar_section_id);
				$filter_item->path	= [$path];

			$filter[] = $filter_item;
		}//end foreach ($ar_terms as $current_item)


		return $filter;
	}//end get_hierarchy_terms_filter



	/**
	* GET_HIERARCHY_SECTIONS_FROM_TYPES
	* Calculate hierarchy sections (target section tipo) of types requested, like es1,fr1,us1 from type 2 (Toponymy)
	* @param array $hierarchy_types
	* @return array $hierarchy_sections_from_types
	*/
	public static function get_hierarchy_sections_from_types( array $hierarchy_types ) : array {

		// cache
			static $cache_hierarchy_sections_from_types;
			$use_cache = true;
			if ($use_cache===true) {
				$cache_key = implode('_', $hierarchy_types);
				if (isset($cache_hierarchy_sections_from_types[$cache_key])) {
					return $cache_hierarchy_sections_from_types[$cache_key];
				}
			}

		// short vars
			$hierarchy_section_tipo	= DEDALO_HIERARCHY_SECTION_TIPO;

		// active_filter
			$active_locator = new locator();
				$active_locator->set_section_id(NUMERICAL_MATRIX_VALUE_YES);
				$active_locator->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
				$active_locator->set_type(DEDALO_RELATION_TYPE_LINK);
				$active_locator->set_from_component_tipo(DEDALO_HIERARCHY_ACTIVE_TIPO);

			$active_filter = '{
				"q": '.json_encode(json_encode($active_locator)).',
				"path": [
					{
						"section_tipo": "'.$hierarchy_section_tipo.'",
						"component_tipo": "'.DEDALO_HIERARCHY_ACTIVE_TIPO.'",
						"model": "'.RecordObj_dd::get_modelo_name_by_tipo(DEDALO_HIERARCHY_ACTIVE_TIPO,true).'",
						"name": "Active"
					}
				]
			}';

		// typology_filter
			$typology_filter = [];
			foreach ((array)$hierarchy_types as $value) {

				$typology_locator = new locator();
					$typology_locator->set_section_id($value);
					$typology_locator->set_section_tipo(DEDALO_HIERARCHY_TYPES_SECTION_TIPO);
					$typology_locator->set_type(DEDALO_RELATION_TYPE_LINK);
					$typology_locator->set_from_component_tipo(DEDALO_HIERARCHY_TYPOLOGY_TIPO);

				$typology_filter[] = '{
					"q": '.json_encode(json_encode($typology_locator)).',
					"path": [
						{
							"section_tipo": "hierarchy1",
							"component_tipo": "hierarchy9",
							"model": "component_select",
							"name": "Typology"
						}
					]
				}';
			}//end foreach ((array)$hierarchy_types as $key => $value)

		// search_query_object
			$search_query_object = json_decode('
				{
					"id": "get_hierarchy_sections_from_types",
					"section_tipo": "'.$hierarchy_section_tipo.'",
					"skip_projects_filter":"true",
					"limit":0,
					"filter": {
						"$and": [
							'.$active_filter.',
							{ "$or":[
									'.implode(',', $typology_filter).'
								]
							}
						]
					}
				}
			');

		// search exec
			$search	= search::get_instance($search_query_object);
			$result	= $search->search();

		// iterate rows
			$hierarchy_sections_from_types = [];
			foreach ($result->ar_records as $row) {

				if (empty($row->datos->components->{DEDALO_HIERARCHY_TARGET_SECTION_TIPO}->dato->{DEDALO_DATA_NOLAN})) {
					debug_log(__METHOD__
						." Skipped hierarchy without target section tipo: $row->section_tipo, $row->section_id ".to_string()
						, logger::ERROR
					);
					continue;
				}

				$target_dato			= $row->datos->components->{DEDALO_HIERARCHY_TARGET_SECTION_TIPO}->dato->{DEDALO_DATA_NOLAN};
				$target_section_tipo	= $target_dato[0] ?? null;

				if (empty($target_section_tipo)) {
					debug_log(__METHOD__
						." Skipped hierarchy without target section tipo: $row->section_tipo, $row->section_id ". PHP_EOL
						.' target_dato: '. to_string($target_dato)
						, logger::ERROR
					);
					continue;
				}

				$hierarchy_sections_from_types[] = $target_section_tipo;
			}//end foreach ($result->ar_records as $row)

		// cache
			if ($use_cache===true) {
				$cache_hierarchy_sections_from_types[$cache_key] = $hierarchy_sections_from_types;
			}


		return $hierarchy_sections_from_types;
	}//end get_hierarchy_sections_from_types



	/**
	* GET_CONFIG_CONTEXT_SECTION_TIPO
	* @param array $ar_section_tipo_sources
	* @param string|null $retrieved_section_tipo = null
	* @return array $ar_section_tipo
	*/
	public static function get_request_config_section_tipo(array $ar_section_tipo_sources, $retrieved_section_tipo=null) : array {
		$start_time=start_time();

		$ar_section_tipo = [];
		foreach ($ar_section_tipo_sources as $source_item) {

			if (is_string($source_item)) {

				// old self section tipo properties definitions
					// if ($source_item==='self') {
					// 	$source_item = is_array($retrieved_section_tipo) ? reset($retrieved_section_tipo) : $retrieved_section_tipo;
					// }
					if ($source_item==='self') {
						debug_log(__METHOD__
							." Exception ERROR Processing get_request_config_section_tipo (1) invalid section_tipo format. Use an object like \"section_tipo\": [{\"source\": \"self\"}]" . PHP_EOL
							.' source_item: ' . to_string($source_item)
							, logger::ERROR
						);
						if(SHOW_DEBUG===true) {
							throw new Exception("***** Error Processing get_request_config_section_tipo (1) invalid section_tipo format
								. Use an object like \"section_tipo\": [{\"source\": \"self\"}] . ".to_string($source_item), 1);
						}
					}

				$ar_section_tipo[] = $source_item;
				debug_log(__METHOD__
					." ++++++++++++++++++++++++++++++++++++ Added string source item (but expected object). Format values as {'source':'section', 'value'='hierarchy1'} ". PHP_EOL
					.' source_item: '.to_string($source_item) . PHP_EOL
					.' ar_section_tipo_sources: '.to_string($ar_section_tipo_sources) . PHP_EOL
					.' retrieved_section_tipo: '.to_string($retrieved_section_tipo)
					,logger::ERROR
				);
				continue;
			}
			if (empty($source_item->source)) {
				debug_log(__METHOD__
					. " ++++++++++++++++++++++++++++++++++++ Ignored item with empty source ". PHP_EOL
					. ' source_item: ' . to_string($source_item)
					, logger::ERROR
				);
				continue;
			}

			switch ($source_item->source) {
				case 'self':
					// $ar_section_tipo = is_array($retrieved_section_tipo) ? reset($retrieved_section_tipo) : $retrieved_section_tipo;
					$ar_section_tipo = is_array($retrieved_section_tipo) ? $retrieved_section_tipo : [$retrieved_section_tipo];
					break;

				case 'hierarchy_types':
					$hierarchy_types = component_relation_common::get_hierarchy_sections_from_types($source_item->value);
					$ar_section_tipo = array_merge($ar_section_tipo, $hierarchy_types);
					break;

				case 'field_value':
					// this case is used in component_relation_children in the hierarchy section
					// in these case the array of sections will get from the value of specific field
					$target_values = $source_item->value; // target thesaurus like ['hierarchy53']
					foreach ((array)$target_values as $current_component_tipo) {

						// short vars
							$model_name		= RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true);
							$current_lang	= common::get_element_lang($current_component_tipo, DEDALO_DATA_LANG);

						// sections (all hierarchy sections -hierarchy1- normally)
							if (!isset($records)) {
								// calculate once
								$sqo = new stdClass();
									$sqo->section_tipo			= $retrieved_section_tipo;
									$sqo->limit					= 0;
									$sqo->offset				= 0;
									$sqo->order					= false;
									$sqo->skip_projects_filter	= true;
								$sections = sections::get_instance(
									null,
									$sqo,
									$retrieved_section_tipo,
									'list',
									DEDALO_DATA_LANG
								);
								$records = $sections->get_dato();
							}

						// data
							foreach ($records as $current_record) {

								$section = section::get_instance(
									$current_record->section_id,
									$current_record->section_tipo,
									'list',
									true
								);

								// inject datos to section and set as loaded
								$datos = $current_record->datos ?? null;
								if (!is_null($datos)) {
									$section->set_dato($datos);
								}

								// component
								$component = component_common::get_instance(
									$model_name,
									$current_component_tipo,
									$current_record->section_id,
									'list', // string mode
									$current_lang,// $lang=DEDALO_DATA_LANG,
									$current_record->section_tipo
								);

								$component_dato = $component->get_dato();
								if (!empty($component_dato)) {
									foreach ($component_dato as $current_section_tipo) {
										if (!empty($current_section_tipo)) {
											$section_model_name = RecordObj_dd::get_modelo_name_by_tipo($current_section_tipo,true);
											if (!empty($section_model_name)) {
												$ar_section_tipo[] = $current_section_tipo;
											}
										}
									}
								}
							}//end foreach ($dato as $current_record)
					}
					break;

				case 'hierarchy_terms':
					// sample data item:
						// {
						//     "value": [
						//         {
						//             "recursive": true,
						//             "section_id": "202",
						//             "section_tipo": "aa1"
						//         }
						//     ],
						//     "source": "hierarchy_terms"
						// }
					foreach ($source_item->value as $item) {
						$ar_section_tipo[] = $item->section_tipo;
					}
					break;
				case 'section':
				default:
					$ar_section_tipo = array_merge($ar_section_tipo, (array)$source_item->value);
					break;
			}
		}//end foreach ((array)$ar_section_tipo_sources as $source_item)

		// remove duplicates
		$ar_section_tipo = array_unique($ar_section_tipo);

		// debug
			if(SHOW_DEBUG===true) {
				// dump($ar_section_tipo, ' ar_section_tipo ++ '.exec_time_unit($start_time,'ms').' ms');
				// debug_log(
				// 	'------- resolve request_config_section_tipo ------- '.exec_time_unit($start_time,'ms').' ms',
				// 	logger::DEBUG
				// );
			}


		return $ar_section_tipo;
	}//end get_request_config_section_tipo



	/**
	* GET_FIXED_FILTER
	* @param array $ar_fixed
	* @param string $section_tipo
	* @param mixed $section_id
	* @return array $ar_fixed_filter
	*/
	public static function get_fixed_filter(array $ar_fixed, string $section_tipo, mixed $section_id) : array {

		$ar_fixed_filter = [];

		foreach ($ar_fixed as $search_item) {

			$operator	= $search_item->operator ?? '$or';
			$source		= $search_item->source;

			$dato_filter = new stdClass();
				$dato_filter->{$operator} = [];

			switch ($source) {

				case 'fixed_dato':
					// sample (qdp449)
					// {
					// 	"value": [
					// 		{
					// 		"q": {"section_id":"1","section_tipo":"dd64","type":"dd151","from_component_tipo":"hierarchy24"},
					// 		"path": [
					// 		{
					// 			"name": "Usable in indexing",
					// 			"model": "component_radio_button",
					// 			"section_tipo": "hierarchy20",
					// 			"component_tipo": "hierarchy24"
					// 		}
					// 	],
					// 		"q_operator": null
					// 	}
					// 	],
					// 	"source": "fixed_dato"
					// }
					foreach ($search_item->value as $object) {
						$dato_filter->{$operator}[] = $object;
					}
					break;

				case 'component_data':
					//Sample
					//	{
					//		"value": [
					//			{
					//				"q": "rsc423",
					//				"path": [
					//					{
					//						"name": "Id",
					//						"model": "component_section_id",
					//						"section_tipo": "rsc420",
					//						"component_tipo": "rsc414"
					//					}
					//				],
					//				"ddo_map": [
					//					{
					//						"tipo": "numisdata1379",
					//						"parent": "self",
					//						"section_tipo": "numisdata1374"
					//					},
					//					{
					//						"tipo": "rsc423",
					//						"parent": "numisdata1379",
					//						"section_tipo": "rsc197"
					//					}
					//				],
					//				"q_operator": null,
					//				"search_section_id": true
					//			}
					//		],
					//		"source": "component_data"
					//	}
					// Every value has a object with:
					// q :					His value defines the target component_tipo that has the data to be used into the filter
					//						(in the example a portal point to biographic milestones)
					// path : 				To be used as final search path (the component to be searched),
					//						(in the example the section_id of the biographic milestone section)
					// ddo_map :			Defines the ddo path to the component that has the data, it could be in the same section or in other.
					//						(in the example the path from numismatic object to the biographic milestones portal in People under study)
					// 						when the ddo has a children, every child will be resolve with the data of his parent.
					// q_operator  			q_operator to be used
					// search_section_id : 	true | null. Defines if the component data will be used to search into a section_id component, in those cases, join the section_id to optimize the search

					$value = $search_item->value;

					// for every value resolve the path and get the component_data
					foreach($value as $current_value){
						// get the first ddo to be resolve the ddo chain
						$init_ddo = array_find($current_value->ddo_map, function($item) use ($section_tipo) {
							return $item->parent === 'self' || $item->parent === $section_tipo;
						});
						// get the ddo that match with the q definition
						$tipo_to_be_resolved = $current_value->q;

						$resolve_ddo = array_find($current_value->ddo_map, function($item) use ($tipo_to_be_resolved) {
							return $item->tipo === $tipo_to_be_resolved;
						});

						// set the ddo to be resolve as last, is used by the recursion to stop the resolution
						$resolve_ddo->last = true;

						$ar_ddo = $current_value->ddo_map;

						// create the current_data with the section of the component that call.
						// it will use to resolve the ddo_chain
						$current_data = new stdClass();
							$current_data->section_tipo	= $section_tipo;
							$current_data->section_id	= $section_id;

						// resolve the ddo_chain recursively
						$component_data = component_relation_common::resolve_component_data_recursively($ar_ddo, $init_ddo, $current_data) ?? [];

						// if the fixed_filter is used to search into a section_id, join the result of the locators into a flat string separated by commas.
						// this action optimize the search by using an IN SQL statement.
						if(isset($current_value->search_section_id) && $current_value->search_section_id === true){
							$current_section_id = [];

							foreach ($component_data as $search_data) {
								$current_section_id[] = $search_data->section_id;
							}
							// the joined data will be as: "1,5,83,54"
							$joined_search_data = implode(',', $current_section_id);

							// create the sqo filter with the data and specified path
							$filter_item = new stdClass();
								$filter_item->q		= $joined_search_data;
								$filter_item->path	= $current_value->path;

							$dato_filter->{$operator}[] =  $filter_item;

						}else{
							// if the component is other than section_id, create a q and path with every compnent_data.
							foreach ($component_data as $search_data) {
								$filter_item = new stdClass();
									$filter_item->q		= $search_data;
									$filter_item->path	= $current_value->path;
									//$filter_item->path	= search::get_query_path($tipo, $section_tipo,false,false)[0];
								$dato_filter->{$operator}[] =  $filter_item;
							}
						}
					}
					break;

				case 'hierarchy_terms':
					$hierarchy_terms_filter = component_relation_common::get_hierarchy_terms_filter($search_item->value);
					if(empty($hierarchy_terms_filter)) break;
					$dato_filter->{$operator} =  $hierarchy_terms_filter;
					break;
			}

			// finished group add
			if (!empty($dato_filter->{$operator})) {
				$ar_fixed_filter[] =$dato_filter;
			}
		}//end foreach ($ar_fixed as $search_item)

		return $ar_fixed_filter;
	}//end get_fixed_filter



	/**
	* RESOLVE_COMPONENT_DATA_RECURSIVELY
	* Get data of the parent component and inject into the next component in the chain (his children)
	* @param array $ar_ddo // full array with all ddo
	* @param dd_object $dd_object // parent ddo to get his children
	* @param locator $data // data of the previous recursion
	* @return array|null $component_data
	*/
	private static function resolve_component_data_recursively(array $ar_ddo, object $dd_object, object $data) : ?array {

		$last			= $dd_object->last ?? null;
		$tipo			= $dd_object->tipo;
		$section_tipo	= $data->section_tipo;
		$section_id		= $data->section_id;
		$model			= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$translatable	= RecordObj_dd::get_translatable($tipo);
		$component		= component_common::get_instance(
			$model,
			$tipo,
			$section_id,
			'list',
			$translatable===true ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN,
			$section_tipo
		);
		$component_data = $component->get_dato();
		if(empty($component_data)){
			return null;
		};

		// if the ddo has a $last property, it will be the component to get his data
		// but if the ddo in not the $last ddo, do recursion to resolve the next level into the ddo chain.
		if(!isset($last)){
			$children = component_relation_common::get_ddo_children_recursive($ar_ddo, $dd_object);
			$current_compnent_data = [];
			foreach($component_data as $current_data){
				foreach ($children as $current_ddo_child) {
					$result_compnent_data = component_relation_common::resolve_component_data_recursively($ar_ddo, $current_ddo_child, $current_data);
					// join the result data with the siblings resolution.
					$current_compnent_data = array_merge($current_compnent_data, $result_compnent_data);
				}
			}
			return $current_compnent_data;
		}

		return $component_data;
	}//end resolve_component_data_recursively


	/**
	* GET_DDO_CHILDREN_RECURSIVE
	* children_resursive function, used to get all children for specific ddo
	* @param array $ar_ddo // full array with all ddo
	* @param dd_object $dd_object // parent ddo to get his children
	* @return array $ar_children
	*/
	private static function get_ddo_children_recursive(array $ar_ddo, object $dd_object) : array {
		$ar_children = [];
		foreach ($ar_ddo as $ddo) {
			if($ddo->parent===$dd_object->tipo) {
				$ar_children[] = $ddo;
				$result = component_relation_common::get_ddo_children_recursive($ar_ddo, $ddo);
				if (!empty($result)) {
					$ar_children = array_merge($ar_children, $result);
				}
			}
		}
		return $ar_children;
	}



	/**
	* GET_SORTABLE
	* @return bool
	* 	Default is true. Override when component is sortable
	*/
	public function get_sortable() : bool {

		return false;
	}//end get_sortable



	/**
	* GET_ORDER_PATH
	* Calculate full path of current element to use in columns order path (context)
	* @param string $component_tipo
	* @param string $section_tipo
	* @return array $path
	*/
		// public function get_order_path(string $component_tipo, string $section_tipo) : array {

		// 	$path = [
		// 		(object)[
		// 			'component_tipo'	=> $component_tipo,
		// 			'model'				=> RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true),
		// 			'name'				=> RecordObj_dd::get_termino_by_tipo($component_tipo),
		// 			'section_tipo'		=> $section_tipo
		// 		]
		// 	];

		// 	return $path;
		// }//end get_order_path



	/**
	* GET_ORDER_PATH
	* Calculate full path of current element to use in columns order path (context)
	* @param string $component_tipo
	* @param string $section_tipo
	* @return array $path
	*/
		// public function get_order_path(string $component_tipo, string $section_tipo) : array {

		// 	$path = [];

		// 	// from_section_tipo. If exists and is distinct to section_tipo, build and prepend the caller item
		// 		if (isset($this->from_section_tipo) && $this->from_section_tipo!==$section_tipo) {
		// 			$path[] = (object)[
		// 				'component_tipo'	=> $this->from_component_tipo,
		// 				'model'				=> RecordObj_dd::get_modelo_name_by_tipo($this->from_component_tipo,true),
		// 				'name'				=> RecordObj_dd::get_termino_by_tipo($this->from_component_tipo),
		// 				'section_tipo'		=> $this->from_section_tipo
		// 			];
		// 		}

		// 	// self component path
		// 		$path[] = (object)[
		// 			'component_tipo'	=> $component_tipo,
		// 			'model'				=> RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true),
		// 			'name'				=> RecordObj_dd::get_termino_by_tipo($component_tipo),
		// 			'section_tipo'		=> $section_tipo
		// 		];

		// 	// ddo_map. request_config show ddo_map first item is used to sort
		// 	// must be calculated previously by the get_structure_context method
		// 		// $request_config_item = array_find($this->request_config, function($el){
		// 		// 	return $el->api_engine==='dedalo';
		// 		// });
		// 		// $show = $request_config_item->show ?? null;
		// 		// if (empty($show)) {

		// 		// 	debug_log(__METHOD__." Ignored empty request_config_item->show (mode:$this->mode) [$this->section_tipo - $this->tipo]", logger::ERROR);

		// 		// }else{

		// 		// 	$first_item	= $show->ddo_map[0] ?? null;

		// 		// 	if (empty($first_item)) {
		// 		// 		debug_log(__METHOD__." Ignored show empty first_item (mode:$this->mode) [$this->section_tipo - $this->tipo]", logger::ERROR);
		// 		// 		dump($show, ' show empty first_item ++++++++ '.to_string($this->tipo));
		// 		// 	}else{
		// 		// 		// target component
		// 		// 		$path[] = (object)[
		// 		// 			'component_tipo'	=> $first_item->tipo,
		// 		// 			'model'				=> RecordObj_dd::get_modelo_name_by_tipo($first_item->tipo,true),
		// 		// 			'name'				=> RecordObj_dd::get_termino_by_tipo($first_item->tipo),
		// 		// 			// note that section_tipo is used only to give a name to the join item.
		// 		// 			// results are not really filtered by this section_tipo
		// 		// 			'section_tipo'		=> is_array($first_item->section_tipo)
		// 		// 				? reset($first_item->section_tipo)
		// 		// 				: $first_item->section_tipo
		// 		// 		];
		// 		// 	}
		// 		// }

		// 	return $path;
		// }//end get_order_path



	/**
	* GET_LIST_VALUE
	* Unified value list output
	* By default, list value is equivalent to dato. Override in other cases.
	* Note that empty array or string are returned as null
	* @return array|null $list_value
	*/
	public function get_list_value() : ?array {

		$dato = $this->get_dato();
		if (empty($dato)) {
			return null;
		}

		$list_value = [];
		$ar_list_of_values = $this->get_ar_list_of_values(DEDALO_DATA_LANG);
		foreach ($ar_list_of_values->result as $item) {

			$locator = $item->value;
			if ( true===locator::in_array_locator($locator, $dato, array('section_id','section_tipo')) ) {
				$list_value[] = $item->label;
			}
		}

		return $list_value;
	}//end get_list_value



	/**
	* CONFORM_IMPORT_DATA
	* @param string $import_value
	*  sample JSON stringified array of locators:
	*  [{"section_tipo":"ts1","section_id":"273","from_component_tipo":"hierarchy36"}]
	* @param string $column_name
	* 	like: 'hierarchy36' or 'hierarchy36_ts1'
	* @return object $response
	*/
	public function conform_import_data(string $import_value, string $column_name) : object {

		// Response
			$response = new stdClass();
				$response->result	= null;
				$response->errors	= [];
				$response->msg		= 'Error. Request failed';

		// Check if is a JSON string. Is yes, decode
			if(json_handler::is_json($import_value)){
				// try to JSON decode (null on not decode)
				$dato_from_json	= json_handler::decode($import_value); // , false, 512, JSON_INVALID_UTF8_SUBSTITUTE
				$import_value	= $dato_from_json;
			}

		// short vars
			$type			= $this->get_relation_type();
			$section_tipo	= $this->section_tipo;
			$value			= $import_value;

		// no value case
			if (empty($value)) {
				return $response;
			}

		// return value
			$ar_locators = [];

		// column name could be only the tipo as "rsc85" or a identifier as "rsc85_rsc197"
		// the component tipo are always the first tipo in the column name
			$ar_tipos				= explode(locator::DELIMITER, $column_name);
			$from_component_tipo	= $ar_tipos[0];
			$target_section_tipo	= $ar_tipos[1] ?? null;

		// check if the value is not a valid JSON or if it's a int,
		// cases: 1 || 4,5
		// 1 is an int and 4,5 is string
		// but not the locator [{"section_tipo":"oh1","section_id":"1"}] it's valid JSON
			if (is_string($value) || is_int($value)) {

				// $target_section_tipo
					if( empty($target_section_tipo) ) {

						$ar_target_section_tipo = $this->get_ar_target_section_tipo();
						if(count($ar_target_section_tipo)>1) {

							debug_log(__METHOD__
								." Trying to import multiple section_tipo without clear target" .PHP_EOL
								.' ar_target_section_tipo: '. json_encode($ar_target_section_tipo, JSON_PRETTY_PRINT)
								, logger::ERROR
							);

							$failed = new stdClass();
								$failed->section_id		= $this->section_id;
								$failed->data			= stripslashes( $import_value );
								$failed->component_tipo	= $this->get_tipo();
								$failed->msg			= 'IGNORED: mTry to import multiple section_tipo without clear target ';
							$response->errors[] = $failed;

							return $response;
						}
						$target_section_tipo = $ar_target_section_tipo[0] ?? null;
					}

				$ar_values = explode(',', (string)$value);
				foreach ($ar_values as $section_id) {
					// old format (section_id)
					// is int. Builds complete locator and set section_id from value
					$locator = new locator();
						// ! type could be false (component_relation_parent)
						if (!empty($type)) {
							$locator->set_type($type);
						}
						$locator->set_section_tipo($target_section_tipo);
						$locator->set_from_component_tipo($from_component_tipo);
						$locator->set_section_id(trim($section_id));

					$ar_locators[] = $locator;
				}
			}else{

				// Locator case
				$value = !is_array($value) ? [$value] : $value;
				foreach ($value as $current_locator) {

				// is full locator. Inject safe fixed properties to avoid errors
					$locator = new locator($current_locator);
						// ! type could be false (component_relation_parent)
						if (!empty($type) && !property_exists($current_locator, 'type')) {
							$locator->set_type($type);
						}
						if (!property_exists($current_locator, 'from_component_tipo')) {
							$locator->set_from_component_tipo($from_component_tipo);
						}

					$ar_locators[] = $locator;
				}
			}

		// response
			$response->result	= $ar_locators;
			$response->msg		= 'OK';


		return $response;
	}//end conform_import_data



	/**
	* ADD_NEW_ELEMENT
	* Creates a new record in target section and propagates filter data
	* Add the new record section id to current component data (as locator) and save it
	* (!) Note that this function do NOT save the value
	* @param object $options
	* Sample:
	* {
	* 	target_section_tipo : 'rsc197'
	* }
	* @return object $response
	*/
	public function add_new_element( object $options ) : object {

		// options
			$target_section_tipo = $options->target_section_tipo ?? null;

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed';

		// target_section_tipo check
			if(empty($target_section_tipo)){
				$response->msg .= ' Is mandatory to specify target_section_tipo';
				return $response;
			}

		// 1 PROJECTS GET
			// We get current portal filter data (projects) to heritage in the new portal record
			$section_id				= $this->get_section_id();
			$component_filter_dato	= (strpos((string)$section_id, DEDALO_SECTION_ID_TEMP)!==false)
				? null
				: $this->get_current_section_filter_data();
			if(empty($component_filter_dato)) {

				debug_log(__METHOD__
					." Empty filter value in current section. Default project value will be used: "
					.' section_tipo: ' . $this->section_tipo . PHP_EOL
					.' section_id: ' . $section_id
					, logger::WARNING
				);

				// Default value is used
				// Temp section case Use default project here
				$locator = new locator();
					$locator->set_section_tipo(DEDALO_SECTION_PROJECTS_TIPO);
					$locator->set_section_id(DEDALO_DEFAULT_PROJECT);
				$component_filter_dato = [$locator];
			}

		// 2 SECTION
			// Section record . create new empty section in target section tipo
			$section_new = section::get_instance(null, $target_section_tipo);

			$save_options = new stdClass();
				$save_options->caller_dato				= $this->get_dato();
				$save_options->component_filter_dato	= $component_filter_dato;

			$new_section_id = $section_new->Save( $save_options );

			if($new_section_id<1) {
				$msg = __METHOD__." Error on create new section: new section_id is not valid ! ";
				$response->msg .= $msg;
				debug_log(__METHOD__." $response->msg ".to_string(), logger::ERROR);
				return $response;
			}

		// 3 PORTAL
			// Portal dato. add current section id to component portal dato array
			// Basic locator
			$locator = new locator();
				$locator->set_section_id($new_section_id);
				$locator->set_section_tipo($target_section_tipo);
				$locator->set_type(DEDALO_RELATION_TYPE_LINK);
				$locator->set_from_component_tipo($this->tipo);

			$added = $this->add_locator_to_dato($locator);
			if ($added!==true) {
				$response->msg .= 'Error add_locator_to_dato. New locator is not added !';
				debug_log(__METHOD__." $response->msg ".to_string(), logger::ERROR);
				return $response;
			}

		// Save current component updated data
			// $this->Save();

		// response OK
			$response->result			= true;
			$response->section_id		= $new_section_id;
			$response->added_locator	= $locator;
			$response->msg				= 'OK. Request done '.__METHOD__;


		return $response;
	}//end add_new_element



}//end class component_relation_common
