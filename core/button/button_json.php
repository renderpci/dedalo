<?php
// JSON data button controller



// button configuration vars
	$permissions	= $this->get_permissions($this->section_tipo, $this->tipo);
	$mode			= $this->get_mode();
	$properties		= $this->get_properties();



// context
	$context = [];

	if($options->get_context===true) { //  && $permissions>0

		switch ($options->context_type) {

			case 'simple':
				// button structure context_simple (tipo, relations, properties, etc.)
				$this->context	= $this->get_structure_context_simple(
					$permissions,
					false
				);
				$context[] = $this->context;
				break;

			default:
				// button structure context (tipo, relations, properties, etc.)
				$this->context	= $this->get_structure_context(
					$permissions,
					false
				);
				$context[] = $this->context;
				break;
		}
	}//end if($options->get_context===true)

	dump($context, ' context ++))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))) '.to_string($this->tipo));

// data
	$data = [];

	if($options->get_data===true && $permissions>0) {

		// value
		switch ($mode) {

			case 'list':
				$value = null;

				break;

			case 'search':
				$value = null;
				break;

			case 'edit':
			default:
				$value = null;
				break;
		}


		// data item
			$item = $this->get_data_item($value);
				$item->parent_tipo			= $this->get_tipo();
				$item->parent_section_id	= $this->get_section_id();


		$data[] = $item;
	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
