<?php
require_once( dirname(dirname(__FILE__)).'/config/config4.php');

/**
* LOGIN
*/
$is_logged	= login::is_logged();
	
if($is_logged!==true) {
	$url =  DEDALO_ROOT_WEB ."/main/";
	header("Location: $url");
	exit();
}
$security 	 = new security();
$permissions = (int)$security->get_security_permissions(DEDALO_TESAURO_TIPO);
if ($permissions<1) {
	$url =  DEDALO_ROOT_WEB ."/main/";
	header("Location: $url");
	exit();
}

require_once(DEDALO_LIB_BASE_PATH . '/common/class.navigator.php');
require_once(DEDALO_LIB_BASE_PATH .'/ts/class.Tesauro.php');
/*
*	TS_CLASS_ACTIONS
*	ACCIONES SOBRE EL TESAURO
*/
require_once(DEDALO_ROOT .'/Connections/config.php');
require_once(DEDALO_ROOT .'/inc/funciones.php');


# set vars
$vars = array('accion','terminoID','parent','termino','terminoIDlist','terminoIDresalte','modo','type','tabla','id','ts_lang','lang2load','terminoID_to_link','dato','def','nombre','modelo_name','nHijos');
	foreach($vars as $name)	$$name = setVar($name);



/**
* SHOW_INDEXATIONS : diffusion_index_ts
*/
if($accion=='show_indexations') {

	# DATA VERIFY
	if(empty($terminoID) || strlen($terminoID)<3) exit("Trigger Error: terminoID is mandatory");	

	# DIFFUSION_INDEX_TS
	$diffusion_index_ts = new diffusion_index_ts($terminoID);
	$html 				= $diffusion_index_ts->get_html();
		#dump($html,'$html');

	exit($html);

}#end show_indexations



/**
* INSERTTS 
*/
if($accion=='insertTS') {
	
	if(!$parent)	exit("Need more vars: parent: $parent ");
	if(!$modo)		exit("Need more vars: modo: $modo ");

	$html ='';	
	$prefijo 	= substr($parent,0,2);	
	$esmodelo 	= 'no';
	if($modo=='modelo_edit') $esmodelo	= 'si';
	
	$RecordObj_ts 	= new RecordObj_ts(NULL,$prefijo);	
		# Defaults
		$RecordObj_ts->set_esdescriptor('si');
		$RecordObj_ts->set_visible('si');
		$RecordObj_ts->set_usableIndex('si');
		$RecordObj_ts->set_parent($parent);
		$RecordObj_ts->set_esmodelo($esmodelo);	
	
	# SAVE : After save, we can recover new created terminoID (prefix+autoIncrement)
	$created_id_ts = $RecordObj_ts->Save();
		#dump($created_id_ts,'created_id_ts'," "); #die();
	
	# TERMINOID : Seleccionamos el último terminoID recien creado		
	$terminoID	= $RecordObj_ts->get_terminoID();
		#dump($RecordObj_ts,'RecordObj_ts',"new obj created terminoID:$terminoID, id:$created_id_ts "); die( );	
	
	# DESCRIPTORS : finally we create one record in descriptors with this main info 
		# Usaremos como lenguaje de creación, el lenguaje principal de la jerarquía actual. 
		# (Ej. para 'je_dd', 'lg-spa' , definido en la tabla 'jerarquia')
		$lang					= Jerarquia::get_mainLang($terminoID);
			#dump($lang,'lang');

		$matrix_table			= RecordObj_descriptors::get_matrix_table_from_tipo($terminoID);
		$RecordObj_descriptors	= new RecordObj_descriptors($matrix_table, NULL, $terminoID, $lang);
		$RecordObj_descriptors->set_tipo('termino');
		$RecordObj_descriptors->set_parent($terminoID);
		$RecordObj_descriptors->set_lang($lang);
		$created_id_descriptors	= $RecordObj_descriptors->Save();

	# ACTIVITY LOG
	$matrix_table 			= RecordObj_descriptors::$descriptors_matrix_table;
	$time_machine_last_id 	= $RecordObj_descriptors->get_time_machine_last_id();

	# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)	
	logger::$obj['activity']->log_message(
		'SAVE',
		logger::INFO,
		DEDALO_TESAURO_TIPO,
		null,
		array(	"msg"				=> "Created tesauro term and descriptor",
				"terminoID"			=> $terminoID,
				"parent"			=> $parent,
				"descriptors_tipo"	=> 'termino',
				"descriptors_id"	=> $created_id_descriptors,				
				"descriptors_lang" 	=> $lang,
				"descriptors_tm_id"	=> $time_machine_last_id
			)
	);

	
	if($terminoID) {

		$divName 	= "divCont$parent";
		$pre_url 	= $_SERVER['HTTP_REFERER'];
		
		# TREE : Reload only partial
		$RecordObj_ts 	= new RecordObj_ts( $RecordObj_ts->get_parent() );
		$parentPost 	= $RecordObj_ts->get_parent();
		$terminoIDpost 	= $parent;
		
		$html .= $codHeader ;
		$html .= "<script type=\"text/javascript\">
					try{
						document.getElementById('$divName').innerHTML += '<div class=\"ok\"> Created $terminoID ok ! </div>';
						ts.openTSedit('$terminoID','$parent');	
						setTimeout(function(){
							//location = \"$pre_url\";
							window.openDivTrack('$parentPost',1,'$terminoIDpost');
						},1000);										
					}catch(err){ 
						alert(err)
					}									
				</script>";
		
		echo $html ;
	}
	
	die();	
}




