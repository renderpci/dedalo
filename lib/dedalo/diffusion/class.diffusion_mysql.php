<?php
// Loads parent class diffusion_sql
include_once(DEDALO_LIB_BASE_PATH . '/diffusion/class.diffusion_sql.php');
/*
* CLASS DIFFUSION_MYSQL
* Se encarga de gestionar la comunicación y el trasvase de datos desde Dédalo 4 hacia bases de datos de diffusión
* basados en modelos sql convencionales (tipo dedalo3)
*/
class diffusion_mysql extends diffusion_sql  {


	static $insert_id;


	/**
	* CONSTRUCT
	* @param object $options . Default null
	*/
	function __construct($options=null) {

		parent::__construct($options=null);
	}//end __construct



	/**
	* EXEC_MYSQL_QUERY
	* @return
	*/
	public static function exec_mysql_query( $sql, $table_name=null, $database_name, $multi_query=false ) {

		#debug_log(__METHOD__." Connecting database: $database_name - table: $table_name ".to_string(), logger::DEBUG);

		$mysql_conn = DBi::_getConnection_mysql(MYSQL_DEDALO_HOSTNAME_CONN,
										 		MYSQL_DEDALO_USERNAME_CONN,
										 		MYSQL_DEDALO_PASSWORD_CONN,
										 		$database_name,
										 		MYSQL_DEDALO_DB_PORT_CONN,
										 		MYSQL_DEDALO_SOCKET_CONN);
		# Set as class static var
		#self::$mysql_conn;

		#error_log("++++++++++ sql 1 : ".$sql);

		if ($multi_query===true) {
			$result = $mysql_conn->multi_query( $sql );
		}else{
			$result = $mysql_conn->query( $sql );
		}

		if (!$result) {
			#debug_log(__METHOD__." Skipped (key:$key) db_data value for database: $database_name : ".to_string($mysql_conn->error), logger::WARNING);
			if(SHOW_DEBUG===true) {
				#dump( $mysql_conn->error, "error".to_string() );
				error_log("++++++++++ SQL ERROR QUERY : ".$sql);
				$query_clean = trim($sql);
				error_log("error_log sql: ".$sql);
				dump($mysql_conn->error, ' sql ERROR: query ++ '.PHP_EOL.to_string($sql).PHP_EOL);
				#throw new Exception("Error Processing Request. MySQL query_insert_data error ".to_string($mysql_conn->error), 1);
			}
			$msg = "INFO: Data skipped in SQL table : ". $table_name .' : '. to_string($mysql_conn->error);
			debug_log(__METHOD__." $msg ".to_string(), logger::DEBUG);
			#die();
		}
		#$mysql_conn->close();

		if( strpos($sql, 'INSERT')!==false ) {
			self::$insert_id = $mysql_conn->insert_id;
			#dump(self::$insert_id, ' insert_id ++ '.to_string($sql));
		}

		return $result;
	}//end exec_mysql_query



