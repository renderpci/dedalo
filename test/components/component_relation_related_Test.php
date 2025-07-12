<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_relation_related_test extends TestCase {



	public static $model		= 'component_relation_related';
	public static $tipo			= 'test54';
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
		// public function test_set_dato() {

		// 	$component = $this->build_component_instance();

		// 	$old_dato = $component->get_dato();

		// 	$dato	= null;
		// 	$result	= $component->set_dato($dato);

		// 	$this->assertTrue(
		// 		gettype($result)==='boolean',
		// 		'expected type boolean : ' . PHP_EOL
		// 			. gettype($result)
		// 	);

		// 	// null case
		// 		$this->assertTrue(
		// 			$component->dato===[],
		// 			'expected [] : ' . PHP_EOL
		// 				. to_string($component->dato)
		// 		);

		// 	// object case
		// 		$locator = json_decode('
		// 			{
		// 				"type":"dd48",
		// 				"section_id":"2",
		// 				"section_tipo":"test3",
		// 				"from_component_tipo":"test54"
		// 			}
		// 		');
		// 		$dato	= $locator;
		// 		$result	= $component->set_dato($dato);

		// 		$this->assertTrue(
		// 			json_encode($component->dato)===json_encode([$dato]),
		// 			'expected array : ' . PHP_EOL
		// 				. to_string($component->dato)
		// 		);

		// 	// array case
		// 		$dato	= [$locator];
		// 		$result	= $component->set_dato($dato);
		// 		$this->assertTrue(
		// 			json_encode($component->dato)===json_encode($dato),
		// 			'expected array : ' . PHP_EOL
		// 				. to_string($component->dato)
		// 		);

		// 	// restore dato
		// 		$result	= $component->set_dato($old_dato);

		// 		$this->assertTrue(
		// 			json_encode($component->dato)===json_encode($old_dato),
		// 			'expected old dato : ' . PHP_EOL
		// 				. to_string($component->dato)
		// 		);
		// }//end test_set_dato



	/**
	* TEST_get_valor
	* @return void
	*/
	public function test_get_valor() {

		$component = $this->build_component_instance();

		$result = $component->get_valor();

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='array' || gettype($result)==='NULL',
			'expected type string|array|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_valor



	/**
	* TEST_add_related
	* @return void
	*/
	public function test_add_related() {

		$component = $this->build_component_instance();

		$locator = new locator();
			$locator->set_section_tipo(self::$section_tipo);
			$locator->set_section_id(3);
			$locator->set_from_component_tipo(self::$tipo);

		$result = $component->add_related($locator);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		// $dato = $component->get_dato();
		$dato = $component->dato;
		$this->assertTrue(
			locator::in_array_locator($locator, $dato, ['section_tipo','section_id']),
			'expected true : ' . PHP_EOL
				.' dato: '. to_string($dato) . PHP_EOL
				.' locator: ' .to_string($locator)
		);
	}//end test_add_related



	/**
	* TEST_remove_related
	* @return void
	*/
	public function test_remove_related() {

		$component = $this->build_component_instance();

		$locator = new locator();
			$locator->set_section_tipo(self::$section_tipo);
			$locator->set_section_id(3);
			$locator->set_from_component_tipo(self::$tipo);

		$result = $component->remove_related($locator);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		// $dato = $component->get_dato();
		$dato = $component->dato;
		$this->assertTrue(
			!locator::in_array_locator($locator, $dato, ['section_tipo','section_id']),
			'expected true : ' . PHP_EOL
				.' dato: '. to_string($dato) . PHP_EOL
				.' locator: ' .to_string($locator)
		);
	}//end test_remove_related



	/**
	* TEST_get_dato_with_references
	* @return void
	*/
	public function test_get_dato_with_references() {

		$component = $this->build_component_instance();

		$result = $component->get_dato_with_references();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_dato_with_references



	/**
	* TEST_get_calculated_references
	* @return void
	*/
	public function test_get_calculated_references() {

		$component = $this->build_component_instance();

		$result = $component->get_calculated_references(
			false // bool only data
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_calculated_references



	/**
	* TEST_get_type_rel
	* @return void
	*/
	public function test_get_type_rel() {

		$component = $this->build_component_instance();

		$result = $component->get_type_rel();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$reference = 'dd620';
		$this->assertTrue(
			$result===$reference,
			'expected  '.$reference.' ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_type_rel



	/**
	* TEST_get_references_recursive
	* @return void
	*/
	public function test_get_references_recursive() {

		$component = $this->build_component_instance();

		$current_locator = new stdClass();
			$current_locator->section_tipo			= self::$section_tipo;
			$current_locator->section_id			= 1;
			$current_locator->from_component_tipo	= self::$tipo;

		$result = component_relation_related::get_references_recursive(
			self::$tipo,
			$current_locator,
			DEDALO_RELATION_TYPE_RELATED_TIPO,
			false, // bool recursion
			$component->lang
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_references_recursive



	/**
	* TEST_get_references
	* @return void
	*/
	public function test_get_references() {

		$component = $this->build_component_instance();

		$result = $component->get_references();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_references



	/**
	* TEST_get_diffusion_value
	* @return void
	*/
	public function test_get_diffusion_value() {

		$component = $this->build_component_instance();

		$value = $component->get_diffusion_value();

		$this->assertTrue(
			gettype($value)==='string' || gettype($value)==='NULL',
			'expected type string|null : ' .PHP_EOL
				. gettype($value)
		);
	}//end test_get_diffusion_value



	/**
	* TEST_get_sortable
	* @return void
	*/
	public function test_get_sortable() {

		$component = $this->build_component_instance();

		$result = $component->get_sortable();

		$this->assertTrue(
			$result===true,
			'expected true : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_sortable



	/**
	* TEST_get_order_path
	* @return void
	*/
	public function test_get_order_path() {

		$component = $this->build_component_instance();

		$result = $component->get_order_path(
			self::$tipo,
			self::$section_tipo
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_order_path




}//end class component_relation_related_test
