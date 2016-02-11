<?php
/*
* CLASS COMPONENT SECURITY AREAS
*/


class component_security_areas extends component_common {

	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;


	# GET DATO : Format {"dd244":"2"}
	public function get_dato() {
		$dato = parent::get_dato();
		return (array)$dato;
	}

	# SET_DATO
	public function set_dato($dato) {
		parent::set_dato( (object)$dato );
	}

	
	# Override component_common method
	public function get_ar_tools_obj() {
		return NULL;
	}

	

	/**
	* SAVE OVERRIDE
	* Overwrite component_common method to set always lang to config:DEDALO_DATA_NOLAN before save
	*/
	public function Save() {

		$dato 			= (array)$this->get_dato();
		$parent 		= $this->get_parent();
		$tipo 			= $this->get_tipo();
		$section_tipo 	= $this->get_section_tipo();

		##
		# SAVE DATO
		# El estado será 1 para 'indeterminate' y 2 para 'checked'
		# Los checks de admin se guardan en formato: 'tipo-admin=>estado' como '"dd78-admin":"2"'		
			#dump($dato, "parent:$parent, section_tipo:$section_tipo"); return;
		$result = parent::Save();


		# UPDATE ACCESS AND PROYECTS
		$propagate = true;
		if( !empty($dato) && is_array($dato) && !empty($parent) && $propagate===true ) {

			##
			# PROPAGATE ACCESS PERMISSIONS FROM AUTHORIZED AREAS
			# Propagate area changes to access radiobuttons vales and Save permissions on component_security_access
			# On Save new component_security_areas data from checkboxes, all permissions access are recalculated
			# and Saved to current user matrix security_access record
			# @param $dato
			#	Array of pairs tipo=>state, like array(dd12=>2,dd135=1,..) posted by caller edit page checkboxes
			# @see component_security_access::propagate_areas_to_access
			# @return $propagate_areas_to_access (not used here)
			#	Array full (areas,sections and childrens) not used here
			#
			$propagate_areas_to_access = component_security_access::propagate_areas_to_access($dato, $parent, $section_tipo);
				#dump($propagate_areas_to_access,'propagate_areas_to_access',"array completo con hijos");			
		}

		return $result;
	}
	
	/**
	* GET TREE
	* Obtiene el arbol del menú y lo recorre creando los checkbox necesarios
	* Usa menu::get_menu_structure_html para construir la estructura base ul,li
	* que es común y lo decora con $option='create_checkbox' pasándole los argumentos
	* @param $disabled
	*	option (NULL,disabled)
	* @return $tree_html
	*	html tree (ul,li) with checkboxes
	*
	* @todo Implement this method without dependencies of menu (menu::get_menu_structure_html) !!
	* @todo Filter Admin section tree in context: Area del proyecto [dd243]
	*/
	protected function get_tree($disabled) {
		
		$start_time=microtime(true);
		
		$arguments_tree['dato'] 				= $this->get_dato();
		$arguments_tree['id'] 				 	= $this->get_id();						
		$arguments_tree['parent'] 				= $this->get_parent();
		$arguments_tree['section_tipo'] 		= $this->get_section_tipo();
		$arguments_tree['parent_tipo'] 			= $this->get_tipo();
		$arguments_tree['lang'] 				= $this->get_lang();	
		$arguments_tree['identificador_unico']	= $this->get_identificador_unico();	
		$arguments_tree['disabled']				= $disabled;		
			#dump($arguments_tree,"arguments_tree");#die();			
	
		
		# CURRENT_SECURITY_AREAS_TIPO : tipo sólo puede ser dd243 (profiles) o dd245 (usuarios)
		$current_security_areas_tipo = $this->get_tipo();
			#dump($current_security_areas_tipo," tipo in get tree");die();

		# Section
		$parent_tipo = $this->get_section_tipo();

		# Section id
		$parent = $this->get_parent();
		
		# Context : calculate current context (editing users, profiles, etc.)
		switch (true) {
			
			case ($current_security_areas_tipo==DEDALO_COMPONENT_SECURITY_AREAS_USER_TIPO):
				# We are in Users
				$arguments_tree['context']	= 'users';
				break;
					
			case ($current_security_areas_tipo==DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO):
				# We are in Profiles
				$arguments_tree['context']	= 'profiles';
				break;			
			default:
				die("Security problem detected: Current tipo is not valid ($current_security_areas_tipo)");
				break;
		}

		

		/**
		* FILTER VIEW AREAS BY CURRENT ADMIN (ONLY CAN ADMINISTER AREAS THAT HE HAVE AUTHORIZATION)
		* Get current admin user id matrix
		* Get her _ar_authorized_areas
		* Filter whith them the edited user areas (remix areas overwriting with edited user data estate)
		*/
		$user_id_logged 		= navigator::get_user_id();
		$user_id_viewed			= $parent;

		$logged_user_is_global_admin 	= component_security_administrator::is_global_admin($user_id_logged);
		if($logged_user_is_global_admin != true) {
	
			# Sólo mostraremos las que el usuario actual tiene acceso. Nunca más de esas, salvo que seamos admin global
			$ar_authorized_areas_for_user = component_security_areas::get_ar_authorized_areas_for_user($user_id_logged, $mode_result='full');
		
			#dump($ar_authorized_areas_for_user,'$ar_authorized_areas_for_user',"user $user_id_logged"); #die();

			# Ahora las remezclamos con las del usuario actual para obtener el listado final
			# Téngase en cuenta que NO podremos dar ACCESO DE ADMINISTRACIÓN a un área en la que nosotros mismos
			# no tengamos derecho de administrar
			$dato 		= $arguments_tree['dato'];
			$dato_final = array();
			if(is_array($ar_authorized_areas_for_user)) foreach ($ar_authorized_areas_for_user as $current_tipo => $estado) {
				
				# Si existe el dato específico del usuario, sobreescribimos el de su admin
				if(!empty($dato[$current_tipo])) {
					$dato_final[$current_tipo] = $dato[$current_tipo];
				}else{
					$dato_final[$current_tipo] = 0;
				}
			}
			unset($arguments_tree['dato']);
			$arguments_tree['dato'] = $dato_final ;
		}

		$tree_html = menu::get_menu_structure_html($option='create_checkbox', $arguments_tree);

		return $tree_html;
	}




