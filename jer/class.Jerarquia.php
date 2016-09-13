<?php
require_once(DEDALO_ROOT . '/jer/class.RecordObj_jer.php');
require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_ts.php');
require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_descriptors.php');



/*
* CLASE Jerarquia
*/

class Jerarquia {
	
	public $tabla ;	
	public $tld ;	
	public $esmodelo = false ;
	
	
	/*****************************************************************************
	* UTILIDADES
	*****************************************************************************/


	/**
	* GET_TIPO_FROM_prefix
	* @param string $prefix
	* @return string | null 
	*/
	public static function get_tipo_from_prefix( $prefix ) {
		
		$arguments=array();
		$arguments['alpha2']	= strtoupper(trim($prefix));	
		$RecordObj_jer			= new RecordObj_jer(null);	
		$ar_id					= $RecordObj_jer->search($arguments);

		$data = array();
		foreach ($ar_id as $current_id) {			

			$RecordObj_jer	= new RecordObj_jer($current_id);
 			$tipo 			= $RecordObj_jer->get_tipo();

 			return $tipo;
		}

		return false;

	}#end get_tipo_from_prefix
	


	/*
	* DATOSGRUPOJERARQUIA : Devuelve un array con los datos del grupos a partir de id or tld
	*/
	public function datosGrupoJerarquia($id=false, $tld=false) {
		
		if(!$id && !$tld) die("datosGrupoJerarquia: need mor vars ");

		$arguments=array();
		if ($id) {
		$arguments['id']		= $id;
		}
		if ($tld) {
		$arguments['alpha2']	= strtoupper(trim($tld));
		}
		$RecordObj_jer			= new RecordObj_jer(NULL);	
		$ar_id					= $RecordObj_jer->search($arguments);
			#dump($ar_id,print_r($arguments,true));#die();

		$data = array();
		foreach ($ar_id as $current_id) {
			$RecordObj_jer 		= new RecordObj_jer($current_id);		
			$ar_editable_fields = $RecordObj_jer->get_ar_editable_fields();
			$data['id']	= $current_id;
				#dump($RecordObj_jer,"RecordObj_jer");
			foreach ($ar_editable_fields as $current_field_name) {
				$fname = 'get_'.$current_field_name;
				$data[$current_field_name]	= $RecordObj_jer->$fname();
			}
		}
		#dump($data,"data id:$id, tld:$tld ");#die();
		return $data;


		/* OLD WORLD
		if ($tld) {
			$tld = strtoupper($tld);
		}
		
		if($tld) 	$filter = " WHERE alpha2 = '$tld' ";
		if($id)		$filter = " WHERE id = '$id' ";
		
		$ar_fields 	= array('id','alpha3','alpha2','nombre','tipo','activa','"mainLang"');
		$str_fields	= implode(',',$ar_fields);
		
		# sql
		$sql 		= " SELECT $str_fields FROM jerarquia $filter LIMIT 1 ";	
			dump($sql,'$sql');

		$result 	= pg_query(DBi::_getConnection(), $sql);
			#dump($result, 'result', array());
		if (!$result) {
			if(SHOW_DEBUG) {
				throw new Exception("Error Processing Request : Cannot (34) execute query: $sql <br>\n". pg_last_error(), 1);
			}else{
				throw new Exception("Error Processing DB Request (34) ", 1);
			}								
		}
		dump(pg_num_rows($result),"ar_rows id:$id, tld:$tld");die(__METHOD__ ." EN PROCESO");
		# No records
		if (pg_num_rows($result)<1) {
			return false;
		}
		$ar_rows = pg_fetch_assoc($result);
			dump($ar_rows,"ar_rows");die(__METHOD__ ." EN PROCESO");

		
		# Create array objs with all records founded
		$rows = $result->fetch_array(MYSQLI_ASSOC);

		foreach($ar_fields as $fieldName) {
			$data[$fieldName]	= $rows[$fieldName];	
		}
		
		return $data ;
		*/
	}#end datosGrupoJerarquia
	
	
	

	
	/*
	* CAMPOSOCUPADOS : Devuelve un array con los campos ocupados
	* para evitar introducir uno ya usado
	*/
	public function camposOcupados($campo) {

		$arguments=array();
		$arguments["strPrimaryKeyName"]	 	= $campo;
		$arguments["\"$campo\":not_null"] 	= '';
		$RecordObj_jer						= new RecordObj_jer(NULL);	
		$ar_rows							= $RecordObj_jer->search($arguments);
			#dump($ar_rows,"ar_rows : campo:$campo ".print_r($arguments,true));

		if (empty($ar_rows)) return false;

		return $ar_rows;
		/* OLD WORLD		
		$sql 		= " SELECT \"$campo\" FROM jerarquia WHERE $campo IS NOT NULL ORDER BY $campo ASC ";
		$result 	= DBi::_getConnection()->query($sql);
			#dump($result,'$result');

		# No results
		if($result->num_rows<1)	return(false);

		# Create array objs with all records founded
		if(($result->num_rows)>0) while ($rows = $result->fetch_array(MYSQLI_ASSOC) ) {
			
			$campoVal		= $rows["$campo"];
			$arrayOcupados[]= $campoVal ;	
		}
		
		return $arrayOcupados ;
		*/
	}


