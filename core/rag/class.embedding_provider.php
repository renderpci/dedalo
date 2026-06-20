<?php declare(strict_types=1);
/**
* CLASS EMBEDDING_PROVIDER
* Abstract base for pluggable text-embedding providers.
*
* Concrete providers implement embed_raw() (one HTTP call for a batch of texts).
* The base supplies batching and, crucially, DIMENSION DISCOVERY: the embedding
* dimension is read from the first vector returned, never hard-coded — this is
* what lets the same code drive a 384-dim, 768-dim, 1024-dim or 3072-dim model
* without configuration drift.
*
* embed() returns a result object:
*   { vectors: float[][], dimension: int, model: string, provider: string }
* On a transport/parse failure embed() returns vectors=[] and logs; callers must
* treat an empty/short result as "skip, do not write a garbage vector".
*
* @package Dedalo
* @subpackage Rag
*/
abstract class embedding_provider {



	/**
	* @var string $model  resolved model id
	* @var string $endpoint  resolved endpoint URL
	* @var ?string $api_key
	* @var ?string $unix_socket
	* @var int $max_batch
	* @var ?int $discovered_dimension
	*/
	protected string $model;
	protected string $endpoint;
	protected ?string $api_key;
	protected ?string $unix_socket;
	protected int $max_batch;
	protected ?int $discovered_dimension = null;



	/**
	* __construct
	* @param array $config  {model, endpoint, api_key?, unix_socket?, max_batch?}
	*/
	public function __construct( array $config ) {

		$this->model		= (string)($config['model'] ?? '');
		$this->endpoint		= (string)($config['endpoint'] ?? '');
		$this->api_key		= $config['api_key'] ?? null;
		$this->unix_socket	= $config['unix_socket'] ?? null;
		$this->max_batch	= (int)($config['max_batch'] ?? 32);
	}//end __construct



	/**
	* EMBED_RAW
	* One provider HTTP call for a batch of texts. MUST return a list of float
	* arrays (one per input) or [] on failure. No batching here — the base does it.
	* @param array<int,string> $texts
	* @return array<int,array<int,float>>
	*/
	abstract protected function embed_raw( array $texts ) : array;



	/**
	* EMBED
	* Batches $texts, calls embed_raw per batch, discovers the dimension from the
	* first non-empty vector, and validates that every returned vector matches.
	* @param array<int,string> $texts
	* @return object  { vectors, dimension, model, provider }
	*/
	public function embed( array $texts ) : object {

		$out = new stdClass();
			$out->vectors	= [];
			$out->dimension	= $this->discovered_dimension ?? 0;
			$out->model		= $this->model;
			$out->provider	= $this->get_provider();

		if (empty($texts)) {
			return $out;
		}

		$vectors = [];
		foreach (array_chunk($texts, max(1, $this->max_batch)) as $batch) {
			$batch_vectors = $this->embed_raw( array_values($batch) );
			if (count($batch_vectors) !== count($batch)) {
				// partial/failed batch: abort cleanly rather than mis-align vectors
				debug_log(__METHOD__ . ' Error. Provider returned ' . count($batch_vectors) . ' vectors for ' . count($batch) . ' inputs (model ' . $this->model . ')', logger::ERROR);
				$out->vectors = [];
				return $out;
			}
			foreach ($batch_vectors as $v) {
				$vectors[] = $v;
			}
		}

		// dimension discovery + validation
		$dimension = count($vectors[0] ?? []);
		if ($dimension < 1) {
			$out->vectors = [];
			return $out;
		}
		foreach ($vectors as $v) {
			if (count($v) !== $dimension) {
				debug_log(__METHOD__ . ' Error. Inconsistent vector dimension from provider ' . $this->get_provider(), logger::ERROR);
				$out->vectors = [];
				return $out;
			}
		}

		$this->discovered_dimension = $dimension;
		$out->vectors	= $vectors;
		$out->dimension	= $dimension;

		return $out;
	}//end embed



	/**
	* GET_PROVIDER  short provider id (e.g. 'local_http', 'openai')
	* @return string
	*/
	abstract public function get_provider() : string;



	public function get_model() : string {
		return $this->model;
	}



	public function get_dimension() : ?int {
		return $this->discovered_dimension;
	}



	public function get_max_batch() : int {
		return $this->max_batch;
	}



	/**
	* POST_JSON
	* Shared JSON POST helper built on curl_request(). Returns the decoded body
	* object on HTTP 200, or null otherwise. header=false so the result body is
	* clean JSON (no header block). Never logs the api key.
	* @param string $url
	* @param array $payload
	* @param array<int,string> $extra_headers = []
	* @return ?object
	*/
	protected function post_json( string $url, array $payload, array $extra_headers=[] ) : ?object {

		$options = new stdClass();
			$options->url			= $url;
			$options->post			= true;
			$options->header		= false; // body-only result
			$options->returntransfer= true;
			$options->postfields	= json_encode($payload);
			$options->httpheader	= array_merge(['Content-Type: application/json'], $extra_headers);
			$options->timeout		= defined('DEDALO_RAG_PROVIDER_TIMEOUT') ? (int)DEDALO_RAG_PROVIDER_TIMEOUT : 30;
			if (!empty($this->unix_socket)) {
				$options->unix_socket = $this->unix_socket;
			}

		$response = curl_request($options);
		if ((int)($response->code ?? 0) !== 200 || empty($response->result)) {
			debug_log(__METHOD__ . ' Error. Embedding endpoint non-200 (' . ($response->code ?? 'n/a') . ') for provider ' . $this->get_provider(), logger::ERROR);
			return null;
		}

		$decoded = json_decode($response->result);
		if (!is_object($decoded)) {
			debug_log(__METHOD__ . ' Error. Non-JSON embedding response for provider ' . $this->get_provider(), logger::ERROR);
			return null;
		}

		return $decoded;
	}//end post_json



}//end class embedding_provider
