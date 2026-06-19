<?php declare(strict_types=1);
/**
* CLASS TOOL_IMPORT_ZOTERO
* Imports Zotero JSON bibliographic exports into Dédalo's Publications section (rsc205).
*
* This tool bridges Zotero, the open-source reference manager, with Dédalo's
* bibliographic data model. Operators upload one or more Zotero JSON export files
* (plus optional PDF attachments) through the tool UI; the server then:
*   1. Determines whether each Zotero record corresponds to an existing Dédalo
*      publication (by Zotero id / call-number / configured field) or needs a
*      new section created.
*   2. Maps each Zotero field to the appropriate Dédalo component using the
*      configurable 'map' array (see sample_config.json / register.json dd1633).
*   3. Handles special cases: authors (given + family), dates (date-parts + season),
*      container titles (Series / Collections section rsc212), typology, ISBN/ISSN,
*      URL/DOI, and PDF attachments with cover-image extraction.
*   4. Propagates any extra form fields (ddo_map role='input_component') from the
*      temporary section into the newly-created publication record.
*
* Configuration (two-tier fallback: dd996 user record → dd1324 registry default):
*   - config.main: named component tipo references (section, pdf, identifying_image,
*     field_to_section_id, field_standard_number, …).
*   - config.map: array of { name, ddo_map[] } entries mapping Zotero field names
*     to Dédalo component tipos and section tipos.
*   - config.typology: Zotero item-type → Dédalo typology locator mapping.
*   - config.standard_type: 'ISBN' / 'ISSN' → standard-number typology locator.
*
* Section-id resolution priority:
*   1. If config.main[field_to_section_id] is set AND the Zotero record has that
*      field, use its integer value directly (create or recycle the record).
*   2. Otherwise match the Zotero 'id' URL tail against the code component (rsc137);
*      if no match, create a brand-new section.
*
* PDF attachment workflow:
*   Upload the PDF alongside the JSON export. The Zotero record's 'archive' field
*   must hold the exact filename ("my_pdf_file.pdf"). On import the PDF is moved to
*   the component_pdf media path and the first page is rendered as a JPEG cover
*   image, stored in the identifying_image component (rsc228).
*
* Extends tool_common — the base class that loads the two-tier config, provides
* the dd_object context for the browser, and enforces API_ACTIONS security.
*
* @package Dédalo
* @subpackage Tools
*/
class tool_import_zotero extends tool_common {



	/**
	* API_ACTIONS
	* SEC-024 (§9.2): explicit allowlist of methods callable via
	* `dd_tools_api::tool_request`. Only 'import_files' is a valid remote
	* entry point. The other public-static methods are internal helpers with
	* non-rqo signatures and must not be exposed via the API surface.
	* @var array<string> API_ACTIONS
	*/
	public const API_ACTIONS = [
		'import_files'
	];



