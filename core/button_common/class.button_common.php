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
		protected $target ;
		protected $section_tipo ;
		public $context_tipo; //dependiendo de quien realice la llamada (area, seccion...) enviará su tipo, independiente de modelo, el tipo será el contexto de la llamada (dd12, dd323...)



	function __construct($tipo, $target, $section_tipo) {

		$this->tipo 		= $tipo;
		$this->target 		= $target;
		$this->section_tipo = $section_tipo;

		$this->define_id(NULL);
		$this->define_lang(DEDALO_APPLICATION_LANG);
		$this->define_mode(navigator::get_selected('mode'));

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



	/**
	* GET_HTML
	* return include file __class__.php
	*/
		// public function get_html() {

		// 	ob_start();
		// 	include ( DEDALO_CORE_PATH .'/'. get_called_class() .'/'. get_called_class() . '.php' );
		// 	$html =  ob_get_clean();

		// 	return $html;
		// }//end get_html



}//end button_common
