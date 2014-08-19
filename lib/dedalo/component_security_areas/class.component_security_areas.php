<?php
/*
* CLASS COMPONENT SECURITY AREAS
*/


class component_security_areas extends component_common {

	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;

	
	# Override component_common method
	public function get_ar_tools_obj() {
		return NULL;
	}

	/**
	* SAVE OVERRIDE
	* Overwrite component_common method to set allways lang to config:DEDALO_DATA_NOLAN before save
	*/
	public function Save() {

		#dump($this->dato,'$this->dato'); return false;

		$dato 	= $this->dato;
		$parent = $this->parent;	#dump($parent,"PARENT ".$this->get_tipo());

		$tipo 	= $this->get_tipo();

			#dump($tipo,"parent: $parent - ".dump($dato,'$dato'));
			#dump($this);

		# Calculate parent tipo
		# parent is section parent . look structure for know section parent tipo of this element
		$ar_terminoID_by_modelo_name = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation( $tipo, $modelo_name='section', $relation_type='parent' );
		if(empty($ar_terminoID_by_modelo_name[0])) throw new Exception("section tipo not found for section id:$parent from component_tipo:$tipo", 1);		
		$parent_section_tipo 		 = $ar_terminoID_by_modelo_name[0];

		/**
		* DATO
		* El estado será 1 para 'indeterminate' y 2 para 'checked'
		* Los checks de admin se guardan en formato: 'tipo-admin=>estado' como '"dd78-admin":"2"'
		*
		*/
		#dump($dato, "parent:$parent, parent_section_tipo:$parent_section_tipo"); return;

		# UPDATE ACCESS AND PROYECTS
		$propagate = true;
		if( !empty($dato) && is_array($dato) && !empty($parent) && $propagate===true ) {

			/**
			* PROPAGATE ACCESS PERMISSIONS FROM AUTHORIZED AREAS
			* Propagate area changes to access radiobuttons vales and Save permissions on component_security_access
			* On Save new component_security_areas data from checkboxes, all permissions access are recalculated
			* and Saved to current user matrix security_access record
			* @param $dato
			*	Array of pairs tipo=>state, like array(dd12=>2,dd135=1,..) posted by caller edit page checkboxes
			* @see component_security_access::propagate_areas_to_access
			* @return $propagate_areas_to_access (not used here)
			*	Array full (areas,sections and childrens) not used here
			*/
			$propagate_areas_to_access = component_security_access::propagate_areas_to_access($dato, $parent, $parent_section_tipo);
				#dump($propagate_areas_to_access,'propagate_areas_to_access',"array completo con hijos");
		

			/**
			* PROPAGATE AUTHORIZED PROJECTS FROM AUTHORIZED AREAS
			* When change areas, update authorized projects data in user matrix
			*/
			$propagate_areas_to_projects = component_filter::propagate_areas_to_projects($dato, $parent, $parent_section_tipo);
				#dump($propagate_areas_to_projects,'propagate_areas_to_projects',"array completo con hijos");
		}

		# reset session permisions table
		unset($_SESSION['auth4']['permissions_table']);

		# A partir de aquí, salvamos de forma estándar
		return parent::Save();
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
		
		$arguments_tree['dato'] 				= $this->get_dato();
		$arguments_tree['id'] 				 	= $this->get_id();						
		$arguments_tree['parent'] 				= $this->get_parent();
		$arguments_tree['parent_tipo'] 			= $this->get_tipo();
		$arguments_tree['lang'] 				= $this->get_lang();	
		$arguments_tree['identificador_unico']	= $this->get_identificador_unico();	
		$arguments_tree['disabled']				= $disabled;							
	
		$tipo = $this->get_tipo();
		$current_matrix_table 			= common::get_matrix_table_from_tipo($tipo);

		# Context (users / projects)
		$parent 						= $this->get_parent();
		$parent_tipo_modelo_name 		= RecordObj_ts::get_modelo_name_by_tipo($tipo);

		# Section
		$parent_tipo 					= common::get_tipo_by_id($parent, $current_matrix_table);	
		
		if (empty($parent_tipo)) {
			$msg = " Security problem in request ";
			if(SHOW_DEBUG) {
				$arguments=array();
				$arguments['id']			= $parent;
				$matrix_table 				= $current_matrix_table;
				$RecordObj_matrix			= new RecordObj_matrix($matrix_table,NULL);
				$ar_records					= $RecordObj_matrix->search($arguments);
				if(empty($ar_records[0])) {
					$msg .= " <br> undefined 'tipo' for parent:$parent in ".__METHOD__. " Record '$parent' not exists in $table";
				}else{
					$msg .= " <br> undefined 'tipo' for parent:$parent in ".__METHOD__. " Record '$parent' exists in $table but it is not possible to solve";
				}				
			}
			throw new Exception($msg, 1);
		}
					
		
		$section = new section($parent,$parent_tipo);
		$ar_children_objects_by_modelo_name 	= $section->get_ar_children_objects_by_modelo_name_in_section('component_filter_master');
			#dump($ar_children_objects_by_modelo_name, 'ar_children_objects_by_modelo_name : component_filter_master'," parent : $parent");


		if( empty($ar_children_objects_by_modelo_name) ) {
			# We are in Projects
			$arguments_tree['context'] 			= 'projects';
		}else{
			# We are in Users
			$arguments_tree['context'] 			= 'users';
		}
		#dump($arguments_tree['context'],'$arguments_tree[context]');


		/**
		* FILTER VIEW AREAS BY CURRENT ADMIN (ONLY CAN ADMINISTER AREAS THAT HE HAVE AUTHORIZATION)
		* Get current admin user id matrix
		* Get her _ar_authorized_areas
		* Filter whith them the edited user areas (remix areas overwriting with edited user data estate)
		*/
		$userID_matrix_logged 		 	= navigator::get_userID_matrix();
		$userID_matrix_viewed			= $parent;

		$logged_user_is_global_admin 	= component_security_administrator::is_global_admin($userID_matrix_logged);
		if($logged_user_is_global_admin != true) {

			# Sólo mostraremos las que el usuario actual tiene acceso. Nunca mas de esas salvo que seamos admin global
			if ($userID_matrix_logged == $userID_matrix_viewed) {
				$ar_authorized_areas_for_user = component_security_areas::get_ar_authorized_areas_for_user($userID_matrix_logged, $simple_array=false);
			}else{
				$ar_authorized_areas_for_user = component_security_areas::get_ar_authorized_admin_areas_for_user($userID_matrix_logged, $simple_array=false);
			}
			#dump($ar_authorized_areas_for_user,'$ar_authorized_areas_for_user',"user $userID_matrix_logged"); die();

			# Ahora las remezclamos con las del usuario actual para obtener el listado final
			# Téngase en cuenta que NO podremos dar ACCESO DE ADMINISTRACIÓN a un área en la que nosotros mismos
			# no tengamos derecho de administrar
			$dato 		= $arguments_tree['dato'];
			$dato_final = array();
			if(is_array($ar_authorized_areas_for_user)) foreach ($ar_authorized_areas_for_user as $tipo => $estado) {
				
				# Si existe el dato específico del usuario, sobreescribimos el de su admin
				if(!empty($dato[$tipo])) {
					$dato_final[$tipo] = $dato[$tipo];
				}else{
					$dato_final[$tipo] = 0;
				}
			}
			unset($arguments_tree['dato']);
			$arguments_tree['dato'] = $dato_final ;
		}


		/**
		* PROJECTS . REMOVE ADMIN ELEMENTS
		* En el contexto de edición de 'projects' eliminamos las areas de tipo admin
		*/
		if (isset($arguments_tree['context']) && $arguments_tree['context']=='projects' && isset($arguments_tree['dato']) && is_array($arguments_tree['dato']) ) {
			# Get admin section tipo and childrens
			$ar_tipo_admin = self::get_ar_tipo_admin();
			# Iterate and compare with  current dato array
			foreach ($ar_tipo_admin as $tipo) {
				if( array_key_exists($tipo, $arguments_tree['dato']) ) {
					# Remove admin element of projects areas array 
					unset($arguments_tree['dato'][$tipo]); 
				}
			}
		}
		#dump($arguments_tree,'$arguments_tree');
		#dump($ar_authorized_areas_for_user,'ar_authorized_areas_for_user');
		#dump($arguments_tree['dato'],'$arguments_tree[dato]');

		$tree_html = menu::get_menu_structure_html($option='create_checkbox', $arguments_tree);

		return $tree_html;
	}




