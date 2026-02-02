<?php declare(strict_types=1);
// Add MARC library to read and process the Marc21 files
require_once dirname(__FILE__).'/lib/MARC.php';
/**
 * CLASS TOOL_IMPORT_MARC21
 * Read uploaded MARC21 files and import values based on tool configuration.
 *
 * Key features:
 * - Parses MARC21 binary format files (.mrc) using File_MARC library
 * - Maps MARC21 fields and subfields to Dédalo components
 * - Supports field extraction with filtering and conditional processing
 * - Handles data transformations: date formatting, value mapping, partial extraction
 * - Executes optional dd_action components when values are populated
 * - Matches records to existing sections via code lookup or creates new sections
 * - Propagates temporary component data during import workflow
 * - Batch processes multiple MARC21 records with logging
 *
 * Configuration:
 * - Reads tool config from ontology with map array defining field interactions
 * - Supports field_to_section_id mapping for record identification
 * - Uses dd_data_map for value transformation (e.g., 'cat' → locator reference)
 * - Supports field_multiple for concatenating values from multiple fields
 * - Handles skip_on_empty flag for conditional value storage
 *
 * Dependencies:
 * - File_MARC library for MARC21 file parsing
 * - search class for database queries to find existing records
 * - component_common for component instantiation and data storage
 * - ontology_node for type resolution and translatable detection
 *
 * @package Dedalo
 * @subpackage Tools
 */
class tool_import_marc21 extends tool_common {



	/**
	 * IMPORT_FILES
	 * Orchestrates MARC21 file import workflow with complete record processing.
	 * Reads MARC21 files from temporary storage, parses records, and populates
	 * Dédalo components according to configuration mappings.
	 *
	 * Workflow:
	 *   1. Validates tool configuration and mappings
	 *   2. Filters uploaded files for .mrc (MARC21 binary) format
	 *   3. Parses each MARC21 record using File_MARC library
	 *   4. Extracts section identification from configured MARC field
	 *   5. Searches for existing sections by code or creates new sections
	 *   6. Maps and transforms MARC field values according to configuration
	 *   7. Stores values in target Dédalo components with multi-language support
	 *   8. Executes optional dd_action components for related updates
	 *   9. Propagates temporary component data to target sections
	 *   10. Cleans up uploaded files and temporary data
	 *
	 * @param object $options Import workflow configuration containing:
	 *   - tipo (string): Portal component type identifier
	 *   - section_tipo (string): Target section type for created records
	 *   - section_id (int): Current section ID (used for portal context)
	 *   - tool_config (object): Tool configuration with ddo_map and processing rules
	 *   - files_data (array): Array of uploaded file objects
	 *   - components_temp_data (array): Temporary component data to propagate
	 *   - key_dir (string): Upload directory identifier
	 *
	 * @return object Response object with:
	 *   - result (bool): Overall operation success status
	 *   - msg (string): Summary message with operation result
	 */
	public static function import_files(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// Load configuration and prepare context
			$import_context = self::prepare_import_context($options);
			if (!$import_context) {
				$response->msg = 'Error. Failed to prepare import context';
				return $response;
			}

		// Filter MARC21 files from uploaded files
			$marc21_files = self::filter_marc21_files($import_context->files_data);
			if (empty($marc21_files)) {
				$response->result	= true;
				$response->msg		= 'No MARC21 files found to import';
				return $response;
			}

		// Process each MARC21 file
			$processing_info = [];
			foreach ($marc21_files as $marc21_file_data) {
				$file_processing_result = self::process_marc21_file(
					$marc21_file_data,
					$import_context
				);
				if ($file_processing_result) {
					$processing_info = array_merge($processing_info, $file_processing_result);
				}
			}

		// Clean up temporary session data
			self::cleanup_temp_session_data($import_context->input_components_section_tipo);

		// Success response
			$response->result	= true;
			$response->msg		= 'Import Marc21 files done successfully.';

		return $response;
	}//end import_files



