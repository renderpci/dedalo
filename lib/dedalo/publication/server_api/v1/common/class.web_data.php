<?php
include(dirname(__FILE__).'/class.ts_term.php');
include(dirname(__FILE__).'/class.indexation_node.php');
include(dirname(__FILE__).'/class.free_node.php');
include(dirname(__FILE__).'/class.full_node.php');
include(dirname(__FILE__).'/class.video_view_data.php');
include(dirname(__FILE__).'/class.map.php');
include(dirname(dirname(dirname(dirname(dirname(__FILE__))))).'/media_engine/class.OptimizeTC.php');
/**
* WEB_DATA
* Manage web source data with mysql
*
* Esta clase es genérica y debe servir también para las partes públicas.
* Cuando se use fuera de Dédalo, copiar este fichero.
* Para poder aprovechar las mejoras y corrección de errores del desarrollo de Dédalo, llevar control de versión de esta clase.
*
*/
class web_data {



	# Version. Important!
	#static $version = "1.0.4"; // 11-03-2017
	#static $version = "1.0.6"; // 05-06-2017
	#static $version = "1.0.8"; // 07-06-2017
	#static $version = "1.0.9"; // 09-06-2017
	#static $version = "1.0.10"; // 11-07-2017
	#static $version = "1.0.11"; // 12-07-2017
	#static $version = "1.0.12"; // 24-07-2017
	#static $version = "1.0.13"; // 25-07-2017
	#static $version = "1.0.14"; // 26-07-2017
	#static $version = "1.0.15"; // 28-07-2017
	static $version = "1.0.16"; // 06-09-2017

	/* ROWS_DATA (SQL)
	----------------------------------------------------------------------- */

		/**
		* GET_ROWS_DATA
		* Función genérica de consulta a las tablas de difusión generadas por Dédalo tras la publicación web
		* Devuelve array con los rows de los campos solicitados
		* @param object $options . Object with options like table, ar_fields, lang, etc..
		* @return array $ar_data . Rows result from search
		*/
		public static function get_rows_data( $request_options ) {
			
			$response = new stdClass();
				$response->result = false;
				$response->msg    = "Error on get data";

			$start_time = microtime(1);		
			
			# Options defaults
			$sql_options = new stdClass();
				$sql_options->table 		 	= null;
				$sql_options->ar_fields 	 	= array('*');
				$sql_options->sql_fullselect 	= false; // default false
				$sql_options->section_id 	 	= false;
				$sql_options->sql_filter 	 	= ""; //publicacion = 'si'				
				$sql_options->lang 			 	= null;	//WEB_CURRENT_LANG_CODE;
				$sql_options->order 			= '`id` ASC';
				$sql_options->limit 		 	= 0;
				$sql_options->group 		 	= false;
				$sql_options->offset 		 	= false;
				$sql_options->count 		 	= false;
				$sql_options->resolve_portal 	= false; // bool
				$sql_options->resolve_portals_custom = false; // array | bool
				$sql_options->apply_postprocess = false; //  bool default true
				$sql_options->map 				= false; //  object | bool (default false). Apply map function to value like [{"field":birthplace_id","function":"resolve_geolocation","otuput_field":"birthplace_obj"}]
				$sql_options->conn 			 	= DBi::_getConnection_mysql();

				foreach ($request_options as $key => $value) {if (property_exists($sql_options, $key)) $sql_options->$key = $value;}

			if (empty($sql_options->table) || empty($sql_options->conn)) {
				$response->result = false;
				$response->msg    = "Empty options->table or connexion ";
				return $response;
			}
			#	dump($sql_options, ' sql_options ++ '.to_string());

			if ($sql_options->section_id!==false) {
				if (empty($sql_options->sql_filter)) {
					$sql_options->sql_filter = "section_id = " . (int)$sql_options->section_id;
				}else{
					$sql_options->sql_filter = "section_id = " . (int)$sql_options->section_id . " AND " . $sql_options->sql_filter;
				}				
			}

			$ar_data=array();

			$strQuery = "-- ".__METHOD__;

			/* With prepare statement
			$stmt = mysqli_prepare($link, "INSERT INTO table VALUES ('PHP', ?, ?)");
					mysqli_stmt_bind_param($stmt, "iis", $integer, $code, $string);
					mysqli_stmt_execute($stmt);
					*/

				if ($sql_options->sql_fullselect) {
					# Full select like "SELECT id,section_id,titulo,mupreva830 FROM publicaciones UNION SELECT id,section_id,titulo,mupreva830 FROM publicaciones_externas"
					$strQuery .= "\n".$sql_options->sql_fullselect;

					# WHERE
					$strQuery .= self::build_sql_where($sql_options->lang, $sql_options->sql_filter);
				
				}else{
					
					$ar_tables = (array)explode(',', $sql_options->table);
					$end_table = end($ar_tables);
					foreach ($ar_tables as $table) {
					
						# SELECT
						$strQuery .= self::build_sql_select($sql_options->ar_fields);
							
						# FROM
						$strQuery .= self::build_sql_from($table);	

						# WHERE
						$strQuery .= self::build_sql_where($sql_options->lang, $sql_options->sql_filter);

						# GROUP
						if(!empty($sql_options->group)) {
							$strQuery .= self::build_sql_group($sql_options->group);
						}

						# UNION
						if ($table!==$end_table) {
						$strQuery .= "\nUNION ALL ";
						}
					}										
				}			
				
				# ORDER
				if(!empty($sql_options->order)) {
					$strQuery .= self::build_sql_order($sql_options->order);
				}

				# LIMIT
				if(!empty($sql_options->limit)) {			
					$strQuery .= self::build_sql_limit($sql_options->limit, $sql_options->offset);
				}
				
				$sql_options->strQuery = $strQuery;
				if(SHOW_DEBUG) {
					#dump($strQuery);
				}

			# SAFE QUERY TEST
			preg_match_all("/delete|update|insert/i", $strQuery, $output_array);
			if (!empty($output_array)) {
				$response->result = false;				
				$response->msg    = "Error on sql request. Ilegal option";
				if(SHOW_DEBUG===true) {
					$response->msg    .= " : $strQuery";
				}
			}

			#debug_log(__METHOD__." Executing query ".to_string($strQuery), logger::ERROR);
			#if (strpos($sql_options->sql_filter, 'Barcelona')!==false ) {		
				#dump($sql_options->sql_filter, ' strQuery ++ +++++++++++++++++++++++++++++++++++++++++++++++++++++++++ '.to_string($strQuery));
				#error_log($strQuery);
			#}
			
			# EXEC QUERY
			$result = $sql_options->conn->query($strQuery);		

			if (!$result) {
				# Si hay problemas en la búsqueda, no lanzaremos error ya que esta función se usa en partes públicas		
				$response->result = false;
				$response->msg    = "Error on sql request (no result) ";
				#if(SHOW_DEBUG===true) {
					$msg = "Error processing request: ".$sql_options->conn->error;
					// use always silent errors to not alter json result object
					error_log(__METHOD__ ." $msg \n $strQuery ");
					$response->msg .= $msg .' - '. $strQuery;
				#}
				return $response;
			}


			#
			# COUNT RECORDS
			if ($sql_options->count===true) {
				$response->total = (int)web_data::count_records( $strQuery, $sql_options->conn );
			}//end if ($sql_options->count===true) {

			
			if (empty($sql_options->ar_fields) || $sql_options->ar_fields[0]=='*') {			
				$sql_options->ar_fields = array_keys((array)$result->fetch_assoc());
				$result->data_seek(0); # Reset pointer of fetch_assoc
			}

			# PUBLICATION_SCHEMA
			# When options resolve_portal is true, we create a virtual resolve_portals_custom options from publication_schema whith all portals
			if ($sql_options->resolve_portal===true) {
				$sql_options->resolve_portals_custom = self::get_publication_schema( $sql_options->table );
			}

			$i=0;while ( $rows = $result->fetch_assoc() ) {
		
				foreach($sql_options->ar_fields as $current_field) {

					if ($current_field==='id') {
						# continue; // Skip mysql table id
						# Replace id column for table name column
						# If table is array, only first table is supported
						$ar_data[$i]['table'] = $sql_options->table; 
						continue;
					}

					# alias case (like  floor(YEAR(fecha_inicio)/10)*10 as decade)
					if (strpos($current_field, ' AS ')!==false) {
						$ar_parts = explode(' AS ', $current_field);
						$current_field = trim($ar_parts[1]);
					}
	

					# POSTPROCESS_FIELD if need
					if ($sql_options->apply_postprocess===true) {
						$field_data = self::postprocess_field($current_field, $rows[$current_field]); // Default
					}else{
						$field_data = $rows[$current_field];
					}				


					# Default behaviour
					$ar_data[$i][$current_field] = $field_data;

					#  Portal resolve cases
					if ($sql_options->resolve_portals_custom!==false && property_exists($sql_options->resolve_portals_custom, $current_field)) {
						$ar_data[$i][$current_field] = self::portal_resolve($rows, $current_field, $request_options, $sql_options->resolve_portals_custom);
					}
				}
			
			$i++;}; 
			
			$result->free();
			#DBi::_getConnection_mysql()->close();

			# MAP
			# Format : [{"field":birthplace_id","function":"resolve_geolocation","output_field":"birthplace_obj"}]
			if ($sql_options->map!==false) {
				# Exed defined map functions and add columns as request
				foreach ($ar_data as $key => $row) {
					foreach ($sql_options->map as $map_obj) {
						if ($map_obj->table===$sql_options->table) {
							$ar_data[$key][$map_obj->output_field] = map::{$map_obj->function}($row[$map_obj->field], $sql_options->lang);
						}
					}
				}
			}

			# Debug properties
			if(SHOW_DEBUG===true) {		
				if (isset($count_query)) {
				$response->debug['count_query']= $count_query;
				}
				$response->debug['strQuery']= $strQuery;
				$response->debug['time'] 	= round(microtime(1)-$start_time,3);
				#error_log("strQuery: ".$strQuery);
			}
			# Fixed properties
			$response->result 			= $ar_data;
			$response->msg    			= "Ok request done";
			

			return $response;
		}//end get_rows_data



		/**
		* BUILD_SQL_SELECT
		* @return string $sql
		*/
		private static function build_sql_select($ar_fields) {
			
			$sql='';
			$sql .= "\nSELECT ";
			
			# FIELDS
			$query_fields='';
			foreach ((array)$ar_fields as $current_field) {				
				
				if (strpos($current_field, 'DISTINCT')!==false || $current_field=='*' || strpos($current_field, 'MATCH')!==false || strpos($current_field, ' AS ')!==false) {
					$query_fields .= $current_field;
				}else{
					$query_fields .= '`'.$current_field.'`';
				}
				if ($current_field!=end($ar_fields)) {
					$query_fields .= ',';
				}
			}
			$sql .= $query_fields;

			return $sql;
		}//end build_sql_select



