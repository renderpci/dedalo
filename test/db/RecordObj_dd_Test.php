<?php
declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class RecordObj_dd_test extends TestCase {



	/**
	* TEST___construct
	* @return void
	*/
	public function test___construct(): void {

		$test_term_id = 'dd1';

		$RecordObj_dd	= new RecordObj_dd( $test_term_id );
		$terminoID		= $RecordObj_dd->get_terminoID();

		$type = gettype($terminoID);
		$eq = $type==='string';
		$this->assertTrue(
			$eq,
			'expected true (class===string) and received type: ' .$type
		);

		$eq = $terminoID===$test_term_id;
		$this->assertTrue(
			$eq,
			'expected true' . PHP_EOL
				.'test_term_id: ' . $test_term_id . PHP_EOL
				.'terminoID: ' . $terminoID
		);

		$RecordObj_dd	= new RecordObj_dd( null, 'dd' );
		$terminoID		= $RecordObj_dd->get_terminoID();

		$eq = $terminoID===null;
		$this->assertTrue(
			$eq,
			'expected true' . PHP_EOL
				.'test_term_id: null'  . PHP_EOL
				.'terminoID: ' . $terminoID
		);

		$prefix = $RecordObj_dd->get_prefijo();
		$eq = $prefix==='dd';
		$this->assertTrue(
			$eq,
			'expected true' . PHP_EOL
				.'expected prefix: dd'  . PHP_EOL
				.'prefix: ' . $prefix
		);

	}//end test___construct



}//end class
