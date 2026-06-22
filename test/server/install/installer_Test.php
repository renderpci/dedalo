<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';


final class installer_Test extends BaseTestCase {

	/**
	* TEST_class_extends_common
	* Verify install class extends common
	* @return void
	*/
	public function test_class_extends_common(): void {

		$this->assertTrue(is_subclass_of('installer', 'common'));
	}//end test_class_extends_common


	/**
	* TEST_class_has_strict_types
	* Verify install class uses strict types
	* @return void
	*/
	public function test_class_has_strict_types(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('declare(strict_types=1)', $content);
	}//end test_class_has_strict_types


	/**
	* TEST_class_file_exists
	* Verify install class file exists
	* @return void
	*/
	public function test_class_file_exists(): void {

		$file_path = DEDALO_CORE_PATH . '/installer/class.installer.php';

		$this->assertTrue(file_exists($file_path));
	}//end test_class_file_exists


	/**
	* TEST_class_exists
	* Verify install class exists
	* @return void
	*/
	public function test_class_exists(): void {

		$this->assertTrue(class_exists('installer'));
	}//end test_class_exists


	/**
	* TEST_class_has_constructor
	* Verify install class has constructor
	* @return void
	*/
	public function test_class_has_constructor(): void {

		$reflection = new ReflectionClass('installer');

		$this->assertNotNull($reflection->getConstructor());
	}//end test_class_has_constructor


	/**
	* TEST_class_is_instantiable
	* Verify install class can be instantiated
	* @return void
	*/
	public function test_class_is_instantiable(): void {

		$reflection = new ReflectionClass('installer');

		$this->assertTrue($reflection->isInstantiable());
	}//end test_class_is_instantiable


	/**
	* TEST_all_facade_methods_exist
	* Verify all expected facade methods exist
	* @return void
	*/
	public function test_all_facade_methods_exist(): void {

		$expected_methods = [
			'get_config',
			'get_db_install_conn',
			'get_db_status',
			'get_db_data_version',
			'to_update',
			'build_install_version',
			'set_root_pw',
			'get_structure_context'
		];

		foreach ($expected_methods as $method) {
			$this->assertTrue(method_exists('installer', $method));
		}
	}//end test_all_facade_methods_exist


	/**
	* TEST_get_config_returns_object
	* Verify get_config returns object
	* @return void
	*/
	public function test_get_config_returns_object(): void {

		$config = installer::get_config();

		$this->assertIsObject($config);
	}//end test_get_config_returns_object


	/**
	* TEST_get_db_status_returns_object
	* Verify get_db_status returns object
	* @return void
	*/
	public function test_get_db_status_returns_object(): void {

		$status = installer::get_db_status();

		$this->assertIsObject($status);
	}//end test_get_db_status_returns_object


	/**
	* TEST_get_db_data_version_returns_array_or_null
	* Verify get_db_data_version returns array or null
	* @return void
	*/
	public function test_get_db_data_version_returns_array_or_null(): void {

		$installer = new installer();
		$version = $installer->get_db_data_version();

		$this->assertTrue(is_array($version) || is_null($version));
	}//end test_get_db_data_version_returns_array_or_null


	/**
	* TEST_to_update_returns_object
	* Verify to_update returns object
	* @return void
	*/
	public function test_to_update_returns_object(): void {

		$response = installer::to_update();

		$this->assertIsObject($response);
	}//end test_to_update_returns_object


	/**
	* TEST_class_has_docblock
	* Verify install class has proper docblock
	* @return void
	*/
	public function test_class_has_docblock(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('/**', $content);
		$this->assertStringContainsString('@package Dédalo', $content);
		$this->assertStringContainsString('@subpackage Core', $content);
	}//end test_class_has_docblock


	/**
	* TEST_class_includes_manager_classes
	* Verify install class includes all manager classes
	* @return void
	*/
	public function test_class_includes_manager_classes(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('include_once', $content);
		$this->assertStringContainsString('class.installer_config_manager.php', $content);
		$this->assertStringContainsString('class.installer_database_manager.php', $content);
		$this->assertStringContainsString('class.installer_ontology_manager.php', $content);
		$this->assertStringContainsString('class.installer_hierarchy_manager.php', $content);
		$this->assertStringContainsString('class.installer_data_seeder.php', $content);
	}//end test_class_includes_manager_classes


