<?php
/*
* CLASS BABEL_TRANSCRIBER
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
	protected $quality; // string quality for transcription engine || false
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
			$this->key					= $options->key ?? null;
			$this->lang					= $options->lang ?? null;
			$this->lang_tld2			= $options->lang_tld2 ?? null;
			$this->av_url				= $options->av_url;
			$this->engine				= $options->engine;
			$this->quality				= $options->quality;
			$this->user_id				= $options->user_id;
			$this->entity_name			= $options->entity_name;
			$this->transcription_ddo	= $options->transcription_ddo;
	}//end __construct



	/**
	* TRANSCRIBE
	* Connect with BABEL API across CURL to get transcription result as text
	* @return object $response
	*/
	public function transcribe(): object {

		// http query vars
			$fields = [
				'key'			=> $this->key,
				'engine'		=> $this->engine,
				'quality'		=> $this->quality,
				'user_id'		=> $this->user_id,
				'entity_name'	=> $this->entity_name,
				'lang_tld2'		=> $this->lang_tld2,
				'av_url'		=> $this->av_url,
				'method_name'	=> 'transcribe'
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
	* EXEC_BACKGROUND_CHECK_TRANSCRIPTION
	* launch execution in background of sh file to check status of Babel server process
	* Use common process_runner to launch background process in /core/base
	* the check will be independent of the current thread.
	* Use the PID of the process sent by Babel server called by transcribe()
	* @param int $pid
	* @return object $response
	*/
	public function exec_background_check_transcription($pid) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';

		// process_file
			$process_file = DEDALO_CORE_PATH.'/base/process_runner.php';

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
				'method_name'	=> 'check_background_transcriber_status',
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
				" ------> COMMAND exec_background_check_transcription: $process_file --------------------------------------------------------:"
				.PHP_EOL.PHP_EOL. $command .PHP_EOL,
				logger::DEBUG
			);

		// exec command
			exec($command);

		// response
			$response->result	= true;
			$response->msg		= 'OK, command executing';


		return $response;
	}//end exec_background_check_transcription



	/**
	* CHECK_background_TRANSCRIBER_STATUS
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
	public static function check_background_transcriber_status(object $options) : void {

		// options
			$transcription_ddo	= $options->transcription_ddo;
		// 	// http query vars
		// 	$fields = [
		// 		'key'				=> $options->key,
		// 		'url'				=> $options->url,
		// 		'lang'				=> $options->lang,
		// 		'av_url'			=> $options->av_url,
		// 		'engine'			=> $options->engine,
		// 		'method_name'		=> 'check_status',
		// 		'user_id'			=> $options->user_id,
		// 		'entity_name'		=> $options->entity_name,
		// 		'pid'				=> $options->pid
		// 	];

		// // curl request (core functions)
		// 	$request_response = curl_request((object)[
		// 		'url'			=> $options->url,
		// 		'postfields'	=> $fields,
		// 		'header'		=> false
		// 	]);
		// 	$response	= json_decode($request_response->result);
		// 	$result		= $response->result;

		// set delete_result to true, babel will check in status=3 if the call is from server or client
		// only server call can delete the final data
		$options->delete_result = true;

		$result = babel_transcriber::check_transcriber_status($options);

		// debug
			debug_log(__METHOD__." babel: check_background_transcriber_status ----> result ".PHP_EOL.to_string($result), logger::DEBUG);

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
					babel_transcriber::check_background_transcriber_status($options);
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
	}//end check_background_transcriber_status



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
	* @return object
	*/
	public static function check_transcriber_status(object $options) : object {

			// HTTP query vars
			$fields = [
				'key'				=> $options->key,
				'url'				=> $options->url,
				'lang'				=> $options->lang ?? null,
				'av_url'			=> $options->av_url,
				'engine'			=> $options->engine,
				'method_name'		=> 'check_status',
				'user_id'			=> $options->user_id,
				'entity_name'		=> $options->entity_name,
				'pid'				=> $options->pid,
				'delete_result'		=> $options->delete_result
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
			debug_log(__METHOD__." babel: check_transcriber_status ----> result ".PHP_EOL.to_string($response), logger::DEBUG);

		return $result;
	}//end check_transcriber_status



	/**
	* PROCESS_FILE
	* Get automatic transcription and format it with Dédalo tags.
	* transcription_data comes as JSON format with every segment identify as object
	* use the start time to create the TC tag and join to the text segment
	* input format
	* {
	* 	text : "Can you say me..."
	* 	segments: [
	* 		{
	* 			start: 1.85
	* 			text : "Can you say me..."
	* 		},
	* 		{
	* 			start: 3.45
	* 			text : "blah blah..."
	* 		}
	* 	]
	* }
	* output format
	* 	[TC_00:00:01.850_TC] Can you say me... <p>
	* 	[TC_00:00:03.450_TC] blah blah...
	*
	* the output data is set to component_text_area data if it is not empty
	*
	* @param object $options
	* @return bool
	*/
	public static function process_file(object $options) : bool {

		$lang				= $options->lang;
		$transcription_ddo	= $options->transcription_ddo;
		$transcription_data	= $options->transcription_data;
		// get the fragments of transcription
		$segments = $transcription_data->segments;
		// if the transcription doesn't has any segment stop the process
		if(empty($segments)){
			return false;
		}
		// create data with formatted tc tags
		$ar_data = [];
		foreach ($segments as $current_segment) {
			// get the start in seconds
			$start	= $current_segment->start;
			// convert to TC
			$tc		= OptimizeTC::seg2tc($start);
			// add TC marks, enclose the tc with the pattern
			// [TC_00:00:00.000_TC]
			$tag = '[TC_'.$tc.'_TC]';
			$text	= $current_segment->text;
			// join the TC with the text of the fragment
			$segment_text_with_tc = $tag.$text;
			$ar_data[] = $segment_text_with_tc;
		}
		// join all segments whith paragraph between them.
		$data = implode('<p>', $ar_data);

		// create the text_area component
		$model = ontology_node::get_model_name_by_tipo($transcription_ddo->component_tipo);
		$component_transcription = component_common::get_instance(
			$model, // string model
			$transcription_ddo->component_tipo, // string tipo
			$transcription_ddo->section_id, // string section_id
			'list', // string modo
			$lang, // string lang
			$transcription_ddo->section_tipo // string section_tipo
		);

		// check if the component has any data to avoid delete user changes in data.
		// if the user want re-create the automatic transcription first need to delete previous data.
		$current_data = $component_transcription->get_dato();

		if(!empty($current_data) && !empty($current_data[0])){
			return false;
		}

		$component_transcription->set_dato($data);
		$component_transcription->Save();

		return true;
	}//end process_file



}//end class babel_transcriber
