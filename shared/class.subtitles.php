<?php
// declare(strict_types=1); // not tested in web calls
/**
* SUBTITLES
* Constructs text formatted for standard subtitles from a time-coded transcript.
* This class is generic and should also work for public parts.
* When used outside of Dédalo, copy this file and call 'build_subtitles_text' from the requesting class.
* In order to take advantage of the improvements and bug fixes of Dédalo development, take version control of this class
*/
abstract class subtitles {


	// Version. Important!
	// static $version = "1.0.2"; // 15-01-2019
	static $version = "1.0.3"; // 26-04-2023

	// int $maxCharLine . Max number of chars for subtitle line. Default 144
	static $maxCharLine;

	// float $charTime . Number of seconds that each character is long
	static $charTime;



	/**
	* BUILD_SUBTITLES_TEXT
	* @param object $request_options
	*  Sample:
	*  {
	*  		sourceText : string (clean text fragment without <p>, [TC], [INDEX] tags),
	* 		sourceText_unrestricted : string (full version of sourdeText without restricted removed text),
	* 		total_ms : int|null (total of milliseconds (tcout-tcin)),
	* 		maxCharLine: int (max number of char for subtitle line. Default 144)
	* 		type: string (File type: srt or xml defaults is 'srt')
	* 		show_debug: boolean
	* 		advice_text_subtitles_title: string|null (Text like "Automatic translation")
	* 		tc_in_secs: int|string|null (Optional subtitles filter from in tc)
	* 		tc_out_secs: int|string|null (Optional subtitles filter from out tc)
	*  }
	* @return object$response
	*/
	public static function build_subtitles_text(object $request_options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		$options = new stdClass();
			$options->sourceText					= '';		# clean text fragment without <p>, [TC], [INDEX] tags
			$options->sourceText_unrestricted		= null;
			$options->total_ms						= null;		# total of milliseconds (tcout-tcin)
			$options->maxCharLine					= 144;		# max number of char for subtitle line. Default 144
			$options->type							= 'srt';	# File type: srt or xml
			$options->show_debug					= false;	# Default false
			$options->advice_text_subtitles_title	= null;  	# Text like "Automatic translation"
			$options->tc_in_secs					= false;	# Optional subtitles filter from in tc
			$options->tc_out_secs					= false;	# Optional subtitles filter from out tc

			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// Set static vars
			$maxCharLine = $options->maxCharLine;
			subtitles::$maxCharLine = $maxCharLine;

		// Mandatory vars check
			$ar_mandatory = array('sourceText','maxCharLine');
			foreach ($ar_mandatory as $value) {
				if (empty($options->$value)) {
					// trigger_error("Unable build_subtitles_text. Few vars ($value)");
					$response->msg .= " Unable build_subtitles_text. Var '$value' is mandatory!";
					debug_log(__METHOD__
						. "  $response->msg " . PHP_EOL
						. to_string()
						, logger::DEBUG
					);
					return $response;
				}
			}
			#$options->sourceText = $options->sourceText_unrestricted;

		// Clean text from non tc tags
			if (is_null($options->sourceText_unrestricted)) {
				$clean_sourceText_unrestricted	= $clean_sourceText = subtitles::clean_text_for_subtitles($options->sourceText);
			}else{
				$clean_sourceText_unrestricted	= subtitles::clean_text_for_subtitles($options->sourceText_unrestricted);
				$clean_sourceText				= subtitles::clean_text_for_subtitles($options->sourceText);
			}


		// Global char time in seconds (float)
			subtitles::$charTime = subtitles::calculate_global_char_time(
				$clean_sourceText_unrestricted,
				$options->total_ms
			);

		// Calculate ar_lines
			$ar_lines = subtitles::get_ar_lines($clean_sourceText);


		// Fragment subtitles
			if ($options->tc_in_secs!==false || $options->tc_out_secs!==false) {
				$ar_lines = subtitles::build_fragment(
					$ar_lines,
					$options->tc_in_secs,
					$options->tc_out_secs
				);
			}

		#
		# CREATE FILE
		#
			$srt 		  				 = '';
			$type 		  				 = $options->type; // 'srt';
			$advice_text_subtitles_title = $options->advice_text_subtitles_title;

			$i=1; foreach($ar_lines as $key => $line) {

				// tcin
					$tcin = $line['tcin']; // Like '00:00:03.000'

				// $options->tc_in

				// Text
					$text	= subtitles::trim_text($line['text']);
					# generamos si o si el retorno de carro en pregunta respuesta
					$text 	= str_replace('</b>',"</b>\n",$text);
					#$text 	= str_replace('<b>',"<b>\n",$text);
					// Remove double returns
					$text 	= str_replace('\n\n', '\n', $text);
					// Remove double spaces
					$text 	= str_replace("  ", " ", $text);
					// Remove spaces at end and beginning of text
					$text 	= trim($text);
					// Remove tag <br> at end and beginning of text
					$text 	= preg_replace('/^(<\/?br>)|(<\/?br>)$/i', '', $text);

					$text_final = $text;

				#
				# 2 LINES : If the text is longer than 1 line (half of $maxCharLine) we break it into 2 lines separated by a carriage return '\n'
					$text_line_lenght = subtitles::text_lenght($text);
					if( $text_line_lenght > ($maxCharLine/2)  ) {

						$sub_text 	= subtitles::truncate_text($text, ($maxCharLine/2), $break=" ", $pad="");
						$sub_text2 	= str_replace($sub_text, '', $text);

						$text_final = trim($sub_text) . "\n" . trim($sub_text2);
					}
					#dump($text_final, '$text_final', array());

				#
				# TC_OUT
				# Normally, the next line (in the line array) will be a tc tag of type [TC_00:01:08_TC]
				# If it wasn't (the last line for example), we'll override it without a fixed calculation
					if (!empty($ar_lines[$key+1]['tcin'])) {

						$tcout = $ar_lines[$key+1]['tcin'];

					}else{

						$tcin_value = OptimizeTC::TC2seg($ar_lines[$key]['tcin']);

						// Seconds +5
						$tcout_final_secs = $tcin_value + 5;

						// Format as tc like '00:01:03.765'
						$tcout_final_formated = OptimizeTC::seg2tc($tcout_final_secs);

						// tcout
						$tcout = $tcout_final_formated;
					}

				#
				# LINE
					# ADVICE_TEXT_SUBTITLES_TITLE
					# We add a label before the first, from tc 0 to the beginning of the first fragment
					if ($i===1 && !empty($options->advice_text_subtitles_title)) {
						$srt .= "$i\n";
						$srt .= "00:00:00.000 --> $tcin\n";
						$srt .= "<i>(".$advice_text_subtitles_title.")</i>\n";
						$srt .= "\n";
						$i++;
					}

					// vtt line number
					$srt .= "$i\n";
					// vtt line tcs
					$srt .= "{$tcin} --> {$tcout}\n";
					// vtt line text
					$srt .= $text_final."\n";
					// vtt line break
					$srt .= "\n";

			$i++; }//end foreach($ar_lines as $key => $line)

			$srt = "WEBVTT\n\n".$srt;

			# ENCODING
			#$srt = mb_convert_encoding($srt, 'UTF-8', 'auto');

			// response
			$response->result	= (string)$srt;
			$response->msg		= 'OK. Request done ['.__FUNCTION__.']';


			return $response;
	}//end build_subtitles_text



