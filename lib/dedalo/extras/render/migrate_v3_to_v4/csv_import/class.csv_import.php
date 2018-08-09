<?php  


/**
* CSV_IMPORT
*/
class csv_import {

	public static $delimiter = ';';



	/**
	* READ_CSV_FILE_AS_TABLE
	* @param string $file
	* @return string $html
	*/
	public static function read_csv_file_as_table( $file, $header=false, $delimiter=null, $standalone=false ) {

		if(!file_exists($file)) {
			echo "File not found: $file";
			return false;
		}

		return tool_export::read_csv_file_as_table( $file, $header, $delimiter, $standalone );

	}#end read_csv_file_as_table



	/**
	* READ_CSV_FILE_AS_ARRAY
	* @param string $file
	* @return string $html
	*/
	public static function read_csv_file_as_array( $file, $skip_header=false, $delimiter=';' ) {

		if(!file_exists($file)) {
			echo "File not found: $file";
			return false;
		}
			
		ini_set('auto_detect_line_endings',TRUE);

		$f = fopen($file, "r");
		
		$csv_array=array();
		$i=0; while (($line = fgetcsv($f, 5000, $delimiter)) !== false) {

			if ($skip_header && $i==0) {
				$i++;
				continue;
			}
			#if ($i>1) break;	
				
			foreach ($line as $cell) {
				
				#$cell=nl2br($cell);
				#$cell=htmlspecialchars($cell); // htmlspecialchars_decode($cell);
				#$cell = str_replace("\t", " <blockquote> </blockquote> ", $cell);				

				$csv_array[$i][] = $cell;				
			}		
			$i++;
		}
		fclose($f);
		ini_set('auto_detect_line_endings',FALSE);
		
		return $csv_array;

	}#end read_csv_file_as_array



