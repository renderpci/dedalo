<?php declare(strict_types=1);
/**
* CLASS RAG_QUEUE
* Dirty-marker queue for deferred re-indexing. The marker table lives in the
* MATRIX database (rag_index_queue), so enqueue runs on the same connection as
* the editor save and a DOWN vector store can never block a save.
*
* enqueue_*() are BEST-EFFORT: they swallow every error (the section_record
* hook wraps them in try/catch too) so a queue failure never surfaces as an
* editor error.
*
* drain() is single-flighted with a Postgres advisory lock and deletes only the
* row whose observed enqueued_at is unchanged, so an edit that lands mid-drain
* is preserved (its newer enqueued_at survives the delete).
*
* @package Dedalo
* @subpackage Rag
*/
abstract class rag_queue {



	/** advisory-lock key that single-flights the drain across workers */
	private const DRAIN_LOCK_KEY = 918273645;



	/**
	* ENQUEUE_INDEX  mark a record dirty for (re)indexing
	* @param string $section_tipo
	* @param int $section_id
	* @return void
	*/
	public static function enqueue_index( string $section_tipo, int $section_id ) : void {
		self::enqueue($section_tipo, $section_id, 'index');
	}//end enqueue_index



	/**
	* ENQUEUE_DELETE  mark a record for vector removal
	* @param string $section_tipo
	* @param int $section_id
	* @return void
	*/
	public static function enqueue_delete( string $section_tipo, int $section_id ) : void {
		self::enqueue($section_tipo, $section_id, 'delete');
	}//end enqueue_delete



	/**
	* ENQUEUE  (private) best-effort upsert into the matrix-DB marker table
	* @param string $section_tipo
	* @param int $section_id
	* @param string $op  index | delete
	* @return void
	*/
	private static function enqueue( string $section_tipo, int $section_id, string $op ) : void {

		if ($section_id < 1) {
			return;
		}

		try {
			matrix_db_manager::exec_search(
				'INSERT INTO rag_index_queue (section_tipo, section_id, op, attempts, enqueued_at)
					VALUES ($1, $2, $3, 0, now())
					ON CONFLICT (section_tipo, section_id)
					DO UPDATE SET op = EXCLUDED.op, attempts = 0, enqueued_at = now()',
				[$section_tipo, $section_id, $op]
			);
		} catch (\Throwable $e) {
			// never propagate — a queue failure must not fail the save
			debug_log(__METHOD__ . ' Notice. enqueue failed (non-fatal): ' . $e->getMessage(), logger::WARNING);
		}
	}//end enqueue



	/**
	* DRAIN
	* Process up to $batch pending markers oldest-first. Single-flighted via an
	* advisory lock. Returns the number of records processed.
	* @param int $batch = 100
	* @return int
	*/
	public static function drain( int $batch=100 ) : int {

		if (!DBi_vector::is_configured()) {
			return 0;
		}

		// single-flight: bail if another drain holds the lock
		$lock = matrix_db_manager::exec_search('SELECT pg_try_advisory_lock($1) AS got', [self::DRAIN_LOCK_KEY]);
		if ($lock === false) {
			return 0;
		}
		$lock_row = pg_fetch_assoc($lock);
		if (($lock_row['got'] ?? 'f') !== 't') {
			return 0;
		}

		$processed = 0;
		try {
			$result = matrix_db_manager::exec_search(
				'SELECT section_tipo, section_id, op, enqueued_at
					FROM rag_index_queue
					ORDER BY enqueued_at ASC
					LIMIT $1',
				[max(1, $batch)]
			);
			if ($result === false) {
				return 0;
			}

			$rows = [];
			while ($r = pg_fetch_assoc($result)) {
				$rows[] = $r;
			}

			$gc = 0;
			foreach ($rows as $r) {

				$section_tipo	= (string)$r['section_tipo'];
				$section_id		= (int)$r['section_id'];
				$op				= (string)$r['op'];
				$observed_ts	= (string)$r['enqueued_at'];

				$ok = ($op === 'delete')
					? rag_indexer::delete_record($section_tipo, $section_id)
					: rag_indexer::index_record($section_tipo, $section_id);

				if ($ok) {
					// delete only if not re-enqueued meanwhile (newer enqueued_at survives)
					matrix_db_manager::exec_search(
						'DELETE FROM rag_index_queue
							WHERE section_tipo=$1 AND section_id=$2 AND enqueued_at=$3',
						[$section_tipo, $section_id, $observed_ts]
					);
					$processed++;
				} else {
					// bounded retry: bump attempts; give up after 5
					matrix_db_manager::exec_search(
						'UPDATE rag_index_queue SET attempts = attempts + 1
							WHERE section_tipo=$1 AND section_id=$2 AND attempts < 5',
						[$section_tipo, $section_id]
					);
					matrix_db_manager::exec_search(
						'DELETE FROM rag_index_queue
							WHERE section_tipo=$1 AND section_id=$2 AND attempts >= 5 AND enqueued_at=$3',
						[$section_tipo, $section_id, $observed_ts]
					);
				}

				// memory discipline (tool_export style)
				if ((++$gc % 100) === 0) {
					self::free_memory();
				}
			}
		} finally {
			matrix_db_manager::exec_search('SELECT pg_advisory_unlock($1)', [self::DRAIN_LOCK_KEY]);
		}

		return $processed;
	}//end drain



	/**
	* PENDING_COUNT  number of markers waiting
	* @return int
	*/
	public static function pending_count() : int {

		$result = matrix_db_manager::exec_search('SELECT count(*) AS n FROM rag_index_queue', []);
		if ($result === false) {
			return 0;
		}
		$row = pg_fetch_assoc($result);
		return (int)($row['n'] ?? 0);
	}//end pending_count



	/**
	* FREE_MEMORY  clear record/component instance caches + gc (drain long-runs)
	* @return void
	*/
	private static function free_memory() : void {

		// section_record_instances_cache extends object_cache → clear()
		if (class_exists('section_record_instances_cache') && method_exists('section_record_instances_cache', 'clear')) {
			try { section_record_instances_cache::clear(); } catch (\Throwable $e) {}
		}
		if (class_exists('component_instances_cache') && method_exists('component_instances_cache', 'clear')) {
			try { component_instances_cache::clear(); } catch (\Throwable $e) {}
		}
		if (function_exists('gc_collect_cycles')) {
			gc_collect_cycles();
		}
	}//end free_memory



}//end class rag_queue
