<?php
/**
* FREE_NODE
* Object like free node results
* Every search free row generates an array of audiovisual rows. Each row is a free node
*/
class free_node {



	# Version. Important!
	static $version = "1.0.0"; //12-06-2017


	public $av_section_id; 	// int like 46
	#public $fragments;	// object



	/**
	* GET_INSTANCE
	* Singleton pattern
	* @returns array array of component objects by key
	*//*
	public static function get_free_node_instance( $term_id, $locator, $request_options=null ) {

		if (!isset($locator->section_top_id) || !isset($locator->section_id) || !isset($locator->tag_id)) {
			return false;
		}
		
		return new free_node($term_id, $locator, $request_options);    	
	}//end get_ts_term_instance */
	


	/**
	* __CONSTRUCT
	*/
	public function __construct( $av_section_id, $request_options ) {

		$this->av_section_id = $av_section_id;

		foreach ($request_options as $key => $value) {
			$this->$key = $value;
		}		
	}//end __construct



	/**
	* LOAD_DATA
	* @return bool
	*/
	public function load_data() {

		# INTERVIEW
		# Get interviews that contains this av_section_id as value in json_encoded column 'audiovisual'
		$row_interview_data = self::get_row_interview_data( $this->av_section_id, $this->lang );
		$interview_data_obj = reset($row_interview_data->result);
			#dump($row_interview_data, ' $row_interview_data ++ '.to_string());

		# General info
		foreach ((array)$interview_data_obj as $field_name => $value) {
			if($field_name==='table' || $field_name==='lang' || $field_name==='publication' || $field_name==='images') continue;
			if ($field_name==='section_id') {
				$field_name = 'interview_section_id';
			}
			$this->$field_name = $value;
		}

		# IMAGE_URL
		$this->image_url = $this->get_image_url();

		# Restricted fragments
		$this->ar_restricted_fragments = web_data::get_ar_restricted_fragments( $this->av_section_id );

		# FRAGMENTS
		$FIELD_TRANSCRIPTION = FIELD_TRANSCRIPTION;
		$raw_text 			 = $this->$FIELD_TRANSCRIPTION;
		$q 					 = $this->q;
		$fragments 			 = $this->get_free_fragments( $q, $raw_text );
		$this->fragments 	 = $fragments;


		return true;
	}//end load_data



	/**
	* GET_ROW_INTERVIEW_data
	* @return object rows_data
	*/
	public static function get_row_interview_data( $av_section_id, $lang ) {

		$ar_fields = array('*'); 	//array('section_id',code,title,abstract,country,autonomous_community,province,comarca);
		
		$options = new stdClass();
			$options->table 		 = (string)TABLE_INTERVIEW;
			$options->ar_fields 	 = $ar_fields;
			$options->lang 		 	 = $lang;
			$options->order 		 = null;
			$options->sql_filter 	 = FIELD_AUDIOVISUAL . " LIKE '%\"" . $av_section_id ."\"%' ". PUBLICACION_FILTER_SQL;
			$options->limit 		 = 1;
			# Resolve only some needed portals
			$options->resolve_portals_custom = json_decode('{
				"image" 	:"image",
				"informant" :"informant"
			}');

		$row_interview_data	= (object)web_data::get_rows_data( $options );
			#dump(reset($row_interview_data->result), ' row_interview_data ++ '.to_string($options)); #die();


		return $row_interview_data;
	}//end get_row_interview_data



