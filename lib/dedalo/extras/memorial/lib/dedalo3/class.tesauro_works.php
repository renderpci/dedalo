<?php
define('DEDALO3_ROOT_PATH'	, dirname(DEDALO_ROOT).'/site_dedalo_plataforma_30');
define('ID_SITE'			, 'memorial');

abstract class DB {	
	
	public static function _getConnection() {
		
		# MySQLi
		#$conn = DBi::_getConnection($host=HOSTNAME_CONN, $user=USERNAME_CONN, $password=PASSWORD_CONN, $database=DATABASE_CONN,  $port=DB_PORT_CONN, $socket=SOCKET_CONN);
			#dump($conn,'conn');
		#return $conn;

		#
		# OLD WORLD
		#
		static $hDB;	
		
		if(isset($hDB)) {
			return($hDB);
		}

		# Oculta el mensaje 'MySQL extension is deprecated & will be removed in the future of PHP' cuando se usa con PHP >=5
		if(strpos($_SERVER['HTTP_HOST'], '8888')) error_reporting(E_ALL ^ E_DEPRECATED);

		# D3 DB Datos de configuración de la base de datos de Dedalo3
		require_once( DEDALO3_ROOT_PATH.'/Connections/config_db.php');

		# Socket overwrite hostname conn
		$_SERVER_CONN = HOSTNAME_CONN ;
		if( SOCKET_CONN != NULL )	$_SERVER_CONN = SOCKET_CONN ;		
		
		# connections
		$hDB = mysql_connect($_SERVER_CONN, USERNAME_CONN, PASSWORD_CONN) or die(__METHOD__ ."Failure connecting to the database!".mysql_error());
			#dump($hDB,'$hDB');

		# select db
		mysql_select_db(DATABASE_CONN, $hDB);
		
		#$hDB = mysqli_connect('localhost', USERNAME_CONN, PASSWORD_CONN, DATABASE_CONN);
		
		# force encoding
		$encodeDB	= DB::get_encoding();
		$sql 		= " SET NAMES '$encodeDB' ";
		mysql_query($sql, self::_getConnection()) or die(__METHOD__ ."Failed encoding db response! <br>".mysql_error()); #mysql_free_result($RS);
		#mysqli_query($hDB, $sql);


		return($hDB);
	}
	
	public static function get_encoding() {
		
		static $encodeDB;
		
		if(isset($encodeDB)) {
			return($encodeDB);
		}
		$encodeDB = 'utf8'; # utf8 / latin1
		
		return  $encodeDB ;
	}

}#end class DB




class tesauro_works {



	
	/**
	* GET_ALFABETIC_TESAURO
	* Devuelve el array de todos los términos del tesauro ordenados alfabéticamente 
	*/
	public static function get_alphabetic_tesauro($options=null) {
	
		# DEFAULT FILTER OPTIONS
		$current_options = array(
							'ar_prefix_filter' 	=> array('dc','ts','on'),
							'lang_filter' 		=> "lg-cat",
							);
		# OPTIONS La opciones por defecto se sobreescriben con las recibidas
		if ($options) {
            $current_options = $options + $current_options;
        }
		
		# Filter
		$sql_filter='';
		if (isset($current_options['ar_prefix_filter'])) {
			$sql = '';
			foreach ($current_options['ar_prefix_filter'] as $prefix) {
				$sql .= "terminoID LIKE '$prefix%' OR ";
			}
			$sql = "AND (". substr($sql, 0,-4).") ";
			$sql_filter .= $sql;
		}
		if (isset($current_options['lang_filter'])) {
			$sql_filter .= "AND lang = '".$current_options['lang_filter']."'";
		}		

		# SQL Query 
		$sql = "
		SELECT terminoID, termino, def, lang
		FROM 
		descriptors AS d
		WHERE d.termino IS NOT NULL
		$sql_filter
		ORDER BY termino ASC
		";
		dump( str_replace("\t", ' ', $sql) );	
		$res 		= mysql_query($sql, DB::_getConnection()); #dump($res);
		if(!$res) 	throw new Exception("Error Processing Request", 1);		
		while ($rows = mysql_fetch_assoc($res)) {
			
			$ar_data[] 	= array(
				'termino'	=>$rows['termino'],
				'terminoID'	=>$rows['terminoID'],
				'def'		=>$rows['def'],
				'lang'		=>$rows['lang']
				);

		};mysql_free_result($res);
		#dump($ar_data);

		return $ar_data;
	}
	
