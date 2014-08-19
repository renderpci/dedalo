<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');

# Login check
	if(login::is_logged()!==true || navigator::get_userID_matrix()!=DEDALO_SUPERUSER) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','s');
	if(is_array($vars)) foreach($vars as $name) {
		$$name = common::setVar($name);
	}

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



/**
* ENCODE_STRING
*/
if($mode=='encode') {

	#$key = DEDALO_INFORMACION;
	#$key = 'InstalacióndeDédalo4BetaParaCiroYsuTesis201402261716';
	#$key = 'InstalacióndeDédalo4BetaPara465aSd9-%2rajoLeriaPaiPortaEVaS2';
	#$key = 'ICUB dedalo4 instalación de prueba';
	#$key = 'InstalacióndeDédalo4Betaparamestres';
	#$key = 'InstalacióndeDédalo4BetaparaMemorialDemocrAtic';
	#$key = 'InstalacióndeDédalo4BetaparaGobirenoDeNavarra';
	#$key = 'InstalacióndeDédalo4BetaparaelIPCEmpia';
	$key = 'InstalacióndeDédalo4BetaparaelJCCM_a';
	
	$result = dedalo_encryptStringArray ($s, $key);

	print wrap_pre($result);

	exit();
}







?>