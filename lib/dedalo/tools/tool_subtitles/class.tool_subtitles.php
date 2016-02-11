<?php
/*
* CLASS TOOL_SUBTITLES
*/
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
require_once( dirname(dirname(dirname(__FILE__))) .'/media_engine/class.OptimizeTC.php');


class tool_subtitles extends tool_common {


	public $source_component;	
	public $section_tipo;

	/**/
	protected $sourceText;		# clean text fragment without <p>, [TC], [INDEX] tags
	protected $maxCharLine; 	# max number of char for subtitle line
	protected $total_ms;		# total of secs (tcout-tcin)
	protected $offsetTCsecs;	# offset of clip in seconds (normally 0)
	protected $tc_offset;		# offset of subtitles marks (normally 0)
	protected $tcin;			# tcin received
	protected $tcout;			# tcout received
	protected $n_char;			# number total of chars in this text
	protected $charTime;		# secs by char
	protected $ar_lines 		= array(); # Array of procesed and formated lines

	protected $show_debug;
	

	public function __construct($component_obj, $modo='button') {
	
		# Fix modo
		$this->modo = $modo;

		# Para unificar el acceso, se copia el componente a $this->component_obj
		$this->component_obj = $component_obj;
		$this->section_tipo  = $component_obj->get_section_tipo();

		$this->show_debug = false;
	}


	
	/**
	* BUILD_SUBTITLES_TEXT
	* @param object $request_options
	* @return 
	*/
	/*	
		$dif_ms_in 	= ($dif_frame_in / $fps)  * 1000  ;	#dump($dif_ms_in,'dif_ms_in + '.$dif_frame_in);
		$dif_ms_out = ($dif_frame_out / $fps) * 1000  ; #dump($dif_ms_out,'dif_ms_out + '.$dif_frame_out);
		
		$xmlFileName	= $id .'_'. str_replace(":", '', $tcin) .'-'. str_replace(":", '', $tcout) .'_'. WEB_CURRENT_LANG_CODE . ".xml"; 
		$maxCharLine	= 80;
		$offsetTC		= 0;
		$rewrite		= true;	# default: false . If true, rewrite always the xml file
		$SubtitlesObj	= new SubtitlesObj($textoSelRaw, $time_in_original_ms, $time_out_original_ms, $offsetTC, $maxCharLine, $xmlFileName, $tc_offset, $dif_ms_in, $dif_ms_out );
		

		$xmlFile		= $SubtitlesObj->write_file('xml',$rewrite);
		$srtFile		= $SubtitlesObj->write_file('srt',$rewrite);
	*/
	public function build_subtitles_text( $request_options ) {

		$options = new stdClass();
			$options->sourceText  	= null;		# clean text fragment without <p>, [TC], [INDEX] tags
			$options->total_ms 		= null;		# total of secs (tcout-tcin)
			$options->maxCharLine 	= 144;		# max number of char for subtitle line. Default 144
			
			#$options->offsetTCsecs	= 0;		# offset of clip in seconds (normally 0)
			#$options->tc_offset	= null;		# offset of subtitles marks (normally 0)
			#$options->tcin			= null;		# tcin received in miliseconds
			#$options->tcout		= null;		# tcout received in miliseconds
			
			#$options->n_char		= null;		# number total of chars in this text
			#$options->charTime		= null;		# secs by char
			#$options->ar_lines		= array(); 	# Array of procesed and formated lines;
			#$options->dif_ms_in	= null;
			#$options->dif_ms_out	= null;

		foreach ($request_options as $key => $value) {
			if (property_exists($options, $key)) {
				$options->$key = $value;
				$this->$key = $value;	// Set class var value
			}
		}

		# Mandatory vars
		$ar_mandatory = array('sourceText','maxCharLine');
		foreach ($ar_mandatory as $value) {
			if (!isset($options->$value)) {
				trigger_error("Unable build_subtitles_text. Few vars ($value)");
				return false;
			}
		}
		#dump($options, ' options');die();
		
		# Clean text from non tc tags
		$this->sourceText = $this->cleanTextForSubtitles($options->sourceText);
			#dump($this->sourceText, ' sourceText'); die();

		# Duration total in ms
		$this->total_ms = $options->total_ms;	// $this->calculate_total_ms($options->tcin, $options->tcout);
			#dump($this->total_ms,"$this->total_ms [$options->tcout  - $options->tcin]");die();
			#dump($this->total_ms,"this->total_ms");die();

		# Global char time in seconds (float)
		$this->charTime = $this->calculate_global_charTime( $this->sourceText, $this->total_ms );
			#dump($this->charTime, ' this->charTime'); #die();

		#dump($this, ' this');die();

		$this->ar_lines = (array)$this->get_ar_lines_new();
			#dump($this->ar_lines, ' ar_lines'); #die();

		#$currentTimeSecs	= $this->offsetTCsecs + 0 ;
			#dump($currentTimeSecs, ' currentTimeSecs');


		#
		# CREATE FILE
		#
			$i			= 0;		
			$xml 		= "<tt xmlns=\"http://www.w3.org/2006/10/ttaf1\">\n<body>\n<div>";
			$srt 		= '';

			$type='srt';
			
			if( DEDALO_ENTITY=='development' ) {
				$added_advice = false;
			}else{
				$added_advice = false;	# TEMPORAL !!!!!!! SET TO FALSE WHEN WORK IN PRODUCTION
			}
			
			foreach($this->ar_lines as $key => $line) {

				$tcin	= $line['tcin'];
				$text	= self::my_trim($line['text']);
				# generamos si o si el retorno de carro en pregunta respuesta
				$text 	= str_replace('</b>',"</b>\n",$text);
				#$text 	= str_replace('<b>',"<b>\n",$text);
				$text 	= str_replace('\n\n', '\n', $text);
				$text 	= str_replace("  ", " ", $text);
				$text 	= trim($text);		
				
					#dump($text_final);
					#dump(self::my_strlen($text), $this->maxCharLine/2, array());			
				
				$text_final = $text;
				# 2 LINES : Si el text es mas largo de 1 linea (la mitad de $this->maxCharLine) lo fragmentamos en 2 lineas separadas por un retorno de carro '\n'
				$text_line_lenght = self::my_strlen($text);
				if( $text_line_lenght > ($this->maxCharLine/2)  ) {

					$sub_text 	= self::truncate_text($text, ($this->maxCharLine/2), $break=" ", $pad="");
					$sub_text2 	= str_replace($sub_text, '', $text);

					$text_final = trim($sub_text) . "\n" . trim($sub_text2);										
				}
				#dump($text_final, '$text_final', array());

				
				if (empty($this->ar_lines[$key+1]['tcin'])) {

					$tcin_value = OptimizeTC::TC2seg($this->ar_lines[$key]['tcin']);
						#dump($tcin_value, 'tcin_value', array());

					# Seconds +3
					$tcout_final_secs 		= $tcin_value + 5;
						#dump($tcout_final_secs, 'tcout_final_secs', array());

					# Format as tc like '00:01:03'			
					$tcout_final_formated 	= OptimizeTC::seg2tc($tcout_final_secs).'.000';	

					$tcout = $tcout_final_formated;
						#dump($tcout, 'tcout '.$this->ar_lines[$key]['tcin'], array());	
				}else{
					$tcout 	= $this->ar_lines[$key+1]['tcin'];
						#dump($tcin,'$tcin '." key: $key -  tcout: $tcout - $text_final");	
				}

				
				switch($type) {
					
					# XML (FLASH PLAYER)
					case 'xml'	: 	# format <p begin="00:00:06" end="00:00:14" >demand the exclusion of Colombia from the UNO and the OAS.</p>
									if (!$added_advice) {
										$xml .= "\n<p begin=\"00:00:00.040\" end=\"$tcin\"><i>(".$advice_text_subtitles_title.")</i></p>";
									}
									# !! NOTA: Eliminadas negritas e itálicas deliberadamente hasta revisar el funcionamiento de la mismas
									# ya que los errores anulan el visionado de los títulos en flash..
									#$text_final	= strip_tags($text_final, '<br>');				
									$xml .= "\n<p begin=\"$tcin\" end=\"$tcout\">".$text_final."</p>";															
									break;
					
					# SRT (HTML5 PLAYER)			
					case 'srt'	: 	# format 1\n00:00:00,000 --> 00:00:08,000\nHola Anna. Gràcies\n\n															
									$i++;
									if($this->show_debug == true) {
										$srt .= "$i\n{$tcin} --> {$tcout}\n {$tcin} - {$tcout}\n DEBUG:{$text_final}\n\n";
									}else{
										# ADVICE_TEXT_SUBTITLES_TITLE
										# Añadimos un rótulo previo al primero, desde tc 0 hasta el comienzo del primer fragmento
										/*
										if (!$added_advice) {
											$srt .= "$i\n00:00:00.000 --> $tcin\n";
											$srt .= "<i>(". $advice_text_subtitles_title.")</i>\n\n";
											$i++;
										}
										*/
										$srt .= "$i\n{$tcin} --> {$tcout}\n";
										#if (!$added_advice) {
										#	$srt .= "-- <i style=\"color:#ff6a07 !important;padding-bottom:20px;\">$advice_text_subtitles_title</i> -- \n";											
										#}
										$srt .= $text_final;
										$srt .= "\n\n";
									}
									#dump($srt, 'srt', array());							
									break;										
				}#switch($type)

				$added_advice = true;
				
			}#foreach($this->ar_lines
			
			
			switch($type) {
					
					case 'xml'	:	$xml .= "\n</div>\n</body>\n</tt>";		
									$this->debug['xml'] = $xml;
									$this->xml = $xml;
									
									return $this->xml;
									break;
									
					case 'srt'	:	$srt = "WEBVTT\n\n".$srt;
									$this->debug['srt'] = $srt;

									# ENCODING
									#$srt = mb_convert_encoding($srt, 'UTF-8', 'auto');					

									$this->srt = $srt;
										#dump($this->srt,'$this->srt');
									
									return $this->srt;
									break;
			}


			return false;
		
	}#end build_subtitles_text


