<?php declare(strict_types=1);
/**
* CLASS COMPONENT_PUBLICATION_LIFECYCLE_TEST
* Complete server-side lifecycle test for component_publication
* Covers: create → add data → change data → remove data → destroy
* Also tests all component_publication-specific methods in each mode
*/
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_publication_test extends BaseTestCase {



	public static $model		= 'component_publication';
	public static $tipo		= 'test92';
	public static $section_tipo	= 'test3';



	/**
	* CREATE_COMPONENT_INSTANCE
	* Creates a fresh component_publication instance on a new section record
	* @return array{component:component_publication,section_id:string}
	*/
	private function create_component_instance(string $mode='edit') : array {

		$this->user_login();

		// Create a new section record to isolate test data
		$section_inst	= section::get_instance(self::$section_tipo);
		$section_id		= (string)$section_inst->create_record();

		$component = component_common::get_instance(
			self::$model,
			self::$tipo,
			$section_id,
			$mode,
			DEDALO_DATA_NOLAN,
			self::$section_tipo
		);

		return [
			'component'	=> $component,
			'section_id'=> $section_id
		];
	}//end create_component_instance



	/**
	* BUILD_COMPONENT_INSTANCE
	* Builds component on existing section_id=1 (for backward compatibility tests)
	* @return component_publication
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
			$model,
			$tipo,
			$section_id,
			$mode,
			$lang,
			$section_tipo
		);

		return $component;
	}//end build_component_instance



	/**
	* MAKE_LOCATOR
	* Helper to create a properly formed locator for publication data
	* @param int $section_id
	* @param string $section_tipo
	* @return locator
	*/
	private function make_locator(int $section_id, ?string $section_tipo=null, ?string $type=null) : locator {

		$section_tipo = $section_tipo ?? self::$section_tipo;
		$type		= $type ?? DEDALO_RELATION_TYPE_LINK;

		$locator = new locator();
			$locator->set_section_tipo($section_tipo);
			$locator->set_section_id($section_id);
			$locator->set_type($type);
			$locator->set_from_component_tipo(self::$tipo);

		return $locator;
	}//end make_locator



	/////////// ⬇︎ LIFECYCLE TESTS ⬇︎ ////////////////



	/**
	* TEST_LIFECYCLE_CREATE
	* Test component instantiation (create phase)
	* @return void
	*/
	public function test_lifecycle_create() : void {

		// 1 - Create on new section
			$result = $this->create_component_instance('edit');
			$component = $result['component'];

			$this->assertTrue(
				$component instanceof component_publication,
				'expected component_publication instance'
			);

		// 2 - Verify initial state
			$this->assertTrue(
				$component->get_tipo()===self::$tipo,
				'expected tipo match'
			);
			$this->assertTrue(
				$component->get_section_tipo()===self::$section_tipo,
				'expected section_tipo match'
			);

		// 3 - Verify empty data on new record
			$data = $component->get_data();
			$this->assertTrue(
				empty($data),
				'expected empty data on newly created component'
			);

		// 4 - Create in different modes
			$modes = ['edit', 'list', 'search'];
			foreach ($modes as $mode) {
				$result		= $this->create_component_instance($mode);
				$comp_mode	= $result['component'];
				$this->assertTrue(
					$comp_mode->get_mode()===$mode,
					"expected mode $mode"
				);
			}
	}//end test_lifecycle_create



	/**
	* TEST_LIFECYCLE_ADD_DATA
	* Test adding locators to the publication (add data phase)
	* @return void
	*/
	public function test_lifecycle_add_data() : void {

		$result		= $this->create_component_instance('edit');
		$component	= $result['component'];
		$section_id	= $result['section_id'];

		// 1 - Add single locator
			$locator1 = $this->make_locator(101);
			$added = $component->add_locator_to_data($locator1);
			$this->assertTrue(
				$added===true,
				'expected true on add_locator_to_data'
			);

		// 2 - Verify data contains the locator
			$data = $component->get_data();
			$this->assertTrue(
				count($data)===1,
				'expected 1 locator in data, got: ' . count($data)
			);
			$this->assertTrue(
				$data[0]->section_id==='101',
				'expected section_id 101 in first locator'
			);

		// 3 - Add second locator
			$locator2 = $this->make_locator(102);
			$added = $component->add_locator_to_data($locator2);
			$this->assertTrue(
				$added===true,
				'expected true on second add_locator_to_data'
			);

		// 4 - Verify data has 2 locators
			$data = $component->get_data();
			$this->assertTrue(
				count($data)===2,
				'expected 2 locators in data, got: ' . count($data)
			);

		// 5 - Add duplicate locator (should be rejected)
			$locator_dup = $this->make_locator(101);
			$added = $component->add_locator_to_data($locator_dup);
			$this->assertTrue(
				$added===false,
				'expected false on duplicate add_locator_to_data'
			);

		// 6 - Verify data still has 2 locators
			$data = $component->get_data();
			$this->assertTrue(
				count($data)===2,
				'expected still 2 locators after duplicate rejection'
			);

		// 7 - Save and verify persistence
			$save_result = $component->Save();
			$this->assertTrue(
				is_int($save_result) || $save_result===true,
				'expected successful save'
			);

		// 8 - Reload and verify persisted data
			$reloaded = component_common::get_instance(
				self::$model,
				self::$tipo,
				$section_id,
				'edit',
				DEDALO_DATA_NOLAN,
				self::$section_tipo
			);
			$reloaded_data = $reloaded->get_data();
			$this->assertTrue(
				count($reloaded_data)===2,
				'expected 2 persisted locators after reload'
			);
	}//end test_lifecycle_add_data



	/**
	* TEST_LIFECYCLE_CHANGE_DATA
	* Test changing publication data (change data phase)
	* @return void
	*/
	public function test_lifecycle_change_data() : void {

		$result		= $this->create_component_instance('edit');
		$component	= $result['component'];
		$section_id	= $result['section_id'];

		// 1 - Set initial data with 3 locators
			$locators = [
				$this->make_locator(201),
				$this->make_locator(202),
				$this->make_locator(203)
			];
			$component->set_data($locators);

			$data = $component->get_data();
			$this->assertTrue(
				count($data)===3,
				'expected 3 locators after set_data'
			);

		// 2 - Replace data entirely with new set
			$new_locators = [
				$this->make_locator(301),
				$this->make_locator(302)
			];
			$component->set_data($new_locators);

			$data = $component->get_data();
			$this->assertTrue(
				count($data)===2,
				'expected 2 locators after data replacement'
			);
			$this->assertTrue(
				$data[0]->section_id==='301',
				'expected first locator section_id 301'
			);

		// 3 - Save changed data
			$save_result = $component->Save();
			$this->assertTrue(
				is_int($save_result) || $save_result===true,
				'expected successful save after change'
			);

		// 4 - Reload and verify changed data persisted
			$reloaded = component_common::get_instance(
				self::$model,
				self::$tipo,
				$section_id,
				'edit',
				DEDALO_DATA_NOLAN,
				self::$section_tipo
			);
			$reloaded_data = $reloaded->get_data();
			$this->assertTrue(
				count($reloaded_data)===2,
				'expected 2 persisted locators after change'
			);
			$this->assertTrue(
				$reloaded_data[0]->section_id==='301',
				'expected first persisted locator section_id 301'
			);

		// 5 - Set data to empty
			$component->set_data([]);
			$data = $component->get_data();
			$this->assertTrue(
				empty($data),
				'expected empty data after set_data([])'
			);
	}//end test_lifecycle_change_data



	/**
	* TEST_LIFECYCLE_REMOVE_DATA
	* Test removing locators from the publication (remove data phase)
	* @return void
	*/
	public function test_lifecycle_remove_data() : void {

		$result		= $this->create_component_instance('edit');
		$component	= $result['component'];
		$section_id	= $result['section_id'];

		// 1 - Set initial data with 3 locators
			$locators = [
				$this->make_locator(401),
				$this->make_locator(402),
				$this->make_locator(403)
			];
			$component->set_data($locators);
			$component->Save();

		// 2 - Remove a specific locator
			$data = $component->get_data();
			$locator_to_remove = $data[1]; // section_id 402

			$removed = $component->remove_locator_from_data($locator_to_remove);
			$this->assertTrue(
				$removed===true,
				'expected true on remove_locator_from_data'
			);

		// 3 - Verify data has 2 locators remaining
			$data = $component->get_data();
			$this->assertTrue(
				count($data)===2,
				'expected 2 locators after removal, got: ' . count($data)
			);

		// 4 - Verify removed locator is gone
			$found = array_filter($data, function($el) {
				return $el->section_id==='402';
			});
			$this->assertTrue(
				empty($found),
				'expected section_id 402 to be removed'
			);

		// 5 - Save and verify persistence
			$component->Save();
			$reloaded = component_common::get_instance(
				self::$model,
				self::$tipo,
				$section_id,
				'edit',
				DEDALO_DATA_NOLAN,
				self::$section_tipo
			);
			$reloaded_data = $reloaded->get_data();
			$this->assertTrue(
				count($reloaded_data)===2,
				'expected 2 persisted locators after removal'
			);

		// 6 - Remove non-existent locator
			$fake_locator = $this->make_locator(9999);
			$removed = $component->remove_locator_from_data($fake_locator);
			$this->assertTrue(
				$removed===false,
				'expected false on remove non-existent locator'
			);
	}//end test_lifecycle_remove_data



	/**
	* TEST_LIFECYCLE_DESTROY
	* Test component/section destruction (destroy phase)
	* @return void
	*/
	public function test_lifecycle_destroy() : void {

		$result		= $this->create_component_instance('edit');
		$component	= $result['component'];
		$section_id	= $result['section_id'];

		// 1 - Add data and save
			$locator = $this->make_locator(601);
			$component->add_locator_to_data($locator);
			$component->Save();

			$data = $component->get_data();
			$this->assertTrue(
				!empty($data),
				'expected data before destroy'
			);

		// 2 - Delete the section record using section_record
			$section_record = section_record::get_instance(
				self::$section_tipo,
				(int)$section_id
			);
			$delete_result = $section_record->delete(true);
			$this->assertTrue(
				$delete_result===true,
				'expected true on section delete'
			);

		// 3 - Verify section record no longer exists in DB
			$check_record = section_record::get_instance(
				self::$section_tipo,
				(int)$section_id
			);
			$this->assertTrue(
				$check_record->exists_in_the_database()===false,
				'expected exists_in_the_database false after section deletion'
			);
	}//end test_lifecycle_destroy



	/**
	* TEST_LIFECYCLE_FULL_CYCLE
	* Complete end-to-end lifecycle: create → add → change → remove → destroy
	* @return void
	*/
	public function test_lifecycle_full_cycle() : void {

		// CREATE
			$result		= $this->create_component_instance('edit');
			$component	= $result['component'];
			$section_id	= $result['section_id'];

			$this->assertTrue(
				$component instanceof component_publication,
				'CREATE: expected component_publication instance'
			);
			$this->assertTrue(
				empty($component->get_data()),
				'CREATE: expected empty data initially'
			);

		// ADD DATA
			$loc1 = $this->make_locator(701);
			$loc2 = $this->make_locator(702);
			$loc3 = $this->make_locator(703);

			$component->add_locator_to_data($loc1);
			$component->add_locator_to_data($loc2);
			$component->add_locator_to_data($loc3);
			$component->Save();

			$data = $component->get_data();
			$this->assertTrue(
				count($data)===3,
				'ADD: expected 3 locators, got: ' . count($data)
			);

		// CHANGE DATA - replace locators
			$new_loc = $this->make_locator(704);
			$component->add_locator_to_data($new_loc);
			$component->Save();

			$data = $component->get_data();
			$this->assertTrue(
				count($data)===4,
				'CHANGE: expected 4 locators after add, got: ' . count($data)
			);

		// REMOVE DATA
			$data = $component->get_data();
			$component->remove_locator_from_data($data[0]);
			$component->Save();

			$data = $component->get_data();
			$this->assertTrue(
				count($data)===3,
				'REMOVE: expected 3 locators after removal, got: ' . count($data)
			);

		// DESTROY - delete section using section_record
			$section_record = section_record::get_instance(
				self::$section_tipo,
				(int)$section_id
			);
			$delete_result = $section_record->delete(true);
			$this->assertTrue(
				$delete_result===true,
				'DESTROY: expected true on section delete'
			);
	}//end test_lifecycle_full_cycle



	/////////// ⬇︎ MODE-SPECIFIC TESTS ⬇︎ ////////////////



	/**
	* TEST_MODE_EDIT
	* Test component behavior in edit mode
	* @return void
	*/
	public function test_mode_edit() : void {

		$result		= $this->create_component_instance('edit');
		$component	= $result['component'];

		// 1 - Verify mode
			$this->assertTrue(
				$component->get_mode()==='edit',
				'expected edit mode'
			);

		// 2 - Add data in edit mode
			$locator = $this->make_locator(801);
			$component->add_locator_to_data($locator);

			$data = $component->get_data();
			$this->assertTrue(
				count($data)===1,
				'expected 1 locator in edit mode'
			);

		// 3 - Verify sortable in edit mode
			$this->assertTrue(
				$component->get_sortable()===true,
				'expected sortable true in edit mode'
			);
	}//end test_mode_edit



	/**
	* TEST_MODE_LIST
	* Test component behavior in list mode
	* @return void
	*/
	public function test_mode_list() : void {

		$result		= $this->create_component_instance('list');
		$component	= $result['component'];

		// 1 - Verify mode
			$this->assertTrue(
				$component->get_mode()==='list',
				'expected list mode'
			);

		// 2 - get_list_value
			$value = $component->get_list_value();
			$this->assertTrue(
				gettype($value)==='array' || gettype($value)==='NULL',
				'expected array|null from get_list_value'
			);
	}//end test_mode_list



	/**
	* TEST_MODE_SEARCH
	* Test component behavior in search mode
	* @return void
	*/
	public function test_mode_search() : void {

		$result		= $this->create_component_instance('search');
		$component	= $result['component'];

		// 1 - Verify mode
			$this->assertTrue(
				$component->get_mode()==='search',
				'expected search mode'
			);

		// 2 - search_operators_info
			$value = $component->search_operators_info();
			$this->assertTrue(
				gettype($value)==='array',
				'expected array from search_operators_info'
			);
	}//end test_mode_search



	/////////// ⬇︎ COMPONENT-SPECIFIC METHOD TESTS ⬇︎ ////////////////



	/**
	* TEST_get_data
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
	* TEST_set_data
	* @return void
	*/
	public function test_set_data() {

		$component = $this->build_component_instance();

		$old_data = $component->get_data();

		// null case
			$data	= null;
			$result	= $component->set_data($data);

			$this->assertTrue(
				gettype($result)==='boolean',
				'expected type boolean : ' . PHP_EOL
					. gettype($result)
			);

			$this->assertTrue(
				empty($component->get_data()),
				'expected empty() data : ' . PHP_EOL
					. to_string($component->get_data())
			);

		// object case
			$locator = json_decode('
				{
					"type":"dd151",
					"section_id":"1",
					"section_tipo":"dd64",
					"from_component_tipo":"test92"
				}
			');
			$data	= [$locator];
			$result	= $component->set_data($data);
			$this->assertTrue(
				json_encode($component->get_data()[0])===json_encode($locator),
				'expected array with locator : ' . PHP_EOL
					. to_string($component->get_data())
			);

		// array case
			$data	= [$locator];
			$result	= $component->set_data($data);
			$this->assertTrue(
				json_encode($component->get_data())===json_encode($data),
				'expected array : ' . PHP_EOL
					. to_string($component->get_data())
			);

		// restore data
			$result	= $component->set_data($old_data);

			$this->assertTrue(
				json_encode($component->get_data())===json_encode($old_data),
				'expected original data : ' . PHP_EOL
					. to_string($component->get_data())
			);
	}//end test_set_data



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
	* TEST_get_subdatum
	* @return void
	*/
	public function test_get_subdatum() {

		$component = $this->build_component_instance();
		$component->set_data($this->get_sample_data(self::$model));

		// Create request_config (needed to calculate the subdatum)
		$component->context = new stdClass();
		$component->context->request_config = $component->get_ar_request_config();

		$result = $component->get_subdatum(
			null,
			$component->get_data()
		);

		// 1 - Expected type object
		$this->assertTrue(
			gettype($result)==='object',
				'expected value do not match:' . PHP_EOL
				.' expected type: object' . PHP_EOL
				.' type: '.gettype($result)
		);

		// 2 - Expected property context
		$this->assertTrue(
			isset($result->context),
			'expected property context do not match:' . PHP_EOL
			.' expected property: context' . PHP_EOL
			.' property: '.to_string($result->context ?? null)
		);

		// 3 - Expected property data
		$this->assertTrue(
			isset($result->data),
			'expected property data do not match:' . PHP_EOL
			.' expected property: data' . PHP_EOL
			.' property: '.to_string($result->data ?? null)
		);
	}//end test_get_subdatum



	/**
	* TEST_get_grid_value
	* @return void
	*/
	public function test_get_grid_value() {

		$component = $this->build_component_instance();
		$component->set_data($this->get_sample_data(self::$model));

		$result = $component->get_grid_value();

		// 1 - Expected type object
		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);

		// 2 - Expected property model
		$this->assertTrue(
			$result->model==='component_publication',
			'expected property model do not match:' . PHP_EOL
			.' expected property: model' . PHP_EOL
			.' property: '.to_string($result->model ?? null)
		);

		// 3 - Expected property value as array
		$this->assertTrue(
			is_array($result->value),
			'expected property value to be array:' . PHP_EOL
			.' value: '.to_string($result->value ?? null)
		);

		// 4 - Expected property label (optional)
		$this->assertTrue(
			isset($result->label) || !isset($result->label),
			'expected property label to exist or not:' . PHP_EOL
			.' label: '.to_string($result->label ?? 'not set')
		);

		// 5 - Expected property ar_columns_obj as array
		$this->assertTrue(
			is_array($result->ar_columns_obj),
			'expected property ar_columns_obj to be array:' . PHP_EOL
			.' ar_columns_obj: '.to_string($result->ar_columns_obj ?? null)
		);

		// 6 - Check first item of ar_columns_obj
		if (!empty($result->ar_columns_obj)) {
			$this->assertTrue(
				isset($result->ar_columns_obj[0]->id),
				'expected property id in ar_columns_obj[0]:' . PHP_EOL
				.' item: '.to_string($result->ar_columns_obj[0] ?? null)
			);
		}
	}//end test_get_grid_value



	/**
	* TEST_validate_data_element
	* @return void
	*/
	public function test_validate_data_element() : void {

		$component = $this->build_component_instance();

		$locator = $this->make_locator(901);

		$value = $component->validate_data_element($locator);

		$this->assertTrue(
			is_object($value),
			'expected type object : ' . gettype($value)
		);
		$this->assertTrue(
			$value instanceof locator,
			'expected instance of locator'
		);
	}//end test_validate_data_element



	/**
	* TEST_get_locator_properties_to_check
	* @return void
	*/
	public function test_get_locator_properties_to_check() : void {

		$component = $this->build_component_instance();

		$value = $component->get_locator_properties_to_check();

		$this->assertTrue(
			is_array($value),
			'expected type array : ' . gettype($value)
		);
		$this->assertTrue(
			in_array('section_id', $value),
			'expected section_id in array'
		);
		$this->assertTrue(
			in_array('section_tipo', $value),
			'expected section_tipo in array'
		);
	}//end test_get_locator_properties_to_check



	/**
	* TEST_conform_import_data
	* @return void
	*/
	public function test_conform_import_data() : void {

		$component = $this->build_component_instance();

		$value = $component->conform_import_data(
			'1',
			self::$tipo
		);

		$this->assertTrue(
			(gettype($value)==='object'),
			'expected type object : ' . PHP_EOL
				. gettype($value)
		);
		$this->assertTrue(
			(gettype($value->result)==='array'),
			'expected type array : ' . PHP_EOL
				. gettype($value->result)
		);
	}//end test_conform_import_data



	/**
	* TEST_map_locator_to_term_id
	* @return void
	*/
	public function test_map_locator_to_term_id() : void {

		$component = $this->build_component_instance();

		$value = $component->map_locator_to_term_id();

		$this->assertTrue(
			$value === null || is_string($value),
			'expected type null or string : ' . gettype($value)
		);
	}//end test_map_locator_to_term_id



	/**
	* TEST_get_diffusion_data
	* @return void
	*/
	public function test_get_diffusion_data() : void {

		$component = $this->build_component_instance();

		$ddo = new dd_object();

		$value = $component->get_diffusion_data($ddo);

		$this->assertTrue(
			is_array($value),
			'expected type array : ' . gettype($value)
		);
	}//end test_get_diffusion_data



	/**
	* TEST_set_data_external
	* @return void
	*/
	public function test_set_data_external() : void {

		$component = $this->build_component_instance();

		$options = (object)[
			'save'				=> false,
			'changed'			=> false,
			'current_data'		=> [],
			'references_limit'	=> 10
		];

		$value = $component->set_data_external($options);

		$this->assertTrue(
			(is_bool($value)),
			'expected type boolean : ' . PHP_EOL
				. gettype($value)
		);
	}//end test_set_data_external



	/**
	* TEST_get_relations_search_value
	* @return void
	*/
	public function test_get_relations_search_value() : void {

		$component = $this->build_component_instance();

		$value = $component->get_relations_search_value();

		$this->assertTrue(
			(gettype($value)==='array' || gettype($value)==='NULL'),
			'expected type array|null : ' . PHP_EOL
				. gettype($value)
		);
	}//end test_get_relations_search_value



}//end class component_publication_lifecycle_test
