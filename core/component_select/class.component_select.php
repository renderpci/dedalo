<?php declare(strict_types=1);
/**
* CLASS COMPONENT SELECT
*
*/
class component_select extends component_relation_common {



	/**
	* CLASS VARS
	*/
		/**
		 * Default relation type for select components (DEDALO_RELATION_TYPE_LINK).
		 * Defines the ontology tipo used for link-type relations in this component.
		 * @var ?string $default_relation_type
		 */
		protected ?string $default_relation_type = DEDALO_RELATION_TYPE_LINK;

		/**
		 * Properties used to verify duplicate locators when adding relations.
		 * Array of property names that must match to consider two locators equal.
		 * @var array $test_equal_properties
		 */
		public array $test_equal_properties = ['section_tipo','section_id','type','from_component_tipo'];



	/**
	* GET_SORTABLE
	* @return bool true
	* 	Default is false. Override when component is sortable
	*/
	public function get_sortable() : bool {

		return true;
	}//end get_sortable



}//end class component_select
