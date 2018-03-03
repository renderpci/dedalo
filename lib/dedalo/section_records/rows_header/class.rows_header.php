<?php
/**
* ROWS_HEADER
*
*
*//* removed 14-2-2018
class rows_header extends common {

	public $section_records_obj;
	public $modo;

	
	function __construct( section_records $section_records_obj, $modo='list' ) {

		$this->section_records_obj  = $section_records_obj;
		$this->modo 				= $modo;
	}

	#
	# HTML
	public function get_html() {

		$start_time=microtime(1);

		ob_start();
		include ( get_called_class().'.php' );
		$html =  ob_get_clean();
		$this->section_records_obj->rows_obj->generated_time['rows_header'] = round(microtime(1)-$start_time,6);
		
		return $html;
	}


	#
	# ORDER_ARROWS	
	public function order_arrows($tipo,$campo_label) {

		$order_by = $this->section_records_obj->rows_obj->options->order_by;
			
		$options  = clone $this->section_records_obj->rows_obj->options;
	

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
			$flecha = "<div onClick='search.load_rows(".json_handler::encode($options).",this)' class=\"flechas flecha_orden_descendent div_image_link\" title=\"Sort by $campo_label Descending\"></div>";
		}

		return $flecha;		
	}//end order_arrows



}//end rows_header */
?>