<?php
/**
* CLASS BABEL_TRANSCRIBER
* Client adapter for the Babel automatic speech-recognition (ASR) service.
*
* Babel is an external HTTP API that receives an audio file URL and returns
* a segmented transcription JSON. This class handles the full lifecycle of a
* single Babel transcription job:
*
*   1. transcribe()        — POST to Babel; returns immediately with a server PID.
*   2. exec_background_check_transcription() — forks a background PHP process
*      (via process_runner.php) that polls Babel until the job finishes.
*   3. check_background_transcriber_status() (static, BACKGROUND_RUNNABLE) —
*      the method actually executed by the forked process; recurses with sleep()
*      until Babel reports status 3 (done), then calls process_file().
*   4. check_transcriber_status() (static) — single-shot status poll; can also
*      be called from the browser via tool_transcription::check_server_transcriber_status.
*   5. process_file() (static) — converts Babel's segment JSON into Dédalo
*      timecode-tagged text and persists it to the target component_text_area.
*
* Data shape produced by Babel (transcription_data):
*   {
*     text: "full text ...",
*     segments: [
*       { start: 1.85, text: " Can you say me..." },
*       { start: 3.45, text: " blah blah..."       }
*     ]
*   }
*
* Output written to component_text_area (Dédalo TC-tag format):
*   [TC_00:00:01.850_TC] Can you say me...<p>[TC_00:00:03.450_TC] blah blah...
*
* Security: all outbound URLs are validated by is_safe_remote_url (SEC-076)
* before any cURL call is made. The static check_background_transcriber_status
* is gated by the BACKGROUND_RUNNABLE allowlist enforced in process_runner.php.
*
* Relationships:
*   - Instantiated by tool_transcription::automatic_transcription().
*   - Delegates PID-tracking polls to itself via process_runner.php (CLI).
*   - Uses OptimizeTC::seg2tc() to convert float seconds → 'HH:MM:SS.mmm'.
*   - Persists results through component_common::get_instance() +
*     component_text_area::set_data_lang() / save().
*
* @package Dédalo
* @subpackage Tools
*/
class babel_transcriber {



	/**
	* SEC: explicit allowlist of methods that may be invoked through
	* `process_runner.php` (CLI) via `exec_::request_cli`.
	* @see core/base/process_runner.php
	*/
	public const BACKGROUND_RUNNABLE = [
		'check_background_transcriber_status'
	];



	/**
	* Babel API endpoint URI (e.g. "https://babel.example.org/api/").
	* Injected from the tool config stored in the dd996 tools-configuration section.
	* @var string $url
	*/
	protected $url; // string babel engine uri

	/**
	* API authentication key sent with every Babel request.
	* May be null if the Babel instance does not require authentication.
	* @var string|null $key
	*/
	protected $key; // string

	/**
	* Dédalo language code for the audio content (e.g. "lg-nolan").
	* Stored so it can be forwarded to the background process without re-reading
	* the original options.
	* @var string|null $lang
	*/
	protected $lang; // string dedalo lang

	/**
	* ISO 639-1 two-letter language code derived from $lang (e.g. "en", "es").
	* Babel's API expects alpha-2 (tld2) rather than Dédalo's three-letter codes.
	* @var string|null $lang_tld2
	*/
	protected $lang_tld2; // string tld2

	/**
	* Fully-qualified public URL of the audio file to be transcribed.
	* Must be reachable by the Babel server; built from DEDALO_PROTOCOL + DEDALO_HOST
	* + component_av::get_url('audio').
	* @var string $av_url
	*/
	protected $av_url; // string full absolute

	/**
	* Identifier of the Babel transcription engine variant (e.g. "babel_transcriber").
	* Forwarded to Babel as the 'engine' POST field so the server can select the
	* correct ASR model.
	* @var string $engine
	*/
	protected $engine; // string babel_transcription

	/**
	* Quality/model tier for the transcription (e.g. "medium", "large").
	* Forwarded to Babel as the 'quality' POST field. False if the engine does not
	* support quality selection.
	* @var string|false $quality
	*/
	protected $quality; // string quality for transcription engine || false

