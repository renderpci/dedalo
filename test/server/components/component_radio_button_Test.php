<?php declare(strict_types=1);
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

final class component_radio_button_test extends BaseTestCase {



	public static $model		= 'component_radio_button';
	public static $tipo		= 'test87';
	public static $section_tipo	= 'test3';



	/**
	* BUILD_COMPONENT_INSTANCE
	* @return component_radio_button|null
	*/
	private function build_component_instance( string $mode='edit' ) {

		$this->user_login();

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
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



	// CREATE / INSTANTIATION

	/**
	* TEST_CREATE_COMPONENT
	* Verify component instantiation with correct properties
	* @return void
	*/
	public function test_create_component() {

		$component = $this->build_component_instance();

		$this->assertTrue(
			get_class($component)==='component_radio_button',
			'expected class component_radio_button : ' . get_class($component)
		);
		$this->assertTrue(
			$component->get_tipo()==='test87',
			'expected tipo test87 : ' . $component->get_tipo()
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
	* TEST_CREATE_COMPONENT_LIST_MODE
	* Verify component instantiation in list mode
	* @return void
	*/
	public function test_create_component_list_mode() {

		$component = $this->build_component_instance('list');

		$this->assertTrue(
			get_class($component)==='component_radio_button',
			'expected class component_radio_button in list mode'
		);
		$this->assertTrue(
			$component->get_mode()==='list',
			'expected mode list : ' . $component->get_mode()
		);
	}//end test_create_component_list_mode



	/**
	* TEST_CREATE_COMPONENT_SEARCH_MODE
	* Verify component instantiation in search mode
	* @return void
	*/
	public function test_create_component_search_mode() {

		$component = $this->build_component_instance('search');

		$this->assertTrue(
			get_class($component)==='component_radio_button',
			'expected class component_radio_button in search mode'
		);
		$this->assertTrue(
			$component->get_mode()==='search',
			'expected mode search : ' . $component->get_mode()
		);
	}//end test_create_component_search_mode



	// PROPERTIES

	/**
	* TEST_get_sortable
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
	* TEST_test_equal_properties
	* @return void
	*/
	public function test_test_equal_properties() {

		$component = $this->build_component_instance();

		$expected = ['section_tipo','section_id','type','from_component_tipo'];

		$this->assertEquals(
			$expected,
			$component->test_equal_properties,
			'expected test_equal_properties mismatch'
		);
	}//end test_test_equal_properties



	/**
	* TEST_get_identifier
	* @return void
	*/
	public function test_get_identifier() {

		$component = $this->build_component_instance();

		$result = $component->get_identifier();

		$this->assertTrue(
			is_string($result),
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



	// GET DATA

	/**
	* TEST_get_data
	* @return void
	*/
	public function test_get_data() {

		$component = $this->build_component_instance();

		$result	= $component->get_data();

		$this->assertTrue(
			is_array($result) || is_null($result),
			'expected type array|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_data



	/**
	* TEST_get_list_of_values
	* @return void
	*/
	public function test_get_list_of_values() {

		$component = $this->build_component_instance();

		$result = $component->get_list_of_values(DEDALO_DATA_LANG);

		$this->assertTrue(
			is_object($result),
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_list_of_values



	/**
	* TEST_get_grid_value
	* @return void
	*/
	public function test_get_grid_value() {

		$component = $this->build_component_instance();

		$result = $component->get_grid_value();

		$this->assertInstanceOf(
			'dd_grid_cell_object',
			$result,
			'expected instance of dd_grid_cell_object'
		);
	}//end test_get_grid_value



	// ADD DATA

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
				$locator->set_from_component_tipo(self::$tipo);

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
				$locator->set_from_component_tipo(self::$tipo);

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



	// CHANGE DATA

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
			is_bool($result),
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		// null case
			$this->assertTrue(
				$component->get_data()===null,
				'expected null : ' . PHP_EOL
					. to_string($component->get_data())
			);

		// object case
			$locator_data = [
				"type" => "dd151",
				"section_id" => "1",
				"section_tipo" => "dd64",
				"from_component_tipo" => self::$tipo
			];
			$locator = (object)$locator_data;

			$data	= [$locator];
			$result	= $component->set_data($data);

			$this->assertTrue(
				count($component->get_data()) === 1,
				'expected 1 element in data array'
			);

		// restore data
			$result	= $component->set_data($old_data);

			$this->assertEquals(
				json_encode($old_data),
				json_encode($component->get_data()),
				'expected old data'
			);
	}//end test_set_data



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
				$locator1->set_from_component_tipo(self::$tipo);

			$component->set_data([$locator1]);
			$data = $component->get_data();
			$this->assertTrue(
				$data[0]->section_id==='1',
				'expected section_id 1 after first set : ' . $data[0]->section_id
			);

		// change to different locator (radio button is mono-value: only 1 at a time)
			$locator2 = new locator();
				$locator2->set_section_tipo('dd64');
				$locator2->set_section_id('2');
				$locator2->set_type(DEDALO_RELATION_TYPE_LINK);
				$locator2->set_from_component_tipo(self::$tipo);

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

		// verify only 1 element (mono-value)
			$this->assertTrue(
				count($data)===1,
				'expected 1 element (mono-value) after change : ' . count($data)
			);

		// restore original data
			$component->set_data($original_data);
			$component->save();
	}//end test_change_data



	// REMOVE DATA

	/**
	* TEST_REMOVE_LOCATOR_FROM_DATA
	* Remove a locator from component data and verify
	* @return void
	*/
	public function test_remove_locator_from_data() {

		$component = $this->build_component_instance();

		// preserve original data
			$original_data = $component->get_data();

		// set a locator
			$locator = new locator();
				$locator->set_section_tipo('dd64');
				$locator->set_section_id('1');
				$locator->set_type(DEDALO_RELATION_TYPE_LINK);
				$locator->set_from_component_tipo(self::$tipo);

			$component->set_data([$locator]);
			$data = $component->get_data();
			$this->assertTrue(
				count($data)===1,
				'expected 1 element before remove : ' . count($data)
			);

		// remove locator
			$result = $component->remove_locator_from_data($locator);
			$this->assertTrue(
				$result===true,
				'expected true on remove_locator_from_data : ' . to_string($result)
			);

		// verify data is empty
			$data = $component->get_data();
			$this->assertTrue(
				empty($data) || count($data)===0,
				'expected empty data after remove : ' . count($data ?? [])
			);

		// try removing non-existent locator
			$result2 = $component->remove_locator_from_data($locator);
			$this->assertTrue(
				$result2===false,
				'expected false on remove non-existent locator : ' . to_string($result2)
			);

		// restore original data
			$component->set_data($original_data);
			$component->save();
	}//end test_remove_locator_from_data



	/**
	* TEST_SET_DATA_NULL
	* Verify set_data with null and empty array clears data
	* @return void
	*/
	public function test_set_data_null() {

		$component = $this->build_component_instance();

		// preserve original data
			$original_data = $component->get_data();

		// set null
			$component->set_data(null);
			$check_data = $component->get_data();
			$this->assertTrue(
				$check_data===null,
				'expected null after set_data(null) : ' . to_string($check_data)
			);

		// set empty array
			$component->set_data([]);
			$check_data = $component->get_data();
			$this->assertTrue(
				$check_data===null,
				'expected null after set_data([]) : ' . to_string($check_data)
			);

		// restore original data
			$component->set_data($original_data);
			$component->save();
	}//end test_set_data_null



	// VALIDATE

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
				isset($result->from_component_tipo) && $result->from_component_tipo===self::$tipo,
				'expected from_component_tipo ' . self::$tipo . ' : ' . ($result->from_component_tipo ?? 'null')
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



	// SAVE / PERSISTENCE

	/**
	* TEST_SAVE
	* Save data and verify persistence
	* @return void
	*/
	public function test_save() {

		$component = $this->build_component_instance();

		// empty case
			$data = [];
			$component->set_data($data);
			$result = $component->save();
			$this->assertTrue(
				$result===true,
				'expected boolean true ' . PHP_EOL
					. to_string($result)
			);

		// null case
			$check_data = $component->get_data();
			$this->assertTrue(
				$check_data===null,
				'expected null : ' . PHP_EOL
					. to_string($check_data)
			);

		// data case
			$locator = new locator();
				$locator->set_section_tipo('dd64');
				$locator->set_section_id('1');
				$locator->set_type(DEDALO_RELATION_TYPE_LINK);
				$locator->set_from_component_tipo(self::$tipo);

			$component->set_data([$locator]);
			$result = $component->save();

			// check result
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
	}//end test_save



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
				$locator->set_from_component_tipo(self::$tipo);

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



	// FULL LIFECYCLE

	/**
	* TEST_FULL_LIFECYCLE
	* Complete lifecycle: create → add data → change data → remove data → save empty
	* @return void
	*/
	public function test_full_lifecycle() {

		// 1. CREATE
			$component = $this->build_component_instance();
			$this->assertTrue(
				get_class($component)==='component_radio_button',
				'step 1 create: expected class component_radio_button'
			);

		// preserve original data
			$original_data = $component->get_data();

		// 2. ADD DATA (set first locator)
			$locator1 = new locator();
				$locator1->set_section_tipo('dd64');
				$locator1->set_section_id('1');
				$locator1->set_type(DEDALO_RELATION_TYPE_LINK);
				$locator1->set_from_component_tipo(self::$tipo);

			$component->set_data([$locator1]);
			$component->save();

			$data = $component->get_data();
			$this->assertTrue(
				count($data)===1,
				'step 2 add: expected 1 element'
			);
			$this->assertTrue(
				$data[0]->section_id==='1',
				'step 2 add: expected section_id 1'
			);

		// 3. CHANGE DATA (replace with different locator)
			$locator2 = new locator();
				$locator2->set_section_tipo('dd64');
				$locator2->set_section_id('2');
				$locator2->set_type(DEDALO_RELATION_TYPE_LINK);
				$locator2->set_from_component_tipo(self::$tipo);

			$component->set_data([$locator2]);
			$component->save();

			$data = $component->get_data();
			$this->assertTrue(
				count($data)===1,
				'step 3 change: expected 1 element (mono-value)'
			);
			$this->assertTrue(
				$data[0]->section_id==='2',
				'step 3 change: expected section_id 2'
			);

		// 4. REMOVE DATA (clear all)
			$component->set_data(null);
			$component->save();

			$data = $component->get_data();
			$this->assertTrue(
				$data===null,
				'step 4 remove: expected null data'
			);

		// 5. RESTORE ORIGINAL DATA
			$component->set_data($original_data);
			$component->save();

			$fresh = $this->build_component_instance();
			$restored_data = $fresh->get_data();
			$this->assertEquals(
				json_encode($original_data),
				json_encode($restored_data),
				'step 5 restore: expected original data'
			);
	}//end test_full_lifecycle



}//end class component_radio_button_test
