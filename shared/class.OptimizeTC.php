<?php
// declare(strict_types=1);
/**
* OPTIMIZETC
* It is used for transcripts (component_text_area) but also for public parts.
* This class is generic and should also work for public parts.
* When used outside Dédalo, copy this file.
* In order to take advantage of Dédalo development improvements and bug fixes, keep version control of this class.
*
* (!) This class contains functions that are NOT used in Dédalo but in some public websites
*/
abstract class OptimizeTC {



	# Version. Important!
	#static $version = "1.0.2"; // 28-03-2017
	#static $version = "1.0.3"; // 05-06-2017
	static $version = "1.0.4"; // 10-04-2018 // Added multi byte support for all string operations



	/**
	* GET_TC_VALUE_PATTERN
	* Not use complete tag like '[TC_00:00:00.000_TC]'. Only tc value like '00:00:00.000'
	* @return string
	* 	regex such as /([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2})(\.([0-9]{1,3}))?/
	*/
	public static function get_tc_value_pattern() : string {

		return TR::get_mark_pattern('tc_value', true, false, false, false);
	}//end get_tc_value_pattern



	/**
	* OPTIMIZE_TC_IN
	* Calculates the time code for the indexation tag given in the received raw text
	* Adjustment of virtual time-codes calculated by averaging
	* Once the index IN is located, if the previous and subsequent TCs are more than X additional characters, we make an approximation
	* and create a virtual TC with the average of the duration of the characters between the previous and subsequent TCs.
	* @param string $text
	* @param string|null $indexIN
	* 	tag like: '[index-n-10-label in 10-data::data]'
	* @param int|null $start_position = null
	* @param int $in_margin = 100
	*
	* @return string $tcin
	* 	Time-code string as '00:00:00.000'
	*/
	public static function optimize_tc_in(string $text, ?string $indexIN, ?int $start_position=null, int $in_margin=100) : string {

		// intentional zero in position case. Do not calculate nothing, only return the corresponding time code
			if($start_position===0) {
				$indexPos = 0;
				return '00:00:00.000';
			}

		// set internal encoding for safe multi byte position locations
		mb_internal_encoding('UTF-8'); // Set in config

		// If inicioPos > 0 we will be searching freely, without index or we already know the position
		if( !empty($start_position) && $start_position!=='' ) {

			$indexPos = $start_position - $in_margin;

		}else{

			// absolute position of indexIN
			$indexPos = mb_strpos($text, $indexIN);
			$indexPos = $indexPos - $in_margin;
		}
		// prevent negative values
		if($indexPos<0) $indexPos = 0;

		// validation margin chars default
		$margen = 55;

			// Previous TC position. fragment from start(0) to indexIN position
			$frAnterior = mb_substr($text, 0, $indexPos);

			// time code unified pattern
			$tc_pattern = TR::get_mark_pattern('tc', false);

			// Find last COMPLETE TC in this fragment
			preg_match_all( $tc_pattern, $frAnterior, $matches, PREG_SET_ORDER);

			if (isset(end($matches)[0])) {
				$last_tc	= end($matches)[0];
				$tcLastPos	= mb_strrpos($frAnterior, $last_tc); // absolute position of the last tc in the fragment before indexIn (so it is the TC before indexIN)
				$prevTC		= end($matches)[1];
				$dif		= $indexPos - $tcLastPos;
			}else{
				$prevTC		= '00:00:00.000';
				$dif		= 0;
			}

		if($dif < $margen && $dif > 0) {

			$tcin = $prevTC;

		}else{

			// Posterior TC position. fragment from indexIn to the end
			$frPosterior = mb_substr($text, $indexPos);

			// Find first COMPLETE TC in this fragment
			preg_match_all($tc_pattern, $frPosterior, $matches, PREG_SET_ORDER);
			if (isset(reset($matches)[0])) {
				$first_tc		= reset($matches)[0];
				$tcFirstPos		= mb_strpos($frPosterior, $first_tc); // position of the first TC found
				$nextTCposAbs	= $indexPos + $tcFirstPos;
				$nextTC			= reset($matches)[1];
				$dif			= $nextTCposAbs - $indexPos;
			}else{
				$dif			= 0;
				$nextTC			= null;
			}

			if($dif < $margen && $dif > 0) {

				$tcin = $nextTC;

			}else{

				// virtual TC calculation. We calculate how many characters there are between prevTC and nextTC
				$tcPrevPosAbs	= mb_strpos($text, "[TC_".$prevTC); // absolute position of the previous TC
				$tcNextPosAbs	= mb_strpos($text, "[TC_".$nextTC); // absolute position of the following TC
				$difTCchar		= $tcNextPosAbs - $tcPrevPosAbs ; // characters between the preceding and following TC

				if(!$tcPrevPosAbs && !$tcNextPosAbs){

					$tcin = '';

				}else{

					// we calculate the n of seconds between previous and subsequent TC
					$prevTCseg	= self::TC2seg($prevTC);
					$nextTCseg	= self::TC2seg($nextTC);
					$difSeg		= $nextTCseg -$prevTCseg;

					// We calculate how many seconds a character occupies
					$segChar	= $difTCchar>0 ? ($difSeg / $difTCchar) : 0;

					// we calculate the characters between the prevTC and the indexIN
					$charPrevTCindexIn = mb_strlen( mb_substr($text, $tcPrevPosAbs+16, ($indexPos - $tcPrevPosAbs) ));

					// we make the hypothesis of the TC that would correspond in indexIN
					$tcInVirtualseg	= ($charPrevTCindexIn * $segChar) + $prevTCseg;
					$tcInVirtual	= self::seg2tc($tcInVirtualseg);

					$tcin = $tcInVirtual;
				}
			}
		}//end if($dif < $margen && $dif > 0)


		return $tcin;
	}//end optimize_tc_in