	/**
	* UPDATE_DEDALO_SECTION
	* @return 
	*/
	public static function update_dedalo_section( $map, $ar_csv_data, $section_tipo ) {
		
		$start_time = start_time();

		#
		# MAP
		$ar_fields = array_keys($map);
			#dump($ar_fields, ' $ar_fields ++ '.to_string()); die();			

		$section_name = RecordObj_dd::get_termino_by_tipo($section_tipo);


		$done=0;	
		foreach ($ar_csv_data as $key => $ar_value) {
			
			#if ($key>100) { continue; }
				#dump($ar_value, ' $ar_value ++ '.to_string());
				#dump($map, ' $map ++ '.to_string());
				#dump($ar_value[ $map['section_id'] ], ' map ++ '.to_string());

			// Try to get section_id from csv.
			$section_id = isset($ar_value[$map['section_id']]) ? $ar_value[$map['section_id']] : null;

			if ($section_id==='') {
				dump($$section_id, ' $section_id ++ '.to_string());
				echo "Skipped section_id defined as empty string <br>";
				continue;
			}

			// Avoid overwrite some users
			#if ( $section_tipo=='rsc197' && ($section_id=='1' || $section_id=='3') ) {
			#	echo "Skip user $section_id<br>";
			#	continue;
			#}

			$section 	= section::get_instance( $section_id, $section_tipo);
			$result 	= $section->forced_create_record(); // Only if not exists
				
			
			// Safe section_id to use
			$section_id = $section->get_section_id();


			# AR_FIELDS
			echo "<hr> ar_csv_data key: $key <br>";
			echo "section_id: <b> $section_id </b> <br>";
			if($result==true) {
				echo "<span style=\"color:orage\">Forced to create new section: $section_id</span><br>";
			}else{
				echo "<span style=\"color:green\">Updating existing section: $section_id </span><br>"; 
			}
			foreach ($ar_fields as $fname) {

				if (!isset($map[$fname])) {
					echo "<span style=\"color:orage\">Ignored field $fname (not in ar_fields)</span><br>";
				}

				if ($fname=='section_id') continue;	// Skip

				
				$number_key 	= $map[$fname];		
				$$fname 		= $ar_value[$number_key];
				$raw_value 		= $$fname;			

				echo " -> $fname = ". $ar_value[$number_key] ."<br>";			
				

				// Try decode possible json data. Is is json encoded, replace dato with decoded version
				$dato = json_decode($raw_value);
				if ( !$dato ) {
					$dato = $raw_value;
					if(strpos($dato, '[{')!==false) {
						echo "<span style=\"color:red\">dato appears by a BAD formed json string ($dato) . Skipped!! </span><br>";
						continue;
					}	
				}else{
					echo "dato is decoded from json value ($raw_value)<br>";
				}

				
				switch ($fname) {

					// section id
					case 'section_id':
						// Nothing to do with this. Skip this field	 
						break;

					// Section info
					case 'created_date':
					case 'modified_date':
						if (!empty($dato)) {						
							$section = section::get_instance($section_id, $section_tipo);
							$method_name = 'set_'.$fname;
							$section->$method_name( $dato );
							$section->Save();
							echo "Saved $fname with dato: ".to_string($dato)."<br>";
						}											
						break;

					// Components data
					default:
						if(!empty($dato)) {

							$tipo 		 = (string)$fname;
							$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($tipo, true);
								if (!is_callable($modelo_name)) {
									#echo "Ignored modelo_name: $modelo_name because not class handler is found<br>";
								}
							
							$modo 			= 'edit';
							$RecordObj_dd 	= new RecordObj_dd($tipo);
							$lang 			= $RecordObj_dd->get_traducible()=='si' ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN ;						

							$component 	 	= component_common::get_instance( $modelo_name,
																			  $tipo,
																			  $section_id,
																			  $modo,
																			  $lang,
																			  $section_tipo);
							# Excepciones
							if ($tipo=='rsc104') {
								$previous_dato=$dato;
								$dd_date = new dd_date();
								$dato = $dd_date->get_date_from_timestamp($dato);
								echo "<span style=\"color:red\">Converted fecha: $previous_dato to ".to_string($dato) ."</span>";
							}
							// Radio buttons de si/no no resueltos con el locator (usuarios por ejemplo)
							if ($modelo_name=='component_radio_button' && is_string($dato)) {
								if ( strtolower($dato)=='si') {
									$locator = new locator();
										$locator->set_section_tipo('dd64');
										$locator->set_section_id(1);
									
									$dato = array($locator);
								}else if ( strtolower($dato)=='no') {
									$locator = new locator();
										$locator->set_section_tipo('dd64');
										$locator->set_section_id(2);
									
									$dato = array($locator);
								}
							}
							// 

							
							$component->set_dato( $dato );
							$component->Save();
							echo "Saved $modelo_name $tipo with dato: ".to_string($dato)."<br>";
							
						}else{
							echo "<span style=\"color:orage\">Skip Save $modelo_name $tipo with empty dato: ".to_string($dato)."</span><br>";
						}
						
						break;

				}//end switch ($fname) {				

			};//end foreach ($ar_fields as $fname) 

			// record done
			$done++;

		}//end foreach ($ar_csv_data as $key => $ar_value) {

		echo "<hr> THE END. Total records done: $done of ar_csv_data: ".count($ar_csv_data). " ($section_name)<br>";
		echo  exec_time($start_time, __METHOD__);

	}#end update_dedalo_section



