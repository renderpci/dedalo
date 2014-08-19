<?php
class TR {
	
	
	function __construct() {
		#$this->file($file);
	}
	
	
	# GET UNIFIED PATTERNS FOR MARKS
	public static function get_mark_pattern($mark,$standalone=true,$id=false,$data=false) {
		
		$ar_marks = array('tc','index','indexIn','indexOut','relIn','relOut','br','strong','em','index_and_rel','svg','geo'); if(!in_array($mark,$ar_marks)) die(__METHOD__ ." Error: mark: '$mark' is not accepted !");
		
		switch($mark) {

			# TC
			case 'tc' : 	if ($id) {
								$string = '(\[TC_($id)_TC\])';
							}else{
								$string = '(\[TC_([0-9]{1,2}:[0-9]{1,2}:[0-9]{1,2})_TC\])';	
							}
							break;

			# SVG
			case 'svg' : 	if ($id) {
								$string = "\[svg-[a-z]-{$id}-data:{$data}\]";
								throw new Exception("Error Processing Request", 1);								
							}else{
								$string = "(\[(svg)-([a-z])-([0-9]{1,6})-data:.*?:data\])";	
							}
							break;
			# GEO
			case 'geo' : 	if ($id) {
								$string = "\[geo-[a-z]-{$id}-data:{$data}\]";
								throw new Exception("Error Processing Request", 1);								
							}else{
								$string = "(\[(geo)-([a-z])-([0-9]{1,6})-data:.*?:data\])";	
							}
							break;

			# INDEX
			case 'index' : 	if ($id) {
								$string = "\[\/{0,1}index-[a-z]-{$id}\]";	
							}else{
								$string = "\[\/{0,1}(index)-([a-z])-([0-9]{1,6})\]";
							}
							break;	
			case 'indexIn' :if ($id) {
								$string = "(\[index-[a-z]-{$id}\])";
							}else{
								$string = "(\[index-([a-z])-([0-9]{1,6})\])";				
							}
							break;
			case 'indexOut':if ($id) {
								$string = "(\[\/index-[a-z]-{$id}\])";
							}else{
								$string = "(\[\/index-([a-z])-([0-9]{1,6})\])";
							}
							break;			
			# OTHERS
			case 'br' : 	$string = '\<br \/\>';
							break;
			case 'strong' :	$string = '(\<strong\>|\<\/strong\>)';
							break;
			case 'em' :		$string = '(\<em\>|\<\/em\>)';
							break;

			case 'apertium-notrans' :
							$string = '(\<apertium-notrans\>|\<\/apertium-notrans\>)';
							break;
		}
		
		# default mark have in and out slash (pattern standalone)
		if($standalone) $string = '/'.$string.'/';
		
		return $string;
	}
	
	
	# REMOVE SPECIFIC TAGS BY indexId received
	public static function removeIndexTag($indexID,$texto) {
		die("por revisar");
		$indexID = sprintf("%03s", $indexID);	# format like '002'
		
		# with space inside		
		$texto 	= str_replace('[index_'.$indexID.'_in] ' , ' ', $texto );
		$texto 	= str_replace(' [out_index_'.$indexID.']', ' ', $texto );
		
		# without space inside	
		$texto 	= str_replace('[index_'.$indexID.'_in]' , ' ', $texto );
		$texto 	= str_replace('[out_index_'.$indexID.']', ' ', $texto );
		
		return ($texto);
	}


	# MATCH_PATTERN
	public static function match_pattern_index_from_tag( $tag ) {

		$pattern = TR::get_mark_pattern($mark='index', $standalone=false);

		if(preg_match_all("/$pattern/", $tag, $matches, PREG_PATTERN_ORDER)) {

			#dump($matches,'$matches',"tag: $tag");
			return $matches;
		}
	}
	
	#
	public static function tag2type($tag) {

		$match_pattern 	= TR::match_pattern_index_from_tag($tag);
		$type 			= $match_pattern[1][0];

		return $type;
	}
	#
	public static function tag2state($tag) {

		$match_pattern 	= TR::match_pattern_index_from_tag($tag);
		$state 			= $match_pattern[2][0];
		
		return $state;
	}
	# CONVERT tag to value
	public static function tag2value($tag) {

		$match_pattern 	= TR::match_pattern_index_from_tag($tag);
		$value 			= $match_pattern[3][0];
		
		return intval($value);		
	}


	# CONVERT value to tag
	public static function value2tag($value,$type) {
		die("Por revisar");

		$tag 	= false;
		
		switch($type) {
			
			case 'indexIn'	:	$value	= sprintf("%03s", $value);	# format like '002'
								$tag 	= '[index_'.$value.'_in]';
								break;
								
			case 'indexOut'	:	$value	= sprintf("%03s", $value);	# format like '002'
								$tag 	= '[out_index_'.$value.']';
								break;
			case 'tc'		:	$pattern = '/[0-9][0-9]:[0-9][0-9]:[0-9][0-9]/';# format like '00:02:16'
								if(preg_match($pattern,$value)>0) 
								$tag 	= '[TC_'.$value.'_TC]';
								break;
		}		
		return $tag;
	}
	
