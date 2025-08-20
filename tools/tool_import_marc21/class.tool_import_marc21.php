<?php
/**
* CLASS TOOL_IMPORT_MARC21
* Read uploaded Marc21 files and import values based on tool config
*/
// Add MARC library to read and process the Marc21 files
require(dirname(__FILE__).'/lib/MARC.php');



class tool_import_marc21 extends tool_common {



	/**
	* IMPORT_FILES
	* Process previously uploaded images
	* @param object $options
	* @return object $response
	*/
	public static function import_files(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// get configuration with map to convert MARC21 files
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
			// map between Marc21 and Dédalo
			$map = $config->config->map ?? [];

			// ddo_map
			$ar_ddo_map = $tool_config->ddo_map;
			$input_components_section_tipo	= [];	// all different used section tipo in section_temp

			// read Marc21 file format:
				$ar_marc21_files_data = array_filter($files_data, function($el) {
					return str_ends_with($el->name, '.mrc');
				});

				$user_id = logged_user_id();
				$tmp_dir = DEDALO_UPLOAD_TMP_DIR . '/'. $user_id . '/' . $key_dir;

				$ar_processing_info = [];

			// data
				foreach ($ar_marc21_files_data as $marc21_file_data) {
					// Check file exists
					$file_full_path = $tmp_dir .'/'. $marc21_file_data->name;

					if (!file_exists($file_full_path)) {
						$msg = "File ignored (not found) $marc21_file_data->name";
						$ar_msg[] = $msg;
						debug_log(__METHOD__
							." $msg ". PHP_EOL
							.' file_full_path: ' .$file_full_path
							, logger::ERROR
						);
						continue; // Skip file
					}
					// create the marc21 object
					$ar_records = new File_MARC($file_full_path);

					$i=1;
					while ($record = $ar_records->next()) {

						// Create section

							// Section id get from marc21 data
							$section_id = null;

							// get the code value
							$marc21_id = isset($field_to_section_id)
								? tool_import_marc21::get_value( $record, $field_to_section_id->value )
								: null;

							if (isset($marc21_id)) {

								// Use marc21 id as id (stored in "907" rsc137) when exists. Else create new section
								$id_item = array_find($map, function($el) {
									return $el->name === 'id';
								});

								$section_id = tool_import_marc21::get_section_id_from_code( $id_item, $marc21_id);
								if (is_null($section_id)) {
									# SECTION : Create new section when not found marc21 id in field code
									$section = section::get_instance($section_id, $section_tipo);
									$section_id = $section->Save();
								}
							}
							if (empty($section_id)){
								debug_log(__METHOD__
									.' Error Processing Request. section_id is empty, ignored marc21 record '
									, logger::ERROR
								);
								continue;
							}

						// Processing marc21 record
							// Response track
							$processing_info		= new stdClass();
							$ar_processing_info[]	= $processing_info;

							# Object foreach
							foreach ($map as $element_vars) {

								if (empty($element_vars->tipo)) {
									dump($element_vars, ' ERROR ON element_vars: tipo is empty ++ '.to_string());
									continue;
								}

								// marc21_conditional
								$resolved_value = false;
								if (isset($element_vars->marc21_conditional)) {

									if ($marc21_conditional = $element_vars->marc21_conditional) {

										$element_fields = $record->getFields($element_vars->field);
										foreach($element_fields as $key => $portal_row_obj) {

											$sub_field =  $portal_row_obj->getSubfield($marc21_conditional->subfield);
											if ( $sub_field->getData()==$marc21_conditional->value ) {

												$element = $portal_row_obj->getSubfield($element_vars->subfield);

												$value = ($element===false)
													? ''
													: $element->getData();

												$resolved_value = true;
												break;
											}
										}
									}
								}//end if (isset($element_vars['marc21_conditional']))

								// VALUE . Value from current field in this row
								if($resolved_value===false) {
									$value = self::get_value( $record, $element_vars );
								}

								if(empty($value) || !isset($value)) {
									continue;
								}

								// skip_on_empty : When is defined, only store value when is not empty (used when in various components data like 'rsc147' )
									if (empty($value) && (isset($element_vars->skip_on_empty) && $element_vars->skip_on_empty===true)) {
										continue;
									}

								$value	= trim($value);
								$value	= rtrim($value, " \t,:.");

								if(isset($element_vars->partial_left_content)) {
									$value_trim = trim($value);
									$value_test = substr($value_trim, 0, (int)$element_vars->partial_left_content);
									if( is_int($value_test) === false){
										preg_match('/\d+/', $value, $value_test_matches);
										$value_test = (int)implode('', $value_test_matches);
									}
									$value = $value_test;
								}

								if( isset($element_vars->date_format) && $element_vars->date_format==='year' ) {
									$dd_date = new dd_date();
									if((int)$value>0){
										$dd_date->set_year($value);
									}
									$date = new StdClass();
									$date->start = $dd_date;
									$value = $date;
								}

								# DD_DATA_MAP . map current value to dedalo value when is defined (like 'cat' -> '[section_tipo:lg1,section_id:369]')
								if ( isset($element_vars->dd_data_map) && $dd_data_map=$element_vars->dd_data_map ) {
									if (property_exists($dd_data_map, $value)) {
										$value = $dd_data_map->$value;
									}else{
										debug_log(__METHOD__
											. " ERROR on map dd_data_map. No map exists for value ". PHP_EOL
											. ' value: ' . to_string($value)
											, logger::ERROR
										);
									}
								}

								# Save on dedalo component
								$component_tipo		= $element_vars->tipo;
								$component_label	= ontology_node::get_termino_by_tipo($component_tipo);
								$model_name			= ontology_node::get_modelo_name_by_tipo($component_tipo,true);
								$component			= component_common::get_instance(
									$model_name,
									$component_tipo,
									$section_id,
									'edit',
									(ontology_node::get_translatable($component_tipo) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN),
									$section_tipo,
									false
								);
								$value = is_array($value)
									? $value
									: [$value];
								$component->set_dato( $value );
								$component->Save();
								debug_log(__METHOD__
									." Saved component $component_tipo ($model_name - $component_label) with dato: ".to_string($value)
									, logger::DEBUG
								);

								# DD_ACTION
								if (!empty($value) && isset($element_vars->dd_action)) {

									foreach ($element_vars->dd_action as $component_tipo_action => $component_action_value) {

										$model_name			= ontology_node::get_modelo_name_by_tipo($component_tipo_action,true);
										$component_action	= component_common::get_instance(
											$model_name,
											$component_tipo_action,
											$section_id,
											'edit',
											DEDALO_DATA_LANG,
											$section_tipo,
											false
										);
										$component_action->set_dato($component_action_value);
										$component_action->Save();
										debug_log(__METHOD__
											." Saved dd_action. Component $component_tipo_action with dato: " . PHP_EOL
											.' value: ' . to_string($component_action_value)
											, logger::DEBUG
										);
									}
								}

							}//end foreach ($this->marc21_vars as $element_vars)

						// Processing temporal section
							// ar_ddo_map iterate. role based actions
							// Create the ddo components with the data to store with the import
							// when the component has a input in the tool propagate temp section_data
							// Update created section with temp section data
							// when the component stored the filename, get the filename and save it
							foreach ($ar_ddo_map as $ddo) {

								$model			= ontology_node::get_modelo_name_by_tipo($ddo->tipo,true);
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
												$component->set_dato($component_data->value);
												$component->Save();
											}

										break;

									default:
										// Nothing to do here
										break;
								}//end switch ($ddo->role)
							}//end foreach ($ar_ddo_map as $ddo)

						// next record
						$i++;
					}//end while $ar_records->next()

