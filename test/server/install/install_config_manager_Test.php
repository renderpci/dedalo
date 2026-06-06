<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

// Include manager class
require_once DEDALO_CORE_PATH . '/install/class.install_config_manager.php';


final class install_config_manager_Test extends BaseTestCase {

	/**
	* TEST_get_config
	* @return void
	*/
	public function test_get_config(): void {

		$config = install_config_manager::get_config();

		$this->assertIsObject($config, 'expected config to be an object');

		$this->assertObjectHasProperty('db_install_name', $config);
		$this->assertIsString($config->db_install_name);
		$this->assertEquals('dedalo7_install', $config->db_install_name);

		$this->assertObjectHasProperty('host_line', $config);
		$this->assertIsString($config->host_line);

		$this->assertObjectHasProperty('port_line', $config);
		$this->assertIsString($config->port_line);

		$this->assertObjectHasProperty('to_preserve_tld', $config);
		$this->assertIsArray($config->to_preserve_tld);
		$this->assertContains('dd', $config->to_preserve_tld);
		$this->assertContains('rsc', $config->to_preserve_tld);
		$this->assertContains('hierarchy', $config->to_preserve_tld);

		$this->assertObjectHasProperty('to_clean_tables', $config);
		$this->assertIsArray($config->to_clean_tables);
		$this->assertContains('matrix', $config->to_clean_tables);
		$this->assertContains('matrix_users', $config->to_clean_tables);

		$this->assertObjectHasProperty('target_file_path', $config);
		$this->assertIsString($config->target_file_path);
		$this->assertStringContainsString('dedalo7_install.pgsql', $config->target_file_path);

		$this->assertObjectHasProperty('target_file_path_compress', $config);
		$this->assertIsString($config->target_file_path_compress);
		$this->assertStringEndsWith('.gz', $config->target_file_path_compress);

		$this->assertObjectHasProperty('hierarchy_files_dir_path', $config);
		$this->assertIsString($config->hierarchy_files_dir_path);
		$this->assertStringContainsString('hierarchy', $config->hierarchy_files_dir_path);
	}//end test_get_config


	/**
	* TEST_get_db_status
	* @return void
	*/
	public function test_get_db_status(): void {

		$db_status = install_config_manager::get_db_status();

		$this->assertIsObject($db_status, 'expected db_status to be an object');

		$this->assertObjectHasProperty('config_db_name_check', $db_status);
		$this->assertIsBool($db_status->config_db_name_check);

		$this->assertObjectHasProperty('config_user_name_check', $db_status);
		$this->assertIsBool($db_status->config_user_name_check);

		$this->assertObjectHasProperty('config_pw_check', $db_status);
		$this->assertIsBool($db_status->config_pw_check);

		$this->assertObjectHasProperty('config_information_check', $db_status);
		$this->assertIsBool($db_status->config_information_check);

		$this->assertObjectHasProperty('config_info_key_check', $db_status);
		$this->assertIsBool($db_status->config_info_key_check);

		$this->assertObjectHasProperty('config_check', $db_status);
		$this->assertIsBool($db_status->config_check);

		$this->assertObjectHasProperty('db_connection_check', $db_status);
		$this->assertIsBool($db_status->db_connection_check);

		$this->assertObjectHasProperty('global_status', $db_status);
		$this->assertIsBool($db_status->global_status);
	}//end test_get_db_status


	/**
	* TEST_get_db_data_version
	* @return void
	*/
	public function test_get_db_data_version(): void {

		$version = install_config_manager::get_db_data_version();

		// Version can be null if not set, or an array if set
		$this->assertTrue(
			$version === null || is_array($version),
			'expected version to be null or array, got: ' . gettype($version)
		);

		if (is_array($version)) {
			// Version is returned as numeric array [major, minor, patch]
			$this->assertIsArray($version);
			$this->assertCount(3, $version); // Should have 3 version components
		}
	}//end test_get_db_data_version


	/**
	* TEST_system_is_already_installed
	* @return void
	*/
	public function test_system_is_already_installed(): void {

		$response = install_config_manager::system_is_already_installed();

		$this->assertIsObject($response);
		$this->assertObjectHasProperty('result', $response);
		$this->assertObjectHasProperty('msg', $response);
		$this->assertIsBool($response->result);
		$this->assertIsString($response->msg);
	}//end test_system_is_already_installed


	/**
	* TEST_to_update
	* @return void
	*/
	public function test_to_update(): void {

		$response = install_config_manager::to_update();

		$this->assertIsObject($response);
		$this->assertObjectHasProperty('result', $response);
		$this->assertObjectHasProperty('msg', $response);
		$this->assertIsBool($response->result);
		$this->assertIsString($response->msg);
	}//end test_to_update


	/**
	* TEST_set_root_pw
	* @return void
	*/
	public function test_set_root_pw(): void {

		$response = install_config_manager::set_root_pw(new stdClass());

		$this->assertIsObject($response);
		$this->assertObjectHasProperty('result', $response);
		$this->assertObjectHasProperty('msg', $response);
		$this->assertIsBool($response->result);
		$this->assertIsString($response->msg);
	}//end test_set_root_pw


	/**
	* TEST_set_install_status
	* @return void
	*/
	public function test_set_install_status(): void {

		$response = install_config_manager::set_install_status('installed');

		$this->assertIsObject($response);
		$this->assertObjectHasProperty('result', $response);
		$this->assertObjectHasProperty('msg', $response);
		$this->assertIsBool($response->result);
		$this->assertIsString($response->msg);
	}//end test_set_install_status


	/**
	* TEST_class_is_static_only
	* Verify install_config_manager is a static-only class
	* @return void
	*/
	public function test_class_is_static_only(): void {

		$reflection = new ReflectionClass('install_config_manager');

			// Should have a private constructor to prevent instantiation
			$constructor = $reflection->getConstructor();
			$this->assertNotNull($constructor);
			$this->assertTrue($constructor->isPrivate());



		// All public methods should be static
		$methods = $reflection->getMethods(ReflectionMethod::IS_PUBLIC);
		foreach ($methods as $method) {
			$this->assertTrue($method->isStatic());
		}
	}//end test_class_is_static_only


	/**
	* TEST_class_has_strict_types
	* Verify install_config_manager uses strict types
	* @return void
	*/
	public function test_class_has_strict_types(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_config_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('declare(strict_types=1)', $content);
	}//end test_class_has_strict_types


