<?php
$dedalo_base_lib = dirname(dirname(dirname(dirname(__FILE__))));
#include_once( $dedalo_base_lib . '/common/class.TR.php');
include_once( $dedalo_base_lib . '/media_engine/class.OptimizeTC.php');
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
	static $version = "1.0.4"; // 11-03-2017

	
	/**
	* GET_ROWS_DATA
	* Función genérica de consulta a las tablas de difusión generadas por Dédalo tras la publicación web
	* Devuelve array con los rows de los campos solicitados
	* @param object $options . Object with options like table, ar_fields, lang, etc..
	* @return array $ar_data . Rows result from search
	*/
	public static function get_rows_data( $request_options ) {
		
		$response = new stdClass();

		$start_time = microtime(1);		
		
		# Options defaults
		$sql_options = new stdClass();
			$sql_options->table 		 = null;
			$sql_options->ar_fields 	 = array('*');
			$sql_options->sql_fullselect = false; // default false
			$sql_options->sql_filter 	 = ""; //publicacion = 'si'
			$sql_options->lang 			 = WEB_CURRENT_LANG_CODE;
			$sql_options->order 		 = '`id` ASC';
			$sql_options->limit 		 = 0;
			$sql_options->group 		 = false;
			$sql_options->offset 		 = false;
			$sql_options->count 		 = false;
			$sql_options->resolve_portal = false; // bool
			$sql_options->resolve_portals_custom = false; // array | bool
			$sql_options->apply_postprocess = true; //  bool default true
			$sql_options->conn 			 = DBi::_getConnection_mysql();

			foreach ($request_options as $key => $value) {if (property_exists($sql_options, $key)) $sql_options->$key = $value;}

		if (empty($sql_options->table) || empty($sql_options->conn)) {
			$response->result = false;
			$response->msg    = "Empty options table or connexion ";
			return $response;
		}
		#	dump($sql_options, ' sql_options ++ '.to_string());
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
					$strQuery .= "\nUNION ";
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
			$response->result = $ar_data;
			$response->msg    = "Error on sql request. Ilegal option";
		}
		
		
		# EXEC QUERY
		$result = $sql_options->conn->query($strQuery);		

		if (!$result) {			
			# Si hay problemas en la búsqueda, no lanzaremos error ya que esta función se usa en partes públicas		
			$response->result = $ar_data;
			$response->msg    = "Error on sql request";
			if(SHOW_DEBUG===true) {
				$msg = "ERROR Processing Request: ".$sql_options->conn->error ;
				// use always silent errors to not alter json result object			
				error_log(__METHOD__ ." $msg \n $strQuery ");		
				$response->msg .= $msg .' - '. $strQuery;
			}
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
					$current_field = $ar_parts[1];
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

		# Debug properties
		if(SHOW_DEBUG) {		
			if (isset($count_query)) {
			$response->debug['count_query']= $count_query;
			}
			$response->debug['strQuery']= $strQuery;
			$response->debug['time'] 	= round(microtime(1)-$start_time,3);
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
	public static function build_sql_select($ar_fields) {
		
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
	public static function build_sql_from($table) {
		$sql='';
		$sql .= "\nFROM ".trim($table)." ";

		return $sql;
	}//end build_sql_from



	/**
	* BUILD_SQL_WHERE
	* @return string $sql
	*/
	public static function build_sql_where($lang, $sql_filter) {
		$sql='';
		$sql .= "\nWHERE section_id IS NOT NULL";
		# LANG
		if(!empty($lang)) {
			if (strpos($lang, 'lg-')===false) {
				$lang = 'lg-'.$lang;
			}
			$sql .= "\nAND lang = '$lang'";
		}					
		# SQL_FILTER
		if(!empty($sql_filter) AND strlen($sql_filter)>3 ) {
			if($sql_filter===PUBLICACION_FILTER_SQL) {
				$sql .= "\n$sql_filter";
			}else{
				$sql .= "\nAND ($sql_filter)";
			}				
		}

		return $sql;
	}//end build_sql_where



	/**
	* BUILD_SQL_GROUP
	* @return string $sql
	*/
	public static function build_sql_group($group) {
		$sql='';
		$sql .= "\nGROUP BY $group";

		return $sql;
	}//end build_sql_group



	/**
	* BUILD_SQL_ORDER
	* @return string $sql
	*/
	public static function build_sql_order($order) {
		$sql='';
		$sql .= "\nORDER BY $order";

		return $sql;
	}//end build_sql_order



	/**
	* BUILD_SQL_limit
	* @return string $sql
	*/
	public static function build_sql_limit($limit, $offset=null) {
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
	public static function get_publication_schema( $table ) {
		$data = false;

		$strQuery = "SELECT data FROM publication_schema WHERE name = '$table'";
		$result   = DBi::_getConnection_mysql()->query($strQuery);

		if($result) while ( $rows = $result->fetch_assoc() ) {
			$data = json_decode($rows['data']);
			break;
		}

		#$data = new stdClass();
		#	$data->obras_de_arte = 'obras_de_arte';

		return $data;
	}//end get_publication_schema



	/**
	* GET_FULL_PUBLICATION_SCHEMA
	* @return object|false $data
	*/
	public static function get_full_publication_schema( ) {
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
	public static function portal_resolve($rows, $current_field, $options, $resolve_portals_custom) {
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
	 		}
	 		#dump($ar_portal, " ar_portal ".to_string());
	 	}

	 	return (array)$ar_portal;
	}//end portal_resolve



	/**
	* COUNT_RECORDS
	* @return int $total
	*/
	public static function count_records( $sql, $conn=false ) {

		if($conn===false) $conn=DBi::_getConnection_mysql();
				
		$ar = explode("\n", $sql);
		#dump($ar, ' ar');
		foreach ($ar as $key => $line) {
			switch (true) {
				case (strpos($line, 'SELECT')!==false):
					$ar[$key] = "SELECT COUNT(*) AS total FROM (\n". $ar[$key];
					break;
				case (strpos($line, 'GROUP BY')!==false):
					# alias case (like  floor(YEAR(fecha_inicio)/10)*10 as decade)
					if (strpos($line, ' AS ')!==false) {
						$ar_parts = explode(' AS ', $line);	#dump($line, ' line'.to_string());
						$ar[$key] = $ar_parts[0];
					}
					break;
				case (strpos($line, 'LIMIT')!==false):
				case (strpos($line, 'OFFSET')!==false):
				case (strpos($line, 'ORDER BY')!==false):
					$ar[$key] = '';
					break;
				case (strpos($line, 'UNION')!==false):
					$ar[$key-1] .= "\n) AS tables ";
					break;
			}
		}
		$count_query = trim(implode("\n", $ar));  //."\n) AS tables";
		$count_query .= "\n) AS tables";
		
		#dump($count_query, ' count_query');
		$count_result= $conn->query($count_query);
		if (!$count_result) {
			if(SHOW_DEBUG) {
				dump($count_query, "<H2>DEBUG Error Processing Request</H2> " .$conn->error );
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
	*/
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

	

	/**
	* GET_ALL_TABLES
	* @return array $ar_tables
	*/
	public static function get_all_tables() {
		
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
	* @return 
	*/
	public static function get_table_fields( $table, $full=false ) {
		
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
	public static function get_tables_info_remote() {

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
	public static function get_posterframe_from_video( $video_url ) {
		return str_replace(array('/'.DEDALO_AV_QUALITY_DEFAULT.'/','.mp4'), array('/posterframe/','.jpg'), $video_url);
	}//end get_posterframe_from_video



	/**
	* POSTPROCESS_FIELD
	* Aply process to field data
	* Example: Remove tags from video transcription raw text
	* @return mixed $data
	*/
	public static function postprocess_field($field_name, $data) {
		
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
	* Resuelve TODOS los términos utilizados en la transcripción de la cinta dada
	* @param int $av_section_id
	* @return 
	*/
	public static function get_reel_terms( $av_section_id ) {
		global $ar_restricted_terms;

		$response = new stdClass();
			$response->result 	= false;
			#$response->msg 		= 'Error. Request failed (get_reel_terms)';
		
		// Format: "section_top_id":"30","section_tipo":"rsc167","section_id":"39"
		$TRANSCRIPTION_TIPO 		= TRANSCRIPTION_TIPO;
		$AUDIOVISUAL_SECTION_TIPO 	= AUDIOVISUAL_SECTION_TIPO;
		$options = new stdClass();
			$options->table 		= (string)TABLE_THESAURUS;
			$options->ar_fields 	= array(FIELD_TERM_ID,FIELD_TERM);
			$options->order 		= FIELD_TERM ." ASC";
			#$options->sql_filter 	= (string)"`index` LIKE '%\"section_id\":\"$av_section_id\",\"component_tipo\":\"$TRANSCRIPTION_TIPO\"%'" . PUBLICACION_FILTER_SQL;
			$options->sql_filter 	= (string)"`index` LIKE '%\"section_id\":\"$av_section_id\",\"section_tipo\":\"$AUDIOVISUAL_SECTION_TIPO\",\"component_tipo\":\"$TRANSCRIPTION_TIPO\"%'" . PUBLICACION_FILTER_SQL;


		$rows_data	= (object)web_data::get_rows_data( $options );
			#dump($rows_data, ' rows_data ++ '.to_string($tag_id));

		$ar_termns = array();	
		foreach ($rows_data->result as $key => $value) {
			
			$terminoID  = $value['terminoID'];

			# Skip optional restricted terms (defined in config)
			if (in_array($terminoID, $ar_restricted_terms)) {
				continue;
			}

			$termino = $value[FIELD_TERM];
			$ar_termns[$terminoID] = $termino;
		}
		#dump($ar_termns, ' $ar_termns ++ '.to_string());

		$response->result = $ar_termns;
		#$response->msg 	  = 'Request done successfully';


		return (object)$response;
	}#end get_reel_terms



	/**
	* GET_FRAGMENT_FROM_INDEX_LOCATOR
	* Calculate all fragaments indexed with this locator 
	* @param object | string $index_locator
	*	$index_locator can be a php object or a json string representation of the object
	* @return object $response
	*/
	public static function get_fragment_from_index_locator( $index_locator ) {
	
		$response = new stdClass();
			$response->result 	= false;
			#$response->msg 		= 'Error. Request failed (get_fragment_from_index_locator)';
		
		#$index_locator = '{"type":"dd96","tag_id":"1","section_id":"1","section_tipo":"rsc167","component_tipo":"rsc36","section_top_id":"1","section_top_tipo":"oh1","from_component_tipo":"hierarchy40"}';
		# Locator like:
		# {"type":"dd96","tag_id":"1","section_id":"1","section_tipo":"rsc167","component_tipo":"rsc36","section_top_id":"1","section_top_tipo":"oh1","from_component_tipo":"hierarchy40"}
		
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
		$options = new stdClass();
			$options->table 	 		= TABLE_AUDIOVISUAL;
			$options->ar_fields 		= array(FIELD_VIDEO, FIELD_TRANSCRIPTION);
			$options->lang  	 		= WEB_CURRENT_LANG_CODE;
			$options->sql_filter 		= '`section_id` = '.$av_section_id;
			$options->apply_postprocess = false; // Avoid clean text on false
			
		$rows_data	= (object)web_data::get_rows_data( $options );
			#dump($rows_data, ' rows_data ++ '.to_string($locator));

		if (empty($rows_data->result)) {
			return null;
		}

		$raw_text  = reset($rows_data->result)[FIELD_TRANSCRIPTION];
		$video_url = reset($rows_data->result)[FIELD_VIDEO];	
	
		#
		# FRAGMENT DATA 
		# Create fragment and tesaurus associated	
		$options = new stdClass();			
			$options->tag_id 		 = $tag_id;
			$options->raw_text 		 = $raw_text;
			$options->av_section_id  = $av_section_id;
			$options->component_tipo = AV_TIPO;
			$options->section_tipo 	 = $locator->section_tipo;
			
			$fragments_obj = web_data::build_fragment( $options );				
				#dump($fragments_obj, ' fragments_obj ++ '.to_string( $av_section_id )); #die();


		$response->result = $fragments_obj;
		#$response->msg    = 'Request done successfully';

		return (object)$response;
	}//end get_fragment_from_index_locator



	/**
	* BUILD_FRAGMENT
	* Get fragment text from tag. Used in search_thematic
	* @param object options
	* @return object $result
	*/
	public static function build_fragment( $request_options ) {

		$options = new stdClass();
			$options->tag_id   		 = null;
			$options->raw_text 		 = null;
			$options->av_section_id  = null;
			$options->component_tipo = null;
			$options->section_tipo 	 = null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$result = new stdClass();

		$base_url 	= WEB_VIDEO_BASE_URL;
		$file_name  = $options->component_tipo.'_'.$options->section_tipo.'_'.$options->av_section_id.'.mp4';// Like : rsc35_rsc167_1

		$tag_in  	= TR::get_mark_pattern('indexIn', $standalone=false, $options->tag_id, $data=false);
		$tag_out  	= TR::get_mark_pattern('indexOut', $standalone=false, $options->tag_id, $data=false);		

		# Build in/out regex pattern to search
		$regexp = $tag_in ."(.*)". $tag_out;		

		# Search fragment_text
			# Dato raw from matrix db				
			$dato = $options->raw_text;

			mb_internal_encoding('UTF-8');

			# PREG_MATCH_ALL
			if( preg_match_all("/$regexp/", $dato, $matches, PREG_SET_ORDER|PREG_OFFSET_CAPTURE) ) {
				#dump($matches,'$matches');

				$fragment_inside_key = 3;
				$tag_in_pos_key 	 = 1;
				$tag_out_pos_key 	 = 4;

				foreach($matches as $match) {
					
					if (isset($match[$fragment_inside_key][0])) {

						$fragment_text = $match[$fragment_inside_key][0];

						# Clean fragment_text
						$fragment_text = TR::deleteMarks($fragment_text);
						#$fragment_text = self::decode_dato_html($fragment_text);

						# tag in position
						$tag_in_pos = $match[$tag_in_pos_key][1];

						# tag out position
						#$tag_out_pos = $tag_in_pos + strlen($match[0][0]);
						$tag_out_pos = $match[$tag_out_pos_key][1];

						# TC . Localizamos los TC apropiados
						$tcin  = OptimizeTC::optimize_tcIN($options->raw_text, false, $tag_in_pos, $in_margin=0);
						$tcout = OptimizeTC::optimize_tcOUT($options->raw_text, false, $tag_out_pos, $in_margin=0);

						$tcin_secs 		= OptimizeTC::TC2seg($tcin);
						$tcout_secs 	= OptimizeTC::TC2seg($tcout);

						// VIDEO_URL Like: /dedalo/media/av/404/rsc35_rsc167_1.mp4?vbegin=0&vend=42
						$video_url = $base_url.'/'.$file_name.'?vbegin='.$tcin_secs.'&vend='.$tcout_secs;

						# FRAGMENT_TERMS . Sacamos todas las indexaciones y tesauros asociados que incluyen a esta indexacion				
						#$fragment_terms = self::get_fragment_terms( $av_section_id, $fragment_before, $fragment_after );
						
						$result->fragment 		= $fragment_text;
						$result->video_url		= $video_url;
						#$result->terms 		= array();	// For unify object response only			        	
						#$result->tcin 			= $tcin;
						#$result->tcout 		= $tcout;
						$result->tcin_secs 		= $tcin_secs;
						$result->tcout_secs 	= $tcout_secs;

						return (object)$result;
					}
				}//end foreach($matches as $match) {
			}

		return null;
	}//end build_fragment




}//end class web_data
?>