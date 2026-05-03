<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_relation_children_test extends BaseTestCase {



	public static $model		= 'component_relation_children';
	public static $tipo			= 'test201';
	public static $section_tipo	= 'test3';


	/**
	* BUILD_COMPONENT_INSTANCE
	* @return
	*/
	private function build_component_instance() {

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
	}//end test_get_data



	/**
	* TEST_SET_DATA
	* @return void
	*/
	public function test_set_data() {

		$component = $this->build_component_instance();

		$old_data = $component->get_data();

		$data	= null;
		$result	= $component->set_data($data);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		// null case
			$updated_data = $component->get_data();
			$this->assertTrue(
				$updated_data===null,
				' (null case) expected null : ' . PHP_EOL
				.'component data: ' . to_string($updated_data) . PHP_EOL
				.'reference data: ' . to_string(null) . PHP_EOL
			);

		// object case
			$locator = json_decode('
				{
					"section_tipo": "test3",
					"section_id": "2",
					"from_component_tipo": "test201",
					"type": "dd48"
				}
			');

			$data	= [$locator];
			$result	= $component->set_data($data);
			$updated_data = $component->get_data();
			$this->assertTrue(
				json_encode($updated_data)===json_encode($data),
				' (array case) expected equal array : ' . PHP_EOL
				.'component get_data: ' . to_string($updated_data) . PHP_EOL
				.'reference data: ' . to_string($data) . PHP_EOL
			);

		// restore data (only if old_data is not null/empty)
			if (!empty($old_data)) {
				$result	= $component->set_data($old_data);
				$updated_data = $component->get_data();
				$this->assertTrue(
					json_encode($updated_data)===json_encode($old_data),
					' (restore data case) expected old data : ' . PHP_EOL
					.'updated_data: ' . to_string($updated_data) . PHP_EOL
					.'reference data: ' . to_string($old_data) . PHP_EOL
				);
			} else {
				// If old_data was empty, verify it's now restored as empty
				$result	= $component->set_data(null);
				$this->assertTrue($result === true, 'setting to null should return true');
			}
	}//end test_set_data


	/**
	* TEST_SAVE
	* @return void
	*/
	public function test_save() {

		$component = $this->build_component_instance();

		$result = $component->save();

		$this->assertTrue(
			is_bool($result),
			'expected return type bool : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result === true,
			'save should return true for component_relation_children (read-only component)'
		);
	}//end test_save


	/**
	* TEST_GET_DATA_PAGINATED
	* @return void
	*/
	public function test_get_data_paginated() {

		$component = $this->build_component_instance();

		$result = $component->get_data_paginated();

		$this->assertTrue(
			is_array($result),
			'expected return type array : ' . PHP_EOL
				. gettype($result)
		);

		// Test with custom limit
		$result_with_limit = $component->get_data_paginated(5);
		$this->assertTrue(
			is_array($result_with_limit),
			'expected array with custom limit'
		);

		// Assert result length does not exceed limit
		$this->assertTrue(
			count($result_with_limit) <= 5,
			'result count should not exceed custom limit'
		);
	}//end test_get_data_paginated


	/**
	* TEST_get_sortable
	* @return void
	*/
	public function test_get_sortable() {

		$component = $this->build_component_instance();

		$result = $component->get_sortable();

		$this->assertTrue(
			$result===false,
			'expected false : ' . PHP_EOL
				. to_string($result)
		);

		$this->assertFalse($result, 'sortable should always be false');
		$this->assertIsBool($result, 'sortable should return boolean');
	}//end test_get_sortable



	/**
	* TEST_GET_CHILDREN
	* @return void
	*/
	public function test_get_children() {
		$section_id = 1;
		$section_tipo = self::$section_tipo;

		$children = component_relation_children::get_children($section_id, $section_tipo);

		$this->assertTrue(
			is_array($children),
			'Expected array from get_children, got: ' . gettype($children)
		);

		// Additional assertions
		$this->assertIsArray($children, 'get_children should always return array');
		foreach ($children as $child) {
			$this->assertIsObject($child, 'each child should be a locator object');
		}
	}//end test_get_children

	/**
	* TEST_GET_CHILDREN_TIPO
	* @return void
	*/
	public function test_get_children_tipo() {
		$section_tipo = self::$section_tipo;

		$result = component_relation_children::get_children_tipo($section_tipo);

		$this->assertTrue(
			is_null($result) || is_string($result),
			'Expected string or null from get_children_tipo, got: ' . gettype($result)
		);

		// Additional assertions
		$this->assertTrue(
			$result === null || (is_string($result) && !empty($result)),
			'Result should be null or non-empty string'
		);
	}//end test_get_children_tipo

	/**
	* TEST_GET_AR_RELATED_PARENT_TIPO
	* @return void
	*/
	public function test_get_ar_related_parent_tipo() {
		$tipo = self::$tipo;
		$section_tipo = self::$section_tipo;

		$result = component_relation_children::get_ar_related_parent_tipo($tipo, $section_tipo);

		$this->assertIsArray($result, 'Expected array from get_ar_related_parent_tipo');

		// Additional assertions
		$this->assertTrue(
			is_array($result),
			'Result should be array type'
		);
		foreach ($result as $parent_tipo) {
			$this->assertTrue(
				is_string($parent_tipo) || is_null($parent_tipo),
				'Each parent tipo should be string or null'
			);
		}
	}//end test_get_ar_related_parent_tipo

	/**
	* TEST_GET_CHILDREN_RECURSIVE
	* @return void
	*/
	public function test_get_children_recursive() {
		$section_id = 1;
		$section_tipo = self::$section_tipo;

		$children_recursive = component_relation_children::get_children_recursive($section_id, $section_tipo);

		$this->assertTrue(
			is_array($children_recursive),
			'Expected array from get_children_recursive, got: ' . gettype($children_recursive)
		);

		// Additional assertions
		$this->assertIsArray($children_recursive, 'should always return array');
		foreach ($children_recursive as $child) {
			$this->assertIsObject($child, 'each recursive child should be object');
		}
	}//end test_get_children_recursive

	/**
	* TEST_HAS_CHILDREN_OF_TYPE
	* @return void
	*/
	public function test_has_children_of_type() {
		$section_id = 1;
		$section_tipo = self::$section_tipo;
		$component_tipo = self::$tipo;

		// descriptor check
		$has_descriptor = component_relation_children::has_children_of_type($section_id, $section_tipo, $component_tipo, 'descriptor');
		$this->assertTrue(
			is_bool($has_descriptor),
			'Expected bool from has_children_of_type(descriptor)'
		);

		// non_descriptor check
		$has_non_descriptor = component_relation_children::has_children_of_type($section_id, $section_tipo, $component_tipo, 'non_descriptor');
		$this->assertTrue(
			is_bool($has_non_descriptor),
			'Expected bool from has_children_of_type(non_descriptor)'
		);

		// Additional assertions
		$this->assertIsBool($has_descriptor, 'descriptor check should return boolean');
		$this->assertIsBool($has_non_descriptor, 'non_descriptor check should return boolean');
		$this->assertTrue(
			is_bool($has_descriptor) && is_bool($has_non_descriptor),
			'Both checks should return boolean values'
		);
	}//end test_has_children_of_type



	/**
	* TEST_GET_CHILDREN_OF_TYPE
	* @return void
	*/
	public function test_get_children_of_type() {
		$section_id = 1;
		$section_tipo = self::$section_tipo;

		// test descriptor type (default)
		$descriptor_children = component_relation_children::get_children_of_type($section_id, $section_tipo);
		$this->assertTrue(
			is_array($descriptor_children),
			'Expected array from get_children_of_type(), got: ' . gettype($descriptor_children)
		);

		// test non_descriptor type
		$non_descriptor_children = component_relation_children::get_children_of_type($section_id, $section_tipo, 'non_descriptor');
		$this->assertTrue(
			is_array($non_descriptor_children),
			'Expected array from get_children_of_type(non_descriptor)'
		);

		// test with limit
		$limited_children = component_relation_children::get_children_of_type($section_id, $section_tipo, 'descriptor', null, 5);
		$this->assertTrue(
			is_array($limited_children),
			'Expected array with limit parameter'
		);
		$this->assertTrue(
			count($limited_children) <= 5,
			'Result count should not exceed limit'
		);

		// Additional assertions
		$this->assertIsArray($descriptor_children, 'should always return array');
		$this->assertIsArray($non_descriptor_children, 'should always return array');
		foreach ($descriptor_children as $child) {
			$this->assertIsObject($child, 'each child should be a locator object');
		}
		foreach ($non_descriptor_children as $child) {
			$this->assertIsObject($child, 'each child should be a locator object');
		}
	}//end test_get_children_of_type



	/**
	* TEST_SORT_CHILDREN
	* @return void
	*/
	public function test_sort_children() {
		$section_tipo = self::$section_tipo;

		// Create dummy locators
		$locator1 = new locator();
		$locator1->set_section_tipo($section_tipo);
		$locator1->set_section_id(1);

		$locator2 = new locator();
		$locator2->set_section_tipo($section_tipo);
		$locator2->set_section_id(2);

		$locators = [$locator1, $locator2];

		$result = component_relation_children::sort_children(
			$section_tipo,
			$locators,
			$section_tipo, // parent_section_tipo
			1 // parent_section_id
		);

		$this->assertTrue(
			is_array($result) || $result===false,
			'Expected array|false from sort_children, got: ' . gettype($result)
		);

		if (is_array($result)) {
			foreach ($result as $item) {
				$this->assertIsObject($item, 'Each item in changed array should be an object');
				$this->assertObjectHasProperty('value', $item);
				$this->assertObjectHasProperty('locator', $item);
			}
		}
	}//end test_sort_children



	/**
	* TEST_SET_DATA_EMPTY
	* Test set_data with empty array (should be normalized to null).
	* @return void
	*/
	public function test_set_data_empty() {

		$component = $this->build_component_instance();

		$old_data = $component->get_data();

		// empty array case
		$result = $component->set_data([]);
		$this->assertTrue(
			$result===true,
			'set_data with empty array should return true'
		);

		$updated_data = $component->get_data();
		$this->assertTrue(
			$updated_data===null,
			'empty array should result in null data'
		);

		// restore
		if (!empty($old_data)) {
			$component->set_data($old_data);
		} else {
			$component->set_data(null);
		}
	}//end test_set_data_empty



	/**
	* TEST_SAVE_AND_RELOAD
	* Verify that save returns true (read-only component) and data remains accessible after save.
	* @return void
	*/
	public function test_save_and_reload() {

		$component = $this->build_component_instance();

		$data_before = $component->get_data();

		$saved = $component->save();
		$this->assertTrue(
			$saved===true,
			'save should return true for read-only component'
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
		$data_after = $component2->get_data();

		// data should be unchanged (this component doesn't store data)
		$this->assertTrue(
			json_encode($data_before)===json_encode($data_after),
			'data should be unchanged after save (read-only component)'
		);
	}//end test_save_and_reload



	/**
	* TEST_COMPONENT_INSTANCE_MODES
	* Test component instantiation in edit, list, and search modes.
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
				get_class($component)==='component_relation_children',
				"instance in $mode mode should be component_relation_children"
			);

			$this->assertTrue(
				$component->mode===$mode,
				"component mode should be $mode"
			);

			// search mode uses parent get_data (stored data)
			// edit/list mode uses resolved children
			$data = $component->get_data();
			$this->assertTrue(
				is_array($data) || is_null($data),
				"get_data in $mode mode should return array|null"
			);
		}
	}//end test_component_instance_modes



	/**
	* TEST_IS_EMPTY
	* Relation component data items are locators without 'value' key,
	* so is_empty() returns true for them by design.
	* @return void
	*/
	public function test_is_empty() {

		$component = $this->build_component_instance();

		// null case
		$result = $component->is_empty(null);
		$this->assertTrue(
			$result===true,
			'is_empty(null) should return true'
		);

		// locator object without value key (relation data items)
		$locator = json_decode('{
			"section_tipo": "test3",
			"section_id": "2",
			"from_component_tipo": "test201",
			"type": "dd48"
		}');
		$result = $component->is_empty($locator);
		$this->assertTrue(
			$result===true,
			'is_empty(locator without value key) should return true by design'
		);

		// non-object case
		$result = $component->is_empty('string_value');
		$this->assertTrue(
			$result===true,
			'is_empty(non-object) should return true'
		);
	}//end test_is_empty



	/**
	* TEST_IS_EMPTY_DATA
	* Array-level emptiness check.
	* @return void
	*/
	public function test_is_empty_data() {

		$component = $this->build_component_instance();

		// null case
		$result = $component->is_empty_data(null);
		$this->assertTrue(
			$result===true,
			'is_empty_data(null) should return true'
		);

		// empty array case
		$result = $component->is_empty_data([]);
		$this->assertTrue(
			$result===true,
			'is_empty_data([]) should return true'
		);

		// array with locator (no value key) — is_empty_data iterates is_empty on each item
		$locator = json_decode('{
			"section_tipo": "test3",
			"section_id": "2",
			"from_component_tipo": "test201",
			"type": "dd48"
		}');
		$result = $component->is_empty_data([$locator]);
		$this->assertTrue(
			$result===true,
			'is_empty_data with locator items (no value key) should return true by design'
		);
	}//end test_is_empty_data



	/**
	* TEST_GET_IDENTIFIER
	* @return void
	*/
	public function test_get_identifier() {

		$component = $this->build_component_instance();

		$identifier = $component->get_identifier();

		$this->assertTrue(
			is_string($identifier),
			'get_identifier should return string'
		);

		$this->assertTrue(
			!empty($identifier),
			'get_identifier should return non-empty string'
		);

		// format: tipo_section_tipo_section_id
		$expected_parts = [self::$tipo, self::$section_tipo, '1'];
		foreach ($expected_parts as $part) {
			$this->assertTrue(
				strpos($identifier, (string)$part) !== false,
				"identifier should contain '$part'"
			);
		}
	}//end test_get_identifier



	/**
	* TEST_ADD_CHILD
	* Test add_child method (alias of update_parent with 'add' action).
	* @return void
	*/
	public function test_add_child() {

		$component = $this->build_component_instance();

		$old_data = $component->get_data();

		// add_child requires parent_section_tipo and parent_section_id
		// it delegates to update_parent which resolves parent_tipo automatically
		$result = $component->add_child(
			self::$section_tipo, // parent_section_tipo
			2 // parent_section_id
		);

		$this->assertTrue(
			is_bool($result),
			'add_child should return boolean, got: ' . gettype($result)
		);

		// restore
		if (!empty($old_data)) {
			$component->set_data($old_data);
		} else {
			$component->set_data(null);
		}
	}//end test_add_child



	/**
	* TEST_REMOVE_CHILD
	* Test remove_child method (alias of update_parent with 'remove' action).
	* @return void
	*/
	public function test_remove_child() {

		$component = $this->build_component_instance();

		$old_data = $component->get_data();

		// remove_child requires parent_section_tipo and parent_section_id
		$result = $component->remove_child(
			self::$section_tipo, // parent_section_tipo
			2 // parent_section_id
		);

		$this->assertTrue(
			is_bool($result),
			'remove_child should return boolean, got: ' . gettype($result)
		);

		// restore
		if (!empty($old_data)) {
			$component->set_data($old_data);
		} else {
			$component->set_data(null);
		}
	}//end test_remove_child



	/**
	* TEST_SEARCH_OPERATORS_INFO
	* component_relation_children overrides search_operators_info to return empty array.
	* @return void
	*/
	public function test_search_operators_info() {

		$component = $this->build_component_instance();

		$result = $component->search_operators_info();

		$this->assertIsArray($result, 'search_operators_info should return array');
		$this->assertTrue(
			empty($result),
			'search_operators_info should return empty array (overridden in class)'
		);
	}//end test_search_operators_info



}//end class component_relation_children_test

