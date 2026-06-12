<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';
require_once 'elements.php';



/**
* EXPORT_VALUE_PARITY_TEST
* Asserts that the atoms based export contract (get_export_value()->to_flat_string())
* produces the same flat string as the legacy grid path
* (dd_grid_cell_object::resolve_value(get_grid_value())) for every fixture element.
*
* Relation components (component_relation_common descendants) resolve their
* children recursively via export_context (phase 4) and are compared too.
*/
final class export_value_parity_test extends BaseTestCase {



	/**
	* TEST_USER_LOGIN
	* @return void
	*/
	public function test_user_login() {

		$user_id = TEST_USER_ID; // Defined in bootstrap

		if (login::is_logged()===false) {
			login_test::force_login($user_id);
		}

		$this->assertTrue(
			login::is_logged()===true ,
			'expected login true'
		);
	}//end test_user_login



	/////////// ⬇︎ test start ⬇︎ ////////////////



	/**
	* TEST_FLAT_PARITY
	* @return void
	*/
	public function test_flat_parity() {

		$this->user_login();

		$compared = 0;

		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);

			// legacy reference
				$legacy_grid	= $component->get_grid_value();
				$legacy_flat	= dd_grid_cell_object::resolve_value($legacy_grid);

			// atoms path
				$export_flat = $component->get_export_value()->to_flat_string();

			// accepted deviation: relation components without ddo children
			// (no export paths configured) produced separator-only strings
			// in the legacy grid (' | ' for two empty rows); the atoms path
			// produces a clean empty cell instead
				if ($export_flat==='' && trim($legacy_flat, ' |,')==='') {
					continue;
				}

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors' . PHP_EOL
				.'$_ENV[DEDALO_LAST_ERROR]: ' . to_string($_ENV['DEDALO_LAST_ERROR']) ." ($element->model)"
			);

			$this->assertSame(
				$legacy_flat,
				$export_flat,
				"expected flat parity between legacy grid and atoms ($element->model - $element->tipo)"
			);

			$compared++;
		}//end foreach (get_elements() as $element)

		// guard: the loop must compare a meaningful number of elements
		$this->assertGreaterThan(10, $compared, 'expected fixture coverage');
	}//end test_flat_parity



	/**
	* TEST_VALUE_WITH_PARENTS
	* Export option: relation components emit the ancestor chain of every
	* locator target as a 'parents' sub-column when the export_context flag
	* is on (export tool checkbox, default off).
	* Fixture: test3 record 1 has a parent (test71 -> test3:4).
	* @return void
	*/
	public function test_value_with_parents() {

		$this->user_login();

		// fixture: test3 record 1 has parents (component_relation_parent test71).
		// The chain target changes across suite runs (lifecycle tests rewrite
		// record 1's parent locator), so resolve the CURRENT chain and seed the
		// thesaurus term (test3 section_map thesaurus.term = test52) on every
		// chain record that lacks one, so ts_object::get_term_by_locator can
		// resolve it.
			$ar_parents = component_relation_parent::get_parents_recursive(1, 'test3');
			$this->assertNotEmpty(
				$ar_parents,
				'fixture guard: test3 record 1 must have parents (component_relation_parent test71)'
			);
			foreach ($ar_parents as $parent_locator) {
				$term_component = component_common::get_instance(
					'component_input_text', // string model
					'test52', // string tipo (test3 thesaurus term)
					(string)$parent_locator->section_id, // string section_id (chain record)
					'edit', // string mode
					DEDALO_DATA_LANG, // string lang
					'test3', // string section_tipo
					false // bool cache
				);
				if (empty($term_component->get_data())) {
					$term_component->set_data(['Parent term ' . $parent_locator->section_id]);
					$save_result = $term_component->Save();
					$this->assertNotFalse($save_result, 'fixture seed: failed saving the parent term');
				}
			}

		// bust the term session cache: earlier tests in the same process may
		// have resolved chain records BEFORE the seeding (stale empty values)
			ts_object::$term_by_locator_data_cache = [];

		// expected chain from the same resolver the feature reuses
			$locator = (object)[
				'section_tipo'	=> 'test3',
				'section_id'	=> '1'
			];
			$expected_chain = component_relation_common::get_locator_value(
				$locator, // object locator
				DEDALO_DATA_LANG, // string lang
				true, // bool show_parents
				null, // array|null ar_components_related
				false // bool include_self
			) ?? [];
			$expected_chain = array_values(array_filter($expected_chain, fn($v) => !empty($v)));
			$this->assertNotEmpty(
				$expected_chain,
				'fixture guard: the seeded chain terms must resolve'
			);

		// portal with an injected locator to the hierarchical record
			$portal = component_common::get_instance(
				'component_portal', // string model
				'test80', // string tipo
				'2', // string section_id (NOT 1: the locator targets test3:1 and set_data drops autoreferences)
				'edit', // string mode
				DEDALO_DATA_NOLAN, // string lang
				'test3', // string section_tipo
				false // bool cache
			);
			$portal->set_data([ $locator ]);

		// ddo_map: resolve the target section_id component (test102)
			$child_ddo = new dd_object();
				$child_ddo->set_tipo('test102');
				$child_ddo->set_section_tipo('test3');
				$child_ddo->set_model('component_section_id');
				$child_ddo->set_parent('test80');
				$child_ddo->set_label('Id');

		// flag ON: parents atoms present
			$context_on = new export_context((object)[
				'ddo_map'				=> [$child_ddo],
				'value_with_parents'	=> true
			]);
			$export_value_on = $portal->get_export_value($context_on);

			$parents_atoms = array_values(array_filter($export_value_on->atoms, function($atom){
				$leaf = $atom->get_leaf_segment();
				return $leaf->sub_id==='parents';
			}));
			$this->assertNotEmpty($parents_atoms, 'expected parents atoms with the flag on');

			// values match the shared resolver output, in order
				$this->assertSame(
					$expected_chain,
					array_map(fn($atom) => $atom->value, $parents_atoms)
				);

			// structural contract: own sub-column identity, locator index, ' > ' join
				$leaf = $parents_atoms[0]->get_leaf_segment();
				$this->assertSame('test3_test80#parents',	$leaf->get_identity_key());
				$this->assertSame(0,						$leaf->item_index);
				$this->assertSame(' > ',					$leaf->fields_separator);

			// the term atom (section_id child) is still exported alongside
				$term_atom = array_find($export_value_on->atoms, function($atom){
					return $atom->get_base_key()==='test3_test80.test3_test102';
				});
				$this->assertNotNull($term_atom, 'expected the child term atom alongside the parents');

		// flag OFF (default): identical output without any parents atom
			$portal_off = component_common::get_instance(
				'component_portal', 'test80', '2', 'edit', DEDALO_DATA_NOLAN, 'test3', false
			);
			$portal_off->set_data([ $locator ]);
			$context_off = new export_context((object)[
				'ddo_map' => [$child_ddo]
			]);
			$export_value_off = $portal_off->get_export_value($context_off);

			foreach ($export_value_off->atoms as $atom) {
				$this->assertNotSame(
					'parents',
					$atom->get_leaf_segment()->sub_id,
					'expected NO parents atoms with the flag off (default)'
				);
			}
			$this->assertSame(
				sizeof($export_value_on->atoms) - sizeof($parents_atoms),
				sizeof($export_value_off->atoms),
				'expected flag off output to differ only by the parents atoms'
			);
	}//end test_value_with_parents



}//end class export_value_parity_test