	/**
	* export_images
	* @return 
	*/
	public static function export_images( $map, $ar_csv_data, $path_source, $path_target, $max_items_folder=false ) {
		
		$start_time = start_time();
		

		$done=0;	
		foreach ($ar_csv_data as $key => $ar_value) {

			# AR_FIELDS
			echo "<hr> ar_csv_data key: $key <br>";

			$image_source 	= $ar_value[ $map['image_source'] ];
			$image_target 	= $ar_value[ $map['image_target'] ];
			$locator_portal = $ar_value[ $map['locator'] ];
			$tipo 			= $ar_value[ $map['tipo'] ];

			if (!$locator = json_decode($locator_portal)) {
				echo "<span style=\"color:red\">Invalid json data skipped: ".to_string($locator_portal)."</span><br>";
				continue;
			}
			$locator = reset($locator);
				#dump($locator, ' locator ++ '.to_string()); continue;

			$image_target = $tipo .'_'. $locator->section_tipo .'_'. $image_target ;


			echo "image_source: <b>$image_source</b> - image_target: <b>$image_target</b> - max_items_folder $max_items_folder <br>";
			#continue;


			$filename1 = $path_source .'/' . $image_source .'.jpg';
			$filename2 = $path_target .'/' . $image_target .'.jpg'; // Default

			if($max_items_folder) {
				$aditional_path = '/'. (int)$max_items_folder*(floor($filename2 / $max_items_folder));

				$filename2 		= $path_target . $aditional_path .'/' . $image_target .'.jpg';

				echo "<span style=\"color:green\"> added aditional path: $aditional_path to target image </span><br>";
			}
			

			echo "$filename1 <br> $filename2 <br>";

			// Copy image
			// rename($filename1, $filename2);
			if (!copy($filename1, $filename2)) {
				echo "<span style=\"color:red\"> Error al copiar <br>$filename1 a $filename2 </span><br>";
			}else{
				echo "<span style=\"color:green\"> Ok. Copiado <br>$filename1 a $filename2 </span><br>";
			}

			

			// record done
			$done++;

		}//end foreach ($ar_csv_data as $key => $ar_value) {

		echo "<hr> THE END. Total records done: $done of ar_csv_data: ".count($ar_csv_data). " (export_images)<br>";
		echo  exec_time($start_time, __METHOD__);

	}#end export_images



	/**
	* CHANGE_SECTION_CREATOR
	* @return 
	*/
	public static function change_section_creator( $matrix_table, $section_creator_top_tipo , $section_creator_portal_tipo, $section_creator_portal_section_tipo, $section_tipo ) {

		$save= true;
		
		$strQuery = 'SELECT id, section_id, section_tipo, datos FROM "'.$matrix_table.'" WHERE section_tipo = \''.$section_tipo.'\' AND section_id < 1103 ORDER BY id ASC LIMIT 999999999999999 OFFSET 0 ';				
		$result	  = JSON_RecordObj_matrix::search_free($strQuery);
			dump($strQuery, ' strQuery ++ '.to_string());

		while ($rows = pg_fetch_assoc($result)) {

			$id 			= (int)$rows['id'];
			$datos 			= (string)$rows['datos'];
			$section_tipo 	= (string)$rows['section_tipo'];
			$section_id 	= (string)$rows['section_id'];		

			$datos	= (object)json_decode($datos);

			$datos->section_creator_top_tipo 			= $section_creator_top_tipo;			
			$datos->section_creator_portal_tipo  		= $section_creator_portal_tipo;	
			$datos->section_creator_portal_section_tipo = $section_creator_portal_section_tipo;			
			
			/*
				if (isset($datos->created_by_userID)) {
					if ($datos->created_by_userID==1) {
						$datos->created_by_userID = (int)$datos->created_by_userID -2;
					}else{
						$datos->created_by_userID = (int)$datos->created_by_userID -1;
					}
				}
						
				if (isset($datos->modified_by_userID)) {
					if ($datos->modified_by_userID==1) {
						$datos->modified_by_userID = (int)$datos->modified_by_userID -2;
					}else{
						$datos->modified_by_userID = (int)$datos->modified_by_userID -1;
					}
				}
				*/

			$datos_ob = $datos;		#dump($datos, ' datos ++ '.to_string());

	 		$datos = (string)json_encode($datos);		
			$datos = pg_escape_string($datos);
				#dump($datos," section_real_tipo");

			// Save section dato				
			$strQuery = "UPDATE \"$matrix_table\" SET datos = '$datos' WHERE id = $id";
					
			
			if ($save) {
				$update_result 	= pg_query(DBi::_getConnection(), $strQuery);
				if (!$update_result) {
					dump($strQuery,"strQuery");
					echo pg_last_error();
					echo "<br> Error on Update row id_matrix:$id  - pg_last_error:". pg_last_error() ." <hr> "; //substr($strQuery, 0,250)
				}else {
					echo "<br> Updated row section_id:$section_id ". '' ." <hr> "; //substr($strQuery, 0,250)
				}
			}else{
				echo "<hr> (PREVIEW) Updated row section_id:$section_id - ". '' ."  "; 
			}
			#dump($dato," dato");

		}#end while

		echo "<br><br> Total records: ".pg_num_rows($result);

	}#end change_section_creator



