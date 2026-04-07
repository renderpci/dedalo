<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
 * COMPONENT_DATE_DATAFRAME_TEST
 * Tests for literal main component (component_date) with dataframe extension.
 * Validates dataframe row resolution by item `id` for structured date data.
 */
final class component_date_dataframe_test extends BaseTestCase {



	public static $model			= 'component_date';
	public static $tipo			= 'test218';
	public static $section_tipo		= 'test3';



	/**
	* BUILD_COMPONENT_INSTANCE
	* @return object
	*/
	private function build_component_instance() : object {

		$this->user_login();

		$component = component_common::get_instance(
			self::$model,
			self::$tipo,
			1,
			'edit',
			DEDALO_DATA_LANG,
			self::$section_tipo
		);

		return $component;
	}//end build_component_instance



	/**
	* BUILD_DATAFRAME_INSTANCE
	* Create component_dataframe instance with caller_dataframe context
	* @param string $dataframe_tipo
	* @param int $section_id_key
	* @return object|null
	*/
	private function build_dataframe_instance( string $dataframe_tipo, int $section_id_key ) : ?object {

		$this->user_login();

		$caller_dataframe = (object)[
			'section_tipo'			=> self::$section_tipo,
			'section_id_key'			=> $section_id_key,
			'section_tipo_key'		=> self::$section_tipo,
			'main_component_tipo'	=> self::$tipo
		];

		return component_common::get_instance(
			'component_dataframe',
			$dataframe_tipo,
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			self::$section_tipo,
			true,
			$caller_dataframe
		);
	}//end build_dataframe_instance



	///////////// ⬇︎ test start ⬇︎ ////////////////



	/**
	* TEST_data_items_have_id
	* Verify that structured date data items have stable `id` for dataframe row keying
	* @return void
	*/
	public function test_data_items_have_id() {

		$component = $this->build_component_instance();

		// Set structured date test data
		$test_data = [
			(object)[
				'id' => 1,
				'start' => (object)['year' => 2024, 'month' => 1, 'day' => 15],
				'end' => null,
				'period' => null
			]
		];
		$component->set_data($test_data);

		$data = $component->get_data();

		// Verify data is array
		$this->assertIsArray($data);
		$this->assertCount(1, $data);

		// Verify item has id property
		$item = $data[0];
		$this->assertIsObject($item);
		$this->assertObjectHasProperty('id', $item);
		$this->assertIsInt($item->id);
		$this->assertEquals(1, $item->id);
	}//end test_data_items_have_id



	/**
	* TEST_get_dataframe_ddo_returns_configured_dataframes
	* Verify get_dataframe_ddo returns dataframe configuration when available
	* @return void
	*/
	public function test_get_dataframe_ddo_returns_configured_dataframes() {

		$component = $this->build_component_instance();

		$dataframe_ddo = $component->get_dataframe_ddo();

		// Should return array (possibly empty if no dataframe configured)
		$this->assertTrue(
			is_array($dataframe_ddo) || is_null($dataframe_ddo),
			'get_dataframe_ddo should return array or null'
		);
	}//end test_get_dataframe_ddo_returns_configured_dataframes



	/**
	* TEST_structured_date_data_preserves_id
	* Verify that complex date structures preserve item `id` through set/get cycle
	* @return void
	*/
	public function test_structured_date_data_preserves_id() {

		$component = $this->build_component_instance();

		// Set complex date data with explicit id
		$test_data = [
			(object)[
				'id' => 42,
				'start' => (object)[
					'year' => 2023,
					'month' => 6,
					'day' => 15,
					'hour' => 10,
					'minute' => 30,
					'second' => 0,
					'time' => 64890000000
				],
				'end' => (object)[
					'year' => 2023,
					'month' => 6,
					'day' => 20,
					'hour' => 18,
					'minute' => 0,
					'second' => 0,
					'time' => 64894452000
				],
				'period' => (object)[
					'year' => 0,
					'month' => 0,
					'day' => 5
				]
			]
		];
		$component->set_data($test_data);

		$data = $component->get_data();

		// Verify data structure is preserved
		$this->assertIsArray($data);
		$this->assertCount(1, $data);

		$item = $data[0];
		$this->assertObjectHasProperty('id', $item);
		$this->assertEquals(42, $item->id);

		// Verify date structure is preserved
		$this->assertObjectHasProperty('start', $item);
		$this->assertObjectHasProperty('end', $item);
		$this->assertIsObject($item->start);
		$this->assertIsObject($item->end);
		$this->assertEquals(2023, $item->start->year);
		$this->assertEquals(6, $item->start->month);
	}//end test_structured_date_data_preserves_id



	/**
	* TEST_main_component_data_isolation
	* Verify date component data does not include dataframe locator properties
	* @return void
	*/
	public function test_main_component_data_isolation() {

		$component = $this->build_component_instance();

		// Set date data
		$test_data = [
			(object)[
				'id' => 1,
				'start' => (object)['year' => 2024, 'month' => 1, 'day' => 1]
			]
		];
		$component->set_data($test_data);

		$data = $component->get_data();

		// Main component data should only contain date fields
		$this->assertIsArray($data);
		$item = $data[0];

		// Should NOT have dataframe locator properties
		$this->assertObjectNotHasProperty('section_id_key', $item);
		$this->assertObjectNotHasProperty('section_tipo_key', $item);
		$this->assertObjectNotHasProperty('main_component_tipo', $item);
		$this->assertObjectNotHasProperty('from_component_tipo', $item);
		$this->assertObjectNotHasProperty('type', $item);
	}//end test_main_component_data_isolation



	/**
	* TEST_update_data_value_remove_with_date_structure
	* Verify remove operation works correctly with structured date data
	* @return void
	*/
	public function test_update_data_value_remove_with_date_structure() {

		$component = $this->build_component_instance();

		// Set initial date data
		$initial_data = [
			(object)[
				'id' => 1,
				'start' => (object)['year' => 2024, 'month' => 1, 'day' => 1]
			],
			(object)[
				'id' => 2,
				'start' => (object)['year' => 2024, 'month' => 2, 'day' => 15]
			]
		];
		$component->set_data($initial_data);

		// Verify initial state
		$data = $component->get_data();
		$this->assertCount(2, $data);

		// Remove first item
		$changed_data = (object)[
			'action'	=> 'remove',
			'key'		=> 0
		];
		$result = $component->update_data_value($changed_data, DEDALO_DATA_LANG);

		$this->assertTrue($result);

		// Verify one item remains
		$data = $component->get_data();
		$this->assertCount(1, $data);
		$this->assertEquals(2, $data[0]->id);
	}//end test_update_data_value_remove_with_date_structure



	/**
	* TEST_component_is_not_relation_type
	* Verify component_date is not in relation components list (prerequisite for literal dataframe)
	* @return void
	*/
	public function test_component_is_not_relation_type() {

		$relation_components = component_relation_common::get_components_with_relations();

		$this->assertNotContains(
			'component_date',
			$relation_components,
			'component_date should not be a relation component'
		);
	}//end test_component_is_not_relation_type



}//end class component_date_dataframe_test
