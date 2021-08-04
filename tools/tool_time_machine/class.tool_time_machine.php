<?php
/*
* CLASS TOOL_TIME_MACHINE
*
*
*/
class tool_time_machine { // extends tool_common



	/**
	* __CONSTRUCT
	*/
	public function __construct() {


	}//end __construct



	/**
	* APPLY_VALUE
	* Set user selected value from time machine to acual component data
	* @param $section_id
	* @param $section_tipo
	* @param $tipo
	* @param $lang
	* @param $matrix_id
	*/
	public static function apply_value($request_options) {
		global $start_time;

		#debug_log(__METHOD__." TOP_TIPO: ".TOP_TIPO." - TOP_ID: ".TOP_ID.to_string(), logger::DEBUG);

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';


		// options get and set
			$options = new stdClass();
				$options->section_tipo	= null;
				$options->section_id	= null;
				$options->tipo			= null;
				$options->lang			= null;
				$options->matrix_id		= null;

				foreach ($request_options as $key => $value) {
					if (property_exists($options, $key)) {
						$options->$key = $value;
					}
				}

		// short vars
			$section_tipo	= $options->section_tipo;
			$section_id		= $options->section_id;
			$tipo			= $options->tipo;
			$lang			= $options->lang;
			$matrix_id		= $options->matrix_id;


		// data. extract data from matrix_time_machine table
			$RecordObj_time_machine = new RecordObj_time_machine($matrix_id);
			$dato_time_machine 		= $RecordObj_time_machine->get_dato();

		// component. Inject tm data to the component
			$modelo_name 			= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component_obj_to_save	= component_common::get_instance($modelo_name,
																	 $tipo,
																	 $section_id,
																	 'edit',
																	 $lang,
																	 $section_tipo);
			// Set dato overwrite current component dato
			$component_obj_to_save->set_dato($dato_time_machine);

			// Save component with nee updated dato from time machine
			$component_obj_to_save->Save();


		$response->result	= true;
		$response->msg		= 'OK. Request done ['.__FUNCTION__.']';

		// debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				$response->debug = $debug;
			}

		return (object)$response;
	}//end apply_value




}//end class
