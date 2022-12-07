<?php
/*
* CLASS COMPONENT FILTER

1 - Get the section_id of the user
2 - With the user:
	1 - get the user section_id
	2 - withe the user section_id build the component_filter_master
	3 - check the admin user with component-security-administrator (value 1)
	4 - if the user is not admin, get the data of the component_filter_master and his tipo for get the label
	5 - Build the checkbox list (datalist) of the sections that we get and the label of the tipo dd156
	6 - Save the array of the projects for this section inside the user projects (in the user section)

NOTE: when a section is created will be assigned a default project and at least need to be 1 or more.

*/
class component_filter extends component_relation_common {



	private $user_id;
	public $propagate_filter = true;

	// relation_type defaults
	protected $default_relation_type		= DEDALO_RELATION_TYPE_LINK;
	protected $default_relation_type_rel	= null;

	# test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = array('section_tipo','section_id','type','from_component_tipo');



	/**
	* __CONSTRUCT
	* @return bool
	*/
	function __construct(string $tipo=null, $section_id=null, string $mode='list', string $lang=DEDALO_DATA_NOLAN, string $section_tipo=null) {

		// force lang value always
			$lang = DEDALO_DATA_NOLAN;

		// Build the component normally
			parent::__construct($tipo, $section_id, $mode, $lang, $section_tipo);

		// dedalo_default_project
		// If component is in edit mode and don't have data, we assign the default data defined in config
			if ($mode==='edit' &&
				get_called_class()==='component_filter' && // Remember that component_filter_master extends this class
				!is_null($this->section_id) &&
				$section_tipo!=='test3' // exclude unit_test 'test3' section to create default dato
				) {
				$dato = $this->get_dato();
				if(empty($dato)) {

					// filter always save default project.
						$user_id				= navigator::get_user_id();
						$default_dato_for_user	= $this->get_default_dato_for_user($user_id);
					// set current user projects default
						$this->set_dato($default_dato_for_user);
						$this->Save();

					debug_log(__METHOD__." Saved component filter (tipo:$tipo, section_id:$section_id, section_tipo:$section_tipo) DEDALO_DEFAULT_PROJECT as ".json_encode($default_dato_for_user), logger::DEBUG);
				}
			}


		return true;
	}//end __construct



	/**
	* SET_DATO
	*/
	public function set_dato( $dato ) {

		# For safe compatibility backwards
		$dato = self::convert_dato_pre_490( $dato, $this->tipo );

		return parent::set_dato($dato);
	}//end set_dato



	/**
	* GET DATO : Old Format {"7":2,"269":2,"298":2}
	* @return array $dato
	* @see component_filter_master->get_dato() for maintain unified format of projects
	*/
	public function get_dato() {

		// Call to parent class component_relation_common
		$dato = parent::get_dato();

		return (array)$dato;
	}//end get_dato




	/**
	* GET_DEFAULT_DATO_FOR_USER
	* @return array $default_dato
	*/
	public function get_default_dato_for_user(int $user_id) : array {

		$is_global_admin = security::is_global_admin($user_id);
		if ($is_global_admin===true) {
			$user_projects 	= null;
		}else{
			$user_projects 	= filter::get_user_projects($user_id);
		}

		if (!empty($user_projects)) {
			# First user project
			foreach ($user_projects as $user_projects_locator) {
				$filter_locator = new locator();
					$filter_locator->set_section_tipo($user_projects_locator->section_tipo);
					$filter_locator->set_section_id($user_projects_locator->section_id);
					$filter_locator->set_type(DEDALO_RELATION_TYPE_FILTER);
					$filter_locator->set_from_component_tipo($this->tipo);
				break;
			}
			$default_dato = [$filter_locator];
		}else{
			# Default project defined in config
			$filter_locator = new locator();
				$filter_locator->set_section_tipo(DEDALO_FILTER_SECTION_TIPO_DEFAULT);
				$filter_locator->set_section_id(DEDALO_DEFAULT_PROJECT);
				$filter_locator->set_type(DEDALO_RELATION_TYPE_FILTER);
				$filter_locator->set_from_component_tipo($this->tipo);
			$default_dato = [$filter_locator];
		}

		return $default_dato;
	}//end get_default_dato_for_user



