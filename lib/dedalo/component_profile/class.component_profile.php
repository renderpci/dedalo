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

		if(SHOW_DEBUG) {
			$traducible = $this->RecordObj_dd->get_traducible();
			if ($traducible=='si') {
				throw new Exception("Error Processing Request. Wrong component lang definition. This component $tipo (".get_class().") is not 'traducible'. Please fix this ASAP", 1);
			}
		}
	}

	
	# GET DATO : IS calculated, not get from database
	public function get_dato() {
		#$dato = parent::get_dato();

		# Default
		$dato = "0";

		return (string)$dato;
	}

	# SET_DATO
	public function set_dato($dato) {
		parent::set_dato( (string)$dato );
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
			$component  = component_common::get_instance('component_input_text', DEDALO_COMPONENT_NAME_PROFILES_TIPO, $section_id, 'edit', DEDALO_DATA_LANG, $section_tipo);
				#dump($component,"component ".DEDALO_APPLICATION_LANG);
			$name 		= $component->get_dato();
				#dump($name, ' name '.$strQuery);
			# Falta de fallback del idioma. Hacer más adelante			
			$this->ar_select_values[$section_id] = $name;
		}

		return $this->ar_select_values;
	}


	/**
	* APPLY_PROFILE
	* @see trigger.component_profile
	*/
	public static function apply_profile($selected_option, $current_user_id) {
		$msg='';

			#dump($selected_option, ' selected_option - current_user_id:'.$current_user_id);die();

		# COMPONENT_SECURITY_AREAS
			# SOURCE (PROFILE)
			$component_security_areas_profiles 	= component_common::get_instance('component_security_areas',DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO, $selected_option, 'edit', DEDALO_DATA_NOLAN, DEDALO_SECTION_PROFILES_TIPO);
			$security_areas_profiles_dato 		= $component_security_areas_profiles->get_dato();				
			# TARGET (USER)
			$component_security_areas_users 	= component_common::get_instance('component_security_areas',DEDALO_COMPONENT_SECURITY_AREAS_USER_TIPO, $current_user_id, 'edit', DEDALO_DATA_NOLAN, DEDALO_SECTION_USERS_TIPO);
			$component_security_areas_users->set_dato($security_areas_profiles_dato);
			$result = $component_security_areas_users->Save();

			if (!$result) {
				$msg.= "Error on save component_security_areas_users<br>";
				if(SHOW_DEBUG) {
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
				if(SHOW_DEBUG) {
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
				if(SHOW_DEBUG) {
					dump($security_tools_profiles_dato," security_tools_profiles_dato");
					throw new Exception("Error Processing Request", 1);
				}
			}

		if (empty($msg)) {
			$msg='ok';
		}

		return $msg;

	}#end apply_profile






}
?>