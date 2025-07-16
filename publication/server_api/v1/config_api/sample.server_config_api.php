<?php
/**
* Dédalo Publication Server API config
* for v6 version
*/



// api_root. API base directory
	define('API_ROOT', dirname(__FILE__, 2));



// error manage. Set on debug only
	// ini_set( 'display_errors', 1 );     // Default 1
	// error_reporting(E_ALL);             // Default -1 or E_ALL (Report all PHP errors)
	// error_reporting(E_ALL ^ E_DEPRECATED);



// api_entity . Like 'my_organization'
	define('API_ENTITY', 'my_organization');



// basic vars (for easy read this file)
	$DEFAULT_LANG		= 'lg-spa';
	$DEFAULT_DDBB		= 'web_XXXXXXXXX';
	$WEB_BASE_URL		= 'https://my_organization.es';

// api_web_user_code . Verification user code (must be identical in config of client and server)
	define('API_WEB_USER_CODE', 'XXXXXXXXXXXXXXXXXXXXXXXXXXX');
	if (isset($skip_api_web_user_code_verification) && $skip_api_web_user_code_verification===true) {
		// Ignore api code verification mode
	}else{
		if (empty($code)) {
			echo json_encode("Error. Empty user code");
			die();
		}elseif ($code!==API_WEB_USER_CODE) {
			echo json_encode("Error. Invalid user code '$code' " . API_ENTITY);
			die();
		}
	}

// db config. Use always a read only user for connect to the database
	// db_name . Optional
	$db_name = !empty($db_name)
		? $db_name
		: $DEFAULT_DDBB;
	// MYSQL connection config (must be different that Dédalo publish config)
	define('MYSQL_DEDALO_HOSTNAME_CONN'	, 'localhost');
	define('MYSQL_DEDALO_USERNAME_CONN'	, 'read_only_user');
	define('MYSQL_DEDALO_PASSWORD_CONN'	, 'XXXXXXXXXXXXX..');
	define('MYSQL_DEDALO_DATABASE_CONN'	, $db_name);
	define('MYSQL_DEDALO_DB_PORT_CONN'	, null);
	define('MYSQL_DEDALO_SOCKET_CONN'	, null);



// Dedalo constants. They are needed because the API uses some references and Dédalo config file is not available here.
	// text_subtitles_url_base. subtitles generator URL
	define('TEXT_SUBTITLES_URL_BASE',						$WEB_BASE_URL.'/dedalo/publication/server_api/v1/subtitles/');
	// dedalo_media_base_url. Relative media url base path to media files (is prepended to the media files URL)
	define('DEDALO_MEDIA_BASE_URL',							'/dedalo/media'); // '/dedalo/media'
	// dedalo_av_quality_default. Quality used for current web (default 404)
	define('DEDALO_AV_QUALITY_DEFAULT',						'404');
	// dedalo_av_folder. Audiovisual base folder name like '/av'
	define('DEDALO_AV_FOLDER',								'/av');
	// dedalo_av_posterframe_extension. Posterframe extension like 'jpg'
	define('DEDALO_AV_POSTERFRAME_EXTENSION',				'jpg');
	// show_debug. Enable debug messages on the API (like Dédalo do). Production is false
	define('SHOW_DEBUG',									true); // set false
	// dedalo_section_resources_av_tipo. Video components resources tipo (needed for web_data fragments calculation)
	define('DEDALO_SECTION_RESOURCES_AV_TIPO',				'rsc167');
	// dedalo_component_resources_av_tipo. av media component tipo (used to locate indexations in data)
	define('DEDALO_COMPONENT_RESOURCES_AV_TIPO',			'rsc35');
	// dedalo_component_resources_av_duration_tipo. used to get audiovisual file duration faster
	define('DEDALO_COMPONENT_RESOURCES_AV_DURATION_TIPO',	'rsc54');
	// dedalo_component_resources_tr_tipo. av transcription component tipo (used to locate indexations in data)
	define('DEDALO_COMPONENT_RESOURCES_TR_TIPO',			'rsc36');
	// DEDALO_NOTES_TEXT_TIPO. av notes component tipo (used to locate notes in data)
	define('DEDALO_NOTES_TEXT_TIPO',						'rsc329');
	// DEDALO_RELATION_TYPE_CHILDREN_TIPO.
	// This constant defines the tipo (type identifier) for component_relation_children
	// from the thesaurus section. It is used to filter 'from_component_tipo' locators
	// in the web_data::get_thesaurus_parents() method.
	define('DEDALO_RELATION_TYPE_CHILDREN_TIPO',			'dd48');



