<?php
$start_time=microtime(1);

	// includes
		// config dedalo
		include dirname(dirname(dirname(dirname(__FILE__)))) .'/config/config4.php';
		// json manager
		include dirname(dirname(__FILE__)) .'/common/class.manager.php';
		// web_data
		include dirname(dirname(__FILE__)) .'/common/class.dd_api.php';


	// get post vars
		$str_json = file_get_contents('php://input');
		//error_log(print_r($str_json,true));
		if (!empty($str_json)) {
			$options = json_decode( $str_json );
		}
		

	// header print as json data
		header('Content-Type: application/json');


	// manager
		try {
			$manager 	 = new manager();
			$dedalo_data = $manager->manage_request( $options );
			$result 	 = json_encode($dedalo_data, JSON_UNESCAPED_UNICODE);
			echo $result;
		} catch (Exception $e) {
			$error_obj = new stdClass();
				$error_obj->result 	= false;
				$error_obj->msg 	= 'Exception when calling Dédalo API: '. $e->getMessage();
			$result = json_encode($error_obj, JSON_UNESCAPED_UNICODE);
			echo $result;
		}