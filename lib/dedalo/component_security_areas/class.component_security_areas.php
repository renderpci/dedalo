<?php
/*
* CLASS COMPONENT SECURITY AREAS
*
*
*/
class component_security_areas extends component_common {


	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;


	/**
	* CONSTRUCT
	*//*
	function __construct($tipo=false, $parent=null, $modo='edit',  $lang=null, $section_tipo=null) {	#__construct($id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=NULL)

		parent::__construct($tipo, $parent, $modo, $lang=$this->lang, $section_tipo);
	}
	*/



	/**
	* GET DATO
	* @return object $dato
	*/
	public function get_dato() {
		$dato = parent::get_dato();
		if (!is_array($dato) && empty($dato)) {
			$dato = [];
		}
		return (array)$dato;
	}



	/**
	* SET_DATO
	* @param object $dato
	*/
	public function set_dato($dato) {

		if (!is_object($dato)) {
			if(empty($dato)) {
				$dato = new stdClass();
			}else{
				#$dato = (object)$dato;
			}
		}

		parent::set_dato( (object)$dato );
	}


	/**
	* SAVE OVERRIDE
	* Overwrite component_common method to set always lang to config:DEDALO_DATA_NOLAN before save
	*/
	public function Save() {

		$parent 		= $this->parent;
		$tipo 			= $this->tipo;
		$section_tipo 	= $this->section_tipo;
		$dato 			= $this->dato;

		##
		# SAVE DATO
		# El estado será 2 para 'checked', y 3 para admin
		# Los checks de admin se recrean a partir del dato (3) del area actual
			#dump($dato, "parent:$parent, section_tipo:$section_tipo"); return;
		$result = parent::Save();


		# UPDATE ACCESS AND PROYECTS
		/*
		$propagate = false;
		if( $propagate===true && !empty($parent) ) {

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
			$propagate_areas_to_access = component_security_access::propagate_areas_to_access($dato, $parent);
				#dump($propagate_areas_to_access,'propagate_areas_to_access',"array completo con hijos");
		}
		*/

		return $result;
	}//end Save



