<?php 

	#require_once( dirname(dirname(__FILE__)) .'/lib/dedalo/config/config4.php');
	
	
	# Zona horaria (for backups archive names)
	#$myDateTimeZone = 'Europe/Madrid';	date_default_timezone_set($myDateTimeZone);
	
	#if(!defined('USRID')) 	define('USRID', 1 );
	#if(!defined('NIVEL')) 	define('NIVEL', 10 );
	
	#$codHeader = '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />';
	
	# version
	#require_once(DEDALO_ROOT.'/control/version.php');	
	#$version 	= VERSION ;	
	
	#$host 		= $_SERVER['HTTP_HOST'];	


# CONFIGURACIÓN GENERAL

	
	
	# Idioma
	$lang_default 	= 'en';
	require_once(DEDALO_ROOT.'/Connections/lang_code.php');	

	# WEB SERVER

	# Path o camino local completo del direcorio de Dédalo ( tipo $rootFolder . '/dedalo/'  )
	#$directorio 			= DEDALO_ROOT ;

	# Url completa al site Dédalo (tipo 'http://' . $host . '/dedalo/' )
	#$baseURL 				= 'http://' . $host . '/dedalo/' ;

	# Directorio de imagenes
	#$patImages 				= '../info_memorial/media_foto/' ; #$patImages = '../../mo/media_foto/' ; $patImages = '../../memorial/media_foto_temp/' ;

	# Directorio de pdfs (Actas de cesión ...)
	#$patPdfs 				= '../media_pdf/' ;

		
	
	# Nombre de la página
	#$pagTitle 				= "4 Dédalo Platform $version $host";	# Título de la página a mostrar en la parte superior del navegador <---
	#$idSite 				= "dedalo4_development";							# Identificador del site (particularidades)  Activa el info específico si está definido. ej. mo
	
	# Cabecera de la página
	#$logoPath 				= "../images/logos/logoDedalo4.png";	# Logo Cabecera Izq. por defecto el de dédalo: ../images/logoDedalo.png <---
	#$rotuloPath 			= "../images/cabeceraRotulo.png";	# Rótulo Cabecera. por defecto el de dédalo: ../images/cabeceraRotulo.png <---
		
	
		
	# addslashes en texto tr transcripción
	#$tr_addslashes			= 1 ;								# Por defecto escapamos siempre el string del texto de la transcripción (tr)
	#if(get_magic_quotes_gpc()) $tr_addslashes = 0 ;				# Si está activado magic_quotes_gpc obviamos addslashes al texto para evitar duplicar los escapes \\

	
	# ERROR : report de errores (debug only)
	#if(defined('USRID') && USRID==1 && defined('NIVEL') && NIVEL==10) {
		
		#error_reporting(E_ALL);
		#ini_set('display_errors', '1');
	#}	
	

	# Hostname resolution in ACT  (0 o 1)
	#$resolveHost = 0 ;
	
	# Preferencia de copias de seguridad
	# Intervalo temporal mínimo transcurrido para efectuar una copia de seguridad 
	# 0 = un dia
	# 1 = una hora
	# 2 = un minuto
	#$bkIntervalMinim = 0 ;
	

	# Set duration max of session data in seconds (default 18000 equ. to 5 hours)
	#ini_set("session.gc_maxlifetime", (3660*24)); #in secs
	#session_cache_expire(300); #in minues


	# etiquetas propietarias de este site
	#require_once(DEDALO_ROOT . '/Connections/labels.php');

	# geo-ip tool
	#$geoiptoolURL 	= "http://whatismyipaddress.com/ip/"; #'http://geotool.flagfox.net/?lang=es-ES&ip=',"http://www.geoiptool.com/es/?IP="
	#$geoip_mm_mode	= 'city';

	# ficheros de lenguajes oficiales
	#$oficialLangsArray 		= array('es.php','va.php','en.php', 'ca.php');
	
	#
	# TRANSLATOR
	#$config['translator_url'] = 'http://babel.antropolis.net/babel_engine/';	# default Babel: http://babel.antropolis.net/babel_engine/
	
	
		
	
?>