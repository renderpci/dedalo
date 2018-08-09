<?php
/*
* CLASS FILEMAKER_SYNC
* Gestiona los sincronismos y actualizaciones entre Flemaker Server (En MUPREVA) y Dédalo 4 en CentOS
*/
require_once( dirname(dirname(dirname(__FILE__))) .'/render/filemaker_connector/class.filemaker_connector.php' );
require_once( DEDALO_LIB_BASE_PATH . '/diffusion/class.diffusion_mysql.php' );


class filemaker_sync {


	public $tables_map ;


	function __construct() {
		$this->setup();
	}



	/**
	* SETUP
	*/
	function setup() {
		
		require_once('set_up_vars.php');
	}//end setup



	/**
	* GET_FILEMAKER_SET
	* @return 
	*/
	public function get_filemaker_set( $data, $offset=0, $max=10, $set_mode='pages' ) {
		$response = new stdClass();
		$start_time=microtime(1);

		$database 	= $data->database;	# Like 'Tesauros'
		$FM_table 	= $data->table;		# Like 'Location'
		$layout 	= $data->layout;	# Like 'web-Location'
		
		switch ($set_mode) {
			case 'pages':

				# Database connector
					$fm = filemaker_connector::_getConnection_fm( $database );

				# Request
					$request = $fm->newFindAllCommand($layout); // Find all records
					#$request->setRange($offset, $max);			// Limit result by offset / max
					$request->setRange(0, 1);					// Limit result by offset / max
					$request->addSortRule('ID', 1, FILEMAKER_SORT_ASCEND);
					$result = $request->execute();				// Exec request to filemaker

					# Check for an error
					if (FileMaker::isError($result)) {
						$response->result = false;
						$response->msg 	  = "FM Error: " . $result->getMessage();
						return $response;
					}
							/*
							# Store the matching records (is non associative array)
							$records = (array)$result->getRecords();
							#dump($records,'records');die();

							# Retrieve and store first record
							# $record = $records[0];

							# Field, get specific field from current record
							# $persona =  $record->getField('id');
							*/

				# Records . Get the found records and setup page navigation links
					$records 	= $result->getRecords();		// Array of fm records		
					$found 		= $result->getFoundSetCount();	// Number of records found
					$fetchcount = $result->getFetchCount();		// Number of records returned in this request

						#dump($found, 'found'); #dump($fetchcount, 'fetchcount'); #dump($n, 'n'); #die();

				$pages = ceil( $found / $max );
					#dump($pages, ' pages $found:'.$found);

				echo "<br>Total: $found records ";
				echo "<br>Fetch: $fetchcount records ";
				echo "<br>Pages: $pages <hr>";

				$lines=array();
				for ($i=1; $i <=$pages ; $i++) {
					$c_offset = ($i-1)*$max;
					$line  = '';
					$line .= " Page $i ";	// 'http://'.DEDALO_HOST. 
					$url   = DEDALO_ROOT_WEB.'/lib/dedalo/extras/mupreva/filemaker_sync/trigger.filemaker_sync.php?';
					$url  .= 'mode=import_all&data={"database":"'.$database.'","table":"'.$FM_table.'","layout":"'.$layout.'","offset":"'.$c_offset.'","max":"'.$max.'","set_mode":"import"}';
					$line .= "<a href=\"". htmlentities($url) ."\" target=\"_blank\" > $url </a> ";
					$lines[] = $line;
				}
				echo implode('<hr>', $lines);

				$response->result = true;
				$response->msg 	  = "Ok $pages pages / links found ($max records per page) Total records: $found";
				return $response;

				break;
		
		case 'import':	
				
				# Database connector
					$fm = filemaker_connector::_getConnection_fm( $database );

				# Request
					$request = $fm->newFindAllCommand($layout); // Find all records
					$request->setRange($offset, $max);			// Limit result by offset / max
					$request->addSortRule('ID', 1, FILEMAKER_SORT_ASCEND);
					$result = $request->execute();				// Exec request to filemaker

					# Check for an error
					if (FileMaker::isError($result)) {
						$response->result = false;
						$response->msg 	  = "FM Error: " . $result->getMessage();
						return $response;
					}

				# Records . Get the found records and setup page navigation links
					$records 	= (array)$result->getRecords();		// Array of fm records
						#dump(count($records), 'count($records)');


				foreach ($records as $key => $current_record) {
					$sub_start_time=microtime(1);
					# Override data-id (section_id)
					$data->id = $current_record->getField('ID');
					# Update
					$this->update_dedalo_section( $data );
						#dump($data, ' data');
					$total_time   = round(microtime(1)-$sub_start_time,3);
					$memory_usage = tools::get_memory_usage(false);
					echo "<hr><b>$data->id  updated section_id </b><br>ms:$total_time , memory_usage:$memory_usage ".to_string($data);
				}
				# Total
				$total_time   = round(microtime(1)-$start_time,3);
				$memory_usage = tools::get_memory_usage(false);
				echo "<hr><b>Total</b><br>ms:$total_time , memory_usage:$memory_usage ".to_string($data);
				break;
		}	
	}//end get_filemaker_set



	/**
	* GET_FILEMAKER_RECORD
	* Perform a FileMaker record search by ID
	* @param string $database
	* @param string $layout
	* @param int $section_id (equivalent to FM ID)
	* @return object $response ( bool $response->result, string $response->msg )
	*/
	public function get_filemaker_record( $database, $layout, $section_id ) {
		$response = new stdclass();

		# Database connector
		$fm = filemaker_connector::_getConnection_fm( $database );

		# Create the 'find' command and specify the layout (from received data)
		$findCommand = $fm->newFindCommand( $layout );		

		# Add the find criterion to FM find
		$findCommand->addFindCriterion('ID', $section_id);

		# Only 1 record
		$findCommand->setRange(0, 1);
		
		# Perform the find and store the result
		$result = $findCommand->execute();


		# Check for an error
		if (FileMaker::isError($result)) {
			$response->result = false;
			$response->msg 	  = "FM Error: " . $result->getMessage();
			return $response;
		}
		
		# Store the matching records (is non associative array)
		$records = (array)$result->getRecords();

		$response->result = $records;
		$response->msg 	  = "Ok, request done";

		return $response;
	}//end get_filemaker_record



	/**
	* GET_FILEMAKER_ALL_RECORDS
	* Perform a FileMaker record search by layout
	* @param string $database
	* @param string $layout
	* @return object $response ( bool $response->result, string $response->msg )
	*/
	public function get_filemaker_all_records( $database, $layout ) {
		$response = new stdclass();

		# Database connector
		$fm = filemaker_connector::_getConnection_fm( $database );

		# Create the 'find' command and specify the layout (from received data)
		$findCommand = $fm->newFindAllCommand( $layout );
		
		# Perform the find and store the result
		$result = $findCommand->execute();


		# Check for an error
		if (FileMaker::isError($result)) {
			$response->result = false;
			$response->msg 	  = "FM Error: " . $result->getMessage();
			return $response;
		}
		
		# Store the matching records (is non associative array)
		$records = (array)$result->getRecords();

		$response->result = $records;
		$response->msg 	  = "Ok, request done";

		return $response;
	}//end get_filemaker_all_records



