<?php declare(strict_types=1);
include_once 'trait.search_component_string_common.php';
include_once 'trait.search_component_string_common_tm.php';
/**
* INTERFACE COMPONENT_STRING_INTERFACE
* Contract for all string-based components in Dédalo.
*
* Marks implementing classes as belonging to the "string component" family
* (text fields, text areas, email fields). The interface is intentionally
* empty at this level; its value is taxonomic — it allows isinstance checks
* and registry membership tests without coupling callers to a concrete class.
*
* Implemented by (via component_string_common):
* - component_input_text : Single-line plain text input
* - component_text_area  : Multi-line rich text (CKEditor-managed HTML)
* - component_email      : Email-address fields (non-translatable string)
*
* @package Dédalo
* @subpackage Core
*/
interface component_string_interface {

	// from component_string_common


}//end component_string_interface



/**
* CLASS COMPONENT_STRING_COMMON
* Abstract base class for all string-type components in Dédalo.
*
* Provides the behaviour that is shared across every component whose stored
* datum is a free-form text string:
*
* - Multi-language content: data is stored as an array of objects
*   `[{lang: "lg-spa", value: "Comedor"}, {lang: "lg-eng", value: "Dining room"}, …]`
*   keyed by BCP-47-style language codes (e.g. "lg-spa") or "lg-nolan"
*   (DEDALO_DATA_NOLAN) for language-agnostic strings.
*
* - Language fallback chain: when the requested language is absent, the class
*   walks main-lang → NOLAN → all project languages until it finds a non-empty
*   value, then optionally decorates the fallback with an HTML `<mark>` wrapper
*   to signal that the text is untranslated.
*
* - Text safety: `sanitize_text()` applies a defence-in-depth denylist (SEC-034)
*   against stored-XSS vectors that CKEditor's client-side sanitiser may miss.
*
* - Empty detection: `is_empty()` treats null, non-object items, and whitespace-
*   only strings all as "empty", while preserving the numeric strings "0" and the
*   integers 0 / 0.0 as legitimate non-empty values.
*
* - Truncation helpers: `truncate_text()` for plain strings, `truncate_html()` for
*   HTML-containing rich-text values that must preserve tag nesting.
*
* Extends:    component_common (abstract; owns the data persistence layer)
* Extended by:
*   - component_input_text
*   - component_text_area
*   - component_email
*
* Uses traits:
*   - search_component_string_common    : JSONB-based SQO → SQL resolution for
*                                         string-column operators.
*   - search_component_string_common_tm : Time-Machine search variant.
*
* @package Dédalo
* @subpackage Core
*/
class component_string_common extends component_common {



	// traits. Files added to current class file to split the large code.
	use search_component_string_common;
	use search_component_string_common_tm;



	/**
	* CLASS VARS
	*/
		/**
		 * Whether this component stores data per-language.
		 *
		 * When true (default), each datum carries a `lang` property (e.g. "lg-spa").
		 * When false, the component is language-agnostic and always uses
		 * DEDALO_DATA_NOLAN ("lg-nolan") as the stored language key.
		 *
		 * Subclasses that override this to `false` (e.g. component_email) will have
		 * their constructor force `$this->lang = DEDALO_DATA_NOLAN` automatically.
		 * @var bool $supports_translation
		 */
		protected bool $supports_translation = true;

		/**
		 * Default separator used when concatenating multiple records for display.
		 *
		 * Applied by callers (e.g. grid renderers) when joining several data-item
		 * values into a single display string. Individual DDOs may override this
		 * via their own `records_separator` option.
		 * @var string $default_records_separator
		 */
		protected string $default_records_separator = ' | ';



	/**
	* GET_STRING_COMPONENTS
	* Return the list of PHP class names that are considered "string components".
	*
	* Used as a registry by generic code (search, export, import) that needs to
	* detect whether a component stores its data in the string JSONB column rather
	* than a relation or media column.  Add new string-type component class names
	* here when they are introduced into the codebase.
	*
	* @return array - flat list of PHP class-name strings
	* @test true
	*/
	public static function get_string_components() : array {

		return [
			'component_input_text',
			'component_text_area',
			'component_email'
		];
	}//end get_string_components



