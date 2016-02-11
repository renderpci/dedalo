<?php
# TIPOS : Resolve important tipos

# root tipo
define('DEDALO_ROOT_TIPO'								, 'dd1');
define('DEDALO_TESAURO_TIPO'							, 'dd100');
define('DEDALO_MEDIA_AREA_TIPO'							, 'rsc1');

# Activity 
define('DEDALO_ACTIVITY_SECTION_TIPO'					, 'dd542');

# Users
define('DEDALO_SECTION_USERS_TIPO'						, 'dd128');
#define('DEDALO_SECURITY_ADMINISTRATOR_TIPO'				, 'dd244');
define('DEDALO_USER_NAME_TIPO'							, 'dd132');
define('DEDALO_USER_PASSWORD_TIPO'						, 'dd133');
define('DEDALO_CUENTA_ACTIVA_TIPO'						, 'dd131');
define('DEDALO_FULL_USER_NAME_TIPO'						, 'dd452');
define('DEDALO_USER_PROFILE_TIPO'						, 'dd1725');
define('DEDALO_SUPERUSER'								, -1);
define('DEDALO_COMPONENT_SECURITY_AREAS_USER_TIPO'		, 'dd240'); # AREAS USUARIO
define('DEDALO_COMPONENT_SECURITY_ACCESS_USER_TIPO'		, 'dd148'); # ACCES USUARIO
define('DEDALO_COMPONENT_SECURITY_TOOLS_USER_TIPO'		, 'dd784'); # TOOLS USUARIO model component_security_tools
define('DEDALO_FILTER_MASTER_TIPO'						, 'dd170'); # USER COMPONENT_FILTER_MASTER

# Profiles
define('DEDALO_SECTION_PROFILES_TIPO'					, 'dd234');
define('DEDALO_COMPONENT_NAME_PROFILES_TIPO'			, 'dd237');
define('DEDALO_COMPONENT_DESCRIPTION_PROFILES_TIPO'		, 'dd238');
define('DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO'	, 'dd249'); # AREAS PROFILES
define('DEDALO_COMPONENT_SECURITY_ACCESS_PROFILES_TIPO'	, 'dd774'); # ACCES PROFILES
define('DEDALO_COMPONENT_SECURITY_TOOLS_PROFILES_TIPO'	, 'dd1067'); # TOOLS PROFILES

# Section projects
define('DEDALO_SECTION_PROJECTS_TIPO'					, 'dd153');
define('DEDALO_PROJECTS_NAME_TIPO'						, 'dd156'); # remenber: is 'component_input_text' model
define('DEDALO_COMPONENT_PROJECT_LANGS_TIPO'			, 'dd267');


# dedalo_diffusion_tipo
define('DEDALO_DIFFUSION_TIPO'							, 'dd3');
define('DEDALO_COMPONENT_SI_NO_TIPO'					, 'dd62');	# Tipo del campo valor (no de la sección) lista privada con valores posibles: 1,2 (si,no) -traducible-
define('DEDALO_SECTION_SI_NO_TIPO'						, 'dd64');

# dedalo_section_layout
define('DEDALO_SECTION_LAYOUT_TEMPLATES_TIPO'			, 'dd20'); # TIPO of secction layout with the default and private templates for print, list, edit... the secitions
define('DEDALO_SECTION_LAYOUT_PUBLIC_TIPO'				, 'dd30'); # TIPO of secction layout with the user and public layouts for print, list, edit... the secitions

# dedalo Media
define('DEDALO_MEDIA_COLLECTION_TIPO'					, 'rsc25'); # TIPO of the collection component that contain the data of the collection, that can will used to make he path to the media

# Modelos
define('MODELO_SECTION'									, 'dd6');

# Tools / procesos

define('DEDALO_STATE_GENERAL_SECTION_ID'					, '1');
define('DEDALO_STATE_GENERAL_SECTION_TIPO'				, 'dd174');
define('DEDALO_STATE_GENERAL_COMPONENT_TIPO'			, 'dd185');


define('DEDALO_TOOL_TRANSCRIPTION_ID'						, '1');
define('DEDALO_TOOL_INDEXATION_ID'							, '2');
define('DEDALO_TOOL_TRANSLATE_ID'							, '3');
define('DEDALO_TOOL_INVESTIGATION_SECTION_TIPO'			, 'dd90');
define('DEDALO_TOOL_INVESTIGATION_COMPONENT_TIPO'		, 'dd127');


# TOP_TIPO
if (!empty($_REQUEST['top_tipo'])) {
	define('TOP_TIPO', trim($_REQUEST['top_tipo']));
}else if (!empty($_REQUEST['t'])) {
	define('TOP_TIPO', trim($_REQUEST['t']));
}else if (isset($TOP_TIPO)) {
	define('TOP_TIPO', $TOP_TIPO);	
}else{
	define('TOP_TIPO', false);
	#if(SHOW_DEBUG) {			
	#	error_log("--> WARNING: TOP_TIPO is empty. (bool)FALSE is assigned now ".$_SERVER['REQUEST_URI']);						
	#}
}
# TOP_ID
if (!empty($_REQUEST['top_id'])) {
	define('TOP_ID', trim($_REQUEST['top_id']));
}else if (!empty($_REQUEST['id'])) {
	define('TOP_ID', trim($_REQUEST['id']));
}else{
	define('TOP_ID', false);
}



?>