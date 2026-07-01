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
	 * TEST_GET_DATA_BY_ID_KEY
	 * Test filtering inline data by the unified id_key pairing key
	 * @return void
	 */
	public function test_get_data_by_id_key() {
		$component = $this->build_component_instance();

		// Set test data paired by id (the main item id; stored as `id`, paired via id_key)
		$test_data = [
			(object)['value' => 1, 'id' => 10],
			(object)['value' => 2, 'id' => 8],
			(object)['value' => 1, 'id' => 2]
		];
		$component->set_data($test_data);

		// Filter by id_key 10 (resolves to the item whose `id` === 10)
		$result = $component->get_data_by_id_key(10);

		$this->assertIsArray($result);
		$this->assertCount(1, $result);
		$this->assertEquals(1, $result[0]->value);
	}

	/**
	 * TEST_GET_DATA_BY_ID_KEY_NO_MATCH
	 * Test filtering with a non-matching id_key
	 * @return void
	 */
	public function test_get_data_by_id_key_no_match() {
		$component = $this->build_component_instance();

		$test_data = [
			(object)['value' => 1, 'id' => 10]
		];
		$component->set_data($test_data);

		$result = $component->get_data_by_id_key(99);

		$this->assertNull($result);
	}

	/**
	 * TEST_ADD_VALUE_BY_ID_KEY
	 * Test adding a value paired by id_key
	 * @return void
	 */
	public function test_add_value_by_id_key() {
		$component = $this->build_component_instance();
		$component->set_data(null);

		$result = $component->add_value_by_id_key(5, 10);

		$this->assertTrue($result);

		$data = $component->get_data();
		$this->assertCount(1, $data);
		$this->assertEquals(5, $data[0]->value);
		$this->assertEquals(10, $data[0]->id);
	}

	/**
	 * TEST_REMOVE_BY_ID_KEY
	 * Test removing values by id_key
	 * @return void
	 */
	public function test_remove_by_id_key() {
		$component = $this->build_component_instance();

		$test_data = [
			(object)['value' => 1, 'id' => 10],
			(object)['value' => 2, 'id' => 8],
			(object)['value' => 1, 'id' => 5]
		];
		$component->set_data($test_data);

		$result = $component->remove_by_id_key(10);

		$this->assertTrue($result);

		$data = $component->get_data();
		$this->assertCount(2, $data);
		$this->assertEquals(8, $data[0]->id);
	}

	/**
	 * TEST_GET_VALUE_BY_ID_KEY
	 * Test getting a single value by id_key
	 * @return void
	 */
	public function test_get_value_by_id_key() {
		$component = $this->build_component_instance();

		$test_data = [
			(object)['value' => 8, 'id' => 10]
		];
		$component->set_data($test_data);

		$result = $component->get_value_by_id_key(10);

		$this->assertEquals(8, $result);
	}

	/**
	 * TEST_UPDATE_VALUE_BY_ID_KEY
	 * Test updating the value for a specific id_key.
	 * Regression: the item must be updated IN PLACE — no duplicate appended, the
	 * item count stays the same, and the item `id` is preserved. (Pre-fix the
	 * trait matched on `id_key` instead of `id`, so the existing item was never
	 * found and add_value_by_id_key appended a duplicate on every update.)
	 * @return void
	 */
	public function test_update_value_by_id_key() {
		$component = $this->build_component_instance();

		$test_data = [
			(object)['value' => 1, 'id' => 10],
			(object)['value' => 7, 'id' => 11]
		];
		$component->set_data($test_data);

		$result = $component->update_value_by_id_key(99, 10);

		$this->assertTrue($result);

		$data = $component->get_data();
		// no duplicate: count unchanged
		$this->assertCount(2, $data);
		// the targeted item's value changed and its id is preserved
		$updated = null;
		foreach ($data as $item) {
			if ((int)$item->id === 10) {
				$updated = $item;
			}
		}
		$this->assertNotNull($updated);
		$this->assertEquals(99, $updated->value);
		$this->assertEquals(10, $updated->id);
		// the sibling item is untouched
		$other = null;
		foreach ($data as $item) {
			if ((int)$item->id === 11) {
				$other = $item;
			}
		}
		$this->assertNotNull($other);
		$this->assertEquals(7, $other->value);
	}

	/**
	 * TEST_UPDATE_VALUE_BY_ID_KEY_CREATES_NEW
	 * Test that update creates a new entry when the id_key is not found
	 * @return void
	 */
	public function test_update_value_by_id_key_creates_new() {
		$component = $this->build_component_instance();
		$component->set_data(null);

		$result = $component->update_value_by_id_key(42, 10);

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
	 * TEST_ADD_VALUE_BY_ID_KEY_MULTIPLE
	 * Test adding values paired to different main items (id_key)
	 * @return void
	 */
	public function test_add_value_by_id_key_multiple() {
		$component = $this->build_component_instance();
		$component->set_data(null);

		// Add paired to first parent-link item
		$component->add_value_by_id_key(1, 10);
		// Add paired to second parent-link item
		$component->add_value_by_id_key(1, 5);

		$data = $component->get_data();

		$this->assertCount(2, $data);
	}



	///////////// ⬇︎ unified pairing contract ⬇︎ ////////////////



	/**
	 * TEST_IS_DATAFRAME_ENTRY
	 * Positive detection is type-only (dd490). Dual-read removed: a legacy
	 * pairing-keys shape with no type is NOT detected.
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

		// legacy shape (pre-migration): pairing keys, no type — NOT detected now
		$legacy_shape = (object)[
			'section_tipo'			=> 'dd1706',
			'section_id'			=> '3',
			'from_component_tipo'	=> 'dd560',
			'main_component_tipo'	=> 'test52',
			'section_id_key'		=> 2,
			'section_tipo_key'		=> 'test3'
		];
		$this->assertFalse(component_common::is_dataframe_entry($legacy_shape));

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
	 * TEST_DATAFRAME_ENTRY_MATCHES
	 * The central match predicate is id_key-only: only type+id_key entries match,
	 * and only callers carrying id_key. Legacy (section_id_key, no type) shapes no
	 * longer match (dual-read removed) — migrate first.
	 * @return void
	 */
	public function test_dataframe_entry_matches() {

		$new_entry = (object)[
			'type'					=> DEDALO_RELATION_TYPE_DATAFRAME,
			'section_tipo'			=> 'dd1706',
			'section_id'			=> '3',
			'from_component_tipo'	=> 'dd560',
			'main_component_tipo'	=> 'test52',
			'id_key'				=> 2
		];
		// legacy entry: no type, no id_key — not a dataframe entry anymore
		$legacy_entry = (object)[
			'section_tipo'			=> 'dd1706',
			'section_id'			=> '3',
			'from_component_tipo'	=> 'dd560',
			'main_component_tipo'	=> 'test52',
			'section_id_key'		=> 2,
			'section_tipo_key'		=> 'test3'
		];

		// typed caller (id_key)
		$typed_caller = new dataframe_caller('test3', 1, 'test52', 2);
		$this->assertTrue(component_common::dataframe_entry_matches($new_entry, $typed_caller, 'dd560'));
		// legacy entry no longer matches (no type / no id_key)
		$this->assertFalse(component_common::dataframe_entry_matches($legacy_entry, $typed_caller, 'dd560'));

		// a caller without id_key cannot match anything
		$keyless_caller = (object)[
			'main_component_tipo'	=> 'test52'
		];
		$this->assertFalse(component_common::dataframe_entry_matches($new_entry, $keyless_caller, 'dd560'));

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
	 * An untyped stdClass caller normalizes into the typed DTO (id_key only;
	 * legacy section_id_key/section_tipo_key are no longer read here)
	 * @return void
	 */
	public function test_dataframe_caller_from_legacy() {

		$untyped = (object)[
			'section_tipo'			=> 'test3',
			'section_id'			=> '1',
			'id_key'				=> '75',
			'main_component_tipo'	=> 'test52'
		];
		$dto = dataframe_caller::from_legacy($untyped);

		$this->assertInstanceOf(dataframe_caller::class, $dto);
		$this->assertEquals(75, $dto->id_key);
		$this->assertEquals('test3', $dto->section_tipo);
		$this->assertEquals('test52', $dto->main_component_tipo);

		// a legacy section_id_key-only shape no longer normalizes (id_key absent)
		$legacy = (object)[
			'section_tipo'			=> 'test3',
			'section_id_key'		=> '75',
			'section_tipo_key'		=> 'test3',
			'main_component_tipo'	=> 'test52'
		];
		$this->assertNull(dataframe_caller::from_legacy($legacy));

		// incomplete shape cannot normalize
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
				'type'					=> DEDALO_RELATION_TYPE_DATAFRAME,
				'section_id'			=> (string)(10+$key),
				'section_tipo'			=> 'test3',
				'id_key'				=> $key,
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
			'id_key'				=> 1,
			'main_component_tipo'	=> 'test52'
		];
		$df1 = component_common::get_instance('component_dataframe', $frame_tipo, $section_id, 'list', DEDALO_DATA_NOLAN, $section_tipo, false, $caller);
		tm_record::$save_tm = false; $df1->set_data(null); $df1->save(); tm_record::$save_tm = true;

		// sibling frame of item 2 must survive
		$check = component_common::get_instance('component_dataframe', $frame_tipo, $section_id, 'list', DEDALO_DATA_NOLAN, $section_tipo, false);
		$remaining = $check->get_data_unfiltered() ?? [];
		$this->assertCount(1, $remaining, 'sibling frame of item 2 must survive the caller-paired clear');
		$this->assertEquals(2, $remaining[0]->id_key);

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
