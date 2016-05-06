<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');

/**
* tool_diffusion
* Export current section data to mysql database with defined 'difission' options
*/

class tool_diffusion {


	public $section_tipo;
	public $section_id;
	public $modo;
	public $options;
	public static $debug_response;

	
	function __construct( $section_tipo=null, $modo='button' ) {

		if (empty($section_tipo)) {
			throw new Exception("Error Processing Request. Var section_tipo is empty", 1);			
		}
		$this->section_tipo = $section_tipo;
		$this->modo 		= $modo;	
	}

	/** 
	* HTML
	* @return string
	*/
	public function get_html() {
		ob_start();
		include ( DEDALO_LIB_BASE_PATH .'/tools/'.get_called_class().'/'.get_called_class().'.php' );
		return  ob_get_clean();
	}


	/**
	* GET_AR_THESAURUS_TABLES
	* @return array Formated array as prefix => name
	*/
	public function get_ar_thesaurus_tables() {		
	
		$ar_tables = (array)$this->options->ar_tables;
			#dump($ar_tables, ' ar_tables ++ '.to_string());
		
		$ar_thesaurus_tables = array();
		$i=0;foreach ($ar_tables['prefijo'] as $key => $prefix) {

			if (isset($ar_tables['tipo'][$i-1]) && $ar_tables['tipo'][$i] != $ar_tables['tipo'][$i-1]) { // separator
				$ar_thesaurus_tables[$prefix.'_'.$ar_tables['tipo'][$i]] = 'separator';				
			}
			
			# Do not include langs never
			if ($prefix!='lg') {
				$ar_thesaurus_tables[$prefix] = $ar_tables['nombre'][$i];
			}
			
		$i++;}
		#dump($ar_thesaurus_tables, ' ar_thesaurus_tables ++ '.to_string());

		return $ar_thesaurus_tables;

	}#end get_ar_thesaurus_tables



	/**
	* EXPORT_RECORD
	* @return 
	*/
	public static function export_record($section_tipo, $section_id, $diffusion_element_tipo, $resolve_references=true) {

		$start_time = start_time();
		
		$response = new stdClass();
			$response->result = false;
			$response->msg 	  = '';
		

		$ar_diffusion_map_elements = diffusion::get_ar_diffusion_map_elements(DEDALO_DIFFUSION_DOMAIN);
			#dump($ar_diffusion_map_elements, ' ar_diffusion_map_elements ++ '.to_string($diffusion_element_tipo)); die();
	

		if (!isset($ar_diffusion_map_elements[$diffusion_element_tipo])) {
			debug_log(__METHOD__." Skipped diffusion_element $diffusion_element_tipo not found in ar_diffusion_map ".to_string($ar_diffusion_map_elements), logger::ERROR);
			$response->msg .= "Error. Skipped diffusion_element $diffusion_element_tipo not found in ar_diffusion_map";
			return $response;
		}

		$obj_diffusion_element = $ar_diffusion_map_elements[$diffusion_element_tipo];
			#dump($obj_diffusion_element, ' obj_diffusion_element ++ '.to_string()); die();

		#
		# DIFFSUION CLASS
		# Each diffusion element is managed with their own class that extends the main diffusion class
		$diffusion_class_name = $obj_diffusion_element->class_name;

		include_once(DEDALO_LIB_BASE_PATH . '/diffusion/class.'.$diffusion_class_name.'.php');
			#dump($diffusion_class_name, '$diffusion_class_name ++ '.to_string());
		
		$options = new stdClass();
			$options->section_tipo 			= (string)$section_tipo;
			$options->section_id   			= (int)$section_id;
			$options->diffusion_element_tipo= (string)$diffusion_element_tipo;			

		#
		# UPDATE_RECORD
		$diffusion 				= new $diffusion_class_name;
		$update_record_result 	= $diffusion->update_record( $options, $resolve_references );
			#dump($update_record_result, " update_record_result ".to_string() ); die();

		if ($update_record_result && $update_record_result->result) {
			$response->result = true;
			$response->msg .= sprintf("<span class=\"ok\">Ok. Published record ID %s successfully</span>",$section_id);			
		}else{
			$response->result = false;
			$response->msg .= "Error. Error on publish record $section_id";
		}			


		if(SHOW_DEBUG) {
			$response->debug = $update_record_result;
					
			$response->msg .= " <span>Exec in ".exec_time_unit($start_time,'secs')." secs - MB: ".bcdiv(memory_get_usage(), 1048576, 3)."</span>";
		}				

		return (object)$response;

	}#end export_record



