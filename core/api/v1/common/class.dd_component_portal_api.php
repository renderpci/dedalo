<?php declare(strict_types=1);
/**
* DD_COMPONENT_PORTAL_API
* Manage API REST data flow of the component with Dédalo
* This class is a collection of component exposed methods to the API using
* a normalized RQO (Request Query Object)
*
*/
final class dd_component_portal_api {



	/**
	* DELETE_LOCATOR
	* Remove the coincident locators from component dato and save the result
	* This method is used by tool_indexation to remove tags from component_portal related to transcription
	*
	* @param object $rqo
	* 	Sample:
	* {
	* 	action	: "delete_locator",
	*	dd_api	: 'dd_component_portal_api',
	*	source	: {
	*		section_tipo	: 'rsc167', // current component_text_area section_tipo
	*		section_id		: '2', // component_text_area section_id
	*		tipo			: 'rsc36', // component_text_area tipo
	*		lang			: 'lg-spa' // component_text_area lang
	*	},
	* 	options : {
	* 		locator			: {tag_id:"2",type:"dd96"} // object locator full or partial
	* 		ar_properties 	: ['tag_id','type'] // properties to compare
	* 	}
	* }
	* @return object $response
	*/
	public static function delete_locator( object $rqo ) : object {

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
			$lang			= $source->lang;

		// options
			$options		= $rqo->options;
			$locator		= $options->locator; // object e.g. {tag_id:"2",type:"dd96"}
			$ar_properties	= $options->ar_properties ?? []; // array properties to compare e.g. ['tag_id','type']


		// tags_index. component. Remove locators with the tag_id given
			$model_name	= RecordObj_dd::get_model_name_by_tipo($tipo,true);
			$lang		= common::get_element_lang($tipo, DEDALO_DATA_LANG);
			$component	= component_common::get_instance(
				$model_name,
				$tipo,
				$section_id,
				'list',
				$lang,
				$section_tipo
			);
			// stored locator sample
				// {
				// 	"type": "dd96",
				// 	"tag_id": "19",
				// 	"section_id": "2",
				// 	"section_tipo": "dc1",
				// 	"section_top_id": "2",
				// 	"section_top_tipo": "ich100",
				// 	"tag_component_tipo": "rsc36",
				// 	"from_component_tipo": "rsc860"
				// }

		// original dato. Store to compare later
			$original_dato = $component->get_dato();
			if (empty($original_dato)) {
				$response->msg[] = "No locators are removed ($model_name - $tipo). The component dato is empty";
				$response->result = 0;
				return $response;
			}

		// remove
			$removed = $component->remove_locator_from_dato(
				$locator, // object locator full or partial
				$ar_properties // array properties to compare
			);

			if ($removed===true) {
				$current_dato = $component->get_dato();
				$total = count($original_dato) - count($current_dato);
				$component->Save();
				$response->msg[] = "Deleted $total locators ($model_name - $tipo)";
				// response result
				$response->result = $total;
			}else{
				$response->msg[] = "No locators are removed ($model_name - $tipo)";
				$response->result = 0;
			}


		return $response;
	}//end delete_locator



}//end dd_component_portal_api
