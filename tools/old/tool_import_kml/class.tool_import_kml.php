<?php
/*
* CLASS tool_import_kml
* Import Google Maps points
*
*/
class tool_import_kml extends tool_common {

	# received section
	protected $section_obj;
	# button_import_tipo
	protected $button_import_tipo;
	# used to store custom options (script path, etc.)
	protected $button_import_properties;
	# allowed extensions in import file
	protected $valid_extensions;
	# temporal section id
	protected $temp_section_id;



	/**
	* __CONSTRUCT
	*/
	public function __construct( $section_obj, $modo ) {

		# Verify type section object
		if ( get_class($section_obj) !== 'section' ) {
			throw new Exception("Error Processing Request. Only sections are accepted in this tool", 1);
		}

		# Fix current section
		$this->section_obj  = $section_obj;

		# Fix current section tipo
		$this->section_tipo = $section_obj->get_tipo();

		# Fix modo
		$this->modo = $modo;

		# Fix valid extensions
		$this->valid_extensions = array('kml');

		# Fix current temporal section id
		$this->temp_section_id = $this->section_tipo.'_'.DEDALO_SECTION_ID_TEMP.'_'.navigator::get_user_id();

		# Get and set configuration vars
		$this->set_up();
	}//end __construct



	/**
	* SET_UP
	*/
	private function set_up() {

		if (!isset($_GET['button_tipo'])) {
			throw new Exception("Error Processing Request. GET 'button_tipo' is mandatory for build this tool", 1);
		}

		# button_tipo is always send in url
		$this->button_import_tipo = safe_tipo( safe_tipo($_GET['button_tipo']) );

		$RecordObj_dd = new RecordObj_dd($this->button_import_tipo);
		# Fix tool properties from button properties
		$this->button_import_properties = $RecordObj_dd->get_properties();

		# Set tool vars
		#$this->kml_vars = $kml_vars;
	}//end set_up



	/**
	* PROCESS_FILE
	* @return
	*/
	public function process_file( $file ) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed process_file';

		if (!file_exists($file)) {
			$response->msg = 'Error. File not exists: '.$file;
			return $response;
		}

		# Read file kml
		# Verify extension
		$file_extension = pathinfo($file,PATHINFO_EXTENSION);
		if (!in_array($file_extension, $this->valid_extensions)) {
			$response->msg = 'Error. Invalid extension: '.$file_extension. ' Only accept: '.implode(',', $this->valid_extensions);
			return $response;
		}

		# Parse file
		$data = self::parse_file($file);
			#dump($data, ' data ++ '.to_string()); die();

		$i=0; foreach ($data as $key => $obj_value) {
			#dump($obj_value, ' $obj_value ++ '.to_string($key)); #continue;

			$type = $obj_value->type;
			switch (true) {
				case ($type==='root_parent'):
				case ($type==='parent'):
					// Creates target section record and store locator for reuse
					$name = $obj_value->name;
					$this->save_parent($name, $type);
					break;
				case ($type==='point'):
					// Creates target section record and store locator for reuse
					$this->save_point($obj_value, $type);
					break;
				default:
					debug_log(__METHOD__." Invalid type: $type ignored ".to_string(), logger::ERROR);
					break;
			}
			#if ($i>=1) break;

		$i++; }//end foreach ($data as $key => $obj_value)


		$response->result 	= true;
		$response->msg 		= "Processed $i rows successfully";

