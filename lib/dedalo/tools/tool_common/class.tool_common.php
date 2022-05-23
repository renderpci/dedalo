<?php
# COMPONENT TOOLS (ABSTRACT CLASS)
# MÉTODOS COMPARTIDOS POR TODOS LOS COMPONENTES

abstract class tool_common extends common {

	public $modo;

	/**
	* __CONSTRUCT
	* @param object $element_obj (can be 'component' or 'section')
	* @param string $modo (default is 'page' when is called from main page)
	*/
	abstract function __construct($element_obj, $modo);



	/**
	* HTML
	* @return string $html (final html code)
	*/
	public function get_html() {

		if(SHOW_DEBUG===true) {
			#global$TIMER;$TIMER[get_called_class().'_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		ob_start();
		include ( DEDALO_LIB_BASE_PATH .'/tools/'.get_called_class().'/'.get_called_class().'.php' );
		$html = ob_get_clean();


		if(SHOW_DEBUG===true) {
			#global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		return $html;
	}//end get_html



	/**
	* GET_JSON
	* @return object $json
	* Returns a var with all data encpsulated in a json object / array
	*/
	public function get_json(){

		if(SHOW_DEBUG===true) $start_time = start_time();

			# Class name is called class (ex. component_input_text), not this class (common)
			include ( DEDALO_LIB_BASE_PATH .'/tools/'.get_called_class().'/'.get_called_class().'_json.php' );

		if(SHOW_DEBUG===true) {
			#$GLOBALS['log_messages'][] = exec_time($start_time, __METHOD__. ' ', "html");
			#global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		return $json;
	}//end get_json



	/**
	* READ_CSV_FILE_AS_ARRAY
	* @param string $file
	* @return array|bool $csv_array
	*/
	public static function read_csv_file_as_array(string $file, $skip_header=false, $csv_delimiter=';', $enclosure='"', $escape='"') {

		if(!file_exists($file)) {
			echo "File not found: $file";
			return false;
		}

		$is_php81 = (version_compare(PHP_VERSION, '8.1.0') >= 0);
		if (!$is_php81) {
			ini_set('auto_detect_line_endings', true);
		}

		$f = fopen($file, "r");

		$csv_array=array(); // , $enclosure
		$i=0; while (($line = fgetcsv($f, 0, $csv_delimiter, $enclosure, $escape)) !== false) { //, $enclosure

			if ($skip_header && $i===0) {
				$i++;
				continue;
			}
			#if ($i>0) break;

			foreach ($line as $cell) {

				#$cell=nl2br($cell);
				#$cell=htmlspecialchars($cell); // htmlspecialchars_decode($cell);
				#$cell = str_replace("\t", " <blockquote> </blockquote> ", $cell);

				$csv_array[$i][] = trim($cell);
			}
			$i++;
		}
		fclose($f);


		if (!$is_php81) {
			ini_set('auto_detect_line_endings', false);
		}


		return $csv_array;
	}//end read_csv_file_as_array



	/**
	* READ_FILES
	* Read files from directory and return all files array filtered by extension
	* @return array $ar_data
	*/
	public static function read_files(string $dir, array $valid_extensions=array('csv')) : array {

		$ar_data = array();
		try {
			/*
			if (!file_exists($dir)) {
				$create_dir 	= mkdir($dir, 0777,true);
				if(!$create_dir) throw new Exception(" Error on create directory. Permission denied \"$dir\" (1)");
			}
			*/
			$root = scandir($dir);
		} catch (Exception $e) {
			debug_log(__METHOD__." Error. Exception on read (scandir) root dir: ".to_string($dir), logger::ERROR);
			return array();
		}
		if ($root===false || empty($root)) {
			debug_log(__METHOD__." Error on read (scandir) root dir: ".to_string($dir), logger::ERROR);
			return array();
		}

		natsort($root);
		foreach($root as $value) {

			# Skip non valid extensions
			$file_parts = pathinfo($value);
			if(!isset($file_parts['extension']) || !in_array(strtolower($file_parts['extension']), $valid_extensions)) {
				debug_log(__METHOD__." Skipped file: $value", logger::DEBUG);
				continue;
			}

			# Case file
			if(is_file("$dir/$value")) {
				$ar_data[] = $value;
			}
			/*
			# Case dir ($recursive==true)
			if($recursive) foreach(self::find_all_files("$dir/$value", $recursive) as $value) {
				$ar_data[] = $value;
			}
			*/
		}

		# SORT ARRAY (By custom core function build_sorter)
		#usort($ar_data, build_sorter('numero_recurso'));
		#dump($ar_data,'$ar_data');

		return (array)$ar_data;
	}//end read_files



	/**
	* GET_AR_INVERSE
	* Format, filter and sort inverse_locators values for use in selector
	* @return array $ar_inverse
	*/
	public function get_ar_inverse( $inverse_locators ) {

		$ar_inverse=array();

		$section_name = RecordObj_dd::get_termino_by_tipo( TOP_TIPO );
		foreach ((array)$inverse_locators as $current_locator) {

			$current_section_tipo = $current_locator->from_section_tipo;
			$current_section_id   = $current_locator->from_section_id;

			if ($current_section_tipo!==TOP_TIPO) {
				continue;
			}
			$ar_inverse[$current_section_id] = $section_name ." | ". $current_section_id;

			# inverse_code
			$inverse_code = tool_common::get_inverse_element('code', $current_section_id, TOP_TIPO);
			if (is_object($inverse_code)) {
				$ar_inverse[$current_section_id] .= " | ". $inverse_code->value;
			}
		}
		natsort($ar_inverse);

		return $ar_inverse;
	}//nd get_ar_inverse



	/**
	* GET_INVERSE_ELEMENT
	* Get section_map from section class and calculate value of desired component type like 'code'
	* @return mixed object|null
	*/
	public static function get_inverse_element($type, $section_id, $section_tipo) {

		# section_map is in properties of structure element 'section_map', inside current section structure
		$section_map = section::get_section_map( $section_tipo );
			#dump($section_map, ' section_map ++ '.to_string());

		$separator = ' - ';

		if (is_object($section_map) && property_exists($section_map, "default") && property_exists($section_map->default, $type)) {

			if (is_array($section_map->default->$type)) {
				// Is json encoded array
				$ar_component_tipo = $section_map->default->$type;
			}else{
				// Is string
				$ar_component_tipo = [$section_map->default->$type];
			}

			$ar_labels = [];
			$ar_values = [];
			foreach ($ar_component_tipo as $key => $element_tipo) {

				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($element_tipo,true);
				$component 		= component_common::get_instance($modelo_name,
																 $element_tipo,
																 $section_id,
																 'list',
																 DEDALO_DATA_LANG,
																 $section_tipo);
				$ar_labels[] = $component->get_label();

				$value = $component->get_valor();
				if (!empty($value)) {
					$ar_values[] = $value;
				}
			}

			$response = new stdClass();
				$response->label = implode($separator, $ar_labels);
				$response->value = implode($separator, $ar_values);

		}else{
			$response = null;
		}
		#dump($response, ' response ++ '.to_string());

		return $response;
	}//end get_inverse_element



	/**
	* ITERATE_FILES
	* @return object $response
	*/
	public static function iterate_files($dir_path, $action) {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';

		// check valid dir
			if (!is_dir($dir_path)) {
				$response->msg	= 'Error. dir_path is not a valid dir. ' . json_encode($dir_path);
				return $response;
			}

		// Let's traverse the images directory
			$fileSystemIterator = new FilesystemIterator($dir_path);

		// iterate
			$procesed_files = [];
			foreach ($fileSystemIterator as $fileInfo){

				$file_name = $fileInfo->getFilename();
				$file_type = $fileInfo->getType();

				// exec function callback
				$action_response = $action($fileInfo);

				if (!$action_response) {
					debug_log(__METHOD__." Error. Ignored file: ".to_string($file_name), logger::WARNING);
				}else{
					$procesed_files[] = $file_name;
				}
			}

		$response->result	= true;
		$response->msg		= 'Ok. Request done';

		return $response;
	}//end iterate_files



}//end class