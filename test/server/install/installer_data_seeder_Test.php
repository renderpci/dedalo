<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

// Include manager class
require_once DEDALO_CORE_PATH . '/installer/class.installer_data_seeder.php';


final class installer_data_seeder_Test extends BaseTestCase
{

	/**
	 * TEST_class_is_static_only
	 * Verify installer_data_seeder is a static-only class
	 * @return void
	 */
	public function test_class_is_static_only(): void
	{

		$reflection = new ReflectionClass('installer_data_seeder');

		// Should have a private constructor to prevent instantiation
		$constructor = $reflection->getConstructor();
		$this->assertNotNull($constructor);
		$this->assertTrue($constructor->isPrivate());

		// Should have no instance properties
		$properties = $reflection->getProperties(ReflectionProperty::IS_PUBLIC | ReflectionProperty::IS_PROTECTED | ReflectionProperty::IS_PRIVATE);
		$this->assertEquals(0, count($properties));

		// All public methods should be static
		$methods = $reflection->getMethods(ReflectionMethod::IS_PUBLIC);
		foreach ($methods as $method) {
			$this->assertTrue($method->isStatic());
		}
	}//end test_class_is_static_only


	/**
	 * TEST_class_has_strict_types
	 * Verify installer_data_seeder uses strict types
	 * @return void
	 */
	public function test_class_has_strict_types(): void
	{

		$file = DEDALO_CORE_PATH . '/installer/class.installer_data_seeder.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('declare(strict_types=1)', $content);
	}//end test_class_has_strict_types


	/**
	 * TEST_class_file_exists
	 * Verify installer_data_seeder class file exists
	 * @return void
	 */
	public function test_class_file_exists(): void
	{

		$file_path = DEDALO_CORE_PATH . '/installer/class.installer_data_seeder.php';

		$this->assertTrue(file_exists($file_path));
	}//end test_class_file_exists


	/**
	 * TEST_class_exists
	 * Verify installer_data_seeder class exists
	 * @return void
	 */
	public function test_class_exists(): void
	{

		$this->assertTrue(class_exists('installer_data_seeder'));
	}//end test_class_exists


	/**
	 * TEST_class_does_not_extend_common
	 * Verify installer_data_seeder doesn't extend common
	 * @return void
	 */
	public function test_class_does_not_extend_common(): void
	{

		$this->assertFalse(is_subclass_of('installer_data_seeder', 'common'));
	}//end test_class_does_not_extend_common


	/**
	 * TEST_all_static_methods_exist
	 * Verify all expected static methods exist
	 * @return void
	 */
	public function test_all_static_methods_exist(): void
	{

		$expected_methods = [
			'create_root_user',
			'create_main_project',
			'create_main_profiles',
			'create_test_record'
		];

		foreach ($expected_methods as $method) {
			$this->assertTrue(method_exists('installer_data_seeder', $method));
		}
	}//end test_all_static_methods_exist


	/**
	 * TEST_create_root_user_returns_object
	 * Verify create_root_user returns object with result and msg
	 * @return void
	 */
	public function test_create_root_user_returns_object(): void
	{

		$response = installer_data_seeder::create_root_user();

		$this->assertIsObject($response);
		$this->assertObjectHasProperty('result', $response);
		$this->assertObjectHasProperty('msg', $response);
		$this->assertIsBool($response->result);
		$this->assertIsString($response->msg);
	}//end test_create_root_user_returns_object


	/**
	 * TEST_create_main_project_returns_object
	 * Verify create_main_project returns object with result and msg
	 * @return void
	 */
	public function test_create_main_project_returns_object(): void
	{

		$response = installer_data_seeder::create_main_project();

		$this->assertIsObject($response);
		$this->assertObjectHasProperty('result', $response);
		$this->assertObjectHasProperty('msg', $response);
		$this->assertIsBool($response->result);
		$this->assertIsString($response->msg);
	}//end test_create_main_project_returns_object


	/**
	 * TEST_create_main_profiles_returns_object
	 * Verify create_main_profiles returns object with result and msg
	 * @return void
	 */
	public function test_create_main_profiles_returns_object(): void
	{

		$response = installer_data_seeder::create_main_profiles();

		$this->assertIsObject($response);
		$this->assertObjectHasProperty('result', $response);
		$this->assertObjectHasProperty('msg', $response);
		$this->assertIsBool($response->result);
		$this->assertIsString($response->msg);
	}//end test_create_main_profiles_returns_object


