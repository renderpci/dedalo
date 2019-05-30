<?php
/*
* CLASS TOOL_IMPORT_MARC21
* Create a temp section with component filter and a uploader to upload mrc file. When file is uploaded (new file overwrite existing)
*
*/
class tool_import_marc21 extends tool_common {
	
	
	protected $section_obj;	# received section
	protected $button_import_propiedades;	# used to store custom options (script path, etc.)
	protected $valid_extensions;
	protected $marc21_vars;

	public $project_dato;
	
	# Class constants
	const MARC21_IMPORT_SECTION_TIPO 	 = 'rsc205';
	const MARC21_CODE_COMPONENT_TIPO 	 = 'rsc137';
	const MARC21_PROJECTS_COMPONENT_TIPO = 'rsc148';


	/**
	* __CONSTRUCT
	*/
	public function __construct( $section_obj, $modo ) {

		# Verify type section object
		if ( get_class($section_obj) !== 'section' ) {
			throw new Exception("Error Processing Request. Only sections are accepted in this tool", 1);
		}
		
		# Fix current component/section
		$this->section_obj  = $section_obj;

		$this->section_tipo = $section_obj->get_tipo();

		# Fix modo
		$this->modo = $modo;
		
		# Valid extensions
		$this->valid_extensions = array('mrc');

		$this->set_up();	
	}



	/**
	* SET_UP
	*/
	private function set_up() {

		// Read Dédalo standar marc21_vars
		$marc21_vars_file = dirname(__FILE__) ."/data/marc21_vars.php";
		include($marc21_vars_file);		

		// Read Entity custom marc21_vars
		/* DEACTIVATED
		$marc21_vars_file = DEDALO_EXTRAS_PATH ."/".DEDALO_ENTITY."/marc21/marc21_vars.php";
		if (file_exists($marc21_vars_file)) {
			include($marc21_vars_file);
		}
		*/
		#dump($marc21_vars, ' marc21_vars ++ '.to_string());	

		# Set tool vars
		$this->marc21_vars = $marc21_vars;		
	}//end set_up



	/**
	* PROCESS_FILE
	* @return 
	*/
	public function process_file( $file, $projects_dato ) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed process_file';
		
		if (!file_exists($file)) {
			$response->msg = 'Error. File not exists: '.$file;
			return $response;
		}

		# Read file marc21

		# Verify extension
		$file_extension = pathinfo($file,PATHINFO_EXTENSION);
		if (!in_array($file_extension, $this->valid_extensions)) {
			$response->msg = 'Error. Invalid extension: '.$file_extension. ' Only accept: '.implode(',', $this->valid_extensions);
			return $response;
		}

		# Parse file
		# MARC PEAR Lib
		$pear_lib_path = DEDALO_ROOT."/lib/pear/";
		require($pear_lib_path . "File/MARC.php");

