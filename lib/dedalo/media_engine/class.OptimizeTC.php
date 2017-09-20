<?php
/**
* OPTIMIZETC
* Da servicio a las transcripciones (component_text_area) pero también a las partes públicas.
* Esta clase es genérica y debe servir también para las partes públicas.
* Cuando se use fuera de Dédalo, copiar este fichero.
* Para poder aprovechar las mejoras y corrección de errores del desarrollo de Dédalo, llevar control de versión de esta clase.
*
* Esta clase contiene funciones que NO se usan en Dédalo pero si en algunas partes públicas. Ir revisando en las partes públicas 
* que funcionan correctamente.
*/
abstract class OptimizeTC {



	# Version. Important!
	#static $version = "1.0.2"; // 28-03-2017
	static $version = "1.0.3"; // 05-06-2017

	

	/**
	* GET_TC_VALUE_PATTERN
	* Not use complete tag like '[TC_00:00:00.000_TC]'. Only tc value like '00:00:00.000'
	* @return regex
	*/
	public static function get_tc_value_pattern() {
		return TR::get_mark_pattern('tc_value', true, false, false, false);
	}//end get_tc_value_pattern
	


	/**
	* OPTIMIZE_TCIN
	* ******  AJUSTE TC'S VIRTUALES CALCULADOS HACIENDO LA MEDIA   ******* //
	* Localizado el index IN, si el TC anterior y posterior están a mas de X caracteres, hacemos una 
	* aproximaximación y creamos un TC virtual con la media de las duraciones de los caracteres entre 
	* los TC anterior y posterior
	*/
	public static function optimize_tcIN($texto, $indexIN, $inicioPos='', $in_margin=100) {	
		
		$debug = false;

		$tc_pattern = TR::get_mark_pattern('tc',false);
		
		// Si inicioPos > 0 estaremos buscando de forma libre, sin index o ya sabemos la posición
		if($inicioPos===0) {
			$indexPos = 0;
			return '00:00:00.000';
		}else if( !empty($inicioPos) && $inicioPos!='' ) {
			#$in_margin 	= 100 ;
			$indexPos 	= $inicioPos - $in_margin;
			if($indexPos<0) $indexPos = 0;
				#dump($indexPos, ' indexPos ++ '.to_string());
		}else{
			# pos absoluta de index IN
			$indexPos = strpos($texto, $indexIN); 			
		}
		#dump($indexPos, ' indexPos ++ indexIN'.to_string($indexIN));
		#dump($indexPos, ' texto ++ '.to_string($inicioPos));	
		
		# margen de validación
		$margen = 55 ;
		
			# Posición del TC anterior		
			$frAnterior = substr($texto, 0, $indexPos); # fr desde inicio (0) hasta la pos de indexIN

			# Find last COMPLETE tc is this fragment
			preg_match_all( $tc_pattern, $frAnterior, $matches, PREG_SET_ORDER);		#dump(end($matches), 'end($matches) ++ '.to_string());
			if (isset(end($matches)[0])) {
				$last_tc 	= end($matches)[0];		#dump($last_tc, ' $last_tc ++ '.to_string());

				$tcLastPos 	= strrpos($frAnterior, $last_tc); # pos abs del último tc en el fragmento anterior al indexIn (por tanto es el TC anterior al indexIN) 		
				#$prevTC 	= substr($frAnterior, $tcLastPos +4, 8); # valor tc (tipo 00:20:14)
				$prevTC 	= end($matches)[1];		#dump($prevTC, ' $prevTC ++ '.to_string());
				$dif 		= $indexPos - $tcLastPos ;

			}else{
				$prevTC 	= '00:00:00.000';
				$dif=0;
			}			
			#dump( substr($frAnterior, $tcLastPos -10, 188) , ' prevTC ++  **'.to_string());

		if($dif < $margen && $dif > 0) {
			
			$tcin = $prevTC ;
			$debug .= "tcin anterior ($prevTC) a $dif ch. ";
		
		}else{
					
			# Posición del TC posterior
			$frPosterior 	= substr($texto, $indexPos ); # fr desde indexIn hasta el final

			# Find first COMPLETE tc is this fragment
			preg_match_all( $tc_pattern, $frPosterior, $matches, PREG_SET_ORDER);
			if (isset(reset($matches)[0])) {
				$first_tc 		= reset($matches)[0];		#dump($first_tc, ' $first_tc ++ '.to_string());

				$tcFirstPos 	= strpos($frPosterior, $first_tc); # pos del primer tc encontrado

				$nextTCposAbs	= $indexPos + $tcFirstPos ;
				#$nextTC 		= substr($frPosterior, $tcFirstPos +4, 8); # valor tc (tipo 00:20:14)
				$nextTC 		= reset($matches)[1];
				$dif 			= $nextTCposAbs - $indexPos ;
			}else{
				$dif=0;
				$nextTC=null;
			}

			
			if( $dif < $margen && $dif > 0) {
				
				$tcin = $nextTC ;
				$debug .= "tcin posterior ($nextTC) a $dif ch. ";
				
			} else {
									
				# cálculo tc virtual
				# calculamos cuantos caracteres hay entre prevTC y nexTC
				$tcPrevPosAbs 	= strpos($texto, "[TC_".$prevTC ); # pos absoluta del tc anterior
				$tcNextPosAbs 	= strpos($texto, "[TC_".$nextTC ); # pos absoluta del tc siguiente
				$difTCchar 		= $tcNextPosAbs - $tcPrevPosAbs ; # caracteres entre el tc anterior y el posterior 
				
				if( (!$tcPrevPosAbs && !$tcNextPosAbs) ){
					$tcin = '' ;
				}else{	
					#$frMedio = substr($texto, $tcPrevPosAbs+16, $difTC); 
					#$chars = strlen($frMedio);
					
					# calculamos el n de segundos entre tc anterior y posterior
					$prevTCseg 	= self::TC2seg($prevTC);
					$nextTCseg 	= self::TC2seg($nextTC);
					$difSeg 	= $nextTCseg -$prevTCseg ;
					
					# calculamos cuantos segundos ocupa un caracter
					#@ $segChar 	= $difSeg / $difTCchar ;
					$segChar 	= $difTCchar>0 ? ($difSeg / $difTCchar) : 0 ;
					
					# calculamos los caracteres entre en prevTC y el index IN
					$charPrevTCindexIn =  strlen( substr($texto, $tcPrevPosAbs+16, ($indexPos - $tcPrevPosAbs) ) ); 
					
					# hacemos la hipótesis del TC que tocaría en indexIN
					$tcInVirtualseg = ($charPrevTCindexIn * $segChar) +  $prevTCseg ; # en segundos
					$tcInVirtual 	= self::seg2tc($tcInVirtualseg);	
					
					$tcin = $tcInVirtual ;
					$debug .= "tcin virtual ($prevTC => $tcInVirtual) segChar: $segChar  a $difTCchar ch. ";
				}
			}#if( $dif < $margen && $dif > 0)
			
		}#/if($dif < $margen && $dif > 0)
		#dump($tcin, ' tcin ++ '.to_string());
		#echo $debug ;

		return $tcin;
	}//end optimize_tcIN



