<?php declare(strict_types=1);
// bootstrap
require_once dirname(__FILE__, 2) . '/bootstrap.php';



final class section_record_data_test extends BaseTestCase {



	/**
	* TEST_USER_LOGIN
	* @return void
	*/
	public function test_user_login() {

		$user_id = TEST_USER_ID; // Defined in bootstrap

		if (login::is_logged()===false) {
			login_test::force_login($user_id);
		}

		$this->assertTrue(
			login::is_logged()===true ,
			'expected login true'
		);
	}//end test_user_login



	/**
	* TEST_LAZY_DECODE_SET_COLUMN_DATA_RAW_STRING
	* Verifies that passing a raw JSON string to set_column_data stores it
	* without decoding, and get_column_data triggers the decode.
	* @return void
	*/
	public function test_lazy_decode_set_column_data_raw_string() {

		$instance = section_record_data::get_instance('test65', 1);

		// Set a raw JSON string for the 'relation' column
		$raw_json = '{"test37":[{"section_tipo":"test65","section_id":1,"type":"dd151","id":1}]}';
		$result = $instance->set_column_data('relation', $raw_json);

		$this->assertTrue($result, 'expected set_column_data to return true');

		// Now access it — should trigger lazy decode
		$column_data = $instance->get_column_data('relation');

		$this->assertIsObject($column_data);
		$this->assertObjectHasProperty('test37', $column_data);
		$this->assertIsArray($column_data->test37);
		$this->assertEquals('test65', $column_data->test37[0]->section_tipo);
		$this->assertEquals(1, $column_data->test37[0]->section_id);
	}//end test_lazy_decode_set_column_data_raw_string



	/**
	* TEST_LAZY_DECODE_GET_KEY_DATA_DECODES_ONLY_REQUESTED_COLUMN
	* Verifies that get_key_data triggers decode of only the requested column,
	* not all columns.
	* @return void
	*/
	public function test_lazy_decode_get_key_data_decodes_only_requested_column() {

		$instance = section_record_data::get_instance('test65', 1);

		// Set raw JSON for two different columns
		$raw_relation = '{"test37":[{"section_tipo":"test65","section_id":5,"type":"dd151","id":1}]}';
		$raw_string = '{"test159":[{"value":"hello","lang":"lg-nolan","id":1}]}';

		$instance->set_column_data('relation', $raw_relation);
		$instance->set_column_data('string', $raw_string);

		// Access only the relation column via get_key_data
		$key_data = $instance->get_key_data('relation', 'test37');

		$this->assertIsArray($key_data);
		$this->assertEquals(5, $key_data[0]->section_id);

		// Access the string column separately
		$string_data = $instance->get_key_data('string', 'test159');

		$this->assertIsArray($string_data);
		$this->assertEquals('hello', $string_data[0]->value);
	}//end test_lazy_decode_get_key_data_decodes_only_requested_column



	/**
	* TEST_LAZY_DECODE_GET_DATA_MATERIALIZES_ALL_COLUMNS
	* Verifies that get_data() decodes all pending columns.
	* @return void
	*/
	public function test_lazy_decode_get_data_materializes_all_columns() {

		$instance = section_record_data::get_instance('test65', 1);

		$raw_relation = '{"test37":[{"section_tipo":"test65","section_id":10,"type":"dd151","id":1}]}';
		$raw_string = '{"test159":[{"value":"world","lang":"lg-nolan","id":1}]}';
		$raw_date = '{"test160":[{"start":{"year":2025,"month":3,"day":24},"id":1}]}';

		$instance->set_column_data('relation', $raw_relation);
		$instance->set_column_data('string', $raw_string);
		$instance->set_column_data('date', $raw_date);

		// get_data materializes all
		$data = $instance->get_data();

		$this->assertIsObject($data);
		$this->assertIsObject($data->relation);
		$this->assertEquals(10, $data->relation->test37[0]->section_id);
		$this->assertIsObject($data->string);
		$this->assertEquals('world', $data->string->test159[0]->value);
		$this->assertIsObject($data->date);
		$this->assertEquals(2025, $data->date->test160[0]->start->year);

		// Columns not set remain null
		$this->assertNull($data->geo);
		$this->assertNull($data->iri);
	}//end test_lazy_decode_get_data_materializes_all_columns



