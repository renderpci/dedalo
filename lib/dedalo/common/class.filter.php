<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');
/*

	1 - Despeja el usuario logeado actual
	2 - Obtener el id matrix de los proyectos del usuario actual
	3 - Devuelve el array de id_matrix correspondientes al tipo dado con los proyectos del usuario

*/

abstract class filter {
	
	static $ar_records_unassigned ;

	# MATRIX_TABLE : Filter work always in table 'matrix'
	protected static $filter_matrix_table = 'matrix';



	/**
	* GET_SECTION_PROJECTS
	* Calcula y devuelve los proyectos del objeto pasado, ya sea componente o sección
	*/
	public static function get_section_projects($id, $tipo, $parent, $filter_by_user=TRUE) {
		
		#dump("","get_section_projects: $id, $tipo, $parent, $filter_by_user");
		if(SHOW_DEBUG) {
			$start_time = start_time();
			global$TIMER;$TIMER[__METHOD__.'_IN_'.$tipo.'_'.$parent.'_'.microtime(1)]=microtime(1);
		}

		if ($parent>0) {
			# CASE IS COMPONENT
			$section_id_matrix 	= $parent;
			$tipo_section 		= common::get_tipo_by_id($section_id_matrix, self::$filter_matrix_table);
		}else{
			# CASE IS SECTION
			$section_id_matrix 	= $id;
			$tipo_section 		= $tipo;
		}
		#dump("","get_section_projects: section_id_matrix:$section_id_matrix, tipo_section:$tipo_section"); return null;

		# No procesaremos elementos que no utilizan filtro.
		$modelo_name = RecordObj_ts::get_modelo_name_by_tipo($tipo);
		if( strpos($modelo_name, 'section')===false && strpos($modelo_name, 'component')===false) {
			return NULL;
		}
				
		$RecordObj_ts 				= new RecordObj_ts($tipo_section);	
		$ar_tipo_component_filter 	= (array)$RecordObj_ts->get_ar_terminoID_by_modelo_name_and_relation($tipo_section, $modelo_name='component_filter', 'children_recursive');

		# Array to string conversion
		if(count($ar_tipo_component_filter)<1) {
			return NULL;
			# Algo va mal..	
    		$string_error = __METHOD__ ." Error: children 'tipo_component_filter' of $tipo_section not found in structure! Please set 'Proyects' component to enable filter.";			
			throw new Exception($string_error, 1);
		}else if (count($ar_tipo_component_filter)>1 ) {
			# Como hay casos de anidamiento (procesos dentro de PCI) hay secciones con mas de 1 filtro,
			# seleccionaremos sólo el primero, aunque notificaremos el hecho
			$tipo_component_filter = $ar_tipo_component_filter[0];
			error_log("NOTICE: Section $tipo_section have ".count($ar_tipo_component_filter)." filters. Maybe this is a wrong structure config (Using first founded $tipo_component_filter)");
			/*
			$string_error = __METHOD__ ." Error: number of children 'tipo_component_filter' of $tipo_section is wrong! Please set only one 'Proyects' component ";
			if(SHOW_DEBUG) {
				dump($ar_tipo_component_filter,'$ar_tipo_component_filter founded in structure');
			}	
			throw new Exception($string_error, 1);
			*/	
		}else{
			$tipo_component_filter = $ar_tipo_component_filter[0];
		}
		

		# SECTION LIST
		# En html_page se pasan las variables tipo 'id:NULL, tipo:dd1140, parent:0, filter_by_user:1'
		# para despejar los proyectos de la sección list actual (al ser list, no tiene id)
		if ( intval($section_id_matrix)<1 ) {

			#dump($parent,'$section_id_matrix para '." id:$id, tipo:$tipo, parent:$parent, filter_by_user:$filter_by_user");
			
			#dump(filter::get_ar_filter($tipo_section),'cache_ar_filter');
			#dump(section_list::$static_ar_id_section_page,'section_list::$static_ar_id_section_page');
			#dump(count($ar_tipo_component_filter ),'$ar_tipo_component_filter ');
			$dato 		= array();
			$ar_dato 	= array();
			# Es importante pasar el tipo de la sección correctamente a 'section_list::$static_ar_id_section_page' ya que
			# es una variable estática global definida en section list y agrupada por section tipo (para separar sección 
			# principal visualizada, de sección dentro de portales)
			$static_ar_id_section_page = section_list::$static_ar_id_section_page[$tipo_section];
				#dump($static_ar_id_section_page,'$static_ar_id_section_page');

			# LIST
			# Iteramos todos los registros mostrados por el section list (recogidos en section_list::$static_ar_id_section_page[$tipo_section])
			# y agrupamos sus proyectos (los datos de su component filter)
			if(is_array($static_ar_id_section_page)) foreach ($static_ar_id_section_page as $current_id) {
				#dump($current_id,'$current_id');
				
				/**/ 
				$arguments=array();
				$arguments['parent']	= $current_id;
				$arguments['tipo']		= $tipo_component_filter;				
				$matrix_table 			= common::get_matrix_table_from_tipo($tipo_component_filter);
				$RecordObj_matrix		= new RecordObj_matrix($matrix_table,NULL);
				$ar_records				= (array)$RecordObj_matrix->search($arguments);
					#dump($ar_records,'$ar_records found for '.print_r($arguments,true));
			
				foreach ( $ar_records as $current_id) {
									
					$component_filter 	= new component_filter($current_id,$tipo_component_filter,'edit',NULL,DEDALO_DATA_NOLAN);
					$current_dato 		= $component_filter->get_dato();

					if(is_array($current_dato)) foreach ($current_dato as $current_tipo => $value) {
						$ar_dato[$current_tipo] = $value;
					}
				}
			}

			$dato = $ar_dato;
				#dump($dato,'dato');
			
		}else{
			#foreach ($ar_tipo_component_filter as $tipo_component_filter) {
				# EDIT (COMPONENTE)
				$component_filter 		= new component_filter(NULL,$tipo_component_filter,'edit',$section_id_matrix,DEDALO_DATA_NOLAN);
				$dato 					= $component_filter->get_dato();
			#}
		}
		#dump($dato,'dato - $dato');

		# Usuario logeado actualmente
		$userID_matrix	= navigator::get_userID_matrix();

		# Verificamos que el usuario logeado es administrador						
		$is_global_admin = component_security_administrator::is_global_admin($userID_matrix);

		# Cotejamos con los proyectos del usuario
		if ($filter_by_user===true && !$is_global_admin) {

			$ar_final = array();			
			$user_projects  = filter::get_user_projects($userID_matrix);
				#dump($user_projects,'$user_projects');			
			if(is_array($dato)) foreach ($dato as $key => $value) {
				$current_project_tipo = $key;
				if (is_array($user_projects) && array_key_exists($current_project_tipo, $user_projects)) {
					$ar_final[$current_project_tipo] = $value;
				}
			}
			/*
			# Si el resultados en NULL es posible que estemos creando un registro nuevo. 
			# En ese caso, por convenio, usamos todos los del usuario para evitar perder el registro al filtrar en recuperación
			if( empty($ar_final) ) {
				$ar_final = $user_projects;
					#dump($ar_final,'$ar_final');
			}
			*/
		}else{
			$ar_final = $dato;
		}


		#dump($ar_final,'get_section_projects - $ar_final '."from id:$id, tipo:$tipo, parent:$parent, filter_by_user:$filter_by_user, userID_matrix:$userID_matrix");

		if(SHOW_DEBUG) {
			$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, $ar_final);
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.$tipo.'_'.$parent.'_'.microtime(1)]=microtime(1);
		}


		return $ar_final;		
	}




	/**
	* GET_USER_PROJECTS
	* Revisada 16-05-2014
	*/
	public static function get_user_projects($userID_matrix) {
		
		if(SHOW_DEBUG) $start_time = start_time();

		# SEARCH SECTION USER TIPO
			# Busca el tipo de la sección 'Usuarios' (dd128)
			# Tenemos el id matrix del usuario logeado que es su matrix id section. A partir de el, buscamos el registro en matrix y 
			# despejamos su section tipo
			$matrix_table 			= 'matrix';
			$RecordObj_matrix		= new RecordObj_matrix($matrix_table,$userID_matrix);	#($id=NULL, $parent=false, $tipo=false, $lang=NULL, $caller_obj=NULL)					
			$tipo_user 				= $RecordObj_matrix->get_tipo();

		# Search tipo_user verify
			if(empty($tipo_user)) throw new Exception(__METHOD__ ." Error: tipo_user not found in matrix for id:$userID_matrix !");

		# SEARCH 'Proyectos (filter_master)' SECTION TIPO
			/*
			# Búsqueda de la sección 'Proyectos (filter_master)'
			# usualmente dd170
			$ar_tipo_filter_master 	= RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($tipo_user, $modelo_name='component_filter_master', $relation_type='children_recursive');
				dump($ar_tipo_filter_master,'ar_tipo_filter_master','array(dd170)');
			
			# Search results verify
			if(empty($ar_tipo_filter_master[0]))
				# Algo va mal.. tipo_filter_master ha de estar definido en la estructura
				throw new Exception(__METHOD__ ." Error: Record children of $tipo_user whith model name component_filter_master not found in structure!");
			else
				# Section Filter Master despejado 
				$tipo_filter_master = $ar_tipo_filter_master[0];			#dump($tipo_filter_master,'tipo_filter_master','actualmente dd170');
			*/
			# Modo directo
			$tipo_filter_master = DEDALO_FILTER_MASTER_TIPO;

		# OBTENEMOS EL DATO DEL REGISTRO DE MATRIX (proyectos)
			$arguments=array();
			$arguments['parent']			= $userID_matrix;
			$arguments['tipo']				= $tipo_filter_master;
			$matrix_table 					= common::get_matrix_table_from_tipo($tipo_filter_master);	
			$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
			$ar_records						= $RecordObj_matrix->search($arguments);
				#dump($ar_records, 'fired get_user_projects '.print_r($arguments,true) );

		if (isset($ar_records[0])) {
			$component_filter_master 	= new component_filter_master($ar_records[0],$tipo_filter_master,"0");
			$dato 						= $component_filter_master->get_dato();
				#dump($dato, 'dato', array());		
		}else{
			$dato = NULL;
		}

		if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, $dato);

		return $dato;
	}

	

	private static function get_filter_structure($tipo) {

		#unset($_SESSION['config4']['filter_structure'][$tipo]);
		if(isset($_SESSION['config4']['filter_structure'][$tipo])) return $_SESSION['config4']['filter_structure'][$tipo];

		 # Usuario logeado actualmente
			$userID_matrix	= navigator::get_userID_matrix();
				#dump($userID_matrix,'userID_matrix');

		# GLOBAL ADMIN. Verificamos que el usuario actual es administrador
			$is_global_admin = component_security_administrator::is_global_admin($userID_matrix);

		  # ID MATRIX DE LOS PROYECTOS (mezclar en una función con lo mismo en component_filter)	
		  # error_log("fired ar_filter for $tipo");
				
		  # SEARCH SECTION USER TIPO
		  		/*
				# Busca el tipo de la sección 'Usuarios' (dd128)
				# Tenemos el id matrix del usuario logeado que es su matrix id section. A partir de el, buscamos el registro en matrix y 
				# despejamos su section tipo
		  		$matrix_table 			= 'matrix';
		  		$RecordObj_matrix		= new RecordObj_matrix($matrix_table,$userID_matrix);	#($id=NULL, $parent=false, $tipo=false, $lang=NULL, $caller_obj=NULL)
				$tipo_user 				= $RecordObj_matrix->get_tipo();
					#dump($tipo_user,'tipo_user');			

				# Search tipo_user verify
				if(empty($tipo_user)) throw new Exception(__METHOD__ ." Error: tipo_user not found in matrix for id:$userID_matrix !");
				*/
				$tipo_user	= DEDALO_SECTION_USERS_TIPO;

			# SEARCH 'Proyectos (filter_master)' SECTION TIPO
				/*
				# Búsqueda de la sección 'Proyectos (filter_master)'
				# usualmente dd170
				$RecordObj_ts = new RecordObj_ts($tipo_user);	
				$tipo_filter_master = $RecordObj_ts->get_ar_terminoID_by_modelo_name_and_relation($tipo_user, $modelo_name='component_filter_master', $relation_type='children_recursive');
					#dump($tipo_filter_master,'tipo_filter_master','array(dd170)');

				# Search results verify
				if(empty($tipo_filter_master[0]))
					# Algo va mal.. tipo_filter_master ha de estar definido en la estructura
					throw new Exception(__METHOD__ ." Error: Record children of $tipo_user whith model name component_filter_master not found in structure!");
				else
					# Section Filter Master despejado 
					$tipo_filter_master = $tipo_filter_master[0];			dump($tipo_filter_master,'tipo_filter_master','actualmente dd170');
				*/
				$tipo_filter_master = DEDALO_FILTER_MASTER_TIPO;

			# SEARCH TERMINOS RELACIONADOS DE tipo_filter_master
				
				# Buscamos 'Proyecto (nombre)' que es un término relacionado (el único) del elemento tipo_filter_master
				# y hace de puntero para indicarnos dónde debemos buscar realmente el nombre del proyecto
				$RecordObj_ts 			  = new RecordObj_ts($tipo_filter_master);
				$ar_terminos_relacionados = $RecordObj_ts->get_ar_terminos_relacionados($tipo_filter_master, $cache=true, $simple=true);
					#dump($ar_terminos_relacionados,'ar_terminos_relacionados',"términos relacionados de tipo filter_master ($tipo_filter_master) , (proyectos por areas)");

				# Search results verify
				if(empty($ar_terminos_relacionados[0]))
					# Algo va mal..
					throw new Exception(__METHOD__ ." Error: Record related terms of $tipo_filter_master not founded in structure!");
				else
					# Puntero donde buscar el nombre del proyecto despejado (actualmente dd156) 
					$termino_relacionado_tipo = $ar_terminos_relacionados[0];	# <----- TIPO PROYECTO raiz			
						#dump($termino_relacionado_tipo,'$termino_relacionado_tipo',"Puntero donde buscar el nombre del proyecto despejado (actualmente dd156)");
				
			# SEARCH TIPO DE LA SECCIÓN PADRE DEL PUNTERO
				$section_tipo_proyectos = $RecordObj_ts->get_ar_terminoID_by_modelo_name_and_relation($termino_relacionado_tipo, $modelo_name='section', $relation_type='parent');
					#dump($section_tipo_proyectos,'section_tipo_proyectos',"Search tipo de la sección padre del puntero (actualmente dd153)");

				# Search results verify
				if(empty($section_tipo_proyectos[0])) {
					# Algo va mal..
					throw new Exception(__METHOD__ ." Error: Parent (model section) of $termino_relacionado_tipo not found in structure!");
				}else{
					# Tipo de la sección padre del puntero (actualmente dd153)
					$section_tipo_proyectos = $section_tipo_proyectos[0];		# <----- TIPO SECCION PROYECTO			
						#dump($section_tipo_proyectos,'section_tipo_proyectos',"Tipo de la sección padre del puntero ($termino_relacionado_tipo) (actualmente dd153)");
				}

			##
			# TIPO DONDE TENEMOS QUE BUSCAR EN LA SECCION
			# Es común para todos excepto para proyectos donde se calcula en función de las areas
			##
			$tipo_component_filter = NULL;
			if($tipo!=$section_tipo_proyectos) {
				
				#$RecordObj_ts 				= new RecordObj_ts($tipo);	
				$ar_tipo_component_filter 	= RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($tipo, $modelo_name='component_filter', $relation_type='children_recursive');


				# Array to string conversion
				if(empty($ar_tipo_component_filter[0])) {
					#return NULL;
					# Algo va mal..	
	        		$string_error = __METHOD__ ." Error: children 'tipo_component_filter' of $tipo not found in structure! Please set 'Proyects' component to enable filter to this section.";			
					#throw new Exception($string_error, 1);
					trigger_error($string_error);				
				}else{
					$tipo_component_filter = $ar_tipo_component_filter[0];									
						#dump($tipo_component_filter ,'$tipo_component_filter',"tipo donde tenemos que buscar en la seccion (modelo component_filter) ejemplo dd61 en Historia Oral");
				}	
			}
				/**/
				# PROYECTOS QUE ESTE USUARIO TIENE HABILITADOS : Buscamos en matrix el dato del campo proyectos de este usuario
				if($is_global_admin===true) {
					$ar_proyectos = array();
				}else{
					# PROJECTS : FIND FILTER MASTER RECORD OF CURRENT USER
					# NOTA: Los datos de usuario están SIEMPRE en la tabla 'matrix' definida como propiedad de esta clase (self::$filter_matrix_table), salvo que se cambie la política al respecto.
					$arguments=array();								
					$arguments['parent']			= $userID_matrix;
					$arguments['tipo']				= $tipo_filter_master;
					#$arguments['lang']				= DEDALO_DATA_NOLAN;
					$matrix_table 					= common::get_matrix_table_from_tipo($tipo_filter_master);
					$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
					$ar_records						= $RecordObj_matrix->search($arguments);					
						#dump($ar_records,'ar_records',"array de registros de este usuario ($userID_matrix) y este tipo ($tipo_filter_master - Proyectos (filter_master)) table:$matrix_table");

					# Array to string conversion
					if(empty($ar_records[0])) {
						$ar_proyectos = array();
						#return NULL;
						#throw new Exception("Error Processing Request: Projects : find filter master record of current user", 1);						
					}else{						
						# PROJECTS : DATO
						# array id matrix de los proyectos
						$id 				= $ar_records[0];
						$matrix_table 		= common::get_matrix_table_from_tipo($tipo_filter_master);
						$RecordObj_matrix	= new RecordObj_matrix($matrix_table,$id);

						# DATO array id matrix de los proyectos
						$ar_proyectos 		= $RecordObj_matrix->get_dato();
							#dump($ar_proyectos,"dato de matrix id: $id ", "array de proyectos accesibles para este usuario ($userID_matrix)");
					}				
				}				
				

			$filter_structure['tipo_user'] 				= $tipo_user;
			$filter_structure['tipo_filter_master'] 	= $tipo_filter_master;
			$filter_structure['section_tipo_proyectos'] = $section_tipo_proyectos;
			$filter_structure['tipo_component_filter'] 	= $tipo_component_filter;
			$filter_structure['ar_proyectos'] 			= $ar_proyectos;

			# SESSION FILTER_STRUCTURE : Guardamos el resultado una vez por sesión
			$_SESSION['config4']['filter_structure'][$tipo] 	= $filter_structure;

		return $filter_structure;
	}



	/**
	* GET AR PROYECTOS SECTION ID MATRIX
	*	A partir del tipo de la sección, calcula el array de registros (section id matrix) que el usuario actual puede ver
	* @param $tipo (tipo de la sección. ejemplo dd12 para Historia Oral)
	*	tipo like 'dd124'
	*
	* @return $ar_proyectos_section_id
	*	matrix id array of records filter by received tipo
	* 
	*/
	public static function get_ar_filter($tipo=null) {
		
		if(SHOW_DEBUG) {
			$start_time = start_time();
			#global$TIMER;$TIMER[__METHOD__.'_IN_'.$tipo.'_'.$parent.'_'.microtime(1)]=microtime(1);
			#dump($tipo,'get_ar_filter tipo');
		}		
		
		if (empty($tipo)) {
			#if(SHOW_DEBUG)
			throw new Exception("ar_filter: received tipo has not 'tipo' available [$tipo]", 1);
		}


		# Usuario logeado actualmente
		$userID_matrix 				= navigator::get_userID_matrix();
			#dump($userID_matrix,'userID_matrix');
			if(empty($userID_matrix)) throw new Exception("Error Processing Request: userID_matrix not defined", 1);
		

			# STATIC CACHE
			static $cache_ar_filter;
			if( isset($cache_ar_filter[$tipo]) ) {			
				return $cache_ar_filter[$tipo];
			}
			# DEDALO_CACHE_MANAGER : get_ar_filter_cache		
			if( DEDALO_CACHE_MANAGER && CACHE_FILTER ) {
				$cache_key_name = filter::get_filter_key_name($tipo,$userID_matrix);
				if( cache::exists($cache_key_name) ) {
					#if(SHOW_DEBUG) dump($cache_key_name,"cache_key_name returned ".exec_time($start_time) );
					return unserialize(cache::get($cache_key_name));
				}
			}
		
		# Nota: aunque lo despejamos, de momento NO usaremos '$matrix_table' en este método. Todas las consultas del filtro serán a la tabla por defecto ('matrix')
		# Para los elemento que no usen esta tabla, desactivar el filtro
		#$matrix_table = $caller_obj->get_matrix_table();	#dump($matrix_table,'$matrix_table');
		$matrix_table = self::$filter_matrix_table;	

		
		
		# FILTER_STRUCTURE : Calculamos la estructura del filtro
		$filter_structure = filter::get_filter_structure($tipo);

			$tipo_user 				= $filter_structure['tipo_user'];
			$tipo_filter_master 	= $filter_structure['tipo_filter_master'];
			$section_tipo_proyectos = $filter_structure['section_tipo_proyectos'];
			$tipo_component_filter 	= $filter_structure['tipo_component_filter'];
				#dump($filter_structure,'filter_structure');


		# Verificamos que el usuario logeado es administrador						
		$is_global_admin = component_security_administrator::is_global_admin($userID_matrix);
		
		#
		# SWITCH CASES
		#
			switch (true) {

				# USERS #################################
				case ($tipo==$tipo_user): # EDITING USERS

						# ESTAMOS EN SECCION USUARIOS	
						# Si la sección actual es igual al tipo del usuario, estamos en usuarios y el filtro se aplica 
						# de forma distinta: con las areas en lugar de con los proyectos				
						

						$ar_users_id_final = array();
						if ($is_global_admin===true) {

							# SI SOMOS ADMINISTRADORES GLOBALES. DEVOLVEMOS TODOS LOS REGISTROS DE USUARIOS

								$arguments=array();
								$arguments['parent']			= '0';
								$arguments['tipo']				= $tipo_user;
								#$arguments['lang']				= DEDALO_DATA_NOLAN;
								$matrix_table 					= common::get_matrix_table_from_tipo($tipo_user);
								$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
								$ar_records						= $RecordObj_matrix->search($arguments);

								$ar_users_id_final = $ar_records;			
									#dump($ar_users_id_final,'ar_users_id_final '.$matrix_table,$arguments);
						}else{

							# NO SOMOS ADMINISTRADORES. DEVOLVEMOS TODOS LOS REGISTROS DE USUARIOS MENOS LOS QUE SON ADMIN GENERAL

							# Buscamos el elemento de modelo component_security_areas hijo de la sección 'Usuarios' en la estructura 
							$RecordObj_ts = new RecordObj_ts($tipo_user);
							$tipo_component_security_areas = $RecordObj_ts->get_ar_terminoID_by_modelo_name_and_relation($tipo_user, $modelo_name='component_security_areas', $relation_type='children_recursive');
								#dump($tipo_component_security_areas,'tipo_component_security_areas',"tipo de 'Usuarios->Acceso a áreas' modelo component_security_areas usualmente dd240");

							# Search results verify
							if(empty($tipo_component_security_areas[0]))
								# Algo va mal..
								throw new Exception(__METHOD__ ." Error: Children (model component_security_areas) of Users ($tipo_user) not found in structure!");
							else
								# Sobreescribimos tipo_filter_master con tipo_component_security_areas despejado
								$tipo_filter_master = $tipo_component_security_areas[0];


							# Buscamos en matrix el registro con parent=userID_matrix y tipo=tipo_component_security_areas
							# En el campo 'dato' estará el array de areas a las cuales este usuario puede acceder
								$arguments=array();
								$arguments['parent']			= $userID_matrix;
								$arguments['tipo']				= $tipo_filter_master;
								$arguments['lang']				= DEDALO_DATA_NOLAN;
								$matrix_table 					= common::get_matrix_table_from_tipo($tipo_filter_master);
								$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
								$ar_records						= $RecordObj_matrix->search($arguments);				
									#dump($ar_records,'ar_records',"busqueda de id matrix con parent:$userID_matrix, tipo:$tipo_filter_master donde está el dato de las areas accesibles a este usuario:$userID_matrix ");

								# Search results verify
								if(empty($ar_records[0]))
									# Algo va mal..
									throw new Exception(" No hay registros en matrix con el parent=$userID_matrix y el tipo=$tipo_filter_master");
								else
									# id matrix del registro despejado
									$id = $ar_records[0];

								$matrix_table 			= common::get_matrix_table_from_tipo($tipo_filter_master);
								$RecordObj_matrix		= new RecordObj_matrix($matrix_table,$id);
								$dato 					= $RecordObj_matrix->get_dato();		
									#dump($dato,'dato',"array de areas=>acceso obtenidos del campo dato en el registro id matrix:$id ");

								# Result dato verify
								if(!is_array($dato)) throw new Exception("The current user has no any authorized area!");

							# Recorremos todas las áreas existentes en el campo dato del usuario actual (son sus areas autorizadas)
							# Seleccionamos las que son de tipo -admin
								$ar_area_tipo = array();
								if(is_array($dato)) foreach ($dato as $area_tipo => $estado) {
									
									if( strpos($area_tipo,'-admin') !== false && $estado==2) 
										$ar_area_tipo[] = substr($area_tipo, 0,strpos($area_tipo,'-admin'));	#echo "<br> $tipo - $estado";									
								}
									#dump($ar_area_tipo,'ar_area_tipo',"limpieza del array de areas dejando SÓLO las areas de tipo admin como (dd125-admin) ");

								# Result verify
								if(empty($ar_area_tipo)) throw new Exception("The current user ($userID_matrix) has no authorized admin areas (ddxx-admin) !");

								# Buscamos en matrix registros parent con tipo=tipo_filter_master (tipo_component_security_areas en este caso) y dato=area_tipo
								# area_tipo se busca como dato:json ya que forma parte de un array json como '{"dd122":"2","dd98":"1"}'
								$ar_users_id = array();
								foreach ($ar_area_tipo as $area_tipo) {
									
									$arguments=array();
									$arguments['strPrimaryKeyName']	= 'parent';
									$arguments['tipo']				= $tipo_filter_master;
									$arguments['dato:json']			= $area_tipo;
									$matrix_table 					= common::get_matrix_table_from_tipo($tipo_filter_master);					
									$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
									$ar_records						= $RecordObj_matrix->search($arguments);	
									$ar_users_id 					= array_merge($ar_users_id, $ar_records);
								}
								$ar_users_id 		= array_unique($ar_users_id);										
									#dump($ar_users_id,'ar_users_id',"array de users id: recorremos el array de areas-admin buscando el parent con tipo=$tipo_filter_master y dato:json=cada area_tipo iterada");


							# Recorremos todos los registros filtrando los que no se han de mostrar (los de usuarios globales)
							foreach ($ar_users_id  as $id) {

								# Verificamos que el usuario actual iterado es administrador						
								$current_is_global_admin = component_security_administrator::is_global_admin($id);

								if ($current_is_global_admin!=true) {
									
									# No es administrador general. Lo añadimos al array final de resultados
									$ar_users_id_final[] = $id;
								}

							}//end foreach
								#dump($ar_users_id,'ar_users_id');
						}						
						
						$ar_matrix_section_records = $ar_users_id_final ;
						break;
						

				# PROJECTS ##############################################
				case ($tipo==$section_tipo_proyectos): # EDITING PROJECTS
						
						# ESTAMOS EN SECCION PROYECTOS
						# Buscamos en la estructura de proyectos el elemento de modelo 'component_security_areas'
						# Lo buscamos primero porque lo usaremos luego (tanto si somos global admin como administradores normales) para 
						# rescatar los registros no asignados
						# Projects: Search tipo of children 'component_security_areas' in structure->projects
							$RecordObj_ts = new RecordObj_ts($section_tipo_proyectos);
							$ar_component_security_areas = $RecordObj_ts->get_ar_terminoID_by_modelo_name_and_relation($section_tipo_proyectos,'component_security_areas',$relation_type='children_recursive');
								#dump($ar_component_security_areas,'ar_component_security_areas',"usually dd243  Area del proyecto modelname: component_security_areas");

							# Array to string conversion
							if(empty($ar_component_security_areas[0]))
								#return NULL;
								# Algo va mal..
								throw new Exception(__METHOD__ ." Error: Children (model component_security_areas) of User ($tipo_user) not found in structure!");
							else
								$component_security_areas = $ar_component_security_areas[0];	#dump($component_security_areas,'$component_security_areas');

							# Aquí en lugar del 'tipo_component_filter' usaremos 'component_security_areas' como filtro
							# con lo que equiparamos $tipo_component_filter para luego encontrar los registro no asignados
							$tipo_component_filter = $component_security_areas;
								#dump($tipo_component_filter, 'tipo_component_filter', array());


						$ar_proyectos_id_final = array();
						if ($is_global_admin===true) {

							# Is global administrador, return ALL section projects unfiltered
								$arguments=array();
								$arguments['tipo']				= $section_tipo_proyectos;
								$arguments['parent']			= "0";
								$matrix_table 					= common::get_matrix_table_from_tipo($section_tipo_proyectos);
								$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
								$ar_records						= $RecordObj_matrix->search($arguments);

								$ar_proyectos_id_final 			= $ar_records;
									#dump($ar_proyectos_id_final,'$ar_proyectos_id_final');

						}else{

							# NO is global administrador, return section projects filtered by authorized areas

							# ESTAMOS EN SECCION PROYECTOS
							# Buscamos el hijo de modelo 'component_security_areas' para usar sus datos como filtro
							/*
							$RecordObj_ts = new RecordObj_ts($tipo_user);
							$ar_component_security_areas = $RecordObj_ts->get_ar_terminoID_by_modelo_name_and_relation($tipo_user,'component_security_areas',$relation_type='children_recursive');
								dump($ar_component_security_areas,'ar_component_security_areas',"usually dd240 Acceso a áreas modelname: component_security_areas ");

							# Array to string conversion
							if(empty($ar_component_security_areas[0])) 
								#return NULL;
								# Algo va mal..
								throw new Exception(__METHOD__ ." Error: Children (model component_security_areas) of User ($tipo_user) not found in structure!");
							else 
								$tipo_filter_master = $ar_component_security_areas[0];
							*/
							# Versión directa
							$tipo_filter_master = DEDALO_COMPONENT_SECURITY_AREAS_TIPO;

							# Search where (matrix record) is dato that contains array of authotized areas for current user
							$arguments=array();
							$arguments['parent']			= $userID_matrix;
							$arguments['tipo']				= $tipo_filter_master;
							$matrix_table 					= common::get_matrix_table_from_tipo($tipo_filter_master);
							$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
							$ar_records						= $RecordObj_matrix->search($arguments);
								#dump($ar_records,'$ar_records');

							# Array to string conversion
							if(empty($ar_records[0]))
								# No hay datos en matrix
								return NULL;
							else 
								$id = $ar_records[0];

							# matrix record dato of current array of athorized areas for this user
							$matrix_table 			= common::get_matrix_table_from_tipo($tipo_filter_master);
							$RecordObj_matrix		= new RecordObj_matrix($matrix_table,$id);
							$dato 					= $RecordObj_matrix->get_dato();
								#dump($dato,'dato');

							# Iterate and clean array of authorized areas of this user
							$ar_area_tipo = array();
							if(is_array($dato)) foreach ($dato as $area_tipo => $value) {
								
								if( strpos($area_tipo,'-admin') !== false && $value==2) $ar_area_tipo[] = substr($area_tipo, 0,strpos($area_tipo,'-admin'));
							}
							#dump($ar_area_tipo,'ar_area_tipo');
							
							
							# Projects: Search tipo of children 'component_security_areas' in structure->projects
							# Resuelto arriba por ser comun (users / global admin)

							# Iterate array of auth areas searching all records for each area
							$ar_proyectos_id_final=array();
							foreach ($ar_area_tipo as $area_tipo) {
								$arguments=array();
								$arguments['strPrimaryKeyName']	= 'parent';
								$arguments['tipo']				= $component_security_areas;
								$arguments['dato:json']			= $area_tipo;
								$matrix_table 					= common::get_matrix_table_from_tipo($component_security_areas);
								$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
								$ar_records						= $RecordObj_matrix->search($arguments);
									#dump($ar_records,'$ar_records');

								$ar_proyectos_id_final 			= array_merge($ar_proyectos_id_final, $ar_records);
							}
							$ar_proyectos_id_final = array_unique($ar_proyectos_id_final);
						}
						#dump($ar_proyectos_id_final,'ar_proyectos_id_final');

						$ar_matrix_section_records = $ar_proyectos_id_final ;
						break;


				# DEFAULT ###################################################
				default: # DEFAULT
						
						# TIPO DONDE TENEMOS QUE BUSCAR EN LA SECCION
							# Resuelto arriba para todos
						
						# SKIP FILTER
						$skip_filter = false; /* DESACTIVO
						# Comprobamos en estructura si esta sección tiene términos relacionados (se usan 'locators' para modificar su comportamiento)
						$ar_terminos_relacionados 	= RecordObj_ts::get_ar_terminos_relacionados($tipo, $cache=false, $simple=true);
							#dump($ar_terminos_relacionados,'ar_terminos_relacionados');
						# Despejamos el nombre del locator
						if( !empty($ar_terminos_relacionados) && is_array($ar_terminos_relacionados) ) foreach($ar_terminos_relacionados as $current_terminoID) {							
							$locator_name = RecordObj_ts::get_termino_by_tipo($current_terminoID);
								#dump($locator_name,'$locator_name');
							# Se usa para posibilitar el acceso a los usuarios a los registros de los portales ya que NO poseen datos de proyecto y no son filtrados
							if($locator_name=='skip_filter') {
								# Nos comportaremos como si fueramos administradores globales. El acceso ya está restringido a la sección padre de este portal, por lo
								# que si hemos llegado hasta aquí (además el usuario debe tener acceso al área del portal), deberíamos poder ver los registros
								$skip_filter = true;
							}
						}
						*/
						# TABLE 'matrix-private' LIST OF VALUES : SKIP FILTER BY PROJECTS
						if(common::get_matrix_table_from_tipo($tipo)=='matrix_dd') $skip_filter = true;

					   # GLOBAL ADMIN VE TODOS LOS REGISTROS SIN FILTRAR
						if ( $is_global_admin===true || $skip_filter===true ) {

							# SECTION : DIRECT SEARCH
							$arguments=array();
								#$arguments['parent']			= 0;				
							$arguments['tipo']				= $tipo;							
								#$arguments['lang']				= DEDALO_DATA_NOLAN;
							$arguments['sql_cache']			= true;
							$matrix_table 					= common::get_matrix_table_from_tipo($tipo);
							$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
							$ar_records						= $RecordObj_matrix->search($arguments);	

							$ar_matrix_section_records 		= $ar_records;
								#dump($ar_matrix_section_records,"ar_matrix_section_records $matrix_table ",array('start_time'=>$start_time));											

					   # USUARIO COMÚN VE RESULTADOS FILTRADOS POR PROYECTO
						}else{
							/*
							#
							# PROJECTS : FIND FILTER MASTER RECORD OF CURRENT USER
								# NOTA: Los datos de usuario están SIEMPRE en la tabla 'matrix' definida como propiedad de esta clase (self::$filter_matrix_table), salvo que se cambie la política al respecto.
								$arguments=array();								
								$arguments['parent']			= $userID_matrix;
								$arguments['tipo']				= $tipo_filter_master;
								#$arguments['lang']				= DEDALO_DATA_NOLAN;
								$matrix_table 					= common::get_matrix_table_from_tipo($tipo_filter_master);
								$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
								$ar_records						= $RecordObj_matrix->search($arguments);					
									#dump($ar_records,'ar_records',"array de registros de este usuario ($userID_matrix) y este tipo ($tipo_filter_master - Proyectos (filter_master)) table:$matrix_table");

								# Array to string conversion
								if(empty($ar_records[0])) {
									return NULL;
									#throw new Exception("Error Processing Request: Projects : find filter master record of current user", 1);						
								}else{
									$id = $ar_records[0];
								}
							#
							# PROJECTS : DATO
								# array id matrix de los proyectos
								$matrix_table 			= common::get_matrix_table_from_tipo($tipo_filter_master);
								$RecordObj_matrix		= new RecordObj_matrix($matrix_table,$id);

								# DATO array id matrix de los proyectos
								$ar_proyectos 			= $RecordObj_matrix->get_dato();
									#dump($ar_proyectos,"dato de matrix id: $id ", "array de proyectos accesibles para este usuario ($userID_matrix)");
							*/
							$ar_proyectos = $filter_structure['ar_proyectos'];
								#dump($ar_proyectos,'$ar_proyectos');
							
							# TIPO DONDE TENEMOS QUE BUSCAR EN LA SECCION
								# Resuelto arriba para todos

							# LO RECORREMOS PARA BUSCAR LOS REGISTROS COINCIDENTES PARA CADA PROYECTO
								$ar_proyectos_section_id = array();
								if(is_array($ar_proyectos)) foreach ($ar_proyectos as $id_matrix_proyecto => $estado ) {
									
									# Search records of every project
									$arguments=array();
									$arguments['strPrimaryKeyName']	= 'parent';
									$arguments['tipo']				= $tipo_component_filter;
									$arguments['dato:json']			= $id_matrix_proyecto;#.'":"2'; # buscamos un elemento de un array en json tipo {"dato_default":[{"7":"2"}]}									
									$arguments['sql_cache']			= true;
									$matrix_table 					= 'matrix';#common::get_matrix_table_from_tipo($tipo_component_filter);
									$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
									$ar_records						= $RecordObj_matrix->search($arguments);					
										#dump($ar_records,"ar_records buscando parent con tipo $tipo_component_filter y dato $id_matrix_proyecto ");

									$ar_proyectos_section_id 	= array_merge($ar_proyectos_section_id, $ar_records);
								}													
								#dump($ar_proyectos_section_id,'ar_proyectos_section_id');

							$ar_matrix_section_records = $ar_proyectos_section_id ;
								#dump($ar_matrix_section_records,'ar_matrix_section_records');
						}

						break;

			}#end switch

			
			# IMPORTANTE : Buscamos y añadimos los registros no asignados
			$ar_records_unassigned = self::get_records_unassigned($tipo, $tipo_component_filter, $userID_matrix);	
				#dump($ar_records_unassigned,'$ar_records_unassigned',"$tipo, $tipo_component_filter, $userID_matrix");
			if (!empty($ar_records_unassigned))
				$ar_matrix_section_records = array_merge($ar_matrix_section_records, $ar_records_unassigned);
			

			/*
			# Clean results
			$ar_matrix_section_records = array_unique($ar_matrix_section_records);
			*/
			
			# Sort results
			if($tipo==logger_backend_activity::$_SECTION_TIPO['tipo']) {
				rsort($ar_matrix_section_records);
			}else{
				#sort($ar_matrix_section_records);
			}
				

		# CACHE STATIC
		$cache_ar_filter[$tipo] = $ar_matrix_section_records;
		# DEDALO_CACHE_MANAGER
		if( DEDALO_CACHE_MANAGER && CACHE_FILTER ) {
			cache::set($cache_key_name, serialize($ar_matrix_section_records));
		}

		if(SHOW_DEBUG) {
			$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__,  " tipo:$tipo - ".count($ar_matrix_section_records) .' records' );
			#$TIMER[__METHOD__.'_OUT_'.$tipo.'_'.$parent.'_'.microtime(1)]=microtime(1);
		}
			#dump(exec_time($start_time, __METHOD__));
			#dump($ar_matrix_section_records, "ar_matrix_section_records");
			#print_r($ar_matrix_section_records);echo"<br>";

		// Initialize the array with a fixed length
		#return SplFixedArray::fromArray($ar_matrix_section_records, true);



		return $ar_matrix_section_records;

	}#end get_ar_filter
	



	# GET_AR_FULL_FILTER_BY_USER
	public static function get_ar_full_filter_by_user($userID_matrix) {

		if(SHOW_DEBUG) $start_time = start_time();

		# STATIC CACHE
		static $cache_ar_full_filter_by_user;
		if( isset($cache_ar_full_filter_by_user[$userID_matrix]) ) return $cache_ar_full_filter_by_user[$userID_matrix];
		
			

		# SEARCH SECTION USER TIPO
			# Busca el tipo de la sección 'Usuarios' (dd128)
			# Tenemos el id matrix del usuario logeado que es su matrix id section. A partir de el, buscamos el registro en matrix y 
			# despejamos su section tipo
	  		$matrix_table 			= 'matrix';
	  		$RecordObj_matrix		= new RecordObj_matrix($matrix_table,$userID_matrix);	#($id=NULL, $parent=false, $tipo=false, $lang=NULL, $caller_obj=NULL)	  		
			$tipo_user 				= $RecordObj_matrix->get_tipo();	#dump($RecordObj_matrix);

		# SEARCH 'Proyectos (filter_master)' SECTION TIPO
			# Búsqueda de la sección 'Proyectos (filter_master)'
			# usualmente dd170
			$tipo_filter_master = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($tipo_user, $modelo_name='component_filter_master', $relation_type='children_recursive');
				#dump($tipo_filter_master,'tipo_filter_master','array(dd170)');

			# Search results verify
			if(empty($tipo_filter_master[0]))
				# Algo va mal.. tipo_filter_master ha de estar definido en la estructura
				throw new Exception(__METHOD__ ." Error: Record children of $tipo_user whith model name component_filter_master not found in structure!");
			else
				# Section Filter Master despejado 
				$tipo_filter_master = $tipo_filter_master[0];			#dump($tipo_filter_master,'tipo_filter_master','actualmente dd170');

		#
		# PROJECTS : FIND FILTER MASTER RECORD OF CURRENT USER
			# NOTA: Los datos de usuario están SIEMPRE en la tabla 'matrix' definida como propiedad de esta clase (self::$filter_matrix_table), salvo que se cambie la política al respecto.
			$arguments=array();
			$arguments['parent']			= $userID_matrix;
			$arguments['tipo']				= $tipo_filter_master;
			$matrix_table 					= common::get_matrix_table_from_tipo($tipo_filter_master);
			$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
			$ar_records						= $RecordObj_matrix->search($arguments);					
				#dump($ar_records,'ar_records',"array de registros de este usuario ($userID_matrix) y este tipo ($tipo_filter_master - Proyectos (filter_master)) table:$matrix_table");

			# Array to string conversion
			if(empty($ar_records[0]))
				return NULL;
			else
				$id = $ar_records[0];

		#
		# PROJECTS : DATO
			# array id matrix de los proyectos
			$matrix_table 			= common::get_matrix_table_from_tipo($tipo_filter_master);
			$RecordObj_matrix		= new RecordObj_matrix($matrix_table,$id);

			# DATO array id matrix de los proyectos
			$ar_proyectos 			= $RecordObj_matrix->get_dato();
				#dump($ar_proyectos,"dato de matrix id: $id ", "array de proyectos accesibles para este usuario ($userID_matrix)");

		#
		# AR_TIPO_COMPONENT_FILTER
			/*
			$ar_tipo_component_filter_inventario 	= RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation('dd13', $modelo_name='component_filter', $relation_type='children_recursive');
			$ar_tipo_component_filter_recursos  	= RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation('dd14', $modelo_name='component_filter', $relation_type='children_recursive');

			$ar_tipo_component_filter = array_merge($ar_tipo_component_filter_inventario, $ar_tipo_component_filter_recursos);
				#dump($ar_tipo_component_filter,'$ar_tipo_component_filter');
			*/

			# AR_AUTHORIZED_SECTIONS
			$ar_authorized_sections_for_user = array();
			$ar_authorized_areas_for_user = component_security_areas::get_ar_authorized_areas_for_user($userID_matrix, $simple_array=true);
			foreach ($ar_authorized_areas_for_user as $current_area_tipo) {
				$current_area_modelo_name = RecordObj_ts::get_modelo_name_by_tipo($current_area_tipo);
				if($current_area_modelo_name=='section') {
					$ar_authorized_sections_for_user[] = $current_area_tipo;
				}
			}
			#dump($ar_authorized_sections_for_user,'$ar_authorized_sections_for_user');

			$ar_tipo_component_filter = array();
			foreach ($ar_authorized_sections_for_user as $key => $authorized_section_tipo) {				
				$current_ar_tipo_component_filter = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($authorized_section_tipo, $modelo_name='component_filter', $relation_type='children_recursive');
				$ar_tipo_component_filter = array_merge($ar_tipo_component_filter, $current_ar_tipo_component_filter);
			};			
			#dump($ar_tipo_component_filter,'$ar_tipo_component_filter');

				
		# LO RECORREMOS PARA BUSCAR LOS REGISTROS COINCIDENTES PARA CADA PROYECTO
			$ar_proyectos_section_id = array();
			if(is_array($ar_proyectos)) foreach ($ar_proyectos as $id_matrix_proyecto => $estado ) {
				
				foreach ($ar_tipo_component_filter as $key => $tipo_component_filter) {

					# Search records of every project
					$arguments=array();
					$arguments['strPrimaryKeyName']	= 'parent';
					$arguments['tipo']				= $tipo_component_filter;									#dump($tipo_component_filter,'$tipo_component_filter');
					$arguments['dato:json']			= $id_matrix_proyecto;
					$matrix_table 					= common::get_matrix_table_from_tipo($tipo_component_filter);
					$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
					$ar_records						= $RecordObj_matrix->search($arguments);					
						#dump($ar_records,'ar_records',"buscando parent con tipo $tipo_component_filter y dato $id_matrix_proyecto ");

					$ar_proyectos_section_id 	= array_merge($ar_proyectos_section_id, $ar_records);
				}				
			}													
			#dump($ar_proyectos_section_id,'ar_proyectos_section_id');

			$ar_matrix_section_records = $ar_proyectos_section_id ;
				#dump($ar_matrix_section_records,'ar_matrix_section_records');			


		# Buscamos y añadimos los registros no asignados
			$ar_records_unassigned = self::get_records_unassigned(false, $tipo_component_filter, $userID_matrix);	
				#dump($ar_records_unassigned,'$ar_records_unassigned',"$tipo, $tipo_component_filter, $userID_matrix");
			if (!empty($ar_records_unassigned))
				$ar_matrix_section_records = array_merge($ar_matrix_section_records, $ar_records_unassigned);
			

			# Clean results
			$ar_matrix_section_records = array_unique($ar_matrix_section_records);
			
			# Sort results
			sort($ar_matrix_section_records);

			#dump($ar_matrix_section_records,'ar_matrix_section_records');

		# CACHE STATIC
		$cache_ar_full_filter_by_user[$userID_matrix] = $ar_matrix_section_records;

		if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__,  '' );
		dump(exec_time($start_time, __METHOD__,  '' ));
		
		return $ar_matrix_section_records;
	}



	/**
	* RECORDS WITHOUT FILTER DATA (UNASSIGNED)
	* Store static global filter var '$ar_records_unassigned' for recover in section list
	* and hilite current unassigned records
	* @param $tipo
	*	String tipo section like 'dd125'
	* @param $tipo_component_filter
	*	String tipo cmoponent_filter like 'dd226'
	* @param $userID_matrix
	*	Int received user id matrix
	*
	* @return $ar_records_unassigned
	*	Array id matrix unassigned record for received user id
	*/
	protected static function get_records_unassigned($tipo=false, $tipo_component_filter, $userID_matrix) {
		
		if(SHOW_DEBUG) {
			$start_time = start_time();
			global$TIMER;$TIMER[__METHOD__.'_IN_'.$tipo.'_'.$tipo_component_filter.'_'.microtime(1)]=microtime(1);
		}

		# Verificamos que el usuario logeado es administrador						
		$is_global_admin = component_security_administrator::is_global_admin($userID_matrix);
		if($is_global_admin===true) return null;	
		

		$ar_records_unassigned = array();

		# REGISTROS CREADOS POR ESTE USUARIO Y QUE NO TIENEN DATO DE FILTRO (PROYECTO)
		$arguments=array();
		
		if ($tipo) {
			$arguments['tipo']			= $tipo;
		}
		$arguments['parent']			= 0;		
		$arguments['dato:key-json']		= 'created_by_userID'.':'.$userID_matrix;
		$matrix_table 					= self::$filter_matrix_table;	#common::get_matrix_table_from_tipo($tipo);
		$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
		$ar_records						= $RecordObj_matrix->search($arguments);	#dump($ar_records,'$ar_records'," $userID_matrix, $tipo");

		foreach ($ar_records as $current_id_matrix) {
			# Para cada uno, verificamos si tiene definido su filtro.
			# Si no lo tiene (el filtro tiene prevalencia) entendemos
			# que es un registro de este usuario sin datos de filtrado (proyecto)								
			$arguments=array();
			$arguments['strPrimaryKeyName']	= 'dato';
			$arguments['parent']			= $current_id_matrix;
			$arguments['tipo']				= $tipo_component_filter;
			$matrix_table 					= common::get_matrix_table_from_tipo($tipo_component_filter);
			$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
			$ar_records2					= $RecordObj_matrix->search($arguments);
				#dump($ar_records2,'$ar_records2',"current_id_matrix: $current_id_matrix, tipo: $tipo_component_filter");

			if( !empty($ar_records2[0]) && strlen($ar_records2[0])>4 ) {									
				# Ya tiene asignado proyecto, por lo que no haremos nada.
				# Es posible que un administrador le haya asignado un proyecto no accesible para el usuario actual
				# aunque, el usuario actual haya creado originalmente el registro
			}else{
				# No tiene asignado proyecto. Entendemos que es un registro del actual usuario que ha olvidado asignarlo a un proyecto
				# y por tanto lo añadimos al array final para evitar perderlo
				
				#array_push($ar_records_unassigned, $current_id_matrix);
				$ar_records_unassigned[] = $current_id_matrix;
					#dump($current_id_matrix,"added record $current_id_matrix");
			}
		}
		#dump(self::$ar_records_unassigned,'ar_records_unassigned');

		# Store unasigned record to notify later to user in list
		self::$ar_records_unassigned = $ar_records_unassigned;

		
		if(SHOW_DEBUG) {
			$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__,  " tipo:$tipo - ".count($ar_records_unassigned) .' records' );
			$TIMER[__METHOD__.'_OUT_'.$tipo.'_'.$tipo_component_filter.'_'.microtime(1)]=microtime(1);
		}

		return $ar_records_unassigned;
	}



	# GET_FILTER_KEY_NAME
	# @param tipo, userID_matrix
	public static function get_filter_key_name($tipo,$userID_matrix) {
		return DEDALO_DATABASE_CONN.'_filter_'.$tipo.'_'.$userID_matrix;
	}
	# GET_AR_POSSIBLE_FILTER_KEY_NAME_FOR_TIPO
	public static function get_ar_possible_filter_key_name_for_tipo($tipo) {

		if(strlen($tipo)<3) throw new Exception("Error Processing Request. Invalid tipo ($tipo)", 1);

		$ar_possible_filter_key_name_for_tipo=array();
		# Buscamos todos los usuarios existentes en matrix
		$arguments=array();
		$arguments['parent']			= '0';
		$arguments['tipo']				= DEDALO_SECTION_USERS_TIPO;
		$matrix_table 					= 'matrix';
		$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
		$ar_records						= $RecordObj_matrix->search($arguments);

		if(empty($ar_records)) throw new Exception("Error Processing Request. Empty users result", 1);

		foreach ($ar_records as $current_userID_matrix) {
			$ar_possible_filter_key_name_for_tipo[] = filter::get_filter_key_name($tipo,$current_userID_matrix);
		}

		return $ar_possible_filter_key_name_for_tipo;
	}

}
?>