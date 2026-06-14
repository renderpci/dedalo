<?php declare(strict_types=1);
/**
* CLASS DD_COMPONENT_PORTAL_API
* Remote API action handler for component_portal operations.
*
* Exposes a curated allowlist of component_portal methods as REST API actions
* reachable via the normalized RQO (Request Query Object) protocol. Every method
* here maps directly to an action key listed in API_ACTIONS; callers must include
* that key as the `action` field in the RQO body routed through dd_manager.
*
* Current surface:
* - delete_locator : Remove matching locators from a portal component and persist
*
* Primary caller: tool_indexation (client JS), which uses component_portal::delete_locator()
* on the JavaScript side to invoke this endpoint when a tagged reference (e.g. an index
* entry pointing to a transcription word) is deleted and the corresponding portal link
* must be cleaned up server-side.
*
* Security model: every action asserts the required permission level via
* security::assert_section_permission() before touching any data. Write operations
* require level 2.
*
* This class follows the same static, final, no-instantiation pattern as the other
* dd_component_*_api classes in this directory. It does NOT extend any base class.
*
* @package Dédalo
* @subpackage Core
*/
final class dd_component_portal_api {



	/**
	* SEC-024: explicit allowlist of methods callable as remote API actions.
	* Adding a new public-static method does NOT make it remotely callable;
	* it must also be added here.
	*/
	public const API_ACTIONS = [
		'delete_locator'
	];



	/**
	* DELETE_LOCATOR
	* Remove the coincident locators from component data and save the result
	* This method is used by tool_indexation to remove tags from component_portal related to transcription
	*
	* Resolves the target component_portal instance from the RQO source locator,
	* delegates matching and removal to component_relation_common::remove_locator_from_data(),
	* and calls Save() only when at least one locator was actually removed.
	*
	* The `locator` option is a partial or full locator object; only the properties
	* listed in `ar_properties` are compared when looking for matches. This allows
	* caller-controlled precision: e.g. matching only by `tag_id` + `type` to remove
	* all portal links referencing a specific index tag regardless of other fields.
	*
	* Response shape:
	*   result  int|false  — number of removed locators (0 = none removed), false on error
	*   msg     string[]   — human-readable outcome messages
	*   errors  string[]   — validation/error messages; non-empty means result is false
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
	* @throws permission_exception When the current user lacks write access to $section_tipo
	*/
	public static function delete_locator( object $rqo ) : object {

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= [];
				$response->errors	= [];

		// source
			// REL-05: read defensively and validate up front; the $lang read here was
			// dead (immediately overwritten by common::get_element_lang() below).
			$source			= $rqo->source ?? null;
			$section_tipo	= is_object($source) ? ($source->section_tipo ?? null) : null;
			$section_id		= is_object($source) ? ($source->section_id ?? null) : null;
			$tipo			= is_object($source) ? ($source->tipo ?? null) : null;

		// options
			$options		= $rqo->options ?? null;
			$locator		= is_object($options) ? ($options->locator ?? null) : null; // object e.g. {tag_id:"2",type:"dd96"}
			$ar_properties	= is_object($options) ? ($options->ar_properties ?? []) : []; // array properties to compare e.g. ['tag_id','type']

		// REL-05: validate required inputs before touching permission / ontology calls
			if (empty($section_tipo) || empty($tipo) || $section_id===null || !is_object($locator)) {
				$response->errors[] = 'Missing required source/options (section_tipo, tipo, section_id, locator)';
				return $response;
			}

		// SEC: write permission required to delete data from the component
			security::assert_section_permission($section_tipo, 2, __METHOD__);

		// tags_index. component. Remove locators with the tag_id given
			$model_name	= ontology_node::get_model_by_tipo($tipo,true);
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

		// original data. Store to compare later
			$original_data = $component->get_data();
			if (empty($original_data)) {
				$response->msg[] = "No locators are removed ($model_name - $tipo). The component data is empty";
				$response->result = 0;
				return $response;
			}

		// remove
			$removed = $component->remove_locator_from_data(
				$locator, // object locator full or partial
				$ar_properties // array properties to compare
			);

			if ($removed===true) {
				$current_data = $component->get_data();
				$total = count($original_data) - count($current_data);
				$component->Save();
				$response->msg[] = "Deleted " . (string)$total . " locators ($model_name - $tipo)";
				// response result
				$response->result = $total;
			}else{
				$response->msg[] = "No locators are removed ($model_name - $tipo)";
				$response->result = 0;
			}


		return $response;
	}//end delete_locator



}//end dd_component_portal_api
