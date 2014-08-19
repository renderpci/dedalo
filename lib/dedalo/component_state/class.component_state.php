<?php
/*
* CLASS COMPONENT_STATE
*/


class component_state extends component_common {
	
	
	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;
	
	# Tipo del componente al que referencia el tool
	public $caller_component_tipo;

	# Nombre o tipo del elemento que lo llama. En un tool, el nombre del tool (e. tool_transcription)
	public $caller_element;
	

	
	# GET_VALOR . DEFAULT IS GET DATO . OVERWRITE IN EVERY DIFFERENT SPECDIFIC COMPONENT
	public function get_valor() {	
		
		$valor_actual = $this->get_dato();
		# Convertimos el dato a json
		$valor_actual = json_handler::encode($valor_actual);		
			#dump($valor_actual,'valor_actual');

		return $valor_actual;
	}


	# GET_VALOR_FOR_CHECKBOX
	# Crea el valor hipotético (completo) del array a salvar 
	function get_valor_for_checkbox() {

		# Reference dato only
		$dato_example = array(
							'dd15' => array('tool_transcription','tool_indexation','lg-spa'),
							'dd17' => array('tool_transcription','tool_indexation')
							);

		$dato = $this->get_dato();
			#dump($dato,'dato');

		#dump($this->caller_component_tipo,'$this->caller_component_tipo');

		if(!is_array($dato)) {
			$dato = array( $this->caller_component_tipo => array() );
		}

		if(empty($dato[$this->caller_component_tipo])) {
			$dato[$this->caller_component_tipo] = array(); 
		}

		/*
		if( !in_array($this->caller_element, $dato[$this->caller_component_tipo]) ) {
			$dato[$this->caller_component_tipo][] = $this->caller_element;
		}
		*/

		# Convertimos el dato a json
		$dato = json_handler::encode($dato);
			#dump($dato,'dato');

		return $dato;
	}


	public function map_dato_to_current_element() {

		if(empty($this->caller_element)) {
			throw new Exception("Error Processing Request: caller_element is not defined", 1);			
		}

		$ar_dato = $this->get_dato();
			#dump($ar_dato,'ar_dato');

		if( empty($ar_dato[$this->caller_component_tipo])) {
			return false;
		}

		$ar_value = $ar_dato[$this->caller_component_tipo];
		if(is_array($ar_value)) foreach ($ar_value as $value) {
			if($value==$this->caller_element) return true;
		}
	}



	
	/**
	* MAP_TOOL_NAME
	*/
	public function map_tool_name($key) {

		$map = array(	'tool_transcription' 	=> 'TR',
						'tool_indexation' 		=> 'ID',
						'tool_lang' 			=> 'LG',
					);

		if(!isset($map[$key])) return null;

		return $map[$key];
	}


	/**
	* GET_AR_DATA_BY_TOOL
	*/
	protected function get_ar_data_by_tool() {

		if(SHOW_DEBUG) $start_time = start_time();

		$ar_data_by_tool = array();

		$section_id 	= $this->parent;	if( intval($section_id)<1 ) throw new Exception("Error Processing Request: section_id is empty - modo:$this->modo", 1);

		$matrix_table 	= common::get_matrix_table_from_tipo($this->tipo);
		$section_tipo 	= common::get_tipo_by_id($section_id, $matrix_table);

		# CACHE : Cache (las secciones del mismo tipo, tienen la misma estructura)
		static $ar_data_by_tool;
		if(isset($ar_data_by_tool[$section_tipo])) {
			return $ar_data_by_tool[$section_tipo];
		}
		
		
		$section = new section($section_id, $section_tipo);
			#dump($section_id, '$section_id ');		
		$ar_section_childrens = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, 'component_');
			#dump($ar_children_objects,'$ar_children_objects');

		foreach ($ar_section_childrens as $current_component_tipo) {
					
			$ar_tools = array();

			# COMPONENT : Build current component
			$modelo_name 		= RecordObj_ts::get_modelo_name_by_tipo($current_component_tipo);
			$current_component 	= new $modelo_name($current_id=NULL, $current_component_tipo, 'edit', $section_id);

			$current_component_tools = $current_component->get_ar_tools_obj();

			if(!empty($current_component_tools)) {
				$ar_tools = array_keys($current_component_tools);
				#dump($ar_tools,'ar_tools');			

				# INDEXABLES
				if( in_array('tool_indexation', $ar_tools)) {
					$ar_data_by_tool['tool_indexation'][] = $current_component_tipo;
				}

				# TRANSCRIBIBLES
				if( in_array('tool_transcription', $ar_tools)) {
					$ar_data_by_tool['tool_transcription'][] = $current_component_tipo;
				}
			}
			
			# TRADUCIBLES
			$traducible = $current_component->get_traducible();
				#dump($traducible,'traducible');
			if($traducible!='no') {
				$ar_data_by_tool['tool_lang'][] = $current_component_tipo;
			}
		}

		# AR LANGS ALL
		$ar_tool_lang_all = $section->get_ar_all_project_langs();		

		$ar_data_by_tool_final = array($ar_data_by_tool,$ar_tool_lang_all);
			#dump($ar_data_by_tool_final,'ar_data_by_tool');

		# CACHE : Static cache
		$ar_data_by_tool[$section_tipo] = $ar_data_by_tool_final;

