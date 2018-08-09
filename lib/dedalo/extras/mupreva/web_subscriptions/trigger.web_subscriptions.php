<?php
require_once( dirname(dirname(dirname(dirname(__FILE__)))).'/config/config4.php');


# WEB SUBSCRIPTIONS
	#dump($_REQUEST, ' $_REQUEST ++ '.to_string());
	error_log(json_encode($_REQUEST));

# Login
	# login test
	# If remote ip is distinct of local (127.0.0.1) login is verified. Else autologed as local user
		$local_ip = (RUN_MODE==='DEVELOPMENT') ? '127.0.0.1' : '172.24.99.37';
		$ip 	  = $_SERVER['REMOTE_ADDR'];
		if ($ip!==$local_ip) {

			# Check user
			if(login::is_logged()!==true) {
				$string_error = "Auth error: please login";
				error_log($string_error);
				print dd_error::wrap_error($string_error);
				die();
			}
			exit("Sorry. Only allowed local user here");
		}else{

			# Autologin
			autogin();			
		}

/**
* AUTOGIN
* @return int $user_id
*/
function autogin() {
	# Temporal root. Change to proper created user ASAP
	if (RUN_MODE==='DEVELOPMENT') {
		$user_id 		= -1;
		$username 		= 'root';
		$full_username 	= 'Root user testing web subscriptions';
		$is_global_admin= true;
		$is_developer 	= true;
	}else{
		$user_id 		= 61;
		$username 		= 'web_subscriptions';
		$full_username 	= 'User for web subscriptions autolog';
		$is_global_admin= false;
		$is_developer 	= false;
	}
	

	# IS_GLOBAL_ADMIN (before set user session vars)
	$_SESSION['dedalo4']['auth']['is_global_admin'] = (bool)$is_global_admin;
	# IS_DEVELOPER (before set user session vars)
	$_SESSION['dedalo4']['auth']['is_developer'] 	= (bool)$is_developer;

	# SESSION : If backup is ok, fix session data
	$_SESSION['dedalo4']['auth']['user_id']			= $user_id;
	$_SESSION['dedalo4']['auth']['username']		= $username;
	$_SESSION['dedalo4']['auth']['full_username'] 	= $full_username;
	$_SESSION['dedalo4']['auth']['is_logged']		= 1;

	return $user_id;
}//end autogin

	

# set vars
	$vars = array('mode','email','lang');
		foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) {
		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '<span class="error"> Trigger: Error Need mode.. </span>';
			$response->code 	= 1;
		echo json_encode($response);
		exit();
	}


define('WSUB_COMPONENT_EMAIL_SECTION_TIPO',			 'mupreva2650'); // Registres/suscripcions web
define('WSUB_COMPONENT_EMAIL_COMPONENT_TIPO',		 'mupreva242'); // email (component_email)
define('WSUB_COMPONENT_EMAIL_ACTIVE_COMPONENT_TIPO', 'mupreva2675'); // email active (radio_button)



# call_user_func
if (function_exists($mode)) {
	$result = call_user_func($mode);
		#dump($result, ' result ++ '.to_string());
		error_log(json_encode($result));

	echo json_encode($result);
}



function t($string) {
	global $lang;

	switch ($lang) {
		case 'es':
			$error_reques_failed = "Error. Solicitud fallida. ";
			$user_email_invalid = "El email introducido no es válido";
			$user_email_exists = "El email introducido ya existe en la base de datos";
			$error_on_insert = "Error al insertar el correo electrónico en la base de datos";
			$ok_request_done_add = "Ok. Solicitud completada. Suscripción agregada para el email";

			$user_email_not_exists = "El email del usuario no existe en la base de datos";
			$ok_request_done_remove = "Ok. Solicitud completada. Se eliminó la suscripción al email";
			break;
		case 'va':
			$error_reques_failed = "Error. Sol·licitud fallida. ";
			$user_email_invalid = "El correu electrònic de l'usuari no és vàlid";
			$user_email_exists = "L'e-mail de l'usuari ja existeix a la base de dades";
			$error_on_insert = "Error en inserir el correu electrònic a la base de dades";
			$ok_request_done_add = "Ok. Petició feta. Subscripció afegida al correu electrònic";

			$user_email_not_exists = "L'e-mail de l'usuari no existeix a la base de dades";
			$ok_request_done_remove = "Ok. Sol·licitud realitzada. S'ha eliminat la subscripció al correu electrònic";
			break;
		case 'fr':
			$error_reques_failed = "Erreur. Echec de la requête. ";
			$user_email_invalid = "L'email de l'utilisateur est invalide";
			$user_email_exists = "Le courrier électronique de l'utilisateur existe déjà dans la base de données";
			$error_on_insert = "Erreur lors de l'insertion d'un email dans la base de données";
			$ok_request_done_add = "Ok. Demande effectuée. Ajout de l'abonnement à l'email";

			$user_email_not_exists = "L'email de l'utilisateur n'existe pas dans la base de données";
			$ok_request_done_remove = "Ok. Demande effectuée, suppression de l'abonnement à l'email";
			break;
		case 'en':
		default:
			$error_reques_failed = "Error. Request failed. ";
			$user_email_invalid = "User email is invalid";
			$user_email_exists = "User email already exists in database";
			$error_on_insert = "Error on insert email in database";
			$ok_request_done_add = "Ok. Request done. Added subscription to email";

			$user_email_not_exists = "User email not exists in database";
			$ok_request_done_remove = "Ok. Request done. Removed subscription to email";
			break;
	}

	

	return isset($$string) ? $$string : "<i>$string</i>";
}//end t


