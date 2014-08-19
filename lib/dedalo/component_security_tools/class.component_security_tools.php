<?php
/*
* CLASS COMPONENT SECURITY TOOLS
*/


class component_security_tools extends component_common {

	# Overwrite __construct var lang passed in this component
	protected $lang 	= DEDALO_DATA_NOLAN;

	public static $ar_tools ;

	protected static $users_matrix_table = 'matrix';
	
	/*
	* GET_AR_TOOLS
	* Read dir 'component_tools' and return array of first level folders name like 'tool_lang,..'
	*/
	public static function get_ar_tools() {

		if (isset(self::$ar_tools)) {
			return self::$ar_tools;
		}

		$tools_path 	= DEDALO_LIB_BASE_PATH . '/component_tools';
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
			return 	self::$ar_tools ;		
		}

	}#end get_ar_tools


	public static function is_authorized_tool_for_logged_user($tool_name) {
		
		$auth_tools = component_security_tools::get_ar_user_tools_by_user( navigator::get_userID_matrix() );

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
		if( (int)$user_id_matrix < 1 ) return array();

		static $ar_user_tools;		
		if(isset($ar_user_tools)) return($ar_user_tools);		

		if(isset($_SESSION['config4']['ar_user_tools_by_user'][$user_id_matrix])) return $_SESSION['config4']['ar_user_tools_by_user'][$user_id_matrix];

		if(SHOW_DEBUG) $start_time = start_time();

		# If user is global admin, return all existing tools
		$is_global_admin = component_security_administrator::is_global_admin($user_id_matrix);
		if ($is_global_admin) {
			$ar_user_tools = component_security_tools::get_ar_tools();
			return $ar_user_tools ;
		}

		# Get security_tools structure tipo
		# Search matrix data
		$arguments=array();
		$arguments['strPrimaryKeyName']	= 'tipo';
		$arguments['parent']			= $user_id_matrix;
		$matrix_table 					= self::$users_matrix_table;
		$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
		$ar_records						= $RecordObj_matrix->search($arguments);

		$tipo = null;
		foreach ($ar_records as $current_tipo) {
			$modelo_name 				= RecordObj_ts::get_modelo_name_by_tipo($current_tipo);
			if ($modelo_name=='component_security_tools') {
				$tipo = $current_tipo;
				break;
			}
		}
		if (empty($tipo)) {
			return array();
		}

		# Get security_tools matrix record
		# Search matrix data
		$arguments=array();
		$arguments['parent']			= $user_id_matrix;
		$arguments['tipo']				= $tipo;
		$matrix_table 					= self::$users_matrix_table;
		$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
		$ar_records						= $RecordObj_matrix->search($arguments);	#dump($ar_records,'ar_records');

		if (empty($ar_records[0])) {
			return array();
		}else if (count($ar_records)>1) {
			throw new Exception("Error Processing Request. More than one record found ", 1);
		}else{
			# id matrix
			$id_matrix = $ar_records[0];
		}		

		# Create component_security_tools and get record data formated as array
		$modelo_name 				= RecordObj_ts::get_modelo_name_by_tipo($tipo);
		$component_security_tools 	= new component_security_tools($id_matrix,$tipo);	#($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
		$ar_user_tools 				= array();

		$dato 						= $component_security_tools->get_dato();

		if (is_array($dato)) foreach($dato as $tool_name => $value) {
			$ar_user_tools[] 		= $tool_name;
		}
		#dump($ar_user_tools,'$ar_user_tools');

		if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, 'GET_AR_USER_TOOLS_BY_USER' );

		$_SESSION['config4']['ar_user_tools_by_user'][$user_id_matrix] = $ar_user_tools;

		return $ar_user_tools ;
	}




	
	
}
?>