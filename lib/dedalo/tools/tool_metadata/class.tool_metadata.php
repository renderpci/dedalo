<?php
/*
* CLASS tool_metadata
*
*
*/
class tool_metadata extends tool_common {


	public static $processed_files;
	public static $total_files = 0;



	/**
	* __CONSTRUCT
	*/
	public function __construct($section_obj, $modo='page') {
			
		# Fix modo
		$this->modo = $modo;

		# Fix current media component
		$this->section_obj = $section_obj;

		return true;
	}//end __construct



	/**
	* COUNT_FILES
	* @return object $response
	*/
	public static function count_files($path, $extensions=['jpg']) {
		
		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';

		$dir		= DEDALO_MEDIA_BASE_PATH . rtrim($path, '/');
		$process	= function($file) {			
			self::$total_files++;
		};

		$result = self::iterate_dir($dir, $process, $extensions);

		$response->result	= self::$total_files;
		$response->msg		= 'Ok. Request done';
	

		return $response;
	}//end count_files





	/**
	* PROCESS_FILES
	* @return object $response
	*/
	public static function process_files($path, $data, $extensions=['jpg']) {
		
		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';

		$dir		= DEDALO_MEDIA_BASE_PATH . rtrim($path, '/');
		$process	= function($file) use($data){
			return self::edit_metadata($file, $data);
		};

		$result = self::iterate_dir($dir, $process, $extensions);

		if (!empty(self::$processed_files)) {
			$response->result	= self::$processed_files;
			$response->msg		= 'Ok. Request done';
		}

		return $response;
	}//end process_files



	/**
	* ITERATE_DIR
	* Iterate recursively a dir and process files with desired extensions
	*/
	public static function iterate_dir($dir, $process, $extensions) {

		$skip_folders = ['deleted','acc'];
		
		if (is_dir($dir)) {
			$files = glob( $dir . '/*' );

			foreach($files as $file){ // iterate files

				if(is_file($file)) {
					$extension = pathinfo($file,PATHINFO_EXTENSION);
					if (in_array($extension, $extensions)) {
						$ar_process[] = $process($file);
					}
				}else{

					$dir_name = pathinfo($file,PATHINFO_BASENAME);
					if (!in_array($dir_name, $skip_folders)) {
						self::iterate_dir($file, $process, $extensions);
					}
				}
			}
		}

		return true;
	}//end iterate_dir



	/**
	* EDIT_METADATA
	* Add/modify image metadata (IPTC AND XMP are accepted)
	* exiftool groups priority: 1) EXIF,   2) IPTC,   3) XMP
	* @param string $file
	*	Absolute file path
	* @param array $data
	*	List of objects ( property name => property value )
	* @return object $result
	*/
	public static function edit_metadata($file, $data) {		
		
		// sentences
			$sentences = array_map(function($item){
				return '-' . $item->key .'=\'' . $item->value . '\'';
			}, $data);

		// description (Dédalo locator)
			$file_name = pathinfo($file,PATHINFO_BASENAME);
			preg_match('/^\w{2,}_(\w{2,}_\d)\.*/', $file_name, $output_array);
			// $description = $output_array[1]; // like rsc170_2
			$ar = explode('_', $output_array[1]);
			$section_tipo	= $ar[0];
			$section_id		= $ar[1];
			$description	= '{"about":"Dédalo locator","section_tipo":"'.$section_tipo.'","section_id":"'.$section_id.'"}';
			$sentences[]	= '-description=\'' . $description . '\''; // add as sentence too

		// metadata edit
			$command			= EXIFTOOL_PATH . "/exiftool " .implode(' ', $sentences). " $file;";
			$output_exiftool	= shell_exec($command);

			$result = (object)[
				'file'				=> $file,
				'command'			=> $command,
				'output_exiftool'	=> trim($output_exiftool)
			];

			// error cases
				if (trim($output_exiftool)!=='1 image files updated') {
					$command_error = str_replace('exiftool ', 'exiftool -v ', $command);
					$output_error_exiftool  = shell_exec($command_error);

					$result->error = $output_error_exiftool;
				}

		// add
			self::$processed_files[] = $result;


		return $result;
	}//end edit_metadata



}//end tool_metadata