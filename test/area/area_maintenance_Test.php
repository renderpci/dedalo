<?php
declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class area_maintenance_test extends TestCase {



	public static $model	= 'area_maintenance';
	public static $tipo		= 'dd88';



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
	* @return
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
	* TEST_ar_tables_with_relations
	* @return void
	*/
	public function test_ar_tables_with_relations() {

		// $area = $this->build_instance();

		$result = area_maintenance::$ar_tables_with_relations;

		$this->assertTrue(
			gettype($result)==='array' ,
			'expected array' . PHP_EOL
				. gettype($result)
		);
	}//end test_ar_tables_with_relations



	/**
	* TEST_item_make_backup
	* @return void
	*/
	public function test_item_make_backup() {

		$area = $this->build_instance();

		$result = $area->item_make_backup();

		$this->assertTrue(
			gettype($result)==='object' ,
			'expected object' . PHP_EOL
				. gettype($result)
		);
	}//end test_item_make_backup



	/**
	* TEST_get_ar_widgets
	* @return void
	*/
	public function test_get_ar_widgets() {

		$area = $this->build_instance();

		$result = $area->get_ar_widgets();

		$this->assertTrue(
			gettype($result)==='array' ,
			'expected array' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_ar_widgets



	/**
	* TEST_widget_factory
	* @return void
	*/
	public function test_widget_factory() {

		$area = $this->build_instance();

		$item = json_decode('
			{
			    "id": "update_code",
			    "typo": "widget",
			    "label": "Actualizar Código"
			}
		');

		$result = $area->widget_factory(
			$item
		);

		$this->assertTrue(
			gettype($result)==='object' ,
			'expected object' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result->typo==='widget' ,
			'expected result->typo == widget' . PHP_EOL
				. gettype($result->typo)
		);
	}//end test_widget_factory



	/**
	* TEST_check_config
	* @return void
	*/
	public function test_check_config() {

		$area = $this->build_instance();

		$result = $area->check_config();

		$this->assertTrue(
			gettype($result)==='object' ,
			'expected object' . PHP_EOL
				. gettype($result)
		);
	}//end test_check_config



}//end class area_maintenance
