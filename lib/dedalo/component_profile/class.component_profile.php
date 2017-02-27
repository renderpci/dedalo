<?php
/*
* CLASS COMPONENT PROFILE

	Componente auxiliar que ayuda a configurar parámetros de la ficha de usuario.
	Lee todos los registros existentes en la tabla 'matrix_profiles' (son los perfiles de usuarios existentes) y los muestra como
	una lista de valores seleccionable dentro de la ficha de usuario. Si se selecciona y aplica uno de los valores, se resetean en la ficha de usuario los
	valores de los componentes definidos en el perfil y se sustituyen por los valores existentes en el registro del perfil seleccionado.
	
	Componentes que se utilizan:

		- component_security_areas
		- component_security_access
		- component_security_tools

	Este componente no posee idioma ni tools y sólo provee el modo 'edit'.
	Tampoco guarda datos propios en  la base de datos ya que realmente funciona como conector entre fichas (perfiles->usuarios).
*/


class component_profile extends component_common {
	
	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;

	protected $ar_select_values;


	function __construct($tipo=null, $parent=null, $modo='edit', $lang=DEDALO_DATA_NOLAN, $section_tipo=null) {

		# Force always DEDALO_DATA_NOLAN
		$lang = $this->lang;

		# Creamos el componente normalmente
		parent::__construct($tipo, $parent, $modo, $lang, $section_tipo);

		if(SHOW_DEBUG===true) {
			$traducible = $this->RecordObj_dd->get_traducible();
			if ($traducible==='si') {
				throw new Exception("Error Processing Request. Wrong component lang definition. This component $tipo (".get_class().") is not 'traducible'. Please fix this ASAP", 1);
			}
		}
	}

	
	# GET DATO : IS calculated, not get from database
	public function get_dato() {
		
		$dato = parent::get_dato();

		if (empty($dato)) {
			if (!defined('DEDALO_PROFILE_DEFAULT')) {
				define('DEDALO_PROFILE_DEFAULT', 1); // Por defecto asignamos el primero '1'
				debug_log(__METHOD__." Config constant 'DEDALO_PROFILE_DEFAULT' is not defined !! ".to_string(), logger::WARNING);
			}
			# DEDALO_PROFILE_DEFAULT
			$user_id = $this->get_parent();
			$section_profile_id = DEDALO_PROFILE_DEFAULT;
			$this->set_dato($section_profile_id);
			$this->Save();
			debug_log(__METHOD__." Created new profile ($section_profile_id) from defaults and assigned to current user ($user_id)".to_string(), logger::DEBUG);
			$dato = $section_profile_id;
		}

		# 
		# COMPATIBILITY with previous versions	
		/*	
			if ($dato==0) {
				$user_id = $this->get_parent();
				$section_profile_id = $this->create_profile_from_user( $user_id );
				$this->set_dato($section_profile_id);
				$this->Save();
				debug_log(__METHOD__." Created new profile ($section_profile_id) from user settings and assigned to current user ($user_id)".to_string(), logger::DEBUG);
				$dato = $section_profile_id;
			}
			#die($section_profile_id);
			*/
		
		return (int)$dato;
	}

	# SET_DATO
	public function set_dato($dato) {
		parent::set_dato( (int)$dato );
	}

	
	# AR_SELECT_VALUES
	public function get_ar_select_values() {

		if (isset($this->ar_select_values)) {
			return $this->ar_select_values;
		}

		$matrix_table = 'matrix_profiles';
		$strQuery="--".__METHOD__."
		SELECT section_id, section_tipo FROM $matrix_table
		";
		$result	= JSON_RecordObj_matrix::search_free($strQuery);
		while ($rows = pg_fetch_assoc($result)) {
			$section_id 	= $rows['section_id'];
			$section_tipo 	= $rows['section_tipo'];
			$component  	= component_common::get_instance('component_input_text',
															  DEDALO_COMPONENT_NAME_PROFILES_TIPO,
															  $section_id,
															  'edit',
															  DEDALO_DATA_LANG,
															  $section_tipo);
				#dump($component,"component ".DEDALO_APPLICATION_LANG);
			$name = $component->get_valor(0);
				#dump($name, ' name '.$strQuery);
			
			# Falta de fallback del idioma. Hacer más adelante			
			$this->ar_select_values[$section_id] = $name;
		}

		return $this->ar_select_values;

	}//end get_ar_select_values