	/**
	* OPTIMIZE_TCOUT
	*/
	public static function optimize_tcOUT($texto, $indexOUT, $finalPos='', $in_margin=100) {
		
		$debug = false;

		$tc_pattern = TR::get_mark_pattern('tc',false);
		
		/* Si finalPos > 0 estaremos buscando de forma libre, sin index */
		if( $finalPos!='' ) {
			$indexPos 	= strpos($texto, $finalPos);
			#$in_margin 	= 100 ;
			$indexPos 	= $finalPos + $in_margin ;
		}else{
			# pos absoluta de index OUT
			$indexPos 	= strpos($texto, $indexOUT); 
		}
		
		# margen de validación
		$margen = 55 ;
		
			# Posición del TC posterior
			$frPosterior 	= substr($texto, $indexPos ); # fr desde indexIn hasta el final
			#$tcFirstPos 	= strpos($frPosterior, "[TC_" ); # pos del primer tc encontrado

			# Find first COMPLETE tc is this fragment
			preg_match_all( $tc_pattern, $frPosterior, $matches, PREG_SET_ORDER);
			if (isset(reset($matches)[0])) {
				$first_tc 		= reset($matches)[0];		#dump($first_tc, ' $first_tc ++ '.to_string());

				$tcFirstPos 	= strpos($frPosterior, $first_tc); # pos del primer tc encontrado
				$nextTCposAbs 	= $indexPos + $tcFirstPos ;
				#$nextTC 		= substr($frPosterior, $tcFirstPos +4, 8); # valor tc (tipo 00:20:14)
				$nextTC 		= reset($matches)[1];
				$dif 			= $nextTCposAbs - $indexPos ;
			}else{
				$dif=0;
				$nextTC=null;
			}		
			
		if( $dif < $margen && $dif > 0) {

			$tcout = $nextTC ;
			$debug .= "tcout posterior ($nextTC) a $dif ch. ";

		}else{
				
			# Posición del TC anterior		
			$frAnterior = substr($texto, 0, $indexPos); # fr desde inicio (0) hasta la pos de indexIN
			#$tcLastPos 	= strrpos($frAnterior, "[TC_" ); # pos abs del último tc en el fragmento anterior al indexIn (por tanto es el TC anterior al indexIN) 

			$prevTC = null;
			
			# Find last COMPLETE tc is this fragment
			preg_match_all( $tc_pattern, $frAnterior, $matches, PREG_SET_ORDER);		#dump(end($matches), 'end($matches) ++ '.to_string());
			if (isset(end($matches)[0])) {
				$last_tc 	= end($matches)[0];		#dump($last_tc, ' $last_tc ++ '.to_string());

				$tcLastPos 	= strrpos($frAnterior, $last_tc);
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
				$tcPrevPosAbs 	= strpos($texto, "[TC_".$prevTC ); # pos absoluta del tc anterior
				$tcNextPosAbs 	= strpos($texto, "[TC_".$nextTC ); # pos absoluta del tc siguiente
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
					$charPrevTCindexIn =  strlen( substr($texto, $tcPrevPosAbs+16, ($indexPos - $tcPrevPosAbs) ) ); 
					
					# hacemos la hipótesis del TC que tocaría en indexIN
					$tcInVirtualseg	 = ($charPrevTCindexIn * $segChar) +  $prevTCseg ; # en segundos
					$tcInVirtual	 = self::seg2tc($tcInVirtualseg);
					
					$tcout = $tcInVirtual ;
					$debug .= "tcout virtual ($prevTC => $tcInVirtual) segChar: $segChar  a $difTCchar ch. ";
				}
			}//end if( $dif  < $margen && $dif > 0) {

		}
		#echo "<hr>$debug" ;
		return $tcout ;
	}//end optimize_tcOUT
	// ****** FIN AJUSTE TC'S VIRTUALES CALCULADOS HACIENDO LA MEDIA   ******* //


	
	/*
	* TC Margen
	* Agrega un margen al tc recibido
	* (hacia atrás si es tcin, hacia delante si es tcout)
	*/
	public static function tcMargen($tc, $tipo, $margen=2) {
		
		$tcTrozos 	= array();
		$tcTrozos 	= explode(':', $tc);
		$segundos 	= $tcTrozos[2];
		$minutos 	= $tcTrozos[1];
		$horas 		= $tcTrozos[0];
		if($tipo==='tcin'){
			if($segundos >= $margen){
			  $segundos = $segundos  - $margen ;
			}else{
			  $minutos	= $minutos -1 ;
			  $segundos	= 59 ;
			}
		}
		if($tipo==='tcout'){
		  if($segundos <= 55){
			$segundos 	= $segundos + $margen ;
		  }else{
			$minutos ++ ;
			$segundos = 0;
		  }
		}
		/*
		if($horas<10 && $horas>0) $horas = "0".$horas  ;
		if($minutos<10 && $minutos>0) $minutos = "0".$minutos ;
		if($segundos<10 && $segundos>0) $segundos = "0".$segundos  ;
		*/
		$horas = str_pad($horas, 2, '0', STR_PAD_LEFT);
		$minutos = str_pad($minutos, 2, '0', STR_PAD_LEFT);
		$segundos = str_pad($segundos, 2, '0', STR_PAD_LEFT);

		return $tc = "$horas:$minutos:$segundos";
	}



	/**
	* TC_MARGIN_SECONDS
	* Add or substract seconds from time in seconds
	* @return int seconds
	*/
	public static function tc_margin_seconds($type, $seconds, $margin) {
		
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
	public static function valorTC__DEPRECATED($tc)	{
		/*
		$tc = str_replace( array('[TC_','_TC]'), '', $tc);		
		
		$valor = 0;
			
		$tcTrozos	= explode(':', $tc);
		
		if(is_array($tcTrozos)) {
			
			$segundos	= 0;	if(isset($tcTrozos[2])) $segundos	= $tcTrozos[2];
			$minutos	= 0;	if(isset($tcTrozos[1])) $minutos	= $tcTrozos[1];
			$horas		= 0;	if(isset($tcTrozos[0])) $horas		= $tcTrozos[0];
			
			$valor		= $horas + $minutos + $segundos ;
		}
		
		return intval($valor) ;
		*/
	}//end valorTC


	
	/**
	* TC2SEG
	* Converts TC value to seconds like: 00:05:22.363 -> 322.363
	* Accepts format 00:01:20.022 and [TC_00:01:20.320_TC]
	* @param string $tc
	* @return float $total_secs
	*	Like '0.1'
	*/
	public static function TC2seg($tc) {

		$total_secs = 0;

		if (empty($tc)) {
			return $total_secs;
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

		$key_hours 	 = 1;
		$key_minutes = 2;
		$key_seconds = 3;
		$key_ms 	 = 5;

		$hours 	 	= isset($matches[$key_hours]) ? $matches[$key_hours] : 0;
		$minutes 	= isset($matches[$key_minutes]) ? $matches[$key_minutes] : 0;
		$seconds 	= isset($matches[$key_seconds]) ? $matches[$key_seconds] : 0;
		$mseconds 	= isset($matches[$key_ms]) ? $matches[$key_ms] : 0;

		$total_secs = floatval(($hours * 3600) + ($minutes * 60) + $seconds .'.'. $mseconds);
		
		return (float)$total_secs;
	}//end TC2seg



	/**
	* SEG2TC
	* Convierte el valor en segundos a formato TC. Tipo 322.342 -> 00:05:22.342
	*/
	public static function seg2tc($seg)	{
		
		if (strpos($seg, ':')!==false) {
			trigger_error("Bad format '$seg' . Expected seconds");
			return false;
		}

		$horas = (int)$seg / 3600 ;
		if($horas<1){
			$horas = 0 ;
		}else{
			$horas 	= floor($horas);
			$seg   	= (int)$seg - ($horas * 3600);
		}
		$minutos = ((int)$seg / 60) ;
		if($minutos<1){
			$minutos = 0 ;
		}else{
			$minutos = floor($minutos);
			$seg 	 = (int)$seg - ($minutos * 60);
		}
		$segundos = floor($seg) ;
		$mseconds = (int)(($seg - $segundos)*1000);
		# format 00
		$horas 		= str_pad($horas, 2, '0', STR_PAD_LEFT);
		$minutos 	= str_pad($minutos, 2, '0', STR_PAD_LEFT);
		$segundos 	= str_pad($segundos, 2, '0', STR_PAD_LEFT);
		$mseconds 	= str_pad($mseconds, 3, '0', STR_PAD_LEFT);

		$tc = $horas .':'. $minutos. ':'. $segundos . '.' . $mseconds;

		return (string)$tc ;
	}//end seg2tc



	/**
	* SEG2TC_MS
	*//*
	public static function seg2tc_ms($seg_float) {

		$ar = explode('.', $seg_float);

		$tc=0;
		$tc2=0;

			dump($ar, ' ar'.to_string());
		
		if(isset($ar[0])) {
			$tc = self::seg2tc($ar[0]);
		}
		if(isset($ar[1])) {
			$tc2 = substr($ar[1],0,3);
			$tc2 = str_pad($tc2, 3, '0', STR_PAD_RIGHT);
		}		

		return $tc . '.' . $tc2 ;
	}//end seg2tc_ms
	*/



	/**
	* MS_FORMAT
	*/
	public static function ms_format($time) {

		if(isset($time)) {
			$tc = self::seg2tc($time);
		}	

		return $tc; //. '.000' ;
	}//end ms_format	


	
	/**
	* APLI_TC_OFFSET
	* retorna un tc con el tc_offset (segundos) aplicado (sumado o restado, si es negativo
	*/
	public static function apli_tc_offset($tc, $tc_offset=false) {
		
		if($tc_offset===false) return $tc;
		
		$tc_sec = self::TC2seg($tc);		
		$tc_sec = intval($tc_sec + $tc_offset);
		
		if($tc_sec<0) $tc_sec = 0;
		
		$tc_time_code = self::seg2tc($tc_sec);
		
		return (string)$tc_time_code;
	}//end apli_tc_offset



	/**
	* MINUTOS_TO_HORAS
	*/
	public static function minutos_to_horas($minutos, $formated=true) {

		# calcate hours / minutes
		$h = ($minutos/60);
		$ar_h = explode(',',strval($h));
		
		$hours 		= intval($ar_h[0]);
		$minutes	= $minutos - $hours*60;	
		#echo " $hours : $minutes";
		if($formated) {

			# Formated
			$total_hotas = number_format($hours,0,',','.')." h : $minutes m";

		}else{

			# Round
			$total_hotas  = $hours;
			if($minutes>30)
				$total_hotas++;
		}
			
		return $total_hotas;
	}//end minutos_to_horas



	// ******  AJUSTE TC'S VIRTUALES CALCULADOS HACIENDO LA MEDIA   ******* //
	// Localizado el index IN, si el TC anterior y posterior están a mas de X caracteres, hacemos una 
	// aproximaximación y creamos un TC virtual con la media de las duraciones de los caracteres entre 
	// los TC anterior y posterior
	public static function optimize_tcIN__DES($texto, $indexIN, $inicioPos='', $in_margin=100) {
		
		$debug = false;
		
		// Si inicioPos > 0 estaremos buscando de forma libre, sin index o ya sabemos la posición
		if( $inicioPos!='' ) {
			#$in_margin 	= 100 ;	
			$indexPos 	= $inicioPos - $in_margin ;
			if($indexPos<0) $indexPos = 0;
		}else{
			# pos absoluta de index IN
			$indexPos = strpos($texto, $indexIN); 
		}
		#dump($indexPos, ' indexPos ++ indexIN'.to_string($indexIN));
		
		# margen de validación
		$margen = 55 ;
		
			# Posición del TC anterior		
			$frAnterior = substr($texto, 0, $indexPos); # fr desde inicio (0) hasta la pos de indexIN
			$tcLastPos 	= strrpos($frAnterior, "[TC_" ); # pos abs del último tc en el fragmento anterior al indexIn (por tanto es el TC anterior al indexIN) 
			$prevTC 	= substr($frAnterior, $tcLastPos +4, 12); # valor tc (tipo 00:20:14.333)
			$dif 		= $indexPos - $tcLastPos ;
			
		if($dif < $margen && $dif > 0) {
			
			$tcin = $prevTC ;
			$debug .= "tcin anterior ($prevTC) a $dif ch. ";
			
		} else {
					
			# Posición del TC posterior
			$frPosterior 	= substr($texto, $indexPos ); # fr desde indexIn hasta el final
			$tcFirstPos 	= strpos($frPosterior, "[TC_" ); # pos del primer tc encontrado
			$nextTCposAbs	= $indexPos + $tcFirstPos ;
			$nextTC 		= substr($frPosterior, $tcFirstPos +4, 12); # valor tc (tipo 00:20:14.323)
			$dif 			= $nextTCposAbs - $indexPos ;
			
			if( $dif < $margen && $dif > 0) {
				
				$tcin = $nextTC ;
				$debug .= "tcin posterior ($nextTC) a $dif ch. ";
				
			} else {
									
				# cálculo tc virtual
				# calculamos cuantos caracteres hay entre prevTC y nexTC
				$tcPrevPosAbs 	= strpos($texto, "[TC_".$prevTC ); # pos absoluta del tc anterior
				$tcNextPosAbs 	= strpos($texto, "[TC_".$nextTC ); # pos absoluta del tc siguiente
				$difTCchar 		= $tcNextPosAbs - $tcPrevPosAbs ; # caracteres entre el tc anterior y el posterior 
				
				if( (!$tcPrevPosAbs && !$tcNextPosAbs) ){
					$tcin = '' ;
				}else{	
					#$frMedio = substr($texto, $tcPrevPosAbs+16, $difTC); 
					#$chars = strlen($frMedio);
				
					# calculamos el n de segundos entre tc anterior y posterior
					$prevTCseg 	= self::TC2seg($prevTC);
					$nextTCseg 	= self::TC2seg($nextTC);
					$difSeg 	= $nextTCseg -$prevTCseg ;
					
					# calculamos cuantos segundos ocupa un caracter
					@ $segChar 	= $difSeg / $difTCchar ;
					
					# calculamos los caracteres entre en prevTC y el index IN
					$charPrevTCindexIn =  strlen( substr($texto, $tcPrevPosAbs+16, ($indexPos - $tcPrevPosAbs) ) ); 
					
					# hacemos la hipótesis del TC que tocaría en indexIN
					$tcInVirtualseg = ($charPrevTCindexIn * $segChar) +  $prevTCseg ; # en segundos
					$tcInVirtual 	= self::seg2tc($tcInVirtualseg);
					
					$tcin = $tcInVirtual ;
					$debug .= "tcin virtual ($prevTC => $tcInVirtual) segChar: $segChar  a $difTCchar ch. ";
				}
			}#if( $dif < $margen && $dif > 0)
			
		}#/if($dif < $margen && $dif > 0)
		
		#echo $debug ;
		return $tcin ;
	}
	


	public static function optimize_tcOUT__DES($texto, $indexOUT, $finalPos='', $in_margin=100) {
		
		$debug = false;
		
		/* Si finalPos > 0 estaremos buscando de forma libre, sin index */
		if( $finalPos!='' )
		{
			$indexPos 	= strpos($texto, $finalPos);
			#$in_margin 	= 100 ;
			$indexPos 	= $finalPos + $in_margin ;
		}
		else
		{
			# pos absoluta de index OUT
			$indexPos 	= strpos($texto, $indexOUT); 
		}
		
		# margen de validación
		$margen = 55 ;
		
			# Posición del TC posterior
			$frPosterior 	= substr($texto, $indexPos ); # fr desde indexIn hasta el final
			$tcFirstPos 	= strpos($frPosterior, "[TC_" ); # pos del primer tc encontrado
			$nextTCposAbs 	= $indexPos + $tcFirstPos ;
			$nextTC 		= substr($frPosterior, $tcFirstPos +4, 8); # valor tc (tipo 00:20:14)
			$dif 			= $nextTCposAbs - $indexPos ;			
			
		if( $dif < $margen && $dif > 0)
		{			
			$tcout = $nextTC ;
			$debug .= "tcout posterior ($nextTC) a $dif ch. ";
		}
		else
		{		
			# Posición del TC anterior		
			$frAnterior = substr($texto, 0, $indexPos); # fr desde inicio (0) hasta la pos de indexIN
			$tcLastPos 	= strrpos($frAnterior, "[TC_" ); # pos abs del último tc en el fragmento anterior al indexIn (por tanto es el TC anterior al indexIN) 
			$prevTC 	= substr($frAnterior, $tcLastPos +4, 8); # valor tc (tipo 00:20:14)
			$dif 		= $indexPos - $tcLastPos ;
			if( $dif  < $margen && $dif > 0)
			{
				$tcout = $prevTC ;
				$debug .= "tcout anterior ($nextTC) a $dif ch. ";
			}
			else
			{			
				# cálculo tc virtual
				# calculamos cuantos caracteres hay entre prevTC y nexTC
				$tcPrevPosAbs 	= strpos($texto, "[TC_".$prevTC ); # pos absoluta del tc anterior
				$tcNextPosAbs 	= strpos($texto, "[TC_".$nextTC ); # pos absoluta del tc siguiente
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
					$charPrevTCindexIn =  strlen( substr($texto, $tcPrevPosAbs+16, ($indexPos - $tcPrevPosAbs) ) ); 
					
					# hacemos la hipótesis del TC que tocaría en indexIN
					$tcInVirtualseg	 = ($charPrevTCindexIn * $segChar) +  $prevTCseg ; # en segundos
					$tcInVirtual	 = self::seg2tc($tcInVirtualseg);
					
					$tcout = $tcInVirtual ;
					$debug .= "tcout virtual ($prevTC => $tcInVirtual) segChar: $segChar  a $difTCchar ch. ";
				}
			}
		}
		#echo "<hr>$debug" ;
		return $tcout ;
	}
	// ****** FIN AJUSTE TC'S VIRTUALES CALCULADOS HACIENDO LA MEDIA   ******* //



}//end OptimizeTC
?>