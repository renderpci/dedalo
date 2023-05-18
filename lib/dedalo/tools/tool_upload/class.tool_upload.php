<?php
/*
* CLASS TOOL UPLOAD
*/
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');


class tool_upload extends tool_common {

	# media component
	protected $component_obj ;

	# file_obj container of util file vars
	public $file_obj;


	/**
	* __CONSTRUCT
	* @param $component_obj object
	* @param $modo string (optional)
	*/
	public function __construct($component_obj, $modo='button') {

		# Fix current media component
		$this->component_obj = $component_obj;
			#dump($component_obj, ' component_obj');

		# Fix modo
		$this->modo = $modo;

		$this->file_obj = new stdClass();


		return true;
	}//end __construct



	/**
	* UPLOAD_FILE
	* @param object $options
	* @return object $response
	*/
	public function upload_file( $options ) {

		$start_time = start_time();

		// options
			$quality = $options->quality;
			$chunked = (bool)$options->chunked;

		// response
			$response = new stdClass();
				$response->result				= 0;
				$response->html					= null;
				$response->update_components	= [];

		// logger_backend_activity disable on chunks
			if ($chunked===true) {
				logger_backend_activity::$enable_log = false;
			}

		# Current component name
		$component_name = get_class( $this->component_obj );

		// main vars : Fix
			switch ($component_name) {
				case 'component_av' :
						$SID					= $this->component_obj->get_video_id();
						#$folder_path			= DEDALO_MEDIA_BASE_PATH . DEDALO_AV_FOLDER . '/' . $quality;
						$this->component_obj->set_quality($quality);
						$folder_path			= $this->component_obj->get_target_dir();
						$current_extension		= DEDALO_AV_EXTENSION;
						$ar_allowed_extensions	= unserialize(DEDALO_AV_EXTENSIONS_SUPPORTED);
						break;
				case 'component_image' :
						$SID 					= $this->component_obj->get_image_id();
						#$folder_path			= DEDALO_MEDIA_BASE_PATH . DEDALO_IMAGE_FOLDER . '/' . $quality;
						$this->component_obj->set_quality($quality);
						$folder_path			= $this->component_obj->get_target_dir();	//DEDALO_MEDIA_BASE_PATH . DEDALO_IMAGE_FOLDER .'/'. $this->aditional_path . $this->get_quality() ;
							#dump($folder_path,'$folder_path'); die();
						$current_extension 		= DEDALO_IMAGE_EXTENSION;
						$ar_allowed_extensions 	= unserialize(DEDALO_IMAGE_EXTENSIONS_SUPPORTED);
						break;
				case 'component_svg' :
						$SID 					= $this->component_obj->get_svg_id();
						$folder_path			= $this->component_obj->get_target_dir();	//DEDALO_MEDIA_BASE_PATH . DEDALO_IMAGE_FOLDER .'/'. $this->aditional_path . $this->get_quality() ;
							#dump($folder_path,'$folder_path'); die();
						$current_extension 		= DEDALO_SVG_EXTENSION;
						$ar_allowed_extensions 	= unserialize(DEDALO_SVG_EXTENSIONS_SUPPORTED);
						break;
				case 'component_pdf' :
						$SID 					= $this->component_obj->get_pdf_id();
						#$folder_path			= DEDALO_MEDIA_BASE_PATH . DEDALO_PDF_FOLDER . '/' . $quality;
						$this->component_obj->set_quality($quality);
						$folder_path			= $this->component_obj->get_target_dir();
							#dump($folder_path,'$folder_path'); die();
						$current_extension 		= DEDALO_PDF_EXTENSION;
						$ar_allowed_extensions 	= unserialize(DEDALO_PDF_EXTENSIONS_SUPPORTED);
						break;
			}

		// main vars : check
			if(!$SID) {
				$response->result	= false;
				$response->html		= 'Error SID not defined (1)';
				return $response;
			}
			if(!$quality) {
				$response->result	= false;
				$response->html		= 'Error: quality not defined (1)';
				return $response;
			}

		// verificamos si el archivo es válido
			$f_name 		= $_FILES["file_to_upload"]['name'];
			$f_type 		= $_FILES["file_to_upload"]['type'];
			$f_temp_name	= $_FILES["file_to_upload"]['tmp_name'];
			$f_size			= $_FILES["file_to_upload"]['size'];
			$f_error		= $_FILES["file_to_upload"]['error'];
			$f_error_text 	= tool_upload::error_number_to_text($f_error);
			$f_extension 	= strtolower(pathinfo($f_name, PATHINFO_EXTENSION));

		// nombre_archivo : nombre final del archivo
			$nombre_archivo = $SID . '.' . $f_extension ;

			if($chunked === true){
				$name 					= basename($f_temp_name);
				$f_name					= $options->file_name;
				$total_chunks			= $options->total_chunks;
				$chunk_index			= $options->chunk_index;
				$f_extension			= 'blob';
				$nombre_archivo			= "{$chunk_index}-{$name}.{$f_extension}";
				$file_mime				= 'application/octet-stream';
				$ar_allowed_extensions	= ['blob'];
			}

		// file_obj f_name fix
			$this->file_obj->f_name = $f_name;

		// extensions : validate extension file
			$is_valid_extension = $this->validate_extension( $f_extension, $ar_allowed_extensions );
			if ($is_valid_extension !== true) {
				$response->result	= false;
				$response->html		= 'Error: invalid extension: ' . $f_extension;
				return $response;
			}

		# LOG UPLOAD BEGINS
			$tipo			= $this->component_obj->get_tipo();
			$parent			= $this->component_obj->get_parent();
			$file_size_mb	= round( ($f_size/1024)/1024, 2 );

			// LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
				logger::$obj['activity']->log_message(
					'UPLOAD',
					logger::INFO,
					$tipo,
					NULL,
					[
						'msg'				=> 'Upload file start',
						'tipo'				=> $tipo,
						'parent'			=> $parent,
						'top_id'			=> TOP_ID,
						'top_tipo'			=> TOP_TIPO,
						'component_name' 	=> $component_name,
						'quality' 			=> $quality,
						'file_name' 		=> $nombre_archivo,
						'file_size_mb' 		=> $file_size_mb
					]
				);

		// Verificamos que NO hay ya un fichero anterior con ese nombre. Si lo hay, lo renombramos y movemos a deleted files
		// Recorremos todas las extensiones válidas (recordar que los ficheros de tipo 'tif', etc. se guardan también)
			if($chunked === false){
				$this->rename_old_files_if_exists( $SID, $folder_path, $ar_allowed_extensions );
			}


		// uploaded_file_path. Add / if need
			if(substr($folder_path, -1)!='/') $folder_path .= '/';
			$this->file_obj->uploaded_file_path = $folder_path . $nombre_archivo;

		// DEBUG MSG
			debug_log(__METHOD__." Uploading file $component_name - quality: $quality - path: ".$this->file_obj->uploaded_file_path .to_string(), logger::DEBUG);

		# Move temp uploaded file to final dir
		if(file_exists($f_temp_name)) {

			$fileUploadOK = 0;

			#If the file is a .zip (DVD) create the folder and copy the VIDEO_TS and AUDIO_TS to the destination folder.
			if($f_extension === 'zip'){

				$zip = new ZipArchive;
				$res = $zip->open($f_temp_name);

				if ($res === TRUE) {
					// Create the directory
					if( !is_dir($folder_path.'/'.$SID) ) {
						$create_dir = mkdir($folder_path.'/'.$SID, 0777);
						$create_dir = mkdir($folder_path.'/'.$SID.'/VIDEO_TS/', 0777);
						$create_dir = mkdir($folder_path.'/'.$SID.'/AUDIO_TS/', 0777);
						if(!$create_dir) {
							throw new Exception("Error on read or create directory for \"$SID\" folder. Permission denied ! ", 1);
						}
					}
					# See al .zip files for located the VIDEO_TS and AUDIO_TS folders
					for ($i=0; $i < $zip->numFiles; $i++) {

						$filename = $zip->getNameIndex($i);

						if(strpos($filename,'VIDEO_TS')!== false){

						  	$fileinfo = pathinfo($filename);
						  	# Don't copy the original VIDEO_TS in the zip file
							if ($fileinfo['basename'] === 'VIDEO_TS') {
								continue;
							}
							#Copy al files of the VIDEO_TS zip file into the VIDEO_TS destination file
							copy("zip://".$f_temp_name.'#'.$filename, $folder_path.$SID.'/VIDEO_TS/'.$fileinfo['basename']);

					        $fileUploadOK = 1;


						}else if(strpos($filename,'AUDIO_TS')!== false){
							$fileinfo = pathinfo($filename);
							# Don't copy the original AUDIO_TS in the zip file
							if ($fileinfo['basename'] === 'AUDIO_TS') {
								continue;
							}
							#Copy al files of the VIDEO_TS zip file into the AUDIO_TS destination file
					        copy("zip://".$f_temp_name.'#'.$filename, $folder_path.$SID.'/AUDIO_TS/'.$fileinfo['basename']);
					        $fileUploadOK = 1;

						}else{
						  	$fileUploadOK = 0;
						}
					}
					$zip->close();
				}

			}else{

				$move_file = (bool)move_uploaded_file($f_temp_name, $this->file_obj->uploaded_file_path);
				if (!$move_file) {
					$msg = "File $f_temp_name exists. Error on move to: " . $this->file_obj->uploaded_file_path ;
					trigger_error($msg);
				}
			}
		}else{

			$msg = "Error[upload_trigger]: temporal file $f_temp_name not exists. I can't move the file to final location.";
			trigger_error($msg);
			exit($msg);
		}

		$html = '';

		#
		# ERROR : FILE NOT FOUND
		if( !file_exists($this->file_obj->uploaded_file_path) && $fileUploadOK == 0 ) {

			$fileUploadOK = 0;	# ERROR	NUMBER

			$msg = "Error[upload_trigger]: ". label::get_label('error_al_subir_el_archivo') .' '. label::get_label('el_directorio_no_existe') .' [1]';
			trigger_error($msg);


			$html .= "<!-- UPLOAD MSG ERROR -->";
			$html .= "<div class=\"uploadMsg\">";
				$html .= label::get_label('error_al_subir_el_archivo') . "<br>";
				$html .= label::get_label('el_directorio_no_existe') ;
				$html .= "<br><a href=\"javascript:history.go(-1);\">".label::get_label('volver')."</a>";
				if(SHOW_DEBUG) {
					$html .= "<br>" . $this->file_obj->uploaded_file_path;
				}
			$html .= "</div>";


			$time_sec 	= exec_time_unit($start_time,'sec');

			// logger activity : que(action normalized like 'load edit'), log level(default 'logger::info'), tipo(like 'dd120'), datos(array of related info)
				logger::$obj['activity']->log_message(
					'UPLOAD',
					logger::INFO,
					$tipo,
					NULL,
					[
						'msg'				=> 'Error on upload file',
						'tipo'				=> $tipo,
						'parent'			=> $parent,
						'top_id'			=> TOP_ID,
						'top_tipo'			=> TOP_TIPO,
						'component_name'	=> $component_name,
						'quality'			=> $quality,
						'file_name'			=> $nombre_archivo,
						'file_size_mb'		=> $file_size_mb,
						'time_sec'			=> $time_sec,
						'f_error'			=> $f_error
					]
				);
			$response->result 	= 0; # result set to false
			$response->html		= $html;

			return $response;

		#
		# OK : FILE FOUND
		}else{

			$fileUploadOK = 1;	# OK

			$file_data = new stdClass();
				$file_data->name			= $f_name; // like 'My Picture 1.jpg'
				$file_data->tmp_dir			= $folder_path; // like DEDALO_MEDIA_PATH . '/upload/service_upload/tmp'
				$file_data->tmp_name		= $nombre_archivo; // like 'phpv75h2K'
				$file_data->error			= $f_error; // like 0
				$file_data->size			= $f_size; // like 878860 (bytes)
				$file_data->extension		= $f_extension;
				$file_data->chunked			= $chunked;
				$file_data->file_size_mb	= $file_size_mb;
				$file_data->component_name	= $component_name;
				$file_data->SID				= $SID;
				$file_data->quality			= $quality;

				if($chunked){
					$file_data->total_chunks	= $total_chunks;
					$file_data->chunk_index		= $chunk_index;
				}
		}

		// Save component refresh 'valor_list'
			if ($chunked===false) {
				// save on finish download file
				$this->component_obj->Save();
				// get response and log upload
				$response_html = $this->get_response_html($file_data);
			}

		// response
			$response->result		= 1; # result set to true
			$response->file_data	= $file_data;
			$response->html			= $response_html ?? null;


		return $response;
	}//end upload_file



