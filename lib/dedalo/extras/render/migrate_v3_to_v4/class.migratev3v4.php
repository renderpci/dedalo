<?php


/**
* MIGRATEV3V4
*/
class migratev3v4 {


	public $mysqli;

	
	/**
	* __CONSTRUCT
	* @param array $mysql_conn
	*/
	public function __construct( $mysql_conn ) {

		$this->mysqli = new mysqli(	$mysql_conn['host'],
									$mysql_conn['user'],
									$mysql_conn['password'],
									$mysql_conn['database']
								  );
		$this->mysqli->set_charset("utf8");
		
	}#end __construct


	
	/**
	* MIGRATE_CAPTURES
	* Convert D3 'Captaciones' to D4 'Entrevistas'. In one loop parses oh1 and resources ('cintas')
	* @return 
	*/
	public function migrate_captures() {

		$table_name 	= 'captaciones';
		$ar_captaciones = $this->get_table_records( $table_name );	

		foreach ($ar_captaciones as $key => $ar_captacion) {
			#dump($ar_captacion, ' ar_captacion ++ '.to_string($key));
			#echo "<hr>".$ar_captacion['resumen'];

			/*
			$oh1 = new stdClass();	
				$oh1->MY_table 			= 'captaciones';
				$oh1->section_tipo 		= 'oh1';
				$oh1->section_id		= 'captacionID';
				$oh1->filter 			= array('oh22' => 'projectID');
				$oh1->fields 			= new stdClass();
				$oh1->fields->oh14 		='codigo';
				$oh1->fields->oh15 		='codigo_anterior';
				$oh1->fields->oh16 		='titulo';
				$oh1->fields->oh29 		='fechaAlta';
				$oh1->fields->oh20 		='idioma';
				$oh1->fields->oh21 		='calidad';
				$oh1->fields->oh32 		='difundible';
				$oh1->fields->oh18 		='lugar_captacion';
				$oh1->fields->oh19 		='municipioID';
				$oh1->fields->oh35 		='acta_cesion';
				$oh1->fields->oh33 		='uso_imagen';
				$oh1->fields->oh34 		='der_explotacion';
				$oh1->fields->oh37 		='otra_documentacion';
				$oh1->fields->oh38 		='obs';
				$oh1->fields->oh39 		='notas';
				$oh1->fields->oh23 		='resumen';

				$oh1->fields->oh76 		='responsable';
				$oh1->fields->oh78 		='captador';
				$oh1->fields->oh77 		='copiaDVD';
			*/
				
			foreach ($oh1 as $key => $value) {
				# code...
			}
		}		
	}#end migrate_captures



	/**
	* MIGRATE_TRANSCRIPTIONS
	* @return 
	*/
	public function migrate_transcriptions() {
		
		$table_name = 'tr';
		$ar_tr 		= $this->get_table_records( $table_name, 'ORDER BY reelID ASC, lang ASC', 'LIMIT 99999999' );
			#dump($ar_tr, ' ar_tr ++ '.to_string());

		foreach ($ar_tr as $key => $ar_data) {

			$reelID = $ar_data['reelID'];	#if((int)$reelID<900) continue;
			$texto 	= $ar_data['texto'];
			$lang 	= $ar_data['lang'];
			if (empty($lang)) {
				$lang 	= DEDALO_DATA_LANG;
			}

			$tipo 			= 'rsc36';  // text area
			$section_tipo 	= 'rsc167'; // section resources
			$parent 		= (int)$reelID;
			$component_text_area = component_common::get_instance($modelo_name='component_text_area',
																  $tipo,
																  $parent,
																  $modo='edit',
																  $lang,
																  $section_tipo);
			$component_text_area->set_dato($texto);
			$component_text_area->Save();

			echo "<br> ".__METHOD__." <b>$reelID</b> section_tipo:$section_tipo - parent:$parent - tipo:$tipo - lang:$lang </pre>";
		}

	}//end migrate_transcriptions



