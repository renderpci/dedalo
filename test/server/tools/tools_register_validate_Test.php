<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* TOOLS_REGISTER_VALIDATE_TEST
* Covers the v7 authoring register.json format:
* - convert_register_authoring_to_v7() produces a valid column-keyed object
* - validate_register() accepts valid input and reports specific errors
* - real in-repo v6 register.json files pass converter + validator
*/
final class tools_register_validate_test extends BaseTestCase {



	/**
	* Helper. Minimal valid authoring object
	*/
	private function minimal_authoring(string $name='tool_test_fixture') : object {
		return (object)[
			'name'    => $name,
			'version' => '1.0.0',
			'label'   => (object)['lg-eng' => 'Test fixture']
		];
	}



	/**
	* TEST_AUTHORING_CONVERTER_MINIMAL
	* Minimal authoring file converts and validates with defaults applied
	* @return void
	*/
	public function test_authoring_converter_minimal() : void {

		$converted = tools_register::convert_register_authoring_to_v7( $this->minimal_authoring() );

		// validator accepts it
			$errors = tools_register::validate_register($converted, 'tool_test_fixture');
			$this->assertSame([], $errors, 'expected no validation errors: ' . implode(' | ', $errors));

		// required columns exist (update_tool_registry_sections contract)
			$this->assertTrue(isset($converted->data), 'expected data column');
			$this->assertTrue(isset($converted->relation), 'expected relation column');

		// name/version/label landed in the string column
			$this->assertSame('tool_test_fixture', $converted->string->{tool_ontology_map::TOOL_NAME}[0]->value ?? null);
			$this->assertSame('1.0.0', $converted->string->{tool_ontology_map::VERSION}[0]->value ?? null);
			$this->assertSame('Test fixture', $converted->string->{tool_ontology_map::TOOL_LABEL}[0]->value ?? null);
			$this->assertSame('lg-eng', $converted->string->{tool_ontology_map::TOOL_LABEL}[0]->lang ?? null);

		// default: active=true as dd64 locator (section_id 1 = yes)
			$active = $converted->relation->{tool_ontology_map::ACTIVE}[0] ?? null;
			$this->assertNotNull($active, 'expected active locator');
			$this->assertSame('1', $active->section_id, 'expected active=true (dd64 section_id 1)');
			$this->assertSame('dd64', $active->section_tipo);

		// default: show_in_component=false (section_id 2 = no)
			$show = $converted->relation->{tool_ontology_map::SHOW_IN_COMPONENT}[0] ?? null;
			$this->assertSame('2', $show->section_id ?? null, 'expected show_in_component=false');

		// default: affected_tipos=[] present as json component
			$affected_tipos = $converted->misc->{tool_ontology_map::AFFECTED_TIPOS}[0]->value ?? null;
			$this->assertSame([], $affected_tipos, 'expected empty affected_tipos default');

		// meta counters
			$this->assertSame(1, $converted->meta->{tool_ontology_map::TOOL_NAME}[0]->count ?? null);
	}//end test_authoring_converter_minimal



	/**
	* TEST_AUTHORING_CONVERTER_AFFECTED_MODELS
	* Model names resolve to dd1342 locators
	* @return void
	*/
	public function test_authoring_converter_affected_models() : void {

		$authoring = $this->minimal_authoring();
		$authoring->affected_models = ['section'];

		$converted	= tools_register::convert_register_authoring_to_v7($authoring);
		$locators	= $converted->relation->{tool_ontology_map::AFFECTED_MODELS} ?? null;

		$this->assertNotEmpty($locators, 'expected affected_models locators for model: section');
		$this->assertSame('dd1342', $locators[0]->section_tipo, 'expected locator to models section dd1342');
		$this->assertNotEmpty($locators[0]->section_id, 'expected resolved section_id');
		$this->assertSame(tool_ontology_map::AFFECTED_MODELS, $locators[0]->from_component_tipo);
	}//end test_authoring_converter_affected_models



	/**
	* TEST_VALIDATE_REGISTER_ERRORS
	* Specific errors for missing/invalid fields
	* @return void
	*/
	public function test_validate_register_errors() : void {

		// missing name
			$no_name = tools_register::convert_register_authoring_to_v7((object)[
				'version' => '1.0.0',
				'label'   => (object)['lg-eng' => 'X']
			]);
			$errors = tools_register::validate_register($no_name, 'tool_test_fixture');
			$this->assertNotEmpty(
				array_filter($errors, fn($e) => str_contains($e, "Missing required 'name'")),
				'expected missing name error, got: ' . implode(' | ', $errors)
			);

		// invalid name pattern
			$bad_name = tools_register::convert_register_authoring_to_v7( $this->minimal_authoring('my_bad_name') );
			$errors = tools_register::validate_register($bad_name, 'my_bad_name');
			$this->assertNotEmpty(
				array_filter($errors, fn($e) => str_contains($e, 'must match')),
				'expected name pattern error, got: ' . implode(' | ', $errors)
			);

		// name != directory basename
			$errors = tools_register::validate_register(
				tools_register::convert_register_authoring_to_v7( $this->minimal_authoring() ),
				'tool_other_dir'
			);
			$this->assertNotEmpty(
				array_filter($errors, fn($e) => str_contains($e, 'does not match its directory')),
				'expected directory mismatch error, got: ' . implode(' | ', $errors)
			);

		// invalid version
			$bad_version = $this->minimal_authoring();
			$bad_version->version = 'not-a-version';
			$errors = tools_register::validate_register(
				tools_register::convert_register_authoring_to_v7($bad_version),
				'tool_test_fixture'
			);
			$this->assertNotEmpty(
				array_filter($errors, fn($e) => str_contains($e, 'Invalid version')),
				'expected version error, got: ' . implode(' | ', $errors)
			);

		// missing label
			$no_label = tools_register::convert_register_authoring_to_v7((object)[
				'name'    => 'tool_test_fixture',
				'version' => '1.0.0'
			]);
			$errors = tools_register::validate_register($no_label, 'tool_test_fixture');
			$this->assertNotEmpty(
				array_filter($errors, fn($e) => str_contains($e, "Missing required 'label'")),
				'expected missing label error, got: ' . implode(' | ', $errors)
			);
	}//end test_validate_register_errors



	/**
	* TEST_V6_CORPUS_PASSES_VALIDATION
	* Every in-repo v6 register.json passes converter + validator.
	* This is the guarantee that the new validation gate does not break
	* re-registration of existing production tools.
	* @return void
	*/
	public function test_v6_corpus_passes_validation() : void {

		$register_files = glob(DEDALO_TOOLS_PATH . '/tool_*/register.json');
		$this->assertNotEmpty($register_files, 'expected in-repo register.json corpus');

		$checked = 0;
		foreach ($register_files as $file) {

			$basename = basename(dirname($file));
			$json     = json_decode(file_get_contents($file));
			$this->assertNotNull($json, "register.json is not valid JSON: $basename");

			$converted = (isset($json->name) && !isset($json->components) && !isset($json->data))
				? tools_register::convert_register_authoring_to_v7($json)
				: tools_register::convert_register_v6_to_v7(clone $json);

			$errors = tools_register::validate_register($converted, $basename);
			$this->assertSame(
				[],
				$errors,
				"validation failed for in-repo tool '$basename': " . implode(' | ', $errors)
			);
			$checked++;
		}

		$this->assertGreaterThan(20, $checked, 'expected to validate the full in-repo corpus');
	}//end test_v6_corpus_passes_validation



}//end class tools_register_validate_test
