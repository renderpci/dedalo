<?php
/*
* CLASS DIFFUSION_MYSQL
* Se encarga de gestionar la comunicación y el trasvase de datos desde Dédalo 4 hacia bases de datos de diffusión
* basados en modelos sql convencionales (tipo dedalo3)
*/


abstract class diffusion_mysql  {


	/**
	* EXEC_SQL_QUERY
	* @param string $sql_query
	* @return resource $result
	*/
	public static function exec_sql_query($sql_query) {

		$db = DBi::_getConnection_mysql();

		# Escapa el query para evitar problemas con apótrofes etc..
		#$result_a  = $db->real_escape_string($sql_query);
			#dump($result,'result');
		
		# Multiquery : Como usamos más de una línea de sentencias sql, usaremos 'multi_query' en lugar de 'query'
		$result = $db->multi_query( $sql_query );
			

		if (SHOW_DEBUG) {
			#error_log("INFO: Ejecutado código sql : $sql_query");
		}		

		# NEXT RESULT : desbloquea la conexión para la siguiente petición (multi_query)
		$db->next_result();
	
		if(SHOW_DEBUG) {
			dump($db,'$db');
		}		

		return $result;
	}




	/**
	* GENERATE_QUERY_CREATE_TABLE
	* Build MySQL query string for create table request
	* Called by trigger (trigger.diffusion_xx_web.php) to exec sql code
	* @param array $table_data 
	* @return string $sql_query . Prepared sql query to exec
	* @see trigger.diffusion_ [ENTITY] _web.php
	* Format example: 
	* (
	* [database_name] => web_herrimemoria
    * [table_name] => informante_imagen
    * [ar_fields] => Array (
    *        [0] => Array (
    *                [field_name] => section_id
    *                [field_type] => field_int
    *                [field_coment] => 
    *                [field_options] => 12
    *            )   ..
    * )
	*/	
	public static function generate_query_create_table(array $table_data) {
		#dump($table_data, ' table_data');
		
		$database_name 	= $table_data['database_name'];	# nombre base de datos	
		$table_name 	= $table_data['table_name'];	# nombre tabla
		$ar_fields 		= $table_data['ar_fields'];		# campos de la tabla
			#dump($database_name,'$database_name');die();	

		$sql_query  = (string)'';
		$sql_query .= "DROP TABLE IF EXISTS `$database_name`.`$table_name` ; ";
		$sql_query .= "\nCREATE TABLE `$database_name`.`$table_name` (";
		$sql_query .= self::generate_fields($ar_fields);
		$sql_query .= self::generate_keys($ar_fields);
		$sql_query .= "\n) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci PACK_KEYS=0 COMMENT='Tabla autogenerada en Dédalo4 para difusión' AUTO_INCREMENT=1;\n";	
		if(SHOW_DEBUG) {
			#dump($sql_query,'$sql_query');
		}	
		return $sql_query;

	}#end generate_query_create_table




