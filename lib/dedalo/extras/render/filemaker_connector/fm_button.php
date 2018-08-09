<?php
/**
* REQUEST (GET FROM FILEMAKER)
* @param string database
* @param string table
* @param string layout
* @param string id
*/
# Sanitize request
$request = [];
foreach ((array)$_GET as $key => $value) {
	$request[$key] = safe_xss($value);
}

$ar_vars_mandatory = array('database','table','layout','id');
foreach ($ar_vars_mandatory as $current_var) {
	if (empty($request[$current_var])) {
		exit("Error. $current_var is mandatory");
	}
	# Safe url encode all params
	$request[$current_var] = urlencode( $request[$current_var] );
}

# OPTIONS JSON
$options = (object)$request;
$options = json_encode($options);
if (!$options) {
	exit("Error. Wrong data received");
}
#var_dump($options);
?>
<!DOCTYPE html>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<head>
<link rel="stylesheet" href="css/fm_button.css?d=18" type="text/css" media="screen">
<script src="/dedalo/lib/jquery/jquery-2.1.3.min.js" type="text/javascript" charset="utf-8"></script>
<script src="js/fm_button.js" type="text/javascript" charset="utf-8"></script>
</head>
<body>
<div class="fm_button" onclick="fm_button.update_dedalo(this,'<?php echo htmlentities($options) ?>');">Update Dedalo</div>
<?php
foreach ((array)$request as $key => $value) {
	#echo "<br>$key : $value"; 
}
?>
</body>
</html>
