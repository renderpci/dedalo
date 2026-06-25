<?php declare(strict_types=1);
/**
* MOVE_LANG
* Maintenance-area widget that bulk-migrates component dato language keys
* between translatable and non-translatable storage.
*
* Dédalo stores each component's value inside a JSON datos blob keyed by
* language code (e.g. "lg-spa", "lg-eng") for translatable components, or by
* the special constant DEDALO_DATA_NOLAN for components whose value is
* language-independent. When a component's translatability setting changes in
* the ontology, every existing record row must be updated so its stored dato
* key matches the new expectation. This widget drives that bulk update.
*
* Responsibilities:
* - Exposes the widget to the maintenance-area dashboard via `get_value()`,
*   which returns a user-facing description and the list of available JSON
*   definition files scanned from
*   core/base/transform_definition_files/move_lang/.
* - Executes the actual migration via `move_lang()`, which reads the selected
*   definition files and delegates to `transform_data::change_data_lang()`.
*
* Integration:
* - Dispatched by `dd_area_maintenance_api::widget_request()`.
*   `get_value()` is invoked through the hard-coded `get_widget_value` hook and
*   is therefore NOT listed in `API_ACTIONS`.
*   `move_lang()` IS listed in `API_ACTIONS` and is therefore the only
*   additional method the widget_request security gate will allow.
* - Definition JSON files follow the shape:
*   [{"tipo":"<ontology_type>", "type":"component",
*     "ar_tables":["matrix","matrix_hierarchy",...],
*     "perform":["lang_to_nolan"|"nolang_to_lang"],
*     "info":"<human-readable description>"}]
* - The actual row-level transformation is performed by
*   `transform_data::change_data_lang()` (core/base/upgrade/class.transform_data.php).
*
* (!) This operation is destructive and irreversible without a database backup.
*     It iterates every record row in the listed tables, which may take a very
*     long time on large datasets.
*
* @package Dédalo
* @subpackage Core
*/
class move_lang {



	/**
	* SEC-044: methods callable through `dd_area_maintenance_api::widget_request`.
	* `get_value` is invoked through `get_widget_value` (hard-coded method) and
	* therefore not listed here.
	*/
	public const API_ACTIONS = [
		'move_lang'
	];



	/**
	* GET_VALUE
	* Returns the initial widget payload for the maintenance-area dashboard panel.
	*
	* Provides a human-readable description of the move_lang operation and the
	* list of available JSON definition files located in
	* core/base/transform_definition_files/move_lang/. The file list is
	* populated dynamically via `area_maintenance::get_definitions_files()`,
	* which performs realpath confinement (SEC-069) and returns only `.json`
	* files within the allowed directory.
	*
	* Called by the `get_widget_value` hard-coded hook inside
	* `dd_area_maintenance_api::widget_request()`. Not listed in `API_ACTIONS`
	* because the dispatch path is different from ordinary action routing.
	*
	* @return object - {result: {body: string, files: array}, msg: string, errors: array}
	*/
	public static function get_value() : object {

		$response = new stdClass();
		$response->result = (object)[
			'body' => 'Convert map items (e.g., hierarchy89) between translatable and non-translatable components (or vice-versa).<br>
					   Uses JSON file definitions located in /dedalo/core/base/transform_definition_files/move_lang.<br>
					   Note: This process can be very time-consuming, as it iterates through all relevant records in the database.',
			'files' => area_maintenance::get_definitions_files('move_lang')
		];
		$response->msg = 'OK. Request done successfully';
		$response->errors = [];


		return $response;
	}//end get_value



	/**
	* MOVE_LANG
	* Executes a bulk language-key migration across the dato storage for each
	* component tipo listed in the selected JSON definition files.
	*
	* Workflow:
	* 1. Validates that `$options->files_selected` is non-empty.
	* 2. Loads the full list of available definition files via
	*    `area_maintenance::get_definitions_files('move_lang')` (which applies
	*    SEC-069 realpath confinement) and intersects with the caller-supplied
	*    names to build `$ar_file_name` — a plain array of file-name strings.
	*    This intersection prevents the caller from injecting arbitrary
	*    filesystem paths; only files that already exist in the allowed
	*    directory are accepted.
	* 3. Delegates to `transform_data::change_data_lang($ar_file_name)`, which
	*    reads each JSON file, iterates all records in the declared tables via
	*    `update::tables_rows_iterator()`, rewrites the dato language key
	*    (lang_to_nolan: DEDALO_DATA_LANG_DEFAULT → DEDALO_DATA_NOLAN; or
	*     nolang_to_lang: the reverse), and also updates the matching
	*    matrix_time_machine 'lang' column. Activity logging is disabled for
	*    the duration of the run.
	*
	* (!) `transform_data::change_data_lang()` has no declared return type; it
	*     returns void implicitly. The `$result` variable will therefore always
	*     hold `null`, making the `$result === false` branch unreachable. This
	*     is a known quirk of the upstream method — do not change it here.
	*
	* Listed in `API_ACTIONS`; invoked by
	* `dd_area_maintenance_api::widget_request()`.
	*
	* @param object $options - {
	*   files_selected: array  - File-name strings, e.g. ['change_component_iri_to_nolan.json'].
	*                            Names that do not match a file in the move_lang directory are silently
	*                            discarded by the intersection check.
	* }
	* @return object - {result: void|false, msg: string, errors: array}
	*/
	public static function move_lang(object $options): object
	{

		$response = new stdClass();
		$response->result = false;
		$response->msg = 'Error. Request failed [' . __METHOD__ . ']';
		$response->errors = [];

		// options
		$files_selected = $options->files_selected;
		if (empty($files_selected)) {
			$response->errors[] = 'empty files_selected';
			return $response;
		}

		// files
		// Fetch the full set of permitted definition files, then intersect with the
		// caller-supplied names. Only files that exist in the allowed directory and
		// match the submitted names are retained. Unknown or path-traversal names
		// are silently dropped by get_definitions_files()'s allowlist + realpath check.
		$definitions_files = area_maintenance::get_definitions_files('move_lang');
		$json_files = array_filter($definitions_files, function ($el) use ($files_selected) {
			return in_array($el->file_name, $files_selected);
		});
		if (empty($json_files)) {
			$response->errors[] = 'json_files not found';
			return $response;
		}

		// ar_file_name
		// Flatten to a simple indexed array of file-name strings as expected by
		// transform_data::change_data_lang(). array_values() re-indexes after
		// array_filter() which may leave non-contiguous numeric keys.
		$ar_file_name = array_values(
			array_map(function ($el) {
				return $el->file_name;
			}, $json_files)
		);

		require_once DEDALO_CORE_PATH . '/base/upgrade/class.transform_data.php';
		$result = transform_data::change_data_lang(
			$ar_file_name
		);

		$response->result = $result;
		$response->msg = ($result === false)
			? 'Error. changes_in_tipos failed'
			: 'OK. request done successfully';


		return $response;
	}//end move_lang



}//end move_lang