	/**
	* GENERATE_QUERY_INSERT_DATA
	* @param array $ar_table
	* @param string $database_name
	* Example ar_table:
	* (
	*	[dd1227] => Array (
	*           [table_name] => proyecto
	*           [ar_fields] => Array (
	*                    [245895] => Array (
	*                            [lg-spa] => Array (
	*                                    [0] => Array  (
	*                                            [field_name] => section_id
	*                                            [field_value] => 245895
	*                                        )
	*										..
	* )
	*/
	public static function generate_query_insert_data($ar_table, $database_name) {
		if(SHOW_DEBUG) {
			#dump($ar_table,'$db_data');#die();
		}		
		
		$sql_query=(string)'';
		
		# Empty verify
		if (empty($ar_table['ar_fields'])) {
			if(SHOW_DEBUG) {
				dump($ar_table, ' ar_table  don\'t have fields database_name:'.$database_name);
				throw new Exception("Error Processing Request. Table ".$ar_table['table_name']." don't have fields !", 1);				
			}
			return null;
		}

			
		$table_name	= (string)$ar_table['table_name'];
		$ar_fields	= (array)$ar_table['ar_fields'];


		# SQL_QUERY_LINE : Reset var for every iteration 
		$sql_query_line='';

		# INSERT : 
		$sql_query_line .= "\n INSERT INTO `$database_name`.`$table_name` VALUES ";
		
		# ROW FIELDS VALUES 
		foreach ($ar_fields as $ar_group_rows) { # Registros agrupados por id matrix / idioma
			#dump($ar_group_rows,'$ar_group_rows');
			foreach ($ar_group_rows as $lang => $ar_row) {

				# Open values group
				$sql_query_line .= "\n(";
				
					# FIELD ID : Autoincrement null
					$sql_query_line .= "NULL,";
					
					# FIELDS : Normal fields 
					foreach ($ar_row as $field) {
						
						$field_name 	= $field['field_name'];
						$field_value 	= $field['field_value'];

						if(is_array($field_value)) {
							# TYPE ARRAY : Convert to json
							$field_value = json_encode($field_value);	
						}else{
							# TYPE OTHERS : addslashes
							$field_value = addslashes($field_value);
						}	

						$sql_query_line .= "'$field_value',";

					}#end foreach ($ar_row as $field)
					
					# Remove last ','
					$sql_query_line = substr($sql_query_line, 0,-1);
				
				# Close values group
				$sql_query_line .= "),";

			}#end foreach ($ar_group_rows as $lang => $ar_row)
			

		}#end foreach ($ar_table as $key => $ar_values)

		# Remove last ','
		$sql_query_line = substr($sql_query_line, 0,-1);

		# Add line query and close line
		$sql_query .= "$sql_query_line;";

		# Revisar que la tabla de destino es ut-8 para evitar esto
		#$sql_query = utf8_decode($sql_query);
		#dump( stripslashes($sql_query), ' sql_query');

		return $sql_query;

	}#end generate_query_insert_data


	






	
	/**
	* GENERATE_KEYS
	* @param array $ar_fields
	* @return string $sql_query
	* @see diffusion_mysql::generate_query_create_table
	*/
	public static function generate_keys($ar_fields) {

		$sql_query 	= '';
		$pref 		= 'field_';
	
		# KEY
		$sql_query .= "PRIMARY KEY (`id`),";
		$sql_query .= "UNIQUE KEY `section_id_lang_constrain` (`section_id`,`lang`),";
		
		$i=1;
		foreach ($ar_fields as $key => $ar_data) {

			$field_name 	= $ar_data['field_name'];
			$field_type 	= $ar_data['field_type'];
			$field_options 	= $ar_data['field_options'];			

			switch (true) {

				case ($field_type==$pref.'text'):
				case ($field_type==$pref.'mediumtext'):
				case ($field_type==$pref.'longtext'):
					$sql_query .= "\nFULLTEXT KEY `$field_name` (`$field_name`),";
					break;

				default:
					$sql_query .= "\nKEY `$field_name` (`$field_name`),";			
					break;
			}
			$i++;
			if ($i>50) break; // max 50 keys allow					
		}
		$sql_query = substr($sql_query, 0,-1); #Eliminamos la coma final		

		return $sql_query;

	}#end generate_keys



