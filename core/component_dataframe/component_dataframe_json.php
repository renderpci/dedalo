<?php
// JSON data component controller



// component configuration vars
	$permissions		= $this->get_component_permissions();
	$mode				= $this->get_mode();
	$section_tipo		= $this->section_tipo;
	$lang				= $this->lang;
	$tipo				= $this->get_tipo();
	$properties			= $this->get_properties() ?? new stdClass();
	$caller_dataframe	= $this->get_caller_dataframe();
	// debug. Check caller_dataframe
	if ( $mode!=='search' && ( empty($caller_dataframe) || !isset($caller_dataframe->section_id_key) || !isset($caller_dataframe->section_tipo_key) || !isset($caller_dataframe->main_component_tipo) ) ){
		$bt = debug_backtrace();
		debug_log(__METHOD__
			. " Mandatory caller_dataframe not found " . PHP_EOL
			. ' tipo: ' . $tipo . PHP_EOL
			. ' section_tipo: ' . $section_tipo . PHP_EOL
			. ' section_id: ' . $this->get_section_id() . PHP_EOL
			. ' mode: ' . $mode
			, logger::ERROR
		);
		dump($bt, ' bt ++ '.to_string($this->tipo));
	}

// context
// data
	$context	= [];
	$data		= [];

	// context get and fix
		$this->context = $this->get_structure_context(
			$permissions,
			true // bool add_request_config
		);
		$context[] = $this->context;

	if($permissions>0) {

		$start_time=start_time();

		// short vars
			$section_id	= $this->get_section_id();
			$limit		= $this->pagination->limit ?? 10;
			$offset		= $this->pagination->offset ?? 0;

		$dato = $this->get_dato();


		// value
			switch ($mode) {

				case 'solved':
					$value	= $dato;

					$item = $this->get_data_item($value);
						$item->parent_tipo			= $tipo;
						$item->parent_section_id	= $section_id;

					$data[] = $item;
					break;

				case 'list':
				case 'tm':
					// data item (list mode result don't include self data, only subdata)
					// (!) limit note that in list mode, limit is always 1
					$value	= $this->get_dato_paginated($limit);
					break;

				case 'search':
					$value	= $dato;
					break;

				case 'edit':
				default:
					$value	= $this->get_dato_paginated();
					break;
			}//end switch ($mode)

		// data

			// data item (list mode result don't include self data, only subdata)
			$item = $this->get_data_item($value);
				$item->parent_tipo			= $tipo;
				$item->parent_section_id	= $section_id;
				// fix pagination vars
				$item->pagination = (object)[
					'total'		=> count($dato),
					'limit'		=> $limit,
					'offset'	=> $offset
				];
				// specific properties for dataframe
				if ( !empty($caller_dataframe)
					&& isset($caller_dataframe->section_id_key)
					&& isset($caller_dataframe->section_tipo_key)
					&& isset($caller_dataframe->main_component_tipo)  ) {
					$item->section_id_key		= $caller_dataframe->section_id_key;
					$item->section_tipo_key		= $caller_dataframe->section_tipo_key;
					$item->main_component_tipo	= $caller_dataframe->main_component_tipo;
				}

			$data[] = $item;

			// solved mode
			if (!empty($dato) && $mode!='solved') {
				// subdatum
				$subdatum = $this->get_subdatum($tipo, $value);

				$ar_subcontext = $subdatum->context;
				foreach ($ar_subcontext as $current_context) {
					$context[] = $current_context;
				}

				$ar_subdata = $subdatum->data;
				foreach ($ar_subdata as $sub_value) {
					$data[] = $sub_value;
				}
			}//end if (!empty($dato))

			// debug
				if(SHOW_DEBUG===true) {
					metrics::add_metric('data_total_time', $start_time);
					metrics::add_metric('data_total_calls');
				}
	}//end if $options->get_data===true && $permissions>0



// JSON string
	return common::build_element_json_output($context, $data);
