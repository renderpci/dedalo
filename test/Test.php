<?php
declare(strict_types=1);
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;

// require_once dirname(dirname(__FILE__)). '/lib/vendor/autoload.php';
require_once dirname(dirname(__FILE__)) . '/config/config.php';



final class OutputTest extends TestCase {



	// minimal test check to prevent phpunit miss-configuration errors
		public function testMinimalTestExpectInteger(): void {
			// $this->expectOutputString('foo');
			$dato = 325874;
			$this->assertTrue( gettype($dato)==='integer' );
		}



}//end OutputTest
