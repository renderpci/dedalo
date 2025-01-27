<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_email_test extends TestCase {



	public static $model		= 'component_email';
	public static $tipo			= 'test208';
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
	* TEST_get_dato
	* @return void
	*/
	public function test_get_dato() {

		$component = $this->build_component_instance();

		$result = $component->get_dato();

		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
			'expected type array|null : ' . PHP_EOL
				. gettype($result)
		);
		if (is_array($result)) {
			$this->assertTrue(
				gettype($result[0])==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result[0])
			);
			$this->assertTrue(
				strpos($result[0], '@')!==false,
				'expected @ position not false : ' . PHP_EOL
					. (strpos($result[0], '@')!==false)
			);
		}
	}//end test_get_dato



	/**
	* TEST_set_dato
	* @return void
	*/
	public function test_set_dato() {

		$component = $this->build_component_instance();

		// array case
			$dato = ['myemail@mydomain.org'];

			$result = $component->set_dato($dato);

			$this->assertTrue(
				gettype($result)==='boolean',
				'expected type boolean : ' . PHP_EOL
					. gettype($result)
			);

			$this->assertTrue(
				$component->dato===$dato,
				'expected component->dato equal dato : ' . PHP_EOL
					. to_string($component->dato)
			);

		// null case
			$dato = null;

			$result = $component->set_dato($dato);

			$this->assertTrue(
				$component->dato===$dato,
				'expected component->dato equal dato : ' . PHP_EOL
					. to_string($component->dato)
			);

		// string case (will be converted to array)
			$dato = 'myemail@mydomain.org';

			$result = $component->set_dato($dato);

			$this->assertTrue(
				$component->dato===[$dato],
				'expected component->dato equal [dato] : ' . PHP_EOL
					. to_string($component->dato)
			);
	}//end test_set_dato



	/**
	* TEST_Save
	* @return void
	*/
	public function test_Save() {

		$component = $this->build_component_instance();

		$result = $component->Save();

		$this->assertTrue(
			gettype($result)==='integer' || gettype($result)==='NULL',
			'expected type integer|null : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			$result==$component->section_id,
			'expected equal section_id : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_Save



	/**
	* TEST_is_valid_email
	* @return void
	*/
	public function test_is_valid_email() {

		// valid email

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

		// invalid email 1

			$email = 'myemail@mydomain';

			$result = component_email::is_valid_email($email);

			$this->assertTrue(
				$result===false,
				'expected false : ' . PHP_EOL
					. to_string($result)
			);

		// invalid email 2

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

		// valid email

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
				!empty($result->q_parsed),
				'expected not empty q_parsed : ' . PHP_EOL
					. to_string($result->q_parsed)
			);
			$this->assertTrue(
				!empty($result->operator),
				'expected not empty operator : ' . PHP_EOL
					. to_string($result->operator)
			);
			$this->assertTrue(
				$result->unaccent===true,
				'expected true unaccent : ' . PHP_EOL
					. to_string($result->unaccent)
			);
	}//end test_resolve_query_object_sql



	/**
	* TEST_conform_import_data
	* @return void
	*/
	public function test_conform_import_data() {

		$component = $this->build_component_instance();

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
			gettype($response->result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($response->result)
		);
		$this->assertTrue(
			gettype($response->errors)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($response->errors)
		);
		$this->assertTrue(
			empty($response->errors),
			'expected empty errors : ' . PHP_EOL
				. to_string($response->errors)
		);
	}//end test_conform_import_data



}//end class component_email_test
