<?php
# SYSTEM TEST
# Verifica la integridad del sistema (habitualmente en la secuencia de arranque o login)
# Comprueba la existencia de elementos / directorios / permisos necesarios para ejecutar Dédalo

# PHP VERSION
if (version_compare(PHP_VERSION, '5.4.15', '<'))
	throw new Exception(" Error. This php version ".PHP_VERSION." is not supported by Dédalo");

# BACKUPS
# Target folder exists test	
$folder_path = DEDALO_LIB_BASE_PATH.'/backup/backups';
if( !is_dir($folder_path) ) {
	if(!mkdir($folder_path, 0755,true)) {
		throw new Exception(" Error on read or create backups directory. Permission denied");
	}
}

# BACKUP_TEMP
# Target folder exists test	
$folder_path = DEDALO_LIB_BASE_PATH.'/backup/temp';
if( !is_dir($folder_path) ) {
	if(!mkdir($folder_path, 0777,true)) {
		throw new Exception(" Error on read or create backup temp directory. Permission denied");
	}
}

# MEDIA folder
# Target folder exists test	
$folder_path = DEDALO_MEDIA_BASE_PATH;
if( !is_dir($folder_path) ) {
	if(!mkdir($folder_path, 0777,true)) {
		throw new Exception(" Error on read or create media directory. Permission denied ");
	}
}

# MEDIA PDF folder
# Target folder exists test	
$folder_path = DEDALO_MEDIA_BASE_PATH.DEDALO_PDF_FOLDER.'/'.DEDALO_PDF_QUALITY_DEFAULT;
if( !is_dir($folder_path) ) {
	if(!mkdir($folder_path, 0777,true)) {
		throw new Exception(" Error on read or create media pdf default directory. Permission denied ");
	}
}

# MEDIA HTML FILES folder
# Target folder exists test	
if(defined('DEDALO_HTML_FILES_FOLDER')) {
$folder_path = DEDALO_MEDIA_BASE_PATH.DEDALO_HTML_FILES_FOLDER;
if( !is_dir($folder_path) ) {
	if(!mkdir($folder_path, 0777,true)) {
		throw new Exception(" Error on read or create media DEDALO_HTML_FILES_FOLDER default directory. Permission denied ");
	}
}	
}


# LOGS folder
# Target folder exists test	
$folder_path = DEDALO_LOGS_DIR;
if( !is_dir($folder_path) ) {
	if(!mkdir($folder_path, 0777,true)) {
		throw new Exception(" Error on read or create logs directory. Permission denied");
	}
}


# DEDALO_IMAGE_THUMB_DEFAULT
# Target folder exists test	
$folder_path = DEDALO_MEDIA_BASE_PATH.DEDALO_IMAGE_FOLDER.'/'.DEDALO_IMAGE_THUMB_DEFAULT;
if( !is_dir($folder_path) ) {
	if(!mkdir($folder_path, 0777,true)) {
		throw new Exception(" Error on read or create thumbs directory. Permission denied");
	}
}

# IMAGE MAGICK
exec(MAGICK_PATH. "convert -version", $out, $rcode); // Try to get ImageMagick "convert" program version number.
if ($rcode!==0) throw new Exception("Error on system test. ImageMagick lib not found", 1);


# FFMPEG
#$ffmpeg = trim(shell_exec('type -P ffmpeg'));
#if (empty($ffmpeg)) throw new Exception("Error on system test. ffmpeg lib not found", 1);
exec(DEDALO_AV_FFMPEG_PATH. " ", $ffmpeg_output, $ffmpeg_codigo); // Try to get ffmpeg "convert" program version number.
if ($ffmpeg_codigo==127) {
	#dump($ffmpeg_output,' ffmpeg_output '.DEDALO_AV_FFMPEG_PATH);
	#dump($ffmpeg_codigo,' ffmpeg_codigo '.DEDALO_AV_FFMPEG_PATH);
	throw new Exception("Error on system test. ffmpeg lib not found", 1);
}


# QT-FASTSTART
#$ffmpeg = trim(shell_exec('type -P qt-faststart'));
#if (empty($ffmpeg)) throw new Exception("Error on system test. qt-faststart lib not found", 1);
exec(DEDALO_AV_FASTSTART_PATH. " ", $faststart_output, $faststart_codigo); // Try to get faststart "convert" program version number.
if ($faststart_codigo==127) {
	#dump($faststart_output,' faststart_output '.DEDALO_AV_FASTSTART_PATH);
	#dump($faststart_codigo,' faststart_codigo '.DEDALO_AV_FASTSTART_PATH);
	throw new Exception("Error on system test. faststart lib not found", 1);
}



# DEFAULT PROJECT
if (!defined('DEFAULT_PROJECT')) {
    #throw new Exception("Error Processing Request. Please define DEFAULT_PROJECT", 1);  
    die("Error Processing Request. Please define congif DEFAULT_PROJECT");
}

# CURL
if(!function_exists('curl_init') || !function_exists('curl_version')) {
	die("Error Processing Request. Curl: function 'curl_init' not found. Please review your PHP cofiguration");
}









?>