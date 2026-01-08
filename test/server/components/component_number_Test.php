<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_number_test extends BaseTestCase {



	public static $model		= 'component_number';
	public static $tipo			= 'test211';
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
	* TEST_IS_EMPTY
	* @return void
	*/
	public function test_is_empty() {

		$component = $this->build_component_instance();

		// null
			$value = null;
			$result = $component->is_empty($value);
			$this->assertIsBool($result);
			$this->assertTrue($result, 'expected true for null');

		// empty object
			$value = (object)['value' => null];
			$result = $component->is_empty($value);
			$this->assertTrue($result, 'expected true for empty object');

		// non empty object
			$value = (object)['value' => 0];
			$result = $component->is_empty($value);
			$this->assertFalse($result, 'expected false for 0');
	}//end test_is_empty



	/**
	* TEST_GET_DATA
	* @return void
	*/
	public function test_get_data() {

		$component = $this->build_component_instance();

		$result = $component->get_data();
		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
			'expected type array or NULL : ' . PHP_EOL
				. gettype($result)
		);

		// set empty values
			$component->set_data(null);
			$result = $component->get_data();
			$this->assertNull($result);

			$component->set_data([null]);
			$result = $component->get_data();
			$this->assertNull($result);

			$component->set_data([(object)['value' => 0]]);
			$result = $component->get_data();
			$this->assertIsArray($result);
			$this->assertEquals(0.0, $result[0]->value); 
	}//end test_get_data



	/**
	* TEST_SET_DATA
	* @return void
	*/
	public function test_set_data() {

		$component = $this->build_component_instance();

		$result = $component->set_data([]);
		$this->assertIsBool($result);

		// float
			$component->set_properties((object)[
				'type' => 'float',
				'precision' => 4
			]);

		// data
			$result = $component->get_data();
			$this->assertNull($result);

			$component->set_data([null]);
			$result = $component->get_data();
			$this->assertNull($result);

			$component->set_data([(object)['value' => 0]]);
			$result = $component->get_data();
			$this->assertEquals(0.0, $result[0]->value);

			$component->set_data([(object)['value' => 33]]);
			$result = $component->get_data();
			$this->assertEquals(33.0, $result[0]->value);
			$this->assertIsFloat($result[0]->value);

		// int
			$component->set_properties((object)[
				'type' => 'int'
			]);

		// data
			$component->set_data([(object)['value' => 0]]);
			$result = $component->get_data();
			$this->assertEquals(0, $result[0]->value);
			$this->assertIsInt($result[0]->value);

			$component->set_data([(object)['value' => 33.7]]);
			$result = $component->get_data();
			$this->assertEquals(33, $result[0]->value);
	}//end test_set_data



	/**
	* TEST_SET_FORMAT_FORM_TYPE
	* @return void
	*/
	public function test_set_format_form_type() {

		$component = $this->build_component_instance();

		// float
			$component->set_properties((object)[
				'type' => 'float',
				'precision' => 4
			]);

			$value = 0;
			$result = $component->set_format_form_type( $value );
			$this->assertIsFloat($result);

			$value = null;
			$result = $component->set_format_form_type( $value );
			$this->assertNull($result);

			$value = '';
			$result = $component->set_format_form_type( $value );
			$this->assertNull($result);

			$value = 'abc';
			$result = $component->set_format_form_type( $value );
			$this->assertIsFloat($result);

		// int
			$component->set_properties((object)[
				'type' => 'int'
			]);

			$value = 0;
			$result = $component->set_format_form_type( $value );
			$this->assertIsInt($result);

			$value = null;
			$result = $component->set_format_form_type( $value );
			$this->assertNull($result);

			$value = '';
			$result = $component->set_format_form_type( $value );
			$this->assertNull($result);

			$value = 'abc';
			$result = $component->set_format_form_type( $value );
			$this->assertIsInt($result);
	}//end test_set_format_form_type



	/**
	* TEST_NUMBER_TO_STRING
	* @return void
	*/
	public function test_number_to_string() {

		$component = $this->build_component_instance();

		// float
			$component->set_properties((object)[
				'type' => 'float',
				'precision' => 4
			]);

			$value = 13.8;
			$result = $component->number_to_string( $value );
			$this->assertIsString($result);
			$this->assertEquals('13.8000', $result);

			$value = '13,8';
			$result = $component->number_to_string( $value );
			$this->assertEquals('13.8', $result);

		// int
			$component->set_properties((object)[
				'type' => 'int'
			]);

			$value = 13.8;
			$result = $component->number_to_string( $value );
			$this->assertIsString($result);
			$this->assertEquals('13.8', $result);

			$value = '13,8';
			$result = $component->number_to_string( $value );
			$this->assertEquals('13.8', $result);
	}//end test_number_to_string



	/**
	* TEST_STRING_TO_NUMBER
	* @return void
	*/
	public function test_string_to_number() {

		$component = $this->build_component_instance();

		// float
			$component->set_properties((object)[
				'type' => 'float',
				'precision' => 4
			]);

			$value = '13.8';
			$result = $component->string_to_number( $value );
			$this->assertIsFloat($result);
			$this->assertEquals(13.8, $result);

			$value = '13,8';
			$result = $component->string_to_number( $value );
			$this->assertEquals(138.0, $result);

		// int
			$component->set_properties((object)[
				'type' => 'int'
			]);

			$value = '13.8';
			$result = $component->string_to_number( $value );
			$this->assertIsInt($result);
			$this->assertEquals(13, $result);

			$value = '13,8';
			$result = $component->string_to_number( $value );
			$this->assertEquals(138, $result);
	}//end test_string_to_number



	/**
	* TEST_resolve_query_object_sql
	* @return void
	*/
	public function test_resolve_query_object_sql() {

		$query_object = (object)[
			'q' => ['>= 10'],
			'path' => [(object)['component_tipo' => 'test211']],
			'type' => 'number'
		];

		$result = component_number::resolve_query_object_sql($query_object);

		$this->assertIsObject($result);
		$this->assertEquals('number', $result->type);
		$this->assertEquals('@@', $result->operator);
		$this->assertEquals('\'$[*] >= 10\'', $result->q_parsed);
	}//end test_resolve_query_object_sql



	/**
	* TEST_search_operators_info
	* @return void
	*/
	public function test_search_operators_info() {

		$component = $this->build_component_instance();

		$result = $component->search_operators_info();

		$this->assertIsArray($result);
		$this->assertArrayHasKey('>', $result);
		$this->assertEquals('greater_than', $result['>']);
	}//end test_search_operators_info



	/**
	* TEST_update_data_version
	* @return void
	*/
	public function test_update_data_version() {

		$options = (object)[
			'update_version' => [1, 0, 0],
			'data_unchanged' => '55',
			'reference_id' => 'ref123'
		];

		$result = component_number::update_data_version($options);

		$this->assertIsObject($result);
		// Assuming version 1.0.0 is not handled yet
		$this->assertEquals(0, $result->result);
	}//end test_update_data_version



	/**
	* TEST_conform_import_data
	* @return void
	*/
	public function test_conform_import_data() {

		$component = $this->build_component_instance();

		// Ensure properties are reset to default (float)
		$component->set_properties((object)[
			'type' => 'float',
			'precision' => 2
		]);

		$import_value = '[10, 20]';
		$result = $component->conform_import_data($import_value, self::$tipo);

		$this->assertIsObject($result);
		$this->assertIsArray($result->result);
		$this->assertEmpty($result->errors);
		$this->assertEquals(10, $result->result[0]->value);

		$import_value = '55.7';
		$result = $component->conform_import_data($import_value, self::$tipo);
		$this->assertEquals(55.7, $result->result[0]->value);
	}//end test_conform_import_data



	/**
	* TEST_DATA_SAMPLES
	* @return void
	*/
	public function test_data_samples() {

		$component = $this->build_component_instance();

		$samples_path = DEDALO_ROOT_PATH . '/core/component_number/samples/data.json';
		$this->assertFileExists($samples_path);

		$sample_data_raw = file_get_contents($samples_path);
		$result = $component->conform_import_data($sample_data_raw, self::$tipo);

		$this->assertIsObject($result);
		$this->assertIsArray($result->result);
		$this->assertEquals(31416.2, $result->result[0]->value);
		$this->assertEquals(55, $result->result[1]->value);
	}//end test_data_samples



}//end class component_number_test