	/**
	* BUILD_FRAGMENT
	* Rebuild array ar_lines to conform length and offset of lines based on $tc_in_secs, $tc_out_secs
	* @param array $ar_lines
	*	Like  	array(
	*			[text] => Hola Anna. Gràcies per venir. Benvinguda. Comencem amb la primera pregunta. Llegint la teva entrevista ens va cridar l'atenció la particular
	*        	[tcin] => 00:00:03.000
	*        	)
	* @param int $tc_in_secs
	*	Like '12'
	* @param int $tc_out_secs
	*	Like '56' // Zero for empty value
	* @return array $fragment_ar_lines
	*/
	public static function build_fragment(array $ar_lines, int $tc_in_secs, int $tc_out_secs) : array {

		$fragment_ar_lines = [];

		$tc_in_secs = (int)$tc_in_secs;
		$tc_out_secs= (int)$tc_out_secs ;

		foreach ($ar_lines as $line) {

			$tc = (int)OptimizeTC::TC2seg($line['tcin']);


			$tc_to_be_compared = $tc_in_secs -6;

			// Skip lines before tc_in_secs
				if ( $tc < $tc_to_be_compared ) {
					continue; # Skip
				}

			// Offset
				$current_time 	= ($tc - $tc_in_secs) >= 0
					? $tc - $tc_in_secs
					: 0; // Use tc_in_secs as offset
				$current_tc 	= OptimizeTC::seg2tc($current_time);
				$line['tcin']	= $current_tc;

			// Add valid line
				$fragment_ar_lines[] = $line;

			// Skip lines after tc_out_secs
				if ( !empty($tc_out_secs) && $tc > $tc_out_secs ) {
					break;
				}
		}//end foreach ($ar_lines as $line)


		return $fragment_ar_lines;
	}//end build_fragment



