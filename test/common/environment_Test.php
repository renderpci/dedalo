<?php
declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class environment_test extends TestCase {



	/**
	* TEST_environment
	* @return void
	*/
	public function test_environment() {

		$environment = dd_core_api::get_environment();

		$eq = gettype($environment)==='object';
		$this->assertTrue(
			$eq,
			'expected gettype($environment)==="object" true, but received is: '
				. to_string( $eq )
		);

		$eq = gettype($environment->result)==='object';
		$this->assertTrue(
			$eq,
			'expected gettype($environment->result)==="object" true, but received is: '
				. to_string( $eq )
		);

		// page_globals

			$page_globals = $environment->result->page_globals;

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

		// plain vars

			$plain_vars = $environment->result->plain_vars;

			$eq = gettype($plain_vars)==='array';
			$this->assertTrue(
				$eq,
				'expected gettype($plain_vars)==="array" true, but received is: '
					. to_string( $eq )
			);

		// lang_labels

			$lang_labels = $environment->result->get_label;

			$eq = gettype($lang_labels)==='object';
			$this->assertTrue(
				$eq,
				'expected gettype($lang_labels)==="object" true, but received is: '
					. to_string( $eq )
			);
	}//end test_environment



}//end class environment_test