	/**
	* CREATE_TABLE
	* Build MySQL query string for create table request and exec query
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
	public static function create_table(array $table_data, $drop=true) {
		#dump($table_data, ' table_data'); die();

		$database_name 	= $table_data['database_name'];	# nombre base de datos
		$table_name 	= $table_data['table_name'];	# nombre tabla
		$ar_fields 		= $table_data['ar_fields'];		# campos de la tabla
		$engine 		= isset($table_data['engine']) ? $table_data['engine'] : 'MyISAM';
		$table_type		= $table_data['table_type'];	# table type: default | tm

		#
		# DROP (default is true)
			if($drop===true) {
				$sql_query  = (string)'';
				$sql_query .= "DROP TABLE IF EXISTS `$database_name`.`$table_name` ; ";
				#
				# EXEC SINGLE QUERY TO DATABASE
				$result = self::exec_mysql_query( $sql_query, $table_name, $database_name );
			}


		#
		# CREATE
			$sql_query  = (string)'';
			$sql_query .= "\nCREATE TABLE `$database_name`.`$table_name` (";
			$sql_query .= self::generate_fields($ar_fields);
			$sql_query .= self::generate_keys($ar_fields, $table_type);
			switch ($engine) {
				case 'InnoDB':
					$sql_query .= "\n) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci COMMENT='Self-generated table in Dédalo4 for diffusion' AUTO_INCREMENT=1 ;\n";
					break;
				case 'MyISAM':
				default:
					$sql_query .= "\n) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci PACK_KEYS=0 COMMENT='Self-generated table in Dédalo4 for diffusion' AUTO_INCREMENT=1 ;\n";
					break;
			}


			#
			# EXEC SINGLE QUERY TO DATABASE
			$result = self::exec_mysql_query( $sql_query, $table_name, $database_name );

			debug_log(__METHOD__." Created new table $database_name.$table_name ".to_string(), logger::DEBUG);

		return true;
	}//end create_table



	/**
	* INSERT_DATA
	* Compose sql query and exec to insert data
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
	public static function insert_data($ar_table, $database_name) {

		# Empty verify
		if (empty($ar_table['ar_fields'])) {
			if(SHOW_DEBUG===true) {
				dump($ar_table, ' ar_table  don\'t have fields database_name:'.$database_name);
				throw new Exception("Error Processing Request. Table ".$ar_table['table_name']." don't have fields !", 1);
			}
			return null;
		}

		$table_name	= (string)$ar_table['table_name'];
		$ar_fields	= (array)$ar_table['ar_fields'];
		$n_ar_fields= count($ar_fields);

		$max_insert_chunk 	= 500;
		$ar_chunk 			= array_chunk($ar_fields, $max_insert_chunk, true);
		$n_ar_chunk 		= count($ar_chunk);
		foreach ($ar_chunk as $chunk_key => $current_ar_fields) {
			# split big array in chunks to avoid memory problems

			# SQL_QUERY_LINE : Reset var for every iteration
			$sql_query_line='';

			# INSERT :
			$sql_query_line .= "\nINSERT INTO `$database_name`.`$table_name` VALUES ";

			# ROW FIELDS VALUES
			foreach ($current_ar_fields as $ar_group_rows) { # Registros agrupados por section_id / idioma
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

							$field_value 	= diffusion_mysql::conform_field_value($field_value);

							$sql_query_line .= $field_value.',';

						}//end foreach ($ar_row as $field)

						# Remove last ','
						$sql_query_line = substr($sql_query_line, 0,-1);

					# Close values group
					$sql_query_line .= "),";

				}//end foreach ($ar_group_rows as $lang => $ar_row)


			}//end foreach ($ar_table as $key => $ar_values)

			# Remove last ','
			$sql_query_line = substr($sql_query_line, 0,-1);

			#if(SHOW_DEBUG===true) {
			#	debug_log(__METHOD__." sql_query_line ".to_string($sql_query_line), logger::ERROR);;
			#}

			#
			# EXEC SINGLE QUERY TO DATABASE
			$result = self::exec_mysql_query( $sql_query_line, $table_name, $database_name );

			debug_log(__METHOD__." Exec chunk query $chunk_key of $n_ar_chunk (max. $max_insert_chunk of total $n_ar_fields) to $table_name ".to_string($result), logger::DEBUG);

		}//end foreach ($ar_chunk as $key => $current_ar_fields) {

		# Revisar que la tabla de destino es ut-8 para evitar esto
		#$sql_query = utf8_decode($sql_query);
		#dump( stripslashes($sql_query), ' sql_query');

		return true;
	}//end insert_data



	/**
	* exec_mysql_multi_query
	* @param string $sql_query
	* @return resource $result
	*//*
	public static function exec_mysql_multi_query__DEPECATED($sql_query) {

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

		return $result;
	}//end multi
	*/



