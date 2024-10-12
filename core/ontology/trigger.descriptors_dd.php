<?php
// Turn off output buffering
	ini_set('output_buffering', 'off');

// ontology custom config file
require_once( dirname(__FILE__) .'/config/config_ontology.php' );
// Old lang vars
require_once( dirname(__FILE__) . '/lang/lang_code.php' );



// login check
	$is_logged			= login::is_logged();
	$is_global_admin	= security::is_global_admin(CURRENT_LOGGED_USED_ID);
	if($is_logged!==true || $is_global_admin!==true) {
		$url =  DEDALO_ROOT_WEB;
		header("Location: $url");
		exit();
	}



// set vars
	$vars = [
		'mode',
		'id',
		'terminoID',
		'terminoID_lang',
		'termino',
		'parent',
		'lang',
		'tipo',
		'dato'
	];
	foreach($vars as $name)	$$name = common::setVar($name);



/**
* LOADDESCRIPTORSGRID
* Translations tr AJAX trigger
*/
if($mode==='loadDescriptorsGrid') {

	# Write session to unlock session file
	session_write_close();

	// options
		if(empty($terminoID)) {
			debug_log(__METHOD__." Error: terminoID is mandatory (loadDescriptorsGrid) ".to_string(), logger::ERROR);
			die('Error. terminoID is mandatory');
		}

	$mainLang		= DEDALO_STRUCTURE_LANG;
	$ar_all_langs	= common::get_ar_all_langs_resolved(DEDALO_DATA_LANG);

	$RecordObj_dd	= new RecordObj_dd($terminoID);
	$term			= $RecordObj_dd->get_term() ?? new stdClass();

	foreach ($term as $lang => $termino) {

		// skip already printed main lang
		if ($lang===$mainLang) {
			continue;
		}

		$langFull = lang::get_name_from_code( $lang );

		// include the HTML file here, on each loop iteration (!)
		include dirname(__FILE__) . '/html/dd_descriptors_grid.phtml';
	}

	exit();
}//end if($mode==='loadDescriptorsGrid')



/**
* REMOVEDESCRIPTOR
* Deletes given lang value from jer_dd $term object
*/
if($mode==='removeDescriptor') {

	// options. Check vars
		if(empty($lang)) {
			die('Error. lang is mandatory');
		}
		if(empty($terminoID)) {
			die('Error. terminoID is mandatory');
		}

	// RecordObj_dd
	$RecordObj_dd = new RecordObj_dd($terminoID);

	// term object
	$term = $RecordObj_dd->get_term() ?? new stdClass();

	// update
	if (!property_exists($term, $lang)) {
		exit('ERROR');
	}

	// unset property
	unset($term->{$lang});

	// set
	$RecordObj_dd->set_term($term);

	// save
	$result = $RecordObj_dd->Save();

	// output
	$html = !$result
		? 'ERROR'
		: 'OK';


	exit($html);
}//end removeDescriptor



# NEWDESCRIPTOR
if($mode=='newDescriptor') {

	if(!$lang || !$terminoID) {
		die(" Error. Need more data! lang:$lang ,terminoID:$terminoID ");
	}

	// RecordObj_dd
	$RecordObj_dd = new RecordObj_dd($terminoID);

	// term object
	$term = $RecordObj_dd->get_term() ?? new stdClass();

	// update
	if (!property_exists($term, $lang)) {
		$term->{$lang} = '';
	}

	// set
	$RecordObj_dd->set_term($term);

	// save
	$result = $RecordObj_dd->Save();

	// output
	$html = $result;


	exit($html);
}//end newDescriptor



# EXPORT_ONTOLOGY
if($mode==='export_ontology') {

	// session_write_close();

	if(empty($terminoID)) die(" Error. Need more data! terminoID:$terminoID ");

	// include(dirname(__FILE__) . '/class.ontology.php');

	$response = ontology::export($terminoID);

	echo json_encode($response, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
	exit();
}//end export_ontology



# CODIGOKEYUP
if($mode=='codigoKeyUp') {

	if(!$termino || !$terminoID) die("Need more data! terminoID:$terminoID , termino:$termino ");

	# DESACTIVO (¿Recuperar?)
	exit();
	/*
	$n = Descriptors::descriptorExists($termino,'termino');
	exit("$n");
	*/
}//end codigoKeyUp



# NETWORKTEST
if($mode=='networkTest') {

	exit(' networkTest ok! ');
}//end networkTest
