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
	
	
	# Constructor
	function __construct( $tipo=false, $parent=null, $modo='list', $lang=DEDALO_DATA_NOLAN, $section_tipo=null) {	#__construct($id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=NULL)
		
		# Creamos el componente normalmente
		parent::__construct($tipo, $parent, $modo, DEDALO_DATA_NOLAN, $section_tipo);

		$this->parent = $this->get_parent();	

		if(SHOW_DEBUG) {
			$traducible = $this->RecordObj_dd->get_traducible();
			if ($traducible=='si') {
				throw new Exception("Error Processing Request. Wrong component lang definition. This component $tipo (".get_class().") is not 'traducible'. Please fix this ASAP", 1);				
			}
		}


		# DEDALO_DEFAULT_PROJECT
		# Dato : Verificamos que hay un dato. Si no, asignamos el dato por defecto definido en config 
		if ($modo=='edit' && defined('DEDALO_DEFAULT_PROJECT')) {
			$dato = $this->get_dato();
				#dump($dato," $this->parent - $this->tipo");
			if(empty($dato)) {
				$this->set_dato(array(DEDALO_DEFAULT_PROJECT => 2));
				$this->Save();
				if(SHOW_DEBUG) {
					error_log(__METHOD__." Saved component filter (parent:$parent) DEDALO_DEFAULT_PROJECT as ".DEDALO_DEFAULT_PROJECT);
				}
			}
		}#end if ($modo=='edit' && defined('DEDALO_DEFAULT_PROJECT'))

	}#end __construct


	# GET DATO . Format {"7":2,"298":2}
	public function get_dato() {
		$dato = parent::get_dato();			
		return (array)$dato;
	}

	# SET_DATO
	public function set_dato($dato) {
		if (empty($dato)) {
			$dato=array();
		}
		parent::set_dato( (object)$dato );
	}
	

	/**
	* SAVE OVERRIDE
	* Overwrite component_common method 
	*/
	public function Save() {

		# Salvamos normalmente pero guardamos el resultado
		$parent_save_result = parent::Save();

		# Logger only
		if( $this->tipo == logger_backend_activity::$_COMPONENT_PROYECTOS['tipo'] ) return $parent_save_result; 

		
			##
			# PORTAL CASE
			# Si la sección a que pertenece este componente tiene portal, propagaremos los cambios a todos los recursos existentes en el portal de esta sección (si los hay)
			if ($this->propagate_filter) {
				
				$this->propagate_filter();				
				
			}# /if ($propagate_filter) {

			#dump($parent_save_result,'$parent_save_result for component_filter Save tipo:'.$this->tipo." parent: ".$this->parent);


		# Devolvemos el resultado del save
		return $parent_save_result;
	}


	


	/**
	* PROPAGATE_FILTER
	* Propagate all current filter dato (triggered when save) to component_filters of children portals (recursive)
	*/
	function propagate_filter() {

		$section_id 	= $this->get_parent();
		$section_tipo 	= component_common::get_section_tipo_from_component_tipo($this->tipo);	
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
		#component_portal::propagate_filter_static($section_tipo, $dato_filter);
	}

	
	/**
	* GET VALOR
	* Devuelve los valores del array 'dato' separados por '<br>'
	*/
	public function get_valor( $format='html' ) {
		
		$ar_proyectos_for_current_section = self::get_ar_proyectos_for_current_section();
			#dump($ar_proyectos_for_current_section,'ar_proyectos_for_current_section');
		
		$dato 		= $this->get_dato();
		$ar_final 	= array();
		
		if(is_array($ar_proyectos_for_current_section)) foreach ($ar_proyectos_for_current_section as $id_matrix => $name) {
			
			#dump(array_key_exists((int)$id_matrix,(array)$dato)," ");
			if( is_array($dato) && in_array($id_matrix, array_keys($dato)) ) {

				$ar_final[$id_matrix] = $name;	#dump($id_matrix," id_matrix - $name");
				#$html .= $name;
				#if($id_matrix != end($ar_proyectos_for_current_section))
				#	$html .= '<br>';
			}
		}

		if ($format=='array') {
			
			return $ar_final;

		}else{

			$html = '';
			foreach ($ar_final as $name) {
				$html .= $name;
				$html .= '<br>';
			}
			$html = substr($html, 0,-4);				
			
			return $html;
		}		
	}
	


	/**
	* GET AR PROYECTOS SECTION ID MATRIX
	* Se usa en section edit para mostrar el listado de checkboxes de
	* los proyectos autorizados al usuario actual logeado
	* en cualquier sección estándar
	*
	* @return $ar_proyectos_for_current_section
	*	Array proyectos id matrix
	*/
	public function get_ar_proyectos_for_current_section() {

		# STATIC CACHE
		static $cache_ar_proyectos_for_current_section;
		if( isset($cache_ar_proyectos_for_current_section[$this->tipo]) ) {
			#trigger_error("Returned data from static cache get_ar_proyectos_for_current_section ");
			return $cache_ar_proyectos_for_current_section[$this->tipo];
		}

		# unset($_SESSION['dedalo4']['config']['all_authorized_content_sections']);
		#if(isset($_SESSION['dedalo4']['config']['ar_proyectos_for_current_section'][DEDALO_DATA_LANG])) {
		#	return $_SESSION['dedalo4']['config']['ar_proyectos_for_current_section'][DEDALO_DATA_LANG];
		#}

		if(SHOW_DEBUG) {
			$start_time = start_time();
			global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_IN_'.$this->tipo.'_'.microtime(1)]=microtime(1);
		}
		
		$ar_proyectos_for_current_section = array();

		# Usuario logeado actualmente
		$user_id = navigator::get_user_id();							
			#dump($user_id,'user_id');	
		
		#$tipo 				= DEDALO_SECTION_USERS_TIPO;		
		#$tipo_filter_master = DEDALO_FILTER_MASTER_TIPO;

		# Test is_global_admin
		$is_global_admin = component_security_administrator::is_global_admin($user_id);
		if ($is_global_admin===true) {

			# SÓLO PARA ADMINISTRADORES. 
			# BYPASS EL FILTRO Y ACCEDE A TODOS LOS PROYECTOS
			# Buscamos TODOS los registros de section tipo DEDALO_SECTION_PROJECTS_TIPO
			/*
			$arguments=array();
			$arguments["datos#>>'{section_tipo}'"]	= DEDALO_SECTION_PROJECTS_TIPO;
			$matrix_table 							= common::get_matrix_table_from_tipo(DEDALO_SECTION_PROJECTS_TIPO);		
			$JSON_RecordObj_matrix					= new JSON_RecordObj_matrix($matrix_table,NULL,DEDALO_SECTION_PROJECTS_TIPO);
			$ar_records								= $JSON_RecordObj_matrix->search($arguments);	#dump($arguments,'$arguments');
			*/

			$strQuery   = "-- ".__METHOD__."\n SELECT id \n FROM \"matrix_projects\" ";	//WHERE $sql_filtro
			$result		= JSON_RecordObj_matrix::search_free($strQuery);

			$ar_proyectos_section_id=array();
			while ($rows = pg_fetch_assoc($result)) {
				$ar_proyectos_section_id[] = $rows['id'];
			}
			#dump($ar_proyectos_section_id	, ' ar_proyectos_section_id');
			
		}else{

			# USUARIOS COMUNES. 
			# DEVUELVE SÓLO LOS PROYECTOS DEL USUARIO (filter master)
			# Los proyectos autorizados al usuario actual, de tipo '{"212":2,"250":2,"274":2,"783":2,"791":2,"803":2}'
			$component_filter_master 	= component_common::get_instance('component_filter_master', DEDALO_FILTER_MASTER_TIPO, $user_id, 'edit', DEDALO_DATA_NOLAN, DEDALO_SECTION_USERS_TIPO);
			$dato						= (array)$component_filter_master->get_dato();
				#dump($component_filter_master, ' dato');

			$ar_proyectos_section_id = array_keys($dato);	
				#dump($ar_proyectos_section_id,'ar_proyectos_section_id',"resultado de component_check_box::get_array_dato_from_js_dato(dato)");					
		}


		# tipo para buscar la etiqueta (definido en estructura como relacion del filter_master)		
		# Directo por velocidad
		$termino_relacionado_tipo = DEDALO_PROJECTS_NAME_TIPO;

		# Modelo del término donde buscamos los nombres (Expected: component_input_text)
		#$tipo_proyectos_related_model_name = RecordObj_dd::get_modelo_name_by_tipo($tipo_proyectos_related,true);
			#dump($tipo_proyectos_related_model_name,'$tipo_proyectos_related_model_name',"Expected: component_input_text");

		#dump($ar_proyectos_section_id,'$ar_proyectos_section_id');
		
		# ID's de las secciones (registros) de tipo proyecto (component_filter)
		$ar_proyectos_for_current_section = component_common::get_ar_records_with_lang_fallback($ar_proyectos_section_id, $termino_relacionado_tipo, DEDALO_SECTION_PROJECTS_TIPO);		
			#dump($ar_proyectos_for_current_section,'$ar_proyectos_for_current_section');

		# STATIC CACHE
		$cache_ar_proyectos_for_current_section[$this->tipo] = $ar_proyectos_for_current_section;
		#$_SESSION['dedalo4']['config']['ar_proyectos_for_current_section'][DEDALO_DATA_LANG] = $ar_proyectos_for_current_section;

		if(SHOW_DEBUG) {
			#$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, to_string(array_keys($ar_proyectos_for_current_section)) );
			global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_OUT_'.$this->tipo.'_'.microtime(1)]=microtime(1);
		}

		#dump($ar_proyectos_for_current_section,'$ar_proyectos_for_current_section');

		return $ar_proyectos_for_current_section;
	}




	/**
	* PROPAGATE AREAS TO PROJECTS (SAVE COMPOSED DATA TO MATRIX)
	* Receive array of areas (checkboxes) from edit section 'Users' page
	* and rebuild data of current user projects
	* If new array of areas is minor than previous, remove proyects associated
	* to removed areas 
	* Only aplicable in context: Editing User
	* Nothing will be done when we are in context: Editing Projects
	*
	* @param $ar_areas_to_save
	*	Array of areas format:
	*		[dd321] => 2,[dd294-admin] => 2,[dd294] => 2 ..	
	*	to save in matrix db. 
	*	Note that the checkbox that no contain value will not be saved and area not in this value
	* @param $parent
	*	Section id matrix of current record. Equivalent to userID matrix (when edit Users)
	*
	*/
	public static function propagate_areas_to_projects_DEPERECATED($ar_areas_to_save, $parent, $parent_section_tipo) {
		#dump($ar_areas_to_save, 'ar_areas_to_save', array()); return true;
		# Verify if we are in 'Users' section or 'Projects' section
		# Create a section with parent id and search children by modelo_name=component_security_access			
			#$section_obj = section::get_instance($parent,$parent_section_tipo);
			#$ar_children_objects_by_modelo_name_in_section = $section_obj->get_ar_children_objects_by_modelo_name_in_section('component_filter_master');	
				#dump($ar_children_objects_by_modelo_name_in_section,'$ar_children_objects_by_modelo_name_in_section',"modelo $modelo_name_required , parent:$parent");

			$ar_children_component_filter_master = section::get_ar_children_tipo_by_modelo_name_in_section($parent_section_tipo, 'component_filter_master', $from_cache=true);
				#dump($ar_children_component_filter_master, 'ar_children_component_filter_master', array());

			# Si no se encuentra el elemento hijo de tipo 'component_filter_master' paramos ya que estaremos editando proyectos y no debemos propagar nada.
			if(empty($ar_children_component_filter_master)) {
				
				# Editing 'PROJECTS'
				# Nothing to do
				return NULL;

			}else{

				# Editing 'USERS'
				# En este objeto (usualmente de tipo 'dd170') están los datos actuales de proyectos del usuario recibido ($parent) 
				# ejemplo: 
				# [dato:protected] => Array
		        # (
		        #    [250] => 2
		        #    [803] => 2
		        # )
		        # Obtenemos el componente de tipo 'component_filter_master'
				#$component_filter_master_obj = $ar_children_objects_by_modelo_name_in_section[0];
				$component_filter_master_tipo = $ar_children_component_filter_master[0];
			}

		# Verification
		if(empty($ar_areas_to_save) || !is_array($ar_areas_to_save)) throw new Exception("Error Processing Request: ar_areas_to_save is empty!", 1);
		
		$user_id 	= $parent;

		# Convert '$ar_areas_to_save' array to simple array
		# with only 'estado=2' areas
		$ar_projects_authorized = array();
		$ar_areas_authorized 	= array();
		foreach ($ar_areas_to_save as $tipo => $estado) {
			if ((int)$estado>=1) $ar_areas_authorized[] = $tipo;
		}

		
		#
		# 1 Buscamos TODOS los proyectos existentes y sus areas de actuación
			/*
			# Resolvemos el tipo del elemento 'component_filter_master' de la sección del usuario actual creada arriba
			$tipo_proyectos				= DEDALO_FILTER_MASTER_TIPO;	# Fixed dd170  	# $component_filter_master_tipo;
				#dump($tipo_proyectos, 'tipo_proyectos '.DEDALO_FILTER_MASTER_TIPO);
			*/
			/*
			# Resolvemos el tipo del elemento 'component_input_text' relacionado con el (es un puntero a el elmento correspondiente de la sección Proyectos)
			$ar_tipo_proyectos_related	= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($tipo_proyectos, $modelo_name='component_input_text', $relation_type='termino_relacionado');	
			
			if(empty($ar_tipo_proyectos_related))
				throw new Exception(__METHOD__ ." Error: Children (model component_security_areas) of User ($user_id) not found in structure!");
			else
				$tipo_proyectos_related = $ar_tipo_proyectos_related[0];
			*/
			/*
			# Modo directo dd153
			$tipo_proyectos_related = DEDALO_SECTION_PROJECTS_TIPO; # Fixed dd153
			*/
			/*
			# Como ya tenemos el tipo del elemento 'Proyecto (nombre)' en proyectos, despejamos su parent section 'Proyectos' usualmente 'dd153'
			$ar_section_tipo	= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($tipo_proyectos, $modelo_name='section', $relation_type='parent');
				dump($ar_section_tipo, '$ar_section_tipo', array()); #DEDALO_SECTION_USERS_TIPO
			
			if(empty($ar_section_tipo))
				throw new Exception(__METHOD__ ." Error: parent (model section) of tipo ($tipo_proyectos_related) not found in structure!");
			else
				$section_proyectos_tipo = $ar_section_tipo[0];
			*/
			# Modo directo
			#$section_proyectos_tipo = DEDALO_SECTION_USERS_TIPO; # Fixed dd128

			# Buscamos TODOS los registros del tipo de la sección proyectos (usualmente 'dd153')
			$arguments=array();
			#$arguments["datos#>>'{section_tipo}'"]	= DEDALO_SECTION_PROJECTS_TIPO;	#dump($section_proyectos_tipo, 'section_proyectos_tipo '.$tipo_proyectos_related, array());
			$arguments["section_tipo"]				= DEDALO_SECTION_PROJECTS_TIPO;
			#$matrix_table 							= common::get_matrix_table_from_tipo($section_proyectos_tipo);		
			$matrix_table 							= 'matrix_projects'; # Fixed always matrix_projects
			$JSON_RecordObj_matrix					= new JSON_RecordObj_matrix($matrix_table,NULL,DEDALO_SECTION_PROJECTS_TIPO);
			$ar_records								= $JSON_RecordObj_matrix->search($arguments);
				#dump($ar_records, 'ar_records '.$matrix_table, $arguments);

			$ar_all_proyectos_id 			= $ar_records;
				#error_log( dump($ar_all_proyectos_id,'$ar_all_proyectos_id'," para section_proyectos_tipo: $section_proyectos_tipo") );

		#
		# 2 Recorremos TODOS los proyectos, almacenado los que estén guardados en el registro del usuario y tengan áreas existentes en '$ar_areas_authorized'
		/*
			if (is_array($ar_all_proyectos_id)) foreach ($ar_all_proyectos_id as $proyecto_id_matrix) {

				#$current_tipo = common::get_tipo_by_id($proyecto_id_matrix,$table='matrix');
				#$current_tipo = component_common::get_section_tipo_from_component_tipo($this->tipo); # Ver de resolver por estructura en lugar de por matrix !!!!!!!!!!!!!!!!!!!!!!!!!!!! <<<<<<<<<
				
				# Creamos la sección proyectos y buscamos su componente de tipo 'component_security_areas'						
				#$project_obj 						= section::get_instance($proyecto_id_matrix, DEDALO_SECTION_PROJECTS_TIPO);
				#$ar_children_objects_by_modelo_name = $project_obj->get_ar_children_objects_by_modelo_name_in_section('component_security_areas');
				#	dump($ar_children_objects_by_modelo_name, 'component_security_areas', array());
				#
				#if(empty($ar_children_objects_by_modelo_name))
				#	throw new Exception(__METHOD__ ." Error: ar_children_objects_by_modelo_name (model component_security_areas) of id ($proyecto_id_matrix) not found in matrix!");
				#else
				#	$component_security_areas_obj = $ar_children_objects_by_modelo_name[0];
			
				$component_security_areas_obj = component_common::get_instance('component_security_areas',DEDALO_COMPONENT_SECURITY_AREAS_PROJECTS_TIPO,$proyecto_id_matrix,'edit',DEDALO_DATA_NOLAN);	#($component_name, $tipo, $parent=NULL, $modo='edit', $lang=DEDALO_DATA_LANG)

				$ar_areas_of_this_section = (array)$component_security_areas_obj->get_dato();
					#error_log( dump($ar_areas_of_this_section,'$ar_areas_of_this_section'," para proyecto_id_matrix: $proyecto_id_matrix") );

				# Recorremos las áreas de este proyecto y cotejamos las que tienen estado 2 con las autorizadas recibidas ($ar_areas_authorized) 
				foreach ($ar_areas_of_this_section as $tipo => $estado) {
					
					if($estado==2) {
						# Si son estado=2 y están en el array de las áreas salvadas, incluimos este proyecto
						# en el array final, dejando fuera los proyectos que no coincidan:
						# Esos proyectos serán los que teníamos checkeados anteriormente en áreas a las que ya no
						# tenemos acceso y por tanto serán excluidos del array final
						if (in_array($tipo, $ar_areas_authorized)) {
							# Si no existe ya, lo añadimos
							if (!in_array($proyecto_id_matrix, $ar_projects_authorized)) $ar_projects_authorized[] = $proyecto_id_matrix;						
						}							
					}
				}
			}
			#error_log( dump($ar_projects_authorized,'$ar_projects_authorized'," ") );
		*/
		

		#
		# 3 Guardamos el resultado en el dato matrix del usuario editado (sobre-escribiendo los datos anteriores)

			# Creamos la sección usuarios y buscamos su componente de tipo 'component_filter_master'
			/*				
			$usuario_section_obj 		= section::get_instance($user_id, DEDALO_SECTION_USERS_TIPO);
			$ar_component_filter_master = $usuario_section_obj->get_ar_children_objects_by_modelo_name_in_section('component_filter_master');

			if(empty($ar_component_filter_master))
				throw new Exception(__METHOD__ ." Error: ar_children_objects_by_modelo_name (model component_filter_master) of id ($parent) not found in matrix!");
			else
				$component_filter_master_obj = $ar_component_filter_master[0];
			*/
			$component_filter_master_obj = component_common::get_instance('component_filter_master',DEDALO_FILTER_MASTER_TIPO, $user_id, 'edit', DEDALO_DATA_NOLAN, DEDALO_SECTION_USERS_TIPO);	#($component_name, $tipo, $parent=NULL, $modo='edit', $lang=DEDALO_DATA_LANG)


			# Obtenemos sus datos actuales
			$id 							= $component_filter_master_obj->get_parent();
			$tipo_component_filter_master 	= $component_filter_master_obj->get_tipo();
			$dato_actual 					= (array)$component_filter_master_obj->get_dato();
			#error_log( dump($dato_actual,'$dato_actual') );

			# Recorremos sus proyectos actualizados actualmente comparándolos con los autorizados calculados antes
			# Los que no estén dentro de ese grupo ($ar_projects_authorized) serán excluidos
			$ar_pr_final = array();
			foreach ($dato_actual as $pr_id => $estado) {
				if (in_array($pr_id, $ar_projects_authorized)) {
					$ar_pr_final[$pr_id] = 2;
				}
			}

			# Save updated component
			$component_filter_master_obj->set_dato($ar_pr_final);
			$component_filter_master_obj->Save();

			#error_log( dump($ar_projects_authorized,'ar_projects_authorized'," 1 ") );
			#error_log( dump($ar_pr_final,'ar_pr_final'," 2 ") );

		return true;
	}




	# GET_STATS_VALUE
	public static function get_stats_value( $tipo, $ar_value ) {

		#dump($ar_value,'ar_value');

		if(!isset($stats_value))
		static $stats_value;
		/**/
		if( !is_array($ar_value) ) $ar_value = array('' => 1 );

		foreach ($ar_value as $key => $value) {

			if(!isset($stats_value[$tipo][$key])) $stats_value[$tipo][$key] = 0;

			$stats_value[$tipo][$key] = $stats_value[$tipo][$key] + 1;
		}
		
		#dump($stats_value,'$stats_value');
		return $stats_value[$tipo];
	}

	# GET_STATS_VALUE_RESOLVED
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
		
		#dump($relacionados,'$relacionados');
		if(empty($relacionados)){
			return $this->lang;
		}

		$termonioID_related = array_values($relacionados[0])[0];
		$RecordObjt_dd = new RecordObj_dd($termonioID_related);

		if($RecordObjt_dd->get_traducible() =='no'){
			$lang = DEDALO_DATA_NOLAN;
		}else{
			$lang = DEDALO_DATA_LANG;
		}
		return $lang;

	}//end get_valor_lang




	/**
	* GET_SEARCH_QUERY
	* Build search query for current component . Overwrite for different needs in other components
	* @param string ..
	* @see class.section_list.php get_rows_data filter_by_search
	* @return string SQL query (ILIKE by default)
	*/
	public static function get_search_query( $json_field, $search_tipo, $tipo_de_dato_search, $current_lang, $search_value ) {
		if ( empty($search_value) ) {
			return null;
		}
		if(SHOW_DEBUG) {
			#dump($search_value, ' search_value');
		}

		if (is_array($search_value)) {
			$current_search_value = implode("','", $search_value);
		}else{
			$current_search_value = $search_value;
		}
		# datos#>'{components,oh22,dato,lg-nolan}' ?| array['1']
		#$search_query = " $json_field#>>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}' ILIKE '%$search_value%' ";
		$search_query = " $json_field#>'{components,$search_tipo,$tipo_de_dato_search,$current_lang}' ?| array['$current_search_value'] ";

		if(SHOW_DEBUG) {
			$search_query = " -- filter_by_search $search_tipo ". get_called_class() ." \n".$search_query;
		}
		return $search_query;
	}



	
}
?>