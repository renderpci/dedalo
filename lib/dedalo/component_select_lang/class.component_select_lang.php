<?php
/*
* CLASS COMPONENT SELECT
*/


class component_select_lang extends component_common {
	
	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;

	
	# GET DATO : Format "lg-spa"
	public function get_dato() {
		$dato = parent::get_dato();
		return (string)$dato;
	}

	# SET_DATO
	public function set_dato($dato) {
		parent::set_dato( (string)$dato );
	}


	/**
	* GET_AR_ALL_PROJECT_select_LANGS
	* @return Array format id_matrix=>termino:
	* Array
	*		(
	*	    	[lg-eng] => English
	*	    	[lg-spa] => Spanish
	*		)
	*/
	public function get_ar_all_project_select_langs() {
		
		#if($this->modo != 'edit') return array();

		$ar_final 	= array();
		$section_id = $this->get_parent();

		if($section_id > 1) {			
			
			$section_tipo		 	= $this->get_section_tipo();
			$section 				= section::get_instance($section_id,$section_tipo);
			$ar_all_project_langs 	= $section->get_ar_all_project_langs();
				#dump($ar_all_project_langs," ar_all_project_langs ".DEDALO_APPLICATION_LANG);		

		}else{

			# UNDER CONSTRUCTION
			# To do: calculate all projects langs of all records ??
			$ar_all_project_langs 	= unserialize(DEDALO_PROJECTS_DEFAULT_LANGS);
		}
		#dump($ar_all_project_langs,'$ar_all_project_langs');


		# FINAL FORMATED ARRAY
		foreach ($ar_all_project_langs as $current_lang) {			
			$ar_final[$current_lang] = RecordObj_ts::get_termino_by_tipo($current_lang, DEDALO_APPLICATION_LANG, true); # $terminoID, $lang=NULL, $from_cache=false, $fallback=true
		}
		if(SHOW_DEBUG) {
			#dump($ar_final," ar_final ".DEDALO_APPLICATION_LANG);		
		}

		return $ar_final;
	}



	
	# GET VALUE . DEFAULT IS GET DATO . OVERWRITE IN EVERY DIFFERENT SPECIFIC COMPONENT
	public function get_valor() {
		$dato 	 = $this->get_dato();

		#if(empty($dato)) return null;

		if (strlen($dato)>2) {
			return RecordObj_ts::get_termino_by_tipo($dato,DEDALO_APPLICATION_LANG,true);
		}
		return $dato;					
	}

	/**
	* BUILD_SEARCH_COMPARISON_OPERATORS 
	* Note: Override in every specific component
	* @param array $comparison_operators . Like array('=','!=')
	* @return object stdClass $search_comparison_operators
	*/
	public function build_search_comparison_operators( $comparison_operators=array('=','!=') ) {
		return (object)parent::build_search_comparison_operators($comparison_operators);
	}#end build_search_comparison_operators
	

}
?>