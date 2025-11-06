<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class request_config_presets_test extends TestCase {



	/////////// ⬇︎ static methods ⬇︎ ////////////////



	/**
	* TEST_get_active_request_config
	* @return void
	*/
	public function test_get_active_request_config() {

		$result = request_config_presets::get_active_request_config();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);

		if (!empty($result)) {

			$request_config = $result[0];

			$check = is_array($request_config->data);
			$this->assertTrue(
				$check===true,
				'expected request_config->data is array : ' . PHP_EOL
					. to_string($check)
			);

			$check = is_bool($request_config->public);
			$this->assertTrue(
				$check===true,
				'expected request_config->public is bool : ' . PHP_EOL
					. to_string($check)
			);
		}
	}//end test_get_active_request_config



	/**
	* TEST_get_request_config
	* @return void
	*/
	public function test_get_request_config() {

		$tipo			= 'numisdata4';
		$section_tipo	= 'numisdata4';
		$mode			= 'list';

		$result = request_config_presets::get_request_config(
			$tipo,
			$section_tipo,
			$mode
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);

		if (!empty($result)) {

			self::check_request_config_item( $result[0] );
		}
	}//end test_get_request_config



	/**
	* TEST_search_request_config
	* @return void
	*/
	public function test_search_request_config() {

		$tipo			= 'numisdata4';
		$section_tipo	= 'numisdata4';
		$mode			= 'list';
		$user_id		= logged_user_id() ?? 1;

		$result = request_config_presets::search_request_config(
			$tipo,
			$section_tipo,
			$user_id,
			$mode
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);

		if (!empty($result)) {

			self::check_request_config_item( $result[0] );
		}
	}//end test_search_request_config



	// check_request_config_item
	private function check_request_config_item( object $request_config ) : void {

		$check = is_object($request_config->show);
		$this->assertTrue(
			$check===true,
			'expected request_config->show is object : ' . PHP_EOL
				. to_string($check)
		);

		$check = is_array($request_config->show->ddo_map);
		$this->assertTrue(
			$check===true,
			'expected request_config->show->ddo_map is array : ' . PHP_EOL
				. to_string($check)
		);

		$check = is_string($request_config->show->ddo_map[0]->tipo);
		$this->assertTrue(
			$check===true,
			'expected request_config->show->ddo_map[0]->tipo is string : ' . PHP_EOL
				. to_string($check)
		);

		$check = is_string($request_config->show->ddo_map[0]->section_tipo);
		$this->assertTrue(
			$check===true,
			'expected request_config->show->ddo_map[0]->section_tipo is string : ' . PHP_EOL
				. to_string($check)
		);

		$check = is_string($request_config->show->ddo_map[0]->parent);
		$this->assertTrue(
			$check===true,
			'expected request_config->show->ddo_map[0]->parent is string : ' . PHP_EOL
				. to_string($check)
		);
	}//end check_request_config_item



	/**
	* TEST_clean_cache
	* @return void
	*/
	public function test_clean_cache() {

		$result = request_config_presets::clean_cache();

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		$check = $result===true;
		$this->assertTrue(
			$check===true,
			'expected result is true : ' . PHP_EOL
				. to_string($check)
		);
	}//end test_clean_cache



}//end class request_config_presets_test
