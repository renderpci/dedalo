<?php
	
	# CONTROLLER

	#dump($this->records_data, "this->records_data ".to_string());
		
	# Always force modo 'list'
	$modo 				= $this->records_data->options->modo;
		#dump($modo, 'modo', array());

	
	$section_tipo		= $this->records_data->options->section_tipo;
		#dump($this->records_data, ' var');

	$context 			=  $this->records_data->options->context;
		#dump($context, ' context');

	$total_rows			= (int)$this->records_data->options->full_count;
	$item_per_page 		= $this->records_data->options->limit ;#? $this->records_data->options->limit : 10;

	# LIMIT == false : When limit is set to false, no pagination is returned
	if (!$this->records_data->options->limit) {
		return '';
	}
	
	$offset 			= $this->records_data->options->offset;
	$total_pages 		= ceil($total_rows / $item_per_page);
		$total_pages 	= $total_pages ? : 1;	# adjust on empty

	$page_number 	 	= self::get_page_number($item_per_page,$offset);

	$next_page_offset 	= $offset + $item_per_page;
	$prev_page_offset 	= $offset - $item_per_page;

	$page_row_begin 	= $offset+1;
	
	if ($total_rows	== 0) {
		$page_row_begin = 0;
	}

	$page_row_end 		= self::get_page_row_end($page_row_begin, $item_per_page, $total_rows);

	$first_page_offset 	= 0;
	$last_page_offset  	= $item_per_page * ($total_pages-1);



	if ($modo=='portal_list') {
		# En modo portal list, evitaremos mostrar el paginador cuando ya se muestren todos los registros existentes
		if ($total_rows <= $item_per_page) {
			return '';
		}
	}

	

	#dump($this->records_data,"");

	#$options = new stdClass();
	#$options->section_tipo 			= $this->records_data->section_tipo;//$section_tipo;
	#$options->section_tipo_original = $this->records_data->section_tipo_original;

	# OPTIONS : Pasaremos algunas opciones necesarias para la búsqueda con portales (layout_map, filter_by_id)
	$options = new stdClass();
		/*
		$options->section_tipo 	= $section_tipo;
		$options->layout_map 	= $this->records_data->options->layout_map;
		$options->modo			= $this->records_data->options->modo;
		if (!empty($this->records_data->options->filter_by_id)) {
		$options->filter_by_id 		= $this->records_data->options->filter_by_id;
		}
		if(!empty($this->records_data->options->filter_by_search)) {
		$options->filter_by_search	= $this->records_data->options->filter_by_search;
		}
		if(!empty($this->records_data->options->tipo_de_dato)) {
		$options->tipo_de_dato 		= $this->records_data->options->tipo_de_dato;
		}
		if(!empty($this->records_data->options->tipo_de_dato_order)) {
		$options->tipo_de_dato_order 		= $this->records_data->options->tipo_de_dato_order;
		}
		if(!empty($this->records_data->options->context)) {
		$options->context 		= $this->records_data->options->context;
		}
		if(!empty($this->records_data->options->full_count)) {
		$options->full_count 		= $this->records_data->options->full_count;
		}
		if(!empty($this->records_data->options->order_by)) {
		$options->order_by 		= $this->records_data->options->order_by;
		}
		if(!empty($this->records_data->options->matrix_table)) {
		$options->matrix_table 		= $this->records_data->options->matrix_table;
		}
		*/
		$options = clone $this->records_data->options;
			#dump($options, " options ".to_string());

	$file_name = $modo;
	switch ($modo) {
		case 'list_tm':
			$file_name = 'list';
			break;
		
		default:
			
			break;
	}

		
	# LOAD PAGE FOR EVERY ROW
	$page_html	= dirname(__FILE__) . '/html/'. basename(dirname(__FILE__)) .'_'.$file_name.'.phtml';			
	include($page_html);	
?>