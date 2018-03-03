<?php
/*
* CLASS DATAFRAME
*
*
*/
class dataframe extends common {

	public $tipo;

	# dataframe modo
	public $modo;

	# Component
	public $component_obj;

	# Caller vars
	public $caller_key;
	public $caller_component_tipo;
	public $caller_section_tipo;
	public $caller_section_id;

	/**
	* __CONSTRUCT 
	* @param object $component_obj (can be 'component')
	* @param string $modo (default is 'page' when is called from main page)
	*/
	public function __construct($dataframe_tipo, $type, $component_obj, $modo, $caller_key){
		
		$this->tipo 					= $dataframe_tipo;
		$this->component_obj			= $component_obj;

		$this->modo						= $modo;
		
		$this->caller_key 				= $caller_key;		
		$this->caller_component_tipo	= $component_obj->get_tipo();
		$this->caller_section_tipo		= $component_obj->get_section_tipo();
		$this->caller_section_id 		= $component_obj->get_parent();
		$this->type 					= $type;
	}


	/**
	* HTML
	* @return string $html (final html code)
	*/
	public function get_html() {

		if(SHOW_DEBUG===true) {
			#global$TIMER;$TIMER[get_called_class().'_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		ob_start();
		include ( DEDALO_LIB_BASE_PATH .'/'.get_called_class().'/'.get_called_class().'.php' );
		$html = ob_get_clean();		
		

		if(SHOW_DEBUG===true) {
			#global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		return $html;
	}//end get_html



	/**
	* GET_AR_CHILDRENS : private alias of RecordObj_dd::get_ar_recursive_childrens
	* Note th use of $ar_exclude_models to exclude not desired section elements, like auxiliar structure terms that are not necesary here
	*/
	public function get_ar_childrens() {
		#$RecordObj_dd			= new RecordObj_dd($tipo);
		#$ar_recursive_childrens = (array)$RecordObj_dd->get_ar_recursive_childrens_of_this($tipo);
		
		# AR_EXCLUDE_MODELS
		# Current elements and childrens are not considerated part of section and must be excluded in children results
		$ar_exclude_models = array('box elements','area');		

		$ar_recursive_childrens = RecordObj_dd::get_ar_childrens($this->tipo, false, $ar_exclude_models);

		return (array)$ar_recursive_childrens;
	}//end get_ar_childrens



	/**
	* BUILD_COMPONENTS
	* @return array $ar_component_obj
	*/
	public function build_components($type) {

		$ar_component_tipo 	= $this->get_ar_childrens();
		$ar_component_obj 	= array();
		$modo 				= $this->modo;
		foreach ($ar_component_tipo as $current_component_tipo) {	
			
			$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true);
			$component_obj  = component_common::get_instance($modelo_name,
															 $current_component_tipo,
															 $this->caller_section_id,
															 $modo,
															 DEDALO_DATA_LANG,
															 $this->caller_section_tipo);

			# Dato inject
			$dataframe_data = $this->get_dataframe_data_of_type($type);

			if (isset($dataframe_data[$this->caller_key])) {
				$component_obj->set_dato($dataframe_data[$this->caller_key]);
			}

			# Configure component
			$component_obj->caller_dataset = new stdClass();
				$component_obj->caller_dataset->component_tipo  = $this->component_obj->get_tipo();
				$component_obj->caller_dataset->caller_key 		= $this->caller_key;
				$component_obj->caller_dataset->type 			= $type;
				$component_obj->caller_dataset->section_tipo  	= $this->caller_section_tipo;
				$component_obj->caller_dataset->section_id  	= $this->caller_section_id;

			# Heritage permisions from caller component
			$permissions = common::get_permissions($this->component_obj->get_section_tipo(), $this->component_obj->get_tipo());
			$component_obj->set_permissions($permissions);

			$ar_component_obj[] = $component_obj;
		}//end foreach ($ar_component_tipo as $current_component_tipo) 
		

		return $ar_component_obj;
	}//end build_components



	/**
	* GET_DATAFRAME_DATA_OF_TYPE
	* @param string $type
	* @return array $ar_locators
	*/
	public function get_dataframe_data_of_type($type) {
		
		$dataframe 		= (array)$this->component_obj->get_dataframe();
			#dump($dataframe, ' dataframe ++ '.to_string());
			#	dump($type, ' type ++ '.to_string());
		$ar_locators 	= array();
		foreach ($dataframe as $frame_obj) {
			
			if( !is_object($frame_obj) ){

				debug_log(__METHOD__." Error. Bad frame_obj. gettype:".gettype($frame_obj).", dataframe_tipo:$this->tipo, component_tipo:".$this->component_obj->get_tipo().", frame_obj: ".to_string($frame_obj), logger::DEBUG);
			
			}else if($frame_obj->type === $type) {
				
				$ar_locators[$frame_obj->from_key] = $frame_obj;
			}
		}
	#dump($ar_locators, ' ar_locators ++ '.to_string());
		return $ar_locators;
	}//end get_dataframe_data_of_type





}//end dataframe class

?>