<?php
// Loads parent class diffusion_sql
include_once(DEDALO_CORE_PATH . '/diffusion/class.diffusion_sql.php');
/**
* CLASS DIFFUSION_MYSQL
* It is in charge of managing the communication and the transfer of data from Dédalo
* to diffusion databases based on conventional MYSQL models
*/
class diffusion_mysql extends diffusion_sql  {



	static $insert_id;



	/**
	* CONSTRUCT
	* @param object|null $options = null
	*/
	function __construct( ?object $options=null ) {

		parent::__construct($options);
	}//end __construct



	/**
	* GET_CONN
	* Builds a database connection
	* @return db resource
	*/
	public static function get_conn($database_name) {
		return DBi::_getConnection_mysql(
			MYSQL_DEDALO_HOSTNAME_CONN,
			MYSQL_DEDALO_USERNAME_CONN,
			MYSQL_DEDALO_PASSWORD_CONN,
			$database_name,
			MYSQL_DEDALO_DB_PORT_CONN,
			MYSQL_DEDALO_SOCKET_CONN
		);
	}//end get_conn



	/**
	* EXEC_MYSQL_QUERY
	* Returns false on failure. For successful queries which produce a result set, such as
	* SELECT, SHOW, DESCRIBE or EXPLAIN, mysqli_query() will return a mysqli_result object.
	* For other successful queries, mysqli_query() will return true.
	* @return object|resource|bool
	*/
	public static function exec_mysql_query( string $sql, ?string $table_name=null, $database_name=false, bool $multi_query=false ) : mixed {

		// empty database_name case
			if (empty($database_name)) {
				debug_log(__METHOD__
					." Error. database name is mandatory "
					, logger::ERROR
				);
				return false;
			}

		try {

			$mysql_conn = self::get_conn($database_name);

			// result
			$result = ($multi_query===true)
				? $mysql_conn->multi_query( $sql )
				: $mysql_conn->query( $sql );
			if ($result===false || !empty($mysql_conn->error)) {
				debug_log(
					__METHOD__.' INFO: Data skipped in SQL table : '. $table_name . PHP_EOL
					.' error: '. $mysql_conn->error,
					logger::ERROR
				);
			}
			// $mysql_conn->close();

			if( strpos($sql, 'INSERT')!==false ) {
				self::$insert_id = $mysql_conn->insert_id;
			}

		} catch (Exception $e) {

			error_log( 'Caught exception: ' . $e->getMessage() );

			debug_log(__METHOD__
				. " database_name " . PHP_EOL
				. ' database_name: ' .$database_name .PHP_EOL
				. ' msg: ' . $e->getMessage() .PHP_EOL
				. ' connection error: '. ((isset($mysql_conn) && isset($mysql_conn->error)) ? $mysql_conn->error : 'Unknown') .PHP_EOL
				. ' sql: '.$sql
				, logger::ERROR
			);

			$result = false;
		}


		return $result;
	}//end exec_mysql_query



	/**
	* CREATE_TABLE
	* Build MySQL query string for create table request and exec query
	* Called by trigger (trigger.diffusion_xx_web.php) to exec sql code
	* @param array $table_data
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
    * @return bool
	*/
	public static function create_table(array $table_data, bool $drop=true) : bool {

		// short vars
			$database_name	= $table_data['database_name'];	# nombre base de datos
			$table_name		= $table_data['table_name'];	# nombre tabla
			$ar_fields		= $table_data['ar_fields'];		# campos de la tabla
			$engine			= isset($table_data['engine']) ? $table_data['engine'] : 'MyISAM';
			$table_type		= $table_data['table_type'];	# table type: default | tm

		// database_name is mandatory
			if (empty($database_name)) {
				debug_log(__METHOD__
					. " Error on create_table: database name is mandatory ". PHP_EOL
					. 'table_data: ' . to_string($table_data)
					, logger::ERROR
				);
				return false;
			}


		// DROP (default is true)
			if($drop===true) {
				$sql_query = "DROP TABLE IF EXISTS `$database_name`.`$table_name`;";
				// exec single query to database
				$result = self::exec_mysql_query(
					$sql_query,
					$table_name,
					$database_name
				);
			}

		// create
			$sql_query = "CREATE TABLE `$database_name`.`$table_name` (";

			// generate fields
			$sql_query .= self::generate_fields($ar_fields);
			$sql_query .= ",\n";

			// generate keys
			$sql_query .= self::generate_keys($ar_fields, $table_type);
			switch ($engine) {
				case 'InnoDB':
					$sql_query .= "\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Self-generated table in Dédalo for diffusion' AUTO_INCREMENT=1 ;\n";
					break;
				case 'MyISAM':
				default:
					$sql_query .= "\n) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci PACK_KEYS=0 COMMENT='Self-generated table in Dédalo for diffusion' AUTO_INCREMENT=1 ;\n";
					break;
			}

			// exec single query to database
			$result = self::exec_mysql_query( $sql_query, $table_name, $database_name );
			if ($result===false) {
				debug_log(__METHOD__
					." Error on created new table $database_name.$table_name " .PHP_EOL
					.to_string($sql_query)
					, logger::ERROR
				);
			}else{
				debug_log(__METHOD__." Created new table $database_name.$table_name ".to_string($sql_query), logger::DEBUG);
			}


		return true;
	}//end create_table



