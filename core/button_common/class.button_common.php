<?php
/**
* BUTTON_COMMON
*
*
*/
class button_common extends common {



	/**
	* CLASS VARS
	*/
		public $target;
		public $id;
		public $context_tipo; //dependiendo de quien realice la llamada (area, seccion...) enviará su tipo, independiente de modelo, el tipo será el contexto de la llamada (dd12, dd323...)



	function __construct($tipo, $target, $section_tipo) {

		$this->tipo 		= $tipo;
		$this->target 		= $target;
		$this->section_tipo = $section_tipo;

		$this->define_id(NULL);
		$this->define_lang(DEDALO_APPLICATION_LANG);

		parent::load_structure_data();

		# Target is normally a int section id matrix
		if(!empty($target) && !is_int($target)) throw new Exception("Error creating delete button (target $target is not valid int id matrix)", 1);
	}

	# define id
	protected function define_id($id) {	$this->id = $id ; }
	# define tipo
	protected function define_tipo($tipo) {	$this->tipo = $tipo ; }
	# define lang
	protected function define_lang($lang) {	$this->lang = $lang ; }
	# define mode
	protected function define_mode($mode) {	$this->mode = $mode ; }



}//end button_common
