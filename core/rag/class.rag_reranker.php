<?php declare(strict_types=1);
/**
* CLASS RAG_RERANKER
* Cross-encoder reranking stage for hybrid retrieval. After RRF fusion produces
* a candidate order from cheap bi-encoder + lexical signals, a cross-encoder
* reranker (bge-reranker-v2-m3, mxbai-rerank, Cohere/Jina rerank, or a local TEI
* reranker) scores each (query, passage) pair jointly — materially improving
* precision@k, which is the single highest-impact retrieval-quality lever.
*
* Configured via DEDALO_RAG_RERANK_ENDPOINT / _MODEL / _API_KEY. When the
* endpoint is unset, retrieval::rerank() never calls this class (pass-through).
*
* Request shape (Cohere/Jina/TEI-compatible): {model, query, documents:[text...]}
* Response: {results:[{index, relevance_score}]} OR {scores:[float...]}.
* On any failure the ORIGINAL order is returned (fail-open to the fused order,
* never drops candidates).
*
* @package Dedalo
* @subpackage Rag
*/
abstract class rag_reranker {



	/**
	* RERANK
	* @param string $query
	* @param array<int,array<string,mixed>> $candidates  (carry source_text)
	* @return array<int,array<string,mixed>>  reordered, each with 'rerank_score'
	*/
	public static function rerank( string $query, array $candidates ) : array {

		if (empty($candidates) || !defined('DEDALO_RAG_RERANK_ENDPOINT') || empty(DEDALO_RAG_RERANK_ENDPOINT)) {
			return $candidates;
		}

		$documents = [];
		foreach ($candidates as $c) {
			$documents[] = (string)($c['source_text'] ?? '');
		}

		$payload = [
			'model'		=> defined('DEDALO_RAG_RERANK_MODEL') ? DEDALO_RAG_RERANK_MODEL : 'reranker',
			'query'		=> $query,
			'documents'	=> $documents
		];

		$headers = ['Content-Type: application/json'];
		if (defined('DEDALO_RAG_RERANK_API_KEY') && DEDALO_RAG_RERANK_API_KEY) {
			$headers[] = 'Authorization: Bearer ' . DEDALO_RAG_RERANK_API_KEY;
		}

		$options = new stdClass();
			$options->url			= DEDALO_RAG_RERANK_ENDPOINT;
			$options->post			= true;
			$options->header		= false;
			$options->postfields	= json_encode($payload);
			$options->httpheader	= $headers;
			$options->timeout		= defined('DEDALO_RAG_RERANK_TIMEOUT') ? (int)DEDALO_RAG_RERANK_TIMEOUT : 30;

		$response = curl_request($options);
		if ((int)($response->code ?? 0) !== 200 || empty($response->result)) {
			debug_log(__METHOD__ . ' Notice. Reranker non-200; keeping fused order', logger::WARNING);
			return $candidates; // fail-open
		}

		$scores = self::extract_scores( json_decode($response->result), count($candidates) );
		if ($scores === null) {
			return $candidates; // unparseable → keep order
		}

		// attach scores and sort desc (stable: preserve fused order on ties)
		$indexed = [];
		foreach ($candidates as $i => $c) {
			$c['rerank_score'] = $scores[$i] ?? -INF;
			$indexed[] = ['i' => $i, 'row' => $c];
		}
		usort($indexed, static function($a, $b) {
			$cmp = ($b['row']['rerank_score'] <=> $a['row']['rerank_score']);
			return $cmp !== 0 ? $cmp : ($a['i'] <=> $b['i']);
		});

		return array_map(static fn($x) => $x['row'], $indexed);
	}//end rerank



	/**
	* EXTRACT_SCORES  normalise the common reranker response shapes to [i => score]
	* @param mixed $decoded
	* @param int $expected
	* @return array<int,float>|null
	*/
	private static function extract_scores( mixed $decoded, int $expected ) : ?array {

		if (!is_object($decoded)) {
			return null;
		}

		// {results:[{index, relevance_score|score}]}
		if (isset($decoded->results) && is_array($decoded->results)) {
			$scores = array_fill(0, $expected, -INF);
			foreach ($decoded->results as $r) {
				$idx = isset($r->index) ? (int)$r->index : null;
				$sc  = $r->relevance_score ?? ($r->score ?? null);
				if ($idx !== null && $idx >= 0 && $idx < $expected && is_numeric($sc)) {
					$scores[$idx] = (float)$sc;
				}
			}
			return $scores;
		}

		// {scores:[float...]} aligned to input order
		if (isset($decoded->scores) && is_array($decoded->scores)) {
			$scores = [];
			foreach ($decoded->scores as $sc) {
				$scores[] = (float)$sc;
			}
			return $scores;
		}

		return null;
	}//end extract_scores



}//end class rag_reranker
