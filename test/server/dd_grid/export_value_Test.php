<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* EXPORT_VALUE_TEST
* Tests the atoms based export contract classes:
* export_path_segment, export_atom, export_value (to_flat_string parity
* with dd_grid_cell_object::resolve_value), export_context.
*/
final class export_value_test extends BaseTestCase {



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
	* BUILD_LEAF_SEGMENT
	* helper
	*/
	private function build_segment( string $section_tipo, string $component_tipo, ?object $options=null ) : export_path_segment {
		return new export_path_segment($section_tipo, $component_tipo, $options);
	}//end build_segment



	/**
	* TEST_PATH_SEGMENT_IDENTITY
	* @return void
	*/
	public function test_path_segment_identity() {

		// plain segment
			$segment = $this->build_segment('oh1', 'oh62');
			$this->assertSame(
				'oh1_oh62',
				$segment->get_identity_key()
			);

		// item_index does NOT change identity
			$indexed = $this->build_segment('rsc197', 'rsc92', (object)['item_index'=>3]);
			$this->assertSame(
				'rsc197_rsc92',
				$indexed->get_identity_key()
			);

		// sub_id discriminates (component_info widget outputs, inverse pairs)
			$sub = $this->build_segment('oh1', 'oh25', (object)['sub_id'=>'paragraphs']);
			$this->assertSame(
				'oh1_oh25#paragraphs',
				$sub->get_identity_key()
			);

		// json wire shape omits nulls
			$json = json_decode(json_encode($indexed));
			$this->assertSame('rsc197',	$json->section_tipo);
			$this->assertSame(3,		$json->item_index);
			$this->assertObjectNotHasProperty('sub_id', $json);
			$this->assertObjectNotHasProperty('model', $json);
	}//end test_path_segment_identity



	/**
	* TEST_ATOM_BASE_KEY_AND_INDEX_VECTOR
	* @return void
	*/
	public function test_atom_base_key_and_index_vector() {

		$path = [
			$this->build_segment('oh1', 'oh52'),
			$this->build_segment('rsc197', 'rsc92', (object)['item_index'=>1]),
			$this->build_segment('pr', 'pr10', (object)['item_index'=>0])
		];
		$atom = new export_atom($path, 'weaver');

		// base key strips the indexes
			$this->assertSame(
				'oh1_oh52.rsc197_rsc92.pr_pr10',
				$atom->get_base_key()
			);

		// index vector keeps them, in path order
			$this->assertSame(
				[1, 0],
				$atom->get_index_vector()
			);

		// leaf segment
			$this->assertSame(
				'pr_pr10',
				$atom->get_leaf_segment()->get_identity_key()
			);
	}//end test_atom_base_key_and_index_vector



	/**
	* TEST_TO_FLAT_STRING_LEAF
	* Simple multi-value leaf component: parity with the legacy
	* base get_grid_value + resolve_value join (fields_separator)
	* @return void
	*/
	public function test_to_flat_string_leaf() {

		// legacy reference
			$legacy = new dd_grid_cell_object();
				$legacy->set_type('column');
				$legacy->set_cell_type('text');
				$legacy->set_fields_separator(', ');
				$legacy->set_value(['alpha', 'beta']);
			$legacy_string = dd_grid_cell_object::resolve_value($legacy);

		// atoms
			$leaf_segment = $this->build_segment('test3', 'test52', (object)['fields_separator'=>', ']);
			$export_value = new export_value();
				$export_value->add_atom( new export_atom([$leaf_segment], 'alpha', (object)['value_index'=>0]) );
				$export_value->add_atom( new export_atom([$leaf_segment], 'beta', (object)['value_index'=>1]) );

		$this->assertSame(
			$legacy_string,
			$export_value->to_flat_string(),
			'expected leaf join parity with resolve_value'
		);
		$this->assertSame('alpha, beta', $export_value->to_flat_string());
	}//end test_to_flat_string_leaf



	/**
	* TEST_TO_FLAT_STRING_EMPTY_SKIPPING
	* resolve_value drops empty() values including '0' (bug-for-bug parity)
	* @return void
	*/
	public function test_to_flat_string_empty_skipping() {

		// legacy reference
			$legacy = new dd_grid_cell_object();
				$legacy->set_type('column');
				$legacy->set_cell_type('text');
				$legacy->set_fields_separator(', ');
				$legacy->set_value(['alpha', '', null, '0', 'beta']);
			$legacy_string = dd_grid_cell_object::resolve_value($legacy);

		// atoms
			$leaf_segment = $this->build_segment('test3', 'test52');
			$export_value = new export_value();
			foreach (['alpha', '', null, '0', 'beta'] as $key => $value) {
				$export_value->add_atom( new export_atom([$leaf_segment], $value, (object)['value_index'=>$key]) );
			}

		$this->assertSame(
			$legacy_string,
			$export_value->to_flat_string(),
			'expected empty() skipping parity with resolve_value'
		);
		// document the inherited behavior: '0' is dropped
		$this->assertSame('alpha, beta', $export_value->to_flat_string());
	}//end test_to_flat_string_empty_skipping



