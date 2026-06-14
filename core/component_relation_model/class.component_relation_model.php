<?php declare(strict_types=1);
/**
* CLASS COMPONENT_RELATION_MODEL
* Manages model-type hierarchical relations between sections in Dédalo.
*
* This component stores locators whose relation type is DEDALO_RELATION_TYPE_MODEL_TIPO
* ('dd98'). Each locator links a record in the owning section to a record in a
* "model" section — the section that acts as the structural template or catalogue
* entry for the owning record's section type.
*
* Target section resolution
* -------------------------
* The set of allowed target section tipos is determined in one of two ways,
* controlled by properties->target_mode:
*
* - 'free': target_values is read directly from the ontology properties object.
*   Use this when the target section is fixed and does not depend on the
*   hierarchy tree.
*
* - default (hierarchy mode): the component looks up the hierarchy1 record whose
*   hierarchy53 (DEDALO_HIERARCHY_TARGET_SECTION_TIPO) component value matches
*   $this->section_tipo. From that hierarchy1 record it reads the value of
*   hierarchy58 (DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO), which holds the
*   target section tipo. If the hierarchy lookup yields nothing, a last-resort
*   fallback derives the target tipo as prefix.'2' (e.g. 'es2' for section_tipo
*   'es1').
*
* Client representation
* ---------------------
* On the browser side this component is a pure alias of component_select
* (see js/component_relation_model.js). The list of selectable values is
* provided by the 'datalist' property of the JSON data item, populated via
* get_list_of_values() (inherited from component_relation_common).
*
* Data shape
* ----------
* The component dato is stored in the 'relation' JSONB column as an array of
* locator objects. Each locator has at minimum:
*   { section_tipo, section_id, type, from_component_tipo }
* where 'type' is always DEDALO_RELATION_TYPE_MODEL_TIPO ('dd98').
*
* Duplicate detection uses $test_equal_properties to hash-compare locators
* before insertion (via validate_data_element in component_relation_common).
*
* Relationships
* -------------
* Extends:   component_relation_common
* Client JS: component_select (direct alias)
* Constants (core/base/dd_tipos.php):
*   DEDALO_RELATION_TYPE_MODEL_TIPO           = 'dd98'
*   DEDALO_HIERARCHY_SECTION_TIPO             = 'hierarchy1'
*   DEDALO_HIERARCHY_TARGET_SECTION_TIPO      = 'hierarchy53'
*   DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO = 'hierarchy58'
*
* @package Dédalo
* @subpackage Core
*/
class component_relation_model extends component_relation_common {



	/**
	* CLASS VARS
	*/
		/**
		* Canonical locator type for model relations: DEDALO_RELATION_TYPE_MODEL_TIPO ('dd98').
		* Overrides the null default declared in component_relation_common so that
		* validate_data_element assigns the correct 'type' key to every locator
		* without requiring per-record ontology configuration.
		* @var ?string $default_relation_type
		*/
		protected ?string $default_relation_type = DEDALO_RELATION_TYPE_MODEL_TIPO;

		/**
		* Instance cache for the resolved target section tipos.
		* Populated on first call to get_ar_target_section_tipo() and reused on
		* subsequent calls within the same request. Overrides the parent property
		* to make the hierarchy-based resolution visible as an instance cache rather
		* than a generic DDO-driven one.
		* @var array $ar_target_section_tipo
		*/
		protected array $ar_target_section_tipo = [];

		/**
		* Locator properties used by validate_data_element (via
		* get_locator_properties_to_check() override path) to detect duplicate
		* locators before insertion. Two locators are considered equal when all
		* listed properties match.
		* Note: component_relation_model locators are non-translatable, so 'lang'
		* is intentionally absent from this list.
		* @var array $test_equal_properties
		*/
		public array $test_equal_properties = ['section_tipo','section_id','type','from_component_tipo'];



