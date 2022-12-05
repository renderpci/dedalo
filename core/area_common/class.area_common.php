<?php
/**
* AREA_COMMON
*
*
*/
class area_common extends common  {



// VARS
	protected $tipo;
	protected $mode;
	protected $lang;

	# STRUCTURE DATA
	// protected $RecordObj_dd ;
	#protected $modelo;
	#protected $norden;
	#protected $label;



	/**
	* GET_INSTANCE
	* Singleton pattern
	* @param string|null $model = null
	* @param string|null $tipo = null
	* @param string $mode = 'list'
	* @return object $area_instance
	*/
	public static function get_instance(string $model=null, string $tipo=null, string $mode='list') : object {

		if (empty($model)) {
			throw new Exception("Error: on construct area : model is mandatory", 1);
		}

		if (empty($tipo)) {
			throw new Exception("Error: on construct area : tipo is mandatory", 1);
		}

		$area_instance = new $model($tipo, $mode);

		return $area_instance;
	}//end get_instance



	/**
	* __CONSTRUCT
	* @param string $tipo
	* @param string $mode
	*/
	private function __construct(string $tipo, string $mode) {

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
	public function get_section_id() {

		return null;
	}//end get_section_id



}//end area_common