	/**
	* MIGRATE_INDEXATIONS
	* @return 
	*/
	public function migrate_indexations() {
		
		$strQuery 	= "SELECT * FROM indexacion_rel   "; //LIMIT 1500	// ORDER BY terminoID ASC
		$result 	= $this->mysqli->query($strQuery);	# or die("Cannot (1) execute query: $strQuery <br>\n". $this->mysqli->connect_error);			
		if (!$result) throw new Exception("Error Processing Request . ".$this->mysqli->connect_error, 1);				
		$ar_records = array();
		while ($row = $result->fetch_assoc()) {

			#dump($row, ' row ++ '.to_string());			
			$indexacionID 	= (int)$row['indexacionID'];
			$terminoID 		= (string)$row['terminoID'];

			$strQuery2 	= "SELECT * FROM indexacion WHERE indexacionID = $indexacionID ";
			$result2 	= $this->mysqli->query($strQuery2);
				
			$ar_locators=array();
			while ($row2 = $result2->fetch_assoc()) {
				#dump($row2, ' row2 ++ '.to_string());

				$section_tipo 	= 'rsc167';	// Fixed resources audiovisuals rsc167
				$section_id 	= $this->get_section_id_from_reelID( $row2['reelID'], DEDALO_ENTITY );	// section_id será igual a 	reelID

				$inverse_locators = $this->resolve_top_data($section_id, $section_tipo);		
				if (count($inverse_locators)!=1) {
					debug_log(__METHOD__." Skyped uncertain audiovisual record ($section_tipo,$section_id) because inverse_locators is different of 1 : ".to_string( count($inverse_locators) ), logger::WARNING);
					continue;	// Skyp uncertain audiovisual record
				}
				#dump($inverse_locators, ' inverse_locators ++ '.to_string());
				$top_data = reset($inverse_locators);
				$section_top_tipo 	= $top_data->section_tipo;	// Fixed oral history oh1
				$section_top_id 	= $top_data->section_id;	

				$component_tipo 	= "rsc36";	// Fixed audiovisual transcription rsc36
				$tag_id 			= (int)$row2['indexID'];

				$locator = new locator();
					$locator->set_section_top_tipo(	$section_top_tipo);
					$locator->set_section_top_id(	$section_top_id);
					$locator->set_section_tipo(		$section_tipo);		//$locator->terminoID = $terminoID;					
					$locator->set_section_id(		$section_id);		//$locator->reelID = $row2['reelID'];					
					$locator->set_component_tipo(	$component_tipo);
					$locator->set_tag_id(			$tag_id);

					#dump($locator, ' locator ++ '.to_string($terminoID));

				$ar_records[$terminoID][] = $locator;

			}//end while 2		

		}//end while 1
		#dump($ar_records, ' ar_records ++ '.to_string());

		foreach ($ar_records as $terminoID => $current_dato) {
			$tipo='index';
			$lang=DEDALO_DATA_NOLAN;
			$RecordObj_descriptors = new RecordObj_descriptors( $matrix_table='matrix_descriptors',
																$id=NULL,
																$parent=$terminoID,
																$lang,
																$tipo,
																$fallback=false);
				$RecordObj_descriptors->set_parent($terminoID);
				$RecordObj_descriptors->set_dato($current_dato);
				$RecordObj_descriptors->set_tipo($tipo);
				$RecordObj_descriptors->set_lang($lang);
				$RecordObj_descriptors->save_time_machine_version = false;
				$RecordObj_descriptors->Save();
					#dump($RecordObj_descriptors, ' RecordObj_descriptors ++ '.to_string($terminoID));

				$termino = RecordObj_ts::get_termino_by_tipo($terminoID);

				echo "<br> ".__METHOD__." <b>$terminoID</b> $termino [".count($current_dato)."] <pre>".json_encode($current_dato)."</pre>";

		}//end foreach ($ar_records as $current_tipo => $current_dato) 
	}#end migrate_indexations