	/**
	* LETRA_FROM_TERMINO
	* Calcula la letra alfabética correspondiente al término
	* De momento será la letra inicial, pero dejamos la puerta abierta a agrupar términos que comiencen por números et..
	*/
	public static function letra_from_termino($termino) {

		preg_match("/\w/", $termino, $output_array);
		if(isset($output_array[0])) {
			return strtolower( $output_array[0] );
		}
		
		return strtolower( substr($termino, 0,1) );		
	}
	
	/**
	* WALK_ALPHABETIC_TESAURO
	* @param array $alphabetic_tesauro
	* Recorre el array 'alphabetic_tesauro' formateando los datos para generar un listado alfabético
	*/
	public static function walk_alphabetic_tesauro($alphabetic_tesauro) {

		$ar_data=array();
		function cmp_by_te_text($a,$b){ return strcmp($a["te_text"], $b["te_text"]); }
		function cmp_by_tr_text($a,$b){ return strcmp($a["tr_text"], $b["tr_text"]); }
		function cmp_by_nd_text($a,$b){ return strcmp($a["nd_text"], $b["nd_text"]); }

		foreach ($alphabetic_tesauro as $key => $ar_value) {
			

			$terminoID 		= $ar_value['terminoID'];
			$termino 		= $ar_value['termino'];
			$lang 			= $ar_value['lang'];
			$RecordObj_dd 	= new RecordObj_dd($terminoID);
			$esdescriptor 	= $RecordObj_dd->get_esdescriptor();
				#dump($RecordObj_dd,'$RecordObj_dd'); break;

			# TG Padre
			$tg_id 	= $RecordObj_dd->get_parent();
			$tg 	= Descriptors::get_termino($tg_id,$lang);

			
			# NO DESCRIPTOR
			if($esdescriptor=='no') {

				# AR_DATA
				$ar_data[] = array(
							'esdescriptor' => $esdescriptor,
							'letra' 	=> self::letra_from_termino($termino),
							'termino' 	=> $termino,
							'terminoID' => $terminoID,
							'tg'		=> $tg,
							'tg_id'		=> $tg_id,					
						);
				continue;
			}
			
			
			# TE Hijos
			$te_children  = $RecordObj_dd->get_ar_childrens_of_this('si', 'no', $order_by=null );
			$ar_te=array();
			foreach ($te_children as $current_te) {
				$ar_te[] = array(
							'te_text' => Descriptors::get_termino($current_te,$lang),
							'te_id'   => $current_te
							);
			}			
			usort($ar_te, "cmp_by_te_text");
			
			# TR Términos relacionados
			$ar_tr=array();
			$ar_terminos_relacionados = RecordObj_dd::get_ar_terminos_relacionados($terminoID);
			foreach ($ar_terminos_relacionados as $current_tr) {
				$ar_tr[] = array(
							'tr_text' => Descriptors::get_termino($current_tr,$lang),
							'tr_id'   => $current_tr
							);
			}			
			usort($ar_tr, "cmp_by_tr_text");
			
			# UP No descriptores (son hijos no descriptores en estructura)
			$nd_pre 		= $RecordObj_dd->get_ar_childrens_of_this('no', 'no', $order_by=null );
			$ar_nd=array();
			foreach ($nd_pre as $current_nd) {
				$ar_nd[] = array(
							'nd_text' => Descriptors::get_termino($current_nd,$lang),
							'nd_id'   => $current_nd
							);
			}			
			usort($ar_nd, "cmp_by_nd_text");

			# AR_DATA
			$ar_data[] = array(
							'esdescriptor' => $esdescriptor,
							'letra' 	=> self::letra_from_termino($termino),
							'termino' 	=> $termino,
							'terminoID' => $terminoID,
							'na' 		=> $ar_value['def'],
							'tg'		=> $tg,
							'tg_id'		=> $tg_id,
							'ar_te'		=> $ar_te,
							'ar_tr'		=> $ar_tr,
							'ar_nd'		=> $ar_nd,
						);

		}

		return $ar_data;

	}#end walk alphabetic tesauro


}
?>