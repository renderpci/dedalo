<?php declare(strict_types=1);
/**
* CLASS RAG_VECTOR_STORE
* CRUD + ANN query surface over the pgvector instance (via DBi_vector).
*
* Responsibilities:
* - ensure_model_partition(): idempotently create the per-model child partition
*   with a fixed-dimension typed column before its first upsert.
* - upsert(): insert/replace a chunk row (ON CONFLICT on the natural key).
* - delete_record() / delete_stale(): remove a record's chunks (model-scoped so
*   re-indexing under a new model never wipes another model's chunks).
* - diff_hashes(): return the {chunk_index: source_hash} already stored for a
*   record+model so the indexer can skip unchanged chunks (no provider call).
* - query(): cosine ANN over one model's partition, returning candidate chunks
*   with their distance and provenance. ACL is applied LATER, in retrieval.php.
* - build_ann_index(): create the HNSW index for a model AFTER backfill, on an
*   autocommit connection, guarded by an advisory lock.
*
* Vectors are always bound as parameters, never interpolated into SQL.
*
* @package Dedalo
* @subpackage Rag
*/
abstract class rag_vector_store {



	/**
	* Models whose partition has already been ensured this process (avoids a
	* round-trip on every upsert).
	* @var array<string,bool> $ensured_partitions
	*/
	private static array $ensured_partitions = [];



	/**
	* ENSURE_MODEL_PARTITION
	* Idempotently provision the per-model child partition + typed column.
	* @param string $model
	* @param int $dimension
	* @return bool
	*/
	public static function ensure_model_partition( string $model, int $dimension ) : bool {

		$cache_key = $model . '|' . $dimension;
		if (isset(self::$ensured_partitions[$cache_key])) {
			return true;
		}

		$result = DBi_vector::exec(
			'SELECT rag_create_model_partition($1, $2)',
			[$model, $dimension]
		);
		if ($result === false) {
			return false;
		}

		self::$ensured_partitions[$cache_key] = true;
		return true;
	}//end ensure_model_partition



	/**
	* UPSERT
	* Insert or replace one chunk row. $row is a flat associative array carrying
	* every column. The embedding is bound as a pgvector literal parameter.
	* @param array $row
	* @return bool
	*/
	public static function upsert( array $row ) : bool {

		// guard: partition must exist for this (model, dimension)
		self::ensure_model_partition( (string)$row['model'], (int)$row['dimension'] );

		$sql = 'INSERT INTO rag_embeddings (
				section_tipo, section_id, component_tipo, lang, chunk_index,
				provider, model, dimension, embedding, source_hash, source_text,
				token_count, modality, source_kind, egress_class, parent_key, chunk_meta, updated_at
			) VALUES (
				$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, now()
			)
			ON CONFLICT (section_tipo, section_id, component_tipo, lang, chunk_index, model, dimension)
			DO UPDATE SET
				provider	= EXCLUDED.provider,
				embedding	= EXCLUDED.embedding,
				source_hash	= EXCLUDED.source_hash,
				source_text	= EXCLUDED.source_text,
				token_count	= EXCLUDED.token_count,
				modality	= EXCLUDED.modality,
				source_kind	= EXCLUDED.source_kind,
				egress_class= EXCLUDED.egress_class,
				parent_key	= EXCLUDED.parent_key,
				chunk_meta	= EXCLUDED.chunk_meta,
				updated_at	= now()';

		$params = [
			(string)$row['section_tipo'],
			(int)$row['section_id'],
			(string)$row['component_tipo'],
			(string)$row['lang'],
			(int)$row['chunk_index'],
			(string)$row['provider'],
			(string)$row['model'],
			(int)$row['dimension'],
			DBi_vector::vector_to_sql( $row['embedding'] ),
			(string)$row['source_hash'],
			$row['source_text'] ?? null,
			isset($row['token_count']) ? (int)$row['token_count'] : null,
			(string)($row['modality'] ?? 'text'),
			(string)($row['source_kind'] ?? 'text'),
			(string)($row['egress_class'] ?? 'public'),
			$row['parent_key'] ?? null,
			isset($row['chunk_meta']) ? json_encode($row['chunk_meta']) : null
		];

