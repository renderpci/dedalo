<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_iri_test extends TestCase {



	public static $model		= 'component_iri';
	public static $tipo			= 'test140';
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

		$this->assertTrue(
			$component->dato===null,
			'expected null : ' . PHP_EOL
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
	* TEST_Save
	* @return void
	*/
	public function test_Save() {

		$component = $this->build_component_instance();

		$result	= $component->Save();

		$this->assertTrue(
			gettype($result)==='integer' || gettype($result)==='NULL',
			'expected type integer|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_Save



	/**
	* TEST_get_grid_value
	* @return void
	*/
	public function test_get_grid_value() {

		$component = $this->build_component_instance();

		$result	= $component->get_grid_value();

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_grid_value



	/**
	* TEST_get_grid_flat_value
	* @return void
	*/
	public function test_get_grid_flat_value() {

		$component = $this->build_component_instance();

		$result	= $component->get_grid_flat_value();

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_grid_flat_value



	/**
	* TEST_get_valor
	* @return void
	*/
	public function test_get_valor() {

		$component = $this->build_component_instance();

		$result = $component->get_valor();

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_valor



	/**
	* TEST_get_valor_export
	* @return void
	*/
	public function test_get_valor_export() {

		$component = $this->build_component_instance();

		$result = $component->get_valor_export();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_valor_export



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
	* TEST_resolve_query_object_sql
	* @return void
	*/
	public function test_resolve_query_object_sql() {

		$query_object = json_decode('
			{
			    "q": [
			        "raspa"
			    ],
			    "q_operator": null,
			    "path": [
			        {
			            "name": "iri",
			            "model": "component_iri",
			            "section_tipo": "test3",
			            "component_tipo": "test140"
			        }
			    ],
			    "type": "jsonb",
			    "component_path": [
			        "components",
			        "test140",
			        "dato"
			    ],
			    "lang": "all"
			}
		');

		$result = component_date::resolve_query_object_sql( $query_object );

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_resolve_query_object_sql



	/**
	* TEST_url_to_iri
	* @return void
	*/
	public function test_url_to_iri() {

		$component = $this->build_component_instance();

		$url = 'https://elraspa.org';

		$result = $component->url_to_iri(
			$url
		);

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			$result->iri===$url,
			'expected true : ' . PHP_EOL
				. to_string($result->iri)
		);
	}//end test_url_to_iri



	/**
	* TEST_conform_import_data
	* @return void
	*/
	public function test_conform_import_data() {

		$component = $this->build_component_instance();

		$response = $component->conform_import_data(
			'https://elraspa.org', // import_value
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



}//end class component_iri_test
