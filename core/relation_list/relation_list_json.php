<?php

#CONTROLER

$tipo			= $this->tipo;
$section_tipo 	= $this->section_tipo;
$section_id 	= $this->section_id;
$mode 			= $this->mode;
$sqo 			= $this->sqo;
$count			= $this->count;
$permissions	= common::get_permissions($section_tipo, $tipo);
$json 			= null;

if($permissions===0) return false;

$file_name = $mode;

	switch($mode) {
		
		case 'edit':
			$ar_inverse_references 	= $this->get_inverse_references($sqo);

			if($count === true){
				$json 					= $ar_inverse_references;
			}else{
				$ar_relations_lists 	= $this->get_relation_list_obj($ar_inverse_references);
				$json 					= $ar_relations_lists;
			}
			break;	
	}

