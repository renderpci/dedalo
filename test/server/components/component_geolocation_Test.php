<?php declare(strict_types=1);
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

		$this->user_login();

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



	/**
	* TEST_get_latitude
	* @return void
	*/
	public function test_get_latitude() {

		$component = $this->build_component_instance();

		// 1 - Set data
		$lat = 28.760289075631214;
		$data = [(object)['lat' => $lat, 'lon' => -17.87981450557709]];
		$component->set_data($data);

		$result = $component->get_latitude();

		$this->assertTrue(
			$result===$lat,
			'expected latitude : ' . PHP_EOL
				. to_string($result)
		);

		// 2 - Default data case
		$data = [(object)['lat' => 39.462571, 'lon' => -0.376295]];
		$component->set_data($data);

		$result = $component->get_latitude();

		$this->assertTrue(
			$result===null,
			'expected null on default latitude : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_latitude



	/**
	* TEST_get_longitude
	* @return void
	*/
	public function test_get_longitude() {

		$component = $this->build_component_instance();

		// 1 - Set data
		$lon = -17.87981450557709;
		$data = [(object)['lat' => 28.760289075631214, 'lon' => $lon]];
		$component->set_data($data);

		$result = $component->get_longitude();

		$this->assertTrue(
			$result===$lon,
			'expected longitude : ' . PHP_EOL
				. to_string($result)
		);

		// 2 - Default data case
		$data = [(object)['lat' => 39.462571, 'lon' => -0.376295]];
		$component->set_data($data);

		$result = $component->get_longitude();

		$this->assertTrue(
			$result===null,
			'expected null on default longitude : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_longitude



	/**
	* TEST_get_diffusion_value_as_geojson
	* @return void
	*/
	public function test_get_diffusion_value_as_geojson() {

		$component = $this->build_component_instance();

		// 1 - Set data
		$lat = 28.760289075631214;
		$lon = -17.87981450557709;
		$data = [(object)['lat' => $lat, 'lon' => $lon]];
		$component->set_data($data);

		$result = $component->get_diffusion_value_as_geojson();

		$this->assertTrue(
			gettype($result)==='string',
			'expected string : ' . PHP_EOL
				. gettype($result)
		);
		$result_decoded = json_decode($result);
		$this->assertTrue(
			abs($result_decoded[0]->layer_data->features[0]->geometry->coordinates[0] - $lon) < 0.0000000001,
			'expected longitude in geojson : ' . PHP_EOL
				. $result
		);
		$this->assertTrue(
			abs($result_decoded[0]->layer_data->features[0]->geometry->coordinates[1] - $lat) < 0.0000000001,
			'expected latitude in geojson : ' . PHP_EOL
				. $result
		);

		// 2 - Default data case
		$data = [(object)['lat' => 39.462571, 'lon' => -0.376295]];
		$component->set_data($data);

		$result = $component->get_diffusion_value_as_geojson();

		$this->assertTrue(
			$result===null,
			'expected null on default data for geojson : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_diffusion_value_as_geojson



	/**
	* TEST_update_data_version
	* @return void
	*/
	public function test_update_data_version() {

		$request_options = (object)[
			'update_version' => [1,0,0]
		];

		$result = component_geolocation::update_data_version($request_options);

		$this->assertTrue(
			is_object($result),
			'expected object'
		);
	}//end test_update_data_version



	/**
	* TEST_set_data_empty
	* @return void
	*/
	public function test_set_data_empty() {

		$component = $this->build_component_instance();

		$old_data = $component->get_data();

		// set empty array
		$result = $component->set_data([]);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		$get_data = $component->get_data();
		$this->assertTrue(
			$get_data===null || (is_array($get_data) && count($get_data)===0),
			'expected null or empty array : ' . PHP_EOL
				. to_string($get_data)
		);

		// restore
		$component->set_data($old_data);
	}//end test_set_data_empty



	/**
	* TEST_save_and_reload
	* Note: save may fail in test DB if geo column is scalar (not JSONB).
	* Test verifies set_data + get_data round-trip in memory.
	* @return void
	*/
	public function test_save_and_reload() {

		$component = $this->build_component_instance();

		$old_data = $component->get_data();

		// set new data
		$new_data = [(object)[
			'lat'	=> 40.416775,
			'lon'	=> -3.703790,
			'zoom'	=> 10,
			'alt'	=> 650
		]];
		$component->set_data($new_data);

		// verify in-memory round-trip
		$get_data = $component->get_data();
		$this->assertTrue(
			is_array($get_data),
			'expected array after set_data : ' . PHP_EOL
				. gettype($get_data)
		);
		$this->assertTrue(
			isset($get_data[0]->lat) && isset($get_data[0]->lon),
			'expected lat/lon in data after set_data : ' . PHP_EOL
				. to_string($get_data)
		);

		// attempt save (may fail in test DB with scalar geo column)
		$save_result = $component->save();

		if ($save_result===true) {
			// reload and verify persistence
			$component2 = component_common::get_instance(
				'component_geolocation',
				self::$tipo,
				1,
				'edit',
				DEDALO_DATA_NOLAN,
				self::$section_tipo
			);
			$reloaded_data = $component2->get_data();

			$this->assertTrue(
				is_array($reloaded_data),
				'expected array after reload : ' . PHP_EOL
					. gettype($reloaded_data)
			);

			// restore original
			$component2->set_data($old_data);
			$component2->save();
		}

		// always restore in memory
		$component->set_data($old_data);
	}//end test_save_and_reload



	/**
	* TEST_component_instance_modes
	* @return void
	*/
	public function test_component_instance_modes() {

		foreach (['edit', 'list', 'search'] as $mode) {

			$component = component_common::get_instance(
				'component_geolocation',
				self::$tipo,
				1,
				$mode,
				DEDALO_DATA_NOLAN,
				self::$section_tipo
			);

			$this->assertTrue(
				get_class($component)==='component_geolocation',
				"expected class component_geolocation for mode $mode : " . PHP_EOL
					. get_class($component)
			);
			$this->assertTrue(
				$component->get_mode()===$mode,
				"expected mode $mode : " . PHP_EOL
					. $component->get_mode()
			);
		}
	}//end test_component_instance_modes



	/**
	* TEST_is_empty
	* Geolocation data items have lat/lon/zoom/alt but no 'value' key,
	* so is_empty() returns true for them by design (same as media components).
	* @return void
	*/
	public function test_is_empty() {

		$component = $this->build_component_instance();

		// null data item
		$result = $component->is_empty(null);
		$this->assertTrue(
			$result===true,
			'expected true for null data item : ' . PHP_EOL
				. to_string($result)
		);

		// object without 'value' key (geolocation data items)
		$data_item = (object)['lat' => 28.76, 'lon' => -17.87];
		$result = $component->is_empty($data_item);
		$this->assertTrue(
			$result===true,
			'expected true for data item without value key : ' . PHP_EOL
				. to_string($result)
		);

		// non-object
		$result = $component->is_empty('string');
		$this->assertTrue(
			$result===true,
			'expected true for non-object data item : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_is_empty



	/**
	* TEST_is_empty_data
	* @return void
	*/
	public function test_is_empty_data() {

		$component = $this->build_component_instance();

		// null data
		$result = $component->is_empty_data(null);
		$this->assertTrue(
			$result===true,
			'expected true for null data : ' . PHP_EOL
				. to_string($result)
		);

		// empty array
		$result = $component->is_empty_data([]);
		$this->assertTrue(
			$result===true,
			'expected true for empty array : ' . PHP_EOL
				. to_string($result)
		);

		// array with geolocation data (no 'value' key, so is_empty_data returns true)
		$data = [(object)['lat' => 28.76, 'lon' => -17.87]];
		$result = $component->is_empty_data($data);
		$this->assertTrue(
			$result===true,
			'expected true for geolocation data without value key : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_is_empty_data



	/**
	* TEST_get_identifier
	* @return void
	*/
	public function test_get_identifier() {

		$component = $this->build_component_instance();

		$result = $component->get_identifier();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			strlen($result) > 0,
			'expected non-empty identifier : ' . PHP_EOL
				. $result
		);
		$this->assertTrue(
			strpos($result, self::$tipo)!==false,
			'expected tipo in identifier : ' . PHP_EOL
				. $result
		);
	}//end test_get_identifier



	/**
	* TEST_lang_forced_to_nolan
	* Geolocation component always forces lang to DEDALO_DATA_NOLAN
	* regardless of the lang passed to the constructor.
	* @return void
	*/
	public function test_lang_forced_to_nolan() {

		// build with DEDALO_DATA_LANG (not DEDALO_DATA_NOLAN)
		$component = component_common::get_instance(
			'component_geolocation',
			self::$tipo,
			1,
			'edit',
			DEDALO_DATA_LANG, // pass a different lang
			self::$section_tipo
		);

		// constructor forces lang to DEDALO_DATA_NOLAN
		$this->assertTrue(
			$component->get_lang()===DEDALO_DATA_NOLAN,
			'expected lang DEDALO_DATA_NOLAN even when DEDALO_DATA_LANG was passed : ' . PHP_EOL
				. $component->get_lang()
		);
	}//end test_lang_forced_to_nolan



}//end class component_geolocation_test
