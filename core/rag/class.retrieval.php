<?php declare(strict_types=1);
/**
* CLASS RETRIEVAL
* The two-step cross-DB bridge with the corrections the review demanded:
*
*  1. HYBRID candidate generation — dense ANN (rag_vector_store) + lexical
*     BM25/trigram (rag_lexical), fused with Reciprocal Rank Fusion (rag_fusion).
*     Pure-vector misses proper nouns / accession numbers that dominate heritage
*     queries; the lexical leg catches them.
*  2. RERANK — optional cross-encoder seam (pass-through when unconfigured).
*  3. EXPLICIT ACL — security::user_can_access_record() on every candidate,
*     applied BEFORE any score/count is returned, because the SQO filter_by_locators
*     fast path does NOT run the project filter. This is THE security boundary
*     for retrieval; it runs for ALL actions, not just ask().
*  4. SHAPE — semantic_search/similar_to collapse to records; retrieve/ask keep
*     PASSAGES (source_text + chunk_meta + parent_key) for grounded generation.
*
* @package Dedalo
* @subpackage Rag
*/
abstract class retrieval {



	/**
	* RETRIEVE_PASSAGES
	* Hybrid → rerank → ACL → top-k passages. Used by retrieve / ask /
	* get_agent_context.
	* @param string $query
	* @param array $opts {
	*   section_tipos: string[], modality: 'text'|'image',
	*   top_k: int, candidates: int, max_distance: ?float, user_id: ?int,
	*   hybrid: ?bool
	* }
	* @return array<int,array<string,mixed>>  passages (ACL-filtered), best first
	*/
	public static function retrieve_passages( string $query, array $opts=[] ) : array {

		$query = trim($query);
		if ($query === '' || !DBi_vector::is_configured()) {
			return [];
		}

		$section_tipos	= $opts['section_tipos'] ?? [];
		$modality		= $opts['modality'] ?? 'text';
		$top_k			= (int)($opts['top_k'] ?? (defined('DEDALO_RAG_TOP_K') ? DEDALO_RAG_TOP_K : 8));
		$candidates		= (int)($opts['candidates'] ?? (defined('DEDALO_RAG_RERANK_CANDIDATES') ? DEDALO_RAG_RERANK_CANDIDATES : 40));
		$max_distance	= $opts['max_distance'] ?? (defined('DEDALO_RAG_MAX_DISTANCE') ? (float)DEDALO_RAG_MAX_DISTANCE : null);
		$user_id		= $opts['user_id'] ?? null;
		$hybrid			= $opts['hybrid'] ?? (defined('DEDALO_RAG_HYBRID_ENABLED') ? DEDALO_RAG_HYBRID_ENABLED : true);

		$provider = embedding_provider_factory::get();
		if ($provider === null) {
			return [];
		}

		// 1a. dense ANN
		$embed = $provider->embed([$query]);
		$query_vector = $embed->vectors[0] ?? null;
		if ($query_vector === null) {
			return [];
		}
		if (defined('DEDALO_RAG_HNSW_EF_SEARCH')) {
			DBi_vector::set_session_ef_search((int)DEDALO_RAG_HNSW_EF_SEARCH);
		}
		$dense = rag_vector_store::query(
			$query_vector, $provider->get_model(), $candidates, $max_distance, $section_tipos, $modality
		);

		// 1b. lexical
		$ranked_lists = [ $dense ];
		if ($hybrid === true) {
			$lexical = rag_lexical::query($query, $candidates, $section_tipos, $modality);
			if (!empty($lexical)) {
				$ranked_lists[] = $lexical;
			}
		}

		// 1c. fuse
		$fused = (count($ranked_lists) > 1)
			? rag_fusion::fuse($ranked_lists, ['section_tipo','section_id','component_tipo','lang','chunk_index'], (defined('DEDALO_RAG_RRF_K') ? (int)DEDALO_RAG_RRF_K : 60))
			: self::tag_score($dense);

		// 2. rerank (pass-through unless a reranker is wired)
		$reranked = self::rerank($query, $fused);

		// 3. EXPLICIT ACL — before truncation/return; no existence oracle
		$accessible = rag_security::filter_accessible($reranked, $user_id);

		// 3b. RET-03 diversify: cap passages per record so one long document can't
		// crowd out others (opt-in via DEDALO_RAG_MAX_PASSAGES_PER_RECORD).
		$max_per_record = (int)($opts['max_per_record'] ?? (defined('DEDALO_RAG_MAX_PASSAGES_PER_RECORD') ? DEDALO_RAG_MAX_PASSAGES_PER_RECORD : 0));
		if ($max_per_record > 0) {
			$accessible = self::diversify($accessible, $max_per_record);
		}

		// 4. top-k
		return array_slice($accessible, 0, $top_k);
	}//end retrieve_passages



