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
				'INSERT INTO rag_index_queue (section_tipo, section_id, op, attempts, last_error, next_attempt_at, enqueued_at)
					VALUES ($1, $2, $3, 0, NULL, now(), now())
					ON CONFLICT (section_tipo, section_id)
					DO UPDATE SET op = EXCLUDED.op, attempts = 0, last_error = NULL, next_attempt_at = now(), enqueued_at = now()',
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
				'SELECT section_tipo, section_id, op, attempts, enqueued_at
					FROM rag_index_queue
					WHERE next_attempt_at <= now()
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
				$attempts		= (int)$r['attempts'];
				$observed_ts	= (string)$r['enqueued_at'];

				$t0 = function_exists('start_time') ? start_time() : 0;
				$ok = ($op === 'delete')
					? rag_indexer::delete_record($section_tipo, $section_id)
					: rag_indexer::index_record($section_tipo, $section_id);
				if (class_exists('metrics') && $t0) {
					metrics::add_time_ms('rag_index_record_time', exec_time_unit($t0, 'ms'));
				}

				if ($ok) {
					// delete only if not re-enqueued meanwhile (newer enqueued_at survives)
					matrix_db_manager::exec_search(
						'DELETE FROM rag_index_queue
							WHERE section_tipo=$1 AND section_id=$2 AND enqueued_at=$3',
						[$section_tipo, $section_id, $observed_ts]
					);
					$processed++;
					if (class_exists('metrics')) { metrics::inc('rag_index_processed'); }
				} else {
					// OPS-02: bounded retry with exponential backoff + last_error.
					// Give up after 5 attempts (drop the row so it can't loop forever).
					if ($attempts + 1 >= 5) {
						matrix_db_manager::exec_search(
							'DELETE FROM rag_index_queue
								WHERE section_tipo=$1 AND section_id=$2 AND enqueued_at=$3',
							[$section_tipo, $section_id, $observed_ts]
						);
						debug_log(__METHOD__ . " Giving up on $section_tipo/$section_id after 5 attempts", logger::ERROR);
					} else {
						// backoff: 2^attempts minutes, capped at ~30 min
						$backoff_min = min(30, 2 ** ($attempts + 1));
						matrix_db_manager::exec_search(
							"UPDATE rag_index_queue
								SET attempts = attempts + 1,
									last_error = $4,
									next_attempt_at = now() + ($5 || ' minutes')::interval
								WHERE section_tipo=$1 AND section_id=$2 AND enqueued_at=$3",
							[$section_tipo, $section_id, $observed_ts, 'index_record returned false (op=' . $op . ')', (string)$backoff_min]
						);
					}
					if (class_exists('metrics')) { metrics::inc('rag_index_failed'); }
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
	* STATS
	* OPS-04: operational snapshot for monitoring — queue depth, ready/blocked
	* counts, failed (attempts>0), oldest pending age, plus the in-process metrics
	* summary (rag_index_processed/failed/time). Cheap; safe to expose via an API.
	* @return object
	*/
	public static function stats() : object {

		$out = new stdClass();
			$out->configured	= DBi_vector::is_configured();
			$out->pending		= 0;
			$out->ready			= 0;
			$out->blocked		= 0;
			$out->failed		= 0;
			$out->oldest_age_sec= null;
			$out->metrics		= [];

		$result = matrix_db_manager::exec_search(
			"SELECT
				count(*) AS pending,
				count(*) FILTER (WHERE next_attempt_at <= now()) AS ready,
				count(*) FILTER (WHERE next_attempt_at > now()) AS blocked,
				count(*) FILTER (WHERE attempts > 0) AS failed,
				EXTRACT(EPOCH FROM (now() - min(enqueued_at)))::int AS oldest_age_sec
				FROM rag_index_queue",
			[]
		);
		if ($result !== false && ($row = pg_fetch_assoc($result))) {
			$out->pending		= (int)$row['pending'];
			$out->ready			= (int)$row['ready'];
			$out->blocked		= (int)$row['blocked'];
			$out->failed		= (int)$row['failed'];
			$out->oldest_age_sec= $row['oldest_age_sec'] !== null ? (int)$row['oldest_age_sec'] : null;
		}

		if (class_exists('metrics') && method_exists('metrics', 'get_summary')) {
			try { $out->metrics = metrics::get_summary(); } catch (\Throwable $e) {}
		}

		return $out;
	}//end stats



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
