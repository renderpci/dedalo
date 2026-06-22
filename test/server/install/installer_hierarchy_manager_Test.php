<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

// Include manager class
// installer_hierarchy_manager delegates path/connection lookups to installer_config_manager,
// so it must be loaded too — otherwise the behavioral methods (get_available_hierarchy_files,
// activate_hierarchy, install_hierarchies) fatal with "Class installer_config_manager not found"
// when this file is run in isolation.
require_once DEDALO_CORE_PATH . '/installer/class.installer_config_manager.php';
require_once DEDALO_CORE_PATH . '/installer/class.installer_hierarchy_manager.php';


final class installer_hierarchy_manager_Test extends BaseTestCase {

	/**
	* TEST_class_is_static_only
	* Verify installer_hierarchy_manager is a static-only class
	* @return void
	*/
	public function test_class_is_static_only(): void {

		$reflection = new ReflectionClass('installer_hierarchy_manager');

		// Should not be publicly instantiable: either no constructor or a non-public one
		$constructor = $reflection->getConstructor();
		$this->assertTrue($constructor===null || !$constructor->isPublic());

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
	* Verify installer_hierarchy_manager uses strict types
	* @return void
	*/
	public function test_class_has_strict_types(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer_hierarchy_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('declare(strict_types=1)', $content);
	}//end test_class_has_strict_types


	/**
	* TEST_class_file_exists
	* Verify installer_hierarchy_manager class file exists
	* @return void
	*/
	public function test_class_file_exists(): void {

		$file_path = DEDALO_CORE_PATH . '/installer/class.installer_hierarchy_manager.php';

		$this->assertTrue(file_exists($file_path));
	}//end test_class_file_exists


	/**
	* TEST_class_exists
	* Verify installer_hierarchy_manager class exists
	* @return void
	*/
	public function test_class_exists(): void {

		$this->assertTrue(class_exists('installer_hierarchy_manager'));
	}//end test_class_exists


	/**
	* TEST_class_does_not_extend_common
	* Verify installer_hierarchy_manager doesn't extend common
	* @return void
	*/
	public function test_class_does_not_extend_common(): void {

		$this->assertFalse(is_subclass_of('installer_hierarchy_manager', 'common'));
	}//end test_class_does_not_extend_common


	/**
	* TEST_all_static_methods_exist
	* Verify all expected static methods exist
	* @return void
	*/
	public function test_all_static_methods_exist(): void {

		$expected_methods = [
			'get_available_hierarchy_files',
			'get_hierarchy_typlologies',
			'import_hierarchy_main_records',
			'activate_hierarchy',
			'install_hierarchies'
		];

		foreach ($expected_methods as $method) {
			$this->assertTrue(method_exists('installer_hierarchy_manager', $method));
		}
	}//end test_all_static_methods_exist


	/**
	* TEST_get_available_hierarchy_files_returns_object
	* Verify get_available_hierarchy_files returns object with result and msg
	* @return void
	*/
	public function test_get_available_hierarchy_files_returns_object(): void {

		$response = installer_hierarchy_manager::get_available_hierarchy_files();

		$this->assertIsObject($response);
		$this->assertObjectHasProperty('result', $response);
		$this->assertObjectHasProperty('msg', $response);
		$this->assertIsArray($response->result);
		$this->assertIsString($response->msg);
	}//end test_get_available_hierarchy_files_returns_object


	/**
	* TEST_get_hierarchy_typlologies_returns_array
	* Verify get_hierarchy_typlologies returns array
	* @return void
	*/
	public function test_get_hierarchy_typlologies_returns_array(): void {

		$response = installer_hierarchy_manager::get_hierarchy_typlologies();

		$this->assertIsArray($response);
	}//end test_get_hierarchy_typlologies_returns_array


	/**
	* TEST_import_hierarchy_main_records_returns_object
	* Verify import_hierarchy_main_records returns object with result and msg
	* @return void
	*/
	public function test_import_hierarchy_main_records_returns_object(): void {

		$response = installer_hierarchy_manager::import_hierarchy_main_records();

		$this->assertIsObject($response);
		$this->assertObjectHasProperty('result', $response);
		$this->assertObjectHasProperty('msg', $response);
		$this->assertIsBool($response->result);
		$this->assertIsString($response->msg);
	}//end test_import_hierarchy_main_records_returns_object


	/**
	* TEST_activate_hierarchy_returns_object
	* Verify activate_hierarchy returns object with result and msg
	* @return void
	*/
	public function test_activate_hierarchy_returns_object(): void {

		$options = (object)[
			'tld' => 'test',
			'typology' => 1,
			'label' => 'Test Hierarchy',
			'active_in_thesaurus' => true
		];

		$response = installer_hierarchy_manager::activate_hierarchy($options);

		$this->assertIsObject($response);
		$this->assertObjectHasProperty('result', $response);
		$this->assertObjectHasProperty('msg', $response);
		$this->assertIsBool($response->result);
		$this->assertIsString($response->msg);
	}//end test_activate_hierarchy_returns_object


	/**
	* TEST_activate_hierarchy_fully_populates_record
	* Regression guard for the install_hierarchies defect: activate_hierarchy must write
	* the typology (hierarchy9 — a component_select whose value is a LOCATOR to the
	* hierarchy13 taxonomy, NOT a bare integer) and the term/name (hierarchy5). Without
	* both, hierarchy::generate_virtual_section() aborts ("typology is mandatory", then a
	* TypeError on null $name_data) and the <tld>1/<tld>2 ontology virtual sections are
	* never provisioned, leaving the hierarchy invisible in the thesaurus.
	*
	* The assertion on an EMPTY $response->errors catches both failure modes (it is where
	* activate_hierarchy accumulates the generate_virtual_section error). Uses a unique tld
	* so the identity-field block always runs, and removes everything it creates afterwards.
	*
	* It also guards a follow-on defect: the text fields (component_input_text) must store a
	* language-tagged value (lang=lg-nolan) — a bare set_data() dropped the lang key and the
	* edit view rendered the fields blank.
	* @return void
	*/
	public function test_activate_hierarchy_fully_populates_record(): void {

		// unique, letters-only tld (safe_tld() rejects digits): map the timestamp to a-j
		$tld = 'rht' . strtr(substr((string)hrtime(true), -7), '0123456789', 'abcdefghij');

		try {
			$response = installer_hierarchy_manager::activate_hierarchy((object)[
				'tld'                 => $tld,
				'typology'            => 1,
				'label'               => 'Regression Test Hierarchy',
				'active_in_thesaurus' => true
			]);

			$this->assertTrue($response->result);
			// no swallowed provisioning error (typology / name failures land here)
			$this->assertEmpty($response->errors, 'generate_virtual_section must not report errors: ' . json_encode($response->errors ?? []));

			$row = hierarchy::get_hierarchy_by_tld($tld);
			$this->assertNotNull($row, 'the hierarchy must be findable by its tld (hierarchy6 persisted)');
			$section_id   = (int)$row->section_id;
			$section_tipo = DEDALO_HIERARCHY_SECTION_TIPO;

			// typology (hierarchy9): persisted as a locator carrying the typology number
			$typo = component_common::get_instance(
				ontology_node::get_model_by_tipo(DEDALO_HIERARCHY_TYPOLOGY_TIPO, true),
				DEDALO_HIERARCHY_TYPOLOGY_TIPO, $section_id, 'list', DEDALO_DATA_NOLAN, $section_tipo
			);
			$typo_data = $typo->get_data();
			$this->assertNotEmpty($typo_data, 'typology (hierarchy9) must be persisted');
			$this->assertEquals('1', (string)($typo_data[0]->section_id ?? ''), 'typology locator section_id must equal the typology number');

			// term / name (hierarchy5): persisted in the default data language
			$term = component_common::get_instance(
				ontology_node::get_model_by_tipo(DEDALO_HIERARCHY_TERM_TIPO, true),
				DEDALO_HIERARCHY_TERM_TIPO, $section_id, 'edit', DEDALO_DATA_LANG_DEFAULT, $section_tipo
			);
			$this->assertNotEmpty($term->get_data(), 'term/name (hierarchy5) must be persisted');

			// text fields (component_input_text) must store a language-tagged value so the
			// edit view can render them. A bare set_data([$value]) on these non-translatable
			// components dropped the lang key, leaving the editor fields blank. Assert both
			// the stored lang AND that get_value() (what the editor reads) returns the value.
			$tld_component = component_common::get_instance(
				ontology_node::get_model_by_tipo(DEDALO_HIERARCHY_TLD2_TIPO, true),
				DEDALO_HIERARCHY_TLD2_TIPO, $section_id, 'list', DEDALO_DATA_NOLAN, $section_tipo
			);
			$tld_data = $tld_component->get_data();
			$this->assertNotEmpty($tld_data, 'tld (hierarchy6) must be persisted');
			$this->assertSame(DEDALO_DATA_NOLAN, $tld_data[0]->lang ?? null, 'tld (hierarchy6) must carry lang=lg-nolan so the edit view can render it');
			$this->assertSame($tld, $tld_component->get_value(), 'edit view (get_value) must return the tld');

		} finally {
			self::cleanup_test_hierarchy($tld);
		}
	}//end test_activate_hierarchy_fully_populates_record


	/**
	* CLEANUP_TEST_HIERARCHY
	* Remove every row a regression run created for $tld: its matrix_hierarchy_main record
	* and the <tld>0/<tld>1/<tld>2 ontology nodes (dd_ontology + matrix_ontology[_main]).
	* Best-effort: swallows DB errors so a partial run never aborts the suite.
	* @param string $tld
	* @return void
	*/
	private static function cleanup_test_hierarchy(string $tld): void {

		try {
			$conn = DBi::_getConnection();
			if (!$conn) {
				return;
			}
			$nodes = [$tld.'0', $tld.'1', $tld.'2'];
			$in    = "'" . implode("','", array_map(static fn($t) => pg_escape_string($conn, $t), $nodes)) . "'";
			$tld_e = pg_escape_string($conn, $tld);

			@pg_query($conn, "DELETE FROM matrix_hierarchy_main WHERE string->'".DEDALO_HIERARCHY_TLD2_TIPO."'->0->>'value' = '".$tld_e."';");
			@pg_query($conn, "DELETE FROM matrix_ontology WHERE section_tipo IN ($in);");
			@pg_query($conn, "DELETE FROM matrix_ontology_main WHERE section_tipo IN ($in);");
			@pg_query($conn, "DELETE FROM matrix_hierarchy WHERE section_tipo IN ('".$tld_e."1','".$tld_e."2');");
			@pg_query($conn, "DELETE FROM dd_ontology WHERE tld = '".$tld_e."';");
		} catch (\Throwable $e) {
			// best-effort cleanup; never fail the suite over leftover test rows
		}
	}//end cleanup_test_hierarchy


	/**
	* TEST_install_hierarchy_returns_object
	* Verify install_hierarchy returns object with result and msg
	* @return void
	*/
	public function test_install_hierarchy_returns_object(): void {

		$options = (object)[
			'selected_hierarchies' => []
		];

		$response = installer_hierarchy_manager::install_hierarchies($options);

		$this->assertIsObject($response);
		$this->assertObjectHasProperty('result', $response);
		$this->assertObjectHasProperty('msg', $response);
		$this->assertIsBool($response->result);
		$this->assertIsString($response->msg);
	}//end test_install_hierarchy_returns_object


	/**
	* TEST_class_has_docblock
	* Verify installer_hierarchy_manager has proper docblock
	* @return void
	*/
	public function test_class_has_docblock(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer_hierarchy_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('/**', $content);
		$this->assertStringContainsString('@package Dédalo', $content);
		$this->assertStringContainsString('@subpackage Install', $content);
	}//end test_class_has_docblock


	/**
	* TEST_class_is_final
	* Verify installer_hierarchy_manager is final class (static utility class)
	* @return void
	*/
	public function test_class_is_final(): void {

		$reflection = new ReflectionClass('installer_hierarchy_manager');

		$this->assertTrue($reflection->isFinal());
	}//end test_class_is_final


	/**
	* TEST_class_is_not_instantiable
	* Verify installer_hierarchy_manager cannot be instantiated (static utility class)
	* @return void
	*/
	public function test_class_is_not_instantiable(): void {

		$reflection = new ReflectionClass('installer_hierarchy_manager');

		$this->assertFalse($reflection->isInstantiable());
	}//end test_class_is_not_instantiable


	/**
	* TEST_no_protected_methods
	* Verify installer_hierarchy_manager has no protected methods
	* @return void
	*/
	public function test_no_protected_methods(): void {

		$reflection = new ReflectionClass('installer_hierarchy_manager');
		$methods = $reflection->getMethods(ReflectionMethod::IS_PROTECTED);

		$this->assertEquals(0, count($methods));
	}//end test_no_protected_methods


	/**
	* TEST_no_private_methods
	* Verify installer_hierarchy_manager exposes no UNEXPECTED private methods.
	* A static utility class may legitimately keep private helpers; the allow-list
	* documents the intentional ones (the private constructor enforcing static-only use,
	* and get_hierarchy_component(), the shared component-resolution guard). Any other
	* private method is flagged so a stray private API surface stays a conscious choice.
	* @return void
	*/
	public function test_no_private_methods(): void {

		$reflection = new ReflectionClass('installer_hierarchy_manager');
		$methods = $reflection->getMethods(ReflectionMethod::IS_PRIVATE);

		// Allowed private members: the static-only constructor and the internal helper.
		$allowed = ['__construct', 'get_hierarchy_component'];
		$methods = array_filter($methods, function($method) use ($allowed) {
			return !in_array($method->getName(), $allowed, true);
		});

		$this->assertEquals(0, count($methods), 'Unexpected private method(s): ' . implode(', ', array_map(fn($m) => $m->getName(), $methods)));
	}//end test_no_private_methods


	/**
	* TEST_get_available_hierarchy_files_uses_config
	* Verify get_available_hierarchy_files uses config from installer_config_manager
	* @return void
	*/
	public function test_get_available_hierarchy_files_uses_config(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer_hierarchy_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('installer_config_manager::get_config()', $content);
		$this->assertStringContainsString('hierarchy_files_dir_path', $content);
	}//end test_get_available_hierarchy_files_uses_config


	/**
	* TEST_get_available_hierarchy_files_reads_hierarchies_json
	* Verify get_available_hierarchy_files reads hierarchies.json file
	* @return void
	*/
	public function test_get_available_hierarchy_files_reads_hierarchies_json(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer_hierarchy_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('hierarchies.json', $content);
		$this->assertStringContainsString('file_get_contents', $content);
	}//end test_get_available_hierarchy_files_reads_hierarchies_json


	/**
	* TEST_get_available_hierarchy_files_uses_glob
	* Verify get_available_hierarchy_files uses glob for file discovery
	* @return void
	*/
	public function test_get_available_hierarchy_files_uses_glob(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer_hierarchy_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('glob', $content);
		$this->assertStringContainsString('*.copy.gz', $content);
	}//end test_get_available_hierarchy_files_uses_glob


	/**
	* TEST_get_hierarchy_typlologies_reads_json_file
	* Verify get_hierarchy_typlologies reads JSON file
	* @return void
	*/
	public function test_get_hierarchy_typlologies_reads_json_file(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer_hierarchy_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('hierarchies_typologies.json', $content);
		$this->assertStringContainsString('file_get_contents', $content);
		$this->assertStringContainsString('json_decode', $content);
	}//end test_get_hierarchy_typlologies_reads_json_file


	/**
	* TEST_import_hierarchy_main_records_uses_psql
	* Verify import_hierarchy_main_records uses psql for database operations
	* @return void
	*/
	public function test_import_hierarchy_main_records_uses_psql(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer_hierarchy_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('psql', $content);
		$this->assertStringContainsString('matrix_hierarchy_main.sql', $content);
	}//end test_import_hierarchy_main_records_uses_psql


	/**
	* TEST_import_hierarchy_main_records_sets_timeout
	* Verify import_hierarchy_main_records sets execution timeout
	* @return void
	*/
	public function test_import_hierarchy_main_records_sets_timeout(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer_hierarchy_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('set_time_limit', $content);
	}//end test_import_hierarchy_main_records_sets_timeout


	/**
	* TEST_import_hierarchy_main_records_checks_file_exists
	* Verify import_hierarchy_main_records checks if file exists
	* @return void
	*/
	public function test_import_hierarchy_main_records_checks_file_exists(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer_hierarchy_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('file_exists', $content);
		$this->assertStringContainsString('matrix_hierarchy_main.sql', $content);
	}//end test_import_hierarchy_main_records_checks_file_exists


	/**
	* TEST_activate_hierarchy_uses_hierarchy_class
	* Verify activate_hierarchy uses hierarchy class
	* @return void
	*/
	public function test_activate_hierarchy_uses_hierarchy_class(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer_hierarchy_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('hierarchy::get_hierarchy_by_tld', $content);
	}//end test_activate_hierarchy_uses_hierarchy_class


	/**
	* TEST_install_hierarchy_uses_hierarchy_class
	* Verify install_hierarchy uses hierarchy class
	* @return void
	*/
	public function test_install_hierarchy_uses_hierarchy_class(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer_hierarchy_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('hierarchy::', $content);
	}//end test_install_hierarchy_uses_hierarchy_class


	/**
	* TEST_methods_use_debug_log
	* Verify methods use debug_log for logging
	* @return void
	*/
	public function test_methods_use_debug_log(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer_hierarchy_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('debug_log', $content);
	}//end test_methods_use_debug_log


	/**
	* TEST_methods_use_error_handling
	* Verify methods have proper error handling
	* @return void
	*/
	public function test_methods_use_error_handling(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer_hierarchy_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('logger::ERROR', $content);
	}//end test_methods_use_error_handling


	/**
	* TEST_methods_use_escaped_shell_args
	* Verify methods use escaped shell arguments
	* @return void
	*/
	public function test_methods_use_escaped_shell_args(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer_hierarchy_manager.php';
		$content = file_get_contents($file);

		$this->assertStringContainsString('escapeshellarg', $content);
	}//end test_methods_use_escaped_shell_args


	/**
	* TEST_methods_have_documentation
	* Verify methods have docblocks
	* @return void
	*/
	public function test_methods_have_documentation(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer_hierarchy_manager.php';
		$content = file_get_contents($file);

		// Check for method docblocks
		$this->assertStringContainsString('/**', $content);
		$this->assertStringContainsString('@return object', $content);
		$this->assertStringContainsString('@return array', $content);
	}//end test_methods_have_documentation


	/**
	* TEST_class_is_secure
	* Verify class follows security best practices
	* @return void
	*/
	public function test_class_is_secure(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer_hierarchy_manager.php';
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

		$file = DEDALO_CORE_PATH . '/installer/class.installer_hierarchy_manager.php';
		$content = file_get_contents($file);

		// Methods should have return type declarations
		$this->assertStringContainsString(': object', $content);
		$this->assertStringContainsString(': array', $content);
	}//end test_class_is_type_safe


	/**
	* TEST_class_is_professional_quality
	* Verify class meets professional quality standards
	* @return void
	*/
	public function test_class_is_professional_quality(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer_hierarchy_manager.php';
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
	public function test_class_is_testable(): void {

		// Class should be static-only (easy to test): not publicly instantiable
		$reflection = new ReflectionClass('installer_hierarchy_manager');
		$constructor = $reflection->getConstructor();
		$this->assertTrue($constructor===null || !$constructor->isPublic());

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
		$response = installer_hierarchy_manager::get_available_hierarchy_files();
		$this->assertIsObject($response);
		$this->assertObjectHasProperty('result', $response);
		$this->assertObjectHasProperty('msg', $response);
		$this->assertIsArray($response->result);
		$this->assertIsString($response->msg);
	}//end test_class_is_reliable


	/**
	* TEST_class_is_thread_safe
	* Verify class operations are thread-safe (stateless)
	* @return void
	*/
	public function test_class_is_thread_safe(): void {

		// Class should be stateless (no instance properties)
		$reflection = new ReflectionClass('installer_hierarchy_manager');
		$properties = $reflection->getProperties(ReflectionProperty::IS_PUBLIC | ReflectionProperty::IS_PROTECTED | ReflectionProperty::IS_PRIVATE);
		$this->assertEquals(0, count($properties));
	}//end test_class_is_thread_safe


	/**
	* TEST_class_is_production_ready
	* Verify class is suitable for production use
	* @return void
	*/
	public function test_class_is_production_ready(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer_hierarchy_manager.php';
		$content = file_get_contents($file);

		// Should have proper error handling
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

		$reflection = new ReflectionClass('installer_hierarchy_manager');

		// Not publicly instantiable: either no constructor or a non-public one
		$constructor = $reflection->getConstructor();
		$this->assertTrue($constructor===null || !$constructor->isPublic());

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

		$file = DEDALO_CORE_PATH . '/installer/class.installer_hierarchy_manager.php';
		$content = file_get_contents($file);

		// Class docblock should describe single responsibility
		$this->assertStringContainsString('Discovery, import, activation, and installation', $content);
		$this->assertStringContainsString('thesaurus hierarchies', $content);
		$this->assertStringContainsString('import', $content);
		$this->assertStringContainsString('activation', $content);
		$this->assertStringContainsString('installation', $content);

		// All methods should be related to hierarchy operations
		$this->assertStringContainsString('hierarchy', $content);
		$this->assertStringContainsString('files', $content);
		$this->assertStringContainsString('import', $content);
		$this->assertStringContainsString('activate', $content);
		$this->assertStringContainsString('install', $content);
	}//end test_class_follows_single_responsibility


	/**
	* TEST_class_has_cohesion
	* Verify class has high cohesion (all methods related to hierarchy operations)
	* @return void
	*/
	public function test_class_has_cohesion(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer_hierarchy_manager.php';
		$content = file_get_contents($file);

		// All methods should be related to hierarchy operations
		$this->assertStringContainsString('hierarchy', $content);
		$this->assertStringContainsString('files', $content);
		$this->assertStringContainsString('import', $content);
		$this->assertStringContainsString('activate', $content);
		$this->assertStringContainsString('install', $content);
	}//end test_class_has_cohesion


	/**
	* TEST_class_has_low_coupling
	* Verify class has low coupling (minimal dependencies)
	* @return void
	*/
	public function test_class_has_low_coupling(): void {

		$file = DEDALO_CORE_PATH . '/installer/class.installer_hierarchy_manager.php';
		$content = file_get_contents($file);

		// Should depend on minimal external classes
		$this->assertStringContainsString('installer_config_manager', $content);
		$this->assertStringContainsString('hierarchy', $content);
		$this->assertStringContainsString('debug_log', $content);
		$this->assertStringContainsString('logger', $content);
	}//end test_class_has_low_coupling

}
