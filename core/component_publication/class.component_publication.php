<?php
declare(strict_types=1);
/**
* CLASS COMPONENT_PUBLICATION
* Manages record publishable status.
* Possible values are null | locator yes | locator no
*
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
	* @param string|null $section_id = null
	* @param string $mode = 'list'
	* @param string|null $lang = DEDALO_DATA_NOLAN
	* @param string|null $section_tipo = null
	* @param bool $cache = true
	* @return void
	*/
	protected function __construct( ?string $tipo=null, $section_id=null, string $mode='list', string $lang=DEDALO_DATA_NOLAN, ?string $section_tipo=null, bool $cache=true ) {

		// Force always DEDALO_DATA_NOLAN
		$this->lang = DEDALO_DATA_NOLAN;

		// construct the component normally
		parent::__construct($tipo, $section_id, $mode, $this->lang, $section_tipo, $cache);
	}//end __construct



	/**
	* GET_VALOR
	* Get value. default is get dato . overwrite in every different specific component
	* @param string $lang = DEDALO_DATA_LANG
	* @return string|null $valor
	*/
	public function get_valor(?string $lang=DEDALO_DATA_LANG) : ?string {

		$dato = $this->get_dato();

		// Test dato format (b4 changed to object)
			if(SHOW_DEBUG===true) {
				if (!empty($dato)) foreach ($dato as $value) {
					if (!empty($value) && !is_object($value)) {
						if(SHOW_DEBUG===true) {
							dump($dato," +++ dato Wrong dato format. OLD format dato in $this->label $this->tipo .Expected object locator, but received: ".gettype($value));
						}
						debug_log(__METHOD__
							." Wrong dato format. OLD format dato in $this->label $this->tipo .Expected object locator, but received: ".gettype($value) .' : '. print_r($value,true)
							, logger::ERROR
						);
						return null;
					}
				}
			}

		// mode changes value result
		switch ($this->mode) {

			case 'diffusion':
				$valor = 'no';
				if (!empty($dato)) {

					$object_si = new stdClass();
						$object_si->section_id   = (string)NUMERICAL_MATRIX_VALUE_YES;
						$object_si->section_tipo = (string)"dd64";

					$component_locator = reset($dato);
					$compare_locators  = locator::compare_locators( $component_locator, $object_si, $ar_properties=['section_id','section_tipo']);

					if ($compare_locators===true) {
						$valor = 'si';
					}
				}
				break;

			default:
				$valor = null;
				if (!empty($dato)) {

					# Always run list of values
					$ar_list_of_values	= $this->get_ar_list_of_values($lang); # Important: We are searching for the value in the current language.
					$component_locator  = reset($dato);
					foreach ($ar_list_of_values->result as $key => $item) {

						$locator = $item->value;
						if (true===locator::compare_locators( $component_locator, $locator, $ar_properties=['section_id','section_tipo'])) {
							$valor = $item->label;
							break;
						}
					}
				}
				break;
		}//end switch


		return $valor;
	}//end get_valor



	/**
	* GET_SORTABLE
	* @return bool
	* 	Default is true. Override when component is sortable
	*/
	public function get_sortable() : bool {

		return true;
	}//end get_sortable



}//end class component_publication
