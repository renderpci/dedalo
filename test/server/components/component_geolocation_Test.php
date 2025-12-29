<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_geolocation_test extends BaseTestCase {



	public static $model		= 'component_geolocation';
	public static $tipo			= 'test100';
	public static $section_tipo	= 'test3';



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
	* TEST_set_data
	* @return void
	*/
	public function test_set_data() {

		$this->user_login();

		$component = $this->build_component_instance();

		$old_data = $component->get_data();

		// 1 - set null data
		$data	= null;
		$result	= $component->set_data($data);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$component->get_data()===NULL,
			'expected NULL : ' . PHP_EOL
				. to_string($component->get_data())
		);

		// 2 - set sample data
		$data = json_decode('[{
			"id": 3,
			"alt": 16,
			"lat": 28.760289075631214,
			"lon": -17.87981450557709,
			"zoom": 17,
			"lib_data": [
				{
					"layer_id": 1,
					"layer_data": {
						"type": "FeatureCollection",
						"features": [
							{
								"type": "Feature",
								"properties": {
									"layer_id": 1
								},
								"geometry": {
									"type": "Point",
									"coordinates": [
										-17.879337,
										28.760041
									]
								}
							},
							{
								"type": "Feature",
								"properties": {
									"layer_id": 1,
									"color": "#3388ff",
									"shape": "circle",
									"radius": 284.4954536589409
								},
								"geometry": {
									"type": "Point",
									"coordinates": [
										-17.879723,
										28.760324
									]
								}
							}
						]
					}
				}
			]
		}]');
		$component->set_data($data);

		$this->assertTrue(
			gettype($component->get_data())==='array',
			'expected type array : ' . PHP_EOL
				. gettype($component->get_data())
		);

		$this->assertTrue(
			$component->get_data()===$data,
			'expected equal : ' . PHP_EOL
				. to_string($component->get_data())
		);

		// 3 - restore data
		$result	= $component->set_data($old_data);

		$this->assertTrue(
			json_encode($component->get_data())===json_encode($old_data),
			'expected [] : ' . PHP_EOL
				. to_string($component->get_data())
		);
	}//end test_set_data



	/**
	* TEST_get_data
	* @return void
	*/
	public function test_get_data() {

		$this->user_login();

		$component = $this->build_component_instance();

		$result	= $component->get_data();

		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
			'expected type array|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_data



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

		if (!empty($component->get_data())) {
			$this->assertTrue(
				gettype($result)==='object',
				'expected type object : ' . PHP_EOL
					. gettype($result)
			);
		}
	}//end test_get_diffusion_value_socrata



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
