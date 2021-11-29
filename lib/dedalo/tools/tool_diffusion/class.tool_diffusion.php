<?php
/**
* TOOL_DIFFUSION
* Export current section data to mysql database with defined 'difission' options
*
*/
class tool_diffusion {


	public $section_tipo;
	public $section_id;
	public $modo;
	public $options;
	public static $debug_response;



	/**
	* __CONSTRUCT
	*/
	public function __construct( $section_tipo=null, $modo='button' ) {

		if (empty($section_tipo)) {
			throw new Exception("Error Processing Request. Var section_tipo is empty", 1);
		}
		$this->section_tipo = $section_tipo;
		$this->modo 		= $modo;
	}//end __construct



	/** 
	* GET_HTML
	* @return string
	*/
	public function get_html() {
		ob_start();
		include ( DEDALO_LIB_BASE_PATH .'/tools/'.get_called_class().'/'.get_called_class().'.php' );
		return  ob_get_clean();
	}//end get_html



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
	}//end get_ar_thesaurus_tables



	/**
	* EXPORT_RECORD
	* @param string $section_tipo
	* @param int $section_id
	* @param string $diffusion_element_tipo
	* @param bool $resolve_references
	*	default: true
	* @return object $response
	*/
	public static function export_record($section_tipo, $section_id, $diffusion_element_tipo, $resolve_references=true, $ar_records=[]) {

		$start_time = start_time();
		
		$response = new stdClass();
			$response->result = false;
			$response->msg 	  = 'Error on export_record '.$section_tipo;
		

		$ar_diffusion_map_elements = diffusion::get_ar_diffusion_map_elements(DEDALO_DIFFUSION_DOMAIN);
			#dump($ar_diffusion_map_elements, ' ar_diffusion_map_elements ++ '.to_string($diffusion_element_tipo)); die();	

			if (!isset($ar_diffusion_map_elements[$diffusion_element_tipo])) {
				debug_log(__METHOD__." Skipped diffusion_element $diffusion_element_tipo not found in ar_diffusion_map ".to_string($ar_diffusion_map_elements), logger::ERROR);
				$response->msg .= "Error. Skipped diffusion_element $diffusion_element_tipo not found in ar_diffusion_map";
				return $response;
			}

		$obj_diffusion_element = $ar_diffusion_map_elements[$diffusion_element_tipo];
			#dump($obj_diffusion_element, ' obj_diffusion_element ++ '.to_string($diffusion_element_tipo)); die();

		#
		# DIFFSUION CLASS
		# Each diffusion element is managed with their own class that extends the main diffusion class
		$diffusion_class_name = $obj_diffusion_element->class_name;

		require_once(DEDALO_LIB_BASE_PATH . '/diffusion/class.'.$diffusion_class_name.'.php');
			#dump($diffusion_class_name, '$diffusion_class_name ++ '.to_string()); die();		
		
		$options = new stdClass();
			$options->section_tipo 			= (string)$section_tipo;
			$options->section_id   			= (int)$section_id;
			$options->diffusion_element_tipo= (string)$diffusion_element_tipo;

		#
		# UPDATE_RECORD
		$diffusion 				= new $diffusion_class_name;
		$diffusion->ar_records 	= $ar_records;
		$update_record_result 	= $diffusion->update_record( $options, $resolve_references );
			#dump($update_record_result, " update_record_result ".to_string() ); die();

		if ($update_record_result && $update_record_result->result) {
			$response->result = true;

			$max_recursions	= isset($_SESSION['dedalo4']['config']['DEDALO_DIFFUSION_RESOLVE_LEVELS'])
				? $_SESSION['dedalo4']['config']['DEDALO_DIFFUSION_RESOLVE_LEVELS']
				: (defined('DEDALO_DIFFUSION_RESOLVE_LEVELS') ? DEDALO_DIFFUSION_RESOLVE_LEVELS : 2);

			$response->msg = sprintf("<span class=\"ok\">Ok. Published record ID %s successfully. Levels: ".$max_recursions."</span>",$section_id);			
		}else{
			$response->result = false;
			$response->msg = "Error. Error on publish record $section_id";			
		}
	
		// Add especific msg		
			if (isset($update_record_result->msg)) {
				$update_record_result_msg = array_reduce((array)$update_record_result->msg, function($carry, $item){
					if (!empty($item)) {
						return $item;
					}
					return $carry;
				});
				$response->msg .= ' - ' . $update_record_result_msg;
			}

		if(SHOW_DEBUG===true) {
			$response->debug = $update_record_result;
			if (function_exists('bcdiv')) {
				$memory_usage = bcdiv(memory_get_usage(), 1048576, 3);
			}else{
				$memory_usage = memory_get_usage();
			}
			$response->msg .= " <span>Exec in ".exec_time_unit($start_time,'secs')." secs - MB: ". $memory_usage ."</span>";
		}				

		return (object)$response;
	}//end export_record



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
				if(SHOW_DEBUG===true) {
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


		if(SHOW_DEBUG===true) {
			$response->debug = $update_record_result;
			if (function_exists('bcdiv')) {
				$memory_usage = bcdiv(memory_get_usage(), 1048576, 3);
			}else{
				$memory_usage = memory_get_usage();
			}				
			$response->msg .= " <span>Exec in ".exec_time_unit($start_time,'secs')." secs - MB: ".$memory_usage."</span>";
		}				

		return (object)$response;
	}//end export_thesaurus



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

			# Diffusiion classname (diffusion_mysql, diffusion_rdf, etc..)
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
	}//end diffusion_complete_dump



	/**
	* HAVE_SECTION_DIFFUSION
	* Return correspondence of current section in diffusion domain
	* Note: For better control, sections are TR of diffusion_elements. This correspondence always must exists in diffusion map
	* @return bool true/false
	*/
	public static function have_section_diffusion($section_tipo, $ar_diffusion_map_elements=null) {
		
		$have_section_diffusion = false;
		
		if (is_null($ar_diffusion_map_elements)) {
			# calculate all
			$ar_diffusion_map_elements = diffusion::get_ar_diffusion_map_elements(DEDALO_DIFFUSION_DOMAIN);
		}
		// dump($ar_diffusion_map_elements, ' ar_diffusion_map_elements ++ '.to_string($section_tipo).' - DEDALO_DIFFUSION_DOMAIN:'.DEDALO_DIFFUSION_DOMAIN);
		foreach ($ar_diffusion_map_elements as $diffusion_group_tipo => $obj_value) {
			
			$diffusion_element_tipo = $obj_value->element_tipo;

			$ar_related = self::get_diffusion_sections_from_diffusion_element($diffusion_element_tipo, $obj_value->class_name);
			if(in_array($section_tipo, $ar_related)) {
				$have_section_diffusion = true;
				break;
			}
		}

		return $have_section_diffusion;
	}//end have_section_diffusion



	/**
	* GET_DIFFUSION_SECTION
	* @param string $diffusion_element_tipo
	* @return array $ar_diffusion_sections
	*/
	public static function get_diffusion_sections_from_diffusion_element($diffusion_element_tipo, $class_name) {
	
		if(SHOW_DEVELOPER!==true) {
			if( isset($_SESSION['dedalo4']['config']['ar_diffusion_sections'][$diffusion_element_tipo]) ) {
				return $_SESSION['dedalo4']['config']['ar_diffusion_sections'][$diffusion_element_tipo];
			}
		}

		include_once(DEDALO_LIB_BASE_PATH . '/diffusion/class.'.$class_name.'.php');

		$ar_diffusion_sections = $class_name::get_diffusion_sections_from_diffusion_element($diffusion_element_tipo);
	
		# Store in session
		$_SESSION['dedalo4']['config']['ar_diffusion_sections'][$diffusion_element_tipo] = $ar_diffusion_sections;

		return $ar_diffusion_sections;
	}//end get_diffusion_sections_from_diffusion_element



	/**
	* UPDATE_PUBLICATION_SCHEMA
	* @param string $diffusion_element_tipo
	* @return object $response
	*/
	public static function update_publication_schema($diffusion_element_tipo) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= __METHOD__. ' Error. Request failed';


		$RecordObj_dd	= new RecordObj_dd($diffusion_element_tipo);
		$propiedades	= $RecordObj_dd->get_propiedades(true);
		$schema_obj		= (is_object($propiedades) && isset($propiedades->publication_schema))
			? $propiedades->publication_schema
			: false;

		// no propiedades                                                                                                                                                                                         configurated case
			if (!$schema_obj) {
				return $response;
			}

		$class_name   = isset($propiedades->diffusion->class_name) ? $propiedades->diffusion->class_name : false;		

		switch ($class_name) {
			case 'diffusion_mysql':
				// RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($tipo, $modelo_name, $relation_type, $search_exact=false)
				$databases = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_element_tipo, 'database', 'children', true);
				if (isset($databases[0])) {
					// Loads parent class diffusion
					include_once(DEDALO_LIB_BASE_PATH . '/diffusion/class.'.$class_name.'.php');
					// get_termino_by_tipo($terminoID, $lang=NULL, $from_cache=false, $fallback=true)
					$database_name = RecordObj_dd::get_termino_by_tipo($databases[0]);
					$response = (object)diffusion_sql::save_table_schema( $database_name, $schema_obj );
				}else{
					$response->msg .= " Database not found in structure for diffusion element: '$diffusion_element_tipo' ";
				}				
				break;
			
			default:
				# Nothing to do
				$response->result = true;
				$response->msg 	  = "Ignored publication_schema for class_name: '$class_name' ";
				break;
		}

		return $response;
	}//end update_publication_schema



}//end tool_diffusion
?>