	/**
	* GET_VALOR
	* @return 
	*/
	public function get_valor() {

		$profile_id = $this->get_dato();
		if (empty($profile_id)) {
			return null;
		}
		
		$component  = component_common::get_instance('component_input_text',
													  DEDALO_COMPONENT_NAME_PROFILES_TIPO,
													  $profile_id,
													  'edit',
													  DEDALO_DATA_LANG,
													  DEDALO_SECTION_PROFILES_TIPO);
			#dump($component,"component ".DEDALO_APPLICATION_LANG);
		$name = $component->get_valor(0);
			
		return $name;
	}#end get_valor



	/**
	* GET_PROFILE_FROM_USER_ID
	* @param int $user_id
	* @return int $profile_id
	*/
	public static function get_profile_from_user_id( $user_id ) {
		
		# Calculate current user profile id
		$component_profile = component_common::get_instance('component_profile',
														  	DEDALO_USER_PROFILE_TIPO,
														  	$user_id,
														  	'edit',
														  	DEDALO_DATA_NOLAN,
														  	DEDALO_SECTION_USERS_TIPO);
		$profile_id = $component_profile->get_dato();

		return (int)$profile_id;
	}//end get_profile_from_user_id



	/**
	* APPLY_PROFILE
	* @see trigger.component_profile
	*//*
	public static function apply_profile__DEPRECATED($selected_option, $current_user_id) {
		
		$msg='';

			#dump($selected_option, ' selected_option - current_user_id:'.$current_user_id);die();

		# COMPONENT_SECURITY_AREAS
			# SOURCE (PROFILE)
			$component_security_areas_profiles 	= component_common::get_instance('component_security_areas',
																				 DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO,
																				 $selected_option,
																				 'edit',
																				 DEDALO_DATA_NOLAN,
																				 DEDALO_SECTION_PROFILES_TIPO);
			$security_areas_profiles_dato 		= $component_security_areas_profiles->get_dato();				
			# TARGET (USER)
			$component_security_areas_users 	= component_common::get_instance('component_security_areas',
																				DEDALO_COMPONENT_SECURITY_AREAS_USER_TIPO,
																				$current_user_id,
																				'edit',
																				DEDALO_DATA_NOLAN,
																				DEDALO_SECTION_USERS_TIPO);
			$component_security_areas_users->set_dato($security_areas_profiles_dato);
			$result = $component_security_areas_users->Save();

			if (!$result) {
				$msg.= "Error on save component_security_areas_users<br>";
				if(SHOW_DEBUG===true) {
					dump($security_areas_profiles_dato," security_areas_profiles_dato");
					throw new Exception("Error Processing Request", 1);
				}
			}

		# COMPONENT_SECURITY_ACCESS
			# SOURCE (PROFILE)
			$component_security_access_profiles = component_common::get_instance('component_security_access',DEDALO_COMPONENT_SECURITY_ACCESS_PROFILES_TIPO, $selected_option, 'edit', DEDALO_DATA_NOLAN, DEDALO_SECTION_PROFILES_TIPO);
			$security_access_profiles_dato 		= $component_security_access_profiles->get_dato();
			# TARGET (USER)
			$component_security_access_users 	= component_common::get_instance('component_security_access',DEDALO_COMPONENT_SECURITY_ACCESS_USER_TIPO, $current_user_id, 'edit', DEDALO_DATA_NOLAN, DEDALO_SECTION_USERS_TIPO);
			$component_security_access_users->set_dato($security_access_profiles_dato);
			$result = $component_security_access_users->Save();

			if (!$result) {
				$msg.= "Error on save component_security_access_users<br>";
				if(SHOW_DEBUG===true) {
					dump($security_access_profiles_dato," security_access_profiles_dato");
					throw new Exception("Error Processing Request", 1);
				}
			}

		# COMPONENT_SECURITY_TOOLS
			# SOURCE (PROFILE)
			$component_security_tools_profiles 	= component_common::get_instance('component_security_tools',DEDALO_COMPONENT_SECURITY_TOOLS_PROFILES_TIPO, $selected_option, 'edit', DEDALO_DATA_NOLAN, DEDALO_SECTION_PROFILES_TIPO);
			$security_tools_profiles_dato 		= $component_security_tools_profiles->get_dato();
			# TARGET (USER)
			$component_security_tools_users 	= component_common::get_instance('component_security_tools',DEDALO_COMPONENT_SECURITY_TOOLS_USER_TIPO, $current_user_id, 'edit', DEDALO_DATA_NOLAN, DEDALO_SECTION_USERS_TIPO);
			$component_security_tools_users->set_dato($security_tools_profiles_dato);
			$result = $component_security_tools_users->Save();

			if (!$result) {
				$msg.= "Error on save component_security_tools_users<br>";
				if(SHOW_DEBUG===true) {
					dump($security_tools_profiles_dato," security_tools_profiles_dato");
					throw new Exception("Error Processing Request", 1);
				}
			}

		if (empty($msg)) {
			$msg='ok';
		}

		return $msg;

	}#end apply_profile
	*/



