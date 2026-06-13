<?php declare(strict_types=1);

// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
 * TEST SORT_BY_COLUMN CHANGED_DATA ACTION
 *
 * Verifies the 'sort_by_column' changed_data action that persistently
 * reorders the full portal locator array by the value of a column component
 * in the target section. The action is implemented by
 * component_relation_common::sort_data_by_column() and dispatched from
 * component_common::update_data_value().
 *
 * Fixture: portal 'test80' (section 'test3', record 1) targets section
 * 'test3' and shows the column 'test52' (component_input_text).
 * Target records are created on the fly (add_new_element) with controlled
 * test52 values so the expected order is deterministic.
 * Note that locators referencing the portal own record (test3-1) are
 * rejected as autoreference by validate_data_element, so target records
 * are always created ones.
 *
 * The action only reorders the in-memory component data (the dd_core_api
 * save flow persists it), so the portal itself is never saved here.
 *
 * @package Dedalo
 * @subpackage Test
 */
final class component_portal_sort_by_column_test extends BaseTestCase {



	public static $model		= 'component_portal';
	public static $tipo			= 'test80';
	public static $section_tipo	= 'test3';
	// component_input_text column of the test80 show ddo_map
	public static $column_tipo	= 'test52';



	/**
	* BUILD_COMPONENT_INSTANCE
	* @return object $component
	*/
	private function build_component_instance() : object {

		$this->user_login();

		$component = component_common::get_instance(
			self::$model,
			self::$tipo,
			1, // section_id
			'edit', // mode
			DEDALO_DATA_NOLAN, // lang
			self::$section_tipo,
			false // cache
		);

		return $component;
	}//end build_component_instance



	/**
	* CREATE_TARGET_RECORD
	* Creates a new target section record with the given test52 value (saved)
	* @param object $component
	* 	Portal component instance (used to create the new record)
	* @param string $value
	* 	test52 (component_input_text) value to set in the new record
	* @return int $section_id
	*/
	private function create_target_record( object $component, string $value ) : int {

		// new target record
			$response = $component->add_new_element((object)[
				'target_section_tipo' => self::$section_tipo
			]);
			$this->assertTrue(
				$response->result===true,
				'expected add_new_element true but received: ' . to_string($response->msg ?? null)
			);
			$section_id = (int)$response->section_id;

		// set the column component value and save it (the search reads the DB)
			$column_component = component_common::get_instance(
				'component_input_text',
				self::$column_tipo,
				$section_id,
				'edit',
				DEDALO_DATA_LANG,
				self::$section_tipo,
				false
			);
			$column_component->set_data([
				(object)[
					'id'	=> 1,
					'lang'	=> DEDALO_DATA_LANG,
					'value'	=> $value
				]
			]);
			$save_result = $column_component->save();
			$this->assertTrue(
				$save_result===true,
				'expected column component save true on section_id: ' . $section_id
			);

		return $section_id;
	}//end create_target_record



	/**
	* BUILD_LOCATOR
	* @param int $section_id
	* @return object $locator
	*/
	private function build_locator( int $section_id ) : object {

		return (object)[
			'type'					=> DEDALO_RELATION_TYPE_LINK,
			'section_id'			=> $section_id,
			'section_tipo'			=> self::$section_tipo,
			'from_component_tipo'	=> self::$tipo
		];
	}//end build_locator



	/**
	* BUILD_CHANGED_DATA
	* @param mixed $component_tipo
	* @param mixed $direction
	* @return object $changed_data
	*/
	private function build_changed_data( $component_tipo, $direction ) : object {

		return (object)[
			'action'			=> 'sort_by_column',
			'component_tipo'	=> $component_tipo,
			'direction'			=> $direction,
			'value'				=> null
		];
	}//end build_changed_data



	/**
	* GET_DATA_SECTION_ID_SEQUENCE
	* @param object $component
	* @return array
	*/
	private function get_data_section_id_sequence( object $component ) : array {

		$data = $component->get_data_lang(DEDALO_DATA_NOLAN) ?? [];

		return array_map(function($el){
			return (int)$el->section_id;
		}, $data);
	}//end get_data_section_id_sequence



	/////////// ⬇︎ test start ⬇︎ ////////////////



