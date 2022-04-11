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
	* UPLOAD_FILE
	* @return object $response
	* Note:
	* XMLHttpRequest can´t be a json 'php://input'. Because this, we receive
	* a _POST and _FILES request and are transformed to a standard call by common::trigger_manager
	*/
	public static function upload_file($request_options) {
		$start_time=microtime(1);

		// response
			$response = new stdClass();
				$response->result 	= false;
				$response->msg 		= 'Error. '.label::get_label('error_al_subir_el_archivo');

		// options
			$options = new stdClass();
				$options->component_tipo		= null;
				$options->section_tipo			= null;
				$options->section_id			= null;
				$options->quality				= null;
				$options->caller_type			= null;
				$options->allowed_extensions	= '[]';   // stringnified array like ['csv']
				$options->target_dir			= 'null'; // stringnified object like {type:dedalo_config, value:DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH}
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// json decode encoded vars
			$allowed_extensions	= json_decode($options->allowed_extensions);
			$target_dir			= json_decode($options->target_dir);

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

			// check extension
				if (!in_array($file_data->extension, $allowed_extensions)) {
					debug_log(__METHOD__." Error. Invalid file extension ".$file_data->extension, logger::ERROR);
					$response->msg .= "Error. Invalid file extension ".$file_data->extension;
					return $response;
				}


		// all is OK response
			$response->result		= true;
			$response->file_data	= $file_data ?? null;
			$response->msg			= 'OK. '.label::get_label('fichero_subido_con_exito');

		// debug
			if(SHOW_DEBUG===true) {

				// $response->msg .= '<pre>'.json_encode($add_file, JSON_PRETTY_PRINT).'</pre>';
				// $response->msg .= '<pre>'.json_encode($process_file, JSON_PRETTY_PRINT).'</pre>';

				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
					$debug->options		= $options;
					$debug->file_data	= $file_data;

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



	/**
	* GET_KNOWN_MIME_TYPES
	* @return array $mime_types
	*/
	public static function get_known_mime_types() {

		$mime_types = array(

			'txt'	=> 'text/plain',
			'htm'	=> 'text/html',
			'html'	=> 'text/html',
			'php'	=> 'text/html',
			'css'	=> 'text/css',
			'csv'	=> 'text/csv',
			'js'	=> 'application/javascript',
			'json'	=> 'application/json',
			'xml'	=> 'application/xml',
			'swf'	=> 'application/x-shockwave-flash',
			'flv'	=> 'video/x-flv',

			// images
			'png'	=> 'image/png',
			'jpe'	=> 'image/jpeg',
			'jpeg'	=> 'image/jpeg',
			'jpg'	=> 'image/jpeg',
			'gif'	=> 'image/gif',
			'bmp'	=> 'image/bmp',
			'ico'	=> 'image/vnd.microsoft.icon',
			'tiff'	=> 'image/tiff',
			'tif'	=> 'image/tiff',
			'svg'	=> 'image/svg+xml',
			'svgz'	=> 'image/svg+xml',

			// archives
			'zip'	=> 'application/zip',
			'rar'	=> 'application/x-rar-compressed',
			'exe'	=> 'application/x-msdownload',
			'msi'	=> 'application/x-msdownload',
			'cab'	=> 'application/vnd.ms-cab-compressed',

			// audio/video
			'mp3'	=> 'audio/mpeg',
			'mp4'	=> 'video/mpeg',
			'qt'	=> 'video/quicktime',
			'mov'	=> 'video/quicktime',

			// adobe
			'pdf'	=> 'application/pdf',
			'psd'	=> 'image/vnd.adobe.photoshop',
			'ai'	=> 'application/postscript',
			'eps'	=> 'application/postscript',
			'ps'	=> 'application/postscript',

			// ms office
			'doc'	=> 'application/msword',
			'rtf'	=> 'application/rtf',
			'xls'	=> 'application/vnd.ms-excel',
			'ppt'	=> 'application/vnd.ms-powerpoint',

			// open office
			'odt'	=> 'application/vnd.oasis.opendocument.text',
			'ods'	=> 'application/vnd.oasis.opendocument.spreadsheet',
		);

		return $mime_types;
	}//end get_known_mime_types




}//end class tool_upload
