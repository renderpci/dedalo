<?php
/**
* SUBTITLES ENGINE
*
* Build subtitles on the fly
* @param section_id, tcin, tcout
*
*/

	$start_time=hrtime(true);

	// Turn off output buffering
		// ini_set('output_buffering', 'off');

	// time limit in seconds
		ini_set('memory_limit', '256M');
		set_time_limit(5);

	// headers
		header("Access-Control-Allow-Origin: *");
		header('Content-Type: text/vtt');

	// safe_xss
		$safe_xss = function($value) {

			if (is_string($value) && !empty($value)) {
				if ($decode_json = json_decode($value)) {
					// If var is a stringify JSON, not verify string yet
				}else{
					$value = strip_tags($value,'<br><strong><em><img>');
					$value = htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
				}
			}

			return $value;
		};//end safe_xss

	// must to be identical to server config defined code
		$code = isset($_REQUEST['code']) ? $safe_xss($_REQUEST['code']) : false;

	// lang
		$lang = isset($_REQUEST['lang']) ? $safe_xss($_REQUEST['lang']) : false;

	// db
		$db_name = isset($_REQUEST['db_name']) ? $safe_xss($_REQUEST['db_name']) : false;

	// GET vars
		$section_id	= isset($_GET['section_id']) ? (int)$safe_xss($_GET['section_id']) : false;
		$tc_in		= isset($_GET['tc_in']) ? (int)$safe_xss($_GET['tc_in']) : false;
		$tc_out		= isset($_GET['tc_out']) ? (int)$safe_xss($_GET['tc_out']) : false;

	// Load class
		$skip_api_web_user_code_verification = true;
		// include(dirname(dirname(__FILE__)) .'/config_api/server_config_api.php');
		include dirname(dirname(__FILE__)) .'/config_api/server_config_api.php';
		// include_once(dirname(dirname(dirname(dirname(dirname(__FILE__))))).'/tools/tool_subtitles/class.subtitles.php');
		// include dirname(dirname(dirname(dirname(dirname(__FILE__))))) .'/shared/class.subtitles.php';

	// vars
		// av_section_id . Section id of audiovisual record tape
			if (empty($section_id)) {
				exit("Error on build_subtitles. section_id is mandatory");
				debug_log(__METHOD__." Error on build_subtitles. section_id is mandatory "
					. to_string($section_id)
					, logger::ERROR
				);
				exit('Error: section_id is mandatory');
			}

		// Lang is auto-set by server_config_api
			preg_match('/^lg-[a-z]{3}$/', $lang, $lang_array);
			if (empty($lang_array)) {
				debug_log(__METHOD__." Error on build_subtitles. Invalid lang. Use format tld3 like 'lg-spa' "
					.to_string($lang)
					, logger::ERROR
				);
				exit('Error: invalid lang');
			}

		// TC as float seconds like '132.317'
			$tc_in_secs		= $tc_in ?? false;
			$tc_out_secs	= $tc_out ?? false;

	// Get reel av data
		$options = new stdClass();
			$options->table			= (string)TABLE_AUDIOVISUAL;
			$options->ar_fields		= array(FIELD_VIDEO, FIELD_TRANSCRIPTION, 'duration');
			$options->sql_filter	= 'section_id = '.(int)$section_id; // av_section_id
			$options->lang			= $lang;
			$options->order			= null;
			$options->limit			= 1;
			$options->db_name		= $db_name;

		$rows_data = (object)web_data::get_rows_data( $options );
		if (empty($rows_data->result)) {
			debug_log(__METHOD__." Error on build_subtitles. Record not found for section_id: $section_id ($options->table)"
				.to_string($options)
				, logger::ERROR
			);
			exit("Error on build_subtitles. Record not found: ".$section_id);
		}
		$result = reset($rows_data->result);

		// duration (from db table column 'duration')
			$duration = $result['duration'];
			// check format (old data is in minutes)
			preg_match('/^\d+$/', $duration, $output_array);
			$duration_secs = (!empty($output_array))
				? (int)$duration * 60
				: (int)OptimizeTC::TC2seg($duration);
			$total_ms = (int)($duration_secs * 1000);

		// sourceText
			$sourceText_unrestricted	= $result[FIELD_TRANSCRIPTION];
			$sourceText					= web_data::remove_restricted_text(
				$sourceText_unrestricted,
				$section_id
			);

	// build_subtitles_text
		$st_options = new stdClass();
			$st_options->sourceText						= $sourceText;
			$st_options->sourceText_unrestricted		= $sourceText_unrestricted;
			$st_options->total_ms						= $total_ms;
			$st_options->maxCharLine					= 144;		# max number of char for subtitle line. Default 144
			$st_options->type							= 'srt';	# File type: srt or xml
			$st_options->show_debug						= false;	# Default false
			$st_options->advice_text_subtitles_title	= null;  	# Text like "Automatic translation"
			$st_options->tc_in_secs						= $tc_in_secs;
			$st_options->tc_out_secs					= $tc_out_secs;

		$subtitles_text_response	= subtitles::build_subtitles_text( $st_options );
		$subtitles_text				= $subtitles_text_response->result;


	// Debug
		if(SHOW_DEBUG===true) {
			$total = exec_time_unit($start_time,'ms').' ms';
			debug_log(__METHOD__
				." Created subtitles for section: $section_id - time : $total "
				, logger::DEBUG
			);
		}


	// Show text
		echo $subtitles_text;