/**
* UPDATE_TR_ORDER
*/
if($accion=='update_tr_order') {

	if(empty($terminoID))	exit("Need more vars: terminoID");
	if(empty($dato))		exit("Need more vars: dato");

	$html='';	
		
	$RecordObj_ts 	= new RecordObj_ts($terminoID);	
	$RecordObj_ts->set_relaciones($dato);	
	
	# SAVE 
	$RecordObj_ts->Save();				
		#dump($RecordObj_ts,'$RecordObj_ts'); #die();

	$html = 'ok';			

	# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
	$str_order='';
	foreach ($dato as $key => $ar_value) {
		foreach ($ar_value as $key2 => $value) {
			$str_order .= $value;
			$str_order .= ", ";
		}
	}
	$str_order = substr($str_order, 0,-2);
	$parent 	= $RecordObj_ts->get_parent();
	logger::$obj['activity']->log_message(
		'SAVE',
		logger::INFO,
		DEDALO_TESAURO_TIPO,
		null,
		array(	"msg"			=> "Changed related terms order",
				"terminoID"		=> $terminoID,
				"parent"		=> $parent,
				"order"			=> $str_order			
			)
	);

	exit($html);
}




/**
* SAVEDESCRIPTORFROMLIST : Inline edit in tree
*/
if($accion=='saveDescriptorFromList') {
	
	if(!$terminoID || strlen($terminoID)<2) die("Need more data! terminoID:$terminoID ");
	
	$html='';
	
	if(strlen($lang)<3) {
		$lang = Jerarquia::get_mainLang($terminoID);
			#dump($lang,'lang'); 
	}
	
	$parent = $terminoID;
	$lang 	= $lang;

	$matrix_table			= RecordObj_descriptors::get_matrix_table_from_tipo($terminoID);
	$RecordObj_descriptors	= new RecordObj_descriptors($matrix_table, NULL, $parent, $lang, $tipo='termino');
	$RecordObj_descriptors->set_dato($termino);
	$RecordObj_descriptors->Save();
	
	$html .= " Saved! ";
	

	# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
	$RecordObj_ts 			= new RecordObj_ts($terminoID);
	$ts_parent 				= $RecordObj_ts->get_parent();
	$id_descriptors 		= $RecordObj_descriptors->get_id();
	$time_machine_last_id 	= $RecordObj_descriptors->get_time_machine_last_id();	
	logger::$obj['activity']->log_message(
		'SAVE',
		logger::INFO,
		DEDALO_TESAURO_TIPO,
		null,
		array(	"msg"				=> "Saved descriptor inline",
				"terminoID"			=> $terminoID,
				"parent"			=> $ts_parent,
				"termino"			=> $termino,
				"descriptors_tipo"	=> 'termino',
				"descriptors_id"	=> $id_descriptors,				
				"descriptors_lang" 	=> $lang,
				"descriptors_tm_id"	=> $time_machine_last_id
			)
	);
	
	exit($html);
}



