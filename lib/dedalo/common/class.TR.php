<?php
/**
* TR
* Da servicio a las transcripciones (component_text_area) pero también a las partes públicas.
* Esta clase es genérica y debe servir también para las partes públicas.
* Cuando se use fuera de Dédalo, copiar este fichero.
* Para poder aprovechar las mejoras y corrección de errores del desarrollo de Dédalo, llevar control de versión de esta clase
*/
abstract class TR {



	# Version. Important!
	static $version = "1.0.6"; // 14-08-2017
	
	# html_tags_allowed (note that now is not used to save data)
	static $html_tags_allowed = '<strong><em><br><br /><img><p>'; // <strong><em><br><img><p><h5><h6><ul><ol><li>


	
	/**
	* GET_MARK_PATTERN
	* Get unified patterns for marks
	*/
	public static function get_mark_pattern($mark, $standalone=true, $id=false, $data=false, $state=false) {
		
		switch($mark) {

			# TC . Select timecode from tag like '00:01:25.627'
			case 'tc' :
					$string = "(\[TC_([0-9]{1,2}:[0-9]{1,2}:[0-9]{1,2}(\.[0-9]{1,3})?)_TC\])";					
					break;			
					
			# TC_FULL . Select complete tag like '[TC_00:01:25.627_TC]'
			case 'tc_full' :
					$string = "(\[TC_[0-9]{1,2}:[0-9]{1,2}:[0-9]{1,2}\.[0-9]{1,3}_TC\])";
					break;

			# TC_VALUE . Select elements from value tc like '00:01:25.627'. Used by OptimizeTC
			case 'tc_value' :
					$string = "([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2})(\.([0-9]{1,3}))?";
					break;

			/* PROPOSAL TO VERSION 4.7
			case 'tc2' :
					if ($id) {
						$string = "\[tc2-[a-z]-{$id}-.{0,22}-data:.*?:data\]";
					}else{					
						$string = "(\[(tc2)-([a-z]{1})-([0-9]{1,6})-(.{0,22})-data:([0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,3})?):data\])";
					}
					break;*/

			# INDEX
			case 'index' :
					if ($id!==false) {
						$string = "\[\/{0,1}index-[a-z]-{$id}(-[^-]{0,22}-data:.*?:data)?\]";
					}elseif ($state!==false) {
						$string = "\[\/{0,1}(index)-{$state}-([0-9]{1,6})(-([^-]{0,22})-data:(.*?):data)?\]";
					}else{
						$string = "\[\/{0,1}(index)-([a-z])-([0-9]{1,6})(-([^-]{0,22})-data:(.*?):data)?\]";
					}
					break;
					
			case 'indexIn' :
					if ($id) {
						$string = "(\[index-[a-z]-{$id}(-[^-]{0,22}-data:.*?:data)?\])";
					}else{
						$string = "(\[(index)-([a-z])-([0-9]{1,6})(-([^-]{0,22})-data:(.*?):data)?\])";
					}
					break;

			case 'indexOut':
					if ($id) {
						$string = "(\[\/index-[a-z]-{$id}(-[^-]{0,22}-data:.*?:data)?\])";
					}else{
						$string = "(\[\/(index)-([a-z])-([0-9]{1,6})(-([^-]{0,22})-data:(.*?):data)?\])";
					}
					break;

			# STRUCT
			case 'struct' :
					if ($id) {
						$string = "\[\/{0,1}struct-[a-z]-{$id}(-[^-]{0,22}-data:.*?:data)?\]";
					}elseif ($state!==false) {
						$string = "\[\/{0,1}(struct)-{$state}-([0-9]{1,6})(-([^-]{0,22})-data:(.*?):data)?\]";			
					}else{
						$string = "\[\/{0,1}(struct)-([a-z])-([0-9]{1,6})(-([^-]{0,22})-data:(.*?):data)?\]";
					}
					break;

			case 'structIn' :
					if ($id) {
						$string = "(\[struct-[a-z]-{$id}(-[^-]{0,22}-data:.*?:data)?\])";
					}else{
						$string = "(\[(struct)-([a-z])-([0-9]{1,6})(-([^-]{0,22})-data:(.*?):data)?\])";
					}
					break;

			case 'structOut' :
					if ($id) {
						$string = "(\[\/struct-[a-z]-{$id}(-[^-]{0,22}-data:.*?:data)?\])";
					}else{
						$string = "(\[\/(struct)-([a-z])-([0-9]{1,6})(-([^-]{0,22})-data:(.*?):data)?\])";
					}
					break;

			# REFERENCE
			case 'reference' :
					if ($id) {
						$string = "\[\/{0,1}reference-[a-z]-{$id}(-[^-]{0,22}-data:.*?:data)?\]";
					}else{
						$string = "\[\/{0,1}(reference)-([a-z])-([0-9]{1,6})(-([^-]{0,22})-data:(.*?):data)?\]";
					}
					break;

			case 'referenceIn' :
					if ($id) {
						$string = "(\[reference-[a-z]-{$id}(-[^-]{0,22}-data:.*?:data)?\])";
					}else{
						$string = "(\[(reference)-([a-z])-([0-9]{1,6})(-([^-]{0,22})-data:(.*?):data)?\])";
					}
					break;

			case 'referenceOut' :
					if ($id) {
						$string = "(\[\/reference-[a-z]-{$id}(-[^-]{0,22}-data:.*?:data)?\])";
					}else{
						$string = "(\[\/(reference)-([a-z])-([0-9]{1,6})(-([^-]{0,22})-data:(.*?):data)?\])";
					}
					break;

			# SVG
			case 'svg' :
					if ($id) {
						$string = "(\[svg-[a-z]-{$id}(-[^-]{0,22}-data:.*?:data)?\])";
					}else{
						$string = "(\[(svg)-([a-z])-([0-9]{1,6})(-([^-]{0,22}))?-data:(.*?):data\])";
					}
					break;

			# GEO
			case 'geo' :
					if ($id) {
						$string = "(\[geo-[a-z]-{$id}(-[^-]{0,22}-data:.*?:data)?\])";
					}else{
						$string = "(\[(geo)-([a-z])-([0-9]{1,6})(-([^-]{0,22}))?-data:(.*?):data\])";	
					}
					break;			

			# PAGE (pdf) [page-n-3]
			case 'page' :
					if ($id) {
						$string = "\[page-[a-z]-{$id}(-[^-]{0,22}-data:.*?:data)?\]";
					}else{
						$string = "(\[(page)-([a-z])-([0-9]{1,6})(-([^-]{0,22})-data:(.*?):data)?\])";
					}
					break;

			# PERSON (transcription spoken person) like [person-a-number-data:{"section_tipo":"dd15","section_id":"5"}:data]
			case 'person' :
					if ($id) { // id is pseudo locator as dd35_oh1_52 (section_tipo section_id)
						$string = "(\[person-[a-z]-{$id}(-[^-]{0,22}-data:.*?:data)?\])";
					}else{
						$string = "(\[(person)-([a-z])-([0-9]{0,6})-([^-]{0,22})-data:(.*?):data\])";
					}
					break;			

			# NOTE (transcription annotations) like [note-n-number-data:{"section_tipo":"dd15","section_id":"5"}:data]
			case 'note' :
					if ($id) { // id is pseudo locator as dd35_oh1_52 (section_tipo section_id)						
						$string = "(\[note-[a-z]-{$id}(-[^-]{0,22}-data:.*?:data)?\])";
					}else if($state!==false){
						$string = "(\[(note)-($state)-([0-9]{1,6})(-([^-]{0,22}))?-data:(.*?):data\])";
						}else{
							$string = "(\[(note)-([a-z])-([0-9]{1,6})(-([^-]{0,22}))?-data:(.*?):data\])";
						}
					break;

			# OTHERS
			case 'br' :
					$string = '\<br>';
					break;

			case 'strong' :	
					#$string = '(\<strong\>|\<\/strong\>)';
					$string = '(\<\/?strong\>)';
					break;

			case 'em' :		
					#$string = '(\<em\>|\<\/em\>)';
					$string = '(\<\/?em\>)';
					break;

			case 'apertium-notrans' :
					$string = '(\<apertium-notrans\>|\<\/apertium-notrans\>)';
					break;

			default :
					throw new Exception("Error Processing Request. Error: mark: '$mark' is not valid !", 1);
		}
		
		# default mark have in and out slash (pattern standalone)
		if($standalone) $string = '/'.$string.'/';
		
		
		return $string;
	}//end get_mark_pattern



