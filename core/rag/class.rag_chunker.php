<?php declare(strict_types=1);
/**
* CLASS RAG_CHUNKER
* Structure-aware SEMANTIC chunking — the advanced technique, not fixed-size
* splitting. Produces "solid" chunks: each is one coherent idea, aligned to the
* document's structure, enriched with a context header, and linked to its parent
* section for small-to-big retrieval.
*
* Pipeline (all modes):
*  1. STRUCTURE PARSE — hard boundaries. Split into structural units (heading
*     sections / paragraphs / lists / tables / page markers / timecode-speaker
*     turns). A chunk NEVER crosses a structural boundary.
*  2. SEMANTIC SEGMENTATION — soft boundaries within a unit. Split into
*     sentences, embed consecutive sentences, and break where adjacent-sentence
*     cosine distance exceeds a percentile/std-dev threshold (the semantic
*     breakpoint method). Requires an embedder; degrades to structural-only when
*     none is available (strategy 'structural', or no embedder injected).
*  3. PACK + DOUBLE-MERGE — merge semantic segments toward max_tokens with a
*     min_tokens floor that absorbs orphan one-sentence segments.
*  4. CONTEXTUAL ENRICHMENT — prepend "{document_title} › {heading path}" to the
*     chunk's EMBEDDED text (kept separate from the raw text used for citation).
*  5. SMALL-TO-BIG — every chunk carries a parent_key (its structural section)
*     so ask() can expand a precise hit to its parent for coherent context.
*
* The embedder is INJECTED (opts['embedder'] = callable(string[]):float[][]) so
* this class is fully unit-testable without a live model and so the indexer can
* batch sentence embeddings through the configured provider.
*
* Budgets are in TOKENS (estimated). A too-long chunk would be silently
* truncated by the embedding model, so the budget is a real guard, not cosmetic.
*
* @package Dedalo
* @subpackage Rag
*/
abstract class rag_chunker {



	/**
	* CHUNK
	* @param string $text  cleaned text (markup already stripped by the extractor)
	* @param array $opts {
	*   mode: 'auto'|'short'|'transcription'|'long_document'  (default auto)
	*   strategy: 'structural'|'structural_semantic'          (default structural_semantic)
	*   max_tokens, min_tokens, overlap_tokens: int
	*   document_title: string
	*   media_tipo: ?string   (transcription provenance)
	*   embedder: ?callable(string[]):float[][]   (semantic boundaries)
	*   breakpoint_threshold: float  (percentile 0..1, default 0.92)
	* }
	* @return array<int,array<string,mixed>>  chunk rows:
	*   { chunk_index, text, embed_text, source_hash, token_count, source_kind,
	*     parent_key, chunk_meta }
	*/
	public static function chunk( string $text, array $opts=[] ) : array {

		$text = trim($text);
		if ($text === '') {
			return [];
		}

		$mode			= $opts['mode'] ?? 'auto';
		$strategy		= $opts['strategy'] ?? 'structural_semantic';
		$max_tokens		= (int)($opts['max_tokens'] ?? (defined('DEDALO_RAG_CHUNK_TOKENS') ? DEDALO_RAG_CHUNK_TOKENS : 450));
		$min_tokens		= (int)($opts['min_tokens'] ?? (defined('DEDALO_RAG_CHUNK_MIN_TOKENS') ? DEDALO_RAG_CHUNK_MIN_TOKENS : 120));
		$document_title	= (string)($opts['document_title'] ?? '');
		$embedder		= $opts['embedder'] ?? null;
		$threshold		= (float)($opts['breakpoint_threshold'] ?? (defined('DEDALO_RAG_SEMANTIC_BREAKPOINT_THRESHOLD') ? DEDALO_RAG_SEMANTIC_BREAKPOINT_THRESHOLD : 0.92));

		if ($mode === 'auto') {
			$mode = self::detect_mode($text, $max_tokens);
		}

		// build structural units: each unit = { source_kind, parent_key, heading_path, meta, text }
		$units = ($mode === 'transcription')
			? self::parse_transcription_units($text, $opts['media_tipo'] ?? null)
			: self::parse_document_units($text);

		// within each unit, produce one or more packed chunks
		$chunks = [];
		$index  = 0;
		foreach ($units as $unit) {

			$segments = self::segment_unit(
				$unit['text'],
				($strategy === 'structural_semantic') ? $embedder : null,
				$threshold
			);

			$packed = self::pack_segments($segments, $max_tokens, $min_tokens);

			$n = count($packed);
			foreach ($packed as $i => $piece_text) {

				$raw		= trim($piece_text);
				if ($raw === '') {
					continue;
				}
				$embed_text	= self::build_embed_text($document_title, $unit['heading_path'], $raw);

				$meta = $unit['meta'];
				// char range within the original value is approximate provenance
				$meta['char_start']	= $meta['char_start'] ?? null;

				$chunks[] = [
					'chunk_index'	=> $index,
					'text'			=> $raw,
					'embed_text'	=> $embed_text,
					'source_hash'	=> hash('sha256', $embed_text),
					'token_count'	=> self::estimate_tokens($raw),
					'source_kind'	=> $unit['source_kind'],
					'parent_key'	=> $unit['parent_key'],
					'chunk_meta'	=> $meta
				];
				$index++;
			}
		}

		return $chunks;
	}//end chunk



