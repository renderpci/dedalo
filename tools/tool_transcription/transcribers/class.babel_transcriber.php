<?php
/*
* CLASS BABEL
*
*
*/
class babel_transcriber {



	/**
	* transcribe
	* Connect with BABEL API across CURL to get transcription result as text
	* @param object $request_options
	* @return object $response
	*/
	public function transcribe(): object {

		// http query vars
			$fields = [
				'key'			=> $this->key,
				'lang_tld2'		=> $this->lang_tld2,
				'av_url'		=> $this->av_url,
				'engine'		=> $this->engine,
				'method_name'	=> 'transcribe',
				'user_id'		=> $this->user_id,
				'entity_name'	=> $this->entity_name
			];

		// curl request (core functions)
			$request_response = curl_request((object)[
				'url'			=> $this->url,
				'postfields'	=> $fields,
				'header'		=> false
			]);

			$response = json_decode($request_response->result);

		// result
			debug_log(__METHOD__." babel:transcribe ----> raw_result ".PHP_EOL.to_string($response), logger::DEBUG);


		return (object)$response;
	}//end transcribe


	/**
	* CHECK_TRANSCRIPTION
	* launch execution of sh file to check status of babel process
	* @return object $response
	*/
	public function check_transcription($pid) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';

		// process_file
			$process_file	= DEDALO_CORE_PATH.'/base/process_runner.php';

		// sh_data
			$sh_data = [
				'server' => [
					'HTTP_HOST'		=> $_SERVER['HTTP_HOST'],
					'REQUEST_URI'	=> $_SERVER['REQUEST_URI'],
					'SERVER_NAME'	=> $_SERVER['SERVER_NAME']
				],
				'session_id'	=> session_id(),
				'user_id'		=> $this->user_id
			];

		// additional data
			$params = (object)[
				'key'				=> $this->key,
				'url'				=> $this->url,
				'lang'				=> $this->lang,
				'av_url'			=> $this->av_url,
				'engine'			=> $this->engine,
				'user_id'			=> $this->user_id,
				'entity_name'		=> $this->entity_name,
				'transcription_ddo'	=> $this->transcription_ddo,
				'pid'				=> $pid
			];
			$data = [
				'class_name'	=> 'babel_transcriber',
				'method_name'	=> 'check_transcriber_status',
				'file'			=> __FILE__,
				'params'		=> $params
			];
			foreach ($data as $key => $value) {
				$sh_data[$key] = $value;
			}

		// server_vars
			$server_vars = json_encode($sh_data, JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);

		// output. $output = '> /dev/null &';
			// $output = '> /dev/null &';

		// command
			$php_command = PHP_BIN_PATH ." $process_file '$server_vars'";

		// final command
			$command = 'nohup '.$php_command.' > /dev/null 2>&1 & echo $!';

		// debug
			debug_log(__METHOD__.
				" ------> COMMAND CHECK_TRANSCRIPTION: $process_file --------------------------------------------------------:"
				.PHP_EOL.PHP_EOL. $command .PHP_EOL,
				logger::DEBUG
			);

		// exec command
			exec($command);

		// response
			$response->result	= true;
			$response->msg		= 'OK, command executing';


		return $response;
	}//end check_transcription
			$fields = [
				'key'			=> $key,
				'lang'			=> $lang,
				'av_url'		=> $av_url,
				'engine'		=> $engine,
				'user_id'		=> $user_id,
				'entity_name'	=> $entity_name
			];

		// curl request (core functions)
			$request = curl_request((object)[
				'url'			=> $url,
				'postfields'	=> $fields,
				'header'		=> false
			]);
			$result = $request->result;

		// raw result
			$raw_result = $result;
			debug_log(__METHOD__." babel:transcribe ----> raw_result ".PHP_EOL.to_string($raw_result), logger::DEBUG);

		// check invalild response or error
			$ar_invalid_respone = array('Error: Mode','Error. You need authorization');
			foreach ($ar_invalid_respone as $invalid_respone) {
				if( strpos($result, $invalid_respone)!==false ) {
					$response->msg = 'Trigger Error: ['.__FUNCTION__.'] '.$result;
					return $response;
				}
			}

		// decode html entities. Babel returns the special characters encoded as html entities.
		// To reverse the format we use html_entity_decode converting double quotes to
		// simple (flag ENT_COMPAT) and forcing the final format to UTF-8
			$result = html_entity_decode($result, ENT_COMPAT, 'UTF-8');


		// response object
			$response = new stdClass();
				$response->result		= $result;
				$response->msg			= 'Ok. Request done ['.__FUNCTION__.']';
				$response->raw_result	= $raw_result;


		return (object)$response;
	}//end transcribe




}//end class babel