	/**
	* GET_AR_TARGET_SECTION_TIPO
	* Resolves and caches the set of target section tipos for this relation component.
	*
	* Overrides the DDO-driven implementation in component_common with a
	* hierarchy-aware lookup. The resolution path depends on properties->target_mode:
	*
	*   'free'    — target_values in the ontology properties already contains the
	*               explicit list; cast to array and return it directly.
	*
	*   default   — three-stage hierarchy lookup:
	*               1. Find the hierarchy1 record whose hierarchy53 component value
	*                  equals $this->section_tipo (via hierarchy::get_hierarchy_section).
	*               2. From that hierarchy1 record, read the hierarchy58 component
	*                  value, which holds the target section tipo string.
	*               3. If stage 1 or 2 yields nothing (section not registered in the
	*                  hierarchy tree), fall back to prefix.'2' — e.g. section_tipo
	*                  'es1' → prefix 'es' → fallback target 'es2'.
	*
	* Results are wrapped in a single-element array to match the interface contract
	* expected by callers (e.g. get_list_of_values, component_relation_model_json.php).
	*
	* @return array - Array of target section tipo strings; empty array on error
	*/
	public function get_ar_target_section_tipo() : array {

		// cache
		// Return the already-resolved value so the hierarchy search runs at most once
		// per instance lifetime (the section_tipo cannot change after construction).
			if(!empty($this->ar_target_section_tipo)) {
				return $this->ar_target_section_tipo;
			}

		// section_tipo check
		// A missing section_tipo makes every subsequent lookup meaningless; log and
		// bail early rather than letting the hierarchy search run against an empty string.
			$section_tipo = $this->get_section_tipo();
			if (empty($section_tipo)) {
				$msg = "Error. section_tipo is not defined! "
					. ' tipo: ' . $this->tipo . PHP_EOL
					. ' section_tipo: ' . $section_tipo . PHP_EOL
					. ' section_id: '   . $this->section_id;
				debug_log(__METHOD__ . ' ' . $msg, logger::ERROR);
				return [];
			}

		$target_mode = $this->properties->target_mode ?? null;
		switch ($target_mode) {

			case 'free':
				// Free mode: target_values is already the authoritative list, set by the
				// ontology administrator. Cast to array in case a single string was stored.
				$ar_target_section_tipo = (array)$this->properties->target_values;
				break;

			default:
				// Hierarchy mode: resolve target section via the hierarchy1 registry.
				// hierarchy53 (DEDALO_HIERARCHY_TARGET_SECTION_TIPO) stores the section
				// tipo that each hierarchy1 record applies to.
				// hierarchy58 (DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO) stores the
				// corresponding target (model) section tipo for that section.
				// try to calculate from hierarchy section looking in target model value of hierarchy
					$section_tipo				= $this->section_tipo;
					$hierarchy_component_tipo	= DEDALO_HIERARCHY_TARGET_SECTION_TIPO;
					$section_id					= hierarchy::get_hierarchy_section($section_tipo, $hierarchy_component_tipo);

					if (!empty($section_id)) {
						// get target section model component value
						// Instantiate the hierarchy58 component on the found hierarchy1 record
						// to read the model section tipo it declares.
							$model		= ontology_node::get_model_by_tipo(DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO,true);
							$component	= component_common::get_instance(
								$model,
								DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO,
								$section_id,
								'list',
								DEDALO_DATA_NOLAN,
								DEDALO_HIERARCHY_SECTION_TIPO
							);

							$target_section_tipo = $component->get_valor();
					}

				// final fallback (calculated from current prefix)
				// (!) This is a best-effort guess. Sections whose model section does not
				// follow the '<prefix>2' naming convention will silently get the wrong
				// target. Administrators should register the section in the hierarchy
				// tree to avoid this path.
					if (empty($target_section_tipo)) {
						$prefix = get_tld_from_tipo($section_tipo);
						$target_section_tipo = $prefix.'2';
					}

				// set into array
					$ar_target_section_tipo = [$target_section_tipo];
				break;
		}//end switch ($target_mode)


		// Fix value
		// Persist into the instance cache so repeated calls within the same request
		// do not re-execute the hierarchy search.
			$this->ar_target_section_tipo = $ar_target_section_tipo;


		return $ar_target_section_tipo;
	}//end get_ar_target_section_tipo



	/**
	* GET_SORTABLE
	* Reports that this component's locator list supports manual reordering.
	*
	* The parent implementation (component_common::get_sortable) returns false for
	* DEDALO_NOTES_TEXT_TIPO ('rsc329') and true for everything else; this override
	* makes the sortable contract explicit for component_relation_model regardless
	* of any future changes to the parent's exclusion list.
	*
	* Returning true enables the drag-to-reorder handle in the component_select UI
	* (which this component aliases on the client side).
	*
	* @return bool - Always true; model-relation locators may be manually reordered
	*/
	public function get_sortable() : bool {

		return true;
	}//end get_sortable



}//end class component_relation_model
