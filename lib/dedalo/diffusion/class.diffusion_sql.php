<?php
/*
* CLASS DIFFUSION_SQL
* Se encarga de gestionar la comunicación y el trasvase de datos desde Dédalo 4 hacia bases de datos de diffusión
* basados en modelos sql convencionales (tipo dedalo3)
*/


abstract class diffusion_sql  {


	/**
	* EXEC_SQL_QUERY
	*/
	public static function exec_sql_query($sql_query) {
		#echo "<pre>$sql_query</pre><hr>";

		$db = DBi::_getConnection();

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
	
		dump($db,'$db');

		return $result;
	}




	/**
	* GENERATE_QUERY_INSERT_DATA
	*/
	/*
	[dd1227] => Array
        (
            [table_name] => proyecto
            [ar_fields] => Array
                (
                    [245895] => Array
                        (
                            [lg-spa] => Array
                                (
                                    [0] => Array
                                        (
                                            [field_name] => id_matrix
                                            [field_value] => 245895
                                        )

                                    [1] => Array
                                        (
                                            [field_name] => lang
                                            [field_value] => lg-spa
                                        )
	*/
	public static function generate_query_insert_data($ar_table, $database_name) {
		#dump($ar_table,'$db_data');die();
		
		$sql_query=(string)'';

		#foreach ($db_data as $ar_table) {
			#dump($ar_table,'$ar_table');
			
			if (empty($ar_table['ar_fields'])) return null;

			
			$table_name	= $ar_table['table_name'];
			$ar_fields	= $ar_table['ar_fields'];


			# SQL_QUERY_LINE : Reset var for every iteration 
			$sql_query_line='';

			# INSERT : 
			$sql_query_line .= "\nINSERT INTO `$database_name`.`$table_name` VALUES ";
			
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

			#break;

		#}#end foreach ($db_data as $ar_table) 
		#dump($sql_query,'$sql_query');

		# Revisar que la tabla de destino es ut-8 para evitar esto
		#$sql_query = utf8_decode($sql_query);

		return $sql_query;

	}#end generate_query_insert_data


	




	/**
	* GENERATE_QUERY_CREATE_TABLE
	*/
	/*
	--
	-- Table structure for table `jer_dd`
	--
	DROP TABLE IF EXISTS `jer_dd`;
	CREATE TABLE `jer_dd` (
	  `id` int(12) unsigned NOT NULL AUTO_INCREMENT COMMENT 'autoIncrement',
	  `terminoID` varchar(8) COLLATE utf8_unicode_ci NOT NULL COMMENT 'varchar de 8',
	  `parent` varchar(8) COLLATE utf8_unicode_ci NOT NULL,
	  `modelo` varchar(8) COLLATE utf8_unicode_ci DEFAULT NULL COMMENT 'referencia',
	  `esmodelo` enum('si','no') COLLATE utf8_unicode_ci NOT NULL DEFAULT 'no' COMMENT 'default no',
	  `esdescriptor` enum('si','no') COLLATE utf8_unicode_ci NOT NULL DEFAULT 'si',
	  `visible` enum('si','no') COLLATE utf8_unicode_ci NOT NULL DEFAULT 'si' COMMENT 'para ocultar en zonas públicas,etc.',
	  `norden` int(4) unsigned NOT NULL DEFAULT '1',
	  `usableIndex` enum('si','no') COLLATE utf8_unicode_ci DEFAULT 'si' COMMENT 'select si,no default si',
	  `traducible` enum('si','no') COLLATE utf8_unicode_ci NOT NULL DEFAULT 'si' COMMENT 'campo de control de la traducción del término',
	  `relaciones` text COLLATE utf8_unicode_ci COMMENT 'de estructura (JSON)',
	  `propiedades` longtext COLLATE utf8_unicode_ci COMMENT 'json array: nombre, valor, nuevo_valor',
	  PRIMARY KEY (`id`),
	  UNIQUE KEY `terminoID` (`terminoID`),
	  KEY `parent` (`parent`),
	  KEY `modelo` (`modelo`),
	  KEY `esmodelo` (`esmodelo`),
	  KEY `esdescriptor` (`esdescriptor`),
	  KEY `visible` (`visible`),
	  KEY `norden` (`norden`),
	  KEY `usableIndex` (`usableIndex`),
	  KEY `traducible` (`traducible`),
	  KEY `relaciones` (`relaciones`(255)),
	  KEY `propiedades` (`propiedades`(255)),
	  KEY `parent-esdescriptor` (`parent`,`esdescriptor`,`norden`)
	) ENGINE=InnoDB AUTO_INCREMENT=1224 DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci PACK_KEYS=0
	*/
	public static function generate_query_create_table(array $table_data) {

		$database_name 	= $table_data['database_name'];	# nombre dabse de datos	
		$table_name 	= $table_data['table_name'];	# nombre tabla
		$ar_fields 		= $table_data['ar_fields'];		# campos de la tabla
			#dump($database_name,'$database_name');die();	

		$sql_query=(string)"";
		$sql_query .= "DROP TABLE IF EXISTS `$database_name`.`$table_name` ; ";
		$sql_query .= "\nCREATE TABLE `$database_name`.`$table_name` (";
		$sql_query .= self::generate_fields($ar_fields);
		$sql_query .= self::generate_keys($ar_fields);
		$sql_query .= "\n) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci PACK_KEYS=0 COMMENT='Tabla autogenerada en Dédalo4 para difusión' AUTO_INCREMENT=1 ;\n";
			#dump($sql_query,'$sql_query');
	
		return $sql_query;

	}#end generate_query_create_table

	
	/**
	* GENERATE_KEYS
	*/
	public static function generate_keys($ar_fields) {

		$sql_query='';
		$pref = 'field_';
	
		# KEY
		$sql_query .= "PRIMARY KEY (`id`),";
		
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
						
		}
		$sql_query = substr($sql_query, 0,-1); #Eliminamos la coma final
		return $sql_query;

	}#end generate_field

	/**
	* GENERATE_FIELDS
	*/
	public static function generate_fields($ar_fields) {
		
		$sql_query='';
		$pref = 'field_';

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
					if(empty($field_options)) throw new Exception("Error Processing Request. Field enum $field_name don't have 'propiedades'  ", 1);
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
					throw new Exception("Error Processing Request. Field type not defined: '$field_type' ", 1);					
					break;
			}
		}

		return $sql_query;

	}#end generate_fields


	
	




	
}
?>