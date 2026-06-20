<?php declare(strict_types=1);
/**
* CLASS EMBEDDING_PROVIDER_MULTIMODAL
* Pluggable JOINT text+image encoder (CLIP / SigLIP-2 / jina-clip-style) for
* image similarity and text→image search. The defining property of a joint model
* is that its image tower and text tower share ONE space — so a text query can be
* compared against image vectors.
*
* THE CRITICAL CONTRACT: a text→image query MUST be embedded with
* embed_text_for_image_search() (this model's text tower), NEVER with the default
* text embedding_provider — those live in different spaces and cosine between them
* is noise.
*
* Default posture is LOCAL (a small image-embedding HTTP sidecar) so restricted /
* non-publishable objects can be embedded without egress. External multimodal
* APIs are allowed only for publishable objects (gated in rag_media_extractor).
*
* Endpoint contract (provider-agnostic; any server matching it works):
*   POST {endpoint}/image  body {model, images:[base64,…]}  → {embeddings:[[…],…]}
*   POST {endpoint}/text   body {model, input:[text,…]}     → {embeddings:[[…],…]}
* (also tolerates the OpenAI-style {data:[{embedding:[…]}]} shape.)
*
* @package Dedalo
* @subpackage Rag
*/
class embedding_provider_multimodal {



	/** @var ?embedding_provider_multimodal $instance  per-process cache */
	private static ?embedding_provider_multimodal $instance = null;

	protected string $provider;
	protected string $model;
	protected string $endpoint;
	protected ?string $api_key;
	protected int $max_batch;
	protected ?int $discovered_dimension = null;



	/**
	* __construct
	* @param array $config {provider, model, endpoint, api_key?, max_batch?}
	*/
	public function __construct( array $config ) {
		$this->provider		= (string)($config['provider'] ?? 'local');
		$this->model		= (string)($config['model'] ?? '');
		$this->endpoint		= rtrim((string)($config['endpoint'] ?? ''), '/');
		$this->api_key		= $config['api_key'] ?? null;
		$this->max_batch	= (int)($config['max_batch'] ?? 16);
	}//end __construct



	/**
	* IS_CONFIGURED  multimodal media on + an endpoint present
	* @return bool
	*/
	public static function is_configured() : bool {
		return defined('DEDALO_RAG_MEDIA_ENABLED') && DEDALO_RAG_MEDIA_ENABLED===true
			&& defined('DEDALO_RAG_MULTIMODAL_ENDPOINT') && !empty(DEDALO_RAG_MULTIMODAL_ENDPOINT);
	}//end is_configured



	/**
	* GET  per-process configured instance (or null when not configured)
	* @return ?embedding_provider_multimodal
	*/
	public static function get() : ?embedding_provider_multimodal {

		if (self::$instance !== null) {
			return self::$instance;
		}
		if (!self::is_configured()) {
			return null;
		}
		self::$instance = new self([
			'provider'	=> defined('DEDALO_RAG_MULTIMODAL_PROVIDER') ? DEDALO_RAG_MULTIMODAL_PROVIDER : 'local',
			'model'		=> defined('DEDALO_RAG_MULTIMODAL_MODEL') ? DEDALO_RAG_MULTIMODAL_MODEL : 'clip',
			'endpoint'	=> DEDALO_RAG_MULTIMODAL_ENDPOINT,
			'api_key'	=> defined('DEDALO_RAG_MULTIMODAL_API_KEY') ? DEDALO_RAG_MULTIMODAL_API_KEY : null,
			'max_batch'	=> defined('DEDALO_RAG_BATCH_SIZE') ? (int)DEDALO_RAG_BATCH_SIZE : 16
		]);
		return self::$instance;
	}//end get



	public function get_provider() : string { return $this->provider; }
	public function get_model() : string { return $this->model; }
	public function get_dimension() : ?int { return $this->discovered_dimension; }
	public function is_external() : bool { return !in_array($this->provider, ['local'], true); }



