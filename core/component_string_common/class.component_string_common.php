<?php declare(strict_types=1);
/**
* INTERFACE COMPONENT_STRING_COMMON
* Used as common base from all components that works with media
* like component_3d, component_av, component_image, component_pdf, component_svg
*
* data_column_name : 'string'
*/
interface component_string_interface {

	// from component_string_common


}//end component_media_interface



/**
* CLASS COMPONENT_STRING_COMMON
* Used as common base from all components that works with media
* like component_input_text, component_text_area
*/
class component_string_common extends component_common {


	/**
	* CLASS VARS
	*/

	// Property to enable or disable the get and set data in different languages
	protected $supports_translation = true;


	/**
	* GET_STRING_COMPONENTS
	* Return array with model names of defined as 'string components'.
	* Add future string components here
	* @return array
	* @test true
	*/
	public static function get_string_components() : array {

		return [
			'component_input_text',
			'component_text_area'
		];
	}//end get_string_components



	/**
	* IS_EMPTY
	* @param object|null $data_item
	* Check if given data_item is or not empty considering
	* spaces and ' ' as empty values
	* @return bool
	*/
	public function is_empty( ?object $data_item ) : bool {

		// null case explicit
		if($data_item===null) {
			return true;
		}

		$value = $data_item->value ?? null;
		$trim_value = is_string($value) ? trim($value) : $value;
		if( !empty($trim_value) ) {
			return false;
		}


		return true;
	}//end is_empty



	/**
	* GET_DATA
	* @return array|null $dato
	*/
	public function get_data() : ?array {

		$data = parent::get_data();

		if (!is_null($data) && !is_array($data)) {
			$type = gettype($data);
			debug_log(__METHOD__
				. " Expected dato type array or null, but type is: $type. Converted to array of strings and saving " . PHP_EOL
				. ' tipo: ' . $this->tipo . PHP_EOL
				. ' section_tipo: ' . $this->section_tipo . PHP_EOL
				. ' section_id: ' . $this->section_id
				, logger::ERROR
			);
			dump($data, ' dato ++ ');

			$data = !empty($data)
				? [to_string($data)]
				: null;

			// update
			$this->set_dato($data);
			$this->Save();
		}


		return $data;
	}//end get_data



	/**
	 * SANITIZE_TEXT
	 * Sanitize text to be used as html content.
	 * Remove posible malicious <script> or <noscript> tags
	 * @param string $value
	 * @return string $value
	 */
	public static function sanitize_text(string $value) : string {

		# strip slashes (need for text received from editor)
		$value = trim(stripslashes($value));

		// Remove script tags
		$value = preg_replace('/<script\b[^<]*>.*?<\/script>/is', '', $value);

		// Also remove noscript tags which might contain scripts
    	$value = preg_replace('/<noscript\b[^>]*>.*?<\/noscript>/is', '', $value);


		return $value;
	}//end sanitize_text



	/**
	 * GET_DATA_LANG_WITH_FALLBACK
	 * Retrieve the data lang with DEDALO_DATA_LANG (user can choose/change it in menu)
	 * if the current DEDALO_DATA_LANG doesn't exist
	 * try to get any other lang as fallback
	 * @see $this->get_component_data_fallback();
	 * if the fallback doesn't exist return null
	 * @return array|null $data_lang
	 */
	public function get_data_lang_with_fallback() : ?array {

		$data_lang = $this->get_data_lang();

		if( empty($data_lang) ){
			$data_lang = $this->get_component_data_fallback();
		}

		return $data_lang;
	}// end get_data_lang_with_fallback