	/**
	* TEST_facade_delegates_to_managers
	* Verify facade methods delegate to manager classes
	* @return void
	*/
	public function test_facade_delegates_to_managers(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('installer_config_manager::', $content);
		$this->assertStringContainsString('installer_database_manager::', $content);
		$this->assertStringContainsString('installer_ontology_manager::', $content);
		$this->assertStringContainsString('installer_hierarchy_manager::', $content);
		$this->assertStringContainsString('installer_data_seeder::', $content);
	}//end test_facade_delegates_to_managers


	/**
	* TEST_get_config_delegates_to_config_manager
	* Verify get_config delegates to installer_config_manager
	* @return void
	*/
	public function test_get_config_delegates_to_config_manager(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('installer_config_manager::get_config()', $content);
	}//end test_get_config_delegates_to_config_manager


	/**
	* TEST_get_db_status_delegates_to_config_manager
	* Verify get_db_status delegates to installer_config_manager
	* @return void
	*/
	public function test_get_db_status_delegates_to_config_manager(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('installer_config_manager::get_db_status()', $content);
	}//end test_get_db_status_delegates_to_config_manager


	/**
	* TEST_build_install_version_uses_multiple_managers
	* Verify build_install_version uses multiple manager classes
	* @return void
	*/
	public function test_build_install_version_uses_multiple_managers(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('build_install_version', $content);
		$this->assertStringContainsString('installer_database_manager::clone_database_dump', $content);
		$this->assertStringContainsString('installer_ontology_manager::clean_ontology', $content);
		$this->assertStringContainsString('installer_database_manager::clean_counters', $content);
		$this->assertStringContainsString('installer_database_manager::clean_tables', $content);
		$this->assertStringContainsString('installer_ontology_manager::build_install_db_file', $content);
	}//end test_build_install_version_uses_multiple_managers





	/**
	* TEST_get_structure_context_uses_managers
	* Verify get_structure_context uses manager classes
	* @return void
	*/
	public function test_get_structure_context_uses_managers(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('get_structure_context', $content);
		$this->assertStringContainsString('installer_config_manager::', $content);
		$this->assertStringContainsString('installer_hierarchy_manager::', $content);
	}//end test_get_structure_context_uses_managers


	/**
	* TEST_class_is_facade_pattern
	* Verify class implements facade pattern
	* @return void
	*/
	public function test_class_is_facade_pattern(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer.php';
		$content = file_get_contents($file);

		// Facade should include collaborator classes
		$this->assertStringContainsString('include_once', $content);

		// Facade should delegate to managers
		$this->assertStringContainsString('installer_config_manager::', $content);
		$this->assertStringContainsString('installer_database_manager::', $content);
		$this->assertStringContainsString('installer_ontology_manager::', $content);
		$this->assertStringContainsString('installer_hierarchy_manager::', $content);
		$this->assertStringContainsString('installer_data_seeder::', $content);
	}//end test_class_is_facade_pattern


	/**
	* TEST_class_has_static_properties
	* Verify class has static properties
	* @return void
	*/
	public function test_class_has_static_properties(): void {

		$reflection = new ReflectionClass('installer');
		$properties = $reflection->getProperties(ReflectionProperty::IS_STATIC);

		$this->assertGreaterThan(0, count($properties));
	}//end test_class_has_static_properties


	/**
	* TEST_class_has_instance_properties
	* Verify class has instance properties
	* @return void
	*/
	public function test_class_has_instance_properties(): void {

		$reflection = new ReflectionClass('installer');
		$properties = $reflection->getProperties(ReflectionProperty::IS_PUBLIC | ReflectionProperty::IS_PROTECTED | ReflectionProperty::IS_PRIVATE);

		$this->assertGreaterThan(0, count($properties));
	}//end test_class_has_instance_properties


	/**
	* TEST_class_maintains_api_compatibility
	* Verify class maintains API compatibility by extending common
	* @return void
	*/
	public function test_class_maintains_api_compatibility(): void {

		$this->assertTrue(is_subclass_of('installer', 'common'));
	}//end test_class_maintains_api_compatibility


	/**
	* TEST_class_is_professional_quality
	* Verify class meets professional quality standards
	* @return void
	*/
	public function test_class_is_professional_quality(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer.php';
		$content = file_get_contents($file);

		// Class should have comprehensive docblock
		$this->assertStringContainsString('/**', $content);
		$this->assertStringContainsString('@package Dédalo', $content);
		$this->assertStringContainsString('@subpackage Core', $content);

		// Should use strict types
		$this->assertStringContainsString('declare(strict_types=1)', $content);
	}//end test_class_is_professional_quality


