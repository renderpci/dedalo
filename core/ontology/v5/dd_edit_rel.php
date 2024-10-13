<?php
// ontology custom config file
require_once( dirname(__FILE__) .'/ontology_legacy_setup.php');


/**
* LOGIN
*/
	$is_logged	= login::is_logged();

	if($is_logged!==true) {
		$url =  DEDALO_ROOT_WEB;
		header("Location: $url");
		exit();
	}
	// $permissions = (int)security::get_security_permissions(DEDALO_TESAURO_TIPO, DEDALO_TESAURO_TIPO);
	// if ($permissions<1) {
	// 	$url =  DEDALO_ROOT_WEB;
	// 	header("Location: $url");
	// 	exit();
	// }



require_once(dirname(__FILE__) . '/class.RecordObj_dd_edit.php');
require_once(dirname(__FILE__) . '/class.dd.php');



// set main request vars
	$vars = array('terminoID','terminoID_to_link','terminoID_to_unlink','ts_lang','type','accion');
	foreach($vars as $name)	$$name = common::setVar($name);



// linkTS. Link ts (add termino relacionado)
	if($accion=='linkTS') {

		// verify mandatory vars
			if(!$terminoID || !$terminoID_to_link) {
				exit("$accion Need more vars: terminoID: $terminoID, terminoID_to_link: $terminoID_to_link");
			}

		$RecordObj_dd	= new RecordObj_dd_edit($terminoID);
		$ar_relaciones	= $RecordObj_dd->get_relaciones();

		function in_array_r($needle, $haystack, $strict = true) {
			if(is_array($haystack)) foreach ($haystack as $item) {
				if (($strict ? $item === $needle : $item == $needle) || (is_array($item) && in_array_r($needle, $item, $strict))) {
					return true;
				}
			}
			return false;
		}

		# añadimos al array el nuevo valor
		if( !in_array_r($terminoID_to_link, $ar_relaciones) && $terminoID_to_link!==$terminoID ) {

			// to related term model
				$RecordObj_dd_related	= new RecordObj_dd_edit($terminoID_to_link);
				$modeloID				= $RecordObj_dd_related->get_modelo(); // get modelo term_id like 'dd96'

			// model. Verify is really model
				$RecordObj_dd_model	= new RecordObj_dd_edit($modeloID);
				$esmodelo			= $RecordObj_dd_model->get_esmodelo(); // get 'esmodelo' param value like 'si' / 'no'
				if ($esmodelo!=='si') {
					$msg = 'Error. term '.$modeloID.' is not model. Expected esmodelo value is \'si\' and current is: '.$esmodelo;
					debug_log(__METHOD__." $msg ".to_string(), logger::ERROR);
					exit($msg);
				}

			// new_relation. Relations format is array of objects like: [{"dd91": "mht70"},{"dd94": "rsc852"}]
				$new_relation = (object)[
					$modeloID => $terminoID_to_link
				];

			// add to existing relations
				$ar_relaciones[] = $new_relation;

			// Set whole relations array and save it
				$RecordObj_dd->set_relaciones($ar_relaciones);
				$RecordObj_dd->Save();
		}

		exit();
	}//end if($accion=='linkTS')



// unlinkTS. Delete
	if($accion=='unlinkTS') {

		#$relID	= safe_xss($_REQUEST["relID"]);
		#$ts->deleteTR($relID);

		if(!$terminoID || !$terminoID_to_unlink) exit("$accion Need more vars: terminoID: $terminoID, terminoID_to_unlink: $terminoID_to_unlink");

		/*
		$RecordObj_dd	= new RecordObj_dd_edit($terminoID);
		$ar_relaciones	= $RecordObj_dd->get_relaciones();

		# eliminamos del array el valor recibido
		$ar_final = NULL;
		if(is_array($ar_relaciones)) foreach($ar_relaciones as $key => $ar_values) {

			foreach($ar_values as $modeloID => $terminoID) {

				if($terminoID != $terminoID_to_unlink) $ar_final[] =  array($modeloID => $terminoID);
			}
		}

		# guardamos el resultado
		$RecordObj_dd->set_relaciones($ar_final);
		$RecordObj_dd->Save();
		*/

		$RecordObj_dd	= new RecordObj_dd_edit($terminoID);
		$RecordObj_dd->remove_element_from_ar_terminos_relacionados($terminoID_to_unlink);
		$RecordObj_dd->Save();

		exit();
	}//end if($accion=='unlinkTS')



// LIST
// Búsqueda de descriptores relacionados con el actual
	$ar_terminos_relacionados	= RecordObj_dd_edit::get_ar_terminos_relacionados($terminoID, $cache=false);
	$n_terminos_relacionados	= count($ar_terminos_relacionados);
	if($n_terminos_relacionados > 0) {

		$arTR = array();
		foreach($ar_terminos_relacionados as $ar_terminos) {

			if(is_array($ar_terminos)) foreach($ar_terminos as $terminoID) {

				$arTR['terminoID'][]	= $terminoID ;
				$arTR['termino'][]		= RecordObj_dd_edit::get_termino_by_tipo($terminoID) ;
			}
		}

		# ordenamos alfabéticamente el array obtenido
		asort($arTR['termino']);
	}

	// include page phtml
	$page_html = dirname(__FILE__) . '/html/dd_edit_rel.phtml';
	include $page_html;


