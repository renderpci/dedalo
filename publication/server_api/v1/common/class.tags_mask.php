<?php
/**
* TAGS_MASK
* Single definition of the transcription tags ([note-..-data:..:data], [index-n-1],
* [TC_..._TC], etc.) and of the two ways of neutralizing them when searching:
*
* 1. PHP text masking (mask_tags), used to find words in the transcription text
* 2. SQL pattern (get_tags_sql_pattern), used to mask LIKE filters in the database
*
* Both share the same TAGS_PATTERN, so a new tag type added here is honored by
* every search path (free_search fragments and records sql_filter).
*
* Note the two maskings are not interchangeable: the PHP one preserves char offsets
* (needed to cut fragments), while the SQL one collapses each tag to a single space,
* as REGEXP_REPLACE can not emit a replacement of the same length as the match.
*/
class tags_mask {



	/**
	* TAGS_PATTERN
	* Transcription tags, without delimiters nor modifiers. Alternatives:
	* 1. tags with data payload (open/close): [note-b-1-name-data:{..}:data], [/index-a-1-name-data:{..}:data]
	* 2. TC marks: [TC_00:01:02.123_TC]
	* 3. standalone tags (open/close): [index-n-1], [/index-n-1], [svg-n-2], ...
	* Payload is bounded to avoid swallowing real text when a tag was truncated by remove_restricted_text
	*
	* IMPORTANT: the pattern is written without any backslash on purpose, using the
	* character classes [[] and []] instead of \[ and \]. A backslash inside a SQL string
	* literal is consumed by the parser, so the escaping needed would depend on the
	* NO_BACKSLASH_ESCAPES sql_mode and masking would silently stop working when it is set.
	* Keep it backslash free. Note '/' is not escaped either, so the PHP delimiter is '#'
	*/
	const TAGS_PATTERN = '[[]/?[a-zA-Z]+-[a-z]-[^]]*?-data:.{0,2000}?:data[]]'
					   . '|[[]TC_[0-9:.]+_TC[]]'
					   . '|[[]/?(?:index|reference|svg|draw|geo|page|person|note|lang)-[a-z]-[0-9]{1,6}[]]';



	/**
	* MASK_TAGS
	* Replace every transcription tag by the same number of spaces (mb chars),
	* so text offsets remain unchanged but tag content is not searchable.
	* @param string $text
	* @return string
	*/
	public static function mask_tags( string $text ) : string {

		// '#' delimiter: TAGS_PATTERN leaves '/' unescaped (see TAGS_PATTERN note)
		$pattern = '#' . self::TAGS_PATTERN . '#su';

		$masked = preg_replace_callback($pattern, function($m) {
			return str_repeat(' ', mb_strlen($m[0]));
		}, $text);

		return $masked ?? $text;
	}//end mask_tags



	/**
	* GET_TAGS_SQL_PATTERN
	* Same tags pattern, ready to be embedded inside a single quoted
	* SQL string literal (MariaDB/MySQL REGEXP_REPLACE).
	* As TAGS_PATTERN contains no backslash, it needs no escaping at all and it is
	* immune to the NO_BACKSLASH_ESCAPES sql_mode. '(?s)' replaces the PHP 's'
	* modifier (dot matches new lines).
	* @return string
	*/
	public static function get_tags_sql_pattern() : string {

		return '(?s)' . self::TAGS_PATTERN;
	}//end get_tags_sql_pattern



}//end class tags_mask