		return DBi_vector::exec($sql, $params) !== false;
	}//end upsert



	/**
	* DIFF_HASHES
	* Return [chunk_index => source_hash] already stored for a record+model so
	* the indexer can skip embedding unchanged chunks.
	* @param string $section_tipo
	* @param int $section_id
	* @param string $model
	* @return array<int,string>
	*/
	public static function diff_hashes( string $section_tipo, int $section_id, string $model ) : array {

		$result = DBi_vector::exec(
			'SELECT component_tipo, lang, chunk_index, source_hash
				FROM rag_embeddings
				WHERE section_tipo=$1 AND section_id=$2 AND model=$3',
			[$section_tipo, $section_id, $model]
		);
		if ($result === false) {
			return [];
		}

		$out = [];
		while ($row = pg_fetch_assoc($result)) {
			// key by the full chunk identity so the indexer can match precisely
			$key = $row['component_tipo'] . '|' . $row['lang'] . '|' . $row['chunk_index'];
			$out[$key] = $row['source_hash'];
		}
		return $out;
	}//end diff_hashes



	/**
	* DELETE_RECORD
	* Remove every chunk for a record (all models/components/langs).
	* @param string $section_tipo
	* @param int $section_id
	* @return bool
	*/
	public static function delete_record( string $section_tipo, int $section_id ) : bool {

		return DBi_vector::exec(
			'DELETE FROM rag_embeddings WHERE section_tipo=$1 AND section_id=$2',
			[$section_tipo, $section_id]
		) !== false;
	}//end delete_record



	/**
	* DELETE_STALE
	* Remove chunks of a (record, component, lang, model) whose chunk_index is
	* >= $valid_count — i.e. chunks left over after the value shrank. MODEL-SCOPED
	* so a re-index under a different model never wipes the old model's chunks.
	* @param string $section_tipo
	* @param int $section_id
	* @param string $component_tipo
	* @param string $lang
	* @param string $model
	* @param int $valid_count
	* @return bool
	*/
	public static function delete_stale( string $section_tipo, int $section_id, string $component_tipo, string $lang, string $model, int $valid_count ) : bool {

		return DBi_vector::exec(
			'DELETE FROM rag_embeddings
				WHERE section_tipo=$1 AND section_id=$2 AND component_tipo=$3
				  AND lang=$4 AND model=$5 AND chunk_index>=$6',
			[$section_tipo, $section_id, $component_tipo, $lang, $model, $valid_count]
		) !== false;
	}//end delete_stale



	/**
	* DROP_MODEL_PARTITION
	* DATA-03: remove a model's child partition (and its HNSW index) after a model
	* migration, to reclaim space from orphaned vectors. Detaches then drops the
	* child. Idempotent. The sanitized child name is derived from the model, never
	* raw input. Use only when the model is fully retired.
	* @param string $model
	* @return bool
	*/
	public static function drop_model_partition( string $model ) : bool {

		$child = 'rag_embeddings_' . preg_replace('/[^a-z0-9_]+/', '_', strtolower($model));
		unset(self::$ensured_partitions[$model . '|']); // best-effort cache clear (any dim)
		foreach (array_keys(self::$ensured_partitions) as $k) {
			if (str_starts_with($k, $model . '|')) {
				unset(self::$ensured_partitions[$k]);
			}
		}
		// DROP TABLE on a partition removes it from the parent and drops its index.
		return DBi_vector::exec_autocommit('DROP TABLE IF EXISTS ' . $child);
	}//end drop_model_partition



	/**
	* QUERY
	* Cosine ANN over one model's partition. Returns candidate chunk rows ordered
	* by ascending distance (closest first). section_tipos and modality narrow
	* the candidate set. NO ACL is applied here — retrieval.php does that.
	* @param array<int,float> $query_vector
	* @param string $model
	* @param int $k
	* @param float|null $max_distance = null
	* @param array<int,string> $section_tipos = []
	* @param string $modality = 'text'
	* @return array<int,array<string,mixed>>
	*/
	public static function query( array $query_vector, string $model, int $k, ?float $max_distance=null, array $section_tipos=[], string $modality='text' ) : array {

		$params		= [ DBi_vector::vector_to_sql($query_vector), $model, $modality ];
		$where		= 'model = $2 AND modality = $3';
		$next_param	= 4;

		// section_tipo restriction via = ANY($n) (constant-shape SQL)
		if (!empty($section_tipos)) {
			$where .= ' AND section_tipo = ANY($' . $next_param . '::text[])';
			$params[] = '{' . implode(',', array_map(static fn($t) => '"' . str_replace('"', '', (string)$t) . '"', $section_tipos)) . '}';
			$next_param++;
		}

		// distance threshold (bound, never interpolated)
		$having_distance = '';
		if ($max_distance !== null) {
			$having_distance = ' AND (embedding <=> $1) <= $' . $next_param;
			$params[] = (float)$max_distance;
			$next_param++;
		}

		$limit_param = $next_param;
		$params[] = max(1, $k);

		$sql = 'SELECT section_tipo, section_id, component_tipo, lang, chunk_index,
					source_text, source_kind, modality, egress_class, parent_key, chunk_meta,
					(embedding <=> $1) AS distance
				FROM rag_embeddings
				WHERE ' . $where . $having_distance . '
				ORDER BY embedding <=> $1
				LIMIT $' . $limit_param;

		$result = DBi_vector::exec($sql, $params);
		if ($result === false) {
			return [];
		}

		$rows = [];
		while ($row = pg_fetch_assoc($result)) {
			$row['distance']	= (float)$row['distance'];
			$row['section_id']	= (int)$row['section_id'];
			$row['chunk_index']	= (int)$row['chunk_index'];
			if (isset($row['chunk_meta']) && is_string($row['chunk_meta'])) {
				$row['chunk_meta'] = json_decode($row['chunk_meta'], true);
			}
			$rows[] = $row;
		}
		return $rows;
	}//end query



	/**
	* BUILD_ANN_INDEX
	* Create the HNSW cosine index for a model's partition AFTER backfill, on an
	* autocommit connection (CREATE INDEX CONCURRENTLY cannot run in a txn block).
	*
	* Concurrency: CREATE INDEX CONCURRENTLY IF NOT EXISTS is idempotent, and
	* PostgreSQL serializes concurrent index builds on the same table, so two
	* tools/drains calling this for the same model are safe without an application
	* lock. (A pg_advisory_lock taken here would be released as soon as its
	* per-call connection closed — i.e. before the build ran — so it would give a
	* false sense of protection; we rely on Postgres' own guarantees instead.)
	* @param string $model
	* @param int $dimension
	* @return bool
	*/
	public static function build_ann_index( string $model, int $dimension ) : bool {

		self::ensure_model_partition($model, $dimension);

		$child		= 'rag_embeddings_' . preg_replace('/[^a-z0-9_]+/', '_', strtolower($model));
		$index_name	= $child . '_hnsw_idx';
		$op_class	= $dimension > 2000 ? 'halfvec_cosine_ops' : 'vector_cosine_ops';

		$m				= defined('DEDALO_RAG_HNSW_M') ? (int)DEDALO_RAG_HNSW_M : 16;
		$ef_construction= defined('DEDALO_RAG_HNSW_EF_CONSTRUCTION') ? (int)DEDALO_RAG_HNSW_EF_CONSTRUCTION : 64;

		// identifiers are derived from a sanitized model name, never raw user input
		$sql = sprintf(
			'CREATE INDEX CONCURRENTLY IF NOT EXISTS %s ON %s USING hnsw (embedding %s) WITH (m=%d, ef_construction=%d)',
			$index_name, $child, $op_class, $m, $ef_construction
		);

		return DBi_vector::exec_autocommit($sql);
	}//end build_ann_index



}//end class rag_vector_store
