<?php
/*
* CLASS 
*/


class section_group_div extends common {


	protected $tipo;
	protected $modo;
	protected $lang;

	# STRUCTURE DATA
	protected $RecordObj_dd;
	protected $modelo;
	protected $norden;
	protected $label;
	protected $section_tipo;


	protected $components_html;


	function __construct($tipo, $section_tipo, $modo, $components_html=NULL) {

		#dump($tipo, "modo:$modo, , id_section:$id_section"); die();

		$this->define_tipo($tipo);
		$this->define_modo($modo);
		$this->define_lang(DEDALO_DATA_LANG);

		$this->components_html = $components_html;

		$this->section_tipo = $section_tipo;

		$this->load_structure_data();
	}

	# define tipo
	protected function define_tipo($tipo) {	$this->tipo = $tipo ; }
	# define lang
	protected function define_lang($lang) {	$this->lang = $lang ; }
	# define modo
	protected function define_modo($modo) {	$this->modo = $modo ; }
	# define section_tipo
	protected function define_section_tipo($section_tipo) { $this->section_tipo = $section_tipo ; }





	# BUILD_DUMMY_section_group_div
	public static function build_dummy_section_group_div($title, $body) {

		$tab_id 	= 'tab_' . base64_encode($title);		#dump($identificador_unico,'identificador_unico');
	
		include( DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . 'dummy' . '.phtml' );
	}



}
?>