	# CONVERT DIVS (div) TO <br />
	private static function convertDiv2br($text) {
		
		$text = str_replace('<div>','', $text);
		$text = str_replace('</div>',"<br />\n", $text);
				
		return $text ;	
	}
	
	
	# clean text to translate	
	public static function deleteMarks($string, $deleteTC=true, $deleteIndex=true, $deleteSvg=true, $deleteGeo=true) {
		
		# TC clear
		if($deleteTC) {
			$pattern = TR::get_mark_pattern('tc');
			$string = preg_replace($pattern, '', $string);	# elliminar los TC
		}
		
		# Index clear
		if($deleteIndex) {
			$pattern 	= TR::get_mark_pattern('index');
			$string 	= preg_replace($pattern, '', $string);
		}

		# Svg clear
		if($deleteIndex) {
			$pattern 	= TR::get_mark_pattern('svg');
			$string 	= preg_replace($pattern, '', $string);
		}

		# Geo clear
		if($deleteIndex) {
			$pattern 	= TR::get_mark_pattern('geo');
			$string 	= preg_replace($pattern, '', $string);
		}

		# last <br /> clear
		#$lastBR = substr($string, -6); if($lastBR == '<br />') $string = substr($string, 0, -6);	#echo "=== lastBR:$lastBR: === \n";
		
		# convert multiples spaces to only one
		#$string	= TR::multipleSpaces2One($string);
		
		#$string = TR::limpiezaPOSTtr($string);		#<---- DESACTIVO TEMPORAL. EVALUAR SI SE DEJA INACTIVO.........................	
			
		return $string ;
	}

	
	# CONVERT TAGS LIKE INDEX,TC TO IMAGES
	public static function addTagImgOnTheFly($text, $hilite=false, $indexEditable=false, $tcEditable=true, $svgEditable=true, $geoEditable=true) {
		
		# Hilite		
		if($hilite===true) {
			$codeHiliteIn	= "<span class=\"hilite\">";		#$codeHiliteIn	= "<h7>";
			$codeHiliteOut	= "</span>";						#$codeHiliteOut	= "</h7>";
		}else{
			$codeHiliteIn	= '';
			$codeHiliteOut	= '';	
		}	
		
		# Index
		$mceNonEditable = ' mceNonEditable'; # default (Ojo: conservar el spacio al principio)		
		if($indexEditable!=false) $mceNonEditable = ''; 

		#$mceNonEditable = " "; # OVERRIDE MCE NON EDITABLE VALUE
		
		$pattern 	= TR::get_mark_pattern('indexIn');
		$text		= preg_replace($pattern, "$codeHiliteIn<img id=\"$1\" src=\"../../../inc/btn.php/$1\" class=\"index{$mceNonEditable}\" />" , $text);	# index mceNonEditable
		
		$pattern 	= TR::get_mark_pattern('indexOut');		
		$text		= preg_replace($pattern, "<img id=\"$1\" src=\"../../../inc/btn.php/$1\" class=\"index{$mceNonEditable}\" />$codeHiliteOut", $text);
		

		# TC
		$mceNonEditable = ' mceNonEditable'; # default (Ojo: conservar el spacio al principio)		
		if($tcEditable!=false) $mceNonEditable = '';

		#$mceNonEditable = " "; # OVERRIDE VALUE NON EDITABLE
		
		$pattern 	= TR::get_mark_pattern('tc'); 
		$text		= preg_replace($pattern, "<img id=\"$1\" src=\"../../../inc/btn.php/$1\" class=\"tc{$mceNonEditable}\" />", $text);


		# SVG
		$mceNonEditable = ' mceNonEditable'; # default (Ojo: conservar el spacio al principio)		
		if($svgEditable!=false) $mceNonEditable = '';
		$pattern 	= TR::get_mark_pattern('svg');	#dump($text,'$text');
		#$text		= preg_replace($pattern, "<img id=\"$1\" src=\"../../../inc/btn.php/$1\" class=\"svg{$mceNonEditable}\" />$codeHiliteOut", $text);
		$text		= preg_replace($pattern, "<img id=\"$1\" src=\"../../../inc/btn.php/[$2-$3-$4-data::data]\" class=\"svg{$mceNonEditable}\" />$codeHiliteOut", $text);

		# GEO
		$mceNonEditable = ' mceNonEditable'; # default (Ojo: conservar el spacio al principio)		
		if($svgEditable!=false) $mceNonEditable = '';
		$pattern 	= TR::get_mark_pattern('geo');	#dump($text,'$text');
		#$text		= preg_replace($pattern, "<img id=\"$1\" src=\"../../../inc/btn.php/$1\" class=\"geo{$mceNonEditable}\" />$codeHiliteOut", $text);
		$text		= preg_replace($pattern, "<img id=\"$1\" src=\"../../../inc/btn.php/[$2-$3-$4-data::data]\" class=\"geo{$mceNonEditable}\" />$codeHiliteOut", $text);
			
		return $text ;
	}	
	public static function removeTagImgOnTheFly($text) {		

		# if not found img tag, return the same text
		if(strpos($text,'<img') === false) return $text;
		
		#tag patterns (not standalone)
		$patternIndexIn 	= TR::get_mark_pattern('indexIn',false);
		$patternIndexOut 	= TR::get_mark_pattern('indexOut',false);	#error_log($patternIndexOut);
		$patternTC		 	= TR::get_mark_pattern('tc',false);
		$patternSVG		 	= TR::get_mark_pattern('svg',false);
		$patternGEO		 	= TR::get_mark_pattern('geo',false);
		
		# Convert index images to index text
		$pattern[] 	= '/\<img id="'.$patternIndexIn.'" src="..\/..\/..\/inc\/btn.php\/'.$patternIndexIn.'" class="(index|index mceNonEditable)" \/\>/';	# (\[index_..._in\])
		$pattern[] 	= '/\<img id="'.$patternIndexOut.'" src="..\/..\/..\/inc\/btn.php\/'.$patternIndexOut.'" class="(index|index mceNonEditable)" \/\>/';	# (\[out_index_...\])

		#$pattern[] 	= '/\<img id="'.$patternIndexIn.'" src="..\/..\/..\/inc\/btn.php\/'.$patternIndexIn.'" class="(index|index )" \/\>/';	# (\[index_..._in\])
		#$pattern[] 	= '/\<img id="'.$patternIndexOut.'" src="..\/..\/..\/inc\/btn.php\/'.$patternIndexOut.'" class="(index|index )" \/\>/';	# (\[out_index_...\])
			
		# Convert tc images to tc text
		$pattern[] 	= '/\<img id="'.$patternTC.'" src="..\/..\/..\/inc\/btn.php\/'.$patternTC.'" class="(tc|tc mceNonEditable)" \/\>/';	# (\[out_index_...\])	<img src="../inc/btn.php/[TC_00:00:00_TC]" class="tc" />	
		
		# Convert svg images to svg tag text
		#<img id="[svg-n-2-data:undefined]" src="../../../inc/btn.php/[svg-n-2-data:undefined]" class="svg mceNonEditable" />
		$pattern[] 	= '/\<img id="'.$patternSVG.'" src="..\/..\/..\/inc\/btn.php\/'.$patternSVG.'" class="(svg|svg mceNonEditable)" \/\>/';	# (\[index_..._in\])" />

		# Convert geo images to geo tag text
		#<img id="[geo-n-2-data:undefined]" src="../../../inc/btn.php/[geo-n-2-data:undefined]" class="geo mceNonEditable" />
		$pattern[] 	= '/\<img id="'.$patternGEO.'" src="..\/..\/..\/inc\/btn.php\/'.$patternGEO.'" class="(geo|geo mceNonEditable)" \/\>/';	# (\[index_..._in\])" />
	
		# replace matches
		$text		= preg_replace($pattern, "$1", $text);
		return $text ;
	}
	
