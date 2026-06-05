<?php declare(strict_types=1);
/**
* BIBLIO
* This class comes from MIB web biblio template and is a fast feature to allow get large bibliograpy text fragments.
* The problem is that the bibliographical records text is huge (millions of characters) and transfering it to the client
* is not a good idea. This class allows to search for bibliographical records by the id and the string to search.
*/
class biblio {



	/**
	* BUILD_FRAGMENT
	* Create fragments with highlighted words.
	* @param object $request_options
	* @return array $result
	*/
	public static function build_fragment( object $request_options ) : array {

		$options = new stdClass();
			$options->text			  = (string)'';
			$options->search		  = (string)'';
			$options->max_chars		  = (int)256; // Default 256
			$options->max_occurrences = (int)1; // Only first occurrence for now

			foreach ($request_options as $key => $value) {
				if (property_exists($options, $key)) {
					$options->$key = $value;
				}
			}

		$text			= $options->text;
		$search			= $options->search;
		$max_chars		= $options->max_chars;
		$max_occurrences	= $options->max_occurrences;

		$word_fragments_array = [];

		# Clean text (remove TCs, etc.) keep indexes
		$text = self::delete_marks($text);

		# clean $search
		$search 	= self::clean_search_string($search);

		# Check if the entire search is a quoted literal phrase
		$pre = substr($search,0,1);
		$pos = substr($search,-1);
		if( ($pre=='"' || $pre=='\'') && ($pos=='"' || $pos=='\'') ) {
			# Remove quotes and treat as single word
			$search = substr($search,1); 			# the initial
			$search = substr($search,0,-1); 		# the final
			$search = '\b'.$search.'\b';			# add /b for create regex (\b = Any word boundary)
			$words_array = [$search];
		}else{
			$words_array = (array)explode(' ',$search); # Always is array ..
		}

		# utf problem. PHP doesn't handle multibyte text well, so we convert to ISO8859-1 to work and re-encode as UTF-8 at the end
		$text_iso = mb_convert_encoding($text, 'ISO-8859-1', 'UTF-8');

		foreach($words_array as $key => $current_word) {

			$current_word = trim($current_word);

			# If the word itself is quoted (e.g. from multi-word search like: word1 "word2")
			$pre = substr($current_word,0,1);
			$pos = substr($current_word,-1);
			if( ($pre=='"' || $pre=='\'') && ($pos=='"' || $pos=='\'') ) {
				$current_word = substr($current_word,1); 		# the initial
				$current_word = substr($current_word,0,-1); 	# the final
				$current_word = '\b'.$current_word.'\b';		# add /b for create regex (\b = Any word boundary)
			}

			# Convert to accent-insensitive pattern
			$word_pattern = self::word2pattern($current_word);
			$word_pattern	= mb_convert_encoding($word_pattern, 'ISO-8859-1', 'UTF-8');

			# Locate all occurrences of the word [NO MULTIBYTE SUPPORT!!!]
			preg_match_all($word_pattern, $text_iso, $matches, PREG_OFFSET_CAPTURE);

			$i=0;
			if(is_array($matches[0])) foreach($matches[0] as $key => $ar_data) {

				if ($i>=$max_occurrences) {
				 	break;	// Limit number of events / occurrences
				 }

				$word_pos = $ar_data[1];

				# Define the length of the fragment to display
				$out	= $max_chars ;
				$in		= intval( $word_pos - ($out/2) );   if( $in<0 ) $in = 0;

				#
				# PAGE NUMBER
				# Find the page tag before the match
					$subject 		= substr($text_iso, 0, $word_pos);
					$previous_page 	= '[page-n-1]'; // Default page is 1 ([page-n-1])
					if(preg_match_all("/\[page-[a-z]-[0-9]{1,6}\]/", $subject, $page_matches)) {
					    $previous_page = $page_matches[0][count($page_matches[0])-1];
					}
					preg_match("/\[page-[a-z]-([0-9]{1,6})\]/", $previous_page, $output_array);
					$page_number = isset($output_array[1]) ? (int)$output_array[1] : 1 ; // Like 2 (default is 1)

				# Non-multibyte cut adjustment. Select a previous fragment to avoid working with the full text, and give margin for the final multibyte cut
				$adjust_chars	= 10 + 50;
				$in				= intval($in  - $adjust_chars);	if ($in <0 ) $in = 0;
				$out			= intval($out + $adjust_chars);

				# Preliminary fragment NO multibyte cut
				$fragm = $text_iso;

				# Cut the text to create the fragment
				$fragm = '.. '. substr($fragm, $in, $out) .' ..';
				#$fragm = self::truncate_text(substr($fragm, $in, $out), $max_chars, $break=" ", $pad="...");

				# Highlight matches with bold
				$count = 0;
				$fragm = preg_replace($word_pattern, '<mark>$1</mark>', $fragm, 1, $count);  // Only first

				# Re-encode as UTF-8
				$fragm = mb_convert_encoding($fragm, 'UTF-8', 'ISO-8859-1');

				# Prepare text by excluding tags and cleaning it
				$fragm = self::clean_fragment_text($fragm);

				// clean word: '\bCARMO retrograda amb la M invertida\b' => 'CARMO retrograda amb la M invertida'
				$clean_word = $current_word;
				if (str_starts_with($clean_word, '\b')) {
					$clean_word = substr($clean_word, 2);
				}
				if (str_ends_with($clean_word, '\b')) {
					$clean_word = substr($clean_word, 0, -2);
				}

				# Encapsulate results in an array
				$fragment_obj = new stdClass();
					$fragment_obj->word			= $clean_word;
					$fragment_obj->page_number	= $page_number;
					$fragment_obj->fragm		= $fragm;

				$word_fragments_array[] = $fragment_obj;

				$i++;
			}//end foreach($matches[0] as $key => $ar_data)

		}//end foreach($words_array as $key => $current_word)

		// Remove possible array indexes
		$result = array_values($word_fragments_array);


		return $result;
	}//end build_fragment



