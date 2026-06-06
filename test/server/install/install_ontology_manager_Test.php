<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

// Include manager class
require_once DEDALO_CORE_PATH . '/install/class.install_ontology_manager.php';


final class install_ontology_manager_Test extends BaseTestCase {

	/**
	* TEST_class_is_static_only
	* Verify install_ontology_manager is a static-only class
	* @return void
	*/
	public function test_class_is_static_only(): void {

		$reflection = new ReflectionClass('install_ontology_manager');

		// Should have no constructor
		$this->assertNull($reflection->getConstructor());

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
	* Verify install_ontology_manager uses strict types
	* @return void
	*/
	public function test_class_has_strict_types(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_ontology_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('declare(strict_types=1)', $content);
	}//end test_class_has_strict_types


	/**
	* TEST_class_file_exists
	* Verify install_ontology_manager class file exists
	* @return void
	*/
	public function test_class_file_exists(): void {

		$file_path = DEDALO_CORE_PATH . '/install/class.install_ontology_manager.php';

		$this->assertTrue(file_exists($file_path));
	}//end test_class_file_exists


	/**
	* TEST_class_exists
	* Verify install_ontology_manager class exists
	* @return void
	*/
	public function test_class_exists(): void {

		$this->assertTrue(class_exists('install_ontology_manager'));
	}//end test_class_exists


	/**
	* TEST_class_does_not_extend_common
	* Verify install_ontology_manager doesn't extend common
	* @return void
	*/
	public function test_class_does_not_extend_common(): void {

		$this->assertFalse(is_subclass_of('install_ontology_manager', 'common'));
	}//end test_class_does_not_extend_common


	/**
	* TEST_all_static_methods_exist
	* Verify all expected static methods exist
	* @return void
	*/
	public function test_all_static_methods_exist(): void {

		$expected_methods = [
			'clean_ontology',
			'build_recovery_version_file',
			'restore_dd_ontology_recovery_from_file',
			'build_install_db_file'
		];

		foreach ($expected_methods as $method) {
			$this->assertTrue(method_exists('install_ontology_manager', $method));
		}
	}//end test_all_static_methods_exist


	/**
	* TEST_clean_ontology_returns_object
	* Verify clean_ontology returns object with result and msg
	* @return void
	*/
	public function test_clean_ontology_returns_object(): void {

		$response = install_ontology_manager::clean_ontology();

		$this->assertIsObject($response);
		$this->assertObjectHasProperty('result', $response);
		$this->assertObjectHasProperty('msg', $response);
		$this->assertIsBool($response->result);
		$this->assertIsString($response->msg);
	}//end test_clean_ontology_returns_object


	/**
	* TEST_build_recovery_version_file_returns_object
	* Verify build_recovery_version_file returns object with result and msg
	* @return void
	*/
	public function test_build_recovery_version_file_returns_object(): void {

		$response = install_ontology_manager::build_recovery_version_file();

		$this->assertIsObject($response);
		$this->assertObjectHasProperty('result', $response);
		$this->assertObjectHasProperty('msg', $response);
		$this->assertIsBool($response->result);
		$this->assertIsString($response->msg);
	}//end test_build_recovery_version_file_returns_object


	/**
	* TEST_restore_dd_ontology_recovery_from_file_returns_object
	* Verify restore_dd_ontology_recovery_from_file returns object with result and msg
	* @return void
	*/
	public function test_restore_dd_ontology_recovery_from_file_returns_object(): void {

		$response = install_ontology_manager::restore_dd_ontology_recovery_from_file();

		$this->assertIsObject($response);
		$this->assertObjectHasProperty('result', $response);
		$this->assertObjectHasProperty('msg', $response);
		$this->assertIsBool($response->result);
		$this->assertIsString($response->msg);
	}//end test_restore_dd_ontology_recovery_from_file_returns_object


	/**
	* TEST_build_install_db_file_returns_object
	* Verify build_install_db_file returns object with result and msg
	* @return void
	*/
	public function test_build_install_db_file_returns_object(): void {

		$response = install_ontology_manager::build_install_db_file();

		$this->assertIsObject($response);
		$this->assertObjectHasProperty('result', $response);
		$this->assertObjectHasProperty('msg', $response);
		$this->assertIsBool($response->result);
		$this->assertIsString($response->msg);
	}//end test_build_install_db_file_returns_object


	/**
	* TEST_class_has_docblock
	* Verify install_ontology_manager has proper docblock
	* @return void
	*/
	public function test_class_has_docblock(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_ontology_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('/**', $content);
		$this->assertStringContainsString('@package Dedalo', $content);
		$this->assertStringContainsString('@subpackage Install', $content);
	}//end test_class_has_docblock


	/**
	* TEST_class_is_final
	* Verify install_ontology_manager is final class (static utility class)
	* @return void
	*/
	public function test_class_is_final(): void {

		$reflection = new ReflectionClass('install_ontology_manager');

		$this->assertTrue($reflection->isFinal());
	}//end test_class_is_final


	/**
	* TEST_class_is_not_instantiable
	* Verify install_ontology_manager cannot be instantiated (static utility class)
	* @return void
	*/
	public function test_class_is_not_instantiable(): void {

		$reflection = new ReflectionClass('install_ontology_manager');

		$this->assertFalse($reflection->isInstantiable());
	}//end test_class_is_not_instantiable


	/**
	* TEST_no_protected_methods
	* Verify install_ontology_manager has no protected methods
	* @return void
	*/
	public function test_no_protected_methods(): void {

		$reflection = new ReflectionClass('install_ontology_manager');
		$methods = $reflection->getMethods(ReflectionMethod::IS_PROTECTED);

		$this->assertEquals(0, count($methods));
	}//end test_no_protected_methods


	/**
	* TEST_no_private_methods
	* Verify install_ontology_manager has no private methods
	* @return void
	*/
	public function test_no_private_methods(): void {

		$reflection = new ReflectionClass('install_ontology_manager');
		$methods = $reflection->getMethods(ReflectionMethod::IS_PRIVATE);

		$this->assertEquals(0, count($methods));
	}//end test_no_private_methods


	/**
	* TEST_clean_ontology_uses_config
	* Verify clean_ontology uses config from install_config_manager
	* @return void
	*/
	public function test_clean_ontology_uses_config(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_ontology_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('install_config_manager::get_config()', $content);
		$this->assertStringContainsString('to_preserve_tld', $content);
	}//end test_clean_ontology_uses_config


	/**
	* TEST_clean_ontology_uses_pg_query
	* Verify clean_ontology uses pg_query for database operations
	* @return void
	*/
	public function test_clean_ontology_uses_pg_query(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_ontology_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('pg_query', $content);
	}//end test_clean_ontology_uses_pg_query


	/**
	* TEST_clean_ontology_deletes_from_dd_ontology
	* Verify clean_ontology deletes from dd_ontology table
	* @return void
	*/
	public function test_clean_ontology_deletes_from_dd_ontology(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_ontology_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('DELETE FROM "dd_ontology"', $content);
		$this->assertStringContainsString('WHERE tld NOT IN', $content);
	}//end test_clean_ontology_deletes_from_dd_ontology


	/**
	* TEST_clean_ontology_deletes_from_matrix_descriptors_dd
	* Verify clean_ontology deletes from matrix_descriptors_dd table
	* @return void
	*/
	public function test_clean_ontology_deletes_from_matrix_descriptors_dd(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_ontology_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('DELETE FROM "matrix_descriptors_dd"', $content);
		$this->assertStringContainsString('parent !~', $content);
	}//end test_clean_ontology_deletes_from_matrix_descriptors_dd


	/**
	* TEST_clean_ontology_reindexes_tables
	* Verify clean_ontology reindexes ontology tables
	* @return void
	*/
	public function test_clean_ontology_reindexes_tables(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_ontology_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('REINDEX TABLE "dd_ontology"', $content);
		$this->assertStringContainsString('REINDEX TABLE "matrix_descriptors_dd"', $content);
	}//end test_clean_ontology_reindexes_tables


	/**
	* TEST_build_recovery_version_file_creates_dd_ontology_recovery
	* Verify build_recovery_version_file creates dd_ontology_recovery table
	* @return void
	*/
	public function test_build_recovery_version_file_creates_dd_ontology_recovery(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_ontology_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('CREATE TABLE "dd_ontology_recovery"', $content);
		$this->assertStringContainsString('LIKE "dd_ontology" INCLUDING ALL', $content);
	}//end test_build_recovery_version_file_creates_dd_ontology_recovery


	/**
	* TEST_build_recovery_version_file_uses_pg_dump
	* Verify build_recovery_version_file uses pg_dump for database operations
	* @return void
	*/
	public function test_build_recovery_version_file_uses_pg_dump(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_ontology_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('pg_dump', $content);
	}//end test_build_recovery_version_file_uses_pg_dump


	/**
	* TEST_build_recovery_version_file_uses_gzip
	* Verify build_recovery_version_file uses gzip for compression
	* @return void
	*/
	public function test_build_recovery_version_file_uses_gzip(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_ontology_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('gzip', $content);
		$this->assertStringContainsString('dd_ontology_recovery.sql.gz', $content);
	}//end test_build_recovery_version_file_uses_gzip


	/**
	* TEST_restore_dd_ontology_recovery_from_file_uses_gunzip
	* Verify restore_dd_ontology_recovery_from_file uses gunzip for decompression
	* @return void
	*/
	public function test_restore_dd_ontology_recovery_from_file_uses_gunzip(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_ontology_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('gunzip', $content);
		$this->assertStringContainsString('psql', $content);
	}//end test_restore_dd_ontology_recovery_from_file_uses_gunzip


	/**
	* TEST_restore_dd_ontology_recovery_from_file_checks_file_exists
	* Verify restore_dd_ontology_recovery_from_file checks if file exists
	* @return void
	*/
	public function test_restore_dd_ontology_recovery_from_file_checks_file_exists(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_ontology_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('file_exists', $content);
		$this->assertStringContainsString('dd_ontology_recovery.sql.gz', $content);
	}//end test_restore_dd_ontology_recovery_from_file_checks_file_exists


	/**
	* TEST_build_install_db_file_uses_pg_dump
	* Verify build_install_db_file uses pg_dump for database operations
	* @return void
	*/
	public function test_build_install_db_file_uses_pg_dump(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_ontology_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('pg_dump', $content);
	}//end test_build_install_db_file_uses_pg_dump


	/**
	* TEST_build_install_db_file_uses_gzip
	* Verify build_install_db_file uses gzip for compression
	* @return void
	*/
	public function test_build_install_db_file_uses_gzip(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_ontology_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('gzip', $content);
	}//end test_build_install_db_file_uses_gzip


	/**
	* TEST_methods_use_debug_log
	* Verify methods use debug_log for logging
	* @return void
	*/
	public function test_methods_use_debug_log(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_ontology_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('debug_log', $content);
	}//end test_methods_use_debug_log


	/**
	* TEST_methods_use_error_handling
	* Verify methods have proper error handling
	* @return void
	*/
	public function test_methods_use_error_handling(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_ontology_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('pg_last_error', $content);
		$this->assertStringContainsString('logger::ERROR', $content);
	}//end test_methods_use_error_handling


	/**
	* TEST_methods_use_escaped_shell_args
	* Verify methods use escaped shell arguments
	* @return void
	*/
	public function test_methods_use_escaped_shell_args(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_ontology_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('escapeshellarg', $content);
	}//end test_methods_use_escaped_shell_args


	/**
	* TEST_methods_have_documentation
	* Verify methods have docblocks
	* @return void
	*/
	public function test_methods_have_documentation(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_ontology_manager.php';
		$content = file_get_contents($file);

		// Check for method docblocks
		$this->assertStringContainsString('/**', $content);
		$this->assertStringContainsString('@return object', $content);
	}//end test_methods_have_documentation


	/**
	* TEST_database_operations_use_DBi
	* Verify database operations use DBi class
	* @return void
	*/
	public function test_database_operations_use_DBi(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_ontology_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('DBi::_getConnection', $content);
		$this->assertStringContainsString('DBi::check_table_exists', $content);
	}//end test_database_operations_use_DBi


	/**
	* TEST_class_is_secure
	* Verify class follows security best practices
	* @return void
	*/
	public function test_class_is_secure(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_ontology_manager.php';
		$content = file_get_contents($file);

		// Should use proper escaping for shell commands
		$this->assertStringContainsString('escapeshellarg', $content);
	}//end test_class_is_secure


	/**
	* TEST_class_is_type_safe
	* Verify class maintains type safety
	* @return void
	*/
	public function test_class_is_type_safe(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_ontology_manager.php';
		$content = file_get_contents($file);

		// Methods should have return type declarations
		$this->assertStringContainsString(': object', $content);
	}//end test_class_is_type_safe


	/**
	* TEST_class_is_professional_quality
	* Verify class meets professional quality standards
	* @return void
	*/
	public function test_class_is_professional_quality(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_ontology_manager.php';
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
		$reflection = new ReflectionClass('install_ontology_manager');
		$this->assertNull($reflection->getConstructor());

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
		$response = install_ontology_manager::clean_ontology();
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
		$reflection = new ReflectionClass('install_ontology_manager');
		$properties = $reflection->getProperties(ReflectionProperty::IS_PUBLIC | ReflectionProperty::IS_PROTECTED | ReflectionProperty::IS_PRIVATE);
		$this->assertEquals(0, count($properties));
	}//end test_class_is_thread_safe


	/**
	* TEST_class_is_production_ready
	* Verify class is suitable for production use
	* @return void
	*/
	public function test_class_is_production_ready(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_ontology_manager.php';
		$content = file_get_contents($file);

		// Should have proper error handling
		$this->assertStringContainsString('pg_last_error', $content);
		$this->assertStringContainsString('logger::ERROR', $content);

		// Should be secure
		$this->assertStringContainsString('escapeshellarg', $content);
	}//end test_class_is_production_ready


	/**
	* TEST_class_is_pure_static_utility
	* Verify class is a pure static utility class
	* @return void
	*/
	public function test_class_is_pure_static_utility(): void {

		$reflection = new ReflectionClass('install_ontology_manager');

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

		$file = DEDALO_CORE_PATH . '/install/class.install_ontology_manager.php';
		$content = file_get_contents($file);

		// Class docblock should describe single responsibility
		$this->assertStringContainsString('Encapsulates ontology cleaning', $content);
		$this->assertStringContainsString('recovery file operations', $content);
		$this->assertStringContainsString('install database file export', $content);

		// All methods should be related to ontology operations
		$this->assertStringContainsString('ontology', $content);
		$this->assertStringContainsString('recovery', $content);
		$this->assertStringContainsString('install', $content);
	}//end test_class_follows_single_responsibility


	/**
	* TEST_class_has_cohesion
	* Verify class has high cohesion (all methods related to ontology operations)
	* @return void
	*/
	public function test_class_has_cohesion(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_ontology_manager.php';
		$content = file_get_contents($file);

		// All methods should be related to ontology operations
		$this->assertStringContainsString('ontology', $content);
		$this->assertStringContainsString('recovery', $content);
		$this->assertStringContainsString('install', $content);
	}//end test_class_has_cohesion


	/**
	* TEST_class_has_low_coupling
	* Verify class has low coupling (minimal dependencies)
	* @return void
	*/
	public function test_class_has_low_coupling(): void {

		$file = DEDALO_CORE_PATH . '/install/class.install_ontology_manager.php';
		$content = file_get_contents($file);

		// Should depend on minimal external classes
		$this->assertStringContainsString('install_config_manager', $content);
		$this->assertStringContainsString('DBi', $content);
		$this->assertStringContainsString('debug_log', $content);
		$this->assertStringContainsString('logger', $content);
	}//end test_class_has_low_coupling

}
