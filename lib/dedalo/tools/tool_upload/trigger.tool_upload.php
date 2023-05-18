<?php
// includes config and set common php directives (session_duration_hours, time_limit)
require_once( dirname(__FILE__) .'/tool_includes_common.php');
// media
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.AVObj.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.PosterFrameObj.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.Ffmpeg.php');


// set vars
	$vars = array('mode','SID','quality','tipo','parent','section_tipo','chunked');
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

		// chunked boolean
			$chunked = json_decode($chunked);

		// options
			$options = new stdClass();
				$options->quality = $quality;
				$options->chunked = $chunked;
				if($chunked===true){
					$options->file_name		= $_POST['file_name'];
					$options->start			= $_POST['start'];
					$options->end			= $_POST['end'];
					$options->chunk_index	= $_POST['chunk_index'];
					$options->total_chunks	= $_POST['total_chunks'];
				}

		// Write session to unlock session file
			session_write_close();
			debug_log(__METHOD__
				." Uploading file ($SID) - Session is write and closed "
				, logger::DEBUG
			);

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
			$response		= $tool_upload->upload_file($options);


		echo json_encode($response);
		exit();
	}//end upload_file



// join_chunked_files
	if( $mode==='join_chunked_files' ) {

		$vars_string	= file_get_contents('php://input');
		$input_vars		= json_decode($vars_string);

		// vars
			$tipo			= $input_vars->tipo;
			$parent			= $input_vars->parent;
			$section_tipo	= $input_vars->section_tipo;
			$file_data		= $input_vars->file_data;
			$files_chunked	= $input_vars->files_chunked;

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

		$options = new stdClass();
			$options->file_data		= $file_data;
			$options->files_chunked	= $files_chunked;

		$tool_upload	= new tool_upload($component_obj);
		$response		= $tool_upload->join_chunked_files_uploaded($options);

		echo json_encode($response);
		exit();
	}//end //end upload_file



die("Sorry. Mode ($mode) not supported");
