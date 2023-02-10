<?php
/*
* CLASS COMPONENT FILTER

1 - Get the section_id of the user
2 - With the user
1 - Despejamos el section_id de usuario
2 - Con el despejamos el component_filter_master
3 - Averiguamos si es admin mediante component-security-administrator (valor 1)
4 -  Si es usuario cogemos los datos del component_filter_master y su relación (tipo) para resolver la etiqueta
5 - Generamos los checkbox de selección con las secciones obtenidas y con la etiqueta despejada del tipo (dd156)
6 - Guarda el arras de proyectos para esta sección dentro de los accesibles para el usuario.

NOTA: al crear una sección se asigna un proyecto por defecto y no puede haber menos de 1.

*/
class component_filter extends component_relation_common {


	private $user_id;
	public $propagate_filter = true;


	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;

	# MATRIX_TABLE
	#protected static $filter_matrix_table = 'matrix';

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


		// dedalo_default_project. (!) Note that component common 'set_dato_default' is overwritten here for this component
			if ($modo==='edit' && get_called_class()==='component_filter') { // Remember that component_filter_master extends this class
				$dato = $this->get_dato();
				if(empty($dato)) {
					// (!) filter always save default project for current user to prevent to loose the access to new created records
					$user_id = navigator::get_user_id();
					$this->set_default_dato_for_user($user_id);
				}
			}