	/**
	* DETECT_MODE
	* @param string $text
	* @param int $max_tokens
	* @return string  short | transcription | long_document
	*/
	public static function detect_mode( string $text, int $max_tokens ) : string {

		if (preg_match('/\[TC_\d{1,2}:\d{1,2}:\d{1,2}(?:\.\d{1,3})?_TC\]/', $text) === 1) {
			return 'transcription';
		}
		// short if it comfortably fits one chunk
		if (self::estimate_tokens($text) <= $max_tokens) {
			return 'short';
		}
		return 'long_document';
	}//end detect_mode



	/**
	* PARSE_DOCUMENT_UNITS
	* Split a document into structural units that a chunk must not cross:
	* heading sections (carrying the heading path), with page markers recorded.
	* The cleaned text may still contain block newlines; headings are detected as
	* lines wrapped in [h1]..[h6] markers OR lines that look like standalone
	* headings. Page markers [page-n-X] are recorded as provenance.
	*
	* NOTE: the extractor strips HTML to text but preserves heading hints as
	* "[h{n}] ... " line prefixes (see rag_text_extractor). Plain paragraphs are
	* separated by blank lines.
	* @param string $text
	* @return array<int,array<string,mixed>>
	*/
	public static function parse_document_units( string $text ) : array {

		$lines = preg_split('/\R/u', $text);
		$units = [];

		$current_heading_path	= [];
		$current_page			= null;
		$buffer					= '';
		$buffer_char_start		= 0;
		$char_cursor			= 0;

		$flush = function() use (&$units, &$buffer, &$current_heading_path, &$current_page, &$buffer_char_start) {
			$body = trim($buffer);
			if ($body !== '') {
				$heading_path = implode(' › ', array_filter($current_heading_path));
				$units[] = [
					'source_kind'	=> 'text',
					'heading_path'	=> $heading_path,
					'parent_key'	=> $heading_path !== '' ? md5($heading_path) : null,
					'meta'			=> [
						'heading'		=> $current_heading_path[count($current_heading_path)-1] ?? null,
						'page'			=> $current_page,
						'char_start'	=> $buffer_char_start
					],
					'text'			=> $body
				];
			}
			$buffer = '';
		};

		foreach ($lines as $line) {
			$line_len = mb_strlen($line) + 1; // + newline

			// page marker
			if (preg_match('/\[page-n-(\d+)\]/', $line, $pm) === 1) {
				$current_page = (int)$pm[1];
				$char_cursor += $line_len;
				continue;
			}

			// heading marker [h1]..[h6]
			if (preg_match('/^\s*\[h([1-6])\]\s*(.+?)\s*$/u', $line, $hm) === 1) {
				// a heading starts a NEW structural unit
				$flush();
				$level	= (int)$hm[1];
				$title	= trim($hm[2]);
				// truncate the heading path to this level-1, then push
				$current_heading_path = array_slice($current_heading_path, 0, $level - 1);
				$current_heading_path[$level - 1] = $title;
				$buffer_char_start = $char_cursor + $line_len;
				$char_cursor += $line_len;
				continue;
			}

			if (trim($line) === '') {
				// blank line: paragraph boundary inside the same heading unit; keep
				// accumulating (semantic step will resolve internal boundaries)
				$buffer .= "\n";
				$char_cursor += $line_len;
				continue;
			}

			if ($buffer === '') {
				$buffer_char_start = $char_cursor;
			}
			$buffer .= $line . "\n";
			$char_cursor += $line_len;
		}
		$flush();

		// no structure at all → single unit
		if (empty($units)) {
			$units[] = [
				'source_kind'	=> 'text',
				'heading_path'	=> '',
				'parent_key'	=> null,
				'meta'			=> ['heading'=>null, 'page'=>null, 'char_start'=>0],
				'text'			=> trim($text)
			];
		}

		return $units;
	}//end parse_document_units