	/**
	* IS_EMPTY
	* Determine whether a single data item carries a meaningful value.
	*
	* "Empty" for a string component means any of:
	* - null (explicit null passed in)
	* - a non-object (raw scalar or array, which is unexpected as a data item)
	* - an object whose `value` property is absent, null, or trims to the empty string
	*
	* The numeric edge cases `"0"`, `0`, and `0.0` are intentionally treated as
	* NON-empty: a stored zero (e.g. in a numeric-string field) is valid data and
	* must not be silently discarded.
	*
	* Called by `component_common::is_empty_data()` to check an entire data array.
	*
	* @param mixed $data_item - A single element from the component's data array,
	*                           expected to be an object with a `value` string property.
	* @return bool - true when the item carries no meaningful content, false otherwise.
	*/
	public function is_empty( mixed $data_item ) : bool {

		// null case explicit
		if($data_item===null) {
			return true;
		}

		// non object case. As data entry, is considered empty.
		if ( !is_object($data_item) ) {
			return true;
		}

		$value = $data_item->value ?? null;
		$trim_value = is_string($value) ? trim($value) : $value;
		if( !empty($trim_value) || $trim_value==='0' || $trim_value===0 || $trim_value===0.0 ) {
			return false;
		}


		return true;
	}//end is_empty



	/**
	 * SANITIZE_TEXT
	 * Sanitize text to be used as html content.
	 *
	 * SEC-034: hardened denylist for stored-XSS defence-in-depth on textarea content.
	 * CKEditor sanitises on the input side, but server-side acceptance must not trust
	 * the client. The previous implementation only stripped <script>/<noscript> and
	 * left <img onerror>, <svg onload>, <iframe>, <object>, javascript: URLs and
	 * inline event handlers intact. This function now also:
	 *   - removes dangerous container/embed tags (iframe, object, embed, frame,
	 *     frameset, base, link, meta, form, applet, marquee)
	 *   - strips inline event-handler attributes (`on*=...`) on any tag
	 *   - neutralises `javascript:`, `vbscript:`, `data:text/html` URLs in
	 *     href/src/xlink:href/action/formaction/poster attributes
	 *   - strips <style> blocks (CKEditor never emits inline <style>; keeping it
	 *     would allow `expression()` and `@import url(javascript:...)` on legacy UAs)
	 *
	 * Legitimate Dédalo textarea content uses <p>, <br>, <strong>, <em>, <img>
	 * (for rendered tags like indexIn/tc/svg), <reference>, <apertium-notrans>;
	 * none of these are affected.
	 *
	 * Note: this is denylist hardening, not a complete allowlist sanitiser.
	 * A future task should migrate to a DOMDocument-based allowlist.
	 *
	 * @param string $value - Raw HTML text received from the client (e.g. CKEditor output).
	 * @return string - Sanitized text with dangerous markup stripped and trimmed.
	 */
	public static function sanitize_text(string $value) : string {

		// strip slashes (need for text received from editor)
		$value = stripslashes($value);

		// Remove script tags
		$value = preg_replace('/<script\b[^<]*>.*?<\/script>/is', '', $value) ?? $value;

		// Also remove noscript tags which might contain scripts
		$value = preg_replace('/<noscript\b[^>]*>.*?<\/noscript>/is', '', $value) ?? $value;

		// SEC-034: remove dangerous tags entirely (with content).
		$dangerous_tags_with_content = ['iframe', 'object', 'embed', 'frame', 'frameset', 'applet', 'marquee', 'style', 'form'];
		foreach ($dangerous_tags_with_content as $tag) {
			$value = preg_replace('/<'.$tag.'\b[^>]*>.*?<\/'.$tag.'>/is', '', $value) ?? $value;
			// Also self-closing / unmatched opening
			$value = preg_replace('/<\/?'.$tag.'\b[^>]*>/is', '', $value) ?? $value;
		}

		// SEC-034: void/standalone dangerous tags.
		$dangerous_void_tags = ['base', 'link', 'meta'];
		foreach ($dangerous_void_tags as $tag) {
			$value = preg_replace('/<'.$tag.'\b[^>]*\/?>/is', '', $value) ?? $value;
		}

		// SEC-034: strip inline event handlers (onload, onclick, onerror, onmouseover, ...).
		// Match `on<name>=` either quoted or unquoted, on any tag.
		$value = preg_replace('/\s+on[a-z]+\s*=\s*"[^"]*"/is', '', $value) ?? $value;
		$value = preg_replace("/\s+on[a-z]+\s*=\s*'[^']*'/is", '', $value) ?? $value;
		$value = preg_replace('/\s+on[a-z]+\s*=\s*[^\s>]+/is', '', $value) ?? $value;

		// SEC-034: neutralise javascript:/vbscript:/data:text/html URLs in dangerous attributes.
		$url_attrs = ['href', 'src', 'xlink:href', 'action', 'formaction', 'poster', 'background'];
		$bad_schemes = '(?:javascript|vbscript|livescript|mocha|data\s*:\s*text\s*\/\s*html)';
		foreach ($url_attrs as $attr) {
			// Quoted variants (only the leading scheme is matched; whitespace and
			// HTML entities between characters are tolerated to defeat trivial bypasses).
			$value = preg_replace(
				'/('.$attr.'\s*=\s*["\'])\s*'.$bad_schemes.'\s*:[^"\']*(["\'])/is',
				'$1#blocked$2',
				$value
			) ?? $value;
			// Unquoted variant.
			$value = preg_replace(
				'/('.$attr.'\s*=\s*)'.$bad_schemes.'\s*:[^\s>]*/is',
				'$1#blocked',
				$value
			) ?? $value;
		}


		return trim($value);
	}//end sanitize_text



