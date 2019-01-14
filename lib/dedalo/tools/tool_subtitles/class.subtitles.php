<?php
/**
* SUBTITLES
* Construye un texto formateado para subtítulos estándar a aprtir de una trancripción con códigos de tiempo.
* Esta clase es genérica y debe servir también para las partes públicas.
* Cuando se use fuera de Dédalo, copiar este fichero y llamar a 'build_subtitles_text' desde la clase solicitante.
* Para poder aprovechar las mejoras y corrección de errores del desarrollo de Dédalo, llevar control de versión de esta clase
*/
abstract class subtitles {


	# Version. Important!
	static $version = "1.0.1"; // 07-03-2017

	# int $maxCharLine . Max number of chars for subtitle line. Default 144
	static $maxCharLine;

	# float $charTime . Number of seconds that each character is long
	static $charTime;



	/**
	* BUILD_SUBTITLES_TEXT
	* @param object $request_options
	* @return string | false $srt
	*/
	public static function build_subtitles_text( $request_options ) {

		$options = new stdClass();
			$options->sourceText  					= null;		# clean text fragment without <p>, [TC], [INDEX] tags
			$options->sourceText_unrestricted  		= null;
			$options->total_ms 						= null;		# total of miliseconds (tcout-tcin)
			$options->maxCharLine 					= 144;		# max number of char for subtitle line. Default 144			
			$options->type 							= 'srt';	# File type: srt or xml
			$options->show_debug    				= false;	# Default false
			$options->advice_text_subtitles_title  	= null;  	# Text like "Automatic translation"
			$options->tc_in_secs 					= false;	# Optional subtitles filter from in tc
			$options->tc_out_secs   				= false;	# Optional subtitles filter from out tc
			
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}
						
		// Set static vars
			$maxCharLine = $options->maxCharLine;
			subtitles::$maxCharLine = $maxCharLine;

		// Mandatory vars check
			$ar_mandatory = array('sourceText','maxCharLine');
			foreach ($ar_mandatory as $value) {
				if (empty($options->$value)) {
					trigger_error("Unable build_subtitles_text. Few vars ($value)");
					return false;
				}
			}
			#$options->sourceText = $options->sourceText_unrestricted;

		// Clean text from non tc tags
			if (is_null($options->sourceText_unrestricted)) {
				$clean_sourceText_unrestricted = $clean_sourceText = subtitles::clean_text_for_subtitles($options->sourceText);			
			}else{
				$clean_sourceText_unrestricted = subtitles::clean_text_for_subtitles($options->sourceText_unrestricted);
				$clean_sourceText 			   = subtitles::clean_text_for_subtitles($options->sourceText);			
			}

		// Global char time in seconds (float)
			subtitles::$charTime = subtitles::calculate_global_char_time( $clean_sourceText_unrestricted, $options->total_ms );
				#dump(subtitles::$charTime , ' calculate_global_char_time subtitles::$charTime  ++ '.to_string($options->total_ms));

		// Calculate ar_lines
			$ar_lines = (array)subtitles::get_ar_lines($clean_sourceText);
				#dump($ar_lines, ' ar_lines'); #die();

		// Fragment subtitles
			if ($options->tc_in_secs!==false) {
				$ar_lines = subtitles::build_fragment($ar_lines, $options->tc_in_secs, $options->tc_out_secs);
			}

		#
		# CREATE FILE
		#			
			$srt 		  				 = '';
			$type 		  				 = $options->type; // 'srt';
			$advice_text_subtitles_title = $options->advice_text_subtitles_title;
				