	/**
	* GET_SECTION_ID_FROM_REELID
	* @return 
	*/
	public function get_section_id_from_reelID( $reelID, $dedalo_entity=null ) {
		switch ($dedalo_entity) {
			case 'mht':

				$section_id = $reelID;	// Default
				// Format:	v4  => v3
				$ar_map = array(					
							"3" => 7,
							"4" => 8,
							"5" => 3,
							"6" => 4,
							"7" => 5,
							"8" => 6,
							"31" => 33,
							"32" => 31,
							"33" => 32,
							"35" => 36,
							"36" => 35,
							"48" => 48,
							"49" => 49
							);
				foreach ($ar_map as $v4 => $v3) {
					if ($reelID==$v3) {
						$section_id = $v4;
						break;
					}
				}				
				break;
			
			default:
				$section_id = $reelID;
				break;
		}

		return (int)$section_id;
	}#end get_section_id_from_reelID



	/**
	* RESOLVE_TOP_DATA
	* @return 
	*/
	public function resolve_top_data( $section_id, $section_tipo ) {
		
		$section = section::get_instance($section_id, $section_tipo);
		$inverse_locators = $section->get_inverse_locators();

		return $inverse_locators;
	}#end resolve_top_data



	/**
	* GET_TABLE_RECORDS
	* Get all records of a MySQL D3 table
	* $conn = DBi::_getConnection()
	* @return 
	*/
	public function get_table_records( $table_name, $order=null, $limit=null ) {

		#
		# TABLE FIELDS INFO
			$strQuery 	= "DESCRIBE $table_name";
			$result 	= $this->mysqli->query($strQuery);	# or die("Cannot (1) execute query: $strQuery <br>\n". $this->mysqli->connect_error);

			$ar_fields = array();
			while ($row = $result->fetch_assoc()) {
				#dump($row, ' row ++ '.to_string());
				$ar_fields[] = $row['Field'];
			}
			#dump($ar_fields, ' ar_fields ++ '.to_string());
			#return array();


		#
		# AR_RECORDS
			$strQuery 	= "SELECT * FROM $table_name $order $limit";
			$result 	= $this->mysqli->query($strQuery);	# or die("Cannot (1) execute query: $strQuery <br>\n". $this->mysqli->connect_error);			
			if (!$result) throw new Exception("Error Processing Request . ".$this->mysqli->connect_error, 1);				
			$ar_records = array();
			while ($row = $result->fetch_assoc()) {
				#dump($row, ' row ++ '.to_string());
				$ar_records[] = $row;
			}			
			#dump($ar_records, 'ar_records', array());

		return $ar_records;

		# Close MySQL connection
		#$result->close();
	}#end get_table_records



	/**
	* GET_MAINLANG
	* @return string | null $mainLang
	*/
	public function get_mainLang( $prefix ) {
		
		$mainLang = null;
		$prefix   = strtoupper($prefix);
		
		
		# COGIENDO EL DATO DE TABLA JERARQUIA EN DEDALO 4
		$sql 	= ' SELECT "mainLang" FROM "jerarquia" WHERE alpha2 ILIKE \''.$prefix.'\' LIMIT 1 ';		
		$result = pg_query(DBi::_getConnection(), $sql);		
		while ($row = pg_fetch_array($result)) {
			$mainLang = $row['mainLang'];
		}
		if (empty($mainLang)) {
			echo "ERROR: La tabla 'jerarquia' en D4 no tiene este prefijo activado ($prefix). Por favor, dalo de alta antes de importar esta tabla (jer_".strtolower($prefijo).")";
			dump($sql, ' sql ++ '.to_string());
			die();
		}


		# COGIENDO EL DATO DE TABLA JERARQUIA EN DEDALO 3
		$strQuery 	= ' SELECT `mainLang` FROM jerarquia WHERE alpha2 LIKE \''.$prefix.'\' LIMIT 1 ';
		$result 	= $this->mysqli->query($strQuery);	# or die("Cannot (1) execute query: $strQuery <br>\n". $this->mysqli->connect_error);
		$ar_fields = array();
		while ($row = $result->fetch_assoc()) {
			$mainLang = $row['mainLang'];
		}

		#ump($mainLang, ' mainLang ++ '.to_string()); exit();
		return $mainLang;

	}#end get_mainLang