	/**
	* SAVE OVERRIDE
	* Overwrite component_common method
	* @return int|null $section_id
	*/
	public function Save() : ?int {

		// we save normally but we save the result
			$parent_save_result = parent::Save();

		// activity case logger only
			if( $this->tipo===logger_backend_activity::$_COMPONENT_PROYECTOS['tipo'] ) {
				return $parent_save_result;
			}

		// portal case
		// If the section to which this component belongs has a portal, we will propagate
		// the changes to all existing resources in the portal of this section (if any)
			if ($this->propagate_filter) {
				$this->propagate_filter();
			}

		return $parent_save_result;
	}//end Save



	/**
	* PROPAGATE_FILTER
	* Propagate all current filter dato (triggered when save) to component_filters of children portals (recursive)
	*/
	public function propagate_filter() : bool {

		$section_id		= $this->get_parent();
		$section_tipo	= $this->get_section_tipo();
		// $section		= section::get_instance($section_id, $section_tipo);
		$section		= $this->get_my_section();

		$component_dato_filter  = $this->get_dato();

		$dato_filter =[];
		foreach ((array)$component_dato_filter as $current_locator) {
			if (isset($current_locator->section_tipo) && isset($current_locator->section_id)) {
				$locator = new locator();
					$locator->set_section_tipo($current_locator->section_tipo);
					$locator->set_section_id($current_locator->section_id);
				$dato_filter = [$locator];
			}else{
				debug_log(__METHOD__." IGNORED INVALID LOCATOR ($section_tipo, $section_id) ".to_string($current_locator), logger::ERROR);
			}
		}

		$ar_children_objects = $section->get_ar_children_objects_by_modelo_name_in_section('component_portal');
			#dump($ar_children_objects,"ar_children_objects");
		foreach ($ar_children_objects as $component_portal) {
			if (!empty($component_portal->dato)) {
				$component_portal->propagate_filter($dato_filter);
					#dump($component_portal,'$component_portal propagando filtro....');
			}
		}

		return true;
	}//end propagate_filter



	/**
	* GET_VALUE
	* Get the value of the component.
	* component filter return a array of values
	* @param string $lang = DEDALO_DATA_LANG
	* @param object|null $ddo = null
	*
	* @return dd_grid_cell_object $value
	*/
	public function get_value(string $lang=DEDALO_DATA_LANG, object $ddo=null) : dd_grid_cell_object {

		// column_obj. Set the separator if the ddo has a specific separator, it will be used instead the component default separator
			$fields_separator	= $ddo->fields_separator ?? null;
			$records_separator	= $ddo->records_separator ?? null;
			$class_list			= $ddo->class_list ?? null;
			if(isset($this->column_obj)){
				$column_obj = $this->column_obj;
			}else{
				$column_obj = new stdClass();
					$column_obj->id = $this->section_tipo.'_'.$this->tipo;
			}

		// User logged now
			$user_id		= navigator::get_user_id();
			$ar_projects	= filter::get_user_authorized_projects($user_id, $this->tipo);

		// dato
			$dato		= $this->get_dato();
			$ar_final	= [];
			// check if the dato is available to the projects of the user has permissions.
			foreach ((array)$ar_projects as $key => $row) {
				if (locator::in_array_locator( $row->locator, (array)$dato )) { // ['section_id','section_tipo']
					$ar_final[] = $row;
				}
			}//end foreach

		// ar_values. With the clean dato for the user, get the label
			$ar_values = [];
			foreach ($ar_final as $row) {
				$ar_values[] = $row->label;
			}

		// set the label of the component as column label
			$label = $this->get_label();

		// properties
			$properties = $this->get_properties();

		// fields_separator. set the separator text that will be used to render the column
			$fields_separator = isset($fields_separator)
				? $fields_separator
				: (isset($properties->fields_separator)
					? $properties->fields_separator
					: ', ');

		// records_separator
			$records_separator = isset($records_separator)
				? $records_separator
				: (isset($properties->records_separator)
					? $properties->records_separator
					: ' | ');

		// dd_grid_cell_object
			$value = new dd_grid_cell_object();
				$value->set_type('column');
				$value->set_label($label);
				$value->set_cell_type('text');
				$value->set_ar_columns_obj([$column_obj]);
				if(isset($class_list)){
					$value->set_class_list($class_list);
				}
				$value->set_fields_separator($fields_separator);
				$value->set_records_separator($records_separator);
				$value->set_value($ar_values);


		return $value;
	}//end get_value