	/*
	* TLD3_TO_TLD2 
	*/
	public static function tld3_to_tld2($tld3) {

		#$tld3 = preg_replace("/lg-/", "", $tld3);
		#dump($tld3," tld3");

		$arguments=array();
		$arguments["strPrimaryKeyName"]	 	= 'alpha2';
		$arguments["alpha3"] 				= strtoupper($tld3);
		$RecordObj_jer						= new RecordObj_jer(NULL);	
		$ar_rows							= $RecordObj_jer->search($arguments);
			#dump($ar_rows,"ar_rows : campo:$tld3 ".print_r($arguments,true));

		if (empty($ar_rows[0])) return false;

		return $ar_rows[0];
	}
	
	
	
	
	
	/*****************************************************************************
	* EDIT JERARQUIA 
	*****************************************************************************/
	public function edit($id) {

		throw new Exception("Error Processing Request. edit is UNDER CONSTRUCTION", 1);
		
		$result = false ;		
				
		global $_POST ;		#print_r($_POST); die($_POST);
						
		# varibles recibidas obligatorias
		$id 			= $_POST['id'];
		$nombre 		= $_POST['nombre']; 
		$alpha2 		= strtoupper($_POST['alpha2']);
		$alpha3 		= strtoupper($_POST['alpha3']);
		$tipo			= $_POST['tipo'];
		$mainLang		= $_POST['mainLang'];		
		$activa 		= $_POST['activa'];	
		$activaAnterior	= $_POST['activaAnterior'];			
		
		if(!isset($nombre) || !isset($alpha2) || !isset($tipo) || !isset($activa) || !isset($mainLang)) die("<div class=\"error\"> Error: edit few arguments !</div>");
		
		
		# verificamos si ha cambiado el mainLang
		$RecordObj_jer		= new RecordObj_jer($id);
		$mainLang_stored	= $RecordObj_jer->get_mainLang();
		if($mainLang_stored	!= $mainLang) {
			# mainLan has changed. Change all descriptors of this jerarquia
			$strQuery = " 
			UPDATE descriptors
			SET lang = '$mainLang'
			WHERE 
			\"terminoID\" LIKE '{$alpha2}%'
			";
			#$res = DBi::_getConnection()->query($sql);
			$result		= JSON_RecordDataBoundObject::search_free($strQuery);
			if(!$result) throw new Exception("Error Processing Request. jerarquia edit", 1);		
		}
		
		
		if($_POST)
		{
			$updateSQL = " UPDATE jerarquia SET ";
			
			if(isset($_POST['nombre'])) 		$updateSQL .= " nombre = "		. GetSQLValueString(trim($_POST['nombre']), "text")			.',' ;
			if(isset($_POST['alpha2'])) 		$updateSQL .= " alpha2 = " 		. GetSQLValueString(trim($alpha2), "text")					.',' ;
			if(isset($_POST['alpha3'])) 		$updateSQL .= " alpha3 = " 		. GetSQLValueString(trim($alpha3), "text")					.',' ;
			if(isset($_POST['mainLang'])) 		$updateSQL .= " \"mainLang\" = " . GetSQLValueString(trim($_POST['mainLang']), "text")		.',' ;
			if(isset($_POST['activa'])) 		$updateSQL .= " activa = " 		. GetSQLValueString(trim($_POST['activa']), "text")			.',' ;
			if(isset($_POST['tipo'])) 			$updateSQL .= " tipo = " 		. intval($_POST['tipo'])									.',' ;				
			
			$updateSQL = substr($updateSQL,0,-1);
			
			$updateSQL .= " WHERE id = $id LIMIT 1 " ;	#die($updateSQL);			
			
			$sql = $updateSQL;
			#$res = DBi::_getConnection()->query($sql);
			$result		= JSON_RecordDataBoundObject::search_free($sql);
			if(!$result) throw new Exception("Error Processing Request. jerarquia edit", 1);
			
			# Creamos las tablas					
			if($activa=='si') $createTabla = $this->insertTableJerarquia($alpha2,$nombre,$mainLang);
									
								
			$result = true ; 
		}
		
		return $result ;
		
	}# fin edit
	
	
	
	
	
	
	