	/**
	 * GET_DATA_LANG_WITH_FALLBACK
	 * Return the data array for the current language, falling back when absent.
	 *
	 * First attempts to retrieve data for DEDALO_DATA_LANG (the user's currently
	 * selected display language). If that returns empty (null or an array with no
	 * non-empty items), delegates to `get_component_data_fallback()` which walks
	 * the full fallback hierarchy: main language → NOLAN → all project languages.
	 *
	 * @see self::get_component_data_fallback()
	 *
	 * @return array|null - Array of data-item objects for the resolved language,
	 *                      or null when no non-empty data exists in any language.
	 */
	public function get_data_lang_with_fallback() : ?array {

		$data_lang = $this->get_data_lang();

		if( empty($data_lang) ){
			$data_lang = $this->get_component_data_fallback($this->get_lang());
		}

		return $data_lang;
	}// end get_data_lang_with_fallback



	/**
	* GET_COMPONENT_DATA_FALLBACK
	* Retrieve the data array for a given language, with a hierarchical fallback
	* when no data exists in that language.
	*
	* FALLBACK HIERARCHY (first non-empty wins):
	* 1. Main/default language ($main_lang, typically DEDALO_DATA_LANG_DEFAULT = "lg-eng")
	* 2. Language-agnostic slot (DEDALO_DATA_NOLAN = "lg-nolan")
	* 3. All project languages returned by common::get_ar_all_langs(), in sequence,
	*    skipping languages already tried in steps 1–2.
	* 4. null — no data found anywhere.
	*
	* The method does NOT fall back to the originally requested $lang itself; callers
	* are expected to have already verified that $lang is empty before calling this.
	* NOLAN is appended to the project-languages list at step 3 so that transliterable
	* content stored under NOLAN is also considered when NOLAN was the main_lang in step 1.
	*
	* @param string $lang      [= DEDALO_DATA_LANG]         - The language that was already
	*                                                          found to be empty; used only
	*                                                          to avoid re-checking it.
	* @param string $main_lang [= DEDALO_DATA_LANG_DEFAULT] - The installation's primary
	*                                                          language, tried first.
	* @return array|null - Data-item object array for the first non-empty language found,
	*                      or null when the component has no data at all.
	*/
	public function get_component_data_fallback(string $lang=DEDALO_DATA_LANG, string $main_lang=DEDALO_DATA_LANG_DEFAULT) : ?array {

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
	* Extract a display string from a fully-loaded translatable data array,
	* with language fallback and optional untranslated decoration.
	*
	* This is a static utility used when the caller already holds the raw data
	* array (e.g. from a JSON API response or an export pass) and wants a single
	* resolved string without instantiating a component object.
	*
	* Expected $data shape (translatable component):
	* ```json
	* [
	*   {"lang": "lg-spa", "value": "Comedor"},
	*   {"lang": "lg-eng", "value": ""}
	* ]
	* ```
	*
	* FALLBACK ORDER (first non-empty wins):
	* 1. Exact $lang match
	* 2. $main_lang (DEDALO_DATA_LANG_DEFAULT, e.g. "lg-eng")
	* 3. DEDALO_DATA_NOLAN ("lg-nolan")
	* 4. All project languages (common::get_ar_all_langs()) in sequence
	*
	* When the result came from a fallback (i.e. not the requested $lang),
	* `$is_fallback` is set to true. If `$decorate_untranslated` is also true,
	* the returned string is wrapped with `component_common::decorate_untranslated()`
	* (an HTML `<mark>` element) to visually flag the content as untranslated.
	*
	* The final value is cast through `to_string()` to flatten any unexpected
	* array values that may arrive from older data migrations.
	*
	* @param array|null $data              - Full data array from a translatable component.
	* @param bool       $decorate_untranslated [= false] - Wrap fallback values in <mark>.
	* @param string     $main_lang         [= DEDALO_DATA_LANG_DEFAULT] - Primary language.
	* @param string     $lang              [= DEDALO_DATA_LANG] - Target display language.
	* @return string|null - Resolved display string, or null if the data array is empty.
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

		// Declare as false
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

			// Try main lang. (Used config DEDALO_DATA_LANG_DEFAULT as main_lang)
			if ($lang!==$main_lang) {
				$value = $lookup[$main_lang] ?? null;
				// $value = isset($decoded_obj->$main_lang) ? $decoded_obj->$main_lang : null;
			}

			// Try nolan
			if (empty($value)) {
				$nolan_lang = DEDALO_DATA_NOLAN;
				$value = $lookup[$nolan_lang] ?? null;
				// $value = isset($decoded_obj->$nolan_lang) ? $decoded_obj->$nolan_lang : null;
			}

			// Try all projects langs sequence
			if (empty($value)) {
				$data_langs = common::get_ar_all_langs(); // Langs from config projects
				foreach ($data_langs as $current_lang) {
					if ($current_lang===$lang || $current_lang===$main_lang) {
						continue; // Already checked
					}
					// $value = isset($decoded_obj->$current_lang) ? $decoded_obj->$current_lang : null;
					$value = $lookup[$current_lang] ?? null;
					if (!empty($value)) break; // Stops when first data is found
				}
			}

			// Set as fallback value
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
	* Multi-byte safe truncation of a plain-text string.
	*
	* Trims the string to at most $limit bytes (measured with mb_strlen in '8bit'
	* encoding, i.e. raw byte count), then attempts to cut at the last occurrence
	* of $break (default: space) so words are not split mid-character. Appends
	* $pad ("...") when the string was actually shortened.
	*
	* This method is suitable for plain-text strings only. For HTML content that
	* contains markup, use `truncate_html()` instead to avoid breaking open tags.
	*
	* @param string $string - The input plain-text string.
	* @param int    $limit  - Maximum byte length of the result (before $pad).
	* @param string $break  [= " "] - Word-boundary character to prefer cutting at.
	* @param string $pad    [= "..."] - Suffix appended when truncation occurs.
	* @return string - Truncated (and padded) string, or the original if short enough.
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
	 * Truncate an HTML string to a visible-character limit while preserving tag nesting.
	 *
	 * When $considerHtml is true the function parses the markup token by token,
	 * tracking which tags are open, counting only visible text characters (HTML
	 * entities count as one character each), and closing any unclosed tags in the
	 * output. This makes it safe to use on CKEditor-generated rich text.
	 *
	 * When $considerHtml is false, the function falls back to a simple mb_substr
	 * on the raw string.
	 *
	 * Word-boundary behaviour ($exact parameter):
	 * - When false (default), the truncated result is cut at the last space so
	 *   words are not broken mid-character. For HTML mode, the space is located
	 *   in the stripped plain-text, then mapped back to its position inside the
	 *   HTML string. The open-tags tracking array is rebuilt from the new shorter
	 *   string after the cut.
	 * - When true, the cut happens exactly at $length characters, potentially
	 *   mid-word.
	 *
	 * HTML comments encountered during parsing are passed through unchanged and
	 * do not count toward $length. Void/self-closing elements (br, img, input,
	 * etc.) are recognised and not pushed onto the open-tags stack.
	 *
	 * @param int     $length       - Maximum number of visible characters in the output
	 *                                (the $ending suffix counts toward this limit).
	 * @param string  $text         - The input string (may contain HTML markup).
	 * @param bool    $considerHtml [= true]  - Whether to parse and preserve HTML tags.
	 * @param string  $ending       [= "..."] - Suffix appended to truncated output.
	 * @param bool    $exact        [= false] - If true, cut mid-word; if false, cut at
	 *                                          the last word boundary.
	 * @return string - Truncated string with $ending appended, tags properly closed.
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



}//end component_string_common