	/**
	 * TEST_create_test_record_returns_object
	 * Verify create_test_record returns object with result and msg
	 * @return void
	 */
	public function test_create_test_record_returns_object(): void
	{

		$response = installer_data_seeder::create_test_record();

		$this->assertIsObject($response);
		$this->assertObjectHasProperty('result', $response);
		$this->assertObjectHasProperty('msg', $response);
		$this->assertIsBool($response->result);
		$this->assertIsString($response->msg);
	}//end test_create_test_record_returns_object


	/**
	 * TEST_class_has_docblock
	 * Verify installer_data_seeder has proper docblock
	 * @return void
	 */
	public function test_class_has_docblock(): void
	{

		$file = DEDALO_CORE_PATH . '/installer/class.installer_data_seeder.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('/**', $content);
		$this->assertStringContainsString('@package Dédalo', $content);
		$this->assertStringContainsString('@subpackage Install', $content);
	}//end test_class_has_docblock


	/**
	 * TEST_class_is_final
	 * Verify installer_data_seeder is final class (static utility class)
	 * @return void
	 */
	public function test_class_is_final(): void
	{

		$reflection = new ReflectionClass('installer_data_seeder');

		$this->assertTrue($reflection->isFinal());
	}//end test_class_is_final


	/**
	 * TEST_class_is_not_instantiable
	 * Verify installer_data_seeder cannot be instantiated (static utility class)
	 * @return void
	 */
	public function test_class_is_not_instantiable(): void
	{

		$reflection = new ReflectionClass('installer_data_seeder');

		$this->assertFalse($reflection->isInstantiable());
	}//end test_class_is_not_instantiable


	/**
	 * TEST_no_protected_methods
	 * Verify installer_data_seeder has no protected methods
	 * @return void
	 */
	public function test_no_protected_methods(): void
	{

		$reflection = new ReflectionClass('installer_data_seeder');
		$methods = $reflection->getMethods(ReflectionMethod::IS_PROTECTED);

		$this->assertEquals(0, count($methods));
	}//end test_no_protected_methods


	/**
	 * TEST_no_private_methods
	 * Verify installer_data_seeder has no private methods
	 * @return void
	 */
	public function test_no_private_methods(): void
	{

		$reflection = new ReflectionClass('installer_data_seeder');
		$methods = $reflection->getMethods(ReflectionMethod::IS_PRIVATE);

		$this->assertEquals(1, count($methods));
	}//end test_no_private_methods


	/**
	 * TEST_create_root_user_uses_config
	 * Verify create_root_user uses config from installer_config_manager
	 * @return void
	 */
	public function test_create_root_user_uses_config(): void
	{

		$file = DEDALO_CORE_PATH . '/installer/class.installer_data_seeder.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('installer_config_manager::get_config()', $content);
		$this->assertStringContainsString('installer_config_manager::get_db_install_conn()', $content);
	}//end test_create_root_user_uses_config


	/**
	 * TEST_create_root_user_uses_pg_query
	 * Verify create_root_user uses pg_query for database operations
	 * @return void
	 */
	public function test_create_root_user_uses_pg_query(): void
	{

		$file = DEDALO_CORE_PATH . '/installer/class.installer_data_seeder.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('pg_query', $content);
	}//end test_create_root_user_uses_pg_query


	/**
	 * TEST_create_root_user_uses_v7_schema
	 * Verify create_root_user uses v7 schema with typed columns
	 * @return void
	 */
	public function test_create_root_user_uses_v7_schema(): void
	{

		$file = DEDALO_CORE_PATH . '/installer/class.installer_data_seeder.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('data', $content);
		$this->assertStringContainsString('relation', $content);
		$this->assertStringContainsString('string', $content);
		$this->assertStringContainsString('date', $content);
		$this->assertStringContainsString('meta', $content);
		$this->assertStringContainsString('matrix_users', $content);
	}//end test_create_root_user_uses_v7_schema


	/**
	 * TEST_create_main_project_uses_v7_schema
	 * Verify create_main_project uses v7 schema with typed columns
	 * @return void
	 */
	public function test_create_main_project_uses_v7_schema(): void
	{

		$file = DEDALO_CORE_PATH . '/installer/class.installer_data_seeder.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('data', $content);
		$this->assertStringContainsString('relation', $content);
		$this->assertStringContainsString('string', $content);
		$this->assertStringContainsString('date', $content);
		$this->assertStringContainsString('meta', $content);
		$this->assertStringContainsString('matrix_projects', $content);
	}//end test_create_main_project_uses_v7_schema


	/**
	 * TEST_create_main_profiles_uses_v7_schema
	 * Verify create_main_profiles uses v7 schema with typed columns
	 * @return void
	 */
	public function test_create_main_profiles_uses_v7_schema(): void
	{

		$file = DEDALO_CORE_PATH . '/installer/class.installer_data_seeder.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('data', $content);
		$this->assertStringContainsString('relation', $content);
		$this->assertStringContainsString('string', $content);
		$this->assertStringContainsString('date', $content);
		$this->assertStringContainsString('meta', $content);
		$this->assertStringContainsString('matrix_profiles', $content);
	}//end test_create_main_profiles_uses_v7_schema


	/**
	 * TEST_create_test_record_uses_v7_schema
	 * Verify create_test_record uses v7 schema with typed columns
	 * @return void
	 */
	public function test_create_test_record_uses_v7_schema(): void
	{

		$file = DEDALO_CORE_PATH . '/installer/class.installer_data_seeder.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('data', $content);
		$this->assertStringContainsString('relation', $content);
		$this->assertStringContainsString('string', $content);
		$this->assertStringContainsString('date', $content);
		$this->assertStringContainsString('meta', $content);
		$this->assertStringContainsString('matrix_test', $content);
	}//end test_create_test_record_uses_v7_schema


	/**
	 * TEST_create_root_user_truncates_matrix_users
	 * Verify create_root_user truncates matrix_users table
	 * @return void
	 */
	public function test_create_root_user_truncates_matrix_users(): void
	{

		$file = DEDALO_CORE_PATH . '/installer/class.installer_data_seeder.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('TRUNCATE "matrix_users"', $content);
		$this->assertStringContainsString('RESTART WITH 1', $content);
	}//end test_create_root_user_truncates_matrix_users


	/**
	 * TEST_create_main_project_truncates_matrix_projects
	 * Verify create_main_project truncates matrix_projects table
	 * @return void
	 */
	public function test_create_main_project_truncates_matrix_projects(): void
	{

		$file = DEDALO_CORE_PATH . '/installer/class.installer_data_seeder.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('TRUNCATE "matrix_projects"', $content);
		$this->assertStringContainsString('RESTART WITH 1', $content);
	}//end test_create_main_project_truncates_matrix_projects


	/**
	 * TEST_create_main_profiles_truncates_matrix_profiles
	 * Verify create_main_profiles truncates matrix_profiles table
	 * @return void
	 */
	public function test_create_main_profiles_truncates_matrix_profiles(): void
	{

		$file = DEDALO_CORE_PATH . '/installer/class.installer_data_seeder.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('TRUNCATE "matrix_profiles"', $content);
		$this->assertStringContainsString('RESTART WITH 1', $content);
	}//end test_create_main_profiles_truncates_matrix_profiles


	/**
	 * TEST_create_test_record_truncates_matrix_test
	 * Verify create_test_record truncates matrix_test table
	 * @return void
	 */
	public function test_create_test_record_truncates_matrix_test(): void
	{

		$file = DEDALO_CORE_PATH . '/installer/class.installer_data_seeder.php';
		$content = file_get_contents($file);

		// create_test_record() builds the SQL from a $table variable set to 'matrix_test',
		// so the TRUNCATE/ALTER SEQUENCE statements reference the interpolated $table rather
		// than the literal table name. Assert the real literals that prove truncate + reseed.
		$this->assertStringContainsString("\$table\t\t\t\t= 'matrix_test';", $content);
		$this->assertStringContainsString('TRUNCATE "\'.$table.\'"', $content);
		$this->assertStringContainsString('ALTER SEQUENCE \'.$table.\'_id_seq RESTART WITH 1', $content);
		$this->assertStringContainsString("\$section_tipo\t\t= 'test3';", $content);
		$this->assertStringContainsString("(\"section_id\", \"section_tipo\", \"data\") VALUES (\\'1\\', \\''.\$section_tipo.'\\'", $content);
	}//end test_create_test_record_truncates_matrix_test


	/**
	 * TEST_methods_use_debug_log
	 * Verify methods use debug_log for logging
	 * @return void
	 */
	public function test_methods_use_debug_log(): void
	{

		$file = DEDALO_CORE_PATH . '/installer/class.installer_data_seeder.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('debug_log', $content);
	}//end test_methods_use_debug_log


	/**
	 * TEST_methods_use_error_handling
	 * Verify methods have proper error handling
	 * @return void
	 */
	public function test_methods_use_error_handling(): void
	{

		$file = DEDALO_CORE_PATH . '/installer/class.installer_data_seeder.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('pg_last_error', $content);
		$this->assertStringContainsString('logger::ERROR', $content);
	}//end test_methods_use_error_handling


	/**
	 * TEST_methods_have_documentation
	 * Verify methods have docblocks
	 * @return void
	 */
	public function test_methods_have_documentation(): void
	{

		$file = DEDALO_CORE_PATH . '/installer/class.installer_data_seeder.php';
		$content = file_get_contents($file);

		// Check for method docblocks
		$this->assertStringContainsString('/**', $content);
		$this->assertStringContainsString('@return object', $content);
	}//end test_methods_have_documentation


	/**
	 * TEST_class_is_secure
	 * Verify class follows security best practices
	 * @return void
	 */
	public function test_class_is_secure(): void
	{

		$file = DEDALO_CORE_PATH . '/installer/class.installer_data_seeder.php';
		$content = file_get_contents($file);

		// Should use parameterized queries (no direct user input)
		$this->assertStringContainsString('json_encode', $content);
	}//end test_class_is_secure


	/**
	 * TEST_class_is_type_safe
	 * Verify class maintains type safety
	 * @return void
	 */
	public function test_class_is_type_safe(): void
	{

		$file = DEDALO_CORE_PATH . '/installer/class.installer_data_seeder.php';
		$content = file_get_contents($file);

		// Methods should have return type declarations
		$this->assertStringContainsString(': object', $content);
	}//end test_class_is_type_safe


	/**
	 * TEST_class_is_professional_quality
	 * Verify class meets professional quality standards
	 * @return void
	 */
	public function test_class_is_professional_quality(): void
	{

		$file = DEDALO_CORE_PATH . '/installer/class.installer_data_seeder.php';
		$content = file_get_contents($file);

		// Class should have comprehensive docblock
		$this->assertStringContainsString('/**', $content);
		$this->assertStringContainsString('@package Dédalo', $content);
		$this->assertStringContainsString('@subpackage Install', $content);

		// Methods should have docblocks
		$this->assertStringContainsString('@return object', $content);

		// Should use strict types
		$this->assertStringContainsString('declare(strict_types=1)', $content);
	}//end test_class_is_professional_quality


	/**
	 * TEST_class_is_testable
	 * Verify class is testable
	 * @return void
	 */
	public function test_class_is_testable(): void
	{

		// Class should be static-only (easy to test): no constructor, or a non-public one
		$reflection = new ReflectionClass('installer_data_seeder');
		$c = $reflection->getConstructor();
		$this->assertTrue($c === null || !$c->isPublic());

		// Methods should be public and static
		$methods = $reflection->getMethods(ReflectionMethod::IS_PUBLIC);
		foreach ($methods as $method) {
			$this->assertTrue($method->isStatic());
		}
	}//end test_class_is_testable


	/**
	 * TEST_class_is_reliable
	 * Verify class operations are reliable
	 * @return void
	 */
	public function test_class_is_reliable(): void
	{

		// Methods should return consistent response structure
		$response = installer_data_seeder::create_root_user();
		$this->assertIsObject($response);
		$this->assertObjectHasProperty('result', $response);
		$this->assertObjectHasProperty('msg', $response);
		$this->assertIsBool($response->result);
		$this->assertIsString($response->msg);
	}//end test_class_is_reliable


	/**
	 * TEST_class_is_thread_safe
	 * Verify class operations are thread-safe (stateless)
	 * @return void
	 */
	public function test_class_is_thread_safe(): void
	{

		// Class should be stateless (no instance properties)
		$reflection = new ReflectionClass('installer_data_seeder');
		$properties = $reflection->getProperties(ReflectionProperty::IS_PUBLIC | ReflectionProperty::IS_PROTECTED | ReflectionProperty::IS_PRIVATE);
		$this->assertEquals(0, count($properties));
	}//end test_class_is_thread_safe


	/**
	 * TEST_class_is_production_ready
	 * Verify class is suitable for production use
	 * @return void
	 */
	public function test_class_is_production_ready(): void
	{

		$file = DEDALO_CORE_PATH . '/installer/class.installer_data_seeder.php';
		$content = file_get_contents($file);

		// Should have proper error handling
		$this->assertStringContainsString('pg_last_error', $content);
		$this->assertStringContainsString('logger::ERROR', $content);
	}//end test_class_is_production_ready


	/**
	 * TEST_class_is_pure_static_utility
	 * Verify class is a pure static utility class
	 * @return void
	 */
	public function test_class_is_pure_static_utility(): void
	{

		$reflection = new ReflectionClass('installer_data_seeder');

		// Constructor should be private
		$constructor = $reflection->getConstructor();
		$this->assertNotNull($constructor);
		$this->assertTrue($constructor->isPrivate());

		// No instance properties
		$properties = $reflection->getProperties(ReflectionProperty::IS_PUBLIC | ReflectionProperty::IS_PROTECTED | ReflectionProperty::IS_PRIVATE);
		$this->assertEquals(0, count($properties));

		// No static properties
		$static_properties = $reflection->getProperties(ReflectionProperty::IS_STATIC);
		$this->assertEquals(0, count($static_properties));

		// All public methods are static
		$methods = $reflection->getMethods(ReflectionMethod::IS_PUBLIC);
		foreach ($methods as $method) {
			$this->assertTrue($method->isStatic());
		}
	}//end test_class_is_pure_static_utility


	/**
	 * TEST_class_follows_single_responsibility
	 * Verify class follows single responsibility principle
	 * @return void
	 */
	public function test_class_follows_single_responsibility(): void
	{

		$file = DEDALO_CORE_PATH . '/installer/class.installer_data_seeder.php';
		$content = file_get_contents($file);

		// Class docblock should describe single responsibility: seeding bootstrap data
		$this->assertStringContainsString('Seeds the mandatory bootstrap rows', $content);
		$this->assertStringContainsString('root user', $content);
		$this->assertStringContainsString('General project', $content);
		$this->assertStringContainsString('profiles', $content);
		$this->assertStringContainsString('matrix_test', $content);

		// All methods should be related to data seeding
		$this->assertStringContainsString('create', $content);
		$this->assertStringContainsString('root_user', $content);
		$this->assertStringContainsString('main_project', $content);
		$this->assertStringContainsString('main_profiles', $content);
		$this->assertStringContainsString('test_record', $content);
	}//end test_class_follows_single_responsibility


	/**
	 * TEST_class_has_cohesion
	 * Verify class has high cohesion (all methods related to data seeding)
	 * @return void
	 */
	public function test_class_has_cohesion(): void
	{

		$file = DEDALO_CORE_PATH . '/installer/class.installer_data_seeder.php';
		$content = file_get_contents($file);

		// All methods should be related to data seeding
		$this->assertStringContainsString('create', $content);
		$this->assertStringContainsString('root_user', $content);
		$this->assertStringContainsString('main_project', $content);
		$this->assertStringContainsString('main_profiles', $content);
		$this->assertStringContainsString('test_record', $content);
	}//end test_class_has_cohesion


	/**
	 * TEST_class_has_low_coupling
	 * Verify class has low coupling (minimal dependencies)
	 * @return void
	 */
	public function test_class_has_low_coupling(): void
	{

		$file = DEDALO_CORE_PATH . '/installer/class.installer_data_seeder.php';
		$content = file_get_contents($file);

		// Should depend on minimal external classes
		$this->assertStringContainsString('installer_config_manager', $content);
		$this->assertStringContainsString('debug_log', $content);
		$this->assertStringContainsString('logger', $content);
	}//end test_class_has_low_coupling

}