	/**
	* GET ARRAY OF AUTHOTIZED AREAS FOR USER (STATIC)
	* Locate matrix record 'dato' of component_security_areas (tipo ex.dd240) from userID
	* and return your value (stored as json)
	*
	* @param $user_id
	*	Int value matrix id
	* @param $mode_result
	*	bool() default false
	*
	* @return $ar_authorized_areas
	*	mode_result->simple: Array of area tipo clean like array('dd15','dd146')
	*	mode_result->full: Array of array area tipo with '-admin' and check state like array('dd15=>2','dd15-admin=>2')
	*/
	public static function get_ar_authorized_areas_for_user__OLD($user_id, $mode_result='full', $security_areas_tipo, $section_tipo) {

		# Nota: Hay dos component_security_areas en estructura. el de usuario y el de proyecto.
		# Según se cree, se usará uno u otro al pasarlo en '$security_areas_tipo'
		# La variable '$user_id', realmente será el id matrix de la sección del proyecto en el caso en que estemos en projectos, aunque mantenemos el nombre.
		
		if ($section_tipo!=DEDALO_SECTION_USERS_TIPO) {
			debug_log(__METHOD__." Called section_tipo: $section_tipo ".to_string(), logger::DEBUG);
		}
		
		$ar_authorized_areas = array();

		if(empty($user_id)) return $ar_authorized_areas;

		#$component_security_areas = new component_security_areas($security_areas_tipo,$user_id);
		$component_security_areas = component_common::get_instance('component_security_areas',
																	$security_areas_tipo,
																	$user_id,
																	'edit',
																	DEDALO_DATA_NOLAN,
																	$section_tipo);
		$dato = (array)$component_security_areas->get_dato();
			#dump($dato,"dato - $user_id - ".$security_areas_tipo);die();		

		# $dato is one array like  [dd13-admin] => 2, [dd13] => 2, [dd355-admin] => 2,..
		# Remove elements xxx-admin by default (simple)		
		switch ($mode_result) {
			case 'simple':
				# Modo simple return an simple array excluding 'xxx-admin' and 'estado' info  
				if( is_array($dato) ) {
					foreach ($dato as $tipo => $estado) {
					if(strpos($tipo, '-admin')===false && $estado>=1){
						$ar_authorized_areas[] = $tipo;
						}
					}
				}
				break;
			case 'admin':
			#return de athotized admin areas ONLY 
				if( is_array($dato) ) {
					foreach ($dato as $tipo => $estado) {
					if(strpos($tipo, '-admin')!==false && $estado>=1){
						$tipo_clean = str_replace('-admin','', $tipo);
						$ar_authorized_areas[] = $tipo_clean;#dump($tipo,'tipo');
						}
					}
				}

			break;

			case 'full':
			default:
				# full... with admin and state
				$ar_authorized_areas = $dato;
				break;
		}


		return $ar_authorized_areas;
	}


