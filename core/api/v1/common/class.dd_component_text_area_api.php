<?php declare(strict_types=1);
/**
* DD_COMPONENT_TEXT_AREA_API
* Manage API REST data flow of the component with Dédalo
* This class is a collection of component exposed methods to the API using
* a normalized RQO (Request Query Object)
*
*/
final class dd_component_text_area_api {



	/**
	* DELETE_TAG
	* Delete given tag in all langs of component_text_area
	* Usually used to delete indexation tags from tool_indexation
	*
	* @param object $rqo
	* 	Sample:
	* {
	* 	action	: "delete_tag",
	*	dd_api	: 'dd_component_text_area_api',
	*	source	: {
	*		section_tipo	: 'rsc167', // current component_text_area section_tipo
	*		section_id		: '2', // component_text_area section_id
	*		tipo			: 'rsc36', // component_text_area tipo
	*		lang			: 'lg-spa' // component_text_area lang	*
	*	},
	* 	options : {
	* 		tag_id : '2', // current selected tag
	* 		type : 'index' // string e.g. 'index'
	* 	}
	* }
	* @return object $response
	*/
	public static function delete_tag( object $rqo ) : object {

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= [];
				$response->errors	= [];

		// source
			$source			= $rqo->source;
			$section_tipo	= $source->section_tipo;
			$section_id		= $source->section_id;
			$tipo			= $source->tipo;
			$lang			= $source->lang; // string e.g. 'lg-spa'

		// options
			$options	= $rqo->options;
			$tag_id		= $options->tag_id; // string e.g. '2'
			$type		= $options->type; // string e.g. 'index'

		// component_text_area. Remove tag in all langs
			$model_name				= ontology_node::get_model_by_tipo($tipo,true);
			$component_text_area	= component_common::get_instance(
				$model_name,
				$tipo,
				$section_id,
				'list',
				$lang,
				$section_tipo
			);

			$ar_tag_deleted = (array)$component_text_area->delete_tag_from_all_langs(
				$tag_id, // string tag_id
				$type // string tag_type
			);
			$n_deleted			= count($ar_tag_deleted) ?? 0;
			$response->msg[]	= $n_deleted>0
				? "Deleted tag: $tag_id ($type) in $n_deleted langs: ".to_string($ar_tag_deleted)." ($model_name - $tipo)"
				: "No tags are deleted in $model_name tipo: '$tipo' tag_id: '$tag_id' type: '$type'";

			debug_log(__METHOD__." AR_TAG_DELETED: ".to_string($ar_tag_deleted), logger::DEBUG);


		// (!) Moved to self component portal API method 'remove_locator'
		// tags_index. indexing_component. Remove locators with the tag_id given
			// $properties					= $component_text_area->get_properties();
			// $tags_index					= $properties->tags_index;
			// $indexing_component_tipo		= $tags_index->tipo;
			// $indexing_section_tipo		= $tags_index->section_tipo==='self' ? $section_tipo : $tags_index->section_tipo;
			// $indexing_section_id			= $tags_index->section_id==='self' ? $section_id : $tags_index->section_id;
			// $indexing_model_name			= ontology_node::get_model_by_tipo($indexing_component_tipo,true);
			// $indexing_lang				= common::get_element_lang($indexing_component_tipo, DEDALO_DATA_LANG);
			// $indexing_component			= component_common::get_instance(
			// 	$indexing_model_name,
			// 	$indexing_component_tipo,
			// 	$indexing_section_id,
			// 	'list',
			// 	$indexing_lang,
			// 	$indexing_section_tipo
			// );
			// // stored locator sample
			// 	// {
			// 	// 	"type": "dd96",
			// 	// 	"tag_id": "19",
			// 	// 	"section_id": "2",
			// 	// 	"section_tipo": "dc1",
			// 	// 	"section_top_id": "2",
			// 	// 	"section_top_tipo": "ich100",
			// 	// 	"tag_component_tipo": "rsc36",
			// 	// 	"from_component_tipo": "rsc860"
			// 	// }

			// $indexing_component_original_dato = $indexing_component->get_dato();

			// $pseudo_locator = new stdClass();
			// 	$pseudo_locator->tag_id	= $tag_id;
			// 	$pseudo_locator->type	= DEDALO_RELATION_TYPE_INDEX_TIPO; // dd96

			// $ar_properties	= ['tag_id','type']; // properties to compare
			// $removed		= $indexing_component->remove_locator_from_dato($pseudo_locator, $ar_properties);
			// if ($removed===true) {
			// 	$indexing_component_current_dato = $indexing_component->get_dato();
			// 	$total = count($indexing_component_original_dato) - count($indexing_component_current_dato);
			// 	$indexing_component->Save();
			// 	$response->msg[] = 'Deleted '.$total.' locators with tag_id '.$tag_id ." ($indexing_model_name - $indexing_component_tipo)";
			// }else{
			// 	$response->msg[] = 'No locators are removed with tag_id '.$tag_id ." ($indexing_model_name - $indexing_component_tipo)";
			// }


		// response result
			$response->result = ($n_deleted > 0);


		return $response;
	}//end delete_tag



