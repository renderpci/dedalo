<?php
	
	# CONTROLLER
		
	# Always force modo 'list'
	$modo 				= $this->section_list_obj->options->modo;
		#dump($modo, 'modo', array());

	
	$section_tipo		= $this->section_list_obj->rows_obj->options->section_tipo;
		#dump($this->section_list_obj, ' var');

	$context 			=  $this->section_list_obj->options->context;
		#dump($context, ' context');

	$total_rows			= (int)$this->section_list_obj->rows_obj->options->full_count;
	$item_per_page 		= $this->section_list_obj->rows_obj->options->limit ;#? $this->section_list_obj->rows_obj->options->limit : 10;

	# LIMIT == false : When limit is set to false, no pagination is returned
	if (!$this->section_list_obj->rows_obj->options->limit) {
		return '';
	}
	
	$offset 			= $this->section_list_obj->rows_obj->options->offset;
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

	

	#dump($this->section_list_obj,"");

	#$options = new stdClass();
	#$options->section_tipo 			= $this->section_list_obj->rows_obj->section_tipo;//$section_tipo;
	#$options->section_tipo_original = $this->section_list_obj->rows_obj->section_tipo_original;

	# OPTIONS : Pasaremos algunas opciones necesarias para la búsqueda con portales (layout_map, filter_by_id)
	$options = new stdClass();
		/*
		$options->section_tipo 	= $section_tipo;
		$options->layout_map 	= $this->section_list_obj->rows_obj->options->layout_map;
		$options->modo			= $this->section_list_obj->rows_obj->options->modo;
		if (!empty($this->section_list_obj->rows_obj->options->filter_by_id)) {
		$options->filter_by_id 		= $this->section_list_obj->rows_obj->options->filter_by_id;
		}
		if(!empty($this->section_list_obj->rows_obj->options->filter_by_search)) {
		$options->filter_by_search	= $this->section_list_obj->rows_obj->options->filter_by_search;
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
		$options->order_by 		= $this->section_list_obj->rows_obj->options->order_by;
		}
		if(!empty($this->section_list_obj->rows_obj->options->matrix_table)) {
		$options->matrix_table 		= $this->section_list_obj->rows_obj->options->matrix_table;
		}
		*/
		$options = clone $this->section_list_obj->rows_obj->options;

		
	# LOAD PAGE FOR EVERY ROW
	$page_html	= dirname(__FILE__) . '/html/'. basename(dirname(__FILE__)) .'_list.phtml';			
	include($page_html);	
?>