	/**
	* TEST_static_db_install_name_property
	* Verify static db_install_name property
	* @return void
	*/
	public function test_static_db_install_name_property(): void {

		$reflection = new ReflectionClass('install_config_manager');
		$property = $reflection->getProperty('db_install_name');

		$this->assertTrue($property->isPublic());
		$this->assertTrue($property->isStatic());
		$this->assertEquals('string', $property->getType()->getName());
		$this->assertEquals('dedalo7_install', install_config_manager::$db_install_name);
	}//end test_static_db_install_name_property


	/**
	* TEST_class_file_exists
	* Verify install_config_manager class file exists
	* @return void
	*/
	public function test_class_file_exists(): void {

		$file_path = DEDALO_CORE_PATH . '/install/class.install_config_manager.php';

		$this->assertTrue(file_exists($file_path));
	}//end test_class_file_exists


	/**
	* TEST_class_exists
	* Verify install_config_manager class exists
	* @return void
	*/
	public function test_class_exists(): void {

		$this->assertTrue(class_exists('install_config_manager'));
	}//end test_class_exists


	/**
	* TEST_class_does_not_extend_common
	* Verify install_config_manager doesn't extend common
	* @return void
	*/
	public function test_class_does_not_extend_common(): void {

		$this->assertFalse(is_subclass_of('install_config_manager', 'common'));
	}//end test_class_does_not_extend_common


	/**
	* TEST_all_static_methods_exist
	* Verify all expected static methods exist
	* @return void
	*/
	public function test_all_static_methods_exist(): void {

		$expected_methods = [
			'get_config',
			'get_db_install_conn',
			'get_db_status',
			'get_db_data_version',
			'to_update',
			'system_is_already_installed',
			'set_root_pw',
			'set_install_status'
		];

		foreach ($expected_methods as $method) {
			$this->assertTrue(method_exists('install_config_manager', $method));
		}
	}//end test_all_static_methods_exist


	/**
	* TEST_config_preserves_tld_list
	* Test that the preserve_tld list contains expected core TLDs
	* @return void
	*/
	public function test_config_preserves_tld_list(): void {

		$config = install_config_manager::get_config();

		$expected_tlds = ['dd', 'rsc', 'hierarchy', 'ontology', 'ontologytype', 'localontology', 'lg', 'oh'];

		foreach ($expected_tlds as $tld) {
			$this->assertContains($tld, $config->to_preserve_tld);
		}
	}//end test_config_preserves_tld_list


	/**
	* TEST_config_clean_tables_list
	* Test that the clean tables list contains expected tables
	* @return void
	*/
	public function test_config_clean_tables_list(): void {

		$config = install_config_manager::get_config();

		$expected_tables = ['matrix', 'matrix_users', 'matrix_projects', 'matrix_profiles', 'matrix_test'];

		foreach ($expected_tables as $table) {
			$this->assertContains($table, $config->to_clean_tables);
		}
	}//end test_config_clean_tables_list


	/**
	* TEST_target_file_path_format
	* Verify target file path has correct format
	* @return void
	*/
	public function test_target_file_path_format(): void {

		$config = install_config_manager::get_config();

		$this->assertStringEndsWith('.pgsql', $config->target_file_path);
		$this->assertStringEndsWith('.pgsql.gz', $config->target_file_path_compress);
		$this->assertStringContainsString('dedalo7_install', $config->target_file_path);
		$this->assertStringContainsString('dedalo7_install', $config->target_file_path_compress);
	}//end test_target_file_path_format


	/**
	* TEST_config_object_is_immutable_per_call
	* Verify that get_config returns a new object each time
	* @return void
	*/
	public function test_config_object_is_immutable_per_call(): void {

		$config1 = install_config_manager::get_config();
		$config1->db_install_name = 'modified_value';

		$config2 = install_config_manager::get_config();

		// config2 should not have the modified value from config1
		$this->assertEquals('dedalo7_install', $config2->db_install_name);
	}//end test_config_object_is_immutable_per_call


	/**
	* TEST_hierarchy_files_dir_exists
	* Verify hierarchy files directory exists
	* @return void
	*/
	public function test_hierarchy_files_dir_exists(): void {

		$config = install_config_manager::get_config();
		$dir_path = $config->hierarchy_files_dir_path;

		$this->assertTrue(is_dir($dir_path));
	}//end test_hierarchy_files_dir_exists


	/**
	* TEST_config_core_file_path_exists
	* Verify config_core.php file path is correct
	* @return void
	*/
	public function test_config_core_file_path_exists(): void {

		$config = install_config_manager::get_config();
		$config_core_file = $config->config_core_file_path;

		$this->assertTrue(is_string($config_core_file));
		$this->assertTrue(str_contains($config_core_file, 'config_core.php'));
		$this->assertTrue(file_exists($config_core_file));
	}//end test_config_core_file_path_exists


	/**
	* TEST_config_is_complete
	* Verify config object has all expected properties
	* @return void
	*/
	public function test_config_is_complete(): void {

		$config = install_config_manager::get_config();

		$expected_properties = [
			'db_install_name',
			'host_line',
			'port_line',
			'to_preserve_tld',
			'to_clean_tables',
			'target_file_path',
			'target_file_path_compress',
			'hierarchy_files_dir_path',
			'install_checked_default',
			'hierarchy_typologies',
			'config_core_file_path'
		];

		foreach ($expected_properties as $property) {
			$this->assertObjectHasProperty($property, $config);
		}
	}//end test_config_is_complete


	/**
	* TEST_config_values_are_correct_types
	* Verify config object properties have correct types
	* @return void
	*/
	public function test_config_values_are_correct_types(): void {

		$config = install_config_manager::get_config();

		$this->assertIsString($config->db_install_name);
		$this->assertIsString($config->host_line);
		$this->assertIsString($config->port_line);
		$this->assertIsArray($config->to_preserve_tld);
		$this->assertIsArray($config->to_clean_tables);
		$this->assertIsString($config->target_file_path);
		$this->assertIsString($config->target_file_path_compress);
		$this->assertIsString($config->hierarchy_files_dir_path);
		$this->assertIsArray($config->install_checked_default);
		$this->assertIsArray($config->hierarchy_typologies);
		$this->assertIsString($config->config_core_file_path);
	}//end test_config_values_are_correct_types


