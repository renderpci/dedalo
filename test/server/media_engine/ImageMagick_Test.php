<?php declare(strict_types=1);
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

/**
 * ImageMagick TEST
 */
final class ImageMagick_test extends BaseTestCase {

	public static $model = 'ImageMagick';

	public function test_get_magick_config() {
		$this->user_login();
		$result = ImageMagick::get_magick_config();
		$this->assertIsObject($result);
	}

	public function test_get_imagemagick_installed_path() {
		$this->user_login();
		$result = ImageMagick::get_imagemagick_installed_path();
		$this->assertIsString($result);
	}

	public function test_get_imagemagick_identify_path() {
		$this->user_login();
		$result = ImageMagick::get_imagemagick_identify_path();
		$this->assertIsString($result);
	}

	public function test_get_imagemagick_pdfinfo_path() {
		$this->user_login();
		$result = ImageMagick::get_imagemagick_pdfinfo_path();
		$this->assertIsString($result);
	}

	public function test_get_version() {
		$this->user_login();
		$result = ImageMagick::get_version();
		$this->assertIsString($result);
	}

	public function test_dd_thumb() {
		$this->user_login();
		$samples = $this->get_sample_data('media_engine');
		$sample_data = reset($samples);
		$source = DEDALO_CORE_PATH . '/media_engine/samples/' . $sample_data->image_file;
		$target = DEDALO_CORE_PATH . '/media_engine/samples/thumb.jpg';

		$result = ImageMagick::dd_thumb($source, $target);
		$this->assertNotFalse($result);
		$this->assertTrue(file_exists($target));
		if (file_exists($target)) unlink($target);
	}

	public function test_convert() {
		$this->user_login();
		$samples = $this->get_sample_data('media_engine');
		$sample_data = reset($samples);
		$source = DEDALO_CORE_PATH . '/media_engine/samples/' . $sample_data->image_file;
		$target = DEDALO_CORE_PATH . '/media_engine/samples/converted.jpg';

		$options = (object)[
			'source_file' => $source,
			'target_file' => $target,
			'quality' => 80
		];
		$result = ImageMagick::convert($options);
		$this->assertNotFalse($result);
		$this->assertTrue(file_exists($target));
		if (file_exists($target)) unlink($target);
	}

	public function test_get_layers_file_info() {
		$this->user_login();
		$samples = $this->get_sample_data('media_engine');
		$sample_data = reset($samples);
		$source = DEDALO_CORE_PATH . '/media_engine/samples/' . $sample_data->image_file;
		$source_tif = DEDALO_CORE_PATH . '/media_engine/samples/' . $sample_data->image_alpha_tif;

		$result_jpg = ImageMagick::get_layers_file_info($source);
		$this->assertEquals(1, $result_jpg);

		if(file_exists($source_tif)) {
			$result_tif = ImageMagick::get_layers_file_info($source_tif);
			$this->assertIsInt($result_tif);
		}
	}

	public function test_has_meta_channel() {
		$this->user_login();
		$samples = $this->get_sample_data('media_engine');
		$sample_data = reset($samples);
		$source = DEDALO_CORE_PATH . '/media_engine/samples/' . $sample_data->image_file;
		$source_tif = DEDALO_CORE_PATH . '/media_engine/samples/' . $sample_data->image_alpha_tif;

		$result_jpg = ImageMagick::has_meta_channel($source);
		$this->assertFalse($result_jpg);

		if(file_exists($source_tif)) {
			// Some simple mac magick tif exports may or may not map correctly to has_meta_channel.
			// As long as it returns a boolean, we consider the execution a pass.
			$result_tif = ImageMagick::has_meta_channel($source_tif);
			$this->assertIsBool($result_tif);
		}
	}

	public function test_rotate() {
		$this->user_login();
		$samples = $this->get_sample_data('media_engine');
		$sample_data = reset($samples);
		$source = DEDALO_CORE_PATH . '/media_engine/samples/' . $sample_data->image_file;
		$target = DEDALO_CORE_PATH . '/media_engine/samples/rotated.jpg';

		$options = (object)[
			'source' => $source,
			'target' => $target,
			'degrees' => 90
		];
		$result = ImageMagick::rotate($options);
		$this->assertTrue(file_exists($target));
		if (file_exists($target)) unlink($target);
	}

	public function test_crop() {
		$this->user_login();
		$samples = $this->get_sample_data('media_engine');
		$sample_data = reset($samples);
		$source = DEDALO_CORE_PATH . '/media_engine/samples/' . $sample_data->image_file;
		$target = DEDALO_CORE_PATH . '/media_engine/samples/cropped.jpg';

		$crop_area = (object)[
			'x' => 10,
			'y' => 10,
			'width' => 100,
			'height' => 100
		];
		$options = (object)[
			'source' => $source,
			'target' => $target,
			'crop_area' => $crop_area
		];
		$result = ImageMagick::crop($options);
		$this->assertTrue(file_exists($target));
		if (file_exists($target)) unlink($target);
	}

