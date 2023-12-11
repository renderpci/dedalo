<?php declare(strict_types=1);

// require __DIR__ . '/../src/autoload.php';

// require __DIR__ . '/autoload.php';

// overwrite config SHOW_DEBUG
define('SHOW_DEBUG', false);
// TEST_USER_ID
define('TEST_USER_ID', 1); // DEDALO_SUPERUSER

// config file
	require_once dirname(dirname(__FILE__)) . '/config/config.php';

// check is development server. if not, throw to prevent malicious access
	if (!defined('DEVELOPMENT_SERVER') || DEVELOPMENT_SERVER!==true) {
		throw new Exception("Error. Only development servers can use this method", 1);
	}

// require files
	require_once 'components/data.php';
	require_once 'components/elements.php';
	require_once dirname(__FILE__) . '/login/login_Test.php';
