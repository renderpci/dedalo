<?php
/*
* CLASS COMPONENT FILTER

1 - Despejamos el id_matrix de usuario
2 - Con el despejamos el component_filter_master 
3 - Averiguamos si es admin mediante component-security-administrator (valor 1)
4 -  Si es usuario cogemos los datos del component_filter_master y su relación (tipo) para resolver la etiqueta
5 - Generamos los checkbox de selección con las secciones obtenidas y con la etiqueta despejada del tipo (dd156)
6 - Guarda el arras de proyectos para esta sección dentro de los accesibles para el usuario.

NOTA: al crear una sección se asigna un proyecto por defecto y no puede haber menos de 1.

*/


class component_filter extends component_common {

	private $user_id;
	public $propagate_filter = true;


	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;

	# MATRIX_TABLE
	protected static $filter_matrix_table = 'matrix';
	
	
	/**
	* __CONSTRUCT
	* Component constructor
	*/
	function __construct( $tipo=false, $parent=null, $modo='list', $lang=DEDALO_DATA_NOLAN, $section_tipo=null) {	#__construct($id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=NULL)
				
		# Build component normally
		parent::__construct($tipo, $parent, $modo, DEDALO_DATA_NOLAN, $section_tipo);

		$this->parent = $this->get_parent();	

		if(SHOW_DEBUG===true) {
			if ($this->RecordObj_dd->get_traducible()==='si') {
				throw new Exception("Error Processing Request. Wrong component lang definition. This component $tipo (".get_class().") is not 'traducible'. Please fix this ASAP", 1);				
			}
		}

		# DEDALO_DEFAULT_PROJECT
		# Dato : Verificamos que hay un dato. Si no, asignamos el dato por defecto definido en config 
		if ($modo==='edit' && defined('DEDALO_DEFAULT_PROJECT')) {
			$dato = $this->get_dato();				
			if(empty($dato)) {
				#dump($dato," EMPTY DATO:  $this->parent - $this->tipo - $this->section_tipo");
				$this->set_dato(array(DEDALO_DEFAULT_PROJECT => 2));
				$this->Save();
				if(SHOW_DEBUG===true) {					
					debug_log(__METHOD__." Saved component filter (tipo:$tipo, parent:$parent, section_tipo:$section_tipo) DEDALO_DEFAULT_PROJECT as ".DEDALO_DEFAULT_PROJECT);
				}
			}
		}
	}//end __construct



	/**
	* GET_HTML
	* @return string $html
	*/
	public function get_html() {
		$this->start_time = microtime(1);
		return parent::get_html();
	}//end get_html



	/**
	* GET DATO : Format {"7":2,"269":2,"298":2}
	* @return array $dato
	* @see component_filter_master->get_dato() for maintain unyfied format of projetcs
	*/
	public function get_dato() {
		$dato = parent::get_dato();
		return (array)$dato;
	}//end get_dato



	/**
	* SET_DATO
	* @see component_filter_master->set_dato() for maintain unifyed format of projetcs
	*/
	public function set_dato($dato) {
		if (empty($dato)) {
			$dato=array();
		}
		parent::set_dato( (object)$dato );
	}//end set_dato
	


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
		# Si la sección a que pertenece este componente tiene portal, propagaremos los cambios a todos los recursos existentes en el portal de esta sección (si los hay)
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
	function propagate_filter() {

		$section_id 	= $this->get_parent();		
		$section_tipo 	= $this->get_section_tipo();
		$section 		= section::get_instance($section_id, $section_tipo);
		$dato_filter   	= $this->get_dato();

		$ar_children_objects = $section->get_ar_children_objects_by_modelo_name_in_section('component_portal');
			#dump($ar_children_objects,"ar_children_objects");
		foreach ($ar_children_objects as $component_portal) {
			if (!empty($component_portal->dato)) {
				$component_portal->propagate_filter($dato_filter);
					#dump($component_portal,'$component_portal propagando filtro....');
			}			
		}
	}//end propagate_filter


	
	/**
	* GET VALOR
	* Devuelve los valores del array 'dato' separados por '<br>'
	* @return string $html | array $ar_final
	*/
	public function get_valor( $format='html' ) {
		
		$ar_proyectos_for_current_section = self::get_ar_projects_for_current_section();
			#dump($ar_proyectos_for_current_section,'ar_proyectos_for_current_section');
		
		$dato 		= $this->get_dato();
		$ar_final 	= array();
		
		if(is_array($ar_proyectos_for_current_section)) foreach ($ar_proyectos_for_current_section as $section_id => $name) {
			
			#dump(array_key_exists((int)$section_id,(array)$dato)," ");
			if( is_array($dato) && in_array($section_id, array_keys($dato)) ) {

				$ar_final[$section_id] = $name;	#dump($section_id," section_id - $name");
				#$html .= $name;
				#if($section_id != end($ar_proyectos_for_current_section))
				#	$html .= '<br>';
			}
		}//end foreach ($ar_proyectos_for_current_section as $section_id => $name) {

		if ($format==='array') {
			
			return $ar_final;

		}else if($format==='html'){

			$html = '';
			foreach ($ar_final as $name) {
				$html .= $name;
				$html .= '<br>';
			}
			$html = substr($html, 0,-4);			
			
			return $html;

		}else if($format==='html_concat'){
			$html = '';
			foreach ($ar_final as $name) {
				$html .= $name;
				$html .= ' · ';
			}
			$html = substr($html, 0,-4);				
			
			return $html;
		}
	}//end get_valor