	/**
	* GET_AR_LINES
	* @param string $text
	* @return array $ar_final_formatted
	*/
	public static function get_ar_lines(string $text) : array {

		# Explode text by tc pattern
		#$tcPattern 	= "/(\[TC_[0-9]{2}:[0-9]{2}:[0-9]{2}\.?[0-9]{3}?_TC\])/";

		#$tcPattern 	= TR::get_mark_pattern('tc_full',$standalone=true);

		// Allow old codes like [TC_00:00:03_TC]
		$tcPattern = "/(\[TC_[0-9]{1,2}:[0-9]{1,2}:[0-9]{1,2}\.[0-9]{1,3}_TC\]|\[TC_[0-9]{1,2}:[0-9]{1,2}:[0-9]{1,2}_TC\])/";

		$ar_fragments = preg_split($tcPattern, $text, -1, PREG_SPLIT_NO_EMPTY | PREG_SPLIT_DELIM_CAPTURE );
		#preg_match_all("/(\[TC_[0-9][0-9]:[0-9][0-9]:[0-9][0-9]_TC\])/", $text, $ar_fragments, PREG_SET_ORDER);
		#dump($ar_fragments,'$ar_fragments - '); die();

		$ar_fragments_formated = array();
		if (is_array($ar_fragments)) foreach ($ar_fragments as $key => $value) {

			if(!preg_match($tcPattern, $value)) {

				// value is a string text
				$text = $value;
				#if (empty($text) || strlen($text)<1 ) continue; # Skip

				// tc_in
				$tcin = $ar_fragments[$key-1] ?? null;

				// tc_out
				$tcout = $ar_fragments[$key+1] ?? null;

				#
				# TCOUT : Corregimos el tcout si es inferior al anterior
				/*
					$tcin_value  = substr($tcin, 4,8);
					$tcout_value = substr($tcout, 4,8);

					if ( OptimizeTC::TC2seg($tcout_value) < OptimizeTC::TC2seg($tcin_value) ) {

						# Seconds +3
						$next_tcout_secs 			= OptimizeTC::TC2seg($tcin_value) + 3;

						# Format as tc like '00:01:03'
						$next_tcout_formated 	= OptimizeTC::seg2tc($next_tcout_secs);

						# Re-build tc out
						$tcout = '[TC_'. $next_tcout_formated .'_TC]';

							#echo " Changed tcout: $tcout from tcin $tcin <br>";
					}
					*/

				$ar_fragments_formated[] = array(
					'tcin'	 => $tcin,
					'tcout' => $tcout,
					'text'  => $text
				);
			}//end if(!preg_match($tcPattern, $value))
		}//end foreach ($ar_fragments as $key => $value)


		// ar_fragments
			$ar_final	= array();
			$length		= count($ar_fragments_formated);
			for ($i=0; $i < $length	; $i++) {

				$ar_value	= $ar_fragments_formated[$i];

				$tcin			= $ar_value['tcin'];
				$tcout			= $ar_value['tcout'];
				$text			= $ar_value['text'];
				// $is_last_Line	= ($i === $length-1) ? true : false;

				$ar_final[] = subtitles::fragment_split($text, $tcin, $tcout);
			}//end for ($i=0; $i < $length	; $i++)

		// Plain formatted array
			$ar_final_formatted = array();
			foreach ($ar_final as $key => $ar_value) {
				foreach ($ar_value as $value) {
					$ar_final_formatted[] = $value;
				}
			}


		return $ar_final_formatted;
	}//end get_ar_lines



