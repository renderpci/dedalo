<?php
/*
* CLASS COMPONENT SECURITY TOOLS
*/


class component_security_tools extends component_common {

	# Overwrite __construct var lang passed in this component
	protected $lang 	= DEDALO_DATA_NOLAN;

	public static $ar_tools ;
	

	# GET DATO : Format {"tool_indexation":"2","tool_upload":"2"}
	public function get_dato() {
		$dato = parent::get_dato();
		return (array)$dato;
	}

	# SET_DATO
	public function set_dato($dato) {
		parent::set_dato( (object)$dato );
	}


	
	/*
	* GET_AR_TOOLS
	* Read dir 'tools' and return array of first level folders name like 'tool_lang,..'
	*/
	public static function get_ar_tools() {
	
		if (isset(self::$ar_tools)) {
			return self::$ar_tools;
		}

		$tools_path 	= DEDALO_LIB_BASE_PATH . '/tools';
		$ar_excluded 	= array('.',
								'..',
								'.DS_Store',
								'acc',
								'tool_common',
								'tool_container',
								'tool_upload_jquery');
		$ar_tools = array();
		if ($folder_content = opendir( $tools_path )) {			
			
			while (false !== ($file_name = readdir($folder_content))) {
				if ( !in_array($file_name, $ar_excluded) ) {
					
					$ar_tools[] = substr($file_name,0);
				}
			}
			closedir($folder_content);
			# Fix static value
			self::$ar_tools = $ar_tools;

			#dump($ar_tools," ar_tools");

			return 	self::$ar_tools ;		
		}

	}#end get_ar_tools

	/**
	* GET_AR_TOOLS_RESOLVED
	* @return 
	*/
	public function get_ar_tools_resolved( $sort=true ) {
		
		$ar_tools = self::get_ar_tools();

		$ar_tools_resolved = array();
		foreach ($ar_tools as $tool_name) {
			$tool_label = label::get_label($tool_name);
			$ar_tools_resolved[$tool_name] = trim($tool_label);
		}

		if ($sort) {
			asort($ar_tools_resolved);
		}
	
		return $ar_tools_resolved;

	}#end get_ar_tools_resolved


	public static function is_authorized_tool_for_logged_user($tool_name) {
		
		$auth_tools = (array)component_security_tools::get_ar_user_tools_by_user( navigator::get_user_id() );

		if (in_array($tool_name, $auth_tools)) {
			return true;
		}else{
			return false;
		}		
	}

	/*
	* GET_AR_USER_TOOLS
	*/
	protected function get_ar_user_tools() {

		$ar_user_tools = array();

		$dato = $this->get_dato();

		if (is_array($dato)) foreach($dato as $tool_name => $value) {
			$ar_user_tools[] = $tool_name;
		}

		return $ar_user_tools ;

	}#end get_ar_user_tools


	/*
	* GET_AR_USER_TOOLS (STATIC)
	*/
	protected static function get_ar_user_tools_by_user( $user_id ) {

		# Verify user value
		if( abs($user_id) < 1 ) return array();

		static $ar_user_tools;		
		if(isset($ar_user_tools)) return($ar_user_tools);		

		if(isset($_SESSION['dedalo4']['config']['ar_user_tools_by_user'][$user_id])) return $_SESSION['dedalo4']['config']['ar_user_tools_by_user'][$user_id];

		if(SHOW_DEBUG) $start_time = start_time();

		# If user is global admin, return all existing tools
		$is_global_admin = component_security_administrator::is_global_admin($user_id); 
		if ($is_global_admin) {
			$ar_user_tools = component_security_tools::get_ar_tools();
			return $ar_user_tools ;
		}


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
			return array();
		}

		#$component_security_tools = new component_security_tools(DEDALO_COMPONENT_SECURITY_TOOLS_USER_TIPO, $user_id,'edit',DEDALO_DATA_NOLAN);
		$component_security_tools = component_common::get_instance('component_security_tools',
																	DEDALO_COMPONENT_SECURITY_TOOLS_PROFILES_TIPO,
																	$profile_id,
																	'edit',
																	DEDALO_DATA_NOLAN,
																	DEDALO_SECTION_PROFILES_TIPO);
		$dato 					  = $component_security_tools->get_dato();

		if (is_array($dato)) foreach($dato as $tool_name => $value) {
			$ar_user_tools[] 		= $tool_name;
		}
		#dump($ar_user_tools,'$ar_user_tools');		

		$_SESSION['dedalo4']['config']['ar_user_tools_by_user'][$user_id] = $ar_user_tools;

		return $ar_user_tools ;
	}




	
	
}
?>