			$i=1; foreach($ar_lines as $key => $line) {

				// tcin
					$tcin = $line['tcin']; # Like '00:00:03.000'
						#dump($line, ' line ++ '.to_string());

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
				# 2 LINES : Si el text es mas largo de 1 linea (la mitad de $maxCharLine) lo fragmentamos en 2 lineas separadas por un retorno de carro '\n'
					$text_line_lenght = subtitles::text_lenght($text);
					if( $text_line_lenght > ($maxCharLine/2)  ) {

						$sub_text 	= subtitles::truncate_text($text, ($maxCharLine/2), $break=" ", $pad="");
						$sub_text2 	= str_replace($sub_text, '', $text);

						$text_final = trim($sub_text) . "\n" . trim($sub_text2);
					}
					#dump($text_final, '$text_final', array());

				#
				# TC_OUT
				# Normalmente, la línea siguiente (en el array de líneas) será un tag tc de tipo [TC_00:01:08_TC]
				# Si no lo fuera (la última línea por ejemplo), lo suplantaremos son un cálculo fijo				
					if (!empty($ar_lines[$key+1]['tcin'])) {

						$tcout 	= $ar_lines[$key+1]['tcin'];
							#dump($tcin,'$tcin '." key: $key -  tcout: $tcout - $text_final");
					}else{

						$tcin_value = OptimizeTC::TC2seg($ar_lines[$key]['tcin']);

						# Seconds +5
						$tcout_final_secs 		= $tcin_value + 5;
							#dump($tcout_final_secs, 'tcout_final_secs', array());

						# Format as tc like '00:01:03.765'
						$tcout_final_formated 	= OptimizeTC::seg2tc($tcout_final_secs);	

						# tcout
						$tcout = $tcout_final_formated;
							#dump($tcout, 'tcout '.$ar_lines[$key]['tcin'], array());
					}

				#
				# LINE				
					# ADVICE_TEXT_SUBTITLES_TITLE
					# Añadimos un rótulo previo al primero, desde tc 0 hasta el comienzo del primer fragmento
					if ($i===1 && !empty($options->advice_text_subtitles_title)) {
						$srt .= "$i\n";
						$srt .= "00:00:00.000 --> $tcin\n";
						$srt .= "<i>(".$advice_text_subtitles_title.")</i>\n";
						$srt .= "\n";
						$i++;
					}
					
					# vtt line number
					$srt .= "$i\n";
					# vtt line tcs
					$srt .= "{$tcin} --> {$tcout}\n";
					# vtt line text
					$srt .= $text_final."\n";
					# vtt line break
					$srt .= "\n";
					
			$i++; }#foreach($ar_lines as $key => $line)

			$srt = "WEBVTT\n\n".$srt;

			# ENCODING
			#$srt = mb_convert_encoding($srt, 'UTF-8', 'auto');	
			

			return (string)$srt;
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
	public static function build_fragment($ar_lines, $tc_in_secs, $tc_out_secs) {
		
		$fragment_ar_lines = [];

		$tc_in_secs = (int)$tc_in_secs;
		$tc_out_secs= (int)$tc_out_secs ;
	
		foreach ($ar_lines as $key => $line) {
			
			$tc = (int)OptimizeTC::TC2seg($line['tcin']);
			
			// Skip lines before tc_in_secs
				if ( $tc < $tc_in_secs ) {
					continue; # Skip
				}

			// Offset
				$current_time 	= $tc - $tc_in_secs; // Use tc_in_secs as offset
				$current_tc 	= OptimizeTC::seg2tc($current_time);
				$line['tcin']	= $current_tc;

			// Add valid line
				$fragment_ar_lines[] = $line;

			// Skip lines after tc_out_secs
				if ( !empty($tc_out_secs) && $tc > $tc_out_secs ) {
					break;
				}
		}

		return $fragment_ar_lines;
	}//end build_fragment



	/**
	* GET_AR_LINES
	* @param string $tcin
	* @param string $tcout
	*
	* @return array $ar_final
	*/
	public static function get_ar_lines($text) {

		# Explode text by tc pattern		
		#$tcPattern 	= "/(\[TC_[0-9]{2}:[0-9]{2}:[0-9]{2}\.?[0-9]{3}?_TC\])/";
		#$tcPattern 	= "/(\[TC_[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9]{1,3}_TC\])/";
		$tcPattern 		= TR::get_mark_pattern('tc_full',$standalone=true);
		$ar_fragments	= preg_split($tcPattern, $text, -1, PREG_SPLIT_NO_EMPTY | PREG_SPLIT_DELIM_CAPTURE);
		#preg_match_all("/(\[TC_[0-9][0-9]:[0-9][0-9]:[0-9][0-9]_TC\])/", $text, $ar_fragments, PREG_SET_ORDER);
			#dump($ar_fragments,'$ar_fragments - '); die();

		$ar_fragments_formated = array();
		if (is_array($ar_fragments)) foreach ($ar_fragments as $key => $value) {
			
			# echo "<br>$key - $value";
			if(!preg_match($tcPattern, $value)) {
				# Es un texto
				$text 	= $value;
				#if (empty($text) || strlen($text)<1 ) continue; # Skip

				#$tcin 	= $ar_fragments[$key-1];
				if (isset($ar_fragments[$key-1])) {
					$tcin 	= $ar_fragments[$key-1];
				}else{
					$tcin 	= null;
				}
				
				#$tcout 	= $ar_fragments[$key+1];
				if (isset($ar_fragments[$key+1])) {
					$tcout 	= $ar_fragments[$key+1];
				}else{
					$tcout 	= null;
				}

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

							# Rebuilded tc out
							$tcout = '[TC_'. $next_tcout_formated .'_TC]';

								#echo " Changed tcout: $tcout from tcin $tcin <br>";
						}
						*/
				
				$ar_fragments_formated[] = array('tcin'	 => $tcin,
												 'tcout' => $tcout,
												 'text'  => $text,											
												);
			}//end if(!preg_match($tcPattern, $value))
		}
		#dump($ar_fragments_formated,'$ar_fragments_formated'); die();

