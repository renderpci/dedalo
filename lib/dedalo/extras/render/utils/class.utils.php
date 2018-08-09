<?php  


/**
* UTILS
*/
class utils {



	public static $csv_delimiter = ';';



	/**
	* READ_CSV_FILE_AS_TABLE
	* @param string $file
	* @return string $html
	*/
	public static function read_csv_file_as_table( $file, $header=false, $csv_delimiter=null, $standalone=false ) {
		/*
		if(!file_exists($file)) {
			echo "File not found: $file";
			return false;
		}
		*/
		return tool_export::read_csv_file_as_table( $file, $header, $csv_delimiter, $standalone );
	}#end read_csv_file_as_table



	/**
	* READ_CSV_FILE_AS_ARRAY
	* @param string $file
	* @return string $html
	*/
	public static function read_csv_file_as_array( $file, $skip_header=false, $csv_delimiter=';' ) {
		/*
		if(!file_exists($file)) {
			echo "File not found: $file";
			return false;
		}
			
		ini_set('auto_detect_line_endings',TRUE);

		$f = fopen($file, "r");
		
		$csv_array=array();
		$i=0; while (($line = fgetcsv($f, 500000, $csv_delimiter)) !== false) {

			if ($skip_header && $i==0) {
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
		ini_set('auto_detect_line_endings',FALSE);
		
		return $csv_array;
		*/
		return tool_common::read_csv_file_as_array( $file, $skip_header, $csv_delimiter );
	}#end read_csv_file_as_array


	/**
	* READ_FILES
	* Read files from directory and return all files array filtered by extension
	* @return 
	*/
	public static function read_files($dir, $valid_extensions=array('csv')) {
		/*
		$ar_data = array();
		try {
			if (!file_exists($dir)) {
				$create_dir 	= mkdir($dir, 0777,true);
				if(!$create_dir) throw new Exception(" Error on create directory. Permission denied \"$dir\" (1)");
			}
			$root 	 = scandir($dir);
		} catch (Exception $e) {
			//return($e);
		}
		if (!$root) {
			return array();
		}
		
		natsort($root);
		foreach($root as $value) {

			# Skip non valid extensions
			$file_parts = pathinfo($value);
			if(empty($file_parts['extension']) || !in_array(strtolower($file_parts['extension']), $valid_extensions)) {
				debug_log(__METHOD__." Skipped file with extension: ".$file_parts['extension'], logger::DEBUG);
				continue;
			}

			# Case file
			if(is_file("$dir/$value")) {
				$ar_data[] = $value;
			}
			
			# Case dir ($recursive==true)
			#if($recursive) foreach(self::find_all_files("$dir/$value", $recursive) as $value) {
			#	$ar_data[] = $value;
			#}			
		}

		# SORT ARRAY (By custom core function build_sorter)
		#usort($ar_data, build_sorter('numero_recurso'));
		#dump($ar_data,'$ar_data');
		
		return $ar_data;
		*/
		return tool_common::read_files( $dir, $valid_extensions );
	}//end read_files



}//end utils
?>