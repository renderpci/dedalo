<?php
$TOP_TIPO=false;
require_once( dirname(dirname(dirname(dirname(__FILE__)))).'/config/config4.php');
require_once( dirname(__FILE__).'/class.filemaker_sync.php');



# set vars
	$vars = array('mode','data'); // ?mode=update_filemaker&data={"database":"personas","table":"personas","layout":"Vista","id":"7","auth_code":"364rkls9kAf97qP"}
		foreach($vars as $name) $$name = common::setVar($name);

# mode / data verify
	if(empty($mode)) exit("<span class='error'>Error. Sorry wrong mode</span>");
	if(empty($data)) exit("<span class='error'>Error. Sorry empty data</span>");


# data (is string) convert to php object (decoding json)
	$data = json_decode($data); # is string json encoded object
	if (!$data) {
		exit("<span class='error'>Error. Sorry bad data format</span>");
	}
	#dump( $data , ' data');die();
	

# Function call
	if (function_exists($mode)) {
		return $mode( (object)$data );
	}else{
		die("Sorry. Error on call. Wrong trigger method");
	}

	

set_time_limit ( 3200000 );


/**
* UPDATE_DEDALO
* @param $data
*/
function update_dedalo( $data ) {
	
	# VERIFY VARS
		$vars = ['database','table','layout','id','type','auth_code','source_ip'];
		foreach ($vars as $name) {
			if (!property_exists($data, $name) || empty($data->$name)) {
				exit("Sorry. $name is mandatory (update_dedalo)");
			}
		}

	# SECURITY (auth_code / source ip)
		$filemaker_sync = new filemaker_sync();
		$auth_check 	= $filemaker_sync->auth_check( $data );
		if (!$auth_check->result) {
			exit($auth_check->msg);
		}

	# SYNC
		switch ($data->type) {
			case 'ts':
				$response = $filemaker_sync->update_dedalo_ts($data);
				break;
			case 'section':
				$response = $filemaker_sync->update_dedalo_section($data);
				break;
			case 'all':
				#$response = $filemaker_sync->update_dedalo_all_sections($data);
				$data->id  = 'all'; // Force calculate all
				$response = $filemaker_sync->update_dedalo_section($data);
				if(SHOW_DEBUG) {
					#dump($data, ' data');;
				}
				break;			
			default:
				dump($data->type, ' data->type');
				exit("Not defined ...");
				break;
		}
	
	echo $response->msg;
	#echo json_encode($response);
}#end update_dedalo



/**
* IMPORT_ALL
* Generate a html list of links to update paginates of 1000 records
* @return 
*/
function import_all( $data ) {

	# VERIFY VARS
		$vars = ['database','table','layout'];
		foreach ($vars as $name) {
			if (!property_exists($data, $name) || empty($data->$name)) {
				exit("Sorry. $name is mandatory (import_all)");
			}
		}
		#dump($data, ' data');die();

	if (!isset($data->offset)) {
		$data->offset = 0;
	}
	if (!isset($data->max)) {
		$data->max = 10;
	}
	if (!isset($data->set_mode)) {
		$data->set_mode = 'pages';
	}

	$filemaker_sync = new filemaker_sync();
	$response 	= $filemaker_sync->get_filemaker_set( $data, $data->offset, $data->max, $data->set_mode );
		#dump($response, ' response');

	echo to_string($response);
}#end import_all



?>