	/**
	 * PREPARE_IMPORT_CONTEXT
	 * Extracts and validates all configuration and options needed for import.
	 * Centralizes context preparation to reduce complexity in main import method.
	 *
	 * @param object $options Raw options from import request
	 * @return object|null Context object with all necessary configuration, null on failure
	 */
	private static function prepare_import_context(object $options) : ?object {

		// Get tool configuration
			$tool_name	= get_called_class();
			$config		= tool_common::get_config($tool_name);
			if (!$config) {
				debug_log(__METHOD__
					. ' Failed to load tool configuration'
					, logger::ERROR
				);
				return null;
			}

		// Extract options
			$context = new stdClass();
			$context->tipo					= $options->tipo ?? null;
			$context->section_tipo			= $options->section_tipo ?? null;
			$context->section_id			= $options->section_id ?? null;
			$context->tool_config			= $options->tool_config ?? null;
			$context->files_data			= $options->files_data ?? null;
			$context->components_temp_data	= $options->components_temp_data ?? [];
			$context->key_dir				= $options->key_dir ?? null;

		// Extract configuration elements
			$context->main					= $config->config->main ?? [];
			$context->map					= $config->config->map ?? [];
			$context->ar_ddo_map			= $context->tool_config->ddo_map ?? [];

		// Get field to section_id mapping
			$context->field_to_section_id = array_find($context->main, function($el) {
				return $el->name === 'field_to_section_id';
			});

		// Prepare upload directory
			$user_id = logged_user_id();
			$context->tmp_dir = DEDALO_UPLOAD_TMP_DIR . '/'. $user_id . '/' . $context->key_dir;

		// Track input component section tipos for cleanup
			$context->input_components_section_tipo = [];

		return $context;
	}//end prepare_import_context



	/**
	 * FILTER_MARC21_FILES
	 * Filters uploaded files to return only MARC21 binary format files (.mrc).
	 *
	 * @param array|null $files_data Array of uploaded file objects
	 * @return array Filtered array containing only .mrc files
	 */
	private static function filter_marc21_files(?array $files_data) : array {

		if (empty($files_data)) {
			return [];
		}

		return array_filter($files_data, function($file) {
			return str_ends_with($file->name, '.mrc');
		});
	}//end filter_marc21_files



	/**
	 * PROCESS_MARC21_FILE
	 * Processes a single MARC21 file, parsing all records and importing data.
	 *
	 * @param object $marc21_file_data File metadata object with name property
	 * @param object $context Import context with configuration and paths
	 * @return array|null Array of processing info objects, null on failure
	 */
	private static function process_marc21_file(object $marc21_file_data, object $context) : ?array {

		// Validate file exists
			$file_full_path = $context->tmp_dir . '/' . $marc21_file_data->name;
			if (!file_exists($file_full_path)) {
				debug_log(__METHOD__
					. " File ignored (not found): {$marc21_file_data->name}" . PHP_EOL
					. " file_full_path: {$file_full_path}"
					, logger::ERROR
				);
				return null;
			}

		// Parse MARC21 file
			$marc_records = new File_MARC($file_full_path);
			$processing_info = [];

		// Process each record in the file
			while ($record = $marc_records->next()) {
				$record_result = self::process_marc21_record($record, $context);
				if ($record_result) {
					$processing_info[] = $record_result;
				}
			}

		// Delete processed file
			if (!unlink($file_full_path)) {
				debug_log(__METHOD__
					. " Error deleting marc21 file: {$file_full_path}"
					, logger::ERROR
				);
			}

		return $processing_info;
	}//end process_marc21_file



	/**
	 * PROCESS_MARC21_RECORD
	 * Processes a single MARC21 record: creates/finds section, maps fields, saves data.
	 *
	 * @param object $record MARC21 record object from File_MARC
	 * @param object $context Import context with configuration
	 * @return object|null Processing info object, null on failure
	 */
	private static function process_marc21_record(object $record, object $context) : ?object {

		// Resolve or create target section
			$section_id = self::resolve_target_section($record, $context);
			if (empty($section_id)) {
				debug_log(__METHOD__
					. ' Error: section_id is empty, ignored marc21 record'
					, logger::ERROR
				);
				return null;
			}

		// Track processing
			$processing_info = new stdClass();

		// Process MARC21 field mappings
			self::process_marc21_field_mappings($record, $section_id, $context);

		// Process temporary component data
			self::process_temp_component_data($section_id, $context);

		return $processing_info;
	}//end process_marc21_record



