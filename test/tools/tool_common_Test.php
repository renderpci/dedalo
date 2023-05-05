<?php
declare(strict_types=1);
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;

// require_once dirname(dirname(__FILE__)). '/lib/vendor/autoload.php';
	require_once dirname(dirname(dirname(__FILE__))) . '/config/config.php';
	// require_once dirname(dirname(__FILE__)) . '/login/login_Test.php';
	// require_once 'data.php';
	// require_once 'elements.php';

// check is development server. if not, throw to prevent malicious access
	if (!defined('DEVELOPMENT_SERVER') || DEVELOPMENT_SERVER!==true) {
		throw new Exception("Error. Only development servers can use this method", 1);
	}



final class tool_common_test extends TestCase {



	/**
	* TEST___CONSTRUCT
	* @return void
	*/
	public function test___construct() {

		$tool = new tool_lang(1, 'rsc167');
			// dump($tool, ' tool ++ '.to_string());

	}//end test___construct



}//end class tool_common_test