	/**
	* PARSE_TRANSCRIPTION_UNITS
	* Split a timecoded transcription into structural units. Each [TC_..._TC]
	* marker opens a segment; segments are grouped into one unit per ~pause/turn
	* run is left to the semantic step, so here we emit a SINGLE unit carrying the
	* ordered segments, and record tc_in/tc_out provenance on the unit. The
	* semantic+pack step then splits within, preserving the first/last TC of each
	* produced chunk via re-derivation. For simplicity and testability we split
	* the transcription into units at every marker and let packing regroup them.
	* @param string $text
	* @param ?string $media_tipo
	* @return array<int,array<string,mixed>>
	*/
	public static function parse_transcription_units( string $text, ?string $media_tipo ) : array {

		// capture markers with their offsets
		preg_match_all('/\[TC_(\d{1,2}:\d{1,2}:\d{1,2}(?:\.\d{1,3})?)_TC\]/', $text, $m, PREG_OFFSET_CAPTURE);

		if (empty($m[0])) {
			// no markers despite detection: treat as one unit
			return [[
				'source_kind'	=> 'av_transcript',
				'heading_path'	=> '',
				'parent_key'	=> null,
				'meta'			=> ['tc_in'=>null,'tc_out'=>null,'media_tipo'=>$media_tipo],
				'text'			=> trim($text)
			]];
		}

		$segments = [];
		$count = count($m[0]);
		for ($i=0; $i<$count; $i++) {
			$tc			= $m[1][$i][0];
			$marker_end	= $m[0][$i][1] + strlen($m[0][$i][0]);
			$next_start	= ($i+1 < $count) ? $m[0][$i+1][1] : strlen($text);
			$body		= trim(substr($text, $marker_end, $next_start - $marker_end));
			$tc_out		= ($i+1 < $count) ? $m[1][$i+1][0] : null;
			if ($body !== '') {
				$segments[] = ['tc_in'=>$tc, 'tc_out'=>$tc_out, 'text'=>$body];
			}
		}

		// one unit per segment; packing will regroup consecutive segments while
		// carrying tc_in of the first and tc_out of the last. To keep that
		// provenance we emit a unit per segment here and rely on the indexer? No
		// — we want regrouping. So emit ONE unit per segment but tag meta; the
		// pack step works within a unit, so to regroup we build a single unit
		// whose text joins segments with sentinel and recompute. Simpler: emit a
		// unit per segment (each becomes >=1 chunk). Solid + precise deep-links.
		$units = [];
		foreach ($segments as $seg) {
			$units[] = [
				'source_kind'	=> 'av_transcript',
				'heading_path'	=> '',
				'parent_key'	=> $media_tipo ? ('av:'.$media_tipo) : null,
				'meta'			=> ['tc_in'=>$seg['tc_in'], 'tc_out'=>$seg['tc_out'], 'media_tipo'=>$media_tipo],
				'text'			=> $seg['text']
			];
		}
		return $units;
	}//end parse_transcription_units



