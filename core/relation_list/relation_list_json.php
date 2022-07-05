<?php

// configuration vars
	$tipo			= $this->tipo;
	$section_tipo	= $this->section_tipo;
	$section_id		= $this->section_id;
	$mode			= $this->mode;
	$sqo			= $this->sqo;
	$count			= $this->count;
	$permissions	= common::get_permissions($section_tipo, $tipo);
	$file_name		= $mode;

	// default value empty
		$json = common::build_element_json_output([], []);

	// calculated value based on permissions and mode
		if($permissions>0) {

			switch($mode) {

				case 'edit':
					$ar_inverse_references 	= $this->get_inverse_references($sqo);

					// note that result is already an object with properties context and data
					$json = ($count===true)
						? $ar_inverse_references
						: $this->get_relation_list_obj($ar_inverse_references);
					break;
			}

		}

	return $json;
