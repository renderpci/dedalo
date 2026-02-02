<?php declare(strict_types=1);
/**
* CLASS TOOL_IMPORT_ZOTERO
* Handles import of Zotero JSON bibliographic data into Dédalo publications
*
* Use the JSON version exported by Zotero to import into Publications section: rsc205
* The config of the tool defines the map between Zotero and Dédalo.
*
* Control of section_id with a Zotero field:
*
* By default use the tool use  the Zotero field 'call-number' to define the section_id of the record,
* if is set call-number Dédalo will create or update this section_id.
* It's possible to set other field to control the section_id in with Zotero file.
* To do that, create a specific config in "Development->tools->Tool configuration" section
* and changing "field_to_section_id" with the name of the Zotero field with section_id.
* you can see the field default config in the register tool or you can see the 'sample_config.json'.
* Specific configuration need to be a full configuration, not only the property changed.
*
* Upload PDF files:
*
* Is possible to upload PDF files with the Zotero records.
* By default the tool use Zotero 'archive' field set with the full name of the PDF file.
* "archive" : "my_pdf_file.pdf"
* Add the PDF files with the Zotero JSON file in the tool, upload all and import.
*
* Features:
* - JSON file processing from Zotero exports
* - Automatic record creation or update based on Zotero identifiers
* - Field mapping from Zotero to Dédalo component types
* - Special handling for authors, dates, ISBN/ISSN, URLs, and DOIs
* - PDF import with automatic first page extraction as image
* - Container/Series/Collection management
* - Configurable field mapping through ontology tool configuration
*
* @package Dedalo
* @subpackage Tools
*/
class tool_import_zotero extends tool_common {



