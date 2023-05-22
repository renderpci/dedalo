<?php
declare(strict_types=1);
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;

// require_once dirname(dirname(__FILE__)). '/lib/vendor/autoload.php';
	require_once dirname(dirname(dirname(__FILE__))) . '/config/config.php';
	require_once dirname(dirname(__FILE__)) . '/login/login_Test.php';
	require_once 'data.php';
	require_once 'elements.php';

// check is development server. if not, throw to prevent malicious access
	if (!defined('DEVELOPMENT_SERVER') || DEVELOPMENT_SERVER!==true) {
		throw new Exception("Error. Only development servers can use this method", 1);
	}



final class component_text_area_test extends TestCase {



	public static $model		= 'component_text_area';
	public static $tipo			= 'test17';
	public static $section_tipo	= 'test3';



	/**
	* TEST_FORCE_CHANGE_LANG
	* @return void
	*/
	public function test_force_change_lang() {

		$model			= self::$model;
		$tipo			= 'rsc36';
		$section_tipo	= 'rsc167';
		$section_id		= 1;
		$mode			= 'edit';
		$lang			= 'lg-eng';

		$ar_related_by_model = common::get_ar_related_by_model(
			'component_select_lang',
			$tipo
		);
		$related_by_model_tipo = reset($ar_related_by_model);

		$this->assertTrue(
			$related_by_model_tipo==='rsc263',
			'expected tipo is rsc263, but received is: ' . to_string($related_by_model_tipo)
		);

		$component_select_lang = component_common::get_instance(
			'component_select_lang', // string model
			$related_by_model_tipo, // string tipo
			$section_id,
			'list',
			DEDALO_DATA_NOLAN,
			$section_tipo
		);
		$component_select_lang_dato	= (array)$component_select_lang->get_dato();
		$lang_locator				= $component_select_lang_dato[0];
		$target_lang				= lang::get_code_from_locator($lang_locator, true);

		$changed_lang = component_text_area::force_change_lang(
			$tipo,
			$section_id,
			$lang,
			$section_tipo
		);

		$this->assertTrue(
			$target_lang===$changed_lang,
			'expected target_lang is '.$target_lang.', but received (changed_lang) is: ' . to_string($changed_lang)
		);
	}//end test_force_change_lang



	/**
	* TEST_set_dato
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
			gettype($dato)==='array',
			'expected type is array, but received is: ' . gettype($dato)
		);
		$this->assertTrue(
			gettype($dato[0])==='NULL',
			'expected type is NULL, but received is: ' . gettype($dato[0])
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
	* TEST_get_valor_export
	* @return void
	*/
	public function test_get_valor_export() {

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

		$this->assertTrue(
			$value[0]===' text enclosed by tag ',
				'expected string:' . PHP_EOL
				.' text enclosed by tag ' . PHP_EOL
				.'but received:'. PHP_EOL
				.$value[0]
		);
		$this->assertTrue(
			$value[1]===12,
				'expected value[1] is 12:' . PHP_EOL
				.$value[1]
		);
		$this->assertTrue(
			$value[2]===101,
				'expected value[2] is 101:' . PHP_EOL
				.$value[2]
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
	* TEST_get_component_indexations
	* @return void
	*/
	public function test_get_component_indexations() {

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

		$value = $component->get_component_indexations();
			// dump($value, ' value ++ '.to_string());

		$this->assertTrue(
			$value===[],
				'expected value do not match:' . PHP_EOL
				.' expected: []' . PHP_EOL
				.' value: '.to_string($value)
		);
	}//end test_get_component_indexations





}//end class