	/**
	 * RESOLVE_TARGET_SECTION
	 * Determines target section ID by searching for existing record or creating new one.
	 * Uses MARC21 identifier field to match existing sections.
	 *
	 * @param object $record MARC21 record object
	 * @param object $context Import context with configuration
	 * @return int|null Section ID if resolved/created, null on failure
	 */
	private static function resolve_target_section(object $record, object $context) : ?int {

		// Extract MARC21 identifier if configured
			$marc21_id = isset($context->field_to_section_id)
				? self::get_value($record, $context->field_to_section_id->value)
				: null;

		// No identifier configured - cannot proceed
			if (!isset($marc21_id)) {
				return null;
			}

		// Search for existing section by code
			$id_item = array_find($context->map, function($el) {
				return $el->name === 'id';
			});

			$section_id = self::get_section_id_from_code($id_item, $marc21_id);

		// Create new section if not found
			if (is_null($section_id)) {
				$section = section::get_instance($context->section_tipo, 'edit', false);
				$section_id = $section->create_record();
			}

		return $section_id;
	}//end resolve_target_section



	/**
	 * PROCESS_MARC21_FIELD_MAPPINGS
	 * Iterates through field mappings and saves extracted values to components.
	 *
	 * @param object $record MARC21 record object
	 * @param int $section_id Target section ID for data storage
	 * @param object $context Import context with map configuration
	 * @return void
	 */
	private static function process_marc21_field_mappings(object $record, int $section_id, object $context) : void {

		foreach ($context->map as $element_vars) {

			// Validate mapping has target component
				if (empty($element_vars->tipo)) {
					dump($element_vars, ' ERROR ON element_vars: tipo is empty ++ '.to_string());
					continue;
				}

			// Extract value from MARC21 record
				$value = self::extract_marc21_value($record, $element_vars);
				if (empty($value)) {
					continue;
				}

			// Transform value according to configuration
				$transformed_value = self::transform_marc21_value($value, $element_vars);
				if (is_null($transformed_value)) {
					continue;
				}

			// Save to Dédalo component
				self::save_to_component(
					$element_vars->tipo,
					$section_id,
					$context->section_tipo,
					$transformed_value
				);

			// Execute optional dd_action components
				if (!empty($transformed_value) && isset($element_vars->dd_action)) {
					self::execute_dd_actions(
						$element_vars->dd_action,
						$section_id,
						$context->section_tipo
					);
				}
		}
	}//end process_marc21_field_mappings



	/**
	 * EXTRACT_MARC21_VALUE
	 * Extracts raw value from MARC21 record using field mapping configuration.
	 * Handles conditional extraction and standard field extraction.
	 *
	 * @param object $record MARC21 record object
	 * @param object $element_vars Field mapping configuration
	 * @return string|null Extracted value, null if not found or empty
	 */
	private static function extract_marc21_value(object $record, object $element_vars) : ?string {

		$value = null;

		// Handle conditional extraction
			if (isset($element_vars->marc21_conditional)) {
				$value = self::extract_conditional_value($record, $element_vars);
			}

		// Standard extraction if no conditional or conditional failed
			if (is_null($value)) {
				$value = self::get_value($record, $element_vars);
			}

		// Check if value is empty
			if (empty($value) || !isset($value)) {
				return null;
			}

		// Skip if configured to skip empty values
			if (empty($value) && isset($element_vars->skip_on_empty) && $element_vars->skip_on_empty === true) {
				return null;
			}

		return $value;
	}//end extract_marc21_value



	/**
	 * EXTRACT_CONDITIONAL_VALUE
	 * Extracts value from MARC21 field only when conditional criteria are met.
	 * Used for filtering specific subfield values based on another subfield's content.
	 *
	 * @param object $record MARC21 record object
	 * @param object $element_vars Field mapping with marc21_conditional property
	 * @return string|null Extracted value if condition met, null otherwise
	 */
	private static function extract_conditional_value(object $record, object $element_vars) : ?string {

		$marc21_conditional = $element_vars->marc21_conditional;
		if (!$marc21_conditional) {
			return null;
		}

		$element_fields = $record->getFields($element_vars->field);
		foreach ($element_fields as $portal_row_obj) {

			$sub_field = $portal_row_obj->getSubfield($marc21_conditional->subfield);
			if ($sub_field->getData() == $marc21_conditional->value) {

				$element = $portal_row_obj->getSubfield($element_vars->subfield);
				return ($element === false) ? '' : $element->getData();
			}
		}

		return null;
	}//end extract_conditional_value