	public static function hideAroundIndexID($indexID,$texto) {
		
		#$brPattern = TR::get_mark_pattern('br');
		$br = '<br />';
		
		$indexIDformated= sprintf("%03s", $indexID);	# format like '002'
		
		$tagIndexIn		= '[index_'.$indexIDformated.'_in]' ;	# [index_002_in]
		$tagIndexOut	= '[out_index_'.$indexIDformated.']';	# [out_index_002]
		
		# pre text
		$posIn			= strpos($texto, $tagIndexIn );
		if($posIn!==false) {
			
			$frPre		= substr($texto, 0, $posIn );
			
			# search last br in pre text fragment
			$margin = 160;
			$posInBR		= strrpos( substr($frPre,0,-$margin), $br);
			if($posInBR!==false) {
				$frPre		= substr($frPre, 0, $posInBR  ); # + strlen($br)
			}else{
				$frPre		= '';	
			}	
		}else{
			return "tagIndexIn not found ($indexID)";	
		}
		
		
		# post text
		$posOut			= strpos($texto, $tagIndexOut);
		if($posOut!==false) {
			
			$frPost		= substr($texto, $posOut + strlen($tagIndexOut) );
			
			# search first br in post text fragment
			$margin = 140;
			$posOutBR		= strpos( substr($frPost,$margin), $br);
			if($posOutBR!==false) {
				$frPost		= substr($frPost, $posOutBR+$margin);
			}else{
				$frPost		= '';
			}	
		}else{
			return "tagIndexOut not found ($indexID)";	
		}		
		
		
		$textoLen		= strlen($texto);
		$frPreLen		= strlen($frPre);
		$frPoslen		= strlen($frPost);		#echo "$texto <br> $textoLen , $frPreLen , $frPoslen ";
		
		$middleText		= substr($texto, $frPreLen, $textoLen-($frPreLen+$frPoslen) );
		
		$finaltext		= "<div class=\"displayNone\">$frPre</div>". $middleText . "<div class=\"displayNone\">$frPost</div>";	#die("$indexIDformated ++ $finaltext	");
		
		#$finaltext		= $frPost;
				
		return $finaltext;
	}
	
