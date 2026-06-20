<?php declare(strict_types=1);
/**
* CLASS RAG_FUSION
* Reciprocal Rank Fusion (RRF) for hybrid retrieval. Combines several ranked
* candidate lists (dense ANN, lexical BM25/trigram, …) without needing to
* normalise their incomparable scores: each item's fused score is the sum over
* lists of 1 / (k + rank), rank being 1-based position in that list.
*
* Pure, dependency-free, and fully unit-testable.
*
* @package Dedalo
* @subpackage Rag
*/
abstract class rag_fusion {



	/**
	* FUSE
	* @param array<int,array<int,array<string,mixed>>> $ranked_lists
	*        a list of ranked candidate lists; each candidate is an assoc array
	*        carrying at least the keys named in $id_keys.
	* @param array<int,string> $id_keys  fields that together identify a candidate
	*        (default the chunk identity).
	* @param int $k  RRF constant (default 60).
	* @return array<int,array<string,mixed>>  fused candidates, each with an added
	*        'rrf_score', sorted descending by that score. The first-seen full row
	*        for each id is preserved (so source_text/chunk_meta survive).
	*/
	public static function fuse( array $ranked_lists, array $id_keys=['section_tipo','section_id','component_tipo','lang','chunk_index'], int $k=60 ) : array {

		$scores	= [];
		$rows	= [];

		foreach ($ranked_lists as $list) {
			$rank = 0;
			foreach ($list as $item) {
				$rank++;
				$id = self::identity($item, $id_keys);
				if (!isset($scores[$id])) {
					$scores[$id] = 0.0;
					$rows[$id]   = $item;
				}
				$scores[$id] += 1.0 / ($k + $rank);
			}
		}

		$out = [];
		foreach ($scores as $id => $score) {
			$row = $rows[$id];
			$row['rrf_score'] = $score;
			$out[] = $row;
		}

		usort($out, static fn($a, $b) => $b['rrf_score'] <=> $a['rrf_score']);

		return $out;
	}//end fuse



	/**
	* IDENTITY  stable id string for a candidate from its id keys
	* @param array<string,mixed> $item
	* @param array<int,string> $id_keys
	* @return string
	*/
	private static function identity( array $item, array $id_keys ) : string {

		$parts = [];
		foreach ($id_keys as $key) {
			$parts[] = (string)($item[$key] ?? '');
		}
		return implode('|', $parts);
	}//end identity



	/**
	* COLLAPSE_TO_RECORDS
	* Reduce a list of chunk candidates to best-scored-per-record entries,
	* preserving the winning chunk's provenance. Used by semantic_search /
	* similar_to (which return records, not passages).
	* @param array<int,array<string,mixed>> $candidates
	* @param string $score_key = 'rrf_score'
	* @return array<int,array<string,mixed>>  one row per (section_tipo, section_id)
	*/
	public static function collapse_to_records( array $candidates, string $score_key='rrf_score' ) : array {

		$best = [];
		foreach ($candidates as $c) {
			$key = ($c['section_tipo'] ?? '') . '|' . ($c['section_id'] ?? '');
			$score = (float)($c[$score_key] ?? 0.0);
			if (!isset($best[$key]) || $score > (float)($best[$key][$score_key] ?? -INF)) {
				$best[$key] = $c;
			}
		}

		$out = array_values($best);
		usort($out, static fn($a, $b) => (float)($b[$score_key] ?? 0) <=> (float)($a[$score_key] ?? 0));

		return $out;
	}//end collapse_to_records



}//end class rag_fusion