	/**
	 * TRANSFORM_MARC21_VALUE
	 * Applies configured transformations to extracted MARC21 value.
	 * Handles: trimming, partial extraction, date formatting, data mapping.
	 *
	 * @param string $value Raw extracted value
	 * @param object $element_vars Field mapping configuration with transform rules
	 * @return mixed Transformed value (string, object, or array)
	 */
	private static function transform_marc21_value(string $value, object $element_vars) : mixed {

		// Basic trimming
			$value = trim($value);
			$value = rtrim($value, " \t,:.");

		// Partial left content extraction
			if (isset($element_vars->partial_left_content)) {
				$value = self::extract_partial_left_content($value, $element_vars->partial_left_content);
			}

		// Date formatting
			if (isset($element_vars->date_format) && $element_vars->date_format === 'year') {
				$value = self::format_as_year($value);
			}

		// Data mapping
			if (isset($element_vars->dd_data_map)) {
				$value = self::apply_data_map($value, $element_vars->dd_data_map);
			}

		return $value;
	}//end transform_marc21_value



	/**
	 * EXTRACT_PARTIAL_LEFT_CONTENT
	 * Extracts leftmost portion of value, attempting to parse as integer.
	 *
	 * @param string $value Input value
	 * @param int $length Number of characters to extract
	 * @return int|string Extracted content, preferably as integer
	 */
	private static function extract_partial_left_content(string $value, int $length) : int|string {

		$value_trim = trim($value);
		$value_test = substr($value_trim, 0, $length);

		if (is_int($value_test) === false) {
			preg_match('/\d+/', $value, $value_test_matches);
			$value_test = (int)implode('', $value_test_matches);
		}

		return $value_test;
	}//end extract_partial_left_content



	/**
	 * FORMAT_AS_YEAR
	 * Converts numeric value to dd_date object with year set.
	 *
	 * @param string|int $value Year value as string or number
	 * @return object StdClass with start property containing dd_date
	 */
	private static function format_as_year(string|int $value) : object {

		$dd_date = new dd_date();
		if ((int)$value > 0) {
			$dd_date->set_year($value);
		}

		$date = new StdClass();
		$date->start = $dd_date;

		return $date;
	}//end format_as_year



	/**
	 * APPLY_DATA_MAP
	 * Maps raw MARC21 value to Dédalo value using configured mapping.
	 *
	 * @param string $value Raw value from MARC21
	 * @param object $dd_data_map Mapping object with value transformations
	 * @return mixed Mapped value, or original if no mapping exists
	 */
	private static function apply_data_map(string $value, object $dd_data_map) : mixed {

		if (property_exists($dd_data_map, $value)) {
			return $dd_data_map->$value;
		}

		debug_log(__METHOD__
			. " ERROR on map dd_data_map. No map exists for value" . PHP_EOL
			. ' value: ' . to_string($value)
			, logger::ERROR
		);

		return $value;
	}//end apply_data_map



	/**
	 * SAVE_TO_COMPONENT
	 * Creates component instance and saves transformed value.
	 *
	 * @param string $component_tipo Component type identifier
	 * @param int $section_id Target section ID
	 * @param string $section_tipo Section type identifier
	 * @param mixed $value Value to save (string, array, or object)
	 * @return void
	 */
	private static function save_to_component(
		string $component_tipo,
		int $section_id,
		string $section_tipo,
		mixed $value
	) : void {

		// Get component metadata
			$component_label	= ontology_node::get_term_by_tipo($component_tipo);
			$model_name			= ontology_node::get_model_by_tipo($component_tipo, true);
			$lang				= ontology_node::get_translatable($component_tipo)
				? DEDALO_DATA_LANG
				: DEDALO_DATA_NOLAN;

		// Instantiate component
			$component = component_common::get_instance(
				$model_name,
				$component_tipo,
				$section_id,
				'list',
				$lang,
				$section_tipo,
				false
			);

		// Prepare data format
			$component_data = self::prepare_component_data($model_name, $value, $component->get_lang());

		// Save
			$component->set_data($component_data);
			$component->save();

		// Log
			debug_log(__METHOD__
				. " Saved component {$component_tipo} ({$model_name} - {$component_label}) with data: "
				. to_string($component_data)
				, logger::DEBUG
			);
	}//end save_to_component



