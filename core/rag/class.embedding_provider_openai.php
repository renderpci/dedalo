<?php declare(strict_types=1);
/**
* CLASS EMBEDDING_PROVIDER_OPENAI
* External text-embedding provider for OpenAI-compatible /v1/embeddings APIs
* (OpenAI, and — via thin subclasses overriding the endpoint/header — Voyage,
* Cohere, Jina). Requires a Bearer api_key.
*
* SECURITY: this provider sends text to a third party. The indexer's per-record
* egress gate (rag_security::record_can_egress) MUST forbid restricted records
* from ever reaching an external provider; this class does not relax that.
*
* @package Dedalo
* @subpackage Rag
*/
class embedding_provider_openai extends embedding_provider {



	public function get_provider() : string {
		return 'openai';
	}



	/**
	* EMBED_RAW
	* @param array<int,string> $texts
	* @return array<int,array<int,float>>
	*/
	protected function embed_raw( array $texts ) : array {

		if (empty($this->api_key)) {
			debug_log(__METHOD__ . ' Error. External embedding provider requires an api_key', logger::ERROR);
			return [];
		}

		$payload = [
			'model'	=> $this->model,
			'input'	=> $texts
		];

		$decoded = $this->post_json(
			$this->endpoint,
			$payload,
			['Authorization: Bearer ' . $this->api_key]
		);
		if ($decoded === null) {
			return [];
		}

		// OpenAI shape: { data: [ { embedding:[...], index:n }, ... ] }
		if (!isset($decoded->data) || !is_array($decoded->data)) {
			return [];
		}

		// preserve index order
		$by_index = [];
		foreach ($decoded->data as $item) {
			$idx = isset($item->index) ? (int)$item->index : count($by_index);
			$by_index[$idx] = array_map('floatval', (array)($item->embedding ?? []));
		}
		ksort($by_index);

		return array_values($by_index);
	}//end embed_raw



}//end class embedding_provider_openai
