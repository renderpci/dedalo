<?php declare(strict_types=1);
// Add MARC library to read and process the Marc21 files
require_once dirname(__FILE__).'/lib/MARC.php';
/**
 * CLASS TOOL_IMPORT_MARC21
 * Dédalo tool that reads uploaded MARC21 binary files and imports their field
 * values into Dédalo sections and components according to a per-installation
 * configuration stored in the ontology (dd1633 component inside the tool record).
 *
 * Data flow overview:
 *   Browser uploads one or more .mrc files → tool stores them under
 *   DEDALO_UPLOAD_TMP_DIR/<user_id>/<key_dir>/ → import_files() is called →
 *   each file is parsed record-by-record with the bundled File_MARC library →
 *   for each MARC21 record the tool resolves or creates a target Dédalo section
 *   (identified by the configured field_to_section_id MARC field) → each mapping
 *   entry in the config "map" array is processed: the MARC field value is extracted,
 *   optionally transformed, and persisted to the corresponding Dédalo component →
 *   temporary input-component data (e.g. a pre-selected project) is propagated to
 *   every created section → processed files are deleted.
 *
 * Tool configuration shape (stored in the ontology, loaded via tool_common::get_config):
 *   {
 *     "main": [                     // global settings array
 *       { "name": "field_to_section_id", "value": { "field": "907", "subfield": "a" } },
 *       ...
 *     ],
 *     "map": [                      // ordered list of field-to-component bindings
 *       {
 *         "name"     : "id",        // logical name; "id" triggers upsert lookup
 *         "tipo"     : "rsc137",    // Dédalo component tipo to write
 *         "field"    : "907",       // MARC21 tag (string or array when field_multiple)
 *         "subfield" : "a",         // MARC21 subfield code (omit to join all subfields)
 *         // optional transforms:
 *         "partial_left_content": 4,  // take N leftmost chars and cast to int
 *         "date_format": "year",      // wrap value in dd_date { start: { year: N } }
 *         "dd_data_map": { "cat": [...locator...] }, // map raw value → Dédalo value
 *         "marc21_conditional": { "subfield": "j", "value": "193" },
 *         "field_multiple": true,     // collect same tag across all occurrences
 *         "row_separator": "</p><p>", // glue for field_multiple results
 *         "subfield_separator": " ",  // glue when joining all subfields
 *         "skip_on_empty": true,      // skip entire mapping if extracted value is empty
 *         "dd_action": { "rsc249": [...locator...] } // side-effect component writes
 *       }
 *     ]
 *   }
 *
 * Key responsibilities:
 * - Filter uploaded files to .mrc (MARC21 binary) format only.
 * - Upsert logic: search existing sections by identifier code before creating new ones.
 * - Multi-language awareness: consults ontology_node::get_translatable() to decide
 *   between DEDALO_DATA_LANG and DEDALO_DATA_NOLAN when storing component data.
 * - Propagate temporary input-component data (e.g. a pre-selected project locator)
 *   to every newly created/updated section, then scrub session temp data.
 *
 * Extends:
 *   tool_common — provides get_config(), tool registration, and API dispatch.
 *
 * External library:
 *   tools/tool_import_marc21/lib/MARC.php — PEAR File_MARC; File_MARC and
 *   File_MARC_Record are the primary classes consumed here.
 *
 * @package Dédalo
 * @subpackage Tools
 */
class tool_import_marc21 extends tool_common {



	/**
	 * API_ACTIONS
	 * Explicit allowlist of method names callable through the public tool API
	 * (dd_tools_api::tool_request / tool_security). Only methods listed here may
	 * be invoked by an authenticated browser request.
	 *
	 * The low-level helpers get_value, get_field, get_section_id_from_code, and
	 * get_section_id_from_collections_container_title are deliberately absent:
	 * they take positional, non-rqo arguments and are for internal use only.
	 * (!) Adding a method here exposes it to the network; review security impact first.
	 *
	 * @var array<string> $API_ACTIONS
	 */
	public const API_ACTIONS = [
		'import_files'
	];



