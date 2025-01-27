<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_security_access_test extends TestCase {



	public static $model		= 'component_security_access';
	public static $tipo			= 'test157';
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
				$component->dato===NULL,
				'expected null : ' . PHP_EOL
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
	* TEST_get_cache_tree_file_name
	* @return void
	*/
	public function test_get_cache_tree_file_name() {

		$component = $this->build_component_instance();

		$lang = DEDALO_DATA_LANG;

		$result = $component->get_cache_tree_file_name(
			$lang
		);

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$expected = 'cache_tree_'.$lang.'.json';
		$this->assertTrue(
			$result===$expected,
			'expected type string : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_cache_tree_file_name



	/**
	* TEST_get_datalist
	* @return void
	*/
	public function test_get_datalist() {

		$component = $this->build_component_instance();

		$user_id = logged_user_id();

		$result	= $component->get_datalist(
			$user_id
		);

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

			$reference = json_decode('
				{
					"tipo": "dd242",
					"section_tipo": "dd242",
					"model": "area_root",
					"label": "Catalogue",
					"parent": "dd1"
			    }
			');

			foreach ($reference as $key => $value) {
				$this->assertTrue(
					isset($result[0]->{$key}),
					'expected true ' . PHP_EOL
						. to_string( isset($result[0]->{$key}) )
				);
			}
		}
	}//end test_get_datalist



	/**
	* TEST_get_element_datalist
	* @return void
	*/
	public function test_get_element_datalist() {

		$component = $this->build_component_instance();

		$section_tipo = 'test3';

		$result	= $component->get_element_datalist(
			$section_tipo
		);

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

			$reference = json_decode('
				{
					"tipo": "test45",
					"section_tipo": "test3",
					"model": "section_group",
					"label": "<mark>components a-z</mark>",
					"parent": "test3"
			    }
			');

			foreach ($reference as $key => $value) {
				$this->assertTrue(
					isset($result[0]->{$key}),
					'expected true ' . PHP_EOL
						. to_string( isset($result[0]->{$key}) )
				);
			}
		}
	}//end test_get_element_datalist



	/**
	* TEST_get_children_recursive_security_acces
	* @return void
	*/
	public function test_get_children_recursive_security_acces() {

		$component = $this->build_component_instance();

		$tipo = 'test3';

		// $result	= component_security_access::get_children_recursive_security_acces(
		// 	$tipo
		// );
		// private method access. Note that this method saves !
		$result	= PHPUnitUtil::callMethod(
			$component,
			'get_children_recursive_security_acces',
			array(
				$tipo
			)
		);

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

			$reference = json_decode('
				{
					"tipo": "test45",
					"section_tipo": "test3",
					"model": "section_group",
					"label": "<mark>components a-z</mark>",
					"parent": "test3"
			    }
			');

			foreach ($reference as $key => $value) {
				$this->assertTrue(
					isset($result[0]->{$key}),
					'expected true ' . PHP_EOL
						. to_string( isset($result[0]->{$key}) )
				);
			}
		}
	}//end test_get_children_recursive_security_acces



	/**
	* TEST_get_ar_tipo_admin
	* @return void
	*/
	public function test_get_ar_tipo_admin() {

		$component = $this->build_component_instance();

		$tipo = 'test3';

		$result	= component_security_access::get_ar_tipo_admin();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);

		if (!empty($result)) {
			$this->assertTrue(
				gettype($result[0])==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result[0])
			);
		}
	}//end test_get_ar_tipo_admin



	/**
	* TEST_get_sortable
	* @return void
	*/
	public function test_get_sortable() {

		$component = $this->build_component_instance();

		$value = $component->get_sortable();

		$this->assertTrue(
			$value===false,
			'expected false : ' .PHP_EOL
				. to_string($value)
		);
	}//end test_get_sortable



}//end class component_security_access_test
