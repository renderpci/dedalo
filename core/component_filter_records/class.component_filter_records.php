<?php declare(strict_types=1);
/**
* CLASS COMPONENT_FILTER_RECORDS
* Manages record-level access control for specific section records in Dédalo.
*
* Used exclusively in the User section (dd128) to grant access to individual records
* across different sections, providing finer-grained control than project-based filtering.
*
* Unlike component_filter (project-based), this component allows specifying exactly
* which records a user can access regardless of their project assignments.
*
* Key features:
* - Lists authorized sections the user has permission to access
* - Provides section labels from ontology for user interface display
* - Filters by permission level (value >= 2 required for access)
* - Sorted alphabetically by section label
*
* Data is stored in the 'misc' column of matrix tables.
*
* Extends component_common for standard component functionality.
*
* @package Dédalo
* @subpackage Core
*/
class component_filter_records extends component_common {



	/**
	* GET_DATALIST
	* Get the list of authorized sections and resolve label
	* @return array $sections
	*/
	public function get_datalist() : array {

		// user areas
		$areas_for_user = security::get_ar_authorized_areas_for_user();

		// Filter and validate sections
		$sections = [];
		foreach ($areas_for_user as $area_item) {

			// area_item format:
				// {
				// 	"tipo": "sicfnumisdata0",
				// 	"value": 2
				// }

			// ignore non authorized for user
				if ( (int)$area_item->value < 2 ) {
					continue;
				}

			// resolve model
				$model = ontology_node::get_model_by_tipo($area_item->tipo, true);

			// ignore non sections (areas)
				if ( $model !== 'section' ) {
					continue;
				}

			// resolve label
				$label = ontology_node::get_term_by_tipo($area_item->tipo, DEDALO_DATA_LANG, true, true);

			// add object item with label
				$datalist_item = new stdclass();
					$datalist_item->tipo = $area_item->tipo;
					$datalist_item->permissions = $area_item->value;
					$datalist_item->label = $label;

				$sections[] = $datalist_item;
		}

		// sort by label
		uasort($sections, function($a, $b) {
			return $a->label <=> $b->label;
		});

		// regenerate array keys
		$sections = array_values($sections);


		return $sections;
	}//end get_datalist



}//end class component_filter_records