	/**
	* UPDATE_DEDALO_TOPONOMY_TABLE_MUNICIPIOS
	* @return 
	*/
	public static function update_dedalo_toponomy_table_municipios( $map, $ar_csv_data, $prefix=false ) {
		
		#
		# MAP
		$ar_fields = array('terminoID','termino','ref_parent','ref_modelo','nomenclator_code','lat','lon','alt');	
		$done=0;

		$start_time = start_time();

		foreach ($ar_csv_data as $key => $ar_value) {
					
			/*
			$id 				= isset($map['id']) ? $map['id'] : null;
			$termino 			= isset($map['termino']) ? $map['termino'] : null;
			$ref_parent 		= isset($map['ref_parent']) ? $map['ref_parent'] : null;
			$ref_modelo 		= isset($map['ref_modelo']) ? $map['ref_modelo'] : null;
			$nomenclator_code 	= isset($map['nomenclator_code']) ? $map['nomenclator_code'] : null;			
			$lat 				= isset($map['lat']) ? $map['lat'] : null;
			$lon 				= isset($map['lon']) ? $map['lon'] : null;
			$alt 				= isset($map['alt']) ? $map['alt'] : null;		

			[0] => 52001000000
            [1] => Melilla
            [2] => 52001
            [3] => 35.29072222
            [4] => -2.94721111
            [5] => 30
            [6] => es4144
			*/
			#if ($key>100) { continue; }

			# AR_FIELDS
			echo "<hr> ar_csv_data key: $key <br>";
			foreach ($ar_fields as $fname) {

				if (isset($map[$fname])) {					
				
					$number_key 	= $map[$fname];		
					$$fname 		= $ar_value[$number_key];

					echo "$fname = ". $ar_value[$number_key] ."<br>";				
				}
			};
			
			#
            # JER_XX DATA            
				$RecordObj_ts = new RecordObj_ts($terminoID);

				$prefix = $prefix ? $prefix : Tesauro::terminoID2prefix($terminoID);
				
				if( !(bool)$jer_record_exists = self::jer_record_exists($terminoID) ) {

					#$RecordObj_ts->set_force_insert_on_save(true);					
					$current_parent = isset($parent) ? $parent : $prefix.'1';
					$result 		= (int)self::jer_new_record( $terminoID, $current_parent );
					#debug_log(__METHOD__." Created new jer_{$prefix} record: $terminoID ".to_string(), logger::DEBUG);
					echo "Created new jer_{$prefix} record: $terminoID <br>";
				}
	            
	            /*
	            terminoID = es355
				termino = Alegría-Dulantzi
				nomenclator_code = 1001000000
				lat = 42.83981158
				lon = -2.51243731
				alt = 568
	           	*/	          

				# Parent optional change
				if(isset($parent)) {
					$RecordObj_ts->set_parent($parent);
				}

				# Esmodelo optional change
				if(isset($esmodelo)) {
					$RecordObj_ts->set_esmodelo($esmodelo);
				}

				#
				# PROPIEDADES SAVE FOR SAFETY HISTORIC
				$propiedades = $RecordObj_ts->get_propiedades();
					if(empty($propiedades)) $propiedades = '[]';
					$propiedades = (array)json_decode($propiedades);
					$termino_OLD = RecordObj_ts::get_termino_by_tipo($terminoID); // Before change

					$options = new stdClass();
						$options->type 				= 'import';
						$options->ip 				= isset($_SERVER['REMOTE_ADDR']) ? $_SERVER["REMOTE_ADDR"] : false;
						$options->date 				= date('Y-m-d H:i:s');
						$options->termino 			= $termino;
						$options->termino_OLD 		= $termino_OLD;
						$options->nomenclator_code 	= $nomenclator_code;
						$options->lat 				= $lat;
						$options->lon 				= $lon;
						$options->alt 				= $alt;
						$options->jer_record_exists = $jer_record_exists;

						$propiedades[] 	  = $options;
						$propiedades_json = json_encode($propiedades);
						$RecordObj_ts->set_propiedades( $propiedades_json );

		
				# SAVE JER_XX RECORD
				$created_id_ts = $RecordObj_ts->Save();
				#debug_log(__METHOD__." Saved jer_{$prefix} record: $terminoID ".to_string(), logger::DEBUG);
				echo "Saved jer_{$prefix} record: $terminoID <br>";


			#
			# DESCRIPTORS
				$lang			= Jerarquia::get_mainLang($terminoID);
				$matrix_table	= RecordObj_descriptors::get_matrix_table_from_tipo($terminoID);

				# termino
				if ( isset($nomenclator_code) ) {
					$RecordObj_descriptors	= new RecordObj_descriptors($matrix_table, NULL, $terminoID, $lang, $tipo='termino');
					$RecordObj_descriptors->set_dato($termino);
					$RecordObj_descriptors->Save();
					#debug_log(__METHOD__." Saved descriptors record: $terminoID - $tipo - ".to_string($termino), logger::DEBUG);					
					if($jer_record_exists && $termino!=$termino_OLD) {
						echo "Saved descriptors record: $terminoID - $tipo - $termino - termino anterior: <span style=\"color:red\">$termino_OLD</span><br>";
					}else{
						echo "Saved descriptors record: $terminoID - $tipo - $termino<br>";
					}
				}				

				# nomenclator code
				if ( isset($nomenclator_code) ) {
					$RecordObj_descriptors	= new RecordObj_descriptors($matrix_table, NULL, $terminoID, $lang, $tipo='nomenclator_code');
					$RecordObj_descriptors->set_dato( (string)$nomenclator_code, true );
					$RecordObj_descriptors->Save();
					#debug_log(__METHOD__." Saved descriptors record: $terminoID - $tipo - ".to_string($nomenclator_code), logger::DEBUG);
					$nomenclator_code_in_db = $RecordObj_descriptors->get_nomenclator_code();
					echo "Saved descriptors record: $terminoID - $tipo - $nomenclator_code <br>";										
				}

				# geolocalizacion
				if ( isset($lat) && isset($lon) ) {
					$geolocalizacion = str_replace(',', '.', $lat).','. str_replace(',', '.', $lon);
					$RecordObj_descriptors	= new RecordObj_descriptors($matrix_table, NULL, $terminoID, $lang, $tipo='geolocalizacion');
					$RecordObj_descriptors->set_dato($geolocalizacion);
					$RecordObj_descriptors->Save();
					#debug_log(__METHOD__." Saved descriptors record: $terminoID - $tipo - ".to_string($geolocalizacion), logger::DEBUG);
					echo "Saved descriptors record: $terminoID - $tipo - $geolocalizacion <br>";
				}

				# altitude
				if ( isset($alt) ) {
					$RecordObj_descriptors	= new RecordObj_descriptors($matrix_table, NULL, $terminoID, $lang, $tipo='altitude');
					$RecordObj_descriptors->set_dato($alt);
					$RecordObj_descriptors->Save();
					#debug_log(__METHOD__." Saved descriptors record: $terminoID - $tipo - ".to_string($alt), logger::DEBUG);
					echo "Saved descriptors record: $terminoID - $tipo - $alt <br>";
				}

				$done++;
			
			//break;

		}//end foreach ($ar_csv_data as $key => $ar_value) {

		echo "<hr> THE END. Total done: $done of ar_csv_data: ".count($ar_csv_data). "<br>";
		echo  exec_time($start_time, __METHOD__);

	}#end UPDATE_DEDALO_TOPONOMY_TABLE_MUNICIPIOS



