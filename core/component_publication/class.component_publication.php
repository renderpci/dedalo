<?php declare(strict_types=1);
/**
* CLASS COMPONENT_PUBLICATION
* Manages record publishable status.
* Possible values are null | locator yes | locator no
*
* column_name: relation
*/
class component_publication extends component_relation_common {



	// relation_type defaults
	protected $default_relation_type		= DEDALO_RELATION_TYPE_LINK;
	protected $default_relation_type_rel	= null;

	// test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = ['section_tipo','section_id','type','from_component_tipo'];



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