	/**
	* Dédalo user ID of the user who triggered the transcription.
	* Forwarded to Babel so it can tag the job for monitoring, and passed into
	* the background-process descriptor so process_runner can authenticate.
	* @var int $user_id
	*/
	protected $user_id; //int

	/**
	* Dédalo entity/installation name (DEDALO_ENTITY constant).
	* Sent to Babel as 'entity_name' to namespace jobs per installation.
	* @var string $entity_name
	*/
	protected $entity_name; // string

	/**
	* Descriptor object identifying the target component_text_area where the
	* transcription result will be written. Shape:
	*   { component_tipo, section_id, section_tipo }
	* Forwarded to the background process so process_file() knows where to save.
	* @var object $transcription_ddo
	*/
	protected $transcription_ddo; // object



	/**
	* __CONSTRUCT
	* Initialises every property from the caller-supplied options object.
	* All eight fields are expected; lang and lang_tld2 fall back to null if omitted
	* (relevant when the source language is unknown at call time).
	* @param object $options - Must carry: url, av_url, engine, quality, user_id,
	*                          entity_name, transcription_ddo. Optional: key, lang,
	*                          lang_tld2.
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
	* Submit the audio file to Babel and receive the initial job response.
	*
	* POSTs the audio URL together with engine settings and credentials to the
	* configured Babel endpoint. Babel starts the ASR process asynchronously and
	* returns immediately with a result object that contains a 'pid' field (the
	* server-side process ID). The caller is expected to poll for completion via
	* exec_background_check_transcription() / check_transcriber_status().
	*
	* Security: the target URL is validated by is_safe_remote_url (SEC-076) before
	* the cURL call. Custom ports are allowed because Babel often runs on non-standard
	* ports within the institution's infrastructure.
	*
	* @return object - The JSON-decoded Babel response. On success: { result: { pid: int, ... } }.
	*                  On SSRF guard trip: { result: false, msg: 'invalid transcriber URL' }.
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

		// SEC-076: SSRF defence-in-depth on transcriber URL.
			if (!is_safe_remote_url((string)$this->url, (object)['allow_custom_ports' => true])) {
				debug_log(__METHOD__
					.' SEC-076: refused unsafe transcriber URL: ' . to_string($this->url)
					, logger::ERROR
				);
				return (object)['result' => false, 'msg' => 'invalid transcriber URL'];
			}

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
	* Fork a background PHP process that polls Babel until the job completes.
	*
	* Uses 'nohup … & echo $!' to detach a new PHP process (process_runner.php)
	* from the current HTTP request. That process calls
	* check_background_transcriber_status() in a loop (with sleep) until Babel
	* reports the job as done, then persists the result via process_file().
	*
	* The descriptor passed to process_runner encodes:
	*   - class_name / method_name / file  — dispatch target
	*   - params: all instance properties + the Babel PID
	*   - session_id + server vars         — so the CLI process can re-authenticate
	*
	* (!) check_background_transcriber_status must remain in BACKGROUND_RUNNABLE;
	*     process_runner.php will refuse to invoke it otherwise.
	*
	* @param int $pid - The Babel server-side process ID returned by transcribe().
	* @return object  - Always { result: true, msg: 'OK, command executing' }; exec()
	*                   errors are not propagated (background fire-and-forget).
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
			// Resolve the PHP binary rather than trusting the raw PHP_BIN_PATH constant: its catalog
			// default ('/usr/bin/php') does not exist on macOS/Homebrew or any non-standard layout,
			// and this command discards stderr, so a missing binary would fail silently.
			$php_bin = class_exists('system')
				? system::get_php_bin()
				: PHP_BIN_PATH;
			$php_command = escapeshellarg($php_bin) ." $process_file '$server_vars'";

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
	* CHECK_BACKGROUND_TRANSCRIBER_STATUS
	* Background entry-point: poll Babel until the job is done, then persist results.
	*
	* This static method is invoked by process_runner.php (CLI) in the forked
	* background process started by exec_background_check_transcription(). It is
	* listed in BACKGROUND_RUNNABLE so process_runner.php allows the call.
	*
	* Flow:
	*   1. Sets delete_result = true so that when Babel reaches status 3 the
	*      server-side result file is cleaned up (only the background server process
	*      may trigger deletion — client polls via check_server_transcriber_status
	*      pass delete_result = false).
	*   2. Calls check_transcriber_status() to query Babel.
	*   3. Interprets the three-state status:
	*        status 1 — PID and result file both absent; nothing to do, exit.
	*        status 2 — job still running; sleep 4 s then recurse.
	*        status 3 — job finished; call process_file() to convert and save.
	*
	* (!) The recursion in the status-2 branch runs inside the same PHP process.
	*     Deep recursion can exhaust the call stack for very long audio; consider
	*     the configured PHP max_execution_time for the CLI SAPI.
	*
	* (!) The commented-out curl_request block inside this method body was the
	*     original polling implementation. It is superseded by check_transcriber_status()
	*     and left in place for historical reference.
	*
	* @param object $options - Same shape as the params descriptor built in
	*                          exec_background_check_transcription(): key, url, lang,
	*                          av_url, engine, user_id, entity_name, transcription_ddo,
	*                          pid. delete_result is added here before delegating.
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
	* Single-shot HTTP poll to the Babel API for the status of a running job.
	*
	* Can be called from two different contexts:
	*   a) By check_background_transcriber_status() (background process) with
	*      delete_result = true, so the Babel server cleans up after itself.
	*   b) By tool_transcription::check_server_transcriber_status() (HTTP request)
	*      with delete_result = false for non-destructive progress checks.
	*
	* Security: the URL is re-validated by is_safe_remote_url (SEC-076) on every
	* call because this method is static and may be called with a different
	* $options->url than the one passed to the constructor.
	*
	* Babel's response structure:
	*   { result: { status: 1|2|3, transcription_data?: object, ... } }
	*
	* @param object $options - key, url, lang, av_url, engine, method_name (hardcoded
	*                          to 'check_status'), user_id, entity_name, pid,
	*                          delete_result (bool).
	* @return object - The inner result object from Babel's JSON response, containing
	*                  at minimum a 'status' integer. Returns
	*                  { result: false, msg: 'invalid transcriber URL' } on SSRF guard.
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

		// SEC-076: SSRF defence-in-depth on transcriber URL.
			if (!is_safe_remote_url((string)$options->url, (object)['allow_custom_ports' => true])) {
				debug_log(__METHOD__
					.' SEC-076: refused unsafe transcriber URL: ' . to_string($options->url)
					, logger::ERROR
				);
				return (object)['result' => false, 'msg' => 'invalid transcriber URL'];
			}

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
	* Convert Babel's segmented JSON output into Dédalo TC-tagged text and persist it.
	*
	* This is the final stage of the transcription pipeline. It transforms the
	* raw Babel transcription_data object into the format used by component_text_area
	* and saves it into the target component identified by $options->transcription_ddo.
	*
	* Babel input structure (transcription_data):
	*   {
	*     text: "full transcript …",
	*     segments: [
	*       { start: 1.85, text: " Can you say me…" },
	*       { start: 3.45, text: " blah blah…" }
	*     ]
	*   }
	*
	* Dédalo output format (one TC tag per segment, joined by HTML paragraph breaks):
	*   [TC_00:00:01.850_TC] Can you say me…<p>[TC_00:00:03.450_TC] blah blah…
	*
	* Guard: if the target component already holds non-empty data the save is
	* skipped to prevent overwriting manual edits. The user must delete existing
	* data before requesting a fresh automatic transcription.
	*
	* @param object $options - Must contain:
	*   - lang (string)             : Dédalo language code for set_data_lang / get_data_lang.
	*   - transcription_ddo (object): { component_tipo, section_id, section_tipo }
	*   - transcription_data (object): Raw Babel payload with a 'segments' array.
	* @return bool - true when the data was saved; false when segments are empty
	*               or the component already contains data.
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
		$model = ontology_node::get_model_by_tipo($transcription_ddo->component_tipo);
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
		$current_data = $component_transcription->get_data_lang($lang);

		if(!empty($current_data) && !empty($current_data[0])){
			return false;
		}

		$component_transcription->set_data_lang($data, $lang);
		$component_transcription->save();

		return true;
	}//end process_file



}//end class babel_transcriber
