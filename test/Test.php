<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(__FILE__) . '/bootstrap.php';



final class OutputTest extends TestCase {



	protected function setUp(): void   {
		$this->markTestSkipped(
			'Disabled !'
		);
	}



	// minimal test check to prevent phpunit miss-configuration errors
		public function testMinimalTestExpectInteger(): void {
			// $this->expectOutputString('foo');
			$dato = 325874;
			$this->assertTrue( gettype($dato)==='integer' );
		}


	/**
	* TEST_LOGOUT_USERS
	* @return void
	*/
		// public function test_logout_users(): void {

		// 	$users = [
		// 		-1,
		// 		1
		// 	];
		// 	foreach ($users as $user_id) {

		// 		login_Test::logout($user_id);

		// 		$this->assertTrue(
		// 			!isset($_SESSION['dedalo']['auth']),
		// 			'expected session dedalo auth is not set'
		// 		);
		// 	}
		// }//end test_logout_users



}//end OutputTest