	/**
	* TEST_TO_FLAT_STRING_PORTAL
	* Portal with two locators, two child fields each: parity with the
	* legacy relation grid (rows joined with records_separator, fields
	* within a row joined with the portal fields_separator)
	* @return void
	*/
	public function test_to_flat_string_portal() {

		// legacy reference. Shape produced by component_relation_common::get_grid_value
			$build_leaf = function(array $values) : dd_grid_cell_object {
				$leaf = new dd_grid_cell_object();
					$leaf->set_type('column');
					$leaf->set_cell_type('text');
					$leaf->set_fields_separator(', ');
					$leaf->set_value($values);
				return $leaf;
			};
			$build_row = function(array $columns) : dd_grid_cell_object {
				$row = new dd_grid_cell_object();
					$row->set_type('row');
					$row->set_value($columns);
				return $row;
			};
			$legacy = new dd_grid_cell_object();
				$legacy->set_type('column');
				$legacy->set_fields_separator(', ');
				$legacy->set_records_separator(' | ');
				$legacy->set_value([
					$build_row([ $build_leaf(['Maria']),	$build_leaf(['farmer']) ]),
					$build_row([ $build_leaf(['José']),		$build_leaf(['fisherman']) ])
				]);
			$legacy_string = dd_grid_cell_object::resolve_value($legacy);

		// atoms. portal segment carries the separators; child segments carry item_index
			$portal_segment	= $this->build_segment('oh1', 'oh52', (object)[
				'model'				=> 'component_portal',
				'fields_separator'	=> ', ',
				'records_separator'	=> ' | '
			]);
			$name = function(int $index, string $value) use ($portal_segment) {
				return new export_atom(
					[$portal_segment, $this->build_segment('rsc197', 'rsc85', (object)['item_index'=>$index])],
					$value
				);
			};
			$profession = function(int $index, string $value) use ($portal_segment) {
				return new export_atom(
					[$portal_segment, $this->build_segment('rsc197', 'rsc92', (object)['item_index'=>$index])],
					$value
				);
			};
			$export_value = new export_value([
				$name(0, 'Maria'),	$profession(0, 'farmer'),
				$name(1, 'José'),	$profession(1, 'fisherman')
			]);

		$this->assertSame(
			$legacy_string,
			$export_value->to_flat_string(),
			'expected portal join parity with resolve_value'
		);
		$this->assertSame('Maria, farmer | José, fisherman', $export_value->to_flat_string());

		// record (locator) arrival order must not matter (ksort by item_index).
		// Field order inside a record follows arrival order: producers iterate
		// locators outer / ddo children inner, so per-record field order is canonical.
			$shuffled = new export_value([
				$name(1, 'José'),	$profession(1, 'fisherman'),
				$name(0, 'Maria'),	$profession(0, 'farmer')
			]);
			$this->assertSame(
				'Maria, farmer | José, fisherman',
				$shuffled->to_flat_string()
			);
	}//end test_to_flat_string_portal



	/**
	* TEST_TO_FLAT_STRING_NESTED_PORTAL
	* Portal in portal: deeper relation joined inside its parent field
	* with its own separators
	* @return void
	*/
	public function test_to_flat_string_nested_portal() {

		$portal_segment		= $this->build_segment('oh1', 'oh52', (object)[
			'records_separator'	=> ' | ',
			'fields_separator'	=> ', '
		]);
		$build_child		= fn(int $i) => $this->build_segment('rsc197', 'rsc85', (object)['item_index'=>$i]);
		$nested_segment		= fn(int $i) => $this->build_segment('rsc197', 'rsc92', (object)[
			'item_index'		=> $i,
			'records_separator'	=> ' | ',
			'fields_separator'	=> ', ',
			'model'				=> 'component_portal'
		]);
		$leaf				= fn(int $i) => $this->build_segment('pr', 'pr10', (object)['item_index'=>$i]);

		// informant 0: Maria with professions farmer, weaver. informant 1: José with fisherman
			$export_value = new export_value([
				new export_atom([$portal_segment, $build_child(0)], 'Maria'),
				new export_atom([$portal_segment, $nested_segment(0), $leaf(0)], 'farmer'),
				new export_atom([$portal_segment, $nested_segment(0), $leaf(1)], 'weaver'),
				new export_atom([$portal_segment, $build_child(1)], 'José'),
				new export_atom([$portal_segment, $nested_segment(1), $leaf(0)], 'fisherman')
			]);

		// legacy parity: only the FIRST relation level joins with records_separator
		// (grid rows); nested relation items became columns (sub_columns_division)
		// and join with fields_separator
		$this->assertSame(
			'Maria, farmer, weaver | José, fisherman',
			$export_value->to_flat_string(),
			'expected nested portal professions joined with fields_separator (legacy columns)'
		);
	}//end test_to_flat_string_nested_portal



