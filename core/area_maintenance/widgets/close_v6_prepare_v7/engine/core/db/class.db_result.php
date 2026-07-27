<?php declare(strict_types=1);
/**
* DB_RESULT
* Lazy, iterable wrapper around a raw PostgreSQL query result resource.
*
* Responsibilities:
* - Wraps a \PgSql\Result handle so callers never touch pg_* functions directly.
* - Automatically JSON-decodes matrix columns (data, relation, string, date, iri,
*   geo, number, media, misc, relation_search, meta) on the fly as each row is
*   fetched, using the column map supplied at construction time (defaults to
*   matrix_db_manager::$json_columns).
* - Yields rows either as stdClass objects (default) or as associative arrays
*   when $as_array is true — the choice propagates consistently through every
*   fetch method.
* - Frees the underlying PostgreSQL result automatically on destruction, acting
*   as a lightweight RAII guard so callers never need to call pg_free_result().
*
* Typical call flow:
*   $result     = matrix_db_manager::exec_search($sql, $params);
*   $db_result  = new db_result($result);
*   foreach ($db_result as $row) { ... }   // via IteratorAggregate
*   // or
*   $all = $db_result->fetch_all();
*
* Consumer classes: search, tm_record, sections, numerous tools (tool_export,
* tool_time_machine, tool_import_*, tool_propagate_component_data, …).
* A parallel sibling — locators_result — mirrors this interface for in-memory
* locator arrays so callers need not know whether data came from the DB or not.
*
* @package Dédalo
* @subpackage Core
*/

class db_result implements IteratorAggregate
{
	/**
	 * The raw PostgreSQL result handle returned by pg_query / pg_execute.
	 * @var \PgSql\Result $result
	 */
	private \PgSql\Result $result;

	/**
	 * When true, rows are yielded as associative arrays; when false (default),
	 * rows are yielded as stdClass objects.
	 * @var bool $as_array
	 */
	private bool $as_array;

	/**
	 * Lookup map of column names whose PostgreSQL TEXT values should be decoded
	 * as JSON when a row is fetched. Keys are column names, values are true.
	 * Defaults to matrix_db_manager::$json_columns, but callers such as
	 * tm_record pass tm_db_manager::$json_columns to match the Time Machine
	 * schema instead.
	 * @var array $json_columns
	 */
	private array $json_columns;

	/**
	 * __CONSTRUCT
	 * Wraps an already-executed PostgreSQL result handle and configures how rows
	 * will be decoded.
	 *
	 * The $json_columns parameter allows consumers that query non-matrix tables
	 * (e.g. Time Machine) to supply their own column map so the correct columns
	 * are JSON-decoded. When omitted, the standard matrix column set is used.
	 *
	 * @param \PgSql\Result $result      - The live PostgreSQL result resource.
	 * @param ?array        $json_columns [= null] - Map of column name → true for
	 *                                     columns that hold JSON text. Defaults to
	 *                                     matrix_db_manager::$json_columns.
	 * @param bool          $as_array    [= false] - When true, rows are returned as
	 *                                     associative arrays; otherwise as objects.
	 */
	public function __construct(\PgSql\Result $result, ?array $json_columns=null, bool $as_array = false)
	{
		$this->result 		= $result;
		$this->as_array 	= $as_array;
		$this->json_columns = $json_columns ?? matrix_db_manager::$json_columns;
	}

	/**
	 * GETITERATOR
	 * Implements IteratorAggregate so the object can be used directly in foreach.
	 * Fetches one row at a time from PostgreSQL (streaming, not buffered) and
	 * applies JSON decoding via the appropriate process_row_* helper before
	 * yielding, keeping peak memory proportional to one row rather than the full
	 * result set.
	 *
	 * Mode selection:
	 * - $this->as_array === true  → pg_fetch_assoc + process_row_array
	 * - $this->as_array === false → pg_fetch_object + process_row_object
	 *
	 * @return Traversable
	 */
	public function getIterator(): Traversable
	{
		if ($this->as_array) {
			while ($row = pg_fetch_assoc($this->result)) {
				yield $this->process_row_array($row);
			}
		} else {
			while ($row = pg_fetch_object($this->result)) {
				yield $this->process_row_object($row);
			}
		}
	}

	/**
	 * FETCH_ALL
	 * Materialises the entire result set into a plain PHP array by draining the
	 * iterator. Each element is a decoded object or associative array depending
	 * on $this->as_array.
	 *
	 * (!) After calling fetch_all() the internal cursor is exhausted. A subsequent
	 * call to fetch_all() or getIterator() will return an empty array / no rows
	 * unless seek(0) is called first to reset the cursor.
	 *
	 * @return array - Numerically-indexed array of decoded rows.
	 */
	public function fetch_all() : array
	{
		return iterator_to_array($this->getIterator());
	}

	/**
	 * FETCH_ONE
	 * Fetches and decodes the next single row from the result set, advancing the
	 * internal cursor by one position. Returns false when the cursor is past the
	 * last row (no more data).
	 *
	 * Typical usage: row_count() > 0 guard → fetch_one() to read a single
	 * expected record without materialising the whole result set.
	 *
	 * @return object|array|false - Decoded row as object or array, or false when
	 *                              the cursor is exhausted.
	 */
	public function fetch_one() : object|array|false
	{
		if ($this->as_array) {
			$row = pg_fetch_assoc($this->result);
			return $row ? $this->process_row_array($row) : false;
		}
		$row = pg_fetch_object($this->result);
		return $row ? $this->process_row_object($row) : false;
	}

