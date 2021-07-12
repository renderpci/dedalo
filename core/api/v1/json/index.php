<?php
$start_time=microtime(1);
	
	// Turn off output buffering
	ini_set('output_buffering', 'off');
	// Turn off PHP output compression
	// ini_set('zlib.output_compression', false);
			
	//Flush (send) the output buffer and turn off output buffering
	//ob_end_flush();
	// while (@ob_end_flush());
			
	// Implicitly flush the buffer(s)
	// ini_set('implicit_flush', true);
	// ob_implicit_flush(true);



	// header print as json data
		header('Content-Type: application/json');



	// get post vars
		$str_json = file_get_contents('php://input');
		//error_log(print_r($str_json,true));
		if (!empty($str_json)) {
			$rqo = json_decode( $str_json );
			// to prevent php session lock. On true, set session as read only to prevent lock
			// define('PREVENT_SESSION_LOCK', ($rqo->prevent_lock ?? false));
		}



	// includes
		// config dedalo
		include dirname(dirname(dirname(dirname(dirname(__FILE__))))) .'/config/config.php';
		// json dd_manager
		include dirname(dirname(__FILE__)) .'/common/class.dd_manager.php';



	// prevent_lock from session
		if (isset($rqo->prevent_lock) && $rqo->prevent_lock===true) {
			// close current session and set as only read
			session_write_close();
		}

		

	// dd_dd_manager
		try {

			$dd_manager	= new dd_manager();
			$result		= $dd_manager->manage_request( $rqo );
			// throw new Exception('foo');

			// close current session and set as only read
			session_write_close();


		// } catch (Throwable $e) { // For PHP 7
			
		// 	$result = new stdClass();
		// 		$result->result	= false;
		// 		$result->msg	= (SHOW_DEBUG===true)
		// 			? 'Throwable Exception when calling Dédalo API: '.PHP_EOL.'  '. $e->getMessage()
		// 			: 'Throwable Exception when calling Dédalo API. Contact with your admin';
		// 		$result->debug	= (object)[
		// 			'rqo' => $rqo
		// 		];
			
		// 	trigger_error($e->getMessage());
		
		} catch (Exception $e) { // For PHP 5
			
			$result = new stdClass();
				$result->result	= false;
				$result->msg	= (SHOW_DEBUG===true)
					? 'Exception when calling Dédalo API: '.PHP_EOL.'  '. $e->getMessage()
					: 'Exception when calling Dédalo API. Contact with your admin';
				$result->debug	= (object)[
					'rqo' => $rqo
				];

			trigger_error($e->getMessage());
		}
		
	
	// output the result json string
		$output_string = json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

	
	// output_string_and_close_connection
		function output_string_and_close_connection($string_to_output) {
			// set_time_limit(0);
			ignore_user_abort(true);   
			// buffer all upcoming output - make sure we care about compression:
			if(!ob_start("ob_gzhandler"))
			    ob_start();        
			echo $string_to_output;   
			// get the size of the output
			$size = ob_get_length();
			// send headers to tell the browser to close the connection   
			header("Content-Length: $size");
			header('Connection: close');
			// flush all output
			ob_end_flush();
			// ob_flush();
			flush();   
			// close current session
			// if (session_id()) session_write_close();
		}


	// output_string_and_close_connection($output_string);
	echo $output_string;

