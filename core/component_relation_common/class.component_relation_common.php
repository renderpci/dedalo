<?php
/*
* CLASS COMPONENT_RELATION_COMMON
* Used as common base from all components that works from section relations data, instead standard component dato
* like component_model, component_parent, etc..
*/
class component_relation_common extends component_common {



	/**
	* CLASS VARS
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



	/**
	* __CONSTRUCT
	* @param string $tipo = null
	* @param string|null $parent = null
	* @param string $mode = 'list'
	* @param string $lang = null
	* @param string $section_tipo = null
	*
	* @return bool
	*/
	public function __construct(string $tipo=null, $parent=null, string $mode='list', string $lang=null, string $section_tipo=null) {

		// lang. translatable conditioned
			$translatable = RecordObj_dd::get_translatable($tipo);
			if ($translatable===true) {
				if (empty($lang)) {
					$lang = DEDALO_DATA_LANG;
				}else{
					if ($lang===DEDALO_DATA_NOLAN) {
						debug_log(__METHOD__." Changed component wrong lang [TRANSLATABLE $section_tipo - $tipo] from $lang to ".DEDALO_DATA_LANG, logger::ERROR);
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
			parent::__construct($tipo, $parent, $mode, $lang, $section_tipo);
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
			'component_select_lang'
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

		// read value
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

		// load. Load matrix data and set this->dato
			$this->load_component_dato();

		$dato_full = $this->dato_full;

		return $dato_full;
	}//end get_dato_full



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
	* GET_VALUE
	* Get the value of the components. By default will be get_dato().
	* overwrite in every different specific component
	* Some the text components can set the value with the dato directly
	* the relation components need to process the locator to resolve the value
	* @param string $lang = DEDALO_DATA_LANG
	* @param object|null $ddo = null
	*
	* @return object $value
	*/
	public function get_value(string $lang=DEDALO_DATA_LANG, object $ddo=null) : dd_grid_cell_object {

		// ddo customs: set the separator if the ddo has a specific separator, it will be used instead the component default separator
			$fields_separator	= $ddo->fields_separator ?? null;
			$records_separator	= $ddo->records_separator ?? null;
			$format_columns		= $ddo->format_columns ?? null;
			$class_list			= $ddo->class_list ?? null;

		$data = $this->get_dato();

		// set the label of the component as column label
		$label = $this->get_label();
		// get the request request_config of the component
		// the caller can built a request_config that will used instead the default request_config
		$request_config = isset($this->request_config)
			? $this->request_config
			: $this->build_request_config();

		// get the correct rqo (use only the dedalo api_engine)
		$dedalo_request_config = array_find($request_config, function($el){
			return $el->api_engine==='dedalo';
		});

		// get the ddo_map to be used to create the components related to the portal
		$ddo_map = $dedalo_request_config->show->ddo_map;

		$ar_cells			= [];
		$ar_columns_obj		= [];
		$sub_row_count		= 0;
		$sub_column_count	= null;
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

		$components_with_relations	= component_relation_common::get_components_with_relations();

		if(empty($data)){
			$pseudo_locator = new stdClass();
				$pseudo_locator->type			= DEDALO_RELATION_TYPE_LINK; // 'dd151';
				$pseudo_locator->section_tipo	= null;
				$pseudo_locator->section_id		= null;
			$data[] = $pseudo_locator;
		}
		foreach($data as $current_key => $locator){
			$locator_column_obj	= [];
			$ar_columns = [];
			foreach ($ddo_direct_children as $ddo) {
				// the the ddo has a multiple section_tipo (such as toponymy component_autocomplete), reset the section_tipo
				$ddo_section_tipo		= is_array($ddo->section_tipo) ? reset($ddo->section_tipo) : $ddo->section_tipo;
				$locator->section_tipo	= $locator->section_tipo ?? $ddo_section_tipo ;
				$section_tipo			= $locator->section_tipo;
				// set the path that will be used to create the column_obj id
				$current_path			= $section_tipo.'_'.$ddo->tipo;
				$translatable			= RecordObj_dd::get_translatable($ddo->tipo);
				$current_lang			= $translatable===true ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
				$component_model		= RecordObj_dd::get_modelo_name_by_tipo($ddo->tipo,true);
				// dump($component_model,'$component_model');
				$current_component 	= component_common::get_instance(
					$component_model,
					$ddo->tipo,
					$locator->section_id,
					$this->mode,
					$current_lang,
					$locator->section_tipo
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
					$current_path	= $current_path.'|'.$current_key;
				}
				// create the new column obj id getting the previous id and add the new path
				// it will set to the column_obj for the next loop
				$current_column_obj = new stdClass();
					$current_column_obj->id		= $column_obj->id.'_'.$current_path;
					$current_column_obj->group	= $column_obj->id.'_'.$locator->section_tipo;
				$current_component->column_obj = $current_column_obj;

				// get the value and fallback_value of the component and stored to be joined
				$current_column		= $current_component->get_value($lang, $ddo);
				$sub_row_count		= $current_column->row_count ?? 0;
				// if (in_array($component_model, $components_with_relations)) {
				// 	$current_column = get_last_column_recursive([$current_column]);
				// }
				// get the value and fallback_value of the component and stored to be joined
				$locator_column_obj	= array_merge($locator_column_obj, $current_column->ar_columns_obj);

				// store the columns into the full columns array
				$ar_columns[] = $current_column;
			}// end foreach ($ddo_direct_children as $ddo)

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
			$column_count	= sizeof($ar_columns_obj);

		// set the separator text that will be used to render the column
		// separator will be the "glue" to join data in the client and can be set by caller or could be defined in preferences of the component.
		$properties = $this->get_properties();

		$fields_separator = isset($fields_separator)
			? $fields_separator
			: (isset($properties->fields_separator)
				? $properties->fields_separator
				: ', ');

		$records_separator = isset($records_separator)
			? $records_separator
			: (isset($properties->records_separator)
				? $properties->records_separator
				: ' | ');

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
	}//end get_value



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
	* Usually, dato is built element by element, adding one locator to existing dato, but some times we need
	* insert complete array of locators at once. Use this method in this cases
	*/
	public function set_dato($dato) {

		$safe_dato = [];

		$translatable = $this->RecordObj_dd->get_traducible();
		$lang = $this->get_lang();

		if (!empty($dato)) {

			// Tool Time machine case, dato is string
			if (is_string($dato)) {
				$dato = json_decode($dato);
			}

			// Bad formed array case
			if (is_object($dato)) {
				$dato = array($dato);
			}

			// Ensures dato is a real non-associative array (avoid json encode as object)
			$dato = is_array($dato) ? array_values($dato) : (array)$dato;

			# Verify all locators are well formed
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
						$msg = " Error on set locator (is not object) json_ecoded: ".json_encode($current_locator);
						trigger_error( __METHOD__ . $msg );
						debug_log( __METHOD__ . $msg, logger::ERROR);
						throw new Exception("Error Processing Request. Look server log for details", 1);
					}

				// section_id
					if (!isset($current_locator->section_id) || !isset($current_locator->section_tipo)) {
						debug_log(__METHOD__." IGNORED bad formed locator (empty section_id or section_tipo) [$this->section_tipo, $this->parent, $this->tipo] ". get_called_class().' - current_locator: '.to_string($current_locator), logger::ERROR);
						continue;
					}

				// type
					if (!isset($current_locator->type)) {
						debug_log(__METHOD__." Fixing bad formed locator (empty type) [$this->section_tipo, $this->parent, $this->tipo] ". get_called_class().' - current_locator: '.to_string($current_locator), logger::WARNING);
						$current_locator->type = $relation_type;
					}

				// from_component_tipo
					if (!isset($current_locator->from_component_tipo)) {
						$current_locator->from_component_tipo = $from_component_tipo;
					}else if ($current_locator->from_component_tipo!==$from_component_tipo) {
						debug_log(__METHOD__." Fixed bad formed locator (bad from_component_tipo $current_locator->from_component_tipo) [$this->section_tipo, $this->parent, $from_component_tipo] ".get_called_class().' '.to_string(), logger::WARNING);
						$current_locator->from_component_tipo = $from_component_tipo;
					}

				// lang
					if ($translatable==='si') {
						if (!isset($current_locator->lang)) {
							$current_locator->lang = $lang;
						}else if ($current_locator->lang!==$lang) {
							debug_log(__METHOD__." Fixed bad formed locator (bad lang $current_locator->lang) [$this->section_tipo, $this->parent, $lang] ".get_called_class().' '.to_string(), logger::WARNING);
							$current_locator->lang = $lang;
						}// end if (!isset($current_locator->lang))
					}// end if ($translatable==='si')

				// normalized locator
					$normalized_locator = new locator($current_locator);

				// Add. Check if locator already exists
					$ar_properties = ($translatable==='si')
						? ['section_id','section_tipo','type','tag_id','lang']
						: ['section_id','section_tipo','type','tag_id'];
					$found = locator::in_array_locator( $current_locator, $safe_dato, $ar_properties);
					if ($found===false) {
						$safe_dato[] = $normalized_locator;
					}else{
						debug_log(__METHOD__.' Ignored set_dato of already existing locator '.to_string($current_locator), logger::ERROR);
					}
			}
		}

		// set again the safe dato to current component dato (this action force to refresh component property 'dato' with the new safe values)
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
				$this->dato_full =  (array)$safe_dato;
			}


		return true;
	}//end set_dato



	/**
	* GET_VALOR_LANG
	* Return the component lang depending of is translatable or not
	* If the component need change this langs (selects, radio buttons...) overwrite this function
	* @return string $lang
	*/
	public function get_valor_lang() : string {

		$related = (array)$this->RecordObj_dd->get_relaciones();
		if(empty($related)){
			return $this->lang;
		}

		$termonioID_related	= array_values($related[0])[0];
		$translatable		= RecordObj_dd::get_translatable($termonioID_related);

		$lang = $translatable===true
			? DEDALO_DATA_LANG
			: DEDALO_DATA_NOLAN;


		return $lang;
	}//end get_valor_lang



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
			// use parsed received json string as dato
			$this->set_dato( json_decode($valor) );
		}

