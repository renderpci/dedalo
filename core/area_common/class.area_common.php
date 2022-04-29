<?php
/**
* AREA_COMMON
*
*
*/
class area_common extends common  {


# VARS
	#protected $tipo;
	#protected $lang;
	#protected $modo;

	# STRUCTURE DATA
	#protected $RecordObj_dd ;
	#protected $modelo;
	#protected $norden;
	#protected $label;



	/**
	* GET_INSTANCE
	* Singleton pattern
	* @returns array array of section objects by key
	*/
	public static function get_instance(string $model=null, string $tipo=null, string $modo='list') : object {

		if (empty($model)) {
			throw new Exception("Error: on construct area : model is mandatory", 1);
		}

		if (empty($tipo)) {
			throw new Exception("Error: on construct area : tipo is mandatory", 1);
		}

		$area_instance = new $model($tipo, $modo);

		return $area_instance;
	}//end get_instance



	/**
	* __CONSTRUCT
	*/
	private function __construct(string $tipo, $modo='list') {

		$this->define_tipo($tipo);
		$this->define_lang(DEDALO_DATA_LANG);
		$this->define_modo($modo);


		# common load thesaurus data of current obj
		parent::load_structure_data();

		return true;
	}//end __construct



	# define tipo
	protected function define_tipo($tipo) {	$this->tipo = $tipo ; }
	# define lang
	protected function define_lang($lang) {	$this->lang = $lang ; }
	# define modo
	protected function define_modo($modo) {	$this->modo = $modo ; }



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
	*/
	public function get_section_id() {

		return null;
	}//end get_section_id



}//end area_common
