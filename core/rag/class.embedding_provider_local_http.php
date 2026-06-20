<?php declare(strict_types=1);
/**
* CLASS EMBEDDING_PROVIDER_LOCAL_HTTP
* Default text-embedding provider. Targets a local OpenAI-/Ollama-compatible
* embeddings endpoint (Ollama /api/embed, sentence-transformers, TEI). Local by
* default for privacy — heritage text never leaves the host.
*
* Supports both the Ollama batch shape ({embeddings:[[...]]}) and the
* OpenAI-compatible shape ({data:[{embedding:[...]}]}), auto-detected from the
* response. A Unix socket may be configured for socket-only local services.
*
* @package Dedalo
* @subpackage Rag
*/
final class embedding_provider_local_http extends embedding_provider {



	public function get_provider() : string {
		return 'local_http';
	}



	/**
	* EMBED_RAW
	* @param array<int,string> $texts
	* @return array<int,array<int,float>>
	*/
	protected function embed_raw( array $texts ) : array {

		// Ollama-style payload: {model, input:[...]} (Ollama >=0.1.39 /api/embed
		// accepts an array input and returns {embeddings:[...]})
		$payload = [
			'model'	=> $this->model,
			'input'	=> $texts
		];

		$decoded = $this->post_json( $this->endpoint, $payload );
		if ($decoded === null) {
			return [];
		}

		return self::extract_vectors( $decoded, count($texts) );
	}//end embed_raw



	/**
	* EXTRACT_VECTORS
	* Normalise the several common embeddings response shapes into float[][].
	* @param object $decoded
	* @param int $expected
	* @return array<int,array<int,float>>
	*/
	private static function extract_vectors( object $decoded, int $expected ) : array {

		$vectors = [];

		// Ollama batch: { embeddings: [[...], ...] }
		if (isset($decoded->embeddings) && is_array($decoded->embeddings)) {
			foreach ($decoded->embeddings as $v) {
				$vectors[] = array_map('floatval', (array)$v);
			}
			return $vectors;
		}

		// Ollama single: { embedding: [...] }
		if (isset($decoded->embedding) && is_array($decoded->embedding)) {
			return [ array_map('floatval', (array)$decoded->embedding) ];
		}

		// OpenAI-compatible: { data: [ { embedding:[...] }, ... ] }
		if (isset($decoded->data) && is_array($decoded->data)) {
			foreach ($decoded->data as $item) {
				if (isset($item->embedding) && is_array($item->embedding)) {
					$vectors[] = array_map('floatval', (array)$item->embedding);
				}
			}
			return $vectors;
		}

		return $vectors;
	}//end extract_vectors



}//end class embedding_provider_local_http
