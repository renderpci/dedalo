<?php
declare(strict_types=1);
$global_start_time = hrtime(true);
// PREVENT_SESSION_LOCK
define('PREVENT_SESSION_LOCK', true);
// CONFIG
include_once dirname(dirname(dirname(dirname(__FILE__)))).'/config/config.php';

// close session to unlock php tread
session_write_close();

// $environment = dd_core_api::get_environment();
// dump($environment, ' environment ++ '.to_string()); die();

// $page_globals = new stdClass();
	// 	# version
	// 	$page_globals->dedalo_version = DEDALO_VERSION;
	// 	# lang
	// 	$page_globals->dedalo_application_lang 	= DEDALO_APPLICATION_LANG;
	// 	$page_globals->dedalo_data_lang 		= DEDALO_DATA_LANG;
	// 	$page_globals->dedalo_data_nolan 		= DEDALO_DATA_NOLAN;
	// 	# parent
	// 	$page_globals->_parent 		= isset($parent) ? (int)$parent : "";
	// 	# tipos
	// 	$page_globals->tipo 		= $tipo;
	// 	$page_globals->section_tipo = defined('SECTION_TIPO') ? SECTION_TIPO : null;
	// 	# top
	// 	$page_globals->top_tipo 	= TOP_TIPO;
	// 	$page_globals->top_id 		= TOP_ID;
	// 	# mode
	// 	$page_globals->mode 		= $mode;
	// 	# caller_tipo
	// 	$page_globals->caller_tipo 	= $caller_tipo;
	// 	# context_name
	// 	$page_globals->context_name = $context_name;
	// 	# tag_id
	// 	$page_globals->tag_id 		= isset($_REQUEST["tag_id"]) ? safe_xss($_REQUEST["tag_id"]) : "";
	// 	# user_id
	// 	$page_globals->user_id 		= isset($user_id) ? $user_id : null;
	// 	# username
	// 	$page_globals->username 	= isset($username) ? $username : null;
	// 	# full_username
	// 	$page_globals->full_username= isset($full_username) ? $full_username : null;
	// 	# is_global_admin
	// 	$page_globals->is_global_admin = (bool)$is_global_admin;
	// 	# components_to_refresh
	// 	$page_globals->components_to_refresh = [];
	// 	# portal
	// 	$page_globals->portal_tipo 			= isset($_REQUEST["portal_tipo"]) ? safe_xss($_REQUEST["portal_tipo"]) : null;
	// 	$page_globals->portal_parent 		= isset($_REQUEST["portal_parent"]) ? safe_xss($_REQUEST["portal_parent"]) : null;
	// 	$page_globals->portal_section_tipo 	= isset($_REQUEST["portal_section_tipo"]) ? safe_xss($_REQUEST["portal_section_tipo"]) : null;
	// 	# id_path
	// 	$page_globals->id_path 		= isset($_REQUEST["id_path"]) ? safe_xss($_REQUEST["id_path"]) : null;
	// 	# dedalo_protect_media_files
	// 	$page_globals->dedalo_protect_media_files 	= (defined('DEDALO_PROTECT_MEDIA_FILES') && DEDALO_PROTECT_MEDIA_FILES===true) ? 1 : 0;
	// 	# notifications
	// 	$page_globals->DEDALO_NOTIFICATIONS 	  	= defined('DEDALO_NOTIFICATIONS') ? (int)DEDALO_NOTIFICATIONS : 0;
	// 	# float_window_features
	// 	$page_globals->float_window_features 		= json_decode('{"small":"menubar=no,location=no,resizable=yes,scrollbars=yes,status=no,width=470,height=415"}');

