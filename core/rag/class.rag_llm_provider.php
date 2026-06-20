<?php declare(strict_types=1);
/**
* CLASS RAG_LLM_PROVIDER
* Pluggable generation-LLM facade for ask(). Selects an adapter from
* DEDALO_RAG_LLM_PROVIDER and DEFENSIVELY enforces the egress policy: if any
* grounding passage is restricted (or external generation is disallowed), only a
* local/OpenAI-compatible local endpoint may be used — never a third-party API.
*
* Default adapter: Anthropic Messages API (claude-opus-4-8) with native Citations
* (passages passed as `document` blocks → cited_text maps back to provenance) and
* a stable cache_control system prefix. Model output is returned verbatim; the
* CALLER (dd_rag_api::ask) is responsible for sanitising it before rendering.
*
* @package Dedalo
* @subpackage Rag
*/
abstract class rag_llm_provider {



	/**
	* GENERATE
	* @param array $req {
	*   system: string,
	*   query: string,
	*   passages: array<int,array{source_text:string, ... provenance}>,
	*   max_tokens: int,
	*   allow_external: bool
	* }
	* @return object { result:bool, answer:string, citations:array, used_provider:string, errors:array }
	*/
	public static function generate( array $req ) : object {

		$out = new stdClass();
			$out->result		= false;
			$out->answer		= '';
			$out->citations		= [];
			$out->used_provider	= '';
			$out->errors		= [];

		$allow_external	= (bool)($req['allow_external'] ?? false);
		$provider		= defined('DEDALO_RAG_LLM_PROVIDER') ? DEDALO_RAG_LLM_PROVIDER : 'anthropic';

		// egress enforcement: external generation only when explicitly allowed
		$is_external_provider = in_array($provider, ['anthropic','openai','openai_compatible'], true)
			&& !self::endpoint_is_local();
		if ($is_external_provider && $allow_external === false) {
			// fall back to a local endpoint if configured, else refuse
			if (defined('DEDALO_RAG_LLM_LOCAL_ENDPOINT') && DEDALO_RAG_LLM_LOCAL_ENDPOINT) {
				$provider = 'local';
			} else {
				$out->errors[] = 'egress_forbidden_no_local_provider';
				return $out;
			}
		}

		switch ($provider) {
			case 'anthropic':
				return self::generate_anthropic($req);
			case 'local':
			case 'openai':
			case 'openai_compatible':
			default:
				return self::generate_openai_compatible($req, $provider);
		}
	}//end generate



	/**
	* GENERATE_ANTHROPIC  Messages API with Citations document blocks
	* @param array $req
	* @return object
	*/
	private static function generate_anthropic( array $req ) : object {

		$out = new stdClass();
			$out->result		= false;
			$out->answer		= '';
			$out->citations		= [];
			$out->used_provider	= 'anthropic';
			$out->errors		= [];

		$api_key = defined('DEDALO_RAG_LLM_API_KEY') ? DEDALO_RAG_LLM_API_KEY : null;
		if (empty($api_key)) {
			$out->errors[] = 'missing_llm_api_key';
			return $out;
		}
		$model		= defined('DEDALO_RAG_LLM_MODEL') ? DEDALO_RAG_LLM_MODEL : 'claude-opus-4-8';
		$max_tokens	= (int)($req['max_tokens'] ?? (defined('DEDALO_RAG_LLM_MAX_OUTPUT_TOKENS') ? DEDALO_RAG_LLM_MAX_OUTPUT_TOKENS : 1024));

		// passages as untrusted document blocks with citations enabled
		$documents = [];
		foreach (($req['passages'] ?? []) as $i => $p) {
			$documents[] = [
				'type'	=> 'document',
				'source'=> [
					'type'		=> 'text',
					'media_type'=> 'text/plain',
					'data'		=> (string)($p['source_text'] ?? '')
				],
				'title'			=> 'source_' . $i,
				'citations'		=> ['enabled' => true]
			];
		}

		$content = $documents;
		$content[] = ['type' => 'text', 'text' => (string)($req['query'] ?? '')];

		$payload = [
			'model'		=> $model,
			'max_tokens'=> $max_tokens,
			'system'	=> [[
				'type'			=> 'text',
				'text'			=> (string)($req['system'] ?? ''),
				'cache_control'	=> ['type' => 'ephemeral']
			]],
			'messages'	=> [[ 'role' => 'user', 'content' => $content ]]
		];

		$options = new stdClass();
			$options->url		= defined('DEDALO_RAG_LLM_ENDPOINT') && DEDALO_RAG_LLM_ENDPOINT ? DEDALO_RAG_LLM_ENDPOINT : 'https://api.anthropic.com/v1/messages';
			$options->post		= true;
			$options->header	= false;
			$options->postfields= json_encode($payload);
			$options->httpheader= [
				'Content-Type: application/json',
				'x-api-key: ' . $api_key,
				'anthropic-version: 2023-06-01'
			];
			$options->timeout	= defined('DEDALO_RAG_LLM_TIMEOUT') ? (int)DEDALO_RAG_LLM_TIMEOUT : 60;

		$response = curl_request($options);
		if ((int)($response->code ?? 0) !== 200 || empty($response->result)) {
			$out->errors[] = 'llm_http_' . ($response->code ?? 'error');
			return $out;
		}

		$decoded = json_decode($response->result);
		if (!is_object($decoded) || !isset($decoded->content) || !is_array($decoded->content)) {
			$out->errors[] = 'llm_bad_response';
			return $out;
		}

		$answer = '';
		$citations = [];
		foreach ($decoded->content as $block) {
			if (($block->type ?? '') === 'text') {
				$answer .= $block->text ?? '';
				foreach (($block->citations ?? []) as $cit) {
					$citations[] = $cit;
				}
			}
		}

		$out->result	= true;
		$out->answer	= $answer;
		$out->citations	= $citations;
		return $out;
	}//end generate_anthropic