	/**
	* GET_AR_AUTHORIZED_AREAS_FOR_USER
	* @return 
	*/
	public static function get_ar_authorized_areas_for_user($user_id, $mode_result='full') {
		
		$ar_authorized_areas = array();

		if(empty($user_id)) return $ar_authorized_areas;


		#
		# USER PROFILE
		$component_profile = component_common::get_instance('component_profile',
														  	DEDALO_USER_PROFILE_TIPO,
														  	$user_id,
														  	'edit',
														  	DEDALO_DATA_NOLAN,
														  	DEDALO_SECTION_USERS_TIPO);
		$profile_id = (int)$component_profile->get_dato();
		if (empty($profile_id)) {
			return $ar_authorized_areas;
		}

		#
		# GET PROFILE DATA
		$component_security_areas = component_common::get_instance('component_security_areas',
																	DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO,
																	$profile_id,
																	'edit',
																	DEDALO_DATA_NOLAN,
																	DEDALO_SECTION_PROFILES_TIPO);
		$dato = (array)$component_security_areas->get_dato();
			#dump($dato,"dato - $user_id - ".$security_areas_tipo);die();		

		# $dato is one array like  [dd13-admin] => 2, [dd13] => 2, [dd355-admin] => 2,..
		# Remove elements xxx-admin by default (simple)		
		switch ($mode_result) {
			
			case 'simple':
				# Modo simple return an simple array excluding 'xxx-admin' and 'estado' info  
				if( is_array($dato) ) {
					foreach ($dato as $tipo => $estado) {
					if(strpos($tipo, '-admin')===false && $estado>=1){
						$ar_authorized_areas[] = $tipo;
						}
					}
				}
				break;

			case 'admin':
				#return de athotized admin areas ONLY 
				if( is_array($dato) ) {
					foreach ($dato as $tipo => $estado) {
					if(strpos($tipo, '-admin')!==false && $estado>=1){
						$tipo_clean = str_replace('-admin','', $tipo);
						$ar_authorized_areas[] = $tipo_clean;#dump($tipo,'tipo');
						}
					}
				}
				break;

			case 'full':
			default:
				# full... with admin and state
				$ar_authorized_areas = $dato;
				break;
		}

		return $ar_authorized_areas;

	}#end get_ar_authorized_areas_for_user