	/**
	 * IMPORT_FILES
	 * Public API entry point — orchestrates the full MARC21 file import workflow.
	 * This is the only method exposed through the tool API (see API_ACTIONS).
	 *
	 * Workflow:
	 *   1. Security gate: asserts write permission (level 2) on the target section_tipo.
	 *   2. Builds an import context object consolidating options and tool configuration.
	 *   3. Filters $options->files_data to .mrc files only; returns success early when none.
	 *   4. Delegates per-file processing to process_marc21_file(); each file is deleted
	 *      from the temp upload directory after successful processing.
	 *   5. Purges session temp-data keys for all input_component section tipos encountered
	 *      during processing, so transient tool-UI state does not bleed into later imports.
	 *
	 * Side effects:
	 *   - May create new section records (section::create_record).
	 *   - Writes component data to the database for every mapping entry in the config.
	 *   - Deletes processed .mrc files from DEDALO_UPLOAD_TMP_DIR/<user>/<key_dir>/.
	 *   - Modifies $_SESSION['dedalo']['section_temp_data'] (cleanup step).
	 *
	 * @param object $options Import request payload containing:
	 *   - tipo           (string)  Portal component tipo (context anchor for the tool UI).
	 *   - section_tipo   (string)  REQUIRED. Target section tipo for created/updated records.
	 *   - section_id     (int)     Current portal section ID (not used for writes here).
	 *   - tool_config    (object)  Runtime tool config including ddo_map (array of ddo objects).
	 *   - files_data     (array)   Uploaded file descriptor objects; each has a ->name property.
	 *   - components_temp_data (array) Temporary component data (e.g. pre-selected project)
	 *                              collected from the tool UI to propagate to every new section.
	 *   - key_dir        (string)  Sub-directory name under the user's temp upload root.
	 *
	 * @return object stdClass with:
	 *   - result (bool)   true on success, false on configuration or permission error.
	 *   - msg    (string) Human-readable summary; shown to the operator in the tool UI.
	 */
	public static function import_files(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// SEC-024 (§9.2): WRITE gate. MARC21 import creates / overwrites
		// records on the target section.
			$section_tipo = $options->section_tipo ?? null;
			if (empty($section_tipo)) {
				$response->msg = 'Error. Missing section_tipo';
				return $response;
			}
			security::assert_section_permission($section_tipo, 2, __METHOD__);

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
	 * Assembles a single context stdClass that carries every piece of data the
	 * downstream processing methods need, so they do not have to repeatedly
	 * re-read options or tool configuration.
	 *
	 * The returned object exposes:
	 *   - tipo, section_tipo, section_id, tool_config, files_data,
	 *     components_temp_data, key_dir  — mirrored from $options
	 *   - main   (array)  — "main" array from the tool config (global settings)
	 *   - map    (array)  — "map" array from the tool config (field-to-component bindings)
	 *   - ar_ddo_map (array) — ddo_map from tool_config (runtime portal ddo objects)
	 *   - field_to_section_id (object|null) — "main" entry whose name === 'field_to_section_id';
	 *     describes which MARC21 field holds the record's unique identifier
	 *   - tmp_dir (string) — absolute path to the user's upload temp directory for this batch
	 *   - input_components_section_tipo (array) — accumulates section tipos of input_component
	 *     ddo entries encountered during processing; used by cleanup_temp_session_data()
	 *
	 * @param object $options Raw options from the import_files API request.
	 * @return object|null Populated context object, or null if tool_common::get_config() fails.
	 */
	private static function prepare_import_context(object $options) : ?object {

		// Get tool configuration
		// get_called_class() returns the concrete class name even in a static context,
		// which is used here to locate the correct tool config record in the ontology.
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
			$context->key_dir				= sanitize_key_dir($options->key_dir ?? '');

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
	 * Filters the tool's uploaded-file list down to MARC21 binary files only.
	 * The .mrc extension is the standard binary MARC21 format (ISO 2709). Other
	 * upload formats (e.g. MARCXML .xml) are intentionally rejected here.
	 *
	 * @param array|null $files_data Array of file descriptor objects (each with a ->name string).
	 * @return array Subset containing only objects whose ->name ends with '.mrc'.
	 *               Returns empty array when $files_data is null or empty.
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
	 * Handles one .mrc binary file end-to-end: validates its existence on disk,
	 * opens it via File_MARC, iterates every contained MARC21 record, and removes
	 * the file from disk once all records have been processed.
	 *
	 * File_MARC::next() returns false when the record stream is exhausted, which
	 * terminates the while loop naturally.  Each record is delegated to
	 * process_marc21_record(); null results (e.g. when section ID cannot be
	 * resolved) are silently skipped here — errors are logged inside that method.
	 *
	 * The file is deleted even if some individual records failed, to avoid
	 * re-processing on a retry.  A failed unlink is logged but does not abort.
	 *
	 * @param object $marc21_file_data Uploaded file descriptor with a ->name string.
	 * @param object $context         Import context built by prepare_import_context().
	 * @return array|null Array of per-record stdClass result objects (may be empty),
	 *                    or null if the file was not found on disk.
	 */
	private static function process_marc21_file(object $marc21_file_data, object $context) : ?array {

		// Validate file exists. TOOLS-05: confine the client-supplied name under
		// tmp_dir. safe_upload_target() reduces the name to its basename and rejects
		// '..'/separator payloads, preventing traversal into another user's upload dir
		// (the file is read by File_MARC and then unlink'd, so an unconfined name is an
		// arbitrary file read + delete).
			try {
				$file_full_path = safe_upload_target($context->tmp_dir, $marc21_file_data->name, false);
			} catch (Exception $e) {
				debug_log(__METHOD__
					. " File ignored (invalid name): {$marc21_file_data->name}"
					, logger::ERROR
				);
				return null;
			}
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
	 * Processes one MARC21 record object: resolves or creates the target Dédalo
	 * section, applies all configured field mappings, and propagates temporary
	 * input-component data (e.g. project selector) to that section.
	 *
	 * The method returns null and logs an error if the section ID cannot be
	 * determined (e.g. missing identifier field in MARC21 data or bad config).
	 * The caller (process_marc21_file) silently skips null results.
	 *
	 * @param object $record  File_MARC_Record object returned by File_MARC::next().
	 * @param object $context Import context built by prepare_import_context().
	 * @return object|null Minimal stdClass sentinel on success (currently carries no
	 *                     data; callers may use it for count tracking in the future),
	 *                     or null when the record must be skipped.
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
	 * Implements upsert logic for the target Dédalo section:
	 *   1. Reads the MARC21 identifier field defined by config->main->field_to_section_id.
	 *   2. Queries the database via get_section_id_from_code() to see if a section with
	 *      that identifier already exists.
	 *   3. If found, returns the existing section_id (the import will overwrite its data).
	 *   4. If not found, calls section::create_record() to create a new, empty section.
	 *
	 * Returns null (and the caller skips the record) when field_to_section_id is not
	 * configured in the tool — this is a required configuration element.
	 *
	 * @param object $record  File_MARC_Record object from File_MARC::next().
	 * @param object $context Import context; must have field_to_section_id and section_tipo.
	 * @return int|null Resolved or newly created section ID, or null if config is missing.
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
	 * Iterates over every entry in the tool config "map" array and, for each entry:
	 *   1. Extracts the raw string value from the MARC21 record (extract_marc21_value).
	 *   2. Applies configured transformations — trim, partial extraction, date formatting,
	 *      or data-map substitution (transform_marc21_value).
	 *   3. Persists the transformed value to the target Dédalo component (save_to_component).
	 *   4. Optionally fires "dd_action" side-effect writes to additional components
	 *      (e.g. automatically setting a "has ISBN" flag when an ISBN is present).
	 *
	 * Mapping entries that lack a "tipo" property are logged and skipped.
	 * Entries whose extracted value is empty after extraction are also skipped, so
	 * existing component data is not overwritten with blank values.
	 *
	 * @param object $record     File_MARC_Record object from File_MARC::next().
	 * @param int    $section_id Target section ID where component values will be written.
	 * @param object $context    Import context; uses $context->map and $context->section_tipo.
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
	 * Attempts to extract a non-empty string value from the MARC21 record for a
	 * single mapping entry.  The extraction strategy is:
	 *   a) If the entry has a "marc21_conditional" key, delegate to
	 *      extract_conditional_value() — only returns a value when the guarding
	 *      subfield matches the expected value.
	 *   b) If conditional extraction yields null (no match or no conditional key),
	 *      fall back to the standard get_value() path.
	 *
	 * Returns null (causing the caller to skip the mapping entry) when:
	 *   - The extracted value is empty.
	 *   - The value would trigger dd_action but is intentionally empty when
	 *     skip_on_empty is configured (e.g. ISBN/ISSN fields with no value).
	 *
	 * @param object $record       File_MARC_Record to extract from.
	 * @param object $element_vars Single map entry from the tool configuration.
	 * @return string|null Non-empty extracted value, or null to skip this mapping.
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
		// (!) The !isset($value) branch here is unreachable: get_value() and
		//     extract_conditional_value() both return string|null, so $value is
		//     always set at this point.  The guard is kept to match the original logic.
			if (empty($value) || !isset($value)) {
				return null;
			}

		// Skip if configured to skip empty values
		// (!) This second empty($value) check is also unreachable: the block above
		//     already returned null for empty values.  Preserved to match original logic.
			if (empty($value) && isset($element_vars->skip_on_empty) && $element_vars->skip_on_empty === true) {
				return null;
			}

		return $value;
	}//end extract_marc21_value