	/**
	* FRAGMENT_SPLIT
	* LINES . Return lines of fragment
	* @param string $text
	* 	(raw text)
	* @param string $tc_in_tag
	* 	(tc tag like [TC_00:01:02_TC])
	* @param string|null $tc_out_tag
	* 	(tc tag like [TC_00:01:02_TC])
	* @return array $ar_lines
	*/
	public static function fragment_split(string $text, ?string $tcin, ?string $tcout) : array {

		// empty case
			if (empty($text)) {
				return [];
			}

		// short vars
			$siguiente_linea_add_b	= '';
			$siguiente_linea_add_i	= '';
			$is_last_Line			= false;
			$ar_lines				= array();
			$refPos					= 0;
			$offsetSecs				= OptimizeTC::TC2seg($tcin);
			$maxCharLine			= subtitles::$maxCharLine;
			$current_charTime		= subtitles::$charTime; // in milliseconds

		// calculate duration of char (secs)
		// there is a general calculation, but to optimize the approximation it is calculated
		// with the current fragment tc's if it has tc's
			if(!empty($tcin) && !empty($tcout)) {

				$current_durationSecs = OptimizeTC::TC2seg($tcout) - OptimizeTC::TC2seg($tcin);
				if ($current_durationSecs<0) {
					debug_log(__METHOD__
						." Error: tcout ($tcout) is bigger than tc_in ($tcin) "
						, logger::ERROR
					);
				}else{
					$current_lenChar	= subtitles::text_lenght($text);
					$current_charTime	= $current_durationSecs / $current_lenChar ;
					if ($current_charTime<0) {
						#$current_charTime= (float)$this->full_char_time_ms/1000; // Fallback to general chartime
						$current_charTime = 0;
					}
				}
			}

		// build lines
			$i=0;
			do{
				// First line
				$current_line = mb_substr( $text, $refPos, $maxCharLine);

				// search a blank space from end to begin . If n char of line < maxCharLine, this is the last line.
				$line_length = subtitles::text_lenght($current_line);

				// exception on large words
					// if (strpos($current_line, " ")===false) {
					// 	error_log("$i - line length; $line_length - maxCharLine: $maxCharLine ");
					// 	$current_line = substr_replace($current_line, " ", ($line_length/2), 0);
					// 	$line_length = subtitles::text_lenght($current_line);
					// }

				// spacePos
					if( $line_length < $maxCharLine ) {

						$spacePos		= $line_length;
						$is_last_Line	= true;

					}else{

						$spacePos = mb_strrpos($current_line, ' '); // Locate the last space
					}

				// save fragment text line
					$current_line_cut = trim( mb_substr($text, $refPos,  $spacePos) );


				// Bold & italics
					// add bold and italics at the beginning of a paragraph that has continuity in bold or italics,
					// the previous paragraph does not end and we transfer the label
					$current_line_cut = $siguiente_linea_add_i .= $current_line_cut;
					$current_line_cut = $siguiente_linea_add_b .= $current_line_cut;

					// bold. check if the bold has continuity in more than one line
						str_replace('<b>', '<b>', $current_line_cut, $count_br_in);
						str_replace('</b>', '</b>', $current_line_cut, $count_br_out);
						if ($count_br_in > $count_br_out) {
							$current_line_cut .= '</b>';
							$siguiente_linea_add_b = '<b>';
						}else{
							$siguiente_linea_add_b = '';
						}

					// italic. check if the italics have continuity in more than one line
						str_replace('<i>', '<i>', $current_line_cut, $count_br_in_italic);
						str_replace('</i>', '</i>', $current_line_cut, $count_br_out_italic);
						if ($count_br_in_italic > $count_br_out_italic){
							$current_line_cut .= '</i>';
							$siguiente_linea_add_i = '<i>';
						}else{
							$siguiente_linea_add_i = '';
						}

				// PROVISIONAL : Bold and italic formatting sometimes fails. To make sure there are no form errors in html
				// we check the final result of the line to debug the number and positioning of the labels
					$current_line_cut = subtitles::revise_tag_in_line($current_line_cut,'b');
					$current_line_cut = subtitles::revise_tag_in_line($current_line_cut,'i');

				$ar_lines[$i]['text']	= trim($current_line_cut);
				$current_tcin_secs		= $offsetSecs;

				$ar_lines[$i]['tcin']	= OptimizeTC::ms_format($current_tcin_secs);

				$duracion_linea = $spacePos * $current_charTime;
				$offsetSecs += $duracion_linea ;

				// add refPos for next iteration
				$refPos += $spacePos;

				$i++;
			}while($is_last_Line===false);


		return $ar_lines;
	}//end fragment_split



