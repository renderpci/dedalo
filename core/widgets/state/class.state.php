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

		foreach ($ipo as $key => $current_ipo) {

			$input 		= $current_ipo->input;
			$output		= $current_ipo->output;

			$source 	= $input->source;
			$ar_paths 	= $input->paths;

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

			$result = [];
			foreach ($ar_paths as $path) {
				$data_with_path = search::get_data_with_path($path, $ar_locator);
				$last_path		= end($path);

				$path_result = array_find($data_with_path, function($item) use($last_path){
					return $item->path->component_tipo === $last_path->component_tipo;
				});

				$component_tipo = $last_path->component_tipo;
				$ar_section = common::get_ar_related_by_model('section', $component_tipo);
				$section = reset($ar_section);

				$RecordObj_dd = new RecordObj_dd($component_tipo);
				$translatable = $RecordObj_dd->get_traducible();

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


				foreach ($ar_value as $locator) {

					$current_result = new stdClass();
					switch ($locator->section_tipo) {
						// Status for users
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

						// Status for admins
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

					$result[] = $current_result;
				}
			}//end foreach ($ar_paths as $path)

			// output
			foreach ($output as $data_map) {

				$ar_sum = [];

				$current_id = $data_map->id;
				$found = array_filter($result,function($item) use($current_id){
					return $item->id===$current_id;
				});
				foreach ($found as $item) {
					$current_data = new stdClass();
						$current_data->widget 	= get_class($this);
						$current_data->key  	= $key;
						$current_data->id 		= $item->id;
						$current_data->lang 	= $item->lang;
						$current_data->value 	= $item->value;
						$current_data->column 	= $item->column;
						$current_data->type		= $item->type;

					// sum for totals
						$current_total = $ar_sum[$item->column]->total ?? 0;
						$ar_sum[$item->column] = (object)[
							'total'  	=> $current_total += (int)$item->value,
							'n'			=> $item->n
						];

					$dato[] = $current_data;
				}

				foreach ($ar_sum as $column => $value) {

					$total = round($value->total / $value->n, 2);

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