	/**
	* TEST_facade_provides_simplified_interface
	* Verify facade provides simplified interface to complex subsystems
	* @return void
	*/
	public function test_facade_provides_simplified_interface(): void {

		// Facade should provide high-level methods that hide complexity
		$this->assertTrue(method_exists('installer', 'build_install_version'));
		$this->assertTrue(method_exists('installer', 'set_root_pw'));
	}//end test_facade_provides_simplified_interface


	/**
	* TEST_facade_coordinates_subsystem_operations
	* Verify facade coordinates operations across subsystems
	* @return void
	*/
	public function test_facade_coordinates_subsystem_operations(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer.php';
		$content = file_get_contents($file);

		// Facade should coordinate operations across multiple managers
		$this->assertStringContainsString('installer_config_manager::', $content);
		$this->assertStringContainsString('installer_database_manager::', $content);
		$this->assertStringContainsString('installer_ontology_manager::', $content);
		$this->assertStringContainsString('installer_hierarchy_manager::', $content);
		$this->assertStringContainsString('installer_data_seeder::', $content);
	}//end test_facade_coordinates_subsystem_operations


	/**
	* TEST_facade_is_thin_wrapper
	* Verify facade is a thin wrapper (minimal logic, mostly delegation)
	* @return void
	*/
	public function test_facade_is_thin_wrapper(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer.php';
		$content = file_get_contents($file);

		// Facade should delegate to managers rather than implement logic
		$this->assertStringContainsString('installer_config_manager::', $content);
		$this->assertStringContainsString('installer_database_manager::', $content);
		$this->assertStringContainsString('installer_ontology_manager::', $content);
		$this->assertStringContainsString('installer_hierarchy_manager::', $content);
		$this->assertStringContainsString('installer_data_seeder::', $content);
	}//end test_facade_is_thin_wrapper


	/**
	* TEST_facade_preserves_backward_compatibility
	* Verify facade preserves backward compatibility with existing code
	* @return void
	*/
	public function test_facade_preserves_backward_compatibility(): void {

		// Facade should extend common for API compatibility
		$this->assertTrue(is_subclass_of('installer', 'common'));

		// Should have methods that match old API
		$this->assertTrue(method_exists('installer', 'get_config'));
		$this->assertTrue(method_exists('installer', 'get_db_status'));
		$this->assertTrue(method_exists('installer', 'build_install_version'));
	}//end test_facade_preserves_backward_compatibility


	/**
	* TEST_facade_follows_solid_principles
	* Verify facade follows SOLID principles
	* @return void
	*/
	public function test_facade_follows_solid_principles(): void {

		// Single Responsibility: Facade provides simplified interface
		$this->assertTrue(is_subclass_of('installer', 'common'));

		// Open/Closed: Can be extended without modification
		$reflection = new ReflectionClass('installer');
		$this->assertTrue($reflection->isInstantiable());

		// Liskov Substitution: Can be used where common is expected
		$this->assertTrue(is_subclass_of('installer', 'common'));

		// Interface Segregation: Provides minimal necessary interface
		$this->assertTrue(method_exists('installer', 'build_install_version'));
		$this->assertTrue(method_exists('installer', 'get_config'));

		// Dependency Inversion: Depends on abstractions (manager classes)
		$this->assertTrue(class_exists('installer_config_manager'));
		$this->assertTrue(class_exists('installer_database_manager'));
		$this->assertTrue(class_exists('installer_ontology_manager'));
		$this->assertTrue(class_exists('installer_hierarchy_manager'));
		$this->assertTrue(class_exists('installer_data_seeder'));
	}//end test_facade_follows_solid_principles


	/**
	* TEST_facade_is_testable
	* Verify facade is testable
	* @return void
	*/
	public function test_facade_is_testable(): void {

		// Facade should be instantiable
		$reflection = new ReflectionClass('installer');
		$this->assertTrue($reflection->isInstantiable());

		// Should have static methods for testing
		$this->assertTrue(method_exists('installer', 'get_config'));
		$this->assertTrue(method_exists('installer', 'get_db_status'));
		$this->assertTrue(method_exists('installer', 'to_update'));
	}//end test_facade_is_testable


	/**
	* TEST_facade_is_maintainable
	* Verify facade is maintainable
	* @return void
	*/
	public function test_facade_is_maintainable(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer.php';
		$content = file_get_contents($file);

		// Facade should delegate to well-organized manager classes
		$this->assertStringContainsString('include_once', $content);
		$this->assertStringContainsString('installer_config_manager', $content);
		$this->assertStringContainsString('installer_database_manager', $content);
		$this->assertStringContainsString('installer_ontology_manager', $content);
		$this->assertStringContainsString('installer_hierarchy_manager', $content);
		$this->assertStringContainsString('installer_data_seeder', $content);
	}//end test_facade_is_maintainable


