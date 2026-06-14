<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
 * COMPONENT_NUMBER_DATAFRAME_TEST
 * Tests for literal main component (component_number) with dataframe extension.
 * Validates the pairing contract: dataframe rows pair by the item stable `id`,
 * never the array index.
 */
final class component_number_dataframe_test extends BaseTestCase {



	public static $model			= 'component_number';
	public static $tipo			= 'test211';
	public static $section_tipo		= 'test3';



	/**
	* BUILD_COMPONENT_INSTANCE
	* @return object
	*/
	private function build_component_instance() : object {

		$this->user_login();

		return component_common::get_instance(
			self::$model,
			self::$tipo,
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			self::$section_tipo
		);
	}//end build_component_instance



	///////////// ⬇︎ test start ⬇︎ ////////////////



	/**
	* TEST_data_items_have_id
	* @return void
	*/
	public function test_data_items_have_id() {

		$component = $this->build_component_instance();

		$component->set_data([
			(object)['value' => 1],
			(object)['value' => 2.5]
		]);

		$data = $component->get_data();
		$this->assertIsArray($data);
		$this->assertCount(2, $data);

		foreach ($data as $item) {
			$this->assertIsObject($item);
			$this->assertObjectHasProperty('id', $item);
			$this->assertIsInt($item->id);
			$this->assertGreaterThan(0, $item->id);
		}
	}//end test_data_items_have_id



	/**
	* TEST_pairing_key_survives_reorder_and_removal
	* @return void
	*/
	public function test_pairing_key_survives_reorder_and_removal() {

		$component = $this->build_component_instance();

		$component->set_data([
			(object)['id' => 1, 'value' => 10],
			(object)['id' => 2, 'value' => 20],
			(object)['id' => 3, 'value' => 30]
		]);

		// reorder: ids stay attached to their values
		$component->set_data([
			(object)['id' => 3, 'value' => 30],
			(object)['id' => 1, 'value' => 10],
			(object)['id' => 2, 'value' => 20]
		]);
		$by_id = [];
		foreach ($component->get_data() as $item) {
			$by_id[$item->id] = $item->value;
		}
		$this->assertEquals(10, $by_id[1]);
		$this->assertEquals(30, $by_id[3]);

		// remove the middle item by id: remaining ids unchanged
		$result = $component->update_data_value((object)['action'=>'remove','id'=>1], DEDALO_DATA_NOLAN);
		$this->assertTrue($result);

		$data = $component->get_data();
		$this->assertCount(2, $data);
		$ids = array_map(fn($item) => $item->id, $data);
		sort($ids);
		$this->assertEquals([2,3], $ids);
	}//end test_pairing_key_survives_reorder_and_removal



	/**
	* TEST_main_component_data_isolation
	* Main data never carries dataframe locator properties
	* @return void
	*/
	public function test_main_component_data_isolation() {

		$component = $this->build_component_instance();

		$component->set_data([ (object)['value' => 42] ]);

		$item = $component->get_data()[0];
		$this->assertObjectNotHasProperty('id_key', $item);
		$this->assertObjectNotHasProperty('section_id_key', $item);
		$this->assertObjectNotHasProperty('section_tipo_key', $item);
		$this->assertObjectNotHasProperty('main_component_tipo', $item);
	}//end test_main_component_data_isolation



	/**
	* TEST_build_dataframe_subdatum_contract
	* The shared controller helper: null for search mode and for instances
	* without properties->has_dataframe (the ontology opt-in)
	* @return void
	*/
	public function test_build_dataframe_subdatum_contract() {

		$component = $this->build_component_instance();

		$value = [ (object)['id' => 1, 'value' => 7] ];

		// search mode: always null
		$this->assertNull($component->build_dataframe_subdatum($value, 'search'));

		// without the has_dataframe ontology flag: null
		$properties = $component->get_properties();
		$has_dataframe = ($properties->has_dataframe ?? false)===true;
		$subdatum = $component->build_dataframe_subdatum($value, 'edit');
		if ($has_dataframe) {
			$this->assertIsObject($subdatum);
			$this->assertIsArray($subdatum->context);
			$this->assertIsArray($subdatum->data);
			$this->assertIsInt($subdatum->counter);
		}else{
			$this->assertNull($subdatum);
		}
	}//end test_build_dataframe_subdatum_contract



}//end class component_number_dataframe_test
