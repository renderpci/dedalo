<?php declare(strict_types=1);
/**
* CLASS DD_COMPONENT_TEXT_AREA_API
* Remote API façade for component_text_area tag operations.
*
* Exposes a strict allowlist of static actions callable via the Dédalo RQO
* (Request Query Object) API. All dispatched calls arrive through
* dd_tools_api / the v1 JSON endpoint, which enforces that only names
* listed in API_ACTIONS are reachable from the outside (SEC-024).
*
* Responsibilities:
* - Delete semantic inline tags from a rich-text component across all
*   active languages (used by tool_indexation to remove index/reference
*   tags without touching the human-readable prose).
* - Resolve and return structured tag metadata for a given component
*   instance so the client can render tag panels (index, person, note,
*   reference) without re-fetching the raw HTML.
*
* The class is final and carries no instance state; every method is
* public static, matching the API dispatcher's call convention.
*
* Related:
* - component_text_area  — the data component whose methods are wrapped here
* - dd_tools_api          — top-level dispatcher that enforces API_ACTIONS
* - tool_indexation       — primary caller of delete_tag
*
* @package Dédalo
* @subpackage Core
*/
final class dd_component_text_area_api {



	/**
	* Explicit allowlist of methods callable as remote API actions (SEC-024).
	* Adding a new public static method does NOT automatically expose it to the
	* network; it must also appear here. Any name absent from this array is
	* rejected by the dispatcher before the method is ever invoked.
	* @var array<int,string> API_ACTIONS
	*/
	public const API_ACTIONS = [
		'delete_tag',
		'get_tags_info'
	];



