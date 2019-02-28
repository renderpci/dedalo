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
define('DEDALO_USER_DEVELOPER_TIPO'						, 'dd515');

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
define('DEDALO_COMPONENT_RESOURCES_TR_TIPO'				, 'rsc36');

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
define('DEDALO_HIERARCHY_BUTTON_NEW_TIPO'				, 'hierarchy11');
define('DEDALO_HIERARCHY_BUTTON_DELETE_TIPO'			, 'hierarchy12');

# Thesaurus real section
define('DEDALO_THESAURUS_SECTION_TIPO'					, 'hierarchy20');
define('DEDALO_THESAURUS_TERM_TIPO'						, 'hierarchy25');
define('DEDALO_THESAURUS_CODE_TIPO'						, 'hierarchy41');
define('DEDALO_THESAURUS_GEOLOCATION_TIPO'				, 'hierarchy31');
define('DEDALO_THESAURUS_RELATED_TIPO'					, 'hierarchy35');
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
define('DEDALO_THESAURUS_INDEXATIONS_TIPO'				, 'hierarchy40');
define('DEDALO_THESAURUS_STRUCTURATIONS_TIPO'			, 'hierarchy91');
define('DEDALO_THESAURUS_BUTTON_NEW_TIPO'				, 'hierarchy38');
define('DEDALO_THESAURUS_BUTTON_DELETE_TIPO'			, 'hierarchy39');

# Relation types
define('DEDALO_RELATION_TYPE_CHILDREN_TIPO'				, 'dd48');
define('DEDALO_RELATION_TYPE_PARENT_TIPO'				, 'dd47');
define('DEDALO_RELATION_TYPE_INDEX_TIPO'				, 'dd96');
define('DEDALO_RELATION_TYPE_STRUCT_TIPO'				, 'dd490');
define('DEDALO_RELATION_TYPE_MODEL_TIPO'				, 'dd98');
define('DEDALO_RELATION_TYPE_LINK'						, 'dd151');
define('DEDALO_RELATION_TYPE_FILTER'					, 'dd675');

#define('DEDALO_RELATION_TYPE_EQUIVALENT_TIPO'			, 'dd47');
define('DEDALO_RELATION_TYPE_RELATED_TIPO'				, 'dd89');
	# Relation related types
	define('DEDALO_RELATION_TYPE_RELATED_UNIDIRECTIONAL_TIPO',  'dd620');
	define('DEDALO_RELATION_TYPE_RELATED_BIDIRECTIONAL_TIPO',   'dd467');
	define('DEDALO_RELATION_TYPE_RELATED_MULTIDIRECTIONAL_TIPO','dd621');
#define('DEDALO_RELATION_TYPE_RECORD_TIPO'				, 'ddXXX'); // working here

# Data frames types
define('DEDALO_DATAFRAME_TYPE_UNCERTAINTY'				, 'dd558');
define('DEDALO_DATAFRAME_TYPE_TIME'						, 'dd559');
define('DEDALO_DATAFRAME_TYPE_SPACE'					, 'dd560');

# Notes
define('DEDALO_NOTES_SECTION_TIPO'						, 'rsc326');
define('DEDALO_NOTES_TEXT_TIPO'							, 'rsc329');
define('DEDALO_NOTES_PUBLICATION_TIPO'					, 'rsc399');

# Structuration notes
define('DEDALO_STRUCTURATION_SECTION_TIPO'				, 'rsc370');
define('DEDALO_STRUCTURATION_TITLE_TIPO'				, 'rsc372');
define('DEDALO_STRUCTURATION_DESCRIPTION_TIPO'			, 'rsc373');

# Indexation notes
define('DEDALO_INDEXATION_SECTION_TIPO'					, 'rsc377');
define('DEDALO_INDEXATION_TITLE_TIPO'					, 'rsc379');
define('DEDALO_INDEXATION_DESCRIPTION_TIPO'				, 'rsc380');

# References (to thesaurus)
define('DEDALO_TS_REFERENCES_SECTION_TIPO'				, 'rsc425');
define('DEDALO_TS_REFERENCES_COMPONENT_TIPO'			, 'rsc426');

# References (to thesaurus)
define('DEDALO_SECTION_INFO_SECTION_GROUP'				, 'dd196');


define('DEDALO_TEXTAREA_FIX_BROQUEN_TAGS_TIPOS'			, serialize( array(DEDALO_COMPONENT_RESOURCES_TR_TIPO)) );

# LANGS
define('DEDALO_LANGS_SECTION_TIPO'						, 'lg1');

# SEARCH PRESETS
define('DEDALO_TEMP_PRESET_SECTION_TIPO'				, 'dd655');

# SEARCH_QUERY_OBJECT OPERATORS
define('OP_OR'											, '$or');
define('OP_AND'											, '$and');

# SEARCH PRESETS
define('DEDALO_SERVICES_SECTION_TIPO'					, 'dd1010');

if (!defined('DEDALO_PROTOCOL')) {
	define('DEDALO_PROTOCOL', 'http://');
}



# TOP_TIPO
if ( false !== ($request_var_top_tipo = get_request_var('top_tipo')) ) {	
	define('TOP_TIPO', $request_var_top_tipo);
}else if ( false !== ($request_var_t = get_request_var('t')) ) {
	define('TOP_TIPO', $request_var_t);
}else if ( false !== ($request_var_t = get_request_var('json')) ) {
	if ($json_obj = json_decode($request_var_t)) {
		if (isset($json_obj->section_tipo)) {
			define('TOP_TIPO', $json_obj->section_tipo);	
		}
	}	
}else if (isset($TOP_TIPO)) {
	define('TOP_TIPO', $TOP_TIPO);	
}else{
	define('TOP_TIPO', false);	
}
# TOP_ID
if ( false !== ($request_var_top_id = get_request_var('top_id')) ) {
	define('TOP_ID', $request_var_top_id);
}else if ( false !== ($request_var_id = get_request_var('id')) ) {
	define('TOP_ID', $request_var_id);
}else{
	define('TOP_ID', false);
}