	/**
	* IMPORT_FILES
	* Main entry point — processes every uploaded Zotero JSON file and persists
	* the bibliographic data into Dédalo publication records (section rsc205).
	*
	* Flow for each Zotero JSON file:
	*   For each Zotero record in the file:
	*     1. Resolve or create the target section_id (see class-level description).
	*     2. Iterate the Zotero record's properties; for each, look up the matching
	*        entry in config.map and dispatch to a type-aware switch branch that
	*        instantiates the correct Dédalo component and saves the converted value.
	*     3. Process any extra ddo_map entries that have an 'input_component' role —
	*        these carry form-level defaults entered in the tool UI.
	*   After all records are processed, delete the uploaded JSON file and clear
	*   the corresponding keys from $_SESSION['dedalo']['section_temp_data'] so the
	*   tool UI is reset for the next import.
	*
	* Zotero JSON fields with custom handling (all others go through 'default'):
	*   'id'              — strips URL prefix; stores bare identifier in code component.
	*   'type'            — maps to a Dédalo typology locator via config.typology.
	*   'container-title' — looks up or creates a Series/Collections record (rsc212).
	*   'author'          — formats given/family names via zotero_name_to_name().
	*   'issued'/'accessed' — converts date-parts array via zotero_date_to_dd_date().
	*   'call-number'     — currently a no-op (body commented out); guards PDF by id.
	*   'archive'         — triggers PDF import via import_pdf_file() if file is present.
	*   'ISSN'/'ISBN'     — saves number value and also saves the number-type locator.
	*   'URL'/'DOI'       — DOI is prefixed with "https://www.doi.org/" before storage.
	*
	* @param object $options - Import parameters:
	*   - tipo (string): component tipo of the tool trigger button (e.g. 'oh17').
	*   - section_tipo (string): section tipo of the caller context (e.g. 'oh1').
	*   - section_id (int|null): record id in caller context (may be null for list view).
	*   - tool_config (object): tool instance config; must contain a 'ddo_map' array.
	*   - files_data (array<object>): metadata for every uploaded file; JSON files are
	*     identified by their '.json' extension.
	*   - components_temp_data (array<object>): serialised component states from the
	*     temporary section rendered in the tool UI (role='input_component' fields).
	*   - key_dir (string): subdirectory key under DEDALO_UPLOAD_TMP_DIR/{user_id}/
	*     where uploaded files were staged (e.g. 'oh17_oh1').
	* @return object - stdClass with:
	*   - result (bool): true on success, false on early failure.
	*   - msg (string): human-readable outcome or error description.
	*/
	public static function import_files(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// get configuration with map to convert Zotero files
		// tool_common::get_config() applies the two-tier fallback:
		// user/install record (dd996) overrides the registry default (dd1324).
			$tool_name	= get_called_class();
			$config		= tool_common::get_config($tool_name);

		// options
			// tipo. string component tipo like 'oh17'
			$tipo						= $options->tipo ?? null;
			// section_tipo. string current section tipo like 'oh1'
			$section_tipo				= $options->section_tipo ?? null;
			// section_id. int current section id like '5'
			$section_id					= $options->section_id ?? null;
			// tool_config. object like: '{"ddo_map":[{"role":"target_component","tipo":"rsc29","section_id":"self","section_tipo":"rsc170","model":"component_image","label":"Image"}],"import_file_name_mode":null}'
			$tool_config				= $options->tool_config ?? null;
			// files data. array of objects like: '[{"name":"_290000_rsc29_rsc170_290437.jpg","previewTemplate":{},"previewElement":{},"size":734061,"component_option":""}]'
			$files_data					= $options->files_data ?? null;
			// components_temp_data. array of objects like: '[{"section_id":"tmp","section_tipo":"rsc170","tipo":"rsc23","lang":"lg-eng","from_component_tipo":"rsc23","value":[],"parent_tipo":"rsc23","parent_section_id":"tmp","fallback_value":[null],"debug":{"exec_time":"0.740 ms"},"debug_model":"component_input_text","debug_label":"Title","debug_mode":"edit"}]'
			$components_temp_data		= $options->components_temp_data ?? [];
			// key_dir. string like: 'oh17_oh1' (contraction section_tipo + component tipo)
			$key_dir					= $options->key_dir ?? null;

		// SEC-024 (§9.2): WRITE gate. Zotero import creates / overwrites
		// records in the target section_tipo.
			if (empty($section_tipo)) {
				$response->msg = 'Error. Missing section_tipo';
				return $response;
			}
			security::assert_section_permission($section_tipo, 2, __METHOD__);

			// main components to use Dédalo
			// Named tipo references from config: section, pdf, identifying_image, etc.
			$main = $config->config->main ?? [];
			// get definition field to set section_id
			// When present, this entry controls which Zotero field drives the Dédalo section_id
			// (default 'call-number'; may be overridden via tool configuration).
			$field_to_section_id = array_find($main, function($el) {
				return $el->name === 'field_to_section_id';
			});
			// map between Zotero and Dédalo
			// Each entry: { name: <zotero_field>, ddo_map: [{ tipo, section_tipo }, ...] }
			$map = $config->config->map ?? [];
			// map between Zotero type and Dédalo typology list
		$typology = $config->config->typology ?? [];
		// map between Zotero type and Dédalo standard_type list (ISBN, ISSN)
		$standard_type = $config->config->standard_type ?? [];
			// ddo_map
			// Additional component targets defined in the tool UI (e.g. project selector).
			$ar_ddo_map = $tool_config->ddo_map;
			$input_components_section_tipo	= [];	// all different used section tipo in section_temp

			// read Zotero file in JSON format:
			// Filter to JSON files only; PDF attachments and other uploads are
			// handled inline when the 'archive' Zotero field is encountered.
				$ar_zotero_files_data = array_filter($files_data, function($el) {
					return str_ends_with($el->name, '.json');
				});

				$user_id	= logged_user_id();
				$tmp_dir	= DEDALO_UPLOAD_TMP_DIR . '/'. $user_id . '/' . $key_dir;

				$ar_procesing_info = [];

				foreach ($ar_zotero_files_data as $zotero_file_data) {

					// Check file exists
					$file_full_path = $tmp_dir .'/'. $zotero_file_data->name;

					if (!file_exists($file_full_path)) {
						$msg = "File ignored (not found) $zotero_file_data->name";
						$ar_msg[] = $msg;
						debug_log(__METHOD__
							." $msg ". PHP_EOL
							.' file_full_path: ' .$file_full_path
							, logger::ERROR
						);
						continue; // Skip file
					}
					$ar_zotero_data = json_decode(file_get_contents($file_full_path));
					foreach ($ar_zotero_data as $zotero_obj) {

						// Create section
							// Resolve or create the Dédalo section that will hold this Zotero record.
							// Priority 1: use the configured 'field_to_section_id' Zotero field value
							//   (default: 'call-number') as the explicit section_id.
							// Priority 2: match the Zotero 'id' URL tail against the code component.
							// Priority 3: create a brand-new section.
							$section_id = null;

							// $optional_id: name of the Zotero field that carries the Dédalo section_id
							// (e.g. 'call-number'). Its integer value is used as the target section_id.
							$optional_id = isset($field_to_section_id)
								? $field_to_section_id->value
								: null;

							if (isset($field_to_section_id) && isset($zotero_obj->$optional_id)) {

								$section_id = (int)$zotero_obj->$optional_id;	// Optionally, if is defined zotero->call-number, use this as section id

								$section = section::get_instance( $section_tipo );
								$section->create_record((object)[
									'section_id' => $section_id
								]); // Sure record is created/recycled with requested id

							}else{
								// Use Zotero id as id (stored in "CODE" rsc137) when exists. Else create new section
								// The Zotero 'id' is a URL like "https://www.zotero.org/…/NNNNN"; only
								// the last path segment is the meaningful identifier stored in rsc137.
								$id_item = array_find($map, function($el) {
									return $el->name === 'id';
								});

								$ar_parts	= explode('/', $zotero_obj->id);
								$zotero_id	= end($ar_parts);
								$section_id	= self::get_section_id_from_code( $id_item, $zotero_id);

								if (is_null($section_id)) {
									// section : Create new section when not found Zotero id in field code
								$section	= section::get_instance($section_tipo);
									$section_id	= $section->Save();
								}
							}
							if (empty($section_id)){
								debug_log(__METHOD__
									.' Error Processing Request. section_id is empty, ignored Zotero record '
									, logger::ERROR
								);
								continue;
							}

						// Processing Zotero record
							// Response track
							$procesing_info			= new stdClass();
							$ar_procesing_info[]	= $procesing_info;

							// Object foreach
							foreach ($zotero_obj as $name => $value) {

								$found_map_item = array_find($map, function($el) use($name) {
									return $name === $el->name;
								});
								if (empty($found_map_item)) {
									debug_log(__METHOD__
										. ' Ignored name: '.$name.' from Zotero import process. Not found map_item to manage it'. PHP_EOL
										. ' map: ' .json_encode($map, JSON_PRETTY_PRINT)
										, logger::WARNING
									);
									continue; # Skip not accepted data
								}

								// ddo_map may hold multiple entries for a single Zotero field.
								// reset() picks the first entry, which is the primary Dédalo component.
								// Additional entries (e.g. 'container-title' has two) are read explicitly
								// within their case branch using end() or array indexing.
								$ddo_map	= $found_map_item->ddo_map;
								$ddo		= reset($ddo_map);

								switch ($name) {
									case 'id':
										// Store only the bare Zotero identifier (last URL segment) in the
										// code component (rsc137) so it can be matched on future imports.
										$current_model	= ontology_node::get_model_by_tipo($ddo->tipo,true); // component_input_text
										$component		= component_common::get_instance(
											$current_model,
											$ddo->tipo,
											$section_id,
											'edit',
											DEDALO_DATA_NOLAN,
											$ddo->section_tipo
										);
										$ar_parts 	= explode('/', $zotero_obj->id);
										$zotero_id  = end($ar_parts);

										$component_data = [(object)[
											'value' => (string)$zotero_id,
											'lang' => $component->get_lang()
										]];

										$component->set_data( $component_data );
										$component->save();
										$procesing_info->$name = "+ Saved $name value ".to_string($value)." from Zotero import process";
										break;

									case 'type':
										// get the typology locator set in config, and use it as data.
										$found_typology_item = array_find($typology ?? [], function($el) use($value) {
											return $value === $el->name;
										});
										$data = isset($found_typology_item) && isset($found_typology_item->value)
											? $found_typology_item->value
											: null;
										if (empty($data)) {
											debug_log(__METHOD__
												. ' Ignored type '.$name.' from Zotero import process. This typology is not defined in Dedalo ' .PHP_EOL
												. ' typology: ' .to_string($typology)
												, logger::ERROR
											);
										}else{
											$current_model_name = ontology_node::get_model_by_tipo($ddo->tipo,true);
											$component = component_common::get_instance(
												$current_model_name,
												$ddo->tipo,
												$section_id,
												'edit',
												DEDALO_DATA_NOLAN,
												$section_tipo
											);

											$component_data = [];
											foreach((array)$data as $current_data) {
												$component_data[] = (object)[
													'value' => (string)$current_data,
													'lang' => $component->get_lang()
												];
											}

											$component->set_data( $component_data );
											$component->save();
											$procesing_info->$name = "+ Saved $name value $value with: ". to_string($data) ." from Zotero import process";
										}
										break;

									case 'container-title':
										// 'container-title' maps to two ddo_map entries:
										//   [0] rsc211 (component_relation_link): the relation from the
										//       publication to the Series/Collections list.
										//   [1] rsc214 (component_input_text in rsc212): the name field
										//       inside the Series/Collections list section itself.
										// end() selects the second entry (the list-section target).
										$series_ddo				= end($ddo_map);
										$section_tipo_series	= $series_ddo->section_tipo; # 'rsc212' — Series / Collections value list
										$section_id_list		= self::get_section_id_from_zotero_container_title( $series_ddo, $zotero_obj->$name );
										if ($section_id_list>0) {
											// Use existing record
										}else{
											// create a new record in list
											$section_container_list	= section::get_instance($section_tipo_series);
											$section_id_list = $section_container_list->create_record();

											$current_model 				= ontology_node::get_model_by_tipo($series_ddo->tipo,true);
											$component_series_name		= component_common::get_instance(
												$current_model ,
												$series_ddo->tipo,
												$section_id_list,
												'edit',
												DEDALO_DATA_LANG,
												$section_tipo_series
											); // Collection / Series (component_input_text)

											// To eliminate quotes
												// $serie_name = str_replace(array("'",'"'), '', $zotero_obj->$name);

											$component_data = [(object)[
												'value' => $zotero_obj->$name ?? '',
												'lang' => $component_series_name->get_lang()
											]];

											$component_series_name->set_data( $component_data );
											$component_series_name->save();
										}

										// re-check section_id_list
											if ($section_id_list<1) {
												debug_log(__METHOD__
													. " Error .section_id_list is empty and is mandatory ! "
													, logger::ERROR
												);
											}

										// add locator
											$current_model	= ontology_node::get_model_by_tipo($ddo->tipo,true);
											$component		= component_common::get_instance(
												$current_model,
												$ddo->tipo,
												$section_id,
												'edit',
												DEDALO_DATA_NOLAN,
												$ddo->section_tipo
											);
											$locator = new locator();
												$locator->set_section_id($section_id_list);
												$locator->set_section_tipo($section_tipo_series);
												$locator->set_type(DEDALO_RELATION_TYPE_LINK);	// Added 8-3-2018
												$locator->set_from_component_tipo($ddo->tipo);  // Added 8-3-2018

											$component->set_data( [$locator] );
											$component->save();
											$procesing_info->$name = "+ Saved $name value ". json_encode($locator)." from Zotero import process";
										break;

									case 'author':
										// Zotero 'author' is an array of name objects. Convert every
										// given/family pair (or 'literal') into a flat string and store
										// as separate items in the authors component (rsc349).
										$ar_name   = (array)self::zotero_name_to_name( $zotero_obj->$name, 'array' );
										$component = component_common::get_instance(
											'component_input_text',
											$ddo->tipo,
											$section_id,
											'edit',
											DEDALO_DATA_NOLAN,
											$ddo->section_tipo
										);

										$component_data = [];
										foreach((array)$ar_name as $current_data) {
											$component_data[] = (object)[
												'value' => (string)$current_data,
												'lang' => $component->get_lang()
											];
										}
										$component->set_data( $component_data );
										$component->save();
										$procesing_info->$name = "+ Saved $name value ".to_string($ar_name)." (".to_string($value).") from Zotero import process";
										break;

									case 'issued':
									case 'accessed':
										// Convert the Zotero date-parts array (and optional season/time)
										// into a dd_date object; wrap it in {start: …} for component_date.
										$date 	   = self::zotero_date_to_dd_date( $zotero_obj->$name );
										$component = component_common::get_instance(
											'component_date',
											$ddo->tipo,
											$section_id,
											'edit',
											DEDALO_DATA_NOLAN,
											$ddo->section_tipo
										);
										$date_object = new stdClass();
											$date_object->start = $date;
										$component->set_data( [$date_object] );
										$component->save();
										$procesing_info->$name = "+ Saved $name value ".to_string($date_object)." from Zotero import process";
										break;

									case 'call-number':
										// 'call-number' is only used to drive section_id resolution
										// (handled above, before the per-field switch). No data is
										// written to a component here. The PDF-by-id approach is
										// commented out (see flagged dead code below).
										if (empty($value)) {
											$procesing_info->$name = " - Ignored $name empty file from Zotero import process";
											debug_log(__METHOD__
												. " Ignored $name empty file from Zotero import process "
												, logger::DEBUG
											);
											break;
										}

										$procesing_info->$name = '';
										// Import pdf file based on call-number id. Name your pdf like "16.pdf" for call-number 16
										#$import_pdf_file = self::import_pdf_file($zotero_obj, $name, $section_id, $section_tipo, $value, $ar_response);
										break;

									case 'archive':
										// 'archive' holds the filename of an uploaded PDF.
										// If the file was uploaded alongside the JSON, trigger the full
										// PDF import and cover-image extraction pipeline.
										$pdf_file = $tmp_dir. '/'. $zotero_obj->$name;
										if(!file_exists($pdf_file)){
											debug_log(__METHOD__
												.' Ignored archive '.$name.' from Zotero import process. The PDF file is not uploaded'
												, logger::WARNING
											);
										}else{
											// Import PDF file based on 'archive' field. Name your pdf like "16.pdf"
											$import_pdf_file = self::import_pdf_file(
												$zotero_obj,
												$main,
												$section_id,
												$key_dir
											);

											// Add import msg
											$procesing_info->import_pdf_file = $import_pdf_file->msg;
										}
										// Import pdf file based on call-number id. Name your pdf like "16.pdf" for call-number 16
										#$import_pdf_file = self::import_pdf_file($zotero_obj, $name, $section_id, $section_tipo, $value, $ar_response);
										break;

									case 'ISSN':
									case 'ISBN':
										// Two-step save for standard identifiers:
										//   Step 1: store the identifier string itself (rsc147).
										//   Step 2: store the number-type typology locator in the
										//     standard-number component (rsc249 / component_relation_select)
										//     using the config.standard_type map to pick the locator.
										$current_model	= ontology_node::get_model_by_tipo($ddo->tipo,true);
										$component		= component_common::get_instance(
											$current_model,
											$ddo->tipo,
											$section_id,
											'edit',
											DEDALO_DATA_LANG,
											$ddo->section_tipo
										);
										$current_value = $zotero_obj->$name ?? null;

										$component_data = [(object)[
											'value' => $current_value,
											'lang' => $component->get_lang()
										]];

										$component->set_data( $component_data );
										$component->save();
										$procesing_info->$name = "+ Saved $name value ".to_string($value)." from Zotero import process";

										// Save number typology too
										// Falls back to the last entry in standard_type when the specific
										// name is not found (defensive: avoids null locator on unknown types).
										$found_item = $standard_type ? array_find($standard_type, function($el) use($name) {
											return $name === $el->name;
										}) : null;
										$data = isset($found_item)
											? $found_item->value
											: ($standard_type ? end($standard_type)->value : null);
										$field_standard_number = array_find($main, function($el) {
											return $el->name === 'field_standard_number';
										});

										$component_tipo	= $field_standard_number->tipo;
										$current_model	= ontology_node::get_model_by_tipo($component_tipo,true); // component_relation_select
										$component		= component_common::get_instance(
											$current_model,
											$component_tipo,
											$section_id,
											'edit',
											DEDALO_DATA_NOLAN,
											$section_tipo
										);

										$component_data = [];
										foreach((array)$data as $current_data) {
											$component_data[] = (object)[
												'value' => (string)$current_data,
												'lang' => $component->get_lang()
											];
										}

										$component->set_data( $component_data );
										$component->save();
										break;

									case 'URL':
									case 'DOI':
										// DOI values from Zotero are bare identifiers (e.g. "10.1000/xyz");
										// prepend the resolver prefix to produce a valid IRI.
										$current_model	= ontology_node::get_model_by_tipo($ddo->tipo,true);
										$component		= component_common::get_instance(
											$current_model,
											$ddo->tipo,
											$section_id,
											'edit',
											DEDALO_DATA_LANG,
											$ddo->section_tipo
										);
										$current_value = ($name === 'DOI')
											? 'https://www.doi.org/'.$zotero_obj->$name
											: $zotero_obj->$name;

										$data_iri = $component->url_to_iri($current_value);
										$component->set_data( [$data_iri] );
										$component->save();
										$procesing_info->$name = "+ Saved $name value ".to_string($data_iri)." from Zotero import process";
										break;

									default:
										// Generic handler: respects the component's translatability flag
										// to choose between DEDALO_DATA_LANG and DEDALO_DATA_NOLAN.
										$current_model	= ontology_node::get_model_by_tipo($ddo->tipo,true);
										$component		= component_common::get_instance(
											$current_model,
											$ddo->tipo,
											$section_id,
											'edit',
											(ontology_node::get_translatable($ddo->tipo) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN),
											$ddo->section_tipo
										);
										$current_value = $zotero_obj->$name ?? null;

										$component_data = [(object)[
											'value' => $current_value ?? null,
											'lang' => $component->get_lang()
										]];

										$component->set_data( $component_data );
										$component->save();
										$procesing_info->$name = "+ Saved $name value ".to_string($value)." from zotero import process";

										if ($name==='title') {
											$procesing_info->titulo = $zotero_obj->$name;
										}
										break;
								}#end switch
							}#end foreach ($zotero_obj as $name => $value)

						// Processing temporal section
							// Iterate the tool's ddo_map (from the $options->tool_config) and apply
							// values that the user entered in the tool UI's temporary section.
							// This covers fields like 'project' that are not in the Zotero JSON but
							// are set once for the whole import batch via the form.
							// Only 'input_component' role entries carry form data; other roles are no-ops.
							foreach ($ar_ddo_map as $ddo) {

								$model			= ontology_node::get_model_by_tipo($ddo->tipo,true);
								$current_lang	= ontology_node::get_translatable($ddo->tipo) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
								$component		= component_common::get_instance(
									$model,
									$ddo->tipo,
									$section_id,
									'list',
									$current_lang,
									$ddo->section_tipo
								);

								switch ($ddo->role) {
									case 'input_component':

										// input_components_section_tipo store
										// Collect distinct section tipos so we can flush their temp data later.
											if(!in_array($ddo->section_tipo, $input_components_section_tipo)){
												$input_components_section_tipo[] = $ddo->section_tipo;
											}

										// component_data. Get from request and save
										// Match by tipo + section_tipo because the same tipo can appear
										// in different section contexts within components_temp_data.
											$component_data = array_find($components_temp_data, function($item) use($ddo){
												return isset($item->tipo) && $item->tipo===$ddo->tipo && $item->section_tipo===$ddo->section_tipo;
											});
											if(!empty($component_data) && !empty($component_data->value)){
												$component->set_data($component_data->value);
												$component->save();
											}
										break;

									default:
										// Nothing to do here
										break;
								}//end switch ($ddo->role)
							}//end foreach ($ar_ddo_map as $ddo)
					}//end foreach $ar_zotero_data

					// delete the Zotero file
					if (!unlink($file_full_path)) {
						debug_log(__METHOD__
							.' Error deleting Zotero file. File: ' .PHP_EOL
							.' file_full_path: ' . $file_full_path
							, logger::ERROR
						);
					}
				}//end foreach $ar_zotero_files

		// Reset the temporary section of the components, for empty the fields.
		// After saving every record, evict the temp-section cache keys for
		// the input_component section tipos so the tool UI starts fresh on
		// the next import. Keys in section_temp_data embed the section_tipo
		// as a substring, so a regex match suffices.
			if (!empty($input_components_section_tipo) && !empty($_SESSION['dedalo']['section_temp_data'])) {

				// Create regex pattern to match any of the section types. Pattern example: /_(type1|type2)_/
				$pattern = '/(' . implode('|', array_map(function($t){ return preg_quote($t, '/'); }, $input_components_section_tipo)) . ')/';

				$_SESSION['dedalo']['section_temp_data'] = array_filter(
					(array)$_SESSION['dedalo']['section_temp_data'],
					function($key) use ($pattern) {
						// Keep items that DO NOT match the pattern
						return preg_match($pattern, (string)$key) === 0;
					},
					ARRAY_FILTER_USE_KEY
				);
			}

		// response
			$response->result	= true;
			$response->msg		= 'Import Zotero files done successfully.';


		return $response;
	}//end import_files



