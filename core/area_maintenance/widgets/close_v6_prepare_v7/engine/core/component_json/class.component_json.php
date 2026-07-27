<?php declare(strict_types=1);
include_once 'trait.search_component_json.php';
include_once 'trait.search_component_json_tm.php';
/**
* CLASS COMPONENT_JSON
* Manages arbitrary JSON data stored as a single language-neutral component value.
*
* Unlike typed components (text, number, IRI) that impose a schema on the stored
* value, component_json is a transparent envelope: whatever JSON the caller provides
* is stored verbatim and returned verbatim.  Typical use cases include:
* - External metadata payloads imported from third-party APIs
* - Free-form configuration objects that do not fit any standard field type
* - JSON files uploaded by editors via the file-upload workflow
*
* Storage layout:
* - DB column: 'misc' in the section's matrix table (see section_record_data)
* - Data envelope: array of data-item objects, always exactly one item per record
*   [ { "value": <any JSON value> } ]
* - Language: always DEDALO_DATA_NOLAN ('lg-nolan') — JSON data is not translatable
*
* Import/export:
* - Raw export wraps the datum as {"dedalo_data": [{"value": <json>, "id": 1}]}
* - The import tool detects and unwraps the dedalo_data wrapper before calling
*   conform_import_data(), setting $import_data_is_wrapped = true on the instance
*   so that conform_import_data() can restore the exact v7 envelope without
*   re-interpreting the content as a plain value (see conform_import_data docs)
*
* Search:
* - Full JSONB path operator suite via trait search_component_json
* - Time-machine variant via trait search_component_json_tm
*
* Extends component_common.
* Consumed by search_component_json (regular matrix) and
* search_component_json_tm (matrix_time_machine).
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
	* Initialises the component, forcing the language to DEDALO_DATA_NOLAN ('lg-nolan').
	*
	* JSON data is inherently non-translatable; the lang parameter is accepted for
	* interface compatibility but is always overridden before forwarding to the parent
	* so that data queries always target the correct language-neutral slot.
	*
	* @param string      $tipo         Ontology tipo identifier for this component (e.g. 'dd1574')
	* @param mixed       $section_id   [= null]  Record ID within the parent section; null for unsaved instances
	* @param string      $mode         [= 'list'] Rendering mode ('list', 'edit', 'search', …)
	* @param string      $lang         [= DEDALO_DATA_NOLAN] Accepted for signature parity but ignored — always overridden
	* @param string|null $section_tipo [= null]  Ontology tipo of the parent section
	* @param bool        $cache        [= true]  Whether to use the instance cache
	*/
	protected function __construct( string $tipo, mixed $section_id=null, string $mode='list', string $lang=DEDALO_DATA_NOLAN, ?string $section_tipo=null, bool $cache=true ) {

		// (!) Force always DEDALO_DATA_NOLAN
		// JSON values are language-neutral; overriding before the parent call ensures
		// the data layer never tries to read or write a language-keyed slot.
		$this->lang = DEDALO_DATA_NOLAN;

		parent::__construct($tipo, $section_id, $mode, $this->lang, $section_tipo, $cache);
	}//end __construct



	/**
	* GET_ALLOWED_EXTENSIONS
	* Returns the list of file extensions that may be uploaded to this component.
	*
	* Only '.json' files are accepted; add_file() enforces this list before
	* moving the upload to its final destination.
	*
	* @return array<string> Single-element array: ['json']
	*/
	public function get_allowed_extensions() : array {

		$allowed_extensions = ['json'];

		return $allowed_extensions;
	}//end get_allowed_extensions



	/**
	* VALID_FILE_EXTENSION
	* Checks whether the given file extension is in the component's allowed list.
	*
	* The comparison is case-sensitive; callers (add_file) must lowercase the
	* extension before passing it here to avoid false negatives on 'JSON' vs 'json'.
	*
	* @param string $file_extension Lowercased extension without leading dot (e.g. 'json')
	* @return bool True if the extension is allowed, false otherwise
	*/
	public function valid_file_extension(string $file_extension) : bool {

		$allowed_extensions = $this->get_allowed_extensions();

		$valid = in_array($file_extension, $allowed_extensions);

		return $valid;
	}//end valid_file_extension



	/**
	* UPDATE_DATA_VERSION
	* Applies a versioned migration to stored component data.
	*
	* Called by the data-version migration tool (tool_update_cache) when the platform
	* upgrades and stored dato shapes must be transformed.  Each migration is identified
	* by a dotted version string derived from $request_options->update_version (array of
	* version parts joined with '.').
	*
	* Result codes:
	*   0 — this component has no handler for the requested version (migration skipped)
	*   1 — migration applied successfully
	*   2 — migration was attempted but the dato needed no change
	*
	* component_json currently has no registered migration steps; all versions fall through
	* to the default case and return result=0.
	*
	* @param object $request_options Migration request with at minimum:
	*   ->update_version  array   Parts of the target version e.g. ['1','0','0']
	*   ->data_unchanged  mixed   Reference value for detecting no-change situations
	*   ->reference_id    mixed   ID used by some handlers for cross-referencing
	*   ->tipo            string  Ontology tipo of the component being migrated
	*   ->section_id      mixed   Section record ID
	*   ->section_tipo    string  Ontology tipo of the parent section
	*   ->context         string  Always 'update_component_data'
	* @return object $response
	*   ->result int    0|1|2 — see result codes above
	*   ->msg    string Human-readable outcome description
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
	* Builds the canonical base filename for an uploaded file, without extension.
	*
	* The name is composed as:  <section_tipo>_<tipo>_<section_id>
	* e.g. 'test3_test18_1' for section_tipo='test3', tipo='test18', section_id=1.
	*
	* The extension is appended by add_file() after extension validation, yielding
	* the final file name such as 'test3_test18_1.json'.  Using this deterministic
	* naming scheme means re-uploading a file for the same record always overwrites
	* the previous one.
	*
	* @return string Basename without extension, e.g. 'rsc29_rsc170_1'
	*/
	public function get_upload_file_name() : string {

		return $this->section_tipo .'_'. $this->tipo .'_'. $this->section_id;
	}//end get_upload_file_name



	/**
	* ADD_FILE
	* Receives a file-info object from the upload tool, validates the extension,
	* and moves (renames) the temporary file to its canonical destination path.
	*
	* This method only handles the filesystem move; it does NOT read the file content
	* or persist any data to the database — that is done in process_uploaded_file().
	*
	* Flow:
	*   1. Resolve the full path of the temporary file from the constant named by
	*      $options->tmp_dir (e.g. DEDALO_UPLOAD_TMP_DIR) + user ID + key_dir + tmp_name.
	*      If $options->source_file is provided it is used directly.
	*   2. Validate that the source file exists.
	*   3. Validate that the file extension is in the allowed list (['json']).
	*   4. Create the target directory if it does not exist (mode 0750, recursive).
	*   5. Rename the temp file to the canonical name via get_upload_file_name().
	*
	* @param object $options Upload descriptor from the upload tool:
	*   ->name        string  Original file name, e.g. 'myfile.json'
	*   ->type        string  MIME type from the browser (informational only)
	*   ->tmp_dir     string  Name of the PHP constant holding the temp directory path,
	*                         e.g. 'DEDALO_UPLOAD_TMP_DIR' (the constant is resolved via
	*                         constant() — a string constant-name, NOT the path itself)
	*   ->key_dir     string  Sub-directory segment identifying the upload caller,
	*                         e.g. 'tool_upload'
	*   ->tmp_name    string  The PHP-assigned temp filename, e.g. 'phpJIQq4e'
	*   ->error       int     PHP upload error code (0 = no error)
	*   ->size        int     File size in bytes
	*   ->extension   string  (optional) Pre-extracted extension
	*   ->source_file string  (optional) Absolute path override; bypasses tmp_dir resolution
	* @return object $response
	*   ->result               bool   True on success, false on any failure
	*   ->msg                  string Human-readable outcome or error detail
	*   ->ready                object (on success) File info:
	*     ->original_file_name string  Caller's filename, e.g. 'myfile.json'
	*     ->full_file_name     string  Stored filename, e.g. 'test3_test18_1.json'
	*     ->full_file_path     string  Absolute path where the file now resides
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
		// tmp_dir is the *name* of a PHP constant (e.g. 'DEDALO_UPLOAD_TMP_DIR'), not the path
		// itself.  Guard against misconfigured deployments where the constant was never defined.
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
			// Resolve the full source path from per-user temp directory unless an explicit
			// source_file override was provided (used by programmatic callers and tests).
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
		// The destination is placed in the SAME directory as the source temp file so that
		// rename() is an atomic in-filesystem operation (avoids a cross-device copy+delete).
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
	* Reads a previously staged JSON file, decodes its content, and persists it
	* as the component's data value.
	*
	* This is the second stage of the two-step file upload workflow:
	*   1. add_file()              — validates extension and moves file to staging location
	*   2. process_uploaded_file() — reads content, validates JSON, saves to DB, removes file
	*
	* On success the file is deleted from the filesystem after its content has been
	* saved to the database (the component stores the decoded JSON object, not the file).
	*
	* The decoded value is wrapped in the standard v7 data envelope before being passed
	* to set_data() so that the stored shape matches what all other write paths produce:
	*   [ { "value": <decoded JSON> } ]
	*
	* @param object|null $file_data [= null] Staged file descriptor, as returned in
	*   $response->ready from add_file():
	*   ->original_file_name string  Original name supplied by the user, e.g. 'my file name.json'
	*   ->full_file_name     string  Canonical stored filename, e.g. 'test3_test18_1.json'
	*   ->full_file_path     string  Absolute filesystem path to the staged file
	* @param object|null $process_options [= null] Reserved for future post-processing
	*   options; currently unused — pass null
	* @return object $response
	*   ->result bool   True on success, false on any error
	*   ->msg    string Human-readable outcome or error detail
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
		// json_handler::decode returns the decoded PHP value on success, or false/null on failure.
		// The decoded value becomes the inner 'value' of the v7 data envelope.
			if ($value = json_handler::decode($file_content)) {

				// wrap data with array to maintain component data format
				// The v7 envelope is always an array of item objects: [ { "value": <data> } ]
					$data = [
						(object)[
							'value' => $value
						]
					];
					$this->set_data($data);

				// save full data
					$this->save();

				// remove it after store
				// The component stores the decoded content, not the file; the staged file is
				// no longer needed once save() succeeds.  A failure to unlink is logged but
				// does not roll back the save — the data is already in the database.
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
	* Forces the component to normalise and re-save its stored data.
	*
	* Called by tool_update_cache to migrate legacy records that stored the JSON
	* value as a raw string inside the 'value' field rather than as a decoded
	* PHP object/array.  Historically, some import paths serialised the JSON to a
	* string before wrapping it in the v7 envelope; this method detects that
	* condition and corrects it in-place.
	*
	* Algorithm:
	*   1. Load the current data via get_data() (never skip — saving without loading
	*      would overwrite with an empty value).
	*   2. Walk every data item; if item->value is a string, attempt json_decode().
	*      On decode failure return false immediately so an administrator can
	*      investigate rather than silently losing data.
	*   3. Replace the string value with the decoded PHP value (object or array)
	*      via a clone so the original item object is not mutated.
	*   4. Non-string values are kept as-is (already in the correct shape).
	*   5. Pass the normalised data through set_data() to handle edge cases such as
	*      [null] → null, then save().
	*
	* (!) Returns false and halts on the first invalid JSON string; the caller
	* (tool_update_cache) treats a false return as a recoverable per-record error
	* and continues with the next record.
	*
	* @see class.tool_update_cache.php
	* @return bool True if data was successfully normalised and saved; false on JSON decode error
	*/
	public function regenerate_component() : bool {

		// (!) Force loads data always — saving without first loading would overwrite with empty
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
	* Normalises a raw import string into the v7 data envelope that set_data() expects.
	*
	* The core challenge for component_json is shape ambiguity: the stored envelope
	* [{"value": 1}] and a literal user value that happens to be an array of objects
	* with a 'value' property are syntactically indistinguishable.  The solution is a
	* two-path strategy driven by the $import_data_is_wrapped flag:
	*
	* Path A — Wrapped export (import_data_is_wrapped === true):
	*   The import tool detected the raw-export {"dedalo_data": [...]} wrapper and
	*   already stripped the outer key.  $import_value now contains the JSON string
	*   representation of the v7 envelope array.  This method validates that each
	*   item is an object with a 'value' property and returns the decoded array
	*   directly as result — it becomes the new $data for set_data().
	*
	* Path B — Plain / foreign JSON (import_data_is_wrapped === false):
	*   The input has no dedalo_data wrapper (e.g. a manually authored CSV column or
	*   a third-party export).  The ENTIRE decoded value — regardless of its shape —
	*   becomes the inner 'value' of a single new data item:
	*     result = [ { "value": <decoded value> } ]
	*   Within this path, a further legacy heuristic is applied: if the decoded value
	*   is an object with exactly one key starting with 'lg-' whose value is an array
	*   of v7-shaped items, the lang-keyed envelope from old v6-style exports is
	*   detected and unwrapped (the inner array is returned as the result directly).
	*
	* Edge cases:
	* - Empty import_value (and not the string '0') → result null, which tells the
	*   import tool to clear the component's existing data.
	* - Non-JSON scalars (bare strings, integers) → passed through json_decode(); on
	*   success the native PHP type is used as 'value', on failure the raw string is
	*   kept as 'value' (lossless round-trip for pre-existing plain-text values).
	*
	* @param string $import_value  Raw string from the CSV cell or import source
	* @param string $column_name   DB column name (informational; not used in this override)
	* @return object $response
	*   ->result array|null  The normalised v7 envelope on success; null clears existing data;
	*                        stays null (initial value) on validation errors
	*   ->errors array       List of failure descriptor objects; non-empty on validation errors
	*   ->msg    string      Human-readable outcome
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
		// tool has already unwrapped it, so the value is the v7 envelope itself.
		// See component_common::unwrap_dedalo_data() and tool_import_dedalo_csv for
		// how import_data_is_wrapped gets set to true before this call.
			if ($this->import_data_is_wrapped===true) {

				$data_from_json = json_handler::is_json($import_value)
					? json_handler::decode($import_value)
					: null;

				// The dedalo_data payload must decode to a PHP array (the v7 envelope).
				// Anything else (null, object, scalar) means the export was malformed.
				if (!is_array($data_from_json)) {
					$failed = new stdClass();
						$failed->section_id		= $this->section_id;
						$failed->data			= stripslashes( $import_value );
						$failed->component_tipo	= $this->get_tipo();
						$failed->msg			= 'IGNORED: dedalo_data wrapper must contain an array of items';
					$response->errors[] = $failed;

					return $response;
				}

				// Every item in the array must be an object with a 'value' key.
				// Fail-fast on the first malformed item to surface problems early.
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

		// un-wrapped case. The entire value, whatever it is, becomes the single monovalue.
		// Two sub-paths: valid JSON (object/array/literal) or a non-JSON raw string.
			if (json_handler::is_json($import_value)) {

				// arrays and objects
				$decoded = json_handler::decode($import_value);
				// json_handler::decode() may return null for an explicitly encoded JSON null
				// (import_value === 'null'), which is legitimate and must not be rejected.
				if ($decoded===null && $import_value!=='null') {
					$failed = new stdClass();
						$failed->section_id		= $this->section_id;
						$failed->data			= stripslashes( $import_value );
						$failed->component_tipo	= $this->get_tipo();
						$failed->msg			= 'IGNORED: JSON decode failed';
					$response->errors[] = $failed;

					return $response;
				}

				// legacy raw export case as {"lg-nolan":[ <item> , ... ]}
				// A single lang-keyed object whose value is a non-empty array is interpreted
				// as a v6-era export: v6 keyed component data by language code (e.g. 'lg-nolan')
				// even for non-translatable components. Unwrap the language key and normalise
				// each element to a v7 envelope:
				//  - an element already shaped {value:...} is kept as-is (v6 export of v7 data),
				//  - a raw payload of any other shape is wrapped as {value:<payload>}
				//    (v6 export of genuine v6 data, e.g. {"lg-nolan":[{"open_as":"window"}]}).
				// Proper v7 raw exports never reach here: they carry the {"dedalo_data":...}
				// envelope and take the import_data_is_wrapped===true path above.
				if (is_object($decoded)) {
					$ar_keys = array_keys((array)$decoded);
					if (count($ar_keys)===1 && strpos($ar_keys[0], 'lg-')===0) {
						$lang_value = $decoded->{$ar_keys[0]};
						if (is_array($lang_value) && !empty($lang_value)) {
							$result = [];
							foreach ($lang_value as $element) {
								$result[] = (is_object($element) && property_exists($element, 'value'))
									? $element
									: (object)['value' => $element];
							}
							$response->result	= $result;
							$response->msg		= 'OK';

							return $response;
						}
					}
				}

				$value = $decoded;
			}else{
				// scalars. Decode JSON scalars when possible ('42' to int, 'true' to bool),
				// else keep the raw string.
				// Using json_decode (not json_handler) here because the caller has already
				// confirmed is_json() returned false — we only want native scalar coercion.
				$decoded = json_decode($import_value);
				$value = (json_last_error()===JSON_ERROR_NONE)
					? $decoded
					: $import_value;
			}

		// Wrap the resolved scalar/object/array as the single monovalue in a v7 envelope.
		$response->result	= [(object)['value' => $value]];
		$response->msg		= 'OK';


		return $response;
	}//end conform_import_data



}//end class component_json