	/**
	* GET_RELACIONES
	* @return 
	*/
	public function get_relaciones( $terminoID ) {

		$relaciones = '';
		
		$strQuery 	= "SELECT * FROM descriptors_rel WHERE terminoID = '$terminoID' OR terminoID2 = '$terminoID' ";	//LIMIT 300
		$result 	= $this->mysqli->query($strQuery);
		if(!$result) {
				dump($strQuery, ' strQuery ++ '.to_string());
			throw new Exception("Error Processing Request. connect_error:  ".$this->mysqli->connect_error, 1);
		}
		$ar_relaciones = array();
		while ($row = $result->fetch_assoc()) {

			$current_terminoID  = $row['terminoID'];
			$current_terminoID2 = $row['terminoID2'];

			if ($current_terminoID!=$terminoID) {
				$related_term = $current_terminoID;
			}else if($current_terminoID2!=$terminoID) {
				$related_term = $current_terminoID2;
			}
			if(!isset($related_term)) continue;

			// Formato : [{"dd6":"mupreva756"},{"dd9":"mupreva758"}]
			// En principio, el modelo siempre estará vacío ya que no se usa en el tesauro y además el formato cambiará en el futuro
			$ar_relaciones[] = $related_term;
		}

		if (!empty($ar_relaciones)) {
			$relaciones = $ar_relaciones;	
			#$relaciones = json_decode($relaciones);
			#dump($relaciones, ' relaciones ++ '.to_string());
		}		
		
		return $relaciones;
	}#end get_relaciones



