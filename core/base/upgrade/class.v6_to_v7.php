<?php declare(strict_types=1);
/**
* CLASS v6_to_v7
*
*
*/
class v6_to_v7 {



	/**
	* GET_VALUE_TYPE_MAP
	* @return object
	*/
	public static function get_value_type_map() : object {

		return (object)[
			'component_input_text'		=>	DEDALO_VALUE_TYPE_STRING,
			'component_text_area'		=>	DEDALO_VALUE_TYPE_STRING,
			'component_email'			=>	DEDALO_VALUE_TYPE_STRING,
			'component_password'		=>	DEDALO_VALUE_TYPE_STRING,
			'component_number'			=>	DEDALO_VALUE_TYPE_NUMBER,
			'component_date'			=>	DEDALO_VALUE_TYPE_DATE,
			'component_3d'				=>	DEDALO_VALUE_TYPE_MEDIA,
			'component_av'				=>	DEDALO_VALUE_TYPE_MEDIA,
			'component_image'			=>	DEDALO_VALUE_TYPE_MEDIA,
			'component_pdf'				=>	DEDALO_VALUE_TYPE_MEDIA,
			'component_svg'				=>	DEDALO_VALUE_TYPE_MEDIA,
			'component_iri'				=>	DEDALO_VALUE_TYPE_IRI,
			'component_geolocation'		=>	DEDALO_VALUE_TYPE_GEO,
			'component_json'			=>	DEDALO_VALUE_TYPE_JSON,
			'component_filter_records'	=>	DEDALO_VALUE_TYPE_JSON,
			'component_security_access'	=>	DEDALO_VALUE_TYPE_JSON
		];
	}//end get_value_type_map



	/**
	* CONVERT_TABLE_DATA
	* @param array $ar_tables
	* @param string $action
	* @return bool
	* 	true
	*/
	public static function convert_table_data(array $ar_tables, string $action) : bool {

		return update::convert_table_data($ar_tables, $action);
	}//end convert_table_data