	/**
	* DIVERSIFY  keep at most $max passages per (section_tipo, section_id), order preserved
	* @param array<int,array<string,mixed>> $passages
	* @param int $max
	* @return array<int,array<string,mixed>>
	*/
	private static function diversify( array $passages, int $max ) : array {

		$counts = [];
		$out = [];
		foreach ($passages as $p) {
			$key = ($p['section_tipo'] ?? '') . '|' . ($p['section_id'] ?? '');
			$counts[$key] = ($counts[$key] ?? 0) + 1;
			if ($counts[$key] <= $max) {
				$out[] = $p;
			}
		}
		return $out;
	}//end diversify



	/**
	* SEMANTIC_SEARCH
	* Record-level results (collapsed best-score-per-record), ACL-filtered.
	* @param string $query
	* @param array $opts
	* @return array<int,array<string,mixed>>  records w/ provenance
	*/
	public static function semantic_search( string $query, array $opts=[] ) : array {

		// over-fetch passages so the post-ACL, post-collapse set still fills top_k
		$top_k			= (int)($opts['top_k'] ?? (defined('DEDALO_RAG_TOP_K') ? DEDALO_RAG_TOP_K : 8));
		$factor			= defined('DEDALO_RAG_OVERFETCH_FACTOR') ? max(1, (int)DEDALO_RAG_OVERFETCH_FACTOR) : 3;
		$opts['top_k']	= max($top_k * $factor, $top_k);

		$passages = self::retrieve_passages($query, $opts);
		$records  = rag_fusion::collapse_to_records($passages, isset($passages[0]['rrf_score']) ? 'rrf_score' : 'score');

		return array_slice($records, 0, $top_k);
	}//end semantic_search



	/**
	* EXPAND_PARENTS
	* Small-to-big: replace each passage with its parent section's full text
	* (concatenated sibling chunks sharing parent_key) up to a token budget, for
	* coherent generation context. Falls back to the passage when no parent_key.
	* @param array<int,array<string,mixed>> $passages
	* @param int $token_budget
	* @return array<int,array<string,mixed>>
	*/
	public static function expand_parents( array $passages, int $token_budget ) : array {

		if (empty($passages)) {
			return [];
		}

		// SEC-RAG-01: the sibling query below is scoped to the SAME record
		// (section_tipo + section_id + component_tipo + lang), and Dédalo ACL is
		// per-record — so siblings are already covered by the ACL check the caller
		// ran on this passage. If component-level ACL is ever introduced, each
		// sibling chunk must be re-checked here before inclusion.
		$out = [];
		$seen_parents = [];
		foreach ($passages as $p) {

			$parent_key = $p['parent_key'] ?? null;
			if (empty($parent_key)) {
				$out[] = $p;
				continue;
			}
			if (isset($seen_parents[$parent_key])) {
				continue; // already expanded this parent
			}
			$seen_parents[$parent_key] = true;

			$result = DBi_vector::exec(
				'SELECT chunk_index, source_text
					FROM rag_embeddings
					WHERE section_tipo=$1 AND section_id=$2 AND component_tipo=$3 AND lang=$4 AND parent_key=$5
					ORDER BY chunk_index ASC',
				[ $p['section_tipo'], (int)$p['section_id'], $p['component_tipo'], $p['lang'], $parent_key ]
			);
			$texts = [];
			if ($result !== false) {
				while ($r = pg_fetch_assoc($result)) {
					$texts[] = $r['source_text'];
				}
			}
			$merged = trim(implode("\n", array_filter($texts)));
			if ($merged === '') {
				$merged = $p['source_text'] ?? '';
			}
			// clamp to budget (approximate, chars≈4*tokens)
			$max_chars = $token_budget * 4;
			if (mb_strlen($merged) > $max_chars) {
				$merged = mb_substr($merged, 0, $max_chars);
			}

			$expanded = $p;
			$expanded['source_text'] = $merged;
			$out[] = $expanded;
		}

		return $out;
	}//end expand_parents



	/**
	* RERANK  cross-encoder seam. Pass-through until a reranker is configured.
	* @param string $query
	* @param array<int,array<string,mixed>> $candidates
	* @return array<int,array<string,mixed>>
	*/
	private static function rerank( string $query, array $candidates ) : array {

		// Pass-through unless a reranker endpoint is configured.
		if (empty($candidates)
			|| !defined('DEDALO_RAG_RERANK_ENDPOINT')
			|| empty(DEDALO_RAG_RERANK_ENDPOINT)) {
			return $candidates;
		}
		return rag_reranker::rerank($query, $candidates);
	}//end rerank



	/**
	* TAG_SCORE  add a uniform 'score' (1/(1+distance)) when not fusing
	* @param array<int,array<string,mixed>> $rows
	* @return array<int,array<string,mixed>>
	*/
	private static function tag_score( array $rows ) : array {

		foreach ($rows as &$r) {
			$d = (float)($r['distance'] ?? 1.0);
			$r['score'] = 1.0 / (1.0 + max(0.0, $d));
		}
		unset($r);
		return $rows;
	}//end tag_score



}//end class retrieval