	/*****************************************************************************
	* DELETE JERARQUIA 
	*****************************************************************************/
	public function delete($id,$tld) {

		throw new Exception("Error Processing Request. delete is UNDER CONSTRUCTION", 1);
		
		
		$result = false ;
		$error 	= false ;
		
		# varibles recibidas
		$id ; 	if(!$id) die("<div class=\"error\"> Error: id not defined !</div>");
		$tld ;	if(!$tld) die("<div class=\"error\"> Error: tld not defined !</div>");
		
		$tld = strtolower($tld);
		
		# globals
		global $no_hay_resultados_coincidentes_title ;
		global $no_se_puede_borrar_title ;
		global $jerarquias_title ;
		global $volver_title ;
		global $porque_se_usa_en_title ;
		global $indexaciones_title ;
		global $terminos_title ;
		global $captaciones_title ;
		global $usados_title ;
		global $informantes_title ;
		global $renderBtnVolver ;
	
		
		# INDEXACIONES Seleccionamos todos los registros de esta jerarquia usados en indexacion_rel (indexacion)
		$query_RS = " SELECT terminoID FROM indexacion_rel AS rel WHERE terminoID LIKE '$tld%' ";
		$RS = mysql_query($query_RS, DB::_getConnection()) or die(" delete jerarquia indexaciones $query_RS <hr>".mysql_error()); #die("indexacion verify: $query_RS");
		

		$row_RS = mysql_fetch_assoc($RS);
		$totalRows_RS = mysql_num_rows($RS);
		if($totalRows_RS >0)
		{ 
			$html = false ;
			do{
				$terminoIDActual	= $row_RS['terminoID'];
				$terminoActual		= RecordObj_ts::get_termino_by_tipo($terminoIDActual);
			
				$html .= " <ul> $terminoActual [$terminoIDActual] </ul>";
			} while ($row_RS = mysql_fetch_assoc($RS)); mysql_free_result($RS);
		
			$error[] = "
			". ucfirst($no_se_puede_borrar_title)." $jerarquias_title $tld  $porque_se_usa_en_title $indexaciones_title <hr>
			 $terminos_title $usados_title:
			 <br><br> 
			 $html
			 <br>
			 ";
		}
		
		# CAPTACIONES Seleccionamos todos los registros de esta jerarquia usados en captaciones (captaciones)
		$query_RS = "SELECT municipioID FROM captaciones WHERE municipioID LIKE '$tld%' ";
		$RS = mysql_query($query_RS, DB::_getConnection()) or die(" delete jerarquia captaciones $query_RS <hr>".mysql_error()); #die("captaciones verify: $query_RS");	
		$row_RS = mysql_fetch_assoc($RS);
		$totalRows_RS = mysql_num_rows($RS);
		if($totalRows_RS >0)
		{ 
			$html = false ;
			do{
				$terminoIDActual	= $row_RS['municipioID'];
				$terminoActual		= RecordObj_ts::get_termino_by_tipo($terminoIDActual);
			
				$html .= " <ul> $terminoActual [$terminoIDActual] </ul>";
			} while ($row_RS = mysql_fetch_assoc($RS));
		
			$error[] = "
			". ucfirst($no_se_puede_borrar_title)." $jerarquias_title $tld  $porque_se_usa_en_title $captaciones_title<hr>
			 $terminos_title $usados_title:
			 $html 			 
			 <br>";					
		}		
		
		# INFORMANTES Seleccionamos todos los registros de esta jerarquia usados en informants (informantes)
		$query_RS = "SELECT municipioID FROM informants WHERE municipioID LIKE '$tld%' ";
		$RS = mysql_query($query_RS, DB::_getConnection()) or die(" delete jerarquia informants $query_RS <hr>".mysql_error()); #die("captaciones verify: $query_RS");	
		$row_RS = mysql_fetch_assoc($RS);
		$totalRows_RS = mysql_num_rows($RS);
		if($totalRows_RS >0)
		{ 
			$html = false ;
			do{
				$terminoIDActual	= $row_RS['municipioID'];
				$terminoActual		= RecordObj_ts::get_termino_by_tipo($terminoIDActual);
			
				$html .= " <ul> $terminoActual [$terminoIDActual] </ul>";
			} while ($row_RS = mysql_fetch_assoc($RS));
		
			$error[] = "
			". ucfirst($no_se_puede_borrar_title)." $jerarquias_title $tld  $porque_se_usa_en_title $informantes_title<hr>
			 $terminos_title $usados_title:
			 $html 			 
			 <br>";					
		}
		
		
		# ERRORES
		if(is_array($error)) 		
		{
			foreach($error as $key=>$value){
			
				$output .= $value .'<br>';
			
			}			
			die( "$codHeader <div class=\"error\"> $output $renderBtnVolver </div>" );
		}
		if($error) die('Stop by error');
		
		# TERMINOS RELACIONADOS Eliminamos todas las relaciones de esta jerarquia en descriptors_rel 			
		$deleteSQL = "DELETE FROM descriptors_rel WHERE terminoID LIKE '$tld%' || terminoID2 LIKE '$tld%' ";
		$ResultDel = mysql_query($deleteSQL, DB::_getConnection()) or die("delete jerarquia descriptors_rel $deleteSQL <hr>".mysql_error());
		
		# DESCRIPTORES Eliminamos todos los descriptores de esta jerarquia en descriptors 			
		$deleteSQL = "DELETE FROM descriptors WHERE terminoID LIKE '$tld%' ";
		$ResultDel = mysql_query($deleteSQL, DB::_getConnection()) or die("delete jerarquia descriptors $deleteSQL <hr>".mysql_error());
		
		# TABLA jer_XX . Borramos la tabla de estructura de esta jerarquia
		$deleteTable = $this->deleteTableJerarquia($tld); if(!$deleteTable) die(" Error in deleteTableJerarquia ! ");
		
		# DELETE  Eliminamos esta jerarquia
		$RecordObj_jer 	= new RecordObj_jer($id);
		$nombre 		= $RecordObj_jer->get_nombre();	
		$RecordObj_jer->MarkForDeletion();		
		
		# REGISTRO . registrarAccion($userID, $modo, $detalle, $donde='', $ip='0') 
		require_once(DEDALO_ROOT.'/Connections/config.php');
		require_once(DEDALO_ROOT.'/inc/funciones.php');
		registrarAccion(USRID,'DELETE', $detaill="Deleted jerarquia id:$id, name:$nombre " ,"jerarquia"); 
		
		
		return true ;
	  
	}# fin delete
	
	
	/*
	* SQL Delete table
	*/
	function deleteTableJerarquia($tld) {

		$tld = strtolower($tld);
		
		# TABLA . Eliminamos la tabla  jer_$tld
		$nombre = 'jer_'.$tld;
		$sql = " DROP TABLE IF EXISTS \"$nombre\" ";

		#$res = DBi::_getConnection()->query($sql);
		$result	 = JSON_RecordDataBoundObject::search_free($sql);
		if(!$result) throw new Exception("Error Processing Request. deleteTableJerarquia", 1);	
		
		return true ;		
	
	}# fin function deleteTableJerarquia
	
	
	
	
	
