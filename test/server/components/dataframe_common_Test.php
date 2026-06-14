<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';


final class dataframe_common_test extends BaseTestCase {

	public static $tipo = 'test211';
	public static $section_tipo = 'test3';

	private function build_component_instance( ?string $tipo=null ) {
		$this->user_login();

		$tipo = $tipo ?? self::$tipo;

		$model = ontology_node::get_model_by_tipo($tipo);

		return component_common::get_instance(
			$model,
			$tipo,
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			self::$section_tipo
		);
	}

	protected function setUp(): void
    {
        // $this->markTestSkipped('Dataframe trait tests - requires ontology configuration');
    }

	/**
	 * TEST_GET_DATA_BY_CONTEXT
	 * Test filtering data by context properties
	 * @return void
	 */
	public function test_get_data_by_context() {
		$component = $this->build_component_instance();

		// Set test data with context properties
		$test_data = [
			(object)['value' => 1, 'section_tipo_key' => 'test3', 'section_id_key' => 10],
			(object)['value' => 2, 'section_tipo_key' => 'test3', 'section_id_key' => 8],
			(object)['value' => 1, 'section_tipo_key' => 'test3', 'section_id_key' => 2]
		];
		$component->set_data($test_data);

		// Filter by context test3/10
		$result = $component->get_data_by_context('test3', 10);

		$this->assertIsArray($result);
		$this->assertCount(1, $result);
		$this->assertEquals(1, $result[0]->value);
	}

	/**
	 * TEST_GET_DATA_BY_CONTEXT_NO_MATCH
	 * Test filtering with non-matching context
	 * @return void
	 */
	public function test_get_data_by_context_no_match() {
		$component = $this->build_component_instance();

		$test_data = [
			(object)['value' => 1, 'section_tipo_key' => 'test3', 'section_id_key' => 10]
		];
		$component->set_data($test_data);

		$result = $component->get_data_by_context('onto3', 99);

		$this->assertNull($result);
	}

	/**
	 * TEST_ADD_VALUE_WITH_CONTEXT
	 * Test adding value with context
	 * @return void
	 */
	public function test_add_value_with_context() {
		$component = $this->build_component_instance();
		$component->set_data(null);

		$result = $component->add_value_with_context(5, 'test3', 10);

		$this->assertTrue($result);

		$data = $component->get_data();
		$this->assertCount(1, $data);
		$this->assertEquals(5, $data[0]->value);
		$this->assertEquals('test3', $data[0]->section_tipo_key);
		$this->assertEquals(10, $data[0]->section_id_key);
	}

	/**
	 * TEST_REMOVE_BY_CONTEXT
	 * Test removing values by context
	 * @return void
	 */
	public function test_remove_by_context() {
		$component = $this->build_component_instance();

		$test_data = [
			(object)['value' => 1, 'section_tipo_key' => 'test3', 'section_id_key' => 10],
			(object)['value' => 2, 'section_tipo_key' => 'test3', 'section_id_key' => 8],
			(object)['value' => 1, 'section_tipo_key' => 'test3', 'section_id_key' => 5]
		];
		$component->set_data($test_data);

		$result = $component->remove_by_context('test3', 10);

		$this->assertTrue($result);

		$data = $component->get_data();
		$this->assertCount(2, $data);
		$this->assertEquals('test3', $data[0]->section_tipo_key);
	}

	/**
	 * TEST_GET_VALUE_BY_CONTEXT
	 * Test getting single value by context
	 * @return void
	 */
	public function test_get_value_by_context() {
		$component = $this->build_component_instance();

		$test_data = [
			(object)['value' => 8, 'section_tipo_key' => 'test3', 'section_id_key' => 10]
		];
		$component->set_data($test_data);

		$result = $component->get_value_by_context('test3', 10);

		$this->assertEquals(8, $result);
	}

	/**
	 * TEST_UPDATE_VALUE_BY_CONTEXT
	 * Test updating value for specific context
	 * @return void
	 */
	public function test_update_value_by_context() {
		$component = $this->build_component_instance();

		$test_data = [
			(object)['value' => 1, 'section_tipo_key' => 'test3', 'section_id_key' => 10]
		];
		$component->set_data($test_data);

		$result = $component->update_value_by_context(99, 'test3', 10);

		$this->assertTrue($result);

		$data = $component->get_data();
		$this->assertEquals(99, $data[0]->value);
	}