	/**
	 * PREPARE_COMPONENT_DATA
	 * Formats raw value(s) into the specific structure required by the target component model.
	 *
	 * @param string $model_name Component model name
	 * @param mixed $value Raw value or array of values
	 * @param string $lang Data language code
	 * @return mixed Formatted data structure
	 */
	private static function prepare_component_data(string $model_name, mixed $value, string $lang) : mixed {

		// Relationship components expect the raw array/object
		if (in_array($model_name, component_relation_common::get_components_with_relations())) {
			return $value;
		}

		// Date components expect the raw object (e.g. from format_as_year)
		if ($model_name === 'component_date') {
			$value_array = is_array($value) ? $value : [$value];
			return $value_array;
		}

		// Standard components expect an array of objects with value/lang
		$value_array = is_array($value) ? $value : [$value];
		$component_data = [];
		foreach ($value_array as $val) {
			$component_data[] = (object)[
				'value'	=> $val,
				'lang'	=> $lang,
			];
		}

		return $component_data;
	}//end prepare_component_data



	/**
	 * EXECUTE_DD_ACTIONS
	 * Executes optional dd_action components when main value is populated.
	 * Used for setting related component values automatically.
	 *
	 * @param object $dd_action Object mapping component tipos to values
	 * @param int $section_id Target section ID
	 * @param string $section_tipo Section type identifier
	 * @return void
	 */
	private static function execute_dd_actions(
		object $dd_action,
		int $section_id,
		string $section_tipo
	) : void {

		foreach ($dd_action as $component_tipo_action => $component_action_value) {

			$model_name = ontology_node::get_model_by_tipo($component_tipo_action, true);
			$component_action = component_common::get_instance(
				$model_name,
				$component_tipo_action,
				$section_id,
				'list',
				DEDALO_DATA_LANG,
				$section_tipo,
				false
			);

			$component_data = self::prepare_component_data(
				$model_name,
				$component_action_value,
				$component_action->get_lang()
			);

			$component_action->set_data($component_data);
			$component_action->save();

			debug_log(__METHOD__
				. " Saved dd_action. Component {$component_tipo_action} with data: " . PHP_EOL
				. ' value: ' . to_string($component_data)
				, logger::DEBUG
			);
		}
	}//end execute_dd_actions



	/**
	 * PROCESS_TEMP_COMPONENT_DATA
	 * Processes temporary component data from tool interface and saves to section.
	 * Handles input_component role from ddo_map configuration.
	 *
	 * @param int $section_id Target section ID
	 * @param object $context Import context with temp data and ddo_map
	 * @return void
	 */
	private static function process_temp_component_data(int $section_id, object $context) : void {

		foreach ($context->ar_ddo_map as $ddo) {

			// Only process input_component role
				if ($ddo->role !== 'input_component') {
					continue;
				}

			// Track section tipo for cleanup
				if (!in_array($ddo->section_tipo, $context->input_components_section_tipo)) {
					$context->input_components_section_tipo[] = $ddo->section_tipo;
				}

			// Find matching temp data
				$component_data = array_find($context->components_temp_data, function($item) use($ddo) {
					return isset($item->tipo)
						&& $item->tipo === $ddo->tipo
						&& $item->section_tipo === $ddo->section_tipo;
				});

				if (empty($component_data)) {
					continue;
				}

			// Save temp data to component
				$model			= ontology_node::get_model_by_tipo($ddo->tipo, true);
				$current_lang	= ontology_node::get_translatable($ddo->tipo)
					? DEDALO_DATA_LANG
					: DEDALO_DATA_NOLAN;

				$component = component_common::get_instance(
					$model,
					$ddo->tipo,
					$section_id,
					'list',
					$current_lang,
					$ddo->section_tipo
				);

				$component->set_data_lang($component_data->value, $current_lang);
				$component->save();
		}
	}//end process_temp_component_data