	/**
	* EMBED_IMAGE
	* @param array<int,string> $images_base64  one base64 JPEG per image
	* @return object {vectors, dimension, model, provider}
	*/
	public function embed_image( array $images_base64 ) : object {
		return $this->call('/image', 'images', $images_base64);
	}//end embed_image



	/**
	* EMBED_TEXT_FOR_IMAGE_SEARCH  (this model's text tower — joint space)
	* @param array<int,string> $texts
	* @return object {vectors, dimension, model, provider}
	*/
	public function embed_text_for_image_search( array $texts ) : object {
		return $this->call('/text', 'input', $texts);
	}//end embed_text_for_image_search



	/**
	* CALL  batched POST + dimension discovery/validation (mirrors embedding_provider)
	* @param string $path
	* @param string $field  payload field name ('images' | 'input')
	* @param array<int,string> $items
	* @return object
	*/
	private function call( string $path, string $field, array $items ) : object {

		$out = new stdClass();
			$out->vectors	= [];
			$out->dimension	= $this->discovered_dimension ?? 0;
			$out->model		= $this->model;
			$out->provider	= $this->provider;

		if (empty($items)) {
			return $out;
		}

		$headers = ['Content-Type: application/json'];
		if (!empty($this->api_key)) {
			$headers[] = 'Authorization: Bearer ' . $this->api_key;
		}

		$vectors = [];
		foreach (array_chunk($items, max(1, $this->max_batch)) as $batch) {

			$options = new stdClass();
				$options->url			= $this->endpoint . $path;
				$options->post			= true;
				$options->header		= false;
				$options->postfields	= json_encode(['model'=>$this->model, $field=>array_values($batch)]);
				$options->httpheader	= $headers;
				$options->timeout		= defined('DEDALO_RAG_PROVIDER_TIMEOUT') ? (int)DEDALO_RAG_PROVIDER_TIMEOUT : 60;

			$response = curl_request($options);
			if ((int)($response->code ?? 0) !== 200 || empty($response->result)) {
				debug_log(__METHOD__ . ' Error. Multimodal endpoint non-200 (' . ($response->code ?? 'n/a') . ')', logger::ERROR);
				$out->vectors = [];
				return $out;
			}
			$batch_vectors = self::extract_vectors( json_decode($response->result) );
			if (count($batch_vectors) !== count($batch)) {
				debug_log(__METHOD__ . ' Error. Multimodal returned ' . count($batch_vectors) . ' vectors for ' . count($batch) . ' inputs', logger::ERROR);
				$out->vectors = [];
				return $out;
			}
			foreach ($batch_vectors as $v) {
				$vectors[] = $v;
			}
		}

		$dimension = count($vectors[0] ?? []);
		if ($dimension < 1) {
			$out->vectors = [];
			return $out;
		}
		foreach ($vectors as $v) {
			if (count($v) !== $dimension) {
				$out->vectors = [];
				return $out;
			}
		}

		$this->discovered_dimension = $dimension;
		$out->vectors	= $vectors;
		$out->dimension	= $dimension;
		return $out;
	}//end call



	/**
	* EXTRACT_VECTORS  normalise {embeddings:[…]} or {data:[{embedding:[…]}]}
	* @param mixed $decoded
	* @return array<int,array<int,float>>
	*/
	public static function extract_vectors( mixed $decoded ) : array {

		if (!is_object($decoded)) {
			return [];
		}
		$vectors = [];
		if (isset($decoded->embeddings) && is_array($decoded->embeddings)) {
			foreach ($decoded->embeddings as $v) {
				$vectors[] = array_map('floatval', (array)$v);
			}
			return $vectors;
		}
		if (isset($decoded->data) && is_array($decoded->data)) {
			foreach ($decoded->data as $item) {
				if (isset($item->embedding) && is_array($item->embedding)) {
					$vectors[] = array_map('floatval', (array)$item->embedding);
				}
			}
		}
		return $vectors;
	}//end extract_vectors



	/** RESET (tests) */
	public static function reset() : void { self::$instance = null; }



}//end class embedding_provider_multimodal