	/**
	 * TEST_UPDATE_VALUE_BY_CONTEXT_CREATES_NEW
	 * Test that update creates new entry if context not found
	 * @return void
	 */
	public function test_update_value_by_context_creates_new() {
		$component = $this->build_component_instance();
		$component->set_data(null);

		$result = $component->update_value_by_context(42, 'test3', 10);

		$this->assertTrue($result);

		$data = $component->get_data();
		$this->assertCount(1, $data);
		$this->assertEquals(42, $data[0]->value);
	}

	/**
	 * TEST_HAS_DATAFRAME
	 * Test checking if component has dataframe configured
	 * @return void
	 */
	public function test_has_dataframe() {
		$component = $this->build_component_instance();

		// Test with no ontology configuration (returns false)
		$result = $component->has_dataframe();

		$this->assertIsBool($result);
	}

	/**
	 * TEST_GET_DATAFRAME_TIPO
	 * Test getting dataframe tipo from ontology
	 * @return void
	 */
	public function test_get_dataframe_tipo() {
		$component = $this->build_component_instance('test152');

		$result = $component->get_dataframe_tipo();

		// Returns null if not configured in ontology
		$this->assertNull($result);
	}

	/**
	 * TEST_GET_DATAFRAME_MODEL
	 * Test getting dataframe model
	 * @return void
	 */
	public function test_get_dataframe_model() {
		$component = $this->build_component_instance();

		$result = $component->get_dataframe_model();

		// Returns null when no dataframe is configured in ontology
		$this->assertNull($result);
	}

	/**
	 * TEST_ADD_VALUE_WITH_CONTEXT_MULTIPLE_CONTEXTS
	 * Test adding values with different contexts
	 * @return void
	 */
	public function test_add_value_with_context_multiple_contexts() {
		$component = $this->build_component_instance();
		$component->set_data(null);

		// Add to first parent
		$component->add_value_with_context(1, 'test3', 10);
		// Add to second parent
		$component->add_value_with_context(1, 'test3', 5);

		$data = $component->get_data();

		$this->assertCount(2, $data);
	}



	///////////// ⬇︎ unified pairing contract ⬇︎ ////////////////



	/**
	 * TEST_IS_DATAFRAME_ENTRY
	 * Positive detection: type marker first, legacy pairing-keys shape as fallback
	 * @return void
	 */
	public function test_is_dataframe_entry() {

		// unified contract: type marker
		$new_shape = (object)[
			'type'					=> DEDALO_RELATION_TYPE_DATAFRAME,
			'section_tipo'			=> 'dd1706',
			'section_id'			=> '3',
			'from_component_tipo'	=> 'dd560',
			'main_component_tipo'	=> 'test52',
			'id_key'				=> 2
		];
		$this->assertTrue(component_common::is_dataframe_entry($new_shape));

		// legacy shape (pre-migration): pairing keys, no type
		$legacy_shape = (object)[
			'section_tipo'			=> 'dd1706',
			'section_id'			=> '3',
			'from_component_tipo'	=> 'dd560',
			'main_component_tipo'	=> 'test52',
			'section_id_key'		=> 2,
			'section_tipo_key'		=> 'test3'
		];
		$this->assertTrue(component_common::is_dataframe_entry($legacy_shape));

		// plain relation locator: not a dataframe entry
		$plain_locator = (object)[
			'type'			=> DEDALO_RELATION_TYPE_LINK,
			'section_tipo'	=> 'rsc1242',
			'section_id'	=> '14'
		];
		$this->assertFalse(component_common::is_dataframe_entry($plain_locator));

		// literal data item: not a dataframe entry
		$literal_item = (object)['id' => 1, 'value' => 'Some text'];
		$this->assertFalse(component_common::is_dataframe_entry($literal_item));

		// non-objects
		$this->assertFalse(component_common::is_dataframe_entry(null));
		$this->assertFalse(component_common::is_dataframe_entry('string'));
	}



