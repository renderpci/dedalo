<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');


if(login::is_logged()!==true) {
	$url =  DEDALO_ROOT_WEB ."/main/";
	header("Location: $url");
	exit();
}


require_once(DEDALO_ROOT .'/Connections/config.php');
require_once(DEDALO_ROOT .'/inc/funciones.php');
require_once(DEDALO_ROOT .'/lang_translate/class.LangTranslate.php');
require_once(DEDALO_LIB_BASE_PATH . '/common/class.navigator.php');
require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_descriptors.php');


# set vars
$vars = array('id','mode','terminoID_lang','terminoID','termino','parent','lang', 'tipo', 'dato');
if(is_array($vars)) foreach($vars as $name)	$$name = setVar($name);


if($mode=='removeDescriptor') {
	
	if(!$id || !$terminoID) die("Need more data! id:$id - terminoID:$terminoID ");
	
	$html = '';
	
	$matrix_table 	= RecordObj_descriptors::get_matrix_table_from_tipo($terminoID);
	$RecordObj		= new RecordObj_descriptors($matrix_table, $id);
	$parent			= $RecordObj->get_parent();
	$termino		= $RecordObj->get_dato();
	$lang			= $RecordObj->get_lang();
		
	$RecordObj->MarkForDeletion();

	# Borramos sus datos accesorios (def)
	$matrix_table	= RecordObj_descriptors::get_matrix_table_from_tipo($terminoID);
	$RecordObj		= new RecordObj_descriptors($matrix_table, NULL, $parent, $lang, $tipo='def');
	$RecordObj->MarkForDeletion();

	# Borramos sus datos accesorios (obs)
	$matrix_table	= RecordObj_descriptors::get_matrix_table_from_tipo($terminoID);
	$RecordObj		= new RecordObj_descriptors($matrix_table, NULL, $parent, $lang, $tipo='obs');
	$RecordObj->MarkForDeletion();
	

	# ACTIVITY LOG

	# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)	
	logger::$obj['activity']->log_message(
		'DELETE',
		logger::INFO,
		DEDALO_TESAURO_TIPO,
		null,
		array(	"msg"				=> "Deleted term",
				"terminoID"			=> $terminoID,
				"parent"			=> $parent,
				"termino"			=> $termino,
				"descriptors_tipo"	=> 'termino',
				"descriptors_id"	=> $id,				
				"descriptors_lang" 	=> $lang
			)
	);
	
	exit($html);
}

if($mode=='newDescriptor') {
	
	if(!$terminoID_lang || !$terminoID) die(" Error. Need more data! terminoID_lang:$terminoID_lang ,terminoID:$terminoID ");	
		
	# Verificamos si ya existe un descriptor con este perfil
	$matrix_table	= RecordObj_descriptors::get_matrix_table_from_tipo($terminoID);
	$RecordObj		= new RecordObj_descriptors($matrix_table, NULL, $parent=$terminoID, $lang=$terminoID_lang, $tipo='termino');
	$id				= $RecordObj->get_ID();
		#dump($id,'id 1 exists');

	if(empty($id)) {

		$matrix_table	= RecordObj_descriptors::get_matrix_table_from_tipo($terminoID);
		$RecordObj		= new RecordObj_descriptors($matrix_table, NULL);
		$RecordObj->set_parent($terminoID);
		$RecordObj->set_tipo('termino');
		$RecordObj->set_lang($terminoID_lang);	
		$RecordObj->Save();
		
		$id			= $RecordObj->get_ID();
			#dump($id,'id 2 created');
	}
	#$html = "lang:$lang - tld:$tld - terminoID:$terminoID - id:$id" ;#$html = var_dump($RecordObj);
	
	$html = $id;
	exit($html);
}

# SAVE DESCRIPTOR
if($mode=='saveDescriptor') {

	if(!$terminoID) die(" Error. Need more data! terminoID:$terminoID ");
	
	$html = NULL;

	$matrix_table	= RecordObj_descriptors::get_matrix_table_from_tipo($terminoID);
	$RecordObj		= new RecordObj_descriptors($matrix_table, NULL, $parent, $lang, $tipo);
	$RecordObj->set_dato($dato);

	$RecordObj->Save();
	
	exit($html);
}

if($mode=='codigoKeyUp') {
	
	if(!$termino || !$terminoID) die("Need more data! terminoID:$terminoID , termino:$termino ");
	
	# DESACTIVO (¿Recuperar?)
	exit();
	/*
	$n = Descriptors::descriptorExists($termino,'termino');	
	exit("$n");
	*/
}

if($mode=='networkTest') {	
	exit(' networkTest ok! ');
}

?>