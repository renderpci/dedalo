<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_filter_test extends TestCase {



	public static $model		= 'component_filter';
	public static $tipo			= 'test101';
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

		$result	= $component->get_dato();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
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

		if (security::is_global_admin(TEST_USER_ID)) {
			$this->assertTrue(
				$component->dato===[],
				'expected [] : ' . PHP_EOL
					. to_string($component->dato)
			);
		}else{
			$this->assertTrue(
				count($component->dato)>0,
				'expected > 0 : ' . PHP_EOL
					. to_string($component->dato) . PHP_EOL
					. count($component->dato)
			);
		}

		// restore dato
		$result	= $component->set_dato($old_dato);

		$this->assertTrue(
			json_encode($component->dato)===json_encode($old_dato),
			'expected [] : ' . PHP_EOL
				. to_string($component->dato)
		);
	}//end test_set_dato



	/**
	* TEST_set_dato_default
	* @return void
	*/
	public function test_set_dato_default() {

		$component = $this->build_component_instance();

		$result	= $component->set_dato_default();

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			gettype($component->dato)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($component->dato)
		);
	}//end test_set_dato_default



	/**
	* TEST_get_default_dato_for_user
	* @return void
	*/
	public function test_get_default_dato_for_user() {

		$component = $this->build_component_instance();

		$result	= $component->get_default_dato_for_user(
			1
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_default_dato_for_user



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
	* TEST_propagate_filter
	* @return void
	*/
	public function test_propagate_filter() {

		$component = $this->build_component_instance();

		$result	= $component->propagate_filter();

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_propagate_filter



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
	* TEST_get_datalist
	* @return void
	*/
	public function test_get_datalist() {

		$component = $this->build_component_instance();

		$result = $component->get_datalist();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			gettype($result[0])==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result[0])
		);
	}//end test_get_datalist



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
	* TEST_get_ar_target_section_tipo
	* @return void
	*/
	public function test_get_ar_target_section_tipo() {

		$component = $this->build_component_instance();

		$result = $component->get_ar_target_section_tipo();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_ar_target_section_tipo



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



	/**
	* TEST_get_list_value
	* @return void
	*/
	public function test_get_list_value() {

		$component = $this->build_component_instance();

		$component_tipo	= self::$tipo;
		$section_tipo	= self::$section_tipo;

		$result = $component->get_list_value(
			$component_tipo,
			$section_tipo
		);

		// sample result:
			// [
			//     "Eleven",
			//     "Fourteen"
			// ]

		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
			'expected type array|null : ' . PHP_EOL
				. gettype($result)
		);

		if (!empty($result)) {
			$this->assertTrue(
				gettype($result[0])==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result[0])
			);
		}
	}//end test_get_list_value



}//end class component_filter_test
