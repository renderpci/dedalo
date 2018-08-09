<?php  
require_once '../utils/class.utils.php';

/**
* TOPONOMY_IMPORT
*/
class toponomy_import extends utils {



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



	/**
	* nomenclator_code_to_parent
	* Search in db and get correspondence of nomenclator_code request
	* @return string|null $parent
	*/
	public static function nomenclator_code_to_parent( $ref_parent ) {
		
		$parent = null; # default

		$matrix_table = 'matrix_descriptors';
		$arguments=array();
			$arguments['strPrimaryKeyName']	= 'parent';
			$arguments['tipo']				= 'nomenclator_code';
			$arguments['dato']				= $ref_parent;
			$matrix_table 					= $matrix_table;
			$RecordObj_matrix 				= new RecordObj_matrix($matrix_table);
			$ar_id							= $RecordObj_matrix->search($arguments);			

		if (!empty($ar_id)) {			
			$parent = reset($ar_id);
		}

		return $parent;
	}#end nomenclator_code_to_parent



	/**
	* SET_DB_DESCRIPTORS_ROW
	* Create or update if exists, descriotor for nomenclator_code, etc.
	* @param string $terminoID
	* @param string $dato
	* @param string $type
	*	nomenclator_code, geolocalizacion, tiempo, altitude
	* @return int $id_descriptors;
	*/
	public static function set_db_descriptors_row( $terminoID, $dato, $type ) {
		
		$lang					= Jerarquia::get_mainLang($terminoID);
		$matrix_table			= RecordObj_descriptors::get_matrix_table_from_tipo($terminoID);
		$RecordObj_descriptors	= new RecordObj_descriptors($matrix_table, NULL, $terminoID, $lang);
		$RecordObj_descriptors->set_tipo($type);
		$RecordObj_descriptors->set_parent($terminoID);
		$RecordObj_descriptors->set_lang($lang);
		$RecordObj_descriptors->set_dato($dato);

		$id_descriptors	= $RecordObj_descriptors->Save();
			#dump($id_descriptors, ' $id_descriptors ++ '.to_string());

		return $id_descriptors;
	}#end set_db_descriptors_row	




}//end toponomy_import
?>