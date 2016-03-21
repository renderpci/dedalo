<?php
# SYSTEM TEST
# Verifica la integridad del sistema (habitualmente en la secuencia de arranque o login)
# Comprueba la existencia de elementos / directorios / permisos necesarios para ejecutar Dédalo



# PHP VERSION
if (version_compare(PHP_VERSION, '5.4.15', '<'))
	die(" Error. This php version ".PHP_VERSION." is not supported by Dédalo");


# MBSTRING
if (!function_exists('mb_internal_encoding')) {
	die(" Error. mb_internal_encoding is required by Dédalo. Please install php mbstring to continue");
}
 

# BACKUPS
# Target folder exists test	
$folder_path = DEDALO_LIB_BASE_PATH.'/backup/backups';
if( !is_dir($folder_path) ) {
	if(!mkdir($folder_path, 0755,true)) {
		die(" Error on read or create backups directory. Permission denied");
	}
	debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
}

# BACKUP_TEMP
# Target folder exists test	
$folder_path = DEDALO_LIB_BASE_PATH.'/backup/temp';
if( !is_dir($folder_path) ) {
	if(!mkdir($folder_path, 0777,true)) {
		die(" Error on read or create backup temp directory. Permission denied");
	}
	debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
}

# BACKUP USERS DIR
# Target folder exists test	
$folder_path = DEDALO_LIB_BASE_PATH.'/backup/users';
if( !is_dir($folder_path) ) {
	if(!mkdir($folder_path, 0700,true)) {
		die(" Error on read or create backup users directory. Permission denied");
	}
	debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
}

# MEDIA folder
# Target folder exists test	
$folder_path = DEDALO_MEDIA_BASE_PATH;
if( !is_dir($folder_path) ) {
	if(!mkdir($folder_path, 0777,true)) {
		die(" Error on read or create media directory. Permission denied");
	}
	debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
}

# MEDIA QUALITY FOLDERS (Important for ffmpeg conversions)
$ar_folder = (array)unserialize(DEDALO_AV_AR_QUALITY);
foreach ($ar_folder as $quality) {
	$folder_path = DEDALO_MEDIA_BASE_PATH . DEDALO_AV_FOLDER.'/'.$quality;
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, 0777,true)) {
			die(" Error on read or create media quality [$quality] directory. Permission denied");
		}
		debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
	}
}

/*
# MEDIA AV POSTERFRAME
# Target folder exists test	
$folder_path = DEDALO_MEDIA_BASE_PATH .'/'. DEDALO_AV_FOLDER . '/posterframe/deleted';
if( !is_dir($folder_path) ) {
	if(!mkdir($folder_path, 0777,true)) {
		die(" Error on read or create media posterframe deleted directory. Permission denied ");
	}
}
*/


# MEDIA IMAGE
# Target folder exists test
$ar_quality = (array)unserialize(DEDALO_IMAGE_AR_QUALITY);
foreach ($ar_quality as $quality) {
	$folder_path = DEDALO_MEDIA_BASE_PATH . DEDALO_IMAGE_FOLDER . '/'.$quality;
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, 0777,true)) {
			die(" Error on read or create image $quality deleted directory. Permission denied ");
		}
		debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
	}
}


# MEDIA PDF folder
# Target folder exists test
if(defined('DEDALO_PDF_FOLDER')) {
$folder_path = DEDALO_MEDIA_BASE_PATH.DEDALO_PDF_FOLDER.'/'.DEDALO_PDF_QUALITY_DEFAULT;
if( !is_dir($folder_path) ) {
	if(!mkdir($folder_path, 0777,true)) {
		die(" Error on read or create media pdf default directory. Permission denied ");
	}
	debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
}}

# MEDIA HTML FILES folder
# Target folder exists test	
if(defined('DEDALO_HTML_FILES_FOLDER')) {
$folder_path = DEDALO_MEDIA_BASE_PATH.DEDALO_HTML_FILES_FOLDER;
if( !is_dir($folder_path) ) {
	if(!mkdir($folder_path, 0777,true)) {
		die(" Error on read or create media DEDALO_HTML_FILES_FOLDER default directory. Permission denied ");
	}
	debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
}}


