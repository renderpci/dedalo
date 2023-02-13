<?php
/*
* CLASS BABEL
*
*
*/
class babel_transcriber {



	protected $url; // string babel engine uri
	protected $key; // string
	protected $lang; // string dedalo lang
	protected $lang_tld2; // string tld2
	protected $av_url; // string full absolute
	protected $engine; // string babel_transcription
	protected $user_id; //int
	protected $entity_name; // string
	protected $transcription_ddo; // object



	/**
	* __CONSTRUCT
	* @param object $options
	*/
	public function __construct(object $options) {

		// options
		$this->url					= $options->url;
		$this->key					= $options->key		?? null;
		$this->lang					= $options->lang	?? null;
		$this->lang_tld2			= $options->lang_tld2	?? null;
		$this->av_url				= $options->av_url;
		$this->engine				= $options->engine;
		$this->user_id				= $options->user_id;
		$this->entity_name			= $options->entity_name;
		$this->transcription_ddo	= $options->transcription_ddo;
	}//end __construct



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


	/**
	* CHECK_TRANSCRIBER_STATUS
	* Ask to babel server if the process is working or was finished
	* If Babel is working try to call every X seconds doing a recursion by itself
	* Babel send 3 status
	* 	1 - the pid and the file do not exist and nothing can do
	* 	2 - the pid is active, the process is working, try call later
	* 	3 - the pid is not active but the file with the result exist, process is done so call to process the result with process_file()
	* @param object $options
	* 	Returns last line on success or false on failure.
	* @return void
	*/
	public static function check_transcriber_status(object $options) : void {

		// options
			$transcription_ddo	= $options->transcription_ddo;
			// http query vars
			$fields = [
				'key'				=> $options->key,
				'url'				=> $options->url,
				'lang'				=> $options->lang,
				'av_url'			=> $options->av_url,
				'engine'			=> $options->engine,
				'method_name'		=> 'check_status',
				'user_id'			=> $options->user_id,
				'entity_name'		=> $options->entity_name,
				'pid'				=> $options->pid
			];

		// curl request (core functions)
			$request_response = curl_request((object)[
				'url'			=> $options->url,
				'postfields'	=> $fields,
				'header'		=> false
			]);
			$response	= json_decode($request_response->result);
			$result		= $response->result;

		// debug
			debug_log(__METHOD__." babel: ----> result ".PHP_EOL.to_string($response), logger::DEBUG);

		// status switch
			switch ($result->status) {
				case 1:
					// no pid, no file to get data
					debug_log(__METHOD__." Babel: no pid, no file to get data: ".to_string($result->status), logger::DEBUG);
					break;

				case 2:
					// processing try later
					$seconds = 4;
					sleep($seconds);
					babel_transcriber::check_transcriber_status($options);
					break;

				case 3:
					// process done get the json data and save it.
					babel_transcriber::process_file((object)[
						'lang'					=> $options->lang,
						'transcription_ddo'		=> $transcription_ddo,
						'transcription_data'	=> $result->transcription_data
					]);
					break;

				default:
					debug_log(__METHOD__." Error. status not valid: ".to_string($result->status), logger::ERROR);
					break;
			}
	}//end check_transcriber_status




	/**
	* PROCESS_FILE
	*
	* @param object $options
	* 	Returns last line on success or false on failure.
	*/
	public static function process_file(object $options) {

		$lang				= $options->lang;
		$transcription_ddo	= $options->transcription_ddo;
		$transcription_data	= $options->transcription_data;

		$model = RecordObj_dd::get_modelo_name_by_tipo($transcription_ddo->component_tipo);

		$component_transcription = component_common::get_instance(
			$model, // string model
			$transcription_ddo->component_tipo, // string tipo
			$transcription_ddo->section_id, // string section_id
			'list', // string modo
			$lang, // string lang
			$transcription_ddo->section_tipo // string section_tipo
		);


		$component_transcription->set_dato(json_encode($transcription_data));
		$component_transcription->Save();

	}//end process_file


}//end class babel
