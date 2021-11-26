<?php
// Turn off output buffering
	ini_set('output_buffering', 'off');


// ontology custon config file
include_once( dirname(__FILE__) .'/config/config_ontology.php' );
// Old lang vars
include_once( dirname(__FILE__) . '/lang/lang_code.php' );



// login check
	$is_logged			= login::is_logged();
	$is_global_admin	= security::is_global_admin(CURRENT_LOGGED_USED_ID);
	if($is_logged!==true || $is_global_admin!==true) {
		$url =  DEDALO_ROOT_WEB ."/main/";
		header("Location: $url");
		exit();
	}



// other files to include
	include_once( dirname(__FILE__) .'/class.dd.php');
	include_once( dirname(__FILE__) .'/class.RecordObj_dd_edit.php');



// set vars
	$codHeader = '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />';
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


// json request
	$json	= file_get_contents('php://input');
	$data	= json_decode($json);



// TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
	// common::trigger_manager();
	// function editTS2($json_data) {
	// 	dump($json_data, ' json_data ++ '.to_string());
	// }



/**
* LISTADOHIJOS : listados (al abrir la flecha,etc..)
*/
if(!empty($data) && $data->mode==='listadoHijos') {

	# Write session to unlock session file
	session_write_close();

	$response = new stdClass();
		$response->result	= false;
		$response->msg		= 'Error. Request failed (listadoHijos)';
	
	// data vars
		$terminoID			= $data->terminoID;
		$ts_lang			= $data->ts_lang;
		$modo				= $data->modo;
		$type				= $data->type;
		$terminoIDresalte	= $data->terminoIDresalte ?? null;

	if(!empty($terminoID)) {
	
		$parentInicial		= $terminoID;
		$terminoIDActual	= false;
		
		# init dd in requested modo
		$dd		= new dd($modo, $type, $ts_lang);
		$html	= $dd->buildTree($parentInicial, $terminoIDActual, $terminoIDresalte);
		
		// echo $html;
		$response->result	= $html;
		$response->msg		= 'Ok. Request done (listadoHijos '.$terminoID.')';
	}

	header('Content-Type: application/json');
	echo json_encode($response, JSON_UNESCAPED_UNICODE);

	exit();
}//end listadoHijos



