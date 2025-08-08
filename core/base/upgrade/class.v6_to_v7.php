<?php
// declare(strict_types=1);

use SebastianBergmann\Type\Type;

/**
* CLASS v6_to_v7
*
*
*/
class v6_to_v7 {



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
	* reformat_matrix_data
	* Check all main component data to review if its own dataframe require add section_tipo_key
	* dataframe in version >=6.4.3 define the section_tipo_key to bind the dataframe data to main data
	* used in multiple target_section components as Collection (numisdata159) that call People (rsc197) and Entities (rsc106)
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
								// add relations
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

								// add relations
									$new_matrix_data->literals = new stdClass();

								// update components object
									$literal_components = $datos_value ?? [];


								foreach ($literal_components as $literal_tipo => $literal_value) {

									if( !isset($literal_value->dato) ){
										debug_log(__METHOD__
											. " **-------- Literal without information --------** " . PHP_EOL
											. " component tipo: ". $literal_tipo . PHP_EOL
											. " section tipo: ". $section_tipo . PHP_EOL
											. " section id: ". $section_id . PHP_EOL
											, logger::ERROR
										); die();
									}
									$model = RecordObj_dd::get_modelo_name_by_tipo($literal_tipo);
									if( $model==='component_filter' ){
										continue;
									}

									$old_data = $literal_value->dato;

									$new_matrix_data->literals->{$literal_tipo} = [];


									foreach ($old_data as $lang => $ar_value) {
										if( !isset($ar_value) || empty($ar_value) ){
											debug_log(__METHOD__
												. " **-------- Data without information --------** " . PHP_EOL
												. " component tipo: ". $literal_tipo . PHP_EOL
												. " section tipo: ". $section_tipo . PHP_EOL
												. " section id: ". $section_id . PHP_EOL
												. " value: ". $ar_value . PHP_EOL
												, logger::ERROR
											);
											continue;
										}
										if( !is_array($ar_value) ){
											if($literal_tipo === 'hierarchy42' && $lang==='lg-nolan'){
												continue;
											}
											if($ar_value==='<br data-mce-bogus="1">'){
												continue;
											}
											if($literal_tipo === 'dd23'){
												continue;
											}
											debug_log(__METHOD__
												. " <<-------- Data with wrong format is not array -------->> " . PHP_EOL
												. " component tipo: ". $literal_tipo . PHP_EOL
												. " section tipo: ". $section_tipo . PHP_EOL
												. " section id: ". $section_id . PHP_EOL
												. " value: ". to_string( $ar_value ). PHP_EOL
												. " type: " . gettype( $ar_value )
												, logger::ERROR
											);
											$ar_value = [$ar_value];
										}

										$new_literal_obj = new stdClass();
										foreach ($ar_value as $key => $value) {
											if( !isset($ar_value) ){
												debug_log(__METHOD__
													. " <<-------- Data with wrong format -------->> " . PHP_EOL
													. " component tipo: ". $literal_tipo . PHP_EOL
													. " section tipo: ". $section_tipo . PHP_EOL
													. " section id: ". $section_id . PHP_EOL
													. " value: ". $value . PHP_EOL
													. " key: ". $key . PHP_EOL
													, logger::ERROR
												);
												die();
											}

											$new_literal_obj->key	= $key+1; // add 1 to the array key
											$new_literal_obj->lang	= $lang;
											$new_literal_obj->value	= $value;

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
