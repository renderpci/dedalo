<?php





class rows_header extends common {

	public $section_records_obj;
	public $modo;

	
	function __construct( section_records $section_records_obj, $modo='list' ) {

		$this->section_records_obj  = $section_records_obj;
		$this->modo 				= $modo;
	}


	# HTML
	public function get_html() {
		$start_time=microtime(1);
		ob_start();
		include ( get_called_class().'.php' );
		$html =  ob_get_clean();
		$this->section_records_obj->rows_obj->generated_time['rows_header'] = round(microtime(1)-$start_time,6);
		return $html;
	}


	/**
	* FLECHAS_ORDEN
	*/
	public function flechas_orden($tipo,$campo_label) {
		#dump($this->section_records_obj->rows_obj,"");

		$order_by = $this->section_records_obj->rows_obj->options->order_by;
			#dump($order_by,"order_by");
		
		# OPTIONS : Pasaremos sólo algunas opciones necesarias para la búsqueda con portales (layout_map, filter_by_id)
		/*
			$options = new stdClass();
			
			
			$options->section_tipo 			= $this->section_records_obj->rows_obj->options->section_tipo;
			$options->section_real_tipo 	= $this->section_records_obj->rows_obj->options->section_real_tipo;		
			$options->layout_map 			= $this->section_records_obj->rows_obj->options->layout_map;
			$options->modo 					= $this->section_records_obj->rows_obj->options->modo;

			if(!empty($this->section_records_obj->rows_obj->options->filter_by_id)) {
			$options->filter_by_id 			= $this->section_records_obj->rows_obj->options->filter_by_id;
			}
			if(!empty($this->section_records_obj->rows_obj->options->filter_by_search)) {
			$options->filter_by_search 		= $this->section_records_obj->rows_obj->options->filter_by_search;
			}
			if(!empty($this->section_records_obj->rows_obj->options->tipo_de_dato)) {
			$options->tipo_de_dato 		= $this->section_records_obj->rows_obj->options->tipo_de_dato;
			}
			if(!empty($this->section_records_obj->rows_obj->options->tipo_de_dato_order)) {
			$options->tipo_de_dato_order 		= $this->section_records_obj->rows_obj->options->tipo_de_dato_order;
			}
			if(!empty($this->section_records_obj->rows_obj->options->context)) {
			$options->context 		= $this->section_records_obj->rows_obj->options->context;
			}
			if(!empty($this->section_records_obj->rows_obj->options->full_count)) {
			$options->full_count 		= $this->section_records_obj->rows_obj->options->full_count;
			}
			if(!empty($this->section_records_obj->rows_obj->options->order_by)) {
			#$options->order_by 		= $this->section_records_obj->rows_obj->options->order_by;
			}
			if(!empty($this->section_records_obj->rows_obj->options->matrix_table)) {
			$options->matrix_table 		= $this->section_records_obj->rows_obj->options->matrix_table;
			}
			*/
		$options = clone $this->section_records_obj->rows_obj->options;
		
		#dump($this->section_records_obj->rows_obj->options->filter_by_id,"filter_by_id");
		#dump($this->section_records_obj->rows_obj->options,"GLOBAL OPTIONS");
		#dump($options,"CURRENT OPTIONS");


		# Add order_by_locator value
		$options->order_by_locator = false;
		if($tipo!=='section_id') {
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
				#dump($modelo_name, ' $modelo_name ++ '.to_string($tipo));
			$options->order_by_locator = (bool)$modelo_name::get_order_by_locator();
		}
		


		if ( strpos($order_by, $tipo)!==false && strpos($order_by, 'DESC')!==false ) {
			# Flecha UP
			$options->order_by = "$tipo ASC";
			$flecha = "<div onClick='search.load_rows(".json_handler::encode($options).",this)' class=\"flechas flecha_orden_ascendent div_image_link\" title=\"Sort by $campo_label Ascending\" ></div>";
		}else{
			# Flefha DOWN
			$options->order_by = "$tipo DESC";
				#dump($options,"options");
			$flecha = "<div onClick='search.load_rows(".json_handler::encode($options).",this)' class=\"flechas flecha_orden_descendent div_image_link\" title=\"Sort by $campo_label Descending\"></div>";
		}

		return $flecha;		
	}//end flechas_orden



}#end class
?>