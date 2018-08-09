<?php
/**
* REQUEST (GET FROM FILEMAKER)
* Botón que se servirá desde Dédalo y aparecerá en el iframe de Filemaker.
* Recibe variables desde Filemaker a través de la url como: 
* http://museudeprehistoria.es/dedalo/lib/dedalo/extras/mupreva/filemaker_sync/?database=Tesauros&table=Location&layout=web-Location&id=4&type=ts
* Dispara un evento ajax que llama al trigger (trigger.filemaker_sync.php) para sincronizar contenidos entre FM / Dedalo
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

# Verify all mandatory vars are received
$ar_vars_mandatory = array('database','table','layout','id','type','auth_code');
foreach ($ar_vars_mandatory as $current_var) {
	if (empty($request[$current_var])) {
		exit("Error. $current_var is mandatory");
	}
	# Safe url encode all params
	$request[$current_var] = urlencode( $request[$current_var] );
}

# Add source_ip
$request['source_ip'] = $_SERVER['REMOTE_ADDR'];

/* auth_code encrypt 
$hash = password_hash($request['auth_code'],PASSWORD_DEFAULT );  //PASSWORD_DEFAULT
var_dump( password_verify($request['auth_code'].'', $hash) );
echo "<hr>".$hash;
*/

# OPTIONS JSON
# Build json object with all received vars (and calculated source ip)
$options = (object)$request;
$options = json_encode($options);
if (!$options) {
	exit("Error. Wrong data received");
}

?>
<!DOCTYPE html>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<head>
<link rel="stylesheet" href="css/fm_button.css" type="text/css" media="screen">
<!--[if IE 8]>
<link rel="stylesheet" href="css/fm_button_ie7.css" type="text/css" media="screen">
<![endif]-->
<!--[if IE 7]>
<link rel="stylesheet" href="css/fm_button_ie7.css" type="text/css" media="screen">
<![endif]-->
<?php
/*
	if( strpos($_SERVER['HTTP_HOST'], '8888')!==false ) {
		$dedalo_folder = 'dedalo4';
	}else{
		$dedalo_folder = 'dedalo';
	}
*/
?>
<script src="js/jquery-1.11.3.min.js" type="text/javascript" charset="utf-8"></script>
<script src="js/fm_button.js" type="text/javascript" charset="utf-8"></script>
</head>
<body>
<div class="fm_button" onclick="fm_button.update_dedalo(this,'<?php echo htmlentities($options) ?>');"></div>
<?php
//print_r($options);
?>
</body>
</html>
