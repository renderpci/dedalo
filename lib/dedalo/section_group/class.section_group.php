<?php
/*
* CLASS SECTION GROUP
*/


class section_group extends common {


	protected $tipo;
	protected $modo;
	protected $lang;
	protected $id;		# id matrix of current section

	# STRUCTURE DATA
	protected $RecordObj_dd;
	protected $modelo;
	protected $norden;
	protected $label;

	protected $components_html;


	function __construct($tipo, $modo, $components_html, $id_section=NULL) {

		#dump($tipo, "modo:$modo, , id_section:$id_section");

		$this->define_tipo($tipo);
		$this->define_modo($modo);
		$this->define_lang(DEDALO_DATA_LANG);

		$this->components_html = $components_html;

		$this->id = $id_section;

		$this->load_structure_data();
	}

	# define tipo
	protected function define_tipo($tipo) {	$this->tipo = $tipo ; }
	# define lang
	protected function define_lang($lang) {	$this->lang = $lang ; }
	# define modo
	protected function define_modo($modo) {	$this->modo = $modo ; }





	# BUILD_DUMMY_SECTION_GROUP
	public static function build_dummy_section_group($title, $body) {

		$tab_id 	= 'tab_' . base64_encode($title);		#dump($identificador_unico,'identificador_unico');
	
		include( DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . 'dummy' . '.phtml' );
	}



}
?>