	/**
	* UPDATE_DEDALO_SECTION
	* Sync Filemaker to Dédalo only one record
	* @param object $data
	* @return object $response 
	*				bool $response->result
	*				string $response->msg
	*/
	function update_dedalo_section( $data ) {
		# Set special php global options
		ob_implicit_flush(true);
		set_time_limit ( 3200000 );		
		logger_backend_activity::$enable_log = false;	# Disable logging activity and time machine # !IMPORTANT
		#RecordObj_time_machine::$save_time_machine_version = false; # Disable logging activity and time machine # !IMPORTANT

		global $rest_config;
		$start_time=microtime(1);

		$response = new stdClass();

		$database 	= $data->database;	# Like 'Tesauros'
		$FM_table 	= $data->table;		# Like 'Location'
		$layout 	= $data->layout;	# Like 'web-Location'
		$section_id	= $data->id;		# Like '53'


		#
		# DATA VARS VERIFICATION
		#
			if (!property_exists($this->tables_map, $database)) {
				$response->result = false;
				$response->msg 	  = "Error. Database $database not exists in var tables_map";				
				debug_log(__METHOD__."  ".to_string($response), logger::ERROR);
				return $response;
			}
			if (!property_exists($this->tables_map->$database->$FM_table, 'FM_layout')) {
				$response->result = false;
				$response->msg 	  = "Error. Layout property 'FM_layout' not defined in current var tables_map $database";
				debug_log(__METHOD__."  ".to_string($response), logger::ERROR);
				return $response;
			}
			if ($this->tables_map->$database->$FM_table->FM_layout != $layout) {
				$response->result = false;
				$response->msg 	  = "Error. Layout data inconsistency ($layout) in current var tables_map $database. (".$this->tables_map->$database->$FM_table->FM_layout." != $layout)";
				debug_log(__METHOD__."  ".to_string($response), logger::ERROR);
				return $response;
			}
			if (empty($section_id)) {
				$response->result = false;
				$response->msg 	  = "Error. id not exists in var data";
				debug_log(__METHOD__."  ".to_string($response), logger::ERROR);
				return $response;
			}


		# Current table map (select apropiate table object from this tables map) ..
		$current_table_map = $this->tables_map->$database->$FM_table;
			#dump($current_table_map, ' current_table_map');

		#
		# DEDALO4 LOGIN
		# Is confgigurated in Dédalo preferences (config_db). Remember set user permissions to access current section and fields
		#
			$dedalo_login = (object)filemaker_sync::dedalo_login();
			if (!$dedalo_login->logged) {
				$response->logged = false;		
				$response->msg 	  = "Dedalo Error: " . $dedalo_login->msg;
				return $response;
			}	

		#
		# FILEMAKER CONNECTOR GET DATA
		# Connection to Filemaker server via filemaker_connector lib. Usually 192.168.105.11
		#
			switch ($section_id) {
				case 'all': // Get all records from current layout
					$filemaker_record = $this->get_filemaker_all_records($database, $layout);
					break;
				default:	// Get one record (by id) from current layout
					$filemaker_record = $this->get_filemaker_record( $database, $layout, $section_id );
			}
			
			if (!$filemaker_record->result) {
				$response->result = false;
				$response->msg 	  = $filemaker_record->msg;
				return $response;
			}
			$records = $filemaker_record->result;
			#if(SHOW_DEBUG===true) {
				#dump( $filemaker_record, ' filemaker_record'); die();
				#dump($records, ' records'); die();
			#}


		#
		# RECORDS ITERATION
		#
			# SECTION_TIPO
			$section_tipo = $current_table_map->fields->section_tipo;			

			
			# Iterate records found
			$ar_section_id=array();
			foreach ($records as $current_key => $current_record) { // Normalmente habrá sólo 1, pero preparamos el 'multi'

				$start_time_record=microtime(1);

				if(SHOW_DEBUG===true) {
					#dump($current_record, ' current_record');
					#dump($current_record->_impl->_fields['ID'][0], ' var ID '); //->_fields->ID[0]
					#die();
				}


				# Cogemos el section ID del registro actual de FileMaker.
				# En mono registro debe coincidir con el pasado en options
				if (empty($current_record->_impl->_fields['ID'][0])) {					
					debug_log(__METHOD__." Ignored record without Filemaker field 'ID' found. Please review current Filemaker layout. ".to_string(), logger::DEBUG);
					continue;
				}
				$section_id = $current_record->_impl->_fields['ID'][0];
			


				# Modo one record
				#
				# SECTION_ID
				# Normalmente se pasa el section_id que correspode con el id de filemaker, pero en casos como los items de digital, se pasa el código (ej. 1-1) como id
				# y debemos resolverlo previmente para poder actualizar en Dédalo. 
				# Para identificar estos casos, se fijará 'search' como valor del section_id en el map del set_up_vars
				if ( is_array($current_table_map->fields->section_id) && isset($current_table_map->fields->section_id['search']) ) {
					#dump($section_id,'$section_id');
					# Se ha pasado el código, tipo '1-1'. Hay que despejar el section_id a partir de él. (caso de items de digital, etc..)
					$codigo 		= $section_id;
					$component_tipo = $current_table_map->fields->section_id['search'];
					if (strpos($codigo, '-')===false) {
						throw new Exception("Error Processing Request. Bad format of codigo. Expected string like '1-1' and received int ($codigo) ", 1);					
					}
					$section_id = (int)$this->get_section_id_from_codigo( $codigo, $section_tipo, $component_tipo );
					if ($section_id<1) {
						#throw new Exception("Error Processing Request. Not found 'section_id' in section '$section_tipo' with 'código' : $codigo ", 1);
						$section = section::get_instance(null, $section_tipo);
						$section_id = $section->Save();
						#dump($current_section_id,'$current_section_id');
						#continue;
					}
				}else{
					# Se pasa el section_id directamente, caso habitual
					$section_id = (int)$section_id;
				}
				if (strpos($section_id, '-')!==false) { // para detectar posibles errores en la configuración del set_up_vars
					throw new Exception("Error Processing Request. Bad format of section_id. Expected int and received string ($section_id) ", 1);					
				}
				$current_section_id = (int)$section_id;
				#dump($section_id, '$current_table_map->fields , codigo: '.$codigo); continue; //die();				


				#
				# Force create section record if not exits
				$section = section::get_instance($current_section_id, $section_tipo);
				$forced_create_record = $section->forced_create_record();



				# Iterate fields
				foreach ($current_table_map->fields as $component_tipo => $FM_field) {

					#dump($FM_field, ' FM_field ++ $component_tipo: '.to_string($component_tipo));

					# Skip some general fields
					if($component_tipo =="section_id" || $component_tipo == "section_tipo") continue;

					$current_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
					# FM fields defined as array in table map are translatables, others not
					if(!is_array($FM_field)){

						# DEDALO_DATA_NOLAN (NON TRANSLATABLE ELEMENTS)			
						$lang = DEDALO_DATA_NOLAN;
						$current_component  	= component_common::get_instance($current_modelo_name,
																				 $component_tipo,
																				 $current_section_id,
																				 'list',
																				 $lang,
																				 $section_tipo);
						$dato_actual_en_dedalo 	= $current_component->get_dato();
						
						$FM_dato = $current_record->getField($FM_field); 
							#dump($FM_dato, ' FM_dato '.$current_modelo_name.' - '.$component_tipo);

						$dato = $this->get_dato_resolved($current_component, $FM_dato);
						
						#
						# PORTALIZE OPTIONS (BEFORE SAVE COMPONENT IMPORTANT)
						#dump($this->tables_map->$database->$FM_table->portalize, '$this->tables_map->$database->$FM_table->portalize');
						if ( property_exists($this->tables_map->$database->$FM_table, 'portalize') &&
							 property_exists($this->tables_map->$database->$FM_table->portalize, $FM_field)
							) {
							
							$obj_map = $this->tables_map->$database->$FM_table->portalize->$FM_field;

							#
							# REMOVE_REFERENCE : remove old portal reference if exist
							$this->remove_reference( $obj_map, $current_section_id, $section_tipo, $dato_actual_en_dedalo, $dato, $FM_field );

							#
							# PORTALIZE REFERENCES (USE BEFORE SAVE : IMPORTANT)
							# Solve inverses and store pointers in adequate portals for recovery speed in some fields
							$this->portalize_references( $obj_map, $current_section_id, $section_tipo, $FM_dato, $FM_field );							
						}//end if (property_exists($this->tables_map->$database->$FM_table->portalize, 'portalize'))

						$start_time=microtime(1);

						# For speed, dissable update_diffusion_info_propagate_changes on save
						$current_component->set_update_diffusion_info_propagate_changes(false);						
						
						$current_component->set_dato($dato);
						$current_component->Save();

						$total_time_ms = exec_time_unit($start_time,'ms');
						
						#debug_log(__METHOD__." Saved $FM_field $current_modelo_name $component_tipo ($section_tipo,$current_section_id,$lang) FM_dato:$FM_dato ,".to_string($dato), logger::ERROR);
						#error_log(__METHOD__." $total_time_ms >[1] Saved $FM_field $current_modelo_name $component_tipo ($section_tipo,$current_section_id,$lang) FM_dato:$FM_dato ,".to_string($dato));							

					}else{

						# LANGS (TRANSLATABLE ELEMENTS)
						foreach ($FM_field as $lang => $FM_field2) {

							$current_component = component_common::get_instance($current_modelo_name,
																				$component_tipo,
																				$current_section_id,
																				'list',
																				$lang,
																				$section_tipo);
							
							$FM_dato = $current_record->getField($FM_field2);
							$dato 	 = $this->get_dato_resolved($current_component, $FM_dato);

							$start_time=microtime(1);

							# For speed, dissable update_diffusion_info_propagate_changes on save
							$current_component->set_update_diffusion_info_propagate_changes(false);						

							$current_component->set_dato($dato);
							$current_component->Save();

							$total_time_ms = exec_time_unit($start_time,'ms');				
							#debug_log(__METHOD__." Saved $FM_field2 $current_modelo_name $component_tipo ($section_tipo,$current_section_id,$lang) ".to_string($dato), logger::DEBUG);
							#error_log(__METHOD__." $total_time_ms >[2] Saved $FM_field2 $current_modelo_name $component_tipo ($section_tipo,$current_section_id,$lang) ".to_string($dato));
						}
					}				

				}//end foreach ($current_table_map->fields as $component_tipo => $FM_field) 
		  		
		  		# FM RELATEDSETS (FILEMAKER PORTALS)
		  		if(property_exists($this->tables_map->$database->$FM_table, 'geolocation')) {
		  			foreach ($current_table_map->geolocation as $component_tipo => $FM_geo) {
		  				$current_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
		  			# LANGS (TRANSLATABLE ELEMENTS)
		  				$dato = new stdclass();

						foreach ($FM_geo as $geo => $FM_field) {
							$FM_dato 	= $current_record->getField($FM_field);
							$dato_fm	= $this->get_dato_resolved($current_component, $FM_dato);
							$dato->$geo = $dato_fm;				
					
						}
						$dato->zoom = 16;
						$current_component = component_common::get_instance($current_modelo_name,
																			$component_tipo,
																			$current_section_id,
																			'list',
																			DEDALO_DATA_NOLAN,
																			$section_tipo);
						$current_component->set_dato($dato);
						$current_component->Save();
						debug_log(__METHOD__." Saved $FM_field $current_modelo_name $component_tipo ($section_tipo,$current_section_id,$geo) ".to_string($dato), logger::DEBUG);						
					}
		  		}

		  		#
		  		# FM RELATEDSETS (FILEMAKER PORTALS)
		  		if(property_exists($this->tables_map->$database->$FM_table, 'relatedSets')) {

		  			foreach ($current_table_map->relatedSets as $component_tipo => $FM_portal) {

		  				$relatedSets_name  = key($FM_portal);
		  				$relatedSets_value = reset($FM_portal);

		  				$relatedRecordsArray = $current_record->getRelatedSet( $relatedSets_name );
		  					#dump($relatedRecordsArray,'$relatedRecordsArray');  #dump($current_record, ' current_record '. "$relatedSets_name - $relatedSets_value");

		  				# Check for an error
						if (FileMaker::isError($relatedRecordsArray)) {
							if (strpos($relatedRecordsArray->getMessage(), 'not present')!==false) {
								# Empty portal (in FM is treated as error..)
								echo "Empty portal section_id $current_section_id (FM msg: ".$relatedRecordsArray->getMessage().")";
								debug_log(__METHOD__." FM ERROR on relatedRecordsArray  ".$relatedRecordsArray->getMessage(), logger::ERROR);
								continue;
							}
							/*
							$response->result = false;
							$response->msg 	  = "FM Error: ($current_section_id) " . $relatedRecordsArray->getMessage(); 	#dump($response, ' response');
							echo to_string($response);
							//return $response;
							continue;
							*/
						}

							#dump($relatedSets_name, '$relatedSets_name - relatedSets_value:'.$relatedSets_value);
							#dump($relatedSets_name.'::'.$relatedSets_value, '');

		  				$FM_dato = array();
		  				foreach ($relatedRecordsArray as $key => $value) {	

		  					$FM_dato[] = $value->getField( $relatedSets_name.'::'.$relatedSets_value );
		  					#dump($current_record, ' current_record ');
		  					#dump($value, ' value '.$key);		  					
		  				}
		  				#dump($FM_dato,'$FM_dato '.$relatedSets_name.'::'.$relatedSets_value );
		  				
		  				$lang 				 = DEDALO_DATA_NOLAN;
						$current_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
						$current_component   = component_common::get_instance($current_modelo_name,
																			  $component_tipo,
																			  $current_section_id,
																			  'list',
																			  $lang, $section_tipo);
						
						$dato = $this->get_dato_resolved($current_component, $FM_dato);
							#dump($dato, ' dato ++ '.to_string());
		  				
		  				$current_component->set_dato($dato);
						$current_component->Save();
		  			}
		  		}//end if(property_exists($this->tables_map->$database->$FM_table, 'relatedSets'))


		  		#
		  		# FILTER always is saved
		  		# Saves filter and updates diffusion_info_propagate_changes
				$current_component_filter = component_common::get_instance('component_filter',
																			key($current_table_map->filter),
																			$current_section_id,
																			'edit', // Note that filter is called in edit mode to force diffusion_info_propagate_changes on save only once for section
																			DEDALO_DATA_NOLAN,
																			$section_tipo);
				$current_component_filter->set_dato(reset($current_table_map->filter));
				$current_component_filter->Save();

				$ar_section_id[] = $current_section_id;

				// Sleep 65 ms
				usleep(10000);
				$total_time_ms = exec_time_unit($start_time_record,'ms');
				error_log(__METHOD__." section_id: $section_id is updated on Dedalo db in $total_time_ms ms");

			}//end foreach ($records as $current_record)


		#
		# MYSQL PUBLICATION UPDATE
		# Send array with all records
		# Iterate again found records and update MySQL records
			self::publish_mysql($ar_section_id, $section_tipo);
			/*
				try {

					$diffusion_class = new diffusion_mysql();		
					# Split big arrays into small chunks to save to mysql
					#$ar_section_id_chunk = (array)array_chunk($ar_section_id, 500, true);
					#foreach ($ar_section_id_chunk as $current_ar_section_id) {
					foreach ($ar_section_id as $current_ar_section_id) {
						
						foreach ((array)$current_ar_section_id as $current_section_id) {
							$options = new stdClass();
								$options->section_tipo  		 = (string)$section_tipo;
								$options->section_id    		 = (int)$current_section_id;
								$options->diffusion_element_tipo = (string)'mupreva800'; // Web MUPREVA  (MySQL)

							$result = $diffusion_class->update_record( $options, $resolve_references=true );						
								#dump($result, " result ".to_string($options) );
								#error_log( count($current_ar_section_id) );
						}					

					}//end foreach ($ar_section_id_chunk as $current_ar_section_id) {
					
				} catch (Exception $e) {
				    $msg = 'ERROR ON diffusion_mupreva_web update_record: Caught exception: '. $e->getMessage(). "\n";
				    debug_log(__METHOD__." $msg ".to_string(), logger::ERROR);
				    echo $msg;
				}		
				*/
		
		$total_time   = round(microtime(1)-$start_time,3);
		$memory_usage = tools::get_memory_usage(false);

		$response->result = true;
		$response->msg 	  = "\nOk. Updated record $section_id Database $database by Dedalo user $rest_config->user. Records saved: ".count($records)." with fields:". count($current_table_map->fields)." Time: $total_time sec. Memory: $memory_usage";
		
		# Re-Enable logging activity and time machine # !IMPORTANT
		logger_backend_activity::$enable_log = true;
		#RecordObj_time_machine::$save_time_machine_version = true;

		return (object)$response;
	}//end update_dedalo_section