	/**
	* IMPORT_FILES
	* Processes uploaded Zotero JSON files and imports data into Dédalo
	*
	* Main entry point for Zotero import processing. Reads JSON files containing
	* Zotero bibliographic records and populates corresponding Dédalo publication
	* records according to the tool's configuration map.
	*
	* @param object $options Configuration object containing:
	*        - tipo: Component tipo identifier
	*        - section_tipo: Section type identifier
	*        - section_id: Current section identifier
	*        - tool_config: Tool configuration with ddo_map
	*        - files_data: Array of uploaded file metadata
	*        - components_temp_data: Temporary component data from form
	*        - key_dir: Temporary directory key for file access
	* @return object $response Response object with result and msg properties
	*/
	public static function import_files(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// get configuration with map to convert Zotero files
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

			// main components to use Dédalo
			$main = $config->config->main ?? [];
			// get definition field to set section_id
			$field_to_section_id = array_find($main, function($el) {
				return $el->name === 'field_to_section_id';
			});
			// map between Zotero and Dédalo
			$map = $config->config->map ?? [];
			// map between Zotero type and Dédalo typology list
		$typology = $config->config->typology ?? [];
		// map between Zotero type and Dédalo standard_type list (ISBN, ISSN)
		$standard_type = $config->config->standard_type ?? [];
			// ddo_map
			$ar_ddo_map = $tool_config->ddo_map;
			$input_components_section_tipo	= [];	// all different used section tipo in section_temp

			// read Zotero file in JSON format:
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
							// In some cases use call-number field in Zotero to get the id of Dédalo.
							// Section id get from Zotero data
							$section_id = null;

							$optional_id = isset($field_to_section_id)
								? $field_to_section_id->value
								: null;

							if (isset($field_to_section_id) && isset($zotero_obj->$optional_id)) {

								$section_id = (int)$zotero_obj->$optional_id;	// Optionally, if is defined zotero->call-number, use this as section id

								$section = section::get_instance( $section_tipo );
								$section->create_record( (object)[
									'section_id' => $section_id
								]); // Sure record is created/recycled with requested id

							}else{
								// Use Zotero id as id (stored in "CODE" rsc137) when exists. Else create new section
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

								$ddo_map	= $found_map_item->ddo_map;
								$ddo		= reset($ddo_map);

								switch ($name) {
									case 'id':
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
										$series_ddo				= end($ddo_map);
										$section_tipo_series	= $series_ddo->section_tipo; # 'rsc212';  # Lista de valores Series / colecciones
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
										foreach((array)$ar_name as $current_data) {
											$component_data[] = (object)[
												'value' => $data ?? null,
												'lang' => $component->get_lang()
											];
										}

										$component->set_data( $component_data );
										$component->save();
										break;

									case 'URL':
									case 'DOI':
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
										$current_model	= ontology_node::get_model_by_tipo($ddo->tipo,true);
										$component		= component_common::get_instance(
											$current_model,
											$ddo->tipo,
											$section_id,
											'edit',
											(ontology_node::get_translatable($ddo->tipo) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN),
											$ddo->section_tipo
										);
										$current_value = $zotero_obj->$nam ?? null;
																		
										$component_data = [(object)[
											'value' => $data ?? null,
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
							// ar_ddo_map iterate. role based actions
							// Create the ddo components with the data to store with the import
							// when the component has a input in the tool propagate temp section_data
							// Update created section with temp section data
							// when the component stored the filename, get the filename and save it
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
											if(!in_array($ddo->section_tipo, $input_components_section_tipo)){
												$input_components_section_tipo[] = $ddo->section_tipo;
											}

										// component_data. Get from request and save
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
	* Imports PDF files from Zotero archives and creates associated image components
	*
	* Handles PDF file processing including file addition, version creation, and
	* automatic first page extraction as an identifying image.
	*
	* @param object $zotero_obj The Zotero record object containing archive filename
	* @param array $main Configuration array with section, pdf, and identifying_image definitions
	* @param int|string $section_id The section identifier to attach the PDF to
	* @param string $key_dir Temporary directory key for file retrieval
	* @return object $response Response object with result and msg properties
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
			// get the page defined in Zotero to assign the first page to first tag page into transcription text.
			$page		= isset($zotero_obj->page) ? $zotero_obj->page : 1;
			$first_page	= (int)self::zotero_page_to_first_page( $page );	# number of first page. default is 1

			$file_name = trim($name);
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
			$image_file_path = $component_pdf->create_image();
			// if component had created his image, create the image component to add this file.
			if($image_file_path!==false){

				$file_id = $component_pdf->get_id();

				$component_image = component_common::get_instance(
					'component_image',
					$identifying_image->tipo,
					$section_id,
					'edit',
					DEDALO_DATA_NOLAN,
					$section->tipo
				);

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
	* Converts Zotero date format to Dédalo dd_date object
	*
	* Transforms Zotero's date-parts array and optional season/time data into
	* a Dédalo dd_date object with year, month, day, hour, minute, second components.
	*
	* Zotero date format example:
	* stdClass Object (
	*        [date-parts] => Array (
	*                [0] => Array (2014, 12, 30)
	*            )
	*        [season] => 12:57:26
	*    )
	*
	* @param stdClass $zotero_date The Zotero date object to convert
	* @return object $dd_date Converted Dédalo dd_date object
	*/
	public static function zotero_date_to_dd_date( stdClass $zotero_date) : object {

		$dd_date = new dd_date();

		#
		# Date
		$branch_name = 'date-parts';

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
	* Converts Zotero name format to single or array format
	*
	* Transforms Zotero's name objects (with literal or given/family parts) into
	* either comma-separated string or array format for Dédalo components.
	*
	* @param array $zotero_name Array of Zotero name objects
	* @param string $return_type Return format: 'string' (default) for comma-separated or 'array' for array format
	* @return string|array $name Converted name(s) in requested format
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

				$apellido_madre = '';
				if (property_exists($obj_value, 'family')) {
					$apellido_madre .= $obj_value->family;
				}

				$ar_name[] = $name.' '.$apellido_madre;
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
	* Extracts first page number from Zotero page range
	*
	* Parses page information to extract the starting page number.
	* Handles formats like '27-40' -> 27 or single pages.
	*
	* @param mixed $zotero_page The page field from Zotero (string like '27-40' or empty)
	* @return int $first_page First page number (default is 1 if not found or invalid)
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
	* Searches for existing record by Zotero code identifier
	*
	* Queries the database to find a publication record with matching Zotero code.
	* If found, returns the section_id; otherwise returns null for creation of new record.
	*
	* @param object $id_item Configuration object with ddo_map containing section_tipo and tipo
	* @param string $zotero_id The Zotero code identifier to search for
	* @return int|null $section_id Section ID if found, null otherwise
	*/
	public static function get_section_id_from_code( object $id_item, string $zotero_id ) : ?int {

		$ddo_map	= $id_item->ddo_map;
		$ddo		= reset($ddo_map);
		if (strpos($zotero_id, 'http')===0) {
			$ar_parts 	= explode('/', $zotero_id);
			$zotero_id  = end($ar_parts);
		}

		$section_tipo   = $ddo->section_tipo;	 # rsc205
		$tipo 			= $ddo->tipo; 			# rsc137
		$model_name 	= ontology_node::get_model_by_tipo($tipo,true);
		$code 			= pg_escape_string(DBi::_getConnection(), $zotero_id);

		// JSON seach_query_object to search
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
			$search		= search::get_instance($sqo);
			$db_result	= $search->search();

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
	* Searches for existing Series/Collection record by container title
	*
	* Queries the database to find a Series or Collection record matching the
	* provided Zotero container title. Returns section_id if found.
	*
	* @param object $series_ddo Configuration object with section_tipo and tipo for Series/Collections
	* @param string $zotero_container_title The Zotero container/series title to search for
	* @return int|null $section_id Section ID if found, null otherwise
	*/
	public static function get_section_id_from_zotero_container_title( object $series_ddo, string $zotero_container_title ) : ?int {

		$section_tipo		= $series_ddo->section_tipo;		# rsc212 	# values list for Series / Collections
		$tipo				= $series_ddo->tipo;				# rsc214 	# Series / Collections (component_input_text)
		$model_name			= ontology_node::get_model_by_tipo($tipo,true);
		$serie_name			= pg_escape_string(DBi::_getConnection(), $zotero_container_title);

		// JSON seach_query_object to search
		$sqo = json_decode('
		{
			"id": "get_section_id_from_zotero_container_title",
			"select": [],
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