	/**
	* GET_RESPONSE_HTML
	* @return string $html
	*/
	public function get_response_html($file_data) {
		$start_time = start_time();

		// file_data vars
			$file_size_mb	= $file_data->file_size_mb;
			$component_name	= $file_data->component_name;
			$SID			= $file_data->SID;
			$quality		= $file_data->quality;
			$f_error		= $file_data->error;
			$nombre_archivo = $file_data->name;

		// short vars
			$tipo	= $this->component_obj->get_tipo();
			$parent	= $this->component_obj->get_parent();


		$html = '';
		# AJUSTAMOS LOS PERMISOS
			/*
				try{
					$ajust_permissions = chmod($this->file_obj->uploaded_file_path, 0775);
					if (!$ajust_permissions) {
						$msg = "Error[upload_trigger]: Error on set permissions [2]";
						trigger_error($msg);
					}
				} catch (Exception $e) {
					$msg = 'Exception[upload_trigger][SET_PERMISSIONS]: ' . $e->getMessage() . "\n";
					trigger_error($msg);
				}
				*/


			$html .= "<!-- UPLOAD MSG OK -->";
			$html .= " <div class=\"uploadMsg\">";
			$html .= " <div class=\"uploadMsg_ok\">";
			$html .= ' Ok. '. label::get_label('fichero_subido_con_exito');

			if (defined('DEDALO_AV_RECOMPRESS_ALL') && DEDALO_AV_RECOMPRESS_ALL==1) {
				if ($file_size_mb>10) {
					$html .= "<hr> The uploaded file is trans-coding in background now. Please, wait some minutes before play your media file.";
					if(SHOW_DEBUG) {
						$html .= " MB:$file_size_mb";
					}
				}
			}//end if (defined('DEDALO_AV_RECOMPRESS_ALL') && DEDALO_AV_RECOMPRESS_ALL==1) {


				#
				# POSTPROCESSING_FILE : Procesos a activar tras la carga del archivo
				$postprocessing_result = $this->postprocessing_file($component_name, $SID, $quality) ?? '';
				# POSTPROCESSING_FILE NOTIFICATIONS
				if ( strpos( strtolower($postprocessing_result), 'error')!==false || strpos( strtolower($postprocessing_result), 'exception')!==false ) {
					$html .= "<div class=\"warning\">";
					$html .= ' File was uploaded correctly but an ERROR was found in the processing: '. $postprocessing_result;
					$html .= "</div>";
				}

			$html .= "</div>";


			# FILE EXISTS BUT ERROR OCURRED
			if($f_error>0) {
				$html .= "Error {$f_error}: ". ($f_error_text ?? '') . " Notify this error to your administrator<br />";
			}

			$html .= " <a class=\"cerrar_link\" onclick=\"tool_upload.cerrar()\">".label::get_label('cerrar')."</a>";
			$html .= "\n</div>";


			$time_sec = exec_time_unit($start_time,'sec');
			// logger activity : que(action normalized like 'load edit'), log level(default 'logger::info'), tipo(like 'dd120'), datos(array of related info)
				logger::$obj['activity']->log_message(
					'UPLOAD COMPLETE',
					logger::INFO,
					$tipo,
					NULL,
					array(	"msg"				=> "Upload file complete",
							"tipo"				=> $tipo,
							"parent"			=> $parent,
							"top_id"			=> TOP_ID,
							"top_tipo"			=> TOP_TIPO,
							"component_name" 	=> $component_name,
							"quality" 			=> $quality,
							"file_name" 		=> $nombre_archivo,
							"file_size_mb" 		=> $file_size_mb,
							"time_sec" 			=> $time_sec,
							"f_error"			=> $f_error
						)
				);

		return $html;
	}//end get_response_html



