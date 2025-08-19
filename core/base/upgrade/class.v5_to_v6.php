<?php
// declare(strict_types=1);
/**
* CLASS v5_to_v6
*
*
*/
class v5_to_v6 {



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
	* UPDATE_COMPONENT_PDF_MEDIA_DIR
	* component_pdf: rename media folder from 'standar' to 'web' and creates a full copy as 'original'
	* Target names are obtained from configuration constant definitions such as 'DEDALO_PDF_QUALITY_DEFAULT'
	* @return bool
	*/
	public static function update_component_pdf_media_dir() : bool {

		try {

			// check old directory existence. try default v5 name
				$current_dir = DEDALO_MEDIA_PATH . DEDALO_PDF_FOLDER . '/standar';
				if (!is_dir($current_dir)) {
					debug_log(__METHOD__
						. " Error: pdf default expected v5 path was not found ! : " . $current_dir .PHP_EOL
						. ' This could be an error or simply that you have already changed the name of this folder'
						, logger::WARNING
					);

					// try changed v5 name
					$current_dir = DEDALO_MEDIA_PATH . DEDALO_PDF_FOLDER . '/standard';
					if (!is_dir($current_dir)) {
						debug_log(__METHOD__ . PHP_EOL
							. " Error: pdf default expected path was not found ! : " . $current_dir .PHP_EOL
							. ' This could be an error or simply that you have already changed the name of this folder'
							, logger::ERROR
						);

						return true;
					}
				}

			// rename. To path like '/home/dedalo/media/pdf/web'
				$new_dir = DEDALO_MEDIA_PATH . DEDALO_PDF_FOLDER . '/' . DEDALO_PDF_QUALITY_DEFAULT;
				if (!is_dir($new_dir)) {
					if( !rename($current_dir, $new_dir) ) {
						debug_log(__METHOD__ . PHP_EOL
							. " Error: Unable to rename pdf directory : " . PHP_EOL
							. ' Source path: ' . $current_dir . PHP_EOL
							. ' Target path: ' . $new_dir
							, logger::ERROR
						);

						return true;
					}else{
						debug_log(__METHOD__ . PHP_EOL
							. " Renamed directory " . PHP_EOL
							. ' ' . $current_dir . PHP_EOL
							. " to " . PHP_EOL
							. ' ' . $new_dir
							, logger::WARNING
						);
					}
				}

			// duplicate default quality to 'original'
				$default_quality_path	= $new_dir;
				$target_copy_path		= DEDALO_MEDIA_PATH . DEDALO_PDF_FOLDER . '/' . DEDALO_PDF_QUALITY_ORIGINAL;
				if (!is_dir($target_copy_path)) {
					// exec command
					$command	= "cp -R $default_quality_path $target_copy_path";
					$output		= null;
					$retval		= null;
					$result		= exec($command, $output, $retval);
					if ($result===false) {
						debug_log(__METHOD__ . PHP_EOL
							. " Error: Unable to copy directory. command : " . $command . PHP_EOL
							. ' Source path: ' . $default_quality_path . PHP_EOL
							. ' Target path: ' . $target_copy_path
							, logger::ERROR
						);
					}else{
						debug_log(__METHOD__ . PHP_EOL
							. ' Copied directory ' . PHP_EOL
							. ' '. $default_quality_path . PHP_EOL
							. ' to ' . PHP_EOL
							. ' ' . $target_copy_path .PHP_EOL
							. "status: ". to_string($retval) .PHP_EOL
							. "output: ". to_string($output) .PHP_EOL
							. "command: ". $command
							, logger::WARNING
						);
					}
				}

		} catch (Exception $e) {
			debug_log(__METHOD__." Caught exception: ".$e->getMessage(), logger::ERROR);
		}


		return true;
	}//end update_component_pdf_media_dir



