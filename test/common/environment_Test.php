<?php
declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class environment_test extends TestCase {



	/**
	* TEST_include_file
	* @return void
	*/
	public function test_include_file() {

		ob_start();

		$path = DEDALO_CORE_PATH . '/common/js/environment.js.php';
		include $path;

		ob_end_clean();

		$eq = file_exists($path);
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = gettype($page_globals)==='object';
		$this->assertTrue(
			$eq,
			'expected gettype($page_globals)==="object" true, but received is: '
				. to_string( $eq )
		);

		$eq = gettype($page_globals->dedalo_application_langs)==='array';
		$this->assertTrue(
			$eq,
			'expected gettype($page_globals->dedalo_application_langs)==="array" true, but received is: '
				. to_string( $eq )
		);

		$eq = $page_globals->dedalo_data_nolan==='lg-nolan';
		$this->assertTrue(
			$eq,
			'expected $page_globals->dedalo_data_nolan==="lg-nolan" true, but received is: '
				. to_string( $eq )
		);

		$eq = gettype($plain_vars)==='array';
		$this->assertTrue(
			$eq,
			'expected gettype($plain_vars)==="array" true, but received is: '
				. to_string( $eq )
		);

		$eq = gettype($lang_labels)==='string';
		$this->assertTrue(
			$eq,
			'expected gettype($lang_labels)==="string" true, but received is: '
				. to_string( $eq )
		);
	}//end test_include_file



}//end class environment_test