	/**
	* IMPORT_PDF_FILE
	* Moves an uploaded PDF into the component_pdf media path and generates a
	* cover image from the first page, storing it in the identifying_image component.
	*
	* Pipeline:
	*   1. Resolve file metadata from $zotero_obj->archive (filename) and
	*      $zotero_obj->page (starting page number, default 1).
	*   2. Call component_pdf::add_file() to move the staged file into the
	*      permanent media directory for the PDF component.
	*   3. Call component_pdf::process_uploaded_file() to generate the default
	*      version (e.g. OCR or thumbnails).
	*   4. Call component_pdf::create_image() to render the first page as JPEG.
	*      If a cover image is produced, add it to the identifying_image component
	*      (component_image) using the same add_file / process_uploaded_file flow.
	*   5. Delete the staged upload via dd_utils_api::delete_uploaded_file() to
	*      avoid stale files in DEDALO_UPLOAD_TMP_DIR.
	*
	* The old signature (commented out below) passed more arguments; the current
	* signature groups all config into the $main array and reads $zotero_obj->archive
	* directly, which keeps the caller's code cleaner.
	*
	* @param object $zotero_obj - The decoded Zotero record; must have 'archive'
	*   (string, PDF filename) and optionally 'page' (string, e.g. '27-40').
	* @param array $main - Named config entries from config.main; the following are
	*   consumed here: 'section' (section tipo), 'pdf' (component tipo for component_pdf),
	*   'identifying_image' (component tipo for component_image).
	* @param int|string $section_id - Section record ID to attach the PDF to.
	* @param string $key_dir - Subdirectory key under DEDALO_UPLOAD_TMP_DIR/{user_id}/
	*   where the uploaded file is staged (same as the outer import's key_dir).
	* @return object - stdClass with:
	*   - result (bool): true on success, false if pdf processing failed.
	*   - msg (string): outcome description or error detail.
	*/
	# public static function import_pdf_file($zotero_obj, $name, $section_id, $section_tipo, $file_name, $ar_response) {
	public static function import_pdf_file(object $zotero_obj, array $main, int|string $section_id, string $key_dir) : object {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed';

		// section_tipo component
			$section = array_find($main, function($el) {
				return $el->name === 'section';
			});

		// pdf component type
			$pdf = array_find($main, function($el) {
				return $el->name === 'pdf';
			});

		// section_tipo component
			$identifying_image = array_find($main, function($el) {
				return $el->name === 'identifying_image';
			});

		$name = $zotero_obj->archive;
		#
		# 1 COMPONENT_PDF
		# Create component pdf to obtain target path of pdf file
		$component_tipo = $pdf->tipo;
		$component_pdf 	= component_common::get_instance(
			'component_pdf',
			$component_tipo,
			$section_id,
			'edit',
			DEDALO_DATA_NOLAN,
			$section->tipo
		);

		// process file
			// zotero_obj->page may be a range like "27-40"; extract the start page
			// so the PDF component can tag the correct first page in transcription text.
			$page		= isset($zotero_obj->page) ? $zotero_obj->page : 1;
			$first_page	= (int)self::zotero_page_to_first_page( $page );	# number of first page. default is 1

			$file_name = trim($name);
			// file_data descriptor for component_pdf::add_file().
			// tmp_dir is passed as a string constant name, not the actual path value;
			// add_file() resolves it to the real filesystem path internally.
			$file_data = new stdClass();
				$file_data->name		= $file_name;
				$file_data->key_dir		= $key_dir;
				$file_data->tmp_dir		= 'DEDALO_UPLOAD_TMP_DIR';
				$file_data->tmp_name	= $file_name;
				$file_data->first_page 	= $first_page;


			// add the temporal file uploaded to original directory of the component
			$file_info = $component_pdf->add_file($file_data);
			// process file to create default version or get the text into text_area field.
			$process_uploaded_file_response = $component_pdf->process_uploaded_file(
				$file_info->ready,
				null
			);
			if($process_uploaded_file_response->result==false){
				$response->msg .= ' Error on process pdf file ! ';
				return $response;
			}

		// render first page as image
		// create_image() writes the JPEG to DEDALO_MEDIA_PATH/pdf/tmp/{file_id}.{ext}
		// and returns the path on success, or false when image generation is not possible.
			$image_file_path = $component_pdf->create_image();
			// if component had created his image, create the image component to add this file.
			if($image_file_path!==false){

				// file_id is the internal media id assigned by add_file() to the PDF;
				// the generated cover image shares that id with a different extension.
				$file_id = $component_pdf->get_id();

				$component_image = component_common::get_instance(
					'component_image',
					$identifying_image->tipo,
					$section_id,
					'edit',
					DEDALO_DATA_NOLAN,
					$section->tipo
				);

				// source_file points directly to the cover JPEG written by create_image().
				// tmp_dir 'DEDALO_MEDIA_PATH' tells add_file() to read from the media root
				// rather than the upload temp area.
				$file_data = new stdClass();
					$file_data->name		= $file_name . '.' . DEDALO_IMAGE_EXTENSION;
					$file_data->key_dir		= 'pdf/tmp';
					$file_data->tmp_dir		= 'DEDALO_MEDIA_PATH';
					$file_data->tmp_name	= $file_id. '.' . DEDALO_IMAGE_EXTENSION;
					$file_data->source_file	= DEDALO_MEDIA_PATH. '/pdf/tmp/' . $file_id. '.' . DEDALO_IMAGE_EXTENSION;

				// add the temporal file uploaded to original directory of the component
					$file_info = $component_image->add_file($file_data);

					$component_image->set_quality(DEDALO_IMAGE_QUALITY_ORIGINAL);
				// process file to create default version or get the text into text_area field.
					$component_image->process_uploaded_file(
						$file_info->ready,
						null
					);
			}

		// delete thumbnails files
		// Clean up the staged upload from DEDALO_UPLOAD_TMP_DIR; failure here is non-fatal
		// but the return value is silently ignored, which may leave stale files.
			$options = new stdClass();
				$options->file_name	= $file_name;
				$options->key_dir	= $key_dir;
				$options->tmp_name	= $file_name;
			$rqo = new request_query_object();
				$rqo->set_options($options);

			$delete_result = dd_utils_api::delete_uploaded_file($rqo);

		$response->result 	= true;
		$response->msg 		= 'Ok, pdf file was imported';

		return $response;
	}//end import_pdf_file


