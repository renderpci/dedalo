<?php
# SESSION LIFETIME
# Set session_duration_hours before load 'config' file (override default value)
$session_duration_hours = 18;

require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.AVObj.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.PosterFrameObj.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.AVPlayer.php');


if(login::is_logged()!==true) {
	$string_error = "Auth error: please login";
	print Error::wrap_error($string_error);
	die();
}



	# CONTROLLER TOOL

	$id 					= $this->component_obj->get_id();
	$tipo 					= $this->component_obj->get_tipo();
	$parent 				= $this->component_obj->get_parent();
	$lang 					= $this->component_obj->get_lang();
	$label 					= $this->component_obj->get_label();
	$permissions			= common::get_permissions($tipo);

	$modo 					= $this->get_modo();
	$modelo_name 			= RecordObj_ts::get_modelo_name_by_tipo($tipo);

	$ar_m 		= explode('_', $modelo_name);
	$media_type	= $ar_m[1];	# like av from component_av

	$file_name	= $modo;

	switch($modo) {	
		
		case 'button':
					# MEDIA TYPE VERIFY
					switch ($media_type) {
						case 'av' : 
								$SID = $this->component_obj->get_video_id();
								break;
						case 'image' : 
								$SID = $this->component_obj->get_image_id();
								break;
						case 'pdf' : 
								$SID = $this->component_obj->get_pdf_id();
								break;
					}							
					break;

		case 'page':
					
					$vars 	= array('quality');
					if(is_array($vars)) foreach($vars as $name) {
						$$name = common::setVar($name);	
					}
					
					

					# MEDIA TYPE VERIFY 
					switch ($media_type) {

						# MEDIA TYPE: AV
						case 'av':
								if(!$quality)
									throw new Exception("Error: quality ($quality) not defined", 1);
							
								$SID 		= $this->component_obj->get_video_id();
								#$extension 	= DEDALO_AV_EXTENSION ;	
								$valid_extensions_json = json_encode(unserialize(DEDALO_AV_EXTENSIONS_SUPPORTED));
								
								# QUALITY CONFIG VERIFY 
								if ( !in_array($quality, unserialize(DEDALO_AV_AR_QUALITY)) ) {
									throw new Exception("Error: quality ($quality) not valid", 1);				
								}
								# Final target folder
								$target_folder_path	= DEDALO_MEDIA_BASE_PATH . DEDALO_AV_FOLDER .'/'. $quality . $this->component_obj->aditional_path ;
									#dump($target_folder_path,'$target_folder_path');
								
								break;

						# MEDIA TYPE: IMAGE
						case 'image':
								if(!$quality)
									throw new Exception("Error: quality ($quality) not defined", 1);

								$SID 		= $this->component_obj->get_image_id();
								#$extension 	= DEDALO_IMAGE_EXTENSION ;
								$valid_extensions_json = json_encode(unserialize(DEDALO_IMAGE_EXTENSIONS_SUPPORTED));
								
								# QUALITY CONFIG VERIFY 
								if ( !in_array($quality, unserialize(DEDALO_IMAGE_AR_QUALITY)) ) {
									throw new Exception("Error: quality ($quality) not valid", 1);				
								}
								# Final target folder
								$target_folder_path	=  DEDALO_MEDIA_BASE_PATH . DEDALO_IMAGE_FOLDER .'/'. $quality . $this->component_obj->aditional_path ;
									
								break;

						# MEDIA TYPE: PDF
						case 'pdf':

								$SID 		= $this->component_obj->get_pdf_id();
								#$extension 	= DEDALO_IMAGE_EXTENSION ;
								$valid_extensions_json = json_encode(unserialize(DEDALO_PDF_EXTENSIONS_SUPPORTED));	
								
								# Final target folder
								$target_folder_path	= DEDALO_MEDIA_BASE_PATH . DEDALO_PDF_FOLDER ; //.'/'. $quality . $this->component_obj->aditional_path ;

								break;

						# MEDIA TYPE: UNKNOW
						default:
								throw new Exception("Error: media type ($media_type) not valid", 1);
								break;
					}#end switch ($media_type)
					
					#
					# COMMON CODE
					# TARGET FOLDER VERIFY (EXISTS AND PERMISSIONS)
					try{				 	
						# folder exists										
						if( !is_dir($target_folder_path) ) {
						$create_dir 	= mkdir($target_folder_path, 0777,true);
						if(!$create_dir) throw new Exception(" Error on read or create directory \"$quality\". Permission denied $target_folder_path (1)");
						}
						
						# folder set permissions
						$wantedPerms 	= 0777;
						$actualPerms 	= fileperms($target_folder_path);
						if($actualPerms < $wantedPerms) {
							$ch_mod = chmod($target_folder_path, $wantedPerms);
							if(!$ch_mod) throw new Exception(" Error on set permissions of directory \"$quality\".");
						}				
					} catch (Exception $e) {
						$msg = '<span class="error">'.$e->getMessage().'</span>';
						echo Error::wrap_error($msg);
					}
					
					
					# CURRENT PHP MAX SIZE UPLOAD (PHP INI)
					$upload_max_filesize 	= intval(ini_get('upload_max_filesize')) ; if($upload_max_filesize<1) $upload_max_filesize = 2000 ;
					$megas 					= $upload_max_filesize ;		
					$maxSize 				= intval($megas * 1048576);

					break; #end page
		
	}#end switch modo



	#dump($target_folder_path,'$target_folder_path');
	
	

# INCLUDE FILE HTML
$page_html	= DEDALO_LIB_BASE_PATH . '/component_tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
include($page_html);
?>