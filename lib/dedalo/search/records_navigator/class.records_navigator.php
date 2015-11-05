<?php

class records_navigator {

	public $records_data;
	public $modo;


	function __construct( stdClass $records_data, $modo) {

		$this->records_data = $records_data;
		$this->modo 		= $modo;
	}

	
	# HTML
	public function get_html() {
		$start_time = microtime(1);		
		ob_start();
		include ( get_called_class().'.php' );
		$html =  ob_get_clean();
		$this->records_data->generated_time['records_navigator'] = round(microtime(1)-$start_time,6);
		#dump($this->records_data);
		#echo "<hr> Time To Generate paginator html: ".round(microtime(1)-$start_time,6);
		return $html;
	}

	public static function get_page_number($item_per_page, $offset) {
		if ($offset>0) {
			$page_number = ceil($offset/$item_per_page)+1 ;
			return $page_number;
		}
		return 1;
	}

	public static function get_page_row_end($page_row_begin, $item_per_page, $total_rows) {
		$page_row_end = $page_row_begin + $item_per_page -1;
		if ($page_row_end > $total_rows) {
			$page_row_end = $total_rows;
		}
		return $page_row_end;
	}
}



?>