	/**
	* GET ARRAY OF AUTHOTIZED ADMIN AREAS FOR USER (STATIC)
	*
	* @param $user_id
	*	Int value matrix id
	* @param $simple_array
	*	bool() default false
	*
	* @return $ar_authorized_areas
	*	simple_array->true: Array of area tipo clean like array('dd15','dd146')
	*	simple_array->false: Array of array area tipo with '-admin' and check state like array('dd15=>2','dd15-admin=>2')
	*/
	/* DEPRECATED
	static public function get_ar_authorized_admin_areas_for_user($user_id, $simple_array=false) {
		
		$ar_authorized_admin_areas = array();

		if(empty($user_id)) return $ar_authorized_admin_areas;
		
		$section_obj 		 = section::get_instance($user_id, DEDALO_SECTION_USERS_TIPO);
		$ar_children_objects = $section_obj->get_ar_children_objects_by_modelo_name_in_section($modelo_name='component_security_areas');
			#dump($ar_children_objects[0],'ar_children_objects');
		
		if(empty($ar_children_objects[0])) return false; #throw new Exception(__METHOD__ ." \nError: $modelo_name not found as children of this section of user id=$user_id  ");

		$children_object 	= $ar_children_objects[0];
		$dato 			 	= $children_object->get_dato();
			#dump($dato,'dato',"dato from $modelo_name of $user_id ");

		# $dato is one array like  [dd13-admin] => 2, [dd13] => 2, [dd355-admin] => 2,..
		# Remove elements xxx-admin by default (simple)		
		if( $simple_array===true ) {
			
			# Modo simple return an simple array excluding non 'xxx-admin'
			if( is_array($dato) ) foreach ($dato as $tipo => $estado) {
				if( strpos($tipo, '-admin')!==false && $estado==2 ) {
					$ar_authorized_admin_areas[] = substr($tipo, 0, strpos($tipo, '-admin') );
				}					
			}
			$ar_final = $ar_authorized_admin_areas;

			return $ar_final;
			
		}else{
			# Modo simple return an simple array excluding non 'xxx-admin' and 'estado' info  
			if( is_array($dato) ) foreach ($dato as $tipo => $estado) {
				if( strpos($tipo, '-admin')!==false && $estado==2 )
					$ar_authorized_admin_areas[$tipo] = $estado;
			}

			# Iterate final array
			foreach ($ar_authorized_admin_areas as $tipo => $estado) {
				
				# Sacamos tods los padres de este tipo
				$tipo = substr($tipo, 0, strpos($tipo, '-admin') );
				# Sacamos todos su padres
				$RecordObj_dd = new RecordObj_dd($tipo);
				$ar_parents = $RecordObj_dd->get_ar_parents_of_this($ksort=true);
				# Añadimos al array resultante el propio tipo actual
				array_push($ar_parents, $tipo);
					#dump($ar_parents,'ar_parents');

				# Comprobamos si existen en el array de autorizados
				foreach ($ar_parents as $tipo) {
					if (array_key_exists($tipo, $dato)) {
						$ar_final[$tipo] = $dato[$tipo];
					}
				}
			}
		}

		$ar_final = array_merge($ar_final, $ar_authorized_admin_areas);
			dump($ar_final,'$ar_final');

		return $ar_final;
	}

*/





	# GET ARRAY TIPO ADMIN
	# Devulve el área 'Admin' además de sus hijos 
	# (usado para excluirles las opciones admin en el arbol)
	public static function get_ar_tipo_admin() {

		# STATIC CACHE
		static $ar_tipo_admin;	
		if(isset($ar_tipo_admin)) return $ar_tipo_admin;

		$ar_result 	= RecordObj_dd::get_ar_terminoID_by_modelo_name($modelo_name='area_admin', $prefijo='dd');
		$ar_tesauro = array();

		if(!empty($ar_result[0])) {
			$tipo					= $ar_result[0];
			$obj 					= new RecordObj_dd($tipo);
			$ar_childrens_of_this	= $obj->get_ar_childrens_of_this();
			$ar_tesauro 			= $ar_childrens_of_this;			
			#dump($ar_tesauro);
		}
		# Añadimos el propio termino como padre del arbol
		#array_push($ar_tesauro, $tipo);
		array_unshift($ar_tesauro, $tipo);

		# STORE CACHE DATA
		$ar_tipo_admin = $ar_tesauro ;

		#dump($ar_tesauro," ar_tesauro");

		return $ar_tesauro ;
	}



