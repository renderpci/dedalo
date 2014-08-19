<?php
	
	# CONTROLLER
	
	$tipo					= $this->get_tipo();
	$permissions			= common::get_permissions($tipo);
	$modo					= $this->get_modo();
	
	$maxRows				= $this->get_maxRows();
	$totalRows				= $this->get_totalRows();
	$pageNum				= $this->get_pageNum();
	$totalPages				= $this->get_totalPages();
	
	$page_row_begin			= $this->get_page_row_begin();
	$page_row_end			= $this->get_page_row_end();
	
	$prev_page				= $this->get_prev_page();
	$next_page				= $this->get_next_page();


	# PAGE QUERY STRING CLEAN
	$page_query_string		= common::get_page_query_string();	# used links for paginate records
	
	
	# Always force modo 'list'
	$modo = 'list';

					
	# LOAD PAGE FOR EVERY ROW
	$page_html	= dirname(__FILE__) . '/html/'. basename(dirname(__FILE__)) .'_'. $modo .'.phtml';			
	include($page_html);	
	
	
?>