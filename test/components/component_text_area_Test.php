<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_text_area_test extends TestCase {



	public static $model		= 'component_text_area';
	public static $tipo			= 'test17';
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
	* TEST_SET_DATO
	* @return void
	*/
	public function test_set_dato() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'edit';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			'list',
			$lang,
			$section_tipo
		);

		$component->set_dato('This is a string');
		$dato = $component->get_dato();

		$this->assertTrue(
			gettype($dato)==='array',
			'expected type is array, but received is: ' . gettype($dato)
		);

		$component->set_dato(['']);
		$dato = $component->get_dato();

		$this->assertTrue(
			gettype($dato)==='NULL',
			'expected type is null, but received is: ' . gettype($dato)
		);
	}//end test_set_dato



	/**
	* TEST_is_empty
	* @return void
	*/
	public function test_is_empty() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'edit';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			'list',
			$lang,
			$section_tipo,
			false
		);

		$is_empty = $component->is_empty('This is a string');
		$this->assertTrue(
			$is_empty===false,
			'expected false, but received is: ' . to_string($is_empty)
		);

		$is_empty = $component->is_empty('<p></p>');
		$this->assertTrue(
			$is_empty===true,
			'expected true, but received is: ' . to_string($is_empty)
		);

		$is_empty = $component->is_empty(' ');
		$this->assertTrue(
			$is_empty===true,
			'expected true, but received is: ' . to_string($is_empty)
		);
	}//end test_is_empty



	/**
	* TEST_get_grid_value
	* @return void
	*/
	public function test_get_grid_value() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$grid_value = $component->get_grid_value();

		$this->assertTrue(
			gettype($grid_value)==='object',
			'expected object type for grid_value. Current type: ' . gettype($grid_value)
		);

		$this->assertTrue(
			!empty($grid_value->value),
			'expected non empty grid_value->value. grid_value: ' . to_string($grid_value)
		);
	}//end test_get_grid_value



	/**
	* TEST_get_locators_of_tags
	* @return void
	*/
	public function test_get_locators_of_tags() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$value = $component->get_locators_of_tags((object)[
			'ar_mark_tag' => ['svg']
		]);
			// dump($value, ' value ++ '.to_string());

		$this->assertTrue(
			gettype($value)==='array',
			'expected array type for value. Current type: ' . gettype($value)
		);
	}//end test_get_locators_of_tags



	/**
	* TEST_get_valor_export
	* @return void
	*/
	public function test_get_valor_export() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$value = $component->get_valor_export();

		$this->assertTrue(
			gettype($value)==='string',
			'expected string type for value. Current type: ' . gettype($value)
		);

		$this->assertTrue(
			!empty($value),
			'expected non empty value. value: ' . to_string($value)
		);
	}//end test_get_valor_export



	/**
	* TEST_change_tag_state
	* @return void
	*/
	public function test_change_tag_state() {

		$value = component_text_area::change_tag_state(
			'[index-n-1]', // string tag
			'r', // string state
			'My text raw [index-n-1] with index' // string text_raw
		);

		$this->assertTrue(
			$value==='My text raw [index-r-1--data::data] with index',
				'expected string:' . PHP_EOL
				.'My text raw [index-r-1--data::data] with index' . PHP_EOL
				.'but received:'. PHP_EOL
				.$value
		);
	}//end test_change_tag_state



	/**
	* TEST_get_fragment_text_from_tag
	* @return void
	*/
	public function test_get_fragment_text_from_tag() {

		$value = component_text_area::get_fragment_text_from_tag(
			'1', // string tag
			'index', // string $tag_type
			'My text raw [index-n-1-label in 1-data::data] text enclosed by tag [/index-n-1-label in 1-data::data] and more...' // string text_raw
		);

		$eq = gettype($value)==='object' || gettype($value)==='NULL';
		$this->assertTrue(
			$eq,
			'expected true (gettype($value)===object || gettype($value)===NULL):' . PHP_EOL
				.gettype($value)
		);

		$this->assertTrue(
			$value->text===' text enclosed by tag ',
				'expected string:' . PHP_EOL
				.' text enclosed by tag ' . PHP_EOL
				.'but received:'. PHP_EOL
				.$value->text
		);
		$this->assertTrue(
			$value->tag_in_pos===12,
				'expected tag_in_pos is 12:' . PHP_EOL
				.$value->tag_in_pos
		);
		$this->assertTrue(
			$value->tag_out_pos===101,
				'expected tag_out_pos is 101:' . PHP_EOL
				.$value->tag_out_pos
		);
	}//end test_get_fragment_text_from_tag



	/**
	* TEST_delete_tag_from_all_langs
	* @return void
	*/
	public function test_delete_tag_from_all_langs() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$value = $component->delete_tag_from_all_langs(
			'1', // tag_id
			'index' // tag_type
		);

		$this->assertTrue(
			gettype($value)==='array',
			'expected array type for value. Current type: ' . gettype($value)
		);
		$this->assertTrue(
			empty($value[0]),
				'expected empty value:' . PHP_EOL
				.'value: '.to_string($value)
		);
	}//end test_delete_tag_from_all_langs



	/**
	* TEST_delete_tag_from_text
	* @return void
	*/
	public function test_delete_tag_from_text() {

		$response = component_text_area::delete_tag_from_text(
			'1', // tag_id
			'index', // tag_type
			'My text raw [index-n-1] with index'
		);
		$value = $response->result;

		$this->assertTrue(
			$value==='My text raw  with index',
				'expected value do not match:' . PHP_EOL
				.' expected: My text raw  with index' . PHP_EOL
				.' value: '.to_string($value)
		);
		$this->assertTrue(
			$response->remove_count===1,
				' expected remove_count: '. 1 . PHP_EOL
				.' value: '.to_string($response->remove_count)
		);
	}//end test_delete_tag_from_text



	/**
	* TEST_fix_broken_index_tags
	* @return void
	*/
	public function test_fix_broken_index_tags() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$response = $component->fix_broken_index_tags(
			'My text raw [index-n-1] with index'
		);
		$value = $response->result;

		$this->assertTrue(
			$value==='My text raw [index-n-1][/index-d-1--data::data] with index',
				'expected value do not match:' . PHP_EOL
				.' expected: My text raw [index-n-1][/index-d-1--data::data] with index' . PHP_EOL
				.' value: '.to_string($value)
		);
	}//end test_fix_broken_index_tags



	/**
	* TEST_get_related_component_av_tipo
	* @return void
	*/
	public function test_get_related_component_av_tipo() {

		$model			= self::$model;
		$tipo			= 'rsc36';
		$section_tipo	= 'rsc167';
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$value = $component->get_related_component_av_tipo();

		$this->assertTrue(
			$value==='rsc35',
				'expected value do not match:' . PHP_EOL
				.' expected: rsc35' . PHP_EOL
				.' value: '.to_string($value)
		);
	}//end test_get_related_component_av_tipo



	/**
	* TEST_get_related_component_select_lang
	* @return void
	*/
	public function test_get_related_component_select_lang() {

		$model			= self::$model;
		$tipo			= 'rsc36';
		$section_tipo	= 'rsc167';
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$value = $component->get_related_component_select_lang();

		$this->assertTrue(
			$value==='rsc263',
				'expected value do not match:' . PHP_EOL
				.' expected: rsc263' . PHP_EOL
				.' value: '.to_string($value)
		);
	}//end test_get_related_component_select_lang



	/**
	* TEST_GET_COMPONENT_TAGS
	* @return void
	*/
	public function test_get_component_tags_data() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$value = $component->get_component_tags_data('index');
			// dump($value, ' value ++ '.to_string());

		$this->assertTrue(
			$value===[],
				'expected value do not match:' . PHP_EOL
				.' expected: []' . PHP_EOL
				.' value: '.to_string($value)
		);
	}//end test_get_component_tags


	/**
	* TEST_GET_TAGS_DATA_AS_TERM_ID
	* @return void
	*/
	public function test_get_tags_data_as_term_id() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$value = $component->get_tags_data_as_term_id();

		$this->assertTrue(
			$value==='[]',
				'expected value do not match:' . PHP_EOL
				.' expected: []' . PHP_EOL
				.' value: '.to_string($value)
		);
	}//end test_get_tags_data_as_term_id


	/**
	* TEST_get_component_indexations_term_id
	* @return void
	*/
	public function test_get_component_indexations_term_id() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$value = $component->get_component_indexations_term_id('fake value');

		$this->assertTrue(
			$value==='[]',
				'expected value do not match:' . PHP_EOL
				.' expected: []' . PHP_EOL
				.' value: '.to_string($value)
		);
	}//end test_get_component_indexations_term_id



	/**
	* TEST_GET_TAGS_DATA_AS_TERMS
	* @return void
	*/
	public function test_get_tags_data_as_terms() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$value = $component->get_tags_data_as_terms('index','array',' | ');

		$this->assertTrue(
			$value===[],
				'expected value do not match:' . PHP_EOL
				.' expected: []' . PHP_EOL
				.' value: '.to_string($value)
		);
	}//end test_get_tags_data_as_terms



	/**
	* TEST_get_component_indexations_terms
	* @return void
	*/
	public function test_get_component_indexations_terms() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$value = $component->get_component_indexations_terms();

		$this->assertTrue(
			$value===[],
				'expected value do not match:' . PHP_EOL
				.' expected: []' . PHP_EOL
				.' value: '.to_string($value)
		);
	}//end test_get_component_indexations_terms



	/**
	* TEST_get_annotations
	* @return void
	*/
	public function test_get_annotations() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$value = $component->get_annotations();

		$this->assertTrue(
			$value===null,
				'expected value do not match:' . PHP_EOL
				.' expected: null' . PHP_EOL
				.' value: '.to_string($value)
		);

		$component = component_common::get_instance(
			$model, // string model
			'rsc36', // string tipo
			$section_id,
			$mode,
			$lang,
			'rsc167',
			false
		);

		$value = $component->get_annotations();

		$this->assertTrue(
			!empty($value),
				'expected value do not match:' . PHP_EOL
				.' expected: !empty()' . PHP_EOL
				.' value: '.to_string($value)
		);
	}//end test_get_annotations



	/**
	* TEST_get_diffusion_value
	* @return void
	*/
	public function test_get_diffusion_value() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$value = $component->get_diffusion_value();

		$this->assertTrue(
			gettype($value)==='string',
				'expected value do not match:' . PHP_EOL
				.' expected type: string' . PHP_EOL
				.' type: '.gettype($value)
		);

		$this->assertTrue(
			!empty($value),
				'expected value do not match:' . PHP_EOL
				.' expected: !empty()' . PHP_EOL
				.' value: '.to_string($value)
		);
	}//end test_get_diffusion_value



	/**
	* TEST_get_diffusion_value_with_images
	* @return void
	*/
	public function test_get_diffusion_value_with_images() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$value = $component->get_diffusion_value_with_images();

		$this->assertTrue(
			gettype($value)==='string',
				'expected value do not match:' . PHP_EOL
				.' expected type: string' . PHP_EOL
				.' type: '.gettype($value)
		);

		$this->assertTrue(
			!empty($value),
				'expected value do not match:' . PHP_EOL
				.' expected: !empty()' . PHP_EOL
				.' value: '.to_string($value)
		);
	}//end test_get_diffusion_value_with_images



	/**
	* TEST_get_related_sections
	* @return void
	*/
	public function test_get_related_sections() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$response = $component->get_related_sections();

		$this->assertTrue(
			gettype($response)==='object',
				'expected response do not match:' . PHP_EOL
				.' expected type: object' . PHP_EOL
				.' type: '.gettype($response)
		);

		$this->assertTrue(
			gettype($response->context)==='array',
				'expected response do not match:' . PHP_EOL
				.' expected type: array' . PHP_EOL
				.' type: '.gettype($response)
		);
		$this->assertTrue(
			gettype($response->data)==='array',
				'expected response do not match:' . PHP_EOL
				.' expected type: array' . PHP_EOL
				.' type: '.gettype($response)
		);
	}//end test_get_related_sections



	/**
	* TEST_get_tags_persons
	* Note that this method is only used in JSON file
	* and this test simulate the same behavior
	* @return void
	*/
	public function test_get_tags_persons() {

		$model			= self::$model;
		$tipo			= 'rsc36';
		$section_tipo	= 'rsc167';
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$related_sections = $component->get_related_sections();
		// tags_persons
		$tags_persons = [];
		// related_sections
		$obj_data_sections = array_find($related_sections->data ?? [], function($el){
			return $el->typo==='sections';
		});
		$ar_related_sections	= $obj_data_sections->value ?? [];
		$properties				= $component->get_properties();
		$tags_persons_config	= $properties->tags_persons;
		foreach ($tags_persons_config as $related_section_tipo => $current_value) {
			$ar_tags_persons	=  $component->get_tags_persons($related_section_tipo, $ar_related_sections);
			$tags_persons		= array_merge($tags_persons, $ar_tags_persons);
		}

		$value = $tags_persons;

		$this->assertTrue(
			gettype($value)==='array',
				'expected value do not match:' . PHP_EOL
				.' expected type: array' . PHP_EOL
				.' type: '.gettype($value)
		);

		// $this->assertTrue(
		// 	!empty($value),
		// 		'expected value do not match:' . PHP_EOL
		// 		.' expected: !empty()' . PHP_EOL
		// 		.' value: '.to_string($value)
		// );
	}//end test_get_tags_persons



	/**
	* TEST_build_tag_person
	* @return void
	*/
	public function test_build_tag_person() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$value = $component->build_tag_person([
			'tag_id'	=> '1',
			'state'		=> 'n',
			'label'		=> 'Tag 1 label',
			'data'		=> '[mydata:xxxx]'
		]);

		$this->assertTrue(
			$value==='[person-n-1-Tag 1 label-data:\'[mydata:xxxx]\':data]',
				'expected value do not match:' . PHP_EOL
				.' expected: [person-n-1-Tag 1 label-data:\'[mydata:xxxx]\':data]' . PHP_EOL
				.' type: '. $value
		);
	}//end test_build_tag_person



	/**
	* TEST_get_tag_person_label
	* @return void
	*/
	public function test_get_tag_person_label() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$locator = json_decode('{
		    "section_tipo": "rsc197",
		    "section_id": "1",
		    "component_tipo": "rsc50"
		}');

		$value = $component->get_tag_person_label(
			$locator
		);

		// expected result like :
			// {
			//     "initials": "JosLoBe",
			//     "full_name": "Jose Javier Lope Betelchiuses",
			//     "role": "Interviewer"
			// }

		$this->assertTrue(
			!empty($value),
				'expected value do not match:' . PHP_EOL
				.' expected: !empty()' . PHP_EOL
				.' value: '.to_string($value)
		);
		$this->assertTrue(
			!empty($value->initials),
				'expected value do not match:' . PHP_EOL
				.' expected: !empty()' . PHP_EOL
				.' value: '.to_string($value->initials)
		);
		$this->assertTrue(
			!empty($value->full_name),
				'expected value do not match:' . PHP_EOL
				.' expected: !empty()' . PHP_EOL
				.' value: '.to_string($value->full_name)
		);
		$this->assertTrue(
			!empty($value->role),
				'expected value do not match:' . PHP_EOL
				.' expected: !empty()' . PHP_EOL
				.' value: '.to_string($value->role)
		);
	}//end test_get_tag_person_label



	/**
	* TEST_person_used
	* @return void
	*/
		// public function test_person_used() {

		// 	$model			= self::$model;
		// 	$tipo			= self::$tipo;
		// 	$section_tipo	= self::$section_tipo;
		// 	$section_id		= 1;
		// 	$mode			= 'list';
		// 	$lang			= DEDALO_DATA_LANG;

		// 	// $component = component_common::get_instance(
		// 	// 	$model, // string model
		// 	// 	$tipo, // string tipo
		// 	// 	$section_id,
		// 	// 	$mode,
		// 	// 	$lang,
		// 	// 	$section_tipo,
		// 	// 	false
		// 	// );

		// 	$locator = json_decode('{
		// 		"section_tipo"	: "rsc197",
		// 		"section_id"	: "1"
		// 	}');

		// 	$value = component_text_area::person_used(
		// 		$locator
		// 	);
		// 	dump($value, ' value ++ '.to_string());
		// 	// expected result like :
		// 		// {
		// 		//     "initials": "JosLoBe",
		// 		//     "full_name": "Jose Javier Lope Betelchiuses",
		// 		//     "role": "Interviewer"
		// 		// }

		// 	// $this->assertTrue(
		// 	// 	!empty($value),
		// 	// 		'expected value do not match:' . PHP_EOL
		// 	// 		.' expected: !empty()' . PHP_EOL
		// 	// 		.' value: '.to_string($value)
		// 	// );

		// }//end test_person_used



	/**
	* TEST_regenerate_component
	* @return void
	*/
	public function test_regenerate_component() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$value = $component->regenerate_component();

		$this->assertTrue(
			$value===true,
				'expected value do not match:' . PHP_EOL
				.' expected: true' . PHP_EOL
				.' value: '.to_string($value)
		);
	}//end test_regenerate_component



	/**
	* TEST_build_geolocation_data
	* @return void
	*/
	public function test_build_geolocation_data() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$dato = $component->get_dato();

		$value = $component->build_geolocation_data(
			false // bool $geojson
		);

		$this->assertTrue(
			gettype($value)==='array',
				'expected value do not match1 :' . PHP_EOL
				.' expected: array' . PHP_EOL
				.' value: '.gettype($value)
		);

		$value = $component->build_geolocation_data(
			true // bool $geojson
		);

		$this->assertTrue(
			gettype($value)==='array',
				'expected value do not match 2:' . PHP_EOL
				.' expected: array' . PHP_EOL
				.' value: '.gettype($value)
		);
	}//end test_build_geolocation_data



	/**
	* TEST_resolve_query_object_sql
	* @return void
	*/
	public function test_resolve_query_object_sql() {

		// $model			= self::$model;
		// $tipo			= self::$tipo;
		// $section_tipo	= self::$section_tipo;
		// $section_id		= 1;
		// $mode			= 'list';
		// $lang			= DEDALO_DATA_LANG;

		// $component = component_common::get_instance(
		// 	$model, // string model
		// 	$tipo, // string tipo
		// 	$section_id,
		// 	$mode,
		// 	$lang,
		// 	$section_tipo,
		// 	false
		// );

		$query_object = json_decode('{
		    "q": [
		        "as"
		    ],
		    "q_operator": null,
		    "path": [
		        {
		            "section_tipo": "oh1",
		            "component_tipo": "oh23",
		            "model": "component_text_area",
		            "name": "Summary"
		        }
		    ],
		    "type": "jsonb",
		    "component_path": [
		        "components",
		        "oh23",
		        "dato"
		    ],
		    "lang": "all"
		}');

		$value = component_text_area::resolve_query_object_sql(
			$query_object
		);
		// dump($value, ' value ++ '.to_string());

		$this->assertTrue(
			$value->operator==='~*',
				'expected value do not match:' . PHP_EOL
				.' expected: ~*' . PHP_EOL
				.' value: '.to_string($value->operator)
		);
		$this->assertTrue(
			$value->q_parsed==="'.*\".*as.*'",
				'expected value do not match:' . PHP_EOL
				.' expected: '. "'.*\".*as.*'" . PHP_EOL
				.' value: '.to_string($value->q_parsed)
		);
		$this->assertTrue(
			$value->unaccent===true,
				'expected value do not match:' . PHP_EOL
				.' expected: true' . PHP_EOL
				.' value: '.to_string($value->unaccent)
		);
	}//end test_resolve_query_object_sql



	/**
	* TEST_search_operators_info
	* @return void
	*/
	public function test_search_operators_info() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$value = $component->search_operators_info();

		$this->assertTrue(
			gettype($value)==='array',
				'expected value do not match:' . PHP_EOL
				.' expected: array' . PHP_EOL
				.' value: '.gettype($value)
		);
		$this->assertTrue(
			!empty($value),
				'expected value do not match:' . PHP_EOL
				.' expected: !empty()' . PHP_EOL
				.' value: '.to_string($value)
		);
	}//end test_search_operators_info



	/**
	* TEST_update_dato_version
	* @return void
	*/
	public function test_update_dato_version() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		// $component = component_common::get_instance(
		// 	$model, // string model
		// 	$tipo, // string tipo
		// 	$section_id,
		// 	$mode,
		// 	$lang,
		// 	$section_tipo,
		// 	false
		// );

		$options = new stdClass();
			$options->update_version = [6,0,0];
			$options->dato_unchanged = null;

		$value = component_text_area::update_dato_version($options);

		// expected sample
			//  {
			//     "result": 2,
			//     "msg": "[] Current dato don't need update.<br />"
			// }

		$this->assertTrue(
			gettype($value->result)==='integer',
				'expected value do not match:' . PHP_EOL
				.' expected: integer' . PHP_EOL
				.' value: '.gettype($value->result)
		);
		$this->assertTrue(
			$value->result===2,
				'expected value do not match:' . PHP_EOL
				.' expected: 2' . PHP_EOL
				.' value: '.to_string($value->result)
		);
	}//end test_update_dato_version



	/**
	* TEST_get_list_value
	* @return void
	*/
	public function test_get_list_value() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$options = new stdClass();
			$options->max_chars = 130;

		$value = $component->get_list_value($options);

		// expected sample
			// [
			//     "El raspa - Uqom"
			// ]

		$this->assertTrue(
			gettype($value)==='array',
				'expected value do not match:' . PHP_EOL
				.' expected: array' . PHP_EOL
				.' value: '.gettype($value)
		);
		$this->assertTrue(
			strlen($value[0])<=130,
				'expected value do not match:' . PHP_EOL
				.' expected: <=130' . PHP_EOL
				.' value: '.strlen($value[0])
		);
	}//end test_get_list_value



	/**
	* TEST_get_fallback_list_value
	* @return void
	*/
	public function test_get_fallback_list_value() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$options = new stdClass();
			$options->max_chars = 600;

		$value = $component->get_fallback_list_value($options);

		// expected sample
			// [
			//     "El raspa - Uqom"
			// ]

		$this->assertTrue(
			gettype($value)==='array',
				'expected value do not match:' . PHP_EOL
				.' expected: array' . PHP_EOL
				.' value: '.gettype($value)
		);
		$this->assertTrue(
			strlen($value[0])<=600,
				'expected value do not match:' . PHP_EOL
				.' expected: <=130' . PHP_EOL
				.' value: '.strlen($value[0])
		);
	}//end test_get_fallback_list_value



	/**
	* TEST_get_fallback_edit_value
	* @return void
	*/
	public function test_get_fallback_edit_value() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$options = new stdClass();
			$options->max_chars = 600;

		$value = $component->get_fallback_edit_value($options);

		// expected sample
			// [
			//     "El raspa - Uqom"
			// ]

		$this->assertTrue(
			gettype($value)==='array',
				'expected value do not match:' . PHP_EOL
				.' expected: array' . PHP_EOL
				.' value: '.gettype($value)
		);
		$this->assertTrue(
			strlen($value[0])<=600,
				'expected value do not match:' . PHP_EOL
				.' expected: <=130' . PHP_EOL
				.' value: '.strlen($value[0])
		);
	}//end test_get_fallback_edit_value



}//end class