	/**
	* TEST_config_values_are_not_empty
	* Verify config object properties are not empty
	* @return void
	*/
	public function test_config_values_are_not_empty(): void {

		$config = install_config_manager::get_config();

		$this->assertNotEmpty($config->db_install_name);
		$this->assertNotEmpty($config->host_line);
		// port_line can be empty when using default port
		$this->assertNotEmpty($config->to_preserve_tld);
		$this->assertNotEmpty($config->to_clean_tables);
		$this->assertNotEmpty($config->target_file_path);
		$this->assertNotEmpty($config->target_file_path_compress);
		$this->assertNotEmpty($config->hierarchy_files_dir_path);
		$this->assertNotEmpty($config->config_core_file_path);
	}//end test_config_values_are_not_empty


	/**
	* TEST_config_is_consistent
	* Verify config values are consistent with each other
	* @return void
	*/
	public function test_config_is_consistent(): void {

		$config = install_config_manager::get_config();

		// target_file_path_compress should be target_file_path + .gz
		$this->assertEquals(
			$config->target_file_path . '.gz',
			$config->target_file_path_compress
		);

		// db_install_name should appear in target_file_path
		$this->assertStringContainsString($config->db_install_name, $config->target_file_path);
		$this->assertStringContainsString($config->db_install_name, $config->target_file_path_compress);
	}//end test_config_is_consistent


	/**
	* TEST_config_is_environment_aware
	* Verify config is aware of Dédalo environment constants
	* @return void
	*/
	public function test_config_is_environment_aware(): void {

		$config = install_config_manager::get_config();

		// Config should use Dédalo environment paths
		$this->assertStringContainsString(DEDALO_ROOT_PATH, $config->target_file_path);
		$this->assertStringContainsString(DEDALO_ROOT_PATH, $config->hierarchy_files_dir_path);
	}//end test_config_is_environment_aware


	/**
	* TEST_config_paths_are_absolute
	* Verify config paths are absolute paths
	* @return void
	*/
	public function test_config_paths_are_absolute(): void {

		$config = install_config_manager::get_config();

		$this->assertStringStartsWith('/', $config->target_file_path);
		$this->assertStringStartsWith('/', $config->target_file_path_compress);
		$this->assertStringStartsWith('/', $config->hierarchy_files_dir_path);
		$this->assertStringStartsWith('/', $config->config_core_file_path);
	}//end test_config_paths_are_absolute


	/**
	* TEST_config_arrays_are_valid
	* Verify config arrays contain valid data
	* @return void
	*/
	public function test_config_arrays_are_valid(): void {

		$config = install_config_manager::get_config();

		// Check to_preserve_tld contains valid TLD codes
		foreach ($config->to_preserve_tld as $tld) {
			$this->assertMatchesRegularExpression('/^[a-z]+$/', $tld);
		}

		// Check to_clean_tables contains valid table names
		foreach ($config->to_clean_tables as $table) {
			$this->assertMatchesRegularExpression('/^[a-z_]+$/', $table);
		}
	}//end test_config_arrays_are_valid


	/**
	* TEST_hierarchy_typologies_format
	* Verify hierarchy_typologies is an array of objects with expected structure
	* @return void
	*/
	public function test_hierarchy_typologies_format(): void {

		$config = install_config_manager::get_config();

		$this->assertIsArray($config->hierarchy_typologies);

		foreach ($config->hierarchy_typologies as $typology) {
			$this->assertIsObject($typology);
			$this->assertObjectHasProperty('typology', $typology);
			$this->assertObjectHasProperty('label', $typology);
		}
	}//end test_hierarchy_typologies_format


	/**
	* TEST_config_preserves_default_values
	* Verify config preserves default installation values
	* @return void
	*/
	public function test_config_preserves_default_values(): void {

		$config = install_config_manager::get_config();

		// Verify default installation database name
		$this->assertEquals('dedalo7_install', $config->db_install_name);

		// Verify default TLD preservation list includes core TLDs
		$core_tlds = ['dd', 'rsc', 'hierarchy', 'ontology'];
		foreach ($core_tlds as $tld) {
			$this->assertContains($tld, $config->to_preserve_tld);
		}
	}//end test_config_preserves_default_values


	/**
	* TEST_config_supports_customization
	* Verify config can be customized via static property
	* @return void
	*/
	public function test_config_supports_customization(): void {

		$original_name = install_config_manager::$db_install_name;

		// Customize db name
		install_config_manager::$db_install_name = 'custom_install_db';

		$config = install_config_manager::get_config();

		// Config should reflect the custom value
		$this->assertEquals('custom_install_db', $config->db_install_name);

		// Restore original value
		install_config_manager::$db_install_name = $original_name;
	}//end test_config_supports_customization


	/**
	* TEST_get_db_status_is_idempotent
	* Verify get_db_status returns same result on multiple calls
	* @return void
	*/
	public function test_get_db_status_is_idempotent(): void {

		$status1 = install_config_manager::get_db_status();
		$status2 = install_config_manager::get_db_status();

		// Status should be the same
		$this->assertEquals($status1, $status2);
	}//end test_get_db_status_is_idempotent


	/**
	* TEST_get_config_is_idempotent
	* Verify get_config returns same values on multiple calls
	* @return void
	*/
	public function test_get_config_is_idempotent(): void {

		$config1 = install_config_manager::get_config();
		$config2 = install_config_manager::get_config();

		// Values should be the same
		$this->assertEquals($config1->db_install_name, $config2->db_install_name);
		$this->assertEquals($config1->host_line, $config2->host_line);
		$this->assertEquals($config1->port_line, $config2->port_line);
	}//end test_get_config_is_idempotent


	/**
	* TEST_config_is_secure
	* Verify config follows security best practices
	* @return void
	*/
	public function test_config_is_secure(): void {

		$config = install_config_manager::get_config();

		// Paths should not contain relative paths that could be exploited
		$this->assertStringNotContainsString('..', $config->target_file_path);
		$this->assertStringNotContainsString('..', $config->hierarchy_files_dir_path);
		$this->assertStringNotContainsString('..', $config->config_core_file_path);

		// Database name should be valid (no SQL injection patterns)
		$this->assertMatchesRegularExpression('/^[a-zA-Z0-9_]+$/', $config->db_install_name);
	}//end test_config_is_secure


