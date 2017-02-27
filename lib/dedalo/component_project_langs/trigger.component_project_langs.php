<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');
#require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_dd.php');

if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','terminoID');
	foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



# GET TERMINO BY TIPO . RESUELVE EL NOMBRE DEL LENGUAJE A PARTIR DE terminoID . Ex. 'lg-spa' => 'Spanish'
if($mode=='get_termino_by_tipo') {
	
	if(empty($terminoID)) exit(" Error: terminoID is empty ! ");	
	
	#$termino = RecordObj_dd::get_termino_by_tipo($terminoID);
	$termino = lang::get_name_from_code( $terminoID, DEDALO_DATA_LANG );
	
	echo $termino;
	exit();
}
?>