<?php
/*
* CLASS TOOL_EXPORT
	
	Export selected records in differents formats using section_list as base fields reference
	
*/
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');



class tool_export extends tool_common {
	
	public $section_tipo;
	public $section_obj;	# received section
	public $ar_records;		# Array of records to export (section_id) or null

	public static $delimiter = ';';

	public function __construct( $section_tipo, $modo ) {

		# Verify type section object
		#if ( get_class($section_obj) !== 'section' ) {
		#	throw new Exception("Error Processing Request. Only sections are accepted in this tool", 1);
		#}

		# NOTA: POR UNIFICAR EL CONSTRUCTOR DE LOS TOOLS QUE USAN SECTION !!!!

		if (is_object($section_tipo)) {
			$section_tipo = $section_tipo->get_tipo();
		}

		$this->section_tipo = $section_tipo;
		
		# Fix current component/section
		#$this->section_obj = $section_obj;		

		# Fix modo
		$this->modo = $modo;

		# Fix records
		$this->ar_records = null;
	}


	/**
	* SET_UP
	*/
	static function set_up() {

		if (isset($_REQUEST['button_tipo'])) {
			$button_obj  = new button_import($_REQUEST['button_tipo'], null, $this->section_tipo);
			$propiedades = json_handler::decode($button_obj->RecordObj_dd->get_propiedades());

			// en prodeso..		
		}
		
	}//end set_up



