<?php
declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_image_test extends TestCase {



	public static $model		= 'component_image';
	public static $tipo			= 'test99';
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
			$result===DEDALO_IMAGE_AR_QUALITY,
			'expected DEDALO_IMAGE_AR_QUALITY ' . PHP_EOL
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
			$result===DEDALO_IMAGE_QUALITY_DEFAULT,
			'expected DEDALO_IMAGE_QUALITY_DEFAULT ' . PHP_EOL
				. $result
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
			$result===DEDALO_IMAGE_QUALITY_ORIGINAL,
			'expected DEDALO_IMAGE_QUALITY_ORIGINAL ' . PHP_EOL
				. json_encode($result)
		);
	}//end test_get_original_quality



	/**
	* TEST_get_modified_quality
	* @return void
	*/
	public function test_get_modified_quality() {

		$component = $this->build_component_instance();

		$result = $component->get_modified_quality();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===DEDALO_IMAGE_QUALITY_RETOUCHED,
			'expected DEDALO_IMAGE_QUALITY_RETOUCHED ' . PHP_EOL
				. json_encode($result)
		);
	}//end test_get_modified_quality



	/**
	* TEST_get_original_uploaded_file
	* @return void
	*/
	public function test_get_original_uploaded_file() {

		$component = $this->build_component_instance();

		$result = $component->get_original_uploaded_file();

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_original_uploaded_file



	/**
	* TEST_get_modified_uploaded_file
	* @return void
	*/
	public function test_get_modified_uploaded_file() {

		$component = $this->build_component_instance();

		$result = $component->get_modified_uploaded_file();

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_modified_uploaded_file



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
			$result===DEDALO_IMAGE_EXTENSION,
			'expected DEDALO_IMAGE_EXTENSION ' . PHP_EOL
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
		$component->extension = DEDALO_IMAGE_EXTENSION;
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
			$result===DEDALO_IMAGE_EXTENSIONS_SUPPORTED,
			'expected DEDALO_IMAGE_EXTENSIONS_SUPPORTED ' . PHP_EOL
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
			$result===DEDALO_IMAGE_FOLDER,
			'expected DEDALO_IMAGE_FOLDER ' . PHP_EOL
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
	* TEST_get_url
	* @return void
	*/
	public function test_get_url() {

		$component = $this->build_component_instance();

		// default
			$result = $component->get_url(
				DEDALO_IMAGE_QUALITY_DEFAULT,
				false, // test_file
				false, // absolute
				false // default_add
			);

			// expected sample
			// /media/image/1.5MB/test99_test3_1.jpg

			$this->assertTrue(
				gettype($result)==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result)
			);

			$this->assertTrue(
				strpos($result, DEDALO_IMAGE_QUALITY_DEFAULT)!==false,
				'expected contains ' .DEDALO_IMAGE_QUALITY_DEFAULT. PHP_EOL
					. $result
			);

		// test_file
			$result = $component->get_url(
				DEDALO_IMAGE_QUALITY_DEFAULT,
				true, // test_file
				false, // absolute
				false // default_add
			);
			// expected sample
			// /media/image/1.5MB/test99_test3_1.jpg

			$this->assertTrue(
				gettype($result)==='string' || gettype($result)==='NULL',
				'expected type string|null : ' . PHP_EOL
					. gettype($result)
			);

			if (!empty($result)) {
				$this->assertTrue(
					strpos($result, DEDALO_IMAGE_QUALITY_DEFAULT)!==false,
					'expected contains ' .DEDALO_IMAGE_QUALITY_DEFAULT. PHP_EOL
						. $result
				);
			}

		// test_file
			$result = $component->get_url(
				DEDALO_IMAGE_QUALITY_DEFAULT,
				true, // test_file
				false, // absolute
				false // default_add
			);

			$this->assertTrue(
				gettype($result)==='string' || gettype($result)==='NULL',
				'expected type string|null : ' . PHP_EOL
					. gettype($result)
			);

		// absolute
			$result = $component->get_url(
				DEDALO_IMAGE_QUALITY_DEFAULT,
				false, // test_file
				true, // absolute
				false // default_add
			);

			$this->assertTrue(
				gettype($result)==='string' || gettype($result)==='NULL',
				'expected type string|null : ' . PHP_EOL
					. gettype($result)
			);

			if (!empty($result)) {
				$this->assertTrue(
					strpos($result, DEDALO_PROTOCOL . DEDALO_HOST)!==false,
					'expected contains ' .DEDALO_PROTOCOL . DEDALO_HOST. PHP_EOL
						. $result
				);
			}

		// default_add
			$model			= self::$model;
			$tipo			= self::$tipo;
			$section_tipo	= self::$section_tipo;
			$mode			= 'edit';
			$lang			= DEDALO_DATA_NOLAN;

			$component = component_common::get_instance(
				$model, // string model
				$tipo, // string tipo
				9999999,
				$mode,
				$lang,
				$section_tipo
			);
			$result = $component->get_url(
				DEDALO_IMAGE_QUALITY_DEFAULT,
				true, // test_file
				false, // absolute
				true // default_add
			);

			$this->assertTrue(
				gettype($result)==='string' || gettype($result)==='NULL',
				'expected type string|null : ' . PHP_EOL
					. gettype($result)
			);
			if (!empty($result)) {
				$this->assertTrue(
					$result===DEDALO_ROOT_WEB . '/core/themes/default/0.jpg',
					'expected '.DEDALO_ROOT_WEB.'/core/themes/default/0.jpg : ' . PHP_EOL
						. $result
				);
			}
	}//end test_get_url



	/**
	* TEST_get_external_source
	* @return void
	*/
	public function test_get_external_source() {

		$component = $this->build_component_instance();

		$result = $component->get_external_source();

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===null,
			'expected null ' . PHP_EOL
				. json_encode($result)
		);
	}//end test_get_external_source



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
			$result===DEDALO_QUALITY_THUMB,
			'expected DEDALO_QUALITY_THUMB ' . PHP_EOL
				. $result
		);
	}//end test_get_thumb_quality



	/**
	* TEST_get_target_filename
	* @return void
	*/
	public function test_get_target_filename() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'edit';
		$lang			= DEDALO_DATA_NOLAN;

		$component = $this->build_component_instance();

		$result = $component->get_target_filename();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$name = $tipo.'_'.$section_tipo.'_'.$section_id;

		$this->assertTrue(
			$result===($name.'.jpg'),
			'expected ' .$name.'.jpg'. PHP_EOL
				. $result
		);
	}//end test_get_target_filename







	/**
	* TEST_convert_quality
	* @return void
	*/
	public function test_convert_quality() {

		$component = $this->build_component_instance();

		$original_quality	= $component->get_original_quality();
		$source_file		= $component->get_media_filepath($original_quality);
		$target_quality		= '6MB';
		$result				= $component->convert_quality((object)[
			'source_quality'	=> $original_quality,
			'source_file'		=> $source_file,
			'target_quality'	=> $target_quality

		]);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		$media_filepath = $component->get_media_filepath($target_quality);

		$this->assertTrue(
			file_exists($media_filepath),
			'expected  file_exists '. PHP_EOL
				. $media_filepath
		);
	}//end test_convert_quality



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
	* TEST_create_thumb
	* @return void
	*/
	public function test_create_thumb() {

		$component = $this->build_component_instance();

		$result = $component->create_thumb();

		if (!is_null($result)) {

			$this->assertTrue(
				gettype($result)==='object',
				'expected type object : ' . PHP_EOL
					. gettype($result)
			);

			$this->assertTrue(
				!empty($result->path),
				'expected !empty($result->path) ' . PHP_EOL
					. empty($result)
			);

			$this->assertTrue(
				!empty($result->url),
				'expected !empty($result->url) ' . PHP_EOL
					. empty($result)
			);
		}
	}//end test_create_thumb



	/**
	* TEST_get_image_print_dimensions
	* @return void
	*/
	public function test_get_image_print_dimensions() {

		$component = $this->build_component_instance();

		$quality = $component->get_default_quality();

		$result = $component->get_image_print_dimensions($quality);

		// sample
		// [
		//     "8,67cm",
		//     "8,67cm"
		// ]

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			!empty($result[0]),
			'expected !empty($result[0]) : ' . PHP_EOL
				. empty($result[0])
		);
		$this->assertTrue(
			!empty($result[1]),
			'expected !empty($result[1]) : ' . PHP_EOL
				. empty($result[1])
		);
	}//end test_get_image_print_dimensions



	/**
	* TEST_convert_quality_to_megabytes
	* @return void
	*/
	public function test_convert_quality_to_megabytes() {

		$component = $this->build_component_instance();

		$quality = $component->get_default_quality();

		$result = $component->convert_quality_to_megabytes($quality);


		$this->assertTrue(
			gettype($result)==='double',
			'expected type double : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_convert_quality_to_megabytes






	/* @todo
		Add rest of methods
		*/






	/**
	* TEST_set_quality
	* @return void
	*/
	public function test_set_quality() {

		$component = $this->build_component_instance();

		$target_quality	= '6MB';
		$result			= $component->set_quality(
			$target_quality
		);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===true,
			'expected true value : true ' . PHP_EOL
				. json_encode($result)
		);

		$this->assertTrue(
			$component->quality===$target_quality,
			'expected  component quality '. $target_quality . PHP_EOL
				. $result
		);

		// invalid value
			$target_quality	= 'invalid value!';
			$result			= $component->set_quality(
				$target_quality
			);

			$this->assertTrue(
				$result===false,
				'expected false value : ' . PHP_EOL
					. to_string($result)
			);

			$this->assertTrue(
				$component->quality!==$target_quality,
				'expected  component quality distinct of '. $target_quality . PHP_EOL
					. $result
			);
	}//end test_set_quality



	/**
	* TEST_generate_default_quality_file
	* @return void
	*/
		// public function test_generate_default_quality_file() {

		// 	$model			= self::$model;
		// 	$tipo			= self::$tipo;
		// 	$section_tipo	= self::$section_tipo;
		// 	$section_id		= 1;
		// 	$mode			= 'edit';
		// 	$lang			= DEDALO_DATA_NOLAN;

		// 	$component = component_common::get_instance(
		// 		$model, // string model
		// 		$tipo, // string tipo
		// 		$section_id,
		// 		$mode,
		// 		$lang,
		// 		$section_tipo
		// 	);

		// 	$result = $component->generate_default_quality_file((object)[
		// 		'overwrite' => true
		// 	]);

		// 	$this->assertTrue(
		// 		gettype($result)==='boolean',
		// 		'expected type boolean : ' . PHP_EOL
		// 			. gettype($result)
		// 	);

		// 	$this->assertTrue(
		// 		$result===true,
		// 		'expected true value : true ' . PHP_EOL
		// 			. json_encode($result)
		// 	);

		// 	$result = $component->generate_default_quality_file((object)[
		// 		'overwrite'	=> true,
		// 		'from'		=> 'original_real'
		// 	]);

		// 	$this->assertTrue(
		// 		$result===true,
		// 		'expected true value : true (generate_default_quality_file from original_real) ' . PHP_EOL
		// 			. json_encode($result)
		// 	);
		// }//end test_generate_default_quality_file



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
	}//end test_regenerate_component



}//end class component_image_test
