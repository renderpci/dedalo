<?php
require_once( dirname(dirname(dirname(__FILE__))).'/config/config.php');
# Old lang vars
require_once(DEDALO_CORE_PATH . '/dd/lang/lang_code.php');

/**
* LOGIN
*/
$is_logged	= login::is_logged();
	
if($is_logged!==true) {
	$url =  DEDALO_ROOT_WEB ."/main/";
	header("Location: $url");
	exit();
}
$is_global_admin = component_security_administrator::is_global_admin( $_SESSION['dedalo4']['auth']['user_id'] );
if($is_global_admin!==true) {
	$url =  DEDALO_ROOT_WEB ."/main/";
	header("Location: $url");
	exit();
}

#require_once(DEDALO_CORE_PATH . '/common/class.navigator.php');
require_once(DEDALO_CORE_PATH .'/dd/class.dd.php');
require_once(DEDALO_CORE_PATH .'/dd/class.RecordObj_dd_edit.php');
/*
*	TS_CLASS_ACTIONS
*	ACCIONES SOBRE EL DD
*/
#require_once(DEDALO_ROOT .'/inc/funciones.php');


$codHeader = '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />';

# set vars
$vars = array(
	'accion',
	'terminoID',
	'parent',
	'termino',
	'terminoIDlist',
	'terminoIDresalte',
	'modo',
	'type',
	'tabla',
	'id',
	'ts_lang',
	'lang2load',
	'terminoID_to_link',
	'dato',
	'def',
	'nombre',
	'modelo',
	'nHijos'
);
foreach($vars as $name)	$$name = common::setVar($name);



/**
* SHOW_INDEXATIONS : diffusion_index_ts
*//*
if($accion==='show_indexations') {

	# DATA VERIFY
	if(empty($terminoID) || strlen($terminoID)<3) exit("Trigger Error: terminoID is mandatory");	

	# DIFFUSION_INDEX_TS
	$diffusion_index_ts = new diffusion_index_ts($terminoID);
	$html 				= $diffusion_index_ts->get_html();
		#dump($html,'$html');

	exit($html);

}#end show_indexations
*/