	/**
	* DELETE_MARKS
	* @return string $text
	*/
	public static function delete_marks( $text ) {

		return trim($text);
	}//end delete_marks



	/**
	* CLEAN_FRAGMENT_TEXT
	* Clean fragment text for display in listings
	* @param string $fragment
	* @return string $fragment
	*/
	public static function clean_fragment_text( string $fragment ) : string {

		# Remove page tag like '[page-n-3]'
		$fragment = preg_replace("/\[page-[a-z]-[0-9]{1,6}\]/", "", $fragment);

		# Replace double page break for single
		$fragment = str_replace("  ", " ", $fragment);
		$fragment = str_replace(["\n\n","\n \n","\n\t\n"], "\n", $fragment);
		$fragment = str_replace([".. <br>","<br>..",".. br />","..br />",".. />","../>",".. >","..>",".. /",".. r />",".. r>","<br ..","<br..","<b ..","<b..","<.."], "..", $fragment);

		$fragment = str_replace(["\t","\n","<br />"], "<br>", $fragment);
		$fragment = str_replace("<br><br>", "<br>", $fragment);

		return $fragment;
	}//end clean_fragment_text



	/**
	* CLEAN_SEARCH_STRING
	* @return string $search_string
	*/
	public static function clean_search_string( $search_string ) {

		$search_string = trim($search_string);

		$search_string = str_replace("'", '"', $search_string);	// Simple ' are not allowed

		return $search_string;
	}//end clean_search_string



	/**
	* WORD2PATTERN
	* Convert word to accent-insensitive regex pattern
	* @param string $word
	* @return string | false $result
	*/
	public static function word2pattern( string $word ) : string|false {
		$result = false;

		$search	= ["/a|á|à|ä/i",
					"/e|é|è|ë/i",
					"/i|í|ì|ï/i",
					"/o|ó|ò|ö/i",
					"/u|ú|ù|ü/i",
					"/n|ñ/i"
					];
		$replace = ["[a|á|Á|à|À|ä|Ä]",
					"[e|é|É|è|È|ë|Ë]",
					"[i|í|Í|ì|Ì|ï|Ï]",
					"[o|ó|Ó|ò|Ò|ö|Ö]",
					"[u|ú|Ú|ù|Ù|ü|Ü]",
					"[ñ|Ñ|n|N]"
					];

		$pattern = preg_replace($search, $replace, $word);

		if($pattern) $result = '/('. $pattern .')/i' ;

		return $result;
	}//end word2pattern



}//end class biblio
