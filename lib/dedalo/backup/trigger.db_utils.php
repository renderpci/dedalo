<?php
$start_time=microtime(1);
set_time_limit(300);
include( dirname(dirname(__FILE__)).'/config/config4.php');
include(DEDALO_LIB_BASE_PATH.'/backup/class.backup.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();



/**
* EXPORT_STR
* Export db (export_structure)
*/
function export_str($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result	= false;
		$response->msg		= '';

	// rsync trigger code HEAD from master git
		// function update_head_code() {

		// 	$source		= DEDALO_CODE_SERVER_GIT_DIR;
		// 	$target		= DEDALO_CODE_FILES_DIR .'/dedalo5_code.zip';
		// 	$command	= "cd $source; git archive --format=zip --prefix=dedalo5_code/ HEAD > $target "; // @see https://git-scm.com/docs/git-archive

		// 	debug_log(__METHOD__." Updated Dédalo code with command: ".to_string($command), logger::DEBUG);

		// 	$output = shell_exec($command);

		// 	return $output;
		// }
		// try{

		// 	$output = update_head_code();

		// 	# Append msg
		// 	$response->msg .= $output;
		// 	debug_log(__METHOD__." update_head_code output OK: $response->msg ".to_string(), logger::DEBUG);

		// } catch (Exception $e) {

		// 	# Append msg
		// 	$response->msg .= $e->getMessage();
		// 	debug_log(__METHOD__." update_head_code output ERROR: $response->msg ".to_string(), logger::ERROR);
		// }

	// dump all historic data first
		$db_name				= 'dedalo4_development_str_'.date("Y-m-d_Hi").'.custom';
		$res_export_structure	= backup::export_structure($db_name, $exclude_tables=false);	// Full backup
		if ($res_export_structure->result===false) {
			$response->result	= false;
			$response->msg		= $res_export_structure->msg;
			return $response;
		}else{
			# Append msg
			$response->msg .= $res_export_structure->msg;
		}

	// dump official structure version 'dedalo4_development_str.custom' (partial backup)
		$res_export_structure2 = (object)backup::export_structure(null, $exclude_tables=true);	 // Partial backup
		if ($res_export_structure2->result===false) {
			$response->result	= false;
			$response->msg		= $res_export_structure2->msg;
			return $response;
		}else{
			# Append msg
			$response->msg .= $res_export_structure2->msg;
		}

	// debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time = exec_time_unit($start_time,'secs').' secs';
			$response->debug = $debug;
		}


	return (object)$response;
}//end export_str



/**
* BUILD_VERSION_FROM_GIT_MASTER
* Exec a git command to obtain a zip version of last master branch code and
* save it to /code directory as 'dedalo5_code.zip'
* @return object $response
*/
function build_version_from_git_master($json_data) : object {
	global $start_time;

	$response = new stdClass();
		$response->result	= false;
		$response->msg		= '';

	// options
		$version = $json_data->version;
		if (empty($version)) {
			$response->msg = 'Version is mandatory!';
			return $response;
		}

	// rsync trigger code HEAD from master git
		function update_head_code(object $response, int $version) : string {

			// temp
			define('DEDALO_CODE_SERVER_GIT_DIR', 'DEDALO_CODE_SERVER_GIT_DIR');
			define('DEDALO_CODE_FILES_DIR', 'DEDALO_CODE_FILES_DIR');
			define('DEDALO_6_CODE_SERVER_GIT_DIR', 'DEDALO_6_CODE_SERVER_GIT_DIR');
			define('DEDALO_6_CODE_FILES_DIR', 'DEDALO_6_CODE_FILES_DIR');

			if ($version==6) {
				// source
				$source		= DEDALO_6_CODE_SERVER_GIT_DIR;
				// target
				$target		= DEDALO_6_CODE_FILES_DIR .'/dedalo'.$version.'_code.zip';
				// command
				$command	= "cd $source; git archive --verbose --format=zip --prefix=dedalo{$version}_code/ v6_developer > $target ";

			}else{
				// source
				$source		= DEDALO_CODE_SERVER_GIT_DIR;
				// target
				$target		= DEDALO_CODE_FILES_DIR .'/dedalo'.$version.'_code.zip';
				// command
				// $command	= "cd $source; git archive --format=zip --prefix=dedalo5_code/ HEAD > $target 2>&1"; // @see https://git-scm.com/docs/git-archive
				$command	= "cd $source; git archive --verbose --format=zip --prefix=dedalo{$version}_code/ HEAD > $target ";
			}

			$msg = "Called Dédalo update_head_code with command: " .PHP_EOL. to_string($command);
			debug_log(__METHOD__." $msg ".to_string(), logger::DEBUG);
			$response->msg .= PHP_EOL . $msg;

			// $output_array = shell_exec($command); // 2>&1

			$output_array	= null;
			$retval			= null;
			exec($command, $output_array, $retval);

			$result = 'Return:'.PHP_EOL.'status: '. ($retval ?? null). PHP_EOL . 'output: ' . json_encode($output_array, JSON_PRETTY_PRINT);

			return $result;
		}

	// try exec
		try{

			$output = update_head_code($response, $version);

			# Append msg
			$msg = PHP_EOL ."update_head_code shell_exec output: ". PHP_EOL. to_string($output);
			$response->msg .= $msg;
			debug_log(__METHOD__." update_head_code output OK: $msg ".to_string(), logger::DEBUG);

			$response->result = true;

		} catch (Exception $e) {

			# Append msg
			$response->msg .= $e->getMessage();
			debug_log(__METHOD__." update_head_code output ERROR: $response->msg ".to_string(), logger::ERROR);
		}

	// debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'secs')." secs";

			$response->debug = $debug;
		}


	return (object)$response;
}//end build_version_from_git_master



/**
* IMPORT_STR
* Import db (import_structure)
*//* NO USAR . USAR LA DE TOOL ADMINISTRATION
function import_str($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$html ='';

	# Before import, EXPORT ;-)
	$db_name = 'dedalo4_development_str_'.date("Y-m-d_Hi").'.custom';
	$exp 	 = backup::export_structure($db_name, $exclude_tables=false);	// Full backup
	$html .= $exp->msg;
	$html .= '<br>';
	if ($exp->code!=0) {
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.'] Sorry. Next step import_structure stopped ('.$exp->code.')';
		return $response;
	}

	$res = backup::import_structure();

	# Delete session config (force to recalculate)
	unset($_SESSION['dedalo4']['config']);

	# Delete session permissions table (force to recalculate)
	unset($_SESSION['dedalo4']['auth']['permissions_table']);

	$html .= $res;
	#echo wrap_html($html, false);

	$response->result 	= $html;
	$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
			$debug->exp 		= $exp;

		$response->debug = $debug;
	}

	return (object)$response;
}//end import_str */



# BACKUP DB
/* REMOVED
function backup() {

	$res = backup::init_backup_secuence($user_id_matrix='0', $username='system');
	echo $res;
}//end backup */



# LOAD_STR_DATA
/* REMOVED !
function load_str_data() {

	$res = (array)backup::load_dedalo_str_tables_data();

	$html = implode('<hr>', $res);
	echo wrap_pre($html);
}//end load_str_data */