	/**
	* GET_RECORDS
	* @return array|null
	*/
	public function get_records( $layout_map ) {

		if (!empty($this->ar_records)) {
			return $this->ar_records;
		}
		
		#
		# RECORDS DATA
		$section_tipo 				= $this->section_tipo;
		$search_options_session_key = 'section_'.$section_tipo;
		if (!isset($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key])) {
			trigger_error("Sorry, search_options_session_key [$search_options_session_key] not exits in session");
			return null;
		}
		$options_search   = clone($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]);
	
			$options_search->search_options_session_key = $search_options_session_key.'_export';
			$options_search->modo 						= 'edit';
			$options_search->offset 					= false;
			$options_search->limit 						= false;
			$options_search->full_count 				= false;
			$options_search->tipo_de_dato				= 'valor';
			$options_search->layout_map					= $layout_map;
				#dump($options_search," options_search");die();

			# LAYOUT MAP FALLBACK . Is defined in session when browser list, but can be empty if we enter later to one record of section (edit mode)
			if ( empty($options_search->layout_map) ) {
				$section 			 = section::get_instance(null,$section_tipo,'list');
				$options_search->layout_map = (array)component_layout::get_layout_map_from_section( $section );
			}

			if(SHOW_DEBUG) {
				$lmkey = key($options_search->layout_map);				
				foreach ( $options_search->layout_map[$lmkey] as $key => $value) {					
					if ($value=='rsc36') {
						#dump($value, ' value ++ '.to_string($key));
						#unset( $options_search->layout_map[$lmkey][$key] );
					}
				}		
			}
		
		$rows_data = search::get_records_data($options_search);
			#dump($rows_data,"rows_data "); #die();

		$this->ar_records = $rows_data->result;

		return $this->ar_records;

	}#end get_records




	/**
	* EXPORT_TO
	* @return 
	*/
	public function export_to( $format, $ar_records=null ) {

		if (is_null($ar_records)) {
			$ar_records = $this->get_records();
		}
		#dump($ar_records, ' ar_records ++ '.to_string());

		$ar_records_deep_resolved=array();
		foreach ((array)$ar_records as $key => $value) {
			$row 		= reset($value);
			$section_id = $row['section_id'];
			$ar_records_deep_resolved[$section_id] = $this->deep_resolve_row($row);
		}
		#dump($ar_records_deep_resolved, ' $ar_records_deep_resolved ++ '.to_string());		
		
				
		switch ($format) {
			// CSV
			case 'csv':
				$export_data= '';
				$com 		= '"';
				$delimiter  = tool_export::$delimiter;	// ";";
				$delimiter_length = strlen($delimiter);
				$header_added = false;
				foreach ($ar_records_deep_resolved as $key => $ar_alue) {
					if (!$header_added) {
						foreach ($ar_alue as $current_tipo => $cvalue) {

							if ($current_tipo!='id' && $current_tipo!='section_id' && $current_tipo!='section_tipo') {
								$current_tipo = RecordObj_dd::get_termino_by_tipo($current_tipo);
							}
							$export_data .= $com.$current_tipo.$com;							
							$export_data .= $delimiter;
						}
						$export_data = substr($export_data, 0,-$delimiter_length);
						$export_data .= PHP_EOL;
						$header_added = true;
					}
					$export_data .= implode($delimiter, $ar_alue) .PHP_EOL;
				}
				break;
			
			default:
				trigger_error("Sorry. Format not implemented yet");
				break;
		}

		return $export_data;

	}#end export_to



	/**
	* DEEP_RESOLVE_ROW
	* @param array $record
	* @param string $lang
	* @return array $row_deep_resolved
	*/
	public function deep_resolve_row( $record, $lang=DEDALO_DATA_LANG ) {
		
		#dump($record, ' record ++ '.to_string());

		$quotes ='"';
		#$quotes ='';

		$row_deep_resolved=array();
		foreach ($record as $key => $value) {			
			
			if ($key=='id') continue;
			if ($key=='section_id') {
				$row_deep_resolved[$key] = $quotes.$value.$quotes;
				continue;
			}
			if ($key=='section_tipo') {
				#$row_deep_resolved[$key] = $quotes.$value.$quotes;
				continue;	// Skip resolve non field elements
			}
			
			
			$modelo_name 	 = RecordObj_dd::get_modelo_name_by_tipo($key,true);
			$tipo 			 = $key;
			$parent 		 = $record['section_id'];
			$section_tipo 	 = $record['section_tipo'];
			$component 	     = component_common::get_instance($modelo_name,
															  $tipo,
															  $parent,
															  'list',
															  $lang,
															  $section_tipo);

			$valor_export 	 = $component->get_valor_export( $value, $lang, $quotes, $add_id=false );
			#$valor_export 	 = str_replace(PHP_EOL, '; ', $valor_export);
			$valor_export 	 = addslashes($valor_export);
			$valor_export 	 = $quotes.trim($valor_export).$quotes;
			$row_deep_resolved[$key] = $valor_export;

		}//end foreach ($record as $tipo => $value) {
		#dump($row_deep_resolved, ' row_deep_resolved ++ '.to_string());

		return $row_deep_resolved;

	}#end deep_resolve_row





	/**
	* GET_AR_COLUMNS
	* @return array $ar_columns
	* Get all section fields
	*/
	public function get_ar_columns() {
		
		$section_tipo 			 = $this->section_tipo;
		$ar_modelo_name_required = array('component');

		$ar_elements = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual=true);
			#dump($ar_elements, ' $ar_elements ++ '.to_string($section_tipo));

		$ar_columns=array();
		foreach ($ar_elements as $key => $tipo) {
			$name = RecordObj_dd::get_termino_by_tipo($tipo);

			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			if($modelo_name=='component_section_id') continue; # Skip component_section_id (is fixed data in export)
			$ar_columns[$tipo] = $name;
		}
		return $ar_columns;

	}#end get_ar_columns



	/**
	* COLUMNS_TO_LAYOUT_MAP
	* @return 
	*/
	public static function columns_to_layout_map( $columns, $section_tipo ) {

		if (is_string($columns)) {
			$columns = json_decode($columns);
		}
		
		$layout_map=array();
		foreach ($columns as $tipo => $value) {
			$layout_map[$section_tipo][] = $tipo;
				#dump($tipo, ' tipo ++ '.to_string($value));
		}

		return $layout_map;

	}#end columns_to_layout_map



	/**
	* WRITE_RESULT
	* @param string $result
	* @return object $response
	*/
	public function write_result( $result_string ) {
		
		$section_tipo	= $this->section_tipo;
		$filename 		= 'export_'.$section_tipo.'_'.navigator::get_user_id().'.csv';		
		
		$target_dir 	= DEDALO_TOOL_EXPORT_FOLDER_PATH;
		if( !is_dir($target_dir) ) {
			if(!mkdir($target_dir, 0777,true)) throw new Exception("Error on read or create directory. Permission denied \"$target_dir\" (1)");						
		}
		file_put_contents( $target_dir.'/'.$filename, $result_string);

		$response = new stdClass();
			$response->result 	= 'ok';
			$response->msg 		= 'Exported successfully';
			$response->path 	= $target_dir.'/'.$filename;
			$response->url 		= DEDALO_TOOL_EXPORT_FOLDER_URL .'/'. $filename;

		return $response;

	}#end write_result



	/**
	* READ_CSV_FILE_AS_TABLE
	* @param string $file
	* @return string $html
	*/
	public static function read_csv_file_as_table( $file, $header=false, $delimiter=null, $standalone=false ) {

		if (empty($delimiter)) {
			$delimiter = tool_export::$delimiter;
		}	

		$html='';

		#
		# TABLE HTML
		$table_html ='';
		$table_html .= "<table class=\"table_csv\">\n\n";		
		ini_set('auto_detect_line_endings',TRUE);
		$f = fopen($file, "r");
		$table_html .= "<caption>TABLE FROM:  $file</caption>";
		$i=0; while (($line = fgetcsv($f, 300000, $delimiter)) !== false) {
			
				$table_html .= "<tr>";
				foreach ($line as $cell) {
					$table_html .= ($header && $i==0) ? "<th>" : "<td>";
					$cell=nl2br($cell);					
					#$cell=htmlspecialchars($cell); // htmlspecialchars_decode($cell);					
					#$cell = str_replace("\t", " <blockquote> </blockquote> ", $cell);
					
					# IMAGES . Replace images url to html img tags
					$regex = '/https?\:\/\/[^\\" ]+.jpg/i';
					$cell  = preg_replace($regex, "<img src=\"$0\" style=\"width:auto;height:57px\"/>", $cell);
					
					$table_html .= $cell;
					$table_html .= ($header && $i==0) ? "</th>" : "</td>";
				}
				$table_html .= "</tr>\n";
				$i++;
		}
		fclose($f);
		ini_set('auto_detect_line_endings',FALSE);
		$table_html .= "\n</table>";

		if ($standalone) {
			$css_file = DEDALO_LIB_BASE_URL . '/tools/tool_export/css/tool_export.css';

			$html .= "<html><head>";
			$html .= "<link rel=\"stylesheet\" href=\"$css_file\" type=\"text/css\" />";
			$html .= "</head><body>";
			$html .= $table_html;
			$html .= "</body></html>";
		}else{
			$html .= $table_html;
		}

		return $html;

	}#end read_csv_file_as_table


	
};#end class


?>