	/**
	 * EXTRACT_CONDITIONAL_VALUE
	 * Extracts a subfield value from MARC21 only when a guard condition passes.
	 *
	 * Example use-case (from sample_config.json): MARC21 field 945 appears multiple
	 * times in a record (once per copy/item).  The guard condition checks subfield "j"
	 * for the value "193" (library code) so that only the relevant copy's data is
	 * extracted rather than all copies' data.
	 *
	 * Logic:
	 *   - Iterates all occurrences of $element_vars->field (e.g. "945").
	 *   - For each occurrence, reads the guard subfield ($marc21_conditional->subfield).
	 *   - If the guard subfield's value equals $marc21_conditional->value, reads and
	 *     returns the target subfield ($element_vars->subfield); stops on first match.
	 *   - Returns null when no occurrence satisfies the condition.
	 *
	 * @param object $record       File_MARC_Record to inspect.
	 * @param object $element_vars Map entry; must have marc21_conditional->subfield and
	 *                             marc21_conditional->value, plus field and subfield.
	 * @return string|null Matched subfield data, empty string if subfield absent in the
	 *                     matched occurrence, or null when no occurrence matches.
	 */
	private static function extract_conditional_value(object $record, object $element_vars) : ?string {

		$marc21_conditional = $element_vars->marc21_conditional;
		if (!$marc21_conditional) {
			return null;
		}

		$element_fields = $record->getFields($element_vars->field);
		foreach ($element_fields as $portal_row_obj) {

			// getSubfield() returns false when the subfield does not exist;
			// skip this occurrence to avoid a fatal ->getData() call on false.
			$sub_field = $portal_row_obj->getSubfield($marc21_conditional->subfield);
			if ($sub_field !== false && $sub_field->getData() == $marc21_conditional->value) {

				$element = $portal_row_obj->getSubfield($element_vars->subfield);
				return ($element === false) ? '' : $element->getData();
			}
		}

		return null;
	}//end extract_conditional_value