	/**
	* ADDTAGIMGONTHEFLY
	* Convert Dédalo tags like index, tc, etc. to images
	*/
	public static function addTagImgOnTheFly($text, $request_options=null) {

		#$hilite=false, $indexEditable=false, $tcEditable=true, $svgEditable=true, $geoEditable=true, $pageEditable=true,  $personEditable=true

		# Temporal (for catch old calls only)
		if (is_bool($request_options)) {
			throw new Exception("Error. Only a object is valid for addTagImgOnTheFly options. Update your call to new format please", 1);			
		}

		$options = new stdClass();
			$options->hilite 			= false;
			$options->indexEditable 	= false;
			$options->tcEditable 		= false;
			$options->svgEditable 		= false;
			$options->geoEditable 		= false;
			$options->pageEditable 		= false;
			$options->personEditable 	= false;
			$options->noteEditable 		= false;
			$options->struct_as_labels	= false;
			if (is_object($request_options)) {
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}
			}
		
		# Hilite		
		if($options->hilite===true) {
			$codeHiliteIn	= "<span class=\"hilite\">";
			$codeHiliteOut	= "</span>";
		}else{
			$codeHiliteIn	= '';
			$codeHiliteOut	= '';
		}	
						
		# url path to php script thats render image
		$btn_url = '../../../inc/btn.php';
		if(defined('TR_TAGS_CDN')) {
			#$btn_url ='http://192.168.0.7:7070/dedalo4/inc/btn.php';
			$btn_url = TR_TAGS_CDN;
		}