	# TRUNCATE
	function truncate_text($string, $limit, $break=" ", $pad="...") {

	  # return with no change if string is shorter than $limit
	  if(strlen($string) <= $limit) return $string;

	  $string = substr($string, 0, $limit);
	  if(false !== ($breakpoint = strrpos($string, $break))) {
		$string = substr($string, 0, $breakpoint);
	  }

	  return $string . $pad;
	}

	/**
	* GET_AR_LINES_NEW
	* @param string $tcin
	* @param string $tcout
	* @return array $ar_final
	*/
	function get_ar_lines_new() {

		$text = $this->sourceText;
		/*
		$tcin  = $this->tcin;
		$tcout = $this->tcout; 							

		# Descontamos el tc inicial (empezamos en 00:00:00)
		$tcin 	= OptimizeTC::seg2tc($tcin );
		$tcout 	= OptimizeTC::seg2tc($tcout);
			#dump($tcout, ' tc_in');	

		
		if (strpos($text, '[TC_'. $tcin .'_TC]')===false) {
			$text = '[TC_'. $tcin .'_TC]' . $text;
		}
		if (strpos($text, '[TC_'. $tcout .'_TC]')===false) {
			$text = $text . '[TC_'. $tcout .'_TC]';
		}
		#$text 	= '[TC_'. $tcin .'_TC]' . trim($this->sourceText) . '[TC_'. $tcout .'_TC]';	# like [TC_00:00:04_TC]
			#dump($text,'$text '."$this->tcin -> $this->tcout"); die();
		*/
		# explode by tc pattern
		$tcPattern 			= "/(\[TC_[0-9][0-9]:[0-9][0-9]:[0-9][0-9]_TC\])/";	#TR::get_mark_pattern('tc',$standalone=true);
		$ar_fragments		= preg_split($tcPattern, $text, -1, PREG_SPLIT_NO_EMPTY | PREG_SPLIT_DELIM_CAPTURE);
		#preg_match_all("/(\[TC_[0-9][0-9]:[0-9][0-9]:[0-9][0-9]_TC\])/", $text, $ar_fragments, PREG_SET_ORDER);
			#dump($ar_fragments,'$ar_fragments'); die();

		$ar_fragments_formated = array();
		if (is_array($ar_fragments)) foreach ($ar_fragments as $key => $value) {
			# code...
			#echo "<br>$key - $value";
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

				
				$ar_fragments_formated[] = array(	'tcin' 	=> $tcin,
													'tcout' => $tcout,
													'text' 	=> $text,													
													);
			}
		}
		#dump($ar_fragments_formated,'$ar_fragments_formated'); #die();