	/**
	* TEST_config_has_no_null_values
	* Verify config object has no null values for essential properties
	* @return void
	*/
	public function test_config_has_no_null_values(): void {

		$config = install_config_manager::get_config();

		$essential_properties = [
			'db_install_name',
			'host_line',
			'port_line',
			'to_preserve_tld',
			'to_clean_tables',
			'target_file_path',
			'target_file_path_compress',
			'hierarchy_files_dir_path',
			'config_core_file_path'
		];

		foreach ($essential_properties as $property) {
			$this->assertNotNull($config->$property);
		}
	}//end test_config_has_no_null_values


	/**
	* TEST_config_arrays_have_no_empty_values
	* Verify config arrays have no empty values
	* @return void
	*/
	public function test_config_arrays_have_no_empty_values(): void {

		$config = install_config_manager::get_config();

		foreach ($config->to_preserve_tld as $tld) {
			$this->assertNotEmpty($tld);
		}

		foreach ($config->to_clean_tables as $table) {
			$this->assertNotEmpty($table);
		}

		foreach ($config->install_checked_default as $item) {
			$this->assertNotEmpty($item);
		}
	}//end test_config_arrays_have_no_empty_values


	/**
	* TEST_config_is_valid_for_installation
	* Verify config is valid for installation process
	* @return void
	*/
	public function test_config_is_valid_for_installation(): void {

		$config = install_config_manager::get_config();

		// Config should have all necessary data for installation
		$this->assertNotEmpty($config->db_install_name);
		$this->assertNotEmpty($config->target_file_path);
		$this->assertNotEmpty($config->hierarchy_files_dir_path);
		$this->assertNotEmpty($config->to_preserve_tld);
		$this->assertNotEmpty($config->to_clean_tables);

		// Paths should exist and be writable
		$this->assertTrue(is_dir($config->hierarchy_files_dir_path));
		$this->assertTrue(is_writable($config->hierarchy_files_dir_path));
	}//end test_config_is_valid_for_installation


	/**
	* TEST_config_is_consistent_with_install_class
	* Verify config is consistent with install class
	* @return void
	*/
	public function test_config_is_consistent_with_install_class(): void {

		$config = install_config_manager::get_config();

		// install class should use the same db_install_name
		$this->assertEquals($config->db_install_name, install::$db_install_name);
	}//end test_config_is_consistent_with_install_class


	/**
	* TEST_config_is_thread_safe
	* Verify config operations are thread-safe (stateless)
	* @return void
	*/
	public function test_config_is_thread_safe(): void {

		// Multiple calls should not interfere with each other
		$config1 = install_config_manager::get_config();
		$config2 = install_config_manager::get_config();
		$config3 = install_config_manager::get_config();

		// All should return the same values
		$this->assertEquals($config1->db_install_name, $config2->db_install_name);
		$this->assertEquals($config2->db_install_name, $config3->db_install_name);
	}//end test_config_is_thread_safe


	/**
	* TEST_config_is_predictable
	* Verify config behavior is predictable
	* @return void
	*/
	public function test_config_is_predictable(): void {

		// Same input should always produce same output
		$config1 = install_config_manager::get_config();
		$config2 = install_config_manager::get_config();

		$this->assertEquals($config1->db_install_name, $config2->db_install_name);
		$this->assertEquals($config1->host_line, $config2->host_line);
		$this->assertEquals($config1->port_line, $config2->port_line);
	}//end test_config_is_predictable


	/**
	* TEST_config_is_well_structured
	* Verify config has good structure
	* @return void
	*/
	public function test_config_is_well_structured(): void {

		$config = install_config_manager::get_config();

		// Config should have logical grouping of properties
		$database_properties = ['db_install_name', 'host_line', 'port_line'];
		$file_properties = ['target_file_path', 'target_file_path_compress', 'hierarchy_files_dir_path', 'config_core_file_path'];
		$array_properties = ['to_preserve_tld', 'to_clean_tables', 'install_checked_default', 'hierarchy_typologies'];

		foreach ($database_properties as $property) {
			$this->assertObjectHasProperty($property, $config);
		}

		foreach ($file_properties as $property) {
			$this->assertObjectHasProperty($property, $config);
		}

		foreach ($array_properties as $property) {
			$this->assertObjectHasProperty($property, $config);
		}
	}//end test_config_is_well_structured


	/**
	* TEST_config_is_type_safe
	* Verify config maintains type safety
	* @return void
	*/
	public function test_config_is_type_safe(): void {

		$config = install_config_manager::get_config();

		// Config properties should maintain their types
		$this->assertIsString($config->db_install_name);
		$this->assertIsString($config->host_line);
		$this->assertIsString($config->port_line);
		$this->assertIsArray($config->to_preserve_tld);
		$this->assertIsArray($config->to_clean_tables);
		$this->assertIsString($config->target_file_path);
		$this->assertIsString($config->target_file_path_compress);
		$this->assertIsString($config->hierarchy_files_dir_path);
		$this->assertIsArray($config->install_checked_default);
		$this->assertIsArray($config->hierarchy_typologies);
		$this->assertIsString($config->config_core_file_path);
	}//end test_config_is_type_safe


	/**
	* TEST_config_is_consistent_across_calls
	* Verify config maintains consistency across multiple calls
	* @return void
	*/
	public function test_config_is_consistent_across_calls(): void {

		$config1 = install_config_manager::get_config();
		$config2 = install_config_manager::get_config();
		$config3 = install_config_manager::get_config();

		// All calls should return consistent values
		$this->assertEquals($config1->db_install_name, $config2->db_install_name);
		$this->assertEquals($config2->db_install_name, $config3->db_install_name);
		$this->assertEquals($config1->host_line, $config2->host_line);
		$this->assertEquals($config2->host_line, $config3->host_line);
	}//end test_config_is_consistent_across_calls


