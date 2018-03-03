<?php
$TOP_TIPO=false;
require_once( dirname(dirname(dirname(__FILE__))) .'/lib/dedalo/config/config4.php');

#if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

# set vars
	$vars = array('mode','username','password','reference');
		foreach($vars as $name) $$name = common::setVar($name);
	

# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");

	

if($mode=='set_psw') {

	if (empty($username) || empty($password) || empty($reference) ) {
		exit("Error: few vars");
	}

	if ( $reference!='rfC'.$password ) {
		exit("Error: bad reference");
	}

	$password_encripted = dedalo_encrypt_openssl($password);

	# Test encrypt and decript data cycle
	if (dedalo_decrypt_openssl($password_encripted) != $password) {
		return "Error: sorry an error ocurred on UPDATE record. Encrytp and decrypt cylce is wrong!";
	}	
	
	$section = section::get_instance( -1, DEDALO_SECTION_USERS_TIPO );
	$dato = $section->get_dato();
	$tipo = DEDALO_USER_PASSWORD_TIPO;
	$lang = DEDALO_DATA_NOLAN;	

	# Set dato 
	$dato->components->$tipo->dato->$lang  = $password_encripted;
	# Set valor
	$dato->components->$tipo->valor->$lang = $password_encripted;
	
	$strQuery 	= "UPDATE matrix_users SET datos = $1 WHERE section_id = $2 AND section_tipo = $3";
	$result 	= pg_query_params(DBi::_getConnection(), $strQuery, array( json_handler::encode($dato), -1, DEDALO_SECTION_USERS_TIPO ));
	if(!$result) {
		if(SHOW_DEBUG) {
			dump($strQuery,"strQuery");
			throw new Exception("Error Processing Save Update Request ". pg_last_error(), 1);;
		}
		return "Error: sorry an error ocurred on UPDATE record. Data is not saved";
	}	
	
	unset($_SESSION['dedalo4']['auth']);
	
	$contents = file_get_contents(__FILE__);
	file_put_contents(__FILE__,
	    "<?php # Remove this line and the next line to re-configure the application
	    die('Error: Sorry, the application has already been configured.'); 
	    ?>\n" . $contents
	);


} #if($mode=='set_psw')
?>