	/**
	* GET ARRAY OF AUTHOTIZED AREAS FOR USER (STATIC)
	* Locate matrix record 'dato' of component_security_areas (tipo ex.dd240) from userID
	* and return your value (stored as json)
	*
	* @param $userID_matrix
	*	Int value matrix id
	* @param $simple_array
	*	bool() default false
	*
	* @return $ar_authorized_areas
	*	simple_array->true: Array of area tipo clean like array('dd15','dd146')
	*	simple_array->false: Array of array area tipo with '-admin' and check state like array('dd15=>2','dd15-admin=>2')
	*/
	static public function get_ar_authorized_areas_for_user($userID_matrix, $simple_array=false) {
		
		$ar_authorized_areas = array();

		if(empty($userID_matrix)) return $ar_authorized_areas;

		# Section
		$current_tipo = common::get_tipo_by_id($userID_matrix, $table='matrix');

		if(empty($current_tipo)) return false;

		$section_obj 		 = new section($userID_matrix,$current_tipo);
		$ar_children_objects = $section_obj->get_ar_children_objects_by_modelo_name_in_section($modelo_name='component_security_areas');
			#dump($ar_children_objects[0],'ar_children_objects');
		
		if(empty($ar_children_objects[0])) return false; #throw new Exception(__METHOD__ ." \nError: $modelo_name not found as children of this section of user id=$userID_matrix  ");

		$children_object 	= $ar_children_objects[0];
		$dato 			 	= $children_object->get_dato();
			#dump($dato,'dato',"dato from $modelo_name of $userID_matrix ");

		# $dato is one array like  [dd13-admin] => 2, [dd13] => 2, [dd355-admin] => 2,..
		# Remove elements xxx-admin by default (simple)		
		if( $simple_array===true ) {
			# Modo simple return an simple array excluding 'xxx-admin' and 'estado' info  
			if( is_array($dato) ) foreach ($dato as $tipo => $estado) {
				if(strpos($tipo, '-admin')===false && $estado>=1)
					$ar_authorized_areas[] = $tipo;
			}
		}else{
			$ar_authorized_areas = $dato;
		}

		return $ar_authorized_areas;
	}