	/**
	* GET_FREE_FRAGMENTs
	* @return 
	*/
	public function get_free_fragments( $q, $raw_text ) {
		
		$q 			= trim($q);
		$q 			= stripslashes($q);
		$first_char = substr($q, 0, 1);
		$last_char  = substr($q, -1);
			#dump($q, ' q ++ '.to_string());
			#dump($first_char, ' first_char ++ '.to_string());
			#dump($last_char, ' last_char ++ '.to_string());
		switch (true) {
			case ( ($first_char==='\'' && $last_char==='\'') || ($first_char==='"' && $last_char==='"') ) :
				$ar_word = array( substr($q, 1, -1) );
				break;
			case ( strpos($q, " ")!==false ) :
				$ar_word = explode(" ", $q);				
				break;
			default:
				$ar_word = array( $q );
				break;
		}

		# REMOVE_RESTRICTED_TEXT
		$raw_text_sure = web_data::remove_restricted_text( $raw_text, $this->av_section_id );
			#dump($raw_text_sure, ' $raw_text_sure ++ '.to_string()); 
		#$raw_text_sure = $raw_text;

		$delete_options =new stdClass();
			$delete_options->deleteTC 			= false;
			$delete_options->deleteIndex 		= true;
			$delete_options->deleteSvg 			= true;
			$delete_options->deleteGeo 			= true;
			$delete_options->delete_page 		= true;
			$delete_options->delete_person 		= true;
			$delete_options->delete_note   		= true;
			$delete_options->delete_struct 		= true;
			$delete_options->delete_reference 	= true;
		$raw_text_sure = TR::deleteMarks($raw_text_sure, $delete_options); // Force delete  tags 
		$raw_text_sure = html_entity_decode($raw_text_sure);

		$reel_fragments = array();
		foreach ($ar_word as $word) {
			$ar_fragments = $this->find_word_in_text($word, $raw_text_sure, $this->av_section_id, $n_chars=400, $this->apperances_limit, $this->match_select);
				#dump($ar_fragments, ' $ar_fragments ++ '.to_string($word));
			if (is_array($ar_fragments)) {
				$reel_fragments = array_merge($reel_fragments, $ar_fragments);
			}
		}
		#dump($reel_fragments, ' reel_fragments ++ '.to_string());
		
		return $reel_fragments;
	}//end get_free_fragments



	/**
	* FIND_WORD_IN_TEXT
	* Find word in text and return array witch hilighted fragment and associated thesaurus
	* @return array
	*/	
	protected function find_word_in_text($word, $raw_text, $av_section_id, $n_chars, $limit, $match_select=false) {

		$ar_word_fragment = array();

		mb_internal_encoding('UTF-8'); // Set in config

		# We make it an insensitive pattern to accents
		$word_pattern = self::word_to_pattern($word);
			#dump($word_pattern, ' word_pattern ++ '.to_string());
		
		// Remove double returns (<br>)
		$pattern_br	= TR::get_mark_pattern('br',false);
		$raw_text	= preg_replace("/ {0,3}$pattern_br {0,3}($pattern_br|)/", '<br />', $raw_text);
			#dump($raw_text, ' raw_text ++ '.to_string());		
		
		// Use special multibyte configuration of preg_match_all
		$match_capture = self::pregMatchCapture($matchAll=true, $word_pattern, $raw_text, $offset=0);
		#preg_match_all($word_pattern, $raw_text, $match_capture, PREG_OFFSET_CAPTURE, $offset=0);
			#dump($match_capture, ' match_capture ++ '.to_string());
		$mathches = $match_capture;

		$i=1;foreach ((array)$mathches[0] as $key => $ar_value) {
			
			if ($match_select!==false && $i!==(int)$match_select) {
				$i++;
				continue;	// Skip not desired matches
			}

			$word_position  = $ar_value[1];

			$text_before	= mb_substr($raw_text, 0, $word_position);	#dump($text_before, ' text_before ++ '.to_string()); #die();
			$text_after		= mb_substr($raw_text, $word_position);		#dump($text_after, ' text_after ++ '.to_string());

			$fragment_obj = new stdClass();
				$fragment_obj->word  = $word;
				$fragment_obj->match = $i;
		
			# VIDEO FRAGMENT
			if ($this->video_fragment===true) {
				
				# TEXT_BEFORE . Buscamos el último <br /> anterior a word_position en el texto anterior							
					$pInArray 			= self::str_pos_all($text_before,'<br />');
					$n_paragraphs 		= 4 ;
					$inicioParrafoPos 	= isset($pInArray[count($pInArray)-$n_paragraphs-1]) ? $pInArray[count($pInArray)-$n_paragraphs-1] : 0 ;
					$fragment_before 	= mb_substr($text_before, $inicioParrafoPos );
						#dump($fragment_before, ' fragment_before ++ '.to_string());

				# TEXT_AFTER . Buscamos el primer </p> posterior  a palabraPos						
					$pOutArray 			= self::str_pos_all($text_after,'<br />');
					$n_paragraphs 		= 5 ;

					if(isset($pOutArray[$n_paragraphs])) {
						$finalParrafoPos = $pOutArray[$n_paragraphs];
						$fragment_after  = mb_substr($text_after, 0, $finalParrafoPos );
							#dump($fragment_after, ' $fragment_after ++ '.to_string());
					}else{
						$finalParrafoPos = $pOutArray[0];
						$fragment_after  = $text_after; // Full
					}

				# TC . Localizamos los TC apropiados
					# $texto, $indexIN, $inicioPos='', $in_margin=100
					$tcin  = OptimizeTC::optimize_tcIN(  $raw_text, null, (int)$inicioParrafoPos, $in_margin=0 );					
					$tcout = OptimizeTC::optimize_tcOUT( $raw_text, null, (int)$word_position + $finalParrafoPos  ); // -120
					
					#$tcin = '00:49:22.333';
					#$tcin = '00:50:17.157';

				# FRAGMENT
					$fragm = trim($fragment_before . $fragment_after);
					
					# remark_word
					$fragm = free_node::remark_word( $word_pattern, $fragm );

					#$options = new stdClass();
						#$options->deleteTC = true;
						#$options->deleteIndex = true;
					#$fragm = TR::deleteMarks($fragm, $options);
					$fragm = TR::deleteMarks($fragm); // Force delete all tags
					
					# Elimina el primer br del fragment
					if(mb_strpos($fragm,'<br />')===0) 	$fragm = mb_substr($fragm, 6, mb_strlen($fragm));
					# Elimina el último br del fragmento
					if(mb_substr($fragm, mb_strlen($fragm)-6)=='<br />' ) $fragm = mb_substr($fragm, 0, -6);				
				
					
				# FRAGMENT_TERMS . Sacamos todas las indexaciones y tesauros asociados que incluyen a esta palabra				
					#$fragment_terms = self::get_fragment_terms( $av_section_id, $text_before, $text_after, $this->lang );
						#dump( $fragment_terms , " fragment_terms ++++ i:$i key:$key ".to_string($word));

				# URL
					$tcin_secs 	= OptimizeTC::TC2seg($tcin);
					$tcout_secs = OptimizeTC::TC2seg($tcout);
					$video_url 	= $this->video .'?vbegin='.$tcin_secs.'&vend='.$tcout_secs;

				$fragment_obj->video_url  = $video_url;
				$fragment_obj->fragm 	  = $fragm;
				$fragment_obj->tcin_secs  = $tcin_secs;
				$fragment_obj->tcout_secs = $tcout_secs;

			}//end if ($this->video_fragment===true)


			# LIST FRAGMENT
			if ($this->list_fragment===true) {
				$fragm = free_node::format_fagment_for_list( $word_position, $n_chars, $text_before, $text_after );
				# remark_word
				$fragm = free_node::remark_word( $word_pattern, $fragm );
				$fragment_obj->list_fragment = $fragm;	
			}//end if ($this->list_fragment===true)


			# FRAGMENT_TERMS
			if ($this->fragment_terms===true) {
				# FRAGMENT_TERMS . Sacamos todas las indexaciones y tesauros asociados que incluyen a esta palabra				
				$fragment_terms = self::get_fragment_terms( $av_section_id, $text_before, $text_after, $this->lang );
					#dump( $fragment_terms , " fragment_terms ++++ i:$i key:$key ".to_string($word));
				$fragment_obj->terms = (array)$fragment_terms;
			}//end if ($this->fragment_terms===true)


			# Add to fragment object to array
			$ar_word_fragment[] = $fragment_obj;

			if($match_select===false && $i>=$limit) break;

		$i++;}//end foreach ($mathches as $key => $ar_value)
					
		
		return (array)$ar_word_fragment;
	}//end find_word_in_text



