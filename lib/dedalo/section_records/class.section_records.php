<?php
/*
* CLASS SECTION_RECORDS
*
*
*/
class section_records extends common {

	# current section tipo
	public $tipo;
	# search_options include the search_query_object
	public $search_options;
	
	public $button_delete;
	public $button_delete_permissions = 0;

	# records from search
	public $records_data;

	# propiedades of current sectin list
	public $propiedades;



	function __construct($tipo, $search_options) {
		
		# Modo
		$this->tipo = $tipo;
		if (empty($search_options->modo)) {
			throw new Exception("Error Processing Request", 1);			
			trigger_error("Error: search_options->modo in mandatory to create a section_records");
		}

		# Fix options
		$this->search_options = $search_options;

		return true;
	}//end __construct



	/**
	* GET_HTML
	* @return string $html
	*/
	public function get_html() {

		$html='';

		$start_time=microtime(1); // Used later in phtml for statistics
		
		#
		# SAVE_HANDLER . Is defined in section and injected in this->search_options sended to current class
		#dump($this->search_options, ' this->search_options ++ '.to_string());
		if (isset($this->search_options->save_handler) && $this->search_options->save_handler==='session') {
		#dump($this->search_options, ' this->search_options ++ '.to_string());
		#dump($_GET, ' _GET ++ '.to_string());
			//trigger_error("Working here ".__METHOD__);
			/* to_review 14-2-2018 */
			# Mimic database result	with a placebo records_data 				
			$ar_data = array();

			$row = new stdClass();
				$row->section_id 	= DEDALO_SECTION_ID_TEMP;
				$row->section_tipo 	= $this->search_options->search_query_object->section_tipo;

			$ar_data[] = $row;
			/*
			foreach ($this->search_options->filter_by_id as $key => $value) {							
				$ar_data[] = array($value->section_id => array( 'id'=> $value->section_id,
																'section_id' => $value->section_id,
																'section_tipo' => $value->section_tipo)
									);
				break;
			}*/
			$records_data = new stdClass();
				$records_data->ar_records 			= $ar_data;
				#$records_data->search_query_object 	= null;
	
			$this->records_data = $records_data;			
		
		}else{		
		#
		# DEFAULT CASE (save_handler is 'database')	

			$search_options = $this->search_options;
			

			# Calculate rows from database. Exec search
			if ( $search_options->modo==='list_tm' ) {
				// Case time machine uses a different resolution for the search_query_object
				include(DEDALO_LIB_BASE_PATH . '/search/class.search_development2_tm.php');
				$search_development2 = new search_development2_tm($search_options->search_query_object);

			}else{
				// Comom case
				$search_development2 = new search_development2($search_options->search_query_object);
								
			}			
			$records_data = $search_development2->search();


			# Save current search options
			if ($this->search_options->modo==='list') {
				$search_options_id = $this->tipo; // section tipo like oh1
				section_records::set_search_options($search_options, $search_options_id);
			}


			# Fix records_data
			$this->records_data = $records_data;

			#debug_log(__METHOD__." this->search_options **** ".json_encode($this->search_options), logger::DEBUG);						
		}


		# Include controller
		ob_start();
		include ( DEDALO_LIB_BASE_PATH .'/'.get_called_class().'/'.get_called_class().'.php' );
		$html = ob_get_clean();

		/*
		# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)	
		logger::$obj['activity']->log_message(
				'SEARCH',
				logger::INFO,
				$this->tipo,
				NULL,
				$activity_dato = ''
			);
		*/
		
		return (string)$html;
	}//end get_html



	/**
	* SET_SEARCH_OPTIONS
	* Store the last search_options used for this section
	* Useful for maintain coherence between list and edit pagination
	* @return bool
	*/
	public static function set_search_options( $search_options, $search_options_id ) {

		#$search_options = json_encode($search_options, JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES);
		
		# Session way
		$_SESSION['dedalo4']['config']['search_options'][$search_options_id] = $search_options;

		debug_log(__METHOD__." saved_search_options $search_options_id ------ : ".json_encode($search_options), logger::DEBUG);

		return true;
	}//end set_search_options



	/**
	* GET_SEARCH_OPTIONS
	* Return the stored (session or db) last section list search_options
	* Useful for maintain coherence between list and edit pagination
	* @return object $search_options | false
	*/
	public static function get_search_options( $search_options_id ) {
		
		# Session way
		$search_options = isset($_SESSION['dedalo4']['config']['search_options'][$search_options_id]) ? $_SESSION['dedalo4']['config']['search_options'][$search_options_id] : false;

		#if(!$search_options = json_decode($search_options)){ $search_options = false; }

		return $search_options;
	}//end get_search_options
	


}//end section_records
?>