/**
* DELETE V4
*/
if($accion=='deleteTS') {
	
	if(!$terminoID) exit("Need more vars: terminoID: $terminoID ");
	
	/*
		# TERMINO . Eliminamos este termino
		$RecordObj_ts	= new RecordObj_ts($terminoID);		#echo "<pre>";var_dump($RecordObj_ts); echo "</pre>";	
		$RecordObj_ts->MarkForDeletion();	
		#$RecordObj_ts->set_blForDeletion(true);	
		#$RecordObj_ts->set_ID(5571);
		
		#echo  "ID:".var_dump($RecordObj_ts->get_ID()); echo " - blForDeletion:"; var_dump($RecordObj_ts->get_blForDeletion()); echo " <hr>";
		
		#$RecordObj_ts->destruct();						#echo "<pre>";var_dump($RecordObj_ts); echo "</pre>";die();
		#$RecordObj_ts->__destruct();			
		
		#$ID 			= $RecordObj_ts->get_ID();		
		#$blForDeletion	= $RecordObj_ts->get_blForDeletion();		
		
			
		#echo "<pre> terminoID: $terminoID  - ID: $ID -  blForDeletion:"; var_dump($blForDeletion); echo "<hr>"; var_dump($RecordObj_ts);	die("</pre> stop");
		#echo "<pre> terminoID: $terminoID  "; echo "<hr>"; var_dump($RecordObj_ts);	die("</pre> stop");
		exit("<br>ya");
	*/	
	
	$html='';
	
	if(!$modo) $modo = 'tesauro_list';
	
	# init tesauro in requested modo
	#$ts 		= new Tesauro($modo,$type,$ts_lang);
	
	$termino	= RecordObj_ts::get_termino_by_tipo($terminoID);
	$divName 	= "divCont$terminoID";
		#dump($divName) ;exit();
	
	/*
	$RecordObj_ts 	= new RecordObj_ts($terminoID);
	$parent 		= $RecordObj_ts->get_parent();
	$RecordObj_ts2 	= new RecordObj_ts($parent);
	$parent2 		= $RecordObj_ts2->get_parent();
	*/									
	
	$flat = false;		if(isset($_REQUEST['flat'])) $flat = $_REQUEST['flat'];
	
		#$result = $ts->delete($terminoID);
	
		# HIJOS . Verificamos si tiene hijos (aunque el javascript debe haber evitado llegar aquí.)				
			$RecordObj_ts		= new RecordObj_ts($terminoID);
			$n_hijos 			= $RecordObj_ts->get_n_hijos();
			if( $n_hijos >0 )	die("<div class=\"error\"> $el_descriptor_tiene_hijos_title.<br> $para_eliminar_una_rama_title  $renderBtnVolver</div>");
			
				
		# INDEXACIONES . Verificamos que NO se usa actualmente en ninguna indexación 
			/*
			$query_RS2 		= "SELECT terminoID, indexacionID FROM indexacion_rel WHERE terminoID = '$terminoID' ";
			$RS2 			= mysql_query($query_RS2, DB::_getConnection()) or die(__METHOD__."delete ".mysql_error());
			$row_RS2 		= mysql_fetch_assoc($RS2);
			
			$totalRows_RS2 	= mysql_num_rows($RS2);
			if($totalRows_RS2 >0) {
				do{
					$indexacionU = intval($row_RS2['indexacionID']);
					$indList 	.= " $indexacionU, ";
				} while ($row_RS2 = mysql_fetch_assoc($RS2));
				$indList = substr($indList,0,-2);
				
				die("<div class=\"error\"> $este_descriptor_no_se_eliminara_title $indexacion_title: $indList  $renderBtnVolver</div>");	
			}
			*/
				
		# CAPTACIONES
			/*			
			$tabla = 'captaciones' ;
			$query_RS = "SELECT captacionID FROM $tabla WHERE municipioID = '$terminoID' ";
			$RS = mysql_query($query_RS, DB::_getConnection()) or die(__METHOD__."delete <hr>".mysql_error());
			$row_RS = mysql_fetch_assoc($RS);			
			$totalRows_RS = mysql_num_rows($RS);
			if($totalRows_RS >0) {
				$topoList  = false ;
				do{
					$IDActual = intval($row_RS['captacionID']);
					$topoList .= " $IDActual, ";
				} while ($row_RS = mysql_fetch_assoc($RS));
				$topoList = substr($topoList,0,-2);			
				die("<div class=\"error\"> $este_descriptor_no_se_eliminara_title $captacion_title: $topoList $renderBtnVolver</div>");	
			}
			*/
					
		# INFORMANTES
			/*
			$tabla = 'informants' ;
			$query_RS = "SELECT informantID FROM $tabla WHERE ( municipioID = '$terminoID' OR lugarN = '$terminoID' ) ";
			$RS = mysql_query($query_RS, DB::_getConnection()) or die(__METHOD__."delete <hr>".mysql_error());
			$row_RS = mysql_fetch_assoc($RS);			
			$totalRows_RS = mysql_num_rows($RS);
			if($totalRows_RS >0) {
				$topoList  = false ;
				do{
					$IDActual = intval($row_RS['informantID']);
					$topoList .= " $IDActual, ";
				} while ($row_RS = mysql_fetch_assoc($RS));
				$topoList = substr($topoList,0,-2);			
				die("<div class=\"error\"> $este_descriptor_no_se_eliminara_title $informante_title: $topoList $renderBtnVolver</div>");	
			}
			*/
					
		# CINTAS (REELS)
			/*
			$tabla = 'reels' ;
			$query_RS = "SELECT reelID FROM $tabla WHERE municipioID = '$terminoID' ";
			$RS = mysql_query($query_RS, DB::_getConnection()) or die(__METHOD__."delete <hr>".mysql_error());
			$row_RS = mysql_fetch_assoc($RS);			
			$totalRows_RS = mysql_num_rows($RS);
			if($totalRows_RS >0) {
				$topoList  = false ;
				do{
					$IDActual = intval($row_RS['reelID']);
					$topoList .= " $IDActual, ";
				} while ($row_RS = mysql_fetch_assoc($RS));
				$topoList = substr($topoList,0,-2);			
				die("<div class=\"error\"> $este_descriptor_no_se_eliminara_title $cinta_title: $topoList $renderBtnVolver</div>");	
			}
			*/					
				
		# RELACIONES . Si tiene relaciones, las eliminamos para no dejar rastro			
			$arguments=array();			
			$arguments['strPrimaryKeyName']	= 'terminoID';
			$arguments['sql_code']			= opTextSearch($campo='relaciones',$string="%\"$terminoID\"%",$boolean=2);
			
			$RecordObj_ts					= new RecordObj_ts(NULL, Tesauro::terminoID2prefix($terminoID));
			$ar_id							= $RecordObj_ts->search($arguments);				
			
			if(count($ar_id)>0) foreach($ar_id as $terminoID_rel) {
					
				$RecordObj_ts2 	= new RecordObj_ts($terminoID_rel);							#echo " - $terminoID_rel <br> ";	
				$RecordObj_ts2->remove_element_from_ar_terminos_relacionados($terminoID);
				$RecordObj_ts2->Save();														
			}				
				
				
		# MODELO . Verificamos que nadie lo usa como modelo
			/*
			$prefijo 		= Tesauro::terminoID2prefix($terminoID);
			$tabla 			= 'jer_'.$prefijo ;
			$query_RS 		= "SELECT terminoID FROM $tabla WHERE modelo = '$terminoID' ";$RS 			= mysql_query($query_RS, DB::_getConnection()) or die(__METHOD__."delete <hr>".mysql_error());
			$row_RS 		= mysql_fetch_assoc($RS);			
			$totalRows_RS 	= mysql_num_rows($RS);
			if($totalRows_RS >0)
			{
				$modeloList  = false ;
				do{
					$IDActual 	 = $row_RS['terminoID'];
					$modeloList .= " $IDActual, ";
				} while ($row_RS = mysql_fetch_assoc($RS));
				$modeloList = substr($modeloList,0,-2);			
				die("<div class=\"error\"> $este_descriptor_no_se_eliminara_title $modelo_title: $modeloList $renderBtnVolver </div>");	
			}
			*/			
			$arguments=array();
			$arguments['terminoID']		= 'strPrimaryKeyName';
			$arguments['modelo']		= $terminoID;
			
			$RecordObj_ts				= new RecordObj_ts(NULL, Tesauro::terminoID2prefix($terminoID));
			$ar_id						= $RecordObj_ts->search($arguments);
			
			if(count($ar_id)>0) {
				
				$modelo_list			= '' ;
				foreach($ar_id as $modeloID) {
				
					$modelo_list		.= " $modeloID, ";
				}
				$modelo_list 			= substr($modelo_list,0,-2);
				# DIE
				die("<div class=\"error\"> $este_descriptor_no_se_eliminara_title $modelo_title: $modelo_list $renderBtnVolver </div>");	
			}		
							
					
		# TERMINO . Eliminamos este termino
			$RecordObj_ts_main	= new RecordObj_ts($terminoID);
			$RecordObj_ts_main->MarkForDeletion();
			$ts_parent = $RecordObj_ts_main->get_parent();			
			
			$ID 				= $RecordObj_ts_main->get_ID();		
			$blForDeletion		= $RecordObj_ts_main->get_blForDeletion();	#echo "<pre> terminoID: $terminoID  - ID: $ID -  blForDeletion:"; var_dump($blForDeletion); echo "<hr>"; var_dump($RecordObj_ts_main);	exit("</pre> stop");				
	
	
		# DESCRIPTORS : finally delete all records in descriptors with this terminoID
			$all_descriptors_by_tipo 		= RecordObj_descriptors::get_all_descriptors_by_tipo($terminoID); 
			$all_descriptors_langs_by_tipo 	= RecordObj_descriptors::get_all_descriptors_langs_by_tipo($terminoID); 
			RecordObj_descriptors::delete_all_descriptors_by_tipo($terminoID);
				


	# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
	$all_descriptors_by_tipo_string 		= implode(', ', $all_descriptors_by_tipo);
	$all_descriptors_langs_by_tipo_string 	= implode(', ', $all_descriptors_langs_by_tipo);	
	logger::$obj['activity']->log_message(
		'DELETE',
		logger::INFO,
		DEDALO_TESAURO_TIPO,
		null,
		array(	"msg"				=> "Deleted term and all own descriptors",
				"terminoID"			=> $terminoID,
				"parent"			=> $ts_parent,
				"termino"			=> $termino,
				"descriptors_tipo"	=> 'termino',
				"descriptors_id"	=> $all_descriptors_by_tipo_string,				
				"descriptors_lang" 	=> $all_descriptors_langs_by_tipo_string
			)
	);
	
	
		
	if($flat==1) {
		# caso de listado plano
		$html .= $codHeader ;
		$html .= "<script type=\"text/javascript\">							
					window.history.go(-1);													
				</script>";
	}else{
		# Ajax function 'delete_term' EN 'ts_list.js'
		$html = 'ok_tree';
	}
	
	echo $html;
	exit();	
}