	/**
	* MIGRATE_TS_TABLE
	* Transfiere los datos de la tabla v3 a la tabla v4. Borra la tabla y datos existentes en D4 antes de transferir
	* @param string $source_table like 'jer_aa' 
	*/
	public function migrate_ts_table( $source_table, $reference_table='jer_ts' ) {

		echo "<hr> ".__METHOD__." source_table: <b>$source_table</b> <br>";

		if($source_table==$reference_table) {
			$reference_table='jer_es';
		}

		#
		# CALCULATE MAINLANG FROM JERARQUIAS
		$prefix = substr($source_table, 4);
		$mainLang = $this->get_mainLang($prefix);
		if(empty($mainLang)) throw new Exception("Error Processing Request. mainlang not found. prefix:$prefix ", 1);
		#dump($mainLang, ' $mainLang ++ '.to_string($sql)); die();

		#
		# POSTGRESQL ADD TABLE
		$sql = "
		DROP TABLE IF EXISTS {$source_table} ;		
		CREATE TABLE IF NOT EXISTS {$source_table} (LIKE {$reference_table} INCLUDING INDEXES INCLUDING DEFAULTS);
		DROP SEQUENCE IF EXISTS {$source_table}_id_seq ;
		CREATE SEQUENCE public.{$source_table}_id_seq;
		-- ALTER SEQUENCE public.{$source_table}_id_seq  OWNER TO postgres;
		ALTER TABLE {$source_table} ALTER COLUMN id SET DEFAULT nextval('{$source_table}_id_seq'::regclass);
		-- DELETE FROM {$source_table};
   		";
   		$result = pg_query(DBi::_getConnection(), $sql);
   			//dump($resul, ' resul ++ '.to_string($sql)); //return;

		$strQuery 	= "SELECT * FROM $source_table ORDER BY terminoID ASC ";	//LIMIT 300
		$result 	= $this->mysqli->query($strQuery);
		if(!$result) {
			echo "ERROR: la tabla $source_table no existe ";
			return false;
			#throw new Exception("Error Processing Request . ".$this->mysqli->connect_error, 1);
		}
		$ar_records = array();
		while ($row = $result->fetch_assoc()) {

			#
			# D3
			$autoIncrement	= $row['autoIncrement'];
			$tld 			= $row['tld'];
			$terminoID 		= $row['terminoID'];
			$parent 		= $row['parent'];
			$modelo 		= $row['modelo'];
			$esmodelo 		= $row['esmodelo'];
			$esdescriptor 	= $row['esdescriptor'];
			$visible 		= $row['visible'];
			$norden 		= $row['norden'];
			$usableIndex 	= $row['usableIndex'];
			$obs 			= $row['obs'];

			#
			# RELACIONES . Las relaciones están en D3 en una tabla separada (descriptors_rel)
			$relaciones 	= $this->get_relaciones($terminoID);


			#
			# D4
			$RecordObj_ts = new RecordObj_ts($terminoID);			

				$RecordObj_ts->set_ID($autoIncrement);
				$RecordObj_ts->set_terminoID($terminoID);
				$RecordObj_ts->set_parent($parent);
				$RecordObj_ts->set_modelo($modelo);
				$RecordObj_ts->set_esmodelo($esmodelo);
				$RecordObj_ts->set_esdescriptor($esdescriptor);
				$RecordObj_ts->set_visible($visible);
				$RecordObj_ts->set_norden($norden);
				$RecordObj_ts->set_usableIndex($usableIndex);

				if(!empty($relaciones))	$RecordObj_ts->set_relaciones($relaciones);

				$RecordObj_ts->set_force_insert_on_save(true); 

				#dump($RecordObj_ts, ' RecordObj_ts ++ '.to_string($terminoID));
				$RecordObj_ts->Save();


			#
			# OBS Está en jer_xx y pasa a descriptors como 'obs' en el lenguaje principal
			if (!empty($obs)) {				
				$tipo = 'obs';
				$dato = $obs;
				$RecordObj_descriptors = new RecordObj_descriptors( $matrix_table='matrix_descriptors',
																	$current_id=NULL,
																	$current_parent=$terminoID,
																	$mainLang,
																	$tipo,
																	$fallback=false);
				$RecordObj_descriptors->set_parent($terminoID);
				$RecordObj_descriptors->set_dato($dato);
				$RecordObj_descriptors->set_tipo($tipo);
				$RecordObj_descriptors->set_lang($mainLang);
				$RecordObj_descriptors->save_time_machine_version = false;
				$RecordObj_descriptors->Save();			
			}

				
			echo "<br> Saved {$source_table}: $terminoID";
			if(!empty($relaciones)) {
				echo " - [TR]: ".to_string($relaciones);
			}
		}		
	}#end migrate_ts_table



