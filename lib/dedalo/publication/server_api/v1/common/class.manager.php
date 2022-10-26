<?php
/**
* MANAGER
* Manage api web
*
*/
class manager {



	#static $version = "1.0.0"; // 06-06-2017
	#static $version = "1.0.1"; // 23-06-2018
	static $version = "1.0.2"; // 17-09-2018



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

			## RECORDS ##
			case 'records':
				#
				# Execute data retrieving
				$dedalo_data = (object)web_data::get_rows_data( $options );
				break;

			## BIBLIOGRAPHY_ROWS ##
			case 'bibliography_rows':
				#
				# Execute data retrieving
				$dedalo_data = (object)web_data::get_bibliography_rows( $options );
				break;

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
				$dedalo_data = (array)web_data::get_publication_schema( );
				break;

			## INFO table_thesaurus ##
			case 'table_thesaurus':
				#
				# Execute data retrieving
				$dedalo_data = web_data::get_table_thesaurus(); // string|null
				break;

			## INFO table_thesaurus_map ##
			case 'table_thesaurus_map':
				#
				# Execute data retrieving
				$dedalo_data = web_data::get_table_thesaurus_map(); // array|null
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
			case 'thesaurus_children':
				#
				# Execute data retrieving
				$dedalo_data = (object)web_data::get_thesaurus_children( $options );
				break;

			case 'thesaurus_parents':
				#
				# Execute data retrieving
				$dedalo_data = (object)web_data::get_thesaurus_parents( $options );
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
			case 'full_interview':
				#
				# Execute data retrieving
				$dedalo_data = (object)web_data::get_full_interview( $options );
				break;


			## GLOBAL_SEARCH ##
			case 'global_search':
				#
				# Execute data retrieving
				$dedalo_data = (object)web_data::get_global_search( $options );
				break;
			case 'global_search_json':
			case 'global_search_mdcat':
				#
				# Execute data retrieving
				$dedalo_data = (object)web_data::get_global_search_json( $options );
				break;

			## NUMISDATA SEARCH_TIPOS ##
			case 'search_tipos':
				#
				# Execute data retrieving
				$dedalo_data = (object)web_data::get_search_tipos( $options );
				break;

			case 'reel_fragments_of_type':
				#
				# Execute data retrieving
				$dedalo_data = (object)web_data::get_reel_fragments_of_type( $options );
				break;

			case 'image_data':
				#
				# Execute data retrieving
				$dedalo_data = (object)web_data::get_image_data( $options );
				break;

			case 'menu_tree_plain':
				#
				# Execute data retrieving
				$dedalo_data = (object)web_data::get_menu_tree_plain( $options );
				break;

			case 'combi':
				#
				# Execute data retrieving
				$dedalo_data = (object)web_data::get_combi( $options );
				break;

			default:
				$dedalo_data = new stdClass();
					$dedalo_data->result = false;
					$dedalo_data->msg 	 = "Error. Undefined method (dedalo_get) : ".$options->dedalo_get;
				break;
		}

		return $dedalo_data;
	}//end manage_request



}//end class manager