/**
* EDIT V4
*/
if($accion=='editTS') {
	
	if(!$_POST) exit();
					
	# varibles recibidas obligatorias
	$parentInicial 	= $_POST['parentInicial']; 
	$parentPost 	= $_POST['parent'];
	$esdescriptor	= $_POST['esdescriptor'];
	$propiedades	= $_POST['propiedades'];
	$nHijos			= intval($nHijos);

	# required fields
	if(!$parentInicial || !isset($nHijos) || !$esdescriptor) die("TS edit Error: \n few arguments !");
	
	# verificamos que parentPost está bien formado (Evita errores de ts25 por tp25...)
	$parentPost			= Tesauro::prefijoFix2($terminoID, $parentPost);
	$prefijo_compare	= Tesauro::prefijo_compare($terminoID, $parentPost);
	if($prefijo_compare !== true) die("TS Edit Error: \n parentPost invalid! [$terminoID - $parentPost] (equal to self terminoID) \n Use a valid parent.");	
	
	# Imposibilita cambiar a NO descriptor un descriptor con hijos
	if($esdescriptor =='no' && $nHijos>0 ) die(" $no_se_puede_cambiar_a_ND_title ");	
		
	# si el término es ND, forzamos usableIndex = 'no' ...
	if($esdescriptor == 'no') {		
		$usableIndex 	= 'no';
		$esmodelo		= 'no';
	}else{
		$usableIndex 	= $_POST['usableIndex'];
		$esmodelo 		= $_POST['esmodelo'];
	}		
	
	$RecordObj_ts = new RecordObj_ts($terminoID);
	$RecordObj_ts->get_ID(); # Force load					
	$RecordObj_ts->set_parent($parentPost);		
	$RecordObj_ts->set_esmodelo($esmodelo);
	$RecordObj_ts->set_usableIndex($usableIndex);
	
	if(isset($_POST['visible']))		$RecordObj_ts->set_visible($_POST['visible']);
	if(isset($_POST['esdescriptor']))	$RecordObj_ts->set_esdescriptor($_POST['esdescriptor']);
	if(isset($_POST['modelo']))			$RecordObj_ts->set_modelo($_POST['modelo']);	
	if(isset($_POST['traducible']))		$RecordObj_ts->set_traducible($_POST['traducible']);
	if(isset($_POST['propiedades']))	$RecordObj_ts->set_propiedades($_POST['propiedades']);	
	
	# Verificamos si el padre asignado existe. (Antes verificamos el prefijo)
	$RecordObj_ts_parent	= new RecordObj_ts($parentPost);
	$parent_id				= $RecordObj_ts_parent->get_ID();
	
	$prefijo = Tesauro::terminoID2prefix($terminoID);
	if($parent_id> 0 || $parentPost ==  $prefijo .'0') {
		
		# El parent SI existe: Ejecutamos el UPDATE	
		$current_id = $RecordObj_ts->Save();
		
	}else{

		# El parent NO existe: Stop
		die("TS Edit Error: \n Parent: $parentPost  does not exist! \n Use a valid parent.");	
	}		
	

	# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
	$ts_parent = $RecordObj_ts->get_parent();	
	logger::$obj['activity']->log_message(
		'SAVE',
		logger::INFO,
		DEDALO_TESAURO_TIPO,
		null,
		array(	"msg"			=> "Saved term",
				"terminoID"		=> $terminoID,
				"parent"		=> $ts_parent
			)
	);
	
	# Al acabar la secuencia de actualización, recargamos el listado (opener) y cerramos esta ventana flotante		
	# Si llegamos desde el listado plano
	if($from=='flat') {

		$html .= "
			<script type=\"text/javascript\">
				window.opener.location.reload(); 
				window.close();	
			</script>";
		echo $codHeader . $html ;
		exit();
		
	# Caso general (desde listado jerárquico)	
	}else{
		
		$parentPostFix 		= Tesauro::prefijoFix2($terminoID, $parentPost); #die($parentPostFix);			
		$prefijoActual 		= Tesauro::terminoID2prefix($terminoID); #die("$parentPostFix ,$prefijoActual , terminoID: $terminoID");					
		$terminoIDpost		= trim($_REQUEST['terminoID']);		
		
		if($esdescriptor=='no') {
			
			$html .= "
			<script type=\"text/javascript\">					
				window.opener.openDivTrack('$parentPost',1,'$parentPost');
				window.close(); 
			</script>";
		
		# Si ha cambiado el parent		
		}else if($parentPost!=$parentInicial) {
			
			$html .= "
			<script type=\"text/javascript\">
				// metemos en la cookie que abra el nuevo parent y luego recargaremos.
				// Actualiza la nueva ubicación
				window.opener.openDivTrack('$parentPost',1,'$terminoIDpost');
				// Actualiza la antigua ubicación 
				window.opener.openDivTrack('$parentInicial',1,'$terminoIDpost');
				// Cierra la ventana de edición
				window.close(); 
			</script>";
											
		}else{
			
			if ($parentPost == $prefijo.'0') {
				# Reload all page
				$html .= "
				<script type=\"text/javascript\">
					//alert('parentPost:$parentPost - terminoIDpost:$terminoIDpost')
					window.opener.location.reload();
					window.close();	
				</script>";
			}else{
				# Reload only de parent div
				$html .= "
				<script type=\"text/javascript\">
					//alert('parentPost:$parentPost - terminoIDpost:$terminoIDpost')					
					window.opener.openDivTrack('$parentPost',1,'$terminoIDpost');
					window.close();	
				</script>";
			}
			
		}
		
		echo $codHeader . $html ;
		exit();
	}	

}#end EDIT V4





