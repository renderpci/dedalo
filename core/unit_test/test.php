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


$run = $_GET['run'] ?? false;
if ($run==='clean_component_dato') {
	$result = activity_v5_to_v6::clean_component_dato();
}


?>
<!DOCTYPE html>
<html>
<head>
	<title></title>
</head>
<body>
	<a href="?run=clean_component_dato">clean_component_dato</a>

	<div>
	<?php
		if (isset($result)) {
			echo "<h2>Result</h2>";
			$a = print_r($result, true);
			echo "<pre>$a</pre>";
		}
	?>
	</div>
</body>
</html>