	/**
	 * CLEANUP_TEMP_SESSION_DATA
	 * Removes temporary section data from session for processed section types.
	 * Prevents data leakage between import operations.
	 *
	 * @param array $input_components_section_tipo Array of section tipos to clean
	 * @return void
	 */
	private static function cleanup_temp_session_data(array $input_components_section_tipo) : void {

		if (empty($input_components_section_tipo) || empty($_SESSION['dedalo']['section_temp_data'])) {
			return;
		}

		// Create regex pattern to match section types
			$pattern = '/(' . implode('|', array_map(function($t) {
				return preg_quote($t, '/');
			}, $input_components_section_tipo)) . ')/';

		// Filter out matching keys
			$_SESSION['dedalo']['section_temp_data'] = array_filter(
				(array)$_SESSION['dedalo']['section_temp_data'],
				function($key) use ($pattern) {
					// Keep items that DO NOT match the pattern
					return preg_match($pattern, (string)$key) === 0;
				},
				ARRAY_FILTER_USE_KEY
			);
	}//end cleanup_temp_session_data



	/**
	 * GET_VALUE
	 * Extracts value from MARC21 record field(s) with optional field multiplicity support.
	 * Handles both single field and multiple field extraction with concatenation.
	 *
	 * @param object $record MARC21 record object from File_MARC library
	 * @param object $element_vars Field extraction configuration containing:
	 *   - field (string|array): MARC21 field tag (e.g., '245', '020')
	 *   - field_multiple (bool): When true, concatenate values from multiple fields
	 *   - row_separator (string): Separator for concatenated values (default: '. ')
	 *   - subfield (string): Specific subfield code (e.g., 'a', 'b')
	 *   - subfield_separator (string): Separator for subfields (default: ' ')
	 *
	 * @return string Extracted field value, empty string if field not found
	 */
	public static function get_value( object $record, object $element_vars ) : string {

		if (isset($element_vars->field_multiple) && $element_vars->field_multiple) {

			$ar_mc21_fields = (array)$element_vars->field;
			$row_separator = $element_vars->row_separator ?? ". ";

			$field_values = [];
			foreach ($ar_mc21_fields as $current_field) {

				$ar_element_fields = $record->getFields($current_field);
				foreach ($ar_element_fields as $tag => $elementField) {
					$field_content = tool_import_marc21::get_field($elementField, $element_vars);
					if(!empty($field_content) && $field_content !== ''){
						$field_values[] = $field_content;
					}
				}
			}
			$value = implode($row_separator, $field_values);

		}else{

			$elementField = $record->getField($element_vars->field);

			$value = ($elementField !== false)
				? tool_import_marc21::get_field($elementField, $element_vars)
				: '';
		}

		return (string)$value;
	}//end get_value



	/**
	 * GET_FIELD
	 * Extracts and formats content from a single MARC21 field object.
	 * Supports extraction of specific subfields or concatenation of all subfields.
	 *
	 * @param object|null $elementField MARC21 field object from Record->getField()
	 * @param object $element_vars Field configuration containing:
	 *   - subfield (string|null): Specific subfield code to extract
	 *   - subfield_separator (string): Separator for concatenating multiple subfields
	 *
	 * @return string Formatted field content, empty string if field is null/empty
	 */
	public static function get_field( ?object $elementField, object $element_vars ) : string {

		if (empty($elementField)) {
			return '';
		}

		if (isset($element_vars->subfield)) {

			// Only for specific subfield
			$element = $elementField->getSubfield($element_vars->subfield);

			$text = ($element===false)
				? ''
				: $element->getData();

		}else{

			// Iterate all subfields
			$text		= '';
			$ar_text	= [];
			$separator	= $element_vars->subfield_separator ?? " ";
			if( property_exists($elementField, 'subfields') ) {
				foreach ($elementField->getSubfields() as $code => $value) {
					$ar_text[] =  $value->getData();
            	}
				$text = implode($separator, $ar_text);
			}
		}

		$value = trim($text);


		return $value;
	}//end get_field



	// Update data
	// find in current register if the record exist
	// if yes: reuse and update the record
	// if no : create new one



