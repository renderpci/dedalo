<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_json_test extends BaseTestCase {



	public static $model		= 'component_json';
	public static $tipo			= 'test18';
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



	/**
	* GET_TEST_FILES_PATH
	* Source path of test files
	* @return string
	*/
	private function get_test_files_path() : string {

		return DEDALO_ROOT_PATH . '/core/component_json/samples';
	}//end get_test_files_path



	/////////// ⬇︎ test start ⬇︎ ////////////////



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

		$data	= null;
		$result	= $component->set_data($data);

		$this->assertTrue(
			gettype($result)==='boolean',
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
			$data = (object)[
				'test' => 1
			];
			$result	= $component->set_data([$data]);
			$this->assertTrue(
				$component->get_data()===[$data],
				'expected array : ' . PHP_EOL
					. to_string($component->get_data())
			);

		// array case
			$data = [
				(object)[
					'test' => 1
				]
			];
			$result	= $component->set_data($data);
			$this->assertTrue(
				$component->get_data()===$data,
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
	* TEST_get_allowed_extensions
	* @return void
	*/
	public function test_get_allowed_extensions() {

		$component = $this->build_component_instance();

		$result = $component->get_allowed_extensions();

		$this->assertTrue(
			gettype($result)==='array' ,
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertEquals(['json'], $result);
	}//end test_get_allowed_extensions



	/**
	* TEST_valid_file_extension
	* @return void
	*/
	public function test_valid_file_extension() {

		$component = $this->build_component_instance();

		$this->assertTrue($component->valid_file_extension('json'));
		$this->assertFalse($component->valid_file_extension('jpg'));
	}//end test_valid_file_extension



	/**
	* TEST_get_upload_file_name
	* @return void
	*/
	public function test_get_upload_file_name() {

		$component = $this->build_component_instance();

		$result = $component->get_upload_file_name();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$refence_value = $component->section_tipo
			.'_'. $component->tipo
			.'_'. $component->section_id;

		$this->assertEquals($refence_value, $result);
	}//end test_get_upload_file_name



	/**
	* TEST_add_file
	* @return void
	*/
	public function test_add_file() {

		$component = $this->build_component_instance();

		// Create a temporary file
		$temp_file = tempnam(sys_get_temp_dir(), 'test_json');
		file_put_contents($temp_file, '{"test":1}');

		$options = (object)[
			"name" => "mydata.json",
			"type" => "text/json",
			"tmp_dir" => "DEDALO_UPLOAD_TMP_DIR", // Constant must be defined in bootstrap
			"key_dir" => "tool_upload",
			"tmp_name" => basename($temp_file),
			"source_file" => $temp_file,
			"error" => 0,
			"size" => filesize($temp_file),
			"extension" => "json"
		];

		$response = $component->add_file($options);

		$this->assertIsObject($response);
		$this->assertTrue($response->result, 'Error adding file: ' . $response->msg);
		
		// Clean up if the file was moved successfully, or if it still exists
		if (file_exists($response->ready->full_file_path)) {
			unlink($response->ready->full_file_path);
		}
		if (file_exists($temp_file)) {
			unlink($temp_file);
		}
	}//end test_add_file



	/**
	* TEST_process_uploaded_file
	* @return void
	*/
	public function test_process_uploaded_file() {

		$component = $this->build_component_instance();

		// test file
		$source_test_file = $this->get_test_files_path() .'/files/'. 'sample_data.json';
		$target_test_file = sys_get_temp_dir() .'/'. 'data_copy.json';
		// create data_copy file
		copy($source_test_file, $target_test_file);

		$file_data = (object)[
			'original_file_name'	=> 'my data name.json',
			'full_file_name'		=> 'test3_test18_1.json',
			'full_file_path'		=>	$target_test_file
		];

		$response = $component->process_uploaded_file(
			$file_data,
			null
		);

		$this->assertIsObject($response);
		$this->assertTrue($response->result, 'Error processing file: ' . $response->msg);
		
		// Verify data was set
		$data = $component->get_data();
		$this->assertIsArray($data);
		
		$uploaded_value = $data[0]->value;
		$this->assertTrue(is_object($uploaded_value) || is_array($uploaded_value), 'Expected object or array, got ' . gettype($uploaded_value));
	}//end test_process_uploaded_file



	/**
	* TEST_update_data_version
	* @return void
	*/
	public function test_update_data_version() {

		$options = (object)[
			'update_version' => [1, 0, 0],
			'data_unchanged' => '{"old":1}',
			'reference_id' => 'ref123'
		];

		$result = component_json::update_data_version($options);

		$this->assertIsObject($result);
		$this->assertEquals(0, $result->result); // Version 1.0.0 should return 0 (not handled)
	}//end test_update_data_version



	/**
	* TEST_resolve_query_object_sql
	* @return void
	*/
	public function test_resolve_query_object_sql() {

		$query_object = (object)[
			'q' => ['myData'],
			'path' => [(object)['component_tipo' => 'test18']],
			'type' => 'jsonb'
		];

		$result = component_json::resolve_query_object_sql($query_object);

		$this->assertIsObject($result);
		$this->assertEquals('string', $result->type);
		$this->assertEquals('~*', $result->operator);
	}//end test_resolve_query_object_sql



	/**
	* TEST_search_operators_info
	* @return void
	*/
	public function test_search_operators_info() {

		$component = $this->build_component_instance();

		$result = $component->search_operators_info();

		$this->assertIsArray($result);
		$this->assertArrayHasKey('*', $result);
		$this->assertEquals('contains', $result['*text*']);
	}//end test_search_operators_info



	/**
	* TEST_regenerate_component
	* @return void
	*/
	public function test_regenerate_component() {

		$component = $this->build_component_instance();

		// old value
		$old_value = $component->get_data();

		$data = [
			(object)[
				'value' => '{"new":1}'
			]
		];
		$component->set_data($data);

		$result = $component->regenerate_component();

		$this->assertTrue($result);
		
		$processed_data = $component->get_data();
		$this->assertIsObject($processed_data[0]->value);
		$this->assertEquals(1, $processed_data[0]->value->new);

		// restore old value
		$component->set_data($old_value);
		$component->save();
	}//end test_regenerate_component



}//end class component_json_test

