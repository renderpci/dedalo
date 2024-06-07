<?php
// JSON data component controller



// component configuration vars
	$mode			= $this->get_mode();
	$permissions	= 2;

// context
	$context = [];

	if($options->get_context===true){

		// element structure context (tipo, relations, properties, etc.)
			$structure_context = $this->get_structure_context(
				$permissions,
				false // bool add_rqo
			);

		$context[] = $structure_context;
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true ){

		// Value
		switch ($mode) {
			case 'edit':
			default:
				// tree_datalist
				$tree_datalist	= $this->get_tree_datalist();
				// info_data
				$info_data		= $this->get_info_data();
				break;
		}

		$user_id = logged_user_id(); // CURRENT_LOGGED_USED_ID

		// data item
		$item = new stdClass();
			$item->tipo				= $this->get_tipo();
			$item->model			= 'menu';
			$item->tree_datalist	= $tree_datalist;
			$item->info_data		= $info_data;
			$item->show_ontology	= security::is_developer($user_id); //  SHOW_DEVELOPER; // boolean from config file
			$item->username			= logged_user_username();

		$data[] = $item;
	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