	# ELIMINATE PARAGRPHAS (p) AND CONVERT TO <br />
	public static function convertParagraph2br($string) {
		
		# develop control
		$today 		= date("d-m-Y H:m:s");
		$converted 	= strpos($string,'V3 CONVERTED');	#V3 CONVERTED (04-10-2011 13:10:27) !!!!!!!!!!!!!!
		if($converted!==false) {
			$string		= str_replace('V3 CONVERTED',"V3 SAVED ($today) - CONVERTED", $string);
		}
		
		if(strpos($string,'<p>')===false) return $string;
		
		#$string		= TR::cleanTexGarbageV2($string);		
				
		# eliminate all hillites
		$string		= preg_replace("/<p\> {0,2}\<span class\=\"hilite\"\>/"	, ''	, $string);
		$string		= preg_replace("/\<\/span\> {0,2}\<\/p\>/"				, ''	, $string);
		$string		= preg_replace("/ {0,2}\<span class\=\"hilite\"\>/"		, ''	, $string);
		$string		= preg_replace("/\<\/span\> {0,2}/"						, ''	, $string);		
		
		# eliminate double <p> or </p>
		$string		= preg_replace("/\<p\> {0,2}\<p\>/"						, "<p>"		, $string);
		$string		= preg_replace("/\<\/p\> {0,2}\<\/p\>/"					, "</p>"	, $string);
		
		# remove all tags except those permitted
		$string		= strip_tags($string, '<strong><em><br><img><p><h5><h6>');
		
		# remove empty paragraphs like <p>&nbsp;</p>		
		$string		= str_replace("<p>&nbsp;</p>",'', $string);
		$string		= str_replace('&nbsp;',' ', $string);
		$string		= preg_replace("/\<p\>\ {0,2}\<\/p\>/", '', $string);	
		
		# common patterns
		$patternIndexIn	= TR::get_mark_pattern('indexIn',false);
		$patternIndexOut= TR::get_mark_pattern('indexOut',false);
		$patternTC		= TR::get_mark_pattern('tc',false);
		$patternBr		= TR::get_mark_pattern('br',false);

		# </strong></p><h5>[index_003_in]</h5><p><strong>	-->	[index_003_in] 
		$string		= preg_replace("/\<\/strong\>\<\/p\>\<h5\>($patternIndexIn|$patternIndexOut)\<\/h5\>\<p\>\<strong\>/", "$1", $string);
		
		# </strong></p><p>&nbsp;</p><h5>[index_001_in]</h5><p><span class="hilite"><p>&nbsp;</p><p><strong>	
		#$string		= preg_replace("/\<\/strong\>\<\/p\>\<h5\>($patternIndexIn|$patternIndexOut)\<\/h5\>\<p\>\<strong\>/", "$1", $string);

		# "</strong></p><h5>"; br;
		#$string		= str_replace('</strong></p><h5>','</strong>', $string);		
		
		#$string		= preg_replace("/\<\/strong\> {0,2}\<\/p\> {0,2}\<h5\>($patternIndexIn|$patternIndexOut)\<\/h5\>\<p\> {0,2}\<strong\>/", "XXXXXXXXXX", $string); #</strong><h5>$1</h5><strong>
		
		# </strong> </p> <h5> [indexOut] </h5> <p>	-->	</strong> <h5> [indexOut] </h5> <br>
 		$string		= preg_replace("/\<\/strong\> {0,2}\<\/p\> {0,2}\<h5\>($patternIndexOut)\<\/h5\>\<p\> {0,2}/", "</strong><h5>$1</h5><br />", $string);
		
		# </strong> </p> <h5> [indexOut] </h5> <p> --> </strong> <br> <h5> [indexOut] </h5> 
		$string		= preg_replace("/\<\/strong\> {0,2}\<\/p\> {0,2}\<h5\>($patternIndexIn)\<\/h5\>\<p\> {0,2}/", "</strong><br /><h5>$1</h5>", $string);
		
		# </p></strong><h5>	-->	$1<br />
		$string		= preg_replace("/\<\/p\> {0,2}(\<\/strong\>|) {0,2}\<h5\>/", '$1<br />', $string);	#$string = str_replace('</p><h5>','<br />', $string);
		
		# </p><strong><h6>	--> <br />$1	(ver caso cinta 79 TC:00:34:07 en Memoria Oral)
		$string		= preg_replace("/\<p\> {0,2}(\<strong\>|) {0,2}\<h6\>/", '<br />$1', $string);	
		
		# </h5> <h6>  -->	<br />
		$string		= preg_replace("/\<\/h5\> {0,2}\<h6\>/", "<br />", $string);
		
		# </h5><p><strong>	-->	 <br><strong>
		$string		= str_replace('</h5><p><strong>','<br /><strong>', $string);		
		
		# </h5><p>	-->	''
		$string		= str_replace('</h5><p>','', $string);
		
		# </strong> - </p> - <p>	-->	- </strong><br /> -
		$string		= preg_replace("/\<\/strong\>(-| |)\<\/p\>(-| |)\<p\>/", '$1</strong><br />$2', $string);
		
		# <p>	--> ''
		$string		= str_replace('<p>','', $string);
		
		# </p>	-->	<br />
		$string		= str_replace('</p>','<br />', $string);
				
		# <h6>,</h6>,<h5>,</h5>	--> ''
		$rp	= array('<h6>','</h6>','<h5>','</h5>');
		$string		= str_replace($rp,'', $string);
		
		# <br />[indexOut]<br />	-->	<br />[indexOut]
		$string		= preg_replace("/$patternBr {0,2}($patternIndexOut) {0,2}$patternBr/", "$1<br />", $string);
		
		# <br />[indexIn]<br />	-->	[indexIn]<br />
		$string		= preg_replace("/$patternBr {0,2}($patternIndexIn) {0,2}$patternBr/", "<br />$1", $string);
		
		
		# EXPERIMENTAL ..
		# br
		$string	= preg_replace("/ {0,3}$patternBr {0,3}($patternBr|)/"	, 	'<br />'	, $string);
		
		
		# develop control					
		#$string		= "V3 CONVERTED ($today) !!!!!!!!!!!!!!  <br />".$string ;
		
		return($string) ;
	}
	
	
	#
	# Limpieza del POST del formulario de TR transcripción
	# Temporalmente habilitamos la función de formateo de TC's para Gerard
	#
	public static function limpiezaPOSTtr($string) {
		
		# strip slashes (need for text received from tinyMCE)	
		$string	= trim(stripslashes($string));
		
		# remove return new line
		$new_line = array("\n","\r");
		$string	= str_replace($new_line,'',$string);
		
		# V3 . IF STRING CONTAINS <p>, ELIMINATE PARAGRPHAS (p) AND CONVERT TO <br />	
		$string	= TR::convertParagraph2br($string);											#return $string;	#<---------------- BREAK TEMPORAL !!!!!!
		
		# convierte formatos antiguos de tc (Si estamos en el site del memorial) !!! 
		#if(ID_SITE=='memorial') 
		#$string = TR::formatTC_Memorial2Dedalo($string);
		
		# convert multiples spaces to only one
		$string	= TR::multipleSpaces2One($string);				
		
		# replaces posible tags <img.. for [TC_.. or [index_..
		$string	= TR::removeTagImgOnTheFly($string);				 
			
		# remove ALL html tags, except listed
		$string	= strip_tags($string, '<strong><em><br><br /><img><p>');		
		
		# clean text garbage from tinyMCE
		$string = TR::cleanTexGarbage($string);
		
		# convert multiples spaces to only one
		$string	= TR::multipleSpaces2One($string);
		
		# adjust space between mark and other text. Avoid cases like 'word[TC_00:10:01_TC]' what is considered 1 word...
		#$string	= TR::adjustSpaceBetweenMarkText($string);
		
		# maintains "correct order" in consecutives INDEX,TC . Always order like (TC,INDEX IN) OR (INDEX OUT,TC)
		$string	= TR::fixOrderTags($string);
		
		# clean text garbage from tinyMCE
		$string = TR::cleanTexGarbage($string);
		
		
		# temporal volcado bene 2 to 3 #######################################################################################################################
		#$string	= preg_replace("/\<\/strong\> {0,2}-/"	, 	'\<\/strong\>\<br \/\>-'	, $string); ##########################################################
		/*
		$string	= preg_replace("/\<\/strong\> {0,2}-/"	, 	'</strong><br />-'	, $string);
		$string = str_replace('<br /><br />','<br />', $string);							##################################################################
		
		if( substr($string,0,6) == '<br />' ) $string = substr($string,6);					##################################################################
		
		$patternTC		 	= TR::get_mark_pattern('tc',false);
		$patternBr		 	= TR::get_mark_pattern('br',false);
		$string 			= preg_replace("/($patternTC) {0,2}($patternBr)/",  "<br />"."$1", $string);	# invert BR,TC
		
		$string = str_replace('<br /><br />','<br />', $string);
		*/
		######################################################################################################################################################
		
		
		$string = trim($string);

		$string = stripslashes($string);	
		
		return $string ;
	}
	
	
	# maintains "correct order" in consecutives INDEX,TC . Always order like (TC,INDEX IN) AND (INDEX OUT,TC)
	public static function fixOrderTags($string) {
		
		$patternIndexIn 	= TR::get_mark_pattern('indexIn',false);
		$patternIndexOut 	= TR::get_mark_pattern('indexOut',false);
		$patternTC		 	= TR::get_mark_pattern('tc',false);
		$patternBr		 	= TR::get_mark_pattern('br',false);
			
		$string 			= preg_replace("/$patternIndexIn {0,2}$patternTC/",  "$2"."$1", $string);	# invert INDEX,TC
		$string 			= preg_replace("/$patternTC {0,2}$patternIndexOut/", "$2"."$1", $string);	# invert TC,INDEX
		
		# [indexIn|indexOut] </strong>	-->	</strong> [indexIn|indexOut]
		$string 			= preg_replace("/($patternIndexIn|$patternIndexOut) {0,2}\<\/strong\>/", "</strong>$1", $string);
		
		# strong-index 2 index-strong
		$string 			= preg_replace("/\<strong\> {0,2}($patternIndexIn|$patternIndexOut|$patternTC)/", "$1<strong>", $string);
		
		# indexIn-br 2 br-indexIn
		$string				= preg_replace("/$patternIndexIn {0,1}$patternBr/", "<br />$1", $string);
		
		# <br />[out_index_001] 2 [out_index_001]<br />
		$string				= preg_replace("/$patternBr {0,2}$patternIndexOut/", "$1<br />", $string);
		
		# [index_003_in] [TC_00:13:16_TC] 2 [TC_00:13:16_TC][index_003_in]
		$string				= preg_replace("/$patternIndexIn {0,2}$patternTC/", "$2"."$1", $string);	# "<br />$1"."$2"
		
		# [TC_00:29:56_TC] <br /> [index_014_in] 2 [TC_00:29:56_TC]  [index_014_in]
		$string				= preg_replace("/$patternTC {0,2}$patternBr {0,2}$patternIndexIn/", "$1"."$2", $string);	# "<br />$1"."$2"
		
		# br /em|/strong  2  /strong|/em br 
		$string 			= str_replace('<br /></strong>','</strong><br />', $string);
		$string 			= str_replace('<br /></em>','</em><br />', $string);
		
		# adjust final comas and points
		$string				= preg_replace('/\ {1,3}(\.|\,)/', '$1', $string);
		
		# order invert strong|em tc 2 tc strong|em
		#$string	= preg_replace("/(\<strong\>|\<em\>) {0,2}$patternTC/",	"$2"."$1".' 9999 ',	$string);	# STRONG,TC 2 TC,STRONG
					
		return($string);
	}
	
