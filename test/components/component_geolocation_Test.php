<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_geolocation_test extends TestCase {



	public static $model		= 'component_geolocation';
	public static $tipo			= 'test100';
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
			$component->dato===NULL,
			'expected NULL : ' . PHP_EOL
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
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_valor



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
	* TEST_build_geolocation_tag_string
	* @return void
	*/
	public function test_build_geolocation_tag_string() {

		$component = $this->build_component_instance();

		$result = $component->build_geolocation_tag_string(
			'1', // tag_id
			2.304362542927265, // lon
			41.82053505145308 // lat
		);

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_build_geolocation_tag_string



	/**
	* TEST_regenerate_component
	* @return void
	*/
	public function test_regenerate_component() {

		$component = $this->build_component_instance();

		$result = $component->regenerate_component();

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
	}//end test_regenerate_component



	/**
	* TEST_get_diffusion_value_socrata
	* @return void
	*/
	public function test_get_diffusion_value_socrata() {

		$component = $this->build_component_instance();

		$result = $component->get_diffusion_value_socrata();

		$this->assertTrue(
			gettype($result)==='object' || gettype($result)==='NULL',
			'expected type object|null : ' . PHP_EOL
				. gettype($result)
		);

		if (!empty($component->dato)) {
			$this->assertTrue(
				gettype($result)==='object',
				'expected type object : ' . PHP_EOL
					. gettype($result)
			);
		}
	}//end test_get_diffusion_value_socrata



	/**
	* TEST_get_diffusion_value_as_geojson
	* @return void
	*/
	public function test_get_diffusion_value_as_geojson() {

		$component = $this->build_component_instance();

		$result = $component->get_diffusion_value_as_geojson();

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);

		if (!empty($result)) {
			$this->assertTrue(
				gettype($result)==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result)
			);
		}
	}//end test_get_diffusion_value_as_geojson



	/**
	* TEST_get_sortable
	* @return void
	*/
	public function test_get_sortable() {

		$component = $this->build_component_instance();

		$result = $component->get_sortable();

		$this->assertTrue(
			$result===false,
			'expected false : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_sortable



}//end class component_geolocation_test