	/*****************************************************************************
	* INSERT JERARQUIA . Crea nueva unidad jerarquia
	*****************************************************************************/
	function insert() {
		
		$result = false ;
		
		#global $_POST ;		#print_r($_POST); die($_POST);
		
		# varibles recibidas obligatorias
		$id 			= intval($_POST['id']);
		$nombre 		= trim($_POST['nombre']); 
		$alpha2 		= strtoupper($_POST['alpha2']);
		$alpha3 		= strtoupper($_POST['alpha3']);
		$tipo			= $_POST['tipo'];	
		$activa 		= trim($_POST['activa']);
		$mainLang 		= $_POST['mainLang'];	
		
		if(!isset($nombre) || !isset($alpha2) || !isset($tipo) || !isset($activa) ) die("<div class=\"error\"> Error: insert few arguments !</div>");
							
		# Insertamos el registro
		$RecordObj_jer = new RecordObj_jer($id);
		$RecordObj_jer->set_alpha3($alpha3);
		$RecordObj_jer->set_alpha2($alpha2);
		$RecordObj_jer->set_nombre($nombre);
		$RecordObj_jer->set_tipo($tipo);
		$RecordObj_jer->set_activa($activa);
		$RecordObj_jer->set_mainLang($mainLang);
		$save = $RecordObj_jer->Save();				#var_dump($save); die();	
		
		
		# Creamos las tablas					
		if($save && $mainLang) $createTabla = $this->insertTableJerarquia($alpha2,$nombre,$mainLang);
		
		
		return true ;
	}
	
