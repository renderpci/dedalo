<?php declare(strict_types=1);
include_once 'trait.search_component_json.php';
include_once 'trait.search_component_json_tm.php';
/**
* CLASS COMPONENT_JSON
* Manages JSON data components in Dédalo.
*
* Stores and handles arbitrary JSON data structures, providing a flexible
* container for complex data that doesn't fit standard component types.
* Useful for storing configuration, metadata, or structured data from external sources.
*
* Key features:
* - Stores arbitrary JSON objects and arrays
* - File-based JSON upload with .json extension validation
* - Language-neutral storage (DEDALO_DATA_NOLAN)
* - Data version migration support
* - Search integration via search_component_json trait
*
* Data format: Valid JSON objects or arrays stored as string values.
*
* Data is stored in the 'misc' column of matrix tables.
*
* Extends component_common and uses search_component_json trait for JSON-specific queries.
*
* @package Dédalo
* @subpackage Core
*/
class component_json extends component_common {



	// traits. Files added to current class file to split the large code.
	use search_component_json;
	use search_component_json_tm;



	/**
	* __CONSTRUCT
	*/
	protected function __construct( string $tipo, mixed $section_id=null, string $mode='list', string $lang=DEDALO_DATA_NOLAN, ?string $section_tipo=null, bool $cache=true ) {

		// Force always DEDALO_DATA_NOLAN
		$this->lang = DEDALO_DATA_NOLAN;

		parent::__construct($tipo, $section_id, $mode, $this->lang, $section_tipo, $cache);
	}//end __construct



	/**
	* GET_ALLOWED_EXTENSIONS
	* @return array $allowed_extensions
	*/
	public function get_allowed_extensions() : array {

		$allowed_extensions = ['json'];

		return $allowed_extensions;
	}//end get_allowed_extensions



	/**
	* VALID_FILE_EXTENSION
	* @return bool
	*/
	public function valid_file_extension(string $file_extension) : bool {

		$allowed_extensions = $this->get_allowed_extensions();

		$valid = in_array($file_extension, $allowed_extensions);

		return $valid;
	}//end valid_file_extension



	/**
	* UPDATE_DATA_VERSION
	* @param object $request_options
	* @return object $response
	*	$response->result = 0; // the component don't have the function "update_data_version"
	*	$response->result = 1; // the component do the update"
	*	$response->result = 2; // the component try the update but the dato don't need change"
	*/
	public static function update_data_version(object $request_options) : object {

		$options = new stdClass();
			$options->update_version 	= null;
			$options->data_unchanged 	= null;
			$options->reference_id 		= null;
			$options->tipo 				= null;
			$options->section_id 		= null;
			$options->section_tipo 		= null;
			$options->context 			= 'update_component_data';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$update_version	= $options->update_version;
			$data_unchanged	= $options->data_unchanged;
			$reference_id	= $options->reference_id;


		$update_version = implode(".", $update_version);
		switch ($update_version) {

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version). Ignored action";
				break;
		}