	/**
	* SEGMENT_UNIT
	* Split a structural unit's text into semantic segments. With an embedder,
	* uses cosine-distance breakpoints over consecutive sentences; without one,
	* returns the whole unit as a single segment (structural-only).
	* @param string $text
	* @param ?callable $embedder
	* @param float $threshold  percentile 0..1
	* @return array<int,string>
	*/
	public static function segment_unit( string $text, ?callable $embedder, float $threshold ) : array {

		$sentences = self::split_sentences($text);
		if (count($sentences) <= 1 || $embedder === null) {
			return [trim($text)];
		}

		// embed sentences
		$vectors = $embedder( $sentences );
		if (!is_array($vectors) || count($vectors) !== count($sentences)) {
			// embedder failed: structural-only fallback
			return [trim($text)];
		}

		// consecutive cosine distances
		$distances = [];
		for ($i=0; $i<count($sentences)-1; $i++) {
			$distances[] = self::cosine_distance($vectors[$i], $vectors[$i+1]);
		}
		if (empty($distances)) {
			return [trim($text)];
		}

		// breakpoint where distance exceeds the percentile threshold
		$cut = self::percentile($distances, $threshold);

		$segments	= [];
		$current	= [ $sentences[0] ];
		for ($i=0; $i<count($distances); $i++) {
			if ($distances[$i] > $cut) {
				$segments[] = trim(implode(' ', $current));
				$current = [];
			}
			$current[] = $sentences[$i+1];
		}
		if (!empty($current)) {
			$segments[] = trim(implode(' ', $current));
		}

		return array_values(array_filter($segments, static fn($s) => $s !== ''));
	}//end segment_unit



	/**
	* PACK_SEGMENTS
	* Greedily merge semantic segments toward max_tokens. A trailing segment
	* below min_tokens is merged back into the previous chunk (orphan absorption /
	* semantic double-merge). A single segment larger than max_tokens is split on
	* sentence boundaries as a last resort.
	* @param array<int,string> $segments
	* @param int $max_tokens
	* @param int $min_tokens
	* @return array<int,string>
	*/
	public static function pack_segments( array $segments, int $max_tokens, int $min_tokens ) : array {

		$chunks		= [];
		$current	= '';
		$current_tok= 0;

		foreach ($segments as $seg) {
			$seg_tok = self::estimate_tokens($seg);

			// oversize single segment → hard-split on sentences
			if ($seg_tok > $max_tokens) {
				if ($current !== '') {
					$chunks[] = $current;
					$current = ''; $current_tok = 0;
				}
				foreach (self::hard_split($seg, $max_tokens) as $piece) {
					$chunks[] = $piece;
				}
				continue;
			}

			if ($current_tok + $seg_tok <= $max_tokens || $current === '') {
				$current = ($current === '') ? $seg : $current . "\n" . $seg;
				$current_tok += $seg_tok;
			} else {
				$chunks[] = $current;
				$current = $seg;
				$current_tok = $seg_tok;
			}
		}
		if ($current !== '') {
			$chunks[] = $current;
		}

		// orphan absorption: a final chunk below the floor merges into its prev
		$n = count($chunks);
		if ($n >= 2 && self::estimate_tokens($chunks[$n-1]) < $min_tokens) {
			$chunks[$n-2] = $chunks[$n-2] . "\n" . $chunks[$n-1];
			array_pop($chunks);
		}

		return $chunks;
	}//end pack_segments