	/**
	* JER_RECORD_EXISTS
	* @return 
	*/
	public static function jer_record_exists( $terminoID ) {

		$prefix = Tesauro::terminoID2prefix($terminoID);
		
		$matrix_table = 'jer_'.$prefix;
		$arguments=array();
			$arguments['terminoID']	= $terminoID;
			$matrix_table 			= $matrix_table;
			$RecordObj_matrix 		= new RecordObj_matrix($matrix_table);
			$ar_id					= $RecordObj_matrix->search($arguments);
				#dump($ar_id," AR_ID - arguments: ".print_r($arguments,true));

		if (empty($ar_id)) {
			return false;
		}else{
			return true;
		}

	}#end jer_record_exists



	/**
	* JER_NEW_RECORD
	* @return int $id
	*/
	public static function jer_new_record( $terminoID, $parent, $prefix=false ) {

		
		$prefix 		= $prefix ? $prefix : Tesauro::terminoID2prefix($terminoID);			
		$table 			= 'jer_'.$prefix;
		$RecordObj_ts 	= new RecordObj_ts($terminoID, $prefix);

		if (empty($terminoID)) {
			# New record with auto id
			$id = null;
			$strQuery = "INSERT INTO $table (parent, modelo, esmodelo, esdescriptor, visible, norden, \"usableIndex\", traducible, relaciones, propiedades) 
						VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id";
			$result   = pg_query_params(DBi::_getConnection(), $strQuery, array( $parent, NULL, 'no', 'si', 'si', NULL, NULL, NULL, NULL, '[]' ));

		}else{
			# New record with fixed id
			$id = $RecordObj_ts->terminoID2id($terminoID);
			$strQuery = "INSERT INTO $table (id, \"terminoID\", parent, modelo, esmodelo, esdescriptor, visible, norden, \"usableIndex\", traducible, relaciones, propiedades) 
						VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id";
			$result   = pg_query_params(DBi::_getConnection(), $strQuery, array( $id, $terminoID, $parent, NULL, 'no', 'si', 'si', NULL, NULL, NULL, NULL, '[]' ));	
		}		
		if (!$result) {
			echo "<span style=\"color:red\">Error Processing Request: ".pg_last_error()."</span>";
			trigger_error("Error on create row in $table");
			die();
		}

		$id = pg_fetch_result($result,0,'id');
		if (!$id) {
			echo "<span style=\"color:red\">Error Processing Request: ".pg_last_error()."</span>";
			if(SHOW_DEBUG) {
				dump($strQuery,"strQuery");
				throw new Exception("Error Processing Request: ".pg_last_error(), 1);
			}
		}
		#dump($id, ' jer_new_record created record with id ++ '.to_string($strQuery)); 

		return (int)$id;

	}#end jer_new_record



