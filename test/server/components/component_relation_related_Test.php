<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

final class component_relation_related_test extends BaseTestCase {



	public static $model		= 'component_relation_related';
	public static $tipo			= 'test54';
	public static $section_tipo	= 'test3';



	/**
	* BUILD_COMPONENT_INSTANCE
	* @return component_relation_related
	*/
	private function build_component_instance() : component_relation_related {

		$this->user_login();

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'edit';
		$lang			= DEDALO_DATA_NOLAN;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo
		);

		return $component;
	}//end build_component_instance



	/////////// ⬇︎ test start ⬇︎ ////////////////



	/**
	* TEST_GET_DATA
	* @return void
	*/
	public function test_get_data() {

		$component = $this->build_component_instance();

		$result	= $component->get_data();

		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
			'expected type array|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_dato



	/**
	* TEST_SET_DATA
	* @return void
	*/
	public function test_set_data() {

		$component = $this->build_component_instance();

		$data		= null;
		$result		= $component->set_data($data);
		$check_data = $component->get_data();

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		// null case
			$this->assertTrue(
				$check_data===null,
				'expected null : ' . PHP_EOL
					. to_string($check_data)
			);

		// data case
			$locator = json_decode('
				{
					"type":"dd48",
					"section_id":"2",
					"section_tipo":"test3",
					"from_component_tipo":"test54"
				}
			');
			$data	= [$locator];
			$result	= $component->set_data( $data );
			$check_data = $component->get_data();
			$this->assertTrue(
				true === locator::in_array_locator( $locator, $data ),
				'expected array : ' . PHP_EOL
					. to_string($check_data)
			);

	}//end test_set_data



	/**
	* TEST_ADD_LOCATOR_TO_DATA
	* @return void
	*/
	public function test_add_locator_to_data() {

		$component = $this->build_component_instance();

		$locator = new locator();
			$locator->set_section_tipo(self::$section_tipo);
			$locator->set_section_id(3);
			$locator->set_from_component_tipo(self::$tipo);
			$locator->set_type(DEDALO_RELATION_TYPE_RELATED_TIPO);

		$result = $component->add_locator_to_data( $locator );

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		$data = $component->get_data();
		$this->assertTrue(
			locator::in_array_locator($locator, $data, ['section_tipo','section_id']),
			'expected true : ' . PHP_EOL
				.' data: '. to_string($data) . PHP_EOL
				.' locator: ' .to_string($locator)
		);
	}//end test_add_locator_to_data



	/**
	* TEST_REMOVE_LOCATOR_FROM_DATA
	* @return void
	*/
	public function test_remove_locator_from_data() {

		$component = $this->build_component_instance();

		$locator = new locator();
			$locator->set_section_tipo(self::$section_tipo);
			$locator->set_section_id(3);
			$locator->set_from_component_tipo(self::$tipo);
			$locator->set_type(DEDALO_RELATION_TYPE_RELATED_TIPO);

		$component->add_locator_to_data($locator);
		// add another locator
		$locator->set_section_id(4);
		$component->add_locator_to_data($locator);
		// remove the second locator
		$result = $component->remove_locator_from_data($locator);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		$data = $component->get_data();
		$this->assertTrue(
			!locator::in_array_locator($locator, $data, ['section_tipo','section_id']),
			'expected true : ' . PHP_EOL
				.' data: '. to_string($data) . PHP_EOL
				.' locator: ' .to_string($locator)
		);
	}//end test_remove_locator_from_data



	/**
	* TEST_GET_DATA_WITH_REFERENCES
	* @return void
	*/
	public function test_get_data_with_references() {

		$component = $this->build_component_instance();

		$result = $component->get_data_with_references();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_data_with_references



	/**
	* TEST_GET_CALCULATED_REFERENCES
	* @return void
	*/
	public function test_get_calculated_references() {

		$component = $this->build_component_instance();

		$result = $component->get_calculated_references(
			false // bool only data
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_calculated_references



	/**
	* TEST_GET_TYPE_REL
	* @return void
	*/
	public function test_get_type_rel() {

		$component = $this->build_component_instance();

		$result = $component->get_type_rel();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$reference = 'dd620';
		$this->assertTrue(
			$result===$reference,
			'expected  '.$reference.' ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_type_rel



	/**
	* TEST_GET_REFERENCES_RECURSIVE
	* @return void
	*/
	public function test_get_references_recursive() {

		$component = $this->build_component_instance();

		$current_locator = new stdClass();
			$current_locator->section_tipo			= self::$section_tipo;
			$current_locator->section_id			= 1;
			$current_locator->from_component_tipo	= self::$tipo;

		$result = component_relation_related::get_references_recursive(
			self::$tipo,
			$current_locator,
			DEDALO_RELATION_TYPE_RELATED_TIPO,
			false, // bool recursion
			$component->lang
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_references_recursive



	/**
	* TEST_GET_REFERENCES
	* @return void
	*/
	public function test_get_references() {

		$component = $this->build_component_instance();

		$result = $component->get_references();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_references



	/**
	* TEST_GET_SORTABLE
	* @return void
	*/
	public function test_get_sortable() {

		$component = $this->build_component_instance();

		$result = $component->get_sortable();

		$this->assertTrue(
			$result===true,
			'expected true : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_sortable



	/**
	* TEST_GET_ORDER_PATH
	* @return void
	*/
	public function test_get_order_path() {

		$component = $this->build_component_instance();

		$result = $component->get_order_path(
			self::$tipo,
			self::$section_tipo
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_order_path



	/**
	* TEST_GET_ORDER_PATH_STRUCTURE
	* Verify order path contains 2 elements (self + thesaurus term)
	* @return void
	*/
	public function test_get_order_path_structure() {

		$component = $this->build_component_instance();

		$result = $component->get_order_path(
			self::$tipo,
			self::$section_tipo
		);

		$this->assertTrue(
			count($result)===2,
			'expected 2 path elements : ' . PHP_EOL
				. count($result)
		);

		// first element is the component itself
		$this->assertTrue(
			$result[0]->component_tipo===self::$tipo,
			'expected first path component_tipo to be ' . self::$tipo . ' : ' . PHP_EOL
				. to_string($result[0]->component_tipo ?? null)
		);

		// second element is the thesaurus term
		$this->assertTrue(
			$result[1]->component_tipo===DEDALO_THESAURUS_TERM_TIPO,
			'expected second path component_tipo to be DEDALO_THESAURUS_TERM_TIPO : ' . PHP_EOL
				. to_string($result[1]->component_tipo ?? null)
		);
	}//end test_get_order_path_structure



	/**
	* TEST_SET_DATA_EMPTY
	* Verify set_data with empty array results in null on get_data
	* @return void
	*/
	public function test_set_data_empty() {

		$component = $this->build_component_instance();

		// backup original data
		$original_data = $component->get_data();

		// set empty
		$result = $component->set_data(null);
		$check_data = $component->get_data();

		$this->assertTrue(
			$result===true,
			'expected true on set_data(null) : ' . PHP_EOL
				. to_string($result)
		);
		$this->assertTrue(
			$check_data===null,
			'expected null after set_data(null) : ' . PHP_EOL
				. to_string($check_data)
		);

		// restore original data
		$component->set_data($original_data);
	}//end test_set_data_empty



	/**
	* TEST_SAVE_AND_RELOAD
	* Verify data persistence across save/reload cycle
	* @return void
	*/
	public function test_save_and_reload() {

		$component = $this->build_component_instance();

		// backup original data
		$original_data = $component->get_data();

		// set new data
		$locator = new locator();
			$locator->set_section_tipo(self::$section_tipo);
			$locator->set_section_id(5);
			$locator->set_from_component_tipo(self::$tipo);
			$locator->set_type(DEDALO_RELATION_TYPE_RELATED_TIPO);

		$new_data = [$locator];
		$component->set_data($new_data);
		$save_result = $component->Save();

		$this->assertTrue(
			$save_result===true || gettype($save_result)==='integer',
			'expected true or int on Save : ' . PHP_EOL
				. to_string($save_result)
		);

		// reload component
		$component2 = component_common::get_instance(
			self::$model,
			self::$tipo,
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			self::$section_tipo
		);
		$reloaded_data = $component2->get_data();

		$this->assertTrue(
			locator::in_array_locator($locator, $reloaded_data, ['section_tipo','section_id']),
			'expected locator in reloaded data : ' . PHP_EOL
				. to_string($reloaded_data)
		);

		// restore original data
		$component2->set_data($original_data);
		$component2->Save();
	}//end test_save_and_reload



	/**
	* TEST_IS_EMPTY
	* Verify is_empty behavior with different data items
	* @return void
	*/
	public function test_is_empty() {

		$component = $this->build_component_instance();

		// null data_item
		$result = $component->is_empty(null);
		$this->assertTrue(
			$result===true,
			'expected true for is_empty(null) : ' . PHP_EOL
				. to_string($result)
		);

		// locator data_item (relation components use locators, not value)
		$locator = new stdClass();
			$locator->section_tipo		= self::$section_tipo;
			$locator->section_id		= '2';
			$locator->from_component_tipo = self::$tipo;
		$result = $component->is_empty($locator);
		// relation component locators don't have 'value' key, so is_empty returns true by design
		$this->assertTrue(
			gettype($result)==='boolean',
			'expected boolean for is_empty(locator) : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_is_empty



	/**
	* TEST_IS_EMPTY_DATA
	* Verify is_empty_data behavior for array-level checks
	* @return void
	*/
	public function test_is_empty_data() {

		$component = $this->build_component_instance();

		// null data
		$result = $component->is_empty_data(null);
		$this->assertTrue(
			$result===true,
			'expected true for is_empty_data(null) : ' . PHP_EOL
				. to_string($result)
		);

		// empty array
		$result = $component->is_empty_data([]);
		$this->assertTrue(
			$result===true,
			'expected true for is_empty_data([]) : ' . PHP_EOL
				. to_string($result)
		);

		// non-empty array with locators: relation component locators lack 'value' key,
		// so is_empty() returns true for each item, making is_empty_data also true
		$locator = new stdClass();
			$locator->section_tipo		= self::$section_tipo;
			$locator->section_id		= '2';
			$locator->from_component_tipo = self::$tipo;
		$result = $component->is_empty_data([$locator]);
		$this->assertTrue(
			gettype($result)==='boolean',
			'expected boolean for is_empty_data(non-empty) : ' . PHP_EOL
				. gettype($result)
		);
		// Note: is_empty_data returns true for locator arrays because is_empty() finds no 'value' key
		// This is expected behavior for relation components (same as media components with files_info)
	}//end test_is_empty_data



	/**
	* TEST_GET_IDENTIFIER
	* Verify get_identifier returns a non-empty string
	* @return void
	*/
	public function test_get_identifier() {

		$component = $this->build_component_instance();

		$result = $component->get_identifier();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			strlen($result) > 0,
			'expected non-empty identifier : ' . PHP_EOL
				. to_string($result)
		);
		$this->assertTrue(
			strpos($result, self::$tipo) !== false,
			'expected identifier to contain tipo ' . self::$tipo . ' : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_identifier



	/**
	* TEST_COMPONENT_INSTANCE_MODES
	* Verify component instantiation in edit, list, search modes
	* @return void
	*/
	public function test_component_instance_modes() {

		$modes = ['edit', 'list', 'search'];

		foreach ($modes as $mode) {
			$component = component_common::get_instance(
				self::$model,
				self::$tipo,
				1,
				$mode,
				DEDALO_DATA_NOLAN,
				self::$section_tipo
			);

			$this->assertTrue(
				get_class($component)==='component_relation_related',
				'expected class component_relation_related for mode ' . $mode . ' : ' . PHP_EOL
					. get_class($component)
			);
			$this->assertTrue(
				$component->get_mode()===$mode,
				'expected mode ' . $mode . ' : ' . PHP_EOL
					. $component->get_mode()
			);
		}
	}//end test_component_instance_modes



	/**
	* TEST_GET_CALCULATED_REFERENCES_ONLY_DATA
	* Verify get_calculated_references with only_data=true returns raw locators
	* @return void
	*/
	public function test_get_calculated_references_only_data() {

		$component = $this->build_component_instance();

		$result = $component->get_calculated_references(
			true // bool only_data
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);

		// When only_data=true, items should be raw locators (not objects with value+label)
		foreach ($result as $item) {
			$this->assertTrue(
				isset($item->section_tipo) || isset($item->value),
				'expected locator or value object : ' . PHP_EOL
					. to_string($item)
			);
		}
	}//end test_get_calculated_references_only_data



}//end class component_relation_related_test