	/**
	* MIGRATE_DESCRIPTORS_TABLE
	* Se puede importar tantas veces como haga falta. Los registros existentes se actualizan y los que no existen se crean
	* @param string $prefix Like 'aa' 
	*/
	public function migrate_descriptors_table( $prefix ) {
		
		echo "<hr> ".__METHOD__." prefix: <b>$prefix</b> <br>";

		// "DELETE FROM "matrix_descriptors" WHERE "parent" LIKE 'ts%';"

		$sql 		= "SELECT * FROM descriptors WHERE terminoID LIKE '$prefix%' ORDER BY terminoID ASC ";	//LIMIT 300
		$result 	= $this->mysqli->query($sql); if(!$result) throw new Exception("Error Processing Request . ".$this->mysqli->connect_error, 1);
		$ar_records = array();
		while ($row = $result->fetch_assoc()) {

			#dump($row, ' row ++ '.to_string($sql));
			$terminoID 	= $row['terminoID'];
			$termino 	= $row['termino'];
			$def 		= $row['def'];
			$lang 		= $row['lang'];
			$geolocalizacion = isset($row['geolocalizacion']) ? $row['geolocalizacion'] : null;
			$tiempo 		 = isset($row['tiempo']) ? $row['tiempo'] : null;
			
			#
			# DESCRIPTORS 'termino'
			$ar_tipos = array('termino','def','geolocalizacion','tiempo');

			$current_lang = $lang;

			foreach ($ar_tipos as $tipo) {				

				switch ($tipo) {
					case 'termino':
						$dato = $termino;
						break;
					case 'def':
						$dato = $def;
						break;
					case 'geolocalizacion':
						$dato = $geolocalizacion;
						break;
					case 'tiempo':
						$dato = $tiempo;
						break;
					case 'index':
						$current_lang = DEDALO_DATA_NOLAN;
						break;
				}

				if(empty($dato)) continue;	// Skip empty values

				$RecordObj_descriptors = new RecordObj_descriptors( $matrix_table='matrix_descriptors',
																	$id=NULL,
																	$parent=$terminoID,
																	$current_lang,
																	$tipo,
																	$fallback=false);
				$RecordObj_descriptors->set_parent($terminoID);
				$RecordObj_descriptors->set_dato($dato);
				$RecordObj_descriptors->set_tipo($tipo);
				$RecordObj_descriptors->set_lang($current_lang);
				$RecordObj_descriptors->save_time_machine_version = false;
				$RecordObj_descriptors->Save();
					#dump($RecordObj_descriptors, ' RecordObj_descriptors ++ '.to_string($terminoID));

				echo "<br> Migrated descriptors $prefix ($tipo) $terminoID : <b>$termino</b> [$lang] ";

			}//end foreach ($ar_tipos as $tipo)

		}//end while ($row = $result->fetch_assoc())
	}#end migrate_descriptors_table



	/**
	* MIGRATE_TESAURUS_COMPLETE
	* @return 
	*/
	public function migrate_tesaurus_complete( $request_options ) {

		$response = new stdClass();
				$response->result 	= false;
				$response->msg 		= '';

		$options = new stdClass();
			$options->ar_tables = array();
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}


		/* JERARQUIA_TIPOS MHT
		INSERT INTO "jerarquia_tipos" ("nombre", "orden") VALUES ('Descriptores antropológicos', '5');
		INSERT INTO "jerarquia_tipos" ("nombre", "orden") VALUES ('Descriptores históricos', '6');
		INSERT INTO "jerarquia_tipos" ("nombre", "orden") VALUES ('Otros', '7');
		*/
		
		/* JERARQUIA MHT
		INSERT INTO "jerarquia" ("alpha3", "alpha2", "nombre", "tipo", "activa", "mainLang") VALUES ('AAA', 'AA', 'Antropología social', '5', 'si', 'lg-spa');
		INSERT INTO "jerarquia" ("alpha3", "alpha2", "nombre", "tipo", "activa", "mainLang") VALUES ('PHP', 'HP', 'Periodos historico-políticos', '6', 'si', 'lg-spa');
		INSERT INTO "jerarquia" ("alpha3", "alpha2", "nombre", "tipo", "activa", "mainLang") VALUES ('RTD', 'RT', 'Restricted', '7', 'si', 'lg-spa');
		*/

		#
		# TS TABLES AND DESCRIPTORS
		$msg=array();		
		foreach((array)$options->ar_tables as $prefix) {

			# Delete and create target tables
			$this->migrate_ts_table('jer_'.$prefix);

			# Create / update descriptors in all langs
			$this->migrate_descriptors_table( $prefix );

			$msg[] = "Updated terms and descriptors of table $prefix ";
		}
		
		if (!empty($msg)) {
			$response->result = true;
			$response->msg    = implode("<br>",$msg);
		}
		
		#
		# INDEXATIONS
		#$migratev3v4->migrate_indexations();

		#$migratev3v4->get_table_records( $table_name='captaciones', $mysqli );
		#$migratev3v4->migrate_captures();
		
		
		return (object)$response;
		
	}#end migrate_tesaurus_complete



	/**
	* __DESTRUCT
	* @return 
	*/
	public function __destruct() {

		# Close MySQL connection
		$this->mysqli->close();

	}#end __destruct



};
?>