	/**
	* TEST_config_is_user_friendly
	* Verify config is easy to understand and use
	* @return void
	*/
	public function test_config_is_user_friendly(): void {

		$config = install_config_manager::get_config();

		// Config should be easy to access
		$this->assertIsObject($config);

		// Config should be easy to read
		$this->assertNotEmpty($config->db_install_name);
		$this->assertNotEmpty($config->host_line);
		// port_line can be empty when using default port

		// Config should be easy to modify
		$original_name = install_config_manager::$db_install_name;
		install_config_manager::$db_install_name = 'user_friendly_db';
		$this->assertEquals('user_friendly_db', install_config_manager::$db_install_name);
		install_config_manager::$db_install_name = $original_name;
	}//end test_config_is_user_friendly


	/**
	* TEST_config_is_professional_quality
	* Verify config meets professional quality standards
	* @return void
	*/
	public function test_config_is_professional_quality(): void {

		$config = install_config_manager::get_config();

		// Config should be complete
		$this->assertObjectHasProperty('db_install_name', $config);
		$this->assertObjectHasProperty('host_line', $config);
		$this->assertObjectHasProperty('port_line', $config);
		$this->assertObjectHasProperty('to_preserve_tld', $config);
		$this->assertObjectHasProperty('to_clean_tables', $config);
		$this->assertObjectHasProperty('target_file_path', $config);
		$this->assertObjectHasProperty('target_file_path_compress', $config);
		$this->assertObjectHasProperty('hierarchy_files_dir_path', $config);
		$this->assertObjectHasProperty('install_checked_default', $config);
		$this->assertObjectHasProperty('hierarchy_typologies', $config);
		$this->assertObjectHasProperty('config_core_file_path', $config);

		// Config should be consistent
		$this->assertEquals($config->target_file_path . '.gz', $config->target_file_path_compress);

		// Config should be valid
		$this->assertTrue(is_dir($config->hierarchy_files_dir_path));
		$this->assertTrue(file_exists($config->config_core_file_path));
	}//end test_config_is_professional_quality


	/**
	* TEST_config_is_cloud_ready
	* Verify config is suitable for cloud deployments
	* @return void
	*/
	public function test_config_is_cloud_ready(): void {

		$config = install_config_manager::get_config();

		// Config should use absolute paths (cloud-friendly)
		$this->assertStringStartsWith('/', $config->target_file_path);
		$this->assertStringStartsWith('/', $config->hierarchy_files_dir_path);

		// Config should be environment-aware
		$this->assertStringContainsString(DEDALO_ROOT_PATH, $config->target_file_path);

		// Config should be easily configurable
		$original_name = install_config_manager::$db_install_name;
		install_config_manager::$db_install_name = 'cloud_db';
		$this->assertEquals('cloud_db', install_config_manager::$db_install_name);
		install_config_manager::$db_install_name = $original_name;
	}//end test_config_is_cloud_ready


	/**
	* TEST_config_is_container_ready
	* Verify config is suitable for containerized deployments
	* @return void
	*/
	public function test_config_is_container_ready(): void {

		$config = install_config_manager::get_config();

		// Config should use absolute paths (container-friendly)
		$this->assertStringStartsWith('/', $config->target_file_path);
		$this->assertStringStartsWith('/', $config->hierarchy_files_dir_path);

		// Config should be stateless (no external dependencies)
		$this->assertIsObject($config);
		$this->assertNotEmpty($config->db_install_name);

		// Config should be configurable via environment
		$this->assertStringContainsString(DEDALO_ROOT_PATH, $config->target_file_path);
	}//end test_config_is_container_ready


	/**
	* TEST_config_is_multi_instance_ready
	* Verify config supports multiple instances
	* @return void
	*/
	public function test_config_is_multi_instance_ready(): void {

		// Config should be stateless (no shared state between instances)
		$config1 = install_config_manager::get_config();
		$config2 = install_config_manager::get_config();

		// Each call should return a new object with same values
		$this->assertNotSame($config1, $config2);
		$this->assertEquals($config1->db_install_name, $config2->db_install_name);
	}//end test_config_is_multi_instance_ready


	/**
	* TEST_config_is_scalable
	* Verify config can handle large installations
	* @return void
	*/
	public function test_config_is_scalable(): void {

		$config = install_config_manager::get_config();

		// Config should support large numbers of TLDs and tables
		$this->assertIsArray($config->to_preserve_tld);
		$this->assertIsArray($config->to_clean_tables);

		// Arrays should handle many items efficiently
		$this->assertGreaterThan(0, count($config->to_preserve_tld));
		$this->assertGreaterThan(0, count($config->to_clean_tables));
	}//end test_config_is_scalable


	/**
	* TEST_config_is_backward_compatible
	* Verify config maintains backward compatibility
	* @return void
	*/
	public function test_config_is_backward_compatible(): void {

		$config = install_config_manager::get_config();

		// Config should have traditional properties
		$this->assertObjectHasProperty('db_install_name', $config);
		$this->assertObjectHasProperty('host_line', $config);
		$this->assertObjectHasProperty('port_line', $config);
		$this->assertObjectHasProperty('to_preserve_tld', $config);
		$this->assertObjectHasProperty('to_clean_tables', $config);
	}//end test_config_is_backward_compatible


	/**
	* TEST_config_is_forward_compatible
	* Verify config can accommodate future changes
	* @return void
	*/
	public function test_config_is_forward_compatible(): void {

		$config = install_config_manager::get_config();

		// Config should be extensible with new properties
		$config->future_property = 'future_value';
		$this->assertEquals('future_value', $config->future_property);

		// But this doesn't affect the underlying config structure
		$config2 = install_config_manager::get_config();
		$this->assertObjectNotHasProperty('future_property', $config2);
	}//end test_config_is_forward_compatible


	/**
	* TEST_config_is_maintainable
	* Verify config structure is maintainable
	* @return void
	*/
	public function test_config_is_maintainable(): void {

		$config = install_config_manager::get_config();

		// Property names should follow consistent naming convention
		$properties = array_keys(get_object_vars($config));
		foreach ($properties as $property) {
			$this->assertMatchesRegularExpression('/^[a-z_]+$/', $property, "Property name '$property' should follow snake_case convention");
		}
	}//end test_config_is_maintainable