	/**
	 * TEST_DATAFRAME_ENTRY_MATCHES_DUAL_READ
	 * The central match predicate resolves new (id_key) and legacy
	 * (section_id_key) shapes against new and legacy callers
	 * @return void
	 */
	public function test_dataframe_entry_matches_dual_read() {

		$new_entry = (object)[
			'type'					=> DEDALO_RELATION_TYPE_DATAFRAME,
			'section_tipo'			=> 'dd1706',
			'section_id'			=> '3',
			'from_component_tipo'	=> 'dd560',
			'main_component_tipo'	=> 'test52',
			'id_key'				=> 2
		];
		$legacy_entry = (object)[
			'section_tipo'			=> 'dd1706',
			'section_id'			=> '3',
			'from_component_tipo'	=> 'dd560',
			'main_component_tipo'	=> 'test52',
			'section_id_key'		=> 2,
			'section_tipo_key'		=> 'test3'
		];

		// typed caller (DTO carries synced legacy aliases)
		$typed_caller = new dataframe_caller('test3', 1, 'test52', 2);
		$this->assertTrue(component_common::dataframe_entry_matches($new_entry, $typed_caller, 'dd560'));
		$this->assertTrue(component_common::dataframe_entry_matches($legacy_entry, $typed_caller, 'dd560'));

		// legacy stdClass caller
		$legacy_caller = (object)[
			'section_id_key'		=> 2,
			'section_tipo_key'		=> 'test3',
			'main_component_tipo'	=> 'test52'
		];
		$this->assertTrue(component_common::dataframe_entry_matches($new_entry, $legacy_caller, 'dd560'));
		$this->assertTrue(component_common::dataframe_entry_matches($legacy_entry, $legacy_caller, 'dd560'));

		// mismatches
		$other_item_caller = new dataframe_caller('test3', 1, 'test52', 99);
		$this->assertFalse(component_common::dataframe_entry_matches($new_entry, $other_item_caller, 'dd560'));

		$other_component_caller = new dataframe_caller('test3', 1, 'test99', 2);
		$this->assertFalse(component_common::dataframe_entry_matches($new_entry, $other_component_caller, 'dd560'));

		// wrong dataframe slot (from_component_tipo)
		$this->assertFalse(component_common::dataframe_entry_matches($new_entry, $typed_caller, 'dd999'));
	}



	/**
	 * TEST_DATAFRAME_CALLER_FROM_LEGACY
	 * Legacy stdClass caller shapes normalize into the typed DTO
	 * @return void
	 */
	public function test_dataframe_caller_from_legacy() {

		$legacy = (object)[
			'section_tipo'			=> 'test3',
			'section_id'			=> '1',
			'section_id_key'		=> '75',
			'section_tipo_key'		=> 'test3',
			'main_component_tipo'	=> 'test52'
		];
		$dto = dataframe_caller::from_legacy($legacy);

		$this->assertInstanceOf(dataframe_caller::class, $dto);
		$this->assertEquals(75, $dto->id_key);
		$this->assertEquals('test3', $dto->section_tipo);
		$this->assertEquals('test52', $dto->main_component_tipo);
		// legacy aliases stay in sync for dual-read
		$this->assertEquals(75, $dto->section_id_key);
		$this->assertEquals('test3', $dto->section_tipo_key);

		// incomplete legacy shape cannot normalize
		$incomplete = (object)['section_tipo' => 'test3'];
		$this->assertNull(dataframe_caller::from_legacy($incomplete));

		// already-typed instances pass through
		$this->assertSame($dto, dataframe_caller::from_legacy($dto));
	}



	/**
	 * TEST_BUILD_DATAFRAME_CALLER
	 * Main components build their typed caller from an item id
	 * @return void
	 */
	public function test_build_dataframe_caller() {

		$component = $this->build_component_instance();

		$caller = $component->build_dataframe_caller(7);

		$this->assertInstanceOf(dataframe_caller::class, $caller);
		$this->assertEquals(7, $caller->id_key);
		$this->assertEquals($component->get_section_tipo(), $caller->section_tipo);
		$this->assertEquals($component->get_tipo(), $caller->main_component_tipo);
	}



