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

		// Case 5: flat array with per-item lang (raw export format).
		// The lang property must be preserved to keep all the translations on round-trips
		$flat_multilang = '[{"iri":"https://dedalo.dev","id":1,"lang":"lg-eng"},{"iri":"https://dedalo.dev/es","id":1,"lang":"lg-spa"}]';
		$response = $component->conform_import_data($flat_multilang, self::$tipo);
		$this->assertTrue(empty($response->errors), 'Case 5 error: ' . to_string($response->errors));
		$this->assertCount(2, $response->result);
		$this->assertEquals('lg-eng', $response->result[0]->lang ?? null, 'expected lang preserved on first item');
		$this->assertEquals('lg-spa', $response->result[1]->lang ?? null, 'expected lang preserved on second item');

		// Case 6: non-string iri value must be rejected, not crash
		$response = $component->conform_import_data('[{"iri":["https://dedalo.dev"]}]', self::$tipo);
		$this->assertTrue(!empty($response->errors), 'Case 6: expected errors for non-string iri');
		$response = $component->conform_import_data('{"iri":{"nested":"object"}}', self::$tipo);
		$this->assertTrue(!empty($response->errors), 'Case 6b: expected errors for non-string iri object');
	}//end test_conform_import_data



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



	/**
	* TEST_is_empty
	* Generic check if given value is or not empty
	* @return void
	*/
	public function test_is_empty() {

		$component = $this->build_component_instance();

		// null case
		$result = $component->is_empty(null);
		$this->assertTrue($result, 'expected true for null');

		// non-object case (string)
		$result = $component->is_empty('https://dedalo.dev');
		$this->assertTrue($result, 'expected true for non-object');

		// non-object case (integer)
		$result = $component->is_empty(42);
		$this->assertTrue($result, 'expected true for non-object integer');

		// object with empty iri and title
		$empty_obj = (object)[
			'iri'	=> '',
			'title'	=> ''
		];
		$result = $component->is_empty($empty_obj);
		$this->assertTrue($result, 'expected true for object with empty iri and title');

		// object with non-empty iri
		$obj_with_iri = (object)[
			'iri'	=> 'https://dedalo.dev',
			'title'	=> ''
		];
		$result = $component->is_empty($obj_with_iri);
		$this->assertFalse($result, 'expected false for object with non-empty iri');

		// object with non-empty title
		$obj_with_title = (object)[
			'iri'	=> '',
			'title'	=> 'Dédalo'
		];
		$result = $component->is_empty($obj_with_title);
		$this->assertFalse($result, 'expected false for object with non-empty title');

		// object with iri = '0' (falsy but not empty)
		$obj_zero_iri = (object)[
			'iri'	=> '0',
			'title'	=> ''
		];
		$result = $component->is_empty($obj_zero_iri);
		$this->assertFalse($result, 'expected false for iri="0"');

		// object with other properties only (no iri/title)
		$obj_other = (object)[
			'id'	=> 1,
			'lang'	=> 'lg-eng'
		];
		$result = $component->is_empty($obj_other);
		$this->assertTrue($result, 'expected true for object without iri/title');
	}//end test_is_empty



	/**
	* TEST_set_data_empty
	* Verify set_data with null produces null get_data
	* @return void
	*/
	public function test_set_data_empty() {

		$component = $this->build_component_instance();

		$old_data = $component->get_data();

		// set empty data
		$result = $component->set_data(null);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$component->get_data()===null,
			'expected null after set_data(null) : ' . PHP_EOL
				. to_string($component->get_data())
		);

		// restore data
		$component->set_data($old_data);
	}//end test_set_data_empty



	/**
	* TEST_save_and_reload
	* Verify data persistence across save/reload cycle
	* @return void
	*/
	public function test_save_and_reload() {

		$component = $this->build_component_instance();

		$old_data = $component->get_data();

		// create new data
		$dd_iri = new dd_iri();
			$dd_iri->set_iri('https://dedalo.dev/test_save');
			$dd_iri->set_id(99);
			$dd_iri->set_title('Test save title');
		$new_data = [$dd_iri];

		// set and save
		$component->set_data($new_data);
		$save_result = $component->save();

		$this->assertTrue(
			gettype($save_result)==='boolean' || gettype($save_result)==='integer' || gettype($save_result)==='NULL',
			'expected type boolean|integer|null : ' . PHP_EOL
				. gettype($save_result)
		);

		// reload component
		$component2 = component_common::get_instance(
			self::$model,
			self::$tipo,
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			self::$section_tipo
		);

		$reloaded_data = $component2->get_data();

		$this->assertTrue(
			gettype($reloaded_data)==='array',
			'expected type array after reload : ' . PHP_EOL
				. gettype($reloaded_data)
		);

		// restore original data
		$component2->set_data($old_data);
		$component2->save();
	}//end test_save_and_reload



	/**
	* TEST_component_instance_modes
	* Verify component can be instantiated in edit, list, search modes
	* @return void
	*/
	public function test_component_instance_modes() {

		$modes = ['edit', 'list', 'search'];

		foreach ($modes as $mode) {

			$this->user_login();

			$component = component_common::get_instance(
				self::$model,
				self::$tipo,
				1,
				$mode,
				DEDALO_DATA_NOLAN,
				self::$section_tipo
			);

			$this->assertTrue(
				get_class($component)==='component_iri',
				"expected class component_iri for mode $mode"
			);

			$this->assertTrue(
				$component->mode===$mode,
				"expected mode $mode : " . $component->mode
			);
		}
	}//end test_component_instance_modes



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
			strpos($result, self::$tipo)!==false,
			'expected tipo in identifier : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_identifier



	/**
	* TEST_get_id_from_key_with_flat_array
	* Verify get_id_from_key works with the flat array data format
	* @return void
	*/
	public function test_get_id_from_key_with_flat_array() {
		$component = $this->build_component_instance();
		$component->set_lang('lg-eng');
		$sample_data = [
			(object)['id'=>1,'lang'=>'lg-eng','iri'=>'https://hello.org','title'=>'Hello'],
			(object)['id'=>2,'lang'=>'lg-eng','iri'=>'https://world.org','title'=>'World'],
			(object)['id'=>1,'lang'=>'lg-spa','iri'=>'https://hola.org','title'=>'Hola'],
			(object)['id'=>2,'lang'=>'lg-spa','iri'=>'https://mundo.org','title'=>'Mundo'],
		];
		$component->set_data($sample_data);
		unset($component->data_resolved);
		$this->assertEquals(1, $component->get_id_from_key(0));
		$this->assertEquals(2, $component->get_id_from_key(1));
		$this->assertNull($component->get_id_from_key(2));
		$this->assertEquals(1, $component->get_id_from_key(0,['lg-eng']));
		$this->assertNull($component->get_id_from_key(0,['lg-eng','lg-spa']));
		$component->set_data([]);
		unset($component->data_resolved);
		$this->assertNull($component->get_id_from_key(0));
	}//end test_get_id_from_key_with_flat_array

	/**
	* TEST_get_key_from_id_with_flat_array
	* Verify get_key_from_id works with the flat array data format
	* @return void
	*/
	public function test_get_key_from_id_with_flat_array() {
		$component = $this->build_component_instance();
		$component->set_lang('lg-eng');
		$sample_data = [
			(object)['id'=>1,'lang'=>'lg-eng','iri'=>'https://hello.org','title'=>'Hello'],
			(object)['id'=>2,'lang'=>'lg-eng','iri'=>'https://world.org','title'=>'World'],
			(object)['id'=>1,'lang'=>'lg-spa','iri'=>'https://hola.org','title'=>'Hola'],
			(object)['id'=>2,'lang'=>'lg-spa','iri'=>'https://mundo.org','title'=>'Mundo'],
		];
		$component->set_data($sample_data);
		unset($component->data_resolved);
		$this->assertEquals(0, $component->get_key_from_id(1,'lg-eng'));
		$this->assertEquals(1, $component->get_key_from_id(2,'lg-eng'));
		$this->assertEquals(0, $component->get_key_from_id(1,'lg-spa'));
		$this->assertNull($component->get_key_from_id(999,'lg-eng'));
		$this->assertNull($component->get_key_from_id(1,'lg-fra'));
	}//end test_get_key_from_id_with_flat_array

	/**
	* TEST_update_data_value_insert_with_key_resolves_id
	* Verify that insert action with key resolves id from other languages
	* @return void
	*/
	public function test_update_data_value_insert_with_key_resolves_id() {
		$this->user_login();
		$component = component_common::get_instance('component_iri','test140',1,'edit','lg-eng','test3',false);
		$component->set_data([(object)['id'=>1,'lang'=>'lg-spa','iri'=>'https://hola.org','title'=>'Hola']]);
		unset($component->data_resolved);
		$changed_data = (object)['action'=>'insert','id'=>null,'key'=>0,'value'=>(object)['iri'=>'https://hello.org','title'=>'Hello','lang'=>'lg-eng']];
		$component->set_lang('lg-eng');
		$this->assertTrue($component->update_data_value($changed_data));
		unset($component->data_resolved);
		$eng = array_values(array_filter($component->get_data(), fn($e)=>$e->lang==='lg-eng'));
		$this->assertCount(1,$eng);
		$this->assertEquals(1,$eng[0]->id);
		$component->set_data(null);
	}//end test_update_data_value_insert_with_key_resolves_id

	/**
	* TEST_update_data_value_update_with_null_id_resolves_from_key
	* Verify that update action with null id resolves it from key position
	* @return void
	*/
	public function test_update_data_value_update_with_null_id_resolves_from_key() {
		$this->user_login();
		$component = component_common::get_instance('component_iri','test140',1,'edit','lg-eng','test3',false);
		$component->set_data([
			(object)['id'=>1,'lang'=>'lg-eng','iri'=>'https://hello.org','title'=>'Hello'],
			(object)['id'=>1,'lang'=>'lg-spa','iri'=>'https://hola.org','title'=>'Hola'],
		]);
		$changed_data = (object)['action'=>'update','id'=>null,'key'=>0,'value'=>(object)['iri'=>'https://updated.org','title'=>'Hello Updated','lang'=>'lg-eng']];
		$component->set_lang('lg-eng');
		$this->assertTrue($component->update_data_value($changed_data));
		unset($component->data_resolved);
		$eng = array_values(array_filter($component->get_data(), fn($e)=>$e->lang==='lg-eng'));
		$this->assertCount(1,$eng);
		$this->assertEquals('https://updated.org',$eng[0]->iri);
		$this->assertEquals(1,$eng[0]->id);
		$component->set_data(null);
	}//end test_update_data_value_update_with_null_id_resolves_from_key

	/**
	* TEST_update_data_value_remove_across_all_languages
	* Verify that remove action deletes the entry across ALL languages
	* @return void
	*/
	public function test_update_data_value_remove_across_all_languages() {
		$this->user_login();
		$component = component_common::get_instance('component_iri','test140',1,'edit','lg-eng','test3',false);
		$component->set_data([
			(object)['id'=>1,'lang'=>'lg-eng','iri'=>'https://hello.org','title'=>'Hello'],
			(object)['id'=>2,'lang'=>'lg-eng','iri'=>'https://world.org','title'=>'World'],
			(object)['id'=>1,'lang'=>'lg-spa','iri'=>'https://hola.org','title'=>'Hola'],
			(object)['id'=>2,'lang'=>'lg-spa','iri'=>'https://mundo.org','title'=>'Mundo'],
		]);
		$changed_data = (object)['action'=>'remove','id'=>1,'value'=>null];
		$component->set_lang('lg-eng');
		$this->assertTrue($component->update_data_value($changed_data));
		unset($component->data_resolved);
		$all = $component->get_data();
		foreach($all as $entry){ $this->assertNotEquals(1,$entry->id); }
		$this->assertCount(2,$all);
		$component->set_data(null);
	}//end test_update_data_value_remove_across_all_languages

	/**
	* TEST_update_data_value_remove_null_id_clears_all
	* Verify that remove with null id clears ALL entries
	* @return void
	*/
	public function test_update_data_value_remove_null_id_clears_all() {
		$this->user_login();
		$component = component_common::get_instance('component_iri','test140',1,'edit','lg-eng','test3',false);
		$component->set_data([
			(object)['id'=>1,'lang'=>'lg-eng','iri'=>'https://hello.org','title'=>'Hello'],
			(object)['id'=>1,'lang'=>'lg-spa','iri'=>'https://hola.org','title'=>'Hola'],
		]);
		$changed_data = (object)['action'=>'remove','id'=>null,'value'=>null];
		$this->assertTrue($component->update_data_value($changed_data));
		unset($component->data_resolved);
		$this->assertEmpty($component->get_data());
		$component->set_data(null);
	}//end test_update_data_value_remove_null_id_clears_all

}//end class component_iri_test
