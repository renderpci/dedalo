<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_iri_test extends BaseTestCase {



	public static $model		= 'component_iri';
	public static $tipo			= 'test140';
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
	* TEST_set_data
	* @return void
	*/
	public function test_set_data() {

		$component = $this->build_component_instance();

		$old_data = $component->get_data();

		$data	= null;
		$result	= $component->set_data($data);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$component->get_data()===null,
			'expected null : ' . PHP_EOL
				. to_string($component->get_data())
		);

		// restore data
		$result	= $component->set_data($old_data);

		$this->assertTrue(
			json_encode($component->get_data())===json_encode($old_data),
			'expected original data : ' . PHP_EOL
				. to_string($component->get_data())
		);

		// dd_iri
		$iri	= 'https://dedalo.dev';
		$id		= 2;
		$title	= 'Dédalo site';
		$dd_iri = new dd_iri();
			$dd_iri->set_iri($iri);
			$dd_iri->set_id($id);
			$dd_iri->set_title($title);

		$this->assertTrue(
			gettype($dd_iri)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($dd_iri)
		);

		$this->assertTrue(
			get_class($dd_iri)==='dd_iri',
			'expected class dd_iri : ' . PHP_EOL
				. get_class($dd_iri)
		);

		$this->assertTrue(
			$dd_iri->iri === $iri,
			'expected: ' . $iri . PHP_EOL
				. to_string($dd_iri->iri)
		);

		$this->assertTrue(
			gettype($dd_iri->id)==='integer',
			'expected type integer : ' . PHP_EOL
				. gettype($dd_iri->id)
		);

		$this->assertTrue(
			$dd_iri->id === $id,
			'expected: ' . $id . PHP_EOL
				. to_string($dd_iri->id)
		);

		$this->assertTrue(
			gettype($dd_iri->title)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($dd_iri->title)
		);

		$this->assertTrue(
			$dd_iri->title===$title,
			'expected : ' . $title . PHP_EOL
				. $dd_iri->title
		);
	}//end test_set_data



	/**
	* TEST_save
	* @return void
	*/
	public function test_save() {

		$component = $this->build_component_instance();

		$result	= $component->save();

		$this->assertTrue(
			gettype($result)==='boolean' || gettype($result)==='integer' || gettype($result)==='NULL',
			'expected type boolean|integer|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_save



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
	* TEST_get_value
	* @return void
	*/
	public function test_get_value() {

		$component = $this->build_component_instance();

		$result = $component->get_value();

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_value



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
			        "iri"
			    ],
			    "lang": "all"
			}
		');

		$result = component_iri::resolve_query_object_sql( $query_object );

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

		// Case 1: Simple URL string
		$response = $component->conform_import_data(
			"https://elraspa.org", // import_value
			self::$tipo // column_name
		);
		$this->assertTrue(empty($response->errors), 'Case 1 error: ' . to_string($response->errors));
		$this->assertIsArray($response->result);
		$this->assertEquals('https://elraspa.org', $response->result[0]->iri);

		// Case 2: JSON object
		$json_obj = '{"iri":"https://dedalo.dev", "title":"Dedalo"}';
		$response = $component->conform_import_data($json_obj, self::$tipo);
		$this->assertTrue(empty($response->errors), 'Case 2 error: ' . to_string($response->errors));
		$this->assertEquals('https://dedalo.dev', $response->result[0]->iri);

		// Case 3: JSON translatable
		$json_trans = '{"lg-spa":[{"iri":"https://dedalo.dev"}]}';
		$response = $component->conform_import_data($json_trans, self::$tipo);
		$this->assertTrue(empty($response->errors), 'Case 3 error: ' . to_string($response->errors));
		$this->assertIsObject($response->result);
		$this->assertEquals('https://dedalo.dev', $response->result->{'lg-spa'}[0]->iri);

		// Case 4: Multiple values with separators
		$multi_string = 'Dedalo, https://dedalo.dev | Wikidata, https://wikidata.org';
		$response = $component->conform_import_data($multi_string, self::$tipo);
		$this->assertTrue(empty($response->errors), 'Case 4 error: ' . to_string($response->errors));
		$this->assertCount(2, $response->result);
		$this->assertEquals('https://dedalo.dev', $response->result[0]->iri);
		$this->assertEquals('https://wikidata.org', $response->result[1]->iri);
	}//end test_conform_import_data




	/**
	* TEST_search_operators_info
	* @return void
	*/
	public function test_search_operators_info() {

		$component = $this->build_component_instance();

		$result = $component->search_operators_info();

		$this->assertIsArray($result);
		$this->assertArrayHasKey('*', $result);
		$this->assertEquals('contains', $result['*text*']);
	}//end test_search_operators_info



	/**
	* TEST_update_data_version
	* @return void
	*/
	public function test_update_data_version() {

		$options = (object)[
			'update_version' => 1,
			'data_unchanged' => [],
			'tipo' => self::$tipo,
			'section_id' => 1,
			'section_tipo' => self::$section_tipo
		];

		$result = component_iri::update_data_version($options);

		$this->assertIsObject($result);
		$this->assertObjectHasProperty('result', $result);
	}//end test_update_data_version



	/**
	* TEST_resolve_title
	* @return void
	*/
	public function test_resolve_title() {

		$component = $this->build_component_instance();

		// Case 1: Title from data object (no dataframe)
		$data = (object)[
			'id' => 999999, // probably non-existent id to avoid dataframe overlap
			'iri' => 'https://dedalo.dev',
			'title' => 'Dedalo'
		];

		$result = $component->resolve_title($data);

		// If dataframe returns null/empty, it should fallback to 'Dedalo'
		$this->assertTrue($result === 'Dedalo' || $result === '', "Result: '$result'");
	}//end test_resolve_title



	/**
	* TEST_has_protocol
	* @return void
	*/
	public function test_has_protocol() {

		$component = $this->build_component_instance();

		$result = PHPUnitUtil::callMethod($component, 'has_protocol', ['https://dedalo.dev']);
		$this->assertTrue($result);

		$result = PHPUnitUtil::callMethod($component, 'has_protocol', ['http://dedalo.dev']);
		$this->assertTrue($result);

		$result = PHPUnitUtil::callMethod($component, 'has_protocol', ['ftp://dedalo.dev']);
		$this->assertFalse($result);

		$result = PHPUnitUtil::callMethod($component, 'has_protocol', ['dedalo.dev']);
		$this->assertFalse($result);
	}//end test_has_protocol



	/**
	* TEST_get_properties
	* @return void
	*/
	public function test_get_properties() {

		$component = $this->build_component_instance();

		$result = $component->get_properties();

		$this->assertIsObject($result);
		// Check if it has the injected dataframe properties
		// The code injects source->request_config
		$this->assertObjectHasProperty('source', $result);
		$this->assertObjectHasProperty('request_config', $result->source);
		$this->assertIsArray($result->source->request_config);
	}//end test_get_properties



	/**
	* TEST_import_save
	* @return void
	*/
	public function test_import_save() {

		$component = $this->build_component_instance();

		$result = $component->import_save();

		$this->assertTrue(
			gettype($result)==='boolean' || gettype($result)==='integer' || gettype($result)==='NULL',
			'expected type boolean|integer|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_import_save



	/**
	* TEST_save_label_dataframe
	* @return void
	*/
	public function test_save_label_dataframe() {

		$options = (object)[
			'section_tipo'      => self::$section_tipo,
			'section_id'        => '1',
			'component_tipo'    => self::$tipo,
			'section_id_key'    => 1,
			'target_section_id' => '1'
		];

		$result = component_iri::save_label_dataframe($options);

		$this->assertIsBool($result);
	}//end test_save_label_dataframe



}//end class component_iri_test