// page_globals
	$page_globals = (function() {

		$user_id			= logged_user_id();
		$username			= logged_user_username();
		$mode				= $_GET['m'] ?? $_GET['mode'] ?? (!empty($_GET['id']) ? 'edit' : 'list');
		$full_username		= logged_user_full_username();
		$is_global_admin	= logged_user_is_global_admin();
		$is_developer		= logged_user_is_developer();
		$is_root			= $user_id==DEDALO_SUPERUSER;

		$obj = new stdClass();
			// $obj->server_errors					= !empty($_ENV['DEDALO_LAST_ERROR']);
			$obj->dedalo_last_error					= $_ENV['DEDALO_LAST_ERROR'] ?? null;
			// logged informative only
			$obj->is_logged							= login::is_logged();
			$obj->is_global_admin					= $is_global_admin;
			$obj->is_developer						= $is_developer;
			$obj->is_root							= $is_root;
			$obj->user_id							= $user_id;
			$obj->username							= $username;
			$obj->full_username						= $full_username;
			// entity
			$obj->dedalo_entity						= DEDALO_ENTITY;
			$obj->dedalo_entity_id					= DEDALO_ENTITY_ID;
			// version
			$obj->dedalo_version					= DEDALO_VERSION;
			// build
			$obj->dedalo_build						= DEDALO_BUILD;
			// mode
			$obj->mode								= $mode ?? null;
			// lang
			$obj->dedalo_application_langs_default	= DEDALO_APPLICATION_LANGS_DEFAULT;
			$obj->dedalo_application_lang			= DEDALO_APPLICATION_LANG;
			$obj->dedalo_data_lang					= DEDALO_DATA_LANG;
			$obj->dedalo_data_lang_selector			= defined('DEDALO_DATA_LANG_SELECTOR') ? DEDALO_DATA_LANG_SELECTOR : true;
			$obj->dedalo_data_lang_sync				= defined('DEDALO_DATA_LANG_SYNC') ? DEDALO_DATA_LANG_SYNC : false;
			$obj->dedalo_data_nolan					= DEDALO_DATA_NOLAN;
			$obj->dedalo_application_langs			= (function(){
				$result = [];
				foreach (DEDALO_APPLICATION_LANGS as $value => $label) {
					$result[] = (object)[
						'label'	=> $label,
						'value'	=> $value
					];
				}
				return $result;
			})();
			$obj->dedalo_projects_default_langs	= array_map(function($current_lang) {
				return [
					'label'	=> lang::get_name_from_code($current_lang),
					'value'	=> $current_lang,
					'tld2'	=> lang::get_alpha2_from_code($current_lang)
				];
			}, DEDALO_PROJECTS_DEFAULT_LANGS);
			// quality defaults
			$obj->dedalo_image_quality_default	= DEDALO_IMAGE_QUALITY_DEFAULT;
			$obj->dedalo_av_quality_default		= DEDALO_AV_QUALITY_DEFAULT;
			$obj->dedalo_quality_thumb			= defined('DEDALO_QUALITY_THUMB') ? DEDALO_QUALITY_THUMB : 'thumb';

			// tag_id
			$obj->tag_id						= isset($_REQUEST['tag_id']) ? safe_xss($_REQUEST['tag_id']) : null;
			// dedalo_protect_media_files
			$obj->dedalo_protect_media_files	= (defined('DEDALO_PROTECT_MEDIA_FILES') && DEDALO_PROTECT_MEDIA_FILES===true) ? 1 : 0;
			// notifications
			$obj->DEDALO_NOTIFICATIONS			= defined('DEDALO_NOTIFICATIONS') ? (int)DEDALO_NOTIFICATIONS : 0;
			// ip_api
			$obj->ip_api						= defined('IP_API') ? IP_API : null;
			// float_window_features
			// $obj->float_window_features		= json_decode('{"small":"menubar=no,location=no,resizable=yes,scrollbars=yes,status=no,width=600,height=540"}');
			$obj->fallback_image				= DEDALO_CORE_URL . '/themes/default/default.svg';
			$obj->locale						= DEDALO_LOCALE;
			$obj->dedalo_date_order				= DEDALO_DATE_ORDER;
			$obj->component_active				= null;
			$obj->dedalo_notification			= defined('DEDALO_NOTIFICATION') ? DEDALO_NOTIFICATION : null;
			$obj->stream_readers				= [];
			// maintenance mode
			$obj->maintenance_mode				= defined('DEDALO_MAINTENANCE_MODE_CUSTOM')
				? DEDALO_MAINTENANCE_MODE_CUSTOM
				: (defined('DEDALO_MAINTENANCE_MODE') ? DEDALO_MAINTENANCE_MODE : false);
			// debug only
			if(SHOW_DEBUG===true || SHOW_DEVELOPER===true) {
				$obj->dedalo_db_name = DEDALO_DATABASE_CONN;
				if ($obj->is_logged===true && defined('DEDALO_INSTALL_STATUS') && DEDALO_INSTALL_STATUS==='installed') {
					$obj->pg_version = (function() {
						try {
							$conn = DBi::_getConnection() ?? false;
							if ($conn) {
								return pg_version(DBi::_getConnection())['server'];
							}
							return 'Failed!';
						}catch(Exception $e){
							return 'Failed with Exception!';
						}
					})();
				}
				$obj->php_version	= PHP_VERSION;
				// $obj->php_version .= ' jit:'. (int)(opcache_get_status()['jit']['enabled'] ?? false);
				$obj->php_memory	= to_string(ini_get('memory_limit'));
				if ( strpos(DEDALO_HOST, 'localhost')===0 ) {
					$obj->dedalo_root_path = DEDALO_ROOT_PATH;
				}
			}


		return $obj;
	})();