	/**
	* GET_AR_AUTHORIZED_AREAS_FOR_USER
	* @return
	*/
	public static function get_ar_authorized_areas_for_user($user_id, $mode_result='full') {

		$ar_authorized_areas = array();

		if(empty($user_id)) return $ar_authorized_areas;


		#
		# USER PROFILE
		/*
		$component_profile = component_common::get_instance('component_profile',
														  	DEDALO_USER_PROFILE_TIPO,
														  	$user_id,
														  	'edit',
														  	DEDALO_DATA_NOLAN,
														  	DEDALO_SECTION_USERS_TIPO);
		$profile_id = (int)$component_profile->get_dato();
		*/
		$profile_id = component_profile::get_profile_from_user_id( $user_id );
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
		$dato = (object)$component_security_areas->get_dato();
			#dump($dato,"dato - $user_id - ".$security_areas_tipo);die();

		# $dato is a object like
		# Remove elements admin by default (simple)
		switch ($mode_result) {

			case 'simple':
				# Modo simple return an simple array excluding 'xxx-admin' and 'estado' info
				if( !empty($dato) ) {
					foreach ($dato as $tipo => $estado) {
						#if(strpos($tipo, '-admin')===false && $estado>=1){
						if($estado>=2) {
							$ar_authorized_areas[] = $tipo;
						}
					}
				}
				break;

			case 'admin':
				#return de authorized admin areas ONLY
				if( !empty($dato) ) {
					foreach ($dato as $tipo => $estado) {
						#if(strpos($tipo, '-admin')!==false && $estado>=1){
						if($estado==3){
							$ar_authorized_areas[] = $tipo;
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
	}//end get_ar_authorized_areas_for_user_as_list



	/**
	* GET ARRAY TIPO ADMIN
	* @return array $ar_tipo_admin
	* Devulve el área 'Admin' además de sus hijos
	* (usado para excluirles las opciones admin en el arbol)
	*/
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
	* Avoid this component appears on sections different to authorized
	* @return int $permissions
	*	Int value (0,1,2,3)
	*/
	public function get_permisions_of_this_area() {

		$current_area = $this->get_section_tipo();
			if(empty($current_area)) throw new Exception(" Current area is not defined! ");

		$permissions = 0;

		switch ($current_area) {
			case DEDALO_SECTION_PROFILES_TIPO:
				$tipo 			= $this->get_tipo();
				$permissions	= common::get_permissions($current_area, $tipo);
				break;

			default:
				$permissions = 0; # No access from other areas
				break;
		}

		return (int)$permissions;
	}//end get_permisions_of_this_area



	/**
	* GET TREE
	* Obtiene el arbol del menú y lo recorre creando los checkbox necesarios
	* Usa menu::get_menu_structure_html para construir la estructura base ul,li
	* que es común y lo decora con $option='create_checkbox' pasándole los argumentos
	* @param string $disabled
	*	option (NULL,disabled)
	* @return $tree_html
	*	html tree (ul,li) with checkboxes
	*
	* @todo Implement this method without dependencies of menu (menu::get_menu_structure_html) !!
	* @todo Filter Admin section tree in context: Area del proyecto [dd243]
	*/
	protected function get_tree( $disabled ) {

		# GLOBAL ADMIN. ONLY GLOBAL ADMINS HAVE ACCESS HERE (Removed 27-11-2019)
			#$user_id_logged 			 = navigator::get_user_id();
			#$logged_user_is_global_admin = component_security_administrator::is_global_admin($user_id_logged);
			#if($logged_user_is_global_admin !== true) {
			#	debug_log(__METHOD__." Sorry. Regular users can't access security areas tree.", logger::ERROR);
			#	return null;
			#}

		$start_time=microtime(true);

		$arguments_tree['dato'] 				= $this->get_dato();
		$arguments_tree['id'] 				 	= $this->get_id();
		$arguments_tree['parent'] 				= $this->get_parent();
		$arguments_tree['section_tipo'] 		= $this->get_section_tipo();
		$arguments_tree['parent_tipo'] 			= $this->get_tipo();
		$arguments_tree['lang'] 				= $this->get_lang();
		$arguments_tree['identificador_unico']	= $this->get_identificador_unico();
		$arguments_tree['disabled']				= $disabled;
		$arguments_tree['ul_id']				= 'component_security_areas_ul';	// Attr id of tag 'ul'
			#dump($arguments_tree,"arguments_tree");#die();

		# Section
		$parent_tipo = $this->get_section_tipo();

		# CURRENT_SECURITY_AREAS_TIPO : tipo sólo puede ser dd249 (profiles)
		$current_security_areas_tipo = $this->get_tipo();
		# Context : calculate current context (editing users, profiles, etc.)
		$arguments_tree['context']	= 'profiles';
		//switch (true) {
		//	case ($current_security_areas_tipo===DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO):
		//		# We are in Profiles
		//		$arguments_tree['context']	= 'profiles';
		//		break;
		//	default:
		//		die("Security problem detected: Current tipo is not valid ($current_security_areas_tipo)");
		//		break;
		//}

		#
		# FILTER VIEW AREAS BY CURRENT ADMIN (ONLY CAN ADMINISTER AREAS THAT HE HAVE AUTHORIZATION)
		# Get current admin user id matrix
		# Get her _ar_authorized_areas
		# Filter whith them the edited user areas (remix areas overwriting with edited user data estate)
		#
		/*
		$user_id_logged 			 = navigator::get_user_id();
		$logged_user_is_global_admin = component_security_administrator::is_global_admin($user_id_logged);
		if($logged_user_is_global_admin != true) {

			# Sólo mostraremos las que el usuario actual tiene acceso. Nunca más de esas, salvo que seamos admin global
			$ar_authorized_areas_for_user = component_security_areas::get_ar_authorized_areas_for_user($user_id_logged, $mode_result='full');
				#dump($ar_authorized_areas_for_user,'$ar_authorized_areas_for_user',"user $user_id_logged"); #die();

			# Ahora las remezclamos con las del usuario actual para obtener el listado final
			# Téngase en cuenta que NO podremos dar ACCESO DE ADMINISTRACIÓN a un área en la que nosotros mismos
			# no tengamos derecho de administrar
			$dato 		= $arguments_tree['dato'];
			$dato_final = new stdClass;
			foreach ((array)$ar_authorized_areas_for_user as $current_tipo => $estado) {

				# Si existe el dato específico del usuario, sobreescribimos el de su admin
				$dato_final->$current_tipo = !empty($dato->$current_tipo) ? $dato->$current_tipo : 0;
			}
			#unset($arguments_tree['dato']);
			$arguments_tree['dato'] = $dato_final;

		}//if($logged_user_is_global_admin != true)
		*/

		#
		# DATO_ACCESS
		#$component_security_access = component_common::get_instance('component_security_access',
		#															 DEDALO_COMPONENT_SECURITY_ACCESS_PROFILES_TIPO,
		#															 $this->get_parent(),
		#															 'edit',
		#															 DEDALO_DATA_NOLAN,
		#															 DEDALO_SECTION_PROFILES_TIPO);
		#$dato_access = $component_security_access->get_dato();
		#$arguments_tree['dato_access'] = $dato_access;


		# TREE_HTML
		$tree_html = self::get_areas_tree_html($arguments_tree);


		if(SHOW_DEBUG) {
			if(exec_time_unit($start_time,'ms')>200) debug_log(__METHOD__." Generaded tree html in: ".exec_time_unit($start_time,'ms'), logger::DEBUG);
		}

		return $tree_html;
	}//end get_tree



	/**
	* GET TREE HTML
	* @param array $arguments_tree
	*	Vars needed for option decorator
	*/
	public static function get_areas_tree_html($arguments_tree) {

		$tree_html = "<!-- SECURITY AREAS TREE --> <ul id=\"security_areas_tree\">";

			$ar_ts_children_areas = area::get_ar_ts_children_all_areas_hierarchized();
				#dump($ar_ts_children_areas,"ar_ts_children_areas");

			# BUILD LIST RECURSIVELY
			$tree_html .= self::walk_ar_areas($ar_ts_children_areas, $arguments_tree);

		$tree_html .= "</ul><!-- /SECURITY AREAS TREE -->";

		return (string)$tree_html ;
	}//end public static function get_areas_tree_html($option, $arguments_tree) {



	/**
	* WALK_AR_AREAS RECURSIVE . DEPLOY TS TREE FULL ARRAY	*
	* Crea un listado <ul><li>termino</li></ul> a partir del array jerárquico dado
	* @param $ar_tesauro
	*	array jerarquizado from component_security_access::get_ar_ts_childrens_recursive($tipo)
	* @param $arguments_tree
	*	varibles necesarias para que el decorador haga su trabajo
	* @return html tree full created
	*/
	public static function walk_ar_areas($ar_areas, $arguments_tree) {

		$html = '';		#dump($arguments_tree,'arguments_tree'); #die();

		# Iterate hierarchized areas
		# dump($ar_areas, ' ar_areas ++ '.to_string()); die();
		foreach((array)$ar_areas as $tipo => $value) {

			$skip = false;

			// OPEN/CLOSE GROUP RESET
			$open_group 	= "<ul class=\"areas_ul\" data-tipo=\"$tipo\">"; // Default style is display:none
			$close_group 	= "</ul>";
			// OPEN/CLOSE TERM RESET
			$open_term		= "<li>";
			$close_term		= "</li>";

			#
			# UNATHORIZED AREAS . REMOVE AREAS NOT AUTHORIZED FOR CURRENT USER
			# If is received arguments[dato] and current tipo not exist in authorized areas and
			# current logged user is not global admin, current <li> element
			# is not included in final tree html
			/*
				if(isset($arguments_tree['dato'])) {

					$dato = $arguments_tree['dato'];
					if(is_array($dato) && !array_key_exists($tipo, $dato) && $logged_user_is_global_admin===false)	{
						$show = false;
					}
					#dump($arguments_tree,'$arguments_tree');
				}
				*/

			#
			# PARENT
			$parent 		= $arguments_tree['parent'];

			#
			# VISIBLE . Excluimos las secciones marcadas como 'visible=no' en estructura y las que
			# no deben ser mostradas (tesauro selector, media area, etc.)
			$RecordObj_dd	= new RecordObj_dd($tipo);
			$visible 		= $RecordObj_dd->get_visible();
			$show 			= ($visible === 'no') ? false : true;

			# TERMINO (In current data lang with fallback)
			$termino	 	= RecordObj_dd::get_termino_by_tipo($tipo, DEDALO_APPLICATION_LANG, true);

			# MODELO
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);

			$has_sub=false;
			if (!empty($value) && $modelo_name!=='section') {
				$open_term = "<li class=\"has-sub\">";
				$has_sub=true;
			}
			$arguments_tree['have_childrens'] = $has_sub;

			# AREA ADMIN ELEMENTS diferenciate with class 'global_admin_element'
				/*
				if(isset($arguments_tree['context']) && $arguments_tree['context']=='users' && in_array($tipo, self::get_ar_tipo_admin()) )	{
					$open_term	= "\n <li class=\"global_admin_element\" >";
				}
				*/
				if (false===$logged_user_is_global_admin) {
					$permissions = common::get_permissions($tipo, $tipo);
					if((int)$permissions<1) {
						$show = false;
						$skip = true;
					}
				}

			#
			# DATO CURRENT
			$dato 				= $arguments_tree['dato'];
			$dato_tipo_current 	= isset($dato->$tipo) ? $dato->$tipo : false;
			if(is_object($dato_tipo_current)) {
				$dato_tipo_current = false;
				dump($dato, '$dato INCORRECTO - SOBRA UN NIVEL ++ '.to_string($tipo));
			}
			$dato_current		= $dato_tipo_current!==false ? (int)$dato_tipo_current : null;
				#dump($dato_current, ' dato_current ++ '.to_string());

			$do_recursion = (is_array($value) && $modelo_name!='section') ? true : false;



			if($skip===true) {

				//if(is_array($value) && $modelo_name!='section') {
				if($do_recursion) {
					$html .= self::walk_ar_areas($value, $arguments_tree);	# Recursion walk_ar_areas
					#dump($html,'$html');
				}

			}else if($show===true) {

				# FIRST OPEN
				$html	.= $open_term;

					# Decorate term
					$html 	.= self::create_checkbox($tipo, $termino, $modelo_name, $arguments_tree);

					#
					# ACCESS ELEMENTS
					$add_elements=true;
					if ($add_elements && $modelo_name==='section') {

						$wrap_div_id = 'access_elements_'.$tipo;	//chevron-down

						$html .= "<span class=\"glyphicon glyphicon-th toggle_access_elements\" onclick=\"component_security_areas.load_access_elements(this,event)\" ";
						$html .= "data-tipo=\"$tipo\" ";
						$html .= "data-parent=\"$parent\" ";
						$html .= "data-wrap_div_id=\"$wrap_div_id\" ";
						$html .= "data-button_tipo=\"$tipo\" ";
						$html .= "></span>";
						$html .= "<div id=\"{$wrap_div_id}\" class=\"access_elements\"></div>"; # Ajax container to load elements
					}

					# RECURSION
					//if(is_array($value) && $modelo_name!='section') {
					if($do_recursion) {

						$current_html = self::walk_ar_areas($value, $arguments_tree);	# Recursion walk_ar_areas
						if (strlen($current_html)) {
							$html .= $open_group;
							$html .= $current_html;
							$html .= $close_group;
						}
					}

				# LAST CLOSE
				$html .= $close_term;
			}

		}//end foreach($ar_areas as $tipo => $value) {

		return $html;
	}//end walk_ar_areas



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
		#dump($arguments_tree,"tipo"); die();
		#dump($termino,'termino');

		$html 		= '';
		$html_title = '';
		$js 		= '';

		# CHECKED . Default NULL
		$checked 	= false;//'';

		$context 			 = isset($arguments_tree['context']) ? $arguments_tree['context'] : null;
		$dato 	 			 = isset($arguments_tree['dato']) ? $arguments_tree['dato'] : null;
		$identificador_unico = isset($arguments_tree['identificador_unico']) ? $arguments_tree['identificador_unico'] : null;
		$parent_tipo 		 = isset($arguments_tree['parent_tipo']) ? $arguments_tree['parent_tipo'] : null;
		$lang 		 		 = isset($arguments_tree['lang']) ? $arguments_tree['lang'] : null;
		$parent 		 	 = isset($arguments_tree['parent']) ? $arguments_tree['parent'] : null;
		$section_tipo 		 = isset($arguments_tree['section_tipo']) ? $arguments_tree['section_tipo'] : null;
		$have_childrens 	 = $arguments_tree['have_childrens'];


		if( isset($dato->$tipo) ) {

			# CASE CHECKED
			if($dato->$tipo===3) {
				$checked = ' checked="checked"';
			}
			# CASE INDETERMINATE
			else if($dato->$tipo===2){
				#$js = "<script>var checkbox=document.getElementById(\"{$identificador_unico}_{$tipo}\");checkbox.indeterminate=true</script>"; #dump($tipo);
				$js = "<script>document.getElementById(\"{$identificador_unico}_{$tipo}\").indeterminate=true</script>";
			}
		}

		$user_id_logged 		 	 = navigator::get_user_id();
		$logged_user_is_global_admin = (bool)component_security_administrator::is_global_admin($user_id_logged);

		$disabled ='';
		switch ($context) {
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
		# Si NO es una de las areas de 'Admin' le añadimos el checkbox 'tipo-admin' que habilita admninistrar este area
		$ar_tipo_admin = self::get_ar_tipo_admin();
		if( !in_array($tipo, $ar_tipo_admin) ) {

			#$admin_checked = NULL;
			#if(is_array($dato) && array_key_exists($tipo.'-admin', $dato) && $dato[$tipo.'-admin']==2) {
			#	$admin_checked = 'checked="checked"';
			#}
			$admin_checked = (property_exists($dato, $tipo) && $dato->$tipo==3) ? ' checked="checked" ' : '';

			/**
			* USERS . REMOVE MAIN UNAUTHORIZED ADMIN CHECKBOX ELEMENTS
			* En el contexto de edición de 'users' eliminamos las areas de tipo admin que nosotros mismos no podamos administrar
			*/
			#if( $logged_user_is_global_admin===true || array_key_exists($tipo.'-admin', $dato) ) {

				# Si area checkbox esta checked, mostramos su admin checkbox
				$span_block = ($checked!==false) ? ' visible' : '';
				$html .= "<span class=\"security_areas_admin_checkbox{$span_block}\" id=\"{$identificador_unico}_{$tipo}-admin-span\">";

				$html .= "<input type=\"checkbox\" class=\"css_component_security_areas component_security_areas_admin\" onclick=\"component_security_areas.Save(this,event)\" ";
				$html .= "name=\"{$identificador_unico}\" ";
				$html .= "id=\"{$identificador_unico}_{$tipo}-admin\" ";
				$html .= "data-tipo=\"{$parent_tipo}\" ";
				$html .= "data-lang=\"{$lang}\" ";
				$html .= "data-section_tipo=\"{$section_tipo}\" ";
				$html .= "data-parent=\"{$parent}\" ";
				$html .= "data-flag=\"component_security_areas\" ";
				$html .= "value=\"{$tipo}-admin\" ";
				$html .= $admin_checked;
				$html .= $disabled;
				$html .= "/>";

				$html .= "<label for=\"{$identificador_unico}_{$tipo}-admin\" class=\"css_component_security_areas_rotulo\">";
				$html .= "Admin $termino";
				if(SHOW_DEVELOPER===true) {
					$html .= " - [$tipo:";
					$permissions = isset($dato->$tipo) ? $dato->{$tipo} : 0;
					$html .= "<b>$permissions</b>";
					$html .= " ".RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
					$html .= "]";
				}
				$html .= "</label>";

				$html .= "</span>";

				# Si area checkbox esta checked, mostramos su admin checkbox
				#if($checked)
				#$js .= "<script>document.getElementById(\"{$identificador_unico}_{$tipo}-admin-span\").style.display=\"block\";</script>";
			#}
		}

		# AREA CHECKBOX
			#if( $logged_user_is_global_admin===true || array_key_exists($tipo.'-admin', $dato) ) {
				$html .= "<input type=\"checkbox\" class=\"css_component_security_areas\" onclick=\"component_security_areas.Save(this,event)\" ";
				$html .= "name=\"{$identificador_unico}\" ";
				$html .= "id=\"{$identificador_unico}_{$tipo}\" ";
				$html .= "data-tipo=\"{$parent_tipo}\" ";
				$html .= "data-lang=\"{$lang}\" ";
				$html .= "data-section_tipo=\"{$section_tipo}\" ";
				$html .= "data-parent=\"{$parent}\" ";
				$html .= "data-flag=\"component_security_areas\" ";
				$html .= "value=\"{$tipo}\" ";
				$html .= "title=\"$html_title\" ";
				$html .= $checked;
				$html .= $disabled;
				$html .= "/>";

				$html .= "<label class=\"css_component_security_areas_rotulo\">";	// for=\"{$identificador_unico}_{$tipo}\"
				$html .= "$termino";
				$html .= "</label>";
				if(SHOW_DEVELOPER===true) {
					$html .= " [$tipo:";
					$permissions = isset($dato->$tipo) ? $dato->{$tipo} : 0;
					$html .= "<b>$permissions</b>";
					$html .= " ".RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
					$html .= "]";
				}

				#
				# ICON TOGGLE_AREA_CHILDRENS
				if ($have_childrens) {
					$html .= "<span class=\"glyphicon glyphicon-chevron-down toggle_area_childrens\" onclick=\"component_security_areas.toggle_area_childrens(this,event);\" data-button_tipo=\"$tipo\"></span>";
				}
			#}

		$html .= $js;

		return $html;
	}//end create_checkbox



	/**
	* UPDATE_DATO_VERSION
	* @return
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


		$update_version = implode(".", $update_version);
		#dump($dato_unchanged, ' dato_unchanged ++ -- '.to_string($update_version)); #die();

		switch ($update_version) {

			case '4.0.11':
				$new_dato = $dato_unchanged;
				$data_changed=false;
				if(!empty($new_dato)) {
					foreach ((object)$new_dato as $tipo => $value) {
						if (strpos($tipo, '-admin')!==false) {
							$tipo_admin =  $tipo;
							$ar_parts 	= explode('-', $tipo);
							$tipo_real 	= $ar_parts[0];
							$new_dato->$tipo_real = 3;
							unset($new_dato->$tipo_admin);
						}else{
							$new_dato->$tipo = (int)$value; // Convert to int

							if ($new_dato->$tipo==1) {
								$new_dato->$tipo = 2; // Convert 1 to 2
							}
						}
					}
					$data_changed=true;
				}

				# Compatibility old dedalo instalations
				if ($data_changed) {
					$response = new stdClass();
						$response->result =1;
						$response->new_dato = $new_dato;
						$response->msg = "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";
					return $response;
				}else{
					$response = new stdClass();
						$response->result = 2;
						$response->msg = "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."

					return $response;
				}
				break;

			default:
				# code...
				break;
		}
	}#end update_dato_version



	/**
	* GET_VALOR_LIST_HTML_TO_SAVE
	* Usado por section:save_component_dato
	* Devuelve a section el html a usar para rellenar el 'campo' 'valor_list' al guardar
	* Por defecto será el html generado por el componente en modo 'list', pero en algunos casos
	* es necesario sobre-escribirlo, como en component_portal, que ha de resolverse obigatoriamente en cada row de listado
	*
	* En este caso, NO guardamos nada en 'valor_list'
	*
	* @see class.section.php
	* @return string $html
	*/
	public function get_valor_list_html_to_save() {
		$html='';

		return (string)$html;
	}//end get_valor_list_html_to_save




}//end component_security_areas
?>
