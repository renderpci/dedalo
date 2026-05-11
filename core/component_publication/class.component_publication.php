<?php declare(strict_types=1);
/**
* CLASS COMPONENT_PUBLICATION
* Manages record publication status in Dédalo.
*
* Controls whether records are marked for publication to external systems.
* Uses a simple yes/no toggle stored as locator objects referencing
* the publication status section (dd_component_publication_value).
*
* Possible values:
* - null: Not yet decided / default state
* - locator 'yes': Record is marked for publication
* - locator 'no': Record is explicitly excluded from publication
*
* Key features:
* - Simple binary publication control (yes/no)
* - Language-neutral storage (DEDALO_DATA_NOLAN)
* - Sortable by publication status in lists
* - Integration with diffusion/publication systems
*
* Data is stored in the 'relation' column of matrix tables.
*
* Extends component_relation_common for relationship management capabilities.
*
* @package Dédalo
* @subpackage Core
*/
class component_publication extends component_relation_common {



	/**
	* CLASS VARS
	*/
		/**
		 * Default relation type for publication status linking relationships.
		 * Inherited from DEDALO_RELATION_TYPE_LINK constant.
		 * Defines the type of relationship created when publication status is set.
		 * @var ?string $default_relation_type
		 */
		protected ?string $default_relation_type = DEDALO_RELATION_TYPE_LINK;

		/**
		 * Properties used to detect duplicate locators when adding publication status.
		 * Locators with identical values for all these properties are considered duplicates.
		 * - section_tipo : Target publication status section type identifier
		 * - section_id : Target publication status record ID (yes/no)
		 * - type : Relation type (typically link type)
		 * - from_component_tipo : Source component tipo creating the relation
		 * @var array $test_equal_properties
		 */
		public array $test_equal_properties = ['section_tipo','section_id','type','from_component_tipo'];



	/**
	* __CONSTRUCT
	* @param string $tipo = null
	* @param mixed $section_id = null
	* @param string $mode = 'list'
	* @param string|null $lang = DEDALO_DATA_NOLAN
	* @param string|null $section_tipo = null
	* @param bool $cache = true
	* @return void
	*/
	protected function __construct( string $tipo, mixed $section_id=null, string $mode='list', string $lang=DEDALO_DATA_NOLAN, ?string $section_tipo=null, bool $cache=true ) {

		// Force always DEDALO_DATA_NOLAN
		$this->lang = DEDALO_DATA_NOLAN;

		// construct the component normally
		parent::__construct($tipo, $section_id, $mode, $this->lang, $section_tipo, $cache);
	}//end __construct



	/**
	* GET_SORTABLE
	* @return bool
	* 	Default is true. Override when component is sortable
	*/
	public function get_sortable() : bool {

		return true;
	}//end get_sortable



}//end class component_publication