	/**
	* GENERATE_FIELDS
	* @param array $ar_fields
	* @return string $sql_query
	* @see diffusion_mysql::generate_query_create_table
	*/
	public static function generate_fields($ar_fields) {
		
		$sql_query 	= '';
		$pref 		= 'field_';

		# KEY
		$sql_query .= "\n`id` int(12) NOT NULL AUTO_INCREMENT,";

		foreach ($ar_fields as $key => $ar_data) {

			$field_name 	= $ar_data['field_name'];
			$field_type 	= $ar_data['field_type'];
			$field_coment 	= $ar_data['field_coment'];
			$field_options 	= $ar_data['field_options'];

			switch (true) {
				case ($field_type==$pref.'int'):
					$sql_query .= "\n`$field_name` int($field_options) unsigned COMMENT '$field_coment',\n";
					if(empty($field_options)) throw new Exception("Error Processing Request. Field int $field_name $field_type don't have options. int field_options is mandatory'  ", 1);
					break;

				case ($field_type==$pref.'text'):
					$sql_query .= "`$field_name` text COLLATE utf8_unicode_ci COMMENT '$field_coment',\n";
					break;

				case ($field_type==$pref.'mediumtext'):
					$sql_query .= "`$field_name` mediumtext COLLATE utf8_unicode_ci COMMENT '$field_coment',\n";
					break;

				case ($field_type==$pref.'enum'):
					$sql_query .= "`$field_name` enum($field_options) COLLATE utf8_unicode_ci COMMENT '$field_coment',\n";
					if(empty($field_options)) throw new Exception("Error Processing Request. Field enum $field_name don't have 'propiedades'  ", 1);
					break;

				case ($field_type==$pref.'varchar'):
					$sql_query .= "`$field_name` varchar($field_options) COLLATE utf8_unicode_ci DEFAULT NULL COMMENT '$field_coment',\n";
					if(empty($field_options)) throw new Exception("Error Processing Request. Field enum $field_name don't have 'propiedades'  ", 1);
					break;

				case ($field_type==$pref.'date'):
					$sql_query .= "`$field_name` date DEFAULT NULL COMMENT '$field_coment',\n";
					break;

				case ($field_type==$pref.'year'):
					$sql_query .= "`$field_name` year(4) DEFAULT NULL COMMENT '$field_coment',\n";
					break;

				default:
					throw new Exception("Error Processing Request. Field type not defined: '$field_type' ($field_name, $field_coment, $field_options)", 1);					
					break;
			}

		}#end foreach ($ar_fields as $key => $ar_data)
		#dump($sql_query, ' sql_query');

		return $sql_query;

	}#end generate_fields




	
	/**
	* GET_ROWS_DATA
	* Función genérica de consulta a las tablas de difusión generadas por Dédalo tras la publicación web
	* Devuelve array con los rows de los campos solicitados
	* @param object $options . Object with options like table, ar_fields, lang, etc..
	* @return array $ar_data . Rows result from search
	*/
	public static function get_rows_data( $options ) {
		global $lang;
		if (!isset($lang)) {
			$lang=DEDALO_DATA_LANG;
		}
		
		# Options defaults
		$sql_options = new stdClass();
			$sql_options->table 		= null;
			$sql_options->ar_fields 	= array('*');
			$sql_options->lang 			= $lang;
			$sql_options->sql_filter 	= "publicacion = 'si'";
			$sql_options->order 		= '`id` ASC';
			$sql_options->limit 		= null;
			$sql_options->resolve_portal= false;
			$sql_options->conn 			= DBi::_getConnection_mysql();

		# Options given ovewrite
		# $object_vars = get_object_vars($sql_options);	dump($object_vars, ' object_vars');
		foreach ((object)$options as $key => $value) {
			# Si la propiedad recibida en el array options existe en sql_options, la sobreescribimos
			# If get property exists in options array/object, overwrite default			
			if (property_exists($sql_options, $key)) {
				$sql_options->$key = $value;
				#dump($value, "key: $key changed from ", array());					
			}
			#dump($value, "key: $key NOT SET for ".get_class($sql_options)." - ".$sql_options->$key. " ($key => $value)");
		}
		#dump($sql_options, ' sql_options');
		$ar_data=array();

		$strQuery = "-- ".__METHOD__;
			$strQuery .= "\nSELECT ";
			# FIELDS
			$strQuery .= implode(',', (array)$sql_options->ar_fields)."\n";
			# TABLE
			$strQuery .= "FROM $sql_options->table \n";
			$strQuery .= "WHERE id IS NOT NULL";
			# LANG
			if(!empty($sql_options->lang)) {
				#$strQuery .= "\nAND lang = '$sql_options->lang'";	
			}					
			# SQL_FILTER
			if(!empty($sql_options->sql_filter)) {
				$strQuery .= "\nAND ($sql_options->sql_filter)";
			}
			# ORDER
			if(!empty($sql_options->order)) {
				$strQuery .= "\nORDER BY $sql_options->order";
			}			
			# LIMIT
			if(!empty($sql_options->limit)) {
				$strQuery .= "\nLIMIT ".intval($sql_options->limit);
			}
			$sql_options->strQuery = $strQuery;
			if(SHOW_DEBUG) {
				#dump($sql_options);
			}
	
		#$result = DBi::_getConnection_mysql()->query($strQuery);
		$result = $sql_options->conn->query($strQuery);

		if (!$result) {
			if(SHOW_DEBUG) {
				dump($strQuery, $sql_options->conn->error );
				throw new Exception("Error Processing Request", 1);				
			}
			# Si hay problemas en la búsqueda, no lanzaremos error ya que esta función se usa en partes públicas
			return $ar_data;
		}
		
		if (empty($sql_options->ar_fields) || $sql_options->ar_fields[0]=='*') {			
			$sql_options->ar_fields = array_keys($result->fetch_assoc());
			$result->data_seek(0); # Reset pointer of fetch_assoc
		}

		$i=0;
		while ( $rows = $result->fetch_assoc() ) {
	
			foreach($sql_options->ar_fields as $current_field) {

				# Default behaviour
				$ar_data[$i][$current_field] = $rows[$current_field];				

				# Portal resolve case
				if ($sql_options->resolve_portal===true && strpos($current_field, '_portal')!==false) {					
					
				 	$current_ar_value = json_decode($rows[$current_field]);
				 	if(is_array($current_ar_value)) foreach ($current_ar_value as $p_value) {
				 		$portal_options = new stdClass();
				 			$portal_options->table 		= $current_field;
							$portal_options->sql_filter = "id = $p_value AND publicacion = 'si'";
				 		$ar_portal = self::get_rows_data($portal_options);
				 	}				 	
				 	$ar_data[$i][$current_field] = $ar_portal;
				}				
			}
			$i++;
		}; 
		
		$result->free();
		#DBi::_getConnection_mysql()->close();

		return $ar_data;
	}





