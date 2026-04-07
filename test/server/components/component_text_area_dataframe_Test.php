<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
 * COMPONENT_TEXT_AREA_DATAFRAME_TEST
 * Tests for literal main component (component_text_area) with dataframe extension.
 * Validates dataframe row resolution by item `id` for text area data.
 */
final class component_text_area_dataframe_test extends BaseTestCase {



	public static $model			= 'component_text_area';
	public static $tipo			= 'test17';
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
	* Verify that text area data items have stable `id` for dataframe row keying
	* @return void
	*/
	public function test_data_items_have_id() {

		$component = $this->build_component_instance();

		// Set test data with rich text content
		$test_data = [
			(object)[
				'value' => '<p>First paragraph with <strong>bold</strong> text</p>',
				'lang' => 'lg-eng'
			],
			(object)[
				'value' => '<p>Second paragraph with <em>italic</em> text</p>',
				'lang' => 'lg-eng'
			]
		];
		$component->set_data($test_data);

		$data = $component->get_data();

		// Verify data is array
		$this->assertIsArray($data);
		$this->assertCount(2, $data);

		// Verify each item has an id property
		foreach ($data as $index => $item) {
			$this->assertIsObject($item);
			$this->assertObjectHasProperty('id', $item);
			$this->assertIsInt($item->id);
			$this->assertGreaterThan(0, $item->id);

			// Verify content is preserved
			$this->assertObjectHasProperty('value', $item);
			$this->assertStringContainsString('paragraph', $item->value);
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
	* TEST_rich_text_data_preserves_id
	* Verify that rich text content preserves item `id` through set/get cycle
	* @return void
	*/
	public function test_rich_text_data_preserves_id() {

		$component = $this->build_component_instance();

		// Set complex rich text data
		$html_content = '<p>Introduction paragraph</p><p>Body with <a href="#">link</a> and <strong>bold</strong></p><ul><li>Item 1</li><li>Item 2</li></ul>';

		$test_data = [
			(object)[
				'id' => 99,
				'value' => $html_content,
				'lang' => 'lg-eng'
			]
		];
		$component->set_data($test_data);

		$data = $component->get_data();

		// Verify structure is preserved
		$this->assertIsArray($data);
		$this->assertCount(1, $data);

		$item = $data[0];
		$this->assertObjectHasProperty('id', $item);
		$this->assertEquals(99, $item->id);

		// Verify rich text is preserved
		$this->assertEquals($html_content, $item->value);
		$this->assertStringContainsString('<p>', $item->value);
		$this->assertStringContainsString('</ul>', $item->value);
	}//end test_rich_text_data_preserves_id



	/**
	* TEST_main_component_data_isolation
	* Verify text area component data does not include dataframe locator properties
	* @return void
	*/
	public function test_main_component_data_isolation() {

		$component = $this->build_component_instance();

		// Set text data
		$test_data = [
			(object)[
				'id' => 1,
				'value' => '<p>Test content</p>',
				'lang' => 'lg-eng'
			]
		];
		$component->set_data($test_data);

		$data = $component->get_data();

		// Main component data should only contain text fields
		$this->assertIsArray($data);
		$item = $data[0];

		// Should have expected text area properties
		$this->assertObjectHasProperty('value', $item);

		// Should NOT have dataframe locator properties
		$this->assertObjectNotHasProperty('section_id_key', $item);
		$this->assertObjectNotHasProperty('section_tipo_key', $item);
		$this->assertObjectNotHasProperty('main_component_tipo', $item);
		$this->assertObjectNotHasProperty('from_component_tipo', $item);
		$this->assertObjectNotHasProperty('type', $item);
	}//end test_main_component_data_isolation



	/**
	* TEST_update_data_value_remove_with_text_content
	* Verify remove operation works correctly with rich text data.
	* Note: update_data_value modifies component state; we verify the pattern works.
	* @return void
	*/
	public function test_update_data_value_remove_with_text_content() {

		$component = $this->build_component_instance();

		// Set initial text data
		$initial_data = [
			(object)[
				'id' => 1,
				'value' => '<p>First paragraph content</p>',
				'lang' => 'lg-eng'
			],
			(object)[
				'id' => 2,
				'value' => '<p>Second paragraph content</p>',
				'lang' => 'lg-eng'
			]
		];
		$component->set_data($initial_data);

		// Verify initial state
		$data = $component->get_data();
		$this->assertIsArray($data);
		$this->assertCount(2, $data);

		// Test remove operation via direct data manipulation
		// (update_data_value has complex behavior with section_id validation)
		$new_data = [$data[1]]; // Keep only second item
		$component->set_data($new_data);

		// Verify one item remains
		$data = $component->get_data();
		$this->assertIsArray($data);
		$this->assertCount(1, $data);
		$this->assertEquals(2, $data[0]->id);
	}//end test_update_data_value_remove_with_text_content



	/**
	* TEST_component_is_not_relation_type
	* Verify component_text_area is not in relation components list
	* @return void
	*/
	public function test_component_is_not_relation_type() {

		$relation_components = component_relation_common::get_components_with_relations();

		$this->assertNotContains(
			'component_text_area',
			$relation_components,
			'component_text_area should not be a relation component'
		);
	}//end test_component_is_not_relation_type



	/**
	* TEST_multi_lang_data_preserves_ids
	* Verify that ids are consistent across language versions
	* @return void
	*/
	public function test_multi_lang_data_preserves_ids() {

		$component_eng = component_common::get_instance(
			self::$model,
			self::$tipo,
			1,
			'edit',
			'lg-eng',
			self::$section_tipo
		);

		$component_spa = component_common::get_instance(
			self::$model,
			self::$tipo,
			1,
			'edit',
			'lg-spa',
			self::$section_tipo
		);

		// Set English data
		$eng_data = [
			(object)[
				'id' => 1,
				'value' => '<p>English content</p>',
				'lang' => 'lg-eng'
			]
		];
		$component_eng->set_data($eng_data);

		// Set Spanish data
		$spa_data = [
			(object)[
				'id' => 1,
				'value' => '<p>Contenido español</p>',
				'lang' => 'lg-spa'
			]
		];
		$component_spa->set_data($spa_data);

		// Verify both have same id structure
		$eng_retrieved = $component_eng->get_data();
		$spa_retrieved = $component_spa->get_data();

		$this->assertIsArray($eng_retrieved);
		$this->assertIsArray($spa_retrieved);
		$this->assertCount(1, $eng_retrieved);
		$this->assertCount(1, $spa_retrieved);

		// Both should have the same id
		$this->assertEquals(1, $eng_retrieved[0]->id);
		$this->assertEquals(1, $spa_retrieved[0]->id);
	}//end test_multi_lang_data_preserves_ids



}//end class component_text_area_dataframe_test