	// Zotero transformers data


	/**
	* ZOTERO_DATE_TO_DD_DATE
	* Converts a Zotero date object into a Dédalo dd_date value object.
	*
	* Zotero represents dates as a 'date-parts' nested array plus an optional
	* 'season' string. Dédalo stores dates as dd_date objects with discrete
	* year/month/day/hour/minute/second setters. This method bridges the two shapes.
	*
	* Expected Zotero date structure:
	*   stdClass {
	*     'date-parts': [[2014, 12, 30]],  // year, optional month, optional day
	*     'season': '12:57:26'             // optional; reused as HH:MM:SS time field
	*   }
	*
	* Edge cases:
	*   - If $zotero_date is not an object but a numeric string or integer, the
	*     value is interpreted as a bare year (e.g. "2014" → year=2014).
	*   - If 'date-parts' is missing, logs an error and returns an empty dd_date.
	*   - If 'season' is absent, time components remain at their dd_date defaults.
	*   - The 'season' field name is a Zotero quirk: the field is re-purposed to
	*     carry time data in some export formats.
	*
	* @param stdClass $zotero_date - The Zotero date object as decoded from JSON.
	* @return object - Populated dd_date instance (may be empty if data is missing).
	*/
	public static function zotero_date_to_dd_date( stdClass $zotero_date) : object {

		$dd_date = new dd_date();

		#
		# Date
		$branch_name = 'date-parts';

		// (!) The signature declares stdClass, but this guard handles the case where
		// Zotero occasionally emits a plain integer/string year instead of a full object.
		// The check will always be false under strict_types if callers pass a real stdClass,
		// but it provides a safety net for malformed inputs that bypassed the type check.
		if (!is_object($zotero_date)) {
			#debug_log(__METHOD__." String received ".to_string($zotero_date), logger::ERROR);
			if ((int)$zotero_date>0) {
				$dd_date->set_year((int)$zotero_date);
				return $dd_date;
			}
		}

		if (!isset($zotero_date->$branch_name)) {
			debug_log(__METHOD__." Error on get date from zotero ".to_string($zotero_date), logger::ERROR);
			return $dd_date;
		}

		// date-parts is a nested array: [[year, month?, day?]]
		// Only the first element of the outer array is used (Zotero never emits ranges here).
		$branch = $zotero_date->$branch_name;
		if ( !isset($branch[0][0]) ) {
			error_log("Wrong data from ".print_r($zotero_date,true));
			return $dd_date;
		}

		if(isset($branch[0][0])) $dd_date->set_year((int)$branch[0][0]);
		if(isset($branch[0][1])) $dd_date->set_month((int)$branch[0][1]);
		if(isset($branch[0][2])) $dd_date->set_day((int)$branch[0][2]);


		#
		# Time
		// Zotero re-uses the 'season' field to store time (HH:MM:SS) in some exports.
		// The regex extracts up to three colon-separated numeric groups.
		if (property_exists($zotero_date, 'season')) {
			$current_date	= $zotero_date->season;
			if ($current_date) {
				$regex   = "/^([0-9]+)?:?([0-9]+)?:?([0-9]+)?/";
				preg_match($regex, $current_date, $matches);

				if(isset($matches[1])) $dd_date->set_hour((int)$matches[1]);
				if(isset($matches[2])) $dd_date->set_minute((int)$matches[2]);
				if(isset($matches[3])) $dd_date->set_second((int)$matches[3]);
			}
		}

		return $dd_date;
	}//end zotero_date_to_dd_date