	/**
	* PUBLISH_MYSQL
	* Save on MySQL 
	*/
	public static function publish_mysql( $ar_section_id, $section_tipo ) {

		$start_time=microtime(1);

		try {
			$diffusion_class = new diffusion_mysql();		
			# Split big arrays into small chunks to save to mysql
			#$ar_section_id_chunk = (array)array_chunk($ar_section_id, 500, true);
			#foreach ($ar_section_id_chunk as $current_ar_section_id) {
			foreach ($ar_section_id as $current_ar_section_id) {
				
				foreach ((array)$current_ar_section_id as $current_section_id) {
					$options = new stdClass();
						$options->section_tipo  		 = (string)$section_tipo;
						$options->section_id    		 = (int)$current_section_id;
						$options->diffusion_element_tipo = (string)'mupreva800'; // Web MUPREVA  (MySQL)

					$result = $diffusion_class->update_record( $options, $resolve_references=true );
						#dump($result, " result ".to_string($options) );
						#error_log( count($current_ar_section_id) );
				}					

			}//end foreach ($ar_section_id_chunk as $current_ar_section_id) {
				
		} catch (Exception $e) {
		    $msg = 'ERROR ON diffusion_mupreva_web update_record: Caught exception: '. $e->getMessage(). "\n";
		    debug_log(__METHOD__." $msg ".to_string(), logger::ERROR);
		    echo $msg;
		}

		$total_time_ms = exec_time_unit($start_time,'ms');
		#error_log(__METHOD__." $total_time_ms >[3] publish_mysql ($section_tipo) ".to_string($ar_section_id));

	}//end publish_mysql



