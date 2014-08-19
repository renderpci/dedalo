<?php
require_once(DEDALO_LIB_BASE_PATH . '/common/class.common.php'); 


class rows_paginator extends common {
	
	
	protected $ar_id_section;
	protected $ar_id_section_page;
	
	protected $modo;
	protected $tipo;
	protected $lang;
	
	protected $maxRows;
	protected $totalRows;
	protected $pageNum;
	protected $totalPages;
	
	protected $section_list;
	
	
	function __construct( section_list $section_list ) {

		# CONTEXT : 'component_portal_inside_portal_list'
		# En este contexto (portal dentro de portal) no calcularemos el html
		#$context	= $section_list->section_obj->get_context();
			#dump($context,'context');
		#if($context=='component_portal_inside_portal_list') return null;
		

		$this->section_list			= $section_list;

		$this->define_id($id=NULL);
		$this->define_tipo($section_list->get_tipo());
		$this->define_lang(DEDALO_DATA_LANG);	
		$this->define_modo($section_list->get_modo());

		$this->ar_id_section		= $section_list->get_ar_id_section();

		$this->maxRows 				= self::get_maxRows();
		$this->totalRows 			= intval(count($this->ar_id_section));
		$this->totalPages 			= intval($this->get_totalPages());
		$this->pageNum 				= intval($this->get_pageNum());
		
		$this->ar_id_section_page	= $this->get_ar_id_section_page();

		#dump($this->ar_id_section,'$this->ar_id_section');
	}
	
	# define id
	protected function define_id($id) {	$this->id = $id ; }
	# define tipo
	protected function define_tipo($tipo) {	$this->tipo = $tipo ; }
	# define lang
	protected function define_lang($lang) {	$this->lang = $lang ; }
	# define modo
	protected function define_modo($modo) {	$this->$modo = $modo ; }
	

	# HTML
	public function get_html() {
		
		if(SHOW_DEBUG) {
			$start_time = start_time();
			global$TIMER;$TIMER[__METHOD__.'_IN_'.$this->tipo.'_'.microtime(1)]=microtime(1);
		}
	
		ob_start();
		include ( get_called_class().'.php' );
		$html = ob_get_clean();
		

		
		if(SHOW_DEBUG) {
			$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__. ' [rows_paginator]', "html");
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.$this->tipo.'_'.microtime(1)]=microtime(1);
		}
		
		return $html;
	}


	# MAX ROWS
	public static function get_maxRows() {

		if(isset($_REQUEST["max_rows"]) && $_REQUEST["max_rows"]>0) {
			# fijamos el valor recibido en sesion
			$_SESSION['config4']['max_rows'] = $_REQUEST["max_rows"];
			return intval($_REQUEST["max_rows"]);			
		}
		$max_rows = $_SESSION['config4']['max_rows'];
		return $max_rows;
	}
	
	# TOTAL ROWS
	protected function get_totalRows() {		
		if(isset($this->ar_id_section)) return intval(count($this->ar_id_section));
		return false;
	}	
	
	# TOTAL PAGES
	protected function get_totalPages() {
		if($this->maxRows>0)		
		return ceil( $this->totalRows / $this->maxRows );
	}
	
	# PAGE NUMBER
	protected function get_pageNum() {		
		if(isset($_REQUEST['pageNum']) && $_REQUEST['pageNum']>0) return intval($_REQUEST['pageNum']);
		return 1;
	}	
	
	# AR ID SECTION PAGE
	protected function get_ar_id_section_page() {

		# Si el modo actual es 'portal_list' devolveremos los resultados completos, sin paginar
		$modo = $this->section_list->get_modo();
		if($modo=='portal_list') {
			return $this->ar_id_section;
		}
		
		$ar_id_section_page		= array();
		
		$this->page_row_end 	= $this->maxRows * $this->pageNum ;	
		$this->page_row_begin	= $this->page_row_end - $this->maxRows +0; 	
		
		#if($this->page_row_end>0) $this->page_row_end = $this->page_row_end -1 ;		#echo " - page_row_end: $this->page_row_end - page_row_begin: $this->page_row_begin";
		
		if($this->totalRows > $this->page_row_begin) {
			
			if(is_array($this->ar_id_section))
			$ar_id_section_page = array_slice($this->ar_id_section, $this->page_row_begin, $this->maxRows);		#dump($this->ar_id_section_page);				
		}
		
		if( $this->page_row_end > $this->totalRows ) $this->page_row_end = $this->totalRows;
				
		#dump('', "get_ar_id_section_page: begin: $this->page_row_begin ,  end: $this->page_row_end ,  total: $this->totalRows");		
		return $ar_id_section_page;	
	}
	
	# PAGE ROW BEGIN
	protected function get_page_row_begin() {
		if($this->page_row_end == 0) return 0;
		return $this->page_row_begin + 1 ;
	}
	
	# PAGE ROW END
	protected function get_page_row_end() {
		return $this->page_row_end + 0 ;
	}
	
	# FIRST PAGE NUMBER
	protected function get_firstPageNum() {
		return 1;
	}	
	# LAST PAGE NUMBER
	protected function get_lastPageNum() {		
		return $this->get_totalPages();
	}
	
	
	# PREV PAGE
	protected function get_prev_page() {
		return $this->get_pageNum() -1;
	}
	# NEXT PAGE
	protected function get_next_page() {
		return $this->get_pageNum() +1;
	}
	
	

	
	
	
	
	
	
	
	
	
}
?>