/**
* EDIT_TS
*/
if(!empty($data) && $data->mode==='edit_ts') {

	// Write session to unlock session file
	session_write_close();

	// all ouput will be in json format
	header('Content-Type: application/json');

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed on edit_ts. ';

	$form_data = $data->form_data;

	// terminoID. check valid prefix
		$terminoID	= trim( safe_xss($form_data->terminoID) );
		$prefix		= RecordObj_dd_edit::get_prefix_from_tipo($terminoID);
		if ($prefix===false) {
			$msg .= 'Invalid prefix at terminoID: '.$terminoID;
			trigger_error($msg);
			$response->msg .= $msg;
			echo json_encode($response, JSON_UNESCAPED_UNICODE);
			exit();
		}
		$form_data->prefix = $prefix; // add to use later in js

	// required fields
		$parentInicial	= safe_xss($form_data->parentInicial);
		$parentPost		= safe_xss($form_data->parent);
		$esdescriptor	= safe_xss($form_data->esdescriptor);
		$propiedades	= safe_xss($form_data->propiedades);
		$properties		= safe_xss($form_data->properties);
		$nHijos			= intval($nHijos);

		if(!$parentInicial || !isset($nHijos) || !$esdescriptor || !$terminoID) {
			$response->msg .= "TS edit Error: \n few arguments !";
			echo json_encode($response, JSON_UNESCAPED_UNICODE);
			exit();
		}

	// Imposibilita cambiar a NO descriptor un descriptor con hijos
		if($esdescriptor==='no' && $nHijos>0 ) {
			$response->msg .= $no_se_puede_cambiar_a_ND_title;
			echo json_encode($response, JSON_UNESCAPED_UNICODE);
			exit();
		}

	// si el término es ND, forzamos usableIndex = 'no' ...
		$esmodelo = ($esdescriptor==='no')
			? 'no'
			: safe_xss($form_data->esmodelo);

	// RecordObj_dd
		$RecordObj_dd_edit = new RecordObj_dd_edit($terminoID);
			$RecordObj_dd_edit->get_ID(); # Force load
			$RecordObj_dd_edit->set_parent($parentPost);
			$RecordObj_dd_edit->set_esmodelo($esmodelo);

	// set values
		if(isset($form_data->visible))		$RecordObj_dd_edit->set_visible( safe_xss($form_data->visible) );
		if(isset($form_data->esdescriptor))	$RecordObj_dd_edit->set_esdescriptor( safe_xss($form_data->esdescriptor) );
		if(isset($form_data->modelo))		$RecordObj_dd_edit->set_modelo( safe_xss($form_data->modelo) );
		if(isset($form_data->traducible))	$RecordObj_dd_edit->set_traducible( safe_xss($form_data->traducible) );

		if(isset($form_data->propiedades) || $form_data->propiedades===null) {
			if (json_encode($propiedades)==='{}') {
				$propiedades = null;
			}
			$RecordObj_dd_edit->set_propiedades($propiedades);
		}
		if(isset($form_data->properties) || $form_data->properties===null) {
			if (json_encode($properties)==='{}') {
				$properties = null;
			}
			$RecordObj_dd_edit->set_properties($properties);
		}

	// check assigned parent is valid and really exists
		$RecordObj_dd_edit_parent	= new RecordObj_dd_edit($parentPost);
		$parent_terminoID			= $RecordObj_dd_edit_parent->get_ID();
		if( strlen($parent_terminoID)>=2 || $parentPost==='dd0' ) {

			# El parent SI existe: Ejecutamos el UPDATE
			$current_id = $RecordObj_dd_edit->Save();

		}else{

			# El parent NO existe: Stop
			$response->msg .= "TS Edit Error: \n Parent: '$parentPost' does not exist! \n Use a valid parent.";
			echo json_encode($response, JSON_UNESCAPED_UNICODE);
			exit();
		}

	// JSON Ontology Item save
		$term_id	= $terminoID;
		$json_item	= ontology::tipo_to_json_item($term_id);
		$save_item	= ontology::save_json_ontology_item($term_id, $json_item);	// return object response

	// css structure . For easy css edit, save
		if ( isset($form_data->{MAIN_PROPERTIES_COLUMN}) &&
			 is_object($form_data->{MAIN_PROPERTIES_COLUMN}) &&
			 property_exists($form_data->{MAIN_PROPERTIES_COLUMN}, 'css')
			) {

			debug_log("trigger_dd.edit_ts ->  Processing global structure_css: ".json_encode($form_data->{MAIN_PROPERTIES_COLUMN}), logger::ERROR);
			$result = css::build_structure_css();
		}

	// publication schema (only for model diffusion_element)
		$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($terminoID,true);
		if ($modelo_name==='diffusion_element') {
			if (defined('MYSQL_DEDALO_HOSTNAME_CONN') && defined('MYSQL_DEDALO_USERNAME_CONN') && defined('MYSQL_DEDALO_PASSWORD_CONN')) {
				// Update schema data always
				$publication_schema_result = tool_diffusion::update_publication_schema($terminoID);
				debug_log("trigger_dd.edit_ts -> Processing update_publication_schema: ".to_string($publication_schema_result), logger::DEBUG);
			}
		}


	// all is OK
		$response->result		= true;
		$response->msg			= 'OK. Request done successfully';
		$response->form_data	= $form_data;

	echo json_encode($response, JSON_UNESCAPED_UNICODE);
	exit();
}//end edit_ts



/**
* SAVE_DESCRIPTOR
*/
if(!empty($data) && $data->mode==='save_descriptor') {

	session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed on save_descriptor. ';


	// mandatory vars
		if(empty($data->terminoID)) {
			$response->msg .= " terminoID is mandatory!";
			echo json_encode($response, JSON_UNESCAPED_UNICODE);
			exit();
		}

	// if ($data->tipo==='obs') {

	// 	// (!) disabled. Now save descriptors data is indirect:
	// 	// First data is saved in regular section ontology, and then data is propagated to descriptors_dd from section->post_save_processes
	// 		$matrix_table	= RecordObj_descriptors_dd::$descriptors_matrix_table;
	// 		$RecordObj		= new RecordObj_descriptors_dd($matrix_table, NULL, $data->parent, $data->lang, $data->tipo);
	// 		$RecordObj->set_dato($data->dato);
	// 		$RecordObj->Save();

	// 	$response = null;

	// }else{

		// sync Dédalo ontology records. Returns boolean
			$result = ontology::edit_term((object)[
				'term_id'	=> $data->parent,
				'dato'		=> $data->dato,
				'dato_tipo'	=> $data->tipo,
				'lang'		=> $data->lang
			]);

		$response->result	= $result;
		$response->msg		= ($result===false)
			? 'Error on save descriptor'
			: 'OK. Request done successfully';
		$response->data		= $data;
	// }


	echo json_encode($response, JSON_UNESCAPED_UNICODE);
	exit();
}//end save_descriptor