	# cleanTexGarbage V3
	public static function cleanTexGarbage($string) {
		
		# patterns			
		$patternIndexIn 	= TR::get_mark_pattern('indexIn',false);
		$patternIndexOut 	= TR::get_mark_pattern('indexOut',false);
		$patternTC		 	= TR::get_mark_pattern('tc',false);
		$patternBr			= TR::get_mark_pattern('br',false);
		
		# em
		$string	= preg_replace("/\<em\> {0,3}\<em\>/"					, 	"<em>"		, $string);
		$string	= preg_replace("/\<\/em\> {0,3}\<\/em\>/"				, 	"<\em>"		, $string);
		$string	= preg_replace("/\<em\> {0,3}\<\/em\>/"					, 	''			, $string);
		$string	= preg_replace("/\<em\> {0,3}- {0,3}\<\/em\>/"			, 	'-'			, $string);
		
		# strong
		$string	= preg_replace("/\<strong\> {0,3}\<strong\>/"			, 	"<strong>"	, $string);
		$string	= preg_replace("/\<\/strong\> {0,3}\<\/strong\>/"		, 	"<\strong>"	, $string);
		$string	= preg_replace("/\<strong\> {0,3}\<\/strong\>/"			, 	''			, $string);
		$string	= preg_replace("/\<strong\> {0,3}- {0,3}\<\/strong\>/"	, 	'-'			, $string);
				
		# br
		#$string	= preg_replace("/ {0,3}$patternBr {0,3}($patternBr|)/"	, 	'<br />'	, $string);
		
		#$string = str_replace('<br /><br />','<br />', $string);
		
		$string = str_replace('’', "'", $string); 
		
		return $string ;		
	}
	
	
	# cleanTexGarbage V2
	public static function cleanTexGarbageV2($string) {
		
		$string = str_replace('<p><span class=\"hilite\"> </span></p>', '', $string);
		$string = str_replace('<p><span class="hilite"> </span></p>', '', $string);
		$string = str_replace("<p>-<strong>", '<p><strong>-', $string);	
		$string = str_replace("<p><p>",'<p>', $string);
		$string = str_replace("</p></p>",'</p>', $string);	
		$string = str_replace("<p>\n<p>",'<p>', $string);
		$string = str_replace("</p>\n</p>",'</p>', $string);
		$string = str_replace("<p><strong><br /></strong></p>",'', $string);
		
				
		$string = str_replace("<em>\n<h6>[TC",'<h6>[TC', $string);
		$string = str_replace("TC]</h6>\n-</em>",'TC]</h6> - ', $string);
		$string = str_replace("<h6><br />[TC_",'<h6>[TC_', $string);
		$string = str_replace("_TC]<br /></h6>",'_TC]</h6>', $string);
		$string = str_replace("<h6><br /></h6>",'', $string);
		$string = str_replace("<h6></h6>",'', $string);	
		$string = str_replace("<h5><strong>[",'<h5>[', $string);
		$string = str_replace("]</strong></h5>",']</h5>', $string);
		$string = str_replace("<h5><br /></h5>",'', $string);
		$string = str_replace("<h5></h5>",'', $string);
		$string = str_replace("</h6>\n_TC]",'</h6>', $string);		
		
		# desastres varios (josep frigola)
		$string = str_replace("<p>[TC_</p>", '', $string);
		$string = str_replace("<p>_TC]</p>", '', $string);
		$string = str_replace("<h6>[TC_[TC_</h6>", '', $string); 
		$string = str_replace("<h6>[TC_</h6>", '', $string); 
		$string = str_replace("<h6>[TC_<h6>", '<h6>', $string); 
		$string = str_replace("</h6>_TC]</h6>", '</h6>', $string);
		$string = str_replace("<h6>[<strong>TC_</strong></h6>", '', $string);
		$string = str_replace("TC_<", '<', $string);
		$string = str_replace("<strong>_TC] </strong>", '', $string);
		$string = str_replace(">_TC]", '>', $string);
		$string = str_replace(" style=\"margin-bottom: 0cm;\"", '', $string);
		$string = str_replace("<h6>[\n<h6>", '<h6>', $string);
		$string = str_replace("</h6>\n</h6>", '</h6>', $string);
		
		# otros (Israel memorial 7-4-2011 open office mac)
		$string = str_replace("</h6>
</strong></h6>", '</h6>', $string);
		$string = str_replace("<h6><strong>[
<h6>[", '<h6>[', $string);
		$string = str_replace("<h6><strong>[
<h6>[", '<h6>[', $string);		
		
		$string = str_replace("  ", ' ', $string);	
		$string = str_replace("<p>&nbsp;</p>",'', $string);
		$string = str_replace("&lt;p&gt;&nbsp;&lt;/p&gt;",'', $string);
		$string = str_replace("<p> </p>",'', $string);
		$string = str_replace('<p> </p>','', $string);
		$string = str_replace("<p></p>",' ', $string);
		
		# reincidencias
		$string = str_replace("<p>[TC_</p>", '', $string);
		$string = str_replace("<p>_TC]</p>", '', $string); 
		$string = str_replace("<h6>[TC_</h6>", '', $string); 
		$string = str_replace("<h6>[TC_<h6>", '<h6>', $string); 
		$string = str_replace("</h6>_TC]</h6>", '</h6>', $string);
		$string = str_replace('<h6></h6>','', $string);
		
				
		# busca regex <strong><h6>[TC_..  ó  <p><strong><h6>[TC_..  e invierte el orden
		# EN PRUEBAS 11-01-2010
		$pattern		= array('/(\<p\>\<strong\>\\n)(\<h6\>\[TC..........TC\]\<\/h6\>)/', '/(\<strong\>\\n)(\<h6\>\[TC..........TC\]\<\/h6\>)/');
		$replacement	= array('$2 $1', '$2 $1');
		$string 		= preg_replace($pattern, $replacement, $string);
			
		return $string ;		
	}
			
	
	# captaciones antiguas de Gerard tienen tc's formato 00,25,12 . Lo formateamos correctamente: <h6>[TC_00:25:12_TC]</h6>
	public static function formatTC_Memorial2Dedalo($string)
	{
		# Especific code for old transcriptions TC convert like 01'25'11 or 01,25,11 to [TC_01:25:11_TC]
		#
		$patterns[] = '/<br \/>([0-9][0-9]):([0-9][0-9]):([0-9][0-9])/' ;
		$patterns[] = '/([0-9][0-9]):([0-9][0-9]):([0-9][0-9])<br \/>/' ;
		$patterns[] = "/([0-9][0-9]).([0-9][0-9]).([0-9][0-9])/" ;
		$string 	= addslashes( preg_replace($patterns, '<h6>[TC_$1:$2:$3_TC]</h6>', stripslashes($string) ) );
		$string 	= stripslashes($string) ;
		
		#$reemplazarArray = array("<br />", "<br>");
		#$string = str_replace($reemplazarArray, '<p>', $string); # <-- Temporal	
			
		$result = $string ;
		
		return $result  ;
	}	

	# multipleSpaces2One
	public static function multipleSpaces2One($string) {
			
		# utf-8 spaces
		#$ar = array('&#x20;','&#xA0;' ,'&#X202F;','&#x2003;','&#x2000;','&#x2007;','&#x2001;','&#x2002;','&#x2003;','&#x2004;','&#x2005;','&#x2006;','&#x2007;','&#x2008;','&#x2009;','&#x200A;', '&#x200B;','&#xFEFF;');	#%2C%C2%A0%C2%A0%C2%A0%C2%A0%C2%A0%C2%A0%C2%A0+
		$string = urlencode($string);
		# urlencode spaces
		$ar = array('&nbsp;','%C2%A0');
		$string = str_replace($ar, ' ', $string );				
		$string = preg_replace("/\ +/", ' ', $string);	# eliminate doubles spaces over urlencode string		
		$string = urldecode($string);
		
		# eliminate invisible chars 
		#$string = preg_replace("/\s+/", ' ', $string);
		#$string = preg_replace("/\s/", ' ', $string);
		$string = preg_replace("/\ +/", ' ', $string);				
		
		return $string ;	
	}	
	
	
	
	# fix posible unions between mark and text like 'casa[TAG] or '[TAG]casa'. Insert a space like 'casa [TAG]' or '[TAG] casa'
	public static function adjustSpaceBetweenMarkText($string) {		
		
		$pattern[] 			= TR::get_mark_pattern('indexIn',false);
		$pattern[] 			= TR::get_mark_pattern('indexOut',false);
		$pattern[] 			= TR::get_mark_pattern('tc',false);
		
		$patternIndexIn 	= TR::get_mark_pattern('indexIn',false);
		$patternIndexOut 	= TR::get_mark_pattern('indexOut',false);
		$patternTC		 	= TR::get_mark_pattern('tc',false);
		$patternStrong	 	= TR::get_mark_pattern('strong',false);
		$patternEm	 		= TR::get_mark_pattern('em',false);
		
		$string				= preg_replace("/ {0,2}($patternIndexIn|$patternIndexOut|$patternTC) {0,2}/", "$1", $string);
		/*
		$indexIn 	= TR::get_mark_pattern('indexIn',false);
		$indexOut 	= TR::get_mark_pattern('indexOut',false);
		$tc 		= TR::get_mark_pattern('tc',false);
		
		$string		= preg_replace("/ {0,3}$indexIn {0,3}/", "$1", $string);
		$string		= preg_replace("/ {0,3}$indexOut {0,3}/", "$1", $string);
		$string		= preg_replace("/ {0,3}$tc {0,3}/", "$1", $string);
		*/	
		return($string);
	}


	# trCommonErrors . Devuelve Errores comununes en transcripción
	public static function trCommonErrors($textoFull)
	{
		$html 			= false ;
		$error 			= false ;
		$ar_errorSX 	= array();
		$ar_patterns	= array("[<em>\n<h6>]",
								"[<h6><em>]",
								"[<h6><strong>]",
								"[<strong><h6>]",
								"[<h6><]",
								"[></h6>]",
								"[div>]",
								"[\\\]",
								"[&]"
							  );
		
		foreach($ar_patterns as $pattern)
		{
			if(preg_match($pattern, $textoFull)) $ar_errorSX[] = htmlentities($pattern) ;
		}
		
		if(sizeof($ar_errorSX))
		{ 
			foreach($ar_errorSX as $key => $valor){
				 $error .=  $valor. '<br>' ;				
			}
			$html =  "<span style='color:red'>". substr($error,0,-4) . '</span>';	
		}		
		
		return $html ;
	}	
	
	
	# Info de los TC e Indexaciones de un texto (transcripción)
	public static function trInfo($texto)
	{	  
		$fragmentoFull = $texto ;
		$html = false;
		
		// TC
		$pattern = TR::get_mark_pattern('tc');
		preg_match_all($pattern, $fragmentoFull, $matches);	  	  
		$nTCs = count($matches[0]);	
		
		// INDEX
		$pattern = TR::get_mark_pattern('indexIn');
		preg_match_all($pattern, $fragmentoFull, $matches);
		$nIndex = count($matches[0]);
		
		if($nIndex >0) 	$html .= "<div class='h5div'> Index: $nIndex </div>";
		if($nTCs >0)	$html .= "<div class='h6div'> TC's: $nTCs  </div> "; 
		
		return $html ;
	}
	
	public static function plainText($string, $removeTags=true) {
			
	}
	
	
	# clean text for list
	# prepara el texto para mostrar un extracto en los listados (sin tags ni tc's)	
	public static function limpiezaFragmentoEnListados($string, $tamano=160) {
			
		$string 	= str_replace('<br />',' ', $string);
		
		$string 	= strip_tags($string);	
		
		# eliminamos las marcas de tc e indexación
		$string		= TR::deleteMarks($string, $deleteTC=true, $deleteIndex=true);
		
		# cortamos elegantemente el fragmento
		$string = myTruncate2($string, $tamano, $break=" ", $pad="...");
		
		return $string ;
	}
	
	
	


}
?>