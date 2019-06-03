<?php
# CONFIG
include(dirname(dirname(dirname(__FILE__))) . '/config/config4.php');
/*
$page_globals = new stdClass();
	# version
	$page_globals->dedalo_version = DEDALO_VERSION;
	# lang
	$page_globals->dedalo_application_lang 	= DEDALO_APPLICATION_LANG;
	$page_globals->dedalo_data_lang 		= DEDALO_DATA_LANG;
	$page_globals->dedalo_data_nolan 		= DEDALO_DATA_NOLAN;
	# parent
	$page_globals->_parent 		= isset($parent) ? (int)$parent : "";
	# tipos
	$page_globals->tipo 		= $tipo;
	$page_globals->section_tipo = defined('SECTION_TIPO') ? SECTION_TIPO : null;
	# top
	$page_globals->top_tipo 	= TOP_TIPO;
	$page_globals->top_id 		= TOP_ID;
	# modo
	$page_globals->modo 		= $modo;
	# caller_tipo
	$page_globals->caller_tipo 	= $caller_tipo;
	# context_name
	$page_globals->context_name = $context_name;
	# tag_id
	$page_globals->tag_id 		= isset($_REQUEST["tag_id"]) ? safe_xss($_REQUEST["tag_id"]) : "";
	# user_id
	$page_globals->user_id 		= isset($user_id) ? $user_id : null;
	# username
	$page_globals->username 	= isset($username) ? $username : null;
	# full_username
	$page_globals->full_username= isset($full_username) ? $full_username : null;
	# is_global_admin
	$page_globals->is_global_admin = (bool)$is_global_admin;
	# components_to_refresh
	$page_globals->components_to_refresh = [];
	# portal
	$page_globals->portal_tipo 			= isset($_REQUEST["portal_tipo"]) ? safe_xss($_REQUEST["portal_tipo"]) : null;
	$page_globals->portal_parent 		= isset($_REQUEST["portal_parent"]) ? safe_xss($_REQUEST["portal_parent"]) : null;
	$page_globals->portal_section_tipo 	= isset($_REQUEST["portal_section_tipo"]) ? safe_xss($_REQUEST["portal_section_tipo"]) : null;
	# id_path
	$page_globals->id_path 		= isset($_REQUEST["id_path"]) ? safe_xss($_REQUEST["id_path"]) : null;
	# dedalo_protect_media_files
	$page_globals->dedalo_protect_media_files 	= (defined('DEDALO_PROTECT_MEDIA_FILES') && DEDALO_PROTECT_MEDIA_FILES===true) ? 1 : 0;
	# notifications
	$page_globals->DEDALO_NOTIFICATIONS 	  	= defined("DEDALO_NOTIFICATIONS") ? (int)DEDALO_NOTIFICATIONS : 0;
	$page_globals->DEDALO_PUBLICATION_ALERT 	= defined("DEDALO_PUBLICATION_ALERT") ? (int)DEDALO_PUBLICATION_ALERT : 0;
	# float_window_features
	$page_globals->float_window_features 		= json_decode('{"small":"menubar=no,location=no,resizable=yes,scrollbars=yes,status=no,width=470,height=415"}');
	*/

# Page globals
header('Content-type: application/javascript');
?>
"use strict";
<?php /*const page_globals=<?php echo SHOW_DEBUG===true ? json_encode($page_globals, JSON_PRETTY_PRINT) : json_encode($page_globals) ?>; */?>
var DEDALO_LIB_BASE_URL='<?php echo DEDALO_LIB_BASE_URL ?>',DEDALO_ROOT_WEB='<?php echo DEDALO_ROOT_WEB ?>',SHOW_DEBUG=<?php var_export(SHOW_DEBUG); ?>,SHOW_DEVELOPER=<?php var_export(SHOW_DEVELOPER); ?>,DEVELOPMENT_SERVER=<?php var_export(DEVELOPMENT_SERVER); ?>,DEDALO_SECTION_ID_TEMP='<?php echo DEDALO_SECTION_ID_TEMP ?>',USE_CDN='<?php echo USE_CDN ?>',PAPER_JS_URL='<?php echo PAPER_JS_URL ?>';
<?php
# Lang labels
include dirname(__FILE__) . '/lang/'.DEDALO_APPLICATION_LANG.'.js';
# json_elements_data array
echo ';'.js::get_json_elements_data();
?>