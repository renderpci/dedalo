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

	private $userID_matrix;
	public $propagate_filter = true;

	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;

	# MATRIX_TABLE
	protected static $filter_matrix_table = 'matrix';

	# Constructor
	function __construct($id=NULL, $tipo=false, $modo='list', $parent=NULL, $lang=DEDALO_DATA_NOLAN) {	#__construct($id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=NULL)
	
		#throw new Exception("COMPONENT_FILTER", 1);

		parent::__construct($id, $tipo, $modo, $parent, DEDALO_DATA_NOLAN);		#dump("","id:$id, tipo:$tipo, modo:$modo, parent:$parent");

		$this->parent = $this->get_parent();
		#dump($this,"component_filter");
	}


	public function set_dato($dato) {
		# Force array type
		parent::set_dato( (array)$dato );
	}
	public function get_dato() {
		# Force array type
		return (array) parent::get_dato();
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
				

				$section_id 	= $this->get_parent();
				$section_tipo 	= common::get_tipo_by_id($section_id, self::$filter_matrix_table);
				$section 		= new section($section_id, $section_tipo);
					#dump($section_tipo,"section tipo para section_id:$section_id");

				#dump($section,'section');
				/*
				# SECTION VIRTUAL TEST . Overwrite filter_tipo with real value if is virtual
				$section_real_tipo = $this->get_section_real_tipo();
				if($section_real_tipo!=false) {
					$filter_tipo = $section_real_tipo;
				}
				*/

				# Comprobamos si la sección padre de este componente tiene además un portal (component_portal)
				$ar_children_objects = $section->get_ar_children_objects_by_modelo_name_in_section('component_portal');
				# Si lo tiene (uno o varios) propagaremos los datos de este componente a los recursos asociados al mismo
				if(!empty($ar_children_objects)) {

					#dump($this->get_dato(),'$this->dato enviado a salvar');
					foreach ($ar_children_objects as $component_portal) {
						$component_portal->propagate_filter($this);
							#dump($component_portal,'$component_portal propagando filtro....');
					}
				}
				
			}# /if ($propagate_filter) {

			#dump($parent_save_result,'$parent_save_result for component_filter Save tipo:'.$this->tipo." parent: ".$this->parent);


		# Devolvemos el resultado del save
		return $parent_save_result;
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
			
			if( is_array($dato) && array_key_exists($id_matrix,$dato) ) {

				$ar_final[$id_matrix] = $name;
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
		if( isset($cache_ar_proyectos_for_current_section) ) return $cache_ar_proyectos_for_current_section;

		# unset($_SESSION['config4']['all_authorized_content_sections']);
		#if(isset($_SESSION['config4']['ar_proyectos_for_current_section'][DEDALO_DATA_LANG])) {
		#	return $_SESSION['config4']['ar_proyectos_for_current_section'][DEDALO_DATA_LANG];
		#}

		if(SHOW_DEBUG) {
			$start_time = start_time();
			global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_IN_'.$this->tipo.'_'.microtime(1)]=microtime(1);
		}
		
		$ar_proyectos_for_current_section = array();

		# Usuario logeado actualmente
		$userID_matrix = navigator::get_userID_matrix();							
			#dump($userID_matrix,'userID_matrix');	
		/*
		# Search
		$arguments=array();
		$arguments['strPrimaryKeyName']	= 'tipo';
		$arguments['id']				= $userID_matrix;

		# OJO : Los proyectos están siempre en 'matrix' aunque éste componente tenga los dato en 'matrix_activity'
		#$matrix_table 					= common::get_matrix_table_from_tipo(self::$filter_matrix_table);
		$matrix_table 					= self::$filter_matrix_table;

		$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
		$ar_records						= $RecordObj_matrix->search($arguments);					
			#dump($ar_records,'ar_records',"tipo de sección Usuarios normalmente dd128");

		# Array to string conversion
		if(empty($ar_records[0]))
			return NULL;
		else
			$tipo = $ar_records[0];
		*/
		$tipo = DEDALO_SECTION_USERS_TIPO;
			#dump($tipo,DEDALO_SECTION_USERS_TIPO);
		/*
		$RecordObj_ts 	= new RecordObj_ts($tipo);
		$tipo_childrens = $RecordObj_ts->get_ar_terminoID_by_modelo_name_and_relation($tipo, $modelo_name='component_filter_master', $relation_type='children_recursive');
			dump($tipo_childrens,'tipo_childrens', "tipo de 'Proyectos (component_filter_master)' normalmente dd170");

		# Array to string conversion
		if(empty($tipo_childrens[0]))
			return NULL;
		else
			$tipo_filter_master = $tipo_childrens[0];
		*/
		$tipo_filter_master = DEDALO_FILTER_MASTER_TIPO;

		# Test is_global_admin
		$is_global_admin = component_security_administrator::is_global_admin($userID_matrix);
			#dump($is_global_admin,'is_global_admin');

		if ($is_global_admin===true) {

			# SÓLO PARA ADMINISTRADORES. 
			# BYPASS EL FILTRO Y ACCEDE A TODOS LOS PROYECTOS
			
			# Resolvemos el tipo del elemento 'component_input_text' relacionado con el (es un puntero a el elmento correspondiente de la sección Proyectos)
			/*
			$ar_tipo_proyectos_related	= RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($tipo_filter_master, $modelo_name='component_input_text', $relation_type='termino_relacionado');
				
			if(empty($ar_tipo_proyectos_related)) 
				throw new Exception(__METHOD__ ."Children (model component_security_areas) of User ($userID_matrix) not found in structure!");
			
			$tipo_proyectos_related = $ar_tipo_proyectos_related[0];
				dump($tipo_proyectos_related,'$tipo_proyectos_related');
			*/
			# Directo por velocidad
			$tipo_proyectos_related = DEDALO_PROJECTS_NAME_TIPO;

			# Como ya tenemos el tipo del elemento 'Proyecto (nombre)' en proyectos, despejamos su parent section 'Proyectos' usualmente 'dd153'
			/*
			$ar_section_tipo	= RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($tipo_proyectos_related, $modelo_name='section', $relation_type='parent');
				#dump($ar_section_tipo,'ar_section_tipo');

			if(empty($ar_section_tipo))
				throw new Exception(__METHOD__ ." Error: parent (model section) of tipo ($tipo_proyectos_related) not found in structure!");
			
			$section_proyectos_tipo = $ar_section_tipo[0];
			*/
			# Directo por velocidad
			$section_proyectos_tipo = DEDALO_SECTION_PROJECTS_TIPO;

			# Buscamos TODOS los registros de parent 0 y el tipo de la sección proyectos despejado antes (usualmente 'dd153')
			$arguments=array();
			$arguments['parent']			= "0";
			$arguments['tipo']				= $section_proyectos_tipo;
			$matrix_table 					= common::get_matrix_table_from_tipo($section_proyectos_tipo);		
			$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
			$ar_records						= $RecordObj_matrix->search($arguments);	#dump($arguments,'$arguments');

			$ar_proyectos_section_id 		= $ar_records;								#dump($ar_records,'$ar_records');
			
		}else{

			# USUARIOS COMUNES. 
			# APLICA EL FILTRO Y DEVUELVE SÓLO LOS PROYECTOS AUTORIZADOS
		
			# Buscamos el array (json) del dato del registro hijo del usuario actual que es de tipo 'dd170' (component_filter_master)
			# Ahí están todos los proyectos autorizados al usuario actual, tipo '{"212":2,"250":2,"274":2,"783":2,"791":2,"803":2}'
			$arguments=array();
			$arguments['parent']			= $userID_matrix;
			$arguments['tipo']				= $tipo_filter_master;
			$matrix_table 					= common::get_matrix_table_from_tipo($tipo_filter_master);
			$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
			$ar_records						= $RecordObj_matrix->search($arguments);					
				#dump($ar_records,'ar_records',"busqueda de id con parent:$userID_matrix y tipo:$tipo_filter_master");

			# Array to string conversion
			if(empty($ar_records[0]))
				return NULL;
			else
				$id = $ar_records[0];

			#$matrix_table 			= common::get_matrix_table_from_tipo($tipo_filter_master);
			$RecordObj_matrix 		= new RecordObj_matrix($matrix_table,$id);
			$dato					= $RecordObj_matrix->get_dato();

			# array id matrix de los proyectos (convertimos el dato (json string) a array)
			#$ar_proyectos_section_id = component_common::get_array_dato_from_js_dato($dato);
				#dump($ar_proyectos_section_id,'$ar_proyectos_section_id');	
			$ar_proyectos_section_id = $dato;

			# remove array values (estado) and preserve key values (id_matrix). Convert '[250] => 2' to '250'
			if (is_array($ar_proyectos_section_id)) {
				$ar_proyectos_section_id = array_keys($ar_proyectos_section_id);	
				#dump($ar_proyectos_section_id,'ar_proyectos_section_id',"resultado de component_check_box::get_array_dato_from_js_dato(dato)");
			}			
		}


		# tipo para buscar la etiqueta (definido en estructura como relacion del filter_master)
		/*
		$ar_terminos_relacionados = $this->RecordObj_ts->get_ar_terminos_relacionados($tipo_filter_master, $cache=true, $simple=true);		
			dump($ar_terminos_relacionados,'ar_terminos_relacionados');		

		# Array to string conversion
		if(empty($ar_terminos_relacionados[0]))
			return NULL;
		else
			$termino_relacionado_tipo = $ar_terminos_relacionados[0];	# <- NOMBRE DEL PROYECTO (TIPO)	
				#dump($termino_relacionado_tipo,'$termino_relacionado_tipo');
		*/
		# Directo por velocidad
		$termino_relacionado_tipo = DEDALO_PROJECTS_NAME_TIPO;

		# Modelo del término donde buscamos los nombres (Expected: component_input_text)
		#$tipo_proyectos_related_model_name = RecordObj_ts::get_modelo_name_by_tipo($tipo_proyectos_related);
			#dump($tipo_proyectos_related_model_name,'$tipo_proyectos_related_model_name',"Expected: component_input_text");

		#dump($ar_proyectos_section_id,'$ar_proyectos_section_id');
		
		# ID's de las secciones (registros) de tipo proyecto (component_filter)
		$ar_proyectos_for_current_section = component_common::get_ar_records_with_lang_fallback($ar_proyectos_section_id, $termino_relacionado_tipo);		
			#dump($ar_proyectos_for_current_section,'$ar_proyectos_for_current_section');

		# STATIC CACHE
		$cache_ar_proyectos_for_current_section = $ar_proyectos_for_current_section;
		#$_SESSION['config4']['ar_proyectos_for_current_section'][DEDALO_DATA_LANG] = $ar_proyectos_for_current_section;

		if(SHOW_DEBUG) {
			$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, to_string(array_keys($ar_proyectos_for_current_section)) );
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
	public static function propagate_areas_to_projects($ar_areas_to_save, $parent, $parent_section_tipo) {

		# Verify if we are in 'Users' section or 'Projects' section
		# Create a section with parent id and search children by modelo_name=component_security_access		
			$section_obj 			= new section($parent,$parent_section_tipo);
			$ar_children_objects_by_modelo_name_in_section = $section_obj->get_ar_children_objects_by_modelo_name_in_section('component_filter_master');	
				#dump($ar_children_objects_by_modelo_name_in_section,'$ar_children_objects_by_modelo_name_in_section',"modelo $modelo_name_required , parent:$parent");

			# Si no se encuentra el elemento hijo de tipo 'component_filter_master' paramos ya que estaremos editando proyectos y no debemos propagar nada.
			if(empty($ar_children_objects_by_modelo_name_in_section)) {
				
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
				$component_filter_master_obj = $ar_children_objects_by_modelo_name_in_section[0];
			}

		# Verification
		if(empty($ar_areas_to_save) || !is_array($ar_areas_to_save)) throw new Exception("Error Processing Request: ar_areas_to_save is empty!", 1);
		
		$userID_matrix 	= $parent;

		# Convert '$ar_areas_to_save' array to simple array
		# with only 'estado=2' areas
		$ar_projects_authorized = array();
		$ar_areas_authorized 	= array();
		foreach ($ar_areas_to_save as $tipo => $estado) {
			if ($estado==2) $ar_areas_authorized[] = $tipo;
		}

		
		#
		# 1 Buscamos TODOS los proyectos existentes y sus areas de actuación

			# Resolvemos el tipo del elemento 'component_filter_master' de la sección del usuario actual creada arriba
			$tipo_proyectos				= $component_filter_master_obj->get_tipo();
			
			# Resolvemos el tipo del elemento 'component_input_text' relacionado con el (es un puntero a el elmento correspondiente de la sección Proyectos)
			$ar_tipo_proyectos_related	= RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($tipo_proyectos, $modelo_name='component_input_text', $relation_type='termino_relacionado');	
			
			if(empty($ar_tipo_proyectos_related))
				throw new Exception(__METHOD__ ." Error: Children (model component_security_areas) of User ($userID_matrix) not found in structure!");
			else
				$tipo_proyectos_related = $ar_tipo_proyectos_related[0];

			# Como ya tenemos el tipo del elemento 'Proyecto (nombre)' en proyectos, despejamos su parent section 'Proyectos' usualmente 'dd153'
			$ar_section_tipo	= RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($tipo_proyectos_related, $modelo_name='section', $relation_type='parent');

			if(empty($ar_section_tipo))
				throw new Exception(__METHOD__ ." Error: parent (model section) of tipo ($tipo_proyectos_related) not found in structure!");
			else
				$section_proyectos_tipo = $ar_section_tipo[0];

			# Buscamos TODOS los registros de parent 0 y el tipo de la sección proyectos despejado antes (usualmente 'dd153')
			$arguments=array();
			$arguments['tipo']				= $section_proyectos_tipo;
			$arguments['parent']			= "0";
			$matrix_table 					= common::get_matrix_table_from_tipo($section_proyectos_tipo);
			$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
			$ar_records						= $RecordObj_matrix->search($arguments);

			$ar_all_proyectos_id 			= $ar_records;
				#error_log( dump($ar_all_proyectos_id,'$ar_all_proyectos_id'," para section_proyectos_tipo: $section_proyectos_tipo") );


		#
		# 2 Recorremos TODOS los proyectos, almacenado los que estén guardados en el registro del usuario y tengan áreas existentes en '$ar_areas_authorized'

			if (is_array($ar_all_proyectos_id)) foreach ($ar_all_proyectos_id as $proyecto_id_matrix) {

				$current_tipo = common::get_tipo_by_id($proyecto_id_matrix,$table='matrix');
				
				# Creamos la sección proyectos y buscamos su componente de tipo 'component_security_areas'
				$project_obj 						= new section($proyecto_id_matrix, $current_tipo);
				$ar_children_objects_by_modelo_name = $project_obj->get_ar_children_objects_by_modelo_name_in_section('component_security_areas');

				if(empty($ar_children_objects_by_modelo_name))
					throw new Exception(__METHOD__ ." Error: ar_children_objects_by_modelo_name (model component_security_areas) of id ($proyecto_id_matrix) not found in matrix!");
				else
					$component_security_areas_obj = $ar_children_objects_by_modelo_name[0];

				$ar_areas_of_this_section = $component_security_areas_obj->get_dato();
					#error_log( dump($ar_areas_of_this_section,'$ar_areas_of_this_section'," para proyecto_id_matrix: $proyecto_id_matrix") );

				# Recorremos las áreas de este proyecto y cotejamos las que tienen estado 2 con las autorizadas recibidas ($ar_areas_authorized) 
				if(is_array($ar_areas_of_this_section)) foreach ($ar_areas_of_this_section as $tipo => $estado) {
					
					if($estado==2) {
						# Si son estado=2 y están en el array de las áreas salvadas, incluimos este proyecto
						# en el array final, dejando fuera los proyectos que no coincidan:
						# Esos proyectos serán los que teníamos checkeados anteriormente en áreas a las que ya no
						# tenemos acceso y por tanto serán excluidos del array final
						if (in_array($tipo, $ar_areas_authorized)) {
							$ar_projects_authorized[] = $proyecto_id_matrix;
						}
							
					}
				}
			}
			#error_log( dump($ar_projects_authorized,'$ar_projects_authorized'," ") );


		#
		# 3 Guardamos el resultado en el dato matrix del usuario editado (sobre-escribiendo los datos anteriores)

			# Creamos la sección usuarios y buscamos su componente de tipo 'component_filter_master'
			$current_tipo 				= common::get_tipo_by_id($userID_matrix,$table='matrix');
			$usuario_section_obj 		= new section($userID_matrix, $current_tipo);
			$ar_component_filter_master = $usuario_section_obj->get_ar_children_objects_by_modelo_name_in_section('component_filter_master');

			if(empty($ar_component_filter_master))
				throw new Exception(__METHOD__ ." Error: ar_children_objects_by_modelo_name (model component_filter_master) of id ($parent) not found in matrix!");
			else
				$component_filter_master_obj = $ar_component_filter_master[0];

			# Obtenemos sus datos actuales
			$id 							= $component_filter_master_obj->get_id();
			$tipo_component_filter_master 	= $component_filter_master_obj->get_tipo();
			$dato_actual 					= $component_filter_master_obj->get_dato();

			# Recorremos su proyectos actualizados actualmente comparándolos con los autorizados calculados antes
			# Los que no estén dentro de ese grupo ($ar_projects_authorized) serán excluidos
			$ar_pr_final = array();
			if (is_array($dato_actual)) foreach ($dato_actual as $pr_id => $estado) {
				
				if (in_array($pr_id, $ar_projects_authorized)) {
					$ar_pr_final[$pr_id] = 2;
				}
			}
			/*
			# Creamos el objeto matrix correspondiente y salvamos los datos finales
			$matrix_table 		= common::get_matrix_table_from_tipo($tipo_component_filter_master);
			$RecordObj_matrix	= new RecordObj_matrix($matrix_table,$id,$parent,$tipo_component_filter_master,DEDALO_DATA_NOLAN);	#$matrix_table=null, $id=NULL, $parent=NULL, $tipo=NULL, $lang=NULL
			$RecordObj_matrix->set_dato($ar_pr_final);

			$RecordObj_matrix->Save();
			*/

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
		
		$current_component = new $caller_component('dummy',$tipo,'stats');

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

		$label 		= RecordObj_ts::get_termino_by_tipo( $tipo ).':'.$stats_model;
		$ar_final 	= array($label => $ar_final );
			#dump($ar_final,'$ar_final');

		return $ar_final;
	}


	public static function get_stats_value_resolved_activity( $value ) {

		$caller_component = get_called_class();	
		
		#dump($current_stats_value ,'$current_stats_value ');

		$proyectos_tipo = logger_backend_activity::$_COMPONENT_PROYECTOS['tipo'] ;		
		
		$current_component = new $caller_component('dummy',$proyectos_tipo,'stats');

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


	
}
?>