<?php
$start_time=microtime(1);

	// header print as json data
		header('Content-Type: application/json');


	// includes
		// config dedalo
		include dirname(dirname(dirname(dirname(dirname(__FILE__))))) .'/config/config.php';
		// json manager
		include dirname(dirname(__FILE__)) .'/common/class.manager.php';


	// get post vars
		$str_json = file_get_contents('php://input');
		//error_log(print_r($str_json,true));
		if (!empty($str_json)) {
			$options = json_decode( $str_json );
		}


	// manager
		$manager = new manager();

		if(SHOW_DEBUG===true) {

			$dedalo_data 		= $manager->manage_request( $options );
			$error_last  		= error_get_last();
			$error_last_print 	= print_r(error_get_last(), true);

			if (is_object($dedalo_data)) {
				if (!empty($error_last)) {
					$dedalo_data->error_msg = "ERRORS: " . $error_last_print;
				}
				$result = json_encode($dedalo_data, JSON_UNESCAPED_UNICODE);
			}else{
				$error_obj = new stdClass();
					$error_obj->result 	= false;
					$error_obj->msg 	= 'Error when calling Dédalo API';
				if (!empty($error_last)) {
					$error_obj->error_msg = "ERRORS: " . $error_last_print;
				}
				$result = json_encode($error_obj, JSON_UNESCAPED_UNICODE);
			}

		}else{

			try {
				$dedalo_data = $manager->manage_request( $options );
				$result 	 = json_encode($dedalo_data, JSON_UNESCAPED_UNICODE);
			} catch (Exception $e) {
				$error_obj = new stdClass();
					$error_obj->result 	= false;
					$error_obj->msg 	= 'Exception when calling Dédalo API: '. $e->getMessage();
				$result = json_encode($error_obj, JSON_UNESCAPED_UNICODE);

				trigger_error($e->getMessage());
			}
		}


		// verify result type
			$type = gettype($result);
			if ($type!=='string') {
				debug_log(__METHOD__." Invalid result type found. Changed to string ! ".to_string($result), logger::ERROR);

				$error_obj = new stdClass();
					$error_obj->result 	= false;
					$error_obj->msg 	= 'Error when calling Dédalo API. Invalid result!';
				$result = json_encode($error_obj, JSON_UNESCAPED_UNICODE);
			}


		// output the result json string
			echo $result;


