<?php
// JSON data component controller



// component configuration vars
	$modo				= $this->get_modo();
	$permissions		= 2;

// context
	$context = [];

	if($options->get_context===true){

		// Component structure context (tipo, relations, properties, etc.)
			$context[] = $this->get_structure_context($permissions, $sqo_context=false);

	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true ){

		// Value
		switch ($modo) {
			case 'edit':
			default:
				$tree_datalist 	= $this->get_tree_datalist();

				$langs_datalist = [];
				foreach (unserialize( DEDALO_APPLICATION_LANGS ) as $key => $value) {
					$obj_langs = new stdClass();
						$obj_langs->value 	= $key;
						$obj_langs->label 	= $value;;
					$langs_datalist[] = $obj_langs;
				}

				$info_data		= $this->get_info_data();
				break;
		}

		// data item
		$item = new stdClass();
			$item->tipo 				= $this->get_tipo();
			$item->model 				= 'menu';
			$item->tree_datalist 		= $tree_datalist;
			$item->langs_datalist 		= $langs_datalist;
			$item->info_data			= $info_data;


		$data[] = $item;

	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