	/**
	* CREATE_PROFILE_FROM_USER
	* Transition method from dedalo 4.0.2 to 4.0.3 users data
	* @return 
	*//*
	public function create_profile_from_user_DEACTIVATED( $user_id ) {

		# PROFILE TEST
		$dato = (int)$this->dato;
		if ($dato>0) {
			return true; // User already uses profile. No need create one.
		}else{
			# Create new profile for this user
			$section_profile 	= section::get_instance(null, DEDALO_SECTION_PROFILES_TIPO, 'edit');
			$section_profile_id = $section_profile->Save();
		}		


		#
		# PROFILE NAME
			$user_component_input_text 	   = component_common::get_instance('component_input_text',
																		DEDALO_FULL_USER_NAME_TIPO,
																		$user_id,
																		'edit',
																		DEDALO_DATA_LANG,
																		DEDALO_SECTION_USERS_TIPO);
			$name = $user_component_input_text->get_dato();

			$component_input_text 	   = component_common::get_instance('component_input_text',
																		DEDALO_COMPONENT_NAME_PROFILES_TIPO,
																		$section_profile_id,
																		'edit',
																		DEDALO_DATA_LANG,
																		DEDALO_SECTION_PROFILES_TIPO);
			$component_input_text->set_dato($name);
			$component_input_text->Save();

		#
		# PROFILE DESCRIPTION
			$component_text_area 	   = component_common::get_instance('component_text_area',
																		DEDALO_COMPONENT_DESCRIPTION_PROFILES_TIPO,
																		$section_profile_id,
																		'edit',
																		DEDALO_DATA_LANG,
																		DEDALO_SECTION_PROFILES_TIPO);
			$description = "Profile created based on user settings";
			$component_text_area->set_dato($description);
			$component_text_area->Save();

		
		#
		# PROFILE SECURITY AREAS
			$user_component_security_areas = component_common::get_instance('component_security_areas',
																		DEDALO_COMPONENT_SECURITY_AREAS_USER_TIPO,
																		$user_id,
																		'edit',
																		DEDALO_DATA_NOLAN,
																		DEDALO_SECTION_USERS_TIPO);
			$user_security_areas_dato = $user_component_security_areas->get_dato();

			$component_security_areas  = component_common::get_instance('component_security_areas',
																		DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO,
																		$section_profile_id,
																		'edit',
																		DEDALO_DATA_NOLAN,
																		DEDALO_SECTION_PROFILES_TIPO);
			$component_security_areas->set_dato($user_security_areas_dato);
				dump($user_security_areas_dato, ' user_security_areas_dato ++ '.to_string());
			$component_security_areas->Save();

		#
		# SECURITY ACCESS
			$user_component_security_access = component_common::get_instance('component_security_access',
																		DEDALO_COMPONENT_SECURITY_ACCESS_USER_TIPO,
																		$user_id,
																		'edit',
																		DEDALO_DATA_NOLAN,
																		DEDALO_SECTION_USERS_TIPO);
			$user_security_access_dato = $user_component_security_access->get_dato();

			$component_security_access  = component_common::get_instance('component_security_areas',
																		DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO,
																		$section_profile_id,
																		'edit',
																		DEDALO_DATA_NOLAN,
																		DEDALO_SECTION_PROFILES_TIPO);
			$component_security_access->set_dato($user_security_access_dato);
			$component_security_access->Save();

		#
		# COMPONENT_SECURITY_TOOLS
			$user_component_security_tools = component_common::get_instance('component_security_tools',
																		DEDALO_COMPONENT_SECURITY_TOOLS_USER_TIPO,
																		$user_id,
																		'edit',
																		DEDALO_DATA_NOLAN,
																		DEDALO_SECTION_USERS_TIPO);
			$user_security_tools_dato = $user_component_security_tools->get_dato();

			$user_component_security_tools  = component_common::get_instance('component_security_tools',
																		DEDALO_COMPONENT_SECURITY_TOOLS_PROFILES_TIPO,
																		$section_profile_id,
																		'edit',
																		DEDALO_DATA_NOLAN,
																		DEDALO_SECTION_PROFILES_TIPO);
			$user_component_security_tools->set_dato($user_security_tools_dato);
			$user_component_security_tools->Save();

		return $section_profile_id;
		
	}#end create_profile_from_user
	*/





}
?>