	/**
	 * TRANSFORM_MARC21_VALUE
	 * Applies the chain of optional transformations declared in a map entry to the
	 * raw MARC21 string value. Transformations are applied in this fixed order:
	 *
	 *   1. trim() — remove leading/trailing whitespace.
	 *   2. rtrim(" \t,:.") — strip common MARC21 trailing punctuation marks.
	 *   3. partial_left_content (int) — keep only the N leftmost characters and
	 *      attempt to cast the result to int (see extract_partial_left_content).
	 *   4. date_format === 'year' — wrap the numeric year in a dd_date structure
	 *      returned as stdClass { start: dd_date } (see format_as_year).
	 *   5. dd_data_map (object) — replace the raw MARC21 code (e.g. 'cat') with
	 *      the configured Dédalo value (e.g. a locator array pointing to lg1 section).
	 *
	 * The return type varies by transformation applied:
	 *   - No transform:     string
	 *   - partial_left_content only:  int|string
	 *   - date_format:      stdClass (dd_date wrapper)
	 *   - dd_data_map:      mixed — whatever the map value is (typically array of locators)
	 *
	 * @param string $value        Raw extracted MARC21 string value (already non-empty).
	 * @param object $element_vars Single map entry from the tool configuration.
	 * @return mixed Transformed value ready to be written to the target component.
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
	 * Takes the $length leftmost characters of $value and attempts to return
	 * a numeric (integer) representation.  Designed for MARC21 year values that
	 * may appear as "2023." or "2023 c" in field 260/264 $c; the standard config
	 * passes length=4 to extract the four-digit year prefix.
	 *
	 * (!) is_int(substr(...)) is always false in PHP because substr() returns
	 *     a string, never an integer.  The if-branch therefore always executes,
	 *     meaning $value_test from substr() is discarded and preg_match() is used
	 *     unconditionally to find the first integer sequence in the original
	 *     (untrimmed) $value.  The $length parameter is effectively unused as a
	 *     character count in practice — the regex is the actual extraction.
	 *     This is a pre-existing logic quirk; do not change.
	 *
	 * @param string $value  Raw MARC21 field value (e.g. "2023.").
	 * @param int    $length Intended character count for left-truncation (see note above).
	 * @return int|string    First integer sequence found in $value, cast to int, or
	 *                       0 (int) when $value contains no digits.
	 */
	private static function extract_partial_left_content(string $value, int $length) : int|string {

		$value_trim = trim($value);
		$value_test = substr($value_trim, 0, $length);

		// (!) is_int() on a substr() result is always false (substr returns string).
		//     The condition never takes the true branch; execution always falls into
		//     the regex path.  Preserved as-is to keep original behaviour.
		if (is_int($value_test) === false) {
			preg_match('/\d+/', $value, $value_test_matches);
			$value_test = (int)implode('', $value_test_matches);
		}

		return $value_test;
	}//end extract_partial_left_content



