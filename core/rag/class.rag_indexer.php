<?php declare(strict_types=1);
/**
* CLASS RAG_INDEXER
* Orchestrates one record's ingestion: enumerate embeddable components → extract
* per-lang clean text → chunk (structure-aware semantic) → diff against stored
* hashes (skip unchanged, no provider call) → embed only changed chunks → upsert
* → delete stale chunks (model-scoped).
*
* EGRESS GATE: before any text leaves to the embedding provider, the record's
* egress class is checked. If the configured provider is EXTERNAL and the record
* may not egress, the record is skipped (never silently sent). This governs
* INDEX-TIME egress, which the generation-time policy alone did not cover.
*
* All failures are soft: a vector-store or provider error logs and returns false
* (so the queue retries) but never throws into a caller.
*
* @package Dedalo
* @subpackage Rag
*/
abstract class rag_indexer {



	/**
	* INDEX_RECORD
	* @param string $section_tipo
	* @param int $section_id
	* @return bool  true on success (or clean no-op); false on a retryable failure
	*/
	public static function index_record( string $section_tipo, int $section_id ) : bool {

		if ($section_id < 1) {
			return false;
		}
		if (!rag_config::section_is_rag_enabled($section_tipo)) {
			return true; // nothing to do
		}
		if (!DBi_vector::is_configured()) {
			return false; // retryable: store not reachable
		}

		// EGRESS GATE (index-time)
		if (!rag_security::record_can_egress($section_tipo, $section_id)) {
			debug_log(__METHOD__ . " Skipping external-egress-forbidden record $section_tipo/$section_id (no local provider configured for restricted content)", logger::WARNING);
			// not a failure: deliberately not indexed under the current provider
			return true;
		}
		$egress_class = rag_security::get_record_egress_class($section_tipo, $section_id);

		$provider = embedding_provider_factory::get();
		if ($provider === null) {
			return false; // retryable: provider misconfigured
		}

		$component_tipos = rag_config::get_embeddable_component_tipos($section_tipo);
		if (empty($component_tipos)) {
			// nothing configured to embed → ensure any old vectors are gone
			rag_vector_store::delete_record($section_tipo, $section_id);
			return true;
		}

		$extracted = rag_text_extractor::extract($section_tipo, $section_id, $component_tipos);

		$model = $provider->get_model();
		$existing_hashes = rag_vector_store::diff_hashes($section_tipo, $section_id, $model);

		// semantic-segmentation embedder (sentence vectors); [] on failure → the
		// chunker degrades to structural-only, which is still correct.
		$embedder = static function( array $texts ) use ($provider) {
			$res = $provider->embed($texts);
			return $res->vectors ?? [];
		};

		$document_title = self::get_record_title($section_tipo, $section_id);
		$any_failure = false;

		foreach ($extracted as $entry) {

			$component_tipo	= $entry['component_tipo'];
			$lang			= $entry['lang'];
			$text			= $entry['text'];

			$opts = rag_config::get_chunk_opts($component_tipo);
			$opts['embedder']		= $embedder;
			$opts['document_title']	= $document_title;
			$opts['media_tipo']		= self::resolve_media_tipo($component_tipo);

			$chunks = rag_chunker::chunk($text, $opts);
			if (empty($chunks)) {
				// value became empty → drop all chunks for this component/lang
				rag_vector_store::delete_stale($section_tipo, $section_id, $component_tipo, $lang, $model, 0);
				continue;
			}

			// determine which chunks changed (hash differs from stored)
			$to_embed		= []; // index in $chunks => embed_text
			foreach ($chunks as $i => $chunk) {
				$key = $component_tipo . '|' . $lang . '|' . $chunk['chunk_index'];
				if (($existing_hashes[$key] ?? null) === $chunk['source_hash']) {
					continue; // unchanged: skip provider call + upsert
				}
				$to_embed[$i] = $chunk['embed_text'];
			}

			if (!empty($to_embed)) {
				$embed_result = $provider->embed( array_values($to_embed) );
				$vectors = $embed_result->vectors ?? [];
				if (count($vectors) !== count($to_embed)) {
					debug_log(__METHOD__ . " Embedding failed for $component_tipo/$lang ($section_tipo/$section_id)", logger::ERROR);
					$any_failure = true;
					continue; // do not write garbage; queue will retry
				}

				rag_vector_store::ensure_model_partition($model, $embed_result->dimension);

				$v = 0;
				foreach ($to_embed as $i => $embed_text) {
					$chunk = $chunks[$i];
					$ok = rag_vector_store::upsert([
						'section_tipo'	=> $section_tipo,
						'section_id'	=> $section_id,
						'component_tipo'=> $component_tipo,
						'lang'			=> $lang,
						'chunk_index'	=> $chunk['chunk_index'],
						'provider'		=> $provider->get_provider(),
						'model'			=> $model,
						'dimension'		=> $embed_result->dimension,
						'embedding'		=> $vectors[$v],
						'source_hash'	=> $chunk['source_hash'],
						'source_text'	=> $chunk['text'],
						'token_count'	=> $chunk['token_count'],
						'modality'		=> 'text',
						'source_kind'	=> $chunk['source_kind'],
						'egress_class'	=> $egress_class,
						'parent_key'	=> $chunk['parent_key'],
						'chunk_meta'	=> $chunk['chunk_meta']
					]);
					if (!$ok) {
						$any_failure = true;
					}
					$v++;
				}
			}

			// delete stale chunks beyond the new count for this component/lang
			rag_vector_store::delete_stale($section_tipo, $section_id, $component_tipo, $lang, $model, count($chunks));
		}

		return !$any_failure;
	}//end index_record



	/**
	* DELETE_RECORD  remove every vector for a record
	* @param string $section_tipo
	* @param int $section_id
	* @return bool
	*/
	public static function delete_record( string $section_tipo, int $section_id ) : bool {

		if (!DBi_vector::is_configured()) {
			return false;
		}
		return rag_vector_store::delete_record($section_tipo, $section_id);
	}//end delete_record



	/**
	* GET_RECORD_TITLE  best-effort record label for the contextual header.
	* Kept minimal in the foundation: the contextual header already carries the
	* heading path; a record-level title is an optional enrichment. Returns ''.
	* (Extension point: resolve the section's display label component value.)
	* @param string $section_tipo
	* @param int $section_id
	* @return string
	*/
	private static function get_record_title( string $section_tipo, int $section_id ) : string {

		return '';
	}//end get_record_title



	/**
	* RESOLVE_MEDIA_TIPO  linked AV tipo for a transcription text component (or null).
	* Replicates component_text_area::get_related_component_av_tipo() without
	* instantiating the component (that method is instance-bound to $this->tipo).
	* @param string $component_tipo
	* @return ?string
	*/
	private static function resolve_media_tipo( string $component_tipo ) : ?string {

		try {
			$model = ontology_node::get_model_by_tipo($component_tipo, true);
			if ($model !== 'component_text_area') {
				return null;
			}
			$related = ontology_node::get_ar_tipo_by_model_and_relation($component_tipo, 'component_av', 'related');
			return $related[0] ?? null;
		} catch (\Throwable $e) {
			return null;
		}
	}//end resolve_media_tipo



}//end class rag_indexer
