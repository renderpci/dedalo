<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_json_test extends TestCase {



	public static $model		= 'component_json';
	public static $tipo			= 'test18';
	public static $section_tipo	= 'test3';



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
	* BUILD_COMPONENT_INSTANCE
	* @return
	*/
	private function build_component_instance() {

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

		return dirname(dirname(__FILE__)) . '/files/component_json';
	}//end get_test_files_path



	/////////// ⬇︎ test start ⬇︎ ////////////////



	/**
	* TEST_get_dato
	* @return void
	*/
	public function test_get_dato() {

		$component = $this->build_component_instance();

		$result	= $component->get_dato();

		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
			'expected type array|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_dato



	/**
	* TEST_set_dato
	* @return void
	*/
	public function test_set_dato() {

		$component = $this->build_component_instance();

		$old_dato = $component->get_dato();

		$dato	= null;
		$result	= $component->set_dato($dato);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		// null case
			$this->assertTrue(
				$component->dato===null,
				'expected null : ' . PHP_EOL
					. to_string($component->dato)
			);

		// object case
			$dato = (object)[
				'test' => 1
			];
			$result	= $component->set_dato($dato);
			$this->assertTrue(
				$component->dato===[$dato],
				'expected array : ' . PHP_EOL
					. to_string($component->dato)
			);

		// array case
			$dato = [
				(object)[
					'test' => 1
				]
			];
			$result	= $component->set_dato($dato);
			$this->assertTrue(
				$component->dato===$dato,
				'expected array : ' . PHP_EOL
					. to_string($component->dato)
			);

		// restore dato
			$result	= $component->set_dato($old_dato);

			$this->assertTrue(
				json_encode($component->dato)===json_encode($old_dato),
				'expected [] : ' . PHP_EOL
					. to_string($component->dato)
			);
	}//end test_set_dato



	/**
	* TEST_get_valor
	* @return void
	*/
	public function test_get_valor() {

		$component = $this->build_component_instance();

		$result = $component->get_valor();

		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
			'expected type array|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_valor



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
		$this->assertTrue(
			$result===['json'],
			'expected ["json"] : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_allowed_extensions



	/**
	* TEST_get_diffusion_value
	* @return void
	*/
	public function test_get_diffusion_value() {

		$component = $this->build_component_instance();

		$result = $component->get_diffusion_value();

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_diffusion_value



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

		$this->assertTrue(
			$result===$refence_value,
			'expected type boolean : ' . PHP_EOL
				. to_string($refence_value)
		);
	}//end test_get_upload_file_name



	/**
	* TEST_add_file
	* @return void
	*/
	public function test_add_file() {

		$component = $this->build_component_instance();

		$options = json_decode('
			{
				"name": "mydata.json",
				"type": "text/json",
				"tmp_dir": "DEDALO_UPLOAD_TMP_DIR",
				"key_dir": "tool_upload",
				"tmp_name": "/private/var/tmp/php6nd4A2",
				"error": 0,
				"size": 132898,
				"extension": "json"
			}
		');

		$response = $component->add_file(
			$options
		);

		$this->assertTrue(
			gettype($response)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($response)
		);
		$this->assertTrue(
			$response->result===false,
			'expected false : ' . PHP_EOL
				. to_string($response->result)
		);
	}//end test_add_file



	/**
	* TEST_process_uploaded_file
	* @return void
	*/
	public function test_process_uploaded_file() {

		$component = $this->build_component_instance();

		// test file
		$source_test_file = $this->get_test_files_path() .'/'. 'sample_data.json';
		$target_test_file = $this->get_test_files_path() .'/'. 'sample_data_copy.json';
		// create sample_data_copy file
		copy($source_test_file, $target_test_file);

		$file_data = (object)[
			'original_file_name'	=> 'my file name.json',
			'full_file_name'		=> 'test3_test18_1.json',
			'full_file_path'		=>	$target_test_file
		];

		$response = $component->process_uploaded_file(
			$file_data,
			null
		);

		$this->assertTrue(
			gettype($response)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($response)
		);
		$this->assertTrue(
			$response->result===true,
			'expected true : ' . PHP_EOL
				. to_string($response->result)
		);
	}//end test_process_uploaded_file



}//end class component_json_test
