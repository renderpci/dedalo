<?php
require_once( dirname(dirname(dirname(dirname(__FILE__)))) .'/config/config4.php');
include('class.migrate_v40_to_v41.php');

if(login::is_logged()!==true) return;
//die("<span class='error'> Auth error: please login </span>");

ignore_user_abort(true);


#
# LINKS
echo "<a href=\"?mode=migrate_tesaurus_complete\">migrate_tesaurus_complete</a>";
echo "<hr>";


# set vars
	$vars = array('mode',);
		foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



	
# CALL FUNCTION
if ( function_exists($mode) ) {
	call_user_func($mode);
}



/**
* MIGRATE_TS_TABLE
*/
function migrate_ts_table( $source_table, $target_table ) {
	
	

}#end migrate_ts_table
	


?>