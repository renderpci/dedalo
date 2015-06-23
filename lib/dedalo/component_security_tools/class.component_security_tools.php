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
	protected static function get_ar_user_tools_by_user($user_id_matrix) {

		# Verify user value
		if( abs($user_id_matrix) < 1 ) return array();

		static $ar_user_tools;		
		if(isset($ar_user_tools)) return($ar_user_tools);		

		if(isset($_SESSION['dedalo4']['config']['ar_user_tools_by_user'][$user_id_matrix])) return $_SESSION['dedalo4']['config']['ar_user_tools_by_user'][$user_id_matrix];

		if(SHOW_DEBUG) $start_time = start_time();

		# If user is global admin, return all existing tools
		$is_global_admin = component_security_administrator::is_global_admin($user_id_matrix); 
		if ($is_global_admin) {
			$ar_user_tools = component_security_tools::get_ar_tools();
			return $ar_user_tools ;
		}

		#$component_security_tools = new component_security_tools(DEDALO_COMPONENT_SECURITY_TOOLS_USER_TIPO, $user_id_matrix,'edit',DEDALO_DATA_NOLAN);
		$component_security_tools = component_common::get_instance('component_security_tools', DEDALO_COMPONENT_SECURITY_TOOLS_USER_TIPO, $user_id_matrix, 'edit', DEDALO_DATA_NOLAN, DEDALO_SECTION_USERS_TIPO);
		$dato 					  = $component_security_tools->get_dato();

		if (is_array($dato)) foreach($dato as $tool_name => $value) {
			$ar_user_tools[] 		= $tool_name;
		}
		#dump($ar_user_tools,'$ar_user_tools');

		if(SHOW_DEBUG) {
			#$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, 'GET_AR_USER_TOOLS_BY_USER' );
		}

		$_SESSION['dedalo4']['config']['ar_user_tools_by_user'][$user_id_matrix] = $ar_user_tools;

		return $ar_user_tools ;
	}




	
	
}
?>