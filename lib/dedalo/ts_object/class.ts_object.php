<?php
/*
* CLASS ts_object
* Manage tesaurus hierarchycal elements. Every element is a section used as thesaurus term
* 
*/
class ts_object extends Accessors {
	

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
	# int 
	public $order;

	public $ar_elements;

	/**
	* __CONSTRUCT
	* @param int $section_id
	* @param string $section_tipo
	* @param object $options
	*	Default null
	* @param string $modo
	*	Default 'edit'
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

		# Set default order
		$this->order = 1000; // Default is 1000. When get_html is called, this var is updated with component value if exits and have data
	}//end __construct



	/**
	* GET_HTML
	* @return string $html
	*/
	public function get_html() {
		
		#if(SHOW_DEBUG) $start_time = start_time();		
	
		ob_start();
		include ( dirname(__FILE__) .'/'. get_class() .'.php' );
		$html = ob_get_clean();

		#if(SHOW_DEBUG) {
			#$GLOBALS['log_messages'][] = exec_time($start_time, __METHOD__. ' ', "html");
			#global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		#}
		
		return (string)$html;
	}//end get_html



	/**
	* GET_AR_ELEMENTS
	* @return array ar_elements
	*/
	public function get_ar_elements() {
		
		if(SHOW_DEBUG) {
			if (isset($this->elements)) {
				#return $this->elements;
			}
		}
		$ar_elements = array();

		// Elements are stored in current section > section_list_thesaurus
		// Search element in current section
		$section_tipo 			 = $this->section_tipo;
		$ar_modelo_name_required = array('section_list_thesaurus');
		$ar_children  = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo,
																				$ar_modelo_name_required,
																				$from_cache=true,
																				$resolve_virtual=false,
																				$recursive=false,
																				$search_exact=true);

		# If element exists (section_list_thesaurus) we get element 'propiedades' json value as array
		# dump($ar_children, ' ar_children ++ '.to_string($section_tipo));
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

		$this->elements = (array)$ar_elements;

		return $this->elements;
	}//end get_ar_elements



	/**
	* GET_CHILDRENS_DATA
	* @return object $childrens_data
	*/
	public function get_childrens_data() {

		# Global object
		$childrens_data = new stdClass();
			$childrens_data->section_tipo 	= $this->section_tipo;
			$childrens_data->section_id		= $this->section_id;
			$childrens_data->modo 			= 'edit';	//'list_thesaurus';
			$childrens_data->lang 			= DEDALO_DATA_LANG;
			$childrens_data->ar_elements 	= array();


		# ELEMENTS
		$ar_elements = $this->get_ar_elements();
		foreach ($ar_elements as $k_element_tipo => $current_object) {

			$element_tipo= $current_object->tipo;
			$render_vars = $current_object;				
			
			# Each element
			$element_obj = new stdClass();
				$element_obj->type = $render_vars->type;
				$element_obj->tipo = $element_tipo;
				
				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($element_tipo,true);
				$component 	 = component_common::get_instance($modelo_name,
															  $element_tipo,
															  $this->section_id,
															  $modo='list_thesaurus',
															  $lang=DEDALO_DATA_LANG,
															  $this->section_tipo);
				$dato = $component->get_dato();

				switch (true) {
					case ($element_obj->type=='term'):
						# term Is traducible and uses lang fallback here
						#dump($component, ' var ++ '.to_string($this->section_tipo));
						$element_obj->value = component_input_text::render_list_value($dato, $element_tipo, $this->section_id, $modo, $lang, $this->section_tipo, $this->section_id);
						break;
					case ($element_obj->type=='icon'):
						# icon Not need more info. Value is property 'type'
						$element_obj->value = $render_vars->icon;
						if(empty($dato)) continue 2; // Skip empty icon value links

						if ($modelo_name=='component_relation_index') {
							$total = count($dato);
							$element_obj->value .= ":$total";
						}
						break;
					case ($element_obj->type=='link' && $element_obj->tipo=='hierarchy49'):
						if(empty($dato)) {
							continue 2; // Skip empty childrens value links
						}else{
							$element_obj->value = 'button show childrens';
						}	
						break;
					default:
						$element_obj->value = $dato;
						break;
				}
		
				
			# Add
			$childrens_data->ar_elements[]	= $element_obj;
		}


		return (object)$childrens_data;
	}//end get_childrens_data




	
}//end ts_object
?>