<?php
# DEDALO CONFIG
include dirname(dirname(dirname(dirname(dirname(__FILE__))))) .'/config/config4.php';


# After load Dédalo config, set API constants 

switch ($_SERVER['SERVER_NAME']) {
	case 'cedis':
		$API_WEB_USER_CODE 	= '85df5s$dKlw8adQdp€';
		$DEFAULT_LANG 		= 'lg-ell';
		$__WEB_BASE_URL__ 	= 'http://dedalo.cedis.fu-berlin.de';
		break;
	case 'mdcat':
		$API_WEB_USER_CODE 	= '85df5s$4KueñwQw5O2p4J1G9';
		$DEFAULT_LANG 		= 'lg-cat';
		$__WEB_BASE_URL__ 	= 'https://dedalo4.bancmemorial.extranet.gencat.cat';
		break;
}



################################################################
# CONSTANTS

	// WEB_CURRENT_LANG_CODE . Current lang default. If request get 'lang' overwrite value
	define('WEB_CURRENT_LANG_CODE' 		, !empty($lang) ? $lang : $DEFAULT_LANG);

	// API_WEB_USER_CODE . Verification user code (must be identical in config of client and server)
	define('API_WEB_USER_CODE' 			, $API_WEB_USER_CODE);
			if ($code!==API_WEB_USER_CODE) {
				echo json_encode("Sorry. Invalid user code");
				die();
			}	
		
	// __CONTENT_BASE_URL__ . Web base url where are served the contents
	define('__CONTENT_BASE_URL__' 		, $__WEB_BASE_URL__);

	// WEB_VIDEO_PATH
	define('WEB_VIDEO_BASE_URL' 		, __CONTENT_BASE_URL__ . DEDALO_MEDIA_BASE_URL . DEDALO_AV_FOLDER .'/'. DEDALO_AV_QUALITY_DEFAULT );
	


################################################################
# REQUIRED FILES

	// web_data
	include dirname(dirname(__FILE__)) .'/common/class.web_data.php';
	// json manager
	include dirname(dirname(__FILE__))  .'/common/class.manager.php';



################################################################
# GENERAL CONSTANTS	
	// Publication filter optional like "AND publicacion = 'si'"
	define('PUBLICACION_FILTER_SQL' , " ");	



################################################################
# RESTRICTED TERMS
	switch (DEDALO_ENTITY) {
		case 'mdcat':
			define('TERM_ID_RESTRICTED'	, 'ts1_5583');
			break;
		
		default:
			define('TERM_ID_RESTRICTED'	, 'ts1_248');
			break;
	}

	# AR_RESTRICTED_TERMS. Terms to not show never
	define('AR_RESTRICTED_TERMS', json_encode( array(TERM_ID_RESTRICTED,'dc1_5526') ));


	# Fast thesaurus map to avoid unnecessary union tables (optional)
	# Use when you need manage various tables at same time (toponymy for example)
	$table_thesaurus_map = array();


	# Table names
	switch (DEDALO_ENTITY) {
		case 'aup':
			define('TABLE_THESAURUS'		 , 'temas');
			break;
		case 'mdcat':
			define('TABLE_THESAURUS'		 , 'ts_cronologics,ts_themes,ts_onomastics'); // ,andorra,argelia,cuba,espanya,francia,marruecos
			$table_thesaurus_map = array( 
											  'dc1' => 'ts_cronologics',
											  'ts1' => 'ts_themes',
											  'on1' => 'ts_onomastics',
											  'ad1' => 'tp_andorra',
											  'dz1' => 'tp_argelia',
											  'cu1' => 'tp_cuba',
											  'es1' => 'tp_espanya',
											  'fr1' => 'tp_francia',
											  'ma1' => 'tp_marruecos',
											  'hierarchy1_246' 	=> 'ts_cronologics',
											  'hierarchy1_1' 	=> 'ts_themes',
											  'hierarchy1_245' 	=> 'ts_onomastics',
											  'hierarchy1_2' 	=> 'tp_andorra',
											  'hierarchy1_60' 	=> 'tp_argelia',
											  'hierarchy1_50' 	=> 'tp_cuba',
											  'hierarchy1_66' 	=> 'tp_espanya',
											  'hierarchy1_73' 	=> 'tp_francia',
											  'hierarchy1_135' 	=> 'tp_marruecos',
											);					
			break;		
		default:
			define('TABLE_THESAURUS'		 , 'themes');
			break;
	}	
	
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
# Define field portal => table relations for resolve portals in web_data
# Instead use database table, we use not a constant in config (14-06-2017)
	define('PUBLICATION_SCHEMA', '{
		"image":"image",
		"audiovisual":"audiovisual",
		"informant":"informant",
		"images":"image"
	}');



?>