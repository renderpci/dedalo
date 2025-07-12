<?php declare(strict_types=1);

// require __DIR__ . '/../src/autoload.php';
// require __DIR__ . '/autoload.php';

// SHOW_DEBUG. Overwrite config SHOW_DEBUG
	define('SHOW_DEBUG', false);

// TEST_USER_ID: [
	// 	-1, // root development user
	// 	1, // admin general (no projects)
	// 	2 // regular user
	// ]
	define('TEST_USER_ID', 1); // DEDALO_SUPERUSER

// IS_UNIT_TEST
	define('IS_UNIT_TEST', true);

// config file
	require_once dirname(__FILE__, 2) . '/config/config.php';

// check is development server. if not, throw to prevent malicious access
	if (!defined('DEVELOPMENT_SERVER') || DEVELOPMENT_SERVER!==true) {
		die("Error. Only development servers can use this method.");
	}

// check is in maintenance mode
	if (DEDALO_MAINTENANCE_MODE || DEDALO_MAINTENANCE_MODE_CUSTOM) {
		die("Error. System is in maintenance mode. Unable to test in this mode.");
	}

// PHPUnit classes
	// use PHPUnit\Framework\TestCase;
	// use PHPUnit\Framework\Attributes\TestDox;

// message CLI
	$icon = !SHOW_DEBUG ? '😀' : '🧐';
	$msg = "Dédalo ".DEDALO_VERSION." testing using user id: ".TEST_USER_ID .' - SHOW_DEBUG: ' .to_string(SHOW_DEBUG) . ' - ' . $icon;
	fwrite(STDERR, PHP_EOL
		. print_r($msg, TRUE) . PHP_EOL
	);

// require files
	require_once 'components/data.php';
	require_once 'components/elements.php';
	require_once dirname(__FILE__) . '/login/login_Test.php';

// PHPUnitUtil reflection
	class PHPUnitUtil
	{
		public static function callMethod($obj, $name, array $args) {
			$class = new \ReflectionClass($obj);
			$method = $class->getMethod($name);
			// $method->setAccessible(true); // Use this if you are running PHP older than 8.1.0
			return $method->invokeArgs($obj, $args);
		}
	}

// logout. Delete sessions and cache files
	$user_id = TEST_USER_ID; // Defined in bootstrap
	if (login::is_logged()) {
		$result = login_test::logout($user_id);
	}
