<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');
require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_ts.php');

if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','terminoID');
	if(is_array($vars)) foreach($vars as $name) {
		$$name = common::setVar($name);
	}

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



# GET TERMINO BY TIPO . RESUELVE EL NOMBRE DEL LENGUAJE A PARTIR DE terminoID . Ex. 'lg-spa' => 'Spanish'
if($mode=='get_termino_by_tipo') {
	
	if(empty($terminoID)) exit(" Error: terminoID is empty ! ");	
	
	$termino = RecordObj_ts::get_termino_by_tipo($terminoID);
	
	echo $termino;
	exit();
}
?>