	/**
	* UPDATE_DEDALO_TOPONOMY_TABLE
	* @return 
	*/
	public static function update_dedalo_toponomy_table( $map, $ar_csv_data, $prefix ) {		
		
		# MAP
		$ar_fields = array('termino','nomenclator_code','lat','lon','alt','tipology');
		$done=0;

		$start_time = start_time();

		foreach ($ar_csv_data as $key => $ar_value) {
					
			/*
			[0] => 52001000000
            [1] => Melilla
            [2] => 52001
            [3] => 35.29072222
            [4] => -2.94721111
            [5] => 30
            [6] => es4144
			*/
			#if ($key<10195) { continue; }

			# AR_FIELDS . Get vars
			echo "<hr> ar_csv_data key: $key <br>";
			foreach ($ar_fields as $fname) {

				if (isset($map[$fname])) {					
				
					$number_key 	= $map[$fname];		
					$$fname 		= $ar_value[$number_key];

					echo "$fname = ". $ar_value[$number_key] ."<br>";				
				}
			}; 
            #continue;

            $expected_parent = isset($terminoID) ? $terminoID : false;

			# Reset on every loop
			$parent = null; 
			$modelo = null;

			#
			# PARENT CALCULATE
			if ( strtolower($tipology)==strtolower('municipio') ) {
				
				$parent = null;

			}else{

				# Calculate ref_parent from nomenclator code
				# Ref like: 8033000499
				$code_diseminado = substr($nomenclator_code, -2);
				$code_singular   = substr($nomenclator_code, -4, 2);
				$code_colectiva  = substr($nomenclator_code, -6, 2);
				$code_municipio  = substr($nomenclator_code, -11, 5);
				
				$mix = "$code_municipio-$code_colectiva-$code_singular-$code_diseminado";
					#dump($mix, ' $mix ++ '.to_string());

				if ( strtolower($tipology)==strtolower('entidad colectiva')) {
					
					$ref_parent = $code_municipio . '000000';

				}else if ( strtolower($tipology)==strtolower('entidad singular')) {

					$ref_parent = $code_municipio . $code_colectiva . '0000';

				}else{
					$resto=true;
					$ref_parent = $code_municipio . $code_colectiva . $code_singular . '00';
				}

				if (strtolower($tipology)==strtolower('capital de municipio')) {
					if($code_diseminado==00) {
						$ref_parent = $code_municipio . $code_colectiva . '0000';
					}
				}

				# PARENT CALCULATED
				$parent = self::nomenclator_code_to_parent( $ref_parent );
				if(empty($parent)) {
					# Lo volvemos a intentar
					$ref_parent = $code_municipio . $code_colectiva . '00' . '00';
					$parent = self::nomenclator_code_to_parent( $ref_parent );
					echo "<span style=\"color:orage\">Empty parent, trying n 2 with ref_parent: $ref_parent </span><br>";
				}
				if(empty($parent)) {
					# Lo volvemos a intentar 2
					$ref_parent = $code_municipio . '00' . '00' . '00';
					$parent = self::nomenclator_code_to_parent( $ref_parent );
					echo "<span style=\"color:orage\">Empty parent, trying n 3 with ref_parent: $ref_parent </span><br>";
				}
				$parent_name=null;
				if(!empty($parent) && strpos($parent, $prefix)===0 ) {
					$parent_name = RecordObj_ts::get_termino_by_tipo($parent);
				}
				echo "Calculated parent from ref_parent: ".to_string($ref_parent)." - parent: <b>".to_string($parent)."</b> ($parent_name)<br>";
				#if($expected_parent && $expected_parent!=$parent) {
				#	echo "<span style=\"color:red\">Expected parent is $expected_parent, but calculated parent is <b>".to_string($parent)."</b></span><br>";
				#}

			}//end parent calculate


			#continue;
			#
            # JER_XX DATA 

				# Search if exists current terminoID 
				$terminoID = self::nomenclator_code_to_parent( $nomenclator_code );
					#dump($terminoID, ' terminoID ++ '.to_string($nomenclator_code));
					#continue;				

				$jer_record_exists = true;
				if ($terminoID==null) {

					$jer_record_exists = false;
					
					# Not exists. Create a new descriptor with calculated parent, or default parent (like 'es1') if not found
					$current_parent = isset($parent) ? $parent : $prefix.'1';
					$result 		= (int)self::jer_new_record( null, $current_parent, $prefix );
					if($result<1) throw new Exception("Error Processing Request. Invalid jer_new_record result ".to_string($result), 1);									

					$terminoID = $prefix.$result;

					#debug_log(__METHOD__." Created new jer_{$prefix} record: $terminoID ".to_string(), logger::DEBUG);
					echo "<span style=\"color:green\">Created new jer_{$prefix} record: <b>$terminoID</b> with parent: ".to_string($current_parent)." </span><br>";
				}else{
					echo "Using existing terminoID: $terminoID to update term <br>";
				}

				# verify parent
				if ($parent==$terminoID) {
					echo "<span style=\"color:red\">Parent and terminoID are identical. Error has occurred on calculate parent</span><br>";
				}

				$RecordObj_ts = new RecordObj_ts($terminoID);


				#if ( $parent=='es1' || (isset($current_parent) && $current_parent=='es1') )  {		           
				# 	continue; # skip normal records
				# }			            
	                	

				# Parent . Important : always set even if null				
				$RecordObj_ts->set_parent($parent);

				if($parent==$prefix.'1') {
					echo "<span style=\"color:red\">Parent default is used: <b>".to_string($parent)."</b></span><br>";
				}				
				

				# modelo optional change
				if(!empty($modelo)) {
					$RecordObj_ts->set_modelo($modelo);
				}

				#
				# PROPIEDADES SAVE FOR SAFETY HISTORIC
				$propiedades = $RecordObj_ts->get_propiedades();
					if(empty($propiedades)) $propiedades = '[]';
					$propiedades = (array)json_decode($propiedades);
					$termino_OLD = RecordObj_ts::get_termino_by_tipo($terminoID); // Before change

					$options = new stdClass();
						$options->type 				= 'import';
						$options->ip 				= isset($_SERVER['REMOTE_ADDR']) ? $_SERVER["REMOTE_ADDR"] : false;
						$options->date 				= date('Y-m-d H:i:s');
						$options->termino 			= $termino;
						$options->termino_OLD 		= $termino_OLD;
						$options->nomenclator_code 	= $nomenclator_code;
						$options->lat 				= $lat;
						$options->lon 				= $lon;
						$options->alt 				= $alt;
						$options->jer_record_exists = $jer_record_exists;

						$propiedades[] 	  = $options;
						$propiedades_json = json_encode($propiedades);
						$RecordObj_ts->set_propiedades( $propiedades_json );

		
				# SAVE JER_XX RECORD
				$created_id_ts = $RecordObj_ts->Save();
				#debug_log(__METHOD__." Saved jer_{$prefix} record: $terminoID ".to_string(), logger::DEBUG);
				echo "Saved jer_{$prefix} record: $terminoID with parent: ".to_string($parent)."<br>";


			#
			# DESCRIPTORS
				$lang			= Jerarquia::get_mainLang($terminoID);
				$matrix_table	= RecordObj_descriptors::get_matrix_table_from_tipo($terminoID);

				# termino
				if ( isset($termino) ) {
					$RecordObj_descriptors	= new RecordObj_descriptors($matrix_table, NULL, $terminoID, $lang, $tipo='termino');
					$RecordObj_descriptors->set_dato($termino);
					$RecordObj_descriptors->Save();
					#debug_log(__METHOD__." Saved descriptors record: $terminoID - $tipo - ".to_string($termino), logger::DEBUG);
					if($jer_record_exists && $termino!=$termino_OLD) {
						echo "Saved descriptors record: $terminoID - $tipo - $termino - termino anterior: <span style=\"color:red\">$termino_OLD</span><br>";
					}else{
						echo "Saved descriptors record: $terminoID - $tipo - $termino<br>";
					}
				}				

				# nomenclator code
				if ( isset($nomenclator_code) ) {
					$RecordObj_descriptors	= new RecordObj_descriptors($matrix_table, NULL, $terminoID, $lang, $tipo='nomenclator_code');
					$RecordObj_descriptors->set_dato($nomenclator_code);
					$RecordObj_descriptors->Save();
					#debug_log(__METHOD__." Saved descriptors record: $terminoID - $tipo - ".to_string($nomenclator_code), logger::DEBUG);
					echo "Saved descriptors record: $terminoID - $tipo - $nomenclator_code <br>";
				}

				# geolocalizacion
				if ( isset($lat) && isset($lon) ) {
					$geolocalizacion = str_replace(',', '.', $lat).','. str_replace(',', '.', $lon);
					$RecordObj_descriptors	= new RecordObj_descriptors($matrix_table, NULL, $terminoID, $lang, $tipo='geolocalizacion');
					$RecordObj_descriptors->set_dato($geolocalizacion);
					$RecordObj_descriptors->Save();
					#debug_log(__METHOD__." Saved descriptors record: $terminoID - $tipo - ".to_string($geolocalizacion), logger::DEBUG);
					echo "Saved descriptors record: $terminoID - $tipo - $geolocalizacion <br>";
				}

				# altitude
				if ( isset($alt) ) {
					$RecordObj_descriptors	= new RecordObj_descriptors($matrix_table, NULL, $terminoID, $lang, $tipo='altitude');
					$RecordObj_descriptors->set_dato($alt);
					$RecordObj_descriptors->Save();
					#debug_log(__METHOD__." Saved descriptors record: $terminoID - $tipo - ".to_string($alt), logger::DEBUG);
					echo "Saved descriptors record: $terminoID - $tipo - $alt <br>";
				}

				$done++;
			
			//break;

		}//end foreach ($ar_csv_data as $key => $ar_value) {

		echo "<hr> THE END. Total done: $done of ar_csv_data: ".count($ar_csv_data). "<br>";
		echo  exec_time($start_time, __METHOD__);

	}#end update_dedalo_toponomy_table
		




}//end csv_import


?>