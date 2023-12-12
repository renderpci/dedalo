<?php
/**
* CLASS TOOL_UPLOAD
*
*
*/
class tool_upload extends tool_common {



	/**
	* PROCESS_UPLOADED_FILE
	* This method is caller after the file is already uploaded to temporary directory.
	* Move the temp file to the final directory and launch the component process method
	* @param object $options
	* @return object $response
	*/
	public static function process_uploaded_file(object $options) : object {
		$start_time=start_time();

		// session close not block user interface
		session_write_close();

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed. '.__METHOD__.' ';

		// options
			$file_data		= $options->file_data;
			$ocr			= $options->ocr;
			$lg				= $options->lg;
			$tipo			= $options->tipo ?? null;
			$section_tipo	= $options->section_tipo;
			$section_id		= $options->section_id ?? null;
			$caller_type	= $options->caller_type; // string as 'component'
			$quality		= $options->quality ?? null;
			$target_dir		= $options->target_dir ?? null;

		// manage uploaded file
			switch ($caller_type) {

				case ('component'):

					// logger activity. Note that this log is here because generic service_upload
					// is not capable to know if the uploaded file is the last one in a chunked file scenario
						logger::$obj['activity']->log_message(
							'UPLOAD COMPLETE',
							logger::INFO,
							$tipo,
							NULL,
							[
								'msg'			=> 'Upload file complete. Processing uploaded file',
								'file_data'		=> json_encode($file_data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)
								// 'file_name'	=> $file_data->name,
								// 'file_size'	=> format_size_units($file_data->size),
								// 'time_sec'	=> $file_data->time_sec,
								// 'f_error'	=> $file_data->error || null
							]
						);

					// component media
						$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
						$component	= component_common::get_instance(
							$model,
							$tipo,
							$section_id,
							'edit',
							DEDALO_DATA_NOLAN,
							$section_tipo
						);

					// OCR Processing
						if($ocr===1){
							$tmp_file_location = 
										// httpdocs route
										dirname($_SERVER['DOCUMENT_ROOT']).
										// Route to tmp file location using a substring of the thumbnail location in $file_data->thumbnail_url
										substr($file_data->thumbnail_url,0,strpos($file_data->thumbnail_url,"thumbnail/")-strlen($file_data->thumbnail_url)).
										// Name of the tmp file
										$file_data->tmp_name;

							switch($lg) {
								case 'lg-spa':
									$lang = 'spa';
									break;
								case 'lg-vlca':
									$lang = 'cat';
									break;
								case 'lg-fra':
									$lang = 'fra';
									break;
								case 'lg-ita':
									$lang = 'ita';
									break;
								case 'lg-eng':
								default:
									$lang = 'eng';
									break;
							}
							
							shell_exec("ocrmypdf -l ".$lang." --force-ocr ".$tmp_file_location." ".$tmp_file_location);
						}
							
						
					// fix current component target quality (defines the destination directory for the file, like 'original')
						$component->set_quality($quality);

					// add file
						$add_file = $component->add_file($file_data);
						if ($add_file->result===false) {
							$response->msg .= $add_file->msg;
							return $response;
						}

					// post processing file (add_file returns final renamed file with path info)
						$process_file = $component->process_uploaded_file($add_file->ready);
						if ($process_file->result===false) {
							$response->msg .= 'Errors occurred when processing file: '.$process_file->msg;
							return $response;
						}

					// preview url. Usually the thumb image or posterframe
						$default_quality	= $component->get_default_quality();
						$preview_url		= $component->get_preview_url($default_quality);

					// response OK
						$response->result		= true;
						$response->msg			= 'OK. File processed successfully';
						$response->preview_url	= $preview_url;

					break;

				default:
					debug_log(__METHOD__
						." Error on process uploaded file. No target or manager received. options: " . PHP_EOL
						.to_string($options)
						, logger::ERROR
					);
					$response->msg .= "Error on get/move to target_dir. ".to_string($target_dir->value);
					break;
			}//end switch (true)

		// debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms').' ms';
				$response->debug = $debug;
			}


		return $response;
	}//end process_uploaded_file



}//end class tool_upload