/**
* ADD
* @return object $response
*/
function add() {
	global $email;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= t('error_reques_failed');
		$response->code 	= 1;

	# Clean email string
		$email = component_email::clean_email($email);
		
		# Validate email
		if (!component_email::is_valid_email($email)) {
			$response->msg .= t('user_email_invalid');
			$response->code = 2;
			return $response;
		}

	# Component email info
	$section_tipo 	= WSUB_COMPONENT_EMAIL_SECTION_TIPO;	// Registres/suscripcions web
	$component_tipo = WSUB_COMPONENT_EMAIL_COMPONENT_TIPO;	// email (component_email)

	# Check if email already exists	
		$email_section_id = get_email_section_id($email, $section_tipo, $component_tipo);
		if ($email_section_id!==false) {

			# Check if is unactive
			$tipo 			= WSUB_COMPONENT_EMAIL_ACTIVE_COMPONENT_TIPO;	// email active (radio_button)
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$parent 		= $email_section_id;
			$component 		= component_common::get_instance($modelo_name,
															 $tipo,
															 $parent,
															 'edit',
															 DEDALO_DATA_NOLAN,
															 $section_tipo);
			$dato = $component->get_dato();
			if (isset($dato[0]) && isset($dato[0]->section_id) && $dato[0]->section_id==2) {

				$locator = new locator();
					$locator->set_section_tipo('dd64');
					$locator->set_section_id('1'); // value YES
					#$locator->set_type(DEDALO_RELATION_TYPE_LINK);
					#$locator->set_from_component_tipo($tipo);

				$dato = array($locator);

				$component->set_dato($dato);
				$component->Save();

				# email already exists but unactive
				$response->result 	= true;
				$response->msg 		= t('ok_request_done_add') . ' : '.$email. " [$email_section_id]";
				$response->code 	= 10;
				return $response;

			}else{

				$response->msg .= t('user_email_exists') . " ({$email})";
				$response->code = 3;
				return $response;
			}			
		}

	# Save new user
	$section 	= section::get_instance(null, $section_tipo, 'edit', false);
	$section_id = (int)$section->Save();

	if ($section_id<1) {
		$response->msg .= t('error_on_insert') . " [$section_id]";
		$response->code = 4;
		return $response;
	}

	$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
	$component_email= component_common::get_instance($modelo_name,
													 $component_tipo,
													 $section_id,
													 'edit',
													 DEDALO_DATA_NOLAN,
													 $section_tipo);
	$component_email->set_dato($email);
	# Save
	$component_email->Save();

	

	$response->result 	= true;
	$response->msg 		= t('ok_request_done_add') . ' : '.$email. " [$section_id]";
	$response->code 	= 10;

	return $response;
}//end add



/**
* REMOVE
* @return object $response
*/
function remove() {
	global $email;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= t('error_reques_failed');
		$response->code 	= 1;

	# Clean email string
		$email = component_email::clean_email($email);
		
		# Validate email
		if (!component_email::is_valid_email($email)) {
			$response->msg .= t('user_email_invalid');
			$response->code = 2;
			return $response;
		}

	# Component email info
	$section_tipo 	= WSUB_COMPONENT_EMAIL_SECTION_TIPO;	// Registres/suscripcions web
	$component_tipo = WSUB_COMPONENT_EMAIL_COMPONENT_TIPO;	// email (component_email)


	# Check if email already exists
		$email_section_id = get_email_section_id($email, $section_tipo, $component_tipo);
		if ($email_section_id===false) {
			$response->msg .= t('user_email_not_exists') . " {$email}";
			$response->code = 2;
			return $response;
		}

	# Check email state
		$tipo 			= WSUB_COMPONENT_EMAIL_ACTIVE_COMPONENT_TIPO;	// email active (radio_button)
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$parent 		= $email_section_id;
		$component 		= component_common::get_instance($modelo_name,
														 $tipo,
														 $parent,
														 'edit',
														 DEDALO_DATA_NOLAN,
														 $section_tipo);
		$dato = $component->get_dato();
		if (isset($dato[0]) && isset($dato[0]->section_id) && $dato[0]->section_id==2) {
			# email already unactive
			$response->msg .= t('user_email_not_exists') . " {$email} [3]";
			$response->code = 3;
			return $response;
		}

	# Remove (set email active as NOT)
		# Component email active info radio button		
		$locator = new locator();
			$locator->set_section_tipo('dd64');
			$locator->set_section_id('2'); // value NOT
			#$locator->set_type(DEDALO_RELATION_TYPE_LINK);
			#$locator->set_from_component_tipo($tipo);

		$dato = array($locator);

		$component->set_dato($dato);
		$component->Save();


	$response->result 	= true;
	$response->msg 		= t('ok_request_done_remove') . ' : '.$email. " [$email_section_id]";
	$response->code 	= 10;

	return $response;
}//end remove



/**
* GET_EMAIL_SECTION_ID
* @return bool
*/
function get_email_section_id($email, $section_tipo, $component_tipo) {

	$email_section_id = false;
	
	$matrix_table 	= common::get_matrix_table_from_tipo($section_tipo);
	$path 			= "datos#>>'{components,{$component_tipo},dato,lg-nolan}'";
	$strQuery = "
		SELECT a.id, a.section_id, a.{$path}
		FROM \"$matrix_table\" a
		WHERE
		(a.section_tipo = '{$section_tipo}')
		AND
		(a.{$path} ILIKE '{$email}')
		LIMIT 1 ;
	";
	$result = JSON_RecordObj_matrix::search_free($strQuery);
	$n_rows = pg_num_rows($result);
	if ($n_rows>0) {
		while ($rows = pg_fetch_assoc($result)) {
			$email_section_id = $rows['section_id'];
			break;
		}
	}


	return $email_section_id;
}//end get_email_section_id



?>