<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_select_lang_test extends TestCase {



	public static $model		= 'component_select_lang';
	public static $tipo			= 'test89';
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
			'expected type array|null ' . PHP_EOL
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

		$dato	= [];
		$result	= $component->set_dato($dato);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$component->dato===[],
			'expected [] : ' . PHP_EOL
				. to_string($component->dato)
		);

		// null case
			$result	= $component->set_dato(null);

			$this->assertTrue(
				$component->dato===[],
				'expected [] : ' . PHP_EOL
					. to_string($component->dato)
			);

		// restore dato
			$result	= $component->set_dato($old_dato);

			$this->assertTrue(
				json_encode($component->dato)===json_encode($old_dato),
				'expected old dato : ' . PHP_EOL
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
	* TEST_get_value_code
	* @return void
	*/
	public function test_get_value_code() {

		$component = $this->build_component_instance();

		$result = $component->get_value_code();

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_value_code



	/**
	* TEST_get_related_component_text_area
	* @return void
	*/
	public function test_get_related_component_text_area() {

		$component = $this->build_component_instance();

		$result = $component->get_related_component_text_area();

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_related_component_text_area



	/**
	* TEST_get_sortable
	* @return void
	*/
	public function test_get_sortable() {

		$component = $this->build_component_instance();

		$value = $component->get_sortable();

		$this->assertTrue(
			$value===true,
			'expected true : ' .PHP_EOL
				. to_string($value)
		);
	}//end test_get_sortable



	/**
	* TEST_get_order_path
	* @return void
	*/
	public function test_get_order_path() {

		$component = $this->build_component_instance();

		$component_tipo	= self::$tipo;
		$section_tipo	= self::$section_tipo;

		$result = $component->get_order_path(
			$component_tipo,
			$section_tipo
		);

		// sample result
			// [
			//     {
			//         "component_tipo": "test101",
			//         "model": "component_filter",
			//         "name": "filter",
			//         "section_tipo": "test3"
			//     },
			//     {
			//         "component_tipo": "dd156",
			//         "model": "component_input_text",
			//         "name": "Proyecto (nombre)",
			//         "section_tipo": "dd153"
			//     }
			// ]

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);

		if (!empty($result)) {
			$this->assertTrue(
				gettype($result[0])==='object',
				'expected type object : ' . PHP_EOL
					. gettype($result[0])
			);
		}
	}//end test_get_order_path



}//end class component_select_lang_test