	/**
	* UPDATE_COMPONENT_SVG_MEDIA_DIR
	* component_svg: rename media folder from 'standard' to 'web' and creates a full copy as 'original'
	* Target names are obtained from configuration constant definitions such as 'DEDALO_SVG_QUALITY_DEFAULT'
	* @return bool
	*/
	public static function update_component_svg_media_dir() : bool {

		try {

			// check old directory existence. try default v5 name
				$current_dir = DEDALO_MEDIA_PATH . DEDALO_SVG_FOLDER . '/standard';
				if (!is_dir($current_dir)) {
					debug_log(__METHOD__
						. " Warning: svg default expected v5 path was not found ! : " . $current_dir .PHP_EOL
						. ' This could be an error or simply that you have already changed the name of this folder'
						, logger::WARNING
					);
				}

			// rename. To path like '/home/dedalo/media/svg/web'
				$new_dir = DEDALO_MEDIA_PATH . DEDALO_SVG_FOLDER . '/' . DEDALO_SVG_QUALITY_DEFAULT;
				if (!is_dir($new_dir)) {
					if( !rename($current_dir, $new_dir) ) {
						debug_log(__METHOD__ . PHP_EOL
							. " Error: Unable to rename svg directory : " . PHP_EOL
							. ' Source path: ' . $current_dir . PHP_EOL
							. ' Target path: ' . $new_dir
							, logger::ERROR
						);
					}else{
						debug_log(__METHOD__ . PHP_EOL
							. " Renamed directory " . PHP_EOL
							. ' ' . $current_dir . PHP_EOL
							. " to " . PHP_EOL
							. ' ' . $new_dir
							, logger::WARNING
						);
					}
				}

			// duplicate default quality to 'original'
				$default_quality_path	= $new_dir;
				$target_copy_path		= DEDALO_MEDIA_PATH . DEDALO_SVG_FOLDER . '/' . DEDALO_SVG_QUALITY_ORIGINAL;
				if (!is_dir($target_copy_path)) {
					// exec command
					$command	= "cp -R $default_quality_path $target_copy_path";
					$output		= null;
					$retval		= null;
					$result		= exec($command, $output, $retval);
					if ($result===false) {
						debug_log(__METHOD__ . PHP_EOL
							. " Error: Unable to copy directory. command : " . $command . PHP_EOL
							. ' Source path: ' . $default_quality_path . PHP_EOL
							. ' Target path: ' . $target_copy_path
							, logger::ERROR
						);
					}else{
						debug_log(__METHOD__ . PHP_EOL
							. ' Copied directory ' . PHP_EOL
							. ' '. $default_quality_path . PHP_EOL
							. ' to ' . PHP_EOL
							. ' ' . $target_copy_path .PHP_EOL
							. "status: ". to_string($retval) .PHP_EOL
							. "output: ". to_string($output) .PHP_EOL
							. "command: ". $command
							, logger::WARNING
						);
					}
				}

		} catch (Exception $e) {
			debug_log(__METHOD__." Caught exception: ".$e->getMessage(), logger::ERROR);
		}


		return true;
	}//end update_component_svg_media_dir



