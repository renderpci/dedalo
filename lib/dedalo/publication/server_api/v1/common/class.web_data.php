<?php
include(dirname(__FILE__).'/class.ts_term.php');
include(dirname(__FILE__).'/class.indexation_node.php');
include(dirname(__FILE__).'/class.free_node.php');
include(dirname(__FILE__).'/class.full_node.php');
include(dirname(__FILE__).'/class.video_view_data.php');
include(dirname(__FILE__).'/class.map.php');
include(dirname(__FILE__).'/class.image.php');
include(dirname(__FILE__).'/class.notes.php');
include(dirname(dirname(dirname(dirname(dirname(__FILE__))))).'/media_engine/class.OptimizeTC.php');
require_once(dirname(dirname(dirname(dirname(dirname(__FILE__))))).'/tools/tool_subtitles/class.subtitles.php');
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


	// Version. Important!
		#static $version = "1.0.4";  // 11-03-2017
		#static $version = "1.0.6";  // 05-06-2017
		#static $version = "1.0.8";  // 07-06-2017
		#static $version = "1.0.9";  // 09-06-2017
		#static $version = "1.0.10"; // 11-07-2017
		#static $version = "1.0.11"; // 12-07-2017
		#static $version = "1.0.12"; // 24-07-2017
		#static $version = "1.0.13"; // 25-07-2017
		#static $version = "1.0.14"; // 26-07-2017
		#static $version = "1.0.15"; // 28-07-2017
		#static $version = "1.0.16"; // 06-09-2017
		#static $version = "1.0.17"; // 01-10-2017
		#static $version = "1.0.18"; // 06-10-2017
		#static $version = "1.0.20"; // 24-10-2017
		#static $version = "1.0.21"; // 30-10-2017 
		#static $version = "1.0.22"; // 19-12-2017
		#static $version = "1.0.23";  // 20-12-2017
		#static $version = "1.0.24";  // 16-01-2018 fixed get_thesaurus_root_list comma separated parents issue
		#static $version = "1.0.25";  // 10-01-2018
		#static $version = "1.0.26";  // 23-03-2018
		#static $version = "1.0.27";  // 29-03-2018
		#static $version = "1.0.28";  // 17-07-2018
		#static $version = "1.0.29";  // 17-09-2018
		static $version = "1.0.30";  // 13-11-2018



	/**
	* GET_DB_CONNECTION
	* @return resource $mysql_conn
	*/
	public static function get_db_connection() {

		// Custom database defined in api server check
			if (defined('MYSQL_WEB_DATABASE_CONN')) {
				$database = MYSQL_WEB_DATABASE_CONN;
			}else{
				$database = MYSQL_DEDALO_DATABASE_CONN;
			}

		$mysql_conn = DBi::_getConnection_mysql(MYSQL_DEDALO_HOSTNAME_CONN,
										 		MYSQL_DEDALO_USERNAME_CONN,
										 		MYSQL_DEDALO_PASSWORD_CONN,
										 		$database,
										 		MYSQL_DEDALO_DB_PORT_CONN,
										 		MYSQL_DEDALO_SOCKET_CONN);
		return $mysql_conn;
	}//end get_db_connection



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
			if(SHOW_DEBUG===true) {
				#error_log(to_string($request_options));
				#debug_log(__METHOD__." request_options ".to_string($request_options), logger::DEBUG);
			}
			
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
				$sql_options->conn 			 	= web_data::get_db_connection();

				foreach ($request_options as $key => $value) {if (property_exists($sql_options, $key)) $sql_options->$key = $value;}

			// table verifications and clean
				if (empty($sql_options->table) || empty($sql_options->conn)) {
					$response->result = false;
					$response->msg    = "Empty options->table or connexion ";
					return $response;
				}
				$ar_tables = !is_array($sql_options->table) ? (array)explode(',', $sql_options->table) : (array)$sql_options->table;
				$ar_tables = array_map("trim", $ar_tables);
				
			#dump($sql_options, ' sql_options ++ '.to_string());
			#dump(json_encode($sql_options, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), ' sql_options->resolve_portal ++ '.to_string());

			if ($sql_options->section_id!==false) {
				if (empty($sql_options->sql_filter)) {
					$sql_options->sql_filter = "section_id = " . (int)$sql_options->section_id;
				}else{
					$sql_options->sql_filter = "section_id = " . (int)$sql_options->section_id . " AND " . $sql_options->sql_filter;
				}				
			}

			# Convert text ar_fields to array
			if (!is_array($sql_options->ar_fields)) {
				$sql_options->ar_fields = explode(',', $sql_options->ar_fields );
				$sql_options->ar_fields = array_map("trim", $sql_options->ar_fields);
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

			#debug_log(__METHOD__." Executing query ".trim($strQuery), logger::ERROR);
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
					error_log(__METHOD__ ." $msg ".PHP_EOL." ". to_string($strQuery) );
					$response->msg .= $msg .' - '. to_string($strQuery);
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
	

			# RESOLVE_PORTAL. PUBLICATION_SCHEMA
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
					if ( $sql_options->resolve_portals_custom!==false ) {
						if (is_array($sql_options->resolve_portals_custom)) {
							$sql_options->resolve_portals_custom = (object)$sql_options->resolve_portals_custom;
						}elseif (is_string($sql_options->resolve_portals_custom)) {
							$sql_options->resolve_portals_custom = json_decode($sql_options->resolve_portals_custom);
						}
						if ( property_exists($sql_options->resolve_portals_custom, $current_field)
						  && $current_field !== $sql_options->table // case field image into table image, por example
						) {
							$ar_data[$i][$current_field] = self::portal_resolve($rows, $current_field, $request_options, $sql_options->resolve_portals_custom);
						}
					}
				}
			
			$i++;}; 
			
			$result->free();
			#web_data::get_db_connection()->close();

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

			#$final_ar_data = [];
			#foreach ($ar_data as $key => $value) {
			#	$final_ar_data[] = (object)$value;
			#}
			#$ar_data = $final_ar_data;

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
			$response->result 	= $ar_data;
			$response->msg    	= "Ok request done";
			

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
				
				if (strpos($current_field, 'DISTINCT')!==false || strpos($current_field, 'CONCAT')!==false || $current_field=='*' || strpos($current_field, 'MATCH')!==false || strpos($current_field, ' AS ')!==false) {
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
			if(!empty($sql_filter) && strlen($sql_filter)>2 ) {
				if($sql_filter===PUBLICACION_FILTER_SQL) {
					$sql .= "\n$sql_filter";
				}else{
					$sql .= "\nAND (".$sql_filter.")";
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
			#	$data = json_decode(PUBLICATION_SCHEMA);
			
			$data = false;

			$strQuery = "SELECT data FROM publication_schema WHERE id = 1";
			$result   = web_data::get_db_connection()->query($strQuery);

			if($result) while ( $rows = $result->fetch_assoc() ) {
				$data = json_decode($rows['data']);
				break;
			}
			

			return $data;
		}//end get_publication_schema



		/**
		* GET_FULL_PUBLICATION_SCHEMA
		* @return object|false $data
		*/
		private static function get_full_publication_schema( ) {
			$data = false;

			$strQuery = "SELECT name, data FROM publication_schema ";
			$result   = web_data::get_db_connection()->query($strQuery);

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
			 		
		 	
		 	if(is_array($current_ar_value)) foreach ($current_ar_value as $p_value) {

		 		$portal_options = new stdClass();
		 			$portal_options->table = $table;
		 			$portal_options->lang  = $options->lang;
		 			if (isset($options->resolve_portal)) {
		 			$portal_options->resolve_portal = $options->resolve_portal;
		 			}	

		 			# Resolve_portals_custom deeper
		 			# If you need deep resolve, define resolve_portals_custom using table name separated by point like:
		 			# [
					#	'eventos' 	 		 => 'eventos',
					#	'eventos.documentos' => 'image'
					# ]
		 			if ($resolve_portals_custom!==false) {
		 				# Defined resolve_portals_custom for this table
	 					$portal_options->resolve_portals_custom = new stdClass();
	 					# (!) Note that $resolve_portals_custom is different that $options->resolve_portals_custom because is already parsed
		 				foreach ($resolve_portals_custom as $name => $target) {
		 					$field = explode('.', $name);
		 					if (isset($field[1])) {		 						
		 						$field = $field[1];			
		 						$portal_options->resolve_portals_custom->{$field} = $target;
		 					}
		 				}	 					
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

			if($conn===false) $conn=web_data::get_db_connection();			
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
			
			$conn=web_data::get_db_connection();

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
			$conn=web_data::get_db_connection();

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
	* @param object $request_options
	* 	string $request_options->av_section_id (one or various numbers separated by comma)
	* 	string $request_options->lang like 'lg-spa' (optional)
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
		$sql_filter = '('.implode(' OR ', $ar_filter).')';


		$response = new stdClass();
			$response->result 	= false;
			#$response->msg 	= 'Error. Request failed (get_reel_terms)';
		
		// Format: "section_top_id":"30","section_tipo":"rsc167","section_id":"39"
		
		$s_options = new stdClass();
			$s_options->table 		= (string)TABLE_THESAURUS;
			$s_options->ar_fields 	= array(FIELD_TERM_ID,FIELD_TERM,'indexation');
			$s_options->lang 		= $options->lang;
			$s_options->order 		= FIELD_TERM ." ASC";
			#$s_options->sql_filter = (string)"`index` LIKE '%\"section_id\":\"$av_section_id\",\"component_tipo\":\"$TRANSCRIPTION_TIPO\"%'" . PUBLICACION_FILTER_SQL;
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
	* GET_REEL_FRAGMENTS_OF_TYPE
	* Return all fragments inside reel transcription (of passed type like 'index')
	* @param string $av_section_id (one or various separated by comma)
	* @return 
	*/
	public static function get_reel_fragments_of_type( $request_options ) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed. '.__METHOD__;

		$options = new stdClass();
			$options->av_section_id 	= null;
			$options->type 				= 'indexIn'; // Deafult is indexIn
			$options->lang 				= WEB_CURRENT_LANG_CODE;
			$options->return_text		= false;
			$options->filter_by_tag_id	= false; // false | array
			$options->return_restricted	= false;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		#
		# Transcription text
		$TRANSCRIPTION_TIPO 		= TRANSCRIPTION_TIPO;
		$AUDIOVISUAL_SECTION_TIPO 	= AUDIOVISUAL_SECTION_TIPO;		
		
		$sql_filter = '(section_id = '.(int)$options->av_section_id.')';		
				
		$s_options = new stdClass();
			$s_options->table 		= (string)TABLE_AUDIOVISUAL;
			$s_options->ar_fields 	= array(TRANSCRIPTION_TIPO,FIELD_VIDEO);
			$s_options->lang 		= (string)$options->lang;
			$s_options->sql_filter 	= (string)$sql_filter;

		$rows_data	= (object)web_data::get_rows_data( $s_options );
			#dump($rows_data, ' rows_data ++ '.to_string()); #die();

		$raw_text = '';
		if (is_array($rows_data->result)) foreach($rows_data->result as $key => $value) {			
			$raw_text = $value[TRANSCRIPTION_TIPO];
			break;
		}
		
		#
		# Find indexations etc.
		$pattern 	= TR::get_mark_pattern($options->type);
		preg_match_all($pattern, $raw_text, $matches);
			#dump($matches, ' matches ++ '.to_string());
		$key_tag 	= 1;
		$key_tag_id = 4;

		$ar_tag_id = $matches[$key_tag_id];

		$ar_fragments = [];
		$fr_options = new stdClass();			
			$fr_options->lang   		 		= $options->lang;
			$fr_options->raw_text 		 		= $raw_text;
			$fr_options->av_section_id  		= $options->av_section_id;
			$fr_options->component_tipo 	 	= TRANSCRIPTION_TIPO;
			$fr_options->section_tipo 	 	 	= AUDIOVISUAL_SECTION_TIPO;
			$fr_options->video_url 	 	 		= null; # Like 'http://mydomain.org/dedalo/media/av/404/'
			$fr_options->margin_seconds_in  	= null;
			$fr_options->margin_seconds_out 	= null;
			$fr_options->fragment_terms_inside 	= false; # If true, calculate terms indexed inside this fragment 
			$fr_options->indexation_terms 		= false; # If true, calculate all terms used in this indexation
		
		foreach ($ar_tag_id as $tag_id) {

			// filter_by_tag_id
				if ($options->filter_by_tag_id!==false) {
					if (!in_array($tag_id, $options->filter_by_tag_id)) {
						continue; // Skip
					}
				}

			# Set tag_id
			$fr_options->tag_id = $tag_id;

			$fragment = web_data::build_fragment($fr_options);
				#dump($fragment, ' fragment ++ '.to_string($fr_options));
			
			$element = new stdClass();
				$element->tag_id  	 	= $tag_id;
				$element->tcin_secs  	= $fragment->tcin_secs;
				$element->tcout_secs 	= $fragment->tcout_secs;
				$element->video_url  	= $fragment->video_url;
				$element->subtitles_url = $fragment->subtitles_url;

				if ($options->return_text===true) {
					//$element->fragm = $fragment->fragm;

					// Remove restricted_text from raw text
					$clean_fragm 		  = web_data::remove_restricted_text( $fragment->fragm, $options->av_section_id );
					// Finally remove all tags (deleteMarks is the last proccess before send the text)
					$clean_fragm 		  = TR::deleteMarks($clean_fragm);

					$element->fragm 	  = $clean_fragm;
				}

			$ar_fragments[] = $element;
		}//end foreach ($ar_tag_id as $tag_id)


		// response
			$response->result 	= $ar_fragments;
			$response->msg 		= 'Ok. Request done. '.__METHOD__;


		// restricted fragments. optional
			if ($options->return_restricted===true) {
				$ar_restricted_fragments = web_data::get_ar_restricted_fragments( $options->av_section_id );
					#dump($ar_restricted_fragments, ' ar_restricted_fragments ++ '.to_string($options->av_section_id));
				$response->ar_restricted_fragments = $ar_restricted_fragments;
			}	


		return (object)$response;
	}//end get_reel_fragments_of_type



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

		if (is_array($index_locator)) {
			$index_locator = reset($index_locator);
		}
		if (is_object($index_locator)) {
			$locator = $index_locator;
		}else{
			$locator = json_decode($index_locator);
			if (is_array($locator)) {
				$locator = reset($locator);
			}
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
		if(SHOW_DEBUG===true) {
			#dump($rows_data, ' rows_data ++ '.to_string($locator));;
		}			

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
			$f_options->av_section_id  	= $av_section_id;
			$f_options->lang 		  	= $options->lang;
			$f_options->component_tipo 	= AV_TIPO;
			$f_options->section_tipo 	= $locator->section_tipo;
			$f_options->raw_text 		= $raw_text;
				
			$fragments_obj = web_data::build_fragment( $f_options );
			#if(SHOW_DEBUG===true) {
				#dump($fragments_obj, ' fragments_obj ++ '.to_string( $av_section_id )); die();
			#}

		# REMOVE_RESTRICTED_TEXT in fragment
		if (isset($fragments_obj->fragm)) {
			// Remove restricted_text from raw text
			$clean_fragm 		  = web_data::remove_restricted_text( $fragments_obj->fragm, $av_section_id );
			// Finally remove all tags (deleteMarks is the last proccess before send the text)
			$clean_fragm 		  = TR::deleteMarks($clean_fragm);
			$fragments_obj->fragm = $clean_fragm;
		}

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

		mb_internal_encoding('UTF-8');

		// options
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
				$options->margin_chars_in 		= 5;	# default 100
				$options->margin_chars_out		= 100;	# default 100
				$options->fragment_terms_inside = false; # If true, calculate terms indexed inide this fragment 
				$options->indexation_terms 		= false; # If true, calculate all terms used in this indexation				
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}


		$result = new stdClass();
	
		// video filename
			if (is_null($options->video_url)) {
				$base_url 	= WEB_VIDEO_BASE_URL;
				$file_name  = AV_TIPO.'_'.$options->section_tipo.'_'.$options->av_section_id.'.mp4';// Like : rsc35_rsc167_1
				$av_path 	= $base_url .'/'. $file_name;
			}else{
				$av_path  	= $options->video_url;
			}

		// tags
			$tag_in  = TR::get_mark_pattern('indexIn',  $standalone=false, $options->tag_id, $data=false);
			$tag_out = TR::get_mark_pattern('indexOut', $standalone=false, $options->tag_id, $data=false);

		// Build in/out regex pattern to search
			$regexp = $tag_in ."(.*)". $tag_out;
		
		// Search fragment_text
			# Dato raw from matrix db
			$raw_text = $options->raw_text;

			$delete_options =new stdClass();
				$delete_options->deleteTC 			= false;
				$delete_options->deleteIndex 		= false;
				$delete_options->deleteSvg 			= false;
				$delete_options->deleteGeo 			= false;
				$delete_options->delete_page 		= false;
				$delete_options->delete_person 		= true;
				$delete_options->delete_note   		= false;
				$delete_options->delete_struct 		= false;
				$delete_options->delete_reference 	= false;
			#$raw_text = TR::deleteMarks($raw_text, $delete_options); // Force delete  tags

			$raw_text = html_entity_decode($raw_text);
				#dump(null, ' dato ++ '.trim($raw_text));
	
			// PREG_MATCH_ALL
				$preg_match_all_result = preg_match_all("/$regexp/", $raw_text, $matches, PREG_OFFSET_CAPTURE | PREG_SET_ORDER );
				#$preg_match_all_result = _mb_ereg_search_all($raw_text, "/$regexp/u", $resultOrder = 0); $matches = $preg_match_all_result;
				#$preg_match_all_result = free_node::pregMatchCapture($matchAll=true, "/$regexp/", $raw_text, $offset=0);
				#if(SHOW_DEBUG===true) {
					#dump($matches, ' matches preg_match_all_result ++ '.to_string($regexp)); #die();
				#}			
			if( !empty($preg_match_all_result) ) {				

				$fragment_inside_key = 3;
				$tag_in_pos_key 	 = 1;
				$tag_out_pos_key 	 = 4;

				foreach($matches as $match) {
					
					if (isset($match[$fragment_inside_key][0])) {
						
						$fragment_text_raw 	= $match[$fragment_inside_key][0];
						
						$fragment_text 		= $fragment_text_raw;
						
						# Clean fragment_text
						$fragment_text 		= TR::deleteMarks($fragment_text);
						#$fragment_text = self::decode_dato_html($fragment_text);

						# tag in position
						$tag_in_pos = $match[$tag_in_pos_key][1];
						#$tag_in_pos = $match[$fragment_inside_key][1];
							#dump($tag_in_pos, ' tag_in_pos ++ '.to_string());

						# tag out position
						#$tag_out_pos = $tag_in_pos + strlen($match[0][0]);
						$tag_out_pos = $match[$tag_out_pos_key][1];

						# TC . Localizamos los TC apropiados
						#$tcin  = OptimizeTC::optimize_tcIN(  $raw_text, false, $tag_in_pos, $pos_in_margin=0  );
						$tcin  = OptimizeTC::optimize_tcIN(  $raw_text, $match[$tag_in_pos_key][0], false, $pos_in_margin=$options->margin_chars_in  );
						#$tcout = OptimizeTC::optimize_tcOUT( $raw_text, false, $tag_out_pos, $pos_in_margin=0 );
						$tcout = OptimizeTC::optimize_tcOUT( $raw_text, $match[$tag_out_pos_key][0], false, $pos_in_margin=$options->margin_chars_out);

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
							$video_url 		= $av_path.'?vbegin='.floor($tcin_secs).'&vend='.ceil($tcout_secs);

						// Subtitles url
							$subtitles_url 	= subtitles::get_subtitles_url($options->av_section_id, $tcin_secs, $tcout_secs, $options->lang);
						
						$result->fragm 			= $fragment_text_raw; //$fragment_text; [!IMPORTANTE: DEVOLVER TEXT RAW AQUÍ Y LIMPIAR ETIQUETAS EN EL RESULTADO FINAL !]
						#$result->fragm_raw 	= $fragment_text_raw;
						$result->video_url		= $video_url;
						$result->subtitles_url	= $subtitles_url;
						#$result->terms 		= array();	// For unify object response only			        	
						#$result->tcin 			= $tcin;
						#$result->tcout 		= $tcout;
						$result->tcin_secs 		= $tcin_secs;
						$result->tcout_secs 	= $tcout_secs;

							#dump($result->fragm, '$result->fragm ++ '.to_string($video_url));
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
	
		# Clean text
		#$delete_options = new stdClass();
		#	$delete_options->deleteTC = false;
		#$text = TR::deleteMarks($text, $delete_options);
			#$text = self::decode_dato_html($text);
	
		$ar_restricted_fragments = self::get_ar_restricted_fragments( $av_section_id );
			#dump($ar_restricted_fragments, ' ar_restricted_fragments ++** '.to_string($av_section_id)); #die();
		foreach ($ar_restricted_fragments as $key => $fragm_obj) {
			
			// skip replace on some cases (empty, sort text, etc.) 
				if (empty($fragm_obj->fragm) || mb_strlen($fragm_obj->fragm)<5) {
					continue;
				}
			
			// old replace all
				#$text = str_replace($fragm_obj->fragm, ' *** ', $text, $count);

			// replace restricted text ONCE
				$haystack 	= $raw_text;
				$needle 	= $fragm_obj->fragm;
				$replace 	= ' *** ';
				$pos 		= strpos($haystack, $needle);
				if ($pos !== false) {
					$text = substr_replace($haystack, $replace, $pos, strlen($needle));
				}

			if(SHOW_DEBUG===true) {
				error_log("-- Replaced concurrences of fragm (reel $av_section_id - $key)");
			}
		}

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
			$options->margin_chars_in 	 = 0;	# default 100
			$options->margin_chars_out	 = 0;	# default 100
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
			global $table_thesaurus_map, $thesaurus_root_list_parents;
			
			$options = new stdClass();
				$options->table  			= (string)TABLE_THESAURUS;
				$options->parents  			= isset($thesaurus_root_list_parents) ? $thesaurus_root_list_parents : false;
				$options->exclude_tld 		= array("xx");
				$options->lang 		 		= WEB_CURRENT_LANG_CODE;
				$options->order 			= "`norder` ASC";				
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}
					#dump($options->parents, '$options->parents ++ '.to_string());
			
			if ($options->parents!==false) {

				# When is user send var, is string comma separated list of terms
				if (is_string($options->parents) && strpos($options->parents, ',')!==false) {
					$options->parents = explode(',', $options->parents);
				}

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
							$options_hierarchy->lang 	 	= $options->lang;
							$options_hierarchy->sql_filter  = "`section_id` = ".(int)$ar[1];
							$options_hierarchy->limit 		= 1;
							$options_hierarchy->order 		= '';
						$rows_data	= (object)web_data::get_rows_data( $options_hierarchy );
												
						$parent_term = isset($rows_data->result[0]) ? $rows_data->result[0]['name'] : '';												

					}else{
						
						# Resolve parent term name
						$options_hierarchy = new stdClass();
							$options_hierarchy->table 		= $options->table;
							$options_hierarchy->ar_fields 	= array('term');
							$options_hierarchy->lang 	 	= $options->lang;
							$options_hierarchy->sql_filter  = "`section_id` = ".(int)$ar[1];
							$options_hierarchy->limit 		= 1;
							$options_hierarchy->order 		= '';
						$rows_data	= (object)web_data::get_rows_data( $options_hierarchy );
							#dump($rows_data, ' rows_data ++ '.to_string($options_hierarchy));
						#$parent_term = reset($rows_data->result)['term'];
						$parent_term = isset($rows_data->result[0]) ? $rows_data->result[0]['term'] : '';
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
						#$rd_options->order 	= $options->order;
						$rd_options->order 		= "";

					$rows_data	= (object)web_data::get_rows_data( $rd_options );			
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
						#dump($ar_children, '$ar_children ++ '.to_string($term_id));
	
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
					
						# Force to load data from database
						$ts_term->load_data();

						# Add to array
						#if (empty($ts_term->ar_childrens) && empty($ts_term->indexation)) {
							# ignore term
						#}else{
							$ar_ts_terms[$current_tld][] = $ts_term;
							#$ar_ts_terms[] = $ts_term;
						#}
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

			# q (real_escape_string)
			$q = $options->q;
			if ($q!==false) {
				$q = web_data::get_db_connection()->real_escape_string($q);
			}
			
			
			# Search in DDBB
			$rd_options = new stdClass();
				$rd_options->table 			= $options->table;
				$rd_options->ar_fields 		= array('*');
				#$rd_options->ar_fields 	= array('section_id','descriptor','tld','term_id',FIELD_TERM,'index','lang','childrens','related','time','space','code');
				$rd_options->sql_filter 	= "`$field_term` LIKE '%".$q."%' " . $options->publicacion_filter_sql;
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
			$ar_parent=array();
			foreach ((array)$search_data->result as $ar_value) {
			
				$tld 		= $ar_value['tld'];
				$term_id 	= $ar_value['term_id'];
				$term 		= $ar_value[$field_term];
				$parent 	= $ar_value['parent'];
				$descriptor = $ar_value['descriptor']; // es descriptor: no | yes
				$indexation = $ar_value['indexation'];
	
				if (strpos($parent,'[')===0) {
					# is json array
					$ar_parent  = json_decode($parent);
					$parent 	= reset($ar_parent); // Select first (only one expected)
				}

				#
				# AR_PARENT . PATH OF ALL PARENTS KRSORTED
				$ar_parent = ts_term::get_ar_parent( $parent, $tld );
					#dump($ar_parent, ' ar_parent ++ '.to_string()); die();

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

			# q scape
			if ($options->q!==false) {
				$options->q = web_data::get_db_connection()->real_escape_string($options->q);
			}			

			if ($options->q!==false) {
			
				$sd_options = new stdClass();
					$sd_options->table 	 	= $options->table;
					$sd_options->ar_fields  = array($field_term );
					$sd_options->sql_filter = "`$field_term` LIKE '%".$options->q."%'";
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
				$options->table   		= null; // only used when ar_locators is empty
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			// empty ar_locators case
				if (empty($options->ar_locators)) {

					$ind_options = new stdClass();
						$ind_options->table 		= (string)$options->table;
						$ind_options->ar_fields 	= array('section_id',FIELD_INDEX);
						$ind_options->lang 			= $options->lang;
						$ind_options->sql_filter 	= '`term_id` = \''.$options->term_id.'\' ';

					$indexation_response = (object)web_data::get_rows_data( $ind_options );				
					if (isset($indexation_response->result[0])) {
						$options->ar_locators = $indexation_response->result[0][FIELD_INDEX];
					}
				}

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

				# Safe ar_locators (avoid show info of locators without interview / audiovisual)
				$locator_av_section_id 			= $current_locator->section_id;
				$locator_interview_section_id 	= $current_locator->section_top_id;
				if(false===web_data::record_is_active(TABLE_INTERVIEW, $locator_interview_section_id)) {
					debug_log(__METHOD__." INTERVIEW NOT ACTIVE SKIPPED !! ".to_string($locator_interview_section_id), logger::DEBUG);
					continue;
				}
				if(false===web_data::record_is_active(TABLE_AUDIOVISUAL, $locator_av_section_id)) {
					debug_log(__METHOD__." AUDIOVISUAL NOT ACTIVE SKIPPED !! ".to_string($locator_av_section_id), logger::DEBUG);
					continue;
				}

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
		* RECORD_IS_ACTIVE
		* @return bool
		*/
		public static function record_is_active($table, $section_id, $lang=WEB_CURRENT_LANG_CODE) {

			$record_is_active = false;	

			$s_options = new stdClass();
				$s_options->table 		= (string)$table;
				$s_options->ar_fields 	= array('section_id');
				$s_options->lang 		= $lang;				
				$s_options->section_id 	= $section_id;

			$response = (object)web_data::get_rows_data( $s_options );

			if (!empty($response->result)) {
				$record_is_active = true;
			}
			

			return (bool)$record_is_active;
		}//end record_is_active



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
		* @return object $response
		*/
		public static function get_thesaurus_childrens( $request_options ) {
			global $table_thesaurus_map; // From server api config

			$options = new stdClass();
				$options->term_id  				= null;				
				$options->recursive 			= false;
				$options->lang 		   			= WEB_CURRENT_LANG_CODE;
				$options->ar_fields 			= array('*');
				$options->only_descriptors 		= true;
				$options->remove_restricted 	= true;
				$options->remove_unused_terms 	= false; // If true, exclude of results the childrens without indexations and childrens
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$section_tipo = explode('_', $options->term_id)[0];

			if (empty($section_tipo) || empty($table_thesaurus_map[$section_tipo])) {
				$response = new stdClass();
					$response->result 	= [];
					$response->msg 		= 'Error. Invalid section tipo ('.to_string($section_tipo).') or not defined in table_thesaurus_map (see API server config) ';
					$response->total 	= 0;

				return $response;
			}

			$table 				= $table_thesaurus_map[$section_tipo];
			$lang 				= $options->lang;
			$recursive 			= $options->recursive;
			$ar_fields 			= $options->ar_fields;
			$only_descriptors 	= $options->only_descriptors;
			$remove_restricted 	= $options->remove_restricted;
			$remove_unused_terms= $options->remove_unused_terms;


			if (!is_array($ar_fields)) {
				$ar_fields = explode(',',$ar_fields);
			}

			# Force ar_fields term_id
			if (!in_array('*',$ar_fields) && !in_array('term_id',$ar_fields)) {
				array_unshift($ar_fields, 'term_id');
			}


			// get_items. Recursion is optional
			// if (!function_exists('get_items')) 
			function get_items($current_term_id, $table, $lang, $ar_fields, $recursive, $only_descriptors, $remove_restricted, $remove_unused_terms) {

				# Compatibility with old parent data (single)
				$term_filter = '';
				if (strpos($current_term_id,'["')===false) {
					$term_filter .= '(parent = \'["'.$current_term_id.'"]\' OR parent = \''.$current_term_id.'\')';
				}else{
					$term_filter .= '(parent = \''.$current_term_id.'\' OR parent = \''.substr($current_term_id, 2, strlen($current_term_id)-2).'\')';
				}

				# only_descriptors
				if ($only_descriptors===true) {
					$term_filter .= " AND descriptor = 'yes' ";
				}

				# remove_restricted
				if ($remove_restricted===true) {
					$ar_restricted_terms = json_decode(AR_RESTRICTED_TERMS);
					$ar=array();
					foreach ((array)$ar_restricted_terms as $key => $restricted_term) {
						$ar[] = "term_id != '{$restricted_term}'";
					}
					$term_filter .= ' AND (' . implode(' AND ', $ar) . ') ';
				}								

				# Remove unused terms
				if ($remove_unused_terms===true) {
					$term_filter .= ' AND (indexation IS NOT NULL OR childrens IS NOT NULL)';
				}
				#error_log($term_filter);			


				$sd_options = new stdClass();
					$sd_options->table 	 	= $table;
					$sd_options->ar_fields  = $ar_fields;
					$sd_options->sql_filter = $term_filter; //"parent = '".$term_id_search."' ";
					$sd_options->lang 	 	= $lang;
					$sd_options->limit 	 	= 0;

				$search_data = (object)web_data::get_rows_data( $sd_options );
					#debug_log(__METHOD__." search data ".to_string($search_data), logger::DEBUG);

				$ar_data = ($search_data->result!==false) ? (array)$search_data->result : [];		
				
				if ($recursive===true && !empty($search_data->result)) {
					foreach($ar_data as $current_row) {
						#dump($current_row, ' current_row ++ '.to_string());
						$items = get_items($current_row["term_id"], $table, $lang, $ar_fields, $recursive, $only_descriptors, $remove_restricted, $remove_unused_terms);
						#dump($items, ' items ++ '.to_string($current_row["term_id"]));
						$ar_data = array_merge($ar_data, $items);
						#debug_log(__METHOD__." items RECURSIVE ++ ".to_string($items), logger::DEBUG);
					}
				}


				return (array)$ar_data;
			}//end get_items
			$ar_children = get_items($options->term_id, $table, $lang, $ar_fields, $recursive, $only_descriptors, $remove_restricted, $remove_unused_terms);
				#dump($ar_children, ' ar_children ++ '.to_string());
			
			$response = new stdClass();
				$response->result 	= $ar_children;
				$response->msg 		= 'Ok. Request done ['.__METHOD__.']';
				$response->total 	= count($ar_children);

			return $response;
		}//end get_thesaurus_childrens



		/**
		* GET_THESAURUS_CHILDRENS__OLD
		* @return 
		*/ /*
		public static function get_thesaurus_childrens__OLD( $request_options ) {
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
			// if (!function_exists('get_items')) 
			function get_items($current_term_id, $table, $lang, $ar_fields, $recursive) {

				# Compatibility with old parent data (single)
				$term_filter = '';
				if (strpos($current_term_id,'["')===false) {
					$term_filter .= 'parent = \'["'.$current_term_id.'"]\' OR parent = \''.$current_term_id.'\'';
				}else{
					$term_filter .= 'parent = \''.$current_term_id.'\' OR parent = \''.substr($current_term_id, 2, strlen($current_term_id)-2).'\'';
				}
				#error_log($term_filter);

				$sd_options = new stdClass();
					$sd_options->table 	 	= $table;
					$sd_options->ar_fields  = $ar_fields;
					#$sd_options->sql_filter = "childrens LIKE '%\"type\":\"".DEDALO_RELATION_TYPE_CHILDREN_TIPO."\",\"section_id\":\"".$section_id ."\",\"section_tipo\":\"".$section_tipo."\"%' ";
					$sd_options->sql_filter = $term_filter; //"parent = '".$term_id_search."' ";
					#$sd_options->order 	 = "section_id ASC";
					$sd_options->lang 	 	= $lang;

				$search_data = (object)web_data::get_rows_data( $sd_options );
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
		}//end get_thesaurus_childrens__OLD
		*/



		/**
		* GET_THESAURUS_PARENTS
		* @return 
		*/
		public static function get_thesaurus_parents( $request_options ) {
			global $table_thesaurus_map; // From server api config

			$start_time = microtime(1);	

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

			// term_id is mandatory
				if (is_string($ar_fields)) {
					$ar_fields = explode(',', $ar_fields);
					$ar_fields = array_map(function($item){
						return trim($item);
					}, $ar_fields);
				}				
				if (!in_array('term_id', (array)$ar_fields)) {
					$ar_fields[] = 'term_id';
				}

			// get_items. Recursion is optional
			// if (!function_exists('get_items')) 
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
				if(SHOW_DEBUG===true) {
					$response->debug['time'] = round(microtime(1)-$start_time,3);
				}


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
			$options->q = web_data::get_db_connection()->real_escape_string($options->q);

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
						$search_options->sql_filter = 	 " MATCH (".FIELD_TRANSCRIPTION.") AGAINST ('$options->q' IN BOOLEAN MODE) "; // AND lang = '".WEB_CURRENT_LANG_CODE."'
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
				
				# Clean data
				$FIELD_TRANSCRIPTION = FIELD_TRANSCRIPTION;
				unset($free_node->{$FIELD_TRANSCRIPTION});

				if(SHOW_DEBUG===true) {
					#dump($free_node, ' free_node ++ '.to_string());;
				}	

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



	/* GEOLOCATION
	----------------------------------------------------------------------- */



		/**
		* GET_GEOLOCATION_DATA -> moved to class.diffusion_sql.php
		* @return 
		*//*
		public static function get_geolocation_data( $request_options ) {

			# Test data
			#$request_options->raw_text = '[geo-n-1--data:{'type':'FeatureCollection','features':[{'type':'Feature','properties':{},'geometry':{'type':'Point','coordinates':[2.097785,41.393268]}}]}:data]Bateria antiaèria de Sant Pere Màrtir. Esplugues de Llobregat&nbsp;[geo-n-2--data:{'type':'FeatureCollection','features':[{'type':'Feature','properties':{},'geometry':{'type':'Point','coordinates':[2.10389792919159,41.393728914379295]}}]}:data]&nbsp;Texto dos';
			#$request_options->raw_text = '[geo-n-1--data:{\'type\':\'FeatureCollection\',\'features\':[{\'type\':\'Feature\',\'properties\':{},\'geometry\':{\'type\':\'Point\',\'coordinates\':[2.097785,41.393268]}}]}:data]Bateria antiaèria de Sant Pere Màrtir. Esplugues de Llobregat&nbsp;[geo-n-2--data:{\'type\':\'FeatureCollection\',\'features\':[{\'type\':\'Feature\',\'properties\':{},\'geometry\':{\'type\':\'Point\',\'coordinates\':[2.10389792919159,41.393728914379295]}}]}:data]&nbsp;Texto dos';
			$request_options->raw_text = 'Hola que tal [geo-n-1--data:{\'type\':\'FeatureCollection\',\'features\':[{\'type\':\'Feature\',\'properties\':{},\'geometry\':{\'type\':\'Point\',\'coordinates\':[2.097785,41.393268]}}]}:data]Bateria antiaèria de Sant Pere Màrtir. Esplugues de Llobregat&nbsp;[geo-n-2--data:{\'type\':\'FeatureCollection\',\'features\':[{\'type\':\'Feature\',\'properties\':{},\'geometry\':{\'type\':\'Point\',\'coordinates\':[2.10389792919159,41.393728914379295]}}]}:data] Texto dos';

			$options = new stdClass();
				$options->raw_text			= false;		
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$response = new stdClass();
				$response->result = false;
				$response->msg 	  = 'Error. Request get_geolocation_data failed';

			#$pattern = TR::get_mark_pattern('geo',false);
			#$result  = free_node::pregMatchCapture($matchAll=true, $pattern, $options->raw_text, $offset=0);

			# split by pattern
			$pattern_geo_full = TR::get_mark_pattern('geo_full',$standalone=true);
			$result 		  = preg_split($pattern_geo_full, $options->raw_text, -1, PREG_SPLIT_NO_EMPTY | PREG_SPLIT_DELIM_CAPTURE);	

			# sample result
			#[0] => [geo-n-1--data:{'type':'FeatureCollection','features':[{'type':'Feature','properties':{},'geometry':{'type':'Point','coordinates':[2.097785,41.393268]}}]}:data]
		    #[1] => Bateria antiaèria de Sant Pere Màrtir. Esplugues de Llobregat&nbsp;
		    #[2] => [geo-n-2--data:{'type':'FeatureCollection','features':[{'type':'Feature','properties':{},'geometry':{'type':'Point','coordinates':[2.10389792919159,41.393728914379295]}}]}:data]
		    #[3] => &nbsp;Texto dos		    

		    $ar_elements = array();
		    $pattern_geo = TR::get_mark_pattern('geo',$standalone=true);
		    $key_tag_id  = 4;
		    $key_data    = 7;
		    foreach ((array)$result as $key => $value) {
		    	if (strpos($value,'[geo-')===0) {
		    		$tag_string  = $value;
		    		$next_row_id = (int)($key+1);
		    		$text 		 = '';
		    		if (isset($result[$next_row_id]) && strpos($result[$next_row_id],'[geo-')!==0) {
		    			$text = trim($result[$next_row_id]);
		    		}

		    		preg_match_all($pattern_geo, $value, $matches);
		    			#dump($matches, ' matches ++ '.to_string());
		    		$layer_id = (int)$matches[$key_tag_id][0];
		    		$geo_data = $matches[$key_data][0];
		    		$geo_data = str_replace('\'', '"', $geo_data);
		    		$geo_data = json_decode($geo_data);

		    		$layer_data = $geo_data;

		    		$element = new stdClass();
		    			$element->layer_id 		= $layer_id;
		    			$element->text 			= $text;		    			
		    			$element->layer_data	= $layer_data;

		    		$ar_elements[] = $element;
		    	}
		    }//end foreach ((array)$result as $key => $value)

			dump($result, ' result ++ '.to_string($pattern_geo));
			dump($ar_elements, ' ar_elements ++ '.to_string());

			$response->result = $ar_elements;
			$response->msg 	  = 'Ok. Request done. get_geolocation_data';
			
			return $response;
		}//end get_geolocation_data*/



	/* GLOBAL SEARCH
	----------------------------------------------------------------------- */


		/**
		* GET_GLOBAL_SEARCH
		* Note: Search string is expected utf-8 rawurlencoded — URL-encode according to RFC 3986 
		* @return object $response
		*/
		public static function get_global_search( $request_options ) {

			$response = new stdClass();
				$response->result = false;
				$response->msg 	  = 'Error. Request free_search failed';
			
			$options = new stdClass();
				$options->q 				= null;
				$options->search_modifier 	= 'IN BOOLEAN MODE';
				$options->sql_filter 		= false;
				$options->lang 				= WEB_CURRENT_LANG_CODE;
				$options->rows_per_page 	= 10;
				$options->page_number 		= 1;
				$options->offset 			= 0;
				$options->count 			= true;
				$options->ar_fields 		= array('section_id','list_data','link');
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}
	
		
			# Search string is expected rawurlencoded — URL-encode according to RFC 3986 			
			# q scape
			if ($options->q!==false) {
				$options->q = web_data::get_db_connection()->real_escape_string($options->q);
			}

			# Offset
			if ($options->page_number>1) {
				$options->offset = ($options->page_number-1) * $options->rows_per_page;
			}

			$global_search_table = defined('TABLE_GLOBAL_SEARCH') ? TABLE_GLOBAL_SEARCH : 'global_search';
			$field_full_data 	 = defined('FIELD_FULL_DATA') ? FIELD_FULL_DATA : 'full_data';

			#
			# GLOBAL SEARCH RECORDS
			$search_options = new stdClass();
				$search_options->table 		= $global_search_table;
				$search_options->ar_fields 	= $options->ar_fields;
				# Filter
				$search_options->sql_filter = '';
				# q
				if ($options->q!==false) {
					# Add field
					$field_fts = "MATCH (".$field_full_data.") AGAINST ('$options->q') AS relevance ";
					array_unshift($search_options->ar_fields, $field_fts);
					# Add filter
					$search_options->sql_filter .= 'MATCH ('.$field_full_data.') AGAINST (\''.$options->q.'\' '.$options->search_modifier.')';
				}
				# sql_filter		
				if ($options->sql_filter!==false) {					
					if (!empty($options->q)) {
						$search_options->sql_filter .= ' AND (' . $options->sql_filter .')';
					}else{
						$search_options->sql_filter .= $options->sql_filter;
					}
				}
				$search_options->lang 		= $options->lang;
				$search_options->order 		= "relevance DESC";
				$search_options->limit 		= $options->rows_per_page;
				$search_options->offset 	= $options->offset;
				$search_options->count 		= $options->count;

			$rows_data = (object)web_data::get_rows_data( $search_options );
				#dump($rows_data->result, ' $rows_data ++ '.to_string());
				#dump($search_options, ' $search_options ++ '.to_string()); die();	

			if($rows_data->result===false) {
				$response->result = false;
				$response->msg 	  = 'Error. Request global_search failed. '.$rows_data->msg;
				return $response;
			}


			# Add vars for pagination
			$response->page_number 	 = $options->page_number;
			$response->rows_per_page = $options->rows_per_page;
			$response->total 		 = $rows_data->total;

			$response->result 		 = $rows_data->result;
			$response->msg 			 = 'Ok. Request global_search done successfully';


			return $response;
		}//end get_global_search



		/**
		* GET_GLOBAL_SEARCH_JSON
		* Note: Search string is expected utf-8 rawurlencoded — URL-encode according to RFC 3986 
		* @return object $response
		*/
		public static function get_global_search_json( $request_options ) {
	
			$response = new stdClass();
				$response->results = false;
				#$response->msg 	   = 'Error. Request free_search failed';
			
			$options = new stdClass();
				$options->json_search = null;				
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}
			# Example
				# {
				#     "database": "sra",
				#     "lang": "ca",
				#     "query": "batalla del ebro",
				#     "filters": {
				#    	 "birth_place": "es1_2352",
				#    	 "dead_at_prison": false,
				#    	 "end_date": 376790400,
				#    	 "exile_place": "es1_967"
				#    	 "municipality": "on1_5624"
				#    	 "name_surname": "Rubianes",
				#    	 "neighborhood": "es1_967",
				#    	 "prison_municipality": "Barcelona",
				#    	 "prison": "Presó Convent de les Adoratrius de Girona",
				#    	 "project": 34,
				#    	 "pub_author": "Julio Verne",
				#    	 "pub_editor": "Joan Porcel",
				#    	 "pub_year": 1985,
				#    	 "region": "on1_5624"
				#    	 "residence_place": "es1_2352",
				#    	 "start_date": 376790400,
				#    	 "theme": "Espais de la Guerra Civil",
				#    	 "thesaurus": ["id_1", "id_2", "id_3"],
				#    	 "title": "Títol específic",
				#    	 "typology": "Llibre"
				#     },
				#     "pagination":{
				#    	 "limit": 10,
				#    	 "offset": 0
				#     },
				#     "sort":{
				#    	 "direction": "asc",
				#    	 "name": "date"
				#     }
				# }
				#dump($options, ' options ++ '.to_string());

			
			if(!$json_data = json_decode($options->json_search)){
				debug_log(__METHOD__." Error on make global search. Invalid options  ".to_string($options->json_search), logger::WARNING);
				return $response;
			}
			#dump($json_data, ' json_data ++ '.to_string());
			
			$q = isset($json_data->query) ? $json_data->query : null;

			switch ($json_data->lang) {
				case 'ca': $lang = 'lg-cat'; break;
				case 'es': $lang = 'lg-spa'; break;
				case 'en': $lang = 'lg-eng'; break;
				case 'fr': $lang = 'lg-fra'; break;
				default: $lang = null;
			}

			$rows_per_page  = isset($json_data->pagination->limit) ? $json_data->pagination->limit : 10;
			$offset 		= isset($json_data->pagination->offset) ? $json_data->pagination->offset : 0;		

			#
			# ORDER
				$order = '';
				if (!empty($json_data->sort) && !empty($json_data->sort->name) && !empty($json_data->sort->direction)) {
					if ($json_data->sort->name==='name') {
						#$json_data->sort->name = 'full_data';
						#$json_data->sort->name = 'name_surname'; // Changed 18-03-2018 !!
						$json_data->sort->name = 'sort'; // Changed 16-11-2018 !!
					}elseif ($json_data->sort->name==='date') {
						$json_data->sort->name = 'start_date';
					}					
					$order = $json_data->sort->name.' '.strtoupper($json_data->sort->direction);
				}

			$options->q 				= $q;
			$options->search_modifier 	= 'IN BOOLEAN MODE';
			$options->sql_filter 		= false;
			$options->lang 				= $lang;
			$options->rows_per_page 	= $rows_per_page;
			$options->page_number 		= 1;
			$options->offset 			= $offset;
			$options->count 			= true;
			$options->order 			= $order;
			#$options->ar_fields 		= array('id','section_id','list_data','link');
		
			# Search string is expected rawurlencoded — URL-encode according to RFC 3986 
			# q scape
			if ($options->q!==false) {
				$options->q = web_data::get_db_connection()->real_escape_string($options->q);
			}

			function escape_string($string) {
				$result = web_data::get_db_connection()->real_escape_string($string);
				return $result;
			}

			#
			# FILTER
				$ar_filter = [];
				# database
				if (!empty($json_data->database)) {
					$ar_filter[] = "`table` = '".strtolower($json_data->database)."'";
				}
				# birth_place
				if (!empty($json_data->filters->birth_place)) {
					$ar_filter[] = "birth_place LIKE '%\"".escape_string($json_data->filters->birth_place)."\"%'";
				}
				# dead_at_prison
				if (!empty($json_data->filters->dead_at_prison) && is_bool($json_data->filters->dead_at_prison)) {
					if ($json_data->filters->dead_at_prison===true) {						
						$ar_filter[] = "dead_at_prison = 1 ";
					}else if ($json_data->filters->dead_at_prison===false) {						
						$ar_filter[] = "dead_at_prison IS NULL ";
					}					
				}
				# end_date . data format timestamp UNIX
				if (!empty($json_data->filters->end_date)) {
					$ar_filter[] = "end_date = '".$json_data->filters->end_date."'";
				}
				# exile_place . like es1_967
				if (!empty($json_data->filters->exile_place)) {
					$ar_filter[] = "exile_place LIKE '%\"".escape_string($json_data->filters->exile_place)."\"%'";
				}
				# municipality . like es1_967
				if (!empty($json_data->filters->municipality)) {
					$ar_filter[] = "municipality LIKE '%\"".escape_string($json_data->filters->municipality)."\"%'";
				}
				# name_surname . like Rubianes
				if (!empty($json_data->filters->name_surname)) {
					#$ar_filter[] = "name_surname LIKE '%\"".$json_data->filters->name_surname."\"%'";
					$ar_filter[] = "name_surname LIKE '%".escape_string($json_data->filters->name_surname)."%'"; // Changed 18-03-2018 !!
				}
				# neighborhood . like es1_967
				if (!empty($json_data->filters->neighborhood)) {
					$ar_filter[] = "neighborhood LIKE '%\"".escape_string($json_data->filters->neighborhood)."\"%'";
				}
				# prison_municipality . like Barcelona
				if (!empty($json_data->filters->prison_municipality)) {
					$ar_filter[] = "prison_municipality LIKE '%".escape_string($json_data->filters->prison_municipality)."%'";
				}
				# prison . like ["582","3","4","12446"] (portal to table)
				if (!empty($json_data->filters->prison)) {
					$ar_filter[] = "prison LIKE '%\"".escape_string($json_data->filters->prison)."\"%'";
				}
				# project. like 68
				if (!empty($json_data->filters->project)) {
					$ar_filter[] = "project LIKE '%\"".escape_string($json_data->filters->project)."\"%'";
				}
				# pub_author . like Joan Porcel
				if (!empty($json_data->filters->pub_author)) {
					$ar_filter[] = "pub_author LIKE '%".escape_string($json_data->filters->pub_author)."%'";
				}
				# pub_editor . like Joan Porcel
				if (!empty($json_data->filters->pub_editor)) {
					$ar_filter[] = "pub_editor LIKE '%".escape_string($json_data->filters->pub_editor)."%'";
				}
				# pub_year . like 1920
				if (!empty($json_data->filters->pub_year)) {
					$ar_filter[] = "pub_year = ".$json_data->filters->pub_year;
				}
				# region . like 
				if (!empty($json_data->filters->region)) {
					$ar_filter[] = "region LIKE '%\"".escape_string($json_data->filters->region)."\"%'";
				}
				# residence_place
				if (!empty($json_data->filters->residence_place)) {
					$ar_filter[] = "residence_place LIKE '%".escape_string($json_data->filters->residence_place)."%'";
				}
				# start_date . like 376790400
				if (!empty($json_data->filters->start_date)) {
					#$ar_filter[] = "start_date = ".$json_data->filters->start_date;
					$ar_filter[] = "start_date = '".$json_data->filters->start_date."'";
				}
				# theme . like Espais de la Guerra Civil
				if (!empty($json_data->filters->theme)) {
					$ar_filter[] = "theme LIKE '%".escape_string($json_data->filters->theme)."%'";
				}
				# thesaurus . like [“es1_2352”, “es1_967”]
				if (!empty($json_data->filters->thesaurus)) {
					$ar_thesaurus = $json_data->filters->thesaurus;
						#dump($ar_thesaurus, ' ar_thesaurus ++ '.to_string());
					$ar_term = [];
					foreach ((array)$ar_thesaurus as $key => $value) {
						$ar_term[] = "`thesaurus` LIKE '%\"".escape_string($value)."\"%'";
					}
					#dump($ar_term, ' ar_term ++ '.to_string());
					if (!empty($ar_term)) {
						$current_filter_thesaurus = '('.implode(' AND ', $ar_term).')';
						#dump($current_filter_thesaurus, ' current_filter_thesaurus ++ '.to_string($current_filter_thesaurus));
						$ar_filter[] 	= $current_filter_thesaurus;
					}
				}
				# title . like Ttile de la Guerra Civil
				if (!empty($json_data->filters->title)) {
					$ar_filter[] = "`title` LIKE '%".escape_string($json_data->filters->title)."%'";
				}
				# typology
				if (!empty($json_data->filters->typology)) {
					$ar_filter[] = "`typology` = '".$json_data->filters->typology."'";
				}

				if (!empty($ar_filter)) {
					$options->sql_filter = implode(' AND ', $ar_filter);
				}
				#dump($options->sql_filter, '$options->sql_filter ++ '.to_string());
	
			
			# Offset
			#if ($options->page_number>1) {
			#	$options->offset = ($options->page_number-1) * $options->rows_per_page;
			#}

			$global_search_table = defined('TABLE_GLOBAL_SEARCH') ? TABLE_GLOBAL_SEARCH : 'global_search';
			$field_full_data 	 = defined('FIELD_FULL_DATA') ? FIELD_FULL_DATA : 'full_data';

			$mdcat_tipos = [
					'birth_place',
					'dead_at_prison',
					'end_date',
					'exile_place',
					'municipality',
					'name_surname',
					'neighborhood',
					'prison_municipality',
					'prison',
					'project',
					'pub_author',
					'pub_editor',
					'pub_year',
					'region',
					'residence_place',
					'start_date',
					'theme',
					'thesaurus',
					'title',
					'typology'
				];

			#
			# GLOBAL SEARCH RECORDS
			$search_options = new stdClass();
				$search_options->table 		= $global_search_table;
				$search_options->ar_fields 	= array('id','section_id','list_data','link','fields');
				$search_options->ar_fields 	= array_merge($search_options->ar_fields, $mdcat_tipos);
				# Filter
				$search_options->sql_filter = '';
				# q
				if (!empty($options->q)) {
					# Add field
					$field_fts = "MATCH (".$field_full_data.") AGAINST ('$options->q') AS relevance ";
					array_unshift($search_options->ar_fields, $field_fts);
					# Add filter
					$search_options->sql_filter .= 'MATCH ('.$field_full_data.') AGAINST (\''.$options->q.'\' '.$options->search_modifier.')';
				}
				# sql_filter		
				if ($options->sql_filter!==false) {					
					if (!empty($options->q)) {
						$search_options->sql_filter .= ' AND (' . $options->sql_filter .')';
					}else{
						$search_options->sql_filter .= $options->sql_filter;
					}
				}				

				if( !empty($options->q) && empty($options->order) ) {
					$options->order = "relevance DESC";
				}

				// sort by 'sort_id' always
					if (empty($options->order)) {
						$options->order = 'sort_id ASC';
					}else{
						$options->order .= ', sort_id ASC';
					}

				$search_options->lang 		= $options->lang;				
				$search_options->order 		= $options->order;
				$search_options->limit 		= $options->rows_per_page;
				$search_options->offset 	= $options->offset;
				$search_options->count 		= $options->count;

			$rows_data = (object)web_data::get_rows_data( $search_options );
				#dump($rows_data, ' $rows_data ++ '.to_string($search_options));
				#dump($search_options, ' $search_options ++ '.to_string()); die();	

			if($rows_data->result===false) {
				#$response->result = false;
				$response->results = false;
				#$response->msg 	  = 'Error. Request global_search failed. '.$rows_data->msg;
				$response->error_msg  = 'Error. Request global_search failed. '.$rows_data->msg;
				$response->error_id   = 1;
				return $response;
			}
	
			# Custom output		
			$ar_result_final = [];
			foreach ($rows_data->result as $key => $row) {

				$link 		 = json_decode($row['link']);
				$fields_data = json_decode($row['fields']);

				$row_formated = array();
				
				$row_formated['id'] 	= $link->section_id; //$row['section_id'];
				$row_formated['table'] 	= $link->table;

				#foreach ($mdcat_tipos as $column_name) {
				#	$row_formated[$column_name] = $row[$column_name];
				#}
				foreach ($fields_data as $key => $value_obj) {
					#$name = $value_obj->name;
					#$value= $value_obj->value;
					#dump($value_obj->name, ' var ++ '.to_string($value_obj->value));
					if ($value_obj->name==='descriptors') {
						$value_obj->value = json_decode($value_obj->value);
					}

					$row_formated[$value_obj->name] = $value_obj->value;
				}

				$ar_result_final[] = $row_formated;
			}
			#dump($ar_result_final, ' ar_result_final ++ '.to_string());

			# Add vars for pagination
			#$response->page_number 	 = $options->page_number;
			#$response->rows_per_page = $options->rows_per_page;
			$response->total 		 = $rows_data->total;

			$response->results 		 = $ar_result_final; //$rows_data->result;
			#$response->msg 			 = 'Ok. Request global_search done successfully';


			return $response;
		}//end get_global_search_json



	/* NUMISDATA
	----------------------------------------------------------------------- */
		/**
		* SEARCH_TIPOS
		* @return array $ar_result
		*/
		public static function get_search_tipos($request_options) {
			#dump($request_options, ' request_options ++ '.to_string());
			$options = new stdClass();
				$options->ar_query 	= [];
				$options->limit 	= 10;
				$options->offset 	= null;
				$options->count 	= false;
				$options->total 	= false;
				$options->order 	= null;
				$options->operator 	= 'AND';
				$options->lang 		= WEB_CURRENT_LANG_CODE;
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}			
		
			$ar_monedas_filter = false;

			// Filter
				$filter = null;
				if ($options->ar_query) {
					$ar_filter = [];

					foreach ($options->ar_query as $key => $value_obj) {

						$current_value = addslashes($value_obj->value);
						$current_name  = $value_obj->name;					

						if (!isset($value_obj->eq)) {
							$value_obj->eq = 'LIKE';
						}

						switch ($value_obj->table) {

							// FICHERO . SUBQUERY
							case 'fichero':
								$fichero_options = new stdClass();								
									$fichero_options->table  	 	= 'fichero';
									$fichero_options->ar_fields  	= ['section_id'];
									$fichero_options->lang  	 	= $options->lang;
									$fichero_options->limit 		= 0;
									$fichero_options->order 		= 'section_id ASC';
									switch ($value_obj->eq) {
										case '=':
											$fichero_options->sql_filter = '`'.$value_obj->name."` = '".$current_value.'\'';
											break;
										default:
											if ($value_obj->search_mode==='int') {
												$fichero_options->sql_filter = '`'.$value_obj->name."` = ".(int)$current_value;
											}else{
												$fichero_options->sql_filter = '`'.$value_obj->name."` LIKE '%".$current_value."%'";
											}
											break;
									}
								$web_data = self::get_rows_data($fichero_options);

								$monedas_ar_filter = [];
								foreach ($web_data->result as $key => $row) {
									$row = (object)$row;
									$monedas_ar_filter[] = '`monedas` LIKE \'%"'.(int)$row->section_id.'"%\''; // Filter for table tipos
									# Store for filter later
									$ar_monedas_filter[] = $row->section_id;
								}
								
								$ar_filter[$current_name][] = '('.implode(' OR ', $monedas_ar_filter).')';
								break;

							// TS_LUGAR_DE_HALLAZGO . SUBQUERY
							case 'ts_lugar_de_hallazgo':
								$lugar_de_hallazgo_options = new stdClass();
									$lugar_de_hallazgo_options->table  	 	= $value_obj->table; //'ts_cultura';
									$lugar_de_hallazgo_options->ar_fields  	= ['term_id'];
									$lugar_de_hallazgo_options->lang  	 	= $options->lang;
									$lugar_de_hallazgo_options->limit 		= 0;

								switch ($value_obj->eq) {
									case '=':
										$lugar_de_hallazgo_options->sql_filter = '`'.$value_obj->name."` = '".$current_value.'\'';
										break;
									default:
										if ($value_obj->search_mode==='int') {
											$lugar_de_hallazgo_options->sql_filter = '`'.$value_obj->name."` = ".(int)$current_value;
										}else{
											$lugar_de_hallazgo_options->sql_filter = '`'.$value_obj->name."` LIKE '%".$current_value."%'";
										}
										break;
								}
								$web_data = self::get_rows_data($lugar_de_hallazgo_options);
								
								# Ahora buscamos en hallazgos, que es el que está conectado con ts_lugar_de_hallazgo
								$hallazgos_filter = [];						
								foreach ($web_data->result as $lugar_de_hallazgo_value) {
									$lugar_de_hallazgo_value = (object)$lugar_de_hallazgo_value;
									$hallazgos_filter[] = '`tipologia_dato` LIKE \'%"'.$lugar_de_hallazgo_value->term_id.'"%\'';
								}						
								$hallazgos_options = new stdClass();
									$hallazgos_options->table  	 	= 'hallazgos'; //'ts_cultura';
									$hallazgos_options->ar_fields  	= ['section_id'];
									$hallazgos_options->lang  	 	= $options->lang;
									$hallazgos_options->limit 		= 0;
									$hallazgos_options->sql_filter 	= '('.implode(' OR ', $hallazgos_filter).')';
								$web_data = self::get_rows_data($hallazgos_options);
									#dump($web_data, ' $web_data ++ '.to_string($hallazgos_options));

								# Ahora buscamos en fichero, que es el que está conectado con hallazgos
								$fichero_filter = [];						
								foreach ($web_data->result as $hallazgos_value) {
									$hallazgos_value = (object)$hallazgos_value;
									$fichero_filter[] = '`hallazgo_dato` LIKE \'%"'.$hallazgos_value->section_id.'"%\'';
								}
								$fichero_options = new stdClass();
									$fichero_options->table  	 	= 'fichero';
									$fichero_options->ar_fields  	= ['section_id'];
									$fichero_options->lang  	 	= $options->lang;
									$fichero_options->limit 		= 0;
									$fichero_options->sql_filter 	= '('.implode(' OR ', $fichero_filter).')';
									$fichero_options->order 		= 'section_id ASC';
								$web_data = self::get_rows_data($fichero_options);
									#dump($web_data, ' $web_data ++ '.to_string($hallazgos_options));

								$monedas_ar_filter = [];
								foreach ($web_data->result as $key => $row_monedas) {
									$row_monedas = (object)$row_monedas;
									$monedas_ar_filter[] = '`monedas` LIKE \'%"'.(int)$row_monedas->section_id.'"%\''; // Filter for table tipos
									# Store for filter later
									$ar_monedas_filter[] = $row_monedas->section_id;
								}
								if(!empty($monedas_ar_filter))	$ar_filter[$current_name][] = '('.implode(' OR ', $monedas_ar_filter).')';
								break;

							// TS_CULTURA . SUBQUERY
							case 'ts_cultura':
								$cultura_options = new stdClass();
									$cultura_options->table  	 	= $value_obj->table; //'ts_cultura';
									$cultura_options->ar_fields  	= ['term_id'];
									$cultura_options->lang  	 	= $options->lang;
									$cultura_options->limit 		= 0;
									switch ($value_obj->eq) {
										case '=':
											$cultura_options->sql_filter = '`'.$value_obj->name."` = '".$current_value.'\'';
											break;
										default:
											if ($value_obj->search_mode==='int') {
												$cultura_options->sql_filter = '`'.$value_obj->name."` = ".(int)$current_value;
											}else{
												$cultura_options->sql_filter = '`'.$value_obj->name."` LIKE '%".$current_value."%'";
											}
											break;
									}
								$web_data = self::get_rows_data($cultura_options);
								foreach ($web_data->result as $key => $row) {
									$row = (object)$row;
									$ar_filter[$current_name][] = '`cultura` LIKE \'%"'.$row->term_id.'"%\''; // Filter for table tipos
								}
								break;
							
							// TIPOS . DIRECT
							case 'tipos':
							default:
								if ($value_obj->name==='fecha_inicio' || $value_obj->name==='fecha_fin') {

									if ($value_obj->name==='fecha_inicio') {
										$ar_field = array_filter($options->ar_query,function($element){
											return $element->name==='fecha_fin';
										});
										$ar_field = array_values($ar_field); # Reset keys
										if (!empty($ar_field) && !empty($ar_field[0]->value)) {																		
											# Existe valor de fecha_inicio
											$ar_filter[$current_name][] = '(CAST(`fecha_inicio` AS INT) >= '.$current_value.')';
											
										}else{
											$ar_filter[$current_name][] = '((`fecha_fin` IS NULL AND `fecha_inicio` = '.$current_value.') OR (CAST(`fecha_fin` AS INT) >= '.$current_value.' AND CAST(`fecha_inicio` AS INT) <= '.$current_value.'))';
										}								
									
									}elseif ($value_obj->name==='fecha_fin') {
										
										$ar_field = array_filter($options->ar_query,function($element){
											return $element->name==='fecha_inicio';
										});
										$ar_field = array_values($ar_field); # Reset keys
										if (!empty($ar_field) && !empty($ar_field[0]->value)) {																		
											# Existe valor de fecha_inicio
											$ar_filter[$current_name][] = '(CAST(`fecha_fin` AS INT) <= '.$current_value.')';
										
										}else{
											# No hay fecha de inicio
											$ar_filter[$current_name][] = '(`fecha_fin` = '.$current_value.')';
										}									
									}							

								}else{
									switch ($value_obj->eq) {
										case '=':
											$ar_filter[$current_name][] = '`'.$value_obj->name."` = '".$current_value.'\'';
											break;
										case 'LIKE':
										default:
											if ($value_obj->search_mode==='int') {
												$ar_filter[$current_name][] = '`'.$value_obj->name."` = ".(int)$current_value;
											}else{												
												switch ($value_obj->name) {
													case 'leyenda':
														$filter  = "CONCAT_WS(' ', `leyenda_anverso`, `leyenda_reverso`) LIKE '%".trim($current_value)."%'";
														$filter .= " AND LENGTH(CONCAT_WS('', `leyenda_anverso`, `leyenda_reverso`))>3";
														$ar_filter[$current_name][] = $filter;
														break;
													case 'diseno':
														$filter  = "CONCAT_WS(' ', `tipo_anverso`, `tipo_reverso`) LIKE '%".trim($current_value)."%'";
														$filter .= " AND LENGTH(CONCAT_WS('', `tipo_anverso`, `tipo_reverso`))>3";
														$ar_filter[$current_name][] = $filter;
														break;
													default:
														$ar_filter[$current_name][] = '`'.$value_obj->name."` LIKE '%".$current_value."%'";
														break;
												}
											}
											break;
									}//end switch ($value_obj->eq)																				
								}					
								break;
						}//end switch ($value_obj->table)

					}//end if ($options->ar_query)

					// Overrides ar_monedas_filter when is received search for 'fichero' section_id
					$ar_fichero_section_id = array_filter($options->ar_query, function($element){
						return ($element->table === 'fichero' && $element->name === 'section_id'); 
					});
					if (!empty($ar_fichero_section_id)) {
						$ar_monedas_filter = []; // reset
						foreach ($options->ar_query as $value_obj) {
							$ar_monedas_filter[] = $value_obj->value;
						}
					}

					// Create final filter
					$ar_filter_final = [];
					foreach ($ar_filter as $current_name => $ar_value) {
						$ar_filter_final[] = '('.implode(' OR ', $ar_value).')';
					}
					$filter = '('.implode(' '.$options->operator.' ', $ar_filter_final).')';
				}
				debug_log(__METHOD__." filter ".to_string($filter), 'DEBUG');
			
			// Search		
				$tipos_options = new stdClass();
					$tipos_options->table  	 	= 'tipos';
					$tipos_options->lang  	 	= $options->lang;
					$tipos_options->limit 		= (int)$options->limit;
					$tipos_options->offset 		= $options->offset;
					$tipos_options->count 		= ($options->total!==false) ? false : $options->count;
					$tipos_options->order 		= $options->order;
					$tipos_options->sql_filter 	= $filter;				
					$tipos_options->resolve_portals_custom = new stdClass();
						$tipos_options->resolve_portals_custom->autoridad_dato = 'personalidades';
						$tipos_options->resolve_portals_custom->catalogo_dato  = 'catalogo';

				# Http request in php to the API
				$web_data = self::get_rows_data($tipos_options);
					#dump($web_data, ' web_data ++ '.to_string());

				// total . inject when value is already know
					if ($options->total!==false) {
						$web_data->total = $options->total;
					}
			
			# Convert to object all row_tipo
			$ar_tipos = [];
			foreach ($web_data->result as $key => $row_tipo) {
				$ar_tipos[] = (object)$row_tipo;
			}


			$cultura_section_tipo = 'cult1';
			foreach ($ar_tipos as $key => $row_tipo) {
				if (empty($row_tipo->monedas)) continue;	

				$monedas = json_decode($row_tipo->monedas);

				$ar_filter = [];
				foreach ((array)$monedas as $moneda_section_id) {
					if ($ar_monedas_filter!==false && false===in_array($moneda_section_id, $ar_monedas_filter)) {
						continue; # Skip
					}
					$ar_filter[] = 'section_id = '.$moneda_section_id;
				}
				$filter = '('.implode(' OR ', $ar_filter).')';

				$fichero_options = new stdClass();
					$fichero_options->table  	 	= 'fichero';
					$fichero_options->lang  	 	= $options->lang;
					$fichero_options->limit 		= 0;
					$fichero_options->sql_filter 	= $filter;
					$fichero_options->order 		= 'section_id ASC';					
					$fichero_options->resolve_portals_custom = new stdClass();
						$fichero_options->resolve_portals_custom->imagen_anverso  = 'imagen';
						$fichero_options->resolve_portals_custom->imagen_reverso  = 'imagen';
						$fichero_options->resolve_portals_custom->hallazgo_dato   = 'hallazgos';
				$fichero_web_data = self::get_rows_data($fichero_options);
					#dump($fichero_web_data->result, '$fichero_web_data->result ++ '.to_string());
				# Convert to array of objects
				$fichero_ar_rows = [];
				foreach ($fichero_web_data->result as $key => $value) {
					$fichero_ar_rows[] = (object)$value;
				}
				
				// Add resolved values
				/*
				if (!empty($fichero_web_data->result)) {
					
					foreach ($fichero_ar_rows as $ckey => $cvalue) {
						if (empty($cvalue->bibliografia_dato)) {
							$fichero_ar_rows[$ckey]->publicaciones = null;
							continue;
						}

						$fichero_ar_rows[$ckey]->publicaciones = [];
						
						// Publicaciones add
						$bibliografia_dato = (array)json_decode($cvalue->bibliografia_dato);
						foreach ($bibliografia_dato as $cbkey => $current_biblio_id) {
							$options_biblio = new stdClass();
								$options_biblio->table  	 	= 'publicaciones';
								$options_biblio->lang  	 		= $options->lang;
								$options_biblio->sql_filter 	= 'section_id = '. (int)$current_biblio_id;
								$options_biblio->limit 			= 1;
							$rows_data_biblio = self::get_rows_data($options_biblio);

							if (!empty($rows_data_biblio->result)) {
								#$fichero_ar_rows[$ckey]->publicaciones[] = reset($rows_data_biblio->result);
								$fichero_ar_rows[$ckey]->publicaciones[] = reset($rows_data_biblio->result);
							}
						}
						
						// Publicaciones add
						#$bibliografia_dato  = $cvalue->bibliografia_dato;
						#$ar_biblio 			= explode(',', $bibliografia_dato);
						#	#dump($ar_biblio, ' ar_biblio ++ '.to_string());
						#foreach ($ar_biblio as $current_biblio_json) {
						#	$json_data = (array)json_decode($current_biblio_json);
						#	foreach ($json_data as $cbkey => $current_biblio_id) {
						#		
						#		$options_biblio = new stdClass();
						#			$options_biblio->table  	 	= 'publicaciones';
						#			$options_biblio->lang  	 		= $options->lang;
						#			$options_biblio->sql_filter 	= 'section_id = '. (int)$current_biblio_id;
						#			$options_biblio->limit 			= 1;
						#		$rows_data_biblio = self::get_rows_data($options_biblio);
						#			#dump($rows_data_biblio->result, '$rows_data_biblio->result ++ '.to_string());
						#		if (!empty($rows_data_biblio->result)) {
						#			#$fichero_ar_rows[$ckey]->publicaciones[] = reset($rows_data_biblio->result);
						#			$fichero_ar_rows[$ckey]->publicaciones[] = reset($rows_data_biblio->result);
						#		}
						#	}
						#}

					}//end foreach ($fichero_ar_rows as $ckey => $cvalue)
					#dump($fichero_ar_rows, ' fichero_ar_rows ++ '.to_string());			
				}
				*/

				// Add monedas
				$row_tipo->monedas = $fichero_ar_rows;

		
				// Cultura add								
				if (!empty($row_tipo->cultura)) {

					$cultura_dato = (array)json_decode($row_tipo->cultura);
						#dump($cultura_dato, ' cultura_dato ++ '.to_string());	
					$ar_cultura   = array_filter($cultura_dato, function($element) use($cultura_section_tipo) {
						return (strpos($element, $cultura_section_tipo)===0);
					});								
					if (!empty($ar_cultura)) {
						$ar_filter_cultura = [];
						foreach ($ar_cultura as $current_cultura_term_id) {
							$ar_filter_cultura[] = 'term_id = \''.$current_cultura_term_id.'\'';
						}

						$options_cultura = new stdClass();
							$options_cultura->table  	 	= 'ts_cultura';
							$options_cultura->ar_fields  	= ['term'];
							$options_cultura->lang  	 	= $options->lang;
							$options_cultura->sql_filter 	= '('.implode(' OR ', $ar_filter_cultura).')';
							$options_cultura->limit 		= 0;
						$rows_data_cultura = self::get_rows_data($options_cultura);
							#dump($rows_data_cultura->result, '$rows_data_cultura->result ++ '.to_string());
						# Replace row content				
						$row_tipo->cultura = $rows_data_cultura->result;
					}
				}			
			
			}//end foreach ($web_data->result as $key => $row_tipo)
			#dump($web_data->result, '$web_data->result ++ '.to_string());

			$ar_result = array_values($ar_tipos);
			#$ar_result = json_encode($ar_result);
			#$ar_result = json_decode($ar_result);

			$response = new stdClass();
				$response->result 	= $ar_result;
				$response->total 	= isset($web_data->total) ? $web_data->total : null;
				$response->msg 		= 'Ok. Request done!';

			
			return $response;
		}//end search_tipos



	/* IMAGE
	----------------------------------------------------------------------- */
	public static function get_image_data( $request_options ) {	
		
		$options = new stdClass();
			$options->section_id				= false;
			$options->lang 						= WEB_CURRENT_LANG_CODE;
			$options->btn_url 					= __CONTENT_BASE_URL__ . '/dedalo/inc/btn.php';
			$options->description_with_images 	= true;
			$options->description_clean 		= true;
			$options->add_notes 				= true;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$response = new stdClass();
			$response->result = false;
			$response->msg 	  = 'Error. Request get_image_data failed';	

		$image = new image( $options->section_id, $fn_options=$options );
		$image->load_data(); # Froce to load data
			#dump($image, ' image ++ '.to_string());
		

		$response->result = $image;
		$response->msg 	  = 'Ok. Request get_image_data done successfully';


		return $response;
	}//end get_ar_fragments_from_reel



	/**
	* GET_MENU_TREE_PLAIN
	* @param object $request_options
	* @return array $ar_data
	*/
	public static function get_menu_tree_plain( $request_options ) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= __METHOD__ .' Error. Request failed';

		$options = new stdClass();
			$options->table 	= null;
			$options->fields 	= ['*'];
			$options->term_id 	= null;
			$options->lang 		= null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}
				#dump($options, ' options ++ '.to_string());

		// search
			$search_options = new stdClass();
				$search_options->dedalo_get = 'records';
				$search_options->lang 		= $options->lang;
				$search_options->table 		= $options->table;
				$search_options->ar_fields 	= $options->fields;
				$search_options->sql_filter = '`parent` = \''.$options->term_id.'\'';
				$search_options->order 		= '`norder` ASC';
			$data = self::get_rows_data($search_options);
				#dump($data, ' data ++ '.to_string($search_options));
		
		$ar_data = $data->result;	
			#dump($ar_data, ' ar_data ++ '.to_string($term_id));

		foreach ((array)$data->result as $key => $value) {

			$value 		= (object)$value;
			$childrens 	= json_decode($value->childrens);
						
			if (!empty($childrens)) {

				$childrens_options = clone $options;
					$childrens_options->term_id = $value->term_id;

				$ar_data = array_merge($ar_data, self::get_menu_tree_plain($childrens_options)->result );
			}
		}
		#dump($ar_data, ' ar_data ++ '.to_string());

		// set response
			$response->result 	= $ar_data;
			$response->msg 		= 'Ok. Request done!';

		return $response;
	}//end get_menu_tree_plain



	/**
	* GET_COMBI
	* @param object $request_options
	*	Contains a set of calls to this class
	*	Like: {
	*		ar_calls : [
	*			{ id : menu_all,
	*			  options : options 
	*			}
	*		]
	*	}
	* @return object $response
	*/
	public static function get_combi( $request_options ) {
		
		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= __METHOD__ . ' Error. Request failed';

		$ar_response = [];

		// iterate all calls
			foreach ($request_options->ar_calls as $call_obj) {				

				// call to local static method 
					$manager = new manager();
					$current_response = $manager->manage_request($call_obj->options);

				// inject id
					$current_response->id = $call_obj->id;

				// store response
					$ar_response[] = $current_response;								
			}


		$response->result 	= $ar_response;
		$response->msg 		= __METHOD__ . ' Ok. Request done';


		return $response;
	}//end get_combi



}//end class web_data



/*
function _mb_ereg_search_all($str, $re, $resultOrder = 0){

    // 0 mimics PREG_PATTERN_ORDER
    // 1 mimics PREG_SET_ORDER

	$matches = Array();

	mb_ereg_search_init($str, $re);
	while (($m = mb_ereg_search_regs())){
		$matches[] = $m;
	}

	if ($resultOrder == 0){
		$patternMatches = array_fill(0, count($matches), Array());
		foreach ($matches as $i => $match){
			foreach ($match as $j => $submatch){
				$patternMatches[$j][] = $submatch;
			}
		}
		$matches = $patternMatches;
	}

	return $matches;
}
*/