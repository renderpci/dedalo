<?php declare(strict_types=1);
/*
* CLASS COMPONENT_CHECK_BOX
*
*
*/
class component_check_box extends component_relation_common {



	// relation_type defaults
	protected $default_relation_type		= DEDALO_RELATION_TYPE_LINK;
	protected $default_relation_type_rel	= null;


	// test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = ['section_tipo','section_id','type','from_component_tipo'];



	/**
	* GET_DATALIST
	* Get datalist for check_box component.
	* Add tool name and always_active value to the datalist when tipo is 'dd1353'
	* @param ?string $lang = DEDALO_DATA_LANG
	* @return array $datalist
	* 	Array of objects
	*/
	public function get_datalist( ?string $lang=DEDALO_DATA_LANG ) : array {

		// Execute get_ar_list_of_values
		$ar_list_of_values_response = component_common::get_ar_list_of_values($lang, false);

		$datalist = $ar_list_of_values_response->result ?? [];

		// Add tool information when the component is component_security_tools (dd1353).
		// The component_security_tools is built as component_check_box and rendered with view 'view_tools'.
		// This information is required to get specific tool information.
		if($this->tipo===DEDALO_COMPONENT_SECURITY_TOOLS_PROFILES_TIPO) {
			$datalist = tool_common::hydrate_tools_info($datalist, $lang);
		}


		return $datalist;
	}//end get_datalist



	/**
	* GET_SORTABLE
	* @return bool
	* Default for component_relation_common is false. Override to true
	*/
	public function get_sortable() : bool {

		return true;
	}//end get_sortable



}//end class component_check_box
