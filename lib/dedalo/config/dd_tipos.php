<?php
# TIPOS : Resolve important tipos

# root tipo
define('DEDALO_ROOT_TIPO'								, 'dd1');
define('DEDALO_TESAURO_TIPO'							, 'dd100');
define('DEDALO_MEDIA_AREA_TIPO'							, 'rsc1');
define('DEDALO_AREA_ROOT_TIPO'							, 'dd242');

# Activity 
define('DEDALO_ACTIVITY_SECTION_TIPO'					, 'dd542');
define('DEDALO_ACTIVITY_WHEN'							, 'dd547'); // component_date

# Users
define('DEDALO_SECTION_USERS_TIPO'						, 'dd128');
define('DEDALO_SECURITY_ADMINISTRATOR_TIPO'				, 'dd244');
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
define('DEDALO_USER_COMPONENT_FILTER_RECORDS_TIPO'		, 'dd478');

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

# State
define('DEDALO_STATE_GENERAL_SECTION_ID'				, '1');
define('DEDALO_STATE_GENERAL_SECTION_TIPO'				, 'dd174');
define('DEDALO_STATE_GENERAL_COMPONENT_TIPO'			, 'dd185');

# Tools / procesos
define('DEDALO_TOOLS_TIPO'								, 'dd193');
define('DEDALO_TOOL_TRANSCRIPTION_ID'					, '1');
define('DEDALO_TOOL_INDEXATION_ID'						, '2');
define('DEDALO_TOOL_TRANSLATE_ID'						, '3');
define('DEDALO_TOOL_INVESTIGATION_SECTION_TIPO'			, 'dd90');
define('DEDALO_TOOL_INVESTIGATION_COMPONENT_TIPO'		, 'dd127');

# Video components resources
define('DEDALO_SECTION_RESOURCES_AV_TIPO'				, 'rsc167');
define('DEDALO_COMPONENT_RESOURCES_AV_TIPO'				, 'rsc35');
define('DEDALO_COMPONENT_RESOURCES_AV_DURATION_TIPO'	, 'rsc54');

# Hierarchy types
define('DEDALO_HIERARCHY_TYPES_SECTION_TIPO'			, 'hierarchy13');
define('DEDALO_HIERARCHY_TYPES_NAME_TIPO'				, 'hierarchy16');

# Hierarchy
define('DEDALO_HIERARCHY_SECTION_TIPO'					, 'hierarchy1');
define('DEDALO_HIERARCHY_ACTIVE_TIPO'					, 'hierarchy4');
define('DEDALO_HIERARCHY_LANG_TIPO'						, 'hierarchy8');
define('DEDALO_HIERARCHY_TIPOLOGY_TIPO'					, 'hierarchy9');
define('DEDALO_HIERARCHY_TLD2_TIPO'						, 'hierarchy6');
define('DEDALO_HIERARCHY_TERM_TIPO'						, 'hierarchy5');
define('DEDALO_HIERARCHY_TARGET_SECTION_TIPO'			, 'hierarchy53');
define('DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO'		, 'hierarchy58');
define('DEDALO_HIERARCHY_CHIDRENS_TIPO'					, 'hierarchy45');
define('DEDALO_HIERARCHY_CHIDRENS_MODEL_TIPO'			, 'hierarchy59');
define('DEDALO_HIERARCHY_ORDER_TIPO'					, 'hierarchy48');
define('DEDALO_HIERARCHY_FILTER_TIPO'					, 'hierarchy54');

# Thesaurus real section
define('DEDALO_THESAURUS_SECTION_TIPO'					, 'hierarchy20');
define('DEDALO_THESAURUS_TERM_TIPO'						, 'hierarchy25');
define('DEDALO_THESAURUS_CODE_TIPO'						, 'hierarchy41');
define('DEDALO_THESAURUS_GEOLOCATION_TIPO'				, 'hierarchy31');
define('DEDALO_THESAURUS_RELATION_PARENT_TIPO'			, 'hierarchy36');
define('DEDALO_THESAURUS_RELATION_MODEL_TIPO'			, 'hierarchy27');
define('DEDALO_THESAURUS_RELATION_CHIDRENS_TIPO'		, 'hierarchy49');
define('DEDALO_THESAURUS_VIRTUALS_AREA_TIPO'			, 'hierarchy56');
define('DEDALO_THESAURUS_VIRTUALS_MODELS_AREA_TIPO'		, 'hierarchy57');
define('DEDALO_THESAURUS_GEONAMES_ID_TIPO'				, 'hierarchy63');
define('DEDALO_THESAURUS_ORDER_TIPO'					, 'hierarchy42');
define('DEDALO_THESAURUS_FILTER_TIPO'					, 'hierarchy55');
define('DEDALO_THESAURUS_DESCRIPTOR_TIPO'				, 'hierarchy23');
define('DEDALO_THESAURUS_USABLE_INDEX_TIPO'				, 'hierarchy24');

# Relation types
define('DEDALO_RELATION_TYPE_PARENT_TIPO'				, 'dd47');
define('DEDALO_RELATION_TYPE_CHILDREN_TIPO'				, 'dd48');
define('DEDALO_RELATION_TYPE_INDEX_TIPO'				, 'dd96');
define('DEDALO_RELATION_TYPE_STRUCT_TIPO'				, 'dd490');
define('DEDALO_RELATION_TYPE_MODEL_TIPO'				, 'dd98');
define('DEDALO_RELATION_TYPE_RELATED_TIPO'				, 'dd89');
	# Relation related types
	define('DEDALO_RELATION_TYPE_RELATED_BIDIRECTIONAL_TIPO', 'dd467');
#define('DEDALO_RELATION_TYPE_RECORD_TIPO'				, 'ddXXX'); // working here


# Notes
define('DEDALO_NOTES_SECTION_TIPO'						, 'rsc326');
define('DEDALO_NOTES_TEXT_TIPO'							, 'rsc329');

# Structuration notes
define('DEDALO_STRUCTURATION_SECTION_TIPO'				, 'rsc370');
define('DEDALO_STRUCTURATION_TITLE_TIPO'				, 'rsc372');
define('DEDALO_STRUCTURATION_DESCRIPTION_TIPO'			, 'rsc373');
define('DEDALO_STRUCTURATION_ORDER_TIPO'				, 'rsc383');

# Indexation notes
define('DEDALO_INDEXATION_SECTION_TIPO'					, 'rsc377');
define('DEDALO_INDEXATION_TITLE_TIPO'					, 'rsc379');
define('DEDALO_INDEXATION_DESCRIPTION_TIPO'				, 'rsc380');


define('DEDALO_TEXTAREA_FIX_BROQUEN_TAGS_TIPOS'			, serialize( array('rsc36')) );

# LANGS
define('DEDALO_LANGS_SECTION_TIPO'						, 'lg1');



if (!defined('DEDALO_PROTOCOL')) {
	define('DEDALO_PROTOCOL', 'http://');
}



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