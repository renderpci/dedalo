<?php
/*
* CLASS SECTION_RECORDS
*/




class section_records extends common {

	public $tipo;
	public $options;
	public $button_delete;
	public $button_delete_permissions = 0;

	public $rows_obj;	



	function __construct($tipo, $options) {
		#dump($modo,"modo pasado a section list");
		$this->tipo 	= $tipo;		

		if (empty($options->modo)) {
			throw new Exception("Error Processing Request", 1);			
			trigger_error("Error: options->modo in mandatory to create a section_records");
		}


		#
		# LIST OPTIONS STORE
		if ( $options->modo==='list' ) {

			$search_options_session_key = 'section_'.$this->tipo;
			if (isset($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key])) {				
			
				$session_options = $_SESSION['dedalo4']['config']['search_options'][$search_options_session_key];
		
				if ( empty($options->layout_map) && 
					!empty($session_options) &&
					!empty($session_options->layout_map_list)) {
					$options->layout_map = $options->layout_map_list = (array)$session_options->layout_map_list;
					if(SHOW_DEBUG===true) {
					 	//error_log("ya va desde sesion");
					}
				}
				
				if (isset($options->offset_list)) {
					$session_options->offset_list = $options->offset_list;
				}
				
				# Offset
				$options->offset = (int)$session_options->offset_list;
				//trigger_error((int)$session_options->offset_list);
					
				
				if (!empty($session_options->limit)) {
					$options->limit_list = (int)$session_options->limit;
				}
			}
			#dump($options, " options ".to_string());

		}//if ( $options->modo==='list' ) {

		$this->options  = $options;

	}//end __construct



	/**
	* GET_HTML
	* @return string $html
	*/
	public function get_html() {
		$html='';

		$start_time=microtime(1); // Used later in phtml for statistics
		
		#
		# SAVE_HANDLER . Is defined in section and injected in this->options sended to current class
		if (isset($this->options->save_handler) && $this->options->save_handler==='session') {
			# Mimic database result	with a placebo rows_obj 				
			$ar_data = array();
			foreach ($this->options->filter_by_id as $key => $value) {							
				$ar_data[] = array($value->section_id => array( 'id'=> $value->section_id,
																'section_id' => $value->section_id,
																'section_tipo' => $value->section_tipo)
									);
				break;
			}
			$rows_obj = new stdClass();
				$rows_obj->result 	= $ar_data;
				$rows_obj->options 	= $this->options;

			$this->rows_obj = $rows_obj;
		}
		#
		# DEFAULT CASE (save_handler is 'database')
		else{
			# Calculate rows from database
			$this->rows_obj = search::get_records_data($this->options);
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
	


}#end section_records



?>