	/**
	* GET_COMPONENT_DATA_FALLBACK
	* Retrieves component data for a specific language and implements
	* a fallback mechanism when data is missing or empty. It follows
	* a hierarchical fallback strategy to ensure data availability across different
	* language contexts.
	*
	* FALLBACK HIERARCHY:
	* 1. Current language data (if not empty)
	* 2. Main/default language data
	* 3. No-language (NOLAN) data
	* 4. All other available project languages (in sequence)
	* 5. null (if no data found in any language)
	*
	* ALGORITHM FLOW:
	* - Preserves current language state for restoration
	* - Retrieves data for the requested language
	* - For each empty value, iterates through fallback languages
	* - Returns first non-empty value found or null
	* - Restores original language state
	* @param string $lang = DEDALO_DATA_LANG
	* @param string $main_lang = DEDALO_DATA_LANG_DEFAULT
	* @return array|null $dato_fb
	*/
	public function get_component_data_fallback(string $lang=DEDALO_DATA_LANG, string $main_lang=DEDALO_DATA_LANG_DEFAULT ) : ?array {

		$data = $this->get_data();
		if (empty($data)) {
			return null;
		}

		// Try main lang
		if ($main_lang!==$lang) {
			$main_lang_data = $this->get_data_lang($main_lang);
			if (!$this->is_empty_data($main_lang_data)) {
				return $main_lang_data;
			}
		}

		// Try nolan
		$data_nolan = $this->get_data_lang(DEDALO_DATA_NOLAN);
		if (!$this->is_empty_data($data_nolan)) {
			return $data_nolan;
		}

		// Try any other
		$data_langs = common::get_ar_all_langs(); // Array of langs from config projects
		// Add nolan for transliterables
		$data_langs[] = DEDALO_DATA_NOLAN;
		foreach ($data_langs as $current_lang) {
			if ($current_lang===$lang || $current_lang===$main_lang) {
				continue; // Already checked
			}
			// Get current lang group of items from data
			$current_lang_data = $this->get_data_lang($current_lang);
			if (!$this->is_empty_data($current_lang_data)) {
				return $current_lang_data;
			}
		}


		return null;
	}//end get_component_data_fallback



	/**
	* GET_VALUE_WITH_FALLBACK_FROM_DATA
	* Receive a full dato of translatable component and try to find a no empty lang
	* Expected dato is a string like '{"lg-eng": "", "lg-spa": "Comedor"}'
	* @param array|null $data
	* @param bool $decorate_untranslated = false
	* @param string $main_lang = DEDALO_DATA_LANG_DEFAULT
	* @return string|null $value
	*/
	public static function get_value_with_fallback_from_data(
		array|null $data,
		bool $decorate_untranslated=false,
		string $main_lang=DEDALO_DATA_LANG_DEFAULT,
		string $lang=DEDALO_DATA_LANG
		) : ?string {

		if (empty($data)) {
			return null;
		}

		# Declare as false
		$is_fallback  = false;

		// Create lookup array once
			$lookup = [];
			foreach ($data as $item) {
				$lookup[$item->lang] = $item->value;
			}

		// Try direct value
		$value = $lookup[$lang] ?? null; // Returns 'Yes' instantly

		// $value = isset($decoded_obj->$lang) ? $decoded_obj->$lang : null;

		if (empty($value)) {

			# Try main lang. (Used config DEDALO_DATA_LANG_DEFAULT as main_lang)
			if ($lang!==$main_lang) {
				$value = $lookup[$main_lang] ?? null;
				// $value = isset($decoded_obj->$main_lang) ? $decoded_obj->$main_lang : null;
			}

			# Try nolan
			if (empty($value)) {
				$nolan_lang = DEDALO_DATA_NOLAN;
				$value = $lookup[$nolan_lang] ?? null;
				// $value = isset($decoded_obj->$nolan_lang) ? $decoded_obj->$nolan_lang : null;
			}

			# Try all projects langs sequence
			if (empty($value)) {
				$data_langs = common::get_ar_all_langs(); # Langs from config projects
				foreach ($data_langs as $current_lang) {
					if ($current_lang===$lang || $current_lang===$main_lang) {
						continue; // Already checked
					}
					// $value = isset($decoded_obj->$current_lang) ? $decoded_obj->$current_lang : null;
					$value = $lookup[$current_lang] ?? null;
					if (!empty($value)) break; # Stops when first data is found
				}
			}

			# Set as fallback value
			$is_fallback = true;
		}

		// Flat possible array values to string
		$value = to_string($value);

		if ($is_fallback===true && $decorate_untranslated===true) {
			$value = component_common::decorate_untranslated($value);
		}

		return $value;
	}//end get_value_with_fallback_from_data