		$ar_final = array();
		foreach ($ar_fragments_formated as $ar_value) {

			$tcin 	= $ar_value['tcin'];
			$tcout 	= $ar_value['tcout'];
			$text 	= $ar_value['text'];

			$ar_final[] = $this->fragment_split($text,$tcin,$tcout);
		}
		#dump($ar_final,'ar_final en get_ar_lines_new'); die();
		#$this->tc_offset = OptimizeTC::TC2seg($this->tcin);		
		
		# Foramteado plano
		$ar_final_formated = array();
		foreach ($ar_final as $key => $ar_value) {
			
			foreach ($ar_value as $key2 => $value) {
				$ar_final_formated[] = $value;
			}						
		}
		#dump($ar_final_formated,'$ar_final_formated');		

		return (array)$ar_final_formated;

	}#end get_ar_lines_new


	/**
	* FRAGMENT_SPLIT
	* LINES . Return lines of fragment
	*/
	function fragment_split($text ,$tcin, $tcout) {

		$siguiente_linea_add_b = '';
		$siguiente_linea_add_i = '';
		$lastLine	= false;
		$ar_lines 	= array();
		$refPos		= 0;
		$offsetSecs = intval(OptimizeTC::TC2seg($tcin)); 	#dump($offsetSecs, ' offsetSecs');
		$i=0;

		# calculate duration of char (secs)
		# hay un cálculo general, pero para optimizar la aproximación se calcula con los tc's de fragmento actual si tiene tc's 
		$current_charTime = $this->charTime;
			#dump($current_charTime, 'current_charTime GLOBAL', array());
		if(!empty($tcin) && !empty($tcout)) {

			$current_durationSecs	= OptimizeTC::TC2seg($tcout) - OptimizeTC::TC2seg($tcin);

			if ($current_durationSecs<0) {
				trigger_error("ERROR: fragment_split : el tcout ($tcout) es menor que el tcin ($tcin)");
			}else{
				$current_lenChar		= self::my_strlen($text);
				$current_charTime		= $current_durationSecs / $current_lenChar ;
				if ($current_charTime<0) $current_charTime=0;
			}			
		}
		#dump($current_charTime, 'current_charTime AFTER', array());

		$reference_text = $text;
		#$reference_text = strip_tags($reference_text);
		#$reference_text = utf8_decode($text);
				
		do{
			# Primera linea
			

			$current_line = mb_substr( $text, $refPos, $this->maxCharLine);
				#dump($reference_text, ' reference_text ');
				#dump($current_line, ' current_line $refPos: '.$refPos);
				#dump(self::my_strlen($current_line), ' my_strlen($current_line)');
				#dump($this->maxCharLine, ' this->maxCharLine');

			# search a blank space from end to begin . If n char of line < maxCharLine, this is the last line.			
			if(self::my_strlen($current_line) < $this->maxCharLine)
			{
				$lastLine 	= true;
				$spacePos 	= self::my_strlen($current_line);
					#dump($lastLine, ' LASTLINE .........................................................');		
			}else{
				#dump(strrpos($current_line, '. '), 'strrpos($current_line, '. ')');
				/*
				if ( strrpos($current_line, '. ') >0 ) {
					$spacePos = strrpos($current_line, '. ')+1;
					#$spacePos 	= self::my_strlen($current_line) - $last_appear;
				}else{
					$spacePos = strrpos($current_line, ' '); # Localiza el último espacio
					#$spacePos 	 = self::my_strlen($current_line) - $last_appear;
				}
				*/
				$spacePos = mb_strrpos($current_line, ' '); # Localiza el último espacio
					#$spacePos 	 = self::my_strlen($current_line) - $last_appear;			
			}

			# save fragment text line
			$current_line_cut		= ''.trim( mb_substr($text, $refPos,  $spacePos) );
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
				$current_line_cut = self::revise_tag_in_line($current_line_cut,'b');
				$current_line_cut = self::revise_tag_in_line($current_line_cut,'i');
			#}
			

			$ar_lines[$i]['text']	= trim($current_line_cut);
			$current_tcin_secs		= $offsetSecs - ($this->tcin/1000);	// Eliminada esta parte (verificar su influencia): + ($this->dif_ms_in/1000);
				/*
				dump($current_tcin_secs,'current_tcin_secs',array(
					'offsetSecs'=>$offsetSecs,
					'this->tcin'=>$this->tcin/1000,
					'dif_ms_in'=>$this->dif_ms_in/1000,
					'spacePos'=>$spacePos,
					'current_charTime'=>$current_charTime,
					'tcin'=>$tcin,
					'tcout'=>$tcout,				
					));
				*/
			$ar_lines[$i]['tcin']	= OptimizeTC::seg2tc_ms($current_tcin_secs);
				#dump($this->dif_ms_in, " $offsetSecs - this->tcin: ".$this->tcin/1000 ." +++");
				#$tc_ms = OptimizeTC::ms2tc($ar_lines[$i]['tcin']);
					#dump($tc_ms,'$tc_ms '.$ar_lines[$i]['tcin']);
				#dump($ar_lines[$i], 'ar_lines[$i]', array('dif_ms_in'=>$this->dif_ms_in));

			$duracion_linea = $spacePos * $current_charTime;
			$offsetSecs += $duracion_linea ;	
				#dump($duracion_linea,"duracion_linea offsetSecs: $offsetSecs -  spacePos: $spacePos - current_charTime: $current_charTime");
			
			
			# add refPos for next iteration
			$refPos += $spacePos;
			
			$i++;				
			
		}while ($lastLine === false);
		
		#die();
		#dump($ar_lines, 'ar_lines', array());	
		return $ar_lines ;
	}


	# calculate_total_ms
	private function calculate_total_ms($tcin, $tcout) {
		return intval( $tcout - $tcin );
	}

	/**
	* calculate_global_charTime
	* @param string $sourceText (removed non TC tags)
	* @param int $total_ms
	* @return float $global_charTime (in seconds)
	*/
	private function calculate_global_charTime( $sourceText, $total_ms ) {
		$global_charTime=0;

		# count number of char
		$n_char 	= self::my_strlen( $sourceText );
		
		# charTime in secs
		if($total_ms>0 && $n_char>0) {
			$global_charTime = $total_ms / $n_char ;	#echo " charTime: $this->charTime <br>"; 

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
	}



	/**
	* cleanTextForSubtitles
	* Limpia el fragmento del texto
	* @param string $string (Transcription)
	* @return string $string (removed marks and extras)
	* @see class.TR.php deleteMarks
	*/
	function cleanTextForSubtitles($string) {		

		# CONVERT ENCODING (Traducciones mal formadas provinientes de Babel)
		html_entity_decode($string);

		$string	= strip_tags($string, '<br><strong><em>');	
		#$string	= strip_tags($string, '<br>');					# remove html tags (em and strong tags)	

		$string = str_replace('<br />', " ", $string);				# convert br to ' '	
		$string = str_replace('<strong>', '<b>', $string);
		$string = str_replace('</strong>', '</b>', $string);
		$string = str_replace('<em>', '<i>', $string);	
		$string = str_replace('</em>', '</i>', $string);							
		$string = TR::deleteMarks($string, $deleteTC=false, $deleteIndex=true, $deleteSvg=true, $deleteGeo=true);	# delete some marks
		
		return $string;
	}


	# str leng in chars (multibyte if support)
	static function my_strlen($string) {
		if(function_exists('mb_strlen')) {
			return mb_strlen($string);
		}else{
			die("No multibyte support found !!!");
			return strlen($string);
		}			
	}
	
	# trim firs and last return \n 
	static function my_trim($string) { 
		$firstChar = substr($string,0,1);
		if($firstChar=="\r"|| $firstChar=="\n")	$string = substr($string,1);
		
		$lastChar = substr($string,-1);
		if($lastChar=="\r" || $lastChar=="\n")	$string = substr($string,0,-1);
		
		return trim($string) ;
	}

	/**
	* REVISE_TAG_IN_LINE
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

	}#end revise_tag_in_line





}
?>