/**
* INSERTTS
*/
if($accion==='insertTS') {
	$html ='';
	if(!$parent)	exit("Need more vars: parent: $parent ");
	if(!$modo)		exit("Need more vars: modo: $modo ");


	// prefix
		$prefix = RecordObj_dd_edit::get_prefix_from_tipo($parent);
		if (empty($prefix)) {
			exit("Error on insertTS. Prefix not found for parent:$parent)");
		}

	// es modelo
		$esmodelo = ($modo==='modelo_edit')
			? 'si'
			: 'no';

	// norden
		$ar_childrens	= RecordObj_dd::get_ar_childrens($parent);
		$norden			= (int)count($ar_childrens)+1;

	// configure RecordObj_dd
		$RecordObj_dd_edit 	= new RecordObj_dd_edit(NULL,$prefix);
			# Defaults
			$RecordObj_dd_edit->set_esdescriptor('si');
			$RecordObj_dd_edit->set_visible('si');
			$RecordObj_dd_edit->set_parent($parent);
			$RecordObj_dd_edit->set_esmodelo($esmodelo);
			$RecordObj_dd_edit->set_norden($norden);

	// save : After save, we can recover new created terminoID (prefix+autoIncrement)
		$created_id_ts = $RecordObj_dd_edit->Save();

	// terminoID : Seleccionamos el último terminoID recien creado
		$terminoID = $RecordObj_dd_edit->get_terminoID();

		// check valid created terminoID
			if (empty($terminoID) || strlen($terminoID)<3) {
				exit("Error on create new term.");
			}
			if ($terminoID==$parent) {
				exit("Error on insertTS. Created record with same terminoID as parent. Maybe counter is outdated. Please change manually current created term '$terminoID' before continue)");
			}

		// sync Dédalo ontology records
			// ontology::add_term((object)[
			// 	'term_id'	=> $terminoID
			// ]);


	// all is ok. return terminoID string
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


	// Write session to unlock session file
		session_write_close();

	die();
}//end insertTS



/**
* DELETETS
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
}//end deleteTS



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
}//end update_tr_order



/**
* SEARCHTSFORM
* Al recibir get accion = "searchTSform", buscamos recursivamente los padres de cada termino coincidente para crear la secuencia de apertura de divs. Guardamos el resultado en la cookie cookieOpenDivs_dd
*/
if($accion==='searchTSform') {
	
	$type = $nombre ;

	# IMPORTANTE : Sólo buscaremos con un tipo seleccionado
	# if(empty($type)) die("Please select type");

	// terminoID
		if ($terminoID) {
			$terminoID = trim($terminoID);
		}

	// termino
		if($termino) {
			$termino	= trim($termino);
			$termino	= addslashes($termino);
		}

	// def
		if($def) {
			$def = addslashes($def);
		}

	// modelo
		if($modelo) {
			$modelo = trim($modelo);
		}

	
	// case only select type
		if( empty($terminoID) && empty($termino) && empty($def) && empty($modelo) && strlen($type)>0) {
			$url = "dd_list.php?modo={$modo}&type={$type}";
			header("Location: $url");
			exit();
		}
	
	// case nothing is received
		if(empty($terminoID) && empty($termino) && empty($def) && empty($modelo)){
			header("Location: dd_list.php?modo={$modo}");
			exit();
		}
	
	// build getString
		$getString = "&terminoID=$terminoID&termino=$termino&def=$def&type=$type&modelo=$modelo";	
		if($modo) {
			$getString .= "&modo=$modo";
		}	
	
	
	# init dd in requested modo
		$dd = new dd($modo,$type,$ts_lang);	
	
		$resultArray = $dd->searchTSform($terminoID, $termino, $def, $type, $modelo);

		$n = isset($resultArray['total'])
			? $resultArray['total']
			: 0;

		$terminoIDlist = isset($resultArray['list'])
			? $resultArray['list']
			: false;

		$max = isset($resultArray['max'])
			? $resultArray['max']
			: false;

		$t = 'form';
	
	# con la lista de los terminos encontrados, saltamos a la función de buscar sus padres para poder desplegarlos
	#echo searchTSlist($terminoIDlist, $t, $n, $max, $getString);
	
		# HTML
		# cabeceras javascript
		$html  = $codHeader ;
		$html .= js::build_tag('inc/cookies.js');
		$html .= js::build_tag('js/dd_common.js');
		$html .= '<script type="text/javascript">';
		
		$terminosList = $dd->listaDeResultados2cookie($terminoIDlist);		

		$html .= "set_localStorage('cookieOpenDivs_dd','$terminosList',7);";
		
		# eliminamos del url "searchTSlist" (para poder recargar la página sin perder los cambios posteriores)
		# y redireccionamos por javascript a la página general del listado	
		$url   = "dd_list.php?modo={$modo}&terminoIDlist={$terminoIDlist}&total={$t}&n={$n}&max={$max}&ts_lang={$ts_lang}" . $getString ;
		$html .= "document.location = '$url' ";	
		$html .= '</script>';

	# Write session to unlock session file
	session_write_close();
	
	print $html;
	
	exit();
}//end searchTSform