	/**
	* ADD_COLUMN
	* Sample:
	* 	ALTER TABLE `audiovisual` ADD `pepe` text COLLATE 'utf8_unicode_ci' NULL;
	* @return bool true
	*/
	public static function add_column(string $field_name, string $tipo, string $table_name, string $database_name) : bool {

		$typology = $field_name==='section_id' ||  $field_name==='lang'
			? $field_name
			: 'default';

		$field_ar_data = diffusion_sql::create_field((object)[
			'typology'	=> $typology,
			'tipo'		=> $tipo
		]);

		$field_name		= $field_ar_data['field_name'];
		$field_type		= $field_ar_data['field_type'];
		$field_options	= $field_ar_data['field_options'];
		$field_coment	= $field_ar_data['field_coment'];

		// build_field_insert_sql($field_name, $field_type, $field_options=null , $field_coment='', $pref='field_')
		$column_sql = self::build_field_insert_sql(
			$field_name, // string field_name
			$field_type, // string field_type
			$field_options,
			$field_coment // string field_coment
		);
		// sample result: "`subtitles` text COLLATE utf8_unicode_ci COMMENT 'Id - rsc175'"

		// index_sql
			$pref = 'field_';
			switch (true) {
				case ($field_type===$pref.'text'):
				case ($field_type===$pref.'mediumtext'):
				case ($field_type===$pref.'longtext'):
					$index_sql = "ADD FULLTEXT(`$field_name`)";
					break;
				default:
					$index_sql = "ADD INDEX `$field_name` (`$field_name`)";
					break;
			}

		// SQL add column
		$sql_query = 'ALTER TABLE '.$database_name.'.`'.$table_name.'` ADD '.$column_sql .', '.$index_sql .';';

		// exec single query to database
		$result = self::exec_mysql_query(
			$sql_query,
			$table_name,
			$database_name
		);
		if ($result===false) {
			debug_log(__METHOD__
				. " Err on created new column $database_name.$table_name $field_name "
				.'sql_query:' . to_string($sql_query)
				, logger::ERROR
			);
		}else{
			debug_log(__METHOD__
				. " Created new column $database_name.$table_name $field_name "
				. 'sql_query:' . to_string($sql_query)
				, logger::WARNING
			);
		}


		return true;
	}//end add_column



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
	* @return bool true
	*/
	public static function insert_data(array $ar_table, string $database_name) : bool {

		// Empty fields check
			if (empty($ar_table['ar_fields'])) {
				if(SHOW_DEBUG===true) {
					// throw new Exception("Error Processing Request. Table ".$ar_table['table_name']." don't have fields !", 1);
					debug_log(__METHOD__." Error Processing Request. Table ".$ar_table['table_name']." don't have fields ! ".to_string(), logger::ERROR);
					dump($ar_table, ' ar_table  don\'t have fields database_name:'.$database_name);
				}
				return false;
			}

		// short vars
			$table_name		= (string)$ar_table['table_name'];
			$ar_fields		= (array)$ar_table['ar_fields'];
			$n_ar_fields	= count($ar_fields);

		// split in chunks and iterate rows. (split big array in chunks to avoid memory problems)
			$max_insert_chunk 	= 500;
			$ar_chunk 			= array_chunk($ar_fields, $max_insert_chunk, true);
			$n_ar_chunk 		= count($ar_chunk);
			foreach ($ar_chunk as $chunk_key => $current_ar_fields) {

				// row fields values
					$ar_values_line = [];
					foreach ($current_ar_fields as $ar_group_rows) { # Registros agrupados por section_id / idioma
						// langs iterate
						foreach ($ar_group_rows as $lang => $ar_row) {

							# Open values group
							$current_line = '(';

								# FIELD ID : Auto increment null
								$current_line .= "NULL,";

								# FIELDS : Normal fields
								foreach ($ar_row as $field) {

									$field_name		= $field['field_name'];
									$field_value	= $field['field_value'];
									$field_value	= diffusion_mysql::conform_field_value($field_value, $database_name);

									$current_line .= $field_value.',';
								}//end foreach ($ar_row as $field)
								$current_line = substr($current_line, 0,-1); // Remove last ','

							# Close values group
							$current_line .= ')';

							$ar_values_line[] = $current_line;
						}//end foreach ($ar_group_rows as $lang => $ar_row)
					}//end foreach ($ar_table as $key => $ar_values)

				// insert sql:
					$sql_query_line = "\nINSERT INTO `$database_name`.`$table_name` VALUES " . implode("\n", $ar_values_line);

				// exec single query to database
					$result = self::exec_mysql_query(
						$sql_query_line,
						$table_name,
						$database_name
					);

				debug_log(__METHOD__." Exec chunk query $chunk_key of $n_ar_chunk (max. $max_insert_chunk of total $n_ar_fields) to $table_name ".to_string($result), logger::DEBUG);
			}//end foreach ($ar_chunk as $key => $current_ar_fields) {

		# Revisar que la tabla de destino es ut-8 para evitar esto
		#$sql_query = utf8_decode($sql_query);
		#dump( stripslashes($sql_query), ' sql_query');

		return true;
	}//end insert_data



