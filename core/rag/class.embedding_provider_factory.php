<?php declare(strict_types=1);
/**
* CLASS EMBEDDING_PROVIDER_FACTORY
* Resolves the configured embedding provider from the DEDALO_RAG_* constants and
* caches it per process. The default model is a MULTILINGUAL local model
* (bge-m3 / multilingual-e5) — heritage collections are overwhelmingly
* non-English, so an English-only default (e.g. nomic-embed-text) would silently
* degrade retrieval.
*
* @package Dedalo
* @subpackage Rag
*/
abstract class embedding_provider_factory {



	/**
	* @var ?embedding_provider $instance  per-process cache
	*/
	private static ?embedding_provider $instance = null;



	/**
	* GET
	* @return ?embedding_provider  null when RAG is not configured
	*/
	public static function get() : ?embedding_provider {

		if (self::$instance !== null) {
			return self::$instance;
		}

		$provider = defined('DEDALO_RAG_PROVIDER') ? DEDALO_RAG_PROVIDER : 'local_http';
		$config = [
			'model'			=> defined('DEDALO_RAG_MODEL') ? DEDALO_RAG_MODEL : 'bge-m3',
			'endpoint'		=> defined('DEDALO_RAG_ENDPOINT') ? DEDALO_RAG_ENDPOINT : '',
			'api_key'		=> defined('DEDALO_RAG_API_KEY') ? DEDALO_RAG_API_KEY : null,
			'unix_socket'	=> defined('DEDALO_RAG_UNIX_SOCKET') ? DEDALO_RAG_UNIX_SOCKET : null,
			'max_batch'		=> defined('DEDALO_RAG_BATCH_SIZE') ? (int)DEDALO_RAG_BATCH_SIZE : 32
		];

		if (empty($config['endpoint'])) {
			debug_log(__METHOD__ . ' Error. DEDALO_RAG_ENDPOINT is not configured', logger::WARNING);
			return null;
		}

		self::$instance = self::build( (string)$provider, $config );

		return self::$instance;
	}//end get



	/**
	* BUILD
	* @param string $provider
	* @param array $config
	* @return ?embedding_provider
	*/
	public static function build( string $provider, array $config ) : ?embedding_provider {

		switch ($provider) {
			case 'openai':
			case 'voyage':
			case 'cohere':
			case 'jina':
				// all OpenAI-/v1/embeddings-compatible; endpoint/key differ by config
				return new embedding_provider_openai( $config );

			case 'local_http':
			default:
				return new embedding_provider_local_http( $config );
		}
	}//end build



	/**
	* RESET  (tests)
	* @return void
	*/
	public static function reset() : void {
		self::$instance = null;
	}//end reset



}//end class embedding_provider_factory
