<?php
/*
* CLASS TIME_MACHINE_LIST
* Show the last changes in time machine of the sections
* build the list with last changes inside the components of the sections
*/
class time_machine_list extends common {

	protected $tipo;
	protected $section_id;
	protected $section_tipo;
	protected $modo;
	protected $value_resolved;
	protected $limit;
	protected $offset;
	protected $count;

	/**
	* CONSTRUCT
	* 
	*/
	public function __construct($tipo, $section_id, $section_tipo, $modo='edit') {

		$this->tipo 		= $tipo;
		$this->section_id 	= $section_id;
		$this->section_tipo = $section_tipo;
		$this->modo 		= $modo;

	}//end __construct


	/**
	* GET_TIME_MACHINE_RECORDS
	* Get the last time_machine records of the current section
	* @see search_development2::calculate_inverse_locator
	* @return array $inverse_locators
	*/
	public function get_time_machine_list_obj($limit=1, $offset=0, $count=false) {

		if (empty($this->section_id)) {
			# Section not exists yet. Return empty array
			return array();
		}

		if($count === true){
			$limit = null;
		}

		$ar_time_machine_records = RecordObj_time_machine::get_ar_time_machine_of_this('', $this->section_id, null, $this->section_tipo, $limit, $offset);
		# Get calculated inverse locators for all matrix tables
		

		if($count === true){
			$json->data 	= $ar_time_machine_records;
			return (array)$json;
		}


		$ar_time_machine_obj = array();

		#dump($ar_time_machine_records,'ar_time_machine_records');

		# Create an array of objects corresponding to time_machine id's found
		if( is_array($ar_time_machine_records)) foreach($ar_time_machine_records as $id)  {

			# Build new time_machine object
			$RecordObj_time_machine	= new RecordObj_time_machine($id);

			# Add current TM object
			$ar_component_time_machine[]	= $RecordObj_time_machine;
		}

			$ar_data = [];
			foreach((array)$ar_component_time_machine as $tm_obj) {
				
				$date					= component_date::timestamp_to_date($tm_obj->get_timestamp(), $seconds=true);
				$userID					= $tm_obj->get_userID();
				$mod_user_name			= section::get_user_name_by_userID($userID);
				$id_time_machine		= $tm_obj->get_ID();
				$component_tipo 		= $tm_obj->get_tipo();
				$lang					= $tm_obj->get_lang();
				$dato					= $tm_obj->get_dato();
				$uid 					= $tm_obj->get_identificador_unico();
				$show_row 		 		= false;

				$component_label = RecordObj_dd::get_termino_by_tipo($component_tipo);

				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);

				switch ($modelo_name) {
					case 'component_text_area':
						$value	= component_text_area::clean_raw_text_for_preview($dato);
						$value 	= strip_tags($value);						
						break;		
					default:
						if (!is_string($dato)) {
							$current_component = component_common::get_instance(
																		$modelo_name, 
																		$component_tipo, 
																		$this->section_id,
																		'list', 
																		$lang, 
																		$this->section_tipo
							);
							$value = $current_component->get_valor();
							#$value = json_encode($dato, JSON_UNESCAPED_UNICODE);
							
						}else{
							$value = $dato;
							$value = strip_tags($value);
						}
						#$value	= to_string($dato);
						break;
				}				
				
				$max_long = 50;
				if (strlen($value)>$max_long) {
					$value = mb_substr($value, 0, $max_long) . '..';	
				}

				$value = json_encode($value, JSON_UNESCAPED_UNICODE);

				$lang_label = null;
				if($lang !== 'lg-nolan'){
					$lang_label = lang::get_name_from_code($lang);
				}
						

				// Row object
				$row_obj = new stdClass();
					$row_obj->date 					= $date;
					$row_obj->userID 				= $userID;
					$row_obj->mod_user_name 		= $mod_user_name;
					$row_obj->id_time_machine 		= $id_time_machine;
					$row_obj->component_tipo 		= $component_tipo;
					$row_obj->component_label 		= $component_label;
					$row_obj->section_id 			= $this->section_id;
					$row_obj->section_tipo  		= $this->section_tipo;
					$row_obj->lang 					= $lang;
					$row_obj->lang_label			= $lang_label;
					$row_obj->value 				= $value;
					$row_obj->uid 					= $uid;

				$ar_data[] = $row_obj;
				
			}//end foreach((array)$ar_component_time_machine as $tm_obj)


			// JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
			#$json = json_encode($ar_data, JSON_HEX_QUOT);

		#dump($ar_data,'$ar_data');
		#$context = 'context';
		#$json->$context = $ar_context;
		$json->data 	= $ar_data;

		#return $json;

		return (array)$json;	
	}//end get_inverse_references



	/**
	* GET_DATA
	* 
	*/
	public function get_ar_data($locator, $ar_components, $value_resolved=false){

		$data = [];

		$section_tipo 	= $locator->from_section_tipo;
		$section_id 	= $locator->from_section_id;

		$current_id = new stdClass;
					$current_id->section_tipo 		= $section_tipo;
					$current_id->section_id 		= $section_id;
					$current_id->component_tipo		= 'id';

		$data[] = $current_id;
		
		if($value_resolved===true && isset($ar_components)){
			foreach ($ar_components as $current_relation_component) {
				foreach ($current_relation_component as $modelo => $tipo) {
					$modelo_name		= RecordObj_dd::get_modelo_name_by_tipo($modelo, true);
					$current_component	= component_common::get_instance(
																		$modelo_name, 
																		$tipo, 
																		$section_id,
																		'list', 
																		DEDALO_DATA_LANG, 
																		$section_tipo
																		);
					$value = $current_component->get_valor();

					$component_object = new stdClass;
						$component_object->section_tipo		= $section_tipo;
						$component_object->section_id 		= $section_id;
						$component_object->component_tipo	= $tipo;
						$component_object->value 			= $value;

					$data[] = $component_object;
				}
			}
		}
	
		return $data;

	}//end get_data



	/**
	* GET_JSON
	* 
	*/
	public function get_json(){

		if(SHOW_DEBUG===true) $start_time = start_time();

			#dump(DEDALO_LIB_BASE_PATH .'/'. get_called_class() .'/'. get_called_class() .'_json.php', '++++++++++++++++++++');
		
			# Class name is called class (ex. component_input_text), not this class (common)	
			include ( DEDALO_LIB_BASE_PATH .'/'. get_called_class() .'/'. get_called_class() .'_json.php' );

		if(SHOW_DEBUG===true) {
			#$GLOBALS['log_messages'][] = exec_time($start_time, __METHOD__. ' ', "html");
			global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}
		
		return $json;
	}//end get_json




}//end time_machine_list

?>