	/**
	* EXEC_MYSQL_MULTI_QUERY
	* @param string $sql_query
	* @return resource $result
	*/
		// public static function exec_mysql_multi_query__DEPECATED($sql_query) {

		// 	$db = DBi::_getConnection_mysql();

		// 	# Escapa el query para evitar problemas con apótrofes etc..
		// 	#$result_a  = $db->real_escape_string($sql_query);
		// 		#dump($result,'result');

		// 	# Multiquery : Como usamos más de una línea de sentencias sql, usaremos 'multi_query' en lugar de 'query'
		// 	$result = $db->multi_query( $sql_query );


		// 	if (SHOW_DEBUG) {
		// 		#error_log("INFO: Ejecutado código sql : $sql_query");
		// 	}

		// 	# NEXT RESULT : desbloquea la conexión para la siguiente petición (multi_query)
		// 	$db->next_result();

		// 	return $result;
		// }//end multi



	/**
	* GENERATE_KEYS
	*
	* @see diffusion_mysql::create_table
	* @param array $ar_fields
	* @return string $sql_query
	*/
	private static function generate_keys(array $ar_fields, string $table_type='default') : string {

		$sql_query 	= '';
		$pref 		= 'field_';

		# KEY (sended to end of current method)
		#$sql_query .= "PRIMARY KEY (`id`),";
		#$sql_query .= "\nUNIQUE KEY `section_id_lang_constrain` (`section_id`,`lang`),";

		#
		# KEYS
		$i=1;foreach ($ar_fields as $ar_data) {

			$field_name			= $ar_data['field_name'];
			$field_type			= $ar_data['field_type'];
			// $field_options	= $ar_data['field_options'];


			if ($field_name==='tld') $is_thesaurus = true;

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
	private static function generate_fields(array $ar_fields) : string {

		$ar_sentences = [];
		foreach ($ar_fields as $key => $field_ar_data) {

			$field_name		= $field_ar_data['field_name'];
			$field_type		= $field_ar_data['field_type'];
			$field_coment	= $field_ar_data['field_coment'];
			$field_options	= $field_ar_data['field_options'];

			// create each field sentence
			$field_insert_sql	= diffusion_mysql::build_field_insert_sql($field_name, $field_type, $field_options, $field_coment);
			$ar_sentences[]		= $field_insert_sql;
		}//end foreach ($ar_fields as $key => $ar_data)

		$sql_query = "\n`id` int(12) NOT NULL AUTO_INCREMENT, \n" . implode(",\n", $ar_sentences);


		return $sql_query;
	}//end generate_fields



	/**
	* BUILD_FIELD_INSERT_SQL
	* Creates a SQL sentence of field (column) based on type
	* @return string $sql_query
	*/
	public static function build_field_insert_sql(string $field_name, string $field_type, $field_options=null, string $field_coment='', string $pref='field_') : string {

		$sql_query = '';

		switch (true) {
			case ($field_type===$pref.'int'):
				$sql_query = "`$field_name` int($field_options) COMMENT '$field_coment'";
				if(empty($field_options)) throw new Exception("Error Processing Request. Field int $field_name $field_type don't have options. int field_options is mandatory'  ", 1);
				break;

			case ($field_type===$pref.'int_unsigned'):
				$sql_query = "`$field_name` int($field_options) unsigned COMMENT '$field_coment'";
				if(empty($field_options)) throw new Exception("Error Processing Request. Field int $field_name $field_type don't have options. int field_options is mandatory'  ", 1);
				break;

			case ($field_type===$pref.'text'):
				$sql_query = "`$field_name` text COLLATE utf8mb4_unicode_ci COMMENT '$field_coment'";
				break;

			case ($field_type===$pref.'mediumtext'):
				$sql_query = "`$field_name` mediumtext COLLATE utf8mb4_unicode_ci COMMENT '$field_coment'";
				break;

			case ($field_type===$pref.'enum'):
				$sql_query = "`$field_name` enum($field_options) COLLATE utf8mb4_unicode_ci COMMENT '$field_coment'";
				if(empty($field_options)) throw new Exception("Error Processing Request. Field enum $field_name don't have 'properties'  ", 1);
				break;

			case ($field_type===$pref.'varchar'):
				$sql_query = "`$field_name` varchar($field_options) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '$field_coment'";
				if(empty($field_options)) throw new Exception("Error Processing Request. Field varchar $field_name don't have 'properties'  ", 1);
				break;

			case ($field_type===$pref.'date'):
				$sql_query = "`$field_name` date DEFAULT NULL COMMENT '$field_coment'";
				break;

			case ($field_type===$pref.'datetime'):
				$sql_query = "`$field_name` datetime DEFAULT NULL COMMENT '$field_coment'";
				break;

			case ($field_type===$pref.'decimal'):
				$sql_query = "`$field_name` decimal(10,0) DEFAULT NULL COMMENT '$field_coment'";
				break;

			case ($field_type===$pref.'boolean'):
				# bool and boolean are alias of tinyint. 0 value is false and 1 is true
				$sql_query = "`$field_name` tinyint(4) DEFAULT NULL COMMENT '$field_coment'";
				break;

			case ($field_type===$pref.'year'):
				$sql_query = "`$field_name` year(4) DEFAULT NULL COMMENT '$field_coment'";
				break;

			case ($field_type==='box elements'):
				// Ignore box
				break;
			default:
				throw new Exception("Error Processing Request. Field type not defined: '$field_type' (field_name:'$field_name', field_coment:'$field_coment', field_options:'$field_options')", 1);
				break;
		}


		return $sql_query;
	}//end build_field_insert_sql



	/**
	* SAVE_RECORD
	* Insert / Update one MySQL row (one for lang)
	* @param object $request_options
	* @return object $response
	*/
	public static function save_record( object $request_options ) : object {
		if(SHOW_DEBUG===true) {
			$start_time=start_time();
		}

		// response default
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= array();

		// options
			$options = new stdClass();
				$options->record_data				= null;
				$options->typology					= null;
				$options->delete_previous			= true;
				$options->section_tipo				= null;
				$options->diffusion_element_tipo	= null;
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// short vars
			$database_name			= $options->record_data['database_name'];
			$table_name				= $options->record_data['table_name'];
			$ar_section_id			= $options->record_data['ar_fields'];
			$diffusion_section		= $options->record_data['diffusion_section'];
			$engine					= isset($options->record_data['engine']) ? $options->record_data['engine'] : null;
			$typology				= $options->typology;
			$delete_previous 		= $options->delete_previous;
			$section_tipo			= $options->section_tipo;
			$diffusion_element_tipo	= $options->diffusion_element_tipo;

		// conn
			$conn = DBi::_getConnection_mysql();

		// check mandatory vars
			if (empty($database_name) || empty($table_name)) {
				throw new Exception("Error Processing Request. Database / table_name name not found (database_name:$database_name / table_name:$table_name)", 1);
			}

		// create table if not exits
			static $ar_verified_tables;
			if ( !in_array($table_name, (array)$ar_verified_tables) ) {

				if(!self::table_exits($database_name, $table_name)) {

					// table do not exists case. Create a new one

					# Call to diffusion to obtain fields for generate the table
					#if ($typology==='thesaurus') {
					#	$ts_options = new stdClass();
					#		$ts_options->table_name = $table_name;
					#	$create_table_ar_fields = self::build_thesaurus_columns( $ts_options );
					#}else{

						$diffusion_element_tables_map = diffusion_sql::get_diffusion_element_tables_map( $diffusion_element_tipo );

						$table_map			= $diffusion_element_tables_map->{$section_tipo} ?? null;
						#$table_name		= $table_map->name;
						#$table_tipo		= $table_map->table;
						#$table_properties	= $table_map->properties;
						#$database_name		= $table_map->database_name;
						#$database_tipo		= $table_map->database_tipo;
						$table_from_alias	= $table_map->from_alias ?? null;

						$table_columns_options = new stdClass();
							$table_columns_options->table_tipo			= $diffusion_section;
							$table_columns_options->table_name			= $table_name;
							$table_columns_options->database_name		= $database_name;
							$table_columns_options->table_from_alias	= $table_from_alias;

						$create_table_ar_fields = self::build_table_columns( $table_columns_options ); // $diffusion_section, $database_name
					#}

					// table create
						self::create_table(
							[
								'database_name'	=> $database_name,
								'table_name'	=> $table_name,
								'engine'		=> $engine,
								'ar_fields'		=> $create_table_ar_fields['ar_fields'],
								'table_type'	=> 'default'
							],
							true
						);

					// table dedalo_diffusion_tm create
						if(defined('DEDALO_DIFFUSION_TM') && DEDALO_DIFFUSION_TM){
							// create the BBDD clone version for store all publications versions (time marks with UNIX time stamp)
							self::create_table(
								[
									'database_name'	=> $database_name,
									'table_name'	=> 'tm_'.$table_name,
									'engine'		=> $engine,
									'ar_fields'		=> $create_table_ar_fields['ar_fields'],
									'table_type'	=> 'tm'
								],
								false
							);
						}
				}else{

					// table already exists case. Check columns

					// table fields. Array with available table fields right now
						$real_table_fields = self::get_real_table_fields($database_name, $table_name);

					// records to save. extract columns to save values
						$first_record		= reset($ar_section_id);
						$first_lang_values	= reset($first_record);
						$ar_fields_data		= array_map(function($el){
							return (object)[
								'field_name'	=> $el['field_name'],
								'tipo'			=> ($el['tipo'] ?? null) // automatic olumns 'section_id', 'section_tipo,', 'lang'
							];
						}, $first_lang_values);

					// check if all target columns exists. If not, create it
						foreach ($ar_fields_data as $element) {
							if (!in_array($element->field_name, $real_table_fields)) {
								if (empty($element->tipo)) {
									debug_log(__METHOD__." Ignored automatic column creation ".to_string($element->field_name), logger::WARNING);
									continue;
								}
								// do not exists this column. Create it
								// add_column($field_name, $field_type, $table_name, $database_name)
								self::add_column($element->field_name, $element->tipo, $table_name, $database_name);
							}
						}
				}
				$ar_verified_tables[] = $table_name; // Store state to avoid verify every time for every record
			}//end if ( !in_array($table_name, (array)$ar_verified_tables) ) {

		// real_table_fields again. Array with available table fields (prevent to write non existing fields on save)
			$real_table_fields = self::get_real_table_fields($database_name, $table_name);

		// iterate rows
			foreach ((array)$ar_section_id as $section_id => $ar_fields) {
				# Iterate one or more records
				#$ar_fields = $options->record_data['ar_fields'][$section_id];

				// delete_previous. if it don't work with versions, delete current record in all langs if exists
					if ($delete_previous===true) {
						$delete_result = self::delete_sql_record($section_id, $database_name, $table_name, $section_tipo);
						$response->msg[] = $delete_result->msg;
					}

				// Create records . Iterate langs
				foreach ($ar_fields as $lang => $fields) {

					$ar_field_name	= array();
					$ar_field_value	= array();

					foreach ($fields as $key => $field) {

						$field_name		= $field['field_name'];
						$field_value	= $field['field_value'];

						if (!in_array($field_name, $real_table_fields)) {
							debug_log(__METHOD__
								." Skipped create field '$field_name' because not exists in table '$table_name' [section_id: $section_id]"
								, logger::WARNING
							);
							continue; # Skip
						}

						$field_value = diffusion_mysql::conform_field_value($field_value, $database_name);

						#$ar_field_name[]	= '`'.$field_name.'`';
						$ar_field_name[]	= strpos($field_name, '`')===0 ? $field_name : '`'.$field_name.'`'; // 2018-03-16 !!
						$ar_field_value[]	= $field_value;
					}

					// dedalo_diffusion_tm. Insert MySQL record. if the difusion_versions is active we store all changes
						if(defined('DEDALO_DIFFUSION_TM') && DEDALO_DIFFUSION_TM){

							$strQuery_tm = "INSERT INTO `$database_name`.`tm_{$table_name}` (".implode(',', $ar_field_name).") VALUES (".implode(',', $ar_field_value).");";

							$result = self::exec_mysql_query(
								$strQuery_tm,
								'tm_'.$table_name,
								$database_name
							);
							if ($result===false) {
								#throw new Exception("Error Processing Request. MySQL insert error".$conn->error, 1);
								$response->result = false;
								$response->msg    = "Error Processing Request. Nothing is saved. MySQL insert error ".$conn->error;
								debug_log(__METHOD__
									." $response->msg "
									, logger::ERROR
								);
								return (object)$response;
							}
						}

					// sql query
						$strQuery = "INSERT INTO `$database_name`.`$table_name` (".implode(',', $ar_field_name).") VALUES (".implode(',', $ar_field_value).");";

					// exec query
						$result = self::exec_mysql_query(
							$strQuery,
							$table_name,
							$database_name
						);
						if ($result===false) {
							#throw new Exception("Error Processing Request. MySQL insert error".$conn->error, 1);
							debug_log(__METHOD__." Error on insert MySQL data ". $conn->error, logger::ERROR);

							$response->result = false;
							$response->msg    = "Error Processing Request. Nothing is saved. MySQL insert error".$conn->error;
							return (object)$response;
						}

						$response->msg[] = "Inserted record section_id:$section_id, table:$table_name, lang:$lang";
				}//end foreach ($ar_fields as $lang => $fields) iterate langs
			}//end foreach ($ar_section_id as $section_id)


		// response OK
			$response->result	= true;
			$response->new_id	= self::$insert_id;
			$response->msg		= implode(",\n", $response->msg);		#dump($response, ' response');

		// response debug
			if(SHOW_DEBUG===true) {
				$response->debug = exec_time_unit($start_time, 'ms');
			}


		return (object)$response;
	}//end save_record



	/**
	* GET_REAL_TABLE_FIELDS
	* Return an array of available columns in current table
	* @return array $real_table_fields
	*/
	public static function get_real_table_fields($database_name, $table_name) {

		// static $real_table_fields_data;
		// if ($cache===true && isset($real_table_fields_data[$table_name])) {
		// 	return $real_table_fields_data[$table_name];
		// }

		$real_table_fields = [];

		$strQuery	= "DESCRIBE {$database_name}.$table_name ;";
		$result		= self::exec_mysql_query( $strQuery, $table_name, $database_name );
		if ($result===false) {
			return $real_table_fields;
		}

		while ($row = $result->fetch_assoc()) {
			$real_table_fields[] = $row["Field"];
		}
		$result->free();

		# Cache
		// $real_table_fields_data[$table_name] = $real_table_fields;


		return $real_table_fields;
	}//end get_real_table_fields



	/**
	* CONFORM_FIELD_VALUE
	* @return mixed
	*/
	public static function conform_field_value($field_value, $database_name) {


		switch (true) {
			case ($field_value==='[]'):
				$field_value = 'NULL';
				break;
			case (is_array($field_value) || is_object($field_value)):
				if (empty($field_value)) {
					$field_value = 'NULL';
				}else{
					# TYPE ARRAY/OBJECT : Convert to json
					$field_value = json_encode($field_value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
					// real escape
					$mysql_conn		= self::get_conn($database_name);
					$field_value	= '\''.$mysql_conn->real_escape_string($field_value).'\'';
				}
				#$sql_query_line .= "'$field_value',";
				break;
			case is_null($field_value):
				# TYPE NULL
				$field_value = 'NULL';
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
				// $field_value = "'".addslashes($field_value)."'";
				// real escape
				$mysql_conn		= self::get_conn($database_name);
				$field_value	= '\''.$mysql_conn->real_escape_string($field_value).'\'';
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
			$sql_options->table				= null;
			$sql_options->ar_fields			= array('*');
			$sql_options->lang				= $lang;
			$sql_options->sql_filter		= "publicacion = 'si'";
			$sql_options->order				= '`id` ASC';
			$sql_options->limit				= null;
			$sql_options->resolve_portal	= false;
			$sql_options->conn				= DBi::_getConnection_mysql();

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

		if ($result===false) {
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
	* Check if target table already exists
	* @param string $database_name
	* @param string $table_name
	* @return bool
	*/
	public static function table_exits(string $database_name, string $table_name) : bool {

		$table_exits = false;

		$strQuery = "
		SELECT COUNT(*) AS total
		FROM information_schema.tables
		WHERE
		(table_schema = '$database_name' OR table_catalog = '$database_name')
		AND table_name = '$table_name'
		";
		$result = self::exec_mysql_query( $strQuery, $table_name, $database_name );
		if ($result===false) {
			debug_log(__METHOD__." Error on get table_exits from information_schema.tables: ".to_string($strQuery), logger::ERROR);
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
	* DATABASE_EXITS
	* Check if target database already exists
	* @param string $database_name
	* @return bool $database_exits bool
	*/
	public static function database_exits(string $database_name) : bool {

		$database_exits = false;

		// connect
			$mysql_conn = self::get_conn($database_name);
			if ($mysql_conn===false) {
				return $database_exits;
			}

		// query
			$strQuery = "
			SELECT SCHEMA_NAME
			FROM INFORMATION_SCHEMA.SCHEMATA
			WHERE SCHEMA_NAME = \"$database_name\"
			";
			// result
			$result = $mysql_conn->query( $strQuery );
			if ($result===false || !empty($mysql_conn->error)) {
				debug_log(
					__METHOD__.' ERROR. unable to exec query '. PHP_EOL
					. $strQuery .PHP_EOL
					.' error: '. $mysql_conn->error,
					logger::ERROR
				);
				return $database_exits;
			}

		// count result
			$row_cnt = $result->num_rows;
			if (!empty($row_cnt) && $row_cnt>0) {
				$database_exits = true;
			}

		// $mysql_conn->close();

		return (bool)$database_exits;
	}//end database_exits



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
	* Removes a database record based on params
	* @param string|int $section_id
	* @param string $database_name
	* @param string $table_name
	* @param string $section_tipo
	* @param object|null $custom = null
	* @return object $response
	*/
	public static function delete_sql_record( $section_id, $database_name, $table_name, $section_tipo=null, ?object $custom=null ) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';

		if (is_object($custom)) {
			// Custom delete way
			// custom is a object used by search_global tables to create the proper filter for deleting
			$field_name  = (array)$custom->field_name; 	// arrayze to allow multiple
			$field_value = (array)$custom->field_value; // arrayze to allow multiple

			$ar_query = [];
			foreach ($field_name as $key => $current_field_name) {

				$current_field_value = $field_value[$key];

				$ar_query[] = "`{$current_field_name}` = '{$current_field_value}'";
			}

			$filter_query = implode(" AND ", $ar_query);

			// custom query
			$strQuery="DELETE FROM `$database_name`.`$table_name` WHERE {$filter_query} ";

		}else{
			// Generic delete way
			$strQuery="DELETE FROM `$database_name`.`$table_name` WHERE `section_id` = '$section_id' OR `section_id` = '{$section_tipo}_{$section_id}' ";
		}

		$result  = self::exec_mysql_query( $strQuery, $table_name, $database_name );
			if ($result===false) {
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
				if(SHOW_DEBUG===true) {
					dump($strQuery, 'ERROR ON $strQuery '. DBi::_getConnection_mysql()->error);
				}
				$response->result = false;
				$response->msg    = "Error Processing Request. Nothing is added. MySQL error".DBi::_getConnection_mysql()->error;
				return (object)$response;
			}

		$response->result = true;
		$response->msg 	  = "Added publication_schema data successful";

		return (object)$response;
	}//end add_publication_schema



	/**
	* CREATE_PUBLICATION_SCHEMA_TABLE
	* Build MySQL table 'map' with standard options
	* @return object $response
	*/
	private static function create_publication_schema_table( $database_name, $table_name ) {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= '';

		// Drop previous existent table
			$strQuery = "DROP TABLE IF EXISTS `$table_name`;";
			$result  = self::exec_mysql_query( $strQuery, $table_name, $database_name);
			if ($result===false) {
				if(SHOW_DEBUG===true) {
					dump($strQuery, 'ERROR ON $strQuery '.to_string(DBi::_getConnection_mysql()->error));
				}
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



	/**
	* BACKUP_DATABASE
	* @param string $db_name
	* @return object response
	*/
	public static function backup_database(string $db_name) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';

		// target_file
			$folder_path = DEDALO_BACKUP_PATH . '/mysql';
			if( !is_dir($folder_path) ) {
				if(!mkdir($folder_path, 0750, true)) {

					$response->msg		= 'Error on create MySQL backups directory. Permission denied';
					$response->errors	= true;
					debug_log(__METHOD__
						."  ".$response->msg . PHP_EOL
						.' folder_path: ' .$folder_path . PHP_EOL
						.' create_dir_permissions: ' . to_string(0750)
						, logger::ERROR
					);
					return $response;
				}
				debug_log(__METHOD__
					." CREATED DIR: $folder_path  "
					, logger::WARNING
				);
			}
			$file_name		= date("Y-m-d_His") .'_'. $db_name .'_'. logged_user_id() .'.sql';
			$target_file	= $folder_path .'/'. $file_name;

		// command
			$user		= MYSQL_DEDALO_USERNAME_CONN;
			$pass		= MYSQL_DEDALO_PASSWORD_CONN;
			$host		= MYSQL_DEDALO_HOSTNAME_CONN;
			$bin_path	= defined('MYSQL_DB_BIN_PATH') ? MYSQL_DB_BIN_PATH : '';
			$command	= $bin_path . "mysqldump --user={$user} --password='{$pass}' --host={$host} {$db_name} --result-file={$target_file} 2>&1";

		// execution
			exec($command, $res);

		// response
			$response->result		= true;
			$response->msg			= 'Backup done ' . $db_name;
			$response->exec_result	= $res;
			$response->file_exists	= file_exists($target_file);
			$response->file_size	= $response->file_exists
				? format_size_units( filesize($target_file) )
				: 0;

		// debug
			debug_log(__METHOD__
				. " Exec command:  " . PHP_EOL
				. ' ' . $command . PHP_EOL
				. " result: " . to_string($res) . PHP_EOL
				. ' response: ' . to_string($response)
				, logger::WARNING
			);


		return $response;
	}//end backup_database



}//end class diffusion_mysql
