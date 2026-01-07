<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_email_test extends BaseTestCase {



	public static $model		= 'component_email';
	public static $tipo			= 'test208';
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
		if (is_array($result)) {
			$this->assertTrue(
				gettype($result[0]->value)==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result[0]->value)
			);
			$this->assertTrue(
				strpos($result[0]->value, '@')!==false,
				'expected @ position not false : ' . PHP_EOL
					. (strpos($result[0]->value, '@')!==false)
			);
		}
	}//end test_get_data



	/**
	* TEST_set_data
	* @return void
	*/
	public function test_set_data() {

		$component = $this->build_component_instance();

		// 1 - array case
			$data = [
				(object)['value'=>'myemail@mydomain.org']
			];

			$result = $component->set_data($data);

			$this->assertTrue(
				gettype($result)==='boolean',
				'expected type boolean : ' . PHP_EOL
					. gettype($result)
			);

			$this->assertTrue(
				$component->get_data()===$data,
				'expected component->data equal data : ' . PHP_EOL
					. to_string($component->get_data())
			);

		// 2 - null case
			$data = null;

			$result = $component->set_data($data);

			$this->assertTrue(
				$component->get_data()===$data,
				'expected component->data equal data : ' . PHP_EOL
					. to_string($component->get_data())
			);

		// 3 - cleaning case
			$data = [
				(object)['value'=>"  myemail@mydomain.org\n  "]
			];
			$component->set_data($data);
			$current_data = $component->get_data();

			$this->assertTrue(
				$current_data[0]->value==='myemail@mydomain.org',
				'expected cleaned email : ' . PHP_EOL
					. to_string($current_data[0]->value)
			);
	}//end test_set_data



	/**
	* TEST_Save
	* @return void
	*/
	public function test_Save() {

		$component = $this->build_component_instance();

		// valid save
			$data = [
				(object)['value'=>'valid@example.org']
			];
			$component->set_data($data);

			$result = $component->save();

			$this->assertTrue(
				$result===true,
				'expected true on valid save'
			);
	}//end test_Save



	/**
	* TEST_save_invalid_email
	* @return void
	*/
	public function test_save_invalid_email() {

		$component = $this->build_component_instance();

		$data = [
			(object)['value'=>'invalid-email']
		];
		$component->set_data($data);

		$result = $component->save();

		$this->assertFalse(
			$result,
			'expected false on invalid email save'
		);
	}//end test_save_invalid_email



	/**
	* TEST_is_valid_email
	* @return void
	*/
	public function test_is_valid_email() {

		// 1 - valid email

			$email = 'myemail@mydomain.org';

			$result = component_email::is_valid_email($email);

			$this->assertTrue(
				gettype($result)==='boolean',
				'expected type boolean : ' . PHP_EOL
					. gettype($result)
			);
			$this->assertTrue(
				$result===true,
				'expected true : ' . PHP_EOL
					. to_string($result)
			);

		// 2 - invalid email B

			$email = 'myemail@mydomain';

			$result = component_email::is_valid_email($email);

			$this->assertTrue(
				$result===false,
				'expected false : ' . PHP_EOL
					. to_string($result)
			);

		// 3 - invalid email C

			$email = 'myemail.mydomain.org';

			$result = component_email::is_valid_email($email);

			$this->assertTrue(
				$result===false,
				'expected false : ' . PHP_EOL
					. to_string($result)
			);
	}//end test_is_valid_email



	/**
	* TEST_clean_email
	* @return void
	*/
	public function test_clean_email() {

		// valid email

			$email = '  myemail@mydomain.org
			';

			$result = component_email::clean_email($email);

			$this->assertTrue(
				gettype($result)==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result)
			);
			$this->assertTrue(
				$result==='myemail@mydomain.org',
				'expected true : ' . PHP_EOL
					. to_string($result)
			);
	}//end test_clean_email



	/**
	* TEST_resolve_query_object_sql
	* @return void
	*/
	public function test_resolve_query_object_sql() {

		// search email
			$query_object = json_decode('
				{
				    "q": [
				        "pepe"
				    ],
				    "q_operator": null,
				    "path": [
				        {
				            "section_tipo": "dd128",
				            "component_tipo": "dd134",
				            "model": "component_email",
				            "name": "email"
				        }
				    ],
				    "type": "jsonb",
				    "component_path": [
				        "components",
				        "dd134",
				        "dato"
				    ],
				    "lang": "all"
				}
			');

			$result = component_email::resolve_query_object_sql($query_object);

			$this->assertTrue(
				gettype($result)==='object',
				'expected type object : ' . PHP_EOL
					. gettype($result)
			);
			$this->assertTrue(
				!empty($result->sentence),
				'expected not empty sentence : ' . PHP_EOL
					. to_string($result->sentence)
			);
			$this->assertTrue(
				!empty($result->params),
				'expected not empty params : ' . PHP_EOL
					. to_string($result->params)
			);			
	}//end test_resolve_query_object_sql



	/**
	* TEST_conform_import_data
	* @return void
	*/
	public function test_conform_import_data() {

		$component = $this->build_component_instance();

		// 1 - string case
			$response = $component->conform_import_data(
				'myemail@mydomain.org', // import_value
				self::$tipo // column_name
			);

			$this->assertTrue(
				gettype($response)==='object',
				'expected type object : ' . PHP_EOL
					. gettype($response)
			);
			$this->assertTrue(
				is_array($response->result) && $response->result[0]->value === 'myemail@mydomain.org',
				'expected array with object containing email. result: ' . to_string($response->result)
			);

		// 2 - JSON case
			$json_data = '[{"value":"imported@example.org"}]';
			$response = $component->conform_import_data($json_data, self::$tipo);

			$this->assertTrue(
				is_array($response->result) && $response->result[0]->value === 'imported@example.org',
				'expected decoded JSON'
			);
	}//end test_conform_import_data



	/**
	* TEST_get_grid_value
	* @return void
	*/
	public function test_get_grid_value() {

		$component = $this->build_component_instance();
		$email = 'grid@example.org';
		$data = [(object)['value'=>$email, 'lang'=>DEDALO_DATA_NOLAN]];
		$component->set_data($data);

		$result = $component->get_grid_value();

		$this->assertTrue(
			get_class($result)==='dd_grid_cell_object',
			'expected dd_grid_cell_object'
		);
		// Since component_email does not override get_grid_value, it uses the base implementation
		// which returns the data items JSON-encoded if they are objects.
		$this->assertTrue(
			strpos($result->value[0], $email) !== false,
			'expected email value in grid object : ' . to_string($result->value[0])
		);
	}//end test_get_grid_value



	/**
	* TEST_get_list_value
	* @return void
	*/
	public function test_get_list_value() {

		$component = $this->build_component_instance();
		$email = 'list@example.org';
		$data = [(object)['value'=>$email, 'lang'=>DEDALO_DATA_NOLAN]];
		$component->set_data($data);

		$result = $component->get_list_value();

		$this->assertTrue(
			is_array($result) && $result[0]->value === $email,
			'expected list value'
		);
	}//end test_get_list_value



	/**
	* TEST_update_data_version
	* @return void
	*/
	public function test_conform_import_data_integration() {

		$component = $this->build_component_instance();
		$email = 'integration@example.org';
		$response = $component->conform_import_data($email, self::$tipo);

		$component->set_data($response->result);
		$data = $component->get_data();

		$this->assertTrue(
			!empty($data) && $data[0]->value === $email,
			'expected email to be set correctly from import. current data: ' . to_string($data)
		);
	}//end test_conform_import_data_integration



	/**
	* TEST_update_data_version
	* @return void
	*/
	public function test_update_data_version() {

		$request_options = (object)[
			'update_version' => [1,0,0]
		];

		$result = component_email::update_data_version($request_options);

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object'
		);
	}//end test_update_data_version



}//end class component_email_test