	/**
	* FORMAT_FAGMENT_FOR_LIST
	* Build a fragment ready for show in list (without breaks and double spaces..)
	* @return string $fragment
	*/
	public static function format_fagment_for_list( $word_position, $n_chars, $text_before, $text_after ) {
		#$n_chars = $n_chars *2;

		# Remove marks in text_before and calculate length difference
		$text_before_len 	= mb_strlen($text_before);
		$text_before 		= TR::deleteMarks($text_before);
		$text_before_len2 	= mb_strlen($text_before);
		$length_difference 	= ($text_before_len - $text_before_len2);

		// Move word position to new position without tags
		$word_position = $word_position - $length_difference;

		# Definimos la longitud del fragmento a mostrar
		$ajusteNchar = 30;
		$in			 = floor( $word_position - floor($n_chars/2) ) - $ajusteNchar;		if($in<0) $in=0;
		$out		 = $n_chars + ($ajusteNchar*2);
		
		$fragment = $text_before . $text_after;
		# eliminamos las marcas de tc e indexación
		$fragment = TR::deleteMarks($fragment);

		$fragment = mb_substr($fragment, $in, $out);
		#$fragment = TR_public::clean_fragment_in_list($fragment);

		$fragment = str_replace('<br />',' ', $fragment);
		// Clean ALL html tags
		$fragment = strip_tags($fragment);
			

		$fragment = '.. ' . mb_substr($fragment, $ajusteNchar, mb_strlen($fragment)-($ajusteNchar*2)) . ' ..';

		return $fragment;
	}//end format_fagment_for_list



