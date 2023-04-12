<?php
declare(strict_types=1);
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;

// require_once dirname(dirname(__FILE__)). '/lib/vendor/autoload.php';
	require_once dirname(dirname(__FILE__)) . '/config/config.php';

// check is development server. if not, throw to prevent malicious access
	if (!defined('DEVELOPMENT_SERVER') || DEVELOPMENT_SERVER!==true) {
		throw new Exception("Error. Only development servers can use this method", 1);
	}



final class OutputTest extends TestCase {



	// minimal test check to prevent phpunit miss-configuration errors
		public function testMinimalTestExpectInteger(): void {
			// $this->expectOutputString('foo');
			$dato = 325874;
			$this->assertTrue( gettype($dato)==='integer' );
		}



}//end OutputTest