	/**
	* REMOVE_REFERENCE
	* Remove locator to current section in target portal
	* @return bool true/false removed
	*/
	protected function remove_reference( $obj_map, $section_id, $section_tipo, $dato_actual_en_dedalo, $dato, $FM_field ) {	
		
		if (!property_exists($obj_map, 'section_tipo') || !property_exists($obj_map, 'portal_tipo') ) {			
			debug_log(__METHOD__." WRONG obj_map received Ignored action ($FM_dato, $section_id, $section_tipo) ".to_string(), logger::ERROR);
			return false;
		}

		#
		# Dato actual en dédalo
		if ( empty($dato_actual_en_dedalo) || empty($dato_actual_en_dedalo[0]) ) {
		 	return false; # Not need remove references
		}

		# Convert as locator (in stdclass format for compare)
		$dato_actual_en_dedalo = locator::get_std_class( $dato_actual_en_dedalo[0] ); // select the oly one element (locator) stored y array format (component_select)

		# Convert as locator (in stdclass format for compare)
		$dato = locator::get_std_class( $dato[0] ); // select the oly one element (locator) resolved y array format (component_select)

			#dump($dato_actual_en_dedalo, ' dato_actual_en_dedalo');
			#dump($dato, ' dato');
			#dump($dato_actual_en_dedalo==$dato, 'COMPARE: $dato_actual_en_dedalo==$dato');
			#dump(is_object($dato_actual_en_dedalo), ' is_object($dato_actual_en_dedalo)');
			#dump(property_exists($dato_actual_en_dedalo, 'section_id'), ' property_exists section_id');

		if ($dato_actual_en_dedalo==$dato) {
			# Nothing change
			return false;
		}

		if (!is_object($dato_actual_en_dedalo) || !property_exists($dato_actual_en_dedalo, 'section_id')) {
			if(SHOW_DEBUG===true) {
				dump($dato_actual_en_dedalo, '$dato_actual_en_dedalo');
			}
			debug_log(__METHOD__." Ignored action. Trying remove_reference invalid dato_actual_en_dedalo:".json_encode($dato_actual_en_dedalo)." ($FM_field, $section_id, $section_tipo)", logger::ERROR);
			return false;
		}

		# COMPONENT_PORTAL	
		$current_section_tipo = (string)$obj_map->section_tipo; // Ej. mupreva500 (yacimientos)
		$current_portal_tipo  = (string)$obj_map->portal_tipo;		 // Ej. mupreva517 (Digital portal)
		$current_parent 	  = (int)$dato_actual_en_dedalo->section_id; # es un locator lo que se guada en Dédalo (component autocomplete)

		$component_portal = new component_portal($current_portal_tipo, $current_parent, 'list', DEDALO_DATA_NOLAN, $current_section_tipo);

		# Referenced locator to remove
		$locator = new locator();
			$locator->set_section_tipo($section_tipo);
			$locator->set_section_id($section_id);

		$component_portal->remove_locator( $locator ); # Add locator without remove others and skip duplicates
		$component_portal->Save();
		if(SHOW_DEBUG===true) {
			#dump($component_portal, ' component_portal');			
			debug_log(__METHOD__." Removed locator in portal: (tipo:$current_portal_tipo, parent:$current_parent, section_tipo:$current_section_tipo) ".to_string(), logger::DEBUG);
		}			

		return true;
	}//end remove_reference