	/**
	* ZOTERO_NAME_TO_NAME
	* Converts an array of Zotero name objects into a flat string or array of name strings.
	*
	* Zotero provides two name shapes:
	*   1. Institutional / literal: { "literal": "Organisation Name" }
	*   2. Personal: { "given": "Jane", "family": "Smith" }
	* Both shapes are normalised to a plain "Given Family" string per author.
	*
	* When $return_type is 'string', all names are joined with ", " into one scalar.
	* When $return_type is 'array' (or any other value), the raw array is returned —
	* this is what import_files() uses so each name becomes a separate component item.
	*
	* Note: the local variable $family_name holds the author's family name.
	*
	* @param array $zotero_name - Array of Zotero name objects (decoded from JSON).
	* @param string $return_type = 'string' - 'string' for comma-joined scalar,
	*   any other value returns the raw string[].
	* @return string|array - Formatted name(s).
	*/
	public static function zotero_name_to_name( array $zotero_name, string $return_type='string') : string|array {
		$ar_name=array();

		foreach ($zotero_name as $key => $obj_value) {

			$name = '';

			if (property_exists($obj_value, 'literal')) {

				$name .= $obj_value->literal;
				$ar_name[] = $name;

			}else{

				if (property_exists($obj_value, 'given')) {
					$name .= $obj_value->given;
				}

				$family_name = '';
				if (property_exists($obj_value, 'family')) {
					$family_name .= $obj_value->family;
				}

				$ar_name[] = $name.' '.$family_name;
			}
		}

		switch ($return_type) {
			case 'string':
				return implode(', ', $ar_name);
			default:
				return $ar_name;
		}
	}//end zotero_name_to_name



