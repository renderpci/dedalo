<?php
// includes config and set common php directives (session_duration_hours, time_limit)
require_once( dirname(__FILE__) .'/tool_includes_common.php');
// media
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.AVObj.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.PosterFrameObj.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.Ffmpeg.php');


// set vars
	$vars = array('mode','SID','quality','tipo','parent','section_tipo');
		foreach($vars as $name) $$name = common::setVar($name);


// mode check
	if(empty($mode))  {
		$response = new stdClass();
			$response->result	= false;
			$response->html		= "<span class='error'> Trigger: Error Need mode..</span>";
		echo json_encode($response);
		exit();
	}



// upload file generic
	if( $mode==='upload_file' ) {

		$response = new stdClass();
			$response->result	= false;
			$response->html		= 'Error. ';

		// check vars
			if(empty($SID)) {
				$response->html	= 'Error SID not defined (2)';
				echo json_encode($response);
				exit();
			}
			if(empty($quality)) {
				$response->html	= 'Error quality not defined (2)';
				echo json_encode($response);
				exit();
			}
			if(empty($tipo)) {
				$response->html	= 'Error tipo not defined (2)';
				echo json_encode($response);
				exit();
			}
			if(empty($parent)) {
				$response->html	= 'Error parent not defined (2)';
				echo json_encode($response);
				exit();
			}
			if(empty($section_tipo)) {
				$response->html	= 'Error section_tipo not defined (2)';
				echo json_encode($response);
				exit();
			}

		// Write session to unlock session file
			session_write_close();
			debug_log(__METHOD__." Uploading file ($SID) - Session is write and closed ".to_string(), logger::DEBUG);

		// component
			$component_name	= RecordObj_dd::get_modelo_name_by_tipo($tipo, true);
			$component_obj	= component_common::get_instance(
				$component_name,
				$tipo,
				$parent,
				'edit',
				DEDALO_DATA_LANG,
				$section_tipo
			);

		// upload_file response
			$tool_upload	= new tool_upload($component_obj);
			$response		= $tool_upload->upload_file($quality);

		// Save component to force to update component 'valor_list'
			// $component_obj->Save(); // (!) already saved by upload_file method


		echo json_encode($response);
		exit();
	}//end upload_file




die("Sorry. Mode ($mode) not supported");
