<?php
#require_once(DEDALO_LIB_BASE_PATH . '/common/class.common.php');


class rows_header extends common {


	protected $ar_components_tipo;
	protected $modo;
	protected $tipo;
	protected $lang;

	protected $section_list_obj;
	protected $section_obj;


	function __construct( section_list $section_list ) {

		$this->ar_id_section		= $section_list->get_ar_id_section();
		$this->ar_components_tipo	= $section_list->get_ar_components_tipo();		#print_r($this->ar_components_tipo);

		# Store received section_list obj (contain also section obj)
		$this->section_list_obj 	= $section_list;

		$this->define_id($id=NULL);
		$this->define_tipo($section_list->get_tipo());
		$this->define_lang(DEDALO_DATA_LANG);
		$this->define_modo($section_list->get_modo());

		$this->section_obj = $section_list->section_obj;	#dump($section_list->section_obj,'$section_list->section_obj');
	}

	# define id
	protected function define_id($id) {	$this->id = $id ; }
	# define tipo
	protected function define_tipo($tipo) {	$this->tipo = $tipo ; }
	# define lang
	protected function define_lang($lang) {	$this->lang = $lang ; }
	# define modo
	protected function define_modo($modo) {	$this->modo = $modo ; }


	# HTML
	public function get_html() {

		if( empty($this->ar_id_section) ) return NULL;

		if(SHOW_DEBUG) {
			$start_time = start_time();
			global$TIMER;$TIMER[__METHOD__.'_IN_'.$this->tipo.'_'.microtime(1)]=microtime(1);
		}

		ob_start();
		include ( get_called_class().'.php' );
		$html =  ob_get_clean();
		

		
		if(SHOW_DEBUG) {
			$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__. ' [rows_header]', "html");
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.$this->tipo.'_'.microtime(1)]=microtime(1);
		}

		return $html;
	}


	# RECORRE Y CARGA TODOS LOS COMPONENTES DE ESTE ROW EN UN ARRAY COMO OBJETOS
	/*
	public function get_ar_component_obj_DES() {

		$ar_component_obj				= array();

		if( is_array($this->ar_components_tipo)) foreach($this->ar_components_tipo as $current_tipo) {

			#$modelo_name = RecordObj_ts::get_modelo_name_by_tipo($current_tipo);
			#$ar_component_obj[$current_tipo]	= new $modelo_name(null,$current_tipo,'list',);	#$id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG) 

			# LOAD CURRENT COMPONENT
			$ar_component_obj[$current_tipo]	= component_common::load_component(NULL, $current_tipo, $this->modo, 0);
		}

		return $ar_component_obj ;
	}
	*/


	public static function flechasOrden($tipo,$campo) {

		$campoInfo	= $campo;

		$flechaUp 	= "<div onClick=\"section_list.sort_records('$tipo','DESC');\" class=\"flechas flecha_orden_ascendent div_image_link\"  title=\"Sort by $campoInfo Ascending\" ></div>";
		$flechaDown = "<div onClick=\"section_list.sort_records('$tipo','ASC');\"  class=\"flechas flecha_orden_descendent div_image_link\" title=\"Sort by $campoInfo Descending\"></div>";

		$order_by 	= common::setVar('order_by');
		$order_dir	= common::setVar('order_dir');

		if($order_by==$tipo && $order_dir=='ASC') {
			$html = $flechaUp;
		}else{
			$html = $flechaDown;
		}

		return $html ;
	}




}
?>