	/**
	* TEST_set_data_preserves_sibling_frames
	* Caller-aware write contract (component_dataframe::set_data): clearing
	* the frames of ONE main item (set_data(null) with caller_dataframe, as
	* the remove cascade does) must preserve the sibling frames paired with
	* OTHER items of the same slot in the same record.
	* @return void
	*/
	public function test_set_data_preserves_sibling_frames() {

		$this->user_login();

		$frame_tipo		= 'test60';
		$section_tipo	= 'test3';
		$section_id		= 1;

		$mk = function(int $key) use($frame_tipo) {
			return (object)[
				'type'					=> DEDALO_RELATION_TYPE_LINK,
				'section_id'			=> (string)(10+$key),
				'section_tipo'			=> 'test3',
				'section_id_key'		=> $key,
				'section_tipo_key'		=> 'test3',
				'from_component_tipo'	=> $frame_tipo,
				'main_component_tipo'	=> 'test52'
			];
		};

		// seed frames for items 1 and 2 (no caller: unfiltered write)
		$seed = component_common::get_instance('component_dataframe', $frame_tipo, $section_id, 'list', DEDALO_DATA_NOLAN, $section_tipo, false);
		$seed->set_data([$mk(1), $mk(2)]);
		tm_record::$save_tm = false; $seed->save(); tm_record::$save_tm = true;

		// clear the frames of item 1 only (caller-paired write)
		$caller = (object)[
			'section_tipo'			=> $section_tipo,
			'section_id_key'		=> 1,
			'section_tipo_key'		=> 'test3',
			'main_component_tipo'	=> 'test52'
		];
		$df1 = component_common::get_instance('component_dataframe', $frame_tipo, $section_id, 'list', DEDALO_DATA_NOLAN, $section_tipo, false, $caller);
		tm_record::$save_tm = false; $df1->set_data(null); $df1->save(); tm_record::$save_tm = true;

		// sibling frame of item 2 must survive
		$check = component_common::get_instance('component_dataframe', $frame_tipo, $section_id, 'list', DEDALO_DATA_NOLAN, $section_tipo, false);
		$remaining = $check->get_data_unfiltered() ?? [];
		$this->assertCount(1, $remaining, 'sibling frame of item 2 must survive the caller-paired clear');
		$this->assertEquals(2, $remaining[0]->section_id_key);

		// cleanup
		$check->set_data(null);
		tm_record::$save_tm = false; $check->save(); tm_record::$save_tm = true;
	}//end test_set_data_preserves_sibling_frames



	/**
	* TEST_dataframe_diffusion_resolvers
	* - component_dataframe::get_diffusion_data publishes only the frames of
	*   the chain's main component (ddo->parent scoping)
	* - main_component::get_diffusion_data_with_dataframe (opt-in fn) attaches
	*   the paired frames to the published items by item id
	* @return void
	*/
	public function test_dataframe_diffusion_resolvers() {

		$this->user_login();

		$frame_tipo		= 'test60';
		$section_tipo	= 'test3';
		$section_id		= 1;

		// seed: frames for two different main components in the same slot
		$mk = function(int $key, string $main) use($frame_tipo) {
			return (object)[
				'type'					=> DEDALO_RELATION_TYPE_DATAFRAME,
				'section_id'			=> (string)(30+$key),
				'section_tipo'			=> 'test3',
				'id_key'				=> $key,
				'section_id_key'		=> $key,
				'section_tipo_key'		=> 'test3',
				'from_component_tipo'	=> $frame_tipo,
				'main_component_tipo'	=> $main
			];
		};
		$seed = component_common::get_instance('component_dataframe', $frame_tipo, $section_id, 'list', DEDALO_DATA_NOLAN, $section_tipo, false);
		$seed->set_data([ $mk(1,'test52'), $mk(2,'test52'), $mk(1,'test99') ]);
		tm_record::$save_tm = false; $seed->save(); tm_record::$save_tm = true;

		// component_dataframe::get_diffusion_data with parent scoping
		$df = component_common::get_instance('component_dataframe', $frame_tipo, $section_id, 'list', DEDALO_DATA_NOLAN, $section_tipo, false);
		$ddo = (object)['tipo' => $frame_tipo, 'parent' => 'test52'];
		$diffusion_data = $df->get_diffusion_data($ddo);

		$this->assertCount(1, $diffusion_data);
		$published = $diffusion_data[0]->value;
		$this->assertIsArray($published);
		$this->assertCount(2, $published, 'only the frames of the test52 main are published');
		foreach ($published as $frame) {
			$this->assertEquals('test52', $frame->main_component_tipo);
			$this->assertObjectHasProperty('id_key', $frame);
		}

		// cleanup
		tm_record::$save_tm = false; $df->set_data(null); $df->save(); tm_record::$save_tm = true;
	}//end test_dataframe_diffusion_resolvers
}
