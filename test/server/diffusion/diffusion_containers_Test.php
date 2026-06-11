<?php declare(strict_types=1);
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

/**
* DIFFUSION_CONTAINERS_TEST
* Pure tests (no ontology) of the two canonical diffusion containers:
* diffusion_datum (datum-group, the wire unit) and diffusion_data_object
* (per-field value item / chain wrapper).
*/
final class diffusion_containers_Test extends BaseTestCase {

	public static $model = 'diffusion_datum';



	/**
	* TEST_DATUM_SETTERS_AND_HYDRATION
	*/
	public function test_datum_setters_and_hydration(): void {

		// setters
		$datum = new diffusion_datum();
			$datum->set_diffusion_tipo('oh77');
			$datum->set_section_tipo('oh1');
			$datum->set_term('interview');
			$datum->set_model('table');
			$datum->set_parent('oh70');
			$datum->set_context([]);
			$datum->set_data([]);

		$this->assertSame('oh77', $datum->get_diffusion_tipo());
		$this->assertSame('oh1', $datum->get_section_tipo());
		$this->assertSame('interview', $datum->get_term());
		$this->assertSame('table', $datum->get_model());
		$this->assertSame('oh70', $datum->get_parent());
		$this->assertSame([], $datum->get_context());
		$this->assertSame([], $datum->get_data());

		// constructor hydration produces the same object
		$hydrated = new diffusion_datum((object)[
			'diffusion_tipo'	=> 'oh77',
			'section_tipo'		=> 'oh1',
			'term'				=> 'interview',
			'model'				=> 'table',
			'parent'			=> 'oh70',
			'context'			=> [],
			'data'				=> []
		]);

		$this->assertSame(json_encode($datum), json_encode($hydrated));
	}//end test_datum_setters_and_hydration



	/**
	* TEST_DATUM_REJECTS_UNKNOWN_KEYS
	* The datum_group shape is a frozen contract: unknown constructor keys
	* throw under SHOW_DEBUG (always true in tests).
	*/
	public function test_datum_rejects_unknown_keys(): void {

		$this->expectException(InvalidArgumentException::class);

		new diffusion_datum((object)[
			'diffusion_tipo'	=> 'oh77',
			'no_such_key'		=> 'boom'
		]);
	}//end test_datum_rejects_unknown_keys



	/**
	* TEST_DATUM_HAS_NO_MAGIC_ACCESS
	* The silent-null magic __get was removed: undefined property access on
	* unset dynamic names must NOT resolve silently through magic methods.
	*/
	public function test_datum_has_no_magic_access(): void {

		$this->assertFalse(
			method_exists(diffusion_datum::class, '__get'),
			'diffusion_datum must not reintroduce magic __get (silent nulls)'
		);
		$this->assertFalse(
			method_exists(diffusion_datum::class, '__set'),
			'diffusion_datum must not reintroduce magic __set'
		);
	}//end test_datum_has_no_magic_access



	/**
	* TEST_DATA_OBJECT_INNER_ITEM_ROLE
	*/
	public function test_data_object_inner_item_role(): void {

		$item = new diffusion_data_object((object)[
			'tipo'	=> 'rsc85',
			'lang'	=> 'lg-eng',
			'value'	=> 'Some value',
			'id'	=> 'a'
		]);

		$this->assertSame('rsc85', $item->tipo);
		$this->assertSame('lg-eng', $item->lang);
		$this->assertSame('Some value', $item->value);
		$this->assertSame('a', $item->id);
		$this->assertSame([], $item->errors, 'Valid hydration must not collect errors');
	}//end test_data_object_inner_item_role



	/**
	* TEST_DATA_OBJECT_COLLECTS_ERRORS
	* Unknown keys are collected into $errors (not thrown): inner items flow
	* through the publish pipeline and must degrade, not abort.
	*/
	public function test_data_object_collects_errors(): void {

		$item = new diffusion_data_object((object)[
			'tipo'			=> 'rsc85',
			'value'			=> 'x',
			'unknown_key'	=> 'y'
		]);

		$this->assertNotEmpty($item->errors, 'Unknown key must be collected as error');
		$this->assertStringContainsString('unknown_key', $item->errors[0]);
	}//end test_data_object_collects_errors



	/**
	* TEST_DATA_OBJECT_WRAPPER_ROLE
	* The chain-processor wrapper shape: value holds inner items.
	*/
	public function test_data_object_wrapper_role(): void {

		$inner = new diffusion_data_object((object)[
			'tipo'	=> 'rsc85',
			'lang'	=> 'lg-eng',
			'value'	=> 'Inner',
			'id'	=> null
		]);

		$wrapper = new diffusion_data_object((object)[
			'diffusion_tipo'	=> 'oh85',
			'id'				=> 'a',
			'label'				=> 'Title',
			'term'				=> 'Title',
			'model'				=> 'component_input_text',
			'value'				=> [$inner]
		]);

		$this->assertSame('oh85', $wrapper->diffusion_tipo);
		$this->assertIsArray($wrapper->value);
		$this->assertSame('Inner', $wrapper->value[0]->value);
		$this->assertSame([], $wrapper->errors);
	}//end test_data_object_wrapper_role



}//end class diffusion_containers_Test
