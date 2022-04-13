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
	* PROCESS_UPLOADED_FILE
	* @return object $response
	*/
	public static function process_uploaded_file($options) {
		$start_time=microtime(1);

		// response
			$response = new stdClass();
				$response->result 	= false;
				$response->msg 		= 'Error. Request failed. '.__METHOD__.' ';

		// options
			$file_data		= $options->file_data;
			$tipo			= $options->tipo ?? null;
			$section_tipo	= $options->section_tipo;
			$section_id		= $options->section_id ?? null;
			$caller_type	= $options->caller_type;
			$quality		= $options->quality ?? null;
			$target_dir		= $options->target_dir ?? null;

		// manage uploaded file
			switch ($caller_type) {

				case ('component'):

					// component media
						$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
						$component	= component_common::get_instance(
							$model,
							$tipo,
							$section_id,
							'edit',
							DEDALO_DATA_LANG,
							$section_tipo
						);

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
							$response->msg .= 'Errors occurred on processing file: '.$process_file->msg;
							return $response;
						}

					// preview url. Usually the thumb image or posterframe
						$default_quality	= $component->get_default_quality();
						$preview_url		= $component->get_preview_url($default_quality);

					// response ok
						$response->result		= true;
						$response->msg			= 'OK. Request done successfully';
						$response->preview_url	= $preview_url;

					break;

				default:
					debug_log(__METHOD__." Error on process uploaded file. No target or manager received. options: ".to_string($options), logger::ERROR);
					$response->msg .= "Error on get/move to target_dir. ".to_string($target_dir->value);
					break;
			}//end switch (true)


		// debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				$response->debug = $debug;
			}


		return $response;
	}//end process_uploaded_file



}//end class tool_upload
