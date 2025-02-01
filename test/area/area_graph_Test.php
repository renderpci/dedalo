<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class area_graph_test extends TestCase {



	public static $model	= 'area_graph';
	public static $tipo		= 'dd630';


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
	* BUILD_INSTANCE
	* @return object
	*/
	private function build_instance() {

		$model	= self::$model;
		$tipo	= self::$tipo;
		$mode	= 'list';

		$instance = area::get_instance(
			$model, // string model
			$tipo, // string tipo
			$mode // mode
		);

		return $instance;
	}//end build_instance



	/////////// ⬇︎ test start ⬇︎ ////////////////



	/**
	* TEST_get_section_tipo
	* @return void
	*/
	public function test_get_section_tipo() {

		$area = $this->build_instance();

		$result = $area->get_section_tipo();

		$this->assertTrue(
			gettype($result)==='string' ,
			'expected string' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			$result===self::$tipo ,
			'expected string' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_section_tipo



	/**
	* TEST_get_networks_typologies
	* @return void
	*/
	public function test_get_networks_typologies() {

		$area = $this->build_instance();

		$result = $area->get_networks_typologies();

		$this->assertTrue(
			gettype($result)==='array' ,
			'expected array' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_networks_typologies



	/**
	* TEST_get_hierarchy_sections
	* @return void
	*/
	public function test_get_hierarchy_sections() {

		$area = $this->build_instance();

		$result = $area->get_hierarchy_sections();

		$this->assertTrue(
			gettype($result)==='array' ,
			'expected array' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_hierarchy_sections



	/**
	* TEST_get_active_networks_sections
	* @return void
	*/
	public function test_get_active_networks_sections() {

		$area = $this->build_instance();

		$result = $area->get_active_networks_sections();

		$this->assertTrue(
			gettype($result)==='array' ,
			'expected array' . PHP_EOL
				. gettype($result)
		);

		if (!empty($result)) {
			$this->assertTrue(
				gettype($result[0])==='object' ,
				'expected object' . PHP_EOL
					. to_string($result[0])
			);
		}
	}//end test_get_active_networks_sections



	/**
	* TEST_get_typology_data
	* @return void
	*/
	public function test_get_typology_data() {

		$area = $this->build_instance();

		$result = $area->get_typology_data(
			1
		);

		$this->assertTrue(
			gettype($result)==='object' || gettype($result)==='NULL' ,
			'expected object|null' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_typology_data



	/**
	* TEST_get_typology_name
	* @return void
	*/
	public function test_get_typology_name() {

		$area = $this->build_instance();

		$result = $area->get_typology_name(
			1
		);

		$this->assertTrue(
			gettype($result)==='string' ,
			'expected string' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_typology_name



	/**
	* TEST_get_typology_order
	* @return void
	*/
	public function test_get_typology_order() {

		$area = $this->build_instance();

		$result = $area->get_typology_order(
			1
		);

		$this->assertTrue(
			gettype($result)==='integer' ,
			'expected integer' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_typology_order



	/**
	* TEST_get_hierarchy_name
	* @return void
	*/
	public function test_get_hierarchy_name() {

		$area = $this->build_instance();

		$result = $area->get_hierarchy_name(
			1
		);

		$this->assertTrue(
			gettype($result)==='string' ,
			'expected string' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_hierarchy_name



}//end class area_graph
