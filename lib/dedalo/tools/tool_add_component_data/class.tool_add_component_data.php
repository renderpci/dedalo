<?php
/*
* CLASS TOOL_ADD_COMPONENT_DATA
*
*
*/
class tool_add_component_data extends tool_common {

	

	# av component
	protected $component_obj ;
	public $search_options;



	/**
	* __CONSTRUCT
	*/
	public function __construct($component_obj, $modo='button') {
		
		# Fix modo
		$this->modo = $modo;

		# Fix current av component
		$this->component_obj = $component_obj;

		# Fix search options
		$section_tipo 		  = $this->component_obj->get_section_tipo();
		$search_options_id 	  = $section_tipo; // section tipo like oh1
		$saved_search_options = section_records::get_search_options( $search_options_id );
		
		
		$this->search_options = unserialize(serialize($saved_search_options));
	}//end __construct



	/**
	* PROPAGATE_DATA
	* Note: when component is created in list mode, no default values from propiedaes' is set. In this case, 
	* for speed we use mode 'list' to avoid this process (in component_radio_button for example)
	* @return array $ar_records (all searched an changed records)
	*/
	public function propagate_data($source_dato, $action) {
		
		# source_dato check
		if (empty($source_dato)) {
			return false;
		}

		$tipo 			= $this->component_obj->get_tipo();
		$section_tipo 	= $this->component_obj->get_section_tipo();
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$lang 			= $this->component_obj->get_traducible()==='no' ? DEDALO_DATA_NOLAN : DEDALO_DATA_LANG ;
	
		// Records to change
			$this->search_options->search_query_object->limit 	= false;
			$this->search_options->search_query_object->offset 	= 0;
			$this->search_options->search_query_object->select 	= [];

		// Search
			$search_development2	= new search_development2($this->search_options->search_query_object);
			$rows_data				= $search_development2->search();
			$ar_records				= (array)$rows_data->ar_records;
			$total_records			= (int)$this->search_options->search_query_object->full_count;

		// propagate iterating records
			$i=0;
			$j=0;
			foreach ($ar_records as $row) {

				$section_id			= $row->section_id;
				$current_component	= component_common::get_instance($modelo_name, $tipo, $section_id, 'list', $lang, $section_tipo);
				$current_dato		= $current_component->get_dato();
				
				$final_dato = $current_dato;
				switch ($action) {
					case 'remove':						
						foreach ((array)$source_dato as $current_locator) {
							$key = locator::get_key_in_array_locator( $current_locator, $final_dato, $ar_properties=['section_tipo','section_id'] );
							if (false!==$key) {
								unset($final_dato[$key]);
							}
						}
						$final_dato = array_values($final_dato);
						break;
					
					case 'add':
						foreach ((array)$source_dato as $current_locator) {
							if (!in_array($current_locator, $final_dato)) {
								$final_dato[] = $current_locator;
							}
						}						
						break;
				}

				if ($final_dato!==$current_dato) {
					$current_component->set_dato($final_dato);
					$current_component->Save();
				}				

				// process state % for EventSource peticion flush
					$i++;
					if(floor($i * 100 / $total_records) > $j){
						$percent	= floor($i * 100 / $total_records);
						$msg		= label::get_label('procesando')." $percent %";
							#echo "id: $i". PHP_EOL;
							echo "data: ".json_encode($msg). PHP_EOL;
							echo PHP_EOL;
							//ob_flush();
							flush();
						$j++;
						//error_log($percent);
					}

			}//end foreach ($ar_records as $row)
		

		return (array)$ar_records;
	}//end propagate_data



}//end tool_add_component_data