	/**
	* UPDATE_PUBLICATION_MEDIA_FILES
	* To prevent very large list of files of PDF and images, the path for
	* component_pdf (rsc209) and component_image (rsc228) of section Publication (rsc205)
	* has been changed to calculated model as /0 ...
	* @param string|array $ar_items
	* 	From updates.php, a JSON encoded array var is sent
	* @return bool
	*/
	public static function update_publication_media_files(string|array $ar_items) : bool {

		$ar_items = is_array($ar_items)
			? $ar_items
			: json_decode($ar_items);

		try {

			// reference
				// $ar_items = [
				// 	// PDF publication files
				// 	(object)[
				// 		'ar_quality'		=> DEDALO_PDF_AR_QUALITY,
				// 		'element_dir'		=> DEDALO_PDF_FOLDER,
				// 		'max_items_folder'	=> 1000,
				// 		'ref_name'			=> 'rsc209_rsc205_' // find 'rsc209_rsc205_1.pdf'
				// 	],
				// 	// image publication files
				// 	(object)[
				// 		'ar_quality'		=> DEDALO_IMAGE_AR_QUALITY,
				// 		'element_dir'		=> DEDALO_IMAGE_FOLDER,
				// 		'max_items_folder'	=> 1000,
				// 		'ref_name'			=> 'rsc228_rsc205_' // find 'rsc228_rsc205_1.jpg'
				// 	]
				// ];

			foreach ($ar_items as $item) {

				$max_items_folder	= $item->max_items_folder; // 1000
				$ar_quality			= $item->ar_quality;
				$element_dir		= $item->element_dir;
				$ref_name			= $item->ref_name;

				foreach ($ar_quality as $quality) {

					$current_dir = DEDALO_MEDIA_PATH . $element_dir . '/' . $quality;
					// check directory
						if (!is_dir($current_dir)) {
							debug_log(__METHOD__
								. ' Ignored invalid directory for quality: '.$quality .PHP_EOL
								. ' current_dir: ' . $current_dir
								, logger::ERROR
							);
							continue;
						}

					// files inside
						$files = scandir($current_dir);
						foreach ($files as $file) {

							$full_path = $current_dir .'/'. $file;

							// ignore folders and non searched files as 'rsc209_rsc205_1.pdf'
								if(!is_file($full_path) || strpos($file, $ref_name)===false) {
									continue;
								}

							// section_id
								preg_match('/.*_([0-9]+)\..*/', $file, $output_array);
								$section_id = $output_array[1] ?? null;
								if (empty($section_id)) {
									debug_log(__METHOD__
										. " Error on calculate file section_id using regex. The file will be ignored " . PHP_EOL
										. ' file: ' . $file
										, logger::ERROR
									);
									continue;
								}

							// additional_path
								$additional_path = $max_items_folder * (floor((int)$section_id / (int)$max_items_folder));

							// base_dir. Safe create
								$base_dir = $current_dir . '/' . $additional_path;
								if ( !is_dir($base_dir) ) {
									if( !mkdir($base_dir, 0750) ) {
										debug_log(__METHOD__
											." Error. Unable to create non exiting directory base_dir: '.$base_dir"
											, logger::ERROR
										);
										continue;
									}
								}

							// target file
								$target_path	= $current_dir . '/' . $additional_path .'/'. $file;
								$result			= rename($full_path, $target_path);
								if ($result===false) {
									debug_log(__METHOD__
										. " Error on move file " . PHP_EOL
										. ' source full_path: ' . $full_path . PHP_EOL
										. ' target_path: ' . $target_path
										, logger::ERROR
									);
								}
						}//end foreach ($files as $file)
				}//end foreach ($ar_quality as $quality)
				debug_log(__METHOD__
					. " Updated Publication media files ($ref_name) " . PHP_EOL
					. ' AR_QUALITY: ' . json_encode($ar_quality)
					, logger::WARNING
				);
			}//end foreach ($ar_items as $item)

		} catch (Exception $e) {
			debug_log(__METHOD__
				." Error on update_publication_media_files ". PHP_EOL
				." Caught exception: ".$e->getMessage()
				, logger::ERROR
			);
		}


		return true;
	}//end update_publication_media_files



