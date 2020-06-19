<?php
require_once( DEDALO_CONFIG_PATH .'/config.php');
/**
* TOOL_POSTERFRAME
*
*/
class tool_posterframe extends tool_common {
	
	# av component
	protected $component_obj ;


	/**
	* __CONSTRUCT
	*/
	public function __construct($component_obj, $modo='button') {
		
		# Fix modo
		$this->modo = $modo;

		# Fix current av component
		$this->component_obj = $component_obj;
	}//end __construct

	
	
	/**
	* GET_AR_IDENTIFYING_IMAGE
	* Get identifying_image elements possibles from section inverse locators
	* @return 
	*/
	public function get_ar_identifying_image() {
		
		$ar_identifying_image = array();

		#
		# Section locators
		$section 		  = section::get_instance( $this->component_obj->get_parent(), $this->component_obj->get_section_tipo() );
		$inverse_locators = $section->get_inverse_locators();
	
		foreach ($inverse_locators as $locator) {
			
			$identifying_image = $this->get_identifying_image_from_section( $locator->from_section_tipo, $locator->from_section_id );
			if(empty($identifying_image)) continue;

			$ar_identifying_image[] = $identifying_image;			
		}
		

		return $ar_identifying_image;
	}//end get_ar_identifying_image

	
	
	/**
	* GET_IDENTIFYING_IMAGE_FROM_SECTION
	* @return array|null
	*/
	public function get_identifying_image_from_section( $section_tipo, $section_id ) {
		
		$ar_portals_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, ['component_portal'], $from_cache=true, $resolve_virtual=true);
		
		foreach ($ar_portals_tipo as $portal_tipo) {
			
			$RecordObj_dd = new RecordObj_dd($portal_tipo);
			$properties  = json_decode($RecordObj_dd->get_properties());
			if ($properties && isset($properties->identifying_image)) {
				return array('section_id' 		=> $section_id,
							 'section_tipo' 	=> $section_tipo,
							 'component_portal' => $portal_tipo,
							 'component_image'  => $properties->identifying_image
							 );
				break;
			}
		}

		return null;
	}//end get_identifying_image_from_section

	
	
}
?>