	/**
	 * FORMAT_AS_YEAR
	 * Converts a bare year string or integer into the dd_date structure expected
	 * by component_date.  The output shape matches the component_date save contract:
	 *   stdClass { start: dd_date { year: N, ... } }
	 *
	 * When the value casts to a non-positive integer (e.g. an empty string or
	 * non-numeric text), dd_date::set_year() is not called and the start date
	 * remains an empty dd_date object — component_date will store it but display
	 * no year.
	 *
	 * In practice this method receives a string (the output of extract_marc21_value),
	 * or an int when called after extract_partial_left_content.  The union type
	 * accommodates both callers.
	 *
	 * @param string|int $value Year value (e.g. "2023", 2023, or the result of
	 *                          extract_partial_left_content which returns int|string).
	 * @return object           stdClass { start: dd_date } ready for component_date::set_data().
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
	 * Translates a raw MARC21 coded value into its Dédalo equivalent using the
	 * "dd_data_map" property from a map entry.
	 *
	 * The dd_data_map is an object whose property names are MARC21 code strings
	 * and whose values are the corresponding Dédalo target values — typically
	 * locator arrays for relation components.  Example from sample_config.json:
	 *   { "cat": [{ "section_id": "3032", "section_tipo": "lg1" }] }
	 * A MARC21 language code "cat" maps to a relation locator pointing to the
	 * Catalan language record in the lg1 section.
	 *
	 * When no mapping is defined for the given $value, the raw $value is returned
	 * unchanged and an ERROR is emitted to the debug log — this usually indicates
	 * a configuration gap (a MARC21 code not yet covered by the mapping).
	 *
	 * @param string $value       Raw MARC21 code string to look up.
	 * @param object $dd_data_map Mapping object keyed by MARC21 code.
	 * @return mixed Mapped Dédalo value (often array<object>) or the original
	 *               $value string when no mapping entry exists.
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
	 * Instantiates a Dédalo component and persists a single transformed value.
	 *
	 * Language selection follows the Dédalo standard: if the component tipo is
	 * marked as translatable in the ontology (get_translatable() returns true),
	 * the current UI language DEDALO_DATA_LANG is used; otherwise DEDALO_DATA_NOLAN
	 * is used for language-neutral components (codes, numbers, relations, etc.).
	 *
	 * The raw $value is normalized into the component model's expected data shape
	 * by prepare_component_data() before being handed to set_data() and save().
	 *
	 * @param string $component_tipo Ontology tipo of the target component (e.g. 'rsc140').
	 * @param int    $section_id     Target section ID to write the component data into.
	 * @param string $section_tipo   Section tipo that owns the component (e.g. 'rsc205').
	 * @param mixed  $value          Transformed value — string, int, stdClass (dd_date
	 *                               wrapper), or array of locators, depending on prior
	 *                               transform steps.
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
	 * Adapts the transformed value into the exact data shape expected by
	 * component_common::set_data() for the given component model.
	 *
	 * The three shapes handled are:
	 *   - Relation components (component_relation_common family): value is already
	 *     an array of locator objects (produced by dd_data_map or the browser);
	 *     returned as-is so the relation's own set_data() logic handles it.
	 *   - component_date: value is a stdClass { start: dd_date } produced by
	 *     format_as_year(); wrapped in an array because set_data() expects an
	 *     array of date items (even for a single date).
	 *   - All other components (text, number, IRI, …): value is a string or int;
	 *     wrapped in an array of { value, lang } objects — the standard datum
	 *     shape for component_input_text, component_number, etc.
	 *
	 * @param string $model_name PHP class name of the component model (e.g. 'component_input_text').
	 * @param mixed  $value      Transformed value — string, int, stdClass (dd_date wrapper),
	 *                           or array of locators from dd_data_map.
	 * @param string $lang       Language code to embed in literal datum objects
	 *                           (DEDALO_DATA_LANG or DEDALO_DATA_NOLAN).
	 * @return mixed             Data array ready for component_common::set_data().
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
	 * Fires side-effect writes to additional components whenever a primary mapping
	 * field produced a non-empty value.  Typical use-case: automatically marking a
	 * "has ISBN" component (e.g. rsc249) when a valid ISBN is imported from MARC21
	 * field 020, so related catalogue flags stay in sync without manual input.
	 *
	 * $dd_action is an object whose property names are target component tipos and
	 * whose property values are the Dédalo values to store in those components
	 * (often locator arrays pointing to a controlled-vocabulary entry).
	 * Example from sample_config.json:
	 *   { "rsc249": [{ "section_id": "1", "section_tipo": "dd292" }] }
	 *
	 * Each action component is instantiated at DEDALO_DATA_LANG regardless of its
	 * translatable flag.  This is intentional for action-type components that store
	 * status/flag values, not text.
	 *
	 * @param object $dd_action  stdClass keyed by component tipo; values are the
	 *                           data to persist (typically array of locator objects).
	 * @param int    $section_id Section ID to write action component data into.
	 * @param string $section_tipo Section tipo that owns the action components.
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
	 * Propagates transient UI-collected values (e.g. a project selector filled in
	 * by the operator before clicking "import") to every section created or updated
	 * by the current import batch.
	 *
	 * How it works:
	 *   - The tool's ddo_map (from the portal configuration) may include ddo entries
	 *     with role === 'input_component'.  These represent components rendered in the
	 *     tool UI for the operator to fill in before import.
	 *   - The browser sends the operator's values as $options->components_temp_data
	 *     (an array of { tipo, section_tipo, value } objects).
	 *   - For each input_component ddo, the matching temp datum is located and written
	 *     to the target section via set_data_lang() + save().
	 *   - The section tipo of each input_component is accumulated in
	 *     $context->input_components_section_tipo for later cleanup by
	 *     cleanup_temp_session_data().
	 *
	 * This call happens once per MARC21 record, so all created/updated sections
	 * receive the same operator-provided values (e.g. all records imported in this
	 * batch belong to the same project).
	 *
	 * @param int    $section_id Target section ID to receive the temp component values.
	 * @param object $context    Import context; uses ar_ddo_map, components_temp_data,
	 *                           and mutates input_components_section_tipo.
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
	 * Removes transient section data from $_SESSION['dedalo']['section_temp_data']
	 * for every input_component section tipo encountered during the import batch.
	 *
	 * Background: Dédalo stores temporary, unsaved component values in the session
	 * under keys that contain the section tipo (e.g. "rsc205_unsaved").  After all
	 * MARC21 records have been written, this stale session data must be pruned so
	 * that a subsequent import or navigation does not accidentally replay the values
	 * collected for this batch.
	 *
	 * Implementation: builds a single regex that matches any session key containing
	 * one of the collected section tipos, then removes those keys from the session
	 * array using array_filter with ARRAY_FILTER_USE_KEY.
	 *
	 * A no-op guard at the top exits immediately when either the list of tipos or
	 * the session temp-data bucket is empty, avoiding unnecessary work.
	 *
	 * @param array<string> $input_components_section_tipo Section tipos to purge from session.
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
	 * Core MARC21 field extraction dispatcher.  Reads one or more field occurrences
	 * from the record and returns their combined string value.
	 *
	 * Two modes controlled by $element_vars->field_multiple:
	 *
	 *   field_multiple === true
	 *     $element_vars->field must be an array of MARC21 tags (or a single tag
	 *     cast to array).  All occurrences of every listed tag are collected and
	 *     their content strings are joined with $element_vars->row_separator
	 *     (default ". ").  Example use: "Indexations" collects tags 600–688.
	 *
	 *   field_multiple absent / false (default)
	 *     $element_vars->field is a single MARC21 tag string.  Only the first
	 *     occurrence of that tag is read (File_MARC_Record::getField returns the
	 *     first match).  Returns '' if the tag is absent.
	 *
	 * Field content extraction for each occurrence is delegated to get_field(),
	 * which handles the subfield / all-subfields branching.
	 *
	 * This method is public so it can be called from external import scripts and
	 * tests without going through the full import_files workflow.
	 *
	 * @param object $record       File_MARC_Record to extract from.
	 * @param object $element_vars Map entry with at least a "field" property.
	 *                             Optional: field_multiple (bool), row_separator (string),
	 *                             subfield (string), subfield_separator (string).
	 * @return string Extracted and concatenated field content, empty string when absent.
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
	 * Extracts the string content of a single File_MARC field object, with two modes:
	 *
	 *   Specific subfield (element_vars->subfield is set):
	 *     Calls getSubfield($code) on the field.  Returns '' when getSubfield()
	 *     returns false (subfield absent in this occurrence).
	 *
	 *   All subfields (element_vars->subfield absent):
	 *     Iterates all subfields via getSubfields() and joins their values with
	 *     $element_vars->subfield_separator (default " ").  The property_exists()
	 *     guard prevents calling getSubfields() on fixed-length control fields
	 *     (MARC21 tags 001–009) that have no subfields array.
	 *
	 * The final result is trimmed before returning.
	 *
	 * This method is public so it can be called from external import scripts that
	 * build their own MARC iteration loop outside the standard import_files workflow.
	 *
	 * @param object|null $elementField File_MARC_Field object from getField()/getFields(),
	 *                                  or null/false (treated as empty).
	 * @param object      $element_vars Map entry; uses subfield (string|null) and
	 *                                  subfield_separator (string, default " ").
	 * @return string Trimmed field content, empty string when field is absent or empty.
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
			// $code is the subfield letter (e.g. 'a', 'b'); unused here since all
			// subfield values are collected indiscriminately into $ar_text.
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
	 * Searches the Dédalo database for an existing section whose identifier component
	 * matches the MARC21 record's control number / local code, enabling upsert behaviour.
	 *
	 * How the search works:
	 *   The search_query_object uses an $or filter with two query patterns against
	 *   the identifier component (e.g. rsc137 in section rsc205):
	 *     1. '='.$code  — exact match (the identifier is stored as a plain string)
	 *     2. '*' . '/' . $code — suffix/path match (the identifier may be part of a
	 *                     composite value like a locator path)
	 *   The limit is 1 — only the first hit is used.  If the identifier is unique
	 *   (as expected for a control number), this is always the correct record.
	 *
	 *   $marc21_id is escaped with pg_escape_string() before embedding into the SQO
	 *   query string to prevent injection through crafted MARC21 data.
	 *
	 * This method is public so it can be tested or called from specialised import scripts
	 * without running the full import_files pipeline.
	 *
	 * @param object $id_item   The 'id' map entry from the tool config; must have a
	 *                          ddo_map array with at least one entry providing
	 *                          section_tipo and tipo (the identifier component).
	 * @param string $marc21_id MARC21 identifier extracted from the record
	 *                          (e.g. value of field 907 $a).
	 * @return int|null         Section ID of the matching record, or null when the
	 *                          identifier does not exist yet (new record case).
	 */
	public static function get_section_id_from_code( object $id_item, string $marc21_id ) : int|null {

		$ddo_map		= $id_item->ddo_map;
		$ddo			= reset($ddo_map);
		$section_tipo	= $ddo->section_tipo;	// rsc205
		$tipo			= $ddo->tipo;			// rsc137
		$model_name		= ontology_node::get_model_by_tipo($tipo,true);
		$code			= pg_escape_string(DBi::_getConnection(), $marc21_id);

		// JSON search_query_object to search
		$sqo_data = (object)[
			'id' => 'get_section_id_from_code',
			'section_tipo' => $section_tipo,
			'limit' => 1,
			'filter' => (object)[
				'$or' => [
					(object)[
						'q' => '='.$code,
						'path' => [
							(object)[
								'section_tipo' => $section_tipo,
								'component_tipo' => $tipo,
								'model' => $model_name,
								'name' => 'Code'
							]
						]
					],
					(object)[
						'q' => '*/'.$code,
						'path' => [
							(object)[
								'section_tipo' => $section_tipo,
								'component_tipo' => $tipo,
								'model' => $model_name,
								'name' => 'Code'
							]
						]
					]
				]
			]
		];
		$sqo = new search_query_object($sqo_data);

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
	 * Searches the database for a series/collections section whose title component
	 * exactly matches the given collection title string from a MARC21 field (e.g.
	 * MARC21 490 $a "Biblioteca de textos legals").
	 *
	 * This method supports a secondary upsert pattern used when the import config
	 * maps a MARC21 collection/series field to a separate Dédalo section hierarchy
	 * (e.g. rsc212 "Series / Collections" with title stored in rsc214).  If the
	 * collection already exists the caller reuses its section_id; if not, the caller
	 * creates a new collection record before linking.
	 *
	 * The SQO filter uses an $and clause with a quoted exact-match query ('title')
	 * rather than an $or like get_section_id_from_code(), because collection titles
	 * are not composite-path values — they are plain text stored in a text component.
	 * $collection_title is escaped with pg_escape_string() before embedding.
	 *
	 * This method is not listed in API_ACTIONS and is not callable via the tool API;
	 * it is intended to be called from custom import scripts that extend the default
	 * import workflow with series/collection linkage.
	 *
	 * @param object $series_ddo    ddo-like object with section_tipo (the series section
	 *                              type, e.g. 'rsc212') and tipo (the title component,
	 *                              e.g. 'rsc214').
	 * @param string $collection_title Exact title string to search for (from MARC21 data).
	 * @return int|null             Section ID of the existing collection record, or null
	 *                              when the collection has not been created yet.
	 */
	public static function get_section_id_from_collections_container_title( object $series_ddo, string $collection_title ) : int|null {

		$section_tipo		= $series_ddo->section_tipo;		// rsc212 	# values list for Series / Collections
		$tipo				= $series_ddo->tipo;				// rsc214 	# Series / Collections (component_input_text)
		$model_name			= ontology_node::get_model_by_tipo($tipo,true);
		$serie_name			= pg_escape_string(DBi::_getConnection(), $collection_title);

		// JSON search_query_object to search
		$sqo_data = (object)[
			'id' => 'get_section_id_from_collections_container_title',
			'section_tipo' => $section_tipo,
			'limit' => 1,
			'filter' => (object)[
				'$and' => [
					(object)[
						'q' => '\''.$serie_name.'\'',
						'path' => [
							(object)[
								'section_tipo' => $section_tipo,
								'component_tipo' => $tipo,
								'model' => $model_name,
								'name' => 'Series / Collections'
							]
						]
					]
				]
			]
		];
		$sqo = new search_query_object($sqo_data);

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
	}//end get_section_id_from_collections_container_title



}//end class tool_import_marc21
