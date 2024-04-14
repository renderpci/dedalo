<?php
declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_pdf_test extends TestCase {



	public static $model		= 'component_pdf';
	public static $tipo			= 'test85';
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



	/**
	* TEST_get_ar_quality
	* @return void
	*/
	public function test_get_ar_quality() {

		$component = $this->build_component_instance();

		$result = $component->get_ar_quality();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===DEDALO_PDF_AR_QUALITY,
			'expected DEDALO_PDF_AR_QUALITY ' . PHP_EOL
				. json_encode($result)
		);
	}//end test_get_ar_quality



	/**
	* TEST_get_default_quality
	* @return void
	*/
	public function test_get_default_quality() {

		$component = $this->build_component_instance();

		$result = $component->get_default_quality();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===DEDALO_PDF_QUALITY_DEFAULT,
			'expected DEDALO_PDF_QUALITY_DEFAULT ' . PHP_EOL
				. json_encode($result)
		);
	}//end test_get_default_quality



	/**
	* TEST_get_original_quality
	* @return void
	*/
	public function test_get_original_quality() {

		$component = $this->build_component_instance();

		$result = $component->get_original_quality();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===DEDALO_PDF_QUALITY_ORIGINAL,
			'expected DEDALO_PDF_QUALITY_ORIGINAL ' . PHP_EOL
				. json_encode($result)
		);
	}//end test_get_original_quality



	/**
	* TEST_get_extension
	* @return void
	*/
	public function test_get_extension() {

		$component = $this->build_component_instance();

		$result = $component->get_extension();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===DEDALO_PDF_EXTENSION,
			'expected DEDALO_PDF_EXTENSION ' . PHP_EOL
				. json_encode($result)
		);

		// set custom value
		$component->extension = 'kyt';

		$result = $component->get_extension();

		$this->assertTrue(
			$result==='kyt',
			'expected kyt ' . PHP_EOL
				. json_encode($result)
		);

		// restore extension
		$component->extension = DEDALO_PDF_EXTENSION;
	}//end test_get_extension



	/**
	* TEST_get_allowed_extensions
	* @return void
	*/
	public function test_get_allowed_extensions() {

		$component = $this->build_component_instance();

		$result = $component->get_allowed_extensions();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===DEDALO_PDF_EXTENSIONS_SUPPORTED,
			'expected DEDALO_PDF_EXTENSIONS_SUPPORTED ' . PHP_EOL
				. json_encode($result)
		);
	}//end test_get_allowed_extensions



	/**
	* TEST_get_folder
	* @return void
	*/
	public function test_get_folder() {

		$component = $this->build_component_instance();

		$result = $component->get_folder();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===DEDALO_PDF_FOLDER,
			'expected DEDALO_PDF_FOLDER ' . PHP_EOL
				. json_encode($result)
		);

		$original_folder = $component->get_folder();

		// set custom

		$component->folder = '/atke';

		$result = $component->get_folder();

		$this->assertTrue(
			$result==='/atke',
			'expected /atke ' . PHP_EOL
				. json_encode($result)
		);

		// restore
		$component->folder = $original_folder;
	}//end test_get_folder



	/**
	* TEST_get_thumb_quality
	* @return void
	*/
	public function test_get_thumb_quality() {

		$component = $this->build_component_instance();

		$result = $component->get_thumb_quality();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===DEDALO_PDF_THUMB_DEFAULT,
			'expected DEDALO_PDF_THUMB_DEFAULT ' . PHP_EOL
				. json_encode($result)
		);
	}//end test_get_thumb_quality



	/**
	* TEST_get_grid_value
	* @return void
	*/
	public function test_get_grid_value() {

		$component = $this->build_component_instance();

		$result = $component->get_grid_value();

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_grid_value



	/**
	* TEST_get_valor_export
	* @return void
	*/
	public function test_get_valor_export() {

		$component = $this->build_component_instance();

		$result = $component->get_valor_export();

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_valor_export



	/**
	* TEST_get_related_component_text_area_tipo
	* @return void
	*/
	public function test_get_related_component_text_area_tipo() {

		$component = $this->build_component_instance();

		$result = $component->get_related_component_text_area_tipo();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			$result[0]==='test97',
			'expected test97 : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_related_component_text_area_tipo



	/**
	* TEST_get_url
	* @return void
	*/
	public function test_get_url() {

		$component = $this->build_component_instance();

		$result = $component->get_url();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			strpos($result, 'http')!==0,
			'unexpected http protocol in relative URL : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_url



	/**
	* TEST_create_thumb
	* @return void
	*/
	public function test_create_thumb() {

		$component = $this->build_component_instance();

		$result = $component->create_thumb();

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_create_thumb





	/**
	* TEST_create_image
	* @return void
	*/
	public function test_create_image() {

		$component = $this->build_component_instance();

		$result = $component->create_image(null);

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='boolean',
			'expected type string|boolean : ' . PHP_EOL
				. gettype($result)
		);

		// $this->assertTrue(
		// 	$result===false,
		// 	'unexpected result false : ' . PHP_EOL
		// 		. to_string($result)
		// );
	}//end test_create_image



	/**
	* TEST_process_uploaded_file
	* @return void
	*/
	public function test_process_uploaded_file() {

		$component = $this->build_component_instance();

		$response = $component->process_uploaded_file((object)[
			'empty_vars' => null
		]);
		$result = $response->result;

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_process_uploaded_file



	/**
	* TEST_rename_old_files
	* @return void
	*/
	public function test_rename_old_files() {

		$component = $this->build_component_instance();

		$response = $component->rename_old_files('', '');
		$result = $response->result;

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_rename_old_files



	/**
	* TEST_get_alternative_extensions
	* @return void
	*/
	public function test_get_alternative_extensions() {

		$component = $this->build_component_instance();

		$result = $component->get_alternative_extensions();

		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
			'expected type array|null : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			$result === DEDALO_PDF_ALTERNATIVE_EXTENSIONS,
			'expected DEDALO_PDF_ALTERNATIVE_EXTENSIONS : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_alternative_extensions



	/**
	* TEST_get_text_from_pdf
	* @return void
	*/
	public function test_get_text_from_pdf() {

		$component = $this->build_component_instance();

		$response = $component->get_text_from_pdf((object)[
			'invalid_property' => 'invalid value'
		]);
		$result = $response->result;

		$this->assertTrue(
			gettype($response)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($response)
		);
		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_text_from_pdf



	/**
	* TEST_valid_utf8
	* @return void
	*/
	public function test_valid_utf8() {

		$result = component_pdf::valid_utf8('random string');

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
	}//end test_valid_utf8



	/**
	* TEST_utf8_clean
	* @return void
	*/
	public function test_utf8_clean() {

		$string = 'random string niño';

		$result = component_pdf::utf8_clean($string);

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===$string,
			'expected: $string : ' . PHP_EOL
				. to_string($string)
		);
	}//end test_utf8_clean



	/**
	* TEST_remove_component_media_files
	* @return void
	*/
		// public function test_remove_component_media_files() {

		// 	$component = $this->build_component_instance();

		// 	$result = $component->remove_component_media_files();

		// 	$this->assertTrue(
		// 		gettype($result)==='boolean',
		// 		'expected type boolean : ' . PHP_EOL
		// 			. gettype($result)
		// 	);
		// }//end test_remove_component_media_files



	/**
	* TEST_restore_component_media_files
	* @return void
	*/
		// public function test_restore_component_media_files() {

		// 	$component = $this->build_component_instance();

		// 	$result = $component->restore_component_media_files();

		// 	$this->assertTrue(
		// 		gettype($result)==='boolean',
		// 		'expected type boolean : ' . PHP_EOL
		// 			. gettype($result)
		// 	);
		// }//end test_restore_component_media_files



	/**
	* TEST_delete_file
	* @return void
	*/
		// public function test_delete_file() {

		// 	$component = $this->build_component_instance();

		// 	$quality = 'fake_quality'; // $component->get_default_quality();

		// 	$response	= $component->delete_file($quality);
		// 	$result		= $response->result;

		// 	$this->assertTrue(
		// 		gettype($response)==='object',
		// 		'expected type object : ' . PHP_EOL
		// 			. gettype($response)
		// 	);
		// 	$this->assertTrue(
		// 		gettype($result)==='boolean',
		// 		'expected type boolean : ' . PHP_EOL
		// 			. gettype($result)
		// 	);
		// }//end test_delete_file



	/**
	* TEST_build_version
	* @return void
	*/
	public function test_build_version() {

		$component = $this->build_component_instance();

		$quality = 'fake_quality'; // $component->get_default_quality();

		$response	= $component->build_version($quality);
		$result		= $response->result;

		$this->assertTrue(
			gettype($response)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($response)
		);
		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_build_version



	/**
	* TEST_update_dato_version
	* @return void
	*/
	public function test_update_dato_version() {

		$response = component_pdf::update_dato_version((object)[
			'update_version' => [99,99,99]
		]);

		$result = $response->result;

		$this->assertTrue(
			gettype($response)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($response)
		);

		$this->assertTrue(
			gettype($result)==='integer',
			'expected type integer : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===0,
			'expected 0 : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_update_dato_version



}//end class component_pdf_test