// plain global vars
	$plain_vars = [
		'DEDALO_ENVIRONMENT'				=> true,
		'DEDALO_API_URL'					=> defined('DEDALO_API_URL') ? DEDALO_API_URL : (DEDALO_CORE_URL . '/api/v1/json/'),
		'DEDALO_CORE_URL'					=> DEDALO_CORE_URL,
		'DEDALO_ROOT_WEB'					=> DEDALO_ROOT_WEB,
		'DEDALO_MEDIA_URL'					=> DEDALO_MEDIA_URL,
		'DEDALO_TOOLS_URL'					=> DEDALO_TOOLS_URL,
		'SHOW_DEBUG'						=> SHOW_DEBUG,
		'SHOW_DEVELOPER'					=> SHOW_DEVELOPER,
		'DEVELOPMENT_SERVER'				=> DEVELOPMENT_SERVER,
		'DEDALO_SECTION_ID_TEMP'			=> DEDALO_SECTION_ID_TEMP,
		'DEDALO_UPLOAD_SERVICE_CHUNK_FILES'	=> DEDALO_UPLOAD_SERVICE_CHUNK_FILES,
		'DEDALO_LOCK_COMPONENTS'			=> DEDALO_LOCK_COMPONENTS,
		// 'DEDALO_NOTIFICATION'			=> null, // DEPRECATED . legacy support only (remove early)
		// DD_TIPOS . Some useful dd tipos (used in client by tool_user_admin for example)
		'DD_TIPOS' => [
			// 'DEDALO_SECTION_USERS_TIPO'			=> DEDALO_SECTION_USERS_TIPO,
			// 'DEDALO_USER_PROFILE_TIPO'			=> DEDALO_USER_PROFILE_TIPO,
			// 'DEDALO_FULL_USER_NAME_TIPO'			=> DEDALO_FULL_USER_NAME_TIPO,
			// 'DEDALO_USER_EMAIL_TIPO'				=> DEDALO_USER_EMAIL_TIPO,
			// 'DEDALO_FILTER_MASTER_TIPO'			=> DEDALO_FILTER_MASTER_TIPO,
			// 'DEDALO_USER_IMAGE_TIPO'				=> DEDALO_USER_IMAGE_TIPO,
			'DEDALO_RELATION_TYPE_INDEX_TIPO'		=> DEDALO_RELATION_TYPE_INDEX_TIPO,
			'DEDALO_SECTION_INFO_INVERSE_RELATIONS'	=> DEDALO_SECTION_INFO_INVERSE_RELATIONS,
			'DEDALO_RELATION_TYPE_LINK'				=> DEDALO_RELATION_TYPE_LINK,
			'DEDALO_SECTION_RESOURCES_IMAGE_TIPO'	=> DEDALO_SECTION_RESOURCES_IMAGE_TIPO,
			'DEDALO_COMPONENT_RESOURCES_IMAGE_TIPO'	=> DEDALO_COMPONENT_RESOURCES_IMAGE_TIPO
		]
	];

// headers
	header('Content-type: application/javascript; charset=utf-8');
	// no cache
		header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
		header("Cache-Control: post-check=0, pre-check=0", false);
		header("Pragma: no-cache");
	// cache optional
		// $seconds_to_cache = 3600;
		// $ts = gmdate('D, d M Y H:i:s', time() + $seconds_to_cache) . ' GMT';
		// header("Expires: $ts");
		// header("Pragma: cache");
		// // header("Cache-Control: max-age=$seconds_to_cache");
		// header("Cache-Control: Cache-Control: stale-while-revalidate=$seconds_to_cache");
?>
// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0

"use strict";
// page_globals. Set var to window to allow easy access from opened windows
window.page_globals=<?php echo json_encode(
	$page_globals, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT
);?>;
<?php
// plain_vars
echo 'const ' . implode(',', array_map(function ($v, $k) {
	return sprintf('%s=%s', $k, json_encode($v, JSON_UNESCAPED_SLASHES));
}, $plain_vars, array_keys($plain_vars))) .';'. PHP_EOL;
// Lang labels
$lang_path = '/common/js/lang/'.DEDALO_APPLICATION_LANG.'.js';
echo 'const get_label=';
if (!include DEDALO_CORE_PATH . $lang_path) {
	$msg = 'Invalid lang file: ' . $lang_path;
	debug_log(__METHOD__.' '.$msg, logger::ERROR);
	echo '{
		"invalid_lang_file" : "Error on get current lang file. '.$msg.'"
	}';
}
// json_elements_data array
// echo ';'.PHP_EOL.js::get_json_elements_data();
debug_log('environment exec_time: ' .exec_time_unit($global_start_time,'ms').' ms', logger::DEBUG);


// @license-end