		/**
		* BUILD_SQL_FROM
		* @return string $sql
		*/
		private static function build_sql_from($table) {
			$sql='';
			$sql .= "\nFROM ".trim($table)." ";

			return $sql;
		}//end build_sql_from



		/**
		* BUILD_SQL_WHERE
		* @return string $sql
		*/
		private static function build_sql_where($lang, $sql_filter) {
			$sql='';
			$sql .= "\nWHERE section_id IS NOT NULL";
								
			# SQL_FILTER
			if(!empty($sql_filter) AND strlen($sql_filter)>2 ) {
				if($sql_filter===PUBLICACION_FILTER_SQL) {
					$sql .= "\n$sql_filter";
				}else{
					$sql .= "\nAND ($sql_filter)";
				}				
			}

			# LANG
			if(!empty($lang)) {
				if (strpos($lang, 'lg-')===false) {
					$lang = 'lg-'.$lang;
				}
				$sql .= "\nAND lang = '$lang'";
			}


			return $sql;
		}//end build_sql_where



		/**
		* BUILD_SQL_GROUP
		* @return string $sql
		*/
		private static function build_sql_group($group) {
			$sql='';
			$sql .= "\nGROUP BY $group";

			return $sql;
		}//end build_sql_group



		/**
		* BUILD_SQL_ORDER
		* @return string $sql
		*/
		private static function build_sql_order($order) {

			# Prevent duplications
			$order = str_replace('ORDER BY','',$order);

			$sql='';
			$sql .= "\nORDER BY $order";

			return $sql;
		}//end build_sql_order



		/**
		* BUILD_SQL_limit
		* @return string $sql
		*/
		private static function build_sql_limit($limit, $offset=null) {
			$sql='';
			$sql .= "\nLIMIT ".intval($limit);
			# OFFSET
			if(!empty($offset)) {
				$sql .= " OFFSET ".intval($offset);
			}

			return $sql;
		}//end build_sql_limit



		/**
		* GET_PUBLICATION_SCHEMA
		* @return object|false $data
		*/
		public static function get_publication_schema( $table=null ) {

			# Config file constant
				$data = json_decode(PUBLICATION_SCHEMA);

			/*
			$data = false;

			$strQuery = "SELECT data FROM publication_schema WHERE name = '$table'";
			$result   = DBi::_getConnection_mysql()->query($strQuery);

			if($result) while ( $rows = $result->fetch_assoc() ) {
				$data = json_decode($rows['data']);
				break;
			}else{
				# Config file constant
				$data = json_decode(PUBLICATION_SCHEMA);
			}

			#$data = new stdClass();
			#	$data->obras_de_arte = 'obras_de_arte';
			*/

			return $data;
		}//end get_publication_schema



		/**
		* GET_FULL_PUBLICATION_SCHEMA
		* @return object|false $data
		*/
		private static function get_full_publication_schema( ) {
			$data = false;

			$strQuery = "SELECT name, data FROM publication_schema ";
			$result   = DBi::_getConnection_mysql()->query($strQuery);

			$ar_tables=array();
			if ($result) {
				while ( $rows = $result->fetch_assoc() ) {
					$name = $rows['name'];
					$data = json_decode($rows['data']);
					$ar_tables[$name] = $data;
				}
			}		
			#dump($ar_tables, ' ar_tables ++ '.to_string());

			return $ar_tables;
		}//end get_full_publication_schema



		/**
		* PORTAL_RESOLVE
		* @return array $ar_portal
		*/
		private static function portal_resolve($rows, $current_field, $options, $resolve_portals_custom) {
			$ar_portal=array();			

			if ($resolve_portals_custom!==false) {
				# resolve_portals_custom is received
				$current_field_ar_id = $current_field;	//in_array($current_field, (array)$resolve_portals_custom);
				$table 				 = $resolve_portals_custom->{$current_field};
				
			}else{
				# default case
				$current_field_ar_id = str_replace('_table', '_id', $current_field); // los datos apunta al nombre de esta columna (XX_table) pero están en XX_id
				$table 				 = $rows[$current_field];
			}
			if(empty($rows[$current_field_ar_id])) return $ar_portal;
			$current_ar_value = json_decode($rows[$current_field_ar_id]);
			#dump($current_ar_value, " current_ar_value ".to_string());	 		
		 	
		 	if(is_array($current_ar_value)) foreach ($current_ar_value as $p_value) {

		 		$portal_options = new stdClass();
		 			$portal_options->table = $table;
		 			$portal_options->lang  = $options->lang;
		 			if (isset($options->resolve_portal)) {
		 			$portal_options->resolve_portal = $options->resolve_portal;
		 			}	 			

		 			$filter = PUBLICACION_FILTER_SQL;
		 			if( !empty($options->portal_filter) 
		 				&& isset($options->portal_filter[$portal_options->table]) ) 
		 				{
		 					$filter = $options->portal_filter[$portal_options->table];
		 			}

					$portal_options->sql_filter = "section_id = $p_value " . $filter;

		 		$rows_data = (array)self::get_rows_data($portal_options)->result;
		 		//error_log( 'rows_data: '. to_string($portal_options) );

		 		if (!empty($rows_data[0])) { 			

		 			$ar_portal[] = $rows_data[0];

		 			# MAP
					# Format : [{"field":birthplace_id","function":"resolve_geolocation","output_field":"birthplace_obj"}]
					if (property_exists($options, "map") && $options->map!==false) {
						# Exec defined map functions and add columns as request
						foreach ($ar_portal as $key => $row) {
							foreach ($options->map as $map_obj) {
								if ($map_obj->table===$table) {
									$ar_portal[$key][$map_obj->output_field] = map::{$map_obj->function}($row[$map_obj->field], $options->lang);
								}								
							}
						}
					}
		 		}
		 		#dump($ar_portal, " ar_portal ".to_string());
		 	}

		 	return (array)$ar_portal;
		}//end portal_resolve



		/**
		* COUNT_RECORDS
		* @return int $total
		*/
		private static function count_records( $sql, $conn=false ) {

			if($conn===false) $conn=DBi::_getConnection_mysql();			
			debug_log(__METHOD__." sql ".to_string($sql), logger::DEBUG);
			$ar = explode("\n", $sql);			
			foreach ($ar as $key => $line) {
				switch (true) {
					case (strpos($line, 'SELECT')!==false):
						#$ar[$key] = "SELECT COUNT(*) AS total FROM (\n". $ar[$key];
						break;
					case (strpos($line, 'GROUP BY')!==false):
						# alias case (like  floor(YEAR(fecha_inicio)/10)*10 as decade)
						if (strpos($line, ' AS ')!==false) {
							$ar_parts = explode(' AS ', $line);
							$ar[$key] = $ar_parts[0];
						}
						break;
					case (strpos($line, 'LIMIT')!==false):
					case (strpos($line, 'OFFSET')!==false):
					case (strpos($line, 'ORDER BY')!==false):
						$ar[$key] = '';
						break;
					case (strpos($line, 'UNION')!==false):
						#$ar[$key-1] .= "\n) AS tables ";
						break;
				}
			}
			$count_query = trim(implode("\n", $ar));  //."\n) AS tables";
			$count_query = "SELECT COUNT(*) AS total FROM (\n" .$count_query. "\n) AS tables";
			
			$count_result= $conn->query($count_query);
			if (!$count_result) {
				if(SHOW_DEBUG) {
					#dump($count_query, "<H2>DEBUG Error Processing Request</H2> " .$conn->error );
					debug_log(__METHOD__." DEBUG Error Processing Request : $count_query - ".to_string($conn->error), logger::ERROR);
					#trigger_error("Error Processing Request");
					#echo "<div class=\"error\" >Error Processing Request</div>";
					#throw new Exception("Error Processing Request", 1);
				}
				# Si hay problemas en la búsqueda, no lanzaremos error ya que esta función se usa en partes públicas		
				return 0;
			}
			$ar_record = $count_result->fetch_assoc();

			$total = reset($ar_record);

			return (int)$total;
		}//end count_records



		/**
		* GET_DATA
		* Exec a remote connection and get remote data with options as JSON
		* @return object $rows_data
		*//* UNUSED NOW !!
		public static function get_data($request_options) {

			$start_time = microtime(1);

			$WORKING_MODE = WORKING_MODE;	//'remote';

			if ($WORKING_MODE==='remote') {
				# FROM JSON URL IN SERVER SIDE

				$url = JSON_TRIGGER_URL . '?options=' . urlencode( json_encode($request_options) );
					#dump($url, ' url ++ '.to_string());
				$dedalo_data_file 	= file_get_contents($url) ;
					#dump($dedalo_data_file, ' $dedalo_data_file ++ '.to_string($url));
				$dedalo_data = json_decode( $dedalo_data_file, false, 512, JSON_UNESCAPED_UNICODE );
					#dump($dedalo_data, ' dedalo_data ++ '.to_string($url)); #die();
			
			}else{
				# FROM CURRENT SERVER

				$dedalo_get = isset($request_options->dedalo_get) ? $request_options->dedalo_get : null;
				switch ($dedalo_get) {

					case 'tables_info':
						#
						# Execute data retrieving
						$full = isset($request_options->full) ? $request_options->full : false;
						$dedalo_data = (object)web_data::get_tables_info( $full );
						break;

					case 'publication_schema':
						#
						# Execute data retrieving
						$dedalo_data = (object)web_data::get_full_publication_schema();
						break;

					case 'records':
					default:
						#
						# Execute data retrieving
						$dedalo_data = (object)web_data::get_rows_data( $request_options );
						break;
				}
			}		

			if (!is_object($dedalo_data)) {
				$dedalo_data = new stdClass();
					$dedalo_data->result = array();
					if(SHOW_DEBUG===true) {
						$dedalo_data->debug = new stdClass();
						$dedalo_data->debug->info = "Error in response results: ".to_string($dedalo_data_file);
					}				
			}
			#error_log( to_string($dedalo_data->debug) );

			$dedalo_data->debug = isset($dedalo_data->debug) && is_object($dedalo_data->debug) ? $dedalo_data->debug : new stdClass();
			$dedalo_data->debug->total_time = round(microtime(1)-$start_time,3);

			return (object)$dedalo_data;
		}//end get_data
		*/



		/**
		* GET_ALL_TABLES
		* @return array $ar_tables
		*/
		private static function get_all_tables() {
			
			$strQuery = "SHOW TABLES";		
			
			$conn=DBi::_getConnection_mysql();

			# EXEC QUERY
			$result = $conn->query($strQuery);

			$ar_tables = array();
			while ( $rows = $result->fetch_assoc() ) {
				#dump($rows, ' rows ++ '.to_string());
				$ar_tables[] = reset($rows);
			}

			return (array)$ar_tables;
		}//end get_all_tables