	/**
	* GENERATE_KEYS
	* @param array $ar_fields
	* @return string $sql_query
	* @see diffusion_mysql::create_table
	*/
	private static function generate_keys($ar_fields, $table_type = 'default') {

		$sql_query 	= '';
		$pref 		= 'field_';

		# KEY (sended to end of current method)
		#$sql_query .= "PRIMARY KEY (`id`),";
		#$sql_query .= "\nUNIQUE KEY `section_id_lang_constrain` (`section_id`,`lang`),";

		#
		# KEYS
		$i=1;foreach ($ar_fields as $key => $ar_data) {

			$field_name 	= $ar_data['field_name'];
			$field_type 	= $ar_data['field_type'];
			$field_options 	= $ar_data['field_options'];


			if ($field_name==='tld' ) $is_thesaurus = true;

			switch (true) {

				case ($field_type===$pref.'text'):
				case ($field_type===$pref.'mediumtext'):
				case ($field_type===$pref.'longtext'):
					$sql_query .= "\nFULLTEXT KEY `$field_name` (`$field_name`),";
					break;

				default:
					$sql_query .= "\nKEY `$field_name` (`$field_name`),";
					break;
			}
			$i++;
			if ($i>50) break; // max 50 keys allow
		}
		$sql_query = substr($sql_query, 0,-1); # Eliminamos la coma final

		$adtional_keys = $table_type==='tm' ? ',`dd_tm`' : '';

		#
		# CONSTRAIN
		if (isset($is_thesaurus)) {
			$sql_query = "\nUNIQUE KEY `section_id_lang_tld_constrain` (`section_id`,`lang`,`tld`".$adtional_keys.")," . $sql_query; // Prepend constrain
		}else{
			$sql_query = "\nUNIQUE KEY `section_id_lang_constrain` (`section_id`,`lang`".$adtional_keys.")," . $sql_query; // Prepend constrain
		}

		#
		# PRIMARY KEY
		$sql_query = "PRIMARY KEY (`id`),".$sql_query; // Prepend primary key

		return $sql_query;
	}//end generate_keys



	/**
	* GENERATE_FIELDS
	* @param array $ar_fields
	* @return string $sql_query
	* @see diffusion_mysql::create_table
	*/
	private static function generate_fields($ar_fields) {
		#dump($ar_fields, ' ar_fields ++ '.to_string()); #die();
		$sql_query 	= '';
		$pref 		= 'field_';

		# KEY
		$sql_query .= "\n`id` int(12) NOT NULL AUTO_INCREMENT,";

		foreach ($ar_fields as $key => $ar_data) {

			#dump($ar_data, ' ar_data ++ '.to_string('??'));

			$field_name 	= $ar_data['field_name'];
			$field_type 	= $ar_data['field_type'];
			$field_coment 	= $ar_data['field_coment'];
			$field_options 	= $ar_data['field_options'];

			switch (true) {
				case ($field_type===$pref.'int'):
					$sql_query .= " `$field_name` int($field_options) unsigned COMMENT '$field_coment',\n";
					if(empty($field_options)) throw new Exception("Error Processing Request. Field int $field_name $field_type don't have options. int field_options is mandatory'  ", 1);
					break;

				case ($field_type===$pref.'text'):
					$sql_query .= " `$field_name` text COLLATE utf8_unicode_ci COMMENT '$field_coment',\n";
					break;

				case ($field_type===$pref.'mediumtext'):
					$sql_query .= " `$field_name` mediumtext COLLATE utf8_unicode_ci COMMENT '$field_coment',\n";
					break;

				case ($field_type===$pref.'enum'):
					$sql_query .= " `$field_name` enum($field_options) COLLATE utf8_unicode_ci COMMENT '$field_coment',\n";
					if(empty($field_options)) throw new Exception("Error Processing Request. Field enum $field_name don't have 'propiedades'  ", 1);
					break;

				case ($field_type===$pref.'varchar'):
					$sql_query .= " `$field_name` varchar($field_options) COLLATE utf8_unicode_ci DEFAULT NULL COMMENT '$field_coment',\n";
					if(empty($field_options)) throw new Exception("Error Processing Request. Field varchar $field_name don't have 'propiedades'  ", 1);
					break;

				case ($field_type===$pref.'date'):
					$sql_query .= " `$field_name` date DEFAULT NULL COMMENT '$field_coment',\n";
					break;

				case ($field_type===$pref.'datetime'):
					$sql_query .= " `$field_name` datetime DEFAULT NULL COMMENT '$field_coment',\n";
					break;

				case ($field_type===$pref.'decimal'):
					$sql_query .= " `$field_name` decimal(10,0) DEFAULT NULL COMMENT '$field_coment',\n";
					break;

				case ($field_type===$pref.'boolean'):
					# bool and boolean are alias of tinyint. 0 value is false and 1 is true
					$sql_query .= " `$field_name` tinyint(4) DEFAULT NULL COMMENT '$field_coment',\n";
					break;

				case ($field_type===$pref.'year'):
					$sql_query .= " `$field_name` year(4) DEFAULT NULL COMMENT '$field_coment',\n";
					break;

				case ($field_type==='box elements'):
					// Ignore box
					break;
				default:
					throw new Exception("Error Processing Request. Field type not defined: '$field_type' ($field_name, $field_coment, $field_options)", 1);
					break;
			}

		}//end foreach ($ar_fields as $key => $ar_data)
		#dump($sql_query, ' sql_query');

		return $sql_query;
	}//end generate_fields