		return true;
	}//end __construct



	/**
	* SET_DATO
	* @return
	*/
	public function set_dato( $dato ) {

		// For safe compatibility backwards
			$dato = self::convert_dato_pre_490( $dato, $this->tipo );

		// preserve projects that user do not have access
			$user_id			= navigator::get_user_id();
			$is_global_admin	= component_security_administrator::is_global_admin($user_id);
			if ($is_global_admin===true) {

				// do not modify dato
				$final_dato = $dato;

			}else{

				// user projects
				$user_projects	= filter::get_user_projects( $user_id ) ?? [];
				// actual dato in DDBB
				$current_dato	= $this->dato;
				// filter
				$non_access_locators = [];
				if (!empty($current_dato)) {
					foreach ($current_dato as $current_locator) {
						$in_my_projects = locator::in_array_locator(
							$current_locator,
							$user_projects,
							['section_tipo','section_id'] // array ar_properties
						);
						if ($in_my_projects===false) {
							$non_access_locators[] = $current_locator;
						}
					}
				}

				// merge final data
				$final_dato = empty($dato)
					? $non_access_locators
					: array_merge( (array)$dato, $non_access_locators );
			}


		return parent::set_dato( $final_dato );
	}//end set_dato



	/**
	* GET DATO : Old Format {"7":2,"269":2,"298":2}
	* @return array $dato
	* @see component_filter_master->get_dato() for maintain unified format of projects
	*/
	public function get_dato() {

		# Select the correct update from file updates
		$current_version = (array)tool_administration::get_current_version_in_db();
		if($current_version[0] <= 4 && $current_version[1] <= 8) {

			if(isset($this->dato_resolved)) {
				return $this->dato_resolved;
			}

			$ar_path	= ['components', $this->tipo, 'dato', DEDALO_DATA_NOLAN];
			// $section	= section::get_instance($this->parent, $this->section_tipo);
			$section	= $this->get_my_section();
			$dato		= $section->get_dato_in_path($ar_path);

			$this->dato = $dato; // Old dato format (<4.9)
			$this->bl_loaded_matrix_data = true;

			#return (array)$dato; // Stop and returns old dato !
		}else{

			// Call to parent class component_relation_common
			$dato = parent::get_dato();
		}

		return (array)$dato;
	}//end get_dato



	/**
	* SET_DATO_DEFAULT
	* Overwrite component common method
	* @return bool true
	*/
	public function set_dato_default() {

		// nothing to do here. Action is delegated to method set_default_dato_for_user

		return true;
	}//end set_dato_default



	/**
	* SET_DEFAULT_DATO_FOR_USER
	* The assignation sequence order was review at 08-02-2023 because was wrong (global default project was set always,
	* event when properties default exists - Eulalia case- )
	* @return array $default_dato
	*/
	protected function set_default_dato_for_user($user_id) {

		$is_global_admin = component_security_administrator::is_global_admin($user_id);
		$user_projects = ($is_global_admin===true)
			? null // no filter is needed for global_admin
			: filter::get_user_projects($user_id);

		$default_dato = [];

		// optional defaults for config_defaults file
			if (defined('CONFIG_DEFAULT_FILE_PATH')) {
				// config_default_file is a JSON array value
				$contents = file_get_contents(CONFIG_DEFAULT_FILE_PATH);
				$defaults = json_decode($contents);
				if (!empty($defaults)) {
					if (!is_array($defaults)) {
						debug_log(__METHOD__." Ignored config_default_file value. Expected type was array but received is ". gettype($defaults), logger::ERROR);
					}else{
						$found = array_find($defaults, function($el){
							return $el->tipo===$this->tipo; // Note that match only uses component tipo (case hierarchy25 problem)
						});
						if (!empty($found)) {
							$default_dato = is_array($found->value)
								? $found->value
								: [$found->value];
						}
					}
				}else{
					debug_log(__METHOD__." Ignored empty defaults file contents ! (Check if JSON is valid) ".to_string($defaults), logger::ERROR);
				}
			}

		// optional properties dato_default. It is appended to already set dato if defined
			if (empty($default_dato)) {

				// 2º try . Only for compatibility with old installations

				$propiedades = $this->get_propiedades();
				if (isset($propiedades->dato_default)) {

					// legacy format of default dato:
					// { "41": "2" }
					$section_id = null;
					foreach($propiedades->dato_default as $key => $value) {
					    $section_id = $key;
					    break;
					}

					$filter_locator = new locator();
						$filter_locator->set_section_tipo(DEDALO_FILTER_SECTION_TIPO_DEFAULT);
						$filter_locator->set_section_id($section_id);
						$filter_locator->set_type(DEDALO_RELATION_TYPE_FILTER);
						$filter_locator->set_from_component_tipo($this->tipo);

					$default_dato[] = $filter_locator;

					// info log
						if(SHOW_DEBUG===true) {
							$msg = " Created ".get_called_class()." \"$this->label\" id:$this->parent, tipo:$this->tipo, section_tipo:$this->section_tipo, modo:$this->modo with default data from 'propiedades': ".json_encode($propiedades->dato_default);
							debug_log(__METHOD__.$msg, logger::DEBUG);
						}
				}
			}

		// user access to default check
			if (empty($default_dato)) {

				// NO properties default data is defined case

				if ($is_global_admin===true) {

					// Global admin do not have projects, so add the global default project

					// Default project defined in config
					$filter_locator = new locator();
						$filter_locator->set_section_tipo(DEDALO_FILTER_SECTION_TIPO_DEFAULT);
						$filter_locator->set_section_id(DEDALO_DEFAULT_PROJECT);
						$filter_locator->set_type(DEDALO_RELATION_TYPE_FILTER);
						$filter_locator->set_from_component_tipo($this->tipo);

					$default_dato[] = $filter_locator;

				}else{

					// Common users have projects, so add first project to prevent no access situation

					// First user project
					$user_projects_first_locator = reset($user_projects);

					$filter_locator = new locator();
						$filter_locator->set_section_tipo($user_projects_first_locator->section_tipo);
						$filter_locator->set_section_id($user_projects_first_locator->section_id);
						$filter_locator->set_type(DEDALO_RELATION_TYPE_FILTER);
						$filter_locator->set_from_component_tipo($this->tipo);

					$default_dato[] = $filter_locator;
				}
			}else{

				// properties default data exists case

				if($is_global_admin===true) {

					// check current added project is accessible for my user
					$in_my_projects = false;
					foreach ($default_dato as $current_locator) {
						$in_my_projects = locator::in_array_locator(
							$current_locator,
							$user_projects,
							['section_tipo','section_id'] // array ar_properties
						);
						if ($in_my_projects===true) {
							break; // user have access to assigned default. We have finished
						}
					}
					// If not, add the first one to prevent no access situation
					if ($in_my_projects===false) {

						// First user project
						$user_projects_first_locator = reset($user_projects);

						$filter_locator = new locator();
							$filter_locator->set_section_tipo($user_projects_first_locator->section_tipo);
							$filter_locator->set_section_id($user_projects_first_locator->section_id);
							$filter_locator->set_type(DEDALO_RELATION_TYPE_FILTER);
							$filter_locator->set_from_component_tipo($this->tipo);

						$default_dato[] = $filter_locator;
					}
				}
			}


		if (empty($default_dato)) {
			$msg = 'Error. Default dato for component filter is not defined!';
			trigger_error($msg);
			debug_log(__METHOD__.' '.$msg, logger::ERROR);
		}else{

			// set
				$this->set_dato($default_dato);

			// save (if it is not a temporary section)
				if ( strpos($this->parent, DEDALO_SECTION_ID_TEMP)===false ) {
					$this->id = $this->Save();
					debug_log(__METHOD__." Added and saved default dato for this component ".to_string($default_dato), logger::DEBUG);
				}

			// matrix data : reload matrix data again
				$this->load_component_dato();
		}


		return $default_dato;
	}//end set_default_dato_for_user



	/**
	* SET_DEFAULT_DATO_FOR_USER_OLD
	* @return array $default_dato
	*/
		// protected function set_default_dato_for_user_OLD($user_id) {

		// 	$is_global_admin = component_security_administrator::is_global_admin($user_id);
		// 	$user_projects = ($is_global_admin===true)
		// 		? null // no filter is needed for global_admin
		// 		: filter::get_user_projects($user_id);

		// 	$default_dato = [];

		// 	// user projects
		// 		if (!empty($user_projects)) {
		// 			# First user project
		// 			$user_projects_first_locator = reset($user_projects);

		// 			$filter_locator = new locator();
		// 				$filter_locator->set_section_tipo($user_projects_first_locator->section_tipo);
		// 				$filter_locator->set_section_id($user_projects_first_locator->section_id);
		// 				$filter_locator->set_type(DEDALO_RELATION_TYPE_FILTER);
		// 				$filter_locator->set_from_component_tipo($this->tipo);

		// 			$default_dato[] = $filter_locator;

		// 		}else{
		// 			# Default project defined in config
		// 			$filter_locator = new locator();
		// 				$filter_locator->set_section_tipo(DEDALO_FILTER_SECTION_TIPO_DEFAULT);
		// 				$filter_locator->set_section_id(DEDALO_DEFAULT_PROJECT);
		// 				$filter_locator->set_type(DEDALO_RELATION_TYPE_FILTER);
		// 				$filter_locator->set_from_component_tipo($this->tipo);

		// 			$default_dato[] = $filter_locator;
		// 		}

		// 	// optional properties dato_default. It is appended to already set dato if defined
		// 		$propiedades = $this->get_propiedades();
		// 		if (isset($propiedades->dato_default)) {

		// 			// legacy format of default dato:
		// 			// { "41": "2" }
		// 			$section_id = null;
		// 			foreach($propiedades->dato_default as $key => $value) {
		// 			    $section_id = $key;
		// 			    break;
		// 			}

		// 			$filter_locator = new locator();
		// 				$filter_locator->set_section_tipo(DEDALO_FILTER_SECTION_TIPO_DEFAULT);
		// 				$filter_locator->set_section_id($section_id);
		// 				$filter_locator->set_type(DEDALO_RELATION_TYPE_FILTER);
		// 				$filter_locator->set_from_component_tipo($this->tipo);

		// 			$default_dato[] = $filter_locator;

		// 			// info log
		// 				if(SHOW_DEBUG===true) {
		// 					$msg = " Created ".get_called_class()." \"$this->label\" id:$this->parent, tipo:$this->tipo, section_tipo:$this->section_tipo, modo:$this->modo with default data from 'propiedades': ".json_encode($propiedades->dato_default);
		// 					debug_log(__METHOD__.$msg, logger::DEBUG);
		// 				}
		// 		}

		// 	if (empty($default_dato)) {
		// 		$msg = 'Error. Default dato for component filter is not defined!';
		// 		trigger_error($msg);
		// 		debug_log(__METHOD__.' '.$msg, logger::ERROR);
		// 	}else{

		// 		// set
		// 			$this->set_dato($default_dato);

		// 		// save (if it is not a temporary section)
		// 			if ( strpos($this->parent, DEDALO_SECTION_ID_TEMP)===false ) {
		// 				$this->id = $this->Save();
		// 				debug_log(__METHOD__." Added and saved default dato for this component ".to_string($default_dato), logger::DEBUG);
		// 			}

		// 		// matrix data : reload matrix data again
		// 			$this->load_component_dato();
		// 	}


		// 	return $default_dato;
		// }//end set_default_dato_for_user_OLD



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

		$section_id				= $this->get_parent();
		$section_tipo			= $this->get_section_tipo();
		// $section				= section::get_instance($section_id, $section_tipo);
		$section				= $this->get_my_section();
		$component_dato_filter	= $this->get_dato();

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

		$ar_proyectos_for_current_section = self::get_ar_projects_for_current_section();

		$dato 		= $this->get_dato();
		$ar_final 	= array();
		foreach ((array)$ar_proyectos_for_current_section as $key => $row) {
			if (locator::in_array_locator( $row->locator, (array)$dato )) { // ['section_id','section_tipo']
				$ar_final[] = $row;
			}
		}//end foreach ($ar_proyectos_for_current_section as $section_id => $name)

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
	public function get_valor_export( $valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null ) {

		if (empty($valor)) {
			$dato = $this->get_dato();				// Get dato from DB
		}else{
			$this->set_dato( json_decode($valor) );	// Use parsed json string as dato
		}

		$valor_export = $this->get_valor($lang, 'html');


		return $valor_export;
	}//end get_valor_export



	/**
	* GET_AR_PROJECTS_FOR_CURRENT_SECTION
	* Works like ar_list_of_values but filtered by user authorized projects
	* @return array $ar_projects
	*/
	public function get_ar_projects_for_current_section() {

		# User loged now
		$user_id 	 = navigator::get_user_id();
		$ar_projects = filter::get_user_authorized_projects($user_id, $this->tipo);

		return $ar_projects;
	}//end get_ar_projects_for_current_section



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



	/*
	* GET_VALOR_LANG
	* Return the main component lang
	* If the component need change this langs (selects, radiobuttons...) overwritte this function
	*/
	public function get_valor_lang(){

		$relacionados = (array)$this->RecordObj_dd->get_relaciones();

		if(empty($relacionados)){
			return $this->lang;
		}

		$termonioID_related = array_values($relacionados[0])[0];
		$RecordObjt_dd = new RecordObj_dd($termonioID_related);

		if($RecordObjt_dd->get_traducible() === 'no'){
			$lang = DEDALO_DATA_NOLAN;
		}else{
			$lang = DEDALO_DATA_LANG;
		}

		return $lang;
	}//end get_valor_lang


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
	* GET_SEARCH_QUERY
	* Build search query for current component . Overwrite for different needs in other components
	* (is static to enable direct call from section_records without construct component)
	* Params
	* @param string $json_field . JSON container column Like 'dato'
	* @param string $search_tipo . Component tipo Like 'dd421'
	* @param string $tipo_de_dato_search . Component dato container Like 'dato' or 'valor'
	* @param string $current_lang . Component dato lang container Like 'lg-spa' or 'lg-nolan'
	* @param string $search_value . Value received from search form request Like 'paco'
	* @param string $comparison_operator . SQL comparison operator Like 'ILIKE'
	*
	* @see class.section_records.php get_rows_data filter_by_search
	* @return string $search_query . POSTGRE SQL query (like 'datos#>'{components, oh21, dato, lg-nolan}' ILIKE '%paco%' )
	*/
	public static function get_search_query( $json_field, $search_tipo, $tipo_de_dato_search=null, $current_lang=null, $search_value='', $comparison_operator='=') {

		if ( empty($search_value) ) {
			return null;
		}

		$json_field = 'a.'.$json_field; // Add 'a.' for mandatory table alias search

		if (is_array($search_value)) {
			$current_search_value = implode("','", $search_value);
		}else{
			$current_search_value = $search_value;
		}

		#$search_query = " $json_field#>'{components,$search_tipo,$tipo_de_dato_search,$current_lang}' ?| array['$current_search_value'] ";
		switch (true) {
			case $comparison_operator==='=':
				$search_query = " $json_field#>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}' ?| array['$current_search_value'] ";
				break;
			case $comparison_operator==='!=':
				$search_query = " ($json_field#>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}' @> '[$current_search_value]'::jsonb)=FALSE ";
				break;
		}

		if(SHOW_DEBUG===true) {
			$search_query = " -- filter_by_search $search_tipo ". get_called_class() ." \n".$search_query;
		}
		return $search_query;
	}//end get_search_query



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

		$component = component_common::get_instance(get_called_class(),
													$tipo,
													$parent,
													'list',
													DEDALO_DATA_NOLAN,
													$section_tipo);

		// inject already resolved dato
			if (!empty($value)) {
				if($ar_val = json_decode($value)){
					$component->set_dato($ar_val);
				}
			}

		$valor = $component->get_valor();

		return $valor;
	}//end render_list_value



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

		$diffusion_value = !empty($ar_label)
			? implode(' | ', $ar_label)
			: null;

		return $diffusion_value;
	}//end get_diffusion_value



	/**
	* PARSE_STATS_VALUES
	* @return array $ar_clean
	*/
	public static function parse_stats_values($tipo, $section_tipo, $propiedades, $lang=DEDALO_DATA_LANG, $selector='dato') {

		// Search
			$path				= search_development2::get_query_path($tipo, $section_tipo, true, false);
			$end_path			= end($path);
			$end_path->selector	= $selector;
			$related_tipo		= isset($propiedades->stats_look_at)
				? reset($propiedades->stats_look_at)
				: ($end_path->component_tipo ?? false);

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
			$search_query_object	= json_decode($search_query_object);
			$search_development2	= new search_development2($search_query_object);
			$result					= $search_development2->search();

		// Parse results for stats
			$ar_clean = [];
			foreach ($result->ar_records as $row) {

				$project_name = isset($row->{$related_tipo})
					? json_decode($row->{$related_tipo})
					: [''];

				$label	= strip_tags(reset($project_name));
				$uid	= $label;

				// creates/update the counter object
					if(!isset($ar_clean[$uid])){
						$ar_clean[$uid] = new stdClass();
							$ar_clean[$uid]->count = 0;
							$ar_clean[$uid]->tipo  = $tipo;
					}
					$ar_clean[$uid]->count++;
					$ar_clean[$uid]->value = $label;
			}//end foreach ($result->ar_records as $row)


		return $ar_clean;
	}//end parse_stats_values



}//end component_filter


