<?php
	
	# CONTROLLER

	$modo 				 	= $this->modo;
	$context 				= $this->context;
	$search_query_object 	= $this->search_query_object;
	$section_tipo			= $search_query_object->section_tipo;
	$total_rows				= (int)$search_query_object->full_count;
	$item_per_page 			= $search_query_object->limit;

	# LIMIT == false : When limit is set to false, no pagination is returned
	if (!$search_query_object->limit) {
		return '';
	}
	
	$offset 			= (int)$search_query_object->offset;
	$total_pages 		= ceil($total_rows / $item_per_page);
		$total_pages 	= $total_pages ? : 1;	# adjust on empty

	$page_number 	 	= self::get_page_number($item_per_page, $offset);

	$next_page_offset 	= $offset + $item_per_page;
	$prev_page_offset 	= $offset - $item_per_page;

	$page_row_begin 	= $offset + 1;	
	if ($total_rows	=== 0) {
		$page_row_begin = 0;
	}

	$page_row_end 		= self::get_page_row_end($page_row_begin, $item_per_page, $total_rows);

	$first_page_offset 	= 0;
	$last_page_offset  	= $item_per_page * ($total_pages-1);



	if ($modo==='portal_list') {
		# En modo portal list, evitaremos mostrar el paginador cuando ya se muestren todos los registros existentes
		if ($total_rows <= $item_per_page) {
			return '';
		}
	}


	# OPTIONS : Pasaremos algunas opciones necesarias para la búsqueda con portales (layout_map, filter_by_id)
	/* to_review 14-2-2018
	$options = new stdClass();		
		$options = clone $this->records_data->options;
			#dump($options, " options ".to_string()); */


	# File name
	switch ($modo) {
		case 'list_tm':
			$file_name = 'list';
			break;		
		default:
			#$file_name = $modo;
			$file_name = 'list';		
			break;
	}
	

		
	# LOAD PAGE FOR EVERY ROW
	$page_html	= dirname(__FILE__) . '/html/'. basename(dirname(__FILE__)) .'_'.$file_name.'.phtml';			
	include($page_html);	
?>