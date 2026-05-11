<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_external_test extends BaseTestCase {



	public static $model		= 'component_external';
	public static $tipo		= 'test215';
	public static $section_tipo	= 'test3';



	/**
	* BUILD_COMPONENT_INSTANCE
	* @return component_external
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



	/**
	* TEST_load_data_from_remote
	* @return void
	*/
	public function test_load_data_from_remote() {

		$component = $this->build_component_instance();

		$result = $component->load_data_from_remote();

		$this->assertTrue(
			gettype($result)==='object' || gettype($result)==='NULL',
			'expected type object|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_load_data_from_remote



	/**
	* TEST_load_data_from_remote_cache
	* Verifies that second call returns cached result
	* @return void
	*/
	public function test_load_data_from_remote_cache() {

		$component = $this->build_component_instance();

		// first call
		$result1 = $component->load_data_from_remote();

		// second call should use static cache
		$result2 = $component->load_data_from_remote();

		$this->assertTrue(
			$result1 === $result2,
			'expected cached result to match first call'
		);
	}//end test_load_data_from_remote_cache



	/**
	* TEST_get_data
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

		// when data exists, it should be an array of strings
		if ($result !== null) {
			$this->assertTrue(
				is_array($result),
				'expected array when data is not null'
			);
		}
	}//end test_get_data



	/**
	* TEST_set_data
	* @return void
	*/
	public function test_set_data() {

		$component = $this->build_component_instance();

		// 1 - null case
			$data = null;
			$result = $component->set_data($data);

			$this->assertTrue(
				$result===true,
				'expected true on null set'
			);

		// 2 - array of strings case
			$data = ['value1', 'value2'];
			$result = $component->set_data($data);

			$this->assertTrue(
				$result===true,
				'expected true on array of strings set'
			);

		// 3 - array with non-string values (should be converted to string)
			$data = [123, true];
			$result = $component->set_data($data);

			$this->assertTrue(
				$result===true,
				'expected true on array with non-string values'
			);
	}//end test_set_data



	/**
	* TEST_set_data_empty
	* @return void
	*/
	public function test_set_data_empty() {

		$component = $this->build_component_instance();

		$result = $component->set_data(null);

		$this->assertTrue(
			$result===true,
			'expected true on null set'
		);
	}//end test_set_data_empty



	/**
	* TEST_get_data_returns_remote_not_local
	* component_external::get_data() loads from remote, ignoring locally set data
	* @return void
	*/
	public function test_get_data_returns_remote_not_local() {

		$component = $this->build_component_instance();

		// set local data
		$local_data = ['local_value_1', 'local_value_2'];
		$component->set_data($local_data);

		// get_data should load from remote, not return local data
		$result = $component->get_data();

		// result will be null (no remote config in test) or remote data, never the local data
		$this->assertTrue(
			$result !== $local_data,
			'expected get_data to NOT return locally set data (it loads from remote)'
		);
	}//end test_get_data_returns_remote_not_local



	/**
	* TEST_get_grid_value
	* @return void
	*/
	public function test_get_grid_value() {

		$component = $this->build_component_instance();

		$result = $component->get_grid_value();

		$this->assertTrue(
			get_class($result)==='dd_grid_cell_object',
			'expected dd_grid_cell_object'
		);
	}//end test_get_grid_value



	/**
	* TEST_get_list_value
	* @return void
	*/
	public function test_get_list_value() {

		$component = $this->build_component_instance();

		$result = $component->get_list_value();

		$this->assertTrue(
			is_array($result) || is_null($result),
			'expected array or null'
		);
	}//end test_get_list_value



	/**
	* TEST_is_empty
	* @return void
	*/
	public function test_is_empty() {

		$component = $this->build_component_instance();

		// 1 - null data_item
		$value = $component->is_empty(null);

		$this->assertTrue(
			gettype($value)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($value)
		);
		$this->assertTrue(
			$value===true,
			'expected empty on null : ' . PHP_EOL
				. to_string($value)
		);

		// 2 - empty object
		$value = $component->is_empty((object)[]);

		$this->assertTrue(
			$value===true,
			'expected empty on empty object : ' . PHP_EOL
				. to_string($value)
		);

		// 3 - object with whitespace value
		$value = $component->is_empty((object)['value'=>' ']);

		$this->assertTrue(
			gettype($value)==='boolean',
			'expected boolean : ' . PHP_EOL
				. gettype($value)
		);

		// 4 - object with non-empty value
		$value = $component->is_empty((object)['value'=>'Hello']);

		$this->assertTrue(
			$value===false,
			'expected not empty on non-empty value : ' . PHP_EOL
				. to_string($value)
		);
	}//end test_is_empty



	/**
	* TEST_get_identifier
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
			str_contains($result, self::$tipo),
			'expected identifier to contain tipo : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_identifier



	/**
	* TEST_component_instance_modes
	* @return void
	*/
	public function test_component_instance_modes() {

		$this->user_login();

		// edit mode
		$component_edit = component_common::get_instance(
			self::$model,
			self::$tipo,
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			self::$section_tipo
		);
		$this->assertTrue(
			$component_edit->get_mode()==='edit',
			'expected edit mode'
		);

		// list mode
		$component_list = component_common::get_instance(
			self::$model,
			self::$tipo,
			1,
			'list',
			DEDALO_DATA_NOLAN,
			self::$section_tipo
		);
		$this->assertTrue(
			$component_list->get_mode()==='list',
			'expected list mode'
		);

		// search mode
		$component_search = component_common::get_instance(
			self::$model,
			self::$tipo,
			1,
			'search',
			DEDALO_DATA_NOLAN,
			self::$section_tipo
		);
		$this->assertTrue(
			$component_search->get_mode()==='search',
			'expected search mode'
		);
	}//end test_component_instance_modes



	/**
	* TEST_data_from_remote_cache_static
	* Verifies the static cache $data_from_remote_cache works across instances
	* @return void
	*/
	public function test_data_from_remote_cache_static() {

		$component = $this->build_component_instance();

		// pre-populate cache manually
		$section_id		= $component->get_section_id();
		$section_tipo	= $component->section_tipo;
		$lang			= DEDALO_DATA_LANG;
		$uid			= $section_tipo . '_'. $section_id .'_'. $lang;

		$mock_data = (object)[
			'id'		=> '000123456',
			'title'		=> 'Test cached title'
		];
		component_external::$data_from_remote_cache[$uid] = $mock_data;

		// load_data_from_remote should return cached data
		$result = $component->load_data_from_remote();

		$this->assertTrue(
			$result === $mock_data,
			'expected cached data to be returned'
		);

		// clean up
		unset(component_external::$data_from_remote_cache[$uid]);
	}//end test_data_from_remote_cache_static



	/////////// ⬇︎ common methods ⬇︎ ////////////////



	/**
	* TEST_get_model
	* @return void
	*/
	public function test_get_model() {

		$component = $this->build_component_instance();

		$value = $component->get_model();

		$this->assertTrue(
			gettype($value)==='string',
				'expected value do not match:' . PHP_EOL
				.' expected type: string' . PHP_EOL
				.' type: '.gettype($value)
		);

		$this->assertTrue(
			$value==='component_external',
				'expected value do not match:' . PHP_EOL
				.' expected: component_external' . PHP_EOL
				.' value: '.to_string($value)
		);
	}//end test_get_model



	/**
	* TEST_get_properties
	* @return void
	*/
	public function test_get_properties() {

		$component = $this->build_component_instance();

		$result = $component->get_properties();

		$this->assertTrue(
			gettype($result)==='object' || gettype($result)==='NULL',
				'expected type object|null : ' . PHP_EOL
				.' type: '.gettype($result)
		);
	}//end test_get_properties



	/**
	* TEST_get_json
	* @return void
	*/
	public function test_get_json() {

		$component = $this->build_component_instance();

		$result = $component->get_json();

		$this->assertTrue(
			gettype($result)==='object',
				'expected type object : ' . PHP_EOL
				.' type: '.gettype($result)
		);

		$this->assertTrue(
			gettype($result->context)==='array',
				'expected context type array : ' . PHP_EOL
				.' type: '.gettype($result->context)
		);

		$this->assertTrue(
			gettype($result->data)==='array',
				'expected data type array : ' . PHP_EOL
				.' type: '.gettype($result->data)
		);
	}//end test_get_json



	/**
	* TEST_get_structure_context
	* @return void
	*/
	public function test_get_structure_context() {

		$component = $this->build_component_instance();

		$result = $component->get_structure_context(2, true);

		$this->assertTrue(
			gettype($result)==='object',
				'expected type object : ' . PHP_EOL
				.' type: '.gettype($result)
		);

		$this->assertTrue(
			$result->typo==='ddo',
				'expected typo ddo : ' . PHP_EOL
				.' type: '.to_string($result->typo)
		);
	}//end test_get_structure_context



	/**
	* TEST_is_translatable
	* component_external is not translatable
	* @return void
	*/
	public function test_is_translatable() {

		$component = $this->build_component_instance();

		$value = $component->is_translatable();

		$this->assertTrue(
			gettype($value)==='boolean',
				'expected type boolean : ' . PHP_EOL
				.' type: '.gettype($value)
		);
	}//end test_is_translatable



	/**
	* TEST_set_lang
	* @return void
	*/
	public function test_set_lang() {

		$component = $this->build_component_instance();

		$result = $component->set_lang('lg-spa');

		$this->assertTrue(
			gettype($result)==='boolean',
				'expected type boolean : ' . PHP_EOL
				.' type: '.gettype($result)
		);

		$this->assertTrue(
			$component->lang==='lg-spa',
				'expected lang lg-spa : ' . PHP_EOL
				.' lang: '.to_string($component->lang)
		);
	}//end test_set_lang



	/**
	* TEST_get_section_id
	* @return void
	*/
	public function test_get_section_id() {

		$component = $this->build_component_instance();

		$result = $component->get_section_id();

		$this->assertTrue(
			gettype($result)==='integer' || gettype($result)==='string',
				'expected type integer|string : ' . PHP_EOL
				.' type: '.gettype($result)
		);
	}//end test_get_section_id



	/**
	* TEST_get_data_item
	* @return void
	*/
	public function test_get_data_item() {

		$component = $this->build_component_instance();

		$result = $component->get_data_item(['my value']);

		$this->assertTrue(
			gettype($result)==='object',
				'expected type object : ' . PHP_EOL
				.' type: '.gettype($result)
		);
	}//end test_get_data_item



	/**
	* TEST_get_tools
	* @return void
	*/
	public function test_get_tools() {

		$component = $this->build_component_instance();

		$result = $component->get_tools();

		$this->assertTrue(
			gettype($result)==='array',
				'expected type array : ' . PHP_EOL
				.' type: '.gettype($result)
		);
	}//end test_get_tools



	/**
	* TEST_build_request_config
	* @return void
	*/
	public function test_build_request_config() {

		$component = $this->build_component_instance();

		$result = $component->build_request_config();

		$this->assertTrue(
			gettype($result)==='array',
				'expected type array : ' . PHP_EOL
				.' type: '.gettype($result)
		);
	}//end test_build_request_config



}//end class component_external_test