	/**
	* GET_VALOR_EXPORT
	* Return component value sended to export data
	* @return string $valor
	*/
	public function get_valor_export( $valor=null, $lang=DEDALO_DATA_LANG, $quotes, $add_id ) {
			
		if (is_null($valor)) {
			$dato = $this->get_dato();				// Get dato from DB
		}else{
			$this->set_dato( json_decode($valor) );	// Use parsed json string as dato
		}

		$valor_export = $this->get_valor('html');
		if (strlen($valor_export)) {
			$valor_export = '·'.trim(str_replace('<br>', PHP_EOL.'·',$valor_export));
			$valor_export = stripslashes($valor_export);
		}


		return $valor_export;
	}//end get_valor_export
	


	/**
	* GET AR PROYECTOS SECTION ID MATRIX
	* Se usa en section edit para mostrar el listado de checkboxes de
	* los proyectos autorizados al usuario actual logeado
	* en cualquier sección estándar
	*
	* @return $ar_proyectos_for_current_section
	*	Array proyectos id matrix
	*/
	public function get_ar_projects_for_current_section() {
		/*
		# STATIC CACHE
		static $cache_ar_proyectos_for_current_section;
		if( isset($cache_ar_proyectos_for_current_section[$this->tipo]) ) {
			#trigger_error("Returned data from static cache get_ar_projects_for_current_section ");
			return $cache_ar_proyectos_for_current_section[$this->tipo];
		}

		# unset($_SESSION['dedalo4']['config']['all_authorized_content_sections']);
		#if(isset($_SESSION['dedalo4']['config']['ar_proyectos_for_current_section'][DEDALO_DATA_LANG])) {
		#	return $_SESSION['dedalo4']['config']['ar_proyectos_for_current_section'][DEDALO_DATA_LANG];
		#}

		if(SHOW_DEBUG===true) {
			$start_time = start_time();
			global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_IN_'.$this->tipo.'_'.microtime(1)]=microtime(1);
		}
		*/
		$ar_proyectos_for_current_section = array();

		# Usuario logeado actualmente
		$user_id = navigator::get_user_id();							
			#dump($user_id,'user_id');		

		# Test is_global_admin
		$is_global_admin = component_security_administrator::is_global_admin($user_id);
		if ($is_global_admin===true) {

			# SÓLO PARA ADMINISTRADORES. 
			# BYPASS EL FILTRO Y ACCEDE A TODOS LOS PROYECTOS
			# Buscamos TODOS los registros de section tipo DEDALO_SECTION_PROJECTS_TIPO
			/*
				$strQuery   = "-- ".__METHOD__."\n SELECT section_id \n FROM \"matrix_projects\" ORDER BY section_id ASC";	//WHERE $sql_filtro
				$result		= JSON_RecordObj_matrix::search_free($strQuery);

				$ar_proyectos_section_id=array();
				while ($rows = pg_fetch_assoc($result)) {
					$ar_proyectos_section_id[] = $rows['section_id'];
				}
				#dump($ar_proyectos_section_id	, ' ar_proyectos_section_id');
				*/
			
		}else{

			# USUARIOS COMUNES. 
			# DEVUELVE SÓLO LOS PROYECTOS DEL USUARIO (filter master)
			# Los proyectos autorizados al usuario actual, de tipo '{"212":2,"250":2,"274":2,"783":2,"791":2,"803":2}'
				$component_filter_master 	= component_common::get_instance('component_filter_master',
																			 DEDALO_FILTER_MASTER_TIPO,
																			 $user_id,
																			 'edit',
																			 DEDALO_DATA_NOLAN,
																			 DEDALO_SECTION_USERS_TIPO);
				$dato = (array)$component_filter_master->get_dato();
					#dump($component_filter_master, ' dato');

				$ar_proyectos_section_id = array_keys($dato);	
					#dump($ar_proyectos_section_id,'ar_proyectos_section_id',"resultado de component_check_box::get_array_dato_from_js_dato(dato)");					
		}

		$strQuery  = '';
		# SELECCIÓN CON TODOS LOS LENGUAJES
		$strQuery .= "SELECT section_id, ";
		$strQuery .= "datos #>>'{components,".DEDALO_PROJECTS_NAME_TIPO.",dato}' AS project_name " ;
		$strQuery .= "\n FROM \"matrix_projects\" ";
		$strQuery .= "\n WHERE ";
		$strQuery .= "\n section_tipo = '".DEDALO_SECTION_PROJECTS_TIPO."' ";
		if ($is_global_admin!==true) {
			$strQuery .= "\n AND (";
			$last = end($ar_proyectos_section_id);
			foreach ($ar_proyectos_section_id as $current_section_id) {
				$strQuery .= "section_id = $current_section_id ";
				if($current_section_id!==$last) $strQuery .= " OR ";
			}
			$strQuery .= ") ";
		}		
		$strQuery .= "\n ORDER BY section_id ASC; ";
		#debug_log(__METHOD__." strQuery ".to_string($strQuery), logger::ERROR);
		$result = JSON_RecordObj_matrix::search_free($strQuery);		
		while ($rows = pg_fetch_assoc($result)) {
			$current_section_id = $rows['section_id'];
			$project_names		= json_decode($rows['project_name']);
				#dump($project_names, ' $project_names ++ '.to_string($current_section_id));
			$project_name = '';
			if (!is_null($project_names)) {

				if (property_exists($project_names, DEDALO_DATA_LANG)) {
					# REMOVE STRING TEST ON V4.5 CONSOLIDATED
					if (is_string($project_names->{DEDALO_DATA_LANG})) {
						$project_name = $project_names->{DEDALO_DATA_LANG};
						debug_log(__METHOD__." Project name is string. Update projects dato ASAP ".to_string(), logger::WARNING);
					}else{
						$project_name = reset($project_names->{DEDALO_DATA_LANG}); 	#dump($project_name, ' project_name 1 ++ '.to_string(DEDALO_DATA_LANG)); die();
					}					
				}elseif (property_exists($project_names, DEDALO_APPLICATION_LANGS_DEFAULT)) {
					# REMOVE STRING TEST ON V4.5 CONSOLIDATED
					if (is_string($project_names->{DEDALO_APPLICATION_LANGS_DEFAULT})) {
						$project_name = $project_names->{DEDALO_APPLICATION_LANGS_DEFAULT};
						debug_log(__METHOD__." Project name is string. Update projects dato ASAP ".to_string(), logger::WARNING);
					}else{
						$project_name = reset($project_names->{DEDALO_APPLICATION_LANGS_DEFAULT}); #dump($project_name, ' project_name 2 ++ '.to_string(DEDALO_APPLICATION_LANGS_DEFAULT)); die();
					}					
				}else{
					# REMOVE STRING TEST ON V4.5 CONSOLIDATED
					if (is_string($project_names)) {
						$project_name = $project_names;
						debug_log(__METHOD__." Project name is string. Update projects dato ASAP ".to_string(), logger::WARNING);
					}else{
						$project_name = reset($project_names);
						$project_name = to_string($project_name);  #dump($project_name, ' project_name 3 ++ '.to_string($project_names)); die();
					}					
				}
			}			
			$ar_proyectos_for_current_section[$current_section_id] = (string)$project_name;
		}
		/*
		// Resolve projects names
		$modelo_name = RecordObj_dd::get_modelo_name_by_tipo(DEDALO_PROJECTS_NAME_TIPO,true);
		$ar_proyectos_for_current_section=array();
		foreach ($ar_proyectos_section_id as $current_section_id) {
			
			$component = component_common::get_instance($modelo_name,
														DEDALO_PROJECTS_NAME_TIPO,
														$current_section_id,
														'list',
														DEDALO_DATA_LANG,
														DEDALO_SECTION_PROJECTS_TIPO);
			$current_dato = $component->get_valor();
			
			// Fallback to application default lang
			if ( empty($current_dato) ) {
				$component = component_common::get_instance($modelo_name,
														DEDALO_PROJECTS_NAME_TIPO,
														$current_section_id,
														'list',
														DEDALO_APPLICATION_LANGS_DEFAULT,
														DEDALO_SECTION_PROJECTS_TIPO);
				$current_dato = "<mark>".$component->get_valor()."</mark>";
			}
			
			$ar_proyectos_for_current_section[$current_section_id] = (string)$current_dato;
		}
		
		# STATIC CACHE
		$cache_ar_proyectos_for_current_section[$this->tipo] = $ar_proyectos_for_current_section;
		#$_SESSION['dedalo4']['config']['ar_proyectos_for_current_section'][DEDALO_DATA_LANG] = $ar_proyectos_for_current_section;

		if(SHOW_DEBUG===true) {			
			global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_OUT_'.$this->tipo.'_'.microtime(1)]=microtime(1);
			#dump($ar_proyectos_for_current_section,'$ar_proyectos_for_current_section');
			#debug_log(__METHOD__." exec_time ".exec_time($start_time). to_string(), logger::WARNING);
		}		
*/
		return (array)$ar_proyectos_for_current_section;
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
	}



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
		$valor = $current_component->get_valor('array');
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
	}



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
		$ar_valor = $current_component->get_valor('array');
			#dump($valor,'valor');

		$valor = $ar_valor[$value];
		
		return $valor;
	}



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
	}#end build_search_comparison_operators


	
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
	public static function get_search_query( $json_field, $search_tipo, $tipo_de_dato_search, $current_lang, $search_value, $comparison_operator='=') {
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
	}



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

		$current_valor  = $value;
		$ar_val 		= json_decode($current_valor);
		$component  	= component_common::get_instance(__CLASS__,
														 $tipo,
													 	 $parent,
													 	 'list',
														 DEDALO_DATA_NOLAN,
													 	 $section_tipo);
		$component->set_dato($ar_val);
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



	
}
?>