	/**
	* ZOTERO_PAGE_TO_FIRST_PAGE
	* Extracts the starting page number from a Zotero page field value.
	*
	* Zotero's page field may be a plain integer, a range like "27-40", or empty.
	* This method normalises all three cases to an integer >= 1, used as the first
	* page tag when linking a PDF to its transcription text.
	*
	* Supported formats:
	*   - Empty / null  → returns 1 (default).
	*   - "27-40"       → returns 27 (first segment before '-').
	*   - Anything else → returns 1 (including non-numeric strings).
	*
	* @param mixed $zotero_page - Raw value of the Zotero 'page' field.
	* @return int - First page number, minimum 1.
	*/
	public static function zotero_page_to_first_page( $zotero_page ) : int {

		switch (true) {
			case (empty($zotero_page)):
				$first_page = 1;
				break;

			case ( strpos($zotero_page, '-')!==false ):
				$ar_parts 	= explode('-', $zotero_page);
				$first_page = $ar_parts[0];
				break;

			default:
				$first_page = 1;
				break;
		}

		if( (int)$first_page < 1 ) $first_page = 1;

		return (int)$first_page;
	}//end zotero_page_to_first_page


	/**
	* GET_SECTION_ID_FROM_CODE
	* Looks up a Dédalo publication section by its stored Zotero code identifier.
	*
	* Searches the code component (typically rsc137 / component_input_text) within
	* the publications section (rsc205) for an exact match OR a suffix match ("* /code")
	* against the provided Zotero id. The dual-operator OR filter in the SQO handles
	* both bare ids (stored after the URL was stripped) and ids that were stored with
	* the full Zotero URL path as a suffix.
	*
	* If the Zotero id is itself a URL (starts with 'http'), this method strips the
	* URL prefix itself before searching, so the stored bare identifier is matched.
	* This is defensive against cases where the id was stored in different formats
	* across imports.
	*
	* Returns null (not 0 or false) when no match is found, because the caller uses
	* is_null() to decide whether to create a new section.
	*
	* @param object $id_item - Map entry for the 'id' field; provides ddo_map with
	*   the section_tipo and component tipo to search within.
	* @param string $zotero_id - The Zotero identifier to search for (URL or bare id).
	* @return int|null - section_id if found, null if not found or on search error.
	*/
	public static function get_section_id_from_code( object $id_item, string $zotero_id ) : ?int {

		$ddo_map	= $id_item->ddo_map;
		$ddo		= reset($ddo_map);
		// Strip URL prefix when the passed id is a full Zotero URL.
		// This can happen when get_section_id_from_code() is called with the raw
		// $zotero_obj->id value before the caller strips it.
		if (strpos($zotero_id, 'http')===0) {
			$ar_parts 	= explode('/', $zotero_id);
			$zotero_id  = end($ar_parts);
		}

		$section_tipo   = $ddo->section_tipo;	 # rsc205
		$tipo 			= $ddo->tipo; 			# rsc137
		$model_name 	= ontology_node::get_model_by_tipo($tipo,true);
		// pg_escape_string() prevents SQL injection in the SQO filter value.
		$code 			= pg_escape_string(DBi::_getConnection(), $zotero_id);

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
			$search		= search::get_instance($sqo);
			$db_result	= $search->search();

			if(!$db_result) {
				debug_log(__METHOD__."Error on search record with requested code: ".to_string($zotero_id), logger::ERROR);
				return null;
			}

		$section_id = null; // Default
		if ($db_result->row_count() > 0) {
			// Found it in database
			$section_id = (int)$db_result->fetch_one()->section_id;

			debug_log(__METHOD__."Record founded successfully [$section_id] with requested code: ".to_string($zotero_id), logger::DEBUG);
		}


		return $section_id;
	}//end get_section_id_from_code



