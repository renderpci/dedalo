<?php
################################################################
# DEDALO CONF FILE
	include DEDALO_CONFIG_PATH .'/config.php';



################################################################
# API_ROOT
	define('API_ROOT', dirname(dirname(__FILE__)));



################################################################
# CONSTANTS

	// API_WEB_USER_CODE . Verification user code (must be identical in config of client and server)
	if (isset($skip_api_web_user_code_verification) && $skip_api_web_user_code_verification===true) {
		# Ignore api code verification
	}else{		
		define('API_WEB_USER_CODE', 'xxxxxxxxxxxxxxxxxxxxxx');
		if (empty($code)) {
			echo json_encode("Sorry. Empty user code");
			die();
		}elseif ($code!==API_WEB_USER_CODE) {
			echo json_encode("Sorry. Invalid user code");
			die();
		}
	}
	
	// WEB_CURRENT_LANG_CODE . Current lang default. If request get 'lang' overwrite value
	define('WEB_CURRENT_LANG_CODE' 		, !empty($_REQUEST['lang']) ? $_REQUEST['lang'] : 'lg-eng');	
		
	// __CONTENT_BASE_URL__ . Web base url where are served the contents
	define('__CONTENT_BASE_URL__' 		, 'http://www.mydomain.com');

	// WEB_VIDEO_PATH
	define('WEB_VIDEO_BASE_URL' 		, DEDALO_MEDIA_BASE_URL .'/'. DEDALO_AV_FOLDER .'/'. DEDALO_AV_QUALITY_DEFAULT );



################################################################
# REQUIRED FILES

	// web_data
	include API_ROOT .'/common/class.web_data.php';
	// json manager
	include API_ROOT .'/common/class.manager.php';



################################################################
# RESTRICTED TERMS
	# TERM_ID_RESTRICTED. Like 'ts1_5583'	
	define('TERM_ID_RESTRICTED'	, ''); 
	# AR_RESTRICTED_TERMS. Terms to not show never. Like '[$TERM_ID_RESTRICTED,'dc1_5526']'
	define('AR_RESTRICTED_TERMS', json_encode([]));



################################################################
# GENERAL CONSTANTS	
	// Publication filter optional like "AND publicacion = 'si'"
	define('PUBLICACION_FILTER_SQL' , " ");

	# Fast thesaurus map to avoid unnecessary union tables (optional)
	# Use when you need manage various tables at same time (toponymy for example)
		$table_thesaurus_map = array();
	
	# Table names
		define('TABLE_THESAURUS'		 , '');
		define('TABLE_HIERARCHY'		 , 'hierarchy');
		define('TABLE_INTERVIEW'		 , 'interview');
		define('TABLE_AUDIOVISUAL'		 , 'audiovisual');
		define('TABLE_IMAGE'			 , 'image');
		define('TABLE_INFORMANT'		 , 'informant');
		define('TRANSCRIPTION_TIPO'		 , 'rsc36');
		define('AV_TIPO'				 , 'rsc35');
		define('AUDIOVISUAL_SECTION_TIPO', 'rsc167');

	# Fields
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



################################################################
# PUBLICATION SCHEMA
	# Moved to database, table 'publication_schema'



################################################################
# Access-Control-Allow-Origin
# Specifies a URI that may access the resource. You may specify one or more origins, separated by commas.
# Use * for requests without credentials,
	#define('ACCESS_CONTROL_ALLOW_ORIGIN', '*');



################################################################
# Database to use in this website (for multiple database publication options like 'mht')	
	define('MYSQL_WEB_DATABASE_CONN', 'web_'.DEDALO_ENTITY);