					//delete the marc21 file
					if (!unlink($file_full_path)) {
						debug_log(__METHOD__
							.' Error deleting marc21 file. File: ' . $file_full_path
							, logger::ERROR
						);
					}
				}//end foreach $ar_marc21_files

		// Reset the temporary section of the components, for empty the fields.
			foreach ($input_components_section_tipo as $current_section_tipo) {
				$temp_data_uid = $current_section_tipo .'_'. DEDALO_SECTION_ID_TEMP; // Like 'rsc197_tmp'
				if (isset($_SESSION['dedalo']['section_temp_data'][$temp_data_uid])) {
					unset( $_SESSION['dedalo']['section_temp_data'][$temp_data_uid]);
				}
			}

		// response
			$response->result	= true;
			$response->msg		= 'Import Marc21 files done successfully.';


		return $response;
	}//end if ($mode=='import_files')



	/**
	* GET_VALUE
	* @param object $record
	* @param object $element_vars
	* @return string $value
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
	* @param object|null $elementField
	* @param object $element_vars
	* @return string $value
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
	* Search in database if current code exists. If true, return section id of founded record
	* @param object $id_item
	* @param string $marc21_id
	* @return int|null $section_id
	*/
	public static function get_section_id_from_code( object $id_item, string $marc21_id ) : int|null {

		$ddo_map		= $id_item->ddo_map;
		$ddo			= reset($ddo_map);
		$section_tipo	= $ddo->section_tipo;	// rsc205
		$tipo			= $ddo->tipo;			// rsc137
		$model_name		= ontology_node::get_modelo_name_by_tipo($tipo,true);
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
			$result	= $search->search();

		// section_id
			$section_id = null; // Default
			if (!empty($result->ar_records[0])) {
				// Found it in database
				$section_id = (int)$result->ar_records[0]->section_id;

				debug_log(__METHOD__
					." Record found successfully [$section_id] with requested code: ".to_string($marc21_id)
					, logger::DEBUG
				);
			}


		return $section_id;
	}//end get_section_id_from_code



	/**
	* GET_SECTION_ID_FROM_COLLECTIONS_CONTAINER_TITLE
	* Search in database if current Series/Collections exists. If true, return section id of founded record
	* @param object $series_ddo
	* @param string $collection_title
	* @return int|null $section_id
	*/
	public static function get_section_id_from_collections_container_title( object $series_ddo, string $collection_title ) : int|null {

		$section_tipo		= $series_ddo->section_tipo;		// rsc212 	# values list for Series / Collections
		$tipo				= $series_ddo->tipo;				// rsc214 	# Series / Collections (component_input_text)
		$model_name			= ontology_node::get_modelo_name_by_tipo($tipo,true);
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
			$result	= $search->search();

		// section_id
			$section_id = null; // Default
			if (!empty($result->ar_records[0])) {
				// Found it in database
				$section_id = (int)$result->ar_records[0]->section_id;

				debug_log(__METHOD__
					." Successful Founded record [$section_id] with requested code: ".to_string($collection_title)
					, logger::DEBUG
				);
			}


		return $section_id;
	}//end get_section_id_from_COlLECTIONS_container_title



}//end class tool_import_marc21