		/**
		* GET_TABLE_FIELDS
		* @return array $ar_columns
		*/
		private static function get_table_fields( $table, $full=false ) {
			
			$strQuery = "SHOW COLUMNS FROM $table";
			
			# EXEC QUERY
			$conn=DBi::_getConnection_mysql();

			$result = $conn->query($strQuery);

			$ar_columns = array();
			while ( $row = $result->fetch_assoc() ) {
				#dump($row, ' row ++ '.to_string());

				if ($row['Field']==='id') {
					continue;	// Skip id field always
				}

				if ($full) {
					$ar_columns[] = $row;
				}else{
					$ar_columns[] = $row['Field'];
				}			
			}

			return (array)$ar_columns;
		}//end get_table_fields



		/**
		* GET_TABLES_INFO
		* @return 
		*/
		public static function get_tables_info( $full=false ) {

			$tables_info = new stdClass();

			$ar_tables = self::get_all_tables();
			foreach ($ar_tables as $table) {

				$table_fields = self::get_table_fields( $table, $full);
				
				$tables_info->{$table} = $table_fields;			
			}

			return (object)$tables_info;
		}//end get_tables_info



		/**
		* GET_TABLES_INFO_REMOTE
		* @return 
		*/
		private static function get_tables_info_remote() {

			# Defined in config
			$trigger_url = JSON_TRIGGER_URL;

			#
			# FROM JSON URL IN SERVER SIDE
			$url = $trigger_url . '?options=' . urlencode( json_encode($request_options) );
				#dump($url, ' url ++ '.to_string());
			$search_data_records_file 	= file_get_contents($url) ;
				#dump($search_data_records_file, ' $search_data_records_file ++ '.to_string());
			$search_data_records 		= json_decode( $search_data_records_file, false, 512, JSON_UNESCAPED_UNICODE );
				#dump($search_data_records, ' search_data_records ++ '.to_string()); die();		
		}//end get_tables_info_remote



		/**
		* GET_POSTERFRAME_FROM_VIDEO
		* @return string
		*/
		protected static function get_posterframe_from_video( $video_url ) {
			return str_replace(array('/'.DEDALO_AV_QUALITY_DEFAULT.'/','.mp4'), array('/posterframe/','.jpg'), $video_url);
		}//end get_posterframe_from_video



		/**
		* POSTPROCESS_FIELD
		* Aply process to field data
		* Example: Remove tags from video transcription raw text
		* @return mixed $data
		*/
		private static function postprocess_field($field_name, $data) {
			
			switch ($field_name) {
				case 'rsc36': // Transcription text
					$data = TR::deleteMarks($data);
					break;
				
				default:
					# Nothing to do here
					break;
			}

			return $data;
		}//end postprocess_field



	/**
	* GET_REEL_TERMS
	* Resuelve TODOS los términos utilizados en la transcripción de la cinta/s dada/s
	* @param string $av_section_id (one or various separated by comma)
	* @return 
	*/
	public static function get_reel_terms( $request_options ) {
		#dump($request_options, ' $request_options ++ '.to_string());

		$options = new stdClass();
			$options->av_section_id = null;
			$options->lang 			= WEB_CURRENT_LANG_CODE;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$ar_restricted_terms = json_decode(AR_RESTRICTED_TERMS);

		$TRANSCRIPTION_TIPO 		= TRANSCRIPTION_TIPO;
		$AUDIOVISUAL_SECTION_TIPO 	= AUDIOVISUAL_SECTION_TIPO;
		
		$ar_filter = array();
		$ar = explode(',', $options->av_section_id);
		foreach ($ar as $current_av_section_id) {
			$current_av_section_id = trim($current_av_section_id);
			$ar_filter[] = "`indexation` LIKE '%\"section_id\":\"$current_av_section_id\",\"section_tipo\":\"$AUDIOVISUAL_SECTION_TIPO\",\"component_tipo\":\"$TRANSCRIPTION_TIPO\"%'";
			#$ar_filter[] = "MATCH (`indexation`) AGAINST ('\"section_id\":\"$current_av_section_id\",\"section_tipo\":\"$AUDIOVISUAL_SECTION_TIPO\",\"component_tipo\":\"$TRANSCRIPTION_TIPO\"')";
		}
		$sql_filter = implode(' OR ', $ar_filter);


		$response = new stdClass();
			$response->result 	= false;
			#$response->msg 		= 'Error. Request failed (get_reel_terms)';
		
		// Format: "section_top_id":"30","section_tipo":"rsc167","section_id":"39"
		
		$s_options = new stdClass();
			$s_options->table 		= (string)TABLE_THESAURUS;
			$s_options->ar_fields 	= array(FIELD_TERM_ID,FIELD_TERM,'indexation');
			$s_options->lang 		= $options->lang;
			$s_options->order 		= FIELD_TERM ." ASC";
			#$s_options->sql_filter 	= (string)"`index` LIKE '%\"section_id\":\"$av_section_id\",\"component_tipo\":\"$TRANSCRIPTION_TIPO\"%'" . PUBLICACION_FILTER_SQL;
			$s_options->sql_filter 	= (string)$sql_filter;

		$rows_data	= (object)web_data::get_rows_data( $s_options );
			#dump($rows_data, ' rows_data ++ '.to_string());

		$ar_termns = array();
		if (is_array($rows_data->result)) foreach($rows_data->result as $key => $value) {
			
			$term_id  	= $value[FIELD_TERM_ID];
			$indexation = json_decode($value['indexation']);

			# Skip optional restricted terms (defined in config)
			if (in_array($term_id, $ar_restricted_terms)) {
				continue;
			}

			# Skip already included (dumplicates)
			if (isset($ar_termns[$term_id])) {
				continue;
			}

			# Calculate locators
			$current_locators = array();
			foreach ((array)$indexation as $c_locator) {
				if ($c_locator->section_tipo===$AUDIOVISUAL_SECTION_TIPO && in_array($c_locator->section_id, $ar)) {
					$current_locators[] = $c_locator;
				}
			}

			$term_data = new stdClass();
				$term_data->term_id  = $term_id;
				$term_data->term 	 = $value[FIELD_TERM];
				$term_data->locators = $current_locators;
			$ar_termns[] = $term_data;
		}
		#dump($ar_termns, ' $ar_termns ++ '.to_string());

		$response->result = $ar_termns;
		#$response->msg 	  = 'Request done successfully';


		return (object)$response;
	}//end get_reel_terms



	/**
	* GET_FRAGMENT_FROM_INDEX_LOCATOR
	* Calculate all fragaments indexed with this locator 
	* @param object | string $index_locator
	*	$index_locator can be a php object or a json string representation of the object
	* @return object $response
	*/
	public static function get_fragment_from_index_locator( $request_options ) {

		$options = new stdClass();
			$options->index_locator  = null;
			$options->lang 			 = WEB_CURRENT_LANG_CODE;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}
	
		$response = new stdClass();
			$response->result 	= false;
			#$response->msg 		= 'Error. Request failed (get_fragment_from_index_locator)';
		
		#$index_locator = '{"type":"dd96","tag_id":"1","section_id":"1","section_tipo":"rsc167","component_tipo":"rsc36","section_top_id":"1","section_top_tipo":"oh1","from_component_tipo":"hierarchy40"}';
		# Locator like:
		# {"type":"dd96","tag_id":"1","section_id":"1","section_tipo":"rsc167","component_tipo":"rsc36","section_top_id":"1","section_top_tipo":"oh1","from_component_tipo":"hierarchy40"}
		
		$index_locator = $options->index_locator;
		if (is_object($index_locator)) {
			$locator = $index_locator;
		}else{
			$locator = json_decode($index_locator);
		}		
		$av_section_id 	= $locator->section_id;
		$tag_id 		= $locator->tag_id;

		#
		# AUDIOVISUAL DATA 
		# Raw text
		$s_options = new stdClass();
			$s_options->table 	 			= TABLE_AUDIOVISUAL;
			$s_options->ar_fields 			= array(FIELD_VIDEO, FIELD_TRANSCRIPTION);
			$s_options->lang  	 			= $options->lang;
			$s_options->sql_filter 			= '`section_id` = '.$av_section_id;
			$s_options->apply_postprocess 	= false; // Avoid clean text on false
			
		$rows_data	= (object)web_data::get_rows_data( $s_options );
			#dump($rows_data, ' rows_data ++ '.to_string($locator));

		if (empty($rows_data->result)) {
			return null;
		}

		$raw_text  = reset($rows_data->result)[FIELD_TRANSCRIPTION];
		$video_url = reset($rows_data->result)[FIELD_VIDEO];	
	
		#
		# FRAGMENT DATA 
		# Create fragment and tesaurus associated	
		$f_options = new stdClass();			
			$f_options->tag_id 		 	= $tag_id;
			$f_options->raw_text 		= $raw_text;
			$f_options->av_section_id  	= $av_section_id;
			$f_options->lang 		  	= $options->lang;
			$f_options->component_tipo 	= AV_TIPO;
			$f_options->section_tipo 	= $locator->section_tipo;
			
			$fragments_obj = web_data::build_fragment( $f_options );				
				#dump($fragments_obj, ' fragments_obj ++ '.to_string( $av_section_id )); #die();


		$response->result = $fragments_obj;
		#$response->msg    = 'Request done successfully';

