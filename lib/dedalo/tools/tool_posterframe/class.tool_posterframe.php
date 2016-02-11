<?php
/*
* CLASS TOOL POSTERFRAME
*/
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');


class tool_posterframe extends tool_common {
	
	# av component
	protected $component_obj ;


	
	public function __construct($component_obj, $modo='button') {
		
		# Fix modo
		$this->modo = $modo;

		# Fix current av component
		$this->component_obj = $component_obj;
	}


	
	
	/**
	* GET_AR_IDENTIFYING_IMAGE
	* Get identifying_image elements possibles from section inverse locators
	* @return 
	*/
	public function get_ar_identifying_image() {
		
		$ar_identifying_image = array();

		#
		# Section locators
		$section = section::get_instance( $this->component_obj->get_parent(), $this->component_obj->get_section_tipo() );
		$inverse_locators = $section->get_inverse_locators();
			#dump($inverse_locators, ' inverse_locators ++ '.to_string());

		foreach ($inverse_locators as $locator) {
			
			$identifying_image = $this->get_identifying_image_from_section( $locator->section_tipo, $locator->section_id );
			if(empty($identifying_image)) continue;

			$ar_identifying_image[] = $identifying_image;			
		}
		#dump($ar_identifying_image, ' ar_identifying_image ++ '.to_string());

		return $ar_identifying_image;

	}#end get_ar_identifying_image

	
	
	/**
	* GET_IDENTIFYING_IMAGE_FROM_SECTION
	* @return array|null
	*/
	public function get_identifying_image_from_section( $section_tipo, $section_id ) {
		
		$ar_portals_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, array('component_portal'), $from_cache=true, $resolve_virtual=true);
		foreach ($ar_portals_tipo as $portal_tipo) {
			
			$RecordObj_dd = new RecordObj_dd($portal_tipo);
			$propiedades  = json_decode($RecordObj_dd->get_propiedades());
			if ($propiedades && isset($propiedades->identifying_image)) {
				return array('section_id' 		=> $section_id,
							 'section_tipo' 	=> $section_tipo,
							 'component_portal' => $portal_tipo,
							 'component_image'  => $propiedades->identifying_image
							 );
				break;
			}
		}

		return null;

	}#end get_identifying_image_from_section












	
	
}

?>