<?php declare(strict_types=1);

// require __DIR__ . '/../src/autoload.php';

// require __DIR__ . '/autoload.php';

// config file
	require_once dirname(dirname(__FILE__)) . '/config/config.php';

// check is development server. if not, throw to prevent malicious access
	if (!defined('DEVELOPMENT_SERVER') || DEVELOPMENT_SERVER!==true) {
		throw new Exception("Error. Only development servers can use this method", 1);
	}