	/**
	* CALCULATE_GLOBAL_CHAR_TIME
	* @param string $sourceText (removed non TC tags)
	* @param int $total_ms
	* @return float $global_charTime
	* 	value in seconds
	*/
	public static function calculate_global_char_time(string $sourceText, $total_ms) : float {

		$global_charTime = 0;

		// count number of char
		$n_char = subtitles::text_lenght( $sourceText );

		// charTime in secs
		if($total_ms>0 && $n_char>0) {

			$global_charTime = $total_ms / $n_char;

			if ($global_charTime>0) {
				$global_charTime = $global_charTime / 1000;
			}
		}


		return floatval($global_charTime);
	}//end calculate_global_char_time



	/**
	* REVISE_TAG_IN_LINE
	* Fix possible errors on line string with received tag
	* @param string $line_string
	* @param string $tag_name
	* @return string $line_string
	*/
	public static function revise_tag_in_line(string $line_string, string $tag_name) : string {

		$line_string = str_replace('</'.$tag_name.'>'.'<'.$tag_name.'>', '', $line_string);
		$line_string = str_replace('</'.$tag_name.'> <'.$tag_name.'>', ' ', $line_string);
		$line_string = str_replace('<'.$tag_name.'>'.'</'.$tag_name.'>', '', $line_string);
		$line_string = str_replace('<'.$tag_name.'> </'.$tag_name.'>', ' ', $line_string);

		$open_tag_count		= substr_count($line_string, '<'.$tag_name.'>');
		$close_tag_count	= substr_count($line_string, '</'.$tag_name.'>');

		if ($open_tag_count!=$close_tag_count) {

			if ($open_tag_count > $close_tag_count) {
				$n_etiquetas_to_add = $open_tag_count - $close_tag_count;
				for ($i=0; $i <$n_etiquetas_to_add; $i++) {
					$line_string = $line_string . '</'.$tag_name.'>';
				}
			}
			else
			if ($close_tag_count > $open_tag_count) {
				$n_etiquetas_to_add = $close_tag_count - $open_tag_count;
				for ($i=0; $i <$n_etiquetas_to_add; $i++) {
					$line_string = '<'.$tag_name.'>'.$line_string;
				}
			}
		}

		return $line_string;
	}//end revise_tag_in_line



	/**
	* CLEAN_TEXT_FOR_SUBTITLES
	* Clear the text snippet
	* @param string $string (Transcription)
	* @return string $string (removed marks and extras)
	* @see class.TR.php deleteMarks
	*/
	public static function clean_text_for_subtitles(string $string) : string {

		# CONVERT ENCODING (Traducciones mal formadas provinientes de Babel)
		html_entity_decode($string);

		$string	= strip_tags($string, '<br><strong><em>');
		#$string	= strip_tags($string, '<br>');					# remove html tags (em and strong tags)

		$string = str_replace('<br />', " ", $string);				# convert br to ' '
		$string = str_replace('<strong>', '<b>', $string);
		$string = str_replace('</strong>', '</b>', $string);
		$string = str_replace('<em>', '<i>', $string);
		$string = str_replace('</em>', '</i>', $string);
		// $string = str_replace('<u>', '<u>', $string); # to implemented! now is a style with span
		// $string = str_replace('</u>', '</u>', $string);

		// unify spaces
		// Note that "\xc2\xa0" must be set with double quotes, not single.
		// @see https://stackoverflow.com/questions/40724543/how-to-replace-decoded-non-breakable-space-nbsp
		$string = str_replace(['&nbsp;',"\xc2\xa0",' '], ' ', $string);

		// remove UNICODE non-break character
		$string = preg_replace( "~\x{00a0}~siu", " ", $string );

		$options = new stdClass();
			$options->deleteTC = false;
		$string = TR::deleteMarks($string, $options);	# delete some marks

		return $string;
	}//end clean_text_for_subtitles



