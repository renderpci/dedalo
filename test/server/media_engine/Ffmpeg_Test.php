<?php declare(strict_types=1);
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

/**
 * Ffmpeg TEST
 */
final class Ffmpeg_test extends BaseTestCase {

	public static $model = 'Ffmpeg';

	public function test_get_ffmpeg_installed_path() {
		$this->user_login();
		$result = Ffmpeg::get_ffmpeg_installed_path();
		$this->assertIsString($result);
	}

	public function test_get_ffprove_installed_path() {
		$this->user_login();
		$result = Ffmpeg::get_ffprove_installed_path();
		$this->assertIsString($result);
	}

	public function test_get_version() {
		$this->user_login();
		$result = Ffmpeg::get_version();
		$this->assertIsString($result);
	}

	public function test_get_ffprove_version() {
		$this->user_login();
		$result = Ffmpeg::get_ffprove_version();
		$this->assertIsString($result);
	}

	public function test_check_lib() {
		$this->user_login();
		$result = Ffmpeg::check_lib('libx264');
		$this->assertIsBool($result);
	}

	public function test_get_qt_faststart_installed_path() {
		$this->user_login();
		$result = Ffmpeg::get_qt_faststart_installed_path();
		$this->assertIsString($result);
	}

	public function test_get_settings_path() {
		$this->user_login();
		$result = Ffmpeg::get_settings_path();
		$this->assertIsString($result);
	}

	public function test_get_ar_settings() {
		$this->user_login();
		$result = Ffmpeg::get_ar_settings();
		$this->assertIsArray($result);
	}

	public function test_get_setting_name() {
		$this->user_login();
		$samples = $this->get_sample_data('media_engine');
		$sample_data = reset($samples);
		$video_path = DEDALO_CORE_PATH . '/media_engine/samples/' . $sample_data->video_file;

		// 404 test
		$result = Ffmpeg::get_setting_name($video_path, '404');
		$this->assertIsString($result);
		$this->assertNotEmpty($result);
	}

	public function test_get_media_standard() {
		$this->user_login();
		$samples = $this->get_sample_data('media_engine');
		$sample_data = reset($samples); // Gets the object from json
		$video_path = DEDALO_CORE_PATH . '/media_engine/samples/' . $sample_data->video_file;
		$result = Ffmpeg::get_media_standard($video_path);
		$this->assertIsString($result);
		$this->assertContains($result, ['pal', 'ntsc']);
	}

	public function test_get_quality_from_setting() {
		$this->user_login();
		$result = Ffmpeg::get_quality_from_setting('audio');
		$this->assertEquals('audio', $result);
	}

	public function test_build_av_alternate_command() {
		$this->user_login();
		$samples = $this->get_sample_data('media_engine');
		$sample_data = reset($samples);
		$video_path = DEDALO_CORE_PATH . '/media_engine/samples/' . $sample_data->video_file;
		$target_path = DEDALO_CORE_PATH . '/media_engine/samples/alternate_target.mp4';

		$settings = Ffmpeg::get_ar_settings();
		if (!empty($settings)) {
			$setting_name = $settings[0]; // grab the first available setting
			$options = (object)[
				'setting_name' => $setting_name,
				'source_file_path' => $video_path,
				'target_file_path' => $target_path
			];
			$result = Ffmpeg::build_av_alternate_command($options);
			$this->assertIsObject($result);
			$this->assertTrue(isset($result->result));
		} else {
			$this->markTestIncomplete('No AV settings present in ffmpeg_settings folder to test against.');
		}
	}

	public function test_find_video_stream() {
		$this->user_login();
		$samples = $this->get_sample_data('media_engine');
		$sample_data = reset($samples);
		$video_path = DEDALO_CORE_PATH . '/media_engine/samples/' . $sample_data->video_file;

		$media_streams = Ffmpeg::get_media_streams($video_path);
		if (isset($media_streams->streams)) {
			$video_stream = Ffmpeg::find_video_stream($media_streams->streams);
			$this->assertIsObject($video_stream);
			$this->assertEquals('video', $video_stream->codec_type);
		} else {
			$this->markTestIncomplete('Streams could not be retrieved from sample video.');
		}
	}

	public function test_get_aspect_ratio() {
		$this->user_login();
		$samples = $this->get_sample_data('media_engine');
		$sample_data = reset($samples);
		$video_path = DEDALO_CORE_PATH . '/media_engine/samples/' . $sample_data->video_file;
		$result = Ffmpeg::get_aspect_ratio($video_path);
		$this->assertIsString($result);
		$this->assertEquals('16x9', $result);
	}

	public function test_create_posterframe() {
		$this->user_login();
		$samples = $this->get_sample_data('media_engine');
		$sample_data = reset($samples);
		$video_path = DEDALO_CORE_PATH . '/media_engine/samples/' . $sample_data->video_file;
		$target_image = DEDALO_CORE_PATH . '/media_engine/samples/posterframe.jpg';

		$options = (object)[
			'timecode' => 0.5,
			'src_file' => $video_path,
			'quality' => 'thumbnail',
			'posterframe_filepath' => $target_image
		];

		$result = Ffmpeg::create_posterframe($options);
		$this->assertIsBool($result);

		if (file_exists($target_image)) {
			unlink($target_image);
		}
	}