	/**
	* JOIN_CHUNKED_FILES_UPLOADED
	* @param object $options
	* @return object response
	*/
	public function join_chunked_files_uploaded(object $options) : object {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed';

		// options variables
			$files_chunked	= $options->files_chunked;
			$file_data		= $options->file_data;
			// $tmp_dir		= $options->tmp_dir;

		// file_path
			$file_path	= $file_data->tmp_dir; //$tmp_dir . '/' . $file_data->resource_type;
			$SID		= $file_data->SID;
			$quality	= $file_data->quality;
			$extension	= strtolower( pathinfo($file_data->name, PATHINFO_EXTENSION) );
		// tmp_joined_file
		// tmp_joined_file : nombre final del archivo
			$joined_filename = $SID . '.' . $extension ;
			// $joined_filename = 'tmp_'.$file_data->name;

		// component_name
			$component_name = $file_data->component_name;

		// set quality
			$this->component_obj->set_quality($quality);
			$folder_path	= $this->component_obj->get_target_dir();
		// check extension
		// main vars : Fix
			switch ($component_name) {
				case 'component_av' :
						$ar_allowed_extensions	= unserialize(DEDALO_AV_EXTENSIONS_SUPPORTED);
						break;
				case 'component_image' :
						$ar_allowed_extensions 	= unserialize(DEDALO_IMAGE_EXTENSIONS_SUPPORTED);
						break;
				case 'component_svg' :
						$ar_allowed_extensions 	= unserialize(DEDALO_SVG_EXTENSIONS_SUPPORTED);
						break;
				case 'component_pdf' :
						$ar_allowed_extensions 	= unserialize(DEDALO_PDF_EXTENSIONS_SUPPORTED);

						break;
			}

		$this->rename_old_files_if_exists( $SID, $folder_path, $ar_allowed_extensions );

		// loop through temp files and grab the content
			foreach ($files_chunked as $chunk_filename) {

				// copy chunk
				$temp_file_path	= "{$file_path}/{$chunk_filename}";
				$chunk			= file_get_contents($temp_file_path);
				if ( empty($chunk) ){
					$response->msg = "Chunks are uploading as empty strings.";
					debug_log(__METHOD__.PHP_EOL.$response->msg, logger::ERROR);
					return $response;
				}

				// add chunk to main file
				file_put_contents("{$file_path}/{$joined_filename}", $chunk, FILE_APPEND | LOCK_EX);

				// delete chunk
				unlink($temp_file_path);
				if ( file_exists($temp_file_path) ) {
					$response->msg = "Your temp files could not be deleted.";
					debug_log(__METHOD__.PHP_EOL.$response->msg, logger::ERROR);
					return $response;
				}
			}

			$this->file_obj->uploaded_file_path	= "{$file_path}/{$joined_filename}";
			$this->file_obj->f_name				= $joined_filename;

		// check extension
			if (!in_array($extension, $ar_allowed_extensions)) {
				$response->msg .= "Error. Invalid file extension ".$extension;
				debug_log(__METHOD__.PHP_EOL.$response->msg, logger::ERROR);
				return $response;
			}

		// set the file values
			$file_data->tmp_name		= $joined_filename; // like 'phpv75h2K'
			$file_data->extension		= $extension;

		// response
		// all is OK response
			$response->result		= 1; # result set to true
			$response->html			= $this->get_response_html($file_data);
			$response->file_data	= $file_data;
			$response->msg			= 'OK. '.label::get_label('file_uploaded_successfully');


		return $response;
	}//end get_system_info