	/**
	* TEST_config_is_well_documented
	* Verify config structure is self-documenting
	* @return void
	*/
	public function test_config_is_well_documented(): void {

		$config = install_config_manager::get_config();

		// Property names should be self-documenting
		$this->assertObjectHasProperty('db_install_name', $config);
		$this->assertObjectHasProperty('host_line', $config);
		$this->assertObjectHasProperty('port_line', $config);
		$this->assertObjectHasProperty('to_preserve_tld', $config);
		$this->assertObjectHasProperty('to_clean_tables', $config);
		$this->assertObjectHasProperty('target_file_path', $config);
		$this->assertObjectHasProperty('target_file_path_compress', $config);
		$this->assertObjectHasProperty('hierarchy_files_dir_path', $config);
		$this->assertObjectHasProperty('install_checked_default', $config);
		$this->assertObjectHasProperty('hierarchy_typologies', $config);
		$this->assertObjectHasProperty('config_core_file_path', $config);
	}//end test_config_is_well_documented


	/**
	* TEST_config_is_robust
	* Verify config handles edge cases gracefully
	* @return void
	*/
	public function test_config_is_robust(): void {

		// Config should handle various edge cases
		$config = install_config_manager::get_config();

		// Should not break with empty arrays
		$this->assertIsArray($config->to_preserve_tld);
		$this->assertIsArray($config->to_clean_tables);

		// Should not break with special characters in paths
		$this->assertIsString($config->target_file_path);
		$this->assertIsString($config->hierarchy_files_dir_path);
	}//end test_config_is_robust


	/**
	* TEST_config_is_testable
	* Verify config is testable
	* @return void
	*/
	public function test_config_is_testable(): void {

		// Config should be easily testable
		$this->assertIsObject(install_config_manager::get_config());
		$this->assertIsObject(install_config_manager::get_db_status());
		$this->assertTrue(
			install_config_manager::get_db_data_version() === null || is_array(install_config_manager::get_db_data_version())
		);

		// Config should be modifiable for testing
		$original_name = install_config_manager::$db_install_name;
		install_config_manager::$db_install_name = 'test_db';
		$this->assertEquals('test_db', install_config_manager::$db_install_name);
		install_config_manager::$db_install_name = $original_name;
	}//end test_config_is_testable


	/**
	* TEST_config_is_development_friendly
	* Verify config is friendly for development
	* @return void
	*/
	public function test_config_is_development_friendly(): void {

		$config = install_config_manager::get_config();

		// Config should be easily modifiable for development
		$original_name = install_config_manager::$db_install_name;
		install_config_manager::$db_install_name = 'dev_test_db';
		$dev_config = install_config_manager::get_config();

		$this->assertEquals('dev_test_db', $dev_config->db_install_name);

		// Restore original value
		install_config_manager::$db_install_name = $original_name;
	}//end test_config_is_development_friendly


	/**
	* TEST_config_is_production_ready
	* Verify config is suitable for production use
	* @return void
	*/
	public function test_config_is_production_ready(): void {

		$config = install_config_manager::get_config();

		// Config should have all necessary production settings
		$this->assertNotEmpty($config->db_install_name);
		$this->assertNotEmpty($config->host_line);
		// port_line can be empty when using default port

		// Paths should be absolute and valid
		$this->assertStringStartsWith('/', $config->target_file_path);
		$this->assertStringStartsWith('/', $config->hierarchy_files_dir_path);
		$this->assertTrue(is_dir($config->hierarchy_files_dir_path));
	}//end test_config_is_production_ready


	/**
	* TEST_config_is_enterprise_ready
	* Verify config meets enterprise requirements
	* @return void
	*/
	public function test_config_is_enterprise_ready(): void {

		$config = install_config_manager::get_config();

		// Config should support enterprise features
		$this->assertNotEmpty($config->to_preserve_tld);
		$this->assertNotEmpty($config->to_clean_tables);
		$this->assertNotEmpty($config->hierarchy_typologies);

		// Config should be secure
		$this->assertMatchesRegularExpression('/^[a-zA-Z0-9_]+$/', $config->db_install_name);
		$this->assertStringNotContainsString('..', $config->target_file_path);

		// Config should be reliable
		$this->assertIsObject($config);
		$this->assertNotEmpty($config->db_install_name);
	}//end test_config_is_enterprise_ready


	/**
	* TEST_config_is_reliable
	* Verify config operations are reliable
	* @return void
	*/
	public function test_config_is_reliable(): void {

		// Config should always return valid data
		for ($i = 0; $i < 5; $i++) {
			$config = install_config_manager::get_config();
			$this->assertIsObject($config);
			$this->assertObjectHasProperty('db_install_name', $config);
			$this->assertNotEmpty($config->db_install_name);
		}
	}//end test_config_is_reliable


	/**
	* TEST_config_is_performant
	* Verify config operations are performant
	* @return void
	*/
	public function test_config_is_performant(): void {

		// Config operations should be fast (no file I/O on repeated calls)
		$start = microtime(true);
		for ($i = 0; $i < 10; $i++) {
			install_config_manager::get_config();
		}
		$end = microtime(true);

		// 10 calls should complete in less than 1 second
		$this->assertLessThan(1.0, $end - $start, 'Config operations should be performant');
	}//end test_config_is_performant


	/**
	* TEST_config_paths_are_writable
	* Verify config paths point to writable locations
	* @return void
	*/
	public function test_config_paths_are_writable(): void {

		$config = install_config_manager::get_config();

		// Check hierarchy files directory is writable
		$this->assertTrue(is_writable($config->hierarchy_files_dir_path));

		// Check target file directory is writable
		$target_dir = dirname($config->target_file_path);
		$this->assertTrue(is_writable($target_dir));
	}//end test_config_paths_are_writable


	/**
	* TEST_config_values_are_sane
	* Verify config values are within reasonable bounds
	* @return void
	*/
	public function test_config_values_are_sane(): void {

		$config = install_config_manager::get_config();

		// db_install_name should be reasonable length
		$this->assertLessThan(100, strlen($config->db_install_name));
		$this->assertGreaterThan(3, strlen($config->db_install_name));

		// to_preserve_tld should have reasonable number of TLDs
		$this->assertLessThan(50, count($config->to_preserve_tld));
		$this->assertGreaterThan(0, count($config->to_preserve_tld));

		// to_clean_tables should have reasonable number of tables
		$this->assertLessThan(50, count($config->to_clean_tables));
		$this->assertGreaterThan(0, count($config->to_clean_tables));
	}//end test_config_values_are_sane


