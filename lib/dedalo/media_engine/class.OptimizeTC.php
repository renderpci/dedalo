<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');
/************************************************************************
	
    Dédalo : Intangible Cultural Heritage Management Platform
	
	Copyright (C) 2011  Authors: Juan Francisco Onielfa, Alejandro Peña

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as
    published by the Free Software Foundation, either version 3 of the
    License, or (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
	
	http://www.fmomo.org
	dedalo@fmomo.org
	
************************************************************************/

class OptimizeTC {	
	
	
	// ******  AJUSTE TC'S VIRTUALES CALCULADOS HACIENDO LA MEDIA   ******* //
	// Localizado el index IN, si el TC anterior y posterior están a mas de X caracteres, hacemos una 
	// aproximaximación y creamos un TC virtual con la media de las duraciones de los caracteres entre 
	// los TC anterior y posterior
	public static function optimize_tcIN($texto, $indexIN, $inicioPos=null) {	
		
		$debug = false;
		
		/* Si inicioPos > 0 estaremos buscando de forma libre, sin index */
		if( !empty($inicioPos) )
		{
			$margen 	= 100 ;
			$indexPos 	= $inicioPos - $margen ;
			if($indexPos<0) $indexPos = 0;
		}
		else
		{
			# pos absoluta de index IN
			#$indexPos = strpos($texto, $indexIN);
			$indexPos = $indexIN;
		}
		
		# margen de validación
		$margen = 55 ;
		
			# Posición del TC anterior		
			$frAnterior = substr($texto, 0, $indexPos); # fr desde inicio (0) hasta la pos de indexIN
			$tcLastPos 	= strrpos($frAnterior, "[TC_" ); # pos abs del último tc en el fragmento anterior al indexIn (por tanto es el TC anterior al indexIN) 
			$prevTC 	= substr($frAnterior, $tcLastPos +4, 8); # valor tc (tipo 00:20:14)
			$dif 		= $indexPos - $tcLastPos ;
			
		if($dif < $margen && $dif > 0) {
			
			$tcin = $prevTC ;
			$debug .= "tcin anterior ($prevTC) a $dif ch. ";
			
		} else {
					
			# Posición del TC posterior
			$frPosterior 	= substr($texto, $indexPos ); # fr desde indexIn hasta el final
			$tcFirstPos 	= strpos($frPosterior, "[TC_" ); # pos del primer tc encontrado
			$nextTCposAbs	= $indexPos + $tcFirstPos ;
			$nextTC 		= substr($frPosterior, $tcFirstPos +4, 8); # valor tc (tipo 00:20:14)
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
	
	
	public static function optimize_tcOUT($texto, $indexOUT, $finalPos='') {	
		
		$debug = false;
		
		/* Si finalPos > 0 estaremos buscando de forma libre, sin index */
		if( isset($finalPos) && $finalPos!='' )
		{
			$indexPos 	= strpos($texto, $finalPos);
			$margen 	= 100 ;
			$indexPos 	= $finalPos + $margen ;
		}
		else
		{
			# pos absoluta de index OUT
			#$indexPos 	= strpos($texto, $indexOUT);
			$indexPos 	= $indexOUT; 
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
					@ $segChar 	= $difSeg / $difTCchar ;
					
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
	
	
	/*
	* TC Margen
	* agrega un margen al tc recibido
	* (hacia atrás si es tcin, hacia delante si es tcout)
	*/
	public static function tcMargen($tc,$tipo,$margen=2) {
		
		$tcTrozos 	= array();
		$tcTrozos 	= explode(':', $tc);
		$segundos 	= $tcTrozos[2];
		$minutos 	= $tcTrozos[1];
		$horas 		= $tcTrozos[0];
		if($tipo=='tcin'){
			if($segundos >= $margen){
			  $segundos = $segundos  - $margen ;
			}else{
			  $minutos	= $minutos -1 ;
			  $segundos	= 59 ;
			}
		}
		if($tipo=='tcout'){
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
		return $tc = "$horas:$minutos:$segundos";
	}
	
	# calcula el valor absoluto (entero) del tc. Si es 0 es porque NO existe TC
	public static function valorTC($tc)	{
		
		$valor = 0;
			
		$tcTrozos	= explode(':', $tc);
		
		if(is_array($tcTrozos)) {
			
			$segundos	= 0;	if(isset($tcTrozos[2])) $segundos	= $tcTrozos[2];
			$minutos	= 0;	if(isset($tcTrozos[1])) $minutos	= $tcTrozos[1];
			$horas		= 0;	if(isset($tcTrozos[0])) $horas		= $tcTrozos[0];
			
			$valor		= $horas + $minutos + $segundos ;
		}
		
		return intval($valor) ;
	}
	
	# convierte el valor de TC a segundos. Tipo 00:05:22 -> 322
	public static function TC2seg($tc) {
		
		$totalSegundos = 0;
		
		$t = explode(':',$tc);
		
		if(is_array($t)) {
			
			$horas		= 0;	if(isset($t[0]))	$horas		= $t[0];
			$minutos	= 0;	if(isset($t[1]))	$minutos	= $t[1];
			$segundos	= 0;	if(isset($t[2]))	$segundos 	= $t[2];
			
			$totalSegundos 	= ($horas * 3600) + ($minutos * 60) + $segundos ;
		}
		
		return $totalSegundos ;
	}	
	
	# convierte el valor en segundos a formato TC. Tipo 322 -> 00:05:22
	public static function seg2tc($seg)	{	
		
		$horas = $seg / 3600 ;
		if($horas<1){
			$horas = 0 ;
		}else{
			$horas = floor($horas);
			$seg = $seg - ($horas * 3600);
		}
		$minutos = ($seg / 60) ;
		if($minutos<1){
			$minutos = 0 ;
		}else{
			$minutos = floor($minutos);
			$seg = $seg - ($minutos * 60);
		}
		$segundos = floor($seg) ;
		# format 00
		$horas 		= str_pad($horas, 2, '0', STR_PAD_LEFT);
		$minutos 	= str_pad($minutos, 2, '0', STR_PAD_LEFT);
		$segundos 	= str_pad($segundos, 2, '0', STR_PAD_LEFT);
		$tc 		= $horas .':'. $minutos. ':'. $segundos ;
		return $tc ;
	}

	
		

	
	
	# retorna un tc con el tc_offset (segundos) aplicado (sumado o restado, si es negativo
	public static function apli_tc_offset($tc, $tc_offset=false) {	
		
		if($tc_offset===false) return $tc;
		
		$tc_sec = self::TC2seg($tc);		
		$tc_sec = intval($tc_sec + $tc_offset);
		
		if($tc_sec<0) $tc_sec = 0;
		
		$tc_time_code	= self::seg2tc($tc_sec);
		
		return 	$tc_time_code;
	}




}




?>