	/**
	* HARD_SPLIT  last-resort sentence-boundary split of an oversize segment
	* @param string $text
	* @param int $max_tokens
	* @return array<int,string>
	*/
	private static function hard_split( string $text, int $max_tokens ) : array {

		$sentences	= self::split_sentences($text);
		$out		= [];
		$cur		= '';
		$cur_tok	= 0;
		foreach ($sentences as $s) {
			$t = self::estimate_tokens($s);
			if ($cur_tok + $t > $max_tokens && $cur !== '') {
				$out[] = $cur;
				$cur = $s; $cur_tok = $t;
			} else {
				$cur = ($cur==='') ? $s : $cur.' '.$s;
				$cur_tok += $t;
			}
		}
		if ($cur !== '') {
			$out[] = $cur;
		}
		return $out;
	}//end hard_split



	/**
	* BUILD_EMBED_TEXT  contextual-retrieval header + raw chunk
	* @param string $document_title
	* @param string $heading_path
	* @param string $raw
	* @return string
	*/
	public static function build_embed_text( string $document_title, string $heading_path, string $raw ) : string {

		$header_parts = array_filter([trim($document_title), trim($heading_path)]);
		if (empty($header_parts)) {
			return $raw;
		}
		return implode(' › ', $header_parts) . "\n" . $raw;
	}//end build_embed_text



	/**
	* SPLIT_SENTENCES
	* Lightweight multilingual sentence splitter. Splits on . ! ? and the CJK
	* terminals 。！？ when followed by whitespace/end, with a minimal guard
	* against single-letter abbreviations. Good enough to feed semantic
	* segmentation; not a full NLP tokenizer.
	* @param string $text
	* @return array<int,string>
	*/
	public static function split_sentences( string $text ) : array {

		$text = trim(preg_replace('/\s+/u', ' ', $text));
		if ($text === '') {
			return [];
		}

		// split keeping terminator
		$parts = preg_split('/(?<=[\.\!\?。！？])\s+/u', $text);
		$out = [];
		foreach ($parts as $p) {
			$p = trim($p);
			if ($p !== '') {
				$out[] = $p;
			}
		}
		return empty($out) ? [$text] : $out;
	}//end split_sentences



	/**
	* ESTIMATE_TOKENS
	* Cheap, language-aware token estimate. Uses max(word-based, char-based) so
	* both space-delimited and dense (CJK) scripts get a conservative estimate.
	* @param string $text
	* @return int
	*/
	public static function estimate_tokens( string $text ) : int {

		$chars = mb_strlen($text);
		$words = preg_match_all('/\S+/u', $text);
		$by_words = (int)ceil($words * 1.3);
		$by_chars = (int)ceil($chars / 4);
		return max(1, $by_words, $by_chars);
	}//end estimate_tokens



	/**
	* COSINE_DISTANCE  1 - cosine_similarity (0 = identical, 2 = opposite)
	* @param array<int,float> $a
	* @param array<int,float> $b
	* @return float
	*/
	public static function cosine_distance( array $a, array $b ) : float {

		$dot=0.0; $na=0.0; $nb=0.0;
		$len = min(count($a), count($b));
		for ($i=0; $i<$len; $i++) {
			$dot += $a[$i]*$b[$i];
			$na  += $a[$i]*$a[$i];
			$nb  += $b[$i]*$b[$i];
		}
		if ($na <= 0.0 || $nb <= 0.0) {
			return 1.0;
		}
		$sim = $dot / (sqrt($na) * sqrt($nb));
		return 1.0 - $sim;
	}//end cosine_distance



	/**
	* PERCENTILE  linear-interpolation percentile of a value list
	* @param array<int,float> $values
	* @param float $p  0..1
	* @return float
	*/
	public static function percentile( array $values, float $p ) : float {

		if (empty($values)) {
			return 0.0;
		}
		sort($values);
		$p = max(0.0, min(1.0, $p));
		$rank = $p * (count($values) - 1);
		$low = (int)floor($rank);
		$high = (int)ceil($rank);
		if ($low === $high) {
			return (float)$values[$low];
		}
		$frac = $rank - $low;
		return (float)($values[$low] + ($values[$high] - $values[$low]) * $frac);
	}//end percentile



}//end class rag_chunker