	/**
	* GET ARRAY OF AUTHOTIZED ADMIN AREAS FOR USER (STATIC)
	*
	* @param $userID_matrix
	*	Int value matrix id
	* @param $simple_array
	*	bool() default false
	*
	* @return $ar_authorized_areas
	*	simple_array->true: Array of area tipo clean like array('dd15','dd146')
	*	simple_array->false: Array of array area tipo with '-admin' and check state like array('dd15=>2','dd15-admin=>2')
	*/
	static public function get_ar_authorized_admin_areas_for_user($userID_matrix, $simple_array=false) {
		
		$ar_authorized_admin_areas = array();

		if(empty($userID_matrix)) return $ar_authorized_admin_areas;

		$current_tipo 		 = common::get_tipo_by_id($userID_matrix, $table='matrix');
		$section_obj 		 = new section($userID_matrix, $current_tipo);
		$ar_children_objects = $section_obj->get_ar_children_objects_by_modelo_name_in_section($modelo_name='component_security_areas');
			#dump($ar_children_objects[0],'ar_children_objects');
		
		if(empty($ar_children_objects[0])) return false; #throw new Exception(__METHOD__ ." \nError: $modelo_name not found as children of this section of user id=$userID_matrix  ");

		$children_object 	= $ar_children_objects[0];
		$dato 			 	= $children_object->get_dato();
			#dump($dato,'dato',"dato from $modelo_name of $userID_matrix ");

		# $dato is one array like  [dd13-admin] => 2, [dd13] => 2, [dd355-admin] => 2,..
		# Remove elements xxx-admin by default (simple)		
		if( $simple_array===true ) {
			/**/
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
				$RecordObj_ts = new RecordObj_ts($tipo);
				$ar_parents = $RecordObj_ts->get_ar_parents_of_this($ksort=true);
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
			#dump($ar_final,'$ar_final');

		return $ar_final;
	}







	# GET ARRAY TIPO ADMIN
	# Devulve el área 'Admin' además de sus hijos 
	# (usado para excluirles las opciones admin en el arbol)
	public static function get_ar_tipo_admin() {

		# STATIC CACHE
		static $ar_tipo_admin;	
		if(isset($ar_tipo_admin)) return $ar_tipo_admin;

		$ar_result 	= RecordObj_ts::get_ar_terminoID_by_modelo_name($modelo_name='area_admin', $prefijo='dd');
		$ar_tesauro = array();

		if(!empty($ar_result[0])) {
			$tipo					= $ar_result[0];
			$obj 					= new RecordObj_ts($tipo);
			$ar_childrens_of_this	= $obj->get_ar_childrens_of_this();
			$ar_tesauro 			= $ar_childrens_of_this;			
			#dump($ar_tesauro);
		}
		# Añadimos el propio termino como padre del arbol
		#array_push($ar_tesauro, $tipo);
		array_unshift($ar_tesauro, $tipo);

		# STORE CACHE DATA
		$ar_tipo_admin = $ar_tesauro ;

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
		
		# VERIFY USER LOGGED IS CURRENT VIEWED USER			
			$userID_matrix_logged = navigator::get_userID_matrix();							#dump($userID_matrix_logged,'userID_matrix_logged');
			$userID_matrix_viewed = $parent;
			
			if($userID_matrix_logged==$userID_matrix_viewed)
				$disabled = "disabled";

				#dump($arguments_tree,'disabled');
			

		# VERIFY CURRENT LOGGED USER IS GLOBAL ADMIN OR NOT
		# Testemos si este usuario es administrador global. Si no lo es, ocultaremos las áreas a las que no tiene acceso 
			/*
			$logged_user_is_global_admin = component_security_administrator::is_global_admin($userID_matrix_logged);
				#dump($logged_user_is_global_admin,'logged_user_is_global_admin',"component_security_administrator::logged_user_is_global_admin para usuario $userID_matrix_logged ");	
			

			
			$class_hide = NULL;
			if(is_array($dato) && !array_key_exists($tipo, $dato) && $logged_user_is_global_admin===false) $class_hide = 'hide_area_element';
				#dump($class_hide,'class_hide',"class_hide para $tipo ");	
			*/

		$logged_user_is_global_admin = component_security_administrator::is_global_admin($userID_matrix_logged);



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
				data-tipo=\"{$parent_tipo}\" data-id_matrix=\"{$id}\" data-lang=\"{$lang}\"	data-parent=\"{$parent}\" data-flag=\"component_security_areas\" 
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
				data-tipo=\"{$parent_tipo}\" data-id_matrix=\"{$id}\" data-lang=\"{$lang}\" data-parent=\"{$parent}\" data-flag=\"component_security_areas\" 
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
									
		if( is_array($dato) ) foreach ($dato as $key => $state) {
			
			if($state!=2) continue;

			$name = RecordObj_ts::get_termino_by_tipo($key, DEDALO_DATA_LANG);	#DEDALO_COMPONENT_SECURITY_AREAS_TIPO

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

		$current_area		= navigator::get_selected('area');	#dump($current_area,'current_area');

		if(empty($current_area)) throw new Exception(" Current area is not defined! ");

		$permissions 		= 0;
		
		$RecordObj_ts		= new RecordObj_ts($current_area);
		$parent 			= $RecordObj_ts->get_parent();		# Usaremos el parent (estaremos en 'Usuarios' y queremos 'Admin') 

		$RecordObj_ts		= new RecordObj_ts($parent);
		$modeloID			= $RecordObj_ts->get_modelo();
		$modelo				= RecordObj_ts::get_termino_by_tipo($modeloID);
		
		# Si el area parent es "area_admin" devolvemos "ADMIN" que elimina el filtro y muestra todos los registros, completo
		if ($modelo == 'area_admin') {
			
			$tipo 			= $this->get_tipo();
			$permissions	= common::get_permissions($tipo);			
		}

			#dump($permissions,'permissions');
				
		return intval($permissions);				
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
		$userID_matrix 		= $this->get_parent();
		$is_global_admin 	= component_security_administrator::is_global_admin($userID_matrix);	#dump($is_global_admin,'is_global_admin',"user $userID_matrix");
		
		if( $is_global_admin===true ) {
			# ADMIN GLOBAL 
			# If YES, retun ALL
			return "All (Admin global)";

		}else{
			# REGULAR USERS
			$ar_area_name  = NULL;					

			$ar_authorized_areas_for_user = component_security_areas::get_ar_authorized_areas_for_user($userID_matrix, $simple_array=true);

			if(is_array($ar_authorized_areas_for_user)) foreach ($ar_authorized_areas_for_user as $key => $tipo) {

				$area_name = RecordObj_ts::get_termino_by_tipo($tipo);
				$ar_area_name[$tipo] = $area_name;
			}
					
			return $ar_area_name;	
		}		
	}

		




































	
	# OVERWRITE FUNCTION
	public function get_ar_list_of_values_DEPRECATED() {
		
		$ar_areas = self::get_ar_areas();			#dump($ar_areas);
		
		$ar_label = array();
		if(is_array($ar_areas)) foreach($ar_areas as $obj_area) {
			
			#print_r($obj_area); echo "<hr>";
			$tipo				= $obj_area->get_tipo();
			$modeloID			= $obj_area->get_modelo();
			$modelo_current		= RecordObj_ts::get_termino_by_tipo($modeloID);
			
			$ar_label[$tipo] 	= $obj_area->get_label();
						
			#print_r($modelo_current); echo "<hr>";
		}
		
		return $ar_label;
		#print_r($ar_label); echo "<hr>";
	}
	
	/*
	public function get_ar_areas() {
		
		#$root		= new root('dd1');
		#$ar_areas	= $root->get_ar_zonas('area');
		
		$ar_areas	= $this->get_ar_zonas('area');
		return $ar_areas;		
	}
	*/
	# GENERATE EDIT LAYOUT
	public function get_ar_zonas_DEPRECATED($modelo) {
		
		$ar_zonas 			= array();
		$ar_zonas_by_order	= array();
		
		# ESTRUCTURA
		# Buscamos todos los hijos de esta zona para encontrar los de modelo 'xxx' que tiene
		$RecordObj_ts		= new RecordObj_ts(DEDALO_ROOT_TIPO);			#dump($RecordObj_ts);
		$ar_ts_childrens	= $RecordObj_ts->get_ar_recursive_childrens_of_this(DEDALO_ROOT_TIPO);	#dump($ar_ts_childrens);
		
		if( is_array ($ar_ts_childrens) ) foreach($ar_ts_childrens as $terminoID_zona) {
			
			# verificamos los permisos para saber si tenemos acceso
			$obj_permissions	= common::get_permissions($terminoID_zona);			
			if($obj_permissions>=1) {	
			
				# Para cada hijo, verificamos su modelo
				$RecordObj_ts	= new RecordObj_ts($terminoID_zona);
				$modeloID		= $RecordObj_ts->get_modelo();
				$modelo_current	= RecordObj_ts::get_termino_by_tipo($modeloID);
				$norden			= $RecordObj_ts->get_norden($terminoID_zona);				
					
				#if (strpos($modelo_current,$modelo)===false) {	
				if ($modelo_current != $modelo) {
					
					# para el modulo admin cambiamos el tipo que nos viene por el tipo relacionado con el admin global		
					$ar_relaciones	= RecordObj_ts::get_ar_terminos_relacionados($terminoID_zona, $cache=true, $simple=false);
					
					# recorremos los relacionados para encontrar los que son del tipo de la zona ej: module = module descartando filtros u otros animalitos
					if (is_array($ar_relaciones)) foreach($ar_relaciones as $ar_terminoID_rel) {
						
						if (is_array($ar_terminoID_rel)) foreach($ar_terminoID_rel as $modeloID => $terminoID_rel) {
							
							$modelo_current	= RecordObj_ts::get_termino_by_tipo($modeloID);
							
							if (strpos($modelo_current, $modelo) !== false){
								$terminoID_zona = $terminoID_rel;
							}						
						}					
					}		
					//print_r($modelo_current);
				}
				
				# Si es del modelo buscado (ej. 'module') lo añadimos al array ar_zonas_by_order
				if (strpos($modelo_current,$modelo)!==false) {
					
					$class_name = $modelo_current;	#dump($class_name);		
					# SECTION GROUP
					# Creamos un section_group para extraerle su html y el array de componentes que lo integran
					#print_r($obj);
	
					#$ar_zonas_by_order[$norden][$terminoID_zona] = new $class_name( $tipo = $terminoID_zona );
					$ar_zonas_by_order[$norden][$terminoID_zona]  = $terminoID_zona;				
				}
			}
							
		}#foreach($ar_ts_childrens as $terminoID_zona)

		# reorganizamos el array final ordenando los elementos por su orden
		if( is_array ($ar_zonas_by_order) ) {
			
			ksort($ar_zonas_by_order);	
		
			foreach($ar_zonas_by_order as $key => $val) { 
				foreach($val as $key2 => $valor) {
					$ar_zonas[$key2]	 = $valor;
				}
			}
		}
			
		#dump($ar_zonas);#die();

		return $ar_zonas;	
	}
	
	
	
	
	
	
	
	
}
?>