	/**
	* SAVE_RECORD
	* Insert / Update one MySQL row (one for lang)
	* @return
	*/
	public static function save_record( $request_options ) {

		$response = new stdClass();
			$response->result = false;
			$response->msg 	  = array();

		$options = new stdClass();
			$options->record_data 			 = null;
			$options->typology 	  			 = null;
			$options->delete_previous 		 = true;
			$options->section_tipo 			 = null;
			$options->diffusion_element_tipo = null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}


		if(SHOW_DEBUG===true) $start_time=microtime(1);

		$database_name  	= $options->record_data['database_name'];
		$table_name 		= $options->record_data['table_name'];
		$ar_section_id 		= $options->record_data['ar_fields'];
		$diffusion_section 	= $options->record_data['diffusion_section'];
		$engine 			= isset($options->record_data['engine']) ? $options->record_data['engine'] : null;
		$typology 			= $options->typology;
			#dump( array_keys($ar_section_id), " section_id ".to_string($table_name )); #die();
			#dump($options->record_data, ' record_data ++ '.to_string($database_name)); die();
			#dump($database_name, ' $database_name ++ '.to_string()); die();

		if (empty($database_name) || empty($table_name)) {
			throw new Exception("Error Processing Request. Database / table_name name not found (database_name:$database_name / table_name:$table_name)", 1);
		}