// web_current_lang_code . If request get 'lang', overwrite default value
	define('WEB_CURRENT_LANG_CODE', !empty($lang) ? $lang : $DEFAULT_LANG);

// __content_base_url__ . Web base url where are served the contents
	define('__CONTENT_BASE_URL__', $WEB_BASE_URL);

// web_video_path
	define('WEB_VIDEO_BASE_URL', DEDALO_MEDIA_BASE_URL .'/'. DEDALO_AV_FOLDER .'/'. DEDALO_AV_QUALITY_DEFAULT);



// required files
	// DDBB connection manager
	include API_ROOT .'/common/class.DBi.php';
	// utilities
	include API_ROOT .'/common/utils.php';
	// web_data
	include API_ROOT .'/common/class.web_data.php';
	// JSON API manager
	include API_ROOT .'/common/class.manager.php';



// restricted terms
	// term_id_restricted. Like 'ts1_5583'
	define('TERM_ID_RESTRICTED'	, '');
	// ar_restricted_terms. Terms to not show never. Like '[$TERM_ID_RESTRICTED,'dc1_5526']'
	define('AR_RESTRICTED_TERMS', json_encode([]));



// general constants
	// Publication filter optional like "AND publicacion = 'si'". It is used for legacy compatibility
	define('PUBLICATION_FILTER_SQL', ' ');

	// Fast thesaurus map definition to prevent unnecessary union tables (optional)
	// Use when you need to manage several tables at the same time (toponymy for example)
		$TABLE_THESAURUS		= 'ts_chronological,ts_onomastic,ts_themes';
		$table_thesaurus_map	= [];

	// Table names. Used to resolve fragments
		define('TABLE_THESAURUS'		 , $TABLE_THESAURUS);
		define('TABLE_HIERARCHY'		 , 'hierarchy');
		define('TABLE_INTERVIEW'		 , 'interview');
		define('TABLE_AUDIOVISUAL'		 , 'audiovisual');
		define('TABLE_IMAGE'			 , 'image');
		define('TABLE_INFORMANT'		 , 'informant');
		define('TRANSCRIPTION_TIPO'		 , 'rsc36');
		define('AV_TIPO'				 , 'rsc35');
		define('AUDIOVISUAL_SECTION_TIPO', 'rsc167');

	// Fields. Used to resolve fragments
		define('FIELD_TRANSCRIPTION'	, TRANSCRIPTION_TIPO);
		define('FIELD_DURATION'			, 'duration');
		define('FIELD_TERM'				, 'term');
		define('FIELD_TERM_ID'			, 'term_id');
		define('FIELD_SUMMARY'			, 'abstract');
		define('FIELD_INTERVIEW_DATE'	, 'date');
		define('FIELD_INFORMANT'		, 'informant');
		define('FIELD_IMAGE'			, 'image');
		define('FIELD_NAME'				, 'name');
		define('FIELD_SURNAME'			, 'surname');
		define('FIELD_BIRTHDATE'		, 'birthdate');
		define('FIELD_BIRTHPLACE'		, 'birthplace');
		define('FIELD_VIDEO'			, 'video');
		define('FIELD_CODE'				, 'code');
		define('FIELD_NORDER'			, 'norder');
		define('FIELD_AUDIOVISUAL'		, 'audiovisual');
		define('FIELD_INDEX'			, 'indexation');



// publication schema
	// Moved to database, table 'publication_schema'




// Access-Control-Allow-Origin
// Specifies a URI that may access the resource. You may specify one or more origins, separated by commas.
// Use * for requests without credentials,
	define('ACCESS_CONTROL_ALLOW_ORIGIN', '*');



// Database to use (for multiple database publication options like 'mht'). var $db_name is set in json/index.php file from request
	define('MYSQL_WEB_DATABASE_CONN', !empty($db_name)
		? $db_name // received in JSON request
		: MYSQL_DEDALO_DATABASE_CONN // default from current db config
	);
