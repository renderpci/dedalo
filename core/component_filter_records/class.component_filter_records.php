<?php declare(strict_types=1);
/**
* CLASS COMPONENT_FILTER_RECORDS
* Manages the filter records component that is loacated into the User section (dd128) to set
* the specific records that the user can access to.
* data_column_name : 'misc'
*/
class component_filter_records extends component_common {


	// Property to enable or disable the get and set data in different languages
	protected $supports_translation = false;



	/**
	* GET_GRID_VALUE
	* Alias of component_common->get_grid_value
	* @param object|null $ddo = null
	*
	* @return dd_grid_cell_object $dd_grid_cell_object
	*/
	// public function get_grid_value( ?object $ddo=null ) : dd_grid_cell_object {

	// 	$dd_grid_cell_object = parent::get_grid_value($lang, $ddo);

	// 	// map values to JOSN to allow render it in list
	// 		if (!empty($dd_grid_cell_object->value)) {
	// 			$dd_grid_cell_object->value = array_map(function($el){
	// 				return json_encode($el);
	// 			}, $dd_grid_cell_object->value);
	// 		}


	// 	return $dd_grid_cell_object;
	// }//end get_grid_value



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
