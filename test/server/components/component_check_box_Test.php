<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_check_box_test extends BaseTestCase {



	public static $model		= 'component_check_box';
	public static $tipo			= 'test88';
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
* TEST_CREATE_COMPONENT
* Verify component instantiation with correct properties
* @return void
*/
public function test_create_component() {

	$component = $this->build_component_instance();

	$this->assertTrue(
		get_class($component)==='component_check_box',
		'expected class component_check_box : ' . get_class($component)
	);
	$this->assertTrue(
		$component->get_tipo()==='test88',
		'expected tipo test88 : ' . $component->get_tipo()
	);
	$this->assertTrue(
		$component->section_tipo==='test3',
		'expected section_tipo test3 : ' . $component->section_tipo
	);
	$this->assertTrue(
		$component->get_mode()==='edit',
		'expected mode edit : ' . $component->get_mode()
	);
	$this->assertTrue(
		$component->get_lang()===DEDALO_DATA_NOLAN,
		'expected lang DEDALO_DATA_NOLAN : ' . $component->get_lang()
	);
	$this->assertTrue(
		$component->section_id===1,
		'expected section_id 1 : ' . to_string($component->section_id)
	);
}//end test_create_component



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
* TEST_GET_DATALIST
* @return void
*/
public function test_get_datalist() {

	$component = $this->build_component_instance();

	$result = $component->get_datalist();

	$this->assertTrue(
		gettype($result)==='array',
		'expected type array : ' . PHP_EOL
			. gettype($result)
	);
}//end test_get_datalist



/**
* TEST_GET_IDENTIFIER
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

	$expected = self::$tipo . '_' . self::$section_tipo . '_1';
	$this->assertTrue(
		$result===$expected,
		'expected identifier ' . $expected . ' : ' . PHP_EOL
			. to_string($result)
	);
}//end test_get_identifier



/**
* TEST_GET_DATA
* @return void
*/
public function test_get_data() {

	$component = $this->build_component_instance();

	$result = $component->get_data();

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

	// locator case
		$data = [
			(object)[
				'section_id' => '2',
				'section_tipo' => 'dd64',
				'tipo' => 'dd151',
				'from_component_tipo' => self::$tipo
			]
		];
		$component->set_data($data);

		$result = $component->get_data();

		$this->assertTrue(
			count($result) === 1,
			'expected 1 element in data array'
		);
		$this->assertTrue(
			$result[0]->section_id === $data[0]->section_id,
			'expected section_id to match'
		);
		$this->assertTrue(
			$result[0]->section_tipo === $data[0]->section_tipo,
			'expected section_tipo to match'
		);

	// null case
		$component->set_data(null);
		$check_data = $component->get_data();
		$this->assertTrue(
			$check_data===null,
			'expected null after set_data(null) : ' . to_string($check_data)
		);

	// empty array case
		$component->set_data([]);
		$check_data = $component->get_data();
		$this->assertTrue(
			$check_data===null,
			'expected null after set_data([]) : ' . to_string($check_data)
		);

	// restore old data
		$component->set_data($old_data);
		$component->save();
}//end test_set_data



/**
* TEST_SAVE
* @return void
*/
public function test_save() {

	$component = $this->build_component_instance();

	// preserve original data
		$original_data = $component->get_data();

	// empty case
		$component->set_data([]);
		$result = $component->save();
		$this->assertTrue(
			$result===true,
			'expected boolean true on save empty : ' . to_string($result)
		);
		$check_data = $component->get_data();
		$this->assertTrue(
			$check_data===null,
			'expected null after save empty : ' . to_string($check_data)
		);

	// data case
		$locator = new locator();
			$locator->set_section_tipo('dd64');
			$locator->set_section_id('1');
			$locator->set_type(DEDALO_RELATION_TYPE_LINK);
			$locator->set_from_component_tipo('test88');

		$component->set_data([$locator]);
		$result = $component->save();

		$this->assertTrue(
			$result===true,
			'expected true on save with data : ' . to_string($result)
		);

		$check_data = $component->get_data();
		$this->assertTrue(
			$check_data[0]->section_tipo === $locator->section_tipo,
			'expected [section_tipo] : ' . PHP_EOL
				.'check_data: ' . to_string($check_data) . PHP_EOL
				.'data: ' . to_string([$locator])
		);
		$this->assertTrue(
			$check_data[0]->section_id === $locator->section_id,
			'expected [section_id] : ' . PHP_EOL
				.'check_data: ' . to_string($check_data) . PHP_EOL
				.'data: ' . to_string([$locator])
		);

	// restore original data
		$component->set_data($original_data);
		$component->save();
}//end test_save



/**
* TEST_ADD_LOCATOR_TO_DATA
* Add a locator to component data and verify it exists
* @return void
*/
public function test_add_locator_to_data() {

	$component = $this->build_component_instance();

	// preserve original data
		$original_data = $component->get_data();

	// clear data first
		$component->set_data([]);
		$component->save();

	// create a locator
		$locator = new locator();
			$locator->set_section_tipo('dd64');
			$locator->set_section_id('2');
			$locator->set_type(DEDALO_RELATION_TYPE_LINK);
			$locator->set_from_component_tipo('test88');

	// add locator
		$result = $component->add_locator_to_data($locator);

		$this->assertTrue(
			$result===true,
			'expected true on add_locator_to_data : ' . to_string($result)
		);

	// verify data contains the locator
		$data = $component->get_data();
		$this->assertTrue(
			!empty($data) && count($data)===1,
			'expected 1 element in data : ' . count($data ?? [])
		);
		$this->assertTrue(
			$data[0]->section_tipo==='dd64',
			'expected section_tipo dd64 : ' . $data[0]->section_tipo
		);
		$this->assertTrue(
			$data[0]->section_id==='2',
			'expected section_id 2 : ' . $data[0]->section_id
		);

	// restore original data
		$component->set_data($original_data);
		$component->save();
}//end test_add_locator_to_data



/**
* TEST_ADD_DUPLICATE_LOCATOR
* Verify that adding a duplicate locator returns false
* @return void
*/
public function test_add_duplicate_locator() {

	$component = $this->build_component_instance();

	// preserve original data
		$original_data = $component->get_data();

	// clear and add one locator
		$component->set_data([]);

		$locator = new locator();
			$locator->set_section_tipo('dd64');
			$locator->set_section_id('1');
			$locator->set_type(DEDALO_RELATION_TYPE_LINK);
			$locator->set_from_component_tipo('test88');

		$result = $component->add_locator_to_data($locator);
		$this->assertTrue(
			$result===true,
			'expected true on first add : ' . to_string($result)
		);

	// try adding same locator again
		$result2 = $component->add_locator_to_data($locator);
		$this->assertTrue(
			$result2===false,
			'expected false on duplicate add : ' . to_string($result2)
		);

	// verify data still has only 1 element
		$data = $component->get_data();
		$this->assertTrue(
			count($data)===1,
			'expected 1 element after duplicate add : ' . count($data)
		);

	// restore original data
		$component->set_data($original_data);
		$component->save();
}//end test_add_duplicate_locator



/**
* TEST_CHANGE_DATA
* Change component data to a different locator and verify
* @return void
*/
public function test_change_data() {

	$component = $this->build_component_instance();

	// preserve original data
		$original_data = $component->get_data();

	// set first locator
		$locator1 = new locator();
			$locator1->set_section_tipo('dd64');
			$locator1->set_section_id('1');
			$locator1->set_type(DEDALO_RELATION_TYPE_LINK);
			$locator1->set_from_component_tipo('test88');

		$component->set_data([$locator1]);
		$data = $component->get_data();
		$this->assertTrue(
			$data[0]->section_id==='1',
			'expected section_id 1 after first set : ' . $data[0]->section_id
		);

	// change to different locator
		$locator2 = new locator();
			$locator2->set_section_tipo('dd64');
			$locator2->set_section_id('2');
			$locator2->set_type(DEDALO_RELATION_TYPE_LINK);
			$locator2->set_from_component_tipo('test88');

		$component->set_data([$locator2]);
		$data = $component->get_data();
		$this->assertTrue(
			$data[0]->section_id==='2',
			'expected section_id 2 after change : ' . $data[0]->section_id
		);
		$this->assertTrue(
			$data[0]->section_tipo==='dd64',
			'expected section_tipo dd64 after change : ' . $data[0]->section_tipo
		);

	// restore original data
		$component->set_data($original_data);
		$component->save();
}//end test_change_data



/**
* TEST_REMOVE_LOCATOR_FROM_DATA
* Remove a locator from component data and verify
* @return void
*/
public function test_remove_locator_from_data() {

	$component = $this->build_component_instance();

	// preserve original data
		$original_data = $component->get_data();

	// set two locators
		$locator1 = new locator();
			$locator1->set_section_tipo('dd64');
			$locator1->set_section_id('1');
			$locator1->set_type(DEDALO_RELATION_TYPE_LINK);
			$locator1->set_from_component_tipo('test88');

		$locator2 = new locator();
			$locator2->set_section_tipo('dd64');
			$locator2->set_section_id('2');
			$locator2->set_type(DEDALO_RELATION_TYPE_LINK);
			$locator2->set_from_component_tipo('test88');

		$component->set_data([$locator1, $locator2]);
		$data = $component->get_data();
		$this->assertTrue(
			count($data)===2,
			'expected 2 elements before remove : ' . count($data)
		);

	// remove locator1
		$result = $component->remove_locator_from_data($locator1);
		$this->assertTrue(
			$result===true,
			'expected true on remove_locator_from_data : ' . to_string($result)
		);

	// verify only locator2 remains
		$data = $component->get_data();
		$this->assertTrue(
			count($data)===1,
			'expected 1 element after remove : ' . count($data)
		);
		$this->assertTrue(
			$data[0]->section_id==='2',
			'expected remaining section_id 2 : ' . $data[0]->section_id
		);

	// try removing non-existent locator
		$result2 = $component->remove_locator_from_data($locator1);
		$this->assertTrue(
			$result2===false,
			'expected false on remove non-existent locator : ' . to_string($result2)
		);

	// restore original data
		$component->set_data($original_data);
		$component->save();
}//end test_remove_locator_from_data



/**
* TEST_VALIDATE_DATA_ELEMENT
* Verify validate_data_element with valid and invalid locators
* @return void
*/
public function test_validate_data_element() {

	$component = $this->build_component_instance();

	// valid locator
		$valid_locator = (object)[
			'section_tipo'	=> 'dd64',
			'section_id'	=> '1',
			'type'			=> DEDALO_RELATION_TYPE_LINK
		];
		$result = $component->validate_data_element($valid_locator);
		$this->assertTrue(
			$result!==false,
			'expected valid result for proper locator'
		);
		$this->assertTrue(
			isset($result->from_component_tipo) && $result->from_component_tipo==='test88',
			'expected from_component_tipo test88 : ' . ($result->from_component_tipo ?? 'null')
		);

	// autoreference locator (same section_tipo and section_id as component)
		$autoref_locator = (object)[
			'section_tipo'	=> 'test3',
			'section_id'	=> '1',
			'type'			=> DEDALO_RELATION_TYPE_LINK
		];
		$result_autoref = $component->validate_data_element($autoref_locator);
		$this->assertTrue(
			$result_autoref===false,
			'expected false for autoreference locator'
		);

	// missing section_id
		$bad_locator = (object)[
			'section_tipo'	=> 'dd64',
			'type'			=> DEDALO_RELATION_TYPE_LINK
		];
		$result_bad = $component->validate_data_element($bad_locator);
		$this->assertTrue(
			$result_bad===false,
			'expected false for locator missing section_id'
		);

	// missing section_tipo
		$bad_locator2 = (object)[
			'section_id'	=> '1',
			'type'			=> DEDALO_RELATION_TYPE_LINK
		];
		$result_bad2 = $component->validate_data_element($bad_locator2);
		$this->assertTrue(
			$result_bad2===false,
			'expected false for locator missing section_tipo'
		);
}//end test_validate_data_element



/**
* TEST_SAVE_AND_READ
* Save data and verify persistence by creating a fresh instance
* @return void
*/
public function test_save_and_read() {

	$component = $this->build_component_instance();

	// preserve original data
		$original_data = $component->get_data();

	// set and save a locator
		$locator = new locator();
			$locator->set_section_tipo('dd64');
			$locator->set_section_id('2');
			$locator->set_type(DEDALO_RELATION_TYPE_LINK);
			$locator->set_from_component_tipo('test88');

		$component->set_data([$locator]);
		$result = $component->save();
		$this->assertTrue(
			$result===true,
			'expected true on save : ' . to_string($result)
		);

	// create fresh instance and read
		$fresh = $this->build_component_instance();
		$fresh_data = $fresh->get_data();

		$this->assertTrue(
			!empty($fresh_data) && count($fresh_data)>=1,
			'expected at least 1 element in persisted data'
		);
		$this->assertTrue(
			$fresh_data[0]->section_tipo==='dd64',
			'expected persisted section_tipo dd64 : ' . $fresh_data[0]->section_tipo
		);
		$this->assertTrue(
			$fresh_data[0]->section_id==='2',
			'expected persisted section_id 2 : ' . $fresh_data[0]->section_id
		);

	// restore original data
		$component->set_data($original_data);
		$component->save();
}//end test_save_and_read



/**
* TEST_TEST_EQUAL_PROPERTIES
* Verify test_equal_properties configuration
* @return void
*/
public function test_test_equal_properties() {

	$component = $this->build_component_instance();

	$properties = $component->test_equal_properties;

	$this->assertTrue(
		is_array($properties),
		'expected array for test_equal_properties'
	);
	$this->assertTrue(
		in_array('section_tipo', $properties),
		'expected section_tipo in test_equal_properties'
	);
	$this->assertTrue(
		in_array('section_id', $properties),
		'expected section_id in test_equal_properties'
	);
	$this->assertTrue(
		in_array('type', $properties),
		'expected type in test_equal_properties'
	);
	$this->assertTrue(
		in_array('from_component_tipo', $properties),
		'expected from_component_tipo in test_equal_properties'
	);
}//end test_test_equal_properties



}//end class component_check_box_test