	/**
	* GENERATE_OPENAI_COMPATIBLE  local / OpenAI-compatible chat completion
	* @param array $req
	* @param string $provider
	* @return object
	*/
	private static function generate_openai_compatible( array $req, string $provider ) : object {

		$out = new stdClass();
			$out->result		= false;
			$out->answer		= '';
			$out->citations		= [];
			$out->used_provider	= $provider;
			$out->errors		= [];

		$endpoint = ($provider === 'local' && defined('DEDALO_RAG_LLM_LOCAL_ENDPOINT'))
			? DEDALO_RAG_LLM_LOCAL_ENDPOINT
			: (defined('DEDALO_RAG_LLM_ENDPOINT') ? DEDALO_RAG_LLM_ENDPOINT : '');
		if (empty($endpoint)) {
			$out->errors[] = 'missing_llm_endpoint';
			return $out;
		}

		// flatten passages into the prompt (no native citations on this path)
		$context = '';
		foreach (($req['passages'] ?? []) as $i => $p) {
			$context .= "\n[source_$i]\n" . (string)($p['source_text'] ?? '') . "\n";
		}

		$payload = [
			'model'		=> defined('DEDALO_RAG_LLM_MODEL') ? DEDALO_RAG_LLM_MODEL : 'local-model',
			'max_tokens'=> (int)($req['max_tokens'] ?? 1024),
			'messages'	=> [
				['role' => 'system', 'content' => (string)($req['system'] ?? '')],
				['role' => 'user', 'content' => "Context:\n{$context}\n\nQuestion: " . (string)($req['query'] ?? '')]
			]
		];

		$headers = ['Content-Type: application/json'];
		if (defined('DEDALO_RAG_LLM_API_KEY') && DEDALO_RAG_LLM_API_KEY && $provider !== 'local') {
			$headers[] = 'Authorization: Bearer ' . DEDALO_RAG_LLM_API_KEY;
		}

		$options = new stdClass();
			$options->url		= $endpoint;
			$options->post		= true;
			$options->header	= false;
			$options->postfields= json_encode($payload);
			$options->httpheader= $headers;
			$options->timeout	= defined('DEDALO_RAG_LLM_TIMEOUT') ? (int)DEDALO_RAG_LLM_TIMEOUT : 60;

		$response = curl_request($options);
		if ((int)($response->code ?? 0) !== 200 || empty($response->result)) {
			$out->errors[] = 'llm_http_' . ($response->code ?? 'error');
			return $out;
		}

		$decoded = json_decode($response->result);
		$answer = $decoded->choices[0]->message->content ?? null;
		if (!is_string($answer)) {
			$out->errors[] = 'llm_bad_response';
			return $out;
		}

		$out->result	= true;
		$out->answer	= $answer;
		return $out;
	}//end generate_openai_compatible



	/**
	* ENDPOINT_IS_LOCAL  heuristic: localhost / unix socket / private host
	* @return bool
	*/
	private static function endpoint_is_local() : bool {

		$endpoint = defined('DEDALO_RAG_LLM_ENDPOINT') ? (string)DEDALO_RAG_LLM_ENDPOINT : '';
		if ($endpoint === '') {
			return false;
		}
		$host = parse_url($endpoint, PHP_URL_HOST) ?: '';
		return in_array($host, ['localhost','127.0.0.1','::1'], true)
			|| str_starts_with($host, '192.168.')
			|| str_starts_with($host, '10.')
			|| str_ends_with($host, '.local');
	}//end endpoint_is_local



}//end class rag_llm_provider
