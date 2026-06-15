<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';
require_once 'elements.php';



/**
* EXPORT_VALUE_PARITY_TEST
* Parity gates of the atoms contract:
* - facade invariant for EVERY fixture model:
*   get_value() === get_export_value()->to_flat_string()
* - legacy-tree comparison ONLY for the components that keep a structural
*   get_grid_value override (component_relation_common descendants,
*   component_info, component_inverse): their visual trees resolved with
*   dd_grid_cell_object::resolve_value must keep matching the atoms flat
*   string. Leaf components are excluded since convergence B2: their
*   get_grid_value IS the atoms adapter, making the comparison
*   self-referential (the shape is pinned by grid_value_snapshot_Test).
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

			// atoms path
				$export_flat = $component->get_export_value()->to_flat_string();

			// get_value() facade invariant (every model: get_value runs on atoms)
				$facade_value = $component->get_value();
				if ($facade_value!==$export_flat) {
					// re-read both adjacently (data-init race guard)
					$export_flat	= $component->get_export_value()->to_flat_string();
					$facade_value	= $component->get_value();
				}
				$this->assertSame(
					$export_flat,
					$facade_value,
					"expected get_value() to be the to_flat_string facade ($element->model)"
				);

			// legacy-tree comparison: only components keeping a STRUCTURAL
			// get_grid_value override (leaf models use the atoms adapter
			// since B2 — comparing them would be self-referential)
				$has_structural_override = ($component instanceof component_relation_common)
					|| ($component instanceof component_info)
					|| ($component instanceof component_inverse);
				if (!$has_structural_override) {
					continue;
				}

			// legacy reference
				$legacy_flat = dd_grid_cell_object::resolve_value( $component->get_grid_value() );

			// some components initialize their data on first read (null -> [],
			// references computed): when the two paths observed different data
			// states, recompute both adjacently (data-init race guard)
				if ($legacy_flat!==$export_flat) {
					$export_flat	= $component->get_export_value()->to_flat_string();
					$legacy_flat	= dd_grid_cell_object::resolve_value( $component->get_grid_value() );
				}

			// accepted deviations:
			// (1) relation components without ddo children (no export paths
			//     configured) produced separator-only strings in the legacy
			//     grid (' | ' for two empty rows); atoms produce '' instead
			// (2) relation records whose children resolve to nothing produced
			//     empty row segments in the legacy join (' | Parent term 3');
			//     atoms drop zero-atom records (clean output)
				if ($export_flat==='' && trim($legacy_flat, ' |,')==='') {
					continue;
				}
				$drop_empty_records = function(string $value) : string {
					$segments = array_filter(
						array_map('trim', explode(' | ', $value)),
						fn($segment) => $segment!==''
					);
					return implode(' | ', $segments);
				};
				if ($export_flat!==$legacy_flat && $export_flat===$drop_empty_records($legacy_flat)) {
					$compared++;
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

		// guard: the legacy-tree comparison must cover a meaningful number of
		// structural-override models (relation family + info + inverse)
		$this->assertGreaterThan(5, $compared, 'expected structural fixture coverage');
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
			if (empty($ar_parents)) {
				// Robust fixture: other lifecycle tests in the same suite can delete
				// record 1's test71 parent relation entirely. Seed one (pointing at a
				// freshly created target record) so this test is order-independent.
				$seed_target_id = section::get_instance('test3', 'edit', false)->create_record();
				$seed_rel = component_common::get_instance('component_relation_parent', 'test71', '1', 'edit', DEDALO_DATA_NOLAN, 'test3', false);
				$seed_loc = new locator();
					$seed_loc->set_section_tipo('test3');
					$seed_loc->set_section_id((string)$seed_target_id);
					$seed_loc->set_type('dd47');
					$seed_loc->set_from_component_tipo('test71');
				$seed_rel->add_locator_to_data($seed_loc);
				$seed_rel->save();
				$ar_parents = component_relation_parent::get_parents_recursive(1, 'test3');
			}
			$this->assertNotEmpty(
				$ar_parents,
				'fixture guard: test3 record 1 must have parents (component_relation_parent test71)'
			);
			foreach ($ar_parents as $parent_locator) {
				$parent_sid = (int)$parent_locator->section_id;
				// Ensure the chain target record exists. Lifecycle tests rewrite
				// record 1's parent locator and can leave it pointing at a deleted
				// record (dangling locator); saving a component on a non-existent
				// record returns false. Create it (forced id, via the section API)
				// so the seed below is deterministic and order-independent.
				$parent_sr = section_record::get_instance('test3', $parent_sid);
				if ($parent_sr->exists_in_the_database()===false) {
					section::get_instance('test3', 'edit', false)
						->create_record((object)['section_id' => $parent_sid]);
				}
				$term_component = component_common::get_instance(
					'component_input_text', // string model
					'test52', // string tipo (test3 thesaurus term)
					(string)$parent_sid, // string section_id (chain record)
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
			ts_object::clear();

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