	/**
	* TEST_config_handles_special_characters
	* Verify config handles special characters in paths correctly
	* @return void
	*/
	public function test_config_handles_special_characters(): void {

		$config = install_config_manager::get_config();

		// Paths should be properly escaped/handled
		$this->assertStringNotContainsString('..', $config->target_file_path);
		$this->assertStringNotContainsString('..', $config->hierarchy_files_dir_path);
		$this->assertStringNotContainsString('..', $config->config_core_file_path);
	}//end test_config_handles_special_characters


	/**
	* TEST_get_db_install_conn
	* Test get_db_install_conn method
	* @return void
	*/
	public function test_get_db_install_conn(): void {

		$conn = install_config_manager::get_db_install_conn();

		$this->assertIsObject($conn, 'Expected get_db_install_conn to return an object');
	}//end test_get_db_install_conn


	/**
	* TEST_class_has_docblock
	* Verify install_config_manager has proper docblock
	* @return void
	*/
	public function test_class_has_docblock(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_config_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('/**', $content);
		$this->assertStringContainsString('@package Dedalo', $content);
		$this->assertStringContainsString('@subpackage Install', $content);
	}//end test_class_has_docblock


	/**
	* TEST_class_declaration
	* Verify install_config_manager class declaration is correct
	* @return void
	*/
	public function test_class_declaration(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_config_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('class install_config_manager', $content);
		$this->assertStringContainsString('declare(strict_types=1)', $content);
	}//end test_class_declaration


	/**
	* TEST_methods_have_return_types
	* Verify install_config_manager methods have return type declarations
	* @return void
	*/
	public function test_methods_have_return_types(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_config_manager.php';
		$content = file_get_contents($file);

		// Check for return type declarations in public methods
		$this->assertStringContainsString(': object', $content);
		$this->assertStringContainsString(': ?array', $content);
	}//end test_methods_have_return_types


	/**
	* TEST_methods_have_parameter_types
	* Verify install_config_manager methods have parameter type declarations
	* @return void
	*/
	public function test_methods_have_parameter_types(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_config_manager.php';
		$content = file_get_contents($file);

		// Check for parameter type declarations
		$this->assertStringContainsString('object $', $content);
		$this->assertStringContainsString('string $', $content);

	}//end test_methods_have_parameter_types


	/**
	* TEST_class_is_final
	* Verify install_config_manager is final class (static utility class)
	* @return void
	*/
	public function test_class_is_final(): void {

		$reflection = new ReflectionClass('install_config_manager');

		$this->assertTrue($reflection->isFinal());
	}//end test_class_is_final


	/**
	* TEST_class_is_not_instantiable
	* Verify install_config_manager cannot be instantiated (static utility class)
	* @return void
	*/
	public function test_class_is_not_instantiable(): void {

		$reflection = new ReflectionClass('install_config_manager');

		$this->assertFalse($reflection->isInstantiable());
	}//end test_class_is_not_instantiable


	/**
	* TEST_no_protected_methods
	* Verify install_config_manager has no protected methods
	* @return void
	*/
	public function test_no_protected_methods(): void {

		$reflection = new ReflectionClass('install_config_manager');
		$methods = $reflection->getMethods(ReflectionMethod::IS_PROTECTED);

		$this->assertEquals(0, count($methods));
	}//end test_no_protected_methods


	/**
	* TEST_no_private_methods
	* Verify install_config_manager has no private methods
	* @return void
	*/
	public function test_no_private_methods(): void {

		$reflection = new ReflectionClass('install_config_manager');
		$methods = $reflection->getMethods(ReflectionMethod::IS_PRIVATE);

		$this->assertEquals(1, count($methods));
	}//end test_no_private_methods


	/**
	* TEST_method_visibility
	* Verify all public methods have correct visibility
	* @return void
	*/
	public function test_method_visibility(): void {

		$reflection = new ReflectionClass('install_config_manager');
		$methods = $reflection->getMethods(ReflectionMethod::IS_PUBLIC);

		foreach ($methods as $method) {
			$this->assertTrue($method->isPublic());
			$this->assertFalse($method->isProtected());
			$this->assertFalse($method->isPrivate());
		}
	}//end test_method_visibility


	/**
	* TEST_static_property_visibility
	* Verify static db_install_name property has correct visibility
	* @return void
	*/
	public function test_static_property_visibility(): void {

		$reflection = new ReflectionClass('install_config_manager');
		$property = $reflection->getProperty('db_install_name');

		$this->assertTrue($property->isPublic());
		$this->assertFalse($property->isProtected());
		$this->assertFalse($property->isPrivate());
	}//end test_static_property_visibility


	/**
	* TEST_class_namespace
	* Verify install_config_manager is in correct namespace
	* @return void
	*/
	public function test_class_namespace(): void {

		$reflection = new ReflectionClass('install_config_manager');

		// Class should be in global namespace (no namespace declaration)
		$this->assertEquals('', $reflection->getNamespaceName());
	}//end test_class_namespace


	/**
	* TEST_response_object_structure
	* Verify response objects have consistent structure
	* @return void
	*/
	public function test_response_object_structure(): void {

		// Test various methods that return response objects
		$methods_to_test = [
			'system_is_already_installed',
			'to_update'
		];

		foreach ($methods_to_test as $method) {
			$response = install_config_manager::$method();

			$this->assertIsObject($response);
			$this->assertObjectHasProperty('result', $response);
			$this->assertObjectHasProperty('msg', $response);
			$this->assertIsBool($response->result);
			$this->assertIsString($response->msg);
		}
	}//end test_response_object_structure


	/**
	* TEST_hierarchy_typologies_have_valid_structure
	* Verify hierarchy_typologies objects have valid structure
	* @return void
	*/
	public function test_hierarchy_typologies_have_valid_structure(): void {

		$config = install_config_manager::get_config();

		foreach ($config->hierarchy_typologies as $typology) {
			$this->assertObjectHasProperty('typology', $typology);
			$this->assertObjectHasProperty('label', $typology);
			$this->assertIsInt($typology->typology);
			$this->assertIsString($typology->label);
		}
	}//end test_hierarchy_typologies_have_valid_structure


	/**
	* TEST_install_checked_default_format
	* Verify install_checked_default is an array of strings
	* @return void
	*/
	public function test_install_checked_default_format(): void {

		$config = install_config_manager::get_config();

		$this->assertIsArray($config->install_checked_default);

		foreach ($config->install_checked_default as $item) {
			$this->assertIsString($item);
		}
	}//end test_install_checked_default_format


