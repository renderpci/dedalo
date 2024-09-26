<?php
/**
* AREA_COMMON
*
*
*/
class area_common extends common  {



	/**
	* CLASS VARS
	*/



	/**
	* GET_INSTANCE
	* Singleton pattern
	* @param string $model
	* @param string $tipo
	* @param string $mode = 'list'
	* @return object $area_instance
	*/
	public static function get_instance( string $model, string $tipo, string $mode='list' ) : object {

		$area_instance = new $model($tipo, $mode);

		return $area_instance;
	}//end get_instance



	/**
	* __CONSTRUCT
	* @param string $tipo
	* @param string $mode
	*/
	protected function __construct(string $tipo, string $mode) {

		// fix main vars
		$this->set_tipo($tipo);
		$this->set_mode($mode);
		$this->set_lang(DEDALO_DATA_LANG);

		// common load thesaurus data of current obj
		parent::load_structure_data();
	}//end __construct



	/**
	* GET_SECTION_TIPO
	* Only to preserve compatibility with sections in some scenarios like building
	* request_config
	* @return string $tipo
	*/
	public function get_section_tipo() : string {

		return $this->tipo;
	}//end get_section_tipo



	/**
	* GET SECTION ID
	* Overwrites common method
	* @return null
	*/
	public function get_section_id() : string|int|null {

		return null;
	}//end get_section_id



}//end area_common
