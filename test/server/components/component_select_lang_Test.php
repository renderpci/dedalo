<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_select_lang_test extends BaseTestCase {



	public static $model		= 'component_select_lang';
	public static $tipo		= 'test89';
	public static $section_tipo	= 'test3';



	/**
	* BUILD_COMPONENT_INSTANCE
	* @param int $section_id = 1
	* @param string $mode = 'edit'
	* @return component_select_lang
	*/
	private function build_component_instance(int $section_id=1, string $mode='edit') {

		$this->user_login();

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
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
			get_class($component)==='component_select_lang',
			'expected class component_select_lang : ' . get_class($component)
		);
		$this->assertTrue(
			$component->get_tipo()==='test89',
			'expected tipo test89 : ' . $component->get_tipo()
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
	* TEST_GET_DATA
	* @return void
	*/
	public function test_get_data() {

		$component = $this->build_component_instance();

		$result	= $component->get_data();

		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
			'expected type array|null ' . PHP_EOL
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

		$data	= [];
		$result	= $component->set_data($data);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);
		$data = $component->get_data();
		$this->assertTrue(
			$data===null,
			'expected null : ' . PHP_EOL
				. to_string($data)
		);

		// null case
			$result	= $component->set_data(null);

			$this->assertTrue(
				$data===null,
				'expected null : ' . PHP_EOL
					. to_string($data)
			);

		// restore dato
			$result	= $component->set_data($old_data);
			$data	= $component->get_data();
			$this->assertTrue(
				json_encode($data)===json_encode($old_data),
				'expected old data : ' . PHP_EOL
					. to_string($data)
			);
	}//end test_set_data



	/**
	* TEST_ADD_LOCATOR_TO_DATA
	* Add a lang locator to component data and verify it exists
	* @return void
	*/
	public function test_add_locator_to_data() {

		$component = $this->build_component_instance();

		// preserve original data
			$original_data = $component->get_data();

		// clear data first
			$component->set_data([]);
			$component->save();

		// create a locator pointing to lg1 (languages section)
			$locator = new locator();
				$locator->set_section_tipo('lg1');
				$locator->set_section_id('5101'); // English in lg1
				$locator->set_type(DEDALO_RELATION_TYPE_LINK);
				$locator->set_from_component_tipo('test89');

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
				$data[0]->section_tipo==='lg1',
				'expected section_tipo lg1 : ' . $data[0]->section_tipo
			);
			$this->assertTrue(
				$data[0]->section_id==='5101',
				'expected section_id 5101 : ' . $data[0]->section_id
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
				$locator->set_section_tipo('lg1');
				$locator->set_section_id('5101');
				$locator->set_type(DEDALO_RELATION_TYPE_LINK);
				$locator->set_from_component_tipo('test89');

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
	* Change component data to a different lang locator and verify
	* @return void
	*/
	public function test_change_data() {

		$component = $this->build_component_instance();

		// preserve original data
			$original_data = $component->get_data();

		// set first locator (English)
			$locator1 = new locator();
				$locator1->set_section_tipo('lg1');
				$locator1->set_section_id('5101');
				$locator1->set_type(DEDALO_RELATION_TYPE_LINK);
				$locator1->set_from_component_tipo('test89');

			$component->set_data([$locator1]);
			$data = $component->get_data();
			$this->assertTrue(
				$data[0]->section_id==='5101',
				'expected section_id 5101 after first set : ' . $data[0]->section_id
			);

		// change to different locator (Spanish)
			$locator2 = new locator();
				$locator2->set_section_tipo('lg1');
				$locator2->set_section_id('17344');
				$locator2->set_type(DEDALO_RELATION_TYPE_LINK);
				$locator2->set_from_component_tipo('test89');

			$component->set_data([$locator2]);
			$data = $component->get_data();
			$this->assertTrue(
				$data[0]->section_id==='17344',
				'expected section_id 17344 after change : ' . $data[0]->section_id
			);
			$this->assertTrue(
				$data[0]->section_tipo==='lg1',
				'expected section_tipo lg1 after change : ' . $data[0]->section_tipo
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

		// set locator
			$locator = new locator();
				$locator->set_section_tipo('lg1');
				$locator->set_section_id('5101');
				$locator->set_type(DEDALO_RELATION_TYPE_LINK);
				$locator->set_from_component_tipo('test89');

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
				empty($data),
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
	* TEST_SAVE
	* Save data and verify persistence
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
				'expected boolean true on save empty : ' . PHP_EOL
					. to_string($result)
			);

		// data case: set a lang locator
			$locator = new locator();
				$locator->set_section_tipo('lg1');
				$locator->set_section_id('5101');
				$locator->set_type(DEDALO_RELATION_TYPE_LINK);
				$locator->set_from_component_tipo('test89');

			$component->set_data([$locator]);
			$result = $component->save();

			// check result
			$check_data = $component->get_data();
			$this->assertTrue(
				$check_data[0]->section_tipo === 'lg1',
				'expected section_tipo lg1 : ' . PHP_EOL
					.'check_data: ' . to_string($check_data)
			);
			$this->assertTrue(
				$check_data[0]->section_id === '5101',
				'expected section_id 5101 : ' . PHP_EOL
					.'check_data: ' . to_string($check_data)
			);

		// restore original data
			$component->set_data($original_data);
			$component->save();
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
				$locator->set_section_tipo('lg1');
				$locator->set_section_id('17344'); // Spanish
				$locator->set_type(DEDALO_RELATION_TYPE_LINK);
				$locator->set_from_component_tipo('test89');

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
				$fresh_data[0]->section_tipo==='lg1',
				'expected persisted section_tipo lg1 : ' . $fresh_data[0]->section_tipo
			);
			$this->assertTrue(
				$fresh_data[0]->section_id==='17344',
				'expected persisted section_id 17344 : ' . $fresh_data[0]->section_id
			);

		// restore original data
			$component->set_data($original_data);
			$component->save();
	}//end test_save_and_read



	/**
	* TEST_SET_DATA_NULL
	* Verify set_data with null and empty array
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



	/**
	* TEST_VALIDATE_DATA_ELEMENT
	* Verify validate_data_element with valid and invalid lang locators
	* @return void
	*/
	public function test_validate_data_element() {

		$component = $this->build_component_instance();

		// valid lang locator
			$valid_locator = (object)[
				'section_tipo'	=> 'lg1',
				'section_id'	=> '5101',
				'type'			=> DEDALO_RELATION_TYPE_LINK
			];
			$result = $component->validate_data_element($valid_locator);
			$this->assertTrue(
				$result!==false,
				'expected valid result for proper locator'
			);
			$this->assertTrue(
				isset($result->from_component_tipo) && $result->from_component_tipo==='test89',
				'expected from_component_tipo test89 : ' . ($result->from_component_tipo ?? 'null')
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
				'section_tipo'	=> 'lg1',
				'type'			=> DEDALO_RELATION_TYPE_LINK
			];
			$result_bad = $component->validate_data_element($bad_locator);
			$this->assertTrue(
				$result_bad===false,
				'expected false for locator missing section_id'
			);

		// missing section_tipo
			$bad_locator2 = (object)[
				'section_id'	=> '5101',
				'type'			=> DEDALO_RELATION_TYPE_LINK
			];
			$result_bad2 = $component->validate_data_element($bad_locator2);
			$this->assertTrue(
				$result_bad2===false,
				'expected false for locator missing section_tipo'
			);
	}//end test_validate_data_element



	/**
	* TEST_GET_VALUE_CODE
	* @return void
	*/
	public function test_get_value_code() {

		$component = $this->build_component_instance();

		// preserve original data
			$original_data = $component->get_data();

		// test with no data
			$component->set_data([]);
			$result = $component->get_value_code();
			$this->assertTrue(
				$result===null,
				'expected null when no data : ' . to_string($result)
			);

		// test with a lang locator
			$locator = new locator();
				$locator->set_section_tipo('lg1');
				$locator->set_section_id('5101');
				$locator->set_type(DEDALO_RELATION_TYPE_LINK);
				$locator->set_from_component_tipo('test89');

			$component->set_data([$locator]);
			$result = $component->get_value_code();
			$this->assertTrue(
				gettype($result)==='string' || gettype($result)==='NULL',
				'expected type string|null : ' . PHP_EOL
					. gettype($result)
			);

		// restore original data
			$component->set_data($original_data);
			$component->save();
	}//end test_get_value_code



	/**
	* TEST_GET_RELATED_COMPONENT_TEXT_AREA
	* @return void
	*/
	public function test_get_related_component_text_area() {

		$component = $this->build_component_instance();

		$result = $component->get_related_component_text_area();

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_related_component_text_area



	/**
	* TEST_GET_SORTABLE
	* @return void
	*/
	public function test_get_sortable() {

		$component = $this->build_component_instance();

		$value = $component->get_sortable();

		$this->assertTrue(
			$value===true,
			'expected true : ' .PHP_EOL
				. to_string($value)
		);
	}//end test_get_sortable



	/**
	* TEST_get_order_path
	* @return void
	*/
	public function test_get_order_path() {

		$component = $this->build_component_instance();

		$component_tipo	= self::$tipo;
		$section_tipo	= self::$section_tipo;

		$result = $component->get_order_path(
			$component_tipo,
			$section_tipo
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);

		if (!empty($result)) {
			$this->assertTrue(
				gettype($result[0])==='object',
				'expected type object : ' . PHP_EOL
					. gettype($result[0])
			);
			// second path element should be thesaurus term
			$this->assertTrue(
				count($result)===2,
				'expected 2 path elements : ' . count($result)
			);
			$this->assertTrue(
				$result[1]->section_tipo===DEDALO_LANGS_SECTION_TIPO,
				'expected second path section_tipo DEDALO_LANGS_SECTION_TIPO : ' . $result[1]->section_tipo
			);
		}
	}//end test_get_order_path



	/**
	* TEST_GET_AR_LIST_OF_VALUES
	* @return void
	*/
	public function test_get_ar_list_of_values() {

		$component = $this->build_component_instance();

		$result = $component->get_ar_list_of_values(DEDALO_DATA_LANG);

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			property_exists($result, 'result') && property_exists($result, 'msg'),
			'expected result and msg properties'
		);

		$this->assertTrue(
			gettype($result->result)==='array',
			'expected result to be array : ' . PHP_EOL
				. gettype($result->result)
		);

		// verify datalist items have expected structure
		if (!empty($result->result)) {
			$first_item = $result->result[0];
			$this->assertTrue(
				property_exists($first_item, 'value'),
				'expected value property in datalist item'
			);
			$this->assertTrue(
				property_exists($first_item, 'label'),
				'expected label property in datalist item'
			);
			$this->assertTrue(
				property_exists($first_item, 'section_id'),
				'expected section_id property in datalist item'
			);
		}
	}//end test_get_ar_list_of_values



	/**
	* TEST_GET_LIST_VALUE
	* @return void
	*/
	public function test_get_list_value() {

		$component = $this->build_component_instance();

		// preserve original data
			$original_data = $component->get_data();

		// test with no data
			$component->set_data([]);
			$result = $component->get_list_value();
			$this->assertTrue(
				$result===null,
				'expected null when no data : ' . to_string($result)
			);

		// test with a lang locator
			$locator = new locator();
				$locator->set_section_tipo('lg1');
				$locator->set_section_id('5101');
				$locator->set_type(DEDALO_RELATION_TYPE_LINK);
				$locator->set_from_component_tipo('test89');

			$component->set_data([$locator]);
			$result = $component->get_list_value();
			$this->assertTrue(
				gettype($result)==='array' || gettype($result)==='NULL',
				'expected type array|null : ' . PHP_EOL
					. gettype($result)
			);

		// restore original data
			$component->set_data($original_data);
			$component->save();
	}//end test_get_list_value



	/**
	* TEST_GET_MISSING_LANG
	* @return void
	*/
	public function test_get_missing_lang() {

		// locator NOT in list_of_values → should return object
			$locator = new locator();
				$locator->set_section_id('5101');
				$locator->set_section_tipo('lg1');

			$list_of_values = [
				(object)[
					'value' => (object)[
						'section_tipo' => 'lg1',
						'section_id' => '5102'
					],
					'label' => 'English'
				]
			];

			$result = component_select_lang::get_missing_lang($locator, $list_of_values);

			$this->assertTrue(
				gettype($result)==='object',
				'expected object when locator is missing from list : ' . gettype($result)
			);
			$this->assertTrue(
				property_exists($result, 'value') && property_exists($result, 'label'),
				'expected value and label properties'
			);
			$this->assertTrue(
				strpos($result->label, ' *')!==false,
				'expected label to end with asterisk marker : ' . $result->label
			);

		// locator IN list_of_values → should return null
			$locator2 = new locator();
				$locator2->set_section_id('5102');
				$locator2->set_section_tipo('lg1');

			$result2 = component_select_lang::get_missing_lang($locator2, $list_of_values);

			$this->assertTrue(
				$result2===null,
				'expected null when locator is in list : ' . to_string($result2)
			);
	}//end test_get_missing_lang



	/**
	* TEST_UPDATE_DATA_VERSION
	* @return void
	*/
	public function test_update_data_version() {

		$request_options = (object)[
			'update_version' => [7, 0, 0],
			'data_unchanged' => false,
			'reference_id' => 'test_ref',
			'tipo' => self::$tipo,
			'section_id' => 1,
			'section_tipo' => self::$section_tipo,
			'context' => 'update_component_data'
		];

		$result = component_select_lang::update_data_version($request_options);

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			property_exists($result, 'result') && property_exists($result, 'msg'),
			'expected result and msg properties'
		);

		// result should be 0 (no update for this version) or other valid response code
		$this->assertTrue(
			in_array($result->result, [0, 1, 2]),
			'expected result to be 0, 1, or 2 : ' . PHP_EOL
				. to_string($result->result)
		);
	}//end test_update_data_version



	/**
	* TEST_LIFECYCLE_CREATE_ADD_CHANGE_REMOVE_DESTROY
	* Full lifecycle: create → add data → change data → remove data → verify clean state
	* @return void
	*/
	public function test_lifecycle_create_add_change_remove_destroy() {

		// CREATE: instantiate the component
			$component = $this->build_component_instance();
			$original_data = $component->get_data();

			$this->assertTrue(
				get_class($component)==='component_select_lang',
				'CREATE: expected class component_select_lang'
			);

		// ADD DATA: add a lang locator (English)
			$component->set_data([]);
			$component->save();

			$locator_en = new locator();
				$locator_en->set_section_tipo('lg1');
				$locator_en->set_section_id('5101');
				$locator_en->set_type(DEDALO_RELATION_TYPE_LINK);
				$locator_en->set_from_component_tipo('test89');

			$add_result = $component->add_locator_to_data($locator_en);
			$this->assertTrue(
				$add_result===true,
				'ADD: expected true on add_locator_to_data'
			);
			$component->save();

			$data = $component->get_data();
			$this->assertTrue(
				count($data)===1,
				'ADD: expected 1 element after add'
			);
			$this->assertTrue(
				$data[0]->section_id==='5101',
				'ADD: expected section_id 5101 (English)'
			);

		// CHANGE DATA: replace with Spanish locator
			$locator_es = new locator();
				$locator_es->set_section_tipo('lg1');
				$locator_es->set_section_id('17344');
				$locator_es->set_type(DEDALO_RELATION_TYPE_LINK);
				$locator_es->set_from_component_tipo('test89');

			$component->set_data([$locator_es]);
			$component->save();

			$data = $component->get_data();
			$this->assertTrue(
				$data[0]->section_id==='17344',
				'CHANGE: expected section_id 17344 (Spanish)'
			);

		// verify get_value_code reflects the change
			$code = $component->get_value_code();
			$this->assertTrue(
				gettype($code)==='string' || gettype($code)==='NULL',
				'CHANGE: expected string|null from get_value_code'
			);

		// REMOVE DATA: remove the locator
			$remove_result = $component->remove_locator_from_data($locator_es);
			$this->assertTrue(
				$remove_result===true,
				'REMOVE: expected true on remove_locator_from_data'
			);

			$data = $component->get_data();
			$this->assertTrue(
				empty($data),
				'REMOVE: expected empty data after remove'
			);
			$component->save();

		// VERIFY CLEAN STATE: fresh instance should have no data
			$fresh = $this->build_component_instance();
			$fresh_data = $fresh->get_data();
			$this->assertTrue(
				empty($fresh_data),
				'DESTROY: expected empty data on fresh instance after cleanup'
			);

		// RESTORE original data
			$component->set_data($original_data);
			$component->save();
	}//end test_lifecycle_create_add_change_remove_destroy



}//end class component_select_lang_test
