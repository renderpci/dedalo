<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* GET_TOOLS_AVAILABILITY_TEST
* Parity tests for the is_available() delegation refactor of common::get_tools():
* the previously hardcoded tool_diffusion / tool_time_machine cases moved into
* the tool classes, and the dd15 rule stayed in core. The snapshot at
* contract/snapshots/get_tools_parity.json was generated on the commit BEFORE
* the refactor; the output must be byte-identical after it.
*
* Snapshot regeneration (only when tool availability semantics intentionally
* change): run the generation block documented in the repo history (commit
* introducing this file) against the wanted baseline commit.
*/
final class get_tools_availability_test extends BaseTestCase {



	/**
	* Helper. Tool names for an element instance, bypassing the static cache
	*/
	private function tool_names(object $element) : array {
		common::$cache_get_tools = [];
		// null (not unset!) clears the per-instance memo: isset(null) is false,
		// while unset() on a declared property would re-route later access
		// through common::__get/__set, which swallow undeclared properties
		$element->tools = null;
		return array_values(array_map(fn($t) => $t->name, $element->get_tools()));
	}



	/**
	* Helper. Find the first component tipo of a model inside a section
	*/
	private function find_component_tipo(string $section_tipo, string $model) : ?string {
		$real_section	= section::get_section_real_tipo_static($section_tipo);
		$ar_children	= section::get_ar_children_tipo_by_model_name_in_section(
			$real_section,
			['component'],
			true, false, true, false
		);
		foreach ($ar_children as $child_tipo) {
			if (ontology_node::get_model_by_tipo($child_tipo, true)===$model) {
				return $child_tipo;
			}
		}
		return null;
	}



	/**
	* TEST_PARITY_SNAPSHOT
	* get_tools() output is identical to the pre-refactor snapshot
	* @return void
	*/
	public function test_parity_snapshot() : void {

		$snapshot_file = dirname(__DIR__) . '/contract/snapshots/get_tools_parity.json';
		$this->assertFileExists($snapshot_file);
		$snapshot = json_decode( file_get_contents($snapshot_file), true );
		$this->assertIsArray($snapshot);

		foreach ($snapshot as $case => $expected_names) {

			$names = null;

			if (str_starts_with($case, 'section_')) {
				$section_tipo	= substr($case, strlen('section_'));
				$section_tipo	= $section_tipo==='dd15' ? DEDALO_TIME_MACHINE_SECTION_TIPO : $section_tipo;
				$mode			= $section_tipo===DEDALO_TIME_MACHINE_SECTION_TIPO ? 'list' : 'edit';
				$element		= section::get_instance($section_tipo, $mode);
				$names			= $this->tool_names($element);
			} else {
				// component case key: component_{model...}_{section}_{tipo}
				if (preg_match('/^(component_[a-z_]+)_(\w+?)_(\w+)$/', $case, $m) === 1) {
					[, $model, $section_tipo, $tipo] = $m;
					$element = component_common::get_instance($model, $tipo, '1', 'edit', DEDALO_DATA_NOLAN, $section_tipo);
					$names   = $this->tool_names($element);
				}
			}

			$this->assertNotNull($names, "unparseable snapshot case key: $case");
			$this->assertSame($expected_names, $names, "get_tools() parity broken for case: $case");
		}
	}//end test_parity_snapshot



	/**
	* TEST_DIFFUSION_INVARIANTS
	* Behavior derived from the same primitive the old inline code used, so
	* it holds on any install regardless of diffusion configuration.
	* @return void
	*/
	public function test_diffusion_invariants() : void {

		// components never get tool_diffusion
			$component_tipo = $this->find_component_tipo('test3', 'component_input_text');
			if ($component_tipo!==null) {
				$component	= component_common::get_instance('component_input_text', $component_tipo, '1', 'edit', DEDALO_DATA_NOLAN, 'test3');
				$names		= $this->tool_names($component);
				$this->assertNotContains('tool_diffusion', $names, 'components must never get tool_diffusion');
			}

		// section expectation matches diffusion_utils truth
			$section	= section::get_instance('oh1', 'edit');
			$names		= $this->tool_names($section);
			$expected	= diffusion_utils::have_section_diffusion('oh1') !== false;
			$this->assertSame(
				$expected,
				in_array('tool_diffusion', $names, true),
				'tool_diffusion presence must match diffusion_utils::have_section_diffusion'
			);

		// the hook itself agrees
			$this->assertSame(
				$expected,
				tool_diffusion::is_available((object)[
					'caller_model'	=> 'section',
					'called_class'	=> 'section',
					'is_component'	=> false,
					'tipo'			=> 'oh1',
					'section_tipo'	=> 'oh1',
					'mode'			=> 'edit'
				])
			);
	}//end test_diffusion_invariants



	/**
	* TEST_TIME_MACHINE_INVARIANTS
	* @return void
	*/
	public function test_time_machine_invariants() : void {

		// relation_children excludes tool_time_machine
			$children_tipo = $this->find_component_tipo('test3', 'component_relation_children');
			if ($children_tipo!==null) {
				$component	= component_common::get_instance('component_relation_children', $children_tipo, '1', 'edit', DEDALO_DATA_NOLAN, 'test3');
				$names		= $this->tool_names($component);
				$this->assertNotContains('tool_time_machine', $names, 'relation_children must not get tool_time_machine');
			}

		// a sibling input_text component includes it (superuser has all tools)
			$input_tipo = $this->find_component_tipo('test3', 'component_input_text');
			if ($input_tipo!==null) {
				$component	= component_common::get_instance('component_input_text', $input_tipo, '1', 'edit', DEDALO_DATA_NOLAN, 'test3');
				$names		= $this->tool_names($component);
				$this->assertContains('tool_time_machine', $names, 'input_text components get tool_time_machine');
			}

		// the hook itself
			$base_context = [
				'caller_model'	=> 'component_relation_children',
				'called_class'	=> 'component_relation_children',
				'is_component'	=> true,
				'tipo'			=> 'x',
				'section_tipo'	=> 'test3',
				'mode'			=> 'edit'
			];
			$this->assertFalse( tool_time_machine::is_available((object)$base_context) );
			$this->assertTrue( tool_time_machine::is_available((object)array_merge($base_context, ['called_class' => 'component_input_text'])) );
	}//end test_time_machine_invariants



	/**
	* TEST_DD15_ONLY_TOOL_EXPORT
	* @return void
	*/
	public function test_dd15_only_tool_export() : void {

		$section	= section::get_instance(DEDALO_TIME_MACHINE_SECTION_TIPO, 'list');
		$names		= $this->tool_names($section);

		$this->assertSame([], array_values(array_diff($names, ['tool_export'])), 'dd15 section allows only tool_export');
	}//end test_dd15_only_tool_export



	/**
	* TEST_TOOL_DECLARES_AVAILABILITY
	* @return void
	*/
	public function test_tool_declares_availability() : void {

		$this->assertTrue( tool_common::tool_declares_availability('tool_diffusion') );
		$this->assertTrue( tool_common::tool_declares_availability('tool_time_machine') );
		$this->assertFalse( tool_common::tool_declares_availability('tool_export'), 'tools without the hook take the default path' );
		$this->assertFalse( tool_common::tool_declares_availability('tool_nonexistent_xyz') );
	}//end test_tool_declares_availability



}//end class get_tools_availability_test