	/*
	* insertTableJerarquia . SQL Create table 
	* Si existe ya la tabla, ignora la orden. Si NO existe, la crea y le inserta los datos por defecto
	*/
	function insertTableJerarquia($tld, $nombre, $mainLang) {

		if(SHOW_DEBUG) {
			dump($_POST,'$_POST');
		}

		throw new Exception("Error Processing Request. Sorry, insertTableJerarquia is UNDER CONSTRUCTION. Please contact with your admin to use it", 1);
		
		#echo "$tld,$nombre,$mainLang";die();
			
		$tld = strtolower($tld);
		
		# Comprobamos si existe
		$tabla 	= 'jer_'.strtolower($tld);
		$sql 	= " SELECT terminoID FROM $tabla ";
		$res 	= @ DBi::_getConnection()->query($sql);
		$exist 	= $res ;
		
		
		if(!is_resource($exist)) {
					
			# TABLA . Creamos la tabla 
			$sql = "
			CREATE TABLE IF NOT EXISTS `jer_{$tld}` (
			  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT 'autoIncrement',
			  `terminoID` varchar(8) COLLATE utf8_unicode_ci NOT NULL COMMENT 'varchar de 8',			  
			  `parent` varchar(8) COLLATE utf8_unicode_ci NOT NULL,
			  `modelo` varchar(8) COLLATE utf8_unicode_ci DEFAULT NULL COMMENT 'referencia',			  
			  `esmodelo` enum('si','no') COLLATE utf8_unicode_ci NOT NULL DEFAULT 'no' COMMENT 'default no',
			  `esdescriptor` enum('si','no') COLLATE utf8_unicode_ci NOT NULL DEFAULT 'si',
			  `visible` enum('si','no') COLLATE utf8_unicode_ci NOT NULL DEFAULT 'si' COMMENT 'para ocultar en zonas públicas,etc.',
			  `norden` int(3) DEFAULT NULL,			  
			  `usableIndex` enum('si','no') COLLATE utf8_unicode_ci DEFAULT 'si' COMMENT 'select si,no default si',
			  `traducible` enum(  'si',  'no'  )  COLLATE utf8_unicode_ci NOT  NULL DEFAULT  'si' COMMENT  'campo de control de la traducción del término',
			  `relaciones` text COLLATE utf8_unicode_ci COMMENT  'campo de las relaciones guardadas como un array en JSON',
			  `propiedades` text COLLATE utf8_unicode_ci,
			 PRIMARY KEY (`id`),
			 UNIQUE KEY `terminoID` (`terminoID`),
			 KEY `parent` (`parent`),
			 KEY `esdescriptor` (`esdescriptor`),
			 KEY `esmodelo` (`esmodelo`)
			) ENGINE  = InnoDB  DEFAULT CHARSET = utf8 COLLATE = utf8_unicode_ci PACK_KEYS=0 AUTO_INCREMENT=1 ;	
			";
			$res 	= DBi::_getConnection()->query($sql);
			if(!$res) throw new Exception("Error Processing Request. insertTableJerarquia", 1);
					
			# DATOS INICIALES . Añadimos el primer registro de nivel 0
				
			# insert initial data in jer_XX (structure table)				
			
				# reg 1 (descriptor root)
				$RecordObj_ts = new RecordObj_ts(NULL,$tld);
				$RecordObj_ts->set_terminoID("{$tld}1");
				$RecordObj_ts->set_parent("{$tld}0");
				$RecordObj_ts->set_esmodelo("no");
				$RecordObj_ts->set_esdescriptor("si");
				$RecordObj_ts->set_visible("si");
				$RecordObj_ts->set_usableIndex("si");
				$RecordObj_ts->Save();
				
				# reg 2 (modelo root)
				$RecordObj_ts = new RecordObj_ts(NULL,$tld);				
				$RecordObj_ts->set_terminoID("{$tld}2");
				$RecordObj_ts->set_parent("{$tld}0");
				$RecordObj_ts->set_esmodelo("si");
				$RecordObj_ts->set_esdescriptor("si");
				$RecordObj_ts->set_visible("si");
				$RecordObj_ts->set_usableIndex("no");
				$RecordObj_ts->Save();
			
							
			# insert initial data in descriptors (names table)
			
				# reg 1 (descriptor root)
				$matrix_table			= RecordObj_descriptors::get_matrix_table_from_tipo($tld);
				$RecordObj_descriptors 	= new RecordObj_descriptors($matrix_table, NULL);				
				$RecordObj_descriptors->set_parent("{$tld}1");
				$RecordObj_descriptors->set_dato("$nombre");
				$RecordObj_descriptors->set_tipo("termino");
				$RecordObj_descriptors->set_lang($mainLang);				
				
				$RecordObj_descriptors->Save();
				
				# reg 2 (modelo root)
				$matrix_table			= RecordObj_descriptors::get_matrix_table_from_tipo($tld);
				$RecordObj_descriptors 	= new RecordObj_descriptors($matrix_table, NULL);				
				$RecordObj_descriptors->set_parent("{$tld}2");
				$RecordObj_descriptors->set_dato("$nombre [M]");
				$RecordObj_descriptors->set_tipo("termino");
				$RecordObj_descriptors->set_lang($mainLang);
				
				$RecordObj_descriptors->Save();		
		
		}#if exist
		
		return true ;	
	}
	
	
	
	
	
