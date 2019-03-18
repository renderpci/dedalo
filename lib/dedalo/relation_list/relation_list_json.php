<?php

#CONTROLER

$tipo			= $this->tipo;
$section_tipo 	= $this->section_tipo;
$section_id 	= $this->section_id;
$modo 			= $this->modo;
$value_resolved	= $this->value_resolved;
$limit			= $this->limit;
$offset			= $this->offset;
$count			= $this->count;
$permissions	= common::get_permissions($section_tipo, $tipo);
$json 			= null;

if($permissions===0) return false;

$file_name = $modo;

	switch($modo) {
		
		case 'edit':
			$ar_inverse_references 	= $this->get_inverse_references($limit, (int)$offset, $count);

			if($count === true){
				$json 					= $ar_inverse_references;
			}else{
				$ar_relations_lists 	= $this->get_relation_list_obj($ar_inverse_references, $value_resolved);
				$json 					= $ar_relations_lists;
			}
			break;	
	}


?>