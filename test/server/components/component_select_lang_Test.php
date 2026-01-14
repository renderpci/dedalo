<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_select_lang_test extends BaseTestCase {



	public static $model		= 'component_select_lang';
	public static $tipo			= 'test89';
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
	* TEST_GET_VALUE_CODE
	* @return void
	*/
	public function test_get_value_code() {

		$component = $this->build_component_instance();

		$result = $component->get_value_code();

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);
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

		// sample result
			// [
			//     {
			//         "component_tipo": "test101",
			//         "model": "component_filter",
			//         "name": "filter",
			//         "section_tipo": "test3"
			//     },
			//     {
			//         "component_tipo": "dd156",
			//         "model": "component_input_text",
			//         "name": "Proyecto (nombre)",
			//         "section_tipo": "dd153"
			//     }
			// ]

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

		if (property_exists($result, 'result')) {
			$this->assertTrue(
				gettype($result->result)==='array',
				'expected result to be array : ' . PHP_EOL
					. gettype($result->result)
			);
		}
	}//end test_get_ar_list_of_values



	/**
	* TEST_GET_LIST_VALUE
	* @return void
	*/
	public function test_get_list_value() {

		$component = $this->build_component_instance();

		$result = $component->get_list_value();

		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
			'expected type array|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_list_value



	/**
	* TEST_GET_MISSING_LANG
	* @return void
	*/
	public function test_get_missing_lang() {

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

		// When locator is not in list_of_values, it should return object
		// When locator is in list_of_values, it should return null
		$this->assertTrue(
			gettype($result)==='object' || gettype($result)==='NULL',
			'expected type object|null : ' . PHP_EOL
				. gettype($result)
		);

		if ($result !== null) {
			$this->assertTrue(
				property_exists($result, 'value') && property_exists($result, 'label'),
				'expected value and label properties'
			);
		}
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



}//end class component_select_lang_test
