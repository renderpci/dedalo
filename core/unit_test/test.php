<?php
// dedalo config include
	$config_path = dirname(dirname(dirname(__FILE__))).'/config/config.php';
	if( !include($config_path) ) {
		die("Dédalo is misconfigured. Please review your app config");
	}


// not logged
	if (login::is_logged()!==true) {
		exit("Error: Login please");
	}//end if (login::is_logged()!==true)



require dirname(dirname(__FILE__)).'/base/upgrade/class.activity_v5_to_v6.php';


echo "hello clean_component_dato";

echo "<hr>Stopped!";

	// activity_v5_to_v6::clean_component_dato();

sleep(1);

echo "<br>Bye";