		# INDEX IN
		$pattern 	= TR::get_mark_pattern('indexIn'); // id,state,label,data
		$text		= preg_replace($pattern, "<img id=\"[$2-$3-$4-$6]\" src=\"{$btn_url}/[$2-$3-$4-$6]\" class=\"index\" data-type=\"indexIn\" data-tag_id=\"$4\" data-state=\"$3\" data-label=\"$6\" data-data=\"$7\">" , $text);
		#$text		= preg_replace($pattern, "<img id=\"[$2-$3-$4-$6]\" src=\"\" class=\"index\" data-type=\"indexIn\" data-tag_id=\"$4\" data-state=\"$3\" data-label=\"$6\" data-data=\"$7\">" , $text);

		# INDEX OUT
		$pattern 	= TR::get_mark_pattern('indexOut');		
		$text		= preg_replace($pattern, "<img id=\"[/\$2-$3-$4-$6]\" src=\"{$btn_url}/[/\$2-$3-$4-$6]\" class=\"index\" data-type=\"indexOut\" data-tag_id=\"$4\" data-state=\"$3\" data-label=\"$6\" data-data=\"$7\">", $text);
		#$text		= preg_replace($pattern, "<img id=\"[$2-$3-$4-$6]\" src=\"\" class=\"index\" data-type=\"indexIn\" data-tag_id=\"$4\" data-state=\"$3\" data-label=\"$6\" data-data=\"$7\">" , $text);