		$ar_final = array();
		foreach ($ar_fragments_formated as $ar_value) {

			$tcin 	= $ar_value['tcin'];
			$tcout 	= $ar_value['tcout'];
			$text 	= $ar_value['text'];

			$ar_final[] = subtitles::fragment_split($text, $tcin, $tcout);
		}
		#dump($ar_final,'ar_final en get_ar_lines'); die();			
		
		# Plain formated
		$ar_final_formated = array();
		foreach ($ar_final as $key => $ar_value) {			
			foreach ($ar_value as $key2 => $value) {
				$ar_final_formated[] = $value;
			}						
		}
		#dump($ar_final_formated,'$ar_final_formated');

		return (array)$ar_final_formated;
	}//end get_ar_lines



	/**
	* FRAGMENT_SPLIT
	* LINES . Return lines of fragment
	* @param string $text (raw text)
	* @param string $tc_in_tag (tc tag like [TC_00:01:02_TC])
	* @param string $tc_out_tag (tc tag like [TC_00:01:02_TC])
	*/
	public static function fragment_split($text, $tcin, $tcout) {

		$siguiente_linea_add_b 	= '';
		$siguiente_linea_add_i 	= '';
		$lastLine				= false;
		$ar_lines 				= array();
		$refPos					= 0;
		$offsetSecs 			= OptimizeTC::TC2seg($tcin); 	#dump($offsetSecs, ' offsetSecs');
		$maxCharLine 			= subtitles::$maxCharLine;		
		$current_charTime 		= subtitles::$charTime; // miliseconds

		# calculate duration of char (secs)
		# hay un cálculo general, pero para optimizar la aproximación se calcula con los tc's de fragmento actual si tiene tc's 
		#dump($current_charTime, 'current_charTime GLOBAL', array());
		if(!empty($tcin) && !empty($tcout)) {

			$current_durationSecs = OptimizeTC::TC2seg($tcout) - OptimizeTC::TC2seg($tcin);

			if ($current_durationSecs<0) {
				trigger_error("ERROR: fragment_split : el tcout ($tcout) es menor que el tcin ($tcin)");
				#return array();
			}else{
				$current_lenChar		= subtitles::text_lenght($text);
				$current_charTime		= $current_durationSecs / $current_lenChar ;
				if ($current_charTime<0) {
					#$current_charTime= (float)$this->full_char_time_ms/1000; // Fallback to general chartime
					$current_charTime=0;
				}
			}			
		}
		#dump($current_charTime, 'current_charTime AFTER', array());

		$reference_text = $text;
		#$reference_text = strip_tags($reference_text);
		#$reference_text = utf8_decode($text);			

		$i=0; do{
			# Primera linea			

			$current_line = mb_substr( $text, $refPos, $maxCharLine );
			
			# search a blank space from end to begin . If n char of line < maxCharLine, this is the last line.
			$line_length = subtitles::text_lenght($current_line); 	#dump($line_length, ' $line_length ++ '.to_string());
			
			if($line_length < $maxCharLine) {

				$lastLine = true;
				$spacePos = $line_length;
					#dump($lastLine, ' LASTLINE .........................................................');		
			}else{
				#dump(strrpos($current_line, '. '), 'strrpos($current_line, '. ')');
				/*
				if ( strrpos($current_line, '. ') >0 ) {
					$spacePos = strrpos($current_line, '. ')+1;
					#$spacePos 	= mb_strlen($current_line) - $last_appear;
				}else{
					$spacePos = strrpos($current_line, ' '); # Localiza el último espacio
					#$spacePos 	 = mb_strlen($current_line) - $last_appear;
				}
				*/
				$spacePos = mb_strrpos($current_line, ' '); # Localiza el último espacio
					#$spacePos 	 = mb_strlen($current_line) - $last_appear;
			}

			# save fragment text line
			$current_line_cut = ''.trim( mb_substr($text, $refPos,  $spacePos) );			
				#dump($current_line_cut, "current_line_cut $refPos, $spacePos");	

			#
			# NEGRITAS E ITALICAS
				#dump($current_line_cut, '$siguiente_linea_add_b', array());

				#añadimos negritas e italicas al principio de un párrafo que tiene continuidad en las negritas o italicas, el parrafo anterior no acaba y transpasaomos la etiqueta
				$current_line_cut	= $siguiente_linea_add_b .=$current_line_cut;
				$current_line_cut	= $siguiente_linea_add_i .=$current_line_cut;

				#comprobamos si las negritas tienen contiuidad en más de una línea
				$numero_br = str_replace('<b>', '<b>', $current_line_cut, $br_in);
				$numero_br = str_replace('</b>', '</b>', $current_line_cut, $br_out);					

				if ($br_in>$br_out){
					//echo "necesita un br $br_in $br_out";
					$current_line_cut .= '</b>';
					$siguiente_linea_add_b = '<b>';
				}else{
					$siguiente_linea_add_b = '';
				}
				
			
				#comprobamos si las italicas tienen contiuidad en más de una línea
				$numero_br = str_replace('<i>', '<i>', $current_line_cut, $br_in);
				$numero_br = str_replace('</i>', '</i>', $current_line_cut, $br_out);

				if ($br_in>$br_out){
					//echo "necesita un br $br_in $br_out";
					$current_line_cut .= '</i>';
					$siguiente_linea_add_i = '<i>';
				}else{
					$siguiente_linea_add_i = '';
				}			
			
			# PROVISIONAL : El formateo de negritas y itálicas falla en ocasiones. Para asegurarnos de que no haya errores de forma en html revisamos 
			# el resultado final de la línea para depurar el número y posicionamiento de las etiquetas
			#if(SHOW_DEBUG) {
				$current_line_cut = subtitles::revise_tag_in_line($current_line_cut,'b');
				$current_line_cut = subtitles::revise_tag_in_line($current_line_cut,'i');
			#}			

			$ar_lines[$i]['text'] = trim($current_line_cut);
			#$current_tcin_secs	  = $offsetSecs - ($this->tcin);	// Eliminada esta parte (verificar su influencia): + ($this->dif_ms_in/1000);
			$current_tcin_secs	  = $offsetSecs;

			#$current_tcin_secs	= floatval(number_format($current_tcin_secs, 3));
				#dump($current_tcin_secs, ' current_tcin_secs');
			
			$ar_lines[$i]['tcin']	= OptimizeTC::ms_format($current_tcin_secs);

			$duracion_linea = $spacePos * $current_charTime;
			$offsetSecs += $duracion_linea ;	
				#dump($duracion_linea,"duracion_linea offsetSecs: $offsetSecs -  spacePos: $spacePos - current_charTime: $current_charTime");
						
			# add refPos for next iteration
			$refPos += $spacePos;
			
			$i++;
		}while ($lastLine === false);

		#dump($ar_lines, ' ar_lines ++ '.to_string());		
		#die();
		#dump($ar_lines, 'ar_lines', array());

		return (array)$ar_lines ;
	}//end fragment_split



	/**
	* CALCULATE_GLOBAL_CHAR_TIME
	* @param string $sourceText (removed non TC tags)
	* @param int $total_ms
	* @return float $global_charTime (in seconds)
	*/
	public static function calculate_global_char_time( $sourceText, $total_ms ) {
		$global_charTime=0;
		# count number of char
		$n_char = subtitles::text_lenght( $sourceText );
		
		# charTime in secs
		if($total_ms>0 && $n_char>0) {
			$global_charTime = $total_ms / $n_char;

			# Lo devolvemos en segundos
			if ($global_charTime>0) {
				$global_charTime = $global_charTime / 1000;
			}
		}
		/*
		dump($global_charTime, 'global_charTime', array(
			'n_char' => $n_char,
			'total_ms' => $total_ms,
			));
		*/

		return $global_charTime;
	}//end calculate_global_char_time


	/**
	* REVISE_TAG_IN_LINE
	* Fix possible errors on line string with received tag
	* @return string $line_string
	*/
	public static function revise_tag_in_line($line_string, $tag_name) {
		
		$line_string = str_replace('</'.$tag_name.'>'.'<'.$tag_name.'>', '', $line_string);
		$line_string = str_replace('</'.$tag_name.'> <'.$tag_name.'>', '', $line_string);
		$line_string = str_replace('<'.$tag_name.'>'.'</'.$tag_name.'>', '', $line_string);
		$line_string = str_replace('<'.$tag_name.'> </'.$tag_name.'>', '', $line_string);

		$open_tag_count = substr_count($line_string, '<'.$tag_name.'>');
			#dump($open_tag_count, "OPEN ".htmlspecialchars($line_string) );
		$close_tag_count = substr_count($line_string, '</'.$tag_name.'>');
			#dump($close_tag_count, "CLOSE ".htmlspecialchars($line_string) );
			#dump(htmlspecialchars($line_string), "OPEN $open_tag_count - CLOSE $close_tag_count" );

		if ($open_tag_count!=$close_tag_count) {
			#throw new Exception("Error Processing Request $open_tag_count - $close_tag_count", 1);	
			if(SHOW_DEBUG) {
				#trigger_error("ERROR: revise_tag_in_line -> No se correspondían las etiquetas '$tag_name' : $open_tag_count/$close_tag_count - ".htmlspecialchars($line_string));
			}

			if ($open_tag_count > $close_tag_count) {
				$n_etiquetas_to_add = $open_tag_count - $close_tag_count;
				for ($i=0; $i <$n_etiquetas_to_add ; $i++) { 
					$line_string = $line_string . '</'.$tag_name.'>';
				}
			}
			else
			if ($close_tag_count > $open_tag_count) {
				$n_etiquetas_to_add = $close_tag_count - $open_tag_count;
				for ($i=0; $i <$n_etiquetas_to_add ; $i++) { 
					$line_string = '<'.$tag_name.'>'.$line_string;
				}
			}
		}

		return (string)$line_string;
	}//end revise_tag_in_line



	/**
	* CLEAN_TEXT_FOR_SUBTITLES
	* Limpia el fragmento del texto
	* @param string $string (Transcription)
	* @return string $string (removed marks and extras)
	* @see class.TR.php deleteMarks
	*/
	public static function clean_text_for_subtitles($string) {

		# CONVERT ENCODING (Traducciones mal formadas provinientes de Babel)
		html_entity_decode($string);

		$string	= strip_tags($string, '<br><strong><em>');	
		#$string	= strip_tags($string, '<br>');					# remove html tags (em and strong tags)	

		$string = str_replace('<br />', " ", $string);				# convert br to ' '	
		$string = str_replace('<strong>', '<b>', $string);
		$string = str_replace('</strong>', '</b>', $string);
		$string = str_replace('<em>', '<i>', $string);
		$string = str_replace('</em>', '</i>', $string);
		$string = str_replace(['&nbsp;'], [' '], $string);
		
		$options = new stdClass();
			$options->deleteTC = false;
		$string = TR::deleteMarks($string, $options);	# delete some marks
		
		return $string;
	}//end clean_text_for_subtitles



	/**
	* TRUNCATE_TEXT
	* Multibyte truncate text
	*/
	public static function truncate_text($string, $limit, $break=" ", $pad="...") {

		# return with no change if string is shorter than $limit
		$str_len = subtitles::text_lenght($string);  // strlen($string)
		if($str_len <= $limit) return $string;
		
		$string = mb_substr($string, 0, $limit);

		if(false !== ($breakpoint = mb_strrpos($string, $break))) {
			$string = mb_substr($string, 0, $breakpoint);
		}

		return $string . $pad;
	}//end truncate_text



	/**
	* TRIM_TEXT
	* Trim firts and last return of type \n and \r
	* @return string
	*/
	public static function trim_text($string) {
		$firstChar = substr($string,0,1);
		if($firstChar=="\r"|| $firstChar=="\n")	$string = substr($string,1);
		
		$lastChar = substr($string,-1);
		if($lastChar=="\r" || $lastChar=="\n")	$string = substr($string,0,-1);
		
		return trim($string) ;
	}//end trim_text



	/**
	* TEXT_LENGHT
	* Get multibyte text lenght
	* @return int | false $text_lenght
	*/
	public static function text_lenght($text) {
		
		#$text_lenght = strlen($text);
		$text_lenght = mb_strlen($text, '8bit');

		return $text_lenght;
	}//end text_lenght



	/**
	* GET_SUBTITLES_URL
	* @return string $subtitles_url
	*/
	public static function get_subtitles_url($section_id, $tc_in=false, $tc_out=false, $lang=DEDALO_DATA_LANG) {		
		
		// Subtitles url base
			$TEXT_SUBTITLES_URL_BASE = DEDALO_LIB_BASE_URL . '/publication/server_api/v1/subtitles/';
			#define('TEXT_SUBTITLES_URL_BASE', DEDALO_LIB_BASE_URL . '/publication/server_api/v1/subtitles/');
		
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
	



}//end subtitles
?>