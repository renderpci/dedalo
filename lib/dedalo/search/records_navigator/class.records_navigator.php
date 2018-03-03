<?php
/**
* RECORDS_NAVIGATOR
*
*
*/
class records_navigator {

	public $search_query_object;
	public $modo;
	public $context;


	function __construct( stdClass $search_query_object, $modo, $context=null) {

		$this->search_query_object 		= $search_query_object;
		$this->modo 					= $modo;
		$this->context 					= $context;		
	}


	
	/**
	* GET_HTML
	*/
	public function get_html() {

		$start_time = microtime(1);
		
		ob_start();
		include ( get_called_class().'.php' );
		$html = ob_get_clean();
		#$this->search_query_object->generated_time['records_navigator'] = round(microtime(1)-$start_time,6);
		
		
		return $html;
	}


	/**
	* GET_PAGE_NUMBER
	*/
	public static function get_page_number($item_per_page, $offset) {
		if ($offset>0) {
			$page_number = ceil($offset/$item_per_page)+1 ;
			return $page_number;
		}

		return 1;
	}


	/**
	* GET_PAGE_ROW_END
	*/
	public static function get_page_row_end($page_row_begin, $item_per_page, $total_rows) {
		$page_row_end = $page_row_begin + $item_per_page -1;
		if ($page_row_end > $total_rows) {
			$page_row_end = $total_rows;
		}

		return $page_row_end;
	}



}//end records_navigator
?>