		$ar_records = new File_MARC($file);
		$i=1;while ($record = $ar_records->next()) {
			#echo "<pre>";
			#echo $record;
			#echo "</pre><hr>";
				#dump($record, ' record ++ '.to_string());

			$section_id   = null;
			$section_tipo = self::MARC21_IMPORT_SECTION_TIPO;
			foreach ($this->marc21_vars as $element_vars) {
				if ($element_vars['dd_component']===self::MARC21_CODE_COMPONENT_TIPO) { // Normally rsc137					
					$value 		= self::get_value( $record, $element_vars );
					$section_id = $this->get_section_id_from_code( $value );
						#dump($section_id, ' section_id ++ '.to_string($value));
					break;	
				}				
			}
			# Always force create/re use section
			$section 		= section::get_instance($section_id, $section_tipo, false );
			$create_record 	= $section->forced_create_record();
			$section_id 	= $section->get_section_id();


			# Project save
			$component_tipo = self::MARC21_PROJECTS_COMPONENT_TIPO;
			$component		= component_common::get_instance('component_filter',
															 $component_tipo,
															 $section_id,
															 'list', # mode 'list' avoid autosave default dato
															 DEDALO_DATA_NOLAN,
															 $section_tipo,
															 false);
			$component->set_dato($projects_dato);
			$component->Save();			
			
			/*
			$marc21_vars[] = array(	"Field" 	=> "020",
									"Indicator" => "",
									"Subfield" 	=> "a",
									"dd_component"=>"rsc147",
									"dd_action" => "{\"rsc249\":"[{\"section_id\":\"1\",\"section_tipo\":\"dd292\"}]\"}"
								   );
			*/

			# Iterate defined ar fields (see marc21_vars.php)
			
			foreach ($this->marc21_vars as $element_vars) {
				#dump($element_vars, '$element_vars ++ '.to_string()); 
				
				if (empty($element_vars['dd_component'])) {
					dump($element_vars, ' ERROR ON element_vars: dd_component is empty ++ '.to_string());
					continue;
				}
						
				#dump($record, ' record ++ '.to_string());

				#if ($element_vars['Field']=='998') {
				#	dump($record, ' element_vars ++ '.to_string());
				#}

				#
				# marc21_conditional
				$resolved_value=false;
				if (isset($element_vars['marc21_conditional'])) {
					#dump(json_decode($element_vars['marc21_conditional']), 'json_decode($element_vars[marc21_conditional]) ++ '.to_string());

					if ($marc21_conditional = json_decode($element_vars['marc21_conditional'])) {
						#dump($marc21_conditional, ' marc21_conditional ++ '.to_string());
						#dump($element_vars['Field'], '$element_vars[Field] ++ '.to_string());
						
						$elementFields = $record->getFields($element_vars['Field']);
							#dump($elementFields, ' elementFields ++ '.to_string());
						foreach ($elementFields as $key => $portal_row_obj) {
							#dump($portal_row_obj, ' portal_row_obj ++ '.to_string());
							
							$subField =  $portal_row_obj->getSubfield($marc21_conditional->Subfield);
								#dump($subField, ' subField ++ '.to_string());

							if ( $subField->getData()==$marc21_conditional->value ) {
								
								$element = $portal_row_obj->getSubfield($element_vars['Subfield']);
								if ($element===false) {
									$value = '';
								}else{
									$value = $element->getData();
								}
								$resolved_value=true;
								break;
							}
						}						
					}										
				}//end if (isset($element_vars['marc21_conditional'])) 


				# VALUE . Value from current field in this row
				if($resolved_value===false) {
					$value = self::get_value( $record, $element_vars );	
				}

				if(empty($value) || !isset($value)){
					//dump($value, ' value +++++++++++++++++++++++++++++++++++++++++++++++++ '.to_string());
					continue;
				}

				# skip_on_empty : When is defined, only store value when is not empty (used when in various components data like 'rsc147' )
				if (empty($value) && (isset($element_vars["skip_on_empty"]) && $element_vars["skip_on_empty"]===true) ) {
					continue;
				}
				$value = trim($value);
				$value = rtrim($value, " \t,:.");

				if(isset($element_vars['partial_left_content'])){
					$value_trim = trim($value);
					$value_test = substr($value_trim, 0, (int)$element_vars['partial_left_content']);
					if( is_int($value_test)=== false){
						preg_match('/\d+/', $value, $value_test);
						$value_test = (int)implode('', $value_test);
					}
					$value = $value_test;
				}

				if(isset($element_vars['date_format']) && $element_vars['date_format'] === 'year' ){
					$dd_date = new dd_date();
					if((int)$value>0){
						$dd_date->set_year($value);
					}
					$date = new StdClass();
					$date->start = $dd_date;
					$value = [$date];
				}
				
				# DD_DATA_MAP . map current value to dedalo value when is defined (like 'cat' -> '[section_tipo:lg1,section_id:369]')
				if ( isset($element_vars['dd_data_map']) && $dd_data_map=json_decode($element_vars['dd_data_map']) ) {
					if (property_exists($dd_data_map, $value)) {
						#dump($dd_data_map->$value, ' value from dd_data_map ++ '.to_string($value));
						$value = $dd_data_map->$value;
					}else{
						debug_log(__METHOD__." ERROR on map dd_data_map. No map exists for value ".to_string($value), logger::ERROR);
					}
						
				}		

				# Save on dedalo component
				$component_tipo = $element_vars['dd_component'];
				$component_label= RecordObj_dd::get_termino_by_tipo($component_tipo);
				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
				$component		= component_common::get_instance($modelo_name,
																 $component_tipo,
																 $section_id,
																 'edit',
																 DEDALO_DATA_LANG,
																 $section_tipo,
																 false);
				$component->set_dato($value);
				$component->Save();
				debug_log(__METHOD__." Saved component $component_tipo ($modelo_name - $component_label) with dato: ".to_string($value), logger::DEBUG);
				
				#print " --  $component_tipo ($modelo_name - $component_label)  -> <b>" . to_string($value) ."</b><br>"; //continue;
			
				# DD_ACTION		
				if (!empty($value) && (isset($element_vars['dd_action']) && $dd_action=json_decode($element_vars['dd_action'])) ) {
					# dump($dd_action, ' $dd_action ++ '.to_string());				
					foreach ($dd_action as $key => $value) {
						
						$component_tipo_action 	= $key;
						$modelo_name 			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo_action,true);
						$parent 				= null;
						$component_action 		= component_common::get_instance($modelo_name,
																		 $component_tipo_action,
																		 $section_id,
																		 'edit',
																		 DEDALO_DATA_LANG,
																		 $section_tipo,
																		 false);
						$component_action->set_dato($value);
						$component_action->Save();
						debug_log(__METHOD__." Saved dd_action. Component $component_tipo_action with dato: ".to_string($value), logger::DEBUG);
					}
				}				

			}//end foreach ($this->marc21_vars as $element_vars)
			debug_log(__METHOD__." Saved all components data from section $section_tipo - $section_id ".to_string(), logger::WARNING);
			#echo "<hr>";		
			