	/**
	* GET_SECTION_ID_FROM_ZOTERO_CONTAINER_TITLE
	* Looks up a Dédalo Series/Collections list record by its name string.
	*
	* Searches the Series/Collections section (typically rsc212) for a record whose
	* name component (rsc214 / component_input_text) exactly matches
	* $zotero_container_title. The SQO uses single-quoted exact-match syntax ('title')
	* to prevent partial matches.
	*
	* Called from the 'container-title' switch branch in import_files() before
	* deciding whether to reuse an existing Series record or create a new one.
	* Returning null (rather than 0 or false) lets the caller check with > 0.
	*
	* @param object $series_ddo - The second ddo_map entry for 'container-title';
	*   provides section_tipo (rsc212) and tipo (rsc214) for the query.
	* @param string $zotero_container_title - Exact series/collection name to look up.
	* @return int|null - section_id of the matching record, or null if not found.
	*/
	public static function get_section_id_from_zotero_container_title( object $series_ddo, string $zotero_container_title ) : ?int {

		$section_tipo		= $series_ddo->section_tipo;		# rsc212 	# values list for Series / Collections
		$tipo				= $series_ddo->tipo;				# rsc214 	# Series / Collections (component_input_text)
		$model_name			= ontology_node::get_model_by_tipo($tipo,true);
		// Escape the title before embedding in the SQO filter to prevent SQL injection.
		$serie_name			= pg_escape_string(DBi::_getConnection(), $zotero_container_title);

		// JSON search_query_object to search
		// The q value wraps the title in single quotes for an exact-match SQO filter.
		$sqo_data = (object)[
			'id' => 'get_section_id_from_zotero_container_title',
			'select' => [],
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
		$search		= search::get_instance($sqo);
		$db_result	= $search->search();

		$section_id = null; // Default
		if ($db_result->row_count() > 0) {
			// Found it in database
			$section_id = (int)$db_result->fetch_one()->section_id;

			debug_log(__METHOD__." Successfull Founded record [$section_id] with requested code: ".to_string($zotero_container_title), logger::DEBUG);
		}


		return $section_id;
	}//end get_section_id_from_zotero_container_title


}//end tool_import_zotero