	/**
	 * ROW_COUNT
	 * Returns the total number of rows in the result set regardless of the
	 * current cursor position. This is a non-destructive O(1) call backed by
	 * pg_num_rows(); it does not advance the cursor.
	 *
	 * Commonly used as a pre-flight check before fetch_one() / fetch_all() to
	 * avoid processing an empty result.
	 *
	 * @return int - Total row count in the result set.
	 */
	public function row_count() : int
	{
		return pg_num_rows($this->result);
	}

	/**
	 * AFFECTED_ROWS
	 * Returns the number of rows affected by the last INSERT, UPDATE, or DELETE
	 * statement that produced this result. For SELECT queries the return value
	 * is 0.
	 *
	 * @return int - Count of rows affected by the DML statement.
	 */
	public function affected_rows(): int
	{
		return pg_affected_rows($this->result);
	}

	/**
	 * PROCESS_ROW_ARRAY
	 * Decodes JSON-encoded column values in an associative-array row.
	 * Only columns listed in $this->json_columns are processed; plain-text and
	 * integer columns (section_id, section_tipo) pass through unchanged.
	 * NULL values are skipped deliberately — json_decode(null) would return null
	 * anyway, but the isset guard avoids the function-call overhead.
	 *
	 * @param array $row - Raw associative row from pg_fetch_assoc.
	 * @return array     - Same row with JSON columns replaced by their decoded
	 *                     PHP equivalents (arrays, since the second arg is true).
	 */
	private function process_row_array(array $row): array
	{
		foreach ( $row as $column => $value ) {
			if ( $value !== null && isset($this->json_columns[$column])  ) {
				$row[$column] = json_decode($value, true);
			}
		}
		return $row;
	}

	/**
	 * PROCESS_ROW_OBJECT
	 * Decodes JSON-encoded column values in a stdClass row object, mutating the
	 * object in place. Counterpart to process_row_array() for the default
	 * (object-mode) code path.
	 *
	 * Note: json_decode() without the second argument returns a stdClass, so
	 * complex nested JSON structures become nested objects rather than arrays.
	 * This is intentional — callers access fields as $row->data->dato, etc.
	 *
	 * @param object $row - Raw stdClass row from pg_fetch_object.
	 * @return object     - Same object with JSON columns replaced by their
	 *                      decoded PHP stdClass equivalents.
	 */
	private function process_row_object(object $row): object
	{
		foreach ( $row as $column => $value ) {
			if ( $value !== null && isset($this->json_columns[$column])  ) {
				$row->$column = json_decode($value);
			}
		}
		return $row;
	}

	/**
	 * MAP_ITERATOR
	 * Returns a lazy Generator that applies $callback to every decoded row as it
	 * is fetched, yielding (original key => transformed value) pairs. This avoids
	 * materialising the full result set when only a projection or transformation
	 * is needed.
	 *
	 * Example:
	 *   $mapped = $db_result->map_iterator(fn($row) => $row->section_id);
	 *   foreach ($mapped as $id) { ... }
	 *
	 * @param callable $callback - Function receiving ($row, $key); its return
	 *                             value becomes the yielded value.
	 * @return Generator         - Lazy generator over the transformed rows.
	 */
	public function map_iterator(callable $callback): Generator
	{
		foreach ($this->getIterator() as $key => $value) {
			yield $key => $callback($value, $key);
		}
	}

	/**
	 * SEEK
	 * Resets the internal PostgreSQL result cursor to a specific row offset so
	 * the result can be iterated more than once without executing the query again.
	 *
	 * Primary use-case (tool_export / search two-pass pattern):
	 *   1. Pass 1 — iterate rows to discover column names / collect parent IDs.
	 *   2. seek(0) — rewind to the beginning.
	 *   3. Pass 2 — stream rows for the actual output or recursive child lookup.
	 *
	 * In search::search_children_recursive(), seek(0) is called when no recursive
	 * children are found so the same db_result can be returned to the caller and
	 * re-iterated from the start.
	 *
	 * @param int $row_number - Zero-based row offset to seek to.
	 * @return bool           - True on success, false if $row_number is out of
	 *                          range or the result handle is no longer valid.
	 */
	public function seek(int $row_number): bool
	{
		return pg_result_seek($this->result, $row_number);
	}

	/**
	 * FREE
	 * Explicitly releases the memory held by the PostgreSQL result resource.
	 * Called automatically by __destruct(); callers may invoke it early when
	 * they know the result is no longer needed and want to reclaim memory sooner
	 * than GC would.
	 *
	 * @return void
	 */
	public function free(): void
	{
		pg_free_result($this->result);
	}

	/**
	 * GET_RESULT
	 * Returns the raw PostgreSQL result handle for the rare cases where a caller
	 * needs to pass it to a pg_* function that db_result does not wrap (e.g.
	 * pg_fetch_all_columns for columnar extraction).
	 *
	 * @return \PgSql\Result - The underlying result resource.
	 */
	public function get_result(): \PgSql\Result
	{
		return $this->result;
	}

	/**
	 * __DESTRUCT
	 * RAII guard: automatically frees the PostgreSQL result resource when the
	 * object goes out of scope, preventing connection-level memory leaks.
	 *
	 * The guard checks that $this->result is still a valid \PgSql\Result before
	 * calling free(), because in PHP 8.1+ the object type replaced the legacy
	 * resource type and may already be in an invalid state if the connection was
	 * closed. The error-suppression operator (@) and the caught \Error handle the
	 * edge case where free() itself throws (e.g. double-free or connection loss).
	 *
	 * @return void
	 */
	public function __destruct()
	{
		if (isset($this->result) && $this->result instanceof \PgSql\Result) {
			try {
				// Check if the result is still valid before trying to free it
				// In PHP 8.1+ PgSql\Result objects are used instead of resources
				@$this->free();
			} catch (\Error $e) {
				// Silently ignore if already closed
			}
		}
	}
}
