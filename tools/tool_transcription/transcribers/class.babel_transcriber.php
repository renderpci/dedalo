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
	public static function transcribe(object $options): object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// Options
			$url			= $options->url;
			$key			= $options->key		?? null;
			$lang			= $options->lang	?? null;
			$av_url			= $options->av_url;
			$engine			= $options->engine;
			$user_id		= $options->user_id;
			$entity_name	= $options->entity_name;


		// http query vars
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
