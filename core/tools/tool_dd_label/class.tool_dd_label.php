<?php
/*
* CLASS TOOL_DD_LABEL
*
*
*/
class tool_dd_label { // extends tool_common



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
		// $this->source_component->set_modo('tool_dd_label');
		// #$this->source_component->set_variant( tool_dd_label::$source_variant );
		// 	#dump($component_obj,'component_obj');

		// $this->section_tipo = $component_obj->get_section_tipo();
	}//end __construct



	/**
	* GET_SYSTEM_INFO
	* @return
	*/
	public static function get_system_info() {

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

		$system_info = new stdClass();
			$system_info->max_size_bytes 		= file_upload_max_size();
			$system_info->sys_get_temp_dir 		= sys_get_temp_dir();
			$system_info->upload_tmp_dir 		= $upload_tmp_dir;
			$system_info->upload_tmp_perms 		= fileperms($upload_tmp_dir);
			$system_info->session_cache_expire  = (int)ini_get('session.cache_expire');



		return $system_info;
	}//end get_system_info



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




}//end class
