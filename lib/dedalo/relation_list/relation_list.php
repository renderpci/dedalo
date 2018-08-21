<?php

#CONTROLER

$tipo			= $this->tipo;
$section_tipo 	= $this->section_tipo;
$section_id 	= $this->section_id;
$modo 			= $this->modo;
$permissions	= common::get_permissions($tipo, $tipo);


if($permissions===0) return null;

$file_name = $modo;

	switch($modo) {
		
		case 'edit':
			$ar_inverse_references 	= $this->get_inverse_references();
			$ar_relations_lists 	= $this->get_json($ar_inverse_references);
		break;

		case 'button':
			$relation_list_name = RecordObj_dd::get_termino_by_tipo($tipo,DEDALO_APPLICATION_LANG, true);

				$page_html	= dirname(__FILE__) . '/html/relation_list' . '_' . $file_name . '.phtml';
				if( !include($page_html) ) {
					echo "<div class=\"error\">Invalid mode $this->modo</div>";
				}
		break;

	}

?>