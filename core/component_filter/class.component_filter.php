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


	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;

	# RELATION_TYPE
	protected $relation_type = DEDALO_RELATION_TYPE_FILTER;

	# test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = array('section_tipo','section_id','type','from_component_tipo');


	/**
	* __CONSTRUCT
	* Component constructor
	*/
	function __construct( $tipo=false, $parent=null, $modo='list', $lang=DEDALO_DATA_NOLAN, $section_tipo=null) {

		# Build component normally
		parent::__construct($tipo, $parent, $modo, DEDALO_DATA_NOLAN, $section_tipo);

		$this->parent = $this->get_parent();

		#if(SHOW_DEBUG===true) {
		#	if ($this->RecordObj_dd->get_traducible()==='si') {
		#		throw new Exception("Error Processing Request. Wrong component lang definition. This component $tipo (".get_class().") is not 'traducible'. Please fix this ASAP", 1);
		#	}
		#}
		#debug_log(__METHOD__." get_called_class ".get_called_class(), logger::DEBUG);

		# DEDALO_DEFAULT_PROJECT
		# Dato : Verificamos que hay un dato. Si no, asignamos el dato por defecto definido en config
		if ($modo==='edit' && get_called_class()==='component_filter' && !is_null($this->parent)) { // Remember that component_filter_master extends this class
			$dato = $this->get_dato();
			if(empty($dato)) {
				#
				# FILTER always save default project
				# Get current user projects
				$user_id 				= navigator::get_user_id();
				$default_dato_for_user 	= $this->get_default_dato_for_user($user_id);
				#debug_log(__METHOD__." default_dato_for_user ".to_string($default_dato_for_user), logger::DEBUG);

				$this->set_dato($default_dato_for_user);
				$this->Save();
				if(SHOW_DEBUG===true) {
					debug_log(__METHOD__." Saved component filter (tipo:$tipo, parent:$parent, section_tipo:$section_tipo) DEDALO_DEFAULT_PROJECT as ".json_encode($default_dato_for_user));
				}
			}
		}

		return true;
	}//end __construct



	/**
	* SET_DATO
	* @return
	*/
	public function set_dato( $dato ) {

		# For safe compatibility backwards
		$dato = self::convert_dato_pre_490( $dato, $this->tipo );

		return parent::set_dato($dato);
	}//end set_dato



	/**
	* GET DATO : Old Format {"7":2,"269":2,"298":2}
	* @return array $dato
	* @see component_filter_master->get_dato() for maintain unyfied format of projetcs
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
	public function get_default_dato_for_user($user_id) {

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
	*/
	public function Save() {

		# Salvamos normalmente pero guardamos el resultado
		$parent_save_result = parent::Save();

		#
		# ACTIVITY CASE Logger only
		if( $this->tipo === logger_backend_activity::$_COMPONENT_PROYECTOS['tipo'] ) return $parent_save_result;

		#
		# PORTAL CASE
		# Si la sección a que pertenece este componente tiene portal, propagaremos los cambios a todos los recursos
		# existentes en el portal de esta sección (si los hay)
		if ($this->propagate_filter) {
			$this->propagate_filter();
		}//if ($propagate_filter) {

		# Returns parent Save result at end
		return $parent_save_result;
	}//end Save



	/**
	* PROPAGATE_FILTER
	* Propagate all current filter dato (triggered when save) to component_filters of children portals (recursive)
	*/
	public function propagate_filter() {

		$section_id 			= $this->get_parent();
		$section_tipo 			= $this->get_section_tipo();
		$section 				= section::get_instance($section_id, $section_tipo);
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
	* GET VALOR
	* Devuelve los valores del array 'dato' separados por '<br>'
	* @return string $html | array $ar_final
	*/
	public function get_valor( $lang=DEDALO_DATA_LANG, $format='html' ) {

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
	* Return component value sended to export data
	* @return string $valor
	*/
	public function get_valor_export( $valor=null, $lang=DEDALO_DATA_LANG, $quotes, $add_id ) {

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
	* @return array $ar_projects
	*/
	public function get_datalist() {
		$start_time=microtime(1);

		// ar_projects. Projects authorized to the current user
			$user_id 	 = navigator::get_user_id();
			$ar_projects = filter::get_user_authorized_projects($user_id, $this->tipo);

		// ar_projects_parsed
			$ar_projects_parsed 	= [];
			$ar_typology_section_id	= [];
			foreach ($ar_projects as $project_item) {

				if (empty($project_item->typology)) {

					$project = new stdClass();
						$project->type 	 		= 'project';
						$project->label 		= $project_item->label;
						$project->section_tipo 	= $project_item->locator->section_tipo;
						$project->section_id 	= $project_item->locator->section_id;
						$project->value 		= $project_item->locator;
						$project->parent 		= null;

					$ar_projects_parsed[] = $project;

				}else{

					foreach ((array)$project_item->typology as $typology_locator) {

						$project = new stdClass();
							$project->type 	 		= 'project';
							$project->label 		= $project_item->label;
							$project->section_tipo 	= $project_item->locator->section_tipo;
							$project->section_id 	= $project_item->locator->section_id;
							$project->value 		= $project_item->locator;
							$project->parent 		= $typology_locator;

						$ar_projects_parsed[] = $project;

						// add section_id if not exists
						if(!in_array($typology_locator->section_id, $ar_typology_section_id)) {
							$ar_typology_section_id[] = $typology_locator->section_id;
						}
					}
				}
			}
			#$ar_projects_parsed = array_unique($ar_projects_parsed, SORT_REGULAR);
			#dump($ar_projects_parsed, ' ar_projects_parsed ++ '.to_string());

		// typology section records search
			$typology_section_tipo = 'dd1318';
			$sqo = json_decode('
				{
				    "section_tipo": "'.$typology_section_tipo.'",
				    "limit": 0,
				    "offset": 0,
				    "full_count": false,
				    "filter": null
				}
			');
			$current_search = search::get_instance($sqo);
			$search_result  = $current_search->search();

		// typology groupers
			$ar_groupers = [];
			foreach ($search_result->ar_records as $key => $row) {

				$section_id 	= $row->section_id;
				$section_tipo 	= $row->section_tipo;
				$datos 			= $row->datos;

				if(in_array($section_id, $ar_typology_section_id)) {
					$ar_groupers = array_merge($ar_groupers, $this->get_project_groupers($section_tipo, $section_id, $datos));
				}
			}
			$ar_groupers = array_unique($ar_groupers, SORT_REGULAR); // remove posible duplicates when parent resolution is called

		// ar_datalist final merge all element
			$ar_datalist = array_merge($ar_groupers, $ar_projects_parsed);

		// sort by label asc
			usort($ar_datalist, function($a, $b) {
				return strcasecmp($a->label, $b->label);
			});

		if(SHOW_DEBUG===true) {
			debug_log(__METHOD__." Total time: ".exec_time_unit($start_time,'ms')." ms", logger::DEBUG);
		}

		return $ar_datalist;
	}//end get_datalist



	/**
	* GET_PROJECT_GROUPERS
	*	Recursive
	* @return array $ar_groupers
	*/
	public function get_project_groupers($section_tipo, $section_id, $datos) {

		$ar_groupers = [];

		$name_tipo 	 = 'dd1320';
		$parent_tipo = 'dd169';

		// section. inject alrady calculated data to the section to avoid reconect to database
			$section = section::get_instance($section_id, $section_tipo);
			$section->set_dato($datos);
			$section->set_bl_loaded_matrix_data(true);

		// name
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($name_tipo,true);
			$component 		= component_common::get_instance($modelo_name,
															 $name_tipo,
															 $section_id,
															 'list',
															 DEDALO_DATA_LANG,
															 $section_tipo);
			$name_value = $component->get_valor();

		// parent
			$model_parent 		= RecordObj_dd::get_modelo_name_by_tipo($parent_tipo,true);
			$parent_component 	= component_common::get_instance($model_parent,
															 $parent_tipo,
															 $section_id,
															 'list',
															 DEDALO_DATA_NOLAN,
															 $section_tipo);
			$parent_dato = $parent_component->get_dato();

		// item grouper obj
			$grouper = new stdClass();
				$grouper->type 			= 'typology';
				$grouper->label 		= $name_value;
				$grouper->section_tipo 	= $section_tipo;
				$grouper->section_id 	= $section_id;
				$grouper->parent 		= !empty($parent_dato) ? reset($parent_dato) : null;

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
	public static function get_stats_value( $tipo, $ar_value ) {

		if(!isset($stats_value)) static $stats_value;

		if( !is_array($ar_value) ) $ar_value = array('' => 1 );

		foreach ($ar_value as $key => $value) {

			if(!isset($stats_value[$tipo][$key])) $stats_value[$tipo][$key] = 0;
			$stats_value[$tipo][$key] = $stats_value[$tipo][$key] + 1;
		}

		return $stats_value[$tipo];
	}//end get_stats_value



	/**
	* GET_STATS_VALUE_RESOLVED
	*/
	public static function get_stats_value_resolved( $tipo, $current_stats_value, $stats_model ,$stats_propiedades=NULL ) {

		$caller_component = get_called_class();

		#dump($current_stats_value ,'$current_stats_value ');

		$current_component = component_common::get_instance($caller_component,$tipo,NULL,'stats');

		# DATO : Component filter está pensado para albergar un arary de proyectos en formato
		# 'project_id':'2' . Le pasamos por tanto el array completo al componente dummy
		# para que resuelva luego el array completo de proyectos
		$current_component->set_dato($current_stats_value);

		# VALOR : Recupera el array completo resuelto
		$valor = $current_component->get_valor(DEDALO_DATA_LANG, 'array');
			#dump($valor,'valor');

		# AR FINAL : Formateamos el array final de salida resuelto
		foreach ($current_stats_value as $key => $value) {
			if(isset($valor[$key]))
				$ar_final[$valor[$key]] = $value;
		}

		$label 		= RecordObj_dd::get_termino_by_tipo( $tipo, null, true ).':'.$stats_model;
		$ar_final 	= array($label => $ar_final );
			#dump($ar_final,'$ar_final');

		return $ar_final;
	}//end get_stats_value_resolved



	/**
	* GET_STATS_VALUE_RESOLVED_ACTIVITY
	*/
	public static function get_stats_value_resolved_activity( $value ) {

		$caller_component = get_called_class();

		#dump($current_stats_value ,'$current_stats_value ');

		$proyectos_tipo = logger_backend_activity::$_COMPONENT_PROYECTOS['tipo'] ;

		$current_component = component_common::get_instance($caller_component,$proyectos_tipo,NULL,'stats');

		# DATO : Component filter está pensado para albergar un arary de proyectos en formato
		# 'project_id':'2' . Le pasamos por tanto el array completo al componente dummy
		# para que resuelva luego el array completo de proyectos
		$value_formated = array($value => 2);
		$current_component->set_dato($value_formated);

		# VALOR : Recupera el array completo resuelto
		$ar_valor = $current_component->get_valor(DEDALO_DATA_LANG, 'array');
			#dump($valor,'valor');

		$valor = $ar_valor[$value];

		return $valor;
	}//end get_stats_value_resolved_activity



	/**
	* BUILD_SEARCH_COMPARISON_OPERATORS
	* Note: Override in every specific component
	* @param array $comparison_operators . Like array('=','!=')
	* @return object stdClass $search_comparison_operators
	*/
	public function build_search_comparison_operators( $comparison_operators=array('=','!=') ) {

		return (object)parent::build_search_comparison_operators($comparison_operators);
	}//end build_search_comparison_operators



	/**
	* UPDATE_DATO_VERSION
	* @return object $response
	*/
	public static function update_dato_version($request_options) {

		$options = new stdClass();
			$options->update_version 	= null;
			$options->dato_unchanged 	= null;
			$options->reference_id 		= null;
			$options->tipo 				= null;
			$options->section_id 		= null;
			$options->section_tipo 		= null;
			$options->context 			= 'update_component_dato';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$update_version = $options->update_version;
			$dato_unchanged = $options->dato_unchanged;
			$reference_id 	= $options->reference_id;
			#dump($dato_unchanged, ' dato_unchanged ++ '." $options->section_tipo - $options->tipo - $options->section_id " .to_string()); die();

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
							$response->result   = 1;
							$response->new_dato = $new_dato;
							$response->msg = "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";
						return $response;

					}else{

						debug_log(__METHOD__." No project found in $options->section_tipo - $options->tipo - $options->section_id ".to_string(), logger::DEBUG);
						$response = new stdClass();
						$response->result = 2;
						$response->msg = "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
						return $response;
					}
				break;
		}
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
	* RENDER_LIST_VALUE
	* Overwrite for non default behaviour
	* Receive value from section list and return proper value to show in list
	* Sometimes is the same value (eg. component_input_text), sometimes is calculated (e.g component_portal)
	* @param string $value
	* @param string $tipo
	* @param int $parent
	* @param string $modo
	* @param string $lang
	* @param string $section_tipo
	* @param int $section_id
	*
	* @return string $list_value
	*/
	public static function render_list_value($value, $tipo, $parent, $modo, $lang, $section_tipo, $section_id, $current_locator=null, $caller_component_tipo=null) {

		$component  	= component_common::get_instance(get_called_class(),
														 $tipo,
														 $parent,
														 'list',
														 DEDALO_DATA_NOLAN,
														 $section_tipo);

		if (!empty($value)) {
			if($ar_val = json_decode($value)){
				$component->set_dato($ar_val);
			}
		}

		$valor = $component->get_valor();

		return $valor;
	}#end render_list_value



	/**
	* GET_VALOR_LIST_HTML_TO_SAVE
	* Usado por section:save_component_dato
	* Devuelve a section el html a usar para rellenar el 'campo' 'valor_list' al guardar
	* Por defecto será el html generado por el componente en modo 'list', pero en algunos casos
	* es necesario sobre-escribirlo, como en component_portal, que ha de resolverse obigatoriamente en cada row de listado
	*
	* En este caso, usaremos únicamente el valor en bruto devuelto por el método 'get_dato_unchanged'
	*
	* @see class.section.php
	* @return mixed $result
	*/
	public function get_valor_list_html_to_save() {
		$result = $this->get_dato_unchanged();

		return $result;
	}//end get_valor_list_html_to_save



	/**
	* REGENERATE_COMPONENT
	* Force the current component to re-save its data
	* Note that the first action is always load dato to avoid save empty content
	* @see class.tool_update_cache.php
	* @return bool
	*/
	public function regenerate_component() {

		# Force loads dato always !IMPORTANT
		$this->get_dato();

		$this->set_propagate_filter(false); # !IMPORTANT (to avoid calculate inverse search of portals, very long process)

		# Save component data
		$this->Save();


		return true;
	}//end regenerate_component



	/**
	* GET_DIFFUSION_VALUE
	* Calculate current component diffsuion value for target field (usually a mysql field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @return string | null $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value( $lang=DEDALO_DATA_LANG ) {

		$dato = $this->get_dato();

		$ar_label = [];
		foreach ((array)$dato as $key => $locator) {
			$label = ts_object::get_term_by_locator( $locator, $lang, true );
			$label = strip_tags(trim($label));
			if (!empty($label)) {
				$ar_label[] = $label;
			}
		}

		if (empty($ar_label)) {
			$diffusion_value = null;
		}else{
			$diffusion_value = implode(' | ', $ar_label);
		}

		return $diffusion_value;
	}//end get_diffusion_value



	/**
	* PARSE_STATS_VALUES
	* @return array $ar_clean
	*/
	public static function parse_stats_values($tipo, $section_tipo, $propiedades, $lang=DEDALO_DATA_LANG, $selector='dato') {

		// Search
			if (isset($propiedades->stats_look_at)) {
				$related_tipo = reset($propiedades->stats_look_at);
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

					if (isset($propiedades->stats_look_at)) {
						$c_tipo 		= reset($propiedades->stats_look_at);
						$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($c_tipo,true);
						$component 		= component_common::get_instance( $modelo_name,
																		  $c_tipo,
																		  $locator->section_id,
																		  'list',
																		  $lang,
																		  $locator->section_tipo);
						$label = $component->get_valor($lang);
					}else{
						$label = ts_object::get_term_by_locator( $locator, $lang, true );
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




}
?>