	/*****************************************************************************
	* INSERTTIPO : TIPO INSERT
	*****************************************************************************/
	function insertTipo() {

		global $_POST ;

		$insertedID = null;
		
		# varibles recibidas obligatorias		
		$nombre = trim($_POST['nombre']);
		if(empty($nombre)) die("<div class=\"error\"> Error: insert few arguments !</div>");
		
		$sql 	= " INSERT INTO jerarquia_tipos ( `nombre`) VALUES ('$nombre') ";
		$res 	= DBi::_getConnection()->query($sql);
		if(!$res) throw new Exception("Error Processing Request. insertTipo", 1);
				
		# recogemos el id recién creado
		$insertedID = DBi::_getConnection()->insert_id;
		
		return $insertedID ;
	}
	
	
	
	
	/*****************************************************************************
	* EDITTIPO : TIPO EDIT
	*****************************************************************************/
	function editTipo() {		
		die("STOP editTpo NOT USED");		
	}
	
	
	# GET_MAINLANG : resolve main lang
	public static function get_mainLang($terminoID) {
		# Structure
		if (strpos($terminoID, 'dd')===0) {
			return 'lg-spa';
		}	
		return RecordObj_jer::get_mainLang_static($terminoID);
	}
	
	


	/*
	* crear desplegable básico crearDesplegableJerTipo
	*/
	static function  crearDesplegableJerTipo($idGet, $ancho='200', $select_name='tipo') {
		global  $sin_seleccion_title ;
		
		$html = '';

		$ar_all_tipos = RecordObj_jer::get_ar_all_tipos();

		$html .= "<select name=\"$select_name\" id=\"tipo\" style=\"color:#333333;width:".$ancho."px; \" > " ;
		
		$html .= "<option value=\"\" ";
			if (!(strcmp("", $idGet))) { $html .= "selected=\"selected\" ";} ;	
		$html .= "> </option>
		";
		
		# Tipo 5 is not showed
		if(SHOW_DEBUG==FALSE) {
			# Remove tipo 5 from array
			unset($ar_all_tipos[5]);
		}

		# Create array objs with all records founded
		foreach ($ar_all_tipos as $id => $nombre) {							
			
			$html .= "<option value=\"$id\" ";
			if (!(strcmp($idGet, $id))) 
				$html .= "selected=\"selected\" ";
			$html .= " style=\"margin-top:4px\">";			
			$html .= "$nombre" ;	# [$id]		
			$html .= "</option>";
		}
		$html .= "</select>";
		
		return $html ;		
	}
}
?>