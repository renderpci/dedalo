<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class harness_Test extends TestCase {

	public function test_unit_harness_boots_without_database() : void {
		$this->assertTrue(defined('IS_UNIT_TEST'));
		$this->assertTrue(IS_UNIT_TEST);
	}
}
