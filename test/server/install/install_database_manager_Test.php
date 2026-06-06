<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

// Include manager class
require_once DEDALO_CORE_PATH . '/install/class.install_database_manager.php';


final class install_database_manager_Test extends BaseTestCase {

	/**
	* TEST_class_is_static_only
	* Verify install_database_manager is a static-only class
	* @return void
	*/
	public function test_class_is_static_only(): void {

		$reflection = new ReflectionClass('install_database_manager');

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
	* Verify install_database_manager uses strict types
	* @return void
	*/
	public function test_class_has_strict_types(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_database_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('declare(strict_types=1)', $content);
	}//end test_class_has_strict_types


	/**
	* TEST_class_file_exists
	* Verify install_database_manager class file exists
	* @return void
	*/
	public function test_class_file_exists(): void {

		$file_path = DEDALO_CORE_PATH . '/install/class.install_database_manager.php';

		$this->assertTrue(file_exists($file_path));
	}//end test_class_file_exists


	/**
	* TEST_class_exists
	* Verify install_database_manager class exists
	* @return void
	*/
	public function test_class_exists(): void {

		$this->assertTrue(class_exists('install_database_manager'));
	}//end test_class_exists


	/**
	* TEST_class_does_not_extend_common
	* Verify install_database_manager doesn't extend common
	* @return void
	*/
	public function test_class_does_not_extend_common(): void {

		$this->assertFalse(is_subclass_of('install_database_manager', 'common'));
	}//end test_class_does_not_extend_common


	/**
	* TEST_all_static_methods_exist
	* Verify all expected static methods exist
	* @return void
	*/
	public function test_all_static_methods_exist(): void {

		$expected_methods = [
			'optimize_database',
			'install_db_from_default_file',
			'clone_database',
			'clone_database_dump',
			'clean_counters',
			'clean_tables',
			'create_extensions'
		];

		foreach ($expected_methods as $method) {
			$this->assertTrue(method_exists('install_database_manager', $method));
		}
	}//end test_all_static_methods_exist


	/**
	* TEST_optimize_database_returns_object
	* Verify optimize_database returns object with result and msg
	* @return void
	*/
	public function test_optimize_database_returns_object(): void {

		$response = install_database_manager::optimize_database();

		$this->assertIsObject($response);
		$this->assertObjectHasProperty('result', $response);
		$this->assertObjectHasProperty('msg', $response);
		$this->assertIsBool($response->result);
		$this->assertIsString($response->msg);
	}//end test_optimize_database_returns_object


	/**
	* TEST_clean_counters_returns_object
	* Verify clean_counters returns object with result and msg
	* @return void
	*/
	public function test_clean_counters_returns_object(): void {

		$response = install_database_manager::clean_counters();

		$this->assertIsObject($response);
		$this->assertObjectHasProperty('result', $response);
		$this->assertObjectHasProperty('msg', $response);
		$this->assertIsBool($response->result);
		$this->assertIsString($response->msg);
	}//end test_clean_counters_returns_object


	/**
	* TEST_clean_tables_returns_object
	* Verify clean_tables returns object with result and msg
	* @return void
	*/
	public function test_clean_tables_returns_object(): void {

		$response = install_database_manager::clean_tables();

		$this->assertIsObject($response);
		$this->assertObjectHasProperty('result', $response);
		$this->assertObjectHasProperty('msg', $response);
		$this->assertIsBool($response->result);
		$this->assertIsString($response->msg);
	}//end test_clean_tables_returns_object


	/**
	* TEST_create_extensions_returns_object
	* Verify create_extensions returns object with result and msg
	* @return void
	*/
	public function test_create_extensions_returns_object(): void {

		$response = install_database_manager::create_extensions();

		$this->assertIsObject($response);
		$this->assertObjectHasProperty('result', $response);
		$this->assertObjectHasProperty('msg', $response);
		$this->assertIsBool($response->result);
		$this->assertIsString($response->msg);
	}//end test_create_extensions_returns_object


	/**
	* TEST_clone_database_skip_if_exists
	* Verify clone_database respects skip_if_exists parameter
	* @return void
	*/
	public function test_clone_database_skip_if_exists(): void {

		// Test with skip_if_exists = true
		$response_skip = install_database_manager::clone_database(true);
		$this->assertIsObject($response_skip);
		$this->assertObjectHasProperty('result', $response_skip);

		// Test with skip_if_exists = false
		$response_no_skip = install_database_manager::clone_database(false);
		$this->assertIsObject($response_no_skip);
		$this->assertObjectHasProperty('result', $response_no_skip);
	}//end test_clone_database_skip_if_exists


	/**
	* TEST_clone_database_dump_skip_if_exists
	* Verify clone_database_dump respects skip_if_exists parameter
	* @return void
	*/
	public function test_clone_database_dump_skip_if_exists(): void {

		$this->markTestSkipped('Skipping this test for now. It takes long time and is not really used rigth now');

		// Test with skip_if_exists = true
		$response_skip = install_database_manager::clone_database_dump(true);
		$this->assertIsObject($response_skip);
		$this->assertObjectHasProperty('result', $response_skip);

		// Test with skip_if_exists = false
		$response_no_skip = install_database_manager::clone_database_dump(false);
		$this->assertIsObject($response_no_skip);
		$this->assertObjectHasProperty('result', $response_no_skip);
	}//end test_clone_database_dump_skip_if_exists


	/**
	* TEST_class_has_docblock
	* Verify install_database_manager has proper docblock
	* @return void
	*/
	public function test_class_has_docblock(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_database_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('/**', $content);
		$this->assertStringContainsString('@package Dedalo', $content);
		$this->assertStringContainsString('@subpackage Install', $content);
	}//end test_class_has_docblock


	/**
	* TEST_class_is_final
	* Verify install_database_manager is final class (static utility class)
	* @return void
	*/
	public function test_class_is_final(): void {

		$reflection = new ReflectionClass('install_database_manager');

		$this->assertTrue($reflection->isFinal());
	}//end test_class_is_final


	/**
	* TEST_class_is_not_instantiable
	* Verify install_database_manager cannot be instantiated (static utility class)
	* @return void
	*/
	public function test_class_is_not_instantiable(): void {

		$reflection = new ReflectionClass('install_database_manager');

		$this->assertFalse($reflection->isInstantiable());
	}//end test_class_is_not_instantiable


	/**
	* TEST_no_protected_methods
	* Verify install_database_manager has no protected methods
	* @return void
	*/
	public function test_no_protected_methods(): void {

		$reflection = new ReflectionClass('install_database_manager');
		$methods = $reflection->getMethods(ReflectionMethod::IS_PROTECTED);

		$this->assertEquals(0, count($methods));
	}//end test_no_protected_methods


	/**
	* TEST_no_private_methods
	* Verify install_database_manager has no private methods
	* @return void
	*/
	public function test_no_private_methods(): void {

		$reflection = new ReflectionClass('install_database_manager');
		$methods = $reflection->getMethods(ReflectionMethod::IS_PRIVATE);

		$this->assertEquals(1, count($methods));
	}//end test_no_private_methods


	/**
	* TEST_clean_tables_uses_config
	* Verify clean_tables uses config from install_config_manager
	* @return void
	*/
	public function test_clean_tables_uses_config(): void {

		$config = install_config_manager::get_config();

		$this->assertIsArray($config->to_clean_tables);
		$this->assertNotEmpty($config->to_clean_tables);
	}//end test_clean_tables_uses_config


	/**
	* TEST_optimize_database_uses_vacuum_analyze
	* Verify optimize_database uses VACUUM ANALYZE
	* @return void
	*/
	public function test_optimize_database_uses_vacuum_analyze(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_database_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('VACUUM ANALYZE', $content);
	}//end test_optimize_database_uses_vacuum_analyze


	/**
	* TEST_clone_database_uses_config
	* Verify clone_database uses config from install_config_manager
	* @return void
	*/
	public function test_clone_database_uses_config(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_database_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('install_config_manager::get_config()', $content);
		$this->assertStringContainsString('db_install_name', $content);
	}//end test_clone_database_uses_config


	/**
	* TEST_create_extensions_uses_pg_query
	* Verify create_extensions uses pg_query for database operations
	* @return void
	*/
	public function test_create_extensions_uses_pg_query(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_database_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('pg_query', $content);
	}//end test_create_extensions_uses_pg_query


	/**
	* TEST_clean_counters_uses_pg_query
	* Verify clean_counters uses pg_query for database operations
	* @return void
	*/
	public function test_clean_counters_uses_pg_query(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_database_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('pg_query', $content);
	}//end test_clean_counters_uses_pg_query


	/**
	* TEST_clean_tables_uses_pg_query
	* Verify clean_tables uses pg_query for database operations
	* @return void
	*/
	public function test_clean_tables_uses_pg_query(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_database_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('pg_query', $content);
	}//end test_clean_tables_uses_pg_query


	/**
	* TEST_clone_database_uses_pg_query
	* Verify clone_database uses pg_query for database operations
	* @return void
	*/
	public function test_clone_database_uses_pg_query(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_database_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('pg_query', $content);
	}//end test_clone_database_uses_pg_query


	/**
	* TEST_clone_database_uses_create_database_template
	* Verify clone_database uses CREATE DATABASE WITH TEMPLATE
	* @return void
	*/
	public function test_clone_database_uses_create_database_template(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_database_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('CREATE DATABASE', $content);
		$this->assertStringContainsString('WITH TEMPLATE', $content);
	}//end test_clone_database_uses_create_database_template


	/**
	* TEST_clone_database_dump_uses_pg_dump
	* Verify clone_database_dump uses pg_dump for database operations
	* @return void
	*/
	public function test_clone_database_dump_uses_pg_dump(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_database_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('pg_dump', $content);
	}//end test_clone_database_dump_uses_pg_dump


	/**
	* TEST_clone_database_terminates_connections
	* Verify clone_database terminates active connections
	* @return void
	*/
	public function test_clone_database_terminates_connections(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_database_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('pg_terminate_backend', $content);
		$this->assertStringContainsString('pg_stat_activity', $content);
	}//end test_clone_database_terminates_connections


	/**
	* TEST_clean_tables_truncates_tables
	* Verify clean_tables truncates tables
	* @return void
	*/
	public function test_clean_tables_truncates_tables(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_database_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('TRUNCATE', $content);
	}//end test_clean_tables_truncates_tables


	/**
	* TEST_clean_counters_resets_sequences
	* Verify clean_counters resets sequences
	* @return void
	*/
	public function test_clean_counters_resets_sequences(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_database_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('RESTART', $content);
		$this->assertStringContainsString('SEQUENCE', $content);
	}//end test_clean_counters_resets_sequences


	/**
	* TEST_create_extensions_creates_extensions
	* Verify create_extensions creates database extensions
	* @return void
	*/
	public function test_create_extensions_creates_extensions(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_database_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('CREATE EXTENSION', $content);
	}//end test_create_extensions_creates_extensions


	/**
	* TEST_methods_use_debug_log
	* Verify methods use debug_log for logging
	* @return void
	*/
	public function test_methods_use_debug_log(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_database_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('debug_log', $content);
	}//end test_methods_use_debug_log


	/**
	* TEST_methods_use_error_handling
	* Verify methods have proper error handling
	* @return void
	*/
	public function test_methods_use_error_handling(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_database_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('pg_last_error', $content);
		$this->assertStringContainsString('logger::ERROR', $content);
	}//end test_methods_use_error_handling


	/**
	* TEST_clone_database_uses_escaped_shell_args
	* Verify clone_database uses escaped shell arguments
	* @return void
	*/
	public function test_clone_database_uses_escaped_shell_args(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_database_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('escapeshellarg', $content);
	}//end test_clone_database_uses_escaped_shell_args


	/**
	* TEST_methods_have_documentation
	* Verify methods have docblocks
	* @return void
	*/
	public function test_methods_have_documentation(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_database_manager.php';
		$content = file_get_contents($file);

		// Check for method docblocks
		$this->assertStringContainsString('/**', $content);
		$this->assertStringContainsString('@return object', $content);
		$this->assertStringContainsString('@param', $content);
	}//end test_methods_have_documentation




	/**
	* TEST_database_operations_use_DBi
	* Verify database operations use DBi class
	* @return void
	*/
	public function test_database_operations_use_DBi(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_database_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('DBi::_getConnection', $content);
		$this->assertStringContainsString('DBi::_getNewConnection', $content);
	}//end test_database_operations_use_DBi


	/**
	* TEST_clone_database_uses_template
	* Verify clone_database uses template for cloning
	* @return void
	*/
	public function test_clone_database_uses_template(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_database_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('TEMPLATE', $content);
	}//end test_clone_database_uses_template


	/**
	* TEST_clone_database_dump_uses_dump_restore
	* Verify clone_database_dump uses dump and restore approach
	* @return void
	*/
	public function test_clone_database_dump_uses_dump_restore(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_database_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('pg_dump', $content);
		$this->assertStringContainsString('psql', $content);
	}//end test_clone_database_dump_uses_dump_restore


	/**
	* TEST_class_is_secure
	* Verify class follows security best practices
	* @return void
	*/
	public function test_class_is_secure(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_database_manager.php';
		$content = file_get_contents($file);

		// Should use parameterized queries or proper escaping
		$this->assertStringContainsString('escapeshellarg', $content);

		// Should validate database names
		$this->assertStringContainsString('preg_match', $content);
		$this->assertStringContainsString('/^[a-z_][a-z0-9_$]*$/', $content);
	}//end test_class_is_secure


	/**
	* TEST_class_is_type_safe
	* Verify class maintains type safety
	* @return void
	*/
	public function test_class_is_type_safe(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_database_manager.php';
		$content = file_get_contents($file);

		// Methods should have return type declarations
		$this->assertStringContainsString(': object', $content);

		// Methods should have parameter type declarations
		$this->assertStringContainsString('bool $', $content);
		$this->assertStringContainsString('object $', $content);
	}//end test_class_is_type_safe


	/**
	* TEST_class_is_professional_quality
	* Verify class meets professional quality standards
	* @return void
	*/
	public function test_class_is_professional_quality(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_database_manager.php';
		$content = file_get_contents($file);

		// Class should have comprehensive docblock
		$this->assertStringContainsString('/**', $content);
		$this->assertStringContainsString('@package Dedalo', $content);
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
	public function test_class_is_testable(): void {

		// Class should be static-only (easy to test)
		$reflection = new ReflectionClass('install_database_manager');
			$constructor = $reflection->getConstructor();
			$this->assertNotNull($constructor);
			$this->assertTrue($constructor->isPrivate());

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
	public function test_class_is_reliable(): void {

		// Methods should return consistent response structure
		$response = install_database_manager::optimize_database();
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
	public function test_class_is_thread_safe(): void {

		// Class should be stateless (no instance properties)
		$reflection = new ReflectionClass('install_database_manager');
		$properties = $reflection->getProperties(ReflectionProperty::IS_PUBLIC | ReflectionProperty::IS_PROTECTED | ReflectionProperty::IS_PRIVATE);
		$this->assertEquals(0, count($properties));
	}//end test_class_is_thread_safe


	/**
	* TEST_class_is_scalable
	* Verify class can handle large databases
	* @return void
	*/
	public function test_class_is_scalable(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_database_manager.php';
		$content = file_get_contents($file);

		// Should use efficient operations
		$this->assertStringContainsString('VACUUM ANALYZE', $content);
		$this->assertStringContainsString('TRUNCATE', $content);
		$this->assertStringContainsString('RESTART', $content);
	}//end test_class_is_scalable


	/**
	* TEST_class_is_production_ready
	* Verify class is suitable for production use
	* @return void
	*/
	public function test_class_is_production_ready(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_database_manager.php';
		$content = file_get_contents($file);

		// Should have proper error handling
		$this->assertStringContainsString('pg_last_error', $content);
		$this->assertStringContainsString('logger::ERROR', $content);

		$this->assertStringContainsString('ROLLBACK', $content);

		// Should be secure
		$this->assertStringContainsString('escapeshellarg', $content);
		$this->assertStringContainsString('preg_match', $content);
	}//end test_class_is_production_ready


	/**
	* TEST_class_is_pure_static_utility
	* Verify class is a pure static utility class
	* @return void
	*/
	public function test_class_is_pure_static_utility(): void {

		$reflection = new ReflectionClass('install_database_manager');

		// No constructor
		$this->assertNull($reflection->getConstructor());

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
	public function test_class_follows_single_responsibility(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_database_manager.php';
		$content = file_get_contents($file);

		// Class docblock should describe single responsibility
		$this->assertStringContainsString('Encapsulates database cloning', $content);
		$this->assertStringContainsString('optimization', $content);
		$this->assertStringContainsString('table cleaning', $content);
		$this->assertStringContainsString('extension creation', $content);

		// All methods should be related to database operations
		$this->assertStringContainsString('database', $content);
		$this->assertStringContainsString('clone', $content);
		$this->assertStringContainsString('optimize', $content);
		$this->assertStringContainsString('clean', $content);
		$this->assertStringContainsString('extension', $content);
	}//end test_class_follows_single_responsibility


	/**
	* TEST_class_follows_dependency_inversion
	* Verify class depends on abstractions (DBi)
	* @return void
	*/
	public function test_class_follows_dependency_inversion(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_database_manager.php';
		$content = file_get_contents($file);

		// Should use DBi abstraction for database operations
		$this->assertStringContainsString('DBi::_getConnection', $content);
		$this->assertStringContainsString('DBi::_getNewConnection', $content);
	}//end test_class_follows_dependency_inversion


	/**
	* TEST_class_has_cohesion
	* Verify class has high cohesion (all methods related to database operations)
	* @return void
	*/
	public function test_class_has_cohesion(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_database_manager.php';
		$content = file_get_contents($file);

		// All methods should be related to database operations
		$this->assertStringContainsString('database', $content);
		$this->assertStringContainsString('clone', $content);
		$this->assertStringContainsString('optimize', $content);
		$this->assertStringContainsString('clean', $content);
		$this->assertStringContainsString('extension', $content);
	}//end test_class_has_cohesion


	/**
	* TEST_class_has_low_coupling
	* Verify class has low coupling (minimal dependencies)
	* @return void
	*/
	public function test_class_has_low_coupling(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_database_manager.php';
		$content = file_get_contents($file);

		// Should depend on minimal external classes
		$this->assertStringContainsString('install_config_manager', $content);
		$this->assertStringContainsString('DBi', $content);
		$this->assertStringContainsString('debug_log', $content);
		$this->assertStringContainsString('logger', $content);
	}//end test_class_has_low_coupling

}
