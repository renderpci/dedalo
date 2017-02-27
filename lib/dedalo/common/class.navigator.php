<?php
require_once(DEDALO_LIB_BASE_PATH . '/common/class.Accessors.php');


/**
* NAVIGATOR CLASS
*/
class navigator extends Accessors {
	
	static $ar_vars;
	static $selected_root;		# by tipo like 'dd12'
	static $selected_area;		# by tipo like 'dd12'
	static $selected_module;	# by tipo like 'dd12'
	static $selected_section;	# by tipo like 'dd12'
	static $selected_modo;		# edit | list | search
	static $selected_context;
	static $selected_id;		# matrix id like 56
	static $selected_caller_id;	# matrix id like 56
	static $selected_caller_tipo;	# tipo like 'dd12'
	
	static $userID_matrix;		# matrix id like 56 (TEMPORAL..)
	static $user_id;			# section_id
	static $username;			# name like "Ramón"
	#static $page_query_string;	# 
	
	public function __construct() {
		
		self::$ar_vars = array('root','area','module','section','modo','id','caller_id','caller_tipo','context');
		
		# LOAD AND SET SESSION VARS
		self::get_session_vars();
		
		# LOAD AND SET HTTP VARS
		self::get_http_vars();
		
		# STORE SESSION VARS
		self::set_session_vars();
		
		#if(isset($_SESSION['dedalo4']['auth']['userID_matrix']))
		#self::$userID_matrix =  $_SESSION['dedalo4']['auth']['userID_matrix'];

		if(isset($_SESSION['dedalo4']['auth']['user_id']))
		self::$user_id =  $_SESSION['dedalo4']['auth']['user_id'];
		
		if(isset($_SESSION['dedalo4']['auth']['username']))
		self::$username =  $_SESSION['dedalo4']['auth']['username'];					#dump($_SESSION['dedalo4']['auth']['username'],'$_SESSION['dedalo4']['auth']['username']');
		
		# PAGE CURRENT QUERY STRING
		#self::$page_query_string	= common::get_page_query_string();
		
		# debug
		#echo self::show_vars();		
	}


	public static function get_user_id() {
		return navigator::$user_id;	
	}
	# Alias of get_user_id
	public static function get_userID_matrix() {
		return navigator::get_user_id();	
	}
	
	public static function get_username() {
		return navigator::$username;	
	}
	
	
	private function get_session_vars() {		
		
		foreach(self::$ar_vars as $name) {
			#eval( "if( isset(\$_SESSION['dedalo4']['config'][\$name]) ) self::\$selected_$name = \$_SESSION['dedalo4']['config'][\$name];" );
			if ( isset($_SESSION['dedalo4']['config'][$name]) ) {
				$var_name = 'selected_' . $name;
				self::$$var_name = $_SESSION['dedalo4']['config'][$name];
			}
		}
	}
	
	private function get_http_vars() {
		
		foreach(self::$ar_vars as $name) {
			eval( "if( !empty(\$_REQUEST[\$name]) ) self::\$selected_$name = \$_REQUEST[\$name];" );
		}
	}	
		
	private function set_session_vars() {
		/*
		# CUANDO CAMBIA EL ROOT, SE RESETEA HACIA ABAJO 
		if( isset($_SESSION['dedalo4']['config']['root']) && self::$selected_root != $_SESSION['dedalo4']['config']['root'] ) {
			self::$selected_area	= NULL;
			self::$selected_module	= NULL;
			self::$selected_section	= NULL;
			self::$selected_tipo		= NULL;
		}
		# CUANDO CAMBIA EL AREA, SE RESETEA HACIA ABAJO 
		if( isset($_SESSION['dedalo4']['config']['area']) && self::$selected_area != $_SESSION['dedalo4']['config']['area'] ) {
			self::$selected_module	= NULL;
			self::$selected_section	= NULL;
			self::$selected_id		= NULL;
		}
		# CUANDO CAMBIA EL MÓDULO, SE RESETEA HACIA ABAJO 
		if( isset($_SESSION['dedalo4']['config']['module']) && self::$selected_module != $_SESSION['dedalo4']['config']['module']) {
			self::$selected_section	= NULL;
			self::$selected_id		= NULL;
		}
		
		
		foreach(self::$ar_vars as $name) {
			eval( "\$_SESSION['dedalo4']['config'][\$name] = self::\$selected_$name ;" );
		}
		*/
		# force reset all
		#foreach(self::$ar_vars as $name) eval( "\$_SESSION['dedalo4']['config'][\$name] = NULL ;" );		
	}	
	
	
	
	# GET SELECTED VALUE FROM NAME
	public static function get_selected($name) {
		
		$var_name = 'selected_'. $name ;
		
		if(isset(self::$$var_name))	return self::$$var_name;
		
		# default for modo
		if($name==='modo') return 'list';
		
		return NULL;
	}
	
	/**
	* SET SELECTED VALUE FROM NAME
	* @param $name 
	*	String name of the var
	* @param $value
	*	String value
	*/
	public static function set_selected($name, $value) {
		
		$var_name = 'selected_'. $name ;
		
		self::$$var_name = $value;
		
		#$_SESSION['dedalo4']['config'][$name]	= $value;		
	}
	

	static function show_vars() {
		
		$distancia = '7px';
		
		#print_r(self::$ar_vars);		
		$html = 'NAVIGATOR:';
		$html .= "<span style=\"margin-left:$distancia\">user_id:<b>" .self::$user_id." ".self::$username."</b> </span>";
		
		$html .= "<span style=\"margin-left:$distancia\">root permissions:<b>" . DEDALO_PERMISSIONS_ROOT ."</b> </span>";
		
		#$html .= '<hr>';
		/**/
		foreach(self::$ar_vars as $name) {			
			$html .= " <span style=\"margin-left:$distancia\"> $name:<b>" ;
			$var_name = 'selected_'. $name ;
			$html .= self::$$var_name;
			$html .="</b> </span>";			
		}
		/*
		$html .= '<hr>';
		
		$html .= " <span style=\"margin-left:$distancia\"> root:<b>" ;		
		$html .= DEDALO_ROOT_TIPO;
		$html .="</b> </span>";	
		
		$html .= " <span style=\"margin-left:$distancia\"> area:<b>" ;		
		$html .= $_SESSION['dedalo4']['config']['area'];
		$html .="</b> </span>";	
		
		$html .= " <span style=\"margin-left:$distancia\"> module:<b>" ;		
		$html .= $_SESSION['dedalo4']['config']['module'];
		$html .="</b> </span>";
		
		$html .= " <span style=\"margin-left:$distancia\"> section:<b>" ;		
		$html .= $_SESSION['dedalo4']['config']['section'];
		$html .="</b> </span>";	
		*/		
		#$html .= '<hr>';
		
		return 	$html;
	}
	
	
}
?>