	/**
	* REFORMAT_MATRIX_DATA
	* Converts v6 data to v7 data format
	* @param array $ar_tables
	* @return bool
	*/
	public static function reformat_matrix_data( array $ar_tables ) : bool {

		// ALTER TABLE "matrix" ADD "data" jsonb NULL;

		debug_log(__METHOD__ . PHP_EOL
			. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
			. " CONVERTING ... " . PHP_EOL
			. " reformat_matrix_data - tables: " . json_encode($ar_tables) . PHP_EOL
			. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
			, logger::WARNING
		);

		$value_type_map = v6_to_v7::get_value_type_map();

		// CLI process data
			if ( running_in_cli()===true ) {
				if (!isset(common::$pdata)) {
					common::$pdata = new stdClass();
				}
				common::$pdata->table = '';
				common::$pdata->memory = '';
				common::$pdata->counter = 0;
			}

		// iterate tables
		update::tables_rows_iterator(
			$ar_tables, // array of tables to iterate
			function($row, $table, $max) { // callback function

				$id				= $row['id'];
				$section_tipo	= $row['section_tipo'] ?? null;
				$datos			= (isset($row['datos'])) ? json_handler::decode($row['datos']) : null;
				$section_id 	=  $row['section_id'] ?? '';

				// CLI process data
					if ( running_in_cli()===true ) {
						common::$pdata->msg	= (label::get_label('processing') ?? 'Processing') . ': changes_in_tipos'
							. ' | table: '			. $table
							. ' | id: '				. $id .' - ' . $max
							. ' | section_tipo: '	. $section_tipo
							. ' | section_id: '		. ($row['section_id'] ?? '');
						common::$pdata->memory = (common::$pdata->counter % 5000 === 0)
							? dd_memory_usage() // update memory information once every 5000 items
							: common::$pdata->memory;
						common::$pdata->table = $table;
						common::$pdata->section_tipo = $section_tipo;
						common::$pdata->counter++;
						// send to output
						print_cli(common::$pdata);
					}

				// datos. Common matrix tables
				if( isset($datos) ){

					$new_matrix_data = new stdClass();

					// datos properties
					foreach ($datos as $datos_key => $datos_value) {

						if( empty($datos_value) ){
							continue;
						}

						switch ($datos_key) {
							case 'relations_search':
							case 'relations':
								// add relations property
								$new_matrix_data->{$datos_key} = new stdClass();

								// update relations array
								$relations = $datos_value ?? [];

								foreach ($relations as $locator) {
									if(!isset($new_matrix_data->{$datos_key}->{$locator->from_component_tipo})){
										$new_matrix_data->{$datos_key}->{$locator->from_component_tipo} = [];
									}
									$new_matrix_data->{$datos_key}->{$locator->from_component_tipo}[] = $locator;
								}
								break;

							case 'components':
								// add literals property
								$new_matrix_data->literals = new stdClass();

								// update components object
								$literal_components = $datos_value ?? [];

								foreach ($literal_components as $literal_tipo => $literal_value) {

									$model = RecordObj_dd::get_modelo_name_by_tipo($literal_tipo);
									if( in_array($model, ['component_filter','component_section_id']) ){
										continue;
									}

									if( !isset($literal_value->dato) ){
										debug_log(__METHOD__
											. " **-------- STOP Literal without information --------** " . PHP_EOL
											. " model: " . $model. PHP_EOL
											. " component tipo: ". $literal_tipo . PHP_EOL
											. " section tipo: ". $section_tipo . PHP_EOL
											. " section id: ". $section_id . PHP_EOL
											. " literal_value: ". json_encode( $literal_value ). PHP_EOL
											. " literal_value type: " . gettype( $literal_value )
											, logger::ERROR
										);
										die();
									}

									$old_data = $literal_value->dato;
									foreach ($old_data as $lang => $ar_value) {

										if( !isset($ar_value) || empty($ar_value) ){
											debug_log(__METHOD__
												. " **-------- IGNORED Data without information --------** " . PHP_EOL
												. " model: " . $model. PHP_EOL
												. " component tipo: ". $literal_tipo . PHP_EOL
												. " section tipo: ". $section_tipo . PHP_EOL
												. " section id: ". $section_id . PHP_EOL
												. " value: ". json_encode( $ar_value ). PHP_EOL
												. " value type: " . gettype( $ar_value )
												, logger::WARNING
											);
											continue;
										}

										// Not array cases
										if( !is_array($ar_value) ){
											// ignore old recycled component order data (hierarchy42)
											if($literal_tipo === 'hierarchy42' && $lang==='lg-nolan'){
												continue;
											}
											// ignore TinyMCE empty data values
											if($ar_value==='<br data-mce-bogus="1">'){
												continue;
											}
											// ignore not used anymore component_layout dd23
											if($literal_tipo === 'dd23'){
												continue;
											}
											debug_log(__METHOD__
												. " <<-------- CHANGED Data with wrong format is not array -------->> " . PHP_EOL
												. " model: " . $model. PHP_EOL
												. " component tipo: ". $literal_tipo . PHP_EOL
												. " section tipo: ". $section_tipo . PHP_EOL
												. " section id: ". $section_id . PHP_EOL
												. " value: ". json_encode( $ar_value ). PHP_EOL
												. " value type: " . gettype( $ar_value )
												, logger::WARNING
											);
											$ar_value = [$ar_value];
										}

										$new_literal_obj = new stdClass();
										foreach ($ar_value as $key => $value) {

											if( !isset($value) ){
												debug_log(__METHOD__
													. " <<-------- IGNORED Data with wrong format. -------->> " . PHP_EOL
													. " model: " . $model. PHP_EOL
													. " component tipo: ". $literal_tipo . PHP_EOL
													. " section tipo: ". $section_tipo . PHP_EOL
													. " section id: ". $section_id . PHP_EOL
													. " value: ". json_encode( $value ) . PHP_EOL
													. " value type: " . gettype( $value ) . PHP_EOL
													. " ar_value: ". json_encode( $ar_value ) . PHP_EOL
													. " key: ". $key
													, logger::WARNING
												);
												continue;
											}

											if (empty($value)) {
												continue;
											}

											$new_literal_obj->key	= $key+1; // add 1 to the array key
											$new_literal_obj->lang	= $lang;
											$new_literal_obj->value	= $value;
											$new_literal_obj->type	= $value_type_map->{$model} ?? DEDALO_VALUE_TYPE_JSON;

											// set first time if not already set
											if (!property_exists($new_matrix_data->literals, $literal_tipo)) {
												$new_matrix_data->literals->{$literal_tipo} = [];
											}

											$new_matrix_data->literals->{$literal_tipo}[] = $new_literal_obj;
										}
									}
								}
								break;

							default:
								// update other properties like section_tipo, section_real_tipo, etc.
								$new_matrix_data->{$datos_key} = $datos_value;
								break;
						}
					}//end foreach ($datos as $datos_key => $datos_value)

					$section_data_encoded = json_encode($new_matrix_data);

					$strQuery	= "UPDATE $table SET data = $1 WHERE id = $2 ";
					$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $section_data_encoded, $id ));
					if($result===false) {
						$msg = "Failed Update section_data ($table) $id";
						debug_log(__METHOD__
							." ERROR: $msg "
							, logger::ERROR
						);
						return false;
					}
				}//end if( isset($datos) )
			}//end anonymous function
		);

		return true;
	}//end reformat_matrix_data



}//end class v6_to_v7