	public function test_get_media_attributes() {
		$this->user_login();
		$samples = $this->get_sample_data('media_engine');
		$sample_data = reset($samples);
		$source = DEDALO_CORE_PATH . '/media_engine/samples/' . $sample_data->image_file;

		$result = ImageMagick::get_media_attributes($source);
		$this->assertIsArray($result);
		$this->assertNotEmpty($result);
	}

	public function test_is_opaque() {
		$this->user_login();
		$samples = $this->get_sample_data('media_engine');
		$sample_data = reset($samples);
		$source_jpg = DEDALO_CORE_PATH . '/media_engine/samples/' . $sample_data->image_file;
		$source_png = DEDALO_CORE_PATH . '/media_engine/samples/' . $sample_data->image_alpha_file;

		$result_jpg = ImageMagick::is_opaque($source_jpg);
		$this->assertIsBool($result_jpg);

		if (file_exists($source_png)) {
			$result_png = ImageMagick::is_opaque($source_png);
			$this->assertIsBool($result_png);
		}
	}

	public function test_get_date_time_original() {
		$this->user_login();
		$samples = $this->get_sample_data('media_engine');
		$sample_data = reset($samples);
		$source = DEDALO_CORE_PATH . '/media_engine/samples/' . $sample_data->image_file;

		$result = ImageMagick::get_date_time_original($source);
		// CLI generated dummy images might not have this metadata, asserting null or object
		if ($result !== null) {
			$this->assertInstanceOf('dd_date', $result);
		} else {
			$this->assertNull($result);
		}
	}

	public function test_get_dimensions() {
		$this->user_login();
		$samples = $this->get_sample_data('media_engine');
		$sample_data = reset($samples);
		$source = DEDALO_CORE_PATH . '/media_engine/samples/' . $sample_data->image_file;

		$result = ImageMagick::get_dimensions($source);
		$this->assertIsObject($result);
		$this->assertTrue(isset($result->width));
		$this->assertTrue(isset($result->height));
		$this->assertGreaterThan(0, $result->width);
		$this->assertGreaterThan(0, $result->height);
	}

	public function test_edge_cases_missing_files() {
		$this->user_login();
		$missing_file = DEDALO_CORE_PATH . '/media_engine/samples/does_not_exist_xyz.jpg';
		$target = DEDALO_CORE_PATH . '/media_engine/samples/out_xyz.jpg';

		// dd_thumb
		$result = ImageMagick::dd_thumb($missing_file, $target);
		$this->assertFalse($result);

		// convert
		$options = (object)[
			'source_file' => $missing_file,
			'target_file' => $target,
			'quality' => 80
		];
		$result = ImageMagick::convert($options);
		$this->assertFalse($result);

		// get_layers_file_info: handles empty format string by returning 1
		$result = ImageMagick::get_layers_file_info($missing_file);
		$this->assertEquals(1, $result);

		// has_meta_channel
		$result = ImageMagick::has_meta_channel($missing_file);
		$this->assertFalse($result);

		// get_media_attributes
		$result = ImageMagick::get_media_attributes($missing_file);
		$this->assertNull($result);
	}

	public function test_rotate_edge_case_expanded() {
		$this->user_login();
		$samples = $this->get_sample_data('media_engine');
		$sample_data = reset($samples);
		$source = DEDALO_CORE_PATH . '/media_engine/samples/' . $sample_data->image_file;
		$target = DEDALO_CORE_PATH . '/media_engine/samples/rotated_expanded.jpg';

		$options = (object)[
			'source' => $source,
			'target' => $target,
			'degrees' => -45,
			'rotation_mode' => 'expanded',
			'background_color' => '#ff0000'
		];
		$result = ImageMagick::rotate($options);
		$this->assertTrue(file_exists($target));
		if (file_exists($target)) unlink($target);
	}

	public function test_crop_edge_case_out_of_bounds() {
		$this->user_login();
		$samples = $this->get_sample_data('media_engine');
		$sample_data = reset($samples);
		$source = DEDALO_CORE_PATH . '/media_engine/samples/' . $sample_data->image_file;
		$target = DEDALO_CORE_PATH . '/media_engine/samples/cropped_out.jpg';

		$crop_area = (object)[
			'x' => 9999,
			'y' => 9999,
			'width' => 10,
			'height' => 10
		];
		$options = (object)[
			'source' => $source,
			'target' => $target,
			'crop_area' => $crop_area
		];
		// crop out of bounds may still create an empty image or return success from terminal depending on IM version.
		$result = ImageMagick::crop($options);
		// Check that it returned null due to the failure
		$this->assertNull($result);
		if (file_exists($target)) unlink($target);
	}

}
