<?php
/*
	CLASS REST
	Simple RESTfull class
*/


class rest {

	protected $rest_config;		# object global set in config
	protected $obj_post;		# object request (normally http post)
	public $data;				# object portion of obj_post that contain section data


	function __construct( $obj_post ) {
		global $rest_config; # Set in config file

		$this->rest_config  = (object)$rest_config;
		$this->obj_post 	= (object)$obj_post;
		$this->data 		= json_decode( $this->obj_post->data );

		# Always check that current call is authorized (remember set config : rest_config)
		$this->verify_secure_call();
	}


	/**
	* VERIFY_SECURE_CALL
	* If call is not authorized, die with error
	*/
	private function verify_secure_call( ) {		

		if (!isset($this->rest_config->auth_code)) {
			die("Error. Wrong authorization config");
		}else if( $this->data->auth_code != $this->rest_config->auth_code ) {
			die("Error. Authorization code failed");
		}else if (!in_array($_SERVER['REMOTE_ADDR'], (array)$this->rest_config->source_ip)) {
			die("Error. Authorization source failed");			
		}

		# Set user
		if (!isset($_SESSION['dedalo4']['auth']['user_id'])) {
			$_SESSION['dedalo4']['auth']['user_id'] = $this->rest_config->user_id;
		}
		
	}


	/**
	* FORMAT_SECTION_OBJ
	* Modify source section obj
	* @param obj $section_obj (full section json object 'dato' from db)
	* @param string $mode default 'simple'
	* @return obj $new_section_obj formated
	*/
	function format_section_obj( $section_obj, $mode='simple' ) {
		$new_section_obj = new stdClass();

		switch ($mode) {
			case 'simple':
				# Remove valor, valor list from result
				foreach ($section_obj->components as $component_tipo => $component_value) {
					if (property_exists($component_value, 'valor')) {
						unset($component_value->valor);
					}
					if (property_exists($component_value, 'valor_list')) {
						unset($component_value->valor_list);
					}
				}
				$new_section_obj = $section_obj;
				break;
			
			default:
				$new_section_obj = $section_obj;
				break;
		}

		return (object)$new_section_obj;

	}#end convert_section


	/**
	* ADD_REST_INFO
	* Agregate one object with user_id and other rest info to received object
	*/
	public function add_rest_info( &$obj ) {

		# Add rest info into the object
		$rest_info = new stdClass();
			$rest_info->user_id 	= navigator::get_user_id();
			$rest_info->source_ip 		= $_SERVER['REMOTE_ADDR'];
			$rest_info->time_ms 		= round( microtime(TRUE) - $_SERVER['REQUEST_TIME'] ,4)*1000;
			$rest_info->memory_usage 	= tools::get_memory_usage('pid');

		$obj->rest_info = $rest_info;

		return $obj;
	}


	/**
	* ADD_HEADERS
	* @param string $content
	*/
	static function add_headers( $content ) {
		return $content;

		# HEADERS
		header("Cache-Control: private, max-age=10800, pre-check=10800");
		header("Pragma: private");
		header("Expires: " . date(DATE_RFC822,strtotime(" 1 day")));

		# show header for html
		# header('Content-Type: text/html; charset=utf-8');
		header('Content-Type: application/json');

		return $content;
	}#end add_headers




	


}
?>