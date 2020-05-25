<?php
/*
* CLASS GET_ARCHIVE_WEIGHTS
*
*
*/
class state extends widget_common {

	/**
	* get_dato
	* @return
	*/
	public function get_dato() {

		$section_tipo 	= $this->section_tipo;
		$section_id 	= $this->section_id;
		$ipo 			= $this->ipo;

		$dato = [];
		$project_langs = common::get_ar_all_langs();

		// every state has a ipo that come from structure (input, process , output), state don't use process.
		foreach ($ipo as $key => $current_ipo) {

			$input 		= $current_ipo->input;
			$output		= $current_ipo->output;
			// get the paths to the source data
			$source 	= $input->source;
			$ar_paths 	= $input->paths;

			// check the type for input, if the input is a locator state will use a resolve locator path,
			// if it's a filter will use search_query_object to find data
			$type 		= $input->type;
			switch ($type) {
				case 'locator':
					$ar_locator = [];
					foreach ($source as $current_source) {
						$locator = new locator();
						if($current_source->section_tipo==='current'){
							$locator->set_section_tipo($section_tipo);
						}
						if($current_source->section_id==='current'){
							$locator->set_section_id($section_id);
						}
						$ar_locator[] = $locator;
					}
					break;

				default:
					break;
			}
			// every path has a object with the component and section to locate the final component with the data
			$result = [];
			foreach ($ar_paths as $path) {
				// resolve the path with all levels and get the data of the final component.
				$data_with_path = search::get_data_with_path($path, $ar_locator);
				$last_path		= end($path);
				// $data_with_path has all locators of every level of the path, we need select the last component of the path
				// this last compoment that has the usable locators for state
				$path_result = array_find($data_with_path, function($item) use($last_path){
					return $item->path->component_tipo === $last_path->component_tipo;
				});
				// get the section pointed by the last component_tipo
				// the section_tipo is the list of values of the state
				$component_tipo = $last_path->component_tipo;
				$ar_section = common::get_ar_related_by_model('section', $component_tipo);
				$section = reset($ar_section);
				// check if the compoment (select, radio_button, etc) is translatable
				// if yes, the locator will has lang associate to it, else the locator don't has lang and it will identificate as 'lg-nolan'
				$RecordObj_dd = new RecordObj_dd($component_tipo);
				$translatable = $RecordObj_dd->get_traducible();

				// get the value of the component, it can be empty and in these case will create a empty item.
				$ar_value	= $path_result->value;
				if (empty($ar_value) ) {
					$current_result = new stdClass();
						// $current_result->label 	= '';
						$current_result->value 	= 0;
						$current_result->lang 	= $translatable === 'si' ? null : 'lg-nolan';
						$current_result->id		= $last_path->var_name;
						$current_result->column	= ($section==='dd501') ? 'state' :'situation';
						$current_result->type 	= 'detail';
						$current_result->n 		= $translatable==='si' ? count($project_langs) : 1;
					$result[] = $current_result;
				}

				// if the component has value(s) we create items with the every locator
				foreach ($ar_value as $locator) {

					$current_result = new stdClass();
					switch ($locator->section_tipo) {
						// Status, the list contoled by users
						case 'dd174':
							$situation_value = $this->get_value($locator,'dd92');
							// $current_result->label 	= $this->get_label($locator,'dd185');
							$current_result->value 	= $situation_value;
							$current_result->lang 	= isset($locator->lang) ? $locator->lang : 'lg-nolan';
							$current_result->id		= $last_path->var_name;
							$current_result->column	= 'situation';
							$current_result->type 	= 'detail';
							$current_result->n 		= $translatable==='si' ? count($project_langs) : 1;
							break;

						// Status, the list controled by admins
						case 'dd501':
							$state_value = $this->get_value($locator,'dd83');

							// $current_result->label 	= $this->get_label($locator,'dd503');
							$current_result->value 	= $state_value;
							$current_result->lang 	= isset($locator->lang) ? $locator->lang : 'lg-nolan';
							$current_result->id		= $last_path->var_name;
							$current_result->column	= 'state';
							$current_result->type 	= 'detail';
							$current_result->n 		= $translatable==='si' ? count($project_langs) : 1;
							break;
					}
					// add all item to $result
					$result[] = $current_result;
				}
			}//end foreach ($ar_paths as $path)

			// output, use the ipo output for create the items to send to compoment_info and client side
			foreach ($output as $data_map) {
				// sum of the all components of the current row and current column
				$ar_sum = [];
				// get the current row id and the items into the $result
				$current_id = $data_map->id;
				$found = array_filter($result,function($item) use($current_id){
					return $item->id===$current_id;
				});
				// create the final item for every column to set the final data.
				foreach ($found as $item) {
					$current_data = new stdClass();
						$current_data->widget 	= get_class($this);
						$current_data->key  	= $key;
						$current_data->id 		= $item->id;
						$current_data->lang 	= $item->lang;
						$current_data->value 	= $item->value;
						$current_data->column 	= $item->column;
						$current_data->type		= $item->type;

					// sum for totals of every column and row
					// n: total languages, used for get the % done
						$current_total = $ar_sum[$item->column]->total ?? 0;
						$ar_sum[$item->column] = (object)[
							'total'  	=> $current_total += (int)$item->value,
							'n'			=> $item->n
						];
					// set the final data to the widget
					$dato[] = $current_data;
				}
				// get the total nodes for every column and row with the total % of the process
				foreach ($ar_sum as $column => $value) {
					// get the statistic % of the sum of the all languages / by the number of project langs
					$total = round($value->total / $value->n, 2);
					// create the total item
					$total_result = new stdClass();
						$total_result->widget 	= get_class($this);
						$total_result->key  	= $key;
						$total_result->id		= $last_path->var_name;
						$total_result->lang 	= 'lg-nolan';
						$total_result->value 	= $total;
						$total_result->column	= $column;
						$total_result->type 	= 'total';
					$dato[] = $total_result;
				}
			}
		}//foreach $ipo

		return $dato;
	}//end get_dato


	/**
	* get_label
	* @return string
	*/
	public function get_label($locator, $component_tipo) {

		$modelo_name 	  	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
		$component_portal 	= component_common::get_instance($modelo_name,
														   $component_tipo,
														   $locator->section_id,
														   'list',
														   DEDALO_DATA_LANG,
														   $locator->section_tipo);

		$label = $component_portal->get_valor();

		return $label;
	}//end get_label


	/**
	* get_value
	* @return int
	*/
	public function get_value($locator, $component_tipo) {

		$modelo_name 	  	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
		$component_portal 	= component_common::get_instance($modelo_name,
														   $component_tipo,
														   $locator->section_id,
														   'list',
														   DEDALO_DATA_NOLAN,
														   $locator->section_tipo);

		$dato = $component_portal->get_dato();
		$value = reset($dato);

		return $value;
	}//end get_value

}//end state
