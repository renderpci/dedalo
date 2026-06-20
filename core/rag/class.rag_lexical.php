<?php declare(strict_types=1);
/**
* CLASS RAG_LEXICAL
* Lexical (full-text) retrieval over the stored source_text, used as the second
* leg of HYBRID retrieval. Pure-vector ANN misses exact tokens that dominate
* heritage queries — proper names, accession/inventory numbers, archival
* signatures — which a lexical match catches. The two ranked lists are fused
* with RRF (rag_fusion) in retrieval.php.
*
* Uses the 'simple' text-search config (language-agnostic, good for a
* multilingual corpus) with plainto_tsquery; results are ordered by ts_rank.
* The query text is passed as a bound parameter.
*
* @package Dedalo
* @subpackage Rag
*/
abstract class rag_lexical {



	/**
	* QUERY
	* @param string $query_text
	* @param int $k
	* @param array<int,string> $section_tipos = []
	* @param string $modality = 'text'
	* @return array<int,array<string,mixed>>  ranked candidate chunks (best first)
	*/
	public static function query( string $query_text, int $k, array $section_tipos=[], string $modality='text' ) : array {

		$query_text = trim($query_text);
		if ($query_text === '') {
			return [];
		}

		$params		= [ $query_text, $modality ];
		$where		= "modality = $2 AND source_text IS NOT NULL";
		$next		= 3;

		if (!empty($section_tipos)) {
			$where .= ' AND section_tipo = ANY($' . $next . '::text[])';
			$params[] = '{' . implode(',', array_map(static fn($t) => '"' . str_replace('"', '', (string)$t) . '"', $section_tipos)) . '}';
			$next++;
		}

		$limit_param = $next;
		$params[] = max(1, $k);

		// ts_rank over a 'simple' tsvector with accent-folding (f_unaccent), so
		// "excavacion" matches "excavación". The @@ expression matches the GIN
		// index expression in rag_embeddings.sql exactly, so the index is used.
		// plainto_tsquery tolerates arbitrary input safely (no tsquery injection).
		$sql = "SELECT section_tipo, section_id, component_tipo, lang, chunk_index,
					source_text, source_kind, modality, egress_class, parent_key, chunk_meta,
					ts_rank(to_tsvector('simple', f_unaccent(coalesce(source_text,''))), plainto_tsquery('simple', f_unaccent($1))) AS lex_rank
				FROM rag_embeddings
				WHERE " . $where . "
				  AND to_tsvector('simple', f_unaccent(coalesce(source_text,''))) @@ plainto_tsquery('simple', f_unaccent($1))
				ORDER BY lex_rank DESC
				LIMIT $" . $limit_param;

		$result = DBi_vector::exec($sql, $params);
		if ($result === false) {
			return [];
		}

		$rows = [];
		while ($row = pg_fetch_assoc($result)) {
			$row['section_id']	= (int)$row['section_id'];
			$row['chunk_index']	= (int)$row['chunk_index'];
			$row['lex_rank']	= (float)$row['lex_rank'];
			if (isset($row['chunk_meta']) && is_string($row['chunk_meta'])) {
				$row['chunk_meta'] = json_decode($row['chunk_meta'], true);
			}
			$rows[] = $row;
		}
		return $rows;
	}//end query



}//end class rag_lexical
