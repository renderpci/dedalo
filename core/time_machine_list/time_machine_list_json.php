<?php

#CONTROLER

$tipo			= $this->tipo;
$section_tipo 	= $this->section_tipo;
$section_id 	= $this->section_id;
$mode 			= $this->mode;
$value_resolved	= $this->value_resolved;
$limit			= $this->limit;
$offset			= $this->offset;
$count			= $this->count;
$permissions	= common::get_permissions($section_tipo, $tipo);
$json 			= null;

if($permissions===0) return false;

$file_name = $mode;

	switch($mode) {
		
		case 'edit':
			$ar_time_machine_list 	= $this->get_time_machine_list_obj((int)$limit, (int)$offset, $count);

			$json 					= $ar_time_machine_list;
		
			break;	
	}