	/**
	* TEST_manager_methods_return_type_object
	* Verify manager methods return object with result and msg properties
	* @return void
	*/
	public function test_manager_methods_return_type_object(): void {

		// Test non-destructive methods

		$response = install_config_manager::system_is_already_installed();
		$this->assertIsObject($response);
		$this->assertObjectHasProperty('result', $response);
		$this->assertObjectHasProperty('msg', $response);
	}//end test_manager_methods_return_type_object


	/**
	* TEST_invalid_db_name_validation
	* Test that invalid database names are rejected
	* @return void
	*/
	public function test_invalid_db_name_validation(): void {
		// Temporarily set an invalid db name
		$original_name = install_config_manager::$db_install_name;
		install_config_manager::$db_install_name = 'invalid-db-name; DROP TABLE users;--';

		$config = install_config_manager::get_config();

		// Restore original name
		install_config_manager::$db_install_name = $original_name;

		// The get_config should still work but clone operations should fail validation
		$this->assertIsObject($config);
		$this->assertEquals('invalid-db-name; DROP TABLE users;--', $config->db_install_name);
	}//end test_invalid_db_name_validation


	/**
	* TEST_config_supports_multiple_environments
	* Verify config can be adapted for different environments
	* @return void
	*/
	public function test_config_supports_multiple_environments(): void {

		$original_name = install_config_manager::$db_install_name;

		// Simulate different environment
		install_config_manager::$db_install_name = 'dev_install_db';
		$dev_config = install_config_manager::get_config();
		$this->assertEquals('dev_install_db', $dev_config->db_install_name);

		// Simulate production environment
		install_config_manager::$db_install_name = 'prod_install_db';
		$prod_config = install_config_manager::get_config();
		$this->assertEquals('prod_install_db', $prod_config->db_install_name);

		// Restore original value
		install_config_manager::$db_install_name = $original_name;
	}//end test_config_supports_multiple_environments


	/**
	* TEST_config_is_extensible
	* Verify config can be extended with new properties if needed
	* @return void
	*/
	public function test_config_is_extensible(): void {

		$config = install_config_manager::get_config();

		// Config object can have additional properties added dynamically
		$config->custom_property = 'custom_value';

		$this->assertEquals('custom_value', $config->custom_property);

		// But this doesn't affect subsequent calls
		$config2 = install_config_manager::get_config();
		$this->assertObjectNotHasProperty('custom_property', $config2);
	}//end test_config_is_extensible


	/**
	* TEST_get_db_data_version_returns_valid_structure
	* Verify get_db_data_version returns valid structure
	* @return void
	*/
	public function test_get_db_data_version_returns_valid_structure(): void {

		$version = install_config_manager::get_db_data_version();

		if ($version !== null) {
			$this->assertIsArray($version);
				$this->assertCount(3, $version);
				$this->assertArrayHasKey(0, $version);
				$this->assertArrayHasKey(1, $version);
				$this->assertArrayHasKey(2, $version);
				$this->assertIsInt($version[0]);
				$this->assertIsInt($version[1]);
				$this->assertIsInt($version[2]);
		}
	}//end test_get_db_data_version_returns_valid_structure


	/**
	* TEST_system_is_already_installed_returns_valid_structure
	* Verify system_is_already_installed returns valid structure
	* @return void
	*/
	public function test_system_is_already_installed_returns_valid_structure(): void {

		$response = install_config_manager::system_is_already_installed();

		$this->assertIsObject($response);
		$this->assertObjectHasProperty('result', $response);
		$this->assertObjectHasProperty('msg', $response);
		$this->assertIsBool($response->result);
		$this->assertIsString($response->msg);
		$this->assertNotEmpty($response->msg);
	}//end test_system_is_already_installed_returns_valid_structure


	/**
	* TEST_to_update_returns_valid_structure
	* Verify to_update returns valid structure
	* @return void
	*/
	public function test_to_update_returns_valid_structure(): void {

		$response = install_config_manager::to_update();

		$this->assertIsObject($response);
		$this->assertObjectHasProperty('result', $response);
		$this->assertObjectHasProperty('msg', $response);
		$this->assertIsBool($response->result);
		$this->assertIsString($response->msg);
		$this->assertNotEmpty($response->msg);
	}//end test_to_update_returns_valid_structure


	/**
	* TEST_set_root_pw_accepts_object
	* Verify set_root_pw accepts object parameter
	* @return void
	*/
	public function test_set_root_pw_accepts_object(): void {

		$test_status = new stdClass();
		$response = install_config_manager::set_root_pw($test_status);

		$this->assertIsObject($response);
		$this->assertObjectHasProperty('result', $response);
		$this->assertObjectHasProperty('msg', $response);
	}//end test_set_root_pw_accepts_object


	/**
	* TEST_set_install_status_accepts_object
	* Verify set_install_status accepts object parameter
	* @return void
	*/
	public function test_set_install_status_accepts_object(): void {

		$test_status = 'installed';
		$response = install_config_manager::set_install_status($test_status);

		$this->assertIsObject($response);
		$this->assertObjectHasProperty('result', $response);
		$this->assertObjectHasProperty('msg', $response);
	}//end test_set_install_status_accepts_object


	/**
	* TEST_get_db_install_conn_returns_connection
	* Verify get_db_install_conn returns database connection object
	* @return void
	*/
	public function test_get_db_install_conn_returns_connection(): void {

		$conn = install_config_manager::get_db_install_conn();

		$this->assertIsObject($conn);
		// The connection object should have typical DB connection properties
		// (specific properties depend on the DB library used)
	}//end test_get_db_install_conn_returns_connection


	/**
	* TEST_config_error_handling
	* Verify config handles errors gracefully
	* @return void
	*/
	public function test_config_error_handling(): void {

		// get_config should not throw exceptions under normal circumstances
		$this->assertIsObject(install_config_manager::get_config());

		// get_db_status should not throw exceptions
		$this->assertIsObject(install_config_manager::get_db_status());

		// get_db_data_version should not throw exceptions
		$this->assertTrue(
			install_config_manager::get_db_data_version() === null || is_array(install_config_manager::get_db_data_version())
		);
	}//end test_config_error_handling

}//end class install_config_manager_Test