	/**
	* LOAD_IMAGE_FROM_URL
	* @return object
	*/
	public function load_image_from_url($imageurl, $local_store){

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed [load_image_from_url]. Remote resource: ' .PHP_EOL. $imageurl;

		// Get remote file
			try {

				$content = file_get_contents($imageurl);

			} catch (Exception $e) {

			    debug_log(__METHOD__." Error: ".$e->getMessage(), logger::ERROR);
			    $response->msg .= ' Exception: ' . $e->getMessage();
			}

		// Save to local
			if ($content!==false) {

				debug_log(__METHOD__." File downloaded successfully ".to_string(), logger::DEBUG);

				$put_contents = file_put_contents($local_store, $content);
				if($put_contents!==false && file_exists($local_store)){

					debug_log(__METHOD__." File write successfully ".to_string(), logger::DEBUG);

					$response->result = true;
					$response->msg 	  = 'Ok. File download and written successfully [load_image_from_url]';
				}
			}

		return (object)$response;
   }//end load_image_from_url



	/**
	* ERROR_NUMBER_TO_TEXT
	* @param $f_error_number int
	* @return $f_error_text strint
	*/
	public static function error_number_to_text( $f_error_number ) {

		if( $f_error_number==0 ) {
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
	}



	/**
	* RENAME_OLD_FILES_IF_EXISTS
	* @param $SID string
	* @param $folder_path string
	* @param $ar_allowed_extensions array
	*/
	protected function rename_old_files_if_exists( $SID, $folder_path, $ar_allowed_extensions ) {	//$SID, $folder_path, $nombre_archivo, $curent_allowed_extension, $ar_allowed_extensions


		# DELETED FOLDER : Verificamos / creamos el directorio "deleted"
		if(!file_exists($folder_path . "/deleted")) {
			if(!mkdir($folder_path."/deleted", 0777,true)) {
				trigger_error("Error on create dir: $folder_path . Permission denied");
			}
		}

		$dateMovement = date("Y-m-d_Gis"); # like 2011-02-08_182033

		# Recorremos todas las opciones de terminación posibles buscando ficheros a eliminar
		foreach ($ar_allowed_extensions as $current_allowed_extension) {

			$current_possible_file = $folder_path .'/'. $SID .'.'. $current_allowed_extension;
			if(SHOW_DEBUG) {
				//dump($current_possible_file,'current_possible_file');
			}
			if(file_exists($current_possible_file)) {
					//dump($current_possible_file, ' current_possible_file'.to_string());
				$file_to_move_renamed = $folder_path . '/deleted/'. $SID . '_deleted_'. $dateMovement . '.' . $current_allowed_extension ;
				rename($current_possible_file, $file_to_move_renamed);
			}
		}

		if(is_dir($folder_path.'/'.$SID)) {
			$file_to_move_renamed = $folder_path . '/deleted/'. $SID . '_deleted_'. $dateMovement ;
			rename($folder_path.'/'.$SID , $file_to_move_renamed);
		}
	}


	/**
	* VALIDATE_EXTENSION
	* @param string $f_extension like 'mp4'
	* @param array $ar_allowed_extensions
	* @return bool true or string $msg
	*/
	public function validate_extension( $f_extension, $ar_allowed_extensions ) {

		foreach ($ar_allowed_extensions as $current_allowed_extension) {
			if (strtolower($current_allowed_extension) === strtolower($f_extension)) {
				return true;
			}
		}

		# Extension is not in allowed extensions
		$msg  = "<div class=\"uploadMsg\">Error: " .$f_extension. " is an invalid file type !<br/><br/>";
		$msg .= " Allowed file types: ";
		$msg .= implode(',', $ar_allowed_extensions);
		$msg .= " <br/><br/><a href=\"javascript:history.go(-1);\"> < Go Back </a></div>";

		return $msg;
	}



	/**
	* POSTPROCESSING_FILE
	* @param $component_name string (modelo name like component_av)
	* @param $SID string
	* @param $quality string
	*/
	protected function postprocessing_file($component_name, $SID, $quality) {
		$result=null;

		switch ($component_name) {
			case 'component_av' :
					# FFMPEG
					try{

						#
						# EXTENSION
						$file_name 	= pathinfo($this->file_obj->uploaded_file_path, PATHINFO_BASENAME);
						$file_ext 	= pathinfo($this->file_obj->uploaded_file_path, PATHINFO_EXTENSION);
						if (empty($file_ext)) {
							throw new Exception("Error Processing Request. File extension is unknow", 1);
						}
						if(SHOW_DEBUG) {
							#dump($file_ext, ' uploaded_file_path');;
						}

						$AVObj = new AVObj($SID, $quality);

						#
						# NOTE: VAR QUALITY IF THE QUALITY SELECTED WHEN USER LOAD UPLOAD TOOL. BY DEFAULT IS ORIGINAL
						#

						#
						# AUDIO CASE
						if ($quality==='audio') {
							# AUDIO Extensions supported
							$ar_audio_only_ext = array('mp3','aiff','aif','wave','wav');
							if (in_array($file_ext, $ar_audio_only_ext)) {
								# Audio conversion
								$Ffmpeg = new Ffmpeg();
								$Ffmpeg->convert_audio($AVObj, $this->file_obj->uploaded_file_path);
							}else{
								throw new Exception("Error Processing Request. Current audio extension [$file_ext] is not supported (q:$quality)", 1);
							}
						#
						# VIDEO CASE
						}else{

							#
							# DEDALO_AV_RECOMPRESS_ALL
							# When config DEDALO_AV_RECOMPRESS_ALL is set to 1, all video files are re-compressed to 960k/s variable bit rate and keyframe every 75 frames
							if (defined('DEDALO_AV_RECOMPRESS_ALL') && DEDALO_AV_RECOMPRESS_ALL==1) {

								debug_log(__METHOD__." RECOMPRESSING AV PLEASE WAIT.. ".to_string(), logger::DEBUG);

								# If default quality file not exists, generate default quality version now
								# $target_file  = $AVObj->get_local_full_path(); ???????????????????????????????? SURE ???????
								$AVObj_target = new AVObj($SID, DEDALO_AV_QUALITY_DEFAULT);
								$target_file  = $AVObj_target->get_local_full_path();
								if (!file_exists($target_file)) {
									$source_file = $this->file_obj->uploaded_file_path;
									if (!file_exists($source_file)) {
										debug_log(__METHOD__." ERROR: Source file not exists ($source_file) ".to_string(), logger::WARNING);
									}
									/*
									$source_file2= $source_file.'_original.'.$file_ext;
									if( !rename($source_file, $source_file2) ) {
										throw new Exception("Error Processing Request. File $source_file access denied", 1);
									}
									*/

									Ffmpeg::convert_to_dedalo_av( $source_file, $target_file );
									if(SHOW_DEBUG) {
										#dump($command, ' command');
									}
								}//end if (!file_exists($target_file)) {
							}

							#
							# POSTERFRAME
							# Create posterframe of current video if not exists
							$PosterFrameObj = new PosterFrameObj($SID);
							if(Ffmpeg::get_ffmpeg_installed_path() && !$PosterFrameObj->get_file_exists()) {
								$timecode = '00:00:05';
								$Ffmpeg = new Ffmpeg();
								$Ffmpeg->create_posterframe($AVObj, $timecode);
							}

							#
							# CONFORM HEADERS
							# Apply qt-faststart to optimize file headers position
							#$Ffmpeg = new Ffmpeg();
							#$Ffmpeg->conform_header($AVObj);


						}//end if ($quality=='audio') {


						#
						# AUDIO FILES
						# Audio files generate always a audio file
						if ($quality===DEDALO_AV_QUALITY_ORIGINAL) {
							$ar_audio_only_ext = array('mp3','aiff','aif','wave','wav');
							if (in_array($file_ext, $ar_audio_only_ext)) {

								# Audio conversion
								$AVObj_target = new AVObj($SID, 'audio');
								$target_file  = $AVObj_target->get_local_full_path();
								if (!file_exists($target_file)) {
									$source_file = $this->file_obj->uploaded_file_path;
									if (!file_exists($source_file)) {
										debug_log(__METHOD__." ERROR: Source file not exists ($source_file) 2 ".to_string(), logger::WARNING);
									}
									Ffmpeg::convert_to_dedalo_av( $source_file, $target_file );
									debug_log(__METHOD__." Converted source audio file to 'audio' quality ".to_string(), logger::DEBUG);
								}//end if (!file_exists($target_file)) {

							}else{
								#throw new Exception("Error Processing Request. Current audio extension [$file_ext] is not supported (q:$quality) (2)", 1);
							}
						}//end if ($quality==DEDALO_AV_QUALITY_ORIGINAL) {


						#
						# TARGET_FILENAME
						# Save original file name in a component_input_text
						$propiedades 		 = $this->component_obj->get_propiedades();
						$current_section_id  = $this->component_obj->get_parent();
						$target_section_tipo = $this->component_obj->get_section_tipo();
						$file_name 			 = $this->file_obj->f_name;	//pathinfo($this->file_obj->f_name, PATHINFO_BASENAME);

						if (isset($propiedades->target_filename)) {
							$modelo_name_target_filename= RecordObj_dd::get_modelo_name_by_tipo($propiedades->target_filename,true);
							$component_target_filename 	= component_common::get_instance(
																				$modelo_name_target_filename,
																				$propiedades->target_filename,
																				$current_section_id,
																				'edit',
																				DEDALO_DATA_NOLAN,
																				$target_section_tipo
																				);
							$component_target_filename->set_dato( $file_name );
							$component_target_filename->Save();
							debug_log(__METHOD__." Saved original filename: ".to_string($file_name), logger::DEBUG);
						}

					} catch (Exception $e) {
						$msg = 'Exception[upload_trigger][FFMPEG]: ' .  $e->getMessage() . "\n";
						trigger_error($msg);
					}
					break;

			case 'component_image' :
					# IMAGEMAGIK . CONVERTIMOS EL ACHIVO AL FORMATO DE TRABAJO DE DEDALO (default is 'JPG')
					try{

						$this->file_obj->aditional_path = $this->component_obj->get_aditional_path();

						#
						# DEFAULT_IMAGE_FORMAT : If uploaded file is not in Dedalo standar format (jpg), is converted, and original is conserved (like filename.tif)
						$this->file_obj->default_format_file = component_image::build_standar_image_format($this->file_obj->uploaded_file_path);

						#
						# THUMB . Eliminamos el thumb anterior si existiese. Los thumbs se crean automáticamente al solicitarlos (list)
						#$this->file_obj->thumb_file = $this->build_thumb_file($SID);

						#
						# TARGET_FILENAME
						# Save original file name in a component_input_text
						$propiedades 		 = $this->component_obj->get_propiedades();
						$current_section_id  = $this->component_obj->get_parent();
						$target_section_tipo = $this->component_obj->get_section_tipo();
						$file_name 			 = $this->file_obj->f_name;	//pathinfo($this->file_obj->f_name, PATHINFO_BASENAME);

						if (isset($propiedades->target_filename)) {
							$modelo_name_target_filename= RecordObj_dd::get_modelo_name_by_tipo($propiedades->target_filename,true);
							$component_target_filename 	= component_common::get_instance(
																				$modelo_name_target_filename,
																				$propiedades->target_filename,
																				$current_section_id,
																				'edit',
																				DEDALO_DATA_NOLAN,
																				$target_section_tipo
																				);
							$component_target_filename->set_dato( $file_name );
							$component_target_filename->Save();
						}

						# POSTPROCESSING_IMAGE_SCRIPT
						if (defined('POSTPROCESSING_IMAGE_SCRIPT')) {
							sleep(1);
							require( POSTPROCESSING_IMAGE_SCRIPT );
							$result = custom_postprocessing_image($this);
								#dump($result, ' result');
						}

						# Save force update data and create default and thumb qualitys
						$this->component_obj->Save();

					} catch (Exception $e) {
						$msg = 'Exception[upload_trigger][ImageMagick]: ' .  $e->getMessage() . "\n";
						trigger_error($msg);
					}
					break;

			case 'component_pdf' :

					#
					# THUMB : Create pdf_thumb
					$this->component_obj->get_pdf_thumb( $force_create=true );

					#
					# TRANSCRIPTION TO TEXT AUTOMATIC
					$ar_related_component_text_area_tipo = $this->component_obj->get_related_component_text_area_tipo();
						#dump($ar_related_component_text_area_tipo, ' ar_related_component_text_area_tipo ++ '.$this->component_obj->get_tipo().to_string());
					if (!empty($ar_related_component_text_area_tipo)) {

						$related_component_text_area_tipo = reset($ar_related_component_text_area_tipo);
						$target_pdf_path 				  = $this->component_obj->get_pdf_path();

						try {
							$options = new stdClass();
								$options->path_pdf 	 = (string)$target_pdf_path;	# full source pdf file path
								#$options->first_page = (int)$pagina_inicial;		# number of first page. default is 1
							$response = (object)tool_transcription::get_text_from_pdf( $options );
								#debug_log(__METHOD__." tool_transcription response ".to_string($response), logger::DEBUG);

							if( $response->result!=='error' && strlen($response->original)>2  ) {

								$component_text_area = component_common::get_instance('component_text_area',
																					  $related_component_text_area_tipo,
																					  $this->component_obj->get_parent(),
																					  'edit',
																					  DEDALO_DATA_LANG,
																					  $this->component_obj->get_section_tipo());
								$component_text_area->set_dato($response->result); // Text with page numbers
								$component_text_area->Save();
							}

						} catch (Exception $e) {
						    debug_log(__METHOD__." Caught exception:  ".$e->getMessage(), logger::ERROR);
						}

					}//end if (!empty($related_component_text_area_tipo)) {

					break;
		}

		return $result;
	}#end postprocessing_file



}
