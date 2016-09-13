<?php
/*
* CLASS row_thesaurus
* Manage tesaurus hierarchycal elements. Every element is a section used as thesaurus term
*/

class row_thesaurus extends Accessors {
	

	# int (mandatory)
	protected $section_id;
	# string (mandatory)
	protected $section_tipo;
	# object
	protected $section;
	# mixed object|null (default null)
	protected $options;
	# string (default 'edit')
	protected $modo;


	/**
	* __CONSTRUCT
	* @param int $section_id
	* @param string $section_tipo
	*/
	public function __construct( $section_id, $section_tipo, $options=null, $modo='edit' ) {
		
		$this->section_id   = $section_id;
		$this->section_tipo = $section_tipo;

		# Build and set current section obj
		$this->section = section::get_instance( $section_id, $section_tipo );

		# Fix options
		$this->options = $options;

		# Fix modo
		$this->modo = $modo;

	}//end __construct



	/**
	* GET_HTML
	* @return string $html
	*/
	public function get_html() {
		
		if(SHOW_DEBUG) $start_time = start_time();		
	
		ob_start();
		include ( dirname(__FILE__) .'/'. get_class() .'.php' );
		$html = ob_get_clean();

		if(SHOW_DEBUG) {
			#$GLOBALS['log_messages'][] = exec_time($start_time, __METHOD__. ' ', "html");
			#global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}
		
		return (string)$html;
	}//end get_html



	/**
	* GET_TERM
	* Returns thesaurus term in current lang
	* @return string $term
	*/
	public function get_term() {
		$term='Paquito';

		return (string)$term;
	}//end get_term



	/**
	* GET_MODEL
	* Returns thesaurus model in current lang
	* @return 
	*/
	public function get_model() {
		
	}//end get_model



	/**
	* GET_AR_ELEMENTS
	* @return array ar_elements
	*/
	public function get_ar_elements() {
		$ar_elements = array();

		// Elements are stored in current section > section_list_thesaurus
		$section_tipo 			 = $this->section_tipo;
		$ar_modelo_name_required = array('section_list_thesaurus');
		$ar_children = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual=true, $recursive=false, $search_exact=true);
			#dump($ar_children, ' ar_children ++ '.to_string($section_tipo));
		if (isset($ar_children[0])) {
			
			$section_list_thesaurus_tipo = $ar_children[0];

			# relation map
			$RecordObj_dd = new RecordObj_dd($section_list_thesaurus_tipo);
			$ar_elements  = json_decode($RecordObj_dd->get_propiedades());
				#dump($ar_elements, ' ar_elements ++ '.to_string());
			/*
			# Get related terms
			$related_terms   = (array)RecordObj_dd::get_ar_terminos_relacionados($section_list_thesaurus_tipo, $cache=true, $simple=true);
				#dump($related_terms, ' related_terms ++ '.to_string());
			foreach ($related_terms as $related_tipo) {
				# code...
			}
			*/
		}

		return (array)$ar_elements;
	}//end get_ar_elements



	
}//end row_thesaurus
?>