		# STRUCT IN
		$pattern 	= TR::get_mark_pattern('structIn');
		if ($options->struct_as_labels===true) {
			$text	= preg_replace($pattern, "<div class=\"structuration_label stl_in\">structuration $4</div>", $text);
		}else{
			// <section class="section_struct text_unselectable" id="section_2" data-state="n" data-label="" data-data="{'section_tipo':'rsc370','section_id':'3'}">
			$text	= preg_replace($pattern, "<section id=\"section_$4\" class=\"section_struct text_selectable text_unselectable\" data-type=\"struct\" data-tag_id=\"$4\" data-state=\"$3\" data-label=\"$6\" data-data=\"$7\">" , $text);
		}
		
		# STRUCT OUT
		$pattern 	= TR::get_mark_pattern('structOut');
		if ($options->struct_as_labels===true) {
			$text		= preg_replace($pattern, "<div class=\"structuration_label stl_out\"> /structuration $4</div>", $text);
		}else{
			$text		= preg_replace($pattern, "</section>", $text);
		}		

		# REFERENCE IN
		$pattern 	= TR::get_mark_pattern('referenceIn');
		// <reference class="reference" id="reference_2" data-state="n" data-label="" data-data="{'section_tipo':'rsc370','section_id':'3'}">
		$text		= preg_replace($pattern, "<reference id=\"reference_$4\" class=\"reference\" data-type=\"reference\" data-tag_id=\"$4\" data-state=\"$3\" data-label=\"$6\" data-data=\"$7\">" , $text);

		# REFERENCE OUT
		$pattern 	= TR::get_mark_pattern('referenceOut');
		$text		= preg_replace($pattern, "</reference>", $text);

		# TC
		$pattern 	= TR::get_mark_pattern('tc'); //[TC_00:00:25.091_TC]
		/*		
		$text		= preg_replace_callback(
            $pattern,
            function($matches) {
            	#dump($matches, ' matches ++ '.to_string());            	
            	$_1 = $matches[1];
            	$_2 = $matches[2];
            	$id = 'tc_'.str_replace(array(':','.'),'_', $_2);
            	$a = "<img id=\"$id\" src=\"\" class=\"tc\" data-type=\"tc\" data-tag_id=\"$_1\" data-state=\"n\" data-label=\"$_2\" data-data=\"$_2\">";
				#dump($a, ' a ++ '.to_string());
            	return $a;
            },
            $text);*/
		#$text		= preg_replace($pattern, "<img id=\"$2\" src=\"\" class=\"tc\" data-type=\"tc\" data-tag_id=\"$1\" data-state=\"n\" data-label=\"$2\" data-data=\"$2\">", $text);
		$text		= preg_replace($pattern, "<img id=\"$1\" src=\"{$btn_url}/$1\" class=\"tc\" data-type=\"tc\" data-tag_id=\"$1\" data-state=\"n\" data-label=\"$2\" data-data=\"$2\">", $text);

		# TC2
		#$pattern 	= TR::get_mark_pattern('tc2');
		#$text		= preg_replace($pattern, "<img id=\"[TC_$6_TC]\" src=\"{$btn_url}/[TC_$6_TC]\" class=\"tc2\" data-type=\"tc2\" data-tag_id=\"$4\" data-state=\"$3\" data-label=\"$5\" data-data=\"$6\">", $text);
		
		# SVG
		$pattern 	= TR::get_mark_pattern('svg');
		#$text		= preg_replace($pattern, "<img id=\"$1\" src=\"{$btn_url}/$1\" class=\"svg\" />$codeHiliteOut", $text);
		$text		= preg_replace($pattern, "<img id=\"[$2-$3-$4-$6]\" src=\"{$btn_url}/[$2-$3-$4-$6]\" class=\"svg\" data-type=\"svg\" data-tag_id=\"$4\" data-state=\"$3\" data-label=\"$6\" data-data=\"$7\">", $text);