	public function test_build_fragment() {
		$this->user_login();
		$samples = $this->get_sample_data('media_engine');
		$sample_data = reset($samples);
		$video_path = DEDALO_CORE_PATH . '/media_engine/samples/' . $sample_data->video_file;
		$fragments_dir = DEDALO_CORE_PATH . '/media_engine/samples/fragments';
		$target_filename = 'frag_test.mp4';

		$options = (object)[
			'source_file_path' => $video_path,
			'target_filename' => $target_filename,
			'fragments_dir_path' => $fragments_dir,
			'tc_in_secs' => 0.1,
			'tc_out_secs' => 0.5,
			'watermark' => false
		];

		$result = Ffmpeg::build_fragment($options);
		$this->assertIsObject($result);

		$expected_path = $fragments_dir . '/' . $target_filename;
		if (file_exists($expected_path)) {
			unlink($expected_path);
			rmdir($fragments_dir);
		}
	}

	public function test_conform_header() {
		$this->user_login();
		$samples = $this->get_sample_data('media_engine');
		$sample_data = reset($samples);

		// Create a dynamic copy so conform_header doesn't destroy our main sample
		$video_path = DEDALO_CORE_PATH . '/media_engine/samples/' . $sample_data->video_file;
		$test_copy = DEDALO_CORE_PATH . '/media_engine/samples/conform_test.mp4';
		copy($video_path, $test_copy);

		$result = Ffmpeg::conform_header($test_copy);

		$this->assertTrue(file_exists($test_copy));

		// Cleanup
		if (file_exists($test_copy)) {
			unlink($test_copy);
		}
		// conform_header renames original to _untouched
		$untouched_copy = DEDALO_CORE_PATH . '/media_engine/samples/conform_test_untouched.mp4';
		if (file_exists($untouched_copy)) {
			unlink($untouched_copy);
		}
	}

	public function test_convert_audio() {
		$this->user_login();
		$samples = $this->get_sample_data('media_engine');
		$sample_data = reset($samples);

		$audio_path = DEDALO_CORE_PATH . '/media_engine/samples/' . $sample_data->audio_file;
		$target_audio = DEDALO_CORE_PATH . '/media_engine/samples/converted_audio.mp4';

		$options = (object)[
			'output_file_path' => $target_audio,
			'uploaded_file_path' => $audio_path
		];

		$result = Ffmpeg::convert_audio($options);

		$this->assertTrue(file_exists($target_audio));

		// Cleanup
		if (file_exists($target_audio)) {
			unlink($target_audio);
		}
	}

	public function test_convert_to_dedalo_av() {
		$this->user_login();
		$samples = $this->get_sample_data('media_engine');
		$sample_data = reset($samples);

		$video_path = DEDALO_CORE_PATH . '/media_engine/samples/' . $sample_data->video_file;
		$target_video = DEDALO_CORE_PATH . '/media_engine/samples/converted_av.mp4';

		// Run synchronously so we can assert file existence
		$result = Ffmpeg::convert_to_dedalo_av($video_path, $target_video, false);

		$this->assertTrue(file_exists($target_video));

		// Cleanup
		if (file_exists($target_video)) {
			unlink($target_video);
		}
	}

	public function test_get_media_attributes() {
		$this->user_login();
		$samples = $this->get_sample_data('media_engine');
		$sample_data = reset($samples);
		$video_path = DEDALO_CORE_PATH . '/media_engine/samples/' . $sample_data->video_file;
		$result = Ffmpeg::get_media_attributes($video_path);
		$this->assertIsObject($result);
		$this->assertTrue(isset($result->format));
	}

	public function test_get_date_time_original() {
		$this->user_login();
		$samples = $this->get_sample_data('media_engine');
		$sample_data = reset($samples);
		$video_path = DEDALO_CORE_PATH . '/media_engine/samples/' . $sample_data->video_file;

		$result = Ffmpeg::get_date_time_original($video_path);

		// For our raw ffmpeg dummy file generated via CLI, there may not be a creation_time metadata tag or it may parse to a dd_date object.
		if ($result !== null) {
			$this->assertInstanceOf('dd_date', $result);
		} else {
			$this->assertNull($result);
		}
	}

	public function test_get_media_streams() {
		$this->user_login();
		$samples = $this->get_sample_data('media_engine');
		$sample_data = reset($samples);
		$video_path = DEDALO_CORE_PATH . '/media_engine/samples/' . $sample_data->video_file;
		$result = Ffmpeg::get_media_streams($video_path);
		$this->assertIsObject($result);
		$this->assertTrue(isset($result->streams));
	}

	public function test_get_audio_codec() {
		$this->user_login();
		$result = Ffmpeg::get_audio_codec();
		$this->assertIsString($result);
		$this->assertNotEmpty($result);
	}

}