	/**
	* REMARK_WORD
	* Replace word pattern by remarked word in text
	* @return string $string
	*/
	public static function remark_word( $word_pattern, $string ) {
			
		$string = preg_replace($word_pattern, "<mark>$1</mark>", $string);
			#dump($string, ' string ++ '.to_string($word_pattern));
		return $string;
	}//end remark_word



	/**
	* GET_FRAGMENT_TERMS
	* Search index tags intersected with current word position
	* @return 
	*/
	public static function get_fragment_terms( $av_section_id, $fragment_before, $fragment_after, $lang ) {
		#dump($fragment_before, ' fragment_before ++ '.to_string());

		# FRAGMENT AFTER . Find index out tags on fragment_after text. 
		# For speed, is used fragment_after because normally is more short than fragment_before, but the result is the same
		$indexIn_pattern  = TR::get_mark_pattern('indexIn', $standalone=true, $id=false, $data=false);
		$indexOut_pattern = TR::get_mark_pattern('indexOut', $standalone=true, $id=false, $data=false);
			#dump($indexOut_pattern, ' indexOut_pattern ++ '.to_string());

		preg_match_all($indexIn_pattern, $fragment_before, $indexIn_mathches);
			#dump($indexIn_mathches, ' indexIn_mathches ++ '.to_string($indexIn_pattern));

		preg_match_all($indexOut_pattern, $fragment_after, $indexOut_mathches);
			#dump($indexOut_mathches, ' indexOut matches ++ '.to_string($indexOut_pattern));		

		$tag_number_key = 4;
		if (empty($indexIn_mathches[$tag_number_key]) || empty($indexOut_mathches[$tag_number_key])) {
			return array();
		}		
		$ar_indexIn_tag_id 	= $indexIn_mathches[$tag_number_key];
		$ar_indexOut_tag_id = $indexOut_mathches[$tag_number_key];
			#dump($ar_indexIn_tag_id, ' ar_indexIn_tag_id ++ '.to_string());
			#dump($ar_indexOut_tag_id, ' ar_indexOut_tag_id ++ '.to_string());

		$result = array_intersect($ar_indexIn_tag_id, $ar_indexOut_tag_id);
			#dump($result, ' array_intersect result ++ '.to_string());


		# Locator sample: {"section_top_tipo":"oh1","section_top_id":"1","section_tipo":"rsc167","section_id":"1","component_tipo":"rsc36","tag_id":"25"}
		#$TRANSCRIPTION_TIPO 		= TRANSCRIPTION_TIPO;
		#$AUDIOVISUAL_SECTION_TIPO 	= AUDIOVISUAL_SECTION_TIPO;
		$ar_termns = array();
		foreach ($result as $key => $tag_id) {

			$rows_data = web_data::get_indexation_terms( $tag_id, $av_section_id, $lang );
			/*
			$options = new stdClass();
				$options->table 		= (string)TABLE_THESAURUS;
				$options->ar_fields 	= array('term_id',FIELD_TERM);
				$options->lang 			= $lang;
				$options->order 		= null;
				#$options->sql_filter 	= (string)"`index` LIKE '%\"section_id\":\"$av_section_id\",\"component_tipo\":\"$TRANSCRIPTION_TIPO\",\"tag_id\":\"$tag_id\"%'" . PUBLICACION_FILTER_SQL;
			// "type":"dd96","tag_id":"1","section_id":"22","section_tipo":"rsc167","component_tipo":"rsc36","section_top_id":"17","section_top_tipo":"oh1","from_component_tipo":"hierarchy40"
				# {"type":"dd96","tag_id":"10","section_id":"9","section_tipo":"rsc167","component_tipo":"rsc36","section_top_id":"9","section_top_tipo":"oh1","from_component_tipo":"hierarchy40"}
				$options->sql_filter 	= (string)"`indexation` LIKE '%\"type\":\"dd96\",\"tag_id\":\"$tag_id\",\"section_id\":\"$av_section_id\",\"section_tipo\":\"$AUDIOVISUAL_SECTION_TIPO\"%' " . PUBLICACION_FILTER_SQL;

			$rows_data	= (object)web_data::get_rows_data( $options );
				#dump($rows_data, ' rows_data ++ '.to_string($tag_id));
			*/
			foreach ($rows_data->result as $key => $value) {
				$term_id  	= $value['term_id'];
				#if($term_id===TERM_ID_RESTRICTED) continue;
				$term 		= $value[FIELD_TERM];
				$ar_termns[$term_id] = $term;
			}			
		
		}//end if (!empty($indexOut_mathches[0])) foreach ($indexOut_mathches as $key => $value) {
		#dump($ar_termns, ' ar_termns ++ '.to_string($options->sql_filter));

		return $ar_termns;
	}//end get_fragment_terms



