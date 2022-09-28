<?php
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
	* @return regex
	*/
	public static function get_tc_value_pattern() : string {

		return TR::get_mark_pattern('tc_value', true, false, false, false);
	}//end get_tc_value_pattern



	/**
	* OPTIMIZE_TCIN
	* Adjustment of virtual time-codes calculated by averaging
	* Once the index IN is located, if the previous and subsequent TCs are more than X characters apart, we make an approximation
	* and create a virtual TC with the average of the duration of the characters between the previous and subsequent TCs.
	* @param string $texto
	* @param string $indexIN
	* @param int $inicioPos = 0
	* @param int $in_margin = 100
	*
	* @return string $tcin
	*/
	public static function optimize_tcIN(string $texto, string $indexIN, int $inicioPos=0, int $in_margin=100) : string {

		mb_internal_encoding('UTF-8'); // Set in config

		$debug = false;

		$tc_pattern = TR::get_mark_pattern('tc',false);

		// Si inicioPos > 0 estaremos buscando de forma libre, sin index o ya sabemos la posición
		if($inicioPos===0) {
			$indexPos = 0;
			return '00:00:00.000';
		}else if( !empty($inicioPos) && $inicioPos!=='' ) {
			$indexPos = $inicioPos - $in_margin;
		}else{
			# pos absoluta de index IN
			$indexPos = mb_strpos($texto, $indexIN);
			$indexPos = $indexPos - $in_margin;
		}
		if($indexPos<0) $indexPos = 0;
		#dump($indexPos, ' indexPos ++ indexIN '.to_string($indexIN));
		#dump($indexPos, ' indexPos ++ inicioPos: '.to_string($inicioPos));

		# margen de validación
		$margen = 55 ;

			# Posición del TC anterior
			$frAnterior = mb_substr($texto, 0, $indexPos); # fr desde inicio (0) hasta la pos de indexIN
				#dump($frAnterior, ' frAnterior ++ '.to_string());

			# Find last COMPLETE tc is this fragment
			preg_match_all( $tc_pattern, $frAnterior, $matches, PREG_SET_ORDER );
			#dump(end($matches), 'end($matches) ++ '.to_string());

			if (isset(end($matches)[0])) {
				$last_tc 	= end($matches)[0];		#dump($last_tc, ' $last_tc ++ '.to_string());

				$tcLastPos	= mb_strrpos($frAnterior, $last_tc); # pos abs del último tc en el fragmento anterior al indexIn (por tanto es el TC anterior al indexIN)
				#$prevTC	= substr($frAnterior, $tcLastPos +4, 8); # valor tc (tipo 00:20:14)
				$prevTC		= end($matches)[1];		#dump($prevTC, ' $prevTC ++ '.to_string());
				$dif		= $indexPos - $tcLastPos ;

			}else{
				$prevTC		= '00:00:00.000';
				$dif		= 0;
			}
			#dump( substr($frAnterior, $tcLastPos -10, 188) , ' prevTC ++  **'.to_string());

		if($dif < $margen && $dif > 0) {

			$tcin = $prevTC ;
			$debug .= "tcin anterior ($prevTC) a $dif ch. ";

		}else{

			# Posición del TC posterior
			$frPosterior = mb_substr($texto, $indexPos ); # fr desde indexIn hasta el final

			# Find first COMPLETE tc is this fragment
			preg_match_all( $tc_pattern, $frPosterior, $matches, PREG_SET_ORDER);
			if (isset(reset($matches)[0])) {
				$first_tc		= reset($matches)[0];		#dump($first_tc, ' $first_tc ++ '.to_string());

				$tcFirstPos		= mb_strpos($frPosterior, $first_tc); # pos del primer tc encontrado

				$nextTCposAbs	= $indexPos + $tcFirstPos ;
				#$nextTC		= substr($frPosterior, $tcFirstPos +4, 8); # valor tc (tipo 00:20:14)
				$nextTC			= reset($matches)[1];
				$dif			= $nextTCposAbs - $indexPos ;
			}else{
				$dif=0;
				$nextTC=null;
			}


			if($dif < $margen && $dif > 0) {

				$tcin = $nextTC ;
				$debug .= "tcin posterior ($nextTC) a $dif ch. ";

			}else{

				# cálculo tc virtual
				# calculamos cuantos caracteres hay entre prevTC y nexTC
				$tcPrevPosAbs	= mb_strpos($texto, "[TC_".$prevTC ); # pos absoluta del tc anterior
				$tcNextPosAbs	= mb_strpos($texto, "[TC_".$nextTC ); # pos absoluta del tc siguiente
				$difTCchar		= $tcNextPosAbs - $tcPrevPosAbs ; # caracteres entre el tc anterior y el posterior

				if( (!$tcPrevPosAbs && !$tcNextPosAbs) ){
					$tcin = '' ;
				}else{
					#$frMedio = substr($texto, $tcPrevPosAbs+16, $difTC);
					#$chars = mb_strlen($frMedio);

					# calculamos el n de segundos entre tc anterior y posterior
					$prevTCseg	= self::TC2seg($prevTC);
					$nextTCseg	= self::TC2seg($nextTC);
					$difSeg		= $nextTCseg -$prevTCseg ;

					# calculamos cuantos segundos ocupa un caracter
					#@ $segChar 	= $difSeg / $difTCchar ;
					$segChar 	= $difTCchar>0 ? ($difSeg / $difTCchar) : 0 ;

					# calculamos los caracteres entre en prevTC y el index IN
					$charPrevTCindexIn =  mb_strlen( mb_substr($texto, $tcPrevPosAbs+16, ($indexPos - $tcPrevPosAbs) ) );

					# hacemos la hipótesis del TC que tocaría en indexIN
					$tcInVirtualseg	= ($charPrevTCindexIn * $segChar) +  $prevTCseg ; # en segundos
					$tcInVirtual	= self::seg2tc($tcInVirtualseg);

					$tcin	= $tcInVirtual ;
					$debug	.= "tcin virtual ($prevTC => $tcInVirtual) segChar: $segChar  a $difTCchar ch. ";
				}
			}//end if( $dif < $margen && $dif > 0)
		}//end if($dif < $margen && $dif > 0)


		return $tcin;
	}//end optimize_tcIN



	/**
	* OPTIMIZE_TCOUT
	* @return string $tcout
	*/
	public static function optimize_tcOUT(string $texto, string $indexOUT, int $finalPos=null, int $in_margin=100) : string {

		mb_internal_encoding('UTF-8'); // Set in config

		$debug = false;

		$tc_pattern = TR::get_mark_pattern('tc',false);

		// Si finalPos > 0 estaremos buscando de forma libre, sin index
		if( $finalPos!==false ) {
			$indexPos 	= mb_strpos($texto, $finalPos);
			$indexPos 	= $finalPos + $in_margin;
		}else{
			# pos absoluta de index OUT
			$indexPos 	= mb_strpos($texto, $indexOUT);
			$indexPos 	= $indexPos + $in_margin;
		}

		# margen de validación
		$margen = 55 ;

			# Posición del TC posterior
			$frPosterior 	= mb_substr($texto, $indexPos ); # fr desde indexIn hasta el final
			#$tcFirstPos 	= mb_strpos($frPosterior, "[TC_" ); # pos del primer tc encontrado

			# Find first COMPLETE tc is this fragment
			preg_match_all( $tc_pattern, $frPosterior, $matches, PREG_SET_ORDER);
			#dump(reset($matches), 'reset($matches) ++ '.to_string());
			if (isset(reset($matches)[0])) {
				$first_tc 		= reset($matches)[0];		#dump($first_tc, ' $first_tc ++ '.to_string());

				$tcFirstPos 	= mb_strpos($frPosterior, $first_tc); # pos del primer tc encontrado
				$nextTCposAbs 	= $indexPos + $tcFirstPos ;
				#$nextTC 		= substr($frPosterior, $tcFirstPos +4, 8); # valor tc (tipo 00:20:14)
				$nextTC 		= reset($matches)[1];
				$dif 			= $nextTCposAbs - $indexPos ;
			}else{
				$dif=0;
				$nextTC=null;
			}

		if( $dif < $margen && $dif > 0) {

			$tcout = $nextTC;
			$debug .= "tcout posterior ($nextTC) a $dif ch. ";

		}else{

			# Posición del TC anterior
			$frAnterior = mb_substr($texto, 0, $indexPos); # fr desde inicio (0) hasta la pos de indexIN
			#$tcLastPos 	= strrpos($frAnterior, "[TC_" ); # pos abs del último tc en el fragmento anterior al indexIn (por tanto es el TC anterior al indexIN)

			$prevTC = null;

			# Find last COMPLETE tc is this fragment
			preg_match_all( $tc_pattern, $frAnterior, $matches, PREG_SET_ORDER);		#dump(end($matches), 'end($matches) ++ '.to_string());
			if (isset(end($matches)[0])) {
				$last_tc 	= end($matches)[0];		#dump($last_tc, ' $last_tc ++ '.to_string());

				$tcLastPos 	= mb_strrpos($frAnterior, $last_tc);
				#$prevTC 	= substr($frAnterior, $tcLastPos +4, 8); # valor tc (tipo 00:20:14)
				$prevTC 	= end($matches)[1];
				$dif 		= $indexPos - $tcLastPos;
			}else{
				$dif=0;
			}


			if( $dif  < $margen && $dif > 0) {

				$tcout = $prevTC ;
				$debug .= "tcout anterior ($nextTC) a $dif ch. ";

			}else{

				# cálculo tc virtual
				# calculamos cuantos caracteres hay entre prevTC y nexTC
				$tcPrevPosAbs 	= mb_strpos($texto, "[TC_".$prevTC ); # pos absoluta del tc anterior
				$tcNextPosAbs 	= mb_strpos($texto, "[TC_".$nextTC ); # pos absoluta del tc siguiente
				$difTCchar 		= $tcNextPosAbs - $tcPrevPosAbs ; # caracteres entre el tc anterior y el posterior

				if(!$tcPrevPosAbs && !$tcNextPosAbs){
					$tcout = '' ;
				}else{
					#$frMedio = substr($texto, $tcPrevPosAbs+16, $difTC);
					#$chars = strlen($frMedio);

					# calculamos el n de segundos entre tc anterior y posterior
					$prevTCseg 	= self::TC2seg($prevTC);
					$nextTCseg 	= self::TC2seg($nextTC);
					$difSeg 	= $nextTCseg -$prevTCseg ;

					# calculamos cuantos segundos ocupa un caracter
					$segChar = 0;
					if ($difTCchar>0) {
						$segChar = $difSeg / $difTCchar;
					}

					# calculamos los caracteres entre en prevTC y el index IN
					$charPrevTCindexIn = mb_strlen( mb_substr($texto, $tcPrevPosAbs+16, ($indexPos - $tcPrevPosAbs) ) );

					# hacemos la hipótesis del TC que tocaría en indexIN
					$tcInVirtualseg	 = ($charPrevTCindexIn * $segChar) +  $prevTCseg ; # en segundos
					$tcInVirtual	 = self::seg2tc($tcInVirtualseg);

					$tcout = $tcInVirtual ;
					$debug .= "tcout virtual ($prevTC => $tcInVirtual) segChar: $segChar  a $difTCchar ch. ";
				}
			}//end if( $dif  < $margen && $dif > 0) {

		}//end if( $dif < $margen && $dif > 0)


		return $tcout ;
	}//end optimize_tcOUT
	// ****** FIN AJUSTE TC'S VIRTUALES CALCULADOS HACIENDO LA MEDIA   ******* //



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
	public static function TC2seg(string $tc) : float {

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

		$horas = $floor_seg / 3600 ;
		if($horas<1){
			$horas = 0 ;
		}else{
			$horas 		= floor($horas);
			$floor_seg  = $floor_seg - ($horas * 3600);
		}
		$minutos = ($floor_seg / 60) ;
		if($minutos<1){
			$minutos = 0 ;
		}else{
			$minutos 	= floor($minutos);
			$floor_seg	= $floor_seg - ($minutos * 60);
		}
		$segundos = $floor_seg;
		$mseconds = round((($seg - floor($seg))*1000));
		# format 00
		$horas 		= str_pad($horas, 2, '0', STR_PAD_LEFT);
		$minutos 	= str_pad($minutos, 2, '0', STR_PAD_LEFT);
		$segundos 	= str_pad($segundos, 2, '0', STR_PAD_LEFT);
		$mseconds 	= str_pad($mseconds, 3, '0', STR_PAD_LEFT);

		$tc = $horas .':'. $minutos. ':'. $segundos . '.' . $mseconds;

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
	* @return string $tc_time_code
	*/
	public static function apli_tc_offset(string $tc, int $tc_offset=null) : string {

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