		#
		# CREATE TABLE IF NOT EXITS
		static $ar_verified_tables;
		if ( !in_array($table_name, (array)$ar_verified_tables) ) {
			if(!self::table_exits($database_name, $table_name)) {

				# Call to diffusion to optain fields for generate the table
				#if ($typology==='thesaurus') {
				#	$ts_options = new stdClass();
				#		$ts_options->table_name = $table_name;
				#	$create_table_ar_fields = self::build_thesaurus_columns( $ts_options );
				#}else{

					$section_tipo = $options->section_tipo;

					$diffusion_element_tables_map = diffusion_sql::get_diffusion_element_tables_map( $options->diffusion_element_tipo );
						#dump($diffusion_element_tables_map, ' diffusion_element_tables_map ++ '.to_string());

					$table_map			= $diffusion_element_tables_map->{$section_tipo};
					#$table_name   		= $table_map->name;
					#$table_tipo 		= $table_map->table;
					#$table_propiedades = $table_map->propiedades;
					#$database_name  	= $table_map->database_name;
					#$database_tipo  	= $table_map->database_tipo;
					$table_from_alias 	= $table_map->from_alias;

					$table_columns_options = new stdClass();
						$table_columns_options->table_tipo 	  	 = $diffusion_section;
						$table_columns_options->table_name 	  	 = $table_name;
						$table_columns_options->database_name 	 = $database_name;
						$table_columns_options->table_from_alias = $table_from_alias;

					$create_table_ar_fields = self::build_table_columns( $table_columns_options ); // $diffusion_section, $database_name
				#}

				#dump($create_table_ar_fields['ar_fields'], ' create_table_ar_fields ++ '.to_string());die();
				self::create_table( array('database_name' 	=> $database_name,
										  'table_name' 		=> $table_name,
										  'engine' 			=> $engine,
										  'ar_fields' 		=> $create_table_ar_fields['ar_fields'],
										  'table_type' 		=> 'default',
										  ), true);

				if(defined('DEDALO_DIFFUSION_TM') && DEDALO_DIFFUSION_TM){
					#create the BBDD clone version for store all publications versions (time marks with unix time stamp)
					self::create_table( array('database_name' 	=> $database_name,
											  'table_name' 		=> 'tm_'.$table_name,
											  'engine' 			=> $engine,
											  'ar_fields' 		=> $create_table_ar_fields['ar_fields'],
											  'table_type' 		=> 'tm',
											  ), false);
				}// end if DEDALO_DIFFUSION_TM
			}
			$ar_verified_tables[] = $table_name; // Store state to avoid verify every time for every record
		}//end if ( !in_array($table_name, (array)$ar_verified_tables) ) {

		# Array with available table fields (for avoid write non existing fields on save)
		$real_table_fields = self::get_real_table_fields($database_name, $table_name);

		foreach ((array)$ar_section_id as $section_id => $ar_fields) {
			# Iterate one or more records
			#$ar_fields 	= $options->record_data['ar_fields'][$section_id];
				#dump($ar_fields, ' ar_fields ++ section_id: '.to_string($section_id));	continue;
			
			# if it don't work with versions, delete current record in all langs if exists
			if ($options->delete_previous===true) {
					$delete_result = self::delete_sql_record($section_id, $database_name, $table_name, $options->section_tipo, false);
					$response->msg[] = $delete_result->msg;
			}
			

			# Create records . Iterate langs
			foreach ($ar_fields as $lang => $fields) {
				$ar_field_name=array();
				$ar_field_value=array();
				foreach ($fields as $key => $field) {
					$field_name  = $field['field_name'];
					$field_value = $field['field_value'];

					if (!in_array($field_name, $real_table_fields)) {
						debug_log(__METHOD__." Skipped field $field_name in because not exists in table $table_name [$section_id]", logger::WARNING);
						continue; # Skip
					}

					$field_value = diffusion_mysql::conform_field_value($field_value);

					#$ar_field_name[]  = '`'.$field_name.'`';
					$ar_field_name[]  = strpos($field_name, '`')===0 ? $field_name : '`'.$field_name.'`'; // 2018-03-16 !!
					$ar_field_value[] = $field_value;
				}

				# Insert mysql record				
				# if the difusion_versions is active we store all changes
				if(defined('DEDALO_DIFFUSION_TM') && DEDALO_DIFFUSION_TM){

					$strQuery_tm = "INSERT INTO `$database_name`.`tm_{$table_name}` (".implode(',', $ar_field_name).") VALUES (".implode(',', $ar_field_value).");";

					$result = self::exec_mysql_query( $strQuery_tm, 'tm_'.$table_name, $database_name );
					if (!$result) {
						#throw new Exception("Error Processing Request. MySQL insert error".DBi::_getConnection_mysql()->error, 1);
						$response->result = false;
						$response->msg    = "Error Processing Request. Nothing is saved. MySQL insert error".DBi::_getConnection_mysql()->error;
						return (object)$response;
					}
				}
				
				$strQuery = "INSERT INTO `$database_name`.`$table_name` (".implode(',', $ar_field_name).") VALUES (".implode(',', $ar_field_value).");";

				$result = self::exec_mysql_query( $strQuery, $table_name, $database_name );
					if (!$result) {
						#throw new Exception("Error Processing Request. MySQL insert error".DBi::_getConnection_mysql()->error, 1);
						$response->result = false;
						$response->msg    = "Error Processing Request. Nothing is saved. MySQL insert error".DBi::_getConnection_mysql()->error;
						return (object)$response;
					}
					#dump($strQuery, " strQuery ".to_string());
					$response->msg[] = "Inserted record section_id:$section_id, table:$table_name, lang:$lang";
			}//end foreach ($ar_fields as $lang => $fields) iterate langs

			#debug_log(__METHOD__." ++ strQuery ".to_string($strQuery), logger::DEBUG);

		}//end foreach ($ar_section_id as $section_id)
		#dump($result, ' result ++ '.to_string());