		if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__. ' ' );

		return $ar_data_by_tool_final;
	}

	


	/**
	* GET_ESTADO
	*/
	protected function get_estado() {

		#dump($this->get_modo(),'get_estado this->modo'); return null;

		static $ar_estado;
		if(isset($ar_estado[$this->parent])) {
			dump($ar_estado[$this->parent],'$ar_estado');
			return $ar_estado[$this->parent];
		}

		$ar_data = $this->get_ar_data_by_tool();

		# COMPONENTS BY TOOL
		$ar_data_by_tool = $ar_data[0];	
			#dump($ar_data_by_tool,'$ar_data_by_tool');

		# all langs
		$ar_tool_lang_all = $ar_data[1];
			#dump($ar_tool_lang_all,'ar_tool_lang_all');

		# dato
		$dato = $this->get_dato();
			#dump($dato,'dato');

		if(empty($dato)) return array();
		

		$n_current_tool_transcription=0;
		$n_current_tool_indexation=0;
		$n_total_tool_transcription=0;
		$n_total_tool_indexation=0;
		
		foreach ($ar_data_by_tool as $key => $ar_component_tipo) {
			
			# TRANSCRIBIBLES			
			if ($key=='tool_transcription') {
				foreach ($ar_component_tipo as $component_tipo) {
					$exists = array_key_exists($component_tipo, $dato);
					if($exists){
						foreach ($dato[$component_tipo] as $ar_tools) {
							if($ar_tools=='tool_transcription') $n_current_tool_transcription++;
						}
					}
				}
				$n_total_tool_transcription = count($ar_component_tipo);
			}

			# INDEXABLES			
			if ($key=='tool_indexation') {
				foreach ($ar_component_tipo as $component_tipo) {
					$exists = array_key_exists($component_tipo, $dato);
					if($exists){
						foreach ($dato[$component_tipo] as $ar_tools) {
							if($ar_tools=='tool_indexation') $n_current_tool_indexation++;
						}
					}
				}
				$n_total_tool_indexation = count($ar_component_tipo);
			}

			# TRADUCIBLES			
			if ($key=='tool_lang') {
				foreach ($ar_component_tipo as $component_tipo) {

					$exists = array_key_exists($component_tipo, $dato);
					if($exists){
						foreach ($dato[$component_tipo] as $current_tool) {
							#dump($current_tool,'$current_tool');
							
							if(strpos($current_tool, 'tool_lang:')!==false) {

								$ar_bits 		= explode(':', $current_tool);
								$actual_lang 	= $ar_bits[1];

								if(isset($ar_current_tool_lang[$actual_lang])) {
									$ar_current_tool_lang[$actual_lang] = $ar_current_tool_lang[$actual_lang] + 1;
								}else{
									$ar_current_tool_lang[$actual_lang] = 1;
								}								
							}# /if(strpos($current_tool, 'tool_lang:')!==false)								

						}# foreach
					}# /if($exists)				


					foreach ($ar_tool_lang_all as $actual_lang) {			
						if(isset($ar_total_tool_lang[$actual_lang])) {
							$ar_total_tool_lang[$actual_lang] = $ar_total_tool_lang[$actual_lang] + 1;
						}else{
							$ar_total_tool_lang[$actual_lang] = 1;
						}						
					}

				}# foreach ($ar_component_tipo as $component_tipo)

			}# /if ($key=='tool_lang')

		}# /foreach ($ar_data_by_tool as $key => $ar_component_tipo)

	

		# TANTOS POR CIEN 
		$porcentaje_transcription 	= 0;
		if($n_total_tool_transcription>0)
			$porcentaje_transcription 	= round($n_current_tool_transcription * 100 / $n_total_tool_transcription,2) ;
			#dump($porcentaje_transcription,'$porcentaje_transcription');
		
		$porcentaje_indexation 		= 0;
		if($n_total_tool_indexation>0)
			$porcentaje_indexation 		= round($n_current_tool_indexation * 100 / $n_total_tool_indexation,2) ;
			#dump($porcentaje_indexation,'$porcentaje_indexation');
		
		foreach ($ar_tool_lang_all as $actual_lang) {
			if (!isset($ar_current_tool_lang[$actual_lang])) {
				$ar_current_tool_lang[$actual_lang] = 0;
			}
			$ar_porcentaje_lang[$actual_lang] 	= round($ar_current_tool_lang[$actual_lang] * 100 / $ar_total_tool_lang[$actual_lang],2);
				#dump($ar_porcentaje_lang[$actual_lang],"$actual_lang");
		}
		$n_keys = count($ar_porcentaje_lang);
		$total = 0;
		foreach ($ar_porcentaje_lang as $key => $value) {
			$total += $value;
		}
		$porcentaje_lang_global = round($total / $n_keys,2);
			#dump($total,'total');
			#dump($porcentaje_lang_global,'porcentaje_lang_global');

		$estado = array(
					'tool_transcription' 	=> $porcentaje_transcription,
					'tool_indexation' 		=> $porcentaje_indexation,
					'tool_lang' 			=> $porcentaje_lang_global,
					'ar_porcentaje_lang' 	=> $ar_porcentaje_lang
					);

		# CACHE : Static cache
		$ar_estado[$this->parent] = $estado;
			#dump($ar_estado,'$ar_estado');

		return $estado;
	}






}
?>