		return (object)$response;
	}//end get_fragment_from_index_locator



	/**
	* GET_INDEXATION_TERMS
	* Calculate all terms used in current indexation
	* @return object $rows_data
	*/
	public static function get_indexation_terms( $tag_id, $av_section_id, $lang ) {
		/*
		$AUDIOVISUAL_SECTION_TIPO 	= AUDIOVISUAL_SECTION_TIPO;

		$options = new stdClass();
			$options->table 		= (string)TABLE_THESAURUS;
			$options->ar_fields 	= array('term_id',FIELD_TERM);
			$options->lang 			= $lang;
			$options->order 		= null;
			#$options->sql_filter 	= (string)"`index` LIKE '%\"section_id\":\"$av_section_id\",\"component_tipo\":\"$TRANSCRIPTION_TIPO\",\"tag_id\":\"$tag_id\"%'" . PUBLICACION_FILTER_SQL;
			// "type":"dd96","tag_id":"1","section_id":"22","section_tipo":"rsc167","component_tipo":"rsc36","section_top_id":"17","section_top_tipo":"oh1","from_component_tipo":"hierarchy40"
			# {"type":"dd96","tag_id":"10","section_id":"9","section_tipo":"rsc167","component_tipo":"rsc36","section_top_id":"9","section_top_tipo":"oh1","from_component_tipo":"hierarchy40"}
			$options->sql_filter 	= (string)"`indexation` LIKE '%\"type\":\"dd96\",\"tag_id\":\"$tag_id\",\"section_id\":\"$av_section_id\",\"section_tipo\":\"$AUDIOVISUAL_SECTION_TIPO\"%'" . PUBLICACION_FILTER_SQL;

		$rows_data	= (object)web_data::get_rows_data( $options );
			#dump($rows_data, ' rows_data ++ '.to_string($tag_id));

		$AR_RESTRICTED_TERMS = json_decode(AR_RESTRICTED_TERMS);
		foreach ($rows_data->result as $key => $value) {
			# Remove restricted terms
			if (in_array($value['term_id'], $AR_RESTRICTED_TERMS)) {
				unset($rows_data->result[$key]);
			}
		}
		# Reset array keys
		$rows_data->result = array_values($rows_data->result);
		*/
		
		# Unified version
		$locator = new locator();
			$locator->set_tag_id($tag_id);
			$locator->set_section_id($av_section_id);
			$locator->set_section_tipo(AUDIOVISUAL_SECTION_TIPO);			
		
		$rows_data = web_data::get_indexation_terms_multiple( array($locator), $lang );

		return $rows_data;
	}//end get_indexation_terms



	/**
	* GET_INDEXATION_TERMS_multiple
	* Calculate all terms used in current indexations
	* @return object $rows_data
	*/
	public static function get_indexation_terms_multiple( $locators, $lang ) {

		$AUDIOVISUAL_SECTION_TIPO 	= AUDIOVISUAL_SECTION_TIPO;

		$options = new stdClass();
			$options->table 		= (string)TABLE_THESAURUS;
			$options->ar_fields 	= array('term_id',FIELD_TERM);
			$options->lang 			= WEB_CURRENT_LANG_CODE;
			$options->order 		= null;
			#$options->sql_filter 	= (string)"`index` LIKE '%\"section_id\":\"$av_section_id\",\"component_tipo\":\"$TRANSCRIPTION_TIPO\",\"tag_id\":\"$tag_id\"%'" . PUBLICACION_FILTER_SQL;
			// "type":"dd96","tag_id":"1","section_id":"22","section_tipo":"rsc167","component_tipo":"rsc36","section_top_id":"17","section_top_tipo":"oh1","from_component_tipo":"hierarchy40"
			# {"type":"dd96","tag_id":"10","section_id":"9","section_tipo":"rsc167","component_tipo":"rsc36","section_top_id":"9","section_top_tipo":"oh1","from_component_tipo":"hierarchy40"}
			$ar_filter = array();
			foreach ((array)$locators as $key => $locator) {

				$tag_id 	 	 = $locator->tag_id;
				$av_section_id 	 = $locator->section_id;
				$av_section_tipo = $locator->section_tipo;

				$ar_filter[] = "`indexation` LIKE '%\"type\":\"dd96\",\"tag_id\":\"$tag_id\",\"section_id\":\"$av_section_id\",\"section_tipo\":\"$av_section_tipo\"%'";				
			}
			$options->sql_filter = implode(" OR ",$ar_filter);
			
		$rows_data	= (object)web_data::get_rows_data( $options );
			#dump($rows_data, ' rows_data ++ '.to_string($tag_id));

		$AR_RESTRICTED_TERMS = json_decode(AR_RESTRICTED_TERMS);
		foreach ($rows_data->result as $key => $value) {
			# Remove restricted terms
			if (in_array($value['term_id'], $AR_RESTRICTED_TERMS)) {
				unset($rows_data->result[$key]);
			}
		}
		# Reset array keys
		$rows_data->result = array_values($rows_data->result);

		return $rows_data;
	}//end get_indexation_terms_multiple



	/**
	* BUILD_FRAGMENT
	* Get fragment text from tag. Used in search_thematic
	* @param object options
	* @return object $result
	*	$result->fragment string. Clean text without tags
	*	$result->tcin_secs int. Seconds for video cut in
	*	$result->tcin_secs int. Seconds for video cut out
	*	$result->video_url string. Full video path with tc in and out vars	
	*/
	public static function build_fragment( $request_options ) {

		$options = new stdClass();
			$options->tag_id   		 		= null;
			$options->lang   		 		= WEB_CURRENT_LANG_CODE;
			$options->raw_text 		 		= null;
			$options->av_section_id  		= null;
			$options->component_tipo 	 	= null;
			$options->section_tipo 	 	 	= null;
			$options->video_url 	 	 	= null; # Like 'http://mydomain.org/dedalo/media/av/404/'
			$options->margin_seconds_in  	= null;
			$options->margin_seconds_out 	= null;
			$options->fragment_terms_inside = false; # If true, calculate terms indexed inide this fragment 
			$options->indexation_terms 		= false; # If true, calculate all terms used in this indexation
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$result = new stdClass();
	
		# Video filename ()
		if (is_null($options->video_url)) {
			$base_url 	= WEB_VIDEO_BASE_URL;
			$file_name  = $options->component_tipo.'_'.$options->section_tipo.'_'.$options->av_section_id.'.mp4';// Like : rsc35_rsc167_1
			$av_path 	= $base_url .'/'. $file_name;
		}else{
			$av_path  	= $options->video_url;
		}

		$tag_in  = TR::get_mark_pattern('indexIn',  $standalone=false, $options->tag_id, $data=false);
		$tag_out = TR::get_mark_pattern('indexOut', $standalone=false, $options->tag_id, $data=false);

		# Build in/out regex pattern to search
		$regexp = $tag_in ."(.*)". $tag_out;
	
		# Search fragment_text
			# Dato raw from matrix db
			$dato = $options->raw_text;

			mb_internal_encoding('UTF-8');

			# PREG_MATCH_ALL
			$preg_match_all_result = preg_match_all("/$regexp/", $dato, $matches, PREG_SET_ORDER|PREG_OFFSET_CAPTURE);
			#dump($matches, ' matches ++ '.to_string($regexp));
			if( !empty($preg_match_all_result) ) {
				#dump($matches,'$matches');

				$fragment_inside_key = 3;
				$tag_in_pos_key 	 = 1;
				$tag_out_pos_key 	 = 4;

				foreach($matches as $match) {
					
					if (isset($match[$fragment_inside_key][0])) {

						$fragment_text = $match[$fragment_inside_key][0];

						$fragment_text_raw = $fragment_text;

						# Clean fragment_text
						$fragment_text = TR::deleteMarks($fragment_text);
						#$fragment_text = self::decode_dato_html($fragment_text);

						# tag in position
						$tag_in_pos = $match[$tag_in_pos_key][1];

						# tag out position
						#$tag_out_pos = $tag_in_pos + strlen($match[0][0]);
						$tag_out_pos = $match[$tag_out_pos_key][1];

						# TC . Localizamos los TC apropiados
						$tcin  = OptimizeTC::optimize_tcIN($options->raw_text, false, $tag_in_pos, $pos_in_margin=0);
						$tcout = OptimizeTC::optimize_tcOUT($options->raw_text, false, $tag_out_pos, $pos_in_margin=0);

						$tcin_secs 	= OptimizeTC::TC2seg($tcin);
						$tcout_secs = OptimizeTC::TC2seg($tcout);

						# TC MARGINS (Optionals)
						if (!is_null($options->margin_seconds_in)) {
							$tcin_secs  = OptimizeTC::tc_margin_seconds('in',  $tcin_secs,  $options->margin_seconds_in);
						}
						if (!is_null($options->margin_seconds_out)) {
							$tcout_secs = OptimizeTC::tc_margin_seconds('out', $tcout_secs, $options->margin_seconds_out);
						}						

						// VIDEO_URL Like: /dedalo/media/av/404/rsc35_rsc167_1.mp4?vbegin=0&vend=42
						#$video_url = $base_url.'/'.$file_name.'?vbegin='.$tcin_secs.'&vend='.$tcout_secs;
						$video_url = $av_path.'?vbegin='.floor($tcin_secs).'&vend='.ceil($tcout_secs);
						
						
						$result->fragm 			= $fragment_text;
						#$result->fragm_raw 	= $fragment_text_raw;
						$result->video_url		= $video_url;
						#$result->terms 		= array();	// For unify object response only			        	
						#$result->tcin 			= $tcin;
						#$result->tcout 		= $tcout;
						$result->tcin_secs 		= $tcin_secs;
						$result->tcout_secs 	= $tcout_secs;

						
						# FRAGMENT_TERMS INSIDE . Sacamos todas las indexaciones y tesauros asociados que incluyen a esta indexacion						
						if ($options->fragment_terms_inside===true) {
							# Array of terms in current fragment
							$fragment_before = $fragment_after = $fragment_text_raw;
							$result->fragment_terms_inside = free_node::get_fragment_terms( $options->av_section_id, $fragment_before, $fragment_after, $options->lang );
						}
						
						# INDEXATION_TERMS . Sacamos todos los término de esta indexacion				
						if ($options->indexation_terms===true) {
							$result->terms = web_data::get_indexation_terms( $options->tag_id, $options->av_section_id, $options->lang )->result ;
						} 

						return (object)$result;
					}
				}//end foreach($matches as $match) {
			}

		return null;
	}//end build_fragment



	/**
	* REMOVE_RESTRICTED_TEXT
	* @return string $text;
	*/
	public static function remove_restricted_text( $raw_text, $av_section_id ) {
		
		$text = $raw_text;	// Untouched by default
			#dump($text, ' text ++ '.to_string());
		//return $text;

		# Clean text
		#$text = TR::deleteMarks($text, $deleteTC=true, $deleteIndex=true);
		#$text = self::decode_dato_html($text);
			#dump($text, ' text ++ '.to_string());
	
		$ar_restricted_fragments = self::get_ar_restricted_fragments( $av_section_id );
			#dump($ar_restricted_fragments, ' ar_restricted_fragments ++** '.to_string($av_section_id)); #die();
		foreach ($ar_restricted_fragments as $key => $fragm_obj) {
			if (!isset($fragm_obj->fragment)) {
				continue;
			}
			#dump($fragm_obj->fragment, ' fragment ++ '.to_string());
			$text = str_replace($fragm_obj->fragment, ' *** ', $text, $count);
			if(SHOW_DEBUG) {
				error_log("Replaced $count concurrences of fragment (reel $av_section_id - $key)");
			}
		}
		#dump($text, ' text ++ '.to_string()); die();

		return $text;
	}#end remove_restricted_text



	/**
	* GET_AR_RESTRICTED_FRAGMENTS
	* Calcula toda la información (text fragment, tc's, etc.) de los fragmentos restringidos en esta cinta
	* @return array
	*/
	public static function get_ar_restricted_fragments( $section_id ) {
		
		static $ar_restricted_fragments;
		if (isset($ar_restricted_fragments[$section_id])) {
			if(SHOW_DEBUG) {
				error_log(__METHOD__." Result from cache $section_id");
			}
			return $ar_restricted_fragments[$section_id];
		}

		$ar_fragments_from_reel = self::get_ar_fragments_from_reel( $section_id, TERM_ID_RESTRICTED );
			#dump($ar_fragments_from_reel, ' $ar_fragments_from_reel ++ '.to_string(TERM_ID_RESTRICTED));
		
		if(isset($ar_fragments_from_reel[TERM_ID_RESTRICTED])) {
			foreach ($ar_fragments_from_reel[TERM_ID_RESTRICTED] as $current_locator) {
				$fragment_data = self::get_fragment_data( $section_id, $current_locator->tag_id );
				$ar_restricted_fragments[$section_id][] = $fragment_data;
			}
		}else{
			$ar_restricted_fragments[$section_id] = array();
		}
		#dump($ar_restricted_fragments[$section_id], ' ar_restricted_fragments ++ '.to_string());


		return (array)$ar_restricted_fragments[$section_id];
	}#end get_ar_restricted_fragments



	/**
	* GET_FRAGMENT_DATA
	* Calcula toda la información relativa a un fragmento en base a los datos dados ($section_id, $tag_id)
	* @see search_thematic::build_fragment
	* @return object
	*/
	public static function get_fragment_data( $av_section_id, $tag_id ) {
		
		# TRANSCRIPTION
		$options = new stdClass();
			$options->table 		= (string)TABLE_AUDIOVISUAL;
			$options->ar_fields 	= array(FIELD_TRANSCRIPTION);
			$options->sql_filter 	= "section_id = $av_section_id AND lang = '".WEB_CURRENT_LANG_CODE."' " . PUBLICACION_FILTER_SQL;
			$options->order 		= null;
			$options->limit 		= null;		
			
			$rows_data = (object)web_data::get_rows_data( $options );
				#dump($rows_data, ' rows_data'); die();

		if(empty($rows_data->result)) {
			return null;
		}
		$raw_text = reset($rows_data->result)[FIELD_TRANSCRIPTION];
			#dump($raw_text, ' $raw_text ++ '.to_string($options)); die();

		# FRAGMENTS

		#
		# FRAGMENT DATA 
		# Create fragment and tesaurus associated	
		$options = new stdClass();
			$options->tag_id 			 = $tag_id;
			$options->av_section_id  	 = $av_section_id;
			$options->component_tipo 	 = DEDALO_COMPONENT_RESOURCES_AV_TIPO;
			$options->section_tipo 	 	 = DEDALO_SECTION_RESOURCES_AV_TIPO;
			$options->video_url 	 	 = '';	//$video_url; # Like 'http://mydomain.org/dedalo/media/av/404/'
			$options->margin_seconds_in  = null;
			$options->margin_seconds_out = null;
			$options->raw_text 			 = $raw_text;
		
			$fragments_obj = web_data::build_fragment( $options );
				#dump($fragments_obj, ' fragments_obj ++ '.to_string()); die();

		return $fragments_obj;
	}#end get_fragment_data



	/**
	* GET_AR_FRAGMENTS_FROM_REEL
	* Calcula los locators (por tanto los tags) de las indexaciones hacia esta cinta y los agrupa por terminoID	
	* Nótese el orden del filtro, que busca en un array de locators codificado json como string de tipo:
	* 	[{"section_top_tipo":"oh1","section_top_id":"30","section_tipo":"rsc167","section_id":"39","component_tipo":"rsc36","tag_id":"25"}]
	* Se usa por ejemplo para despejar los fragmentos restringidos dentro de una transcripción
	* E.g.
	* [rt1] => Array
	*    (
	*        [0] => stdClass Object
	*            (
	*                [section_top_tipo] => oh1
	*                [section_top_id] => 2
	*                [section_tipo] => rsc167
	*                [section_id] => 2
	*                [component_tipo] => rsc36
	*                [tag_id] => 69
	*            )
	* @return array $ar_locators
	*/
	public static function get_ar_fragments_from_reel( $section_id, $term_id=false, $section_tipo=AUDIOVISUAL_SECTION_TIPO) {	
		// "section_id":"40","section_tipo":"rsc167","component_tipo":"rsc36"
		#$filter = "(`index` LIKE '%\"section_tipo\":\"$section_tipo\",\"section_id\":\"$section_id\"%')";
		$filter = "(`indexation` LIKE '%\"section_id\":\"$section_id\",\"section_tipo\":\"$section_tipo\"%')";

		if ($term_id) {
			$filter = "`term_id` = '$term_id' AND $filter ";
		}

		$options = new stdClass();
			$options->table 		= (string)TABLE_THESAURUS;
			$options->ar_fields 	= array('indexation','term_id');
			$options->sql_filter 	= $filter; 	// !IMPORTANT : NEVER USE PUBLICATION FILTER HERE // ." AND lang = '".WEB_CURRENT_LANG_CODE."' "
			$options->lang 			= WEB_CURRENT_LANG_CODE;
			$options->order 		= null;
			$options->limit 		= null;		
			
			$rows_data = (object)web_data::get_rows_data( $options );
				#dump($rows_data, ' rows_data - term_id: '.$term_id); #die();

		if (empty($rows_data->result)) {
			return array(); // Current reel dont have relations with this term
		}		

		$ar_locators = array();
		foreach ((array)$rows_data->result as $ar_value) {

			$current_term_id 	= $ar_value['term_id'];
			$ar_index  			= json_decode($ar_value['indexation']);
				#dump($ar_index, ' ar_index ++ '.to_string());
			foreach ((array)$ar_index as $key => $locator) {
				if ($locator->section_tipo==$section_tipo && $locator->section_id==$section_id) {					
					$ar_locators[$current_term_id][] = $locator;
				}
			}			
		}
		#dump($ar_locators, ' ar_locators ++ '.to_string()); die();
		
		return $ar_locators;
	}#end get_ar_fragments_from_reel



	/* THESAURUS
	----------------------------------------------------------------------- */



		/**
		* GET_THESAURUS_ROOT_LIST
		* Return a array of 'ts_term' objects with resolved data
		* You can use only the data or (in PHP) manage 'ts_term' objects
		* to build custom html
		* @return array $ar_ts_terms
		*	ts_terms objects are instances of ts_terms.class element
		*/
		public static function get_thesaurus_root_list( $request_options ) {
			// Globals from config
			global $table_thesaurus_map;
			
			$options = new stdClass();
				$options->table  			= (string)TABLE_THESAURUS;
				$options->parents  			= false;
				$options->exclude_tld 		= array("xx");
				$options->lang 		 		= WEB_CURRENT_LANG_CODE;
				$options->order 			= 'norder ASC';
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}
			
			if ($options->parents!==false) {
				# CUSTOM PARENTS
				$ar_value = array();
				foreach ((array)$options->parents as $parent) {

					$ar  = explode('_', $parent);
					$tld = $ar[0];
					if ($tld==='hierarchy1') {
						$tld = $parent; // Full like hierarchy1_246
											
						# Resolve parent term name
						$options_hierarchy = new stdClass();
							$options_hierarchy->table 		= TABLE_HIERARCHY;
							$options_hierarchy->ar_fields 	= array('name');
							$options_hierarchy->lang 	 	= WEB_CURRENT_LANG_CODE;
							$options_hierarchy->sql_filter  = "`section_id` = ".(int)$ar[1];
							$options_hierarchy->limit 		= 1;
							$options_hierarchy->order 		= '';
						$rows_data	= (object)web_data::get_rows_data( $options_hierarchy );
							#dump($rows_data, ' rows_data ++ '.to_string($options_hierarchy));
						$parent_term = reset($rows_data->result)['name'];

					}else{
						
						# Resolve parent term name
						$options_hierarchy = new stdClass();
							$options_hierarchy->table 		= $options->table;
							$options_hierarchy->ar_fields 	= array('term');
							$options_hierarchy->lang 	 	= WEB_CURRENT_LANG_CODE;
							$options_hierarchy->sql_filter  = "`section_id` = ".(int)$ar[1];
							$options_hierarchy->limit 		= 1;
							$options_hierarchy->order 		= '';
						$rows_data	= (object)web_data::get_rows_data( $options_hierarchy );
							#dump($rows_data, ' rows_data ++ '.to_string($options_hierarchy));
						$parent_term = reset($rows_data->result)['term'];
					}					

					$ar_value[] = array('tld'=>$tld, 'term_id'=>$parent, 'term'=>$parent_term );
				}
				$rows_data = new stdClass();
					$rows_data->result = $ar_value;
			}else{
				# DISTINCT TESAURUS (TLD)
					# Get all different thesaurus tld
					$rd_options = new stdClass();
						$rd_options->table 		= $options->table;
						$rd_options->ar_fields 	= array('DISTINCT tld AS tld');
						$rd_options->order 		= $options->order;

					$rows_data	= (object)web_data::get_rows_data( $rd_options );
						#dump($rows_data, ' rows_data ++ '.to_string($rd_options)); die();
			}
			#dump($rows_data, ' rows_data ++ '.to_string());
			
			
			# THESAURUS ROOT LEVEL TERMS
				# Get data from each term
				$ar_ts_terms=array();
				$ar_restricted_terms = json_decode(AR_RESTRICTED_TERMS);
				foreach ((array)$rows_data->result as $ar_value) {

					$current_tld = $ar_value['tld'];
						# Skip excluded tlds
						if (in_array($current_tld, $options->exclude_tld)) {
							continue;
						}

					# term_id
					if ($options->parents!==false) {
						$term_id = $ar_value['term_id'];
					}else{
						$term_id = $current_tld.'_1';	// NÓTESE QUE SIEMPRE USAMOS '1' COMO ROOT EN LUGAR DE '0'
					}

					# Skip optional restricted terms (defined in config)
					if (in_array($term_id, $ar_restricted_terms)) {
						continue;
					}

					# Table optimized version contains only possible table instead all tables (reduce union query time)
					$thesaurus_table = $options->table;
					foreach ($table_thesaurus_map as $tkey => $tvalue) {
						if (strpos($term_id, $tkey)===0) {
							$thesaurus_table = $tvalue; break;
						}
					}
					#dump($thesaurus_table, ' thesaurus_table ++ '.to_string($term_id));

					$ar_children = ts_term::get_ar_children($term_id, $thesaurus_table);
						#dump($thesaurus_table, '$thesaurus_table ++ '.to_string());
	
					foreach ($ar_children as $current_term_id) {

						# Skip optional restricted terms (defined in config)
						if (in_array($current_term_id, $ar_restricted_terms)) {
							continue;
						}	

						# Create a object 'ts_term' and get term info
						$ts_term_options = new stdClass();
							$ts_term_options->table 	  = $thesaurus_table;
							$ts_term_options->parent_term = $ar_value['term'];
						$ts_term = ts_term::get_ts_term_instance($current_term_id, $options->lang , $ts_term_options);
	#dump($ts_term, ' ts_term ++ '.to_string());
						# Force to load data from database
						$ts_term->load_data();

						# Add to array
						$ar_ts_terms[$current_tld][] = $ts_term;
					}		

				}//end foreach ((array)$rows_data->result) as $current_tld) {
				#dump($ar_ts_terms, ' $ar_ts_terms ++ '.to_string()); #die();

			$response = new stdClass();
				$response->result 	= (array)$ar_ts_terms;

			return $response;
		}//end get_thesaurus_root_list



		/**
		* GET_THESAURUS_RANDOM_TERM
		* Return a random term from thesaurus tables
		* @return string $random_term
		*/
		public static function get_thesaurus_random_term( $request_options ) {
		
			$options = new stdClass();
				$options->table  	 			 = (string)TABLE_THESAURUS;
				$options->exclude_tld 			 = array("xx");
				$options->lang 		 			 = WEB_CURRENT_LANG_CODE;
				$options->publicacion_filter_sql = '';
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$field_term 	= FIELD_TERM;
			$field_term_id 	= FIELD_TERM_ID;
			
			$exclude_filter = '';
			$ar = array();
			foreach ($options->exclude_tld as $tld) {
				$ar[] = "tld != '$tld'";
			}
			$exclude_filter = ' AND ('.implode(' AND ',$ar).')';

			$lang_filter 	= " AND lang = '".$options->lang."' ";			

			#
			# RANDOM TERM
			$sd_options = new stdClass();
				$sd_options->table 		= $options->table;
				$sd_options->ar_fields 	= array($field_term, $field_term_id,'indexation');
				$sd_options->sql_filter = "(`indexation` != '' AND `indexation` != '[]') ". $lang_filter . $exclude_filter . $options->publicacion_filter_sql;
				$sd_options->order 		= "RAND()";
				$sd_options->limit 		= 1;
			$search_data	= (object)web_data::get_rows_data( $sd_options );

			$row = reset($search_data->result);					

			$response = new stdClass();
				$response->term 		= $row[$field_term];
				$response->term_id 		= $row[$field_term_id];
				$response->indexation 	= $row['indexation'];

			return (object)$response;
		}//end get_thesaurus_random_term



		/**
		* GET_THESAURUS_SEARCH
		* @return object $response
		*	$response->search_data stdClass 
		*	$response->ar_ts_terms array of 'ts_term' objects 
		*	$response->ar_highlight array of terms located in search
		*/
		public static function get_thesaurus_search( $request_options ) {

			$options = new stdClass();
				$options->q 					 = false;
				$options->table 	 	 		 = TABLE_THESAURUS;
				$options->lang 					 = WEB_CURRENT_LANG_CODE;
				$options->rows_per_page 		 = 1;
				$options->page_number 			 = 1;
				$options->exclude_tld 			 = array("xx");
				$options->tree_root 			 = 'last_parent'; # first_parent | last_parent	
				$options->publicacion_filter_sql = '';					
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$field_term = FIELD_TERM;		
					
			# Offset
			$offset = 0;
			if ($options->page_number>1) {
				$offset = ($options->page_number-1) * $options->rows_per_page;
			}
			
			# Search in DDBB
			$rd_options = new stdClass();
				$rd_options->table 			= $options->table;
				$rd_options->ar_fields 		= array('*');
				#$rd_options->ar_fields 	= array('section_id','descriptor','tld','term_id',FIELD_TERM,'index','lang','childrens','related','time','space','code');
				$rd_options->sql_filter 	= $field_term ." LIKE '%".$options->q."%' " . $options->publicacion_filter_sql;
				$rd_options->lang 			= $options->lang;
				$rd_options->order 			= null;			
				$rd_options->limit 			= $options->rows_per_page;
				$rd_options->offset 		= $offset;
				$rd_options->count 			= true;
			$search_data = (object)web_data::get_rows_data( $rd_options );
	
			# Safe descriptors 
			foreach ($search_data->result as $key => $value_obj) {
				#dump((object)$value_obj, ' $value_obj ++ '.to_string());
				$search_data->result[$key] = (array)web_data::no_descriptor_to_descriptor( (object)$value_obj );
			}
			#dump($search_data, ' search_data ++ '.to_string());		

			# Add vars for pagination
			$search_data->page_number 	 = $options->page_number;
			$search_data->rows_per_page  = $options->rows_per_page;
			
			$ar_ts_terms=array();
			$ar_highlight=array();
			foreach ((array)$search_data->result as $ar_value) {
			
				$tld 		= $ar_value['tld'];
				$term_id 	= $ar_value['term_id'];
				$term 		= $ar_value[$field_term];
				$parent 	= $ar_value['parent'];
				$descriptor = $ar_value['descriptor']; // es descriptor: no | yes
				$indexation = $ar_value['indexation'];

				#
				# AR_PARENT . PATH OF ALL PARENTS KRSORTED
				$ar_parent = ts_term::get_ar_parent( $parent, $tld );
					#dump($ar_parent, ' ar_parent ++ '.to_string());

				###
				/*if (reset($ar_parent)) {	// Important. Keys ar not numerics. Don't use '$ar_parent[0]'
					$first_parent = reset($ar_parent);
				}else{
					$first_parent = $parent;
				}

				$ts_term = ts_term::get_ts_term_instance($first_parent, $options->lang, $options_ts_term=null);						
				$ts_term->load_data(); // Force load db data	
				$ar_ts_terms[$tld][] = $ts_term;*/
				###

				/*
				foreach ($ar_parent as $key => $cparent) {
					if (strpos($cparent, 'hierarchy')!==false) continue;
					$ts_term 			 = ts_term::get_ts_term_instance($cparent, $options->lang, $options_ts_term=null);						
					$ar_ts_terms[$tld][] = $ts_term;
					break; // Stop in first level
				}*/

				#
				# ROOT_PARENT
				# Select parent from create tree
				# Can be 'first_parent' to create complete tree from root to searched term (x levels) and
				# 'last_parent' for create the tree only from precedent term (1 level)
				if ($options->tree_root==='first_parent') {
					$root_parent = reset($ar_parent);
				}else{
					$root_parent = end($ar_parent);
				}

				if (empty($root_parent)) {
					# No root parent case. If parent is empty set current term as first root element
					$ts_term_options = new stdClass();
						$ts_term_options->table = $options->table;
						#$ts_term_options->term 		 = $term;
						#$ts_term_options->indexation = $indexation;
					$ts_term 			 = ts_term::get_ts_term_instance($term_id, $options->lang, $ts_term_options);
					$ts_term->load_data(); // Force load db data
					$ar_ts_terms[$tld][] = $ts_term;
				
				}else{
					# Normal case
					$ts_term_options = new stdClass();
						$ts_term_options->table 	 = $options->table;
						#$ts_term_options->term 		 = $term;
						#$ts_term_options->indexation = $indexation;
					$ts_term 			 = ts_term::get_ts_term_instance($root_parent, $options->lang, $ts_term_options);
					$ts_term->load_data(); // Force load db data
					$ar_ts_terms[$tld][] = $ts_term;
				}				
				

				# highlight add
				$ar_highlight[] = $term_id;
				break;
			}//end foreach ((array)$search_data->result) as $tld) 
			#dump($ar_ts_terms, ' ar_ts_terms ++ '.to_string()); die();

			$response = new stdClass();
				$response->search_data 	= $search_data;
				$response->ar_ts_terms 	= $ar_ts_terms;
				$response->ar_highlight = $ar_highlight;
				$response->ar_parent 	= $ar_parent;		
			#dump($response, ' response ++ '.to_string()); #exit();

			return $response;
		}//end get_thesaurus_search



		/**
		* NO_DESCRIPTOR_TO_DESCRIPTOR
		* @return 
		*/
		public static function no_descriptor_to_descriptor( $term_obj ) {
			#dump($term_obj, ' term_obj ++ '.to_string());

			if (!isset($term_obj->descriptor) || $term_obj->descriptor!=='no') {
				# Term is descriptor
				$descriptor_obj = $term_obj;
			}else{
				# Term is NOT descriptor
				# Search parent descriptor
				# Search in DDBB
				$rd_options = new stdClass();
					$rd_options->table 			= $term_obj->table;
					$rd_options->ar_fields 		= array('*');
					$rd_options->sql_filter 	= FIELD_TERM_ID ." = '$term_obj->parent'";
					$rd_options->lang 			= $term_obj->lang;
					$rd_options->order 			= null;			
					$rd_options->limit 			= 1;					
				$search_data = (object)web_data::get_rows_data( $rd_options );

				if (!empty($search_data->result)) {
					$term_obj_descriptor = reset($search_data->result);
					# Add note to term
					$term_obj_descriptor['term'] .= " <small class=\"notaND\">(x {$term_obj->term})</small>";
					#$term_obj_descriptor['term'] .= " (x {$term_obj->term})";

					$descriptor_obj = $term_obj_descriptor;
				}else{

					error_log("ERROR ON GET PARENT DESCRIPTOR FOR NON DESCRIPTOR $term_obj->term_id . Original NON descriptor is returned !!");
					$descriptor_obj = $term_obj;
				}
			}
			#dump($descriptor_obj, ' descriptor_obj ++ '.to_string());

			return $descriptor_obj;
		}//end no_descriptor_to_descriptor



		/**
		* GET_THESAURUS_AUTOCOMPLETE
		* Search string in database (begings with $q) and get array of max 25 records
		* @param object $request_options
		* @return oject $response
		* 	$response->result Array of terms like 'born'
		*/
		public static function get_thesaurus_autocomplete( $request_options ) {

			$options = new stdClass();
				$options->q 					 = false;
				$options->limit 		 		 = 25;
				$options->table 	 	 		 = TABLE_THESAURUS;				
				$options->lang 				 	 = WEB_CURRENT_LANG_CODE;
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$field_term = FIELD_TERM;

			if ($options->q!==false) {		
			
				$sd_options = new stdClass();
					$sd_options->table 	 	= $options->table;
					$sd_options->ar_fields  = array($field_term );
					$sd_options->sql_filter = $field_term ." LIKE '%".$options->q."%'";
					$sd_options->order 	 	= $field_term ." ASC";
					$sd_options->lang 	 	= $options->lang ;
					$sd_options->limit 	 	= $options->limit;

				$search_data	= (object)web_data::get_rows_data( $sd_options );

				$result = array();
				foreach ((array)$search_data->result as $ar_value) foreach ($ar_value as $key => $value) {
					$result[] = $value;
				}

				$response = new stdClass();
					$response->result 	= $result;
					$response->msg 		= 'Ok. Request done';
			}else{

				$response = new stdClass();
					$response->result 	= false;
					$response->msg 		= 'Error. Empty search value (q)';
			}

			return (object)$response;
		}//end get_thesaurus_autocomplete



		/**
		* GET_THESAURUS_TERM
		* @return object $response
		*	$response->result array List of ts_term objects
		*	$response->msg string Message to developer like ok / error
		*/
		public static function get_thesaurus_term( $request_options ) {
			// Globals from config
			global $table_thesaurus_map;

			$options = new stdClass();
				$options->ar_term_id 		= null;
				$options->lang 		 		= WEB_CURRENT_LANG_CODE;
				$options->table 	 		= (string)TABLE_THESAURUS;
				$options->combine 			= false;  # false | combined | cumulative 
				$options->get_matching_terms= false; # boolean
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			if (is_array($options->ar_term_id)) {
				$ar_term_id = $options->ar_term_id;
			}else{
				if(!$ar_term_id = json_decode($options->ar_term_id)) {
					$ar_term_id = explode(',',$options->ar_term_id);
				}
			}
		
			$ar_thesaurus_term = array();
			foreach ( (array)$ar_term_id as $term_id ) {

				# Skip optional restricted terms (defined in config)
				#if (in_array($term_id, $ar_restricted_terms)) {
				#	continue;
				#}

				# Table optimized version contains only possible table instead all tables (reduce union query time)
				$thesaurus_table = $options->table;
				foreach ($table_thesaurus_map as $tkey => $tvalue) {
					if (strpos($term_id, $tkey)===0) {
						$thesaurus_table = $tvalue; break;
					}
				}
				#dump($thesaurus_table, ' thesaurus_table ++ '.to_string($term_id));

				//$search_data->result[$key] = (array)web_data::no_descriptor_to_descriptor( (object)$value_obj );
				
				$ts_term_options = new stdClass();
					$ts_term_options->table = $thesaurus_table;
				$ts_term 			 = ts_term::get_ts_term_instance($term_id, $options->lang, $ts_term_options);
				$ts_term->load_data(); // Force load db data
					#dump($ts_term, ' ts_term ++ '.to_string());				
				$ar_thesaurus_term[] = $ts_term;
			}
			#dump($ar_thesaurus_term, ' $ar_thesaurus_term ++ '.to_string()); die();
			#debug_log(__METHOD__."  ar_thesaurus_term ".to_string($ar_thesaurus_term), logger::DEBUG);

			# Combine results
			# No is necessary set combine_terms value. var ar_thesaurus_term is edited directly into the method
			$matching_terms = false;
			if ($options->combine!==false && count($options->ar_term_id)>1) {
				$combine_options = new stdClass();
					$combine_options->ar_term_id 		= $options->ar_term_id;
					$combine_options->mode 		 		= $options->combine;
					$combine_options->ar_ts_terms 		= $ar_thesaurus_term;
					$combine_options->get_matching_terms= $options->get_matching_terms;
					$combine_options->lang 				= $options->lang;
				$combine_result = web_data::combine_terms( $combine_options ); // $ar_thesaurus_term = 	
				$matching_terms = $combine_result->matching_terms;
			}
						
			$response = new stdClass();
				$response->result 				= $ar_thesaurus_term;
				$response->matching_terms 		= $matching_terms;
				$response->msg 					= 'Ok. Request done';


			return $response;
		}//end get_thesaurus_term



		/**
		* COMBINE_TERMS
		* Combines more than 1 term indexations. Used in thematic combinated search modes
		* This method uses method "thesaurus_terms" and recombines the result, all in one call
		* Modes:
		* 	combined : search intersections in locators
		*	cumulative : uses all locators of each term
		* @return object $response
		*/
		public static function combine_terms( $request_options ) {
			
			$options = new stdClass();
				# options to send at 'get_thesaurus_term'
				$options->ar_term_id 		= array();
				$options->ar_ts_terms 		= array();				
				$options->lang 				= WEB_CURRENT_LANG_CODE;
				$options->mode 	 	 		= 'combined'; # Available: combined | cumulative
				$options->get_matching_terms= false;
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			#$ts_terms 	 = web_data::get_thesaurus_term( $options );
			#$options->ar_ts_terms = $ts_terms->result;			

			if (count((array)$options->ar_term_id)<2) return false;

			# matching_terms
			$matching_terms = array();

			switch ($options->mode) {
				
				case 'combined':
					# Prepare a global array with all indexations groupped by term_id
					$ar_indexation   = array();
					$ar_used_term_id = array();
					foreach ((array)$options->ar_ts_terms as $key => $ts_object) {
						$ar_used_term_id[] = $ts_object->term_id;
						$ar_locators = json_decode($ts_object->indexation);
						foreach ($ar_locators as $c_locator) {
							$key_compare = $c_locator->section_tipo.'_'. $c_locator->section_id.'_'. $c_locator->tag_id;
							$ar_indexation[$ts_object->term_id][] = $key_compare;	//json_encode($c_locator);
						}						
					}
					#dump($ar_indexation, ' ar_indexation ++ '.to_string());
					
					# Resolve simple intersections
					$ar_indexation_resolved = (array)call_user_func_array('array_intersect',$ar_indexation);
						#dump($ar_indexation_resolved, ' ar_indexation_resolved ++ '.to_string());

					# Add real locators coincidents with resolved intersections
					$intersect_locators = array();					
					foreach ((array)$options->ar_ts_terms as $key => $ts_object) {
						$ar_locators = json_decode($ts_object->indexation);
						foreach ($ar_locators as $lkey => $c_locator) {
							$key_compare = $c_locator->section_tipo.'_'. $c_locator->section_id.'_'. $c_locator->tag_id;
							if (true===in_array($key_compare, $ar_indexation_resolved)) {
								$intersect_locators[] = json_encode($c_locator);
							}else{
								$ar_excluded_locators[] = $c_locator;
							}
						}
					}

					# Remove duplicates
					$intersect_locators = array_unique($intersect_locators);
					$total_intersect_locators = count($intersect_locators);

					# Format intersect_locators as json encoded array of locators (instead array of strings)
					$ar=array();
					foreach ($intersect_locators as $key => $value) {
						$ar[] = json_decode($value);
					}
					$intersect_locators = json_encode($ar);

					# Add result to each ts_term object replacing old indexation value
					foreach ((array)$options->ar_ts_terms as $key => $ts_object) {
						// Overwrite old value with validated locators
						$ts_object->indexation = $intersect_locators;	//json_encode($intersect_locators);
					}
					#dump($options->ar_ts_terms, ' $options->ar_ts_terms ++ '.to_string());					

					# Search matching terms
					# Matching terms are other terms that appears on same indexations (current indexation locators)
					# Iterate current indexation locators
					if ($options->get_matching_terms===true && $total_intersect_locators>0) {
					
						$first_ts_term = reset($options->ar_ts_terms); // Only one is useful (all term indexation are identical)
						$ar_indexation = json_decode($first_ts_term->indexation);
							#dump($indexation, ' indexation ++ '.to_string());
						$matching_terms = array();	
						$ar_temp_matching_terms = web_data::get_indexation_terms_multiple( $ar_indexation, $options->lang );
						foreach ((array)$ar_temp_matching_terms->result as $key => $ar_value) {
								#dump($ar_value, ' ar_value ++ '.to_string());
								if ( !in_array($ar_value['term_id'], $ar_used_term_id) ) {
									$matching_terms[] = $ar_value;
								}
							}
						/*
						foreach ((array)$ar_indexation as $current_locator) {						
							$ar_temp_matching_terms = web_data::get_indexation_terms( $current_locator->tag_id, $current_locator->section_id, $options->lang );

							# dump($ar_temp_matching_terms, ' ar_temp_matching_terms ++ '.to_string());						
							foreach ((array)$ar_temp_matching_terms->result as $key => $ar_value) {
								#dump($ar_value, ' ar_value ++ '.to_string());
								if ( !in_array($ar_value['term_id'], $ar_used_term_id) ) {
									$matching_terms[] = $ar_value;
								}
							}
						}*/
					}//end if ($options->get_matching_terms===true)
					break;

				case 'cumulative':
					# Create a global array of indexations
					break;
			}
			#dump($options->ar_ts_terms, '$options->ar_ts_terms ++ '.to_string());

			$response = new stdClass();
				$response->result 				= true;
				$response->ar_ts_terms 			= $options->ar_ts_terms;
				$response->matching_terms 		= $matching_terms;
				$response->msg 					= 'Ok. Request successful';

			return $response;
		}//end combine_terms



		/**
		* GET_THESAURUS_INDEXATION_NODE
		* @return object $response
		*	$response->result array List of indexation_node objects
		*	$response->msg string Message to developer like ok / error
		*/
		public static function get_thesaurus_indexation_node( $request_options ) {
			
			$options = new stdClass();
				$options->term_id  		= null;
				$options->ar_locators  	= null;
				$options->lang 		   	= WEB_CURRENT_LANG_CODE;
				$options->image_type   	= 'posterframe'; # posterframe | identify_image
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			if (is_string($options->ar_locators)) {
				$options->ar_locators = json_decode($options->ar_locators);
			}

			# Valid ar_locators is mandatory
			if (empty($options->ar_locators)) {
				$response = new stdClass();
					$response->result 	= array();
					$response->msg 		= 'Error. Valid ar_locators is mandatory. Received: '.to_string($options->ar_locators);
				return $response;
			}


			$ar_indexation_node = array();
			foreach ( (array)$options->ar_locators as $current_locator ) {
				$indexation_node = indexation_node::get_indexation_node_instance($options->term_id, $current_locator, null);
				$indexation_node->image_type  = $options->image_type;
				$indexation_node->indexations = $options->ar_locators;
				$indexation_node->lang 		  = $options->lang;
				$indexation_node->load_data(); # Force load object data from DDBB
				# Unset temporal property of indexation_node object for clean json data
				unset($indexation_node->indexations);
				# Remove temporal vars to clean data output
				unset($indexation_node->options);
				
				$ar_indexation_node[] = $indexation_node;			
			}
			#debug_log(__METHOD__." ar_indexation_node ".to_string($ar_indexation_node), logger::DEBUG);
			
			$response = new stdClass();
				$response->result 	= $ar_indexation_node;
				$response->msg 		= 'Ok. Request thesaurus_indexation_node done';


			return $response;
		}//end get_thesaurus_indexation_node



		/**
		* GET_THESAURUS_VIDEO_VIEW_DATA
		* @return object $response
		*/
		public static function get_thesaurus_video_view_data( $request_options ) {
		
			$options = new stdClass();
				$options->term_id 	  	  		= null;
				$options->ar_locators 	  		= null;
				$options->ar_locators_key 		= 0;
				$options->lang 					= WEB_CURRENT_LANG_CODE;
				$options->raw_text 				= false;
				$options->raw_text_unrestricted	= false;
				$options->add_subtitles			= false;
				$options->image_type 	 		= 'posterframe';
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}
		
			$video_view_options = new stdClass();
				$video_view_options->lang 			= $options->lang;
				$video_view_options->add_subtitles 	= $options->add_subtitles;
			$video_view_data = new video_view_data( $video_view_options );
			$video_view_data->load_thesaurus_video_view_data( $options->term_id, $options->ar_locators, $options->ar_locators_key );
	dump($video_view_data, ' video_view_data ++ '.to_string());
	
			if ($options->raw_text===false) {
				unset($video_view_data->raw_text);
			}
			if ($options->raw_text_unrestricted===false) {
				unset($video_view_data->raw_text_unrestricted);
			}

			return $video_view_data;
		}//end get_thesaurus_video_view_data



		/**
		* GET_THESAURUS_CHILDRENS
		* @return 
		*/
		public static function get_thesaurus_childrens( $request_options ) {
			global $table_thesaurus_map; // From server api config

			$options = new stdClass();
				$options->term_id  		= null;				
				$options->recursive 	= false;
				$options->lang 		   	= WEB_CURRENT_LANG_CODE;
				$options->ar_fields 	= array('*');
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$section_tipo 	= explode('_', $options->term_id)[0]; 	
			$table 			= $table_thesaurus_map[$section_tipo];
			$lang 			= $options->lang;
			$recursive 		= $options->recursive;
			$ar_fields 		= $options->ar_fields;

			// get_items. Recursion is optional
			function get_items($current_term_id, $table, $lang, $ar_fields, $recursive) {						

				$sd_options = new stdClass();
					$sd_options->table 	 	= $table;
					$sd_options->ar_fields  = $ar_fields;
					#$sd_options->sql_filter = "childrens LIKE '%\"type\":\"".DEDALO_RELATION_TYPE_CHILDREN_TIPO."\",\"section_id\":\"".$section_id ."\",\"section_tipo\":\"".$section_tipo."\"%' ";
					$sd_options->sql_filter = "parent = '".$current_term_id."' ";
					#$sd_options->order 	 = "section_id ASC";
					$sd_options->lang 	 	= $lang;

				$search_data	= (object)web_data::get_rows_data( $sd_options );
					#dump($search_data, ' search_data ++ '.to_string($sd_options));	

				$ar_data = (array)$search_data->result;		
								
				if ($recursive===true && !empty($search_data->result)) {						
					foreach ($search_data->result as $current_row) {
						$ar_data = array_merge($ar_data, get_items($current_row["term_id"], $table, $lang, $ar_fields, $recursive));
					}
				}

				return (array)$ar_data;
			}//end get_items
			$ar_children = get_items($options->term_id, $table, $lang, $ar_fields, $recursive);
				#dump($ar_children, ' ar_children ++ '.to_string());

			
			$response = new stdClass();
				$response->result 	= $ar_children;
				$response->msg 		= 'Ok. Request done ['.__METHOD__.']';


			return $response;
		}//end get_thesaurus_childrens



		/**
		* GET_THESAURUS_parents
		* @return 
		*/
		public static function get_thesaurus_parents( $request_options ) {
			global $table_thesaurus_map; // From server api config

			$options = new stdClass();
				$options->term_id  		= null;				
				$options->recursive 	= true;
				$options->lang 		   	= WEB_CURRENT_LANG_CODE;
				$options->ar_fields 	= array('*');
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$ar_parts 		= explode('_', $options->term_id);
			$section_tipo 	= $ar_parts [0];
			#$section_id 	= $ar_parts [1];
			$table 			= $table_thesaurus_map[$section_tipo];
			$lang 			= $options->lang;
			$recursive 		= $options->recursive;	
			$ar_fields 		= $options->ar_fields;		

			// get_items. Recursion is optional
			function get_items($current_term_id, $table, $lang, $ar_fields, $recursive) {
								
				$ar_parts 		= explode('_', $current_term_id);
				$section_tipo 	= $ar_parts [0];
				$section_id 	= $ar_parts [1];

				$sd_options = new stdClass();
					$sd_options->table 	 	= $table;
					$sd_options->ar_fields  = $ar_fields;
					$sd_options->sql_filter = "childrens LIKE '%\"type\":\"".DEDALO_RELATION_TYPE_CHILDREN_TIPO."\",\"section_id\":\"".$section_id ."\",\"section_tipo\":\"".$section_tipo."\"%' ";
					#$sd_options->sql_filter = "parent = '".$current_term_id."' ";
					#$sd_options->order 	 = "section_id ASC";
					$sd_options->lang 	 	= $lang;

				$search_data	= (object)web_data::get_rows_data( $sd_options );
					#dump($search_data, ' search_data ++ '.to_string($sd_options));	

				$ar_data = (array)$search_data->result;		
								
				if ($recursive===true && !empty($search_data->result)) {						
					foreach ($search_data->result as $current_row) {
						$ar_data = array_merge($ar_data, get_items($current_row["term_id"], $table, $lang, $ar_fields, $recursive));
					}
				}

				return (array)$ar_data;
			}//end get_items
			$ar_parent = get_items($options->term_id, $table, $lang, $ar_fields, $recursive);
				#dump($ar_parent, ' ar_parent ++ '.to_string());

			
			$response = new stdClass();
				$response->result 	= $ar_parent;
				$response->msg 		= 'Ok. Request done ['.__METHOD__.']';


			return $response;
		}//end get_thesaurus_parents




	/* FREE SEARCH
	----------------------------------------------------------------------- */


		/**
		* GET_FREE_SEARCH
		* Note: Search string is expected utf-8 rawurlencoded — URL-encode according to RFC 3986 
		* @return object $response
		*/
		public static function get_free_search( $request_options ) {

			$response = new stdClass();
				$response->result = false;
				$response->msg 	  = 'Error. Request free_search failed';
			
			$options = new stdClass();
				$options->q 				= null;
				$options->search_mode 		= 'full_text_search';
				$options->rows_per_page 	= 10;
				$options->page_number 		= 1;
				$options->offset 			= 0;
				$options->apperances_limit 	= 1;
				$options->match_select 		= false; // Selects specific match inside results. Default = false . Optional
				$options->count 			= true;
				$options->image_type 	 	= 'posterframe';
				$options->list_fragment 	= true;
				$options->video_fragment 	= false;				
				$options->fragment_terms 	= false;
				$options->filter 			= false;
				$options->lang 				= WEB_CURRENT_LANG_CODE;
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}
	
		
			# Search string is expected rawurlencoded — URL-encode according to RFC 3986 
			#$options->q = addslashes( rawurldecode($options->q) );
			$options->q = DBi::_getConnection_mysql()->real_escape_string($options->q);

			# Offset
			if ($options->page_number>1) {
				$options->offset = ($options->page_number-1) * $options->rows_per_page;
			}

			# TABLE FIELDS
			# $ar_fields = web_data::get_table_fields(TABLE_AUDIOVISUAL);
			$ar_fields = array("section_id",FIELD_VIDEO,FIELD_TRANSCRIPTION);		

			#
			# AUDIOVISUAL RECORDS
			switch ($options->search_mode) {
				case 'full_text_search':
				default:
					$search_options = new stdClass();
						$search_options->table 		= (string)TABLE_AUDIOVISUAL;
						$search_options->ar_fields 	= array_merge(
													array("MATCH (".FIELD_TRANSCRIPTION.") AGAINST ('$options->q') AS relevance "), $ar_fields );
						$search_options->sql_filter = 	 " MATCH (".FIELD_TRANSCRIPTION.") AGAINST ('$options->q' IN BOOLEAN MODE) AND lang = '".WEB_CURRENT_LANG_CODE."' ";
						if ($options->filter!==false) {
							$search_options->sql_filter .= " AND (" .$options->filter .")";
						}
						$search_options->lang 		= $options->lang;
						$search_options->order 		= "relevance DESC";
						$search_options->limit 		= $options->rows_per_page;
						$search_options->offset 	= $options->offset;
						$search_options->count 		= $options->count;

					$rows_data	= (object)web_data::get_rows_data( $search_options );
						#dump($rows_data->result, ' $rows_data ++ '.to_string());
						#dump($search_options, ' $search_options ++ '.to_string()); die();
					break;
			}

			if($rows_data->result===false) {
				$response->result = false;
				$response->msg 	  = 'Error. Request free_search failed. '.$rows_data->msg;
				return $response;
			}

			$ar_free_nodes = array();
			foreach ($rows_data->result as $key => $obj_value) {

				$av_section_id = $obj_value['section_id'];

				$fn_options = new stdClass();
					$fn_options->q 				  	= $options->q;
					$fn_options->apperances_limit 	= $options->apperances_limit;
					$fn_options->match_select 		= $options->match_select;
					$fn_options->image_type 	  	= $options->image_type;
					$fn_options->video_fragment 	= $options->video_fragment;
					$fn_options->list_fragment 		= $options->list_fragment;
					$fn_options->fragment_terms 	= $options->fragment_terms;
					$fn_options->lang 				= $options->lang;
					foreach ($ar_fields as $current_field) {
						if($current_field==='section_id') continue;
						$fn_options->$current_field = $obj_value[$current_field];
					}
					#dump($fn_options, ' fn_options ++ '.to_string());
				$free_node = new free_node( $av_section_id, $fn_options );
				$free_node->load_data(); # Froce to load data
					#dump($free_node, ' free_node ++ '.to_string());
				# Clean data
				$FIELD_TRANSCRIPTION = FIELD_TRANSCRIPTION;
				unset($free_node->{$FIELD_TRANSCRIPTION});

				$ar_free_nodes[] = $free_node;
			}//end foreach ($rows_data->result as $key => $obj_value)

			# Add vars for pagination
			$response->page_number 	 = $options->page_number;
			$response->rows_per_page = $options->rows_per_page;
			$response->total 		 = $rows_data->total;

			$response->result 	= $ar_free_nodes;
			$response->msg 		= 'Ok. Request free_search done successfully';		
			

			return $response;
		}//end get_free_search



	/* FULL NODE
	----------------------------------------------------------------------- */
		


		/**
		* GET_FULL_REEL
		* Get full reel data. Complete transcription and no tc cut
		* Used when you need show full interview (mode full)
		* @return object $response
		*/
		public static function get_full_reel( $request_options ) {			

			$options = new stdClass();				
				$options->av_section_id		= false;
				$options->lang 				= WEB_CURRENT_LANG_CODE;
				$options->image_type 		= 'posterframe';
				$options->terms 			= false;
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$response = new stdClass();
				$response->result = false;
				$response->msg 	  = 'Error. Request full_reel failed';	

			$full_node = new full_node( $options->av_section_id, $fn_options=$options );
			$full_node->load_data(); # Froce to load data
				#dump($full_node, ' full_node ++ '.to_string());
			# Clean data
			$FIELD_TRANSCRIPTION = FIELD_TRANSCRIPTION;
			unset($full_node->{$FIELD_TRANSCRIPTION});
	
			$response->result = $full_node;
			$response->msg 	  = 'Ok. Request full_reel done successfully';


			return $response;
		}//end get_full_reel



}//end class web_data
?>