		if(SHOW_DEBUG===true) {
			$response->debug = exec_time($start_time);
		}

		$response->result = true;
		$response->new_id = self::$insert_id;
		$response->msg    = implode(",\n", $response->msg);		#dump($response, ' response');

		return (object)$response;
	}//end save_record



	/**
	* GET_REAL_TABLE_FIELDS
	* Return an array of available columns in current table
	* @return array $real_table_fields
	*/
	public static function get_real_table_fields($database_name, $table_name) {

		static $real_table_fields_data;
		if (isset($real_table_fields_data[$table_name])) {
			return $real_table_fields_data[$table_name];
		}

		$real_table_fields = [];

		$strQuery = "DESCRIBE $table_name ;";
		$result   = self::exec_mysql_query( $strQuery, $table_name, $database_name );
		if (!$result) {
			return $real_table_fields;
		}

		while ($row = $result->fetch_assoc()) {
			$real_table_fields[] = $row["Field"];
		}
		$result->free();

		# Cache
		$real_table_fields_data[$table_name] = $real_table_fields;


		return $real_table_fields;
	}//end get_real_table_fields




	/**
	* CONFORM_field_VALUE
	* @return
	*/
	public static function conform_field_value($field_value) {

		switch (true) {
			case ($field_value==='[]'):
				$field_value = "NULL";
				break;
			case (is_array($field_value) || is_object($field_value)):
				if (empty($field_value)) {
					$field_value = "NULL";
				}else{
					# TYPE ARRAY/OBJECT : Convert to json
					$field_value = "'".json_encode($field_value)."'";
				}
				#$sql_query_line .= "'$field_value',";
				break;
			case is_null($field_value):
				# TYPE NULL
				$field_value = "NULL";
				break;
			case is_bool($field_value):
				# TYPE BOOL
				$field_value = (int)$field_value;
				break;
			case is_int($field_value):
				# TYPE FLOAT
				$field_value = (int)$field_value;
				break;
			case is_float($field_value):
				# TYPE FLOAT
				$field_value = str_replace(",", ".", $field_value);
				break;
			default:
				# TYPE OTHERS : addslashes
				$field_value = "'".addslashes($field_value)."'";
				#$sql_query_line .= "'$field_value',";
				break;
		}


		return $field_value;
	}//end conform_field_value



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
			if(SHOW_DEBUG===true) {
				#dump($sql_options);
			}

		$result = $sql_options->conn->query($strQuery);

		if (!$result) {
			if(SHOW_DEBUG===true) {
				dump($strQuery, $sql_options->conn->error );
				throw new Exception("Error Processing Request", 1);
			}
			# Si hay problemas en la búsqueda, no lanzaremos error ya que esta función se usa en partes públicas
			return $ar_data;
		}

		if (empty($sql_options->ar_fields) || $sql_options->ar_fields[0]==='*') {
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
	}//end get_rows_data



	/**
	* TABLE_EXITS
	* @return bool
	*/
	public static function table_exits($database_name, $table_name) {

		$table_exits = false;

		$strQuery = "
		SELECT COUNT(*) AS total
		FROM information_schema.tables
		WHERE
		(table_schema = '$database_name' OR table_catalog = '$database_name')
		AND table_name = '$table_name'
		";
		#$result  = DBi::_getConnection_mysql()->query( $strQuery );
		$result   = self::exec_mysql_query( $strQuery, $table_name, $database_name );
		if (!$result) {
			return false;
		}

		while ($row = $result->fetch_assoc()) {
			$total = (int)$row["total"];
			if ($total>0) {
				$table_exits = true;
				break;
			}
		}
		$result->free();

		return (bool)$table_exits;
	}//end table_exits



	/**
	* IS_PUBLICABLE
	* Check is field 'publication' is present and if value is 'no' return false. Else return true
	* @return bool
	*//* DEPRECATED
	public static function is_publicable($section_id, $ar_fields) {

		$ar_fields = reset($ar_fields); // Only need first lang

		foreach ($ar_fields as $key => $ar_value) {
			#dump($ar_value, ' $ar_value ++ '.to_string());
			if (
				($ar_value['field_name']==='publication' || $ar_value['field_name']==='publicacion') &&
				($ar_value['field_value']==='no' || empty($ar_value['field_value']))
				) {
				return false;
			}
		}

		return true;
	}//end is_publicable
	*/



	/**
	* DELETE_SQL_RECORD
	* @return
	*/
	public static function delete_sql_record($section_id, $database_name, $table_name, $section_tipo=null, $custom=false) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';

		if ($custom!==false) {
			// Custom is a object
			$field_name  = (array)$custom->field_name; 	// arrayze to allow multiple
			$field_value = (array)$custom->field_value; // arrayze to allow multiple
			$ar_query = array();
			foreach ((array)$field_name as $key => $current_field_name) {
				$current_field_value = $field_value[$key];
				/*
				if (is_integer($current_field_value)) {
					$ar_query[] = "`{$current_field_name}` = {$current_field_value}";
				}else{
					$ar_query[] = "`{$current_field_name}` = '{$current_field_value}'";
				}*/
				$ar_query[] = "`{$current_field_name}` = '{$current_field_value}'";
			}
			$filter_query = implode(" AND ", $ar_query);
			#$strQuery="DELETE FROM `$database_name`.`$table_name` WHERE `{$field_name}` = '{$field_value}' ";
			$strQuery="DELETE FROM `$database_name`.`$table_name` WHERE {$filter_query} ";

		}else{
			// Generic delete way
			$strQuery="DELETE FROM `$database_name`.`$table_name` WHERE `section_id` = '$section_id' OR `section_id` = '{$section_tipo}_{$section_id}' ";
		}

		$result  = self::exec_mysql_query( $strQuery, $table_name, $database_name );
			if (!$result) {
				if(SHOW_DEBUG===true) {
					dump($strQuery, 'ERROR ON $strQuery '.to_string(DBi::_getConnection_mysql()->error));
				}
				$response->result = false;
				$response->msg    = "Error Processing Request. Nothing is deleted. MySQL error".DBi::_getConnection_mysql()->error;
				return (object)$response;
			}

		$affected_rows = isset(DBi::_getConnection_mysql()->affected_rows) ? DBi::_getConnection_mysql()->affected_rows : 0;

		if ($affected_rows>0) {
			$response->result = true;
			$response->msg 	  = "Deleted record section_id:$section_id, table:$table_name, all langs. Affected rows:".DBi::_getConnection_mysql()->affected_rows;
		}
		#debug_log(__METHOD__." response ".json_encode($response, JSON_PRETTY_PRINT), logger::DEBUG);


		return (object)$response;
	}//end delete_sql_record



	/**
	* ADD_PUBLICATION_SCHEMA
	* Add record to table publication_schema
	* @return object $response
	*/
	public static function add_publication_schema( $database_name, $data ) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed '.__METHOD__;

		$table_name = 'publication_schema';

		if (self::table_exits($database_name, $table_name)===false) {
			self::create_publication_schema_table( $database_name, $table_name  );
		}

		$data = addslashes($data);
			#dump($data, ' data ++ '.to_string());
		/*
		$strQuery = "DELETE FROM `$database_name`.`$table_name` WHERE `name` = '$name';";
		$result   = self::exec_mysql_query( $strQuery, $table_name, $database_name );

		$strQuery = "INSERT INTO `$database_name`.`$table_name` VALUES ('$name','$data');";
		$result  = self::exec_mysql_query( $strQuery, $table_name, $database_name );
			if ($result===false) {
				if(SHOW_DEBUG===true) { dump($strQuery, 'ERROR ON $strQuery '.to_string(DBi::_getConnection_mysql()->error)); }
				$response->result = false;
				$response->msg    = "Error Processing Request. Nothing is added. MySQL error".DBi::_getConnection_mysql()->error;
				return (object)$response;
			}
		*/

		$id = 1; // Fix id always is 1
		$strQuery = "REPLACE INTO `$database_name`.`$table_name` (`id`, `data`) VALUES ($id, '$data');"; // ON DUPLICATE KEY UPDATE data='$data'
		$result   = self::exec_mysql_query( $strQuery, $table_name, $database_name );
			if ($result===false) {
				if(SHOW_DEBUG===true) { dump($strQuery, 'ERROR ON $strQuery '.to_string(DBi::_getConnection_mysql()->error)); }
				$response->result = false;
				$response->msg    = "Error Processing Request. Nothing is added. MySQL error".DBi::_getConnection_mysql()->error;
				return (object)$response;
			}

		$response->result = true;
		$response->msg 	  = "Added publication_schema data successful";

		return (object)$response;
	}//end add_publication_schema



	/**
	* CREATE_publication_schema_TABLE
	* Build MySQL table 'map' with standar options
	* @return object $response
	*/
	private static function create_publication_schema_table( $database_name, $table_name ) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';

		// Drop previous existent table
			$strQuery = "DROP TABLE IF EXISTS `$table_name`;";
			$result  = self::exec_mysql_query( $strQuery, $table_name, $database_name);
			if ($result===false) {
				if(SHOW_DEBUG===true) { dump($strQuery, 'ERROR ON $strQuery '.to_string(DBi::_getConnection_mysql()->error)); }
				$response->result = false;
				$response->msg    = "Error Processing Request. Nothing is created 1. MySQL error".DBi::_getConnection_mysql()->error;
				return (object)$response;
			}

		$strQuery = "
		CREATE TABLE `$table_name` (
		  `id` int(11) NOT NULL, `data` mediumtext COLLATE utf8_unicode_ci NOT NULL,
		  PRIMARY KEY (`id`)
		) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;";
		$result  = self::exec_mysql_query( $strQuery, $table_name, $database_name);
			if ($result===false) {
				if(SHOW_DEBUG===true) { dump($strQuery, 'ERROR ON $strQuery '.to_string(DBi::_getConnection_mysql()->error)); }
				$response->result = false;
				$response->msg    = "Error Processing Request. Nothing is created 2. MySQL error".DBi::_getConnection_mysql()->error;
				return (object)$response;
			}

		$response->result = true;
		$response->msg 	  = "Created table '$table_name' successful";

		return (object)$response;
	}//end create_publication_schema_table



}//end class
?>
