<?php
#require_once(DEDALO_LIB_BASE_PATH . '/common/class.common.php');

class rows_header extends common {

	public $section_list_obj;
	public $modo;

	function __construct( section_list $section_list_obj, $modo='list' ) {

		$this->section_list_obj = $section_list_obj;
		$this->modo 			= $modo;
	}

	# HTML
	public function get_html() {
		$start_time=microtime(1);
		ob_start();
		include ( get_called_class().'.php' );
		$html =  ob_get_clean();
		$this->section_list_obj->rows_obj->generated_time['rows_header'] = round(microtime(1)-$start_time,6);
		return $html;
	}

	/**
	* FLECHAS_ORDEN
	*/
	public function flechas_orden($tipo,$campo_label) {
		#dump($this->section_list_obj->rows_obj,"");

		$order_by = $this->section_list_obj->rows_obj->options->order_by;
			#dump($order_by,"order_by");
		
		# OPTIONS : Pasaremos sólo algunas opciones necesarias para la búsqueda con portales (layout_map, filter_by_id)
		$options = new stdClass();
			
			/*
			$options->section_tipo 			= $this->section_list_obj->rows_obj->options->section_tipo;
			$options->section_real_tipo 	= $this->section_list_obj->rows_obj->options->section_real_tipo;		
			$options->layout_map 			= $this->section_list_obj->rows_obj->options->layout_map;
			$options->modo 					= $this->section_list_obj->rows_obj->options->modo;

			if(!empty($this->section_list_obj->rows_obj->options->filter_by_id)) {
			$options->filter_by_id 			= $this->section_list_obj->rows_obj->options->filter_by_id;
			}
			if(!empty($this->section_list_obj->rows_obj->options->filter_by_search)) {
			$options->filter_by_search 		= $this->section_list_obj->rows_obj->options->filter_by_search;
			}
			if(!empty($this->section_list_obj->rows_obj->options->tipo_de_dato)) {
			$options->tipo_de_dato 		= $this->section_list_obj->rows_obj->options->tipo_de_dato;
			}
			if(!empty($this->section_list_obj->rows_obj->options->tipo_de_dato_order)) {
			$options->tipo_de_dato_order 		= $this->section_list_obj->rows_obj->options->tipo_de_dato_order;
			}
			if(!empty($this->section_list_obj->rows_obj->options->context)) {
			$options->context 		= $this->section_list_obj->rows_obj->options->context;
			}
			if(!empty($this->section_list_obj->rows_obj->options->full_count)) {
			$options->full_count 		= $this->section_list_obj->rows_obj->options->full_count;
			}
			if(!empty($this->section_list_obj->rows_obj->options->order_by)) {
			#$options->order_by 		= $this->section_list_obj->rows_obj->options->order_by;
			}
			if(!empty($this->section_list_obj->rows_obj->options->matrix_table)) {
			$options->matrix_table 		= $this->section_list_obj->rows_obj->options->matrix_table;
			}
			*/
		$options = clone $this->section_list_obj->rows_obj->options;
		
		#dump($this->section_list_obj->rows_obj->options->filter_by_id,"filter_by_id");
		#dump($this->section_list_obj->rows_obj->options,"GLOBAL OPTIONS");
		#dump($options,"CURRENT OPTIONS");

		if ( strpos($order_by, $tipo)!==false && strpos($order_by, 'DESC')!==false ) {
			# Flecha UP
			$options->order_by = "$tipo ASC";
			$flecha = "<div onClick='section_list.load_rows(".json_handler::encode($options).",this)' class=\"flechas flecha_orden_ascendent div_image_link\" title=\"Sort by $campo_label Ascending\" ></div>";
		}else{
			# Flefha DOWN
			$options->order_by = "$tipo DESC";
				#dump($options,"options");
			$flecha = "<div onClick='section_list.load_rows(".json_handler::encode($options).",this)' class=\"flechas flecha_orden_descendent div_image_link\" title=\"Sort by $campo_label Descending\"></div>";
		}

		return $flecha;		
	}




};







class rows_header_OLD extends common {


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
			#$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__. ' [rows_header]', "html");
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.$this->tipo.'_'.microtime(1)]=microtime(1);
		}

		return $html;
	}


	# RECORRE Y CARGA TODOS LOS COMPONENTES DE ESTE ROW EN UN ARRAY COMO OBJETOS
	/*
	public function get_ar_component_obj_DES() {

		$ar_component_obj				= array();

		if( is_array($this->ar_components_tipo)) foreach($this->ar_components_tipo as $current_tipo) {

			#$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
			#$ar_component_obj[$current_tipo]	= new $modelo_name($current_tipo,$parent,'list',);	#$id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG) 

			# LOAD CURRENT COMPONENT
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