			#if ($i>=1) break;
			#break;
		$i++;}


		$response->result 	= true;
		$response->msg 		= "Processed $i rows successfully";

		return $response;
	}//end process_file




	/**
	* GET_VALUE
	* @param object $record
	*
	* @param array $element_vars
	* 
	* @return string $value
	*/
	public static function get_value( $record, $element_vars ) {

		$elementField = $record->getField($element_vars['Field']);
			#dump($elementField, ' $elementField ++ '.to_string());

		if (empty($elementField)) {
			return '';
		}
		#dump($elementField, ' elementField ++ '.to_string());


		if (isset($element_vars['Subfield'])) {
			
			# Only for specific subfield
			$element = $elementField->getSubfield($element_vars['Subfield']);
				#dump($element, ' element ++ '.to_string());
			if ($element===false) {
				$text = '';
			}else{
				$text = $element->getData();
			}

		}else{
     
     		# Iterate all subfields
			$text = '';
			if( property_exists($elementField, 'subfields') ) {
				foreach ($elementField->getSubfields() as $code => $value) {
					#dump($value, ' value ++ '.to_string());
					$text .=  $value->getData();
					$text .= " ";
            	} 
			}else{
				#dump($elementField, ' elementField without subfields ++ '.to_string());
			}

		}	    
		$value = trim($text);
	    
	    /*
		#$nonfiling  = $elementField->getIndicator($element_vars['Indicator']);	
		if ($nonfiling) {
		  // Sort using the subset of the $a subfield
		  $element = substr($elementField->getSubfield($element_vars['Subfield']), $nonfiling);
		} else {
		  // Sort using the entire contents of the $a subfield
		  $element = $elementField->getSubfield($element_vars['Subfield']);
		}
		*/		

		return (string)$value;
	}//end get_value



	/**
	* GET_SECTION_ID_FROM_CODE
	* @return int|null $section_id
	*/
	public function get_section_id_from_code( $code ) {
		
		$section_id=null;

		$tipo 			= self::MARC21_CODE_COMPONENT_TIPO;		# 'rsc137' 	# Código
		$section_tipo   = self::MARC21_IMPORT_SECTION_TIPO;		# 'rsc205'; # Bibliografia
		$lang 			= DEDALO_DATA_NOLAN;
		$value 			= $code;
		$table 			= common::get_matrix_table_from_tipo($section_tipo); 
		
		#$sql_filter = JSON_RecordObj_matrix::build_pg_filter('gin','datos',$tipo,$lang,$value);
		$sql_filter = 'datos @>\'{"components":{"rsc137":{"dato":{"lg-nolan":["'.$value.'"]}}}}\'::jsonb ';
		$strQuery   = "-- ".__METHOD__."
		SELECT section_id
		FROM \"$table\"
		WHERE
		section_tipo = '$section_tipo'
		AND \n $sql_filter
		LIMIT 1
		";
		$strQuery=sanitize_query($strQuery);
		if(SHOW_DEBUG) {
			#dump($strQuery, ' strQuery');
		}
		$result = JSON_RecordObj_matrix::search_free($strQuery);
		while ($rows = pg_fetch_assoc($result)) {
			$section_id = (int)$rows['section_id'];
			break;
		}
		#dump($section_id, ' section_id '.utf8_decode($strQuery));

		return $section_id;
	}//end get_section_id_from_code


	
}#end tool_import_marc21 class
?>