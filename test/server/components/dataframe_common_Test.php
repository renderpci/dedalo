<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';


final class dataframe_common_test extends BaseTestCase {

	public static $tipo = 'test211';
	public static $section_tipo = 'test3';

	private function build_component_instance( ?string $tipo=null ) {
		$this->user_login();
		
		$tipo = $tipo ?? self::$tipo;

		$model = ontology_node::get_model_by_tipo($tipo);
		
		return component_common::get_instance(
			$model,
			$tipo,
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			self::$section_tipo
		);
	}

	protected function setUp(): void
    {
        // $this->markTestSkipped('Dataframe trait tests - requires ontology configuration');
    }

	/**
	 * TEST_GET_DATA_BY_CONTEXT
	 * Test filtering data by context properties
	 * @return void
	 */
	public function test_get_data_by_context() {
		$component = $this->build_component_instance();
		
		// Set test data with context properties
		$test_data = [
			(object)['value' => 1, 'section_tipo_key' => 'test3', 'section_id_key' => 10],
			(object)['value' => 2, 'section_tipo_key' => 'test3', 'section_id_key' => 8],
			(object)['value' => 1, 'section_tipo_key' => 'test3', 'section_id_key' => 2]
		];
		$component->set_data($test_data);
		
		// Filter by context test3/10
		$result = $component->get_data_by_context('test3', 10);
		
		$this->assertIsArray($result);
		$this->assertCount(1, $result);
		$this->assertEquals(1, $result[0]->value);
	}

	/**
	 * TEST_GET_DATA_BY_CONTEXT_NO_MATCH
	 * Test filtering with non-matching context
	 * @return void
	 */
	public function test_get_data_by_context_no_match() {
		$component = $this->build_component_instance();
		
		$test_data = [
			(object)['value' => 1, 'section_tipo_key' => 'test3', 'section_id_key' => 10]
		];
		$component->set_data($test_data);
		
		$result = $component->get_data_by_context('onto3', 99);
		
		$this->assertNull($result);
	}

	/**
	 * TEST_ADD_VALUE_WITH_CONTEXT
	 * Test adding value with context
	 * @return void
	 */
	public function test_add_value_with_context() {
		$component = $this->build_component_instance();
		$component->set_data(null);
		
		$result = $component->add_value_with_context(5, 'test3', 10);
		
		$this->assertTrue($result);
		
		$data = $component->get_data();
		$this->assertCount(1, $data);
		$this->assertEquals(5, $data[0]->value);
		$this->assertEquals('test3', $data[0]->section_tipo_key);
		$this->assertEquals(10, $data[0]->section_id_key);
	}

	/**
	 * TEST_REMOVE_BY_CONTEXT
	 * Test removing values by context
	 * @return void
	 */
	public function test_remove_by_context() {
		$component = $this->build_component_instance();
		
		$test_data = [
			(object)['value' => 1, 'section_tipo_key' => 'test3', 'section_id_key' => 10],
			(object)['value' => 2, 'section_tipo_key' => 'test3', 'section_id_key' => 8],
			(object)['value' => 1, 'section_tipo_key' => 'test3', 'section_id_key' => 5]
		];
		$component->set_data($test_data);
		
		$result = $component->remove_by_context('test3', 10);
		
		$this->assertTrue($result);
		
		$data = $component->get_data();
		$this->assertCount(2, $data);
		$this->assertEquals('test3', $data[0]->section_tipo_key);
	}

	/**
	 * TEST_GET_VALUE_BY_CONTEXT
	 * Test getting single value by context
	 * @return void
	 */
	public function test_get_value_by_context() {
		$component = $this->build_component_instance();
		
		$test_data = [
			(object)['value' => 8, 'section_tipo_key' => 'test3', 'section_id_key' => 10]
		];
		$component->set_data($test_data);
		
		$result = $component->get_value_by_context('test3', 10);
		
		$this->assertEquals(8, $result);
	}

	/**
	 * TEST_UPDATE_VALUE_BY_CONTEXT
	 * Test updating value for specific context
	 * @return void
	 */
	public function test_update_value_by_context() {
		$component = $this->build_component_instance();
		
		$test_data = [
			(object)['value' => 1, 'section_tipo_key' => 'test3', 'section_id_key' => 10]
		];
		$component->set_data($test_data);
		
		$result = $component->update_value_by_context(99, 'test3', 10);
		
		$this->assertTrue($result);
		
		$data = $component->get_data();
		$this->assertEquals(99, $data[0]->value);
	}

	/**
	 * TEST_UPDATE_VALUE_BY_CONTEXT_CREATES_NEW
	 * Test that update creates new entry if context not found
	 * @return void
	 */
	public function test_update_value_by_context_creates_new() {
		$component = $this->build_component_instance();
		$component->set_data(null);
		
		$result = $component->update_value_by_context(42, 'test3', 10);
		
		$this->assertTrue($result);
		
		$data = $component->get_data();
		$this->assertCount(1, $data);
		$this->assertEquals(42, $data[0]->value);
	}

	/**
	 * TEST_HAS_DATAFRAME
	 * Test checking if component has dataframe configured
	 * @return void
	 */
	public function test_has_dataframe() {
		$component = $this->build_component_instance();
		
		// Test with no ontology configuration (returns false)
		$result = $component->has_dataframe();
		
		$this->assertIsBool($result);
	}

	/**
	 * TEST_GET_DATAFRAME_TIPO
	 * Test getting dataframe tipo from ontology
	 * @return void
	 */
	public function test_get_dataframe_tipo() {
		$component = $this->build_component_instance('test152');
		
		$result = $component->get_dataframe_tipo();

		// Returns null if not configured in ontology
		$this->assertNull($result);
	}

	/**
	 * TEST_GET_DATAFRAME_MODEL
	 * Test getting dataframe model
	 * @return void
	 */
	public function test_get_dataframe_model() {
		$component = $this->build_component_instance();
		
		$result = $component->get_dataframe_model();
		
		$this->assertIsString($result);
		$this->assertNotEmpty($result);
	}

	/**
	 * TEST_ADD_VALUE_WITH_CONTEXT_MULTIPLE_CONTEXTS
	 * Test adding values with different contexts
	 * @return void
	 */
	public function test_add_value_with_context_multiple_contexts() {
		$component = $this->build_component_instance();
		$component->set_data(null);
		
		// Add to first parent
		$component->add_value_with_context(1, 'test3', 10);
		// Add to second parent
		$component->add_value_with_context(1, 'test3', 5);
		
		$data = $component->get_data();
		
		$this->assertCount(2, $data);
	}
}