	/**
	* TEST_SET_KEY_DATA_FORCES_DECODE_BEFORE_MUTATION
	* Verifies that set_key_data forces decode of the column before mutating it.
	* @return void
	*/
	public function test_set_key_data_forces_decode_before_mutation() {

		$instance = section_record_data::get_instance('test65', 1);

		// Set raw JSON for relation column
		$raw_relation = '{"test37":[{"section_tipo":"test65","section_id":1,"type":"dd151","id":1}]}';
		$instance->set_column_data('relation', $raw_relation);

		// Mutate via set_key_data (should decode first, then set)
		$result = $instance->set_key_data('relation', 'test81', [
			(object)[
				'section_tipo' => 'test65',
				'section_id' => 99,
				'type' => 'dd151',
				'id' => 1
			]
		]);

		$this->assertTrue($result);

		// Verify both keys exist
		$test37 = $instance->get_key_data('relation', 'test37');
		$test81 = $instance->get_key_data('relation', 'test81');

		$this->assertIsArray($test37);
		$this->assertEquals(1, $test37[0]->section_id);
		$this->assertIsArray($test81);
		$this->assertEquals(99, $test81[0]->section_id);
	}//end test_set_key_data_forces_decode_before_mutation



	/**
	* TEST_SET_DATA_WITH_MIXED_STRING_AND_OBJECT_VALUES
	* Verifies that set_data handles both raw JSON strings and pre-decoded objects.
	* @return void
	*/
	public function test_set_data_with_mixed_string_and_object_values() {

		$instance = section_record_data::get_instance('test65', 1);

		$data = new stdClass();
		// Raw JSON string
		$data->relation = '{"test37":[{"section_tipo":"test65","section_id":42,"type":"dd151","id":1}]}';
		// Already decoded object
		$data->string = (object)[
			'test159' => [(object)[
				'value' => 'mixed test',
				'lang' => 'lg-nolan',
				'id' => 1
			]]
		];

		$result = $instance->set_data($data);
		$this->assertTrue($result);

		// Verify both columns are accessible
		$relation_data = $instance->get_key_data('relation', 'test37');
		$this->assertIsArray($relation_data);
		$this->assertEquals(42, $relation_data[0]->section_id);

		$string_data = $instance->get_key_data('string', 'test159');
		$this->assertIsArray($string_data);
		$this->assertEquals('mixed test', $string_data[0]->value);
	}//end test_set_data_with_mixed_string_and_object_values



	/**
	* TEST_SET_COLUMN_DATA_OBJECT_OVERWRITES_RAW
	* Verifies that setting an object value overwrites a previously stored raw string.
	* @return void
	*/
	public function test_set_column_data_object_overwrites_raw() {

		$instance = section_record_data::get_instance('test65', 1);

		// Set raw JSON
		$raw = '{"test37":[{"section_tipo":"test65","section_id":1,"type":"dd151","id":1}]}';
		$instance->set_column_data('relation', $raw);

		// Overwrite with a decoded object
		$obj = (object)[
			'test37' => [(object)[
				'section_tipo' => 'test65',
				'section_id' => 777,
				'type' => 'dd151',
				'id' => 1
			]]
		];
		$instance->set_column_data('relation', $obj);

		// Should return the object, not the raw string data
		$column_data = $instance->get_column_data('relation');
		$this->assertIsObject($column_data);
		$this->assertEquals(777, $column_data->test37[0]->section_id);
	}//end test_set_column_data_object_overwrites_raw



	/**
	* TEST_INVALID_JSON_STRING_THROWS_EXCEPTION
	* Verifies that an invalid JSON string causes an Exception on decode.
	* @return void
	*/
	public function test_invalid_json_string_throws_exception() {

		$instance = section_record_data::get_instance('test65', 1);

		// Set an invalid JSON string
		$instance->set_column_data('relation', '{invalid json}');

		// Accessing the column should trigger decode and throw
		$this->expectException(Exception::class);
		$instance->get_column_data('relation');
	}//end test_invalid_json_string_throws_exception



	/**
	* TEST_SET_COLUMN_DATA_NULL_RESETS_DECODED_STATE
	* Verifies that setting null clears any pending raw data.
	* @return void
	*/
	public function test_set_column_data_null_resets_decoded_state() {

		$instance = section_record_data::get_instance('test65', 1);

		// Set raw JSON
		$raw = '{"test37":[{"section_tipo":"test65","section_id":1,"type":"dd151","id":1}]}';
		$instance->set_column_data('relation', $raw);

		// Now set null
		$instance->set_column_data('relation', null);

		// Should return null without error
		$column_data = $instance->get_column_data('relation');
		$this->assertNull($column_data);
	}//end test_set_column_data_null_resets_decoded_state



	/**
	* TEST_GET_KEY_DATA_NON_EXISTING_KEY_RETURNS_NULL
	* Verifies that accessing a non-existing key returns null after lazy decode.
	* @return void
	*/
	public function test_get_key_data_non_existing_key_returns_null() {

		$instance = section_record_data::get_instance('test65', 1);

		$raw = '{"test37":[{"section_tipo":"test65","section_id":1,"type":"dd151","id":1}]}';
		$instance->set_column_data('relation', $raw);

		// Access a key that doesn't exist in the decoded data
		$result = $instance->get_key_data('relation', 'nonexistent');
		$this->assertNull($result);
	}//end test_get_key_data_non_existing_key_returns_null



}//end class section_record_data_test
