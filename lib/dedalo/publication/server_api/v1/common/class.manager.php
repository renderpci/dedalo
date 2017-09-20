<?php
/**
* MANAGER
* Manage api web
*
*/
class manager {



	#static $version = "1.0.0"; // 06-06-2017
	static $version = "1.0.1"; // 23-06-2017


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

			## INFO ##
			case 'tables_info':
				#
				# Execute data retrieving
				$full = isset($options->full) ? $options->full : false;
				$dedalo_data = (object)web_data::get_tables_info( $full );
				break;

			case 'publication_schema':
				#
				# Execute data retrieving
				# $dedalo_data = (array)web_data::get_full_publication_schema( );
				$dedalo_data = (array)web_data::get_publication_schema( );
				break;


			## RECORDS ##
			case 'records':
				#
				# Execute data retrieving
				$dedalo_data = (object)web_data::get_rows_data( $options );
				break;

			
			## THESAURUS ##
			case 'reel_terms':
				#
				# Execute data retrieving
				$dedalo_data = (object)web_data::get_reel_terms( $options );
				break;

			case 'fragment_from_index_locator':
				#
				# Execute data retrieving
				$dedalo_data = (object)web_data::get_fragment_from_index_locator( $options );
				break;			

			case 'thesaurus_root_list':
				#
				# Execute data retrieving
				$dedalo_data = (object)web_data::get_thesaurus_root_list( $options );
				break;

			case 'thesaurus_random_term':
				#
				# Execute data retrieving
				$dedalo_data = (object)web_data::get_thesaurus_random_term( $options );
				break;

			case 'thesaurus_search':
				#
				# Execute data retrieving
				$dedalo_data = (object)web_data::get_thesaurus_search( $options );
				break;

			case 'thesaurus_autocomplete':
				#
				# Execute data retrieving
				$dedalo_data = (object)web_data::get_thesaurus_autocomplete( $options );
				break;				

			case 'thesaurus_term':
				#
				# Execute data retrieving
				$dedalo_data = (object)web_data::get_thesaurus_term( $options );
				break;

			case 'thesaurus_indexation_node':
				#
				# Execute data retrieving
				$dedalo_data = (object)web_data::get_thesaurus_indexation_node( $options );
				break;

			case 'thesaurus_video_view_data':
				#
				# Execute data retrieving
				$dedalo_data = (object)web_data::get_thesaurus_video_view_data( $options );
				break;

			case 'thesaurus_childrens':
				#
				# Execute data retrieving
				$dedalo_data = (object)web_data::get_thesaurus_childrens( $options );
				break;	


			## FREE ##
			case 'free_search':
				#
				# Execute data retrieving
				$dedalo_data = (object)web_data::get_free_search( $options );
				break;


			## FULL ##
			case 'full_reel':
				#
				# Execute data retrieving
				$dedalo_data = (object)web_data::get_full_reel( $options );
				break;			
	

			default:				
				$dedalo_data = new stdClass();
					$dedalo_data->result = false;
					$dedalo_data->msg = "Error. Undefined method (dedalo_get) : ".$options->dedalo_get;					
				break;
		}
	
		return $dedalo_data;
	}//end manage_request



}//end class manager
?>