	/**
	* EXPORT_THESAURUS
	* @return 
	*/
	public static function export_thesaurus($ar_prefix, $diffusion_element_tipo) {
	
		$start_time = start_time();
		
		$response = new stdClass();
			$response->result = false;
			$response->msg 	  = '';
		

		$ar_diffusion_map_elements = diffusion::get_ar_diffusion_map_elements(DEDALO_DIFFUSION_DOMAIN);
			#dump($ar_diffusion_map_elements, ' ar_diffusion_map_elements ++ '.to_string($diffusion_element_tipo)); die();
	

		if (!isset($ar_diffusion_map_elements[$diffusion_element_tipo])) {
			debug_log(__METHOD__." Skipped diffusion_element $diffusion_element_tipo not found in ar_diffusion_map ".to_string($ar_diffusion_map_elements), logger::ERROR);
			$response->msg .= "Error. Skipped diffusion_element $diffusion_element_tipo not found in ar_diffusion_map";
			return $response;
		}

		$obj_diffusion_element = $ar_diffusion_map_elements[$diffusion_element_tipo];
			#dump($obj_diffusion_element, ' obj_diffusion_element ++ '.to_string()); die();

		#
		# DIFFSUION CLASS
		# Each diffusion element is managed with their own class that extends the main diffusion class
		$diffusion_class_name = $obj_diffusion_element->class_name;

		include_once(DEDALO_LIB_BASE_PATH . '/diffusion/class.'.$diffusion_class_name.'.php');
			#dump($diffusion_class_name, '$diffusion_class_name ++ '.to_string());
		
		$msg=array();
		$updated=0;
		foreach ((array)$ar_prefix as $prefix) {
			
			$diffusion = new $diffusion_class_name();
			
			$options = new stdClass();
				$options->section_tipo  		 = $prefix;
				$options->diffusion_element_tipo = $diffusion_element_tipo;

			$update_record_result = $diffusion->update_thesaurus( $options );
			#dump($update_record_result, " update_record_result ".to_string() );

			if ($update_record_result) {
				#echo "Published record: $section_id ";
				$msg[] = sprintf("<div class=\"ok\">Ok. Published thesaurus %s successfully</div>",$prefix);
				$updated++;
			}else{
				$msg[] = "Warning. Error on publish thesaurus $prefix";
				if(SHOW_DEBUG) {
					dump($update_record_result, ' update_record_result ++ '.to_string());;
				}
			}
		}//end foreach ($ar_prefix as $prefix) {	
		

		if ($updated>0) {
			$response->result = true;
			$response->msg .= implode('<br>', $msg);			
		}else{
			$response->result = false;
			$response->msg .= "Error. Error on publish tesaurus. ".implode('<br>', $msg);
		}			


		if(SHOW_DEBUG) {
			$response->debug = $update_record_result;					
			$response->msg .= " <span>Exec in ".exec_time_unit($start_time,'secs')." secs - MB: ".bcdiv(memory_get_usage(), 1048576, 3)."</span>";
		}				

		return (object)$response;

	}#end export_thesaurus



	/**
	* DIFFUSION_COMPLETE_DUMP
	* @return 
	*/
	public static function diffusion_complete_dump() {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';

		$ar_diffusion_map_elements = diffusion::get_ar_diffusion_map_elements();
			#dump($ar_diffusion_map_elements, ' ar_diffusion_map_elements ++ '.to_string()); die();		

		$ar_de_result=array();
		foreach ($ar_diffusion_map_elements as $diffusion_element_tipo => $value_obj) {

			# Diffusiion classname (diffusion_mysq, diffusion_rdf, etc..)
			$class_name = $value_obj->class_name;

			include_once(DEDALO_LIB_BASE_PATH .'/diffusion/class.'.$class_name.'.php' );

			$diffusion 	= new $class_name;
			$de_result 	= $diffusion->diffusion_complete_dump( $diffusion_element_tipo, $resolve_references=true );
			
			#$response->msg .= isset($de_result->msg) ? "<br>".$de_result->msg : '';
			
			// let GC do the memory job
			time_nanosleep(0, 10000000); // 10 ms

		}//end foreach ($ar_diffusion_map_elements as $diffusion_element => $value_obj) {

		$response->result 	= true;
		$response->msg 		= 'Updated '.count($ar_diffusion_map_elements).' diffusion elements';

		return $response;

	}#end diffusion_complete_dump



	/**
	* HAVE_SECTION_DIFFUSION
	* Return correspondence of current section in diffusion domain
	* Note: For better control, sections are TR of diffusion_elements. This correspondence always must exists in diffusion map
	* @return bool true/false
	*/
	public static function have_section_diffusion( $section_tipo ) {		
		
		$ar_diffusion_map_elements = diffusion::get_ar_diffusion_map_elements(DEDALO_DIFFUSION_DOMAIN);
			#dump($ar_diffusion_map_elements, ' $ar_diffusion_map_elements ++ '.to_string());

		foreach ($ar_diffusion_map_elements as $diffusion_element_tipo => $obj_value) {
			
			$ar_related = common::get_ar_related_by_model('section',$diffusion_element_tipo);
				if(in_array($section_tipo, $ar_related)) {
					return true;
				}

			/* OLD WAY
				$class_name = $obj_value->class_name;
					#dump($class_name, ' class_name ++ '.to_string($diffusion_element_tipo));

				include_once(DEDALO_LIB_BASE_PATH .'/diffusion/class.'.$class_name.'.php' );

				$diffusion 	= new $class_name;
				$de_result 	= $diffusion->get_diffusion_element_tables_map( $diffusion_element_tipo );
					#dump($de_result, ' $de_result ++ '.to_string());
				foreach ($de_result as $current_section_tipo => $diffusion_section_value) {
					if ($current_section_tipo==$section_tipo) {
						return true;
					}
				}
				*/
		}

		return false;

	}#end have_section_diffusion








}//end tool_diffusion
?>