<?php
# CONFIG
	$start_time=microtime(1);
	include(dirname(dirname(__FILE__)) . '/config/config4.php');	

# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
	#common::trigger_manager();
	header('Content-Type: application/json; charset=utf-8');

# IS_LOGGED TEST
	if (login::is_logged()!==true) {
		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= "Error. Auth error: please login";
		echo json_encode($response);
		exit();
	}

# URL_LOCATOR
	#var_dump($_GET);
	if (!isset($_GET['url_locator'])) {
		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= "Error. Sorry, bad url requested. Please, review your rewrite config";
		echo json_encode($response);
		die();
	}

# Build locator
	$url_locator = safe_xss($_GET['url_locator']);
	$ar_parts 	 = explode('/', $url_locator);

	if(empty($ar_parts[0]) || empty($ar_parts[1])) {
		$msg = "Error. Invalid locator";
		echo json_encode($msg);
		die();
	}
	#var_dump($ar_parts);
	$locator = new locator();
	
		# section_tipo	
		$locator->set_section_tipo($ar_parts[0]);

		# section_id
		$locator->set_section_id($ar_parts[1]);	

		# component_tipo
		if (!empty($ar_parts[2])) {
			$locator->set_component_tipo($ar_parts[2]);
		}
		
		# tag_id
		if (!empty($ar_parts[3])) {
			$locator->set_tag_id($ar_parts[3]);
		}

# echo json_encode($locator);

# SECTION FULL DATO
	$section = section::get_instance($locator->section_id, $locator->section_tipo);
	$dato 	 = $section->get_dato();
	#echo json_encode($dato, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

	switch (true) {
		case (!empty($locator->tag_id) && !empty($locator->component_tipo)):
			$data = isset($dato->components->{$locator->component_tipo}) ? $dato->components->{$locator->component_tipo} : null;
			if ($data!==null) {
				# calculate tags here
			}
			break;
		case (!empty($locator->component_tipo)):
			$component_tipo = $locator->component_tipo;
			$data = isset($dato->components->{$component_tipo}) ? $dato->components->{$component_tipo} : null;
			break;
		default:
			$data = $dato;
			break;
	}

# Show json
	echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);


