<?php declare(strict_types=1);

// require __DIR__ . '/../src/autoload.php';

// require __DIR__ . '/autoload.php';

// overwrite config SHOW_DEBUG
define('SHOW_DEBUG', false);
// TEST_USER_ID
define('TEST_USER_ID', 2); // DEDALO_SUPERUSER

// config file
	require_once dirname(dirname(__FILE__)) . '/config/config.php';

// check is development server. if not, throw to prevent malicious access
	if (!defined('DEVELOPMENT_SERVER') || DEVELOPMENT_SERVER!==true) {
		throw new Exception("Error. Only development servers can use this method", 1);
	}

// PHPUnit classes
	// use PHPUnit\Framework\TestCase;
	// use PHPUnit\Framework\Attributes\TestDox;

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
