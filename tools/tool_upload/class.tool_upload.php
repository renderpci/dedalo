<?php
/*
* CLASS TOOL_UPLOAD
*
*
*/
class tool_upload { // extends tool_common



	/**
	* __CONSTRUCT
	*/
	public function __construct($component_obj, $modo='button') {

		// # Fix modo
		// $this->modo = $modo;

		// # Para unificar el acceso, se copia el componente a $this->component_obj
		// $this->component_obj 	= $component_obj;

		// # Fix component
		// $this->source_component = $component_obj;
		// $this->source_component->set_modo('tool_upload');
		// #$this->source_component->set_variant( tool_upload::$source_variant );
		// 	#dump($component_obj,'component_obj');

		// $this->section_tipo = $component_obj->get_section_tipo();
	}//end __construct



	/**
	* GET_SYSTEM_INFO
	* @return object response
	*/
	public static function get_system_info() {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed';

		// Returns a file size limit in bytes based on the PHP upload_max_filesize
		// and post_max_size
		function file_upload_max_size() {
		  static $max_size = -1;

		  if ($max_size < 0) {
			// Start with post_max_size.
			$post_max_size = parse_size(ini_get('post_max_size'));
			if ($post_max_size > 0) {
			  $max_size = $post_max_size;
			}

			// If upload_max_size is less, then reduce. Except if upload_max_size is
			// zero, which indicates no limit.
			$upload_max = parse_size(ini_get('upload_max_filesize'));
			if ($upload_max > 0 && $upload_max < $max_size) {
			  $max_size = $upload_max;
			}
		  }
		  return $max_size;
		}

		function parse_size($size) {
		  $unit = preg_replace('/[^bkmgtpezy]/i', '', $size); // Remove the non-unit characters from the size.
		  $size = preg_replace('/[^0-9\.]/', '', $size); // Remove the non-numeric characters from the size.
		  if ($unit) {
			// Find the position of the unit in the ordered string which is the power of magnitude to multiply a kilobyte by.
			return round($size * pow(1024, stripos('bkmgtpezy', $unit[0])));
		  }
		  else {
			return round($size);
		  }
		}

		$upload_tmp_dir = ini_get('upload_tmp_dir');

		// system_info
			$system_info = new stdClass();
				$system_info->max_size_bytes 		= file_upload_max_size();
				$system_info->sys_get_temp_dir 		= sys_get_temp_dir();
				$system_info->upload_tmp_dir 		= $upload_tmp_dir;
				$system_info->upload_tmp_perms 		= fileperms($upload_tmp_dir);
				$system_info->session_cache_expire  = (int)ini_get('session.cache_expire');


		// response
			$response->result 	= $system_info;
			$response->msg 		= 'OK. Request done';

		return $response;
	}//end get_system_info



	/**
	* UPLOAD_FILE
	* @return object $response
	* Note:
	* XMLHttpRequest can´t be a json 'php://input'. Because this, we receive
	* a _POST and _FILES request and are transformed to a standard call by common::trigger_manager
	*/
	public static function upload_file($request_options) {
		$start_time=microtime(1);

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. '.label::get_label('error_al_subir_el_archivo');


		// options
			$options = new stdClass();
				$options->component_tipo	= null;
				$options->section_tipo		= null;
				$options->section_id		= null;
				$options->quality			= null;
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// file_data. post file (sended across $_FILES)
			// Example of received data:
			// "name": "montaje3.jpg",
			// "type": "image/jpeg",
			// "tmp_name": "/private/var/tmp/php6nd4A2",
			// "error": 0,
			// "size": 132898
			$file_data = new stdClass();
				$file_data->name		= $_FILES["fileToUpload"]['name'];
				$file_data->type		= $_FILES["fileToUpload"]['type'];
				$file_data->tmp_name	= $_FILES["fileToUpload"]['tmp_name'];
				$file_data->error		= $_FILES["fileToUpload"]['error'];
				$file_data->size		= $_FILES["fileToUpload"]['size'];
				$file_data->extension	= strtolower(pathinfo($_FILES["fileToUpload"]['name'], PATHINFO_EXTENSION));

			// check for upload server errors
				$uploaded_file_error		= $_FILES["fileToUpload"]['error'];
				$uploaded_file_error_text	= tool_upload::error_number_to_text($uploaded_file_error);
				if ($uploaded_file_error!==0) {
					$response->msg .= ' - '.$uploaded_file_error_text;
					return $response;
				}

			// check file is available in temp dir
				if(!file_exists($file_data->tmp_name)) {
					debug_log(__METHOD__." Error on locate temporary file ".$file_data->tmp_name, logger::ERROR);
					$response->msg .= "Uploaded file not found in temporary folder";
					return $response;
				}

		// component
			$model		= RecordObj_dd::get_modelo_name_by_tipo($options->component_tipo,true);
			$component	= component_common::get_instance($model,
														 $options->component_tipo,
														 $options->section_id,
														 'edit',
														 DEDALO_DATA_LANG,
														 $options->section_tipo);

			// fix current component target quality (defines the destination directory for the file, like 'original')
				$component->set_quality($options->quality);

			// add file
				$add_file = $component->add_file($file_data);
				if ($add_file->result===false) {
					$response->msg = $add_file->msg;
					return $response;
				}
				// dump($add_file, ' add_file ++ '.to_string());

			// postprocessing file (add_file returns final renamed file with path info)
				$process_file = $component->process_uploaded_file($add_file->ready);
				if ($process_file->result===false) {
					$response->msg = 'Upload is complete, but errors occurred on processing file: '.$process_file->msg;
					return $response;
				}

			// preview url. Usually the thumb image or posterframe
				$preview_url = $component->get_preview_url();


		// all is OK
			$response->result		= true;
			$response->preview_url	= $preview_url;
			$response->msg			= 'OK. '.label::get_label('fichero_subido_con_exito');

		// debug
			if(SHOW_DEBUG===true) {

				// $response->msg .= '<pre>'.json_encode($add_file, JSON_PRETTY_PRINT).'</pre>';
				// $response->msg .= '<pre>'.json_encode($process_file, JSON_PRETTY_PRINT).'</pre>';

				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
					$debug->options		= $options;
					$debug->file_data	= $file_data;
					$debug->add_file	= $add_file;

				$response->debug = $debug;
			}


		return (object)$response;
	}//end upload_file




	/**
	* ERROR_NUMBER_TO_TEXT
	* @param $f_error_number int
	* @return $f_error_text strint
	*/
	public static function error_number_to_text($f_error_number) {

		if( $f_error_number===0 ) {
						# all is ok
						$f_error_text = label::get_label('archivo_subido_con_exito');
		}else{
			switch($f_error_number) {
						# Error by number
				case 1 : $f_error_text = label::get_label('el_archivo_subido_excede_de_la_directiva');	break;
				case 2 : $f_error_text = label::get_label('el_archivo_subido_excede_el_tamano_maximo');	break;
				case 3 : $f_error_text = label::get_label('el_archivo_subido_fue_solo_parcialmente_cargado');	break;
				case 4 : $f_error_text = label::get_label('ningun_archivo_fue_subido');	break;
				case 6 : $f_error_text = label::get_label('carpeta_temporal_no_accesible');	break;
				case 7 : $f_error_text = label::get_label('no_se_pudo_escribir_el_archivo_en_el_disco');	break;
				case 8 : $f_error_text = label::get_label('una_extension_de_php_detuvo_la_carga_de_archivos');	break;
			}
		}

		return $f_error_text;
	}//end error_number_to_text




}//end class tool_upload