	/**
	* TEST_sort_by_column_asc_desc
	* Reorders the locators by the test52 value of the target records,
	* ascending and descending
	* @return void
	*/
	public function test_sort_by_column_asc_desc() : void {

		$component = $this->build_component_instance();
		$component->set_properties((object)['sort_by_column' => true]);

		// controlled target records. id_bbb is created first (lower section_id)
		// so a section_id fallback order would not match the value order
		$id_bbb = $this->create_target_record($component, 'bbb sort_by_column');
		$id_aaa = $this->create_target_record($component, 'aaa sort_by_column');

		// ASC case
			$component->set_data([
				$this->build_locator($id_bbb),
				$this->build_locator($id_aaa)
			]);

			$result = $component->update_data_value(
				$this->build_changed_data(self::$column_tipo, 'ASC')
			);

			$this->assertTrue(
				$result===true,
				'expected true but received: ' . to_string($result)
			);
			$this->assertSame(
				[$id_aaa, $id_bbb],
				$this->get_data_section_id_sequence($component),
				'expected ASC value order [aaa, bbb]'
			);

		// DESC case (same data, reversed expectation)
			$result_desc = $component->update_data_value(
				$this->build_changed_data(self::$column_tipo, 'DESC')
			);

			$this->assertTrue(
				$result_desc===true,
				'expected true but received: ' . to_string($result_desc)
			);
			$this->assertSame(
				[$id_bbb, $id_aaa],
				$this->get_data_section_id_sequence($component),
				'expected DESC value order [bbb, aaa]'
			);
	}//end test_sort_by_column_asc_desc



	/**
	* TEST_sort_by_column_missing_record_falls_last
	* Locators pointing to non existing target records are never dropped:
	* they fall to the end preserving their relative order
	* @return void
	*/
	public function test_sort_by_column_missing_record_falls_last() : void {

		$component = $this->build_component_instance();
		$component->set_properties((object)['sort_by_column' => true]);

		$id_bbb = $this->create_target_record($component, 'bbb sort_by_column');
		$id_aaa = $this->create_target_record($component, 'aaa sort_by_column');

		$component->set_data([
			$this->build_locator(999999991), // non existing record
			$this->build_locator($id_bbb),
			$this->build_locator(999999992), // non existing record
			$this->build_locator($id_aaa)
		]);

		$result = $component->update_data_value(
			$this->build_changed_data(self::$column_tipo, 'ASC')
		);

		$this->assertTrue(
			$result===true,
			'expected true but received: ' . to_string($result)
		);
		$this->assertSame(
			[$id_aaa, $id_bbb, 999999991, 999999992],
			$this->get_data_section_id_sequence($component),
			'expected missing record locators at the end preserving relative order'
		);
	}//end test_sort_by_column_missing_record_falls_last



	/**
	* TEST_sort_by_column_invalid_direction
	* @return void
	*/
	public function test_sort_by_column_invalid_direction() : void {

		$component = $this->build_component_instance();
		$component->set_properties((object)['sort_by_column' => true]);

		// rejected before any search: bogus ids are enough
		$component->set_data([
			$this->build_locator(999999991),
			$this->build_locator(999999992)
		]);

		$result = $component->update_data_value(
			$this->build_changed_data(self::$column_tipo, 'ASC; DROP TABLE matrix;')
		);

		$this->assertTrue(
			$result===false,
			'expected false on invalid direction but received: ' . to_string($result)
		);
		$this->assertSame(
			[999999991, 999999992],
			$this->get_data_section_id_sequence($component),
			'expected data untouched on invalid direction'
		);
	}//end test_sort_by_column_invalid_direction



	/**
	* TEST_sort_by_column_tipo_not_in_ddo_map
	* The component_tipo must be one of the portal show ddo_map columns
	* @return void
	*/
	public function test_sort_by_column_tipo_not_in_ddo_map() : void {

		$component = $this->build_component_instance();
		$component->set_properties((object)['sort_by_column' => true]);

		// rejected before any search: bogus ids are enough
		$component->set_data([
			$this->build_locator(999999991),
			$this->build_locator(999999992)
		]);

		$result = $component->update_data_value(
			$this->build_changed_data('test102', 'ASC') // valid component, but not a test80 show column
		);

		$this->assertTrue(
			$result===false,
			'expected false on tipo not in ddo_map but received: ' . to_string($result)
		);
		$this->assertSame(
			[999999991, 999999992],
			$this->get_data_section_id_sequence($component),
			'expected data untouched on invalid component_tipo'
		);
	}//end test_sort_by_column_tipo_not_in_ddo_map