	/**
	* TRUNCATE_TEXT
	* Multi-byte truncate text
	* @param string $string
	* @param int|float $limit
	* @param string $break = ' '
	* @param string $pad = '...'
	* @return string
	*/
	public static function truncate_text(string $string, int|float $limit, string $break=' ', string $pad='...') : string {

		if (empty($string)) {
			return '';
		}

		// limit_int. float case manage
		$limit_int = (gettype($limit)==='double')
			? (int)round($limit) // sample: from 45.5 to 46
			: $limit;

		// return with no change if string is shorter than $limit_int
		$str_len = subtitles::text_lenght($string);  // strlen($string)
		if($str_len <= $limit_int) {
			return $string;
		}

		$string = mb_substr($string, 0, $limit_int);

		if(false!==($breakpoint = mb_strrpos($string, $break))) {
			$string = mb_substr($string, 0, $breakpoint);
		}

		return $string . $pad;
	}//end truncate_text



	/**
	* TRIM_TEXT
	* Trim first and last return of type \n and \r
	* @param string|null $string
	* @return string
	*/
	public static function trim_text( ?string $string=null ) : string {

		if (empty($string)) {
			return '';
		}

		$firstChar = substr($string,0,1);
		if($firstChar=="\r"|| $firstChar=="\n")	$string = substr($string,1);

		$lastChar = substr($string,-1);
		if($lastChar=="\r" || $lastChar=="\n")	$string = substr($string,0,-1);

		return trim($string) ;
	}//end trim_text



	/**
	* TEXT_LENGHT
	* Get multi-byte text length
	* @param string $text
	* @return int $text_lenght
	*/
	public static function text_lenght(string $text) : int {

		$text_lenght = mb_strlen($text);

		return $text_lenght;
	}//end text_lenght



	/**
	* GET_SUBTITLES_URL
	* @param int|string $section_id
	* @param float|int|null $tc_in = null
	* @param float|int|null $tc_out = null
	* @param string $lang = DEDALO_DATA_LANG
	*
	* @return string $subtitles_url
	*/
	public static function get_subtitles_url(int|string $section_id, $tc_in=null, $tc_out=null, string $lang=DEDALO_DATA_LANG) : string {

		// Subtitles url base
			// define('TEXT_SUBTITLES_URL_BASE', DEDALO_CORE_URL . '/publication/server_api/v1/subtitles/');
			// $TEXT_SUBTITLES_URL_BASE = DEDALO_CORE_URL . '/publication/server_api/v1/subtitles/';
			$TEXT_SUBTITLES_URL_BASE = defined('TEXT_SUBTITLES_URL_BASE')
				? TEXT_SUBTITLES_URL_BASE // defined in publication server config
				: (defined('DEDALO_ROOT_WEB')
					? DEDALO_ROOT_WEB . '/publication/server_api/v1/subtitles/'
					: null);
			if (empty($TEXT_SUBTITLES_URL_BASE)) {
				debug_log(__METHOD__
					." Error: Unable to get any TEXT_SUBTITLES_URL_BASE definition"
					, logger::ERROR
				);
			}

		// url vars
			$url_vars = [];

			$url_vars[] = 'section_id=' . $section_id;

			if (!empty($lang)) {
				$url_vars[] = 'lang=' . $lang;
			}

			if (!empty($tc_in)) {
				$url_vars[] = 'tc_in=' . $tc_in;
			}

			if (!empty($tc_out)) {
				$url_vars[] = 'tc_out=' . $tc_out;
			}

		$subtitles_url = $TEXT_SUBTITLES_URL_BASE . '?' . implode('&', $url_vars);


		return $subtitles_url;
	}//end get_subtitles_url



}//end class subtitles
