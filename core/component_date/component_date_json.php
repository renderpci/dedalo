<?php declare(strict_types=1);
/** @var component_date $this */
// JSON data component controller



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();
	$properties		= $this->get_properties();
	$has_dataframe	= isset($properties->has_dataframe) ? $properties->has_dataframe : false;



// context
	$context = [];

	if($options->get_context===true) { //  && $permissions>0

		switch ($options->context_type) {
			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				$this->context = $this->get_structure_context_simple(
					$permissions,
					$has_dataframe
				);
				$context[] = $this->context;
				break;

			default:
				$this->context = $this->get_structure_context(
					$permissions,
					$has_dataframe
				);
				$context[] = $this->context;
				break;
		}
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0) {

		$start_time=start_time();

		// value
		switch ($mode) {

			case 'list':
			case 'tm':
				$value = $this->get_data_lang();
				break;

			case 'edit':
			default:
				// Building real value
				$value = $this->get_data_lang();
				break;
		}

		// dataframe. If it exists, calculate the subdatum
			if ($has_dataframe===true && $mode!=='search') {

				// locators (using item id as section_id)
					$ar_locator	= [];
					$safe_value	= !empty($value) ? $value : [];
					foreach ($safe_value as $current_value) {

						if (!isset($current_value->id)) {
							continue;
						}

						$locator = new locator();
							$locator->set_section_tipo($this->section_tipo);
							$locator->set_section_id($current_value->id);
						$ar_locator[] = $locator;
					}

				// Empty data: create a locator with next counter to get dataframe context
					if( empty($ar_locator) ){
						$counter = $this->get_counter();
						$locator = new locator();
							$locator->set_section_tipo($this->section_tipo);
							$locator->set_section_id($counter+1);
						$ar_locator[] = $locator;
					}

				// subdatum
					$subdatum = $this->get_subdatum($this->tipo, $ar_locator);

					$ar_subcontext = $subdatum->context;
					foreach ($ar_subcontext as $current_context) {
						$context[] = $current_context;
					}

					$ar_subdata = $subdatum->data;
					foreach ($ar_subdata as $sub_value) {
						$data[] = $sub_value;
					}
			}

		// data item
		$item = $this->get_data_item($value);

		// debug
			if(SHOW_DEBUG===true) {
				metrics::add_metric('data_total_time', $start_time);
				metrics::add_metric('data_total_calls');
			}

		$data[] = $item;
	}//end if $permissions>0



// JSON string
	return common::build_element_json_output($context, $data);