		# GEO
		$pattern 	= TR::get_mark_pattern('geo');
		#$text		= preg_replace($pattern, "<img id=\"$1\" src=\"{$btn_url}/$1\" class=\"geo\" />$codeHiliteOut", $text);
		$text		= preg_replace($pattern, "<img id=\"[$2-$3-$4-$6]\" src=\"{$btn_url}/[$2-$3-$4-$6]\" class=\"geo\" data-type=\"geo\" data-tag_id=\"$4\" data-state=\"$3\" data-label=\"$6\" data-data=\"$7\">", $text);
		
		# PAGE
		$pattern 	= TR::get_mark_pattern('page');
		$text		= preg_replace($pattern, "<img id=\"[$2-$3-$4-$6]\" src=\"{$btn_url}/[$2-$3-$4-$6]\" class=\"page\" data-type=\"page\" data-tag_id=\"$4\" data-state=\"$3\" data-label=\"$6\" data-data=\"$7\">", $text);

		# PERSON
		$pattern 	= TR::get_mark_pattern('person'); // $string = "(\[person-([a-z])-(.+)-data:.*?:data\])";
		$text		= preg_replace($pattern, "<img id=\"[$2-$3-$4-$5]\" src=\"{$btn_url}/[$2-$3-$4-$5]\" class=\"person\" data-type=\"person\" data-tag_id=\"$4\" data-state=\"$3\" data-label=\"$5\" data-data=\"$6\">", $text);
		#$text		= preg_replace($pattern, "<img id=\"[$2-$3-$4-$5]\" src=\"{$btn_url}/[$2-$3-$4-$5]\" class=\"person\" data-type=\"person\" data-tag_id=\"$4\" data-state=\"$3\" data-label=\"$5\" data-data=\"$6\">", $text);

		# NOTE
		$pattern 	= TR::get_mark_pattern('note'); // $string = "(\[note-([a-z])-(.+)-data:.*?:data\])";
		$text		= preg_replace($pattern, "<img id=\"[$2-$3-$4-$6]\" src=\"{$btn_url}/[$2-$3-$4-$6]\" class=\"note\" data-type=\"note\" data-tag_id=\"$4\" data-state=\"$3\" data-label=\"$6\" data-data=\"$7\">", $text);
		#$text		= preg_replace($pattern, "<img id=\"[$2-$3-$4-$6]\" src=\"\" class=\"note\" data-type=\"note\" data-tag_id=\"$4\" data-state=\"$3\" data-label=\"$6\" data-data=\"$7\">", $text);
			