	/**
	* SAVE_RECORD
	* Insert / Update a MySQl row (one for lang)
	* @return 
	*/
	public static function save_record( $request_options ) {
		$response = new stdClass();

		$options = new stdClass();
			$options->record_data = null;
		foreach ($request_options as $key => $value) {
			if (property_exists($options, $key)) {
				$options->$key = $value;
			}
		}
		#dump($options, " options ".to_string());
		if(SHOW_DEBUG) $start_time=microtime(1);

		$database_name  = $options->record_data['database_name'];
		$table_name 	= $options->record_data['table_name'];
		$ar_section_id 	= (array)$options->record_data['ar_fields'];		
			#dump( array_keys($ar_section_id), " section_id ".to_string($table_name )); #die();

		foreach ($ar_section_id as $section_id => $ar_fields) {
			# Iterate one or more records
			#$ar_fields 	= $options->record_data['ar_fields'][$section_id];		

			# First, delete current record in all langs
				$strQuery="DELETE FROM `$database_name`.`$table_name` WHERE section_id = '$section_id' ";
				$result  = DBi::_getConnection_mysql()->query( $strQuery );					
					if (!$result) {
						if(SHOW_DEBUG) { dump($strQuery, 'ERROR ON $strQuery'); }
						$response->result = false;
						$response->msg    = "Error Processing Request. Nothing is deleted. MySQL error".DBi::_getConnection_mysql()->error;
						return (object)$response;						
					}
					$response->msg[] = "Deleted record section_id:$section_id, table:$table_name, all langs. Affected rows:".DBi::_getConnection_mysql()->affected_rows;					
					
					

			# Create records . Iterate langs
			foreach ($ar_fields as $lang => $fields) {
				$ar_field_name=array();
				$ar_field_value=array();
				foreach ($fields as $key => $field) {
					$field_name  = $field['field_name'];
					$field_value = $field['field_value'];

					if(is_array($field_value) || is_object($field_value)) {
						# TYPE ARRAY : Convert to json
						$field_value = json_encode($field_value);	
					}else{
						# TYPE OTHERS : addslashes
						$field_value = addslashes($field_value);
					}
					$ar_field_name[]  = $field_name;
					$ar_field_value[] = $field_value;
				}
			
				# Insert mysql record
				$strQuery = "INSERT INTO `$database_name`.`$table_name` VALUES (NUll,'".implode("','", $ar_field_value)."');";
				$result   = DBi::_getConnection_mysql()->query( $strQuery );
					if (!$result) {
						if(SHOW_DEBUG) {
							dump($strQuery, "ERROR ON MySQL insert: ".DBi::_getConnection_mysql()->error);
						}
						#throw new Exception("Error Processing Request. MySQL insert error".DBi::_getConnection_mysql()->error, 1);
						$response->result = false;
						$response->msg    = "Error Processing Request. Nothing is saved. MySQL insert error".DBi::_getConnection_mysql()->error;
						return (object)$response;		
					}
					#dump($strQuery, " strQuery ".to_string());
					$response->msg[] = "Inserted record section_id:$section_id, table:$table_name, lang:$lang";
			}//end foreach ($ar_fields as $lang => $fields) iterate langs

		}//end foreach ($ar_section_id as $section_id) 

		if(SHOW_DEBUG) {
			$response->debug = exec_time($start_time);
		}

		$response->result = true;
		$response->msg    = implode(",\n", $response->msg);		#dump($response, ' response');
		return (object)$response;

	}#end save_record














	
}
?>