	/**
	* TEST_sort_by_column_property_disabled
	* Without the 'sort_by_column' property, the action is rejected
	* @return void
	*/
	public function test_sort_by_column_property_disabled() : void {

		$component = $this->build_component_instance();
		$component->set_properties((object)[]); // no sort_by_column property

		// rejected before any search: bogus ids are enough
		$component->set_data([
			$this->build_locator(999999991),
			$this->build_locator(999999992)
		]);

		$result = $component->update_data_value(
			$this->build_changed_data(self::$column_tipo, 'ASC')
		);

		$this->assertTrue(
			$result===false,
			'expected false on disabled property but received: ' . to_string($result)
		);
		$this->assertSame(
			[999999991, 999999992],
			$this->get_data_section_id_sequence($component),
			'expected data untouched on disabled property'
		);
	}//end test_sort_by_column_property_disabled



	/**
	* TEST_sort_by_column_allowlist
	* The array form of the property restricts the sortable column tipos
	* @return void
	*/
	public function test_sort_by_column_allowlist() : void {

		// allowed case
			$component = $this->build_component_instance();
			$component->set_properties((object)['sort_by_column' => [self::$column_tipo]]);

			$id_bbb = $this->create_target_record($component, 'bbb sort_by_column');
			$id_aaa = $this->create_target_record($component, 'aaa sort_by_column');

			$component->set_data([
				$this->build_locator($id_bbb),
				$this->build_locator($id_aaa)
			]);

			$result = $component->update_data_value(
				$this->build_changed_data(self::$column_tipo, 'ASC')
			);

			$this->assertTrue(
				$result===true,
				'expected true on allowed column but received: ' . to_string($result)
			);
			$this->assertSame(
				[$id_aaa, $id_bbb],
				$this->get_data_section_id_sequence($component),
				'expected ASC value order on allowed column'
			);

		// not allowed case. The column is in the ddo_map but not in the allowlist
			$component_na = $this->build_component_instance();
			$component_na->set_properties((object)['sort_by_column' => ['test999']]);

			$component_na->set_data([
				$this->build_locator(999999991),
				$this->build_locator(999999992)
			]);

			$result_na = $component_na->update_data_value(
				$this->build_changed_data(self::$column_tipo, 'ASC')
			);

			$this->assertTrue(
				$result_na===false,
				'expected false on column not in allowlist but received: ' . to_string($result_na)
			);
			$this->assertSame(
				[999999991, 999999992],
				$this->get_data_section_id_sequence($component_na),
				'expected data untouched on column not in allowlist'
			);
	}//end test_sort_by_column_allowlist



	/**
	* TEST_sort_by_column_single_entry_noop
	* Zero or one entries: nothing to reorder, action succeeds as no-op
	* @return void
	*/
	public function test_sort_by_column_single_entry_noop() : void {

		$component = $this->build_component_instance();
		$component->set_properties((object)['sort_by_column' => true]);

		$component->set_data([
			$this->build_locator(999999991)
		]);

		$result = $component->update_data_value(
			$this->build_changed_data(self::$column_tipo, 'ASC')
		);

		$this->assertTrue(
			$result===true,
			'expected true (no-op) but received: ' . to_string($result)
		);
		$this->assertSame(
			[999999991],
			$this->get_data_section_id_sequence($component),
			'expected single entry unchanged'
		);
	}//end test_sort_by_column_single_entry_noop



	/**
	* TEST_sort_by_column_non_relation_component
	* The action is rejected for non relation components
	* @return void
	*/
	public function test_sort_by_column_non_relation_component() : void {

		$this->user_login();

		$component = component_common::get_instance(
			'component_input_text',
			'test52',
			1,
			'edit',
			DEDALO_DATA_LANG,
			'test3',
			false
		);

		$result = $component->update_data_value(
			$this->build_changed_data('test52', 'ASC')
		);

		$this->assertTrue(
			$result===false,
			'expected false on non relation component but received: ' . to_string($result)
		);
	}//end test_sort_by_column_non_relation_component



}//end class component_portal_sort_by_column_test