/**
* LISTADOHIJOS : listados (al abrir la flecha,etc..)
*/
if($accion=='listadoHijos') {	

	if(!$terminoID) 	exit("Need more vars: terminoID: $terminoID ");
	
	$parentInicial		= $terminoID ;
	$terminoIDActual	= false ;	#echo "$modo,$type,$ts_lang";
	
	# init tesauro in requested modo
	$ts 				= new Tesauro($modo,$type,$ts_lang);	
	$html 				= $ts->buildTree($parentInicial, $terminoIDActual, $terminoIDresalte); 	
	
	echo $html ;	
	die();
}


/**
* SEARCH : searchTSform : Búsqueda formulario
* Al recibir get accion = "searchTSform", buscamos recursivamente los padres de cada termino coincidente para crear la secuencia de apertura de divs. Guardamos el resultado en la cookie cookieOpenDivs
*/
if($accion=='searchTSform') {
	
	$type = $nombre ;

	# IMPORTANTE : Sólo buscaremos con un tipo seleccionado
	# if(empty($type)) die("Please select type");

	if($termino)		$termino		= addslashes($termino);
	if($def)			$def 			= addslashes($def);
	if($modelo_name)	$modelo_name	= addslashes($modelo_name);

	
	# case only select type
	if( empty($terminoID) && empty($termino) && empty($def) && empty($modelo_name) && strlen($type)>0) {
		$url = DEDALO_LIB_BASE_URL . "/ts/ts_list.php?modo={$modo}&type={$type}";
		header("Location: $url");
		exit();
	}
	
	# case nothing is received
	if(empty($terminoID) && empty($termino) && empty($def) && empty($modelo_name)){
		header("Location: ".DEDALO_LIB_BASE_URL."/ts/ts_list.php?modo={$modo}");
		exit();
	}
	
	$getString		 = "&terminoID=$terminoID&termino=$termino&def=$def&type=$type&modelo_name=$modelo_name";
		#dump($getString,'$getString');
	if($modo)	
	$getString 		.= "&modo=$modo";		#echo " $modo, $ts_lang, $type ";die();
	
	# init tesauro in requested modo
	$ts 			= new Tesauro($modo,$type,$ts_lang);	
	
	$resultArray 	= $ts->searchTSform($terminoID, $termino, $def, $type, $modelo_name);		#print_r($resultArray); die("<HR>V4 searchTSform Stop");
	
	$n				= 0;		if(isset($resultArray['total']))	$n 				= $resultArray['total'];
	$terminoIDlist	= false;	if(isset($resultArray['list']))		$terminoIDlist 	= $resultArray['list'];
	$max			= false;	if(isset($resultArray['max']))		$max		 	= $resultArray['max'];
	
	$t 				= 'form';	
	
	# con la lista de los terminos encontrados, saltamos a la función de buscar sus padres para poder desplegarlos
	#echo searchTSlist($terminoIDlist, $t, $n, $max, $getString);
	
		# HTML
		# cabeceras javascript
		$html  = $codHeader ;
		#$html .= js::build_tag(JQUERY_LIB_URL_JS);
		$html .= js::build_tag(DEDALO_LIB_BASE_URL  . '/common/js/cookies.js');
		$html .= js::build_tag(DEDALO_LIB_BASE_URL 	. '/ts/js/ts_common.js');
		#$html .= js::build_tag(DEDALO_LIB_BASE_URL . '/ts/js/ts_list.js');
		$html .= "<script type=\"text/javascript\">";
		
		$terminosList = $ts->listaDeResultados2cookie($terminoIDlist);		#print_r($terminosList); die("<HR>V4 searchTSform terminosList Stop");		

		$html .= "set_localStorage('cookieOpenDivs','$terminosList',7);"; #die($terminosList);
		
		# eliminamos del url "searchTSlist" (para poder recargar la página sin perder los cambios posteriores)
		# y redireccionamos por javascript a la página general del listado	
		$url   = DEDALO_LIB_BASE_URL . "/ts/ts_list.php?modo=$modo&terminoIDlist=$terminoIDlist&total=$t&n=$n&max=$max&ts_lang={$ts_lang}" . $getString ;
		$html .= "document.location = '$url' ";	
		$html .= "</script>";
	
	print $html ;
	
	exit();

}#end SEARCH












?>