/**
* INSERTTS 
*/
if($accion==='insertTS') {
	$html ='';
	if(!$parent)	exit("Need more vars: parent: $parent ");
	if(!$modo)		exit("Need more vars: modo: $modo ");

		
	$prefijo 	= RecordObj_dd_edit::get_prefix_from_tipo($parent); #substr($parent,0,2);
	if (empty($prefijo)) {
		exit("Error on insertTS. Prefix not found for parent:$parent)");
	}

	$esmodelo = 'no';
	if($modo==='modelo_edit') $esmodelo	= 'si';

	
	$ar_childrens 	= RecordObj_dd::get_ar_childrens($parent);
	$norden 		= (int)count($ar_childrens)+1; #error_log("norden: $norden");
	
	$RecordObj_dd_edit 	= new RecordObj_dd_edit(NULL,$prefijo);	
		# Defaults
		$RecordObj_dd_edit->set_esdescriptor('si');
		$RecordObj_dd_edit->set_visible('si');	
		$RecordObj_dd_edit->set_parent($parent);
		$RecordObj_dd_edit->set_esmodelo($esmodelo);
		$RecordObj_dd_edit->set_norden($norden);
		#$RecordObj_dd_edit->set_usableIndex('si');

		#dump($RecordObj_dd_edit, ' RecordObj_dd_edit ++ '.to_string()); exit();
	
	# SAVE : After save, we can recover new created terminoID (prefix+autoIncrement)
	$created_id_ts = $RecordObj_dd_edit->Save();
		#dump($created_id_ts,'created_id_ts'," "); die();
	
	# TERMINOID : Seleccionamos el último terminoID recien creado
	$terminoID	= $RecordObj_dd_edit->get_terminoID();
		#dump($RecordObj_dd_edit,"RecordObj_dd_edit new obj created terminoID:$terminoID, id:$created_id_ts "); die( );	

	if ($terminoID==$parent) {
		exit("Error on insertTS. Created record with same terminoID as parent. Maybe counter is outdated. Please change manually current created term '$terminoID' before continue)");
	}
	
	if( $terminoID && strlen($terminoID)>2 ) {
		
		echo (string)$terminoID;
		
		/*
		# DESCRIPTORS : finally we create one record in descriptors with this main info 
		# Usaremos como lenguaje de creación, el lenguaje principal de la jerarquía actual. 
		# (Ej. para 'je_dd', 'lg-spa' , definido en la tabla 'jerarquia')
		$lang = 'lg-spa';	#Jerarquia::get_mainLang($terminoID);			

		$matrix_table				= RecordObj_descriptors_dd::$descriptors_matrix_table;
		$RecordObj_descriptors_dd	= new RecordObj_descriptors_dd($matrix_table, NULL, $terminoID, $lang);
		$RecordObj_descriptors_dd->set_tipo('termino');
		$RecordObj_descriptors_dd->set_parent($terminoID);
		$RecordObj_descriptors_dd->set_lang($lang);
		$created_id_descriptors	= $RecordObj_descriptors_dd->Save();		
		*/
		
		# TREE : Reload only partial
		/*
		$RecordObj_dd_edit 	= new RecordObj_dd_edit( $terminoID );
		$parentPost 		= $RecordObj_dd_edit->get_parent();
		$terminoIDpost 		= $parent;		
		$divName 			= 'divCont'.$parent;

		$html .= $codHeader ;
		$html .= "<script type=\"text/javascript\">
					try{
						document.getElementById('$divName').innerHTML += '<div id=\"ok_msg\" class=\"ok\"> Created $terminoID ok ! </div>';
						dd.openTSedit('$terminoID','$parent');	
						setTimeout(function(){
							window.openDivTrack('$parentPost',1,'$terminoIDpost');
							var msg = document.getElementById('ok_msg');
							if (msg) { msg.parentNode.removeChild(msg); }
						},1500);
					}catch(err){ 
						alert(err)
					}
				</script>";
		
		echo $html ;
		*/

		


	}else{
		echo "Error on create new term.";
	}
	
	# Write session to unlock session file
	session_write_close();

	die();	
}




/**
* UPDATE_TR_ORDER
*/
if($accion==='update_tr_order') {

	if(empty($terminoID))	exit("Need more vars: terminoID");
	if(empty($dato))		exit("Need more vars: dato");

	$html='';	
		
	$RecordObj_dd_edit 	= new RecordObj_dd_edit($terminoID);
	
	# Force load data
	$parent = $RecordObj_dd_edit->get_parent();

	$RecordObj_dd_edit->set_relaciones($dato);			
	
	# SAVE 
	$RecordObj_dd_edit->Save();				
		#dump($RecordObj_dd_edit,'$RecordObj_dd_edit'); #die();

	$html = 'ok';

	echo $html;

	# Write session to unlock session file
	session_write_close();	

	exit();
}




/**
* SAVEDESCRIPTORFROMLIST : Inline edit in tree
*/
if($accion==='saveDescriptorFromList') {
	
	if(!$terminoID || strlen($terminoID)<2) die("Need more data! (terminoID) ");

	# Write session to unlock session file
	# session_write_close();
	
	
	$html='';

	$lang = $ts_lang;

	if(empty($lang) || strlen($lang)<3) {
		$lang = 'lg-spa';	# Fixed main lang for dd structure
	}
	
	$parent = $terminoID;

	debug_log(__METHOD__." lang ".to_string($lang), logger::DEBUG);	

	$matrix_table				= RecordObj_descriptors_dd::$descriptors_matrix_table;
	$RecordObj_descriptors_dd	= new RecordObj_descriptors_dd($matrix_table, null, $parent, $lang, $tipo='termino');
	$RecordObj_descriptors_dd->set_dato($termino);
	$RecordObj_descriptors_dd->Save();
	
	$html .= " Saved! ";

	echo $html;
	
	exit();
}



