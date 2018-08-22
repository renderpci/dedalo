<?php

#CONTROLER

$tipo			= $this->tipo;
$section_tipo 	= $this->section_tipo;
$section_id 	= $this->section_id;
$modo 			= $this->modo;
$permissions	= common::get_permissions($tipo, $tipo);
$json 			= null;

if($permissions===0) return false;

$file_name = $modo;

	switch($modo) {
		
		case 'edit':
			$ar_inverse_references 	= $this->get_inverse_references();
			$ar_relations_lists 	= $this->get_realtion_list_obj($ar_inverse_references, true);
			$json 					= $ar_relations_lists;
			break;
	}


?>