	/**
	* UPDATE_SEARCH_PRESETS_DATA
	* @return bool
	*/
	public static function update_search_presets_data() : bool {

		$table	= 'matrix_list';
		$filter	= "section_tipo='dd623' OR section_tipo='dd655'";
		$lang	= DEDALO_DATA_NOLAN;

		$strQuery	= "SELECT id, section_id, section_tipo, datos FROM $table WHERE $filter ORDER BY id ASC";
		$result		= JSON_RecordDataBoundObject::search_free($strQuery);
		if($result===false) {
			debug_log(__METHOD__
				." ERROR: Failed Search. Data is not found. "
				, logger::ERROR
			);
			return false;
		}

		// debug
			// $n_rows = pg_num_rows($result);
			// debug_log(__METHOD__
			// 	. " n rows: $n_rows " . PHP_EOL
			// 	. ' strQuery: ' . $strQuery
			// 	, logger::DEBUG
			// );

		while($row = pg_fetch_assoc($result)) {

			$id				= $row['id'];
			$section_tipo	= $row['section_tipo'];
			$section_id		= $row['section_id'];
			$datos			= json_decode($row['datos']);

			if (   empty($datos)
				|| empty($datos->components)
				|| empty($datos->components->dd625)
				|| empty($datos->components->dd625->dato)
				|| empty($datos->components->dd625->dato->{$lang})
				|| empty($datos->components->dd625->dato->{$lang}[0])
			) {
				continue;
			}

			$component_data = $datos->components->dd625->dato->{$lang}[0];

			if (is_object($component_data)) {

				// passed by reference (recursive)
				self::parse_filter($component_data);

			}else{

				// try to json_decode
				if (is_string($component_data) && !empty($component_data)) {
					try {
						$component_data_object = json_handler::decode($component_data);
						if (is_object($component_data_object)) {
							// passed by reference (recursive)
							$component_data = $component_data_object;
							self::parse_filter($component_data);
						}
					} catch (Exception $e) {
						debug_log(__METHOD__
							. " Exception decoding JSON data " . PHP_EOL
							. ' msg: ' . $e->getMessage() . PHP_EOL
							. ' component_data: ' . to_string($component_data)
							, logger::ERROR
						);
					}
				}

				if (!is_object($component_data)) {
					debug_log(__METHOD__
						. " Ignored non object component_data (2) " . PHP_EOL
						. ' type: ' . gettype($component_data) . PHP_EOL
						. ' component_data: ' . to_string($component_data)
						, logger::ERROR
					);
					$component_data = null;
				}
			}

			// update section dato
			$datos->components->dd625->dato->{$lang}[0] = $component_data;

			$section_data_encoded = json_handler::encode($datos);

			$strQuery2	= "UPDATE $table SET datos = $1 WHERE id = $2 ";
			$result2	= pg_query_params(DBi::_getConnection(), $strQuery2, array( $section_data_encoded, $id ));
			if(!$result2) {
				debug_log(__METHOD__
					." ERROR: Failed Update section_data. table: $table - id: $id ". PHP_EOL
					.' strQuery2: ' .$strQuery2
					, logger::ERROR
				);
			}else{
				debug_log(__METHOD__
					. " Updated record $section_tipo - $section_id " . PHP_EOL
					. ' $component_data: ' .to_string($component_data)
					, logger::DEBUG
				);
			}
		}//end while


		return true;
	}//end update_search_presets_data



	/**
	* PARSE_FILTER
	* Recursive function. By reference $component_data
	* Fixes issues in search_preset data from v5 to v6
	* sample:
	* {
  		"$and": [
			 {
		      "q": "788",
		      "path": [
		        {
		          "name": "Id",
		          "model": "component_section_id",
		          "section_tipo": "rsc170",
		          "component_tipo": "rsc175"
		        }
		      ],
		      "type": "jsonb",
		      "q_operator": null
		    },
		    {
		      "$and": [
		        {
		          "q": [],
		          "path": [
		            {
		              "name": "Id",
		              "model": "component_section_id",
		              "section_tipo": "rsc170",
		              "component_tipo": "rsc175"
		            }
		          ],
		          "type": "jsonb",
		          "q_operator": null
		        },
		        {
		          "$and": [
		            {
		              "q": [
		                "1"
		              ],
		              "path": [
		                {
		                  "name": "Title",
		                  "model": "component_input_text",
		                  "section_tipo": "rsc170",
		                  "component_tipo": "rsc23"
		                }
		              ],
		              "type": "jsonb",
		              "q_operator": null
		            }
		          ]
		        }
		      ]
		    }
  		]
	* @return void
	*/
	public static function parse_filter(object &$component_data) : void {

		foreach ($component_data as $key => $value) {

			if (strpos($key, '$')===0) {
				// operator case
				foreach ($component_data->{$key} as $c_key => $c_value) {
					self::parse_filter($component_data->{$key}[$c_key]);
				}

			}else{
				// final value case

				$q = $component_data->q;

				// prevent empty string and array
					if (empty($q)
						|| (is_array($q) && empty($q[0]))
					) {
						$component_data->q = null;
						continue;
					}

				// false array cases like "52,55"
					// if ( !is_array($q) && strpos($q, ',')!==false ) {
					// 	$component_data->q = [$q];
					// 	continue;
					// }

				// non array case
					if (!is_array($q)) {
						$component_data->q = [$q];
						continue;
					}

				// short vars
					// $end_path	= end($value->path);
					// $tipo		= $end_path->component_tipo;
					// $model		= RecordObj_dd::get_model_name_by_tipo($tipo,true);
			}
		}
	}//end parse_filter