/**
* DELETE V4 Beta3
*/
if($accion==='deleteTS') {
	
	if(!$terminoID) exit("Need more vars: terminoID: $terminoID ");	
	
	
	$html='';
	
	if(!$modo) $modo = 'tesauro_list';
	
	# init tesauro in requested modo
	#$ts 		= new dd($modo,$type,$ts_lang);
	
	$termino	= RecordObj_dd_edit::get_termino_by_tipo($terminoID);
	$divName 	= "divCont$terminoID";

	
		# HIJOS . Verificamos si tiene hijos (aunque el javascript debe haber evitado llegar aquí.)				
			$RecordObj_dd_edit	= new RecordObj_dd_edit($terminoID);
			$n_hijos 			= $RecordObj_dd_edit->get_n_hijos();
			if( $n_hijos >0 )	die("<div class=\"error\"> $el_descriptor_tiene_hijos_title.<br> $para_eliminar_una_rama_title  $renderBtnVolver</div>");				
				
		# RELACIONES . Si tiene relaciones, las eliminamos para no dejar rastro			
			$arguments=array();			
			$arguments['strPrimaryKeyName']	= 'terminoID';
			$arguments['sql_code']			= opTextSearch($campo='relaciones',$string="%\"$terminoID\"%",$boolean=2);
			$prefijo = RecordObj_dd_edit::get_prefix_from_tipo($terminoID);
			$RecordObj_dd_edit				= new RecordObj_dd_edit(NULL, $prefijo);
			$ar_id							= $RecordObj_dd_edit->search($arguments);				
			
			if(count($ar_id)>0) foreach($ar_id as $terminoID_rel) {
					
				$RecordObj_dd_edit2 = new RecordObj_dd_edit($terminoID_rel);	
				$RecordObj_dd_edit2->remove_element_from_ar_terminos_relacionados($terminoID);
				$RecordObj_dd_edit2->Save();														
			}
				
	dump($ar_id," ar_id - terminoID:$terminoID");die();					
				
		# MODELO . Verificamos que nadie lo usa como modelo
			/*
			$prefijo 		= RecordObj_dd_edit::get_prefix_from_tipo($terminoID);
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
			#$arguments['terminoID']	= 'strPrimaryKeyName';
			$arguments['modelo']		= $terminoID;
			$prefijo = RecordObj_dd_edit::get_prefix_from_tipo($terminoID);
			$RecordObj_dd_edit				= new RecordObj_dd_edit(NULL, $prefijo);
			$ar_id						= $RecordObj_dd_edit->search($arguments);
			
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
			$RecordObj_dd_main	= new RecordObj_dd_edit($terminoID);
			$RecordObj_dd_main->MarkForDeletion();
			$ts_parent = $RecordObj_dd_main->get_parent();			
			
			$ID 				= $RecordObj_dd_main->get_ID();		
			$blForDeletion		= $RecordObj_dd_main->get_blForDeletion();	#echo "<pre> terminoID: $terminoID  - ID: $ID -  blForDeletion:"; var_dump($blForDeletion); echo "<hr>"; var_dump($RecordObj_dd_main);	exit("</pre> stop");				
	
	
		# DESCRIPTORS : finally delete all records in descriptors with this terminoID
			$all_descriptors_by_tipo 		= RecordObj_descriptors_dd::get_all_descriptors_by_tipo($terminoID); 
			$all_descriptors_langs_by_tipo 	= RecordObj_descriptors_dd::get_all_descriptors_langs_by_tipo($terminoID); 
			RecordObj_descriptors_dd::delete_all_descriptors_by_tipo($terminoID);
		
	
		# Ajax function 'delete_term' EN 'ts_list.js'
		$html = 'ok_tree';	
	
	echo $html;

	# Write session to unlock session file
	session_write_close();

	exit();	
}


/**
* EDIT V4 beta3
*/
if($accion==='editTS') {
	
	if(!$_POST) exit();
					
	# varibles recibidas obligatorias
	$parentInicial 	= safe_xss($_POST['parentInicial']);
	$parentPost 	= safe_xss($_POST['parent']);
	$esdescriptor	= safe_xss($_POST['esdescriptor']);
	$propiedades	= safe_xss($_POST['propiedades']);
	$nHijos			= intval($nHijos);

	# required fields
	if(!$parentInicial || !isset($nHijos) || !$esdescriptor || !$terminoID) die("TS edit Error: \n few arguments !");
	
	# verificamos que parentPost está bien formado (Evita errores de ts25 por tp25...)
	# $parentPost		= dd::prefijoFix2($terminoID, $parentPost);
	#$prefijo_compare	= RecordObj_dd::prefix_compare($terminoID, $parentPost);
	#if($prefijo_compare !== true) die("TS Edit Error: \n parentPost invalid! [$terminoID - $parentPost] (equal to self terminoID) \n Use a valid parent.");	
	
	# Imposibilita cambiar a NO descriptor un descriptor con hijos
	if($esdescriptor==='no' && $nHijos>0 ) die(" $no_se_puede_cambiar_a_ND_title ");	
		
	# si el término es ND, forzamos usableIndex = 'no' ...
	if($esdescriptor==='no') {		
		#$usableIndex 	= 'no';
		$esmodelo		= 'no';
	}else{
		#$usableIndex 	= safe_xss($_POST['usableIndex']);
		$esmodelo 		= safe_xss($_POST['esmodelo']);
	}		
	
	$RecordObj_dd_edit = new RecordObj_dd_edit($terminoID);
	$RecordObj_dd_edit->get_ID(); # Force load					
	$RecordObj_dd_edit->set_parent($parentPost);		
	$RecordObj_dd_edit->set_esmodelo($esmodelo);
	#$RecordObj_dd_edit->set_usableIndex($usableIndex);
	
	if(isset($_POST['visible']))		$RecordObj_dd_edit->set_visible( safe_xss($_POST['visible']) );
	if(isset($_POST['esdescriptor']))	$RecordObj_dd_edit->set_esdescriptor( safe_xss($_POST['esdescriptor']) );
	if(isset($_POST['modelo']))			$RecordObj_dd_edit->set_modelo( safe_xss($_POST['modelo']) );	
	if(isset($_POST['traducible']))		$RecordObj_dd_edit->set_traducible( safe_xss($_POST['traducible']) );
	if(isset($_POST['propiedades']) && $_POST['propiedades']!=='{}')	$RecordObj_dd_edit->set_propiedades( safe_xss($_POST['propiedades']) );	
	
	# Verificamos si el padre asignado existe. (Antes verificamos el prefijo)
	$RecordObj_dd_edit_parent	= new RecordObj_dd_edit($parentPost);
	$parent_terminoID			= $RecordObj_dd_edit_parent->get_ID();
	
	#$prefijo = dd::terminoID2prefix($terminoID);
	$prefijo = RecordObj_dd_edit::get_prefix_from_tipo($terminoID);
	if( strlen($parent_terminoID)>=2 || $parentPost==='dd0' ) {
		
		# El parent SI existe: Ejecutamos el UPDATE	
		$current_id = $RecordObj_dd_edit->Save();
		
	}else{

		# El parent NO existe: Stop
		die("TS Edit Error: \n Parent: $parentPost  does not exist! \n Use a valid parent.");	
	}


	#
	# CSS STRUCTURE . For easy css edit, save 
	if (isset($_POST['propiedades']) && strpos($_POST['propiedades'], '"css"')!==false) {
		debug_log("trigger_dd.editTS ->  Processing global structure_css: ".to_string( safe_xss($_POST['propiedades']) ), logger::DEBUG);
		$result = css::build_structure_css();
	}


	#
	# PUBLICATION SCHEMA
	$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($terminoID,true);
	if ($modelo_name==='diffusion_element') {
		if (defined('MYSQL_DEDALO_HOSTNAME_CONN') && defined('MYSQL_DEDALO_USERNAME_CONN') && defined('MYSQL_DEDALO_PASSWORD_CONN')) {			
			// Update schema data always		
			$publication_schema_result = tool_diffusion::update_publication_schema($terminoID);
			debug_log("trigger_dd.editTS -> Processing update_publication_schema: ".to_string($publication_schema_result), logger::DEBUG);
		}
	}
	
	
	# Al acabar la secuencia de actualización, recargamos el listado (opener) y cerramos esta ventana flotante		
	# Si llegamos desde el listado plano
	if($from==='flat') {

		$html .= "
			<script type=\"text/javascript\">
				window.opener.location.reload(); 
				window.close();	
			</script>";
		echo $codHeader . $html ;
		exit();
		
	# Caso general (desde listado jerárquico)	
	}else{
		
		#$parentPostFix 	= dd::prefijoFix2($terminoID, $parentPost); #die($parentPostFix);			
		$prefijoActual 		= RecordObj_dd_edit::get_prefix_from_tipo($terminoID);
		$terminoIDpost		= trim( safe_xss($_REQUEST['terminoID']) );		
		
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
		
		echo $codHeader . $html;

		# Write session to unlock session file
		session_write_close();
		
		exit();
	}	

}#end EDIT V4





/**
* LISTADOHIJOS : listados (al abrir la flecha,etc..)
*/
if($accion==='listadoHijos') {

	if(!$terminoID) 	exit("Need more vars: terminoID: $terminoID ");
	
	$parentInicial		= $terminoID ;
	$terminoIDActual	= false ;	#echo "$modo,$type,$ts_lang";
	
	# init dd in requested modo
	$dd 				= new dd($modo,$type,$ts_lang);	
	$html 				= $dd->buildTree($parentInicial, $terminoIDActual, $terminoIDresalte); 	
	
	echo $html;

	# Write session to unlock session file
	session_write_close();

	die();
}


/**
* SEARCH : searchTSform : Búsqueda formulario
* Al recibir get accion = "searchTSform", buscamos recursivamente los padres de cada termino coincidente para crear la secuencia de apertura de divs. Guardamos el resultado en la cookie cookieOpenDivs_dd
*/
if($accion==='searchTSform') {
	
	$type = $nombre ;

	# IMPORTANTE : Sólo buscaremos con un tipo seleccionado
	# if(empty($type)) die("Please select type");

	if ($terminoID) {
		$terminoID = trim($terminoID);
	}
	if($termino) {
		$termino	= trim($termino);
		$termino	= addslashes($termino);
	}
	if($def)			$def 		= addslashes($def);
	if($modelo)			$modelo		= trim($modelo);

	
	# case only select type
	if( empty($terminoID) && empty($termino) && empty($def) && empty($modelo) && strlen($type)>0) {
		$url = DEDALO_CORE_URL . "/dd/dd_list.php?modo={$modo}&type={$type}";
		header("Location: $url");
		exit();
	}
	
	# case nothing is received
	if(empty($terminoID) && empty($termino) && empty($def) && empty($modelo)){
		header("Location: ".DEDALO_CORE_URL."/dd/dd_list.php?modo={$modo}");
		exit();
	}
	
	$getString		 = "&terminoID=$terminoID&termino=$termino&def=$def&type=$type&modelo=$modelo";
	
	if($modo)	
	$getString 		.= "&modo=$modo";
	
	# init dd in requested modo
	$dd 			= new dd($modo,$type,$ts_lang);	
	
	$resultArray 	= $dd->searchTSform($terminoID, $termino, $def, $type, $modelo);
	
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
		$html .= js::build_tag(DEDALO_CORE_URL  . '/common/js/cookies.js');
		$html .= js::build_tag(DEDALO_CORE_URL 	. '/dd/js/dd_common.js');
		#$html .= js::build_tag(DEDALO_CORE_URL . '/ts/js/ts_list.js');
		$html .= "<script type=\"text/javascript\">";
		
		$terminosList = $dd->listaDeResultados2cookie($terminoIDlist);		#print_r($terminosList); die("<HR>V4 searchTSform terminosList Stop");		

		$html .= "set_localStorage('cookieOpenDivs_dd','$terminosList',7);"; #die($terminosList);
		
		# eliminamos del url "searchTSlist" (para poder recargar la página sin perder los cambios posteriores)
		# y redireccionamos por javascript a la página general del listado	
		$url   = DEDALO_CORE_URL . "/dd/dd_list.php?modo=$modo&terminoIDlist=$terminoIDlist&total=$t&n=$n&max=$max&ts_lang={$ts_lang}" . $getString ;
		$html .= "document.location = '$url' ";	
		$html .= "</script>";

	# Write session to unlock session file
	session_write_close();
	
	print $html;
	
	exit();
}//end SEARCH


