<?php
#
# POSTPROCESSING_IMAGE_SCRIPT
# Path defined in config
#
require_once( dirname(dirname(dirname(dirname(__FILE__)))).'/config/config4.php');
if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

# custom_postprocessing_image();
function custom_postprocessing_image( $tool_upload_obj=null ) {
#return null;
	$start_script_time=microtime(true);

	# Disable logging activity and time machine # !IMPORTANT
	logger_backend_activity::$enable_log = false;
	RecordObj_time_machine::$save_time_machine_version = false;


	# Test obj
	/*
	$file_obj = new stdClass();
		$file_obj->f_name 				= '45001.tif';
		$file_obj->uploaded_file_path 	= '/Users/paco/Trabajos/Dedalo/site_dedalo_plataforma_40/media/media_mupreva/image/1.5MB/0/0/1-1.tif';
		$file_obj->default_format_file 	= '/Users/paco/Trabajos/Dedalo/site_dedalo_plataforma_40/media/media_mupreva/image/1.5MB/0/0/1-1.jpg';
		$file_obj->thumb_file 			= '/Users/paco/Trabajos/Dedalo/site_dedalo_plataforma_40/media/media_mupreva/image/thumb/0/0/1-1.jpg';
		$file_obj->aditional_path   	= '/0/0';
		*/
		$file_obj = $tool_upload_obj->get_file_obj();

		if (!isset($file_obj) || !is_object($file_obj)) {
			throw new Exception("Error Processing Request. POSTPROCESSING_IMAGE_SCRIPT can't continue. file_obj is not defined ", 1);	
		}
		#dump($file_obj, ' file_obj');
	

		# NEW_ADITIONAL_PATH . Calculated from file name
		$new_aditional_path = tool_import_images::numero_to_local_path($file_obj->f_name, 2);

		# TARGET_SAFE_NAME
		$target_safe_name 	= pathinfo($file_obj->f_name, PATHINFO_FILENAME);	# Ojo! Sin extensión. Como '45001' ó '45001-2'
		#dump($target_safe_name, ' target_safe_name');
		error_log("TARGET_SAFE_NAME 1 : ".$target_safe_name);


		#
		# TARGET_SAFE_NAME
		/*
		Regex para 40001-2
			[0] => 40001-2
    		[1] => 40001
    		[2] => 2
		*/
		$regex = "/(\d*)[-|_]?(\d*)\z/";
		preg_match($regex, $target_safe_name, $ar_value);
			#dump($ar_value,'value '.$file_name);

		# FORMAT TEST : Verify all preg_match is ok
		for ($i=0; $i < 3; $i++) {

			if(empty($ar_value[$i])) {

				switch ($i) {
					case 0:
						$msg = "<span class=\"error\"> ERROR: ".label::get_label('formato_incorrecto')." [$i] - ".label::get_label('nombre_fichero')." ($target_safe_name)</span>";
						trigger_error($msg);
						break;
					case 1:
						$msg = "<span class=\"error\"> ERROR: ".label::get_label('formato_incorrecto')." [$i] - ".label::get_label('numero_inventario')." ($target_safe_name)</span>";
						trigger_error($msg);
						break;
					case 2:
						$ar_value[2] = 1;  # numero_recurso es opcional. Si no existe, lo rellenamos con valor 1 como 45001 => 45001-1
						break;					
				}
			}#end if(empty($ar_value[$i]))
		}#end for ($i=0; $i < 5; $i++)
		if ((int)$ar_value[1]<1 || (int)$ar_value[2]<1) {
			$msg="ERROR: ".label::get_label('formato_incorrecto')." - ".label::get_label('nombre_fichero')." ($target_safe_name)";
			trigger_error($msg);
			#throw new Exception($msg, 1);			
			return $msg;
		}
		$target_safe_name 	= $ar_value[1].'-'.$ar_value[2];
		error_log("TARGET_SAFE_NAME 2 : ".$target_safe_name);




		
		#
		# MOVE FILES ###########################################################################################################################
		#

		#
		# MOVE FILE UPLOADED (ORIGINAL)
		if (file_exists($file_obj->uploaded_file_path)) {

			$path_parts = pathinfo($file_obj->uploaded_file_path);
				#dump($path_parts, ' path_parts');		

			$source = $file_obj->uploaded_file_path;
			$target = str_replace((string)$file_obj->aditional_path,'',$path_parts['dirname']) . $new_aditional_path .'/'. $target_safe_name .'.'. strtolower( pathinfo($file_obj->f_name, PATHINFO_EXTENSION) );	#$file_obj->f_name ;

			if (!file_exists(dirname($target))) {
				mkdir(dirname($target), 0777, true);
			}			
			
			if(SHOW_DEBUG) {
				#dump($source, ' source'); dump($target, ' target');
				error_log("Moving file (original) $source to $target");
			}	
			
			if (!rename($source,$target)) {
				throw new Exception("Error Processing Request. Move file error [1]", 1);
			}		
		}

		#
		# MOVE FILE DEFAULT_FORMAT_FILE (CONVERTED IF NOT JPG)
		if (file_exists($file_obj->default_format_file) && $file_obj->default_format_file!=$file_obj->uploaded_file_path) {

			$path_parts = pathinfo($file_obj->default_format_file);
				#dump($path_parts, ' path_parts');		

			$source = $file_obj->default_format_file;
			$target = str_replace((string)$file_obj->aditional_path,'',$path_parts['dirname']) . $new_aditional_path .'/'. $target_safe_name .'.'. DEDALO_IMAGE_EXTENSION ;

			if (!file_exists(dirname($target))) {
				mkdir(dirname($target), 0777, true);
			}
			
			if(SHOW_DEBUG) {
				#dump($source, ' source'); dump($target, ' target');
				error_log("Moving file (default format) $source to $target");
			}	
			
			if (!rename($source,$target)) {
				throw new Exception("Error Processing Request. Move file error [2]", 1);
			}
		}

		#
		# MOVE THUMB_FILE (AUTOMATIC ON SAVE COMPONENT)
		/*
		if (file_exists($file_obj->thumb_file)) {

			$path_parts = pathinfo($file_obj->thumb_file);
				#dump($path_parts, ' path_parts');		

			$source = $file_obj->thumb_file;
			$target = str_replace((string)$file_obj->aditional_path,'',$path_parts['dirname']) . $new_aditional_path .'/'. $target_safe_name ;

			if (!file_exists(dirname($target))) {
				mkdir(dirname($target), 0777, true);
			}
			
			if(SHOW_DEBUG) {
				#dump($source, ' source'); dump($target, ' target');
				error_log("Moving file $source to $target");
			}	
			
			if (!rename($source,$target)) {
				throw new Exception("Error Processing Request. Move file error [3]", 1);
			}
		}
		*/

		#
		# UPDATE COMPONENTS ###########################################################################################################################
		#


	# Test obj
	/*
	$component_obj = new stdClass();
		$component_obj->tipo 	='rsc29';
		$component_obj->parent  ='45004';
		*/	
		$component_obj = $tool_upload_obj->get_component_obj();

		if (!isset($component_obj) || !is_object($component_obj)) {
			throw new Exception("Error Processing Request. POSTPROCESSING_IMAGE_SCRIPT can't continue. component_obj is not defined ", 1);
		}
		#dump($component_obj, ' this->component_obj');

		# Propiedades
		$RecordObj_dd 	= new RecordObj_dd($component_obj->get_tipo());
		$propiedades 	= $RecordObj_dd->get_propiedades();
		$propiedades 	= json_decode($propiedades);
			#dump($propiedades, ' propiedades');
		
		#
		# UPDATE COMPONENT ADITIONAL PATH
		if (isset($propiedades->aditional_path)) {
			$tipo 		 = $propiedades->aditional_path;
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo( $tipo );
			$component 	 = component_common::get_instance($modelo_name, $tipo, (int)$component_obj->get_parent(), 'edit', DEDALO_DATA_NOLAN);			

			$dato 		 = (string)$new_aditional_path;
			$component->set_dato($dato);
			$component->Save();

			if(SHOW_DEBUG) {
				#dump($component->get_dato(), ' component');
				error_log("Updating component $tipo with dato: $dato");
			}		
		}

		#
		# UPDATE COMPONENT IMAGE_ID (name)
		if (isset($propiedades->image_id)) {
			$tipo 		 = $propiedades->image_id;
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo( $tipo );
			$component 	 = component_common::get_instance($modelo_name, $tipo, (int)$component_obj->get_parent(), 'edit', DEDALO_DATA_NOLAN);
				
			$dato 	 	= (string)$target_safe_name;
			$component->set_dato($dato);
			$component->Save();
			
			if(SHOW_DEBUG) {
				#dump($component->get_dato(), ' component');
				error_log("Updating component $tipo with dato: $dato");
			}
		}

		#
		# UPDATE MAIN COMPONENT image (force update valor_list)
		#$component_obj->Save();
		/*
		$tipo 		 = $component_obj->get_tipo();
		$modelo_name = RecordObj_dd::get_modelo_name_by_tipo( $tipo );
		$component   = component_common::get_instance($modelo_name, $tipo, (int)$component_obj->get_parent(), 'edit', DEDALO_DATA_NOLAN);
		$dato = $component->get_dato();
		$component->set_dato($dato);
		$component_obj->Save();
		*/
		if(SHOW_DEBUG) {
			#dump($component->get_dato(), ' component');
			error_log("Updating main component $tipo");
		}



	# Enable logging activity and time machine # !IMPORTANT
	logger_backend_activity::$enable_log = true;
	RecordObj_time_machine::$save_time_machine_version = true;


	if(SHOW_DEBUG) {
		error_log('Time to exec: '. round( microtime(TRUE) - $start_script_time ,4) );
	}

}#end function custom_postprocessing_file( $tool_upload_obj )
?>