	/**
	* PORTALIZE_REFERENCES
	* Solve inverses and store pointers in adequate portals for recovery speed in some fields
	* @param 
	*/
	protected function portalize_references( $obj_map, $section_id, $section_tipo, $FM_dato, $FM_field ) {
		
		# obj_map PORTALIZE MAP reference (defined in set up)
		/*
			[IDsite] => stdClass Object
	        (
	            [section_tipo] => mupreva500
	            [portal_tipo] => mupreva517
	        )
		*/
		if (!property_exists($obj_map, 'section_tipo') || !property_exists($obj_map, 'portal_tipo') ) {
			debug_log(__METHOD__." WRONG obj_map received Ignored action ($FM_dato, $section_id, $section_tipo) ".to_string(), logger::ERROR);
			return false;
		}
		if ( abs($FM_dato) < 1 ) {
			debug_log(__METHOD__." Ignored action. Trying portalize empty or invalid dato:'$FM_dato' ($FM_field, $FM_dato, $section_id, $section_tipo) ".to_string(), logger::ERROR);
			return false;
		}

		# COMPONENT_PORTAL	
		$current_section_tipo = (string)$obj_map->section_tipo;
		$current_portal_tipo  = (string)$obj_map->portal_tipo;
		$current_parent 	  = (int)$FM_dato;

			# Force create section record if not exits (add project too)
			$section = section::get_instance($current_parent, $current_section_tipo);
			$forced_create_record = $section->forced_create_record();
			

		$component_portal = new component_portal($current_portal_tipo, $current_parent, 'list', DEDALO_DATA_NOLAN, $current_section_tipo);

		$locator = new locator();
			$locator->set_section_tipo($section_tipo);
			$locator->set_section_id($section_id);
			
		$component_portal->add_locator( $locator ); # Add locator without remove others and skip duplicates
		$component_portal->Save();
		if(SHOW_DEBUG===true) {
			#dump($component_portal, ' component_portal');			
			debug_log(__METHOD__." Updated portal: (tipo:$current_portal_tipo, parent:$current_parent, section_tipo:$current_section_tipo) ".to_string(), logger::DEBUG);
		}			

		return true;
	}//end portalize_references



	/**
	* GET_DATO_RESOLVED
	* format dato of every component
	* @param string $dato
	*		
	* @return multiple $dato_resolved
	*			Contain properties 'result' and 'msg'. result is bool and msg is string with msg info
	*/
	public function get_dato_resolved($current_component, $dato){

		$dato_resolved = $dato;

		$component_tipo = $current_component->get_tipo();
		$section_tipo 	= $current_component->get_section_tipo();
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);

		#dump($modelo_name ,'modelo_name');
		switch ($modelo_name) {
			
			case 'component_radio_button':
			case 'component_publication':

				# Related section
				$ar_related = common::get_ar_related_by_model('section', $component_tipo);
				if (empty($ar_related)) {
					$dato_resolved[] = array();
					break;
				}
				$related_section_tipo = reset($ar_related);

				/*
				$RecordObj_dd = new RecordObj_dd($component_tipo);
				$relaciones = $RecordObj_dd->get_relaciones();
					#dump($relaciones, ' relaciones ++ '.to_string());

				if (!isset($relaciones[1])) {					
					$dato_resolved[] = array();
					break;
				}
				$related = $relaciones[1];
				$related_component = reset($related);
				#dump($related_component ,'$related_component '); die();
				#$related_component = reset($current_component->RecordObj_dd->get_relaciones());
				$section_tipo = component_common::get_section_tipo_from_component_tipo($related_component);
				*/

				if( strtolower($dato) == 'si' ){
					$section_id = 1;
				}else if ( strtolower($dato) == 'no' ) {			
					$section_id = 2;
				}else{
					$section_id = (int)$dato;
				}
				$dato_resolved = array();
				
				if (!empty($related_section_tipo) && !empty($section_id)) {
					$locator = new locator();
						$locator->set_section_tipo($related_section_tipo);
						$locator->set_section_id($section_id);

					$dato_resolved[] = $locator;
				}			
				break;

			case 'component_check_box':
			case 'component_select':

				# Related section
				$ar_related = common::get_ar_related_by_model('section', $component_tipo);
				if (empty($ar_related)) {
					$dato_resolved[] = array();
					break;
				}
				$related_section_tipo = reset($ar_related);
				/*
				$RecordObj_dd = new RecordObj_dd($component_tipo);
				$relaciones = $RecordObj_dd->get_relaciones();
				
				foreach ($relaciones as $ar_relaciones) {
					foreach ($ar_relaciones as $modelo => $tipo) {
						if($modelo == "dd6"){
							$section_tipo = $tipo;
						}else{
							$related_component = $tipo;
						}
					}
				}*/
		
				$dato_resolved = array();
				#dump($dato);
				foreach ((array)$dato as $key => $section_id) {
					
					if (!empty($related_section_tipo) && !empty($section_id)) {
						$locator = new locator();
							$locator->set_section_tipo($related_section_tipo);
							$locator->set_section_id($section_id);

						$dato_resolved[] = $locator;
					}					
				}
				debug_log(__METHOD__." Updated checkbox with valors (dato_resolved): ".to_string($dato_resolved), logger::WARNING);
				break;

			case 'component_autocomplete':
			case 'component_portal':
				
				$section_tipo = $current_component->get_ar_target_section_tipo()[0];
				if (empty($section_tipo)) {
					debug_log(__METHOD__." Error Processing Request portal section_tipo is empty ".to_string(), logger::WARNING);
				}
				if(SHOW_DEBUG===true) {
					if(empty($section_tipo)) throw new Exception("Error Processing Request portal section_tipo is empty. Trying get_ar_target_section_tipo from component tipo: ".$current_component->get_tipo()." ", 1);
				}

				$dato_resolved = array();
				foreach ((array)$dato as $key => $section_id) {

					if (!empty($section_tipo) && !empty($section_id)) {
						$locator = new locator();
							$locator->set_section_tipo($section_tipo);
							$locator->set_section_id($section_id);

						$dato_resolved[] = $locator;
					}
				}
				if (count($dato_resolved)<1) {
					$dato_resolved = '';
				}
				#if(SHOW_DEBUG===true) {
					#if ($modelo_name=='component_autocomplete') {
						#dump($dato_resolved, ' dato_resolved section_tipo: $section_tipo - from dato: '.to_string( $dato ));
					#};
				#}
				break;

			case 'component_text_area':
			case 'component_html_text':			
			case 'component_input_text_large':
				$dato = htmlspecialchars_decode($dato);
				$dato_resolved = nl2br($dato);
				break;

			case 'component_date':
				# Formato Manolo to OBJECT DATE
				$dato = $this->saintize_date($dato);				
				#$date = new DateTime($dato);
				#$dato_resolved = $date->format('Y-m-d H:i:s');	
				$dato_resolved = $dato;		
				break;
			
			default:			
				$dato = filemaker_sync::sanitize_fm_text($dato);
				$dato_resolved = $dato;
				break;
		}
		#dump($dato_resolved, ' dato_resolved '.$component_tipo." $modelo_name - ".$current_component->get_lang());