	/**
	 * GET_SECTION_ID_FROM_CODE
	 * Searches database for existing section matching MARC21 record code/identifier.
	 * Used to determine if record should be updated (found) or created (not found).
	 *
	 * @param object $id_item Configuration containing:
	 *   - ddo_map (array): Array with single ddo defining target section and component
	 * @param string $marc21_id Identifier value extracted from MARC21 record
	 *
	 * @return int|null Section ID if found in database, null when record is new
	 */
	public static function get_section_id_from_code( object $id_item, string $marc21_id ) : int|null {

		$ddo_map		= $id_item->ddo_map;
		$ddo			= reset($ddo_map);
		$section_tipo	= $ddo->section_tipo;	// rsc205
		$tipo			= $ddo->tipo;			// rsc137
		$model_name		= ontology_node::get_model_by_tipo($tipo,true);
		$code			= pg_escape_string(DBi::_getConnection(), $marc21_id);

		// JSON search_query_object to search
		$sqo = json_decode('
		{
			"id": "get_section_id_from_code",
			"section_tipo": "'.$section_tipo.'",
			"limit": 1,
			"filter": {
				"$or": [
					{
						"q": "='.$code.'",
						"path": [
							{
								"section_tipo"		: "'.$section_tipo.'",
								"component_tipo"	: "'.$tipo.'",
								"model"				: "'.$model_name.'",
								"name"				: "Code"
							}
						]
					},
					{
						"q": "*/'.$code.'",
						"path": [
							{
								"section_tipo"		: "'.$section_tipo.'",
								"component_tipo"	: "'.$tipo.'",
								"model"				: "'.$model_name.'",
								"name"				: "Code"
							}
						]
					}
				]
			}
		}');

		// search the sections that has this title
			$search	= search::get_instance($sqo);
			$db_result	= $search->search();

		// section_id
			$section_id = null; // Default
			if ($db_result->row_count() > 0) {
				// Found it in database
				$section_id = (int)$db_result->fetch_one()->section_id;

				debug_log(__METHOD__
					." Record found successfully [$section_id] with requested code: ".to_string($marc21_id)
					, logger::DEBUG
				);
			}


		return $section_id;
	}//end get_section_id_from_code



	/**
	 * GET_SECTION_ID_FROM_COLLECTIONS_CONTAINER_TITLE
	 * Searches database for existing section matching MARC21 collection/series title.
	 * Used to find or create related collection records during import.
	 *
	 * @param object $series_ddo DDD object configuration containing:
	 *   - section_tipo (string): Section type for series/collections (e.g., 'rsc212')
	 *   - tipo (string): Component type storing title (e.g., 'rsc214')
	 * @param string $collection_title Title from MARC21 field (e.g., from 490 $a)
	 *
	 * @return int|null Section ID if found, null when collection needs to be created
	 */
	public static function get_section_id_from_collections_container_title( object $series_ddo, string $collection_title ) : int|null {

		$section_tipo		= $series_ddo->section_tipo;		// rsc212 	# values list for Series / Collections
		$tipo				= $series_ddo->tipo;				// rsc214 	# Series / Collections (component_input_text)
		$model_name			= ontology_node::get_model_by_tipo($tipo,true);
		$serie_name			= pg_escape_string(DBi::_getConnection(), $collection_title);

		// JSON search_query_object to search
		$sqo = json_decode('
		{
			"id": "get_section_id_from_collections_container_title",
			"section_tipo": "'.$section_tipo.'",
			"limit": 1,
			"filter": {
				"$and": [
					{
						"q": "\''.$serie_name.'\'",
						"path": [
							{
								"section_tipo": "'.$section_tipo.'",
								"component_tipo": "'.$tipo.'",
								"model": "'.$model_name.'",
								"name": "Series / Collections"
							}
						]
					}
				]
			}
		}');

		// search the sections that has this title
			$search	= search::get_instance($sqo);
			$db_result	= $search->search();

		// section_id
			$section_id = null; // Default
			if ($db_result->row_count() > 0) {
				// Found it in database
				$section_id = (int)$db_result->fetch_one()->section_id;

				debug_log(__METHOD__
					." Successful Founded record [$section_id] with requested code: ".to_string($collection_title)
					, logger::DEBUG
				);
			}


		return $section_id;
	}//end get_section_id_from_COlLECTIONS_container_title



}//end class tool_import_marc21
