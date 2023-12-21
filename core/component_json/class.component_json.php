<?php
declare(strict_types=1);
/**
* CLASS COMPONENT_JSON
*
*/
class component_json extends component_common {



	/**
	* __CONSTRUCT
	*/
	protected function __construct(string $tipo=null, $parent=null, string $mode='list', string $lang=DEDALO_DATA_NOLAN, string $section_tipo=null, bool $cache=true) {

		// Force always DEDALO_DATA_NOLAN
		$this->lang = DEDALO_DATA_NOLAN;

		parent::__construct($tipo, $parent, $mode, $this->lang, $section_tipo, $cache);
	}//end __construct



	/**
	* GET_DATO
	* @return array|null $dato
	*/
	public function get_dato() : ?array {

		$dato = parent::get_dato();

		// OLD
			// if(!empty($dato) && !is_array($dato)) {
			// 	try {

			// 		$data_string = !is_string($dato)
			// 			? json_encode($dato)
			// 			: $dato;

			// 		$data_object = json_decode($data_string);
			// 		$new_data = ($data_object)
			// 			? [$data_object]
			// 			: [];

			// 	} catch (Exception $e) {
			// 		debug_log(__METHOD__
			// 			. " Exception on read dato. Applying default data: [] " . PHP_EOL
			// 			. ' exception: ' . $e->getMessage()
			// 			, logger::ERROR
			// 		);
			// 		$new_data = [];
			// 	}

			// 	$dato = $new_data;

			// 	// update
			// 	$this->set_dato($dato);
			// 	$this->Save();
			// }

		if (!is_null($dato) && !is_array($dato)) {
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__
					. ' Expected dato type array or null, but type is different. Converted to array|null and saving' . PHP_EOL
					. ' type: ' . gettype($dato) . PHP_EOL
					. ' tipo: ' . $this->tipo . PHP_EOL
					. ' section_tipo: ' . $this->section_tipo . PHP_EOL
					. ' section_id: ' . $this->section_id
					, logger::ERROR
				);
				dump($dato, ' dato ++ '.to_string());
			}

			// format
				$dato = !empty($dato)
					? [$dato]
					: null;

			// update DDBB value
				$this->set_dato($dato);
				$this->Save();
		}


		return $dato;
	}//end get_dato



	/**
	* SET_DATO
	* @param array|null $dato
	* @return bool
	*/
	public function set_dato($dato) : bool {

		if (!empty($dato)) {

			// old format v5
				if (is_string($dato)) {
					if (!$dato = json_decode($dato)) {
						debug_log(__METHOD__
							. " Error. Only valid JSON is accepted as dato " . PHP_EOL
							. ' dato: ' . to_string($dato)
							, logger::ERROR
						);
						return false;
					}
				}

			if(!is_object($dato) && !is_array($dato) && !is_null($dato)) {
				debug_log(__METHOD__
					. " Error. Stopped set_dato because is not as expected type " . PHP_EOL
					. ' type: ' . gettype($dato) . PHP_EOL
					. ' dato: ' . to_string($dato)
					, logger::ERROR
				);
				return false;
			}

			if (!is_null($dato) && !is_array($dato)) {
				$dato = [$dato];
			}
		}

		return parent::set_dato( $dato );
	}//end set_dato



	/**
	* GET_VALOR
	*/
	public function get_valor() {
		$dato  = $this->get_dato();
		//$valor = json_encode($dato);

		$valor = $dato;

		return $valor;
	}//end get_valor



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

		return (bool)$valid;
	}//end valid_file_extension



	/**
	* GET_DIFFUSION_VALUE
	* Calculate current component diffusion value for target field (usually a MYSQL field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @return string $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value( ?string $lang=null, ?object $option_obj=null ) : ?string {

		// Default behavior is get value
		$dato = $this->get_dato();

		$value = $dato[0] ?? null;
		if (is_string($value)) {
			// do not encode here
			debug_log(__METHOD__
				. ' Expected value type is NOT string ' . PHP_EOL
				. ' type ' . gettype($value) . PHP_EOL
				. ' value: ' . to_string($value)
				, logger::WARNING
			);
		}else{
			$value = json_handler::encode($value);
		}

		// diffusion_value
		$diffusion_value = !empty($value)
			? $value
			: null;


		return $diffusion_value;
	}//end get_diffusion_value



	/**
	* UPDATE_DATO_VERSION
	* @param object $request_options
	* @return object $response
	*	$response->result = 0; // the component don't have the function "update_dato_version"
	*	$response->result = 1; // the component do the update"
	*	$response->result = 2; // the component try the update but the dato don't need change"
	*/
	public static function update_dato_version(object $request_options) : object {

		$options = new stdClass();
			$options->update_version 	= null;
			$options->dato_unchanged 	= null;
			$options->reference_id 		= null;
			$options->tipo 				= null;
			$options->section_id 		= null;
			$options->section_tipo 		= null;
			$options->context 			= 'update_component_dato';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$update_version	= $options->update_version;
			$dato_unchanged	= $options->dato_unchanged;
			$reference_id	= $options->reference_id;


		$update_version = implode(".", $update_version);
		switch ($update_version) {

			case '6.0.0':
				if (!empty($dato_unchanged) && is_string($dato_unchanged)) {
					// update search presets of component_json (temp and user presets has the same component_tipo)
					if($options->tipo==='dd625'){
						// replace the sqo of search to new component models for v6
						$dato_unchanged = str_replace(
							[
								'"modelo"',
								'"component_autocomplete"',
								'"component_autocomplete_hi"',
								'"component_input_text_large"',
								'"component_html_text"'
							],
							[
								'"model"',
								'"component_portal"',
								'"component_portal"',
								'"component_text_area"',
								'"component_text_area"'
							],
							$dato_unchanged);
					}

					// decode old string data to json
					$new_dato = json_decode($dato_unchanged);
					$new_dato = [$new_dato];

					$response = new stdClass();
						$response->result	= 1;
						$response->new_dato	= $new_dato;
						$response->msg		= "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";


				}else{
					$response = new stdClass();
						$response->result	= 2;
						$response->msg		= "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
				}
				break;

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version). Ignored action";
				break;
		}


		return $response;
	}//end update_dato_version



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

			$user_id		= get_user_id();
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
	* @param object $file_data
	* sample:
	* {
	*	"original_file_name": "my file name.json",
    *	"full_file_name": "test3_test18_1.json",
    *	"full_file_path": "/fake_path/component_json/test3_test18_1.json"
	* }
	* @return object $response
	*/
	public function process_uploaded_file(object $file_data) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__METHOD__.'] ';

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
					$dato = [$value];
					$this->set_dato($dato);

				// save full dato
					$this->Save();

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



}//end class component_json
