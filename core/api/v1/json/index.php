<?php
$start_time=microtime(1);


	// header print as json data
		header('Content-Type: application/json');


	// includes
		// config dedalo
		include dirname(dirname(dirname(dirname(dirname(__FILE__))))) .'/config/config.php';
		// json dd_manager
		include dirname(dirname(__FILE__)) .'/common/class.dd_manager.php';


	// get post vars
		$str_json = file_get_contents('php://input');
		//error_log(print_r($str_json,true));
		if (!empty($str_json)) {
			$rqo = json_decode( $str_json );
		}


	// dd_dd_manager
		try {

			$dd_manager	= new dd_manager();
			$result		= $dd_manager->manage_request( $rqo );
			// throw new Exception('foo');

		// } catch (Throwable $e) { // For PHP 7
			
		// 	$result = new stdClass();
		// 		$result->result	= false;
		// 		$result->msg	= (SHOW_DEBUG===true)
		// 			? 'Throwable Exception when calling Dédalo API: '.PHP_EOL.'  '. $e->getMessage()
		// 			: 'Throwable Exception when calling Dédalo API. Contact with your admin';
			
		// 	trigger_error($e->getMessage());
		
		} catch (Exception $e) { // For PHP 5
			
			$result = new stdClass();
				$result->result	= false;
				$result->msg	= (SHOW_DEBUG===true)
					? 'Exception when calling Dédalo API: '.PHP_EOL.'  '. $e->getMessage()
					: 'Exception when calling Dédalo API. Contact with your admin';

			trigger_error($e->getMessage());
		}
		
	
	// output the result json string
		echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);


