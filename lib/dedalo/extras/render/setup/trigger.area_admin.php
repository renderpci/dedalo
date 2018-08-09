<?php
require_once( dirname(dirname(dirname(dirname(__FILE__)))) .'/config/config4.php');

# Login check
	if(login::is_logged()!==true || navigator::get_user_id()!=DEDALO_SUPERUSER) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','s');
	foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



/**
* ENCODE_STRING
*/
if($mode=='encode') {

	$key=DEDALO_INFORMACION;
	#$key = DEDALO_INFORMACION;
	#$key = 'InstalacióndeDédalo4BetaParaCiroYsuTesis201402261716';
	#$key = 'InstalacióndeDédalo4BetaPara465aSd9-%2rajoLeriaPaiPortaEVaS2';
	#$key = 'ICUB dedalo4 instalación de prueba';
	#$key = 'InstalacióndeDédalo4Betaparamestres';
	#$key = 'InstalacióndeDédalo4BetaparaMemorialDemocrAtic';
	#$key = 'InstalacióndeDédalo4BetaparaGobirenoDeNavarra';
	#$key = 'InstalacióndeDédalo4BetaparaelIPCEmpia';
	#$key = 'Instalación Demo Dédalo4 en Antropolis "beta2" 14/11/2104';
	#$key = 'Instalación Demo Dédalo4 en Antropolis "beta3" 20/11/2104';
	#$key = 'Instalación de Dédalo4 beta3 para ICUB en Antrtòpolis';
	#$key='la Rana CantoRa baila un baile nUevo +- n`Rño';
	#$key='ICUB dedalo4 instalación de prueba';
	#$key='Instalación de Dédalo 4 Beta para The Mapit Cartografías';
	#$key='Instalación de Dédalo4 para Bilbomática';
	#$key='Dédalo 4. Información de la instalación para MUPREVA: Museu de Prehistòria de València';
	#$key='Instalación de Dédalo4 Beta para Madres e Hijas de la transicion Española';
	#$key='InstalacióndeDédalo4BetaparaMemorialDemocrAtic';
	#$key=' Instalación de Dédalo4 Beta para MemoRia del HamBre !';
	#$key='Instalación de Dédalo4 Beta para Render web 2015';
	#$key='Instalación de Dédalo4 Beta para ecologiahumana - Cristina ...';
	#$key='Instalación para Cord de Dedalo4 beta 4 mayo 2015';
	#$key='Dédalo 4 install version 2015';	// Used to super user: Dedalo4debugChangePsW 
	#$key='Dédalo 4 install version';	// Used to super user: Dedalo4debugChangePsW 
	#$key='Instalación de Dédalo 4 Beta para The Mapit Cartografías';
	#$key = 'Dédalo 4 install version 2016';
	#$key = 'Dédalo 4 CeDis-Freie';
	#$result = dedalo_encryptStringArray ($s, $key);
	$result = dedalo_encrypt_openssl ($s, $key);

	print wrap_pre($result);

	exit();
}



?>