	/**
	* Returns array of matches in same format as preg_match or preg_match_all
	* @param bool   $matchAll If true, execute preg_match_all, otherwise preg_match
	* @param string $pattern  The pattern to search for, as string.
	* @param string $subject  The input string.
	* @param int    $offset   The place from which to start the search (in bytes).
	* @return array
	*/
	public static function pregMatchCapture($matchAll, $pattern, $subject, $offset=0) {

		$matchInfo = array();
		$method    = 'preg_match';
		$flag      = PREG_OFFSET_CAPTURE;
		if ($matchAll) {
			$method .= '_all';
		}
		$method($pattern, $subject, $matchInfo, $flag, $offset);
		$result = array();
		if (!empty($matchInfo)) {
			if (!$matchAll) {
				$matchInfo = array($matchInfo);
			}
			foreach ($matchInfo as $matches) {
				$positions = array();
				foreach ($matches as $match) {
					$matchedText   = $match[0];
					$matchedLength = $match[1];
					$positions[]   = array(
						$matchedText,
						mb_strlen(mb_strcut($subject, 0, $matchedLength))
					);
				}
				$result[] = $positions;
			}
			if (!$matchAll) {
				$result = $result[0];
			}
		}

		return $result;
	}//end pregMatchCapture



	/**
	* PALABRA TO PATTERN
	* Convierte la palabra de búsqueda en un patrón insensible a los acentos y mayúsculas
	* @param string $word
	* @return string pattern|false
	*/	
	public static function word_to_pattern( $word ) {
		
		$result = false;
		
		$search	= array("/a|á|à|ä/i", 
						"/e|é|è|ë/i", 
						"/i|í|ì|ï/i", 
						"/o|ó|ò|ö/i", 
						"/u|ú|ù|ü/i",
						"/n|ñ/i"
						) ;
		$repace	= array("(a|á|Á|à|À|ä|Ä)", 
						"(e|é|É|è|È|ë|Ë)",
						"(i|í|Í|ì|Ì|ï|Ï)", 
						"(o|ó|Ó|ò|Ò|ö|Ö)",
						"(u|ú|Ú|ù|Ù|ü|Ü)",
						"(ñ|Ñ|n|N)"
						) ;
		
		$pattern = preg_replace($search, $repace, $word);
		
		if($pattern) $result = '/('. $pattern .')/i' ;
		
		return $result;
	}//end word_to_pattern



	/** 
	* STR_POS_ALL				
	*  Find all occurrences of a needle in a haystack
	*  @param string $haystack
	*  @param string $needle
	*  @return array or false 
	*/
	public static function str_pos_all($haystack,$needle) {
	 
		  $s=0;
		  $i=0;	 
		  while (is_integer($i)){		 
			  $i = mb_strpos($haystack,$needle,$s);		 
			  if (is_integer($i)) {
				  $aStrPos[] = $i;
				  $s = $i+mb_strlen($needle);
			  }
		  }
		  if (isset($aStrPos)) {
			  return $aStrPos;
		  }
		  else {
			  return false;
		  }
	}//end str_pos_all



	/**
	* GET_IMAGE_URL
	* @return string 
	*/
	public function get_image_url() {
	
		$image_url = null;	//'../images/bg_foto_search_free.png'; // Default

		switch (true) {
			case (isset($this->image_type) && $this->image_type==='identify_image'):
				# IDENTIFY_IMAGE
				if (isset($this->image[0])) {
					$identify_image_url = $this->image[0][FIELD_IMAGE];
					$image_url = $identify_image_url;
				}				
				break;
			
			case (isset($this->image_type) && $this->image_type==='posterframe'):
			default:
				# POSTERFRAME
				$path = DEDALO_MEDIA_BASE_URL . DEDALO_AV_FOLDER .'/posterframe/'; // __CONTENT_BASE_URL__ .
				$name = DEDALO_COMPONENT_RESOURCES_AV_TIPO .'_'. AUDIOVISUAL_SECTION_TIPO .'_'. $this->av_section_id .'.'.DEDALO_AV_POSTERFRAME_EXTENSION; 
				$image_url = $path . $name;
				break;
		}

		return $image_url;
	}//end get_image_url

	

}//end class free_node
?>