	/**
	* TRUNCATE_TEXT
	* Multi-byte truncate or trim text
	* @return string $final_string
	*/
	public static function truncate_text(string $string, int $limit, string $break=" ", string $pad='...') : string {

		// returns with no change if string is shorter than $limit
			$str_len = mb_strlen($string, '8bit');
			if($str_len <= $limit) {
				return $string;
			}
		// substring multibyte
			$string_fragment = mb_substr($string, 0, $limit);

		// cut fragment by break char (if is possible)
			if(false !== ($breakpoint = mb_strrpos($string_fragment, $break))) {
				$final_string = mb_substr($string_fragment, 0, $breakpoint);
			}else{
				$final_string = $string_fragment;
			}

		// add final "..."" when is truncated
			if (!empty($final_string) && strlen($final_string)<strlen($string)) {
				$final_string = $final_string . $pad;
			}

		return $final_string;
	}//end truncate_text



	/**
	 * TRUNCATE_HTML
	 * Truncate a string up to a number of characters while preserving whole words and HTML tags
	 *
	 * @param integer $length
	 * 	Length of returned string, including ellipsis.
	 * @param string $text
	 * 	String to truncate
	 * @param boolean $considerHtml
	 * 	If true, HTML tags would be handled correctly
	 * @param string $ending
	 * 	Ending to be appended to the trimmed string.
	 * @param boolean $exact
	 * 	If false, $text will not be cut mid-word
	 *
	 * @return string $truncate
	 * 	Trimmed string.
	 */
	public static function truncate_html(int $length, string $text, bool $considerHtml=true, string $ending = '...', bool $exact=false) : string {

		if ($considerHtml===true) {
			// if the plain text is shorter than the maximum length, return the whole text
			if (mb_strlen(preg_replace('/<.*?>/', '', $text)) <= $length) {
				return $text;
			}
			// splits all html-tags to scan-able lines
			preg_match_all('/(<.+?>)?([^<>]*)/s', $text, $lines, PREG_SET_ORDER);
			$total_length	= mb_strlen($ending);
			$open_tags		= [];
			$truncate		= '';
			foreach ($lines as $line_matchings) {
				// if there is any html-tag in this line, handle it and add it (uncounted) to the output
				if (!empty($line_matchings[1])) {
					// Skip HTML comments
					if (preg_match('/^<!--.*?-->$/s', $line_matchings[1])) {
						$truncate .= $line_matchings[1];
						continue;
					}

					// if it's an "empty element" with or without xhtml-conform closing slash (HTML5 self-closing/void tags)
					if (preg_match('/^<(\s*.+?\/\s*|\s*(area|base|basefont|br|col|embed|frame|hr|img|input|isindex|link|meta|param|source|track|wbr|command|keygen|menuitem)(\s.+?)?)>$/is', $line_matchings[1])) {
						// do nothing - it's a void element
					// if tag is a closing tag
					} else if (preg_match('/^<\s*\/([^\s]+?)\s*>$/s', $line_matchings[1], $tag_matchings)) {
						// delete tag from $open_tags list (case-insensitive)
						$pos = array_search(strtolower($tag_matchings[1]), $open_tags);
						if ($pos !== false) {
							unset($open_tags[$pos]);
						}
					// if tag is an opening tag
					} else if (preg_match('/^<\s*([^\s>!]+).*?>$/s', $line_matchings[1], $tag_matchings)) {
						// add tag to the beginning of $open_tags list
						array_unshift($open_tags, strtolower($tag_matchings[1]));
					}
					// add html-tag to $truncate'd text
					$truncate .= $line_matchings[1];
				}
				// calculate the length of the plain text part of the line; handle entities as one character
				$content_length = mb_strlen(preg_replace('/&[0-9a-z]{2,8};|&#[0-9]{1,7};|&#x[0-9a-f]{1,6};/i', ' ', $line_matchings[2]));
				if ($total_length + $content_length > $length) {
					// the number of characters which are left
					$left = $length - $total_length;
					$entities_length = 0;
					// search for html entities
					if (preg_match_all('/&[0-9a-z]{2,8};|&#[0-9]{1,7};|&#x[0-9a-f]{1,6};/i', $line_matchings[2], $entities, PREG_OFFSET_CAPTURE)) {
						// calculate the real length of all entities in the legal range
						foreach ($entities[0] as $entity) {
							if ($entity[1] + 1 - $entities_length <= $left) {
								$left--;
								$entities_length += mb_strlen($entity[0]);
							} else {
								// no more characters left
								break;
							}
						}
					}
					$truncate .= mb_substr($line_matchings[2], 0, $left + $entities_length);
					// maximum length is reached, so get off the loop
					break;
				} else {
					$truncate .= $line_matchings[2];
					$total_length += $content_length;
				}
				// if the maximum length is reached, get off the loop
				if ($total_length >= $length) {
					break;
				}
			}
		} else {
			if (mb_strlen($text) <= $length) {
				return $text;
			} else {
				$truncate = mb_substr($text, 0, $length - mb_strlen($ending));
			}
		}
		// if the words shouldn't be cut in the middle...
		if ($exact===false) {
			// Extract plain text from truncate for word boundary detection
			$plain_truncate = $considerHtml ? preg_replace('/<.*?>/s', '', $truncate) : $truncate;
			// ...search the last occurrence of a space...
			$spacepos = mb_strrpos($plain_truncate, ' ');
			if ($spacepos !== false) {
				// Find the corresponding position in the original string
				if ($considerHtml) {
					// Count characters in plain text up to space position
					$char_count = 0;
					$html_pos = 0;
					$in_tag = false;
					$truncate_len = mb_strlen($truncate);

					for ($i = 0; $i < $truncate_len; $i++) {
						$char = mb_substr($truncate, $i, 1);
						if ($char === '<') {
							$in_tag = true;
						}
						if (!$in_tag) {
							if ($char_count === $spacepos) {
								$html_pos = $i;
								break;
							}
							$char_count++;
						}
						if ($char === '>') {
							$in_tag = false;
						}
					}
					if ($html_pos > 0) {
						$truncate = mb_substr($truncate, 0, $html_pos);

						// Rebuild the open_tags array based on the new truncated content
						preg_match_all('/<([^\s>\/]+)(?:\s[^>]*)?>|<\/([^\s>]+)>/s', $truncate, $tag_matches, PREG_SET_ORDER);
						$open_tags = [];
						foreach ($tag_matches as $match) {
							// Check if it's a void/self-closing element
							$full_tag = $match[0];
							$is_void = preg_match('/^<(\s*.+?\/\s*|\s*(area|base|basefont|br|col|embed|frame|hr|img|input|isindex|link|meta|param|source|track|wbr|command|keygen|menuitem)(\s.+?)?)>$/is', $full_tag);

							if (!$is_void && !preg_match('/^<!--/', $full_tag)) {
								if (!empty($match[1])) {
									// Opening tag
									array_unshift($open_tags, strtolower($match[1]));
								} else if (!empty($match[2])) {
									// Closing tag
									$pos = array_search(strtolower($match[2]), $open_tags);
									if ($pos !== false) {
										unset($open_tags[$pos]);
									}
								}
							}
						}
					}
				} else {
					// ...and cut the text in this position
					$truncate = mb_substr($truncate, 0, $spacepos);
				}
			}
		}
		// add the defined ending to the text
		$truncate .= $ending;
		if ($considerHtml) {
			// close all unclosed html-tags
			foreach ($open_tags as $tag) {
				$truncate .= '</' . $tag . '>';
			}
		}

		return $truncate;
	}//end truncate_html



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* @param object $query_object
	* sample:
		* {
		*    "q": [
		*        "Raurich Pérez"
		*    ],
		*    "q_operator": null,
		*    "path": [
		*        {
		*            "name": "Surname",
		*            "model": "component_input_text",
		*            "section_tipo": "rsc197",
		*            "component_tipo": "rsc86"
		*        }
		*    ],
		*    "q_split": true,
		*    "type": "jsonb",
		*    "component_path": [
		*        "components",
		*        "rsc86",
		*        "dato"
		*    ],
		*    "lang": "all"
		* }
	* @return object $query_object
	*	Edited/parsed version of received object
	*/
	public static function resolve_query_object_sql(object $query_object) : object {

		// $q
		// Note that $query_object->q v6 is array (before was string) but only one element is expected. So select the first one
		$q = is_array($query_object->q)
			? (!empty($query_object->q[0]) ? $query_object->q[0] : '')
			: ($query_object->q ?? '');

		// split q case
		$q_split = $query_object->q_split ?? false;
		if ($q_split===true && !search::is_literal($q)) {
			$q_items = preg_split('/\s/', $q);
			if (count($q_items)>1) {
				return self::handle_query_splitting($query_object, $q_items, '$and');
			}
		}

		// Validate path and calculate translatable
		if (empty($query_object->path) || !is_array($query_object->path)) {
			throw new Exception("Invalid component path");
		}
		$path_end = end($query_object->path);
		$component_tipo = $path_end->component_tipo;
		$translatable = ontology_node::get_translatable($component_tipo);

		// column
		$column = section_record_data::get_column_name( get_called_class() );

		// table_alias
		$table_alias = $query_object->table_alias;

		// escape q string for DB
		$q = pg_escape_string(DBi::_getConnection(), stripslashes($q));

		// q_operator. Search component do not use a 'q_operator' but for compatibility with
		// any search call, it is added here and is accepted too.
		$q_operator = $query_object->q_operator ?? null;

		// type. Always set fixed values
		$query_object->type = 'string';

		switch (true) {

			// EMPTY VALUE
			case ($q==='!*'):
				$operator	= 'IS NULL';
				$q_clean	= '';

				$query_object->operator	= $operator;
				$query_object->q_parsed	= $q_clean;
				$query_object->unaccent	= false;

				// Search empty only in current lang
				// Resolve based on if is translatable
					$path_end		= end($query_object->path);
					$component_tipo	= $path_end->component_tipo;
					$translatable = RecordObj_dd::get_translatable($component_tipo);

					$lang = (isset($query_object->lang) && $query_object->lang!=='all')
						? $query_object->lang
						: 'all';

					$lang_query_not_null = component_common::resolve_query_object_lang_behavior( (object)[
						'query_object'	=> $query_object,
						'operator'		=> 'IS NULL',
						'lang'			=> $lang,
						'translatable'	=> $translatable
					]);
					$lang_query_empty = component_common::resolve_query_object_lang_behavior( (object)[
						'query_object'	=> $query_object,
						'operator'		=> '=',
						'q_parsed'		=> '\'[]\'',
						'lang'			=> $lang,
						'translatable'	=> $translatable
					]);

					$lang_query_objects = array_merge($lang_query_not_null, $lang_query_empty);

					$logical_operator = '$or';
					$langs_query_json = new stdClass;
						$langs_query_json->$logical_operator = $lang_query_objects;

				$logical_operator = '$and';
				$final_query_json = new stdClass;
					$final_query_json->$logical_operator = [$langs_query_json];
				$query_object = $final_query_json;
				break;

			// NOT EMPTY
			case ($q==='*'):
				$operator = 'IS NOT NULL';
				$q_clean  = '';
				$query_object->operator	= $operator;
				$query_object->q_parsed	= $q_clean;
				$query_object->unaccent	= false;

					$lang = (isset($query_object->lang) && $query_object->lang!=='all')
						? $query_object->lang
						: 'all';

					$path_end		= end($query_object->path);
					$component_tipo	= $path_end->component_tipo;

					$translatable = RecordObj_dd::get_translatable($component_tipo);

					$lang_query_objects_null = component_common::resolve_query_object_lang_behavior( (object)[
						'query_object'	=> $query_object,
						'operator'		=> 'IS NOT NULL',
						'lang'			=> $lang,
						'translatable'	=> $translatable
					]);
					$lang_query_objects_empty = component_common::resolve_query_object_lang_behavior( (object)[
						'query_object'	=> $query_object,
						'operator'		=> '!=',
						'q_parsed'		=> '\'[]\'',
						'lang'			=> $lang,
						'translatable'	=> $translatable
					]);

					$lang_query_objects = array_merge($lang_query_objects_null, $lang_query_objects_empty);

					$logical_operator = '$or';
					$langs_query_json = new stdClass;
						$langs_query_json->$logical_operator = $lang_query_objects;

				# override
				$logical_operator = '$and';
				$final_query_json = new stdClass;
					$final_query_json->$logical_operator = [$langs_query_json];
				$query_object = $final_query_json;
				break;

			// IS DIFFERENT
			case (strpos($q, '!=')===0 || $q_operator==='!='):
				$operator = '!=';
				$q_clean  = str_replace($operator, '', $q);
				$query_object->operator	= '!~';
				$first_char	= mb_substr($q_clean, 0, 1);
				$last_char	= mb_substr($q_clean, -1);
				switch (true) {
					// contains
					case ($first_char==='*' && $last_char==='*'):
						$q_clean = str_replace('*', '', $q_clean);
						$query_object->q_parsed	= '\'.*\[".*'.$q_clean.'.*\'';
						break;
					// begins with
					case ($first_char==='*'):
						$q_clean = str_replace('*', '', $q_clean);
						$query_object->q_parsed	= '\'.*\[".*'.$q_clean.'".*\'';
						break;
					// ends with
					case ($last_char==='*'):
						$q_clean = str_replace('*', '', $q_clean);
						$query_object->q_parsed	= '\'.*\[".*'.$q_clean.'.*"\'';
						break;
					default:
						$query_object->q_parsed	= '\'.*"'.$q_clean.'".*\'';
						break;
				}
				$query_object->unaccent	= false;
				break;

			// IS EXACTLY EQUAL ==
			case (strpos($q, '==')===0 || $q_operator==='=='):
				$operator = '==';
				$q_clean  = str_replace($operator, '', $q);
				// $query_object->operator = '@>';
				// $query_object->q_parsed	= '\'["'.$q_clean.'"]\'';
				// $query_object->unaccent = false;
				// $query_object->type = 'object';
				// if (isset($query_object->lang) && $query_object->lang!=='all') {
				// 	$query_object->component_path[] = $query_object->lang;
				// }
				// if (isset($query_object->lang) && $query_object->lang==='all') {
				// 	$logical_operator = '$or';
				// 	$ar_query_object = [];
				// 	$ar_all_langs 	 = common::get_ar_all_langs();
				// 	$ar_all_langs[]  = DEDALO_DATA_NOLAN; // Added no lang also
				// 	foreach ($ar_all_langs as $current_lang) {
				// 		// Empty data is blank array []
				// 		$clone = clone($query_object);
				// 			$clone->component_path[] = $current_lang;

				// 		$ar_query_object[] = $clone;
				// 	}
				// 	$query_object = new stdClass();
				// 		$query_object->$logical_operator = $ar_query_object;
				// }

				// sample:
				// $table_alias.string::jsonb -> 'dd132' @> '[{"value": "pepe"}]'

				// sql using GIN index
				$query_object->sentence = "{$table_alias}.{$column}::jsonb -> '$component_tipo' @> _Q1_";

				// params
				$query_object->params = (isset($query_object->lang) && $query_object->lang==='all')
					? ['_Q1_' => '[{"value": "'.$q_clean.'"}]']
					: ['_Q1_' => '[{"value":"'.$q_clean.'","lang":"'.($query_object->lang ?? DEDALO_DATA_LANG).'"}]'];
				break;

			// IS SIMILAR
			case (strpos($q, '=')===0 || $q_operator==='='):
				$operator = '=';
				$q_clean  = str_replace($operator, '', $q);
				$query_object->operator	= '~*';
				$query_object->q_parsed	= '\'.*"'.$q_clean.'".*\'';
				$query_object->unaccent	= true;
				break;

			// NOT CONTAIN
			case (strpos($q, '-')===0 || $q_operator==='-'):
				$operator = '!~*';
				$q_clean  = str_replace('-', '', $q);
				$query_object->operator	= $operator;
				$query_object->q_parsed	= '\'.*\[".*'.$q_clean.'.*\'';
				$query_object->unaccent	= true;
				break;

			// CONTAIN EXPLICIT
			case (substr($q, 0, 1)==='*' && substr($q, -1)==='*'):
				$operator = '~*';
				$q_clean  = str_replace('*', '', $q);
				$query_object->operator	= $operator;
				$query_object->q_parsed	= '\'.*\[".*'.$q_clean.'.*\'';
				$query_object->unaccent	= true;
				break;

			// ENDS WITH
			case (substr($q, 0, 1)==='*'):
				$operator = '~*';
				$q_clean  = str_replace('*', '', $q);
				$query_object->operator	= $operator;
				$query_object->q_parsed	= '\'.*\[".*'.$q_clean.'.*"\'';
				$query_object->unaccent	= true;
				break;

			// BEGINS WITH
			case (substr($q, -1)==='*'):
				$operator = '~*';
				$q_clean  = str_replace('*', '', $q);
				$query_object->operator	= $operator;
				$query_object->q_parsed	= '\'.*\["'.$q_clean.'.*\'';
				$query_object->unaccent	= true;
				break;

			// LITERAL
			case (search::is_literal($q)===true):
				$operator = '~'; // case sensitive regular expression matching
				$q_clean  = str_replace("'", '', $q);
				$query_object->operator	= $operator;
				$query_object->q_parsed	= '\'.*"'.$q_clean.'".*\'';
				$query_object->unaccent	= true;
				break;

			// DUPLICATED
			case (strpos($q, '!!')===0 || $q_operator==='!!'):
				$operator = '=';
				$query_object->operator 	= $operator;
				$query_object->unaccent		= false; // (!) always false
				$query_object->duplicated	= true;
				// Resolve lang based on if is translatable
					$lang = $translatable===true ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
					$query_object->lang	= $lang;
				break;

			// DEFAULT CONTAINS
			default:
				// sql sentence
				$sql  = "{$table_alias}.{$column} @? (";
				$sql .= "'$.{$component_tipo}[*].value ? (@ like_regex \"'||_Q1_||'\" flag \"i\")'";
				$sql .= ")::jsonpath";
				$query_object->sentence = $sql;

				// params
				$q_clean  = str_replace('+', '', $q);
				$query_object->params = ['_Q1_' => $q_clean];
				break;
		}//end switch (true)


		return $query_object;
	}//end resolve_query_object_sql



	/**
	* SEARCH_OPERATORS_INFO
	* Return valid operators for search in current component
	* @return array $ar_operators
	*/
	public function search_operators_info() : array {

		$ar_operators = [
			'*'			=> 'no_empty', // not null
			'!*'		=> 'empty', // null
			'=='		=> 'exactly',
			'='			=> 'similar_to',
			'!='		=> 'different_from',
			'-'			=> 'does_not_contain',
			'!!'		=> 'duplicated',
			'*text*'	=> 'contains',
			'text*'		=> 'begins_with',
			'*text'		=> 'end_with',
			'\'text\''	=> 'literal'
		];

		return $ar_operators;
	}//end search_operators_info



}//end component_string_common
