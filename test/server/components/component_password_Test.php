<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';


final class component_password_test extends BaseTestCase {

	public static $model		= 'component_password';
	public static $tipo			= 'test152';
	public static $section_tipo	= 'test3';

	/**
	* BUILD_COMPONENT_INSTANCE
	* @return component_password
	*/
	private function build_component_instance() {

		$this->user_login();

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'edit';
		$lang			= DEDALO_DATA_NOLAN;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo
		);

		return $component;
	}//end build_component_instance

	/////////// ⬇︎ test start ⬇︎ ////////////////

	/**
	* TEST_get_data
	* @return void
	*/
	public function test_get_data() {

		$component = $this->build_component_instance();

		$result	= $component->get_data();

		$this->assertTrue(
			is_array($result) || is_null($result),
			'expected type array|null : ' . gettype($result)
		);
	}//end test_get_data

	/**
	* TEST_set_data
	* @return void
	*/
	public function test_set_data() {

		$component = $this->build_component_instance();

		// sample data from data.json
		$sample_data = $this->get_sample_data(self::$model);
		$old_data = $component->get_data();

		// Test with null
		$result	= $component->set_data(null);
		$this->assertTrue($result);
		$this->assertNull($component->get_data());

		// Test with string (auto-wrapping)
		$pass = 'test58742Rtk$';
		$result	= $component->set_data([$pass]);
		$this->assertTrue($result);
		$current_data = $component->get_data();
		
		$this->assertIsArray($current_data);
		$this->assertEquals(
			component_password::encrypt_password($pass),
			$current_data[0]->value
		);

		// Test with objects from sample data
		if (!empty($sample_data)) {
			$result = $component->set_data($sample_data);
			$this->assertTrue($result);
			$current_data = $component->get_data();
			// Since set_data encrypts, and sample data is already encrypted in data.json (likely),
			// it will be double-encrypted if we pass it directly. 
			// But the test is just checking if it successfully sets.
			$this->assertCount(count($sample_data), $current_data);
		}

		// restore data
		$component->set_data($old_data);
	}//end test_set_data

	/**
	* TEST_get_diffusion_value
	* @return void
	*/
	public function test_get_diffusion_value() {

		$component = $this->build_component_instance();

		$result = $component->get_diffusion_value();

		$this->assertEquals($component->fake_value, $result);
	}//end test_get_diffusion_value

	/**
	* TEST_get_grid_value
	* @return void
	*/
	public function test_get_grid_value() {

		$component = $this->build_component_instance();

		$result	= $component->get_grid_value();

		$this->assertIsObject($result);
		// Grid value for password should be an array of objects wrapping the fake value
		$this->assertEquals($component->fake_value, $result->value[0]->value);
	}//end test_get_grid_value

	/**
	* TEST_Save
	* @return void
	*/
	public function test_Save() {

		$component = $this->build_component_instance();

		// Set some data before save
		$component->set_data(['test_pass']);

		$result	= $component->Save();

		// Save should return the section_id (integer) or true/null depending on implementation, 
		// but should not be false.
		$this->assertNotFalse($result, 'Save failed for ' . self::$model);
	}//end test_Save

	/**
	* TEST_encrypt_password
	* @return void
	*/
	public function test_encrypt_password() {

		$value = 'Mjdld6$flsdo¿Wk';
		$result	= component_password::encrypt_password(
			$value
		);

		$this->assertIsString($result);

		$reverse = dedalo_decrypt_openssl($result);
		$this->assertEquals($value, $reverse);
	}//end test_encrypt_password

	/**
	* TEST_resolve_query_object_sql
	* @return void
	*/
	public function test_resolve_query_object_sql() {

		$query_object = (object)[
			'q' => ['mypass'],
			'path' => [(object)['component_tipo' => 'test152']],
			'table_alias' => 't1'
		];

		$result = component_password::resolve_query_object_sql($query_object);

		$this->assertIsObject($result);
		$this->assertObjectHasProperty('sentence', $result);
		$this->assertStringContainsString('jsonpath', $result->sentence);
	}//end test_resolve_query_object_sql

	/**
	* TEST_search_operators_info
	* @return void
	*/
	public function test_search_operators_info() {

		$component = $this->build_component_instance();

		$result = $component->search_operators_info();

		$this->assertIsArray($result);
		$this->assertArrayHasKey('=', $result);
	}//end test_search_operators_info

	/**
	* TEST_update_data_version
	* @return void
	*/
	public function test_update_data_version() {

		$options = (object)[
			'update_version' => [1, 0, 0]
		];

		$result = component_password::update_data_version($options);

		$this->assertIsObject($result);
		$this->assertEquals(0, $result->result);
	}//end test_update_data_version

	/**
	* TEST_get_v6_root_password_data
	* @return void
	*/
	public function test_get_v6_root_password_data() {

		$component = $this->build_component_instance();

		$result = $component->get_v6_root_password_data();

		$this->assertTrue(
			is_string($result) || $result === false || $result === null
		);
	}//end test_get_v6_root_password_data

}//end class component_password_test