	/**
	* GET VALOR
	* Devuelve los valores del array 'dato' separados por '<br>'
	* @return string $html | array $ar_final
	*/
	public function get_valor($lang=DEDALO_DATA_LANG, $format='html') {

		# User loged now
		$user_id 	 = navigator::get_user_id();
		$ar_projects = filter::get_user_authorized_projects($user_id, $this->tipo);

		$dato 		= $this->get_dato();
		$ar_final 	= array();
		foreach ((array)$ar_projects as $key => $row) {
			if (locator::in_array_locator( $row->locator, (array)$dato )) { // ['section_id','section_tipo']
				$ar_final[] = $row;
			}
		}//end foreach ($ar_projects as $section_id => $name)

		$ar_label = [];
		foreach ($ar_final as $row) {
			$ar_label[] = $row->label;
		}

		switch ($format) {
			case 'array':
				$result = $ar_label;
				break;
			case 'html_concat':
				$result = implode(' · ', $ar_label);
				break;
			case 'html':
			default:
				$result = implode('<br>', $ar_label);
				break;
		}

		return $result;
	}//end get_valor



	/**
	* GET_VALOR_EXPORT
	* Return component value sent to export data
	* @return string $valor
	*/
	public function get_valor_export($valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null) {

		if (empty($valor)) {
			$dato = $this->get_dato();				// Get dato from DB
		}else{
			$this->set_dato( json_decode($valor) );	// Use parsed json string as dato
		}

		$valor_export = $this->get_valor($lang, 'html');


		return $valor_export;
	}//end get_valor_export