		return $response;
	}//end update_data_version



	/**
	* GET_UPLOAD_FILE_NAME
	* Compound the normalized name for the upload files
	* Such as 'test3_test18_1'
	* @return string
	*/
	public function get_upload_file_name() : string {

		return $this->section_tipo .'_'. $this->tipo .'_'. $this->section_id;
	}//end get_upload_file_name



	/**
	* ADD_FILE
	* Receive a file info object from tool upload
	* and move/rename the file to the proper target
	* @param object $options
	* {
	* 	"name": "myfile.json",
	*	"type": "application/octet-stream",
	*   "tmp_dir": "DEDALO_UPLOAD_TMP_DIR",
	*	"tmp_name": "/private/var/tmp/php6nd4A2",
	*	"error": 0,
	*	"size": 132898
	* }
	* @return object $response
	* {
	* 	"original_file_name" : $name, // myfile.json
	*	"full_file_name"	 : $full_file_name, // rsc29_rsc170_1.jpg
	*	"full_file_path"	 : $full_file_path // /media/image/original/0/rsc29_rsc170_1.jpg
	* }
	*/
	public function add_file(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__METHOD__.'] ';

		// options sample
			// {
			// 	"name": "myfile.json",
			// 	"type": "application/octet-stream",
			// 	"tmp_dir": "DEDALO_UPLOAD_TMP_DIR",
			// 	"key_dir": "tool_upload",
			// 	"tmp_name": "phpJIQq4e",
			// 	"error": 0,
			// 	"size": 22131522,
			// 	"extension": "json"
			// }

		// short vars
			$name			= $options->name; // string original file name like 'myfile.json'
			$key_dir		= $options->key_dir; // string upload caller name like 'oh1_oh1'
			$tmp_dir		= $options->tmp_dir; // constant string name like 'DEDALO_UPLOAD_TMP_DIR'
			$tmp_name		= $options->tmp_name; // string like 'phpJIQq4e'
			$source_file 	= $options->source_file ?? null;

		// source_file
			if (!defined($tmp_dir)) {
				$msg = 'constant is not defined! tmp_dir: '.$tmp_dir;
				$response->msg .= $msg;
				debug_log(__METHOD__
					.' ' .$response->msg . PHP_EOL
					. ' tmp_dir: ' . $tmp_dir
					, logger::ERROR
				);
				return $response;
			}

			$user_id		= logged_user_id();
			$source_file	= isset($source_file)
				? $source_file
				: constant($tmp_dir). '/'. $user_id .'/'. rtrim($key_dir, '/') . '/' . $tmp_name;

		// check source file
			if (!file_exists($source_file)) {
				$response->msg .= ' Source file not found: ' . basename($source_file);
				debug_log(__METHOD__
					.' ' .$response->msg . PHP_EOL
					. ' source_file: ' . $source_file
					, logger::ERROR
				);
				return $response;
			}

		// target file info
			$file_extension	= strtolower(pathinfo($name, PATHINFO_EXTENSION));
			$file_name		= $this->get_upload_file_name(); // such as 'test3_test18_1'
			$folder_path	= pathinfo($source_file, PATHINFO_DIRNAME);
			$full_file_name	= $file_name . '.' . $file_extension;
			$full_file_path	= $folder_path .'/'. $full_file_name;

		// debug
			debug_log(__METHOD__
				." component_json.add_file Target file: " . PHP_EOL
				.' folder_path: '    . to_string($folder_path) . PHP_EOL
				.' full_file_path: ' . to_string($full_file_path)
				, logger::WARNING
			);

		// validate extension
			if (!$this->valid_file_extension($file_extension)) {
				$allowed_extensions = $this->get_allowed_extensions();
				$response->msg  = "Error: " .$file_extension. " is an invalid file type ! ";
				$response->msg .= "Allowed file extensions are: ". implode(', ', $allowed_extensions);
				debug_log(__METHOD__
					.' ' .$response->msg . PHP_EOL
					. ' file_extension: ' . $file_extension
					, logger::ERROR
				);
				return $response;
			}

		// move file to destination. Move temporary file to final destination and name

			// check target directory
			$target_dir = dirname($full_file_path);
			if (!is_dir($target_dir)) {
				if(!mkdir($target_dir, 0750, true)) {
					debug_log(__METHOD__
						.' Error creating directory: ' . PHP_EOL
						.' target_dir: ' . $target_dir
						, logger::ERROR
					);
					$response->msg .= ' Error creating directory';
					debug_log(__METHOD__
						. ' '.$response->msg
						, logger::ERROR
					);
					return $response;
				}
			}

			// move the file
			if (false===rename($source_file, $full_file_path)) {
				$response->msg .= ' Error on move temp file '.basename($tmp_name).' to ' . basename($full_file_name);
				debug_log(__METHOD__
					.' ' .$response->msg . PHP_EOL
					. ' source_file: ' . $source_file . PHP_EOL
					. ' full_file_path: ' . $full_file_path
					, logger::ERROR
				);
				return $response;
			}

		// all is OK
			$response->result	= true;
			$response->msg		= 'OK. Request done ['.__METHOD__.'] ';

			// uploaded ready file info
			$response->ready = (object)[
				'original_file_name'	=> $name,
				'full_file_name'		=> $full_file_name,
				'full_file_path'		=> $full_file_path
			];


		return $response;
	}//end add_file



	/**
	* PROCESS_UPLOADED_FILE
	* @param object|null $file_data = null
	* sample:
	* {
	*	"original_file_name": "my file name.json",
	*	"full_file_name": "test3_test18_1.json",
	*	"full_file_path": "/fake_path/component_json/test3_test18_1.json"
	* }
	* @param object|null $process_options = null
	* @return object $response
	*/
	public function process_uploaded_file( ?object $file_data=null, ?object $process_options=null ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__METHOD__.'] ';

		// empty case
			if (empty($file_data)) {
				$response->msg .= 'Empty file data';
				return $response;
			}

		// short vars
			$original_file_name	= $file_data->original_file_name;	// like "my file name.json"
			$full_file_name		= $file_data->full_file_name;		// like "test3_test18_1.json"
			$full_file_path		= $file_data->full_file_path;		// like "/fake_path/component_json/test3_test18_1.json"

		// check file exists
			if (!file_exists($full_file_path)) {
				$response->msg .= 'File not found';
				debug_log(__METHOD__
					. " $response->msg " . PHP_EOL
					. ' file_data: ' . to_string($file_data) . PHP_EOL
					. ' original_file_name: ' . $original_file_name
					, logger::ERROR
				);
				return $response;
			}

		// read the uploaded file
			$file_content = file_get_contents($full_file_path);

		// read content
			if ($value = json_handler::decode($file_content)) {

				// wrap data with array to maintain component data format
					$data = [
						(object)[
							'value' => $value
						]
					];
					$this->set_data($data);

				// save full data
					$this->save();

				// remove it after store
					if(!unlink($full_file_path)) {
						debug_log(__METHOD__
							. " Error deleting file " . PHP_EOL
							. ' full_file_path: ' . to_string($full_file_path) . PHP_EOL
							. ' original_file_name: ' . $original_file_name
							, logger::ERROR
						);
					}

				// response OK
					$response->result	= true;
					$response->msg		= 'OK. Request done';

			}else{

				// response ERROR
					$response->result	= false;
					$response->msg		= "Error: " .$full_file_name. " content is an invalid JSON data";

				// debug
					debug_log(__METHOD__
						. " Error decoding JSON file data " . PHP_EOL
						. " full_file_path: " . $full_file_path . PHP_EOL
						. ' value: ' . to_string($value) . PHP_EOL
						. ' original_file_name: ' . $original_file_name
						, logger::DEBUG
					);
			}


		return $response;
	}//end process_uploaded_file







	/**
	* REGENERATE_COMPONENT
	* Force the current component to re-save its data
	* Note that the first action is always load data to avoid save empty content
	* @see class.tool_update_cache.php
	* @return bool
	*/
	public function regenerate_component() : bool {

		// Force loads data always !IMPORTANT
		$data = $this->get_data();

		if (is_array($data)) {
			$new_data = [];
			foreach ($data as $data_element) {

				$value = $data_element->value;

				// If value is a string, attempt to decode as JSON
				if (is_string($value)) {
					$decoded = json_decode($value);

					if (json_last_error() !== JSON_ERROR_NONE) {
						// Log error if JSON decoding fails
						debug_log(
							__METHOD__ . " Unable to decode JSON value from data." . PHP_EOL
							.' data: ' . to_string($value) . PHP_EOL
							.' section_tipo: ' . $this->get_section_tipo() . PHP_EOL
							.' section_id: ' . $this->get_section_id()
							,logger::ERROR
						);
						// continue; // Skip the invalid JSON value
						// Stop regeneration. Let admin to check invalid values
						return false;
					}

					$new_data_element = clone $data_element;
					$new_data_element->value = $decoded;

					$new_data[] = $new_data_element;
				}else{
					// If not a string, add the original value
					$new_data[] = $data_element;
				}
			}
			// Overwrite
			$data = $new_data;
		}

		// force format correctly empty data like [null] -> null
		$this->set_data($data);

		// Save component data
		$this->save();


		return true;
	}//end regenerate_component



	/**
	* CONFORM_IMPORT_DATA
	* Because component_json stores any arbitrary JSON as its value, a v7 envelope
	* like [{"value":1}] is indistinguishable from a literal JSON value with the same shape.
	* To disambiguate, the import uses the 'dedalo_data' wrapper produced by the raw export:
	* 	{"dedalo_data":[{"value":<any JSON>,"id":1}]}
	* The import tool unwraps it and sets the flag 'import_data_is_wrapped' on the component.
	* Rules:
	* 1. Wrapped input (flag set): the unwrapped array is the v7 envelope.
	*    Items must be objects with a 'value' property.
	* 2. Any other input: the ENTIRE decoded value (or the raw string when it is not
	*    valid JSON) becomes the single monovalue as [{"value": <data>}]
	* Empty value returns null (clears the existing component data)
	* @param string $import_value
	* @param string $column_name
	* @return object $response
	*/
	public function conform_import_data(string $import_value, string $column_name) : object {

		// Response
			$response = new stdClass();
				$response->result	= null;
				$response->errors	= [];
				$response->msg		= 'Error. Request failed';

		// empty case. Result null clears the existing component data
			if(empty($import_value) && $import_value!=='0') {

				$response->result	= null;
				$response->msg		= 'OK';

				return $response;
			}

		// wrapped case. The value was exported as {"dedalo_data": ...} and the import
		// tool has already unwrapped it, so the value is the v7 envelope itself
			if ($this->import_data_is_wrapped===true) {

				$data_from_json = json_handler::is_json($import_value)
					? json_handler::decode($import_value)
					: null;

				if (!is_array($data_from_json)) {
					$failed = new stdClass();
						$failed->section_id		= $this->section_id;
						$failed->data			= stripslashes( $import_value );
						$failed->component_tipo	= $this->get_tipo();
						$failed->msg			= 'IGNORED: dedalo_data wrapper must contain an array of items';
					$response->errors[] = $failed;

					return $response;
				}

				foreach ($data_from_json as $current_item) {
					if (!is_object($current_item) || !property_exists($current_item, 'value')) {
						$failed = new stdClass();
							$failed->section_id		= $this->section_id;
							$failed->data			= stripslashes( $import_value );
							$failed->component_tipo	= $this->get_tipo();
							$failed->msg			= 'IGNORED: dedalo_data items must be objects with a value property';
						$response->errors[] = $failed;

						return $response;
					}
				}

				$response->result	= $data_from_json;
				$response->msg		= 'OK';

				return $response;
			}

		// un-wrapped case. The entire value, whatever it is, becomes the single monovalue
			if (json_handler::is_json($import_value)) {

				// arrays and objects
				$decoded = json_handler::decode($import_value);
				if ($decoded===null && $import_value!=='null') {
					$failed = new stdClass();
						$failed->section_id		= $this->section_id;
						$failed->data			= stripslashes( $import_value );
						$failed->component_tipo	= $this->get_tipo();
						$failed->msg			= 'IGNORED: JSON decode failed';
					$response->errors[] = $failed;

					return $response;
				}

				// legacy raw export case as {"lg-nolan":[{"value":<any JSON>,"id":1}]}
				// a single lang keyed object whose value is an array of items with 'value'
				// property is interpreted as the legacy envelope and extracted
				if (is_object($decoded)) {
					$ar_keys = array_keys((array)$decoded);
					if (count($ar_keys)===1 && strpos($ar_keys[0], 'lg-')===0) {
						$lang_value = $decoded->{$ar_keys[0]};
						$is_envelope = is_array($lang_value) && !empty($lang_value) &&
							count(array_filter($lang_value, function($v){
								return is_object($v) && property_exists($v, 'value');
							}))===count($lang_value);
						if ($is_envelope===true) {
							$response->result	= $lang_value;
							$response->msg		= 'OK';

							return $response;
						}
					}
				}

				$value = $decoded;
			}else{
				// scalars. Decode JSON scalars when possible ('42' to int, 'true' to bool),
				// else keep the raw string
				$decoded = json_decode($import_value);
				$value = (json_last_error()===JSON_ERROR_NONE)
					? $decoded
					: $import_value;
			}

		$response->result	= [(object)['value' => $value]];
		$response->msg		= 'OK';


		return $response;
	}//end conform_import_data



}//end class component_json