		return $dato_resolved;		
	}//end get_dato_resolved



	/**
	* SAINTIZE_DATE
	* @return object $date_formatted
	*/
	public static function saintize_date( $date ) {
		$dd_date = new dd_date();
		
		if(empty($date)){
			return $dd_date;
		}
		# Remove spaces begin-end		
		$date = trim($date);
		# Replace '/'.. by '-'	
		$date = str_replace( array('/','_',' ',',') , '-', $date);
		
		// return obj dd_date format for Dédalo > 4RC2

		$regex   = "/^(-?[0-9]+)-?([0-9]+)?-?([0-9]+)? ?([0-9]+)?:?([0-9]+)?:?([0-9]+)?/";
		preg_match($regex, $date, $matches);    
		  #dump($matches, ' matches');
		if(isset($matches[1])) $dd_date->set_year((int)$matches[1]); 
		if(isset($matches[2])) $dd_date->set_month((int)$matches[2]);
		if(isset($matches[3])) $dd_date->set_day((int)$matches[3]);
		if(isset($matches[4])) $dd_date->set_hour((int)$matches[4]);
		if(isset($matches[5])) $dd_date->set_minute((int)$matches[5]);
		if(isset($matches[6])) $dd_date->set_second((int)$matches[6]);

		return (object)$dd_date;
	}//end saintize_date



	/**
	* SANITIZE_FM_TEXT
	* @return 
	*/
	public function sanitize_fm_text($string) {

		if (!is_string($string)) {
			return $string;
		}
		
		#$string = iconv('UTF-8', 'UTF-8//IGNORE', $string);
		#$string = str_replace('&quot;', "\"", $string);
		$string = htmlspecialchars_decode($string);
		return trim($string);
	}//end sanitize_fm_text



	/**
	* UPDATE_DEDALO_SECTION
	* Update Dedalo sections from Filemaker thesaurus
	* @param object $data
	*			Sended by trigger, is a object with properties ['database','table','layout','id','type'] geted from request
	* @return object $response
	*			Contain properties 'result' and 'msg'. result is bool and msg is string with msg info
	*/
	function update_dedalo_all_sections( $data ) {

		die(	" DEPRECATED. USE update_dedalo_section "	);
		/*
		# Set special php global options
		ob_implicit_flush(true);
		set_time_limit ( 3200000 );		
		#logger_backend_activity::$enable_log 			   = false;	# Disable logging activity and time machine # !IMPORTANT
		#RecordObj_time_machine::$save_time_machine_version = false; # Disable logging activity and time machine # !IMPORTANT

		global $rest_config;
		$start_time=microtime(1);

		$response= new stdClass();	

		$database 	= $data->database;	# Like 'Tesauros'
		$table 	  	= $data->table;		# Like 'Location'
		$layout 	= $data->layout;	# Like 'web-Location'

		# DATA VARS VERIFICATION
		if (!property_exists($this->tables_map, $database)) {
			$response->result = false;
			$response->msg 	  = "Error. Database $database not exists in var tables_map";
			return $response;
		}
		if (!property_exists($this->tables_map->$database->$table, 'FM_layout')) {
			$response->result = false;
			$response->msg 	  = "Error. Layout property 'FM_layout' not defined in current var tables_map $database";
			return $response;
		}
		if ($this->tables_map->$database->$table->FM_layout != $layout) {
			$response->result = false;
			$response->msg 	  = "Error. Layout data inconsistency ($layout) in current var tables_map $database. (".$this->tables_map->$database->$table->FM_layout." != $layout)";
			return $response;
		}

		# Current table map
		$current_table_map = $this->tables_map->$database->$table;
			#dump($obj, ' obj');

		#
		# DEDALO4 LOGIN
		#
			$dedalo_login = (object)filemaker_sync::dedalo_login();
			if (!$dedalo_login->logged) {
				$response->logged = false;		
				$response->msg 	  = "Dedalo Error: " . $dedalo_login->msg;
				return $response;
			}
		

		#
		# FILEMAKER CONNECTOR GET DATA
		#			

			# Database connector
			$fm = filemaker_connector::_getConnection_fm( $database );

			# Create the 'find all' command and specify the layout (from received data)
			$findCommand =& $fm->newFindAllCommand( $layout );
			
			# Perform the find and store the result
			$result = $findCommand->execute();

			# Check for an error
			if (FileMaker::isError($result)) {
				$response->result = false;
				$response->msg 	  = "FM Error: " . $result->getMessage();
				return $response;
			}
			
			# Store the matching records (is non associative array)
			$records = (array)$result->getRecords();
			#dump($records,'records');die();

			# Retrieve and store first record
			# $record = $records[0];

			# Field, get specific field from current record
			# $persona =  $record->getField('id');
		

		#
		# RECORDS ITERATION
		#
			#$DD_table = $current_table_map->DD_table;	# Current Dedalo thesaurus table
			$section_tipo	= $current_table_map->fields->section_tipo;
			$table_matrix 	= common::get_matrix_table_from_tipo($section_tipo);

			# TEMPORAL
			#$strQuery = "DELETE FROM \"$table_matrix\" WHERE section_tipo = '$section_tipo' ";
			#$result   = pg_query(DBi::_getConnection(), $strQuery);
			#if(!$result) {
			#	$response->result = false;
			#	$response->msg 	  = "Error. sorry an error ocurred on DELETE recordds in table:$table_matrix. Data is not deleted / updated ";
			#	return $response;
			#}
			
			
			#$i=0;
			foreach ($records as $current_record) {
				
				$section_id	  = (int)$current_record->getField($current_table_map->fields->section_id);				
				$section_tipo = (string)$current_table_map->fields->section_tipo;

				# DATOS ESPERADOS EN MODO MONO REGISTRO
				# $database 	= $data->database;	# Like 'Tesauros'
				# $FM_table 	= $data->table;		# Like 'Location'
				# $layout 	= $data->layout;	# Like 'web-Location'
				# $section_id	= $data->id;		# Like '53'
				
				$current_data = new stdclass();
					$current_data->database = $database;
					$current_data->table 	= $table;
					$current_data->layout 	= $layout;
					$current_data->id 		= $section_id;

				$this->update_dedalo_section( $current_data );
				continue;


				# NEW RECORD : Create new empty record to alocate components data
				$table_matrix = common::get_matrix_table_from_tipo($section_tipo);
				$strQuery = "
				INSERT INTO \"$table_matrix\" 
				(\"section_id\", \"section_tipo\")
				VALUES 
				('$section_id', '$section_tipo') RETURNING \"id\" 
				";
				$result = pg_query(DBi::_getConnection(), $strQuery);
				if(!$result) {
					$response->result = false;
					$response->msg 	  = "Error. sorry an error ocurred on INSERT record in table:$table_matrix. Data is not saved ($section_tipo - $section_id)";
					return $response;
				}
			
				foreach ($current_table_map->fields as $component_tipo => $FM_field) {
					# Skip some general fields
					if($component_tipo =="section_id" || $component_tipo == "section_tipo")continue;

					$current_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
					if(!is_array($FM_field)){
			
						$lang = DEDALO_DATA_NOLAN;
						$current_component = component_common::get_instance($current_modelo_name,$component_tipo,$section_id, 'edit', $lang,  $section_tipo);
						
						$dato = $this->get_dato_resolved($current_component, $current_record->getField($FM_field));
						
						$current_component->set_dato($dato);
						$current_component->Save();

					}else{

						foreach ($FM_field as $lang => $FM_field2) {
							$dato = $current_record->getField($FM_field2);

							$current_component = component_common::get_instance($current_modelo_name,$component_tipo,$section_id, 'edit', $lang,  $section_tipo);
							$current_component->set_dato($dato);
							$current_component->Save();
						}
					}					
				}//end foreach ($current_table_map->fields as $component_tipo => $FM_field) 
		  		
		  		#FILTER
				$current_component_filter = component_common::get_instance('component_filter',key($current_table_map->filter), $section_id, 'edit', DEDALO_DATA_NOLAN,  $section_tipo);
				$current_component_filter->set_dato(reset($current_table_map->filter));
				$current_component_filter->Save();

				#$i++; if($i>=100) break;

			}//end foreach ($records as $current_record)


		$total_time   = round(microtime(1)-$start_time,3);
		$memory_usage = tools::get_memory_usage(false);

		$response->result = true;		
		$response->msg 	  = "Ok. Database $database updated by Dedalo user $rest_config->user. Records iterated: ".count($records)." with fields:". count($current_table_map->fields)." Time: $total_time sec. Memory: $memory_usage";
		

		# Re-Enable logging activity and time machine # !IMPORTANT
		#logger_backend_activity::$enable_log 			   = true;
		#RecordObj_time_machine::$save_time_machine_version = true;

		return (object)$response; */
	}//end function update_dedalo_section



	/**
	* AUTH_CHECK
	* @param object stdClass $data
	* @return object stdClass $response ( bool result, string msg)
	*/
	public function auth_check( stdClass $data ) {
		global $rest_config;		
		
		$response= new stdClass();
			$response->result = true;
			$response->msg 	  = 'ok';

		# SECURITY (auth_code / source ip)
		if ($data->auth_code != $rest_config->auth_code) {
			$response->result = false;
			$response->msg 	  = "Error. Unauthorized code";
		}

		# CHECK CALLER IP IS IN AUTH RANGE
		/**/
		$in_range = false;
		if(!isset($rest_config->ip_range)) {
			$rest_config->ip_range = array();
			debug_log(__METHOD__." IP RANGE is NOT defined ! Please review your config rest_config->ip_range data".to_string(), logger::ERROR);
		}
		foreach ((array)$rest_config->ip_range as $current_range) {
			$in_range = ip_in_range($data->source_ip, $current_range);
				#dump($in_range, ' in_range '."source_ip:$data->source_ip - current_range:$current_range");
			if ($in_range===true) {
				break;
			}
		}		
		#dump($in_range, ' in_range '."$data->source_ip - ". print_r($rest_config->ip_range,true));die();
		
		$in_range=true;	// PROVISOINAL

		if ($in_range!==true) {
			$response->result = false;
			$response->msg 	  = "Error. Unauthorized source ".$data->source_ip ." (not in range)";
		}

		/* TEMPORAL !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! DESACTIVO TEMPORALMENTE !!!!
		if (!in_array($data->source_ip, (array)$rest_config->source_ip)) {
			exit("Error. Unauthorized source ".$data->source_ip);
			$response->result = false;
			$response->msg 	  = "Error. Unauthorized source ".$data->source_ip;
		}
		*/
		#error_log(__METHOD__." DESACTIVO TEMPORALMENTE !!!!");		
		return $response;
	}//end auth_check



	/**
	* UPDATE_DEDALO_TS
	* Update Dedalo thesaurus from Filemaker thesaurus
	* @param object $data
	*			Sended by trigger, is a object with properties ['database','table','layout','id','type'] geted from request
	* @return object $response
	*			Contain properties 'result' and 'msg'. result is bool and msg is string with msg info
	*/
	function update_dedalo_ts( $data ) {
		global $rest_config;
		$start_time=microtime(1);

		$response= new stdClass();	

		$database 	= $data->database;	# Like 'Tesauros'
		$table 	  	= $data->table;		# Like 'Location'
		$layout 	= $data->layout;	# Like 'web-Location'

		# DATA VARS VERIFICATION
		if (!property_exists($this->tables_map, $database)) {
			$response->result = false;
			$response->msg 	  = "Error. Database $database not exists in var tables_map";
			return $response;
		}
		if (!property_exists($this->tables_map->$database->$table, 'FM_layout')) {
			$response->result = false;
			$response->msg 	  = "Error. Layout property 'FM_layout' not defined in current var tables_map $database";
			return $response;
		}
		if ($this->tables_map->$database->$table->FM_layout != $layout) {
			$response->result = false;
			$response->msg 	  = "Error. Layout data inconsistency ($layout) in current var tables_map $database. (".$this->tables_map->$database->$table->FM_layout." != $layout)";
			return $response;
		}

		# Current table map
		$current_table_map = $this->tables_map->$database->$table;
			#dump($obj, ' obj');

		#
		# DEDALO4 LOGIN
		#
			$dedalo_login = (object)filemaker_sync::dedalo_login();
			if (!$dedalo_login->logged) {
				$response->logged = false;		
				$response->msg 	  = "Dedalo Error: " . $dedalo_login->msg;
				return $response;
			}
		

		#
		# FILEMAKER CONNECTOR GET DATA
		#
			# Database connector
			$fm = filemaker_connector::_getConnection_fm( $database );

			# Create the 'find all' command and specify the layout (from received data)
			$findCommand =& $fm->newFindAllCommand( $layout );
			
			# Perform the find and store the result
			$result = $findCommand->execute();

			# Check for an error
			if (FileMaker::isError($result)) {
				$response->result = false;
				$response->msg 	  = "FM Error: " . $result->getMessage();
				return $response;
			}
			
			# Store the matching records (is non associative array)
			$records = (array)$result->getRecords();

			# Retrieve and store first record
			# $record = $records[0];

			# Field, get specific field from current record
			# $persona =  $record->getField('id');
		

		#
		# RECORDS ITERATION
		#
			$DD_table = $current_table_map->DD_table;	# Current Dedalo thesaurus table
			$i=0;
			foreach ($records as $current_record) {
				
				# VARS
				$prefijo 	= $current_table_map->DD_tld;
				$visible 	= $current_record->getField(  array_search('visible', $current_table_map->fields)  );
				$parent 	= $prefijo . (int)$current_record->getField(  array_search('parent', $current_table_map->fields)  );
				$id 		= (int)$current_record->getField(  array_search('id', $current_table_map->fields)  );
				$terminoID	= $prefijo . $id;


				#
				# JER_XX				
					$RecordObj_ts 	= new RecordObj_ts($terminoID, $prefijo);
					$parent_db_test = $RecordObj_ts->get_parent();
					
					if ($parent_db_test==null) {	# NO existe el registro. Lo creamos con el terminoID apropiado

						# Insert record here is direct. No logging is necessary

						$strQuery = "
						INSERT INTO \"$DD_table\" 
						(\"id\", \"terminoID\", \"parent\", \"esmodelo\", \"esdescriptor\", \"visible\", \"usableIndex\")
						VALUES 
						('$id', '$terminoID', '$parent', 'no', 'si', '$visible', 'si') RETURNING \"id\" 
						";
						$result = pg_query(DBi::_getConnection(), $strQuery);
						if(!$result) {
							if(SHOW_DEBUG===true) {
								dump($strQuery,"strQuery");
								throw new Exception("Error Processing Save Insert Request ". pg_last_error(), 1);
							}
							return "Error: sorry an error ocurred on INSERT record. Data is not saved";
						}
						
						if(SHOW_DEBUG===true) {
							#dump($strQuery, ' strQuery');
							#error_log(__METHOD__." INSERTED $terminoID");
						}
						
					}else{	# SI existe el registro. Lo actualizamos

						
						$RecordObj_ts->set_visible($visible);
						$RecordObj_ts->set_parent($parent);
						$RecordObj_ts->Save();

						if(SHOW_DEBUG===true) {
							#error_log(__METHOD__." UPDATED $terminoID");
						}
					}//end if ($parent_db_test==null)
				

				#
				# DESCRIPTORS
					foreach ($current_table_map->fields as $fm_field => $dd_field) {

						if ($dd_field!='dato') continue; # Skip

						$lang 		= (string)self::get_lang_from_fm_field($fm_field);						
						$dato 		= (string)trim($current_record->getField( $fm_field ));
						$typology 	= (string)self::get_typology_from_fm_field( $fm_field );
						if(SHOW_DEBUG===true) {
							#error_log("dato: $dato for $terminoID - $fm_field - $typology" );
						}
						
						$RecordObj_descriptors	= new RecordObj_descriptors('matrix_descriptors', NULL, $terminoID, $lang, $typology, false);
						#$RecordObj_descriptors->set_tipo('termino');
						#$RecordObj_descriptors->set_parent($terminoID);
						#$RecordObj_descriptors->set_lang($lang);
						$RecordObj_descriptors->set_dato($dato);
						$created_id_descriptors	= $RecordObj_descriptors->Save();
						/**/			
					}

				/* Formato ref:
				[0] => VALtitle
				[1] => VALresume
				[2] => VALbody
				[3] => CAStitle
				[4] => CASresume
				[5] => CASbody
				[6] => ENtitle
				[7] => ENresume
				[8] => ENbody
				[9] => FRtitle
				[10] => FRresume
				[11] => FRbody
				*/    		
			$i++;
			if ($i>=100) {
				#break;
			}			

		}#foreach ($records as $current_record)


		$total_time   = round(microtime(1)-$start_time,3);
		$memory_usage = tools::get_memory_usage(false);

		$response->result = true;		
		$response->msg 	  = "Ok. Database $database updated by Dedalo user $rest_config->user. Records iterated: ".count($records)." with fields:". count($current_table_map->fields)." Time: $total_time sec. Memory: $memory_usage";
		return $response;
	}//end update_dedalo

	

	/**
	* GET_TYPOLOGY_FROM_FM_FIELD
	*/
	static function get_typology_from_fm_field($fm_field) {
		switch (true) {
			case ( strpos($fm_field, 'title')!==false ):
				return 'termino';
				break;
			case ( strpos($fm_field, 'resume')!==false ):
				return 'notes';
				break;
				case ( strpos($fm_field, 'body')!==false ):
				return 'def';
				break;
			default:
				return 'termino';
		}	
	}//end get_typology_from_fm_field



	/**
	* GET_LANG_FROM_FM_FIELD
	* @return string
	*/
	static function get_lang_from_fm_field($fm_field) {

		$prefix = substr($fm_field, 0, 2);
		switch ($prefix) {
			case 'VA':
				return 'lg-cat';
				break;
			case 'CA':
				return 'lg-spa';
				break;
			case 'EN':
				return 'lg-eng';
				break;
			case 'FR':
				return 'lg-fra';
				break;
		}
		throw new Exception("Error Processing Request", 1);		
	}//end get_lang_from_fm_field



	/**
	* DEDALO_LOGIN
	* @return object $response
	* WORKING HERE.....
	*/
	public static function dedalo_login() {
		$response = new stdClass();

		$options = new stdClass();
			$options->auth_code 	='364rkls9kAf97qP';
			$options->source_ip 	='localhost';
			$options->activity_info = "filemaker sync";

		$rest_response = (object)login::rest_login( $options );
		if ($rest_response->logged !== true) {
			$response->logged = false;
			$response->msg 	  = "<warning>Sorry. No rest login</warning>";
			return $response;
		}

		$response->logged = true;
		$response->msg 	  = "User logged [2]";
		return $response;
	}//end dedalo_login



	/**
	* GET_SECTION_ID_FROM_CODIGO
	* @return int section_id OR bool false when not found
	*/
	public function get_section_id_from_codigo( $codigo, $section_tipo, $component_tipo ) {

		$table_matrix = common::get_matrix_table_from_tipo($section_tipo);
		$strQuery = "
		SELECT section_id FROM \"$table_matrix\" 
		WHERE 
		section_tipo = '$section_tipo' AND
		datos#>'{components,$component_tipo,dato,lg-nolan}' = '\"$codigo\"'::jsonb
		LIMIT 1
		";
		#dump($strQuery, ' strQuery');
		$result = pg_query(DBi::_getConnection(), $strQuery);
		if(!$result) {
			$response->result = false;
			$response->msg 	  = "Error. sorry an error ocurred on INSERT record in table:$table_matrix. Data is not saved ($section_tipo - $section_id)";
			return $response;
		}
		$row 	  	= pg_fetch_row($result);
		if (empty($row[0])) {
			return false;
		}

		return (int)$row[0];
	}//end get_section_id_from_codigo



}//END CLASS
?>