	/**
	* GET_DATALIST
	* Works like ar_list_of_values but filtered by user authorized projects
	* @return array $datalist
	*/
	public function get_datalist() : array {
		$start_time = start_time();

		// ar_projects. Projects authorized to the current user
			$user_id		= navigator::get_user_id();
			$ar_projects	= filter::get_user_authorized_projects($user_id, $this->tipo);

		// ar_projects_parsed
			$datalist		= [];
			// $ar_typology_section_id	= [];
			foreach ($ar_projects as $project_item) {

				// if (empty($project_item->typology)) {

				// 	$project = new stdClass();
				// 		$project->type			= 'project';
				// 		$project->label			= $project_item->label;
				// 		$project->section_tipo	= $project_item->locator->section_tipo;
				// 		$project->section_id	= $project_item->locator->section_id;
				// 		$project->value			= $project_item->locator;
				// 		$project->parent		= null;

				// 	$ar_projects_parsed[] = $project;

				// }else{

					// foreach ((array)$project_item->typology as $typology_locator) {

						$project = new stdClass();
							$project->type			= 'project';
							$project->label			= $project_item->label;
							$project->section_tipo	= $project_item->locator->section_tipo;
							$project->section_id	= $project_item->locator->section_id;
							$project->value			= $project_item->locator;
							$project->parent		= $project_item->parent;

						$datalist[] = $project;

						// add section_id if not exists
						// if(!in_array($typology_locator->section_id, $ar_typology_section_id)) {

						// 	$ar_typology_section_id[] = $typology_locator->section_id;
						// }
					// }
			// 	}
			}
			#$ar_projects_parsed = array_unique($ar_projects_parsed, SORT_REGULAR);
			// dump($ar_projects_parsed, ' ar_projects_parsed ++ '.to_string());

		// typology section records search
		// 	$typology_section_tipo = 'dd1318';
		// 	$sqo = json_decode('
		// 		{
		// 		    "section_tipo": "'.$typology_section_tipo.'",
		// 		    "limit": 0,
		// 		    "offset": 0,
		// 		    "full_count": false,
		// 		    "filter": null
		// 		}
		// 	');
		// 	$current_search = search::get_instance($sqo);
		// 	$search_result  = $current_search->search();

		// // typology groupers
		// 	$ar_groupers = [];
		// 	foreach ($search_result->ar_records as $row) {

		// 		$section_id		= $row->section_id;
		// 		$section_tipo	= $row->section_tipo;
		// 		$datos			= $row->datos;

		// 		if(in_array($section_id, $ar_typology_section_id)) {
		// 			$ar_groupers = array_merge($ar_groupers, $this->get_project_groupers($section_tipo, $section_id, $datos));
		// 		}
		// 	}
		// 	$ar_groupers = array_unique($ar_groupers, SORT_REGULAR); // remove posible duplicates when parent resolution is called

		// // ar_datalist final merge all element
		// 	$ar_datalist = array_merge($ar_groupers, $ar_projects_parsed);

		// sort by label asc
			usort($datalist, function($a, $b) {
				return strcasecmp($a->label, $b->label);
			});

		// debug
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__." Total time: ".exec_time_unit($start_time,'ms')." ms", logger::DEBUG);
			}


		return $datalist;
	}//end get_datalist



	/**
	* GET_PROJECT_GROUPERS
	*	Recursive
	* @param string $section_tipo
	* @param mixed $section_id
	* @param mixed $datos
	*
	* @return array $ar_groupers
	*/
	public function get_project_groupers(string $section_tipo, $section_id, $datos) : array {

		$ar_groupers = [];

		$name_tipo		= 'dd1320';
		$parent_tipo	= 'dd169';

		// section. inject alrady calculated data to the section to avoid reconnect to database
			$section = section::get_instance($section_id, $section_tipo);
			$section->set_dato($datos);
			$section->set_bl_loaded_matrix_data(true);

		// name
			$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($name_tipo,true);
			$component		= component_common::get_instance(
				$modelo_name,
				$name_tipo,
				$section_id,
				'list',
				DEDALO_DATA_LANG,
				$section_tipo
			);
			// $name_value = $component->get_valor();
			$name_value = component_common::extract_component_value_fallback(
				$component
			);

		// parent
			$model_parent		= RecordObj_dd::get_modelo_name_by_tipo($parent_tipo,true);
			$parent_component	= component_common::get_instance(
				$model_parent,
				$parent_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$parent_dato = $parent_component->get_dato();

		// item grouper obj
			$grouper = new stdClass();
				$grouper->type			= 'typology';
				$grouper->label			= $name_value;
				$grouper->section_tipo	= $section_tipo;
				$grouper->section_id	= $section_id;
				$grouper->parent		= !empty($parent_dato) ? reset($parent_dato) : null;

		$ar_groupers[] = $grouper;

		 if(!empty($parent_dato)){
		 	$parent = reset($parent_dato);
			$ar_groupers = array_merge($ar_groupers, $this->get_project_groupers($parent->section_tipo, $parent->section_id, $datos));
		}


		return $ar_groupers;
	}//end get_project_groupers



	/**
	* GET_STATS_VALUE
	*/
		// public static function get_stats_value( $tipo, $ar_value ) {
		//
		// 	if(!isset($stats_value)) static $stats_value;
		//
		// 	if( !is_array($ar_value) ) $ar_value = array('' => 1 );
		//
		// 	foreach ($ar_value as $key => $value) {
		//
		// 		if(!isset($stats_value[$tipo][$key])) $stats_value[$tipo][$key] = 0;
		// 		$stats_value[$tipo][$key] = $stats_value[$tipo][$key] + 1;
		// 	}
		//
		// 	return $stats_value[$tipo];
		// }//end get_stats_value



	/**
	* GET_STATS_VALUE_RESOLVED
	* @return array $ar_final
	*/
	public static function get_stats_value_resolved(string $tipo, $current_stats_value, string $stats_model, object $stats_properties=null) : array {

		$caller_component	= get_called_class();
		$current_component	= component_common::get_instance(
			$caller_component,
			$tipo,
			null,
			'stats'
		);

		$ar_values = [];

		# DATO : Component filter está pensado para albergar un arary de proyectos en formato
		# 'project_id':'2' . Le pasamos por tanto el array completo al componente dummy
		# para que resuelva luego el array completo de proyectos
		$current_component->set_dato($current_stats_value);

		# VALOR : Recupera el array completo resuelto
		$valor = $current_component->get_valor(DEDALO_DATA_LANG, 'array');

		# ar_values : Formateamos el array final de salida resuelto
		foreach ($current_stats_value as $key => $value) {
			if(isset($valor[$key])) {
				$ar_values[$valor[$key]] = $value;
			}
		}

		$label		= RecordObj_dd::get_termino_by_tipo($tipo, DEDALO_DATA_LANG, true, true).':'.$stats_model;
		$ar_final	= array($label => $ar_values);


		return $ar_final;
	}//end get_stats_value_resolved



	/**
	* GET_STATS_VALUE_RESOLVED_ACTIVITY
	*/
	public static function get_stats_value_resolved_activity( $value ) {

		$caller_component	= get_called_class();

		$proyectos_tipo		= logger_backend_activity::$_COMPONENT_PROYECTOS['tipo'] ;

		$current_component	= component_common::get_instance($caller_component,$proyectos_tipo,NULL,'stats');

		# DATO : Component filter está pensado para albergar un arary de proyectos en formato
		# 'project_id':'2' . Le pasamos por tanto el array completo al componente dummy
		# para que resuelva luego el array completo de proyectos
		$value_formated = array($value => 2);
		$current_component->set_dato($value_formated);

		# VALOR : Recupera el array completo resuelto
		$ar_valor = $current_component->get_valor(DEDALO_DATA_LANG, 'array');

		$valor = $ar_valor[$value];


		return $valor;
	}//end get_stats_value_resolved_activity



	/**
	* BUILD_SEARCH_COMPARISON_OPERATORS
	* Note: Override in every specific component
	* @param array $comparison_operators . Like array('=','!=')
	* @return object stdClass $search_comparison_operators
	*/
		// public function build_search_comparison_operators( $comparison_operators=array('=','!=') ) {

		// 	return (object)parent::build_search_comparison_operators($comparison_operators);
		// }//end build_search_comparison_operators



	/**
	* UPDATE_DATO_VERSION
	* @param object $request_options
	* @return object $response
	*	$response->result = 0; // the component don't have the function "update_dato_version"
	*	$response->result = 1; // the component do the update"
	*	$response->result = 2; // the component try the update but the dato don't need change"
	*/
	public static function update_dato_version(object $request_options) : object {

		$options = new stdClass();
			$options->update_version 	= null;
			$options->dato_unchanged 	= null;
			$options->reference_id 		= null;
			$options->tipo 				= null;
			$options->section_id 		= null;
			$options->section_tipo 		= null;
			$options->context 			= 'update_component_dato';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$update_version	= $options->update_version;
			$dato_unchanged	= $options->dato_unchanged;
			$reference_id	= $options->reference_id;

		$update_version = implode(".", $update_version);
		switch ($update_version) {

			case '4.9.0':

				# Compatibility old dedalo instalations
				# Old dato is and object (associative array for php)
				// Like {"1": 2}
				if (!empty($dato_unchanged)) {
					// Old format is received case
					/*
					$ar_locators = [];
					foreach ($dato_unchanged as $key => $value) {

						if (isset($value->section_id) && isset($value->section_tipo)) {
							# Updated dato (is locator)
							$filter_locator = $value;

						}else{
							# Old dato Like {"1": 2}
							$filter_locator = new locator();
								$filter_locator->set_section_tipo(DEDALO_FILTER_SECTION_TIPO_DEFAULT);
								$filter_locator->set_section_id($key);
								$filter_locator->set_type(DEDALO_RELATION_TYPE_FILTER);
								$filter_locator->set_from_component_tipo($options->tipo);
						}
						# Add to clean array
						$ar_locators[] = $filter_locator;
					}
					*/
					$ar_locators = self::convert_dato_pre_490( $dato_unchanged, $options->tipo );
					# Replace old formatted value with new formatted array of locators
					$new_dato = $ar_locators;
					$response = new stdClass();
						$response->result	= 1;
						$response->new_dato	= $new_dato;
						$response->msg		= "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";
				}else{

					debug_log(__METHOD__." No project found in $options->section_tipo - $options->tipo - $options->section_id ".to_string(), logger::DEBUG);
					$response = new stdClass();
						$response->result	= 2;
						$response->msg		= "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
				}
				break;

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version). Ignored action";
				break;
		}


		return $response;
	}//end update_dato_version



	/**
	* CONVERT_DATO_PRE_490
	* @return array $new dato
	*/
	public static function convert_dato_pre_490( $dato, $from_component_tipo ) {

		if (!empty($dato) && $dato!='[]') {
			// Old format is received case

			$ar_locators = [];
			foreach ($dato as $key => $value) {

				$filter_locator = false;

				if (isset($value->section_id) && isset($value->section_tipo)) {
					# Updated dato (is locator)
					$filter_locator = $value;

				}else{
					# Remember: inold dato, the key is the target section_id and the value 0-2 is not used
					if ((int)$key>0) { // Avoid include badformed data with values like {"0":"1"}
						# Old dato Like {"1": 2}
						$filter_locator = new locator();
							$filter_locator->set_section_tipo(DEDALO_FILTER_SECTION_TIPO_DEFAULT);
							$filter_locator->set_section_id((int)$key);
							$filter_locator->set_type(DEDALO_RELATION_TYPE_FILTER);
							$filter_locator->set_from_component_tipo($from_component_tipo);
					}
				}
				# Add to clean array
				if ($filter_locator!==false) {
					$ar_locators[] = $filter_locator;
				}
			}
			# Replace old formatted value with new formatted array of locators
			$new_dato = $ar_locators;
		}else{
			$new_dato = $dato; // Empty untouched
		}

		return $new_dato;
	}//end convert_dato_pre_490



	/**
	* REGENERATE_COMPONENT
	* Force the current component to re-save its data
	* Note that the first action is always load dato to avoid save empty content
	* @see class.tool_update_cache.php
	* @return bool
	*/
	public function regenerate_component() : bool {

		# Force loads dato always !IMPORTANT
		$this->get_dato();

		$this->set_propagate_filter(false); # !IMPORTANT (to avoid calculate inverse search of portals, very long process)

		# Save component data
		$this->Save();


		return true;
	}//end regenerate_component



	/**
	* GET_DIFFUSION_VALUE
	* Calculate current component diffusion value for target field (usually a MYSQL field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @see class.diffusion_mysql.php
	*
	* @return string|null $diffusion_value
	*/
	public function get_diffusion_value( ?string $lang=null, ?object $option_obj=null ) : ?string {

		$dato = $this->get_dato();

		$ar_label = [];
		foreach ((array)$dato as $key => $locator) {
			$label = ts_object::get_term_by_locator($locator, $lang, true);
			if (!empty($label)) {
				$label = strip_tags(trim($label));
				if (!empty($label)) {
					$ar_label[] = $label;
				}
			}
		}

		$diffusion_value = empty($ar_label)
			? null
			: implode(' | ', $ar_label);


		return $diffusion_value;
	}//end get_diffusion_value



	/**
	* PARSE_STATS_VALUES
	* @return array $ar_clean
	*/
	public static function parse_stats_values(string $tipo, string $section_tipo, $properties, string $lang=DEDALO_DATA_LANG, string $selector='dato') : array {

		// Search
			if (isset($properties->stats_look_at)) {
				$related_tipo = reset($properties->stats_look_at);
			}else{
				$related_tipo = false; //$current_column_tipo;
			}
			$path 		= search::get_query_path($tipo, $section_tipo, true, false);
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
			foreach ($result->ar_records as $key => $item) {

				$ar_locators = end($item);
				$ar_locators = $ar_locators;

				foreach ((array)$ar_locators as $locator) {

					if (isset($properties->stats_look_at)) {
						$c_tipo 		= reset($properties->stats_look_at);
						$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($c_tipo,true);
						$component 		= component_common::get_instance( 
							$modelo_name,
							$c_tipo,
							$locator->section_id,
							'list',
							$lang,
							$locator->section_tipo
						);
						$label = $component->get_valor($lang);
					}else{
						$label = ts_object::get_term_by_locator($locator, $lang, true) ?? '';
					}

					$label 	= strip_tags(trim($label));

					#$uid 	= $locator->section_tipo.'_'.$locator->section_id;
					$uid 	= $label;

					if(!isset($ar_clean[$uid])){
						$ar_clean[$uid] = new stdClass();
						$ar_clean[$uid]->count = 0;
						$ar_clean[$uid]->tipo  = $tipo;
					}

					$ar_clean[$uid]->count++;
					$ar_clean[$uid]->value = $label;
				}
			}
			#dump($ar_clean, ' ar_clean ++ ** '.to_string());


		return $ar_clean;
	}//end parse_stats_values



	/**
	* GET_AR_TARGET_SECTION_TIPO
	* Select source section/s
	* Overrides component common method
	* @return array|null ar_target_section_tipo
	* 	Array of string like ['dd153']
	*/
	public function get_ar_target_section_tipo() : ?array {

		return defined('DEDALO_SECTION_PROJECTS_TIPO')
			? [DEDALO_SECTION_PROJECTS_TIPO]
			: null;
	}//end get_ar_target_section_tipo



	/**
	* GET_SORTABLE
	* @return bool
	* 	Default is true. Override when component is sortable
	*/
	public function get_sortable() : bool {

		return true;
	}//end get_sortable



	/**
	* GET_ORDER_PATH
	* Calculate full path of current element to use in columns order path (context)
	* @param string $component_tipo
	* @param string $section_tipo
	* @return array $path
	*/
	public function get_order_path(string $component_tipo, string $section_tipo) : array {

		$path = [
			// self component path
			(object)[
				'component_tipo'	=> $component_tipo,
				'modelo'			=> RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true),
				'name'				=> RecordObj_dd::get_termino_by_tipo($component_tipo),
				'section_tipo'		=> $section_tipo
			],
			// project name field (component_input_text dd156)
			(object)[
				'component_tipo'	=> DEDALO_PROJECTS_NAME_TIPO,
				'modelo'			=> RecordObj_dd::get_modelo_name_by_tipo(DEDALO_PROJECTS_NAME_TIPO,true),
				'name'				=> RecordObj_dd::get_termino_by_tipo(DEDALO_PROJECTS_NAME_TIPO),
				'section_tipo'		=> DEDALO_SECTION_PROJECTS_TIPO
			]
		];

		return $path;
	}//end get_order_path


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

		// (!) Note that only user authorized projects will be added, discarding others
		// maybe this behavior must be changed in future
		$user_id		= navigator::get_user_id();
		$ar_projects	= filter::get_user_authorized_projects($user_id, $this->tipo);

		$list_value = [];
		foreach ($ar_projects as $item) {

			$locator = $item->locator;
			if ( true===locator::in_array_locator($locator, $dato, array('section_id','section_tipo')) ) {
				$list_value[] = $item->label;
			}
		}

		return $list_value;
	}//end get_list_value



}//end class component_filter