# MEDIA WEB IMAGES folder
# Target folder exists test	
if(defined('DEDALO_IMAGE_WEB_FOLDER')) {
$folder_path = DEDALO_MEDIA_BASE_PATH . DEDALO_IMAGE_FOLDER . DEDALO_IMAGE_WEB_FOLDER;
if( !is_dir($folder_path) ) {
	if(!mkdir($folder_path, 0777,true)) {
		die(" Error on read or create media DEDALO_IMAGE_WEB_FOLDER default directory. Permission denied ");
	}
	debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
}}

# MEDIA EXPORT folder
# Target folder exists test	
if(defined('DEDALO_TOOL_EXPORT_FOLDER_PATH')) {
$folder_path = DEDALO_TOOL_EXPORT_FOLDER_PATH;
if( !is_dir($folder_path) ) {
	if(!mkdir($folder_path, 0775,true)) {
		die(" Error on read or create media DEDALO_TOOL_EXPORT_FOLDER_PATH default directory. Permission denied ");
	}
	debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
}}


# LOGS folder
# Target folder exists test	
$folder_path = DEDALO_LOGS_DIR;
if( !is_dir($folder_path) ) {
	if(!mkdir($folder_path, 0777,true)) {
		die(" Error on read or create logs directory. Permission denied");
	}
	debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
}



# IMAGE MAGICK
#exec(MAGICK_PATH. "convert -version", $out, $rcode); // Try to get ImageMagick "convert" program version number.
#if ($rcode!==0) die("Error on system test. ImageMagick lib not found");
$image_magick = trim(shell_exec('type -P '.MAGICK_PATH.'/convert'));
if (empty($image_magick)) {
	die("Error on system test. ImageMagick lib not found");
}

# FFMPEG
$ffmpeg = trim(shell_exec('type -P '.DEDALO_AV_FFMPEG_PATH));
if (empty($ffmpeg)) {
	die("Error on system test. ffmpeg lib not found");
}

# QT-FASTSTART
$qt_faststart = trim(shell_exec('type -P '.DEDALO_AV_FASTSTART_PATH));
if (empty($qt_faststart)) {
	die("Error on system test. qt-faststart lib not found");
}

# FFPROBE
$ffprobe = trim(shell_exec('type -P '.DEDALO_AV_FFPROBE_PATH));
if (empty($ffprobe)) {
	die("Error on system test. ffprobe lib not found");
}

# DEFAULT PROJECT
if (!defined('DEDALO_DEFAULT_PROJECT')) {
    #die("Error Processing Request. Please define DEDALO_DEFAULT_PROJECT");  
    die("Error Processing Request. Please define congif DEDALO_DEFAULT_PROJECT");
}

# CURL
if(!function_exists('curl_init') || !function_exists('curl_version')) {
	die("Error Processing Request. Curl: function 'curl_init' not found. Please review your PHP cofiguration");
}


# Test mcrypt lib
if (!function_exists('mcrypt_encrypt')) {
	die("Error Processing Request: MCRYPT lib is not available");
}

# LANGS JS
# Generate js files with all labels (in not extist current lang file)	
	$folder_path = DEDALO_LIB_BASE_PATH.'/common/js/lang';
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, 0777,true)) {
			die(" Error on read or create js/lang directory. Permission denied");
		}
		debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
	}
	$ar_langs 	 = (array)unserialize(DEDALO_APPLICATION_LANGS);
	foreach ($ar_langs as $lang => $label) {
		$label_path  = '/common/js/lang/' . $lang . '.js';	
		if (!file_exists(DEDALO_LIB_BASE_PATH.$label_path) || (SHOW_DEBUG && strpos(DEDALO_HOST, 'localhost')!==false) ) {		 	
			$ar_label = label::get_ar_label($lang); // Get all properties
				#dump($ar_label, ' ar_label');
			
			file_put_contents( DEDALO_LIB_BASE_PATH.$label_path, 'get_label='.json_encode($ar_label,JSON_UNESCAPED_UNICODE).'');			
			debug_log(__METHOD__." Generated js labels file for lang: $lang - $label_path ".to_string(), logger::DEBUG);			
		}
	}

# SEQUENCES TEST
	require(DEDALO_LIB_BASE_PATH.'/db/class.data_check.php');
	$data_check = new data_check();
	$response 	= $data_check->check_sequences();
	if ($response->result!=true) {
		debug_log(__METHOD__." $response->msg ".to_string(), logger::WARNING);
		if(SHOW_DEBUG) {
			die("Error on ".$response->msg);
		}
	}

# AREA TREE 
area::get_ar_ts_children_all_areas_hierarchized(true);




?>