	/**
	* GET_TAGS_INFO
	* Resolve the specific tags defined by the rqo request
	* Resolve the tag locators with the term
	* Resolve the annotations and person name/surname and his role
	* @param object $rqo
	* 	Sample:
	* {
	* 	action	: "delete_tag",
	*	dd_api	: 'dd_component_text_area_api',
	*	source	: {
	*		section_tipo	: 'rsc167', // current component_text_area section_tipo
	*		section_id		: '2', // component_text_area section_id
	*		tipo			: 'rsc36', // component_text_area tipo
	*		lang			: 'lg-spa' // component_text_area lang	*
	*	},
	* 	options : {
	* 		type : ['index'] // array e.g. ['index'.'note','reference']
	* 	}
	* }
	* @return object $response
	*/
	public static function get_tags_info(object $rqo) : object {

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= [];
				$response->errors	= [];

		// source
			$source			= $rqo->source;
			$section_tipo	= $source->section_tipo;
			$section_id		= $source->section_id;
			$tipo			= $source->tipo;
			$lang			= $source->lang; // string e.g. 'lg-spa'

		// options
			$options	= $rqo->options;
			$ar_types	= $options->ar_type; // string e.g. 'index'

		// component_text_area. Remove tag in all langs
			$model_name				= ontology_node::get_model_by_tipo($tipo, true);
			$component_text_area	= component_common::get_instance(
				$model_name,
				$tipo,
				$section_id,
				'list',
				$lang,
				$section_tipo
			);

			$properties		= $component_text_area->get_properties();

			$tags_info = new stdClass();


			// INDEX
				if(in_array('index', $ar_types) && isset($properties->tags_index)) {
					$tags_info->tags_index = $component_text_area->get_tags_data_as_terms('index');
				}

			// PERSON
				// person. tags for persons
				// get the tags for persons, will be used when the text_area need include the "person that talk" in transcription
				if(in_array('person', $ar_types) && isset($properties->tags_persons)) {

					// related_sections add
						$related_sections = $component_text_area->get_related_sections();

					// tags_persons
						$tags_persons = [];
						// related_sections
						$related_sections_data = $related_sections->data ?? [];
						$obj_data_sections = array_find($related_sections_data, function($el){
							return $el->typo==='sections';
						}) ?? new stdClass();
						$ar_related_sections = $obj_data_sections->value ?? [];
						// tags_persons_config
						$tags_persons_config = $properties->tags_persons;
						foreach ($tags_persons_config as $related_section_tipo => $current_value) {
							$ar_tags_persons =  $component_text_area->get_tags_persons($related_section_tipo, $ar_related_sections);
							$tags_info->tags_persons = array_merge($tags_persons, $ar_tags_persons);
						}
				}

			// NOTE
				if(in_array('note', $ar_types) && isset($properties->tags_notes)) {
					$tags_info->tags_notes = $component_text_area->get_annotations();
				}
			// REFERENCE
				if(in_array('reference', $ar_types) && isset($properties->tags_reference)) {
					$tags_info->tags_reference = $component_text_area->get_tags_data_as_terms('reference');
				}

		// response result
			$response->result = $tags_info;


		return $response;
	}//end get_tags_info


}//end dd_component_text_area_api
