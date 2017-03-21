<?php

/**
* MANAGER
* Manage api web
*/
class manager {


	/**
	* __CONSTRUCT
	* @return 
	*/
	public function __construct() {
		
	}//end __construct



	/**
	* MANAGE_REQUEST
	* @return mixed array|object
	*/
	public function manage_request( $options ) {

		$dedalo_data = null;
		if (!is_object($options) || !property_exists($options,'dedalo_get')) {
			return $dedalo_data;
		}
	

		$dedalo_get  = $options->dedalo_get;
		switch ($options->dedalo_get) {

			case 'reel_terms':
				#
				# Execute data retrieving
				$dedalo_data = (object)web_data::get_reel_terms( $options->av_section_id );
				break;

			case 'fragment_from_index_locator':
				#
				# Execute data retrieving
				$dedalo_data = (object)web_data::get_fragment_from_index_locator( $options->index_locator );
				break;				

			case 'tables_info':
				#
				# Execute data retrieving
				$full = isset($options->full) ? $options->full : false;
				$dedalo_data = (object)web_data::get_tables_info( $full );
				break;

			case 'publication_schema':
				#
				# Execute data retrieving
				$dedalo_data = (array)web_data::get_full_publication_schema( );
				break;

			case 'records':
			default:
				#
				# Execute data retrieving
				$dedalo_data = (object)web_data::get_rows_data( $options );
				break;
		}

		return $dedalo_data;
	}//end manage_request



}
//end class manager
?>