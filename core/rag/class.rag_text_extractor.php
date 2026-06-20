<?php declare(strict_types=1);
/**
* CLASS RAG_TEXT_EXTRACTOR
* Turns a configured (record, component) into per-language clean text using the
* existing export-atoms contract: component_common::get_value() == the flat
* string of get_export_value(). Relation components recurse via their own
* get_export_value override, so linked labels are included automatically.
*
* Output: a list of { component_tipo, lang, text } entries (empty langs skipped,
* and identical values across langs for non-translatable components deduped so a
* single fact is not embedded once per language).
*
* @package Dedalo
* @subpackage Rag
*/
abstract class rag_text_extractor {



	/**
	* EXTRACT
	* @param string $section_tipo
	* @param int $section_id
	* @param array<int,string> $component_tipos
	* @return array<int,array{component_tipo:string,lang:string,text:string}>
	*/
	public static function extract( string $section_tipo, int $section_id, array $component_tipos ) : array {

		$langs = self::get_langs();

		$out = [];
		foreach ($component_tipos as $component_tipo) {

			$seen_hashes = []; // dedupe non-translatable repeats across langs

			foreach ($langs as $lang) {

				$text = self::get_component_value($component_tipo, $section_id, $section_tipo, $lang);
				if ($text === null) {
					continue;
				}
				$text = trim($text);
				if ($text === '') {
					continue;
				}

				$h = hash('xxh3', $text); // cheap dedupe key
				if (isset($seen_hashes[$h])) {
					// same value already captured under another lang (non-translatable)
					continue;
				}
				$seen_hashes[$h] = true;

				$out[] = [
					'component_tipo'	=> $component_tipo,
					'lang'				=> $lang,
					'text'				=> $text
				];
			}
		}

		return $out;
	}//end extract



	/**
	* GET_COMPONENT_VALUE  one component's flat clean text for a lang (or null)
	* @param string $component_tipo
	* @param int $section_id
	* @param string $section_tipo
	* @param string $lang
	* @return ?string
	*/
	public static function get_component_value( string $component_tipo, int $section_id, string $section_tipo, string $lang ) : ?string {

		try {
			$component = component_common::get_instance(
				null,			// resolve model from tipo
				$component_tipo,
				$section_id,
				'edit',
				$lang,
				$section_tipo
			);
			if ($component === null) {
				return null;
			}
			return $component->get_value();
		} catch (\Throwable $e) {
			debug_log(__METHOD__ . ' Error extracting ' . $component_tipo . ' (' . $lang . '): ' . $e->getMessage(), logger::WARNING);
			return null;
		}
	}//end get_component_value



	/**
	* GET_LANGS  all project langs plus the no-lang bucket
	* @return array<int,string>
	*/
	private static function get_langs() : array {

		$langs = [];
		try {
			$langs = common::get_ar_all_langs();
		} catch (\Throwable $e) {
			$langs = [];
		}
		if (defined('DEDALO_DATA_NOLAN') && !in_array(DEDALO_DATA_NOLAN, $langs, true)) {
			$langs[] = DEDALO_DATA_NOLAN;
		}
		return $langs;
	}//end get_langs



}//end class rag_text_extractor