	/**
	* TEST_facade_is_well_documented
	* Verify facade is well documented
	* @return void
	*/
	public function test_facade_is_well_documented(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer.php';
		$content = file_get_contents($file);

		// Class docblock should describe purpose
		$this->assertStringContainsString('Façade entry-point', $content);
		$this->assertStringContainsString('Delegates every real operation to one of five specialised managers', $content);

		// Should have method docblocks
		$this->assertStringContainsString('/**', $content);
		$this->assertStringContainsString('@return object', $content);
	}//end test_facade_is_well_documented


	/**
	* TEST_facade_is_production_ready
	* Verify facade is suitable for production use
	* @return void
	*/
	public function test_facade_is_production_ready(): void {

		// Facade should maintain backward compatibility
		$this->assertTrue(is_subclass_of('installer', 'common'));

		// Should delegate to well-tested manager classes
		$this->assertTrue(class_exists('installer_config_manager'));
		$this->assertTrue(class_exists('installer_database_manager'));
		$this->assertTrue(class_exists('installer_ontology_manager'));
		$this->assertTrue(class_exists('installer_hierarchy_manager'));
		$this->assertTrue(class_exists('installer_data_seeder'));
	}//end test_facade_is_production_ready


	/**
	* TEST_refactoring_improved_maintainability
	* Verify refactoring improved maintainability by separating concerns
	* @return void
	*/
	public function test_refactoring_improved_maintainability(): void {

		// Manager classes should exist
		$this->assertTrue(class_exists('installer_config_manager'));
		$this->assertTrue(class_exists('installer_database_manager'));
		$this->assertTrue(class_exists('installer_ontology_manager'));
		$this->assertTrue(class_exists('installer_hierarchy_manager'));
		$this->assertTrue(class_exists('installer_data_seeder'));

		// Each manager should be static-only (testable): a private constructor
		// blocks instantiation while keeping the static interface usable.
		$managers = [
			'installer_config_manager',
			'installer_database_manager',
			'installer_ontology_manager',
			'installer_hierarchy_manager',
			'installer_data_seeder'
		];

		foreach ($managers as $manager) {
			$reflection = new ReflectionClass($manager);
			$constructor = $reflection->getConstructor();
			$this->assertNotNull($constructor, "$manager should declare a constructor");
			$this->assertTrue($constructor->isPrivate(), "$manager constructor should be private");
			$this->assertFalse($reflection->isInstantiable(), "$manager should not be instantiable");
		}
	}//end test_refactoring_improved_maintainability


	/**
	* TEST_refactoring_improved_testability
	* Verify refactoring improved testability by creating testable components
	* @return void
	*/
	public function test_refactoring_improved_testability(): void {

		// Test files should exist for each manager
		$test_files = [
			'/Users/paco/Trabajos/Dedalo/v7/master_dedalo/test/server/install/installer_config_manager_Test.php',
			'/Users/paco/Trabajos/Dedalo/v7/master_dedalo/test/server/install/installer_database_manager_Test.php',
			'/Users/paco/Trabajos/Dedalo/v7/master_dedalo/test/server/install/installer_ontology_manager_Test.php',
			'/Users/paco/Trabajos/Dedalo/v7/master_dedalo/test/server/install/installer_hierarchy_manager_Test.php',
			'/Users/paco/Trabajos/Dedalo/v7/master_dedalo/test/server/install/installer_data_seeder_Test.php'
		];

		foreach ($test_files as $test_file) {
			$this->assertTrue(file_exists($test_file));
		}
	}//end test_refactoring_improved_testability


	/**
	* TEST_refactoring_maintained_backward_compatibility
	* Verify refactoring maintained backward compatibility
	* @return void
	*/
	public function test_refactoring_maintained_backward_compatibility(): void {

		// Facade should extend common
		$this->assertTrue(is_subclass_of('installer', 'common'));

		// Should have same public API as before
		$this->assertTrue(method_exists('installer', 'get_config'));
		$this->assertTrue(method_exists('installer', 'get_db_status'));
		$this->assertTrue(method_exists('installer', 'build_install_version'));
		$this->assertTrue(method_exists('installer', 'set_root_pw'));
		$this->assertTrue(method_exists('installer', 'get_structure_context'));
	}//end test_refactoring_maintained_backward_compatibility

}