		$valor_export = $this->get_valor($lang);

		// replace html '<br>'' for plain text return '\nl'
		$valor_export = br2nl($valor_export);

		return $valor_export;
	}//end get_valor_export



	/**
	* LOAD_COMPONENT_DATAFRAME
	* @return bool
	*/
	public function load_component_dataframe() : bool {

		// check vars
			if( empty($this->section_id) || $this->mode==='dummy' || $this->mode==='search') {
				return false;
			}

		$dato = $this->get_dato();

		$this->dataframe = [];

		foreach ($dato as $key => $current_locator) {
			if (isset($current_locator->dataframe)) {
				foreach ($current_locator->dataframe as $dataframe_obj) {
					$this->dataframe[] = $dataframe_obj;
				}
			}
		}

		# Set as loaded
		$this->bl_loaded_matrix_data = true;


		return true;
	}//end load_component_dataframe



	/**
	* ADD_LOCATOR_TO_DATO
	* Add one locator to current 'dato'. Verify is exists to avoid duplicates
	* @return bool
	*/
	public function add_locator_to_dato( object $locator ) : bool {

		if(empty($locator)) return false;

		if (!is_object($locator) || !isset($locator->type)) {
			if(SHOW_DEBUG===true) {
				throw new Exception("Error Processing Request. var 'locator' not contains property 'type' ", 1);
			}
			debug_log(__METHOD__." Invalid locator is received to add. Locator was ignored (type:".gettype($locator).") ".to_string($locator), logger::WARNING);
			return false;
		}

		$current_type 	= $locator->type;
		$dato 	  		= $this->get_dato();
		$added 			= false;

		# maintain array index after unset value. ! Important for encode json as array later (if keys are not correlatives, undesired object is created)
		$dato = array_values($dato);

		# Test if already exists
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

			# Add to dato
			array_push($dato, $locator);

			$added = true;
		}else{
			debug_log(__METHOD__." Ignored add locator action: locator ".json_encode($locator)." already exists. Tested properties: ".to_string(), logger::DEBUG);
		}

		# Updates current dato
		if ($added===true) {
			$this->set_dato( $dato );
		}


		return $added;
	}//end add_locator_to_dato



	/**
	* REMOVE_LOCATOR_FROM_DATO
	* Removes from dato one or more locators that accomplish given locator equality
	* (!) Not save the result
	* @param array $ar_properties
	* @return bool
	*/
	public function remove_locator_from_dato( object $locator, array $ar_properties=[] ) : bool {

		if (empty($locator)) {
			return false;
		}

		$locator = clone($locator);

		if (!isset($locator->type)) {
			$locator->type = $this->relation_type;
			debug_log(__METHOD__." Received locator to remove, don't have 'type'. Autoset type: $this->relation_type to locator: ".to_string($locator), logger::DEBUG);
		}elseif ($locator->type!==$this->relation_type) {
			trigger_error("Incorrect locator type ! Expected $this->relation_type and received $locator->type. tipo:$this->tipo, section_tipo:$this->section_tipo, parent:$this->parent");
			return false;
		}

		$removed		= false;
		$new_relations	= array();
		$dato = (array)$this->get_dato();
		foreach($dato as $key => $current_locator_obj) {

			# Test if already exists
			$equal = locator::compare_locators( $current_locator_obj, $locator, $ar_properties );
			if ( $equal===true ) {

				$removed = true;

			}else{

				$new_relations[] = $current_locator_obj;
			}
		}
		// error_log("Removed: ".json_encode($removed));
		// debug_log(__METHOD__." ".get_called_class()." $this->tipo, $this->section_tipo, $this->parent. To remove:".to_string($locator)." - final dato:".to_string($new_relations)." - removed: ".to_string($removed), logger::DEBUG);

		# Updates current dato relations with clean array of locators
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

		// // dataframe mode. Save caller and stop
		// 	if (strpos($mode,'dataframe')===0 && isset($this->caller_dataset)) {

		// 		// new_component
		// 			$new_tipo			= $this->caller_dataset->component_tipo;
		// 			$new_section_tipo	= $this->caller_dataset->section_tipo;
		// 			$new_parent			= $this->caller_dataset->section_id;
		// 			$new_modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($new_tipo, true);
		// 			$new_component		= component_common::get_instance(
		// 				$new_modelo_name,
		// 				$new_tipo,
		// 				$new_parent,
		// 				'edit',
		// 				$lang,
		// 				$new_section_tipo
		// 			);

		// 		// Force load current db dato to avoid loose it
		// 		// component that will be marked with dataframe (the original component)
		// 			$component_dato = $new_component->get_dato();

		// 		// Set dataframe data
		// 			$new_component->update_dataframe_element($this->dato, $this->caller_dataset->caller_key, $this->caller_dataset->type);

		// 		// debug
		// 			if (isset($this->save_to_database) && $this->save_to_database===false) {
		// 				debug_log(__METHOD__." Stopped ?? dataframe save to DDBB $this->section_tipo : $new_section_tipo , $this->parent : $new_parent ".to_string(), logger::WARNING);
		// 				#$new_component->save_to_database = false;
		// 			}

		// 		// set_dato
		// 			if(isset($component_dato[$this->caller_dataset->caller_key])){
		// 				$component_dato[$this->caller_dataset->caller_key]->dataframe = $new_component->dataframe;
		// 				$new_component->set_dato($component_dato);
		// 			}

		// 		return $new_component->Save(); // type int|null
		// 	}//end if (strpos($mode,'dataframe')===0 && isset($this->caller_dataset))

		// Verify component minimum vars before save
			if( empty($section_id) || empty($tipo) || empty($lang) ) {
				trigger_error(__METHOD__." Error on save: Few vars! section_tipo:$section_tipo, section_id:$section_id, tipo,$tipo, lang,$lang, model: ".get_class($this));
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
			$section_id			= $section->save_component_dato($this, 'relation', $save_to_database);

		// relations table links update (default is true)
			if ($this->save_to_database_relations===true) {

				$current_dato = $this->get_dato_full();

				$relation_options = new stdClass();
					$relation_options->section_tipo			= $section_tipo;
					$relation_options->section_id			= $section_id;
					$relation_options->from_component_tipo	= $tipo;
					$relation_options->ar_locators			= $current_dato;

				$propagate_response = search::propagate_component_dato_to_relations_table($relation_options);
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

		// debug
			if(SHOW_DEBUG===true) {
				$start_time=start_time();
				#dump($ar_components_related, ' ar_components_related ++ '.to_string());
			}

		// locator
			if (empty($locator) || !is_object($locator)) {
				return null;
			}
			// parse as real locator class object
			$locator = new locator($locator);

		$ar_value = [];
		if($ar_components_related!==false && !empty($ar_components_related)){

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

				#$ar_parents = component_relation_parent::get_parents_recursive($locator->section_id, $locator->section_tipo);
				# NOTE: get_parents_recursive is disabled because generate some problems to fix. For now we use only first parent
				#$ar_parents	= component_relation_parent::get_parents($locator->section_id, $locator->section_tipo);
				$ar_parents   = component_relation_parent::get_parents_recursive($locator->section_id, $locator->section_tipo, $skip_root=true);
				#$n_ar_parents = count($ar_parents);
					#dump($ar_parents, ' ar_parents ++ '.to_string($locator)); die();

				foreach ($ar_parents as $current_locator) {

					$current_value = ts_object::get_term_by_locator( $current_locator, $lang, true );
					if (!empty($current_value)) {
						$ar_current_values[]  = $current_value;
					}
				}

				// $locator_value = implode($fields_separator, $ar_current_values);
				$ar_value = array_merge($ar_value, $ar_current_values);

			}else{

				// $locator_value = ts_object::get_term_by_locator( $locator, $lang, true );
				$ar_value[] = ts_object::get_term_by_locator( $locator, $lang, true );

			}//end if ($show_parents===true)
		}

		// debug
			if(SHOW_DEBUG===true) {
				$total = exec_time_unit($start_time,'ms')." ms";
				#debug_log(__METHOD__." Total time $total ".to_string(), logger::DEBUG);
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

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';

		$section_table 	= common::get_matrix_table_from_tipo($section_tipo); // Normally 'matrix_hierarchy'
		$hierarchy_table= hierarchy::$table;	// Normally 'hierarchy'. Look too in 'matrix_hierarchy_main' table for references
		$ar_tables 		= array( $section_table, $hierarchy_table);
		$parents 		= component_relation_parent::get_parents($section_id, $section_tipo, $from_component_tipo=null, $ar_tables);

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
			$modelo_name					= RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true); // 'component_relation_children';
			$mode							= 'edit';
			$lang							= DEDALO_DATA_NOLAN;
			$component_relation_children	= component_common::get_instance(
				$modelo_name,
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
				debug_log(__METHOD__." Removed references in component_relation_children ($current_section_id, $current_section_tipo) to $section_id, $section_tipo ".to_string(), logger::DEBUG);
				$ar_removed[] = array('section_tipo' 	=> $current_section_tipo,
									  'section_id' 	 	=> $current_section_id,
									  'component_tipo' 	=> $current_component_tipo
									 );
			}
		}//end foreach ((array)$parents as $current_parent)

		if (!empty($ar_removed)) {
			$response->result 		= true;
			$response->msg 			= 'Removed references: '.count($ar_removed);
			$response->ar_removed 	= $ar_removed;
		}

		return (object)$response;
	}//end remove_parent_references



	/**
	* GET_SELECT_QUERY2
	* @return object
	*/
	public static function get_select_query2( object $select_object ) : object {
		/*
		[path] => Array
			(
				[0] => stdClass Object
					(
						[name] => Título
						[modelo] => component_input_text
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
	}//end get_select_query2



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* @return object $query_object
	*/
	public static function resolve_query_object_sql( object $query_object ) : object {
		# Always set fixed values
		$query_object->type 	= 'jsonb';
		$query_object->unaccent = false;

		# component path
		$query_object->component_path = ['relations'];

		$q = $query_object->q;


		# For unification, all non string are json encoded
		# This allow accept mixed values (encoded and no encoded)
		if (!is_string($q)) {
			$q = json_encode($q);
		}

		$q = str_replace(array('[',']'), '', $q);

		$q_operator = isset($query_object->q_operator) ? $query_object->q_operator : null;


		switch (true) {
			# IS DIFFERENT
			case ($q_operator==='!=' && !empty($q)):
				$operator = '@>';
				$q_clean  = '\'['.$q.']\'::jsonb=FALSE';
				$query_object->operator = $operator;
				$query_object->q_parsed = $q_clean;
				break;
			# IS NULL
			case ($q_operator==='!*'):
				$operator = '@>';
				$q_obj = new stdClass();
					$q_obj->from_component_tipo = end($query_object->path)->component_tipo;
				$ar_q 	  = array($q_obj);
				$q_clean  = '\''.json_encode($ar_q).'\'::jsonb=FALSE';
				$query_object->operator = $operator;
				$query_object->q_parsed	= $q_clean;
				break;
			# IS NOT NULL
			case ($q_operator==='*'):
				$operator = '@>';
				$q_obj = new stdClass();
					$q_obj->from_component_tipo = end($query_object->path)->component_tipo;
				$ar_q 	  = array($q_obj);
				$q_clean  = '\''.json_encode($ar_q).'\'';
				$query_object->operator = $operator;
				$query_object->q_parsed = $q_clean;
				break;
			# CONTAIN
			default:
				$operator = '@>';
				$q_clean  = '\'['.$q.']\'';
				$query_object->operator = $operator;
				$query_object->q_parsed	= $q_clean;
				break;
		}//end switch (true) {


		return $query_object;
	}//end resolve_query_object_sql



	/**
	* SEARCH_OPERATORS_INFO
	* Return valid operators for search in current component
	* @return array $ar_operators
	*/
	public function search_operators_info() : array {

		$ar_operators = [
			'!='	=> 'distinto_de',
			'!*'	=> 'vacio',
			'*'		=> 'no_vacio' // not null
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
	public function get_diffusion_value( ?string $lang=null, ?object $option_obj=null ) : ?string {

		$dato = $this->get_dato();
		$diffusion_value = !empty($dato)
			? json_encode($dato)
			: null;

		return $diffusion_value;
	}//end get_diffusion_value


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
	* @return bool
	*/
	public function set_dato_external($options) : bool {

		// options
		$save				= $options->save ?? false;
		$changed			= $options->changed ?? false;
		$current_dato		= $options->current_dato ?? false;
		$references_limit	= $options->references_limit ?? 10;

		$start_time=start_time();

		// dato set
			$dato = ($current_dato!==false)
				? $current_dato
				: $this->get_dato();

		// properties . get the properties for get search section and component
			$properties				= $this->get_properties();
			$ar_section_to_search	= $properties->source->section_to_search ?? false;
			$ar_component_to_search	= $properties->source->component_to_search ?? false;
			$component_to_search	= is_array($ar_component_to_search) ? reset($ar_component_to_search) : $ar_component_to_search;

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

					$current_component_tipo = $current_ddo->tipo;
					$model_name			= RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo, true);
					$observer_component	= component_common::get_instance(
						$model_name,
						$current_component_tipo,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
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
						$final_data = call_user_func_array(array($observer_component, $function), $params);
					}else{
						// get the dato from components with data locators
						$final_data = $observer_component->get_dato();
					}
					$this->set_dato($final_data);
					debug_log(__METHOD__."Set observed data ($model_name - $current_component_tipo - $section_tipo - $section_id)".to_string(), logger::DEBUG);
					$this->Save();
				// task done. return
					return true;

				}//end foreach
			}//end if set_observed_data


		// data source overwrite (tool cataloging case)
			if (isset($properties->source->source_overwrite) && isset($properties->source->component_to_search)) {

				// overwrite source locator
					$component_to_search_tipo	= reset($ar_component_to_search);
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

		// // Add locator at end
		// 	$new_relation_locators[] = $locator;
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
					debug_log(__METHOD__." Saving big result with different data (dato:$total_ar_dato - result:$total_ar_result) ".to_string(), logger::DEBUG);
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
						debug_log(__METHOD__." Saved modified dato to preserve the order - Total: $total_ar_result locators in section_id: $section_id ".to_string(), logger::DEBUG);
					}

					// if the current section_id is the same of the current instance update the dato of the current
					// else update the dato of the other instances (references with the same dato)
					if($current_locator->section_id==$this->section_id){
						$this->set_dato($dato);
					}
				// }//end foreach ($new_relation_locators as $current_locator)
			}//end if ($changed===true)

		// debug
			if(SHOW_DEBUG===true) {
				$total = exec_time_unit($start_time,'ms')." ms";
				debug_log(__METHOD__." Total time $total - $total_ar_result locators [$this->section_tipo, $this->tipo, $this->parent] ".get_class($this) .' : '. RecordObj_dd::get_termino_by_tipo($this->tipo, DEDALO_DATA_LANG, true, true) . to_string(), logger::DEBUG);
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
	* Null is default response for calls to this method. Overwritten for component_autocomplete_hi
	* Array of locators calculated with thesaurus parents of current section and used only for search
	*/
	public function get_relations_search_value() : ?array {

		// only for component_autocomplete_hi
			$legacy_model = RecordObj_dd::get_legacy_model_name_by_tipo($this->tipo);
			if ($legacy_model!=='component_autocomplete_hi'){
				return null;
			}

		$dato = $this->get_dato();
		if (!empty($dato)) {

			$relations_search_value = [];

			foreach ((array)$dato as $key => $current_locator) {

				$section_id 	= $current_locator->section_id;
				$section_tipo 	= $current_locator->section_tipo;

				$parents_recursive = component_relation_parent::get_parents_recursive(
					$section_id, // string section_id
					$section_tipo, // string section_tipo
					true, // bool skip_root
					false // bool is_recursion
				);

				foreach ($parents_recursive as $key => $parent_locator) {

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
		}else{
			$relations_search_value = false;
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
		foreach ((array)$filter_by_list as $current_obj_value) {

			$f_section_tipo   	= $current_obj_value->section_tipo;
			$f_component_tipo 	= $current_obj_value->component_tipo;

			// Calculate list values of each element
				$c_modelo_name 		= RecordObj_dd::get_modelo_name_by_tipo($f_component_tipo,true);
				$current_component  = component_common::get_instance(
					$c_modelo_name,
					$f_component_tipo,
					null,
					'edit',
					DEDALO_DATA_LANG,
					$f_section_tipo
				);

			// get section json
				$get_json_options = new stdClass();
					$get_json_options->get_context 	= true;
					$get_json_options->context_type = 'simple';
					$get_json_options->get_data 	= true;

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
						$modelo_name = RecordObj_dd::get_modelo_name_by_tipo(reset($properties->stats_look_at), true);
						$label 		 = $modelo_name::get_stats_value_with_valor_arguments($value, $properties->valor_arguments);
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
	* @return array $filter_custom
	* @see get_request_config
	*/
	public static function get_hierarchy_terms_filter(array $ar_terms) : array {

		$filter = [];

		foreach ($ar_terms as $current_item) {
			$recursive = (bool)$current_item->recursive;
			# Get children
			$ar_children = component_relation_children::get_children($current_item->section_id, $current_item->section_tipo, null, $recursive);
			$component_section_id_tipo = section::get_ar_children_tipo_by_modelo_name_in_section(
				$current_item->section_tipo,
				['component_section_id'],
				true, // bool resolve virtual
				true, // bool recursive
				true,
				true,
				false
			);

			$path = new stdClass();
				$path->section_tipo		= $current_item->section_tipo;
				$path->component_tipo	= reset($component_section_id_tipo);
				$path->modelo			= 'component_section_id';
				$path->name				= 'Id';

			$ar_section_id = array_map(function($children){
				return $children->section_id;
			}, $ar_children);

			$filter_item = new stdClass();
				$filter_item->q 	= implode(',', $ar_section_id);
				$filter_item->path 	= [$path];

				$filter[] = $filter_item;
		}//end foreach


		return $filter;
	}//end get_hierarchy_terms_filter



	/**
	* GET_HIERARCHY_SECTIONS_FROM_TYPES
	* Calculate hierarchy sections (target section tipo) of types requested, like es1,fr1,us1 from type 2 (Toponymy)
	* @return array $hierarchy_sections_from_types
	*/
	public static function get_hierarchy_sections_from_types( array $hierarchy_types ) : array {

		$hierarchy_section_tipo = DEDALO_HIERARCHY_SECTION_TIPO;
		$hierarchy_name_tipo 	= DEDALO_HIERARCHY_TERM_TIPO;

		// Active
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
						"modelo": "'.RecordObj_dd::get_modelo_name_by_tipo(DEDALO_HIERARCHY_ACTIVE_TIPO,true).'",
						"name": "Active"
					}
				]
			}';

		// Typology
		$typology_filter = [];
		foreach ((array)$hierarchy_types as $key => $value) {

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
						"modelo": "component_select",
						"name": "Typology"
					}
				]
			}';
		}//end foreach ((array)$hierarchy_types as $key => $value)

		$ar_typology_filter = implode(',',$typology_filter);

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
								'.$ar_typology_filter.'
							]
						}
					]
				}
			}
		');

		$search	= search::get_instance($search_query_object);
		$result	= $search->search();

		// iterate rows
			$hierarchy_sections_from_types = [];
			foreach ($result->ar_records as $row) {

				if (empty($row->datos->components->{DEDALO_HIERARCHY_TARGET_SECTION_TIPO}->dato->{DEDALO_DATA_NOLAN})) {
					debug_log(__METHOD__." Skipped hierarchy without target section tipo: $row->section_tipo, $row->section_id ".to_string(), logger::ERROR);
					continue;
				}

				$target_dato			= $row->datos->components->{DEDALO_HIERARCHY_TARGET_SECTION_TIPO}->dato->{DEDALO_DATA_NOLAN};
				$target_section_tipo	= reset($target_dato);

				$hierarchy_sections_from_types[] = $target_section_tipo;
			}


		return (array)$hierarchy_sections_from_types;
	}//end get_hierarchy_sections_from_types



	/**
	* GET_CONFIG_CONTEXT_SECTION_TIPO
	* @param array $ar_section_tipo_sources
	* @param string|null $retrieved_section_tipo=null
	* @return array $ar_section_tipo
	*/
	public static function get_request_config_section_tipo(array $ar_section_tipo_sources, $retrieved_section_tipo=null) : array {

		$ar_section_tipo = [];
		foreach ((array)$ar_section_tipo_sources as $source_item) {

			if (is_string($source_item)) {

				// old self section tipo properties definitions
					// if ($source_item==='self') {
					// 	$source_item = is_array($retrieved_section_tipo) ? reset($retrieved_section_tipo) : $retrieved_section_tipo;
					// }
					if ($source_item==='self') {
						throw new Exception("***** Error Processing get_request_config_section_tipo (1) invalid section_tipo format. Use an object like \"section_tipo\": [{\"source\": \"self\"}] . ".to_string($source_item), 1);
					}

				$ar_section_tipo[] = $source_item;
				debug_log(__METHOD__.
					" ++++++++++++++++++++++++++++++++++++ Added string source item (but expected object). Format values as {'source':'section', 'value'='hierarchy1'} ".to_string($source_item),
					logger::ERROR
				);
				continue;
			}
			if (empty($source_item->source)) {
				debug_log(__METHOD__.
					" ++++++++++++++++++++++++++++++++++++ Ignored item with empty source ".to_string($source_item),
					logger::ERROR
				);
				dump($source_item, '$source_item ////////////////+++++++++++++++++++++++++++++++++++++ '.to_string());
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
					$target_values = $source_item->value;
					foreach ((array)$target_values as $key => $current_component_tipo) {

						$sqo = new stdClass();
							$sqo->section_tipo			= $retrieved_section_tipo;
							$sqo->limit					= 0;
							$sqo->offset				= 0;
							$sqo->order					= false;
							$sqo->skip_projects_filter	= true;

						// sections
							$sections = sections::get_instance(
								null,
								$sqo,
								$retrieved_section_tipo,
								'list',
								DEDALO_DATA_LANG
							);
							$dato = $sections->get_dato();
							$model_name		= RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true);
							$current_lang	= common::get_element_lang($current_component_tipo, DEDALO_DATA_LANG);

						// data
							foreach ($dato as $current_record) {

								$section = section::get_instance($current_record->section_id, $current_record->section_tipo, 'list', $cache=true);

								// inject datos to section and set as loaded
								$datos = $current_record->datos ?? null;
								if (!is_null($datos)) {
									$section->set_dato($datos);
									$section->set_bl_loaded_matrix_data(true);
								}
								$component = component_common::get_instance(
									$model_name,
									$current_component_tipo,
									$current_record->section_id,
									$mode='list',
									$current_lang,// $lang=DEDALO_DATA_LANG,
									$current_record->section_tipo
								);

								$component_dato = $component->get_dato();


								foreach ($component_dato as $current_section_tipo) {
									if (!empty($current_section_tipo)) {
										$section_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_section_tipo,true);
										if (!empty($section_modelo_name)) {
											$ar_section_tipo[] = $current_section_tipo;
										}
									}
								}
							}//end foreach ($dato as $current_record)
					}
					break;
				case 'section':
				default:
					$ar_section_tipo = array_merge($ar_section_tipo, (array)$source_item->value);
					break;
			}
		}//end foreach ((array)$ar_section_tipo_sources as $source_item)

		$ar_section_tipo = array_unique($ar_section_tipo);


		return $ar_section_tipo;
	}//end get_request_config_section_tipo



	/**
	* GET_FIXED_FILTER
	* @return array $ar_fixed_filter
	*/
	public static function get_fixed_filter(array $ar_fixed, string $section_tipo, $section_id) : array {

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
					// 			"modelo": "component_radio_button",
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
						// foreach ($object->q->value as $q_value) {
						// 	$filter_item = new stdClass();
						// 		$filter_item->q		= '';
						// 		$filter_item->path	= [];
						// 	foreach ($object->f_path as $key => $value) {
						// 		if($key % 2 ===0){
						// 			$filter_item->path[] = search::get_query_path($value, $object->f_path[$key+1],false,false)[0];
						// 		}
						// 	}
						// 	$filter_item->q = $q_value;
						// 	$dato_filter->{$operator}[] =  $filter_item;
						// }
						$dato_filter->{$operator}[] = $object;
					}
					break;

				case 'component_dato':
					foreach ($search_item->value as $object) {
						$tipo			= $object->q->value;
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
						$dato = $component->get_dato();
						if(empty($dato)) continue;
						foreach ($dato as $value) {
							$filter_item = new stdClass();
								$filter_item->q		= json_encode($value);
								$filter_item->path	= search::get_query_path($section_tipo, $tipo,false,false)[0];

							$dato_filter->{$operator}[] =  $filter_item;
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
			if(!empty($dato_filter->{$operator})){
				$ar_fixed_filter[] =$dato_filter;
			}

		}//end foreach ($ar_fixed as $search_item)

		return $ar_fixed_filter;
	}//end get_fixed_filter



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
		// 			'modelo'			=> RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true),
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
		// 				'modelo'			=> RecordObj_dd::get_modelo_name_by_tipo($this->from_component_tipo,true),
		// 				'name'				=> RecordObj_dd::get_termino_by_tipo($this->from_component_tipo),
		// 				'section_tipo'		=> $this->from_section_tipo
		// 			];
		// 		}

		// 	// self component path
		// 		$path[] = (object)[
		// 			'component_tipo'	=> $component_tipo,
		// 			'modelo'			=> RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true),
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
		// 		// 			'modelo'			=> RecordObj_dd::get_modelo_name_by_tipo($first_item->tipo,true),
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
	* A param '$options' is added only to allow future granular control of the output
	* @param object $options = null
	* 	Optional way to modify result. Avoid using it if it is not essential
	* @return array|null $list_value
	*/
	public function get_list_value(object $options=null) : ?array {

		$dato = $this->get_dato();
		if (empty($dato)) {
			return null;
		}

		$list_value = [];
		$ar_list_of_values = $this->get_ar_list_of_values(DEDALO_DATA_LANG);
		foreach ($ar_list_of_values->result as $key => $item) {

			$locator = $item->value;
			if ( true===locator::in_array_locator($locator, $dato, array('section_id','section_tipo')) ) {
				$list_value[] = $item->label;
			}
		}

		return $list_value;
	}//end get_list_value



}//end class component_relation_common
