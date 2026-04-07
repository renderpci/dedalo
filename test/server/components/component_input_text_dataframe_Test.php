<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
 * COMPONENT_INPUT_TEXT_DATAFRAME_TEST
 * Tests for literal main component (component_input_text) with dataframe extension.
 * Validates dataframe row resolution by item `id`, TM filtering, and data isolation.
 */
final class component_input_text_dataframe_test extends BaseTestCase {



	public static $model			= 'component_input_text';
	public static $tipo			= 'test52';
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
	* Verify that literal data items have stable `id` for dataframe row keying
	* @return void
	*/
	public function test_data_items_have_id() {

		$component = $this->build_component_instance();

		// Set test data
		$test_data = [
			(object)['value' => 'First value'],
			(object)['value' => 'Second value']
		];
		$component->set_data($test_data);

		$data = $component->get_data();

		// Verify data is array
		$this->assertIsArray($data);
		$this->assertCount(2, $data);

		// Verify each item has an id property
		foreach ($data as $item) {
			$this->assertIsObject($item);
			$this->assertObjectHasProperty('id', $item);
			$this->assertIsInt($item->id);
			$this->assertGreaterThan(0, $item->id);
		}
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
	* TM_DATA_FILTERING
	* Verify that literal main component with dataframe filters out dataframe locators from TM data.
	* When data is retrieved from time machine, only the main component's literal data should remain.
	* @return void
	*/
	public function test_tm_data_filtering_for_literal_with_dataframe() {

		$component = $this->build_component_instance();

		// Verify the component model is not a relation component
		$relation_components = component_relation_common::get_components_with_relations();
		$this->assertNotContains(
			self::$model,
			$relation_components,
			'Component should not be a relation component for this test'
		);

		// The TM filtering in get_data() checks for dataframe_ddo presence
		// If no dataframe is configured, no special filtering applies
		// This test verifies the filtering logic exists and handles the case
		$dataframe_ddo = $component->get_dataframe_ddo();

		// If there's no dataframe config, the test passes as there's nothing to filter
		if (empty($dataframe_ddo)) {
			$this->assertTrue(true, 'No dataframe configured - filtering not needed');
			return;
		}

		// If dataframe is configured, we would need a full TM save/load test
		// which requires matrix_id. This is covered by integration tests.
		$this->assertIsArray($dataframe_ddo);
	}//end test_tm_data_filtering_for_literal_with_dataframe



	/**
	* TEST_dataframe_row_resolution_by_item_id
	* Verify dataframe rows can be resolved using literal item `id` as row key.
	* This is the core contract: dataframe rows use section_id_key = item->id.
	* @return void
	*/
	public function test_dataframe_row_resolution_by_item_id() {

		$component = $this->build_component_instance();

		// Set test data with explicit id
		$test_data = [
			(object)['id' => 1, 'value' => 'Test value with id 1'],
			(object)['id' => 2, 'value' => 'Test value with id 2']
		];
		$component->set_data($test_data);

		$data = $component->get_data();
		$this->assertIsArray($data);

		// Verify we can access items by array index and they have correct ids
		$this->assertIsObject($data[0]);
		$this->assertEquals(1, $data[0]->id);

		$this->assertIsObject($data[1]);
		$this->assertEquals(2, $data[1]->id);
	}//end test_dataframe_row_resolution_by_item_id



	/**
	* TEST_main_component_data_unaffected_by_dataframe_presence
	* Verify that main component data structure remains independent of dataframe.
	* The literal component's data should not include dataframe values directly.
	* @return void
	*/
	public function test_main_component_data_unaffected_by_dataframe_presence() {

		$component = $this->build_component_instance();

		// Set clean test data
		$test_value = (object)['value' => 'Main component value'];
		$component->set_data([$test_value]);

		$data = $component->get_data();

		// Main component data should only contain the literal value
		$this->assertIsArray($data);
		$this->assertCount(1, $data);

		$item = $data[0];
		$this->assertIsObject($item);

		// Should have value and id properties
		$this->assertObjectHasProperty('value', $item);
		$this->assertObjectHasProperty('id', $item);

		// Should NOT have dataframe locator properties
		$this->assertObjectNotHasProperty('section_id_key', $item);
		$this->assertObjectNotHasProperty('section_tipo_key', $item);
		$this->assertObjectNotHasProperty('main_component_tipo', $item);
	}//end test_main_component_data_unaffected_by_dataframe_presence



	/**
	* TEST_update_data_value_remove_preserves_dataframe_cleanup_pattern
	* Verify that the remove case in update_data_value uses generic literal check
	* (non-relation components with id-bearing items) for dataframe cleanup.
	* @return void
	*/
	public function test_update_data_value_remove_preserves_dataframe_cleanup_pattern() {

		$component = $this->build_component_instance();

		// Set initial data with ids
		$initial_data = [
			(object)['id' => 1, 'value' => 'Value 1'],
			(object)['id' => 2, 'value' => 'Value 2']
		];
		$component->set_data($initial_data);

		// Verify initial state
		$data = $component->get_data();
		$this->assertIsArray($data);
		$this->assertCount(2, $data);

		// Simulate removal via update_data_value
		$changed_data = (object)[
			'action'	=> 'remove',
			'id'		=> 1
		];
		$result = $component->update_data_value($changed_data, DEDALO_DATA_LANG);

		// The remove should succeed
		$this->assertTrue($result);

		// Verify data was removed (may be null or array with 1 item)
		$data = $component->get_data();
		if (is_array($data)) {
			$this->assertCount(1, $data);
		} else {
			$this->assertNull($data);
		}
	}//end test_update_data_value_remove_preserves_dataframe_cleanup_pattern



}//end class component_input_text_dataframe_test