	/**
	* DELETE_TAG
	* Removes a single semantic inline tag from a component_text_area across
	* all active language variants of the record.
	*
	* Rich-text content stores indexation and reference tags as HTML markup
	* (e.g. <span data-tag-id="2" data-tag-type="index">…</span>). When an
	* index entry is deleted from tool_indexation, the corresponding tag must
	* be scrubbed from every language copy of the text to keep the HTML
	* internally consistent. This method delegates that multi-lang sweep to
	* component_text_area::delete_tag_from_all_langs().
	*
	* Security: requires write permission (level 2) on the containing section.
	* The check is performed before the component instance is created.
	*
	* @param object $rqo - RQO with the following shape:
	* {
	*   action  : "delete_tag",
	*   dd_api  : 'dd_component_text_area_api',
	*   source  : {
	*     section_tipo : 'rsc167', // section that owns the component
	*     section_id   : '2',      // record identifier
	*     tipo         : 'rsc36',  // component_text_area ontology tipo
	*     lang         : 'lg-spa'  // initiating language (all langs are affected)
	*   },
	*   options : {
	*     tag_id : '2',     // numeric string id of the tag to remove
	*     type   : 'index'  // tag category: 'index' | 'reference' | etc.
	*   }
	* }
	* @return object $response - stdClass with:
	*   - result  bool  true when at least one language copy was modified
	*   - msg     array human-readable summary lines
	*   - errors  array error strings (empty on success)
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

		// SEC: write permission required to delete tags from the component
			security::assert_section_permission($section_tipo, 2, __METHOD__);

		// component_text_area. Remove tag in all langs
		// Use 'list' mode — we need multi-lang data access without triggering
		// the edit-mode UI resolution path.
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
			// $ar_tag_deleted keys are the lang codes that were actually modified;
			// an empty array means the tag was not found in any language copy.
			$n_deleted			= count($ar_tag_deleted) ?? 0;
			$response->msg[]	= $n_deleted>0
				? "Deleted tag: $tag_id ($type) in ".(string)$n_deleted." langs: ".to_string($ar_tag_deleted)." ($model_name - $tipo)"
				: "No tags are deleted in $model_name tipo: '$tipo' tag_id: '$tag_id' type: '$type'";

			debug_log(__METHOD__." AR_TAG_DELETED: ".to_string($ar_tag_deleted), logger::DEBUG);

		// response result
			$response->result = ($n_deleted > 0);


		return $response;
	}//end delete_tag



	/**
	* GET_TAGS_INFO
	* Resolves and returns structured metadata for the semantic inline tags
	* embedded in a component_text_area record, filtered to the tag categories
	* requested by the caller.
	*
	* component_text_area rich text can contain several classes of inline tags:
	* - 'index'     — thesaurus descriptor links; resolved via get_tags_data_as_terms()
	* - 'person'    — speaker/informant attribution links used in transcription
	*                 workflows; built from related-section person records
	* - 'note'      — inline editorial annotations; resolved via get_annotations()
	* - 'reference' — cross-record reference links; resolved via get_tags_data_as_terms()
	*
	* Only categories both present in $ar_types AND configured in the component's
	* ontology properties (tags_index, tags_persons, tags_notes, tags_reference)
	* are included in the result. This allows the client to request all categories
	* at once and receive only what is actually configured, without extra round-trips.
	*
	* Security: requires read permission (level 1) on the containing section.
	*
	* (!) The $rqo->action sample in this doc-block mistakenly shows "delete_tag"
	*     — the correct action value is "get_tags_info".
	*
	* @param object $rqo - RQO with the following shape:
	* {
	*   action  : "get_tags_info",
	*   dd_api  : 'dd_component_text_area_api',
	*   source  : {
	*     section_tipo : 'rsc167', // section that owns the component
	*     section_id   : '2',      // record identifier
	*     tipo         : 'rsc36',  // component_text_area ontology tipo
	*     lang         : 'lg-spa'  // language to load the component in
	*   },
	*   options : {
	*     ar_type : ['index', 'note', 'reference', 'person']
	*              // array of tag category keys to include in the response
	*   }
	* }
	* @return object $response - stdClass with:
	*   - result  object  stdClass with optional keys tags_index, tags_persons,
	*                     tags_notes, tags_reference (only populated categories)
	*   - msg     array   human-readable summary lines
	*   - errors  array   error strings (empty on success)
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

		// SEC: read permission required to view tag info
			security::assert_section_permission($section_tipo, 1, __METHOD__);

		// component_text_area. Remove tag in all langs
		// (!) The inline comment above ("Remove tag in all langs") is stale —
		// this block instantiates the component for reading, not deletion.
			$model_name				= ontology_node::get_model_by_tipo($tipo, true);
			$component_text_area	= component_common::get_instance(
				$model_name,
				$tipo,
				$section_id,
				'list',
				$lang,
				$section_tipo
			);

			// properties gate: each tag category is only active when the
			// corresponding key exists in the component's ontology properties
			// (e.g. properties->tags_index, properties->tags_persons, …).
			// Missing keys mean the ontology does not configure that tag type
			// for this component instance.
			$properties		= $component_text_area->get_properties();

			$tags_info = new stdClass();


			// INDEX
			// Resolve each index tag locator to its thesaurus term label.
				if(in_array('index', $ar_types) && isset($properties->tags_index)) {
					$tags_info->tags_index = $component_text_area->get_tags_data_as_terms('index');
				}

			// PERSON
			// Tags for persons (speakers/informants) used in transcription workflows
			// where each speech turn must be attributed to a named participant.
			// Person data comes from a related section (e.g. the interview's participant
			// list) rather than from the thesaurus, so the resolution path differs from
			// 'index' / 'reference'.
				if(in_array('person', $ar_types) && isset($properties->tags_persons)) {

					// related_sections add
					// Fetch the section-relation data that links this text component's
					// record to the participant records in related sections.
						$related_sections = $component_text_area->get_related_sections();

					// tags_persons
						$tags_persons = [];
						// related_sections
						// Extract the 'sections' sub-entry from the relation data envelope.
						$related_sections_data = $related_sections->data ?? [];
						$obj_data_sections = array_find($related_sections_data, function($el){
							return $el->typo==='sections';
						}) ?? new stdClass();
						$ar_related_sections = $obj_data_sections->value ?? [];
						// tags_persons_config
						// Iterate over each related-section tipo configured under
						// properties->tags_persons (one entry per participant section type).
						$tags_persons_config = $properties->tags_persons;
						foreach ($tags_persons_config as $related_section_tipo => $current_value) {
							$ar_tags_persons =  $component_text_area->get_tags_persons($related_section_tipo, $ar_related_sections);
							$tags_info->tags_persons = [...$tags_persons, ...$ar_tags_persons];
						}
				}

			// NOTE
			// Inline editorial annotations (footnote-style comments embedded in text).
				if(in_array('note', $ar_types) && isset($properties->tags_notes)) {
					$tags_info->tags_notes = $component_text_area->get_annotations();
				}
			// REFERENCE
			// Cross-record reference tags resolved the same way as index tags but
			// pointing to section records rather than thesaurus descriptors.
				if(in_array('reference', $ar_types) && isset($properties->tags_reference)) {
					$tags_info->tags_reference = $component_text_area->get_tags_data_as_terms('reference');
				}

		// response result
		// The result is the populated $tags_info object (false on auth failure,
		// which security::assert_section_permission handles by throwing before
		// we reach this point).
			$response->result = $tags_info;


		return $response;
	}//end get_tags_info


}//end dd_component_text_area_api
