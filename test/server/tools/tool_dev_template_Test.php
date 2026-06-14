<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

// load the template class directly: it is only autoload-registered when
// SHOW_DEVELOPER is true, but the test exercises it regardless
require_once DEDALO_TOOLS_PATH . '/tool_dev_template/class.tool_dev_template.php';



/**
* TOOL_DEV_TEMPLATE_TEST
* The reference test external developers copy for their own tools. Covers:
* - register.json (v7 authoring format) converts and validates
* - API_ACTIONS map form resolves through tool_security
* - a read action runs directly (the unit-level test of a tool method)
*/
final class tool_dev_template_test extends BaseTestCase {



	/**
	* TEST_REGISTER_JSON_IS_VALID
	* The shipped register.json must convert and validate. This is the test
	* to copy: it guards your register file against schema drift.
	* @return void
	*/
	public function test_register_json_is_valid() : void {

		$file = DEDALO_TOOLS_PATH . '/tool_dev_template/register.json';
		$this->assertFileExists($file);

		$json = json_decode( file_get_contents($file) );
		$this->assertNotNull($json, 'register.json must be valid JSON');
		$this->assertSame('tool_dev_template', $json->name ?? null, 'expected v7 authoring format with name key');

		$converted	= tools_register::convert_register_authoring_to_v7($json);
		$errors		= tools_register::validate_register($converted, 'tool_dev_template');
		$this->assertSame([], $errors, 'register.json validation failed: ' . implode(' | ', $errors));
	}//end test_register_json_is_valid



	/**
	* TEST_API_ACTIONS_RESOLUTION
	* The map-form constant resolves the declared gates and refuses
	* everything not listed.
	* @return void
	*/
	public function test_api_actions_resolution() : void {

		// declared read action carries its declarative spec
			$read = tool_security::resolve_action('tool_dev_template', 'get_component_data');
			$this->assertTrue($read->ok);
			$this->assertSame(['permission' => 'tipo', 'min_level' => 1], $read->spec);

		// developer-gated background action
			$bg = tool_security::resolve_action('tool_dev_template', 'long_process_demo');
			$this->assertTrue($bg->ok);
			$this->assertSame(['permission' => 'developer'], $bg->spec);

		// background allowlist
			$this->assertContains('long_process_demo', tool_dev_template::BACKGROUND_RUNNABLE);

		// anything unlisted is refused
			$ko = tool_security::resolve_action('tool_dev_template', 'load_component_sample');
			$this->assertFalse($ko->ok, 'expected unlisted method refused');
	}//end test_api_actions_resolution



	/**
	* TEST_GET_COMPONENT_DATA
	* Unit-level invocation of a tool action: call the static method directly
	* with a real component of the test section. (Full-dispatch integration
	* through dd_tools_api is covered by tool_security_Test.)
	* @return void
	*/
	public function test_get_component_data() : void {

		// resolve a component_input_text tipo inside the test3 section
			$section_tipo	= 'test3';
			$real_section	= section::get_section_real_tipo_static($section_tipo);
			$ar_children	= section::get_ar_children_tipo_by_model_name_in_section(
				$real_section,
				['component'],
				true, false, true, false
			);
			$component_tipo = null;
			foreach ($ar_children as $child_tipo) {
				if (ontology_node::get_model_by_tipo($child_tipo, true)==='component_input_text') {
					$component_tipo = $child_tipo;
					break;
				}
			}
			if ($component_tipo===null) {
				$this->markTestSkipped('No component_input_text found in test3 section');
			}

		$response = tool_dev_template::get_component_data((object)[
			'component_tipo'	=> $component_tipo,
			'section_id'		=> 1,
			'section_tipo'		=> $section_tipo
		]);

		$this->assertIsObject($response);
		$this->assertNotFalse($response->result, 'expected result: ' . ($response->msg ?? ''));
		$this->assertSame('component_input_text', $response->result->model ?? null);
		$this->assertSame($component_tipo, $response->result->component_tipo ?? null);
	}//end test_get_component_data



}//end class tool_dev_template_test