		return $response;
	}//end process_file



	/**
	* SAVE_PARENT
	* Create a new section in component_autocomplete target section
	* Returns locator pointed to new created record
	* Store created sections in array to avoid duplicate already created sections
	* @return array $ar_value
	* 	Array of one locator
	*/
	public function save_parent($name, $type) {

		# Store already created component autocomplete values
		static $ar_created_parent = array();

		if (isset($ar_created_parent[$type][$name])) {
			return $ar_created_parent[$type][$name]; // value is component autocomplete value (array of 1 locator)
		}

		if (!isset($this->button_import_properties->tool_import_kml->$type->section_tipo)) {
			dump($this->button_import_properties->tool_import_kml->$type, ' this->button_import_properties ++ search section_tipo in '.to_string($type));
			throw new Exception("Error Processing Request. Buton import 'properties' $type section_tipo is not correctly configurated. Set mandatory params: tool_import_kml->".$type, 1);
		}
		if (!isset($this->button_import_properties->tool_import_kml->$type->component_tipo)) {
			dump($this->button_import_properties->tool_import_kml->$type, ' this->button_import_properties ++ search component_tipo in '.to_string($type));
			throw new Exception("Error Processing Request. Buton import 'properties' $type component_tipo is not correctly configurated. Set mandatory params: tool_import_kml->".$type, 1);
		}
		$target_section_tipo 	= $this->button_import_properties->tool_import_kml->$type->section_tipo;
		$target_component_tipo 	= $this->button_import_properties->tool_import_kml->$type->component_tipo;

		#
		# TARGET SECTION (where component autocomplete points)
			# Create new section record in target section
			$section = section::get_instance($section_id=null, $target_section_tipo, 'edit', $cache=false);
			$section->forced_create_record();
			$section_id = $section->get_section_id();

			# Component input text . Set value on data
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($target_component_tipo);
			$component 		= component_common::get_instance($modelo_name,
															 $target_component_tipo,
															 $section_id,
															 'edit',
															 DEDALO_DATA_LANG,
															 $target_section_tipo);
			$value = array( $name );
			$component->set_dato( $value );
			$component->Save();

		#
		# LOCATOR
			$locator = new locator();
				$locator->set_section_tipo($target_section_tipo);
				$locator->set_section_id($section_id);

			$ar_value = array($locator);

		# Store for reuse
		$ar_created_parent[$type][$name] = $ar_value;
		debug_log(__METHOD__." Saved $target_section_tipo - $section_id. Type: $type, name: ".to_string($name), logger::DEBUG);


		return (array)$ar_value;
	}//end save_parent



	/**
	* SAVE_POINT
	* @return
	*/
	public function save_point($obj_value, $type) {
		/*
		[parent_name] => Array( [0] => I. Siglos IV-III a.C. )
        [name] => I. Siglos IV-III a.C.
        [description] =>
        [coordinates] =>
        [type] => root_parent */
        if (!isset($this->button_import_properties->tool_import_kml->$type)) {
			throw new Exception("Error Processing Request. Buton import 'properties' is not correctly configurated. Set mandatory params: tool_import_kml->".$type, 1);
		}

        $section_tipo 		= $this->button_import_properties->tool_import_kml->$type->section_tipo;
		$name_tipo 			= $this->button_import_properties->tool_import_kml->$type->name;
		$description_tipo	= $this->button_import_properties->tool_import_kml->$type->description;
		$coordinates_tipo	= $this->button_import_properties->tool_import_kml->$type->coordinates;
		$tag_geo_tipo		= $this->button_import_properties->tool_import_kml->$type->tag_geo;

		# Create new section record in target section
			$section = section::get_instance($section_id=null, $section_tipo, 'edit', $cache=false);
			$section->forced_create_record();
			$section_id = $section->get_section_id();


        # NAME
		# Component input text . Set value on data
			if (!empty($obj_value->name)) {
				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($name_tipo);
				$component 		= component_common::get_instance($modelo_name,
																 $name_tipo,
																 $section_id,
																 'edit',
																 DEDALO_DATA_LANG,
																 $section_tipo);
				$value = array( $obj_value->name );
				$component->set_dato( $value );
				$component->Save();
			}

		# DESCRIPTION
		# Component input text large . Set value on data
			if (!empty($obj_value->description)) {
				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($description_tipo);
				$component 		= component_common::get_instance($modelo_name,
																 $description_tipo,
																 $section_id,
																 'edit',
																 DEDALO_DATA_LANG,
																 $section_tipo);
				$value = $obj_value->description;
				$component->set_dato( $value );
				$component->Save();
			}

		# COORDINATES
		# Component geolocation . Set value on data
			if (!empty($obj_value->coordinates)) {
				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($coordinates_tipo);
				$component 		= component_common::get_instance($modelo_name,
																 $coordinates_tipo,
																 $section_id,
																 'edit',
																 DEDALO_DATA_NOLAN,
																 $section_tipo);
				$ar_value = explode(",", $obj_value->coordinates);
				$dato = new stdClass();
					$dato->lon		= $ar_value[0];
					$dato->lat		= $ar_value[1];
					$dato->alt		= $ar_value[2];
					$dato->zoom		= 17;

				$component->set_dato( $dato );
				$component->Save();


		# TAG_GEO
		# Component text area. Add a geo tag into component text area
				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tag_geo_tipo);
				$component 		= component_common::get_instance($modelo_name,
																 $tag_geo_tipo,
																 $section_id,
																 'edit',
																 DEDALO_DATA_LANG,
																 $section_tipo);
				$value = component_geolocation::build_geolocation_tag_string(1, $dato->lon, $dato->lat);
				$component->set_dato( $value );
				$component->Save();
			}


		# REFERENCES
		# Root parent and parent are iterated and values set to components defined in button import 'properties'
			foreach ((array)$obj_value->parent_name as $key => $value) {

				if ($key===0) {
					$parent_type = 'root_parent';
				}else{
					$parent_type = 'parent';
				}

				$dato = $this->save_parent($value, $parent_type);
				if (!empty($dato)) {

					# component_tipo
					if (!isset($this->button_import_properties->tool_import_kml->$type->$parent_type)) {
						throw new Exception("Error Processing Request. Buton import 'properties' is not correctly configurated. Set mandatory params: tool_import_kml->$type->$parent_type", 1);
					}
					$component_tipo = $this->button_import_properties->tool_import_kml->$type->$parent_type;

					$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo);
					$component 		= component_common::get_instance($modelo_name,
																	 $component_tipo,
																	 $section_id,
																	 'edit',
																	 DEDALO_DATA_NOLAN,
																	 $section_tipo);
					$component->set_dato( $dato );
					$component->Save();
				}
			}//end foreach ((array)$obj_value->parent_name as $key => $value)

		# TEMP_SECTION_DATA
		# propagate_temp_section_data
			$temp_data_uid = $this->temp_section_id;
			if (isset($_SESSION['dedalo']['section_temp_data'][$temp_data_uid])) {
				$temp_section_data = $_SESSION['dedalo']['section_temp_data'][$temp_data_uid];
				#$this->propagate_temp_section_data($temp_section_data, $section_tipo, $section_id);
				section::propagate_temp_section_data($temp_section_data, $section_tipo, $section_id);
				debug_log(__METHOD__." Propagated temp_section_data ($temp_data_uid) to:  $section_tipo - $section_id ".to_string(), logger::DEBUG);
			}

		return true;
	}//end save_point



	/**
	* PARSE_FILE
	* @param string $file
	*	File full path
	* @return array $data
	*	Array of std class objects
	*/
	public static function parse_file($file) {

		$contents = file_get_contents($file);
		$xml      = new SimpleXMLElement($contents);

		$data = array();
		foreach ($xml->Document->Folder as $key => $folder) {
			#dump($folder, ' folder ++ '.to_string($key));
			$data = array_merge($data, (array)self::iterate_folder($folder));
		}
		#dump($data, ' data ++ '.to_string());

		return $data;
	}//end parse_file



	/**
	* ITERATE
	* @param object $folder
	* @return array $ar_data
	*/
	private static function iterate_folder($folder, $parent_name=null) {
		$ar_data = array();
			#dump($folder->Placemark, ' folder->Placemark ++ '.to_string());
		$parent_name = (!is_null($parent_name)) ? $parent_name : reset($folder->name);

		if (!isset($folder->Placemark)) {
			#$element->Placemark = 1;
		}

		foreach ($folder as $key2 => $value) {
			#dump($value, ' value ++ '.to_string());
			$element = self::get_element_data($value, $parent_name);
			#if (!empty($element->coordinates)) {
				$ar_data[] = $element;
			#}

			# Recursion
			if (!empty($value->Placemark)) {
				$element->Placemark = true;
				#dump($value->Placemark, ' $value->Placemark ++ '.to_string());
				$ar_data = array_merge($ar_data, (array)self::iterate_folder($value->Placemark, array($parent_name, $element->name) ));
			}
		}

		return $ar_data;
	}//end iterate_folder



	/**
	* GET_ELEMENT_DATA
	* @param object $value
	* @param object $parent_data
	* @return object $element
	*/
	private static function get_element_data($value, $parent_name) {

		$element = new stdClass();
			$element->parent_name	= (array)$parent_name;
			$element->name 			= reset($value->name);
			$element->description 	= reset($value->description);
			$element->coordinates 	= reset($value->Point->coordinates);
			#if (!empty($value->Placemark)) {
			#	$element->Placemark 	= 1;
			#}
			switch (true) {
				case empty($element->name):
					$type = "root_parent";
					break;
				case empty($element->coordinates):
					$type = "parent";
					break;
				default:
					$type = "point";
					break;
			}
			$element->type = $type;

			# Empty name case (root_parent case)
			if (empty($element->name)) {
				$element->name = reset($element->parent_name);
			}

		return $element;
	}//end get_element_data




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

		$tipo 			= self::kml_CODE_COMPONENT_TIPO;		# 'rsc137' 	# Código
		$section_tipo   = self::kml_IMPORT_SECTION_TIPO;		# 'rsc205'; # Bibliografia
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



}#end tool_import_kml class
?>
