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

		// text components and image objects index independently (different
		// models/partitions, own atomic flushes); the record succeeds only if both do.
		$text_ok  = self::index_record_text($section_tipo, $section_id);
		$image_ok = self::index_record_images($section_tipo, $section_id);
		return $text_ok && $image_ok;
	}//end index_record



	/**
	* INDEX_RECORD_TEXT  embed the configured text components.
	* @param string $section_tipo
	* @param int $section_id
	* @return bool
	*/
	private static function index_record_text( string $section_tipo, int $section_id ) : bool {

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
			// no text components configured → clear only TEXT vectors (image
			// vectors, if any, are managed by index_record_images).
			rag_vector_store::delete_record_modality($section_tipo, $section_id, 'text');
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

		// Phase 1: embed (slow HTTP) OUTSIDE any transaction. Accumulate the rows
		// to upsert and the per-(component,lang) valid counts to prune.
		$pending_upserts	= []; // full upsert rows
		$pending_stale		= []; // [component_tipo, lang, valid_count]
		$dimension			= null;
		$embed_failure		= false;

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
				// value became empty → prune all chunks for this component/lang
				$pending_stale[] = [$component_tipo, $lang, 0];
				continue;
			}

			// determine which chunks changed (hash differs from stored)
			$to_embed = []; // index in $chunks => embed_text
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
					$embed_failure = true;
					continue; // do not write garbage; queue will retry
				}
				$dimension = $embed_result->dimension;

				$v = 0;
				foreach ($to_embed as $i => $embed_text) {
					$chunk = $chunks[$i];
					$pending_upserts[] = [
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
					];
					$v++;
				}
			}

			$pending_stale[] = [$component_tipo, $lang, count($chunks)];
		}

		if (empty($pending_upserts) && empty($pending_stale)) {
			return !$embed_failure;
		}

		// Phase 2: DATA-01 — flush all writes for this record ATOMICALLY. The
		// transaction is short (embedding already done above, outside it). The
		// partition DDL is idempotent and run before BEGIN.
		if ($dimension !== null) {
			rag_vector_store::ensure_model_partition($model, $dimension);
		}
		if (DBi_vector::begin() === false) {
			return false; // retryable
		}
		$write_ok = true;
		foreach ($pending_upserts as $row) {
			if (!rag_vector_store::upsert($row)) { $write_ok = false; break; }
		}
		if ($write_ok) {
			foreach ($pending_stale as [$ct, $lg, $cnt]) {
				if (!rag_vector_store::delete_stale($section_tipo, $section_id, $ct, $lg, $model, $cnt)) { $write_ok = false; break; }
			}
		}
		// Fold the COMMIT result into the return value: a failed commit (dead
		// connection / failed RELEASE SAVEPOINT) means the upserts/deletes were NOT
		// persisted, so this must be a retryable failure — otherwise the queue marker
		// is dropped and the record is silently never re-indexed.
		$committed = false;
		if ($write_ok) {
			$committed = DBi_vector::commit();
		} else {
			DBi_vector::rollback();
		}

		return $write_ok && $committed && !$embed_failure;
	}//end index_record_text



	/**
	* INDEX_RECORD_IMAGES
	* Phase 5b: embed the object's images (declared in properties.rag.context) with
	* the multimodal model into the image partition. One vector per image, tagged
	* with its view (obverse/reverse/…). source_text = a context summary (typology/
	* material/period labels) for hybrid scoring + display. Egress-gated by
	* is_publishable for external providers; masters never read. Own atomic flush.
	* @param string $section_tipo
	* @param int $section_id
	* @return bool
	*/
	private static function index_record_images( string $section_tipo, int $section_id ) : bool {

		$mm = embedding_provider_multimodal::get();
		if ($mm === null) {
			return true; // multimodal not configured → nothing to do
		}

		$images = rag_config::get_context_images($section_tipo);
		if (empty($images)) {
			// context declares no images → clear any old image vectors
			rag_vector_store::delete_record_modality($section_tipo, $section_id, 'image');
			return true;
		}

		// external-egress gate (publishable-only for external providers)
		if (!rag_media_extractor::can_egress_image($section_tipo, $section_id)) {
			debug_log(__METHOD__ . " Skipping non-publishable image egress for $section_tipo/$section_id", logger::WARNING);
			return true; // deliberate skip, not a failure
		}

		$model			= $mm->get_model();
		$existing_hashes= rag_vector_store::diff_hashes($section_tipo, $section_id, $model);
		$context_summary= self::build_context_summary($section_tipo, $section_id);
		$egress_class	= rag_security::get_record_egress_class($section_tipo, $section_id);

		$pending_upserts	= [];
		$pending_stale		= []; // [component_tipo, lang, valid_count]
		$dimension			= null;
		$embed_failure		= false;

		foreach ($images as $img) {

			$component_tipo	= $img['tipo'];
			$view			= $img['view'] ?? null;
			$lang			= DEDALO_DATA_NOLAN;

			$resolved = rag_media_extractor::get_image_for_embedding($component_tipo, $section_id, $section_tipo);
			if ($resolved === null) {
				// no image present → prune any prior vector for this component
				$pending_stale[] = [$component_tipo, $lang, 0];
				continue;
			}

			$source_hash = hash('sha256', 'img_v1|' . $resolved['bytes_hash'] . '|' . $context_summary);
			$key = $component_tipo . '|' . $lang . '|0';

			if (($existing_hashes[$key] ?? null) !== $source_hash) {
				$embed = $mm->embed_image([ $resolved['base64'] ]);
				$vec = $embed->vectors[0] ?? null;
				if ($vec === null) {
					debug_log(__METHOD__ . " Image embedding failed for $component_tipo/$section_id", logger::ERROR);
					$embed_failure = true;
					continue;
				}
				$dimension = $embed->dimension;
				$pending_upserts[] = [
					'section_tipo'	=> $section_tipo,
					'section_id'	=> $section_id,
					'component_tipo'=> $component_tipo,
					'lang'			=> $lang,
					'chunk_index'	=> 0,
					'provider'		=> $mm->get_provider(),
					'model'			=> $model,
					'dimension'		=> $embed->dimension,
					'embedding'		=> $vec,
					'source_hash'	=> $source_hash,
					'source_text'	=> $context_summary,
					'token_count'	=> null,
					'modality'		=> 'image',
					'source_kind'	=> 'image_visual',
					'egress_class'	=> $egress_class,
					'parent_key'	=> $section_tipo . '_' . $section_id,
					'chunk_meta'	=> [
						'media_tipo'=> $component_tipo,
						'view'		=> $view,
						'quality'	=> $resolved['quality'],
						'thumb_url'	=> $resolved['thumb_url'],
						'width'		=> $resolved['width'],
						'height'	=> $resolved['height']
					]
				];
			}
			$pending_stale[] = [$component_tipo, $lang, 1]; // one image per component
		}

		if (empty($pending_upserts) && empty($pending_stale)) {
			return !$embed_failure;
		}

		if ($dimension !== null) {
			rag_vector_store::ensure_model_partition($model, $dimension);
		}
		if (DBi_vector::begin() === false) {
			return false;
		}
		$write_ok = true;
		foreach ($pending_upserts as $row) {
			if (!rag_vector_store::upsert($row)) { $write_ok = false; break; }
		}
		if ($write_ok) {
			foreach ($pending_stale as [$ct, $lg, $cnt]) {
				if (!rag_vector_store::delete_stale($section_tipo, $section_id, $ct, $lg, $model, $cnt)) { $write_ok = false; break; }
			}
		}
		// A failed COMMIT must surface as a retryable failure (see index_record_text).
		$committed = false;
		if ($write_ok) {
			$committed = DBi_vector::commit();
		} else {
			DBi_vector::rollback();
		}

		return $write_ok && $committed && !$embed_failure;
	}//end index_record_images



	/**
	* BUILD_CONTEXT_SUMMARY  compact text of the object's metadata roles
	* (typology/material/period labels) for hybrid scoring + result display.
	* @param string $section_tipo
	* @param int $section_id
	* @return string
	*/
	private static function build_context_summary( string $section_tipo, int $section_id ) : string {

		$metadata = rag_config::get_context_metadata($section_tipo);
		if (empty($metadata)) {
			return '';
		}
		$parts = [];
		foreach ($metadata as $role => $component_tipo) {
			$val = rag_text_extractor::get_component_value($component_tipo, $section_id, $section_tipo, DEDALO_DATA_LANG);
			if (!empty($val)) {
				$parts[] = $role . ': ' . trim($val);
			}
		}
		return implode(' · ', $parts);
	}//end build_context_summary



	/**
	* RECONCILE_SECTION
	* DATA-05: detect drift between the matrix and the vector store for a section
	* (e.g. records added/deleted via direct SQL that bypassed the save() hook) and
	* enqueue corrections. Compares record-id PRESENCE: matrix-only ids → enqueue
	* index; vector-only ids → enqueue delete. (Content drift on an edited-via-SQL
	* record is corrected on its next normal save, or by a forced re-index.)
	* @param string $section_tipo
	* @return object  {missing:int, orphan:int}
	*/
	public static function reconcile_section( string $section_tipo ) : object {

		$out = new stdClass();
			$out->missing	= 0;
			$out->orphan	= 0;

		if (!DBi_vector::is_configured() || !rag_config::section_is_rag_enabled($section_tipo)) {
			return $out;
		}

		// matrix ids
		$matrix_ids = [];
		try {
			$res = section::get_resource_all_section_records_unfiltered($section_tipo, 'section_id');
			if ($res !== false) {
				while ($row = pg_fetch_assoc($res)) {
					$matrix_ids[(int)$row['section_id']] = true;
				}
			}
		} catch (\Throwable $e) {
			debug_log(__METHOD__ . ' Error reading matrix ids: ' . $e->getMessage(), logger::ERROR);
			return $out;
		}

		// vector ids
		$vector_ids = [];
		$vres = DBi_vector::exec('SELECT DISTINCT section_id FROM rag_embeddings WHERE section_tipo=$1', [$section_tipo]);
		if ($vres !== false) {
			while ($row = pg_fetch_assoc($vres)) {
				$vector_ids[(int)$row['section_id']] = true;
			}
		}

		// matrix-only → index; vector-only → delete
		foreach ($matrix_ids as $id => $_) {
			if (!isset($vector_ids[$id])) {
				rag_queue::enqueue_index($section_tipo, $id);
				$out->missing++;
			}
		}
		foreach ($vector_ids as $id => $_) {
			if (!isset($matrix_ids[$id])) {
				rag_queue::enqueue_delete($section_tipo, $id);
				$out->orphan++;
			}
		}

		return $out;
	}//end reconcile_section



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
	* GET_RECORD_TITLE
	* Best-effort record display label for the chunker's contextual header.
	* Resolves via ts_object::get_term_by_locator() (the same label resolver the
	* tree/relations use). Best-effort: returns '' on any failure so indexing
	* never depends on it.
	* @param string $section_tipo
	* @param int $section_id
	* @return string
	*/
	private static function get_record_title( string $section_tipo, int $section_id ) : string {

		try {
			if (!class_exists('ts_object') || !method_exists('ts_object', 'get_term_by_locator')) {
				return '';
			}
			$locator = new stdClass();
				$locator->section_tipo	= $section_tipo;
				$locator->section_id	= $section_id;
			$label = ts_object::get_term_by_locator($locator, DEDALO_DATA_LANG, true);
			return is_string($label) ? trim($label) : '';
		} catch (\Throwable $e) {
			return '';
		}
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