	/**
	* CREATE CHECKBOX (DECORATOR)
	* Método decorador que crea el html necesario para dibujar cada checkbox
	* (usado al recorrer 'walk' el arbol)
	* @param $tipo
	*	tipo del area actual like:dd12
	* @param $termino
	*	nombre del area like 'Informantes'
	* @param $arguments_tree
	*	array de variables necesarias para crear el checkox
	*
	* @see menu :: walk_ar_tesauro($ar_tesauro, $arguments_tree=array(), $option='create_link')
	*/
	public static function create_checkbox($tipo, $termino, $modelo_name=NULL, $arguments_tree) {
		#dump($arguments_tree,"tipo");
		#dump($termino,'termino');
		#dump($arguments_tree,'arguments_tree',"array de area tipo y demás argumentos pasados para poder crear el checkbox");
		extract($arguments_tree);

		$html_contenido = NULL;
		$html_title 	= NULL;
		$js 			= NULL;
		
		# CHECKED . Default NULL
		$checked 	= NULL;

		# Context
		$context = NULL;
		if( isset($arguments_tree['context']) ) {
			$context = $arguments_tree['context'];
		}


		if( is_array($dato) && array_key_exists($tipo, $dato) ) {
			
			# CASE CHECKED
			if($dato[$tipo]==2) {
				$checked = 'checked="checked"';
			}
			# CASE INDETERMINATE
			else if($dato[$tipo]==1){
				//$js = "<script type=\"text/javascript\">$('#{$identificador_unico}{$tipo}').prop('indeterminate',true)</script> "; #dump($tipo);
				$js = "<script>var checkbox=document.getElementById(\"{$identificador_unico}{$tipo}\");checkbox.indeterminate=true</script>"; #dump($tipo);
			}			
		}

		$user_id_logged 		 = navigator::get_user_id();
		$logged_user_is_global_admin = (bool)component_security_administrator::is_global_admin($user_id_logged);
		
		$disabled ='';
		switch ($context) {
			case 'users':
				# VERIFY USER LOGGED IS CURRENT VIEWED USER				
				$user_id_viewed = $parent;				
				if($user_id_logged==$user_id_viewed) {
					$disabled = "disabled";
				}
				break;
			case 'profiles':
				$disabled = ''; # No se aplica cuando estamos editando profiles
				break;
			default:
				error_log("Unknow context");
				break;
		}
		#dump($arguments_tree,'disabled');
			

		# VERIFY CURRENT LOGGED USER IS GLOBAL ADMIN OR NOT
		# Testemos si este usuario es administrador global. Si no lo es, ocultaremos las áreas a las que no tiene acceso 
			/*
			$logged_user_is_global_admin = component_security_administrator::is_global_admin($user_id_logged);
				#dump($logged_user_is_global_admin,'logged_user_is_global_admin',"component_security_administrator::logged_user_is_global_admin para usuario $user_id_logged ");	
			

			
			$class_hide = NULL;
			if(is_array($dato) && !array_key_exists($tipo, $dato) && $logged_user_is_global_admin===false) $class_hide = 'hide_area_element';
				#dump($class_hide,'class_hide',"class_hide para $tipo ");	
			*/

		



		# ADMIN AREA CHECKBOX
		# Si NO es uno de las areas de 'Admin' le añadimos el checkbox 'tipo-admin' que habilita admninistrar este area
		$ar_tipo_admin = self::get_ar_tipo_admin();		#dump($ar_tipo_admin,'$ar_tipo_admin');

		if( !in_array($tipo, $ar_tipo_admin) && $context != 'projects' ) {	
			
			$admin_checked = NULL;
			if(is_array($dato) && array_key_exists($tipo.'-admin', $dato) && $dato[$tipo.'-admin']==2) $admin_checked = 'checked="checked"';

			/**
			* USERS . REMOVE MAIN UNAUTHORIZED ADMIN CHECKBOX ELEMENTS
			* En el contexto de edición de 'users' eliminamos las areas de tipo admin que nosotros mismos no podamos administrar
			*/			
			if( $logged_user_is_global_admin===true || array_key_exists($tipo.'-admin', $dato) ) {						

				$html_contenido .= "\n <span class=\"security_areas_admin_checkbox\" id=\"{$identificador_unico}{$tipo}-admin-span\">";

				$html_contenido .= "\n <input class=\"css_component_security_areas component_security_areas_admin\" type=\"checkbox\"
				name=\"{$identificador_unico}\" id=\"{$identificador_unico}{$tipo}-admin\"
				data-tipo=\"{$parent_tipo}\" data-lang=\"{$lang}\" data-section_tipo=\"{$section_tipo}\" data-parent=\"{$parent}\" data-flag=\"component_security_areas\" 
				value=\"{$tipo}-admin\"				
				$admin_checked $disabled />";

				$html_contenido .= "\n <label for=\"{$identificador_unico}{$tipo}-admin\" class=\"css_component_security_areas_rotulo\" >Admin $termino </label>";
				
				$html_contenido .= "</span>";

				# Si area checkbox esta checked, mostramos su admin checkbox
				if($checked)
				$js .= "<script>document.getElementById(\"{$identificador_unico}{$tipo}-admin-span\").style.display=\"block\";</script>"; #dump($tipo);
			}

		}

		# AREA CHECKBOX

			#if( $logged_user_is_global_admin===true || array_key_exists($tipo.'-admin', $dato) ) {

				$html_contenido .= "\n <input class=\"css_component_security_areas\" type=\"checkbox\" 
				name=\"{$identificador_unico}\" id=\"{$identificador_unico}{$tipo}\"
				data-tipo=\"{$parent_tipo}\" data-lang=\"{$lang}\" data-section_tipo=\"{$section_tipo}\" data-parent=\"{$parent}\" data-flag=\"component_security_areas\" 
				value=\"{$tipo}\"
				title=\"$html_title\" 				
				$checked $disabled />";

				$html_contenido .= "\n <label for=\"{$identificador_unico}{$tipo}\" class=\"css_component_security_areas_rotulo\" >$termino ($tipo)</label>";
			#}

		
		$html_contenido .= $js;

		return $html_contenido;
	}

	

	
	# GET VALOR . DEFAULT IS GET DATO . 
	# OVERWRITE IN EVERY DIFFERENT SPECIFIC COMPONENT
	public function get_valor() {
		
		$html 	= '';
		$dato	= $this->get_dato();
			#dump($dato);
									
		foreach ($dato as $key => $state) {
			
			if($state!=2) continue;

			$name = RecordObj_dd::get_termino_by_tipo($key, DEDALO_DATA_LANG,true);	#DEDALO_COMPONENT_SECURITY_AREAS_TIPO

			$html .= $name;	#- $state
			if(SHOW_DEBUG) {
				$html .= " [$key:$state] ";
			}
			if ($key!=end($dato)) $html .= '<br>';
		}				
		
		return $html;					
	}
		
	
	/**
	* GET PERMISSIONS OF THIS CURRENT AREA
	*
	* @return $permissions
	*	Int value (0,1,2,3)
	*/
	public function get_permisions_of_this_area() {

		#$current_area		= navigator::get_selected('area');	#dump($current_area,'current_area');
		$current_area		= $this->get_section_tipo();
			#dump($current_area,"current_area ".DEDALO_SECTION_USERS_TIPO);

		if(empty($current_area)) throw new Exception(" Current area is not defined! ");

		$permissions 		= 0;

		switch ($current_area) {
			case DEDALO_SECTION_USERS_TIPO:
			case DEDALO_SECTION_PROJECTS_TIPO:
			case DEDALO_SECTION_PROFILES_TIPO:
				$tipo 			= $this->get_tipo();
				$permissions	= common::get_permissions($tipo);
				break;
			
			default:
				$permissions = 0; # No access from other areas
				break;
		}

		return (int)$permissions;
		
		/* OLD WORLD
		$RecordObj_dd		= new RecordObj_dd($current_area);
		$parent 			= $RecordObj_dd->get_parent();		# Usaremos el parent (estaremos en 'Usuarios' y queremos 'Admin') 

		#$RecordObj_dd		= new RecordObj_dd($parent);
		#$modeloID			= $RecordObj_dd->get_modelo();
		#$modelo				= RecordObj_dd::get_termino_by_tipo($modeloID,null,true);
		$modelo_name 		= RecordObj_dd::get_modelo_name_by_tipo($parent, true);
		
		# Si el area parent es "area_admin" devolvemos "ADMIN" que elimina el filtro y muestra todos los registros, completo
		if ($modelo_name == 'area_admin') {
			
			$tipo 			= $this->get_tipo();
			$permissions	= common::get_permissions($tipo);			
		}

			#dump($permissions,'permissions');
				
		return intval($permissions);
		*/			
	}



	
	/**
	* GET AR AUTHORIZED AREAS FOR CURRENT USER
	*
	* @return $ar_area_name
	*	Array of all areas autorized for this user
	* @see Used in mode list
	*/
	public function get_ar_authorized_areas_for_user_as_list() {
		
		# Test if current logged user is admin global
		$user_id 		= $this->get_parent();
		#$is_global_admin 	= component_security_administrator::is_global_admin($user_id);	#dump($is_global_admin,'is_global_admin',"user $user_id");
		
		# REGULAR USERS
		$ar_area_name  = NULL;

		$ar_authorized_areas_for_user = component_security_areas::get_ar_authorized_areas_for_user($user_id, $mode_result='simple');

		if(is_array($ar_authorized_areas_for_user)) foreach ($ar_authorized_areas_for_user as $key => $tipo) {

			$area_name = RecordObj_dd::get_termino_by_tipo($tipo,null,true);
			$ar_area_name[$tipo] = $area_name;
		}
				
		return $ar_area_name;
				
	}

		




































	
	
	
	
	
	
	
}
?>