	/**
	* FIX_V6_BETA_ISSUES
	* Fix errors generated in section data on phase beta of v6
	* @return bool
	*/
	public static function fix_v6_beta_issues() : bool {

		$ar_tables = [
			// 'new_matrix'
			'matrix',
			'matrix_activities',
			'matrix_dataframe',
			'matrix_dd',
			'matrix_hierarchy',
			'matrix_hierarchy_main',
			'matrix_indexations',
			// 'matrix_langs',
			'matrix_layout',
			'matrix_layout_dd',
			'matrix_list',
			'matrix_notes',
			'matrix_profiles',
			'matrix_projects',
			// 'matrix_structurations',
			'matrix_tools',
			'matrix_users',
			'matrix_stats'
		];
		$action = 'v5_to_v6::fix_data_action';

		self::convert_table_data($ar_tables, $action);

		return true;
	}//end fix_v6_beta_issues



	/**
	* FIX_DATA_ACTION
	* @return object $datos_column
	* @return object $dato
	*/
	public static function fix_data_action( stdClass $datos_column ) : object {

		$dato = clone $datos_column;

		// clean component dato
			if (!empty($dato->components)) {

				foreach ($dato->components as $tipo => $component_data) {

					if (isset($component_data->dato) && isset($component_data->{DEDALO_DATA_NOLAN})) {
						unset($component_data->{DEDALO_DATA_NOLAN});
					}

					switch (true) {
						case !isset($component_data->dato):
							// fix missing dato path
							if ($tipo==='dd199' ||  // created_date
								$tipo===DEDALO_SECTION_INFO_MODIFIED_DATE) { // modified_date

								$new_component_data = new stdClass();
									$new_component_data->inf = $tipo==='dd199'
										? 'created_date [component_date]'
										: 'modified_date [component_date]';
									$new_component_data->dato = clone $component_data;

								// replace
								$dato->components->{$tipo} = $new_component_data;
							}
							break;

						case (	$tipo===DEDALO_ACTIVITY_WHEN
							&& 	isset($component_data->dato->{DEDALO_DATA_NOLAN})
							&&  isset($component_data->dato->{DEDALO_DATA_NOLAN}[0])
							&&  isset($component_data->dato->{DEDALO_DATA_NOLAN}[0]->start)
							&&  property_exists($component_data->dato->{DEDALO_DATA_NOLAN}[0]->start, 'errors')):

							// date
							$created_date = $dato->created_date ?? null;
							if (!empty($created_date)) {
								$dd_date = dd_date::get_dd_date_from_timestamp( $created_date );
								// replace
								$dato->components->{$tipo}->dato->{DEDALO_DATA_NOLAN} = [(object)[
									'start' => $dd_date
								]];
							}
							break;

						default:
							// nothing to do
							break;
					}
				}//end foreach ($dato->components as $tipo => $component_data)
			}


		// clean section dato (rebuild the section object but excluded properties)
			$new_dato = new StdClass();
			foreach ($dato as $key => $value) {
				$new_dato->{$key} = $value;
			}


		return $new_dato;
	}//end fix_data_action



}//end class v5_to_v6
