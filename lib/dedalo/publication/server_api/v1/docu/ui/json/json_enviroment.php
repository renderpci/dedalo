<?php
	$safe_xss = function($value) {

		if (is_string($value)) {
			if ($decode_json=json_decode($value)) {
				// If var is a stringify json, not verify string yet
			}else{
				$value = strip_tags($value); //,'<br><strong><em><img>'
				$value = htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
			}
		}

		return $value;
	};//end safe_xss

	#
	# JSON_CONTENT edit
	# $json_content is an object decoded from json file and available here

	# code
		if (isset($_REQUEST['code'])) {
			# Set current code as default code config
			$json_content->parameters->code->default = $safe_xss($_REQUEST['code']);
		}

	# db_name
		if (isset($_REQUEST['db_name'])) {
			# Set current db_name as default db_name config
			$json_content->parameters->db_name->default = $safe_xss($_REQUEST['db_name']);
		}

	# host
		# Set current host as object config host
		if (isset($_REQUEST['host'])) {
			$json_content->host = $safe_xss($_REQUEST['host']);
		}

	# lang
		# Set current lang as object config lang
		if (isset($_REQUEST['lang'])) {
			$json_content->parameters->lang->default = $safe_xss($_REQUEST['lang']);
		}

	# basePath
		# Create base path based on current url
		$json_content->basePath = str_replace(['client_api','/docu/ui/json/json.php'], ['server_api','/json'], $_SERVER['PHP_SELF']);

	# Protocols
		# Create protocols selector based on current protocol
		$check_https = function() {
			if (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO']==='https') {
				return true;
			}
			if ((!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || $_SERVER['SERVER_PORT'] == 443) {
				return true;
			}
			return false;
		};
		$protocol	= true===$check_https() ? 'https' : 'http';
		$protocol2	= ($protocol==='http') ? 'https' : 'http';
		$json_content->schemes = [$protocol, $protocol2];

	# Defaults examples
		# records table
		# Overrides default table example for 'get_records'
		$records_path = '/records';
		$records_parameters = $json_content->paths->{$records_path}->post->parameters;
		#	print_r($records_parameters);
		$ar = array_filter($records_parameters, function($element){
			if (property_exists($element, 'name') && $element->name==='table') {
				$element->default = 'interview'; // Overwrite default
				return true;
			}
		});