	/**
	* TEST_TO_FLAT_STRING_EMPTY_RECORD_KEPT
	* resolve_value keeps empty rows when joining records (rows case parity)
	* @return void
	*/
	public function test_to_flat_string_empty_record_kept() {

		// legacy reference: second row resolves to empty string but is kept
			$leaf_a = new dd_grid_cell_object();
				$leaf_a->set_type('column');
				$leaf_a->set_cell_type('text');
				$leaf_a->set_value(['Maria']);
			$leaf_empty = new dd_grid_cell_object();
				$leaf_empty->set_type('column');
				$leaf_empty->set_cell_type('text');
				$leaf_empty->set_value([]);
			$row_a = new dd_grid_cell_object();
				$row_a->set_type('row');
				$row_a->set_value([$leaf_a]);
			$row_empty = new dd_grid_cell_object();
				$row_empty->set_type('row');
				$row_empty->set_value([$leaf_empty]);
			$legacy = new dd_grid_cell_object();
				$legacy->set_type('column');
				$legacy->set_records_separator(' | ');
				$legacy->set_value([$row_a, $row_empty]);
			$legacy_string = dd_grid_cell_object::resolve_value($legacy);

		// atoms
			$portal_segment	= $this->build_segment('oh1', 'oh52', (object)['records_separator'=>' | ']);
			$export_value	= new export_value([
				new export_atom([$portal_segment, $this->build_segment('rsc197', 'rsc85', (object)['item_index'=>0])], 'Maria'),
				new export_atom([$portal_segment, $this->build_segment('rsc197', 'rsc85', (object)['item_index'=>1])], null)
			]);

		$this->assertSame(
			$legacy_string,
			$export_value->to_flat_string(),
			'expected empty record kept, parity with resolve_value rows case'
		);
		$this->assertSame('Maria | ', $export_value->to_flat_string());
	}//end test_to_flat_string_empty_record_kept



	/**
	* TEST_EXPORT_CONTEXT_DESCEND
	* @return void
	*/
	public function test_export_context_descend() {

		$context = new export_context((object)[
			'absolute_urls'	=> true,
			'caller'		=> 'tool_export',
			'ddo_map'		=> [(object)['tipo'=>'rsc92']]
		]);

		$own_segment	= $this->build_segment('oh1', 'oh52');
		$sub_map		= [(object)['tipo'=>'pr10']];
		$child			= $context->descend([$own_segment], $sub_map, null, 2, 45);

		$this->assertSame([$own_segment],	$child->path_prefix);
		$this->assertSame($sub_map,			$child->ddo_map);
		$this->assertTrue($child->absolute_urls);
		$this->assertSame('tool_export', $child->caller);
		$this->assertSame(1, $child->depth);
		$this->assertSame(2, $child->item_index);
		$this->assertSame(45, $child->item_section_id);

		// parent context is not mutated
		$this->assertSame([], $context->path_prefix);
		$this->assertSame(0, $context->depth);
		$this->assertNull($context->item_index);
	}//end test_export_context_descend



	/**
	* TEST_FROM_SCALAR
	* @return void
	*/
	public function test_from_scalar() {

		$segment		= $this->build_segment('test3', 'test102');
		$export_value	= export_value::from_scalar(
			[$segment],
			7,
			(object)['cell_type'=>'section_id'],
			'Id',
			'component_section_id'
		);

		$this->assertCount(1, $export_value->atoms);
		$this->assertSame(7, $export_value->atoms[0]->value);
		$this->assertSame('section_id', $export_value->atoms[0]->cell_type);
		$this->assertSame('component_section_id', $export_value->model);
	}//end test_from_scalar



}//end class export_value_test
