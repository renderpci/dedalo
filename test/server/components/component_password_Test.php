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
		// SEC-001: set_data() now hashes with Argon2id, so the stored value is
		// not deterministic. Verify via verify_password() instead of equality.
		$pass = 'test58742Rtk$';
		$result	= $component->set_data([$pass]);
		$this->assertTrue($result);
		$current_data = $component->get_data();


		$this->assertIsArray($current_data);
		$stored = $current_data[0]->value ?? '';
		$this->assertIsString($stored);
		$this->assertStringStartsWith('$argon2', $stored, 'set_data must produce an Argon2id hash');
		[$ok, $needs_rehash] = component_password::verify_password($pass, $stored);
		$this->assertTrue($ok, 'verify_password must accept the password just stored');
		$this->assertFalse($needs_rehash, 'a freshly-stored Argon2id hash must not request rehash');

		// Test with objects from sample data
		if (!empty($sample_data)) {
			$result = $component->set_data($sample_data);
			$this->assertTrue($result);
			$current_data = $component->get_data();
			// Sample data is already a stored credential (legacy AES blob or
			// hash); set_data must persist verbatim, never double-hash it.
			$this->assertCount(count($sample_data), $current_data);
		}

		// restore data
		$component->set_data($old_data);
	}//end test_set_data



	/**
	* TEST_verify_password
	* SEC-001/002/007: verify_password must accept both the modern Argon2id
	* hash and the legacy AES blob, and signal a rehash on legacy success.
	* @return void
	*/
	public function test_verify_password() {

		$pass = 'Mjdld6$flsdo¿Wk';

		// Modern path
		$argon = component_password::hash_password($pass);
		[$ok, $rehash] = component_password::verify_password($pass, $argon);
		$this->assertTrue($ok);
		$this->assertFalse($rehash);

		// Modern path with wrong password
		[$ok_bad, ] = component_password::verify_password('not the password', $argon);
		$this->assertFalse($ok_bad);

		// Legacy path
		$legacy = component_password::encrypt_password($pass);
		[$ok_legacy, $rehash_legacy] = component_password::verify_password($pass, $legacy);
		$this->assertTrue($ok_legacy, 'legacy AES blob must verify');
		$this->assertTrue($rehash_legacy, 'legacy verification must request a rehash');

		// Empty inputs fail closed
		[$ok_empty, ] = component_password::verify_password('', $argon);
		$this->assertFalse($ok_empty);
		[$ok_empty2, ] = component_password::verify_password($pass, '');
		$this->assertFalse($ok_empty2);
	}//end test_verify_password

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

		// $component->fake_value

		$this->assertIsObject($result);
		// Grid value for password should contain the fake value as flat array
		$this->assertIsArray($result->value);
		$this->assertEquals(
			$component->fake_value,
			$result->value[0],
			'grid value expected fake_value: ' . json_encode($result->value, JSON_PRETTY_PRINT)
		);
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

	/**
	* TEST_set_data_empty
	* @return void
	*/
	public function test_set_data_empty() {

		$component = $this->build_component_instance();

		$old_data = $component->get_data();

		// set empty array
		$result = $component->set_data([]);
		$this->assertTrue($result);
		$this->assertNull($component->get_data());

		// restore
		$component->set_data($old_data);
	}//end test_set_data_empty

	/**
	* TEST_save_and_reload
	* @return void
	*/
	public function test_save_and_reload() {

		$component = $this->build_component_instance();

		$old_data = $component->get_data();

		// set and save
		$pass = 'TestR3load$';
		$component->set_data([$pass]);
		$save_result = $component->Save();
		$this->assertNotFalse($save_result, 'Save failed');

		// reload from DB
		$reloaded = component_common::get_instance(
			self::$model, self::$tipo, 1, 'edit', DEDALO_DATA_NOLAN, self::$section_tipo
		);
		$reloaded_data = $reloaded->get_data();
		$this->assertIsArray($reloaded_data);
		$stored = $reloaded_data[0]->value ?? '';
		$this->assertIsString($stored);
		$this->assertStringStartsWith('$argon2', $stored, 'reload from DB must yield an Argon2id hash');
		[$ok, $needs_rehash] = component_password::verify_password($pass, $stored);
		$this->assertTrue($ok, 'verify_password must accept the password after save+reload');
		$this->assertFalse($needs_rehash, 'a freshly-stored Argon2id hash must not request rehash');

		// restore
		$component->set_data($old_data);
		$component->Save();
	}//end test_save_and_reload

	/**
	* TEST_is_empty
	* @return void
	*/
	public function test_is_empty() {

		$component = $this->build_component_instance();

		$old_data = $component->get_data();

		// empty data (null)
		$component->set_data(null);
		$this->assertTrue($component->is_empty_data($component->get_data()));

		// non-empty data
		$component->set_data(['ValidP4ss!']);
		$data = $component->get_data();
		$this->assertFalse($component->is_empty_data($data));
		if (!empty($data)) {
			$this->assertFalse($component->is_empty($data[0]));
		}

		// restore
		$component->set_data($old_data);
	}//end test_is_empty

	/**
	* TEST_get_identifier
	* @return void
	*/
	public function test_get_identifier() {

		$component = $this->build_component_instance();

		$result = $component->get_identifier();

		// get_identifier returns tipo_section_tipo_section_id
		$expected = self::$tipo . '_' . self::$section_tipo . '_1';
		$this->assertEquals($expected, $result);
	}//end test_get_identifier

	/**
	* TEST_component_instance_modes
	* @return void
	*/
	public function test_component_instance_modes() {

		$modes = ['edit', 'list', 'search'];

		foreach ($modes as $mode) {
			$component = component_common::get_instance(
				self::$model, self::$tipo, 1, $mode, DEDALO_DATA_NOLAN, self::$section_tipo
			);
			$this->assertEquals($mode, $component->mode, "mode expected {$mode}");
			$this->assertInstanceOf(component_password::class, $component, "instance expected component_password for mode {$mode}");
		}
	}//end test_component_instance_modes

}//end class component_password_test
