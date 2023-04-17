<?php
/**
* JSON_HANDLER
*
*
*/
class json_handler {



	protected static $_messages = array(
		JSON_ERROR_NONE				=> 'No error has occurred',
		JSON_ERROR_DEPTH			=> 'The maximum stack depth has been exceeded',
		JSON_ERROR_STATE_MISMATCH	=> 'Invalid or malformed JSON',
		JSON_ERROR_CTRL_CHAR		=> 'Control character error, possibly incorrectly encoded',
		JSON_ERROR_SYNTAX			=> 'Syntax error',
		JSON_ERROR_UTF8				=> 'Malformed UTF-8 characters, possibly incorrectly encoded'
	);



	/**
	* JSON ENCODE
	* Unified json_encode method with error control
	*/
	public static function encode($value, $options=JSON_UNESCAPED_UNICODE) {

		$result = json_encode($value, $options);

		// success case
			if($result!==false) {
				return $result;
			}

		// error case
			if(SHOW_DEBUG===true) {

				$type = gettype($value);
				dump($result, ' result (json_encoded) ++ '.to_string());
				dump($value,  ' value - type: '.to_string($type));
				trigger_error("json_handler GETTYPE: ".$type);

				if ($type==='string') {
					$encoding = mb_detect_encoding($value);
					trigger_error("MB_DETECT_ENCODING: ".$encoding);
				}
				dump(debug_backtrace(), ')))) debug_backtrace() ++ '.to_string());
			}

			debug_log(__METHOD__
				. " JSON encode error " .PHP_EOL
				. 'value: ' . print_r($value, true) .PHP_EOL
				. 'json_last_error: '.json_last_error() .PHP_EOL
				. 'json_last_error_msg: '.json_last_error_msg() .PHP_EOL
				. json_handler::$_messages[json_last_error()] ?? 'Unknown error'
				, logger::ERROR
			);

			throw new RuntimeException(static::$_messages[json_last_error()]);
	}//end encode



	/**
	* JSON DECODE
	*/
	public static function decode(string $json, bool $assoc=false) {

		$result = json_decode($json, $assoc);

		// check errors
			if (json_last_error()!==JSON_ERROR_NONE) {
				debug_log(__METHOD__
					. " Error on decode JSON value: " .PHP_EOL
					. 'json_last_error: '.json_last_error() .PHP_EOL
					. 'json_last_error_msg: '.json_last_error_msg() .PHP_EOL
					, logger::ERROR
				);
			}

		return $result;

		/*
		# NORMAL FUNCTION
		if(SHOW_DEBUG!==true) {

			$result = json_decode($json, $assoc);

			return $result;

		# DEBUG JSON FUNCTION
		}else{

			try{

				$result = json_decode($json, $assoc);
				if($result) {
					return $result;
				}

				if(SHOW_DEBUG) {
					#dump(debug_backtrace(), "JSON ERROR BACKTRACE");#die();
					#throw new Exception("Error Processing Request", 1);
				}

				if (json_last_error()!=JSON_ERROR_NONE) {
					#dump(debug_backtrace(), "JSON ERROR BACKTRACE");#die();
					#dump($json,"json error "); //[0]['function'];
					#throw new Exception("Error Processing Request", 1);
				    #throw new RuntimeException(static::$_messages[json_last_error()]. " -> $json");
				}

			}catch(Exception $e){

				$msg = "json_decode Message: " .$e->getMessage();
				#throw new Exception("$msg", 1);
				#dump($e);
				dump($json, "json catch Exception ".to_string($msg));
				trigger_error("$msg", E_USER_ERROR);
				debug_log(__METHOD__
					. " Error on decode JSON value: " .PHP_EOL
					. $msg.PHP_EOL
					. json_last_error_msg()
					, logger::ERROR
				);
			}
		}*/
	}//end decode



	/**
	* TEST_JSON
	* @param string $value
	*/
	public static function test_json( string $value ) {

		if ((substr($value, 0, 1) === '{' || substr($value, 0, 1) === '[') && ($json = json_decode($value, true))) {
			return $json;
		}

		return $value;
	}//end test_json



}//end class json_handler