		return (string)$text;
	}//end addTagImgOnTheFly



	/**
	* ADDBABELTAGSONTHEFLY
	* Set an array of tags to preserve in translation and wrap it into appertium notrans tags
	* @return string
	*/
	public static function addBabelTagsOnTheFly($text) {

		$ar_tags = array('indexIn',
						 'indexOut',
						 'structIn',
						 'structOut',
						 'tc',
						 'svg',
						 'geo',
						 'page',
						 'person',
						 'note',
						 'reference',
						 //'strong','em',
			);
		foreach ($ar_tags as $tag) {
			$pattern 	= TR::get_mark_pattern($tag);
			#$text		= preg_replace($pattern, "<apertium-notrans>$1</apertium-notrans>", $text);
			$text		= preg_replace($pattern, "<apertium-notrans>$0</apertium-notrans>", $text);
			#if ($tag=='reference') {
			#	dump($text, ' text ++ pattern: '.to_string($pattern));
			#}
		}
		

		return $text;
	}//end addBabelTagsOnTheFly



	/**
	* DELETEMARKS
	* clean text to translate	
	*/
	public static function deleteMarks($string, $request_options=null) {

		# Temporal (for catch old calls only)
		if (is_bool($request_options)) {
			throw new Exception("Error. Only a object is valid for delete marks options. Update your call to new format please", 1);			
		}

		$options = new stdClass();
			$options->deleteTC 			= true;
			$options->deleteIndex 		= true;
			$options->deleteSvg 		= true;
			$options->deleteGeo 		= true;
			$options->delete_page 		= true;
			$options->delete_person 	= true;
			$options->delete_note   	= true;
			$options->delete_struct 	= true;
			$options->delete_reference 	= true;
			if (is_object($request_options)) {
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}
			}
			
			
		# TC clear
		if($options->deleteTC===true) {
			$pattern = TR::get_mark_pattern('tc');
			$string = preg_replace($pattern, '', $string);	# elliminar los TC
		}
		
		# Index clear
		if($options->deleteIndex===true) {
			$pattern 	= TR::get_mark_pattern('index');
			$string 	= preg_replace($pattern, '', $string);
		}

		# Svg clear
		if($options->deleteSvg===true) {
			$pattern 	= TR::get_mark_pattern('svg');
			$string 	= preg_replace($pattern, '', $string);
		}

		# Geo clear
		if($options->deleteGeo===true) {
			$pattern 	= TR::get_mark_pattern('geo');
			$string 	= preg_replace($pattern, '', $string);
		}

		# Page clear
		if($options->delete_page===true) {
			$pattern 	= TR::get_mark_pattern('page');
			$string 	= preg_replace($pattern, '', $string);
		}

		# Person clear
		if($options->delete_person===true) {
			$pattern 	= TR::get_mark_pattern('person');
			$string 	= preg_replace($pattern, '', $string);
		}

		# Note clear
		if($options->delete_note===true) {
			$pattern 	= TR::get_mark_pattern('note');
			$string 	= preg_replace($pattern, '', $string);
		}

		# struct clear
		if($options->delete_struct===true) {
			$pattern 	= TR::get_mark_pattern('struct');
			$string 	= preg_replace($pattern, '', $string);
		}

		# references clear
		if($options->delete_reference===true) {
			$pattern 	= TR::get_mark_pattern('reference');
			$string 	= preg_replace($pattern, '', $string);
		}		
	

		return $string ;
	}//end deleteMarks



	/**
	* BUILD_TAG
	* Create a normalized tag (only index tags are defined now) from params
	* @see component_text_area::change_tag_state()
	* @return string $tag
	*/
	public static function build_tag($type, $state, $id, $label, $data) {

		# Safe data for json
		if(!is_string($data)) $data = json_encode($data);
		$data = str_replace('"', "'", $data);
		
		switch ($type) {
			case 'indexIn':
				$tag = '[index-'.$state.'-'.$id.'-'.$label.'-data:'.$data.':data]';
				break;
			case 'indexOut':
				$tag = '[/index-'.$state.'-'.$id.'-'.$label.'-data:'.$data.':data]';
				break;
			case 'structIn':
				$tag = '[struct-'.$state.'-'.$id.'-'.$label.'-data:'.$data.':data]';
				break;
			case 'structOut':
				$tag = '[/struct-'.$state.'-'.$id.'-'.$label.'-data:'.$data.':data]';
				break;
			case 'person':
				$tag = '[person-'.$state.'-'.$id.'-'.$label.'-data:'.$data.':data]';
				break;
			default:
				throw new Exception("Error Processing Request. Unimplemented build_tag of type: ".to_string($type), 1);
				break;
		}
		#dump($tag, ' tag ++ '.to_string());

		return $tag;
	}//end build_tag



	/**
	* MATCH_PATTERN_INDEX_FROM_TAG
	*/
	public static function match_pattern_index_from_tag( $tag, $type='index' ) {

		$pattern = TR::get_mark_pattern($mark=$type, $standalone=false);

		if(preg_match_all("/$pattern/", $tag, $matches, PREG_PATTERN_ORDER)) {

			#dump($matches,'$matches',"tag: $tag");
			return $matches;
		}
	}//end match_pattern_index_from_tag


	
	# TAG2TYPE
	public static function tag2type($tag) {

		$match_pattern 	= TR::match_pattern_index_from_tag($tag);
		$type 			= $match_pattern[1][0];

		return $type;
	}
	# TAG2STATE
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
	# CONVERT tag to label
	public static function tag2label($tag) {

		$match_pattern 	= TR::match_pattern_index_from_tag($tag);
		$value 			= $match_pattern[5][0];
		
		return (string)$value;
	}//end tag2label
	/**
	* TAG2DATA
	* Convert tag to data
	* @param string $tag
	*	Complete tag string like [index-n-7-Label-data:{'key':'value'}:data]
	* @return object | null
	*	Try to parse json data as object. If not is possible parse, return null
	*/
	public static function tag2data($tag, $type='index') {

		$match_pattern 		= TR::match_pattern_index_from_tag($tag, $type);
		$string 			= $match_pattern[6][0];
		#$value_string		= preg_replace("'", '"', $string);
		$value_string		= str_replace("'", '"', $string);
		$value 				= json_decode($value_string);
		
		return $value;		
	}//end tag2data
	


	/**
	* CONVERTDIV2BR
	* CONVERT DIVS (div) TO <br />
	*/
	private static function convertDiv2br($text) {
		
		$text = str_replace('<div>','', $text);
		$text = str_replace('</div>',"<br>\n", $text);
				
		return $text ;	
	}//end convertDiv2br



	/**
	* CREATE_TEXT_EDITOR_IMAGE_FROM_TAG
	* Create a usable in text editor image from tag
	* @return string
	*/
	public static function create_text_editor_image_from_tag( $tag, $type ) {

		switch ($type) {
			case 'index':
				$img = "<img id=\"$tag\" src=\"../../../inc/btn.php/$tag\" class=\"index mceNonEditable\" data-mce-src=\"../../../inc/btn.php/$tag\">";
				break;
			case 'tc':
				$img = "<img id=\"$tag\" src=\"../../../inc/btn.php/$tag\" class=\"tc\" data-mce-src=\"../../../inc/btn.php/$tag\">";
				break;
			default:
				trigger_error("Sorry. Type ($type) is not defined");
				break;
		}
		
		return $img;
	}//end create_text_editor_image_from_tag


	
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
		$string		= strip_tags($string, TR::$html_tags_allowed);	// '<strong><em><br><img><p><h5><h6>'
		
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
		
		/*
		# <br />[indexOut]<br />	-->	<br />[indexOut]
		$string		= preg_replace("/$patternBr {0,2}($patternIndexOut) {0,2}$patternBr/", "$1<br />", $string);
		
		# <br />[indexIn]<br />	-->	[indexIn]<br />
		$string		= preg_replace("/$patternBr {0,2}($patternIndexIn) {0,2}$patternBr/", "<br />$1", $string);
		
		
		# EXPERIMENTAL ..
		# br
		$string	= preg_replace("/ {0,3}$patternBr {0,3}($patternBr|)/", '<br />', $string);
		*/
		
		# develop control					
		#$string		= "V3 CONVERTED ($today) !!!!!!!!!!!!!!  <br />".$string ;
		
		return($string) ;
	}



	/**
	* PREPROCESS_TEXT_TO_SAVE
	* @return string $string_clean
	*//*
	public function preprocess_text_to_save( $string ) {
		$string_clean = $string;

			dump($string, ' string ++ '.to_string());
		return $string_clean;
	}//end preprocess_text_to_save
	*/


	
	#
	# Limpieza del POST del formulario de TR transcripción
	# Temporalmente habilitamos la función de formateo de TC's para Gerard
	#
	public static function limpiezaPOSTtr($string) {
		
		# strip slashes (need for text received from tinyMCE)	
		$string	= trim(stripslashes($string));

		return $string;

		// No more regex here 17-03-2017

	}//end limpiezaPOSTtr
	
	

	# cleanTexGarbage V3
	public static function cleanTexGarbage_DEPRECATED($string) {
		
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
	public static function cleanTexGarbageV2_DEPRECATED($string) {
		
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

	#Change the format for TC to TC with ms
	public static function formatTC_to_TCms($string)
	{
		# Especific code for old transcriptions TC convert like [TC_01:25:11_TC] to [TC_01:25:11.332_TC]
		#
		$pattern 	= '/([0-9][0-9]):([0-9][0-9]):([0-9][0-9])/' ;
		$string 	= addslashes( preg_replace($pattern, '$1:$2:$3.000', stripslashes($string) ) );
		$string 	= stripslashes($string) ;
			
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
	public static function limpiezaFragmentoEnListados(&$string, $limit=160) {
		#dump( debug_backtrace() );
		# dump($string, ' string ++ '.to_string());	
		$string = str_replace('<br />',' ', $string);
		
		// Clean ALL html tags
		$string = strip_tags($string);	
		
		# eliminamos las marcas de tc e indexación
		$string	= TR::deleteMarks($string);
		
		# cortamos elegantemente el fragmento
		return self::truncate_text($string, $limit, $break=" ", $pad="...");		
	}
	
	
	/**
	* TRUNCATE_TEXT
	* 
	*/
	public static function truncate_text( $string, $limit, $break=" ", $pad="...") {

	  # return with no change if string is shorter than $limit
	  if(strlen($string) <= $limit) return $string;

	  $string = substr($string, 0, $limit);
	  if( false !== ($breakpoint = strrpos($string, $break)) ) {
		$string = substr($string, 0, $breakpoint);
	  }

	  return $string . $pad;
	}



	/**
	* GET_CHARS_INFO
	* @return object $chars_info
	*/
	public static function get_chars_info( $raw_text ) {

		$chars_info = new stdClass();

		#
		# CLEAN TEXT
		$text_clean = $raw_text;
		# clean text
		$text_clean = trim($text_clean);
		#$text_clean = htmlspecialchars_decode($text_clean);
		# Remove Dédalo marks
		$text_clean = TR::deleteMarks($text_clean);
		# Remove html tags like strong, br, etc.				
		$text_clean = strip_tags($text_clean);	
		# Decode special html chars 	
		#$text_clean = html_entity_decode($text_clean);
		$text_clean = htmlspecialchars_decode($text_clean);

		$text_clean = str_replace(array("&nbsp;")," ",$text_clean);


		# COUNT TOTAL_CHARS
		$chars_info->total_chars  = mb_strlen($text_clean,'UTF-8'); 	#dump($total_chars, ' $total_chars ++ '.to_string());		
					
		# Remove spaces and breaks
		$text_clean = str_replace(array("&nbsp;"," ","\n"),"",$text_clean);
		#$text_clean = preg_replace("/\s/", "", $text_clean);#  &nbsp;
		
		# COUNT total_chars_no_spaces
		$chars_info->total_chars_no_spaces = mb_strlen($text_clean,'UTF-8'); #dump($total_chars_no_spaces, ' $total_chars_no_spaces ++ '.to_string());
		

		return (object)$chars_info;
	}//end get_chars_info



	/**
	* GET_TAGS_OF_TYPE_IN_TEXT
	* @return array $ar_tags_of_type
	*/
	public static function get_tags_of_type_in_text($raw_text, $ar_tag_types) {
		
		$ar_tags_of_type = array();

		foreach ((array)$ar_tag_types as $key => $type) {

			$tag_pattern = TR::get_mark_pattern($type);
			preg_match_all($tag_pattern,  $raw_text,  $matches, PREG_PATTERN_ORDER);
				#dump($matches, ' matches ++ '.to_string($type));

			foreach ($matches[0] as $key => $tag) {

				$obj = array(
							"type" => $type,
							"tag"  => $tag
							);
				$ar_tags_of_type[] = (object)$obj;
			}
			
		}


		return $ar_tags_of_type;
	}//end get_tags_of_type_in_text


}
?>