	/**
	* OPTIMIZE_TC_OUT
	* Calculates the time code for the indexation tag given in the received raw text
	* @param string $text
	* @param string|null $indexOUT
	* 	tag like: '[/index-n-10-label in 10-data::data]'
	* @param int|null $end_position = null
	* @param int $in_margin = 100
	*
	* @return string $tcout
	* 	Time-code string as '00:00:00.000'
	*/
	public static function optimize_tc_out(string $text, ?string $indexOUT, ?int $end_position=null, int $in_margin=100) : string {

		// set internal encoding for safe multi byte position locations
		mb_internal_encoding('UTF-8'); // Set in config

		if (is_null($end_position)) {
			// absolute position of index OUT (default case)
			$indexPos 	= mb_strpos($text, $indexOUT);
			$indexPos 	= $indexPos + $in_margin;
		}else{
			// If finalPos if given, we are in search free case, do not use indexOUT here
			// $indexPos 	= mb_strpos($text, $end_position);
			$indexPos 	= $end_position;
			$indexPos 	= $end_position + $in_margin;
		}

		// validation margin default
			$margen = 55 ;

			// Posterior TC position
			$frPosterior	= mb_substr($text, $indexPos); # fr desde indexIn hasta el final
			// $tcFirstPos	= mb_strpos($frPosterior, "[TC_" ); # pos del primer tc encontrado

			// time code unified pattern
			$tc_pattern = TR::get_mark_pattern('tc', false);

			// Find first COMPLETE TC is this fragment
			preg_match_all($tc_pattern, $frPosterior, $matches, PREG_SET_ORDER);
			if (isset(reset($matches)[0])) {
				$first_tc		= reset($matches)[0];
				$tcFirstPos		= mb_strpos($frPosterior, $first_tc); // position of the first TC found
				$nextTCposAbs	= $indexPos + $tcFirstPos;
				$nextTC			= reset($matches)[1];
				$dif			= $nextTCposAbs - $indexPos ;
			}else{
				$dif			= 0;
				$nextTC			= null;
			}

		if($dif < $margen && $dif > 0) {

			$tcout = $nextTC;

		}else{

			// Previous TC position. fragment from start(0) to indexIN position
			$frAnterior = mb_substr($text, 0, $indexPos);

			$prevTC = null;

			// Find last COMPLETE TC is this fragment
			preg_match_all($tc_pattern, $frAnterior, $matches, PREG_SET_ORDER);
			if (isset(end($matches)[0])) {
				$last_tc	= end($matches)[0];
				$tcLastPos	= mb_strrpos($frAnterior, $last_tc);
				$prevTC		= end($matches)[1];
				$dif		= $indexPos - $tcLastPos;
			}else{
				$dif		= 0;
			}

			if($dif < $margen && $dif > 0) {

				$tcout = $prevTC;

			}else{

				// virtual TC calculation. We calculate how many characters there are between prevTC and nextTC
				$tcPrevPosAbs	= mb_strpos($text, '[TC_'.$prevTC); // absolute position of previous TC
				$tcNextPosAbs	= mb_strpos($text, '[TC_'.$nextTC); // absolute position of the next TC
				$difTCchar		= $tcNextPosAbs - $tcPrevPosAbs; // characters between the preceding and following TC

				if(!$tcPrevPosAbs && !$tcNextPosAbs){

					$tcout = '';

				}else{

					// we calculate the n of seconds between previous and subsequent tc
					$prevTCseg	= self::TC2seg($prevTC);
					$nextTCseg	= self::TC2seg($nextTC);
					$difSeg		= $nextTCseg -$prevTCseg ;

					// We calculate how many seconds a character occupies
					$segChar = 0;
					if ($difTCchar>0) {
						$segChar = $difSeg / $difTCchar;
					}

					// we calculate the characters between the prevTC and the index IN
					$charPrevTCindexIn = mb_strlen( mb_substr($text, $tcPrevPosAbs+16, ($indexPos - $tcPrevPosAbs) ));

					// we make the hypothesis of the TC that would correspond in indexIN
					$tcInVirtualseg	= ($charPrevTCindexIn * $segChar) + $prevTCseg;
					$tcInVirtual	= self::seg2tc($tcInVirtualseg);

					$tcout = $tcInVirtual;
				}
			}
		}//end if($dif < $margen && $dif > 0)


		return $tcout ;
	}//end optimize_tc_out
	// ****** END ADJUSTMENT VIRTUAL TC'S CALCULATED BY MAKING THE AVERAGE ******* //



	/**
	* TC Margen
	* Agrega un margen al tc recibido
	* (hacia atrás si es tcin, hacia delante si es tcout)
	* @return string $tc
	*/
	public static function tcMargen(string $tc, string $tipo, int $margen=2) : string {

		$tc_beats	= array();
		$tc_beats	= explode(':', $tc);
		$segundos	= $tc_beats[2];
		$minutos	= $tc_beats[1];
		$horas		= $tc_beats[0];

		if($tipo==='tcin'){
			if($segundos >= $margen){
				$segundos = $segundos  - $margen ;
			}else{
				$minutos	= $minutos -1;
				$segundos	= 59;
			}
		}
		if($tipo==='tcout'){
			if($segundos <= 55){
				$segundos 	= $segundos + $margen;
			}else{
				$minutos ++;
				$segundos = 0;
			}
		}
		/*
		if($horas<10 && $horas>0) $horas = "0".$horas  ;
		if($minutos<10 && $minutos>0) $minutos = "0".$minutos ;
		if($segundos<10 && $segundos>0) $segundos = "0".$segundos  ;
		*/
		$horas		= str_pad($horas, 2, '0', STR_PAD_LEFT);
		$minutos	= str_pad($minutos, 2, '0', STR_PAD_LEFT);
		$segundos	= str_pad($segundos, 2, '0', STR_PAD_LEFT);

		// $tc = "$horas:$minutos:$segundos";
		$tc = implode(':', [$horas, $minutos, $segundos]);

		return $tc;
	}//end tcMargen



	/**
	* TC_MARGIN_SECONDS
	* Add or subtract seconds from time in seconds
	* @return int seconds
	*/
	public static function tc_margin_seconds(string $type, int $seconds, int $margin) : int {

		if ($type==='in') {
			$seconds = (int)$seconds - (int)$margin;
			if ($seconds<0) {
				$seconds = 0;
			}
		}elseif($type==='out') {
			$seconds = (int)$seconds + (int)$margin;
		}

		return (int)$seconds;
	}//end tc_margin_seconds



	/**
	* VALORTC
	* Calcula el valor absoluto (entero) del tc. Si es 0 es porque NO existe TC
	*/
		// public static function valorTC__DEPRECATED($tc)	{

		// 	$tc = str_replace( array('[TC_','_TC]'), '', $tc);

		// 	$valor = 0;

		// 	$tcTrozos	= explode(':', $tc);

		// 	if(is_array($tcTrozos)) {

		// 		$segundos	= 0;	if(isset($tcTrozos[2])) $segundos	= $tcTrozos[2];
		// 		$minutos	= 0;	if(isset($tcTrozos[1])) $minutos	= $tcTrozos[1];
		// 		$horas		= 0;	if(isset($tcTrozos[0])) $horas		= $tcTrozos[0];

		// 		$valor		= $horas + $minutos + $segundos ;
		// 	}

		// 	return intval($valor) ;

		// }//end valorTC



	/**
	* TC2SEG
	* Converts TC value to seconds like: 00:05:22.363 -> 322.363
	* Accepts format 00:01:20.022 and [TC_00:01:20.320_TC]
	* @param string $tc
	* @return float $total_secs
	*	Like '0.1'
	*/
	public static function TC2seg(?string $tc) : float {

		$total_secs = 0;

		if (empty($tc)) {
			return (float)$total_secs;
		}

		# Remove possible full tags unnecessary chars received
		if (strpos('TC',$tc)!==false) {
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__." Please, use only tc values, NOT tags like ".to_string($tc), logger::ERROR);
			}
			$tc = str_replace( array('[TC_','_TC]'), '', $tc);
		}

		$tc_value_pattern = OptimizeTC::get_tc_value_pattern();
		preg_match($tc_value_pattern, $tc, $matches);
			#dump($matches, ' matches ++ '.to_string());

		$key_hours		= 1;
		$key_minutes	= 2;
		$key_seconds	= 3;
		$key_ms			= 5;

		$hours		= isset($matches[$key_hours]) ? $matches[$key_hours] : 0;
		$minutes	= isset($matches[$key_minutes]) ? $matches[$key_minutes] : 0;
		$seconds	= isset($matches[$key_seconds]) ? $matches[$key_seconds] : 0;
		$mseconds	= isset($matches[$key_ms]) ? $matches[$key_ms] : 0;

		$total_secs = floatval(($hours * 3600) + ($minutes * 60) + $seconds .'.'. $mseconds);

		return (float)$total_secs;
	}//end TC2seg



	/**
	* SEG2TC
	* Convert the value in seconds to format TC. As 322.342 -> 00:05:22.342
	* @param mixed (float|string) $seg
	* @return string $tc
	*/
	public static function seg2tc($seg) : string {

		if (is_string($seg) && strpos($seg, ':')!==false) {
			trigger_error("Bad format '$seg' . Expected seconds");
			return false;
		}

		$floor_seg = floor($seg);

		$hours = $floor_seg / 3600 ;
		if($hours<1){
			$hours = 0 ;
		}else{
			$hours 		= floor($hours);
			$floor_seg  = $floor_seg - ($hours * 3600);
		}
		$minutes = ($floor_seg / 60) ;
		if($minutes<1){
			$minutes = 0 ;
		}else{
			$minutes 	= floor($minutes);
			$floor_seg	= $floor_seg - ($minutes * 60);
		}
		$seconds = $floor_seg;
		$mseconds = round((($seg - floor($seg))*1000));
		# format 00
		$hours 		= str_pad( (string)$hours, 2, '0', STR_PAD_LEFT);
		$minutes 	= str_pad( (string)$minutes, 2, '0', STR_PAD_LEFT);
		$seconds 	= str_pad( (string)$seconds, 2, '0', STR_PAD_LEFT);
		$mseconds 	= str_pad( (string)$mseconds, 3, '0', STR_PAD_LEFT);

		$tc = $hours .':'. $minutes. ':'. $seconds . '.' . $mseconds;

		return $tc;
	}//end seg2tc



	/**
	* SEG2TC_MS
	*/
		// public static function seg2tc_ms($seg_float) {

		// 	$ar = explode('.', $seg_float);

		// 	$tc=0;
		// 	$tc2=0;

		// 		dump($ar, ' ar'.to_string());

		// 	if(isset($ar[0])) {
		// 		$tc = self::seg2tc($ar[0]);
		// 	}
		// 	if(isset($ar[1])) {
		// 		$tc2 = substr($ar[1],0,3);
		// 		$tc2 = str_pad($tc2, 3, '0', STR_PAD_RIGHT);
		// 	}

		// 	return $tc . '.' . $tc2 ;
		// }//end seg2tc_ms



	/**
	* MS_FORMAT
	* @param float|string $time
	* @return string $tc
	*/
	public static function ms_format($time) : string {

		if(isset($time)) {
			$tc = self::seg2tc($time);
		}

		return $tc; //. '.000' ;
	}//end ms_format



	/**
	* APLI_TC_OFFSET
	* Returns a tc with the tc_offset (seconds) applied (added, or subtracted if negative)
	* @param string $tc
	* @param int|null $tc_offset = null
	* @return string $tc_time_code
	*/
	public static function apli_tc_offset( string $tc, ?int $tc_offset=null ) : string {

		if(empty($tc_offset)) {
			return $tc;
		}

		$tc_sec = self::TC2seg($tc);
		$tc_sec = intval($tc_sec + $tc_offset);

		if($tc_sec<0) $tc_sec = 0;

		$tc_time_code = self::seg2tc($tc_sec);

		return $tc_time_code;
	}//end apli_tc_offset



	/**
	* MINUTOS_TO_HORAS
	* @param int $minutes
	* @param bool $formatted = true
	* @return string|int $total_horas
	*/
	public static function minutos_to_horas(int $minutes, bool $formatted=true) {

		# calculate hours / minutes
		$h		= ($minutes/60);
		$ar_h	= explode(',',strval($h));

		$hours		= intval($ar_h[0]);
		$minutes	= $minutes - $hours*60;

		if($formatted) {

			# Formatted string
			$total_horas = number_format($hours,0,',','.') . " h : $minutes m";

		}else{

			# Round int
			$total_horas = $hours;
			if($minutes>30)
				$total_horas++;
		}

		return $total_horas;
	}//end minutos_to_horas



}//end class OptimizeTC
