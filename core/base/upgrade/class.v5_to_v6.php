<?php
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

		// Maximum execution time
		set_time_limit(0);

		foreach ($ar_tables as $table) {

			// Get last id in the table
			$strQuery	= "SELECT id FROM $table ORDER BY id DESC LIMIT 1 ";
			$result		= JSON_RecordDataBoundObject::search_free($strQuery);
			$rows		= pg_fetch_assoc($result);
			if (!$rows) {
				continue;
			}
			$max = $rows['id'];

			// Get first id in the table
			$min_strQuery	= "SELECT id FROM $table ORDER BY id LIMIT 1 ";
			$min_result		= JSON_RecordDataBoundObject::search_free($min_strQuery);
			$min_rows		= pg_fetch_assoc($min_result);
			if (!$min_rows) {
				continue;
			}
			$min = $min_rows['id'];

			//$min = 1;

			// iterate from 1 to last id
			$i_ref = 0; $start_time = start_time();
			for ($i=$min; $i<=$max; $i++) {

				$strQuery	= "SELECT id, datos FROM $table WHERE id = $i ORDER BY id ASC";
				$result		= JSON_RecordDataBoundObject::search_free($strQuery);
				if($result===false) {
					$msg = "Failed Search id $i. Data is not found.";
					debug_log(__METHOD__." ERROR: $msg ".to_string(), logger::ERROR);
					continue;
				}
				$n_rows = pg_num_rows($result);

				if ($n_rows<1) continue;

				while($rows = pg_fetch_assoc($result)) {

					$id		= $rows['id'];
					$datos	= json_decode($rows['datos']);

					if (!empty($datos)) {

						// called_class extends current class
						$called_class = get_called_class();

						$section_data			= $called_class::{$action}( $datos ); // like 'convert_section_dato_to_data'
						$section_data_encoded	= json_encode($section_data);

						$strQuery	= "UPDATE $table SET datos = $1 WHERE id = $2 ";
						$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $section_data_encoded, $id ));
						if(!$result) {
							$msg = "Failed Update section_data $i";
							debug_log(__METHOD__." ERROR: $msg ".to_string(), logger::ERROR);
							continue;
						}
					}else{
						debug_log(__METHOD__
							." ERROR: Empty datos from: $table - $id "
							, logger::ERROR
						);
					}
				}

				// log info each 1000
					if ($i_ref===0) {
						debug_log(__METHOD__
							. " Partial update of section data table: $table - id: $id - total: $n_rows - total min: ".exec_time_unit($start_time,'min')
							, logger::DEBUG
						);
					}else{
						$i_ref = ($i_ref>1000) ? 0 : $i_ref + 1;
					}
			}
			#break; // stop now
		}//end foreach ($ar_tables as $key => $table)


		return true;
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
	* @return bool
	*/
	public static function update_publication_media_files() : bool {

		try {

			// PDF files
				$max_items_folder = 1000;
				foreach (DEDALO_PDF_AR_QUALITY as $quality) {

					$current_dir = DEDALO_MEDIA_PATH . DEDALO_PDF_FOLDER . '/' . $quality;
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
								if(!is_file($full_path) || strpos($file, 'rsc209_rsc205_')===false) {
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

							// move file
								$additional_path = $max_items_folder * (floor($section_id / $max_items_folder));

							// base_dir
								$base_dir = $current_dir . '/' . $additional_path;
								if ( !is_dir($base_dir) ) {
									if( !mkdir($base_dir, 0750) ) {
										$response->msg = 'Error. Request failed ['.__FUNCTION__.']. Unable to create dir: '.$base_dir;
										debug_log(__METHOD__
											." ++ Error. Unable to create non exiting directory base_dir: '.$base_dir"
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
				}//end foreach (DEDALO_PDF_AR_QUALITY as $quality)
				debug_log(__METHOD__
					. " Updated Publication PDF media files " . PHP_EOL
					. ' DEDALO_PDF_AR_QUALITY: ' . json_encode(DEDALO_PDF_AR_QUALITY)
					, logger::WARNING
				);


			// IMAGE files
				$max_items_folder = 1000;
				foreach (DEDALO_IMAGE_AR_QUALITY as $quality) {

					$current_dir = DEDALO_MEDIA_PATH . DEDALO_IMAGE_FOLDER . '/' . $quality;
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

							// ignore folders and non searched files as 'rsc228_rsc205_1.jpg'
								if(!is_file($full_path) || strpos($file, 'rsc228_rsc205_')===false) {
									continue;
								}

							// section_id
								preg_match('/.*_([0-9]+)\..*/', $file, $output_array);
								$section_id = $output_array[1] ?? null;
								if (empty($section_id)) {
									debug_log(__METHOD__
										. " ++ Error on calculate file section_id using regex. The file will be ignored " . PHP_EOL
										. ' file: ' . $file
										, logger::ERROR
									);
									continue;
								}

							// move file
								$additional_path = $max_items_folder * (floor($section_id / $max_items_folder));

							// base_dir
								$base_dir = $current_dir . '/' . $additional_path;
								if ( !is_dir($base_dir) ) {
									if( !mkdir($base_dir, 0750) ) {
										$response->msg = 'Error. Request failed ['.__FUNCTION__.']. Unable to create dir: '.$base_dir;
										debug_log(__METHOD__
											." ++ Error. Unable to create non exiting directory base_dir: '.$base_dir"
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
										. " ++ Error on move file " . PHP_EOL
										. ' source full_path: ' . $full_path . PHP_EOL
										. ' target_path: ' . $target_path
										, logger::ERROR
									);
								}
						}//end foreach ($files as $file)
				}//end foreach (DEDALO_IMAGE_AR_QUALITY as $quality)
				debug_log(__METHOD__
					. " Updated Publication IMAGE media files " . PHP_EOL
					. ' DEDALO_IMAGE_AR_QUALITY: ' . json_encode(DEDALO_IMAGE_AR_QUALITY)
					, logger::WARNING
				);

		} catch (Exception $e) {
			debug_log(__METHOD__
				." Error on update_publication_media_files ". PHP_EOL
				." Caught exception: ".$e->getMessage()
				, logger::ERROR
